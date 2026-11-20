#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""chemkin_to_choupo -- read a CHEMKIN-II mechanism, write a case's constant/.

    bin/curate/chemkin_to_choupo.py mech.inp [--thermo therm.dat] --case CASEDIR \\
            --licence "<who grants what, and where>"
    bin/curate/chemkin_to_choupo.py --selftest

A CURATION TOOL beside the stack (nothing in the runtime reads it).  It reads a
mechanism YOU hold the right to use and writes, into CASEDIR/constant/:

  components/<name>.dat   one record per species, NASA-7 (model NASA7)
  reactions               ONLY what the engine runs today
  mechanismImport.txt     every reaction NOT written, BY its equation, with the
                          reason, and the counts by kind.  Nothing is dropped
                          silently.

THE LICENCE.  `--licence` is required and is written into every provenance
block.  The GRI-Mech family is REFUSED by name (file name or header text): it
grants no redistribution (DEV.md 4c C164, bin/curate/check_source_licence.py
NO_GRANT_MECHANISM).  Output under data/standards is REFUSED: new data is a
curation act (CLAUDE.md 7), this tool fills a case, never the frozen tree.

WHAT IS PARSED.  ELEMENTS/ELEM, SPECIES/SPEC, THERMO and THERMO ALL (with its
default-range line; a blank Tcommon on a record takes that default's), the
fixed-column NASA-7 four-line records, REACTIONS with its unit words (CAL/MOLE
default, KCAL/MOLE, JOULES/MOLE, KJOULES/MOLE, KELVINS, EVOLTS; MOLES default,
MOLECULES), `=` `<=>` `=>`, `+M`, `(+M)`, and the auxiliary lines: third-body
efficiencies, LOW, TROE, SRI, PLOG, REV, DUPLICATE/DUP, FORD, RORD.  Comments
are `!`.

WHAT IS WRITTEN AS A REACTION.  The engine's own CHEMKIN-native kinetics grammar
(src/unitOperations/batch/BatchReactor.cpp:226-312): `kinetics { type; A; b; Ea;
units { A "cm3/mol/s"; Ea "<unit>"; } }`.  A and Ea are written AS PRINTED; the
engine converts A (cm-mol-s -> kmol-m3-s, ckA_) and Ea (ckEa_) itself, so this
tool does no A conversion.  Mapping: plain -> modifiedArrhenius (b may be 0, as
tutorials/batch/combustion/ignition01_h2o2); `+M` -> thirdBody with
`thirdBody { species eff; }`; `(+M)` with LOW (+TROE) -> falloff (main A/b/Ea =
kInf, `low {}`, `troe ( ... )`, efficiencies); `=`/`<=>` -> `reversible true`
(detailed balance from the curated thermo), `=>` -> irreversible; DUPLICATE
reactions are written as separate entries (the engine sums the rates of the
entries a unit lists, as ignition01's 14a/14b and 19a/19b).  order = reactant
coefficient (0 for products); the stoichiometry list is written in alphabetical order of the
component names, because the engine sums species rates in list order and a different
order moves the trajectory at the 1e-9 level (measured 2026-11-19 on ignition01_h2o2).
Ea units: cal/mol, kcal/mol, kJ/mol, J/mol are
passed through for the engine; KELVINS (Ea = R * value, R = 8.314462618) and
EVOLTS (Ea = F * value, F of src/core/Constants.H) are converted HERE to J/mol
because the engine's Ea reader has no such word.
EXPLICIT REVERSE (REV a b Ea), written the way Cantera's ck2yaml reads it: the
reaction becomes TWO IRREVERSIBLE reactions, `<name>_f` (the main A b Ea, products
as written) and `<name>_r` (products -> reactants, the REV A b Ea, the same units
block, `order` = the reverse side's coefficients; on a `+M` reaction the reverse
carries the same `thirdBody` efficiencies).  A REV with A = 0 writes the forward
leg alone, irreversible (ck2yaml does the same).  The engine's own explicit reverse
(`A_rev`/`Ea_rev`) needs `type Arrhenius` in SI and no b, so it cannot carry a
published REV line; two reactions through the CHEMKIN grammar can, with no engine
change.  REV on a `(+M)` fall-off stays REFUSED by name: ck2yaml (Cantera 3.2) writes
the reverse of a fall-off as a plain elementary rate and silently drops the pressure
dependence, and the pressure dependence of an explicit reverse is not defined the same
way in every CHEMKIN reader, so no reading is chosen for the student.
`--rev-from-thermo` stays as the declared variant (REV ignored, reverse from K_c).
PLOG (CHEMKIN-II): each `PLOG / P A b Ea /` line -> `plog ( { P <P> atm; A; b; Ea; } ... )`
as printed (P in atm), the reaction line's own A b Ea (nominal) is dropped, lines at one
pressure are written in file order and SUMMED by the engine; `=` -> reversible (detailed
balance).  PLOG reads the pressure: the batch vessel offers it only for an ideal gas (`energy gasConstantV` or `gasConstantP`);
cstr / pfr offer the feed / bed pressure.
REFUSED BY NAME (listed in mechanismImport.txt): SRI, PLOG with REV or with (+M)/+M/LOW/TROE, FORD/RORD, REV on a
`(+M)` fall-off, `(+M)` without LOW, `(+species)` colliders, MOLECULES
(ckA_ has no Avogadro factor), species on both sides of a reversible reaction,
non-integer molecularity, charged species.
WHO READS THESE TYPES.  modifiedArrhenius / thirdBody / falloff are read by
batchReactor ONLY (BatchReactor.cpp; ReactionRate.H:56-66 says cstr, pfr and
dynamicCSTR read Arrhenius and the factory laws): written reactions are
"runnable in batchReactor" and nowhere else.  A mechanism of b == 0 reactions
only would also fit `type Arrhenius` elsewhere, but this tool writes the one
grammar the CHEMKIN units block needs.
`--reactions-only` writes constant/reactions and mechanismImport.txt without
thermo or component records (the case keeps its own thermo).

WHAT A SPECIES RECORD CARRIES.  MW from the composition with the engine's own
table (src/thermo/AtomicWeights.cpp, read at run time -- one home); formula;
dHf_298 = H(298.15) and s_298 = S(298.15) DERIVED from the NASA-7 coefficients
(CHEMKIN's elements reference makes H(298.15) the formation enthalpy, the same
reading graphite.dat's header uses), on the interval that contains 298.15 K;
`idealGasHeatCapacity` (gas) or `solidHeatCapacity` (solid) with `model NASA7`
and Tlow/Tcommon/Thigh (NASA7Cp.cpp reads all three, refuses without).  Not
written, because nothing in a mechanism supplies them: Tc, Pc, omega,
vapour pressure, CAS; every species is written `role nonvolatile;` (the
convention of data/standards/thermoTables/), because a gamma-phi package
otherwise asks each component for a vapour pressure (Component.cpp, found by
the first engine load of an import, 2026-11-19).  A liquid ('L') record is refused by name.  Species names
are sanitised for the dictionary grammar ('(' -> '_', ')' dropped, '-' and ','
-> '_', '*' -> 'star'); a collision is refused and the original name stays in
the record's comment.  Charged species (a '+' in the name) are not supported
in this slice (the equation splitter reads '+' as a separator): reactions
naming one are listed as refused.
"""
import argparse
import contextlib
import io
import math
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
R_GAS = 8.314462618          # src/core/Constants.H
N_A = 6.02214076e23
T0 = 298.15
EXTRAP_K = 5.0     # K below Tlow at which 298.15 K is still read from the low polynomial
CAL = 4.184
EV_J_MOL = 96485.33212       # 1 eV per particle in J/mol

EA_UNITS = {"CAL/MOLE": CAL, "KCAL/MOLE": 1000 * CAL, "JOULES/MOLE": 1.0,
            "KJOULES/MOLE": 1000.0, "KELVINS": R_GAS, "EVOLTS": EV_J_MOL}
SECTION_WORDS = {"ELEMENTS": "ELEM", "ELEM": "ELEM", "SPECIES": "SPEC", "SPEC": "SPEC",
                 "THERMO": "THERMO", "REACTIONS": "REAC", "REAC": "REAC", "END": "END"}
GRI = re.compile(r'\bGRI[-\s]?Mech\w*|\bgrimech\w*|\bgri30\w*|\bGRI\b', re.I)


class Refusal(Exception):
    pass


# ---------------------------------------------------------------- atomic weights
def atomic_weights():
    """The engine's own table, read from its source (one home)."""
    txt = open(os.path.join(ROOT, "src/thermo/AtomicWeights.cpp"), encoding="utf-8").read()
    return {s: float(v) for s, v in re.findall(r'\{\s*"([A-Z][a-z]?)"\s*,\s*([0-9.eE+-]+)\s*\}', txt)}


# ---------------------------------------------------------------------- parsing
def split_sections(text):
    """-> {section: [header_words, [raw lines, comments cut]]}.  THERMO record
    lines are kept in full (fixed columns); a section ends at its own END."""
    out, cur = {}, None
    for raw in text.splitlines():
        line = raw.split("!", 1)[0].rstrip()
        if not line.strip():
            continue
        first = line.split()[0].upper()
        if cur == "THERMO" and len(line) >= 80 and line[79] in "1234":
            out[cur][1].append(line)
            continue
        key = SECTION_WORDS.get(first)
        if key == "END":
            cur = None
            continue
        if key and not (cur == "REAC" and "=" in line):
            cur = key
            words = line.split()[1:]
            if key in ("ELEM", "SPEC"):          # the names may follow the keyword on its line
                closed = bool(words) and words[-1].upper() == "END"
                out.setdefault(cur, [[], []])[1].append(" ".join(words[:-1] if closed else words))
                if closed:
                    cur = None
            else:
                out.setdefault(cur, [words, []])
            continue
        if cur:
            out[cur][1].append(line)
    return out


def parse_thermo(lines, header_words=()):
    """NASA-7 records.  `lines` may start with the THERMO ALL default-range line."""
    default = None
    if any(w.upper() == "ALL" for w in header_words):
        for i, ln in enumerate(lines):
            nums = ln.split()
            if len(nums) == 3 and all(re.fullmatch(r'[-+0-9.eE]+', n) for n in nums):
                default = tuple(float(n) for n in nums)
                lines = lines[:i] + lines[i + 1:]
                break
    recs, i = {}, 0
    while i < len(lines):
        l1 = lines[i].ljust(80)
        if l1[79] != "1":
            i += 1
            continue
        if i + 3 >= len(lines):
            raise Refusal("THERMO record for %s is truncated" % l1[:18].split()[0])
        l2, l3, l4 = (lines[i + 1].ljust(80), lines[i + 2].ljust(80), lines[i + 3].ljust(80))
        name = l1[0:18].split()[0]
        comp = {}
        for k in range(4):
            e, n = l1[24 + 5 * k:26 + 5 * k].strip(), l1[26 + 5 * k:29 + 5 * k].strip()
            if e and n and float(n) != 0:
                comp[e.capitalize()] = comp.get(e.capitalize(), 0) + float(n)
        ext = l1[73:78]                       # optional fifth element, cols 74-78
        if ext[:2].strip() and ext[2:].strip():
            try:
                comp[ext[:2].strip().capitalize()] = float(ext[2:])
            except ValueError:
                pass
        phase = l1[44].strip() or "G"
        try:
            tlo, thi = float(l1[45:55]), float(l1[55:65])
        except ValueError:
            raise Refusal("%s: unreadable Tlow/Thigh" % name)
        tc_s = l1[65:73].strip()
        if tc_s:
            tcom = float(tc_s)
        elif default:
            tcom = default[1]
        else:
            raise Refusal("%s: blank Tcommon and no THERMO ALL default" % name)

        def cf(l, a, b):
            return [float(l[15 * j:15 * j + 15]) for j in range(a, b)]
        c2, c3, c4 = cf(l2, 0, 5), cf(l3, 0, 5), cf(l4, 0, 4)
        recs[name] = dict(name=name, comp=comp, phase=phase, Tlow=tlo, Thigh=thi,
                          Tcommon=tcom, low=c3[2:5] + c4, high=c2 + c3[0:2])
        i += 4
    return recs


def parse_equation(eq, species):
    """-> (reactants, products, arrow, thirdbody, falloff_marker) or raise Refusal."""
    falloff = None
    m = re.search(r'\(\+\s*([^)\s]+)\s*\)', eq)
    if m:
        falloff = m.group(1)
        if falloff.upper() == "M" and falloff not in species:
            falloff = "M"        # real files print (+m) in lower case (LLNL H2, 2004)
        eq = re.sub(r'\(\+\s*[^)\s]+\s*\)', '', eq)
    for arrow in ("<=>", "=>", "="):
        if arrow in eq:
            lhs, rhs = eq.split(arrow, 1)
            break
    else:
        raise Refusal("no arrow")

    def side(s):
        terms, m_flag = {}, False
        for tok in [t.strip() for t in s.split("+") if t.strip()]:
            if tok.upper() == "M" and "M" not in species and tok not in species:
                m_flag = True
                continue
            if tok in species:
                coef, sp = 1.0, tok
            else:
                mm = re.match(r'^(\d*\.?\d+)\s*(\S+)$', tok)
                if not mm or mm.group(2) not in species:
                    raise Refusal("unknown species or unsupported name '%s'" % tok)
                coef, sp = float(mm.group(1)), mm.group(2)
            terms[sp] = terms.get(sp, 0.0) + coef
        return terms, m_flag
    (r, rm), (p, pm) = side(lhs), side(rhs)
    return r, p, ("=>" if arrow == "=>" else "<=>"), (rm or pm), falloff


def parse_reactions(lines, header_words):
    ea_unit, molecules = "CAL/MOLE", False
    for w in header_words:
        u = w.upper()
        if u in EA_UNITS:
            ea_unit = u
        elif u == "MOLECULES":
            molecules = True
    rxns, cur = [], None
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if "=" in s and "/" not in s:
            toks = s.split()
            try:
                A, b, Ea = (float(x.replace("D", "E").replace("d", "e")) for x in toks[-3:])
            except ValueError:
                raise Refusal("reaction line without A b Ea: %r" % s)
            cur = dict(eq=" ".join(toks[:-3]), A=A, b=b, Ea=Ea, tags=set(), rev=None)
            rxns.append(cur)
            continue
        if cur is None:
            continue
        up = s.upper()
        nums = lambda t: [float(x.replace("D", "E").replace("d", "e"))
                          for x in re.findall(r'[-+]?\d*\.?\d+(?:[eEdD][-+]?\d+)?', t)]
        if up in ("DUP", "DUPLICATE"):
            cur["tags"].add("DUPLICATE")
        elif up.startswith("LOW"):
            cur["tags"].add("LOW")
            cur["low"] = nums(s[3:].replace("/", " "))
        elif up.startswith("TROE"):
            cur["tags"].add("TROE")
            cur["troe"] = nums(s[4:].replace("/", " "))
        elif up.startswith("PLOG"):
            cur["tags"].add("PLOG")
            cur.setdefault("plog", []).append(nums(s[4:].replace("/", " ")))
        elif up.startswith("SRI"):
            cur["tags"].add("SRI")
        elif up.startswith(("FORD", "RORD")):
            cur["tags"].add("FORD")
        elif up.startswith("REV"):
            cur["rev"] = tuple(nums(s[3:].replace("/", " "))[:3])
        elif "/" in s:
            pat = r'(\S+?)\s*/\s*([-+0-9.eEdD]+)\s*/'
            effs = re.findall(pat, s)
            if effs and re.sub(pat, '', s).strip() == "":
                cur["tags"].add("EFF")           # third-body efficiencies
                cur.setdefault("eff", {}).update({k: float(v.replace("D", "E")) for k, v in effs})
            else:
                cur["tags"].add("AUX?")
        else:
            cur["tags"].add("AUX?")
    return rxns, ea_unit, molecules


def classify(rx, species, molecules=False):
    """-> (kind, reason); kind None = runnable.  Fills rx r, p, arrow, tb, fo."""
    try:
        r, p, arrow, tb, fo = parse_equation(rx["eq"], species)
    except Refusal as e:
        return "unparsed", str(e)
    rx.update(r=r, p=p, arrow=arrow, tb=tb, fo=fo)
    t = rx["tags"]
    if molecules:
        return "MOLECULES", "units MOLECULES: the engine's cm-mol-s reader has no Avogadro factor (BatchReactor::ckA_)"
    if "SRI" in t:
        return "SRI", "SRI falloff form is not read by the engine"
    if "PLOG" in t:
        if any(len(l) != 4 for l in rx.get("plog", [])):
            return "PLOG", "a PLOG line does not carry P A b Ea"
        if rx["rev"] is not None:
            return "PLOG", ("explicit reverse (REV) on a PLOG reaction: the pressure dependence of an explicit "
                            "reverse is not defined the same way in every CHEMKIN reader; no reading is chosen here")
        if fo is not None or tb or "LOW" in t or "TROE" in t or "EFF" in t:
            return "PLOG", "PLOG together with (+M) / +M / LOW / TROE / efficiencies: no such form is read"
    if "FORD" in t:
        return "FORD/RORD", "explicit reaction orders (FORD/RORD) are not read"
    if "AUX?" in t:
        return "unparsed", "unrecognised auxiliary line"
    if rx["rev"] is not None and fo is not None:
        return "REV", ("explicit reverse (REV) on a (+M) fall-off: ck2yaml writes the reverse as a plain "
                       "elementary rate and drops the pressure dependence; no reading is chosen here")
    if fo is not None:
        if fo != "M":
            return "falloff", "(+%s): only a (+M) collider is read (per-species efficiencies)" % fo
        if "LOW" not in t:
            return "falloff", "(+M) without LOW: no low-pressure limit to blend"
        if len(rx.get("low", [])) != 3:
            return "falloff", "LOW does not carry three numbers"
        if "TROE" in t and len(rx.get("troe", [])) not in (3, 4):
            return "falloff", "TROE does not carry three or four numbers"
    elif "LOW" in t or "TROE" in t:
        return "falloff", "LOW/TROE without (+M)"
    elif "EFF" in t and not tb:
        return "unparsed", "third-body efficiencies on a reaction without M"
    if arrow == "<=>" and (set(r) & set(p)):
        return "bothSides", "species on both sides: order != |nu|, detailed balance refuses it"
    if abs(sum(r.values()) - round(sum(r.values()))) > 1e-12:
        return "molecularity", "non-integer molecularity: the engine refuses it for a cm unit"
    if any(sp not in species for sp in rx.get("eff", {})):
        return "unparsed", "third-body efficiency names an unknown species"
    return None, ""


# ---------------------------------------------------------------------- writing
def sanitise(name):
    return (name.replace("(", "_").replace(")", "").replace("-", "_")
            .replace(",", "_").replace("*", "star"))


def nasa_H_S(a, T):
    """H [J/mol], S [J/(mol K)] from NASA-7 a1..a7 (CHEMKIN convention)."""
    H = R_GAS * T * (a[0] + a[1] * T / 2 + a[2] * T ** 2 / 3 + a[3] * T ** 3 / 4 + a[4] * T ** 4 / 5 + a[5] / T)
    S = R_GAS * (a[0] * math.log(T) + a[1] * T + a[2] * T ** 2 / 2 + a[3] * T ** 3 / 3 + a[4] * T ** 4 / 4 + a[6])
    return H, S


def formula_of(comp):
    return "".join(e + ("" if n == 1 else ("%d" % n if n == int(n) else "%g" % n))
                   for e, n in comp.items())


def fmt_list(v):
    return "( " + " ".join("%.8e" % x for x in v) + " );"


def _atoms(formula):
    """Atom counts of a formula string (`C1O1S1` and `COS` read alike)."""
    out = {}
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', formula):
        out[el] = out.get(el, 0) + (int(n) if n else 1)
    return out


def catalogue_identity(cname, comp):
    """A case-local record named like a catalogue record must say what it is
    (the engine's shadow check refuses it otherwise -- found by the first
    engine load of an import, 2026-11-19).  Same atoms: `variationOf`, the
    mechanism's own fit kept for consistency with its rates; other atoms:
    `distinctFrom`, another species under the same name."""
    cat = os.path.join(ROOT, "data", "standards", "components", cname + ".dat")
    if not os.path.isfile(cat):
        return ""
    m = re.search(r'(?m)^\s*formula\s+"?([A-Za-z0-9]+)"?\s*;', open(cat, errors="replace").read())
    same = bool(m) and _atoms(m.group(1)) == {e: int(n) for e, n in comp.items()}
    if same:
        return ('variationOf  %s;\nvariationReason "the mechanism\'s own NASA-7 fit, kept so its '
                'equilibria match the rate constants it was fitted with";\n' % cname)
    return ('distinctFrom %s;\nvariationReason "a mechanism species that shares the name of a '
            'different catalogue species (other atoms)";\n' % cname)


LN_ATM_PER_BAR = math.log(101325.0 / 1.0e5)   # ln(1.01325)


def to_bar_standard_state(rec, p_std):
    """A NASA-7 record referenced to 1 atm, re-referenced to the engine's 1 bar
    (constant::Pref, src/core/Constants.H): S(1 bar) = S(1 atm) + R ln(1.01325),
    i.e. a7 + ln(1.01325) on both ranges; H, Cp and every other coefficient are
    unchanged.  Then Kc = Kp,atm (P_atm/RT)^sum(nu), exactly what CHEMKIN-II and
    Cantera compute from the same file (found by the Cantera comparison,
    docs/reviews/2026-11-19-chemkin-real-mechanism/: +1.26 K and -0.1..-0.9 % in
    the radicals without it)."""
    if p_std == "bar":
        return rec
    if p_std != "atm":
        raise Refusal("--standard-pressure must be atm or bar, got %r" % p_std)
    out = dict(rec)
    out["low"] = list(rec["low"]); out["high"] = list(rec["high"])
    out["low"][6] += LN_ATM_PER_BAR
    out["high"][6] += LN_ATM_PER_BAR
    out["a7_printed"] = (rec["low"][6], rec["high"][6])
    return out


def species_record(rec, cname, aw, source, licence, p_std="bar"):
    rec = to_bar_standard_state(rec, p_std)
    if rec["phase"].upper() == "L":
        raise Refusal("liquid-phase NASA record is not supported")
    miss = [e for e in rec["comp"] if e not in aw]
    if miss:
        raise Refusal("element(s) %s not in the engine's atomic-weight table" % miss)
    # Almost every published NASA-7 record starts at 300 K, 1.85 K above 298.15; the low
    # polynomial is evaluated there (a 1.85 K extrapolation, what Cantera and CHEMKIN do).
    # A wider gap is still refused.
    if not (rec["Tlow"] - EXTRAP_K) <= T0 <= rec["Thigh"]:
        raise Refusal("298.15 K is outside %g-%g K, no dHf_298/s_298 derivable" % (rec["Tlow"], rec["Thigh"]))
    mw = sum(aw[e] * n for e, n in rec["comp"].items())
    H, S = nasa_H_S(rec["low"] if T0 <= rec["Tcommon"] else rec["high"], T0)
    solid = rec["phase"].upper() == "S"
    blk = "solidHeatCapacity" if solid else "idealGasHeatCapacity"
    prov = ('mechanism file %s; licence: %s' % (source, licence)).replace('"', "'")
    if "a7_printed" in rec:
        prov += ("; standard state re-referenced from 1 atm to 1 bar: a7 + ln(1.01325) on both "
                 "ranges (printed a7: %.9e low, %.9e high)" % rec["a7_printed"])
    return """/*--- Component %s: imported from a CHEMKIN mechanism by bin/curate/chemkin_to_choupo.py ---*/
//  Original mechanism name: %s.  A case-local import, not a catalogue record:
//  Tc, Pc, omega, vapour pressure and CAS are not in a mechanism and are not written.
name        %s;
formula     %s;
MW          %.4f;            // kg/kmol, from the composition with src/thermo/AtomicWeights.cpp
role        nonvolatile;     // a mechanism species: no vapour pressure is asked of it (the thermoTables convention)
%sreviewStatus interim;
reviewReason "imported mechanically from a CHEMKIN thermo record; not read back by a curator";

standardThermochemistry
{
    dHf_298   %.3f;      // J/mol  H(298.15) of the NASA-7 fit (elements reference)
    s_298     %.4f;      // J/(mol*K)  S(298.15) of the NASA-7 fit
%s}

%s
{
    model    NASA7;
    low      %s
    high     %s
    Tlow     %g;
    Tcommon  %g;
    Thigh    %g;
}

provenance
{
    standardThermochemistry { origin literature; method "H and S at 298.15 K integrated from the NASA-7 coefficients; %s"; }
    %s { origin literature; method "NASA-7 record imported unchanged; %s"; }
}
""" % (cname, rec["name"], cname, formula_of(rec["comp"]), mw, catalogue_identity(cname, rec["comp"]), H, S,
       "    referenceState pureSolid;\n" if solid else "",
       blk, fmt_list(rec["low"]), fmt_list(rec["high"]),
       rec["Tlow"], rec["Tcommon"], rec["Thigh"], prov, blk, prov)


EA_WORD = {"CAL/MOLE": ("cal/mol", 1.0), "KCAL/MOLE": ("kcal/mol", 1.0),
           "JOULES/MOLE": ("J/mol", 1.0), "KJOULES/MOLE": ("kJ/mol", 1.0),
           "KELVINS": ("J/mol", R_GAS), "EVOLTS": ("J/mol", EV_J_MOL)}


def reaction_text(name, rx, cname, unit):
    """One reaction in the engine's CHEMKIN-native grammar (BatchReactor.cpp
    kinetics {type; A; b; Ea; units{}}).  A and Ea stay as PRINTED: the engine
    converts them.  Only KELVINS (Ea = R * value) and EVOLTS (Ea = F * value,
    src/core/Constants.H F) are converted here, because the engine's Ea reader
    knows cal, kcal, kJ and J only."""
    nu = {}
    for s, n in rx["r"].items():
        nu[s] = nu.get(s, 0.0) - n
    for s, n in rx["p"].items():
        nu[s] = nu.get(s, 0.0) + n
    st = "\n".join("        { component %s; nu %g; order %g; }" % (cname[s], v, rx["r"].get(s, 0.0))
                   for s, v in sorted(nu.items(), key=lambda kv: cname[kv[0]]))
    lim = cname[next(iter(rx["r"]))] if rx["r"] else cname[next(iter(rx["p"]))]
    uw, f = EA_WORD[unit]
    ea = lambda x: "%.10g" % (x * f)
    un = 'units { A "cm3/mol/s"; Ea "%s"; }' % uw
    tbl = lambda: "thirdBody { %s }" % " ".join("%s %.10g;" % (cname[s], v) for s, v in rx.get("eff", {}).items())
    if "PLOG" in rx["tags"]:
        #  CHEMKIN-II PLOG: P in atm as printed; the reaction line's own A b Ea is the nominal
        #  rate, which the engine ignores for `type plog` and so is not written.  Lines at
        #  one pressure are written in file order; the engine sums them (as CHEMKIN does).
        k = ["type plog;", "plog", "(" ] + ["    { P %.10g atm;  A %.10g;  b %.10g;  Ea %s; }" % (P, A, b, ea(E))
                                              for P, A, b, E in rx["plog"]] + [");", un]
    elif rx["fo"] is not None:
        lo = rx["low"]
        k = ["type falloff;", "A %.10g;  b %.10g;  Ea %s;" % (rx["A"], rx["b"], ea(rx["Ea"])),
             "low  { A %.10g;  b %.10g;  Ea %s;  %s }" % (lo[0], lo[1], ea(lo[2]), un)]
        if "troe" in rx:
            k.append("troe ( %s );" % " ".join("%.10g" % x for x in rx["troe"]))
        if rx.get("eff"):
            k.append(tbl())
        k.append(un)
    elif rx["tb"]:
        k = ["type thirdBody;", "A %.10g;  b %.10g;  Ea %s;" % (rx["A"], rx["b"], ea(rx["Ea"])), tbl(), un]
    else:
        k = ["type modifiedArrhenius;", "A %.10g;  b %.10g;  Ea %s;" % (rx["A"], rx["b"], ea(rx["Ea"])), un]
    rev = "    reversible        true;\n" if rx["arrow"] == "<=>" and rx["rev"] is None else ""
    return ("// %s\n%s\n{\n%s    limitingReactant  %s;\n    stoichiometry\n    (\n%s\n    );\n"
            "    kinetics\n    {\n%s\n    }\n}\n\n") % (
        rx["eq"], name, rev, lim, st, "\n".join("        " + x for x in k))


def reaction_texts(idx, rx, cname, unit):
    """The text of one mechanism reaction: one entry, or TWO irreversible ones for a REV line
    (`rNNN_f`, `rNNN_r`; ck2yaml's reading).  A REV with A = 0 is the forward leg alone."""
    name = "r%03d" % idx
    if rx["rev"] is None:
        return [reaction_text(name, rx, cname, unit)]
    fwd = dict(rx, arrow="=>", rev=None)
    if rx["rev"][0] == 0.0:
        return [reaction_text(name, fwd, cname, unit)]
    A, b, Ea = rx["rev"]
    rv = dict(rx, r=rx["p"], p=rx["r"], A=A, b=b, Ea=Ea, arrow="=>", rev=None,
              eq=_rev_eq(rx["p"], rx["r"], rx["tb"]))
    return [reaction_text(name + "_f", fwd, cname, unit), reaction_text(name + "_r", rv, cname, unit)]


def _rev_eq(lhs, rhs, tb):
    side = lambda d: " + ".join(("%g %s" % (n, s)) if n != 1 else s for s, n in d.items()) + (" + M" if tb else "")
    return "%s => %s   (REV leg)" % (side(lhs), side(rhs))


def refuse_output(case):
    p = os.path.realpath(case)
    std = os.path.realpath(os.path.join(ROOT, "data", "standards"))
    if p == std or p.startswith(std + os.sep):
        raise Refusal("output path is under data/standards: new data is a curation act, "
                      "this tool writes a case's constant/ only")


def convert(mech_path, thermo_path, case, licence, reactions_only=False, rev_from_thermo=False,
            p_std="atm"):
    if not licence or not licence.strip():
        raise Refusal("--licence is required: the provenance of every record names it")
    refuse_output(case)
    mtxt = open(mech_path, encoding="utf-8", errors="replace").read()
    ttxt = open(thermo_path, encoding="utf-8", errors="replace").read() if thermo_path else None
    for label, t in ((os.path.basename(mech_path), mtxt[:4000]),
                     (os.path.basename(thermo_path or ""), (ttxt or "")[:4000])):
        if GRI.search(label) or GRI.search(t):
            raise Refusal("the GRI-Mech family grants no redistribution and is refused by name "
                          "(DEV.md 4c C164, check_source_licence NO_GRANT_MECHANISM)")
    sec = split_sections(mtxt)
    species = [w for ln in sec.get("SPEC", [[], []])[1] for w in ln.split()]
    tsec = split_sections(ttxt) if ttxt else sec
    if "THERMO" not in tsec and not reactions_only:
        raise Refusal("no THERMO section (give --thermo)")
    thermo = {}
    if "THERMO" in tsec and not reactions_only:
        thermo = parse_thermo(tsec["THERMO"][1], tsec["THERMO"][0])
    aw = atomic_weights()
    cname, seen = {}, {}
    for s in species:
        c = sanitise(s)
        if c in seen:
            raise Refusal("species names '%s' and '%s' collide as '%s'" % (seen[c], s, c))
        seen[c] = s
        cname[s] = c
    source = os.path.basename(mech_path) + (" + " + os.path.basename(thermo_path) if thermo_path else "")
    cdir = os.path.join(case, "constant")
    if not reactions_only:
        os.makedirs(os.path.join(cdir, "components"), exist_ok=True)
    else:
        os.makedirs(cdir, exist_ok=True)
    written_sp, refused_sp = [], []
    for s in species:
        if reactions_only:
            written_sp.append(s)
            continue
        if s not in thermo:
            refused_sp.append((s, "no THERMO record"))
            continue
        try:
            txt = species_record(thermo[s], cname[s], aw, source, licence, p_std)
        except Refusal as e:
            refused_sp.append((s, str(e)))
            continue
        with open(os.path.join(cdir, "components", cname[s] + ".dat"), "w", encoding="utf-8") as f:
            f.write(txt)
        written_sp.append(s)
    reac = sec.get("REAC", [[], []])
    rx, unit, mol = parse_reactions(reac[1], reac[0])
    ok, refused, counts = [], [], {}
    bad_sp = {s for s, _ in refused_sp}
    nrev = 0
    for r in rx:
        if rev_from_thermo and r["rev"] is not None:
            # OPT-IN, NOT the published mechanism: the engine cannot read an explicit reverse
            # with a b or a units block, so the reverse is taken from the thermochemistry
            # (K_c from the NASA-7 records), which is what the paper's own reverse fits encode.
            r["rev"], nrev = None, nrev + 1
        kind, why = classify(r, set(species), mol)
        used = (set(r.get("r", {})) | set(r.get("p", {}))) & bad_sp
        if kind is None and used:
            kind, why = "speciesRefused", "uses a species with no usable record: " + ", ".join(sorted(used))
        if kind:
            refused.append((r["eq"], kind, why))
            counts[kind] = counts.get(kind, 0) + 1
        else:
            ok.append(r)
    head = ("/*--- constant/reactions: imported by bin/curate/chemkin_to_choupo.py ---*/\n"
            "// Mechanism: %s.  Licence: %s\n"
            "// CHEMKIN-native: A and Ea are written AS PRINTED (A cm3-mol-s, Ea %s) with a units{} block;\n"
            "// the engine converts and announces (BatchReactor ckA_/ckEa_).  Runnable in batchReactor.\n"
            "// Reactions not written: see mechanismImport.txt.\n"
            % (source, licence.replace("\n", " "), EA_WORD[unit][0]))
    with open(os.path.join(cdir, "reactions"), "w", encoding="utf-8") as f:
        f.write(head + "".join(t for i, r in enumerate(ok) for t in reaction_texts(i + 1, r, cname, unit)))
    lines = ["CHEMKIN import: %s" % source, "licence: %s" % licence,
             "species: %d, written %d, not written %d" % (len(species), len(written_sp), len(refused_sp)),
             "reactions: %d, written %d, not written %d" % (len(rx), len(ok), len(refused))]
    if nrev:
        lines += ["--rev-from-thermo: %d explicit REV lines IGNORED (reverse from equilibrium); this is a variant, not the published mechanism" % nrev]
    lines += [("NASA-7 standard state: the file's records were read as referenced to 1 atm (the CHEMKIN-II convention) and "
               "re-referenced to the engine's 1 bar (a7 + ln 1.01325), so K_c equals CHEMKIN's and Cantera's")
              if p_std == "atm" else
              "NASA-7 standard state: the file's records were declared referenced to 1 bar (--standard-pressure bar); written as printed"]
    nrv = sum(1 for r in ok if r["rev"] is not None and r["rev"][0] != 0.0)
    if nrv:
        lines += ["REV: %d reactions with an explicit reverse are written as TWO irreversible reactions each "
                  "(`rNNN_f`, `rNNN_r`; the REV A b Ea on the products -> reactants leg), as Cantera's ck2yaml reads them; "
                  "REV on a (+M) fall-off is refused" % nrv]
    lines += ["written reactions run in batchReactor and in the multi-reaction paths of cstr and pfr (ElementaryRate,",
              "  Theory Guide sec:elementary-rate); dynamicCSTR accepts the words but has no witness"]
    lines += ["  not written, by kind: %s = %d" % kv for kv in sorted(counts.items())]
    lines += ["SPECIES NOT WRITTEN:"] + ["  %s: %s" % x for x in refused_sp]
    lines += ["REACTIONS NOT WRITTEN:"] + ["  %s   [%s] %s" % x for x in refused]
    rep = "\n".join(lines) + "\n"
    with open(os.path.join(cdir, "mechanismImport.txt"), "w", encoding="utf-8") as f:
        f.write(rep)
    sys.stdout.write(rep)
    return dict(ok=ok, refused=refused, counts=counts, species=written_sp, refused_sp=refused_sp)


# ---------------------------------------------------------------- round trip
def _block(txt, i):
    """txt[i] == '{' -> index just past the matching '}'."""
    d = 0
    for j in range(i, len(txt)):
        d += (txt[j] == "{") - (txt[j] == "}")
        if d == 0:
            return j + 1
    raise Refusal("unbalanced braces")


def read_choupo_reactions(path):
    """Read a case's constant/reactions in the CHEMKIN-native grammar into plain
    data (the tool's own reader, for the exporter and the equivalence check)."""
    txt = re.sub(r'/\*.*?\*/', '', open(path, encoding="utf-8").read(), flags=re.S)
    txt = re.sub(r'//[^\n]*', '', txt)
    out = []
    for m in re.finditer(r'^(\w+)\s*\{', txt, re.M):
        if m.group(1) == "provenance":
            continue
        body = txt[m.end() - 1:_block(txt, m.end() - 1)]
        num = lambda k, t: float(re.search(r'\b%s\s+([-+0-9.eE]+)\s*;' % k, t).group(1))
        st = {c: (float(n), float(o)) for c, n, o in re.findall(
            r'component\s+(\w+)\s*;\s*nu\s+([-+0-9.eE]+)\s*;\s*order\s+([-+0-9.eE]+)\s*;', body)}
        ki = body.index("kinetics")
        kin = body[ki:_block(body, body.index("{", ki))]
        r = dict(name=m.group(1), reversible=bool(re.search(r'reversible\s+true', body)), st=st,
                 limiting=re.search(r'limitingReactant\s+(\w+)', body).group(1))
        r["type"] = re.search(r'type\s+(\w+)\s*;', kin).group(1)
        low = None
        r["low_units"] = ()
        lm = re.search(r'\blow\s*\{', kin)
        if lm:
            lb = kin[lm.end() - 1:_block(kin, lm.end() - 1)]
            low = (num("A", lb), num("b", lb), num("Ea", lb))
            kin = kin.replace(lb, "")
            r["low_units"] = tuple(re.findall(r'(?:A|Ea)\s+"([^"]*)"', lb))
        r["low"] = low
        r["A"] = num("A", kin)
        r["b"] = num("b", kin) if re.search(r'\bb\s', kin) else 0.0
        r["Ea"] = num("Ea", kin)
        r["units"] = tuple(re.findall(r'(?:A|Ea)\s+"([^"]*)"', kin))
        tm = re.search(r'troe\s*\(([^)]*)\)', kin)
        r["troe"] = [float(x) for x in tm.group(1).split()] if tm else None
        em = re.search(r'thirdBody\s*\{([^}]*)\}', kin)
        r["eff"] = ({k: float(v) for k, v in re.findall(r'(\w+)\s+([-+0-9.eE]+)\s*;', em.group(1))}
                    if em else None)
        out.append(r)
    return out


def export_chemkin(rxns):
    """Choupo reactions -> CHEMKIN REACTIONS text (KCAL/MOLE; cm3-mol-s), for the round trip."""
    sp = []
    for r in rxns:
        for c in r["st"]:
            if c not in sp:
                sp.append(c)
        if r["units"][1:2] != ("kcal/mol",) or (r["low"] and r["low_units"][1:2] != ("kcal/mol",)):
            raise Refusal("the exporter reads Ea in kcal/mol only")
    fulls = []
    for r in rxns:
        lhs = [("%g " % -n if -n != 1 else "") + c for c, (n, o) in r["st"].items() if n < 0]
        rhs = [("%g " % n if n != 1 else "") + c for c, (n, o) in r["st"].items() if n > 0]
        if r["type"] == "thirdBody":
            lhs.append("M")
            rhs.append("M")
        lt, rt = " + ".join(lhs), " + ".join(rhs)
        if r["type"] == "falloff":
            lt, rt = lt + "(+M)", rt + "(+M)"
        fulls.append("%s %s %s" % (lt, "<=>" if r["reversible"] else "=>", rt))
    L = ["ELEMENTS H O N END", "SPECIES " + " ".join(sp) + " END", "REACTIONS KCAL/MOLE"]
    for r, full in zip(rxns, fulls):
        L.append("%-44s %.10g %.10g %.10g" % (full, r["A"], r["b"], r["Ea"]))
        if r["low"]:
            L.append("   LOW / %.10g %.10g %.10g /" % r["low"])
        if r["troe"]:
            L.append("   TROE / %s /" % " ".join("%.10g" % x for x in r["troe"]))
        if r["eff"]:
            L.append("   " + " ".join("%s/%.10g/" % kv for kv in r["eff"].items()))
        if fulls.count(full) > 1:
            L.append("   DUP")
    return "\n".join(L + ["END", ""])


def equivalent(a, b):
    """-> list of differences between two read reaction lists (order-matched)."""
    if len(a) != len(b):
        return ["reaction count %d vs %d" % (len(a), len(b))]
    d = []
    close = lambda x, y: abs(x - y) <= 1e-9 * max(abs(x), abs(y), 1e-300)
    for k, (x, y) in enumerate(zip(a, b)):
        tag = "#%d %s" % (k + 1, x["name"])
        for key in ("reversible", "type", "units", "low_units"):
            if x.get(key) != y.get(key):
                d.append("%s: %s %r vs %r" % (tag, key, x.get(key), y.get(key)))
        if x["st"].keys() != y["st"].keys() or any(
                not (close(x["st"][c][0], y["st"][c][0]) and close(x["st"][c][1], y["st"][c][1])) for c in x["st"]):
            d.append("%s: stoichiometry (nu, order) differs" % tag)
        for key in ("A", "b", "Ea"):
            if not (close(x[key], y[key]) or x[key] == y[key]):
                d.append("%s: %s %g vs %g" % (tag, key, x[key], y[key]))
        if (x["low"] is None) != (y["low"] is None) or (x["low"] and not all(
                close(u, v) or u == v for u, v in zip(x["low"], y["low"]))):
            d.append("%s: low differs" % tag)
        if (x["troe"] is None) != (y["troe"] is None) or (x["troe"] and (
                len(x["troe"]) != len(y["troe"]) or not all(close(u, v) for u, v in zip(x["troe"], y["troe"])))):
            d.append("%s: troe differs" % tag)
        if (x["eff"] or {}) != (y["eff"] or {}):
            d.append("%s: efficiencies %r vs %r" % (tag, x["eff"], y["eff"]))
    return d


def roundtrip_witness(check, tmp):
    """ignition01_h2o2: export to CHEMKIN, import, prove equivalent, run both."""
    import filecmp
    import shutil
    import subprocess
    src = os.path.join(ROOT, "tutorials", "batch", "combustion", "ignition01_h2o2")
    orig = read_choupo_reactions(os.path.join(src, "constant", "reactions"))
    mech = os.path.join(tmp, "ignition01_export.inp")
    with open(mech, "w") as f:
        f.write(export_chemkin(orig))
    case = os.path.join(tmp, "ignition01_imported")
    shutil.copytree(src, case)
    with contextlib.redirect_stdout(io.StringIO()):
        res = convert(mech, None, case, "round trip of the tracked O Conaire 2004 case", reactions_only=True)
    check(not res["refused"], "round trip: all %d exported reactions import, none refused" % len(orig))
    back = read_choupo_reactions(os.path.join(case, "constant", "reactions"))
    diffs = equivalent(orig, back)
    check(len(back) == len(orig) and not diffs,
          "round trip: %d reactions equivalent (nu, order, type, A, b, Ea, units, efficiencies, troe, low)%s" % (len(back), "" if not diffs else ": " + "; ".join(diffs[:3])))
    fs = os.path.join(case, "system", "flowsheetDict")
    t = open(fs).read()
    t = re.sub(r'reactions\s*\([^)]*\)', lambda m: "reactions ( %s )" % " ".join(r["name"] for r in back), t, count=1)
    open(fs, "w").write(t)
    exe = os.path.join(ROOT, "choupoBatch")
    if not os.path.exists(exe):
        print("SKIP  engine run of the round trip: %s is not built" % exe)
        return
    ref = os.path.join(tmp, "ignition01_original")
    shutil.copytree(src, ref)
    outs = {}
    for label, c in (("original", ref), ("imported", case)):
        r = subprocess.run([exe, c], capture_output=True, text=True, cwd=ROOT)
        outs[label] = (r.returncode, r.stdout.replace(c, "CASE"))
    for o, n in zip(orig, back):                      # the only other difference: the reaction names
        outs["original"] = (outs["original"][0], outs["original"][1].replace("'%s'" % o["name"], "'%s'" % n["name"]))
    check(all(v[0] == 0 for v in outs.values()), "engine run: original and imported cases exit 0")
    names = sorted(os.path.relpath(os.path.join(root, fn), ref) for root, _, fl in os.walk(ref) for fn in fl
                   if os.path.relpath(os.path.join(root, fn), ref).split(os.sep)[0] not in ("constant", "system")
                   and fn != "solution.log")                       # solution.log carries wall-clock stamps
    bad = [n for n in names if not os.path.exists(os.path.join(case, n))
           or not filecmp.cmp(os.path.join(ref, n), os.path.join(case, n), shallow=False)]
    check(bool(names) and not bad and outs["original"][1] == outs["imported"][1],
          "engine run: original vs imported reactions (new names r001..): stdout (reaction names mapped) and %d result files byte-identical%s"
          % (len(names), "" if not bad else ": " + ", ".join(bad[:3])))


def _rec(n, comp, ph, lo, hi, tc, lc, hc):
    return ("%-24s%-20s%s%10.3f%10.3f%8.2f" % (n, comp, ph, lo, hi, tc)).ljust(79) + "1"


def _thermo_lines(r):
    cc = r["high"] + r["low"]
    f = lambda x: "%15.8E" % x
    comp = "".join("%-2s%3d" % (e.upper(), int(n)) for e, n in list(r["comp"].items())[:4])
    return [_rec(r["name"], comp, r["phase"], r["Tlow"], r["Thigh"], r["Tcommon"], 0, 0),
            "".join(f(x) for x in cc[0:5]).ljust(79) + "2",
            "".join(f(x) for x in cc[5:10]).ljust(79) + "3",
            "".join(f(x) for x in cc[10:14]).ljust(79) + "4"]


def _fixture():
    sp = [("A", {"H": 2}), ("B", {"O": 2}), ("C", {"H": 1, "O": 1}), ("D", {"N": 2}), ("E", {"N": 1, "O": 1})]
    out = ["! parser fixture, not chemistry", "ELEMENTS H O N END", "SPECIES A B C D E END", "THERMO ALL",
           "   300.000  1000.000  5000.000"]
    for k, (n, c) in enumerate(sp):
        r = dict(name=n, comp={e: float(v) for e, v in c.items()}, phase="G", Tlow=200.0, Thigh=5000.0,
                 Tcommon=1000.0, low=[3.5 + k, 1e-3, 2e-7, 3e-11, 4e-15, -9e2, 5.0],
                 high=[3.0 + k, 2e-3, 3e-7, 4e-11, 5e-15, -1e3, 6.0])
        ls = _thermo_lines(r)
        if n == "B":                      # blank Tcommon -> the THERMO ALL default
            ls[0] = ls[0][:65] + " " * 8 + ls[0][73:]
        out += ls
    out += ["END", "REACTIONS KCAL/MOLE",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 1 reversible, order 2",
            "2A=>C+D             2.0E+10  0.0   5.0   ! 2 irreversible, order 2",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 3 with REV", "  REV / 4.0E+12 0.5 20.0 /",
            "A+B=C+D             1.0E+13  0.5  10.0   ! 4 b != 0",
            "A+B+M=C+D+M         1.0E+13  0.0  10.0   ! 5 third body", "  A/2.5/ B/12/",
            "A+B+M=C+M           1.0E+16  0.0  10.0   ! 5b third body with REV", "  A/2.5/ B/12/",
            "  REV / 3.0E+10 0.0 7.0 /",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 5c REV with A = 0", "  REV / 0.0 0.0 20.0 /",
            "A+B(+M)=C(+M)       1.0E+13  0.0  10.0   ! 5d falloff with REV", "  LOW / 1.0E+16 0.0 5.0 /",
            "  REV / 3.0E+10 0.0 7.0 /",
            "A+B(+M)=C(+M)       1.0E+13  0.0  10.0   ! 6 falloff", "  LOW / 1.0E+16 0.0 5.0 /",
            "  TROE / 0.5 100 1000 /",
            "A+B=E+D             1.0E+13  0.0  10.0   ! 7 PLOG with REV (refused)", "  PLOG / 1.0 1.0E+12 0.0 10.0 /",
            "  REV / 3.0E+10 0.0 7.0 /",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 8 FORD", "  FORD / A 1.5 /",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 9 duplicate pair", "  DUP",
            "A+B=C+D             3.0E+12  0.0  10.0   ! 10 duplicate pair", "  DUPLICATE",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 11 PLOG, two lines at 1 atm and one at 10 atm",
            "  PLOG / 0.1  1.0E+12 0.5 10.0 /", "  PLOG / 1.0  2.0E+12 0.5 10.0 /",
            "  PLOG / 1.0  3.0E+12 0.5 10.0 /", "  PLOG / 10.0 1.0E+14 0.5 12.0 /",
            "A+B=>C+D            1.0E+13  0.0  10.0   ! 12 PLOG irreversible", "  PLOG / 1.0 1.0E+12 0.0 10.0 /",
            "A+B+M=C+D+M         1.0E+13  0.0  10.0   ! 13 PLOG with +M (refused)", "  PLOG / 1.0 1.0E+12 0.0 10.0 /",
            "END", ""]
    return "\n".join(out)


def selftest():
    fails = []

    def check(ok, msg):
        print(("PASS  " if ok else "FAIL  ") + msg)
        if not ok:
            fails.append(msg)
    aw = atomic_weights()
    check(abs(aw.get("C", 0) - 12.011) < 1e-9, "atomic weights read from src/thermo/AtomicWeights.cpp (C = 12.011)")

    # (a) round trip: the tree's NASA7 records (+ labelled writer fixtures when it holds fewer than 3)
    recs = []
    cdir = os.path.join(ROOT, "data", "standards", "components")
    for fn in sorted(os.listdir(cdir)):
        t = open(os.path.join(cdir, fn), encoding="utf-8").read()
        if re.search(r'model\s+NASA7\s*;', t):
            g = lambda k: float(re.search(r'\b%s\s+([-0-9.eE+]+)\s*;' % k, t).group(1))
            lo = [float(x) for x in re.search(r'^\s*low\s*\(([^)]*)\)', t, re.M).group(1).split()]
            hi = [float(x) for x in re.search(r'^\s*high\s*\(([^)]*)\)', t, re.M).group(1).split()]
            recs.append(dict(name=fn[:-4], comp={"C": 1.0}, phase="S", Tlow=g("Tlow"), Thigh=g("Thigh"),
                             Tcommon=g("Tcommon"), low=lo, high=hi, src="data/standards"))
    n_tree = len(recs)
    for k in range(3 - n_tree):
        recs.append(dict(name="FIXT%d" % k, comp={"H": 2.0}, phase="G", Tlow=200.0, Thigh=5000.0 + k,
                         Tcommon=1000.0, low=[1.0 + k, 2e-3, 3e-7, 4e-11, 5e-15, -1e3, 6.0],
                         high=[3.0, 2e-3, 3e-7, 4e-11, 5e-15, -1e3, 6.0], src="writer fixture, not chemistry"))
    block = []
    for r in recs:
        block += _thermo_lines(r)
    got = parse_thermo(block, [])
    for r in recs:
        g = got.get(r["name"])
        ok = g is not None and all(abs(a - b) <= 6e-9 * abs(b) for a, b in zip(g["low"] + g["high"], r["low"] + r["high"])) \
            and (g["Tlow"], g["Tcommon"], g["Thigh"]) == (r["Tlow"], r["Tcommon"], r["Thigh"])
        check(ok, "round trip %s (%s): 14 coefficients (9 significant digits written, <= 6e-9 relative) and 3 T bounds equal" % (r["name"], r["src"]))
    print("note  tree NASA7 records used: %d of 3; the tree holds few NASA7 records, the rest are labelled writer fixtures" % n_tree)

    # (b) fixture
    tmp = tempfile.mkdtemp(prefix="chemkin_selftest_")
    mech = os.path.join(tmp, "fixture.inp")
    with open(mech, "w") as f:
        f.write(_fixture())
    case = os.path.join(tmp, "case")
    with contextlib.redirect_stdout(io.StringIO()):
        res = convert(mech, None, case, "parser fixture, no data")
    check(len(res["ok"]) == 12, "fixture: 12 written (reversible, irreversible, REV, b != 0, third body, third body REV, REV A=0, falloff, 2 DUP, 2 PLOG), got %d" % len(res["ok"]))
    check(res["counts"] == {"REV": 1, "PLOG": 2, "FORD/RORD": 1},   # REV: the (+M) fall-off one only
          "fixture: not written by kind %s" % dict(sorted(res["counts"].items())))
    # real files print M and (+M) in lower case (the LLNL H2 mechanism of 2004 does)
    r_, p_, _, tb_, fo_ = parse_equation("a+b+m=c+m", {"a", "b", "c"})
    check(tb_ is True and set(r_) == {"a", "b"}, "lower-case `+m` is the third body")
    check(parse_equation("a+b(+m)=c(+m)", {"a", "b", "c"})[4] == "M", "lower-case `(+m)` is the (+M) collider")
    with contextlib.redirect_stdout(io.StringIO()):
        res2 = convert(mech, None, os.path.join(tmp, "revthermo"), "parser fixture, no data", rev_from_thermo=True)
    check(len(res2["ok"]) == 14 and "REV" not in res2["counts"],
          "--rev-from-thermo: the REV reactions are written with the reverse from the thermochemistry "
          "(including the fall-off one), the others still refused")
    t2 = open(os.path.join(tmp, "revthermo", "constant", "reactions")).read()
    check("_f" not in t2 and "_r" not in t2, "--rev-from-thermo: no `_f`/`_r` pair is written")
    txt = open(os.path.join(case, "constant", "reactions")).read()
    m = re.search(r'r001\s.*?type modifiedArrhenius;\s*A 1e\+13;\s+b 0;\s+Ea 10;\s*units \{ A "cm3/mol/s"; Ea "kcal/mol"; \}', txt, re.S)
    check(bool(m) and "1e+07" not in txt and "41840" not in txt,
          "A and Ea written AS PRINTED with a units{} block (1e13 cm3/mol/s, 10 kcal/mol); no conversion by the tool")
    blk = lambda n: re.search(r'\nr%s\n.*?\n}\n' % n, txt, re.S).group(0)
    check(re.search(r"reversible\s+true", blk("001")) is not None, "`=`/`<=>` -> reversible true")
    check("reversible" not in blk("002"), "`=>` -> irreversible")
    check("type modifiedArrhenius" in blk("004") and "b 0.5" in blk("004"), "b != 0 -> modifiedArrhenius with b")
    check("type thirdBody" in blk("005") and "thirdBody { A 2.5; B 12; }" in blk("005"), "+M -> thirdBody with efficiencies")
    check("type falloff" in blk("008") and "low  { A 1e+16;" in blk("008") and "troe ( 0.5 100 1000 );" in blk("008"),
          "(+M) LOW TROE -> falloff with low{} and troe")
    check("type modifiedArrhenius" in blk("009") and "type modifiedArrhenius" in blk("010"), "DUPLICATE -> two separate entries")
    #  PLOG: P as printed in atm, nominal A b Ea dropped, lines kept in order, DUP lines at one pressure
    #  written separately (the engine sums them), `=` -> reversible, `=>` -> irreversible
    p11 = blk("011")
    check("type plog;" in p11 and "type modifiedArrhenius" not in p11 and "A 1e+13" not in p11
          and p11.count("P 1 atm;") == 2 and "P 0.1 atm;" in p11 and "P 10 atm;" in p11
          and "A 2e+12;  b 0.5;  Ea 10;" in p11 and "A 3e+12;  b 0.5;  Ea 10;" in p11
          and "A 1e+14;  b 0.5;  Ea 12;" in p11 and re.search(r"reversible\s+true", p11) is not None,
          "PLOG -> plog ( ... ), P in atm as printed, two lines at 1 atm kept, nominal A b Ea dropped, `=` reversible")
    check("type plog;" in blk("012") and "reversible" not in blk("012"), "PLOG with `=>` -> irreversible")
    # REV -> two irreversible reactions (ck2yaml's reading): names, parameters, orders, units, third body
    f3, r3 = blk("003_f"), blk("003_r")
    check("reversible" not in f3 and "reversible" not in r3, "REV: both legs irreversible")
    check("A 1e+13;  b 0;  Ea 10;" in f3 and "A 4e+12;  b 0.5;  Ea 20;" in r3,
          "REV: forward keeps the main A b Ea, the reverse takes the REV A b Ea")
    check(re.search(r"component A; nu -1; order 1;", f3) and re.search(r"component C; nu 1; order 0;", f3)
          and re.search(r"component A; nu 1; order 0;", r3) and re.search(r"component C; nu -1; order 1;", r3),
          "REV: the reverse leg is products -> reactants with the reverse side's orders")
    check('units { A "cm3/mol/s"; Ea "kcal/mol"; }' in r3, "REV: the reverse leg carries the units block as printed")
    t5 = blk("006_r")
    check("type thirdBody" in t5 and "thirdBody { A 2.5; B 12; }" in t5 and "A 3e+10;" in t5
          and re.search(r"component C; nu -1; order 1;", t5),
          "REV on +M: the reverse leg is a thirdBody with the same efficiencies and the REV parameters")
    check("\nr007\n" in txt and "r007_f" not in txt and "reversible" not in blk("007"),
          "REV with A = 0: the forward leg alone, irreversible")
    with open(mech, "r") as f:
        mt = f.read()
    kcase = os.path.join(tmp, "kelvins")
    mk = os.path.join(tmp, "kelvins.inp")
    with open(mk, "w") as f:
        f.write(mt.replace("REACTIONS KCAL/MOLE", "REACTIONS KELVINS"))
    with contextlib.redirect_stdout(io.StringIO()):
        convert(mk, None, kcase, "parser fixture, no data", reactions_only=True)
    tk = open(os.path.join(kcase, "constant", "reactions")).read()
    check("Ea 83.14462618" in tk and 'Ea "J/mol"' in tk, "KELVINS: Ea = R * 10 = 83.1446 J/mol written, units J/mol")
    mm = os.path.join(tmp, "molecules.inp")
    with open(mm, "w") as f:
        f.write(mt.replace("REACTIONS KCAL/MOLE", "REACTIONS KCAL/MOLE MOLECULES"))
    with contextlib.redirect_stdout(io.StringIO()):
        resm = convert(mm, None, os.path.join(tmp, "molecules"), "parser fixture, no data", reactions_only=True)
    check(len(resm["ok"]) == 0 and resm["counts"].get("MOLECULES") == 16, "MOLECULES: every reaction refused by name")
    _r = dict(name="X", comp={"H": 2}, phase="G", Tlow=300.0, Tcommon=1000.0, Thigh=5000.0,
              low=[3.5, 1e-3, 2e-7, 3e-11, 4e-15, -9e2, 5.0], high=[3.0, 2e-3, 3e-7, 4e-11, 5e-15, -1e3, 6.0])
    _b = to_bar_standard_state(_r, "atm")
    _H0, _S0 = nasa_H_S(_r["low"], T0)
    _H1, _S1 = nasa_H_S(_b["low"], T0)
    check(abs(_b["low"][6] - _r["low"][6] - math.log(1.01325)) < 1e-15
          and abs(_b["high"][6] - _r["high"][6] - math.log(1.01325)) < 1e-15
          and _H1 == _H0 and abs((_S1 - _S0) - 8.314462618 * math.log(1.01325)) < 1e-9
          and to_bar_standard_state(_r, "bar") is _r,
          "standard state: a 1 atm record gains ln(1.01325) in a7 on both ranges, H unchanged, "
          "S + R ln(1.01325); a 1 bar record is written as printed")
    rep = open(os.path.join(case, "constant", "mechanismImport.txt")).read()
    check(all(s in rep for s in ("REV", "PLOG", "FORD")) and "multi-reaction paths of cstr and pfr" in rep,
          "every reaction not written is listed by its equation, with its reason")
    comp = open(os.path.join(case, "constant", "components", "A.dat")).read()
    check("model    NASA7;" in comp and "MW          2.0160" in comp and "parser fixture, no data" in comp,
          "species record: NASA7 model, MW from the engine's table, licence in provenance")
    compB = open(os.path.join(case, "constant", "components", "B.dat")).read()
    check("Tcommon  1000;" in compB, "blank Tcommon takes the THERMO ALL default (1000 K)")

    roundtrip_witness(check, tmp)

    # (c) refusals
    def refused(fn, label):
        try:
            fn()
        except Refusal as e:
            check(True, "refused: %s (%s)" % (label, str(e)[:55]))
            return
        check(False, "NOT refused: " + label)
    refused(lambda: convert(mech, None, os.path.join(ROOT, "data", "standards", "x"), "l"), "output under data/standards")
    gri = os.path.join(tmp, "gri30.inp")
    with open(gri, "w") as f:
        f.write(_fixture())
    refused(lambda: convert(gri, None, case, "l"), "GRI name in the file name")
    gri2 = os.path.join(tmp, "m.inp")
    with open(gri2, "w") as f:
        f.write("! GRI-Mech 3.0\n" + _fixture())
    refused(lambda: convert(gri2, None, case, "l"), "GRI name in the header")
    refused(lambda: convert(mech, None, case, ""), "missing --licence")
    print("selftest: %s" % ("FAILED (%d)" % len(fails) if fails else "OK"))
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("mechanism", nargs="?")
    ap.add_argument("--thermo", help="separate thermo file")
    ap.add_argument("--case", help="case directory; files go to CASE/constant/")
    ap.add_argument("--licence", help="licence/permission text, written in every provenance block")
    ap.add_argument("--reactions-only", action="store_true",
                    help="write constant/reactions and mechanismImport.txt only (no thermo, no components)")
    ap.add_argument("--rev-from-thermo", action="store_true",
                    help="ignore explicit REV lines (reverse from the thermochemistry); a declared variant")
    ap.add_argument("--standard-pressure", default="atm", choices=("atm", "bar"),
                    help="pressure the file's NASA-7 records are referenced to (CHEMKIN-II: atm, the default); "
                         "atm records are re-referenced to the engine's 1 bar")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.mechanism or not a.case:
        ap.error("mechanism and --case are required")
    try:
        convert(a.mechanism, a.thermo, a.case, a.licence, a.reactions_only, a.rev_from_thermo,
                a.standard_pressure)
    except Refusal as e:
        print("REFUSED: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
