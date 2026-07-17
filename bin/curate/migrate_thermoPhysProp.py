#!/usr/bin/env python3
# migrate_thermoPhysProp.py -- STRICT cohort migration to the v2 contract.
#
# Rewrites a tutorial case's constant/propertyDict as constant/thermoPhysPropDict
# (recordType thermophysicalPropertySystem; schemaVersion 2) ONLY when the v1
# dict is EXACTLY one of the mapped cohort forms:
#
#   T1 (ideal gamma-phi):
#     components ( ... );
#     activityModel   { model ideal; }
#     equationOfState { model idealGas; }     // optional; idealGas ONLY
#
#   T2 (gamma-phi with a REAL activity model, catalogue- or file-declared):
#     components ( ... );
#     activityModel   { model <NRTL|UNIQUAC|Wilson|cosmoSAC>;
#                       [binaryPairs { <pair> "data/standards/...dat"; ... }] }
#     equationOfState { model idealGas; }     // optional; idealGas ONLY
#     -> v2 equilibrium.liquid.activityModel { model <M>; [binaryParameters
#        { <pair> { source "..."; } }] }.  INLINE pairs ( {...} ) / rq{} /
#        source <set> have NO translateV2 slot -> SKIPPED, never guessed.
#
#   T13 rider (either T1 or T2 + transport): a flat transport{} whose
#     sub-blocks are EXACTLY { model <word>; } on the 7 canonical keys is
#     carried to the v2 per-phase transport grammar (vapour/liquid/interface)
#     -- the exact inverse of the translateV2 T13 map table.
#
#   diluteSolution (T6, flat Henry):
#     components ( ... );  solvent <name>;  [solutes ( ... );]
#     activityModel   { model ideal; }
#     equationOfState { model idealGas; }     // optional; idealGas ONLY
#     -> v2 formulation diluteSolution (solvent on the Raoult rung, solutes on
#     infinite-dilution Henry).  When v1 has no explicit solutes list, the
#     solute set is derived by the ENGINE's OWN predicate (ThermoPackage::Kvec:
#     role == solute AND a (solute, solvent) Henry pair record exists) -- the
#     v2 declaration states what already ran, it never widens the physics.
#
# ANY other top-level key (inherits, phase, phases, pureFluids, propertyMethods,
# recordType, ...) or any unmapped key inside a block makes the case INELIGIBLE
# -- skipped and reported, never guessed.  Physics must stay byte-identical
# (goldens unchanged): translateV2 maps each template to the same v1 in-memory
# package.
#
# HARD SAFETY GATES (readers of the v1 name that do NOT resolve v2):
#   * only the four mains resolve constant/thermoPhysPropDict (choupoSolve +
#     choupoProps since 9b4e2e5f5; choupoBatch + choupoCtrl since bb7bde3fe)
#     -> any case whose controlDict application is not one of the four is
#     skipped.
#   * the Flowsheet per-unit walk-up (propertyContextBase) and the
#     PropertyContext `inherits` chain look for constant/propertyDict by name
#     -> a dict without a sibling system/controlDict (a nested unit dict) is
#     skipped, and a case that CONTAINS nested propertyDicts is skipped too;
#   * an inline per-unit `thermo {}` override that OMITS activityModel relies
#     on inheriting it from the global FLAT dict (legacy merge copies all
#     global keys); the builder path synthesizes components + idealGas EoS
#     only -> readFromDict throws "missing entry 'activityModel'".  Any case
#     whose flowsheetDict carries a thermo{} without activityModel is skipped.
#
# The old outerDict gate is REMOVED (2026-07-17): choupoSolve main.cpp:852 --
# "outerDriver + builder propertyPackage works with NO extra wiring" (the
# package is rebuilt from the dict on EVERY evaluation; no concrete driver
# mutates the thermo dict).  Proven empirically on evaporator04 (golden PASS).
# Fitting drivers that pin dict paths INSIDE activityModel (fitNRTL01-style
# inline pairs) are protected by the content gate, not by an outer gate.
#
# Usage:  bin/curate/migrate_thermoPhysProp.py            (from the repo root)
#         git rm / git add are issued per converted case; nothing is committed.

