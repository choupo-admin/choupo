#!/usr/bin/env python3
# migrate_thermoPhysProp.py -- STRICT-T1 cohort migration to the v2 contract.
#
# Rewrites a tutorial case's constant/propertyDict as constant/thermoPhysPropDict
# (recordType thermophysicalPropertySystem; schemaVersion 2) ONLY when the v1
# dict is EXACTLY the T1 ideal gamma-phi form:
#
#     components ( ... );
#     activityModel   { model ideal; }        // the `model` entry ONLY
#     equationOfState { model idealGas; }     // optional; idealGas ONLY
#
# ANY other top-level key (inherits, phases, transport, solution, thermo,
# electrolyte, propertyMethods, recordType, activeComponents, ...) or any extra
# key inside activityModel/equationOfState makes the case INELIGIBLE -- skipped
# and reported, never guessed.  Physics must stay byte-identical (goldens
# unchanged): translateV2 maps the T1 template to the same v1 in-memory package.
#
# HARD SAFETY GATES (readers of the v1 name that do NOT resolve v2):
#   * only choupoSolve + choupoProps mains resolve constant/thermoPhysPropDict;
#     choupoBatch/choupoCtrl read constant/propertyDict ONLY -> any case whose
#     controlDict application is not choupoSolve/choupoProps is skipped
#     (tutorials/batch/** and tutorials/ctrl/** fall out of this check).
#   * choupoSolve REFUSES outerDriver + builder package ("not yet wired",
#     main.cpp:850) -> any case with system/outerDict is skipped;
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
# Usage:  bin/curate/migrate_thermoPhysProp.py            (from the repo root)
#         git rm / git add are issued per converted case; nothing is committed.

import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TUTORIALS = ROOT / "tutorials"
SKIPPED_LIST = ROOT / "bin/curate/migrate_thermoPhysProp.skipped.txt"

V2_DISPATCHING_APPS = {"choupoSolve", "choupoProps"}

HEADER = """\
/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- T1 ideal gamma-phi mixture.
  Raoult DECLARED, not defaulted (gamma = 1 identically).
  Migrated mechanically from the v1 flat form (physics identical);
  v2 contract 2026-07-17.
\\*---------------------------------------------------------------------------*/
"""

TEMPLATE_TAIL = """\
equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel ideal;
        standardState pureLiquid;
    }

    vapour
    {
        fugacityModel idealGas;
    }
}
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
#   kind = 'block'  payload = inner text      span covers key..'}'
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


def block_is_exactly(stripped, body_span, key, value):
    """True iff the block body is EXACTLY one scalar entry `key value;`."""
    try:
        inner = scan_entries(stripped, body_span[0], body_span[1])
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


def classify(dict_path):
    """Return ('ok', components_verbatim) or ('skip', reason)."""
    case = dict_path.parent.parent                  # .../<case>/constant/..
    rel = case.relative_to(ROOT).as_posix()

    # ---- structural gates (readers of the v1 name) ------------------------
    control = case / "system" / "controlDict"
    if not control.exists():
        return ('skip', "no sibling system/controlDict (nested unit dict; "
                        "the Flowsheet walk-up reads the v1 name)")
    app = read_application(control)
    if app not in V2_DISPATCHING_APPS:
        return ('skip', "application '%s' does not dispatch "
                        "thermoPhysPropDict (v1 name only)" % app)
    if (case / "system" / "outerDict").exists():
        return ('skip', "case has system/outerDict (choupoSolve refuses: "
                        "outerDriver + builder propertyPackage is not yet "
                        "wired -- the driver mutates the flat thermoDict)")
    others = [p for p in case.rglob("constant/propertyDict")
              if p != dict_path]
    if others:
        return ('skip', "case contains nested constant/propertyDict files "
                        "(inherits/walk-up chains read the v1 name)")
    if (case / "constant" / "thermoPhysPropDict").exists():
        return ('skip', "constant/thermoPhysPropDict already exists")
    if incomplete_thermo_override(case):
        return ('skip', "inline thermo{} override without activityModel "
                        "(inherits it from the flat global; the builder "
                        "path would throw 'missing entry activityModel')")

    # ---- content gate: EXACTLY the T1 flat form ---------------------------
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

    allowed = {"components", "activityModel", "equationOfState"}
    extra = [k for k in keys if k not in allowed]
    if extra:
        return ('skip', "extra top-level key(s): %s" % " ".join(sorted(extra)))
    if "components" not in by_key or "activityModel" not in by_key:
        return ('skip', "missing components/activityModel")

    kind, comp_span, _ = by_key["components"]
    if kind != 'list':
        return ('skip', "components is not a ( ... ); list")

    kind, _span, body = by_key["activityModel"]
    if kind != 'block' or not block_is_exactly(stripped, body,
                                               "model", "ideal"):
        return ('skip', "activityModel is not exactly { model ideal; }")

    if "equationOfState" in by_key:
        kind, _span, body = by_key["equationOfState"]
        if kind != 'block' or not block_is_exactly(stripped, body,
                                                   "model", "idealGas"):
            return ('skip',
                    "equationOfState is not exactly { model idealGas; }")

    components_verbatim = original[comp_span[0]:comp_span[1]]
    return ('ok', components_verbatim)


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
        content = (HEADER
                   + "\nrecordType    thermophysicalPropertySystem;\n"
                   + "schemaVersion 2;\n\n"
                   + payload + "\n\n"
                   + TEMPLATE_TAIL)
        new_path.write_text(content)
        subprocess.run(["git", "add", str(new_path)], cwd=ROOT, check=True)
        subprocess.run(["git", "rm", "-q", str(dp)], cwd=ROOT, check=True)
        converted.append(rel)

    reasons = Counter(r for _, r in skipped)
    with open(SKIPPED_LIST, "w") as f:
        f.write("# migrate_thermoPhysProp.py -- skipped cases "
                "(STRICT-T1 cohort, 2026-07-17)\n")
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
    for rel in converted:
        print("  " + rel)
    print("\nfull skipped list -> %s"
          % SKIPPED_LIST.relative_to(ROOT).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main())