import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TUTORIALS = ROOT / "tutorials"
SKIPPED_LIST = ROOT / "bin/curate/migrate_thermoPhysProp.skipped.txt"
MIGRATION_NOTES = {}      # caseDir -> note printed with the converted report

V2_DISPATCHING_APPS = {"choupoSolve", "choupoProps",
                       "choupoBatch", "choupoCtrl"}

GAMMA_MODELS = {"ideal", "NRTL", "UNIQUAC", "Wilson", "cosmoSAC"}

# v1 flat transport key -> (v2 phase, v2 property) -- the exact INVERSE of the
# translateV2 T13 map table (ThermoPackageBuilder.cpp).
TRANSPORT_MAP = [
    ("viscosity",           ("vapour",    "viscosity")),
    ("thermalConductivity", ("vapour",    "thermalConductivity")),
    ("diffusivity",         ("vapour",    "diffusivity")),
    ("liquidViscosity",     ("liquid",    "viscosity")),
    ("liquidConductivity",  ("liquid",    "thermalConductivity")),
    ("liquidDiffusivity",   ("liquid",    "diffusivity")),
    ("surfaceTension",      ("interface", "surfaceTension")),
]
TRANSPORT_V1_KEYS = [k for k, _ in TRANSPORT_MAP]

HEADER_T1 = """\
/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- T1 ideal gamma-phi mixture.
  Raoult DECLARED, not defaulted (gamma = 1 identically).
  Migrated mechanically from the v1 flat form (physics identical);
  v2 contract 2026-07-17.
\\*---------------------------------------------------------------------------*/
"""

HEADER_T2 = """\
/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- T2 gamma-phi mixture with a REAL activity model.
  The builder VERIFIES the declared route against what actually runs and
  prints the resolved plan ([v2 plan] in the log); pairs without an explicit
  binaryParameters block resolve from the pair catalogue, exactly as before.
  Migrated mechanically from the v1 flat form (physics identical);
  v2 contract 2026-07-17.
\\*---------------------------------------------------------------------------*/
"""

HEADER_DILUTE = """\
/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- T6 dilute-solution (Henry) world.  Henry is a
  CONVENTION for the solutes group, not a model of the whole liquid: the
  solvent sits on the pure-liquid (Raoult) rung, each solute on the
  infinite-dilution rung.  The builder VERIFIES every declared pair file.
  Migrated mechanically from the v1 flat solvent/solutes form (physics
  identical -- the solutes list states the engine's own Henry selection);
  v2 contract 2026-07-17.
\\*---------------------------------------------------------------------------*/
"""


# ---------------------------------------------------------------------------
# Comment stripping that PRESERVES offsets (comments -> spaces, newlines kept)
# so spans found in the stripped text slice the ORIGINAL text verbatim.
# ---------------------------------------------------------------------------
def strip_comments(text):
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':                               # quoted string: skip over
            i += 1
            while i < n and text[i] != '"':
                i += 1
            i += 1
        elif c == '/' and i + 1 < n and text[i + 1] == '/':
            while i < n and text[i] != '\n':
                out[i] = ' '
                i += 1
        elif c == '/' and i + 1 < n and text[i + 1] == '*':
            while i < n and not (text[i] == '*' and i + 1 < n
                                 and text[i + 1] == '/'):
                if text[i] != '\n':
                    out[i] = ' '
                i += 1
            if i < n:                              # the closing */
                out[i] = ' '
                if i + 1 < n:
                    out[i + 1] = ' '
                i += 2
        else:
            i += 1
    return ''.join(out)


# ---------------------------------------------------------------------------
# Minimal top-level entry scanner for the Choupo dict grammar.
# Returns a list of entries: (key, kind, span, payload) where
#   kind = 'list'   payload = None            span covers key..';'
#   kind = 'block'  payload = (body_lo,body_hi)  span covers key..'}'[';']
#   kind = 'scalar' payload = value string    span covers key..';'
# Raises ValueError on anything it cannot account for (=> INELIGIBLE).
# ---------------------------------------------------------------------------
WORD_END = set(' \t\r\n(){};')


def scan_entries(stripped, lo, hi):
    entries = []
    i = lo
    while i < hi:
        while i < hi and stripped[i].isspace():
            i += 1
        if i >= hi:
            break
        key_start = i
        while i < hi and stripped[i] not in WORD_END:
            i += 1
        key = stripped[key_start:i]
        if not key:
            raise ValueError("unparseable token at offset %d" % i)
        while i < hi and stripped[i].isspace():
            i += 1
        if i >= hi:
            raise ValueError("dangling key '%s'" % key)
        c = stripped[i]
        if c == '(':
            depth = 0
            while i < hi:
                if stripped[i] == '(':
                    depth += 1
                elif stripped[i] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            if depth != 0:
                raise ValueError("unbalanced ( ) in '%s'" % key)
            i += 1
            while i < hi and stripped[i].isspace():
                i += 1
            if i >= hi or stripped[i] != ';':
                raise ValueError("list '%s' missing ';'" % key)
            i += 1
            entries.append((key, 'list', (key_start, i), None))
        elif c == '{':
            depth = 0
            body_lo = i + 1
            while i < hi:
                if stripped[i] == '{':
                    depth += 1
                elif stripped[i] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            if depth != 0:
                raise ValueError("unbalanced { } in '%s'" % key)
            body_hi = i
            i += 1
            # tolerate an optional trailing ';' after a block
            j = i
            while j < hi and stripped[j].isspace():
                j += 1
            if j < hi and stripped[j] == ';':
                i = j + 1
            entries.append((key, 'block', (key_start, i),
                            (body_lo, body_hi)))
        else:
            val_start = i
            while i < hi and stripped[i] not in '{}();':
                i += 1
            if i >= hi or stripped[i] != ';':
                raise ValueError("scalar '%s' missing ';'" % key)
            value = stripped[val_start:i].strip()
            i += 1
            entries.append((key, 'scalar', (key_start, i), value))
    return entries


def entries_of_block(stripped, body_span):
    """scan_entries over a block body; ValueError propagates to the caller."""
    return scan_entries(stripped, body_span[0], body_span[1])


def block_is_exactly(stripped, body_span, key, value):
    """True iff the block body is EXACTLY one scalar entry `key value;`."""
    try:
        inner = entries_of_block(stripped, body_span)
    except ValueError:
        return False
    if len(inner) != 1:
        return False
    k, kind, _span, payload = inner[0]
    return kind == 'scalar' and k == key and payload == value


def incomplete_thermo_override(case):
    """True iff any flowsheetDict under the case carries an inline
    `thermo { ... }` unit override WITHOUT an activityModel entry.  The
    legacy flat merge inherited the global activityModel; the builder path
    does not (thermoFor synthesizes components + idealGas EoS only)."""
    for fd in case.rglob("system/flowsheetDict"):
        stripped = strip_comments(fd.read_text(errors="replace"))
        for m in re.finditer(r'(?<![\w.])thermo\s*\{', stripped):
            i = stripped.index('{', m.start())
            depth, j = 0, i
            while j < len(stripped):
                if stripped[j] == '{':
                    depth += 1
                elif stripped[j] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            body = stripped[i + 1:j]
            if 'activityModel' not in body:
                return True
    return False


def read_application(control_dict_path):
    text = strip_comments(control_dict_path.read_text(errors="replace"))
    m = re.search(r'(?:^|\s)application\s+(\S+?)\s*;', text)
    return m.group(1) if m else None


def words_of_list(original, span):
    """The bare words of a `key ( a b c );` entry (verbatim slice re-parsed)."""
    inner = original[span[0]:span[1]]
    inner = inner[inner.index('(') + 1:inner.rindex(')')]
    return inner.split()


def component_field(case, name, field, sealed):
    """Effective scalar `field <word>;` of a component: the case-local
    overlay wins field-by-field; a SEALED case never falls back to the
    installation catalogue (mirrors the runtime record resolution)."""
    local = case / "constant" / "components" / (name + ".dat")
    paths = [local] if sealed else \
        [local, ROOT / "data" / "standards" / "components" / (name + ".dat")]
    for p in paths:
        if not p.exists():
            continue
        s = strip_comments(p.read_text(errors="replace"))
        m = re.search(r'(?<![\w.])' + field + r'\s+([A-Za-z]+)\s*;', s)
        if m:
            return m.group(1)
        if sealed or p == local:
            # local file present but field absent: overlay semantics would
            # fall through to standards -- honour that only when unsealed.
            continue
    return ""


def henry_pair_available(case, solute, solvent, sealed):
    """Mirror of HenrysLawRegistry resolution: the case-local record
    (constant/parameters/Henry/) wins; a sealed case is FORBIDDEN the
    installation catalogue."""
    rel = solute + "-" + solvent + ".dat"
    if (case / "constant" / "parameters" / "Henry" / rel).exists():
        return True
    if sealed:
        return False
    return (ROOT / "data" / "standards" / "parameters" / "Henry" / rel).exists()


# ---------------------------------------------------------------------------
# classification
# ---------------------------------------------------------------------------
def classify(dict_path):
    """Return ('ok', v2_content) or ('skip', reason)."""
    case = dict_path.parent.parent                  # .../<case>/constant/..

    # ---- structural gates (readers of the v1 name) ------------------------
    control = case / "system" / "controlDict"
    if not control.exists():
        return ('skip', "no sibling system/controlDict (nested unit dict; "
                        "the Flowsheet walk-up reads the v1 name)")
    app = read_application(control)
    if app not in V2_DISPATCHING_APPS:
        return ('skip', "application '%s' does not dispatch "
                        "thermoPhysPropDict (v1 name only)" % app)
    others = [p for p in case.rglob("constant/propertyDict")
              if p != dict_path]
    if others:
        return ('skip', "case contains nested constant/propertyDict files "
                        "(inherits/walk-up chains read the v1 name)")
    # fitParameters (any residual.kind but isotherm) REBUILDS the thermo
    # package from the FLAT thermoDict every iteration (FitParameters.cpp:247)
    # -- a builder/manifest package leaves thermoDict null, so the op refuses.
    # The isotherm kind is pair-data regression and never rebuilds (line 244).
    props = case / "system" / "propsDict"
    if props.exists():
        ps = strip_comments(props.read_text(errors="replace"))
        if re.search(r'(?<![\w.])type\s+fitParameters\s*;', ps):
            kinds = set(re.findall(r'(?<![\w.])kind\s+(\w+)\s*;', ps))
            if kinds - {"isotherm"}:
                return ('skip', "propsDict fitParameters (kind %s) needs the "
                                "flat-thermoDict per-iteration rebuild -- the "
                                "builder/manifest path leaves thermoDict null "
                                "(engine gap, FitParameters.cpp:247)"
                        % " ".join(sorted(kinds - {"isotherm"})))
    # propsDict ops carrying their OWN thermo{} override (pureFluids /
    # transport routes per op -- compare_transport_water) merge against the
    # FLAT thermoDict; the builder/manifest path does not carry that per-op
    # merge, so the case must stay v1 (proven: 46 op failures on conversion).
    if props.exists():
        ps2 = strip_comments(props.read_text(errors="replace"))
        if re.search(r'(?<![\w.])thermo\s*\{', ps2):
            return ('skip', "propsDict op carries an inline thermo{} override"
                            " (per-op merge exists on the flat path only --"
                            " no builder/manifest equivalent)")
    if (case / "constant" / "thermoPhysPropDict").exists():
        return ('skip', "constant/thermoPhysPropDict already exists")
    if incomplete_thermo_override(case):
        return ('skip', "inline thermo{} override without activityModel "
                        "(inherits it from the flat global; the builder "
                        "path would throw 'missing entry activityModel')")

    # ---- content gate: EXACTLY one of the mapped cohort forms -------------
    original = dict_path.read_text(errors="replace")
    stripped = strip_comments(original)
    try:
        entries = scan_entries(stripped, 0, len(stripped))
    except ValueError as e:
        return ('skip', "unparseable dict (%s)" % e)

    keys = [k for k, _, _, _ in entries]
    if sorted(Counter(keys).values()) != [1] * len(keys):
        return ('skip', "duplicate top-level key")
    by_key = {k: (kind, span, payload)
              for k, kind, span, payload in entries}

    allowed = {"components", "activityModel", "equationOfState",
               "transport", "solvent", "solutes", "phase"}
    extra = [k for k in keys if k not in allowed]
    if extra:
        return ('skip', "extra top-level key(s): %s" % " ".join(sorted(extra)))
    if "components" not in by_key or "activityModel" not in by_key:
        return ('skip', "missing components/activityModel")

    # -- G1 (Codex-ratified 2026-07-18): `phase { type vle; }` is REDUNDANT
    #    with `formulation gammaPhi` (gamma liquid x phi vapour IS the VLE
    #    statement) -- dropped on migration, recorded in the report.  ANY
    #    other content in the block refuses (never guess).
    if "phase" in by_key:
        kind, _span, body = by_key["phase"]
        if kind != 'block' or not block_is_exactly(stripped, body,
                                                   "type", "vle"):
            return ('skip', "phase block is not exactly { type vle; } -- "
                            "no v2 slot for a non-VLE phase declaration")
        MIGRATION_NOTES[case] = "dropped redundant `phase { type vle; }`" \
                                " (formulation gammaPhi IS the VLE statement)"

    kind, comp_span, _ = by_key["components"]
    if kind != 'list':
        return ('skip', "components is not a ( ... ); list")
    components_verbatim = original[comp_span[0]:comp_span[1]]
    component_names = words_of_list(original, comp_span)

    # -- activityModel: model + (optionally) file-declared binaryPairs ------
    kind, _span, am_body = by_key["activityModel"]
    if kind != 'block':
        return ('skip', "activityModel is not a { ... } block")
    try:
        am_entries = entries_of_block(stripped, am_body)
    except ValueError as e:
        return ('skip', "unparseable activityModel block (%s)" % e)
    am_keys = [k for k, _, _, _ in am_entries]
    model = None
    pair_decls = []                                 # [(pairName, "quoted path")]
    for k, ekind, espan, payload in am_entries:
        if k == "model" and ekind == 'scalar':
            model = payload
        elif k == "binaryPairs" and ekind == 'block':
            try:
                for pk, pkind, pspan, ppayload in \
                        entries_of_block(stripped, payload):
                    if pkind != 'scalar' or not ppayload.startswith('"'):
                        return ('skip', "binaryPairs entry '%s' is not a "
                                        "quoted path (translateV2 carries "
                                        "file-declared sources only)" % pk)
                    pair_decls.append((pk, ppayload))
            except ValueError as e:
                return ('skip', "unparseable binaryPairs block (%s)" % e)
        else:
            return ('skip', "activityModel carries '%s' -- no translateV2 "
                            "slot (accepted: model + file-declared "
                            "binaryPairs; inline pairs()/rq{}/source have "
                            "no v2 grammar)" % k)
    if model is None:
        return ('skip', "activityModel has no `model <word>;` entry")
    if model not in GAMMA_MODELS:
        return ('skip', "activityModel model '%s' is outside the gamma-phi "
                        "cohort (accepted: ideal NRTL UNIQUAC Wilson "
                        "cosmoSAC)" % model)
    for pname, ppath in pair_decls:
        rel = ppath.strip('"')
        if not (ROOT / rel).exists():
            return ('skip', "binaryPairs '%s' declares a missing file %s"
                    % (pname, rel))

    # -- equationOfState: idealGas ONLY (optional) --------------------------
    if "equationOfState" in by_key:
        kind, _span, body = by_key["equationOfState"]
        if kind != 'block' or not block_is_exactly(stripped, body,
                                                   "model", "idealGas"):
            return ('skip',
                    "equationOfState is not exactly { model idealGas; }")

    # -- transport: 7 canonical keys, each EXACTLY { model <word>; } --------
    transport = {}                                  # v1key -> model word
    if "transport" in by_key:
        kind, _span, body = by_key["transport"]
        if kind != 'block':
            return ('skip', "transport is not a { ... } block")
        try:
            tr_entries = entries_of_block(stripped, body)
        except ValueError as e:
            return ('skip', "unparseable transport block (%s)" % e)
        for k, ekind, espan, payload in tr_entries:
            if k not in TRANSPORT_V1_KEYS:
                return ('skip', "transport key '%s' is outside the "
                                "translateV2 T13 map" % k)
            if ekind != 'block':
                return ('skip', "transport '%s' is not a { ... } block" % k)
            try:
                inner = entries_of_block(stripped, payload)
            except ValueError as e:
                return ('skip', "unparseable transport '%s' (%s)" % (k, e))
            if len(inner) != 1 or inner[0][0] != "model" \
                    or inner[0][1] != 'scalar':
                return ('skip', "transport '%s' is not exactly "
                                "{ model <word>; } (translateV2 refuses "
                                "extra transport keys)" % k)
            transport[k] = inner[0][3]

    # -- diluteSolution cohort (flat Henry) ---------------------------------
    if "solvent" in by_key or "solutes" in by_key:
        if "solvent" not in by_key:
            return ('skip', "solutes ( ... ) without a solvent keyword")
        kind, _span, solvent = by_key["solvent"]
        if kind != 'scalar' or not re.fullmatch(r'[A-Za-z][\w]*', solvent):
            return ('skip', "solvent is not a single word")
        if model != "ideal":
            return ('skip', "solvent + activityModel '%s': the diluteSolution"
                            " formulation carries the ideal (Raoult) solvent"
                            " rung only" % model)
        if pair_decls:
            return ('skip', "solvent + binaryPairs: no v2 slot")
        if transport:
            return ('skip', "solvent + transport: the translateV2 "
                            "diluteSolution branch has no transport slot")
        if solvent not in component_names:
            return ('skip', "solvent '%s' is not in components" % solvent)
        sealed = (case / "constant" / "propertyManifest").exists() and \
            re.search(r'sealed\s+true\s*;',
                      (case / "constant" / "propertyManifest")
                      .read_text(errors="replace")) is not None
        if "solutes" in by_key:
            kind, s_span, _ = by_key["solutes"]
            if kind != 'list':
                return ('skip', "solutes is not a ( ... ); list")
            solutes = words_of_list(original, s_span)
        else:
            # Derive by the ENGINE's own Henry predicate (ThermoPackage::Kvec):
            # role == solute AND a (solute, solvent) pair record resolves.
            solutes = [c for c in component_names
                       if c != solvent
                       and component_field(case, c, "role", sealed) == "solute"
                       and henry_pair_available(case, c, solvent, sealed)]
        if not solutes:
            return ('skip', "solvent declared but no Henry-active solute "
                            "(role solute + existing pair) -- nothing for "
                            "the diluteSolution formulation to declare")
        for su in solutes:
            rel = "parameters/Henry/" + su + "-" + solvent + ".dat"
            if not (ROOT / "data" / "standards" / rel).exists():
                return ('skip', "Henry pair %s missing from the installation"
                                " catalogue (cannot write the declared"
                                " source path)" % rel)
        return ('ok', emit_dilute(components_verbatim, solvent, solutes))

    # -- gamma-phi cohorts (T1 / T2 [+ T13 transport]) ----------------------
    return ('ok', emit_gamma_phi(components_verbatim, model, pair_decls,
                                 transport))


# ---------------------------------------------------------------------------
# v2 emission
# ---------------------------------------------------------------------------
def emit_transport(transport):
    if not transport:
        return ""
    by_phase = {}
    for v1key, (phase, prop) in TRANSPORT_MAP:
        if v1key in transport:
            by_phase.setdefault(phase, []).append((prop, transport[v1key]))
    out = "\ntransport\n{\n"
    blocks = []
    for phase in ("vapour", "liquid", "interface"):
        if phase not in by_phase:
            continue
        b = "    %s\n    {\n" % phase
        w = max(len(p) for p, _ in by_phase[phase])
        for prop, mdl in by_phase[phase]:
            b += "        %-*s { model %s; }\n" % (w, prop, mdl)
        b += "    }\n"
        blocks.append(b)
    out += "\n".join(blocks) + "}\n"
    return out


def emit_gamma_phi(components_verbatim, model, pair_decls, transport):
    if model == "ideal":
        header = HEADER_T1
        liquid = ("    liquid\n"
                  "    {\n"
                  "        activityModel ideal;\n"
                  "        standardState pureLiquid;\n"
                  "    }\n")
    else:
        header = HEADER_T2
        am = "        activityModel\n        {\n"
        am += "            model %s;\n" % model
        if pair_decls:
            am += "            binaryParameters\n            {\n"
            for pname, ppath in pair_decls:
                am += "                %s { source %s; }\n" % (pname, ppath)
            am += "            }\n"
        am += "        }\n"
        liquid = ("    liquid\n"
                  "    {\n"
                  + am +
                  "        standardState pureLiquid;\n"
                  "    }\n")
    return (header
            + "\nrecordType    thermophysicalPropertySystem;\n"
            + "schemaVersion 2;\n\n"
            + components_verbatim + "\n\n"
            + "equilibrium\n{\n"
            + "    formulation gammaPhi;\n\n"
            + liquid + "\n"
            + "    vapour\n    {\n        fugacityModel idealGas;\n    }\n"
            + "}\n"
            + emit_transport(transport))


def emit_dilute(components_verbatim, solvent, solutes):
    bp = ""
    for su in solutes:
        bp += ('                %s-%s { source "data/standards/parameters/'
               'Henry/%s-%s.dat"; }\n' % (su, solvent, su, solvent))
    return (HEADER_DILUTE
            + "\nrecordType    thermophysicalPropertySystem;\n"
            + "schemaVersion 2;\n\n"
            + components_verbatim + "\n\n"
            + "equilibrium\n{\n"
            + "    formulation diluteSolution;\n\n"
            + "    liquid\n    {\n"
            + "        solvent\n        {\n"
            + "            component     %s;\n" % solvent
            + "            standardState pureLiquid;          "
              "// the Raoult rung\n"
            + "        }\n"
            + "        solutes\n        {\n"
            + "            components    ( %s );\n" % " ".join(solutes)
            + "            standardState infiniteDilution;    "
              "// the Henry rung\n"
            + "            solutionModel henryDilute;\n"
            + "            binaryParameters\n            {\n"
            + bp
            + "            }\n"
            + "        }\n"
            + "    }\n\n"
            + "    vapour\n    {\n        fugacityModel idealGas;\n    }\n"
            + "}\n")


def main():
    dicts = sorted(TUTORIALS.rglob("constant/propertyDict"))
    converted, skipped = [], []          # skipped: (rel_path, reason)
    for dp in dicts:
        rel = dp.relative_to(ROOT).as_posix()
        verdict, payload = classify(dp)
        if verdict == 'skip':
            skipped.append((rel, payload))
            continue
        new_path = dp.parent / "thermoPhysPropDict"
        new_path.write_text(payload)
        subprocess.run(["git", "add", str(new_path)], cwd=ROOT, check=True)
        subprocess.run(["git", "rm", "-q", str(dp)], cwd=ROOT, check=True)
        converted.append(rel)

    reasons = Counter(r for _, r in skipped)
    with open(SKIPPED_LIST, "w") as f:
        f.write("# migrate_thermoPhysProp.py -- skipped cases "
                "(STRICT T1+T2+diluteSolution cohorts, 2026-07-17)\n")
        f.write("# converted %d, skipped %d\n" % (len(converted),
                                                  len(skipped)))
        for rel, reason in skipped:
            f.write("%s\t%s\n" % (rel, reason))

    print("migrate_thermoPhysProp: converted %d, skipped %d "
          "(of %d propertyDicts)" % (len(converted), len(skipped),
                                     len(dicts)))
    print("\nskip reasons:")
    for reason, n in reasons.most_common():
        print("  %4d  %s" % (n, reason))
    print("\nconverted:")
    notes_by_rel = {c.relative_to(ROOT).as_posix(): n
                    for c, n in MIGRATION_NOTES.items()}
    for rel in converted:
        case_rel = rel.rsplit("/constant/", 1)[0]
        note = notes_by_rel.get(case_rel)
        print("  " + rel + ("   [" + note + "]" if note else ""))
    print("\nfull skipped list -> %s"
          % SKIPPED_LIST.relative_to(ROOT).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
