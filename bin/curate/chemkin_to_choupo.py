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

WHAT IS WRITTEN AS A REACTION.  Elementary mass action, b == 0, no third body,
no falloff, no PLOG, no FORD/RORD, no DUPLICATE (the engine's `kinetics {}`
holds ONE Arrhenius expression, src/thermo/reaction/RateLaw.cpp:55-86; a b != 0
reaction would need a modified-Arrhenius law RateLaw does not read -- listed as
refused).  `=`/`<=>` -> `reversible true` (detailed balance, RateLaw.cpp:86);
`=>` -> irreversible; REV -> `A_rev`/`Ea_rev`.

UNITS, READ FROM THE SOURCE (not assumed).  The engine's concentrations are
mol/m^3 (RateLaw.H, netRate: `conc` is in mol/m^3) and the rate constant is
A exp(-Ea/(R T)) with Ea in J/mol (Reaction.cpp arrheniusRate, R in J/(mol K)).
CHEMKIN's A is in cm, mol, s: (cm^3/mol)^(n-1)/s; for a reaction of order n,
A_SI = A (1e-6)^(n-1).  With MOLECULES, A is (cm^3/molecule)^(n-1)/s and the
factor is (1e-6 N_A)^(n-1).  Ea is converted to J/mol from the header unit.
n is the sum of the reactant coefficients (REV: of the products).

WHAT A SPECIES RECORD CARRIES.  MW from the composition with the engine's own
table (src/thermo/AtomicWeights.cpp, read at run time -- one home); formula;
dHf_298 = H(298.15) and s_298 = S(298.15) DERIVED from the NASA-7 coefficients
(CHEMKIN's elements reference makes H(298.15) the formation enthalpy, the same
reading graphite.dat's header uses), on the interval that contains 298.15 K;
`idealGasHeatCapacity` (gas) or `solidHeatCapacity` (solid) with `model NASA7`
and Tlow/Tcommon/Thigh (NASA7Cp.cpp reads all three, refuses without).  Not
written, because nothing in a mechanism supplies them: role, Tc, Pc, omega,
vapour pressure, CAS.  A liquid ('L') record is refused by name.  Species names
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
            if tok == "M":
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
        if up in ("DUP", "DUPLICATE"):
            cur["tags"].add("DUPLICATE")
        elif up.startswith(("LOW", "TROE", "SRI", "PLOG")):
            cur["tags"].add(re.match(r'[A-Z]+', up).group(0))
        elif up.startswith(("FORD", "RORD")):
            cur["tags"].add("FORD")
        elif up.startswith("REV"):
            nums = re.findall(r'[-+0-9.eEdD]+', s[3:].replace("/", " "))
            cur["rev"] = tuple(float(x.replace("D", "E")) for x in nums[:3])
        elif "/" in s:
            cur["tags"].add("EFF")           # third-body efficiencies
        else:
            cur["tags"].add("AUX?")
    return rxns, ea_unit, molecules


def classify(rx, species):
    """-> (kind, reason); kind None = runnable.  Fills rx r, p, arrow."""
    try:
        r, p, arrow, tb, fo = parse_equation(rx["eq"], species)
    except Refusal as e:
        return "unparsed", str(e)
    rx.update(r=r, p=p, arrow=arrow)
    t = rx["tags"]
    if fo is not None or {"LOW", "TROE", "SRI"} & t:
        return "falloff", "pressure falloff, (+M) with LOW/TROE/SRI"
    if "PLOG" in t:
        return "PLOG", "pressure-dependent PLOG rate"
    if tb:
        return "thirdBody", "third-body (+M) reaction"
    if "FORD" in t:
        return "FORD/RORD", "explicit reaction orders (FORD/RORD) are not read"
    if "DUPLICATE" in t:
        return "DUPLICATE", "duplicate rate expression: the engine holds one Arrhenius per reaction"
    if "AUX?" in t:
        return "unparsed", "unrecognised auxiliary line"
    if rx["b"] != 0.0:
        return "bNonZero", "temperature exponent b = %g != 0 (A T^b exp(-Ea/RT) is not run by RateLaw)" % rx["b"]
    if rx["rev"] is not None:
        if arrow == "=>":
            return "REV", "REV on an irreversible reaction"
        if rx["rev"][1] != 0.0:
            return "bNonZero", "REV exponent b_rev = %g != 0" % rx["rev"][1]
    if arrow == "<=>" and (set(r) & set(p)):
        return "bothSides", "species on both sides: order != |nu|, detailed balance refuses it"
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


def species_record(rec, cname, aw, source, licence):
    if rec["phase"].upper() == "L":
        raise Refusal("liquid-phase NASA record is not supported")
    miss = [e for e in rec["comp"] if e not in aw]
    if miss:
        raise Refusal("element(s) %s not in the engine's atomic-weight table" % miss)
    if not rec["Tlow"] <= T0 <= rec["Thigh"]:
        raise Refusal("298.15 K is outside %g-%g K, no dHf_298/s_298 derivable" % (rec["Tlow"], rec["Thigh"]))
    mw = sum(aw[e] * n for e, n in rec["comp"].items())
    H, S = nasa_H_S(rec["low"] if T0 <= rec["Tcommon"] else rec["high"], T0)
    solid = rec["phase"].upper() == "S"
    blk = "solidHeatCapacity" if solid else "idealGasHeatCapacity"
    prov = ('mechanism file %s; licence: %s' % (source, licence)).replace('"', "'")
    return """/*--- Component %s: imported from a CHEMKIN mechanism by bin/curate/chemkin_to_choupo.py ---*/
//  Original mechanism name: %s.  A case-local import, not a catalogue record:
//  role, Tc, Pc, omega, vapour pressure and CAS are not in a mechanism and are not written.
name        %s;
formula     %s;
MW          %.4f;            // kg/kmol, from the composition with src/thermo/AtomicWeights.cpp
reviewStatus interim;
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
""" % (cname, rec["name"], cname, formula_of(rec["comp"]), mw, H, S,
       "    referenceState pureSolid;\n" if solid else "",
       blk, fmt_list(rec["low"]), fmt_list(rec["high"]),
       rec["Tlow"], rec["Tcommon"], rec["Thigh"], prov, blk, prov)


def a_si(A, order, molecules):
    f = 1e-6 * (N_A if molecules else 1.0)
    return A * f ** (order - 1.0)


def reaction_text(idx, rx, cname, unit, molecules):
    nu = {}
    for s, n in rx["r"].items():
        nu[s] = nu.get(s, 0.0) - n
    for s, n in rx["p"].items():
        nu[s] = nu.get(s, 0.0) + n
    st = " ".join("{component %s; nu %g; order %g;}" % (cname[s], v, rx["r"].get(s, 0.0))
                  for s, v in nu.items())
    lim = cname[next(iter(rx["r"]))] if rx["r"] else cname[next(iter(rx["p"]))]
    kin = "type Arrhenius; A %.8e; Ea %.8e;" % (
        a_si(rx["A"], sum(rx["r"].values()), molecules), rx["Ea"] * EA_UNITS[unit])
    extra = ""
    if rx["rev"] is not None:
        kin += " A_rev %.8e; Ea_rev %.8e;" % (
            a_si(rx["rev"][0], sum(rx["p"].values()), molecules), rx["rev"][2] * EA_UNITS[unit])
    elif rx["arrow"] == "<=>":
        extra = " reversible true;"
    return "// %s\nr%03d { limitingReactant %s; stoichiometry ( %s );%s kinetics { %s } }\n" % (
        rx["eq"], idx, lim, st, extra, kin)


def refuse_output(case):
    p = os.path.realpath(case)
    std = os.path.realpath(os.path.join(ROOT, "data", "standards"))
    if p == std or p.startswith(std + os.sep):
        raise Refusal("output path is under data/standards: new data is a curation act, "
                      "this tool writes a case's constant/ only")


def convert(mech_path, thermo_path, case, licence):
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
    if "THERMO" not in tsec:
        raise Refusal("no THERMO section (give --thermo)")
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
    os.makedirs(os.path.join(cdir, "components"), exist_ok=True)
    written_sp, refused_sp = [], []
    for s in species:
        if s not in thermo:
            refused_sp.append((s, "no THERMO record"))
            continue
        try:
            txt = species_record(thermo[s], cname[s], aw, source, licence)
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
    for r in rx:
        kind, why = classify(r, set(species))
        used = (set(r.get("r", {})) | set(r.get("p", {}))) & bad_sp
        if kind is None and used:
            kind, why = "speciesRefused", "uses a species with no usable record: " + ", ".join(sorted(used))
        if kind:
            refused.append((r["eq"], kind, why))
            counts[kind] = counts.get(kind, 0) + 1
        else:
            ok.append(r)
    head = ("/*--- constant/reactions: imported by bin/curate/chemkin_to_choupo.py ---*/\n"
            "// Mechanism: %s.  Licence: %s\n// Units converted: A cm3/mol/s -> m3/mol/s, Ea %s -> J/mol.\n"
            "// Only elementary mass-action reactions with b = 0 are written; see mechanismImport.txt.\n"
            % (source, licence.replace("\n", " "), unit))
    with open(os.path.join(cdir, "reactions"), "w", encoding="utf-8") as f:
        f.write(head + "".join(reaction_text(i + 1, r, cname, unit, mol) for i, r in enumerate(ok)))
    lines = ["CHEMKIN import: %s" % source, "licence: %s" % licence,
             "species: %d, written %d, not written %d" % (len(species), len(written_sp), len(refused_sp)),
             "reactions: %d, written %d, not written %d" % (len(rx), len(ok), len(refused))]
    lines += ["  not written, by kind: %s = %d" % kv for kv in sorted(counts.items())]
    lines += ["SPECIES NOT WRITTEN:"] + ["  %s: %s" % x for x in refused_sp]
    lines += ["REACTIONS NOT WRITTEN:"] + ["  %s   [%s] %s" % x for x in refused]
    rep = "\n".join(lines) + "\n"
    with open(os.path.join(cdir, "mechanismImport.txt"), "w", encoding="utf-8") as f:
        f.write(rep)
    sys.stdout.write(rep)
    return dict(ok=ok, refused=refused, counts=counts, species=written_sp, refused_sp=refused_sp)


# ---------------------------------------------------------------------- selftest
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
            "A+B=C+D             1.0E+13  0.0  10.0   ! 3 with REV", "  REV / 4.0E+12 0.0 20.0 /",
            "A+B=C+D             1.0E+13  0.5  10.0   ! 4 b != 0",
            "A+B+M=C+D+M         1.0E+13  0.0  10.0   ! 5 third body", "  A/2.5/ B/12/",
            "A+B(+M)=C(+M)       1.0E+13  0.0  10.0   ! 6 falloff", "  LOW / 1.0E+16 0.0 5.0 /",
            "  TROE / 0.5 100 1000 /",
            "A+B=E+D             1.0E+13  0.0  10.0   ! 7 PLOG", "  PLOG / 1.0 1.0E+12 0.0 10.0 /",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 8 FORD", "  FORD / A 1.5 /",
            "A+B=C+D             1.0E+13  0.0  10.0   ! 9 duplicate pair", "  DUP",
            "A+B=C+D             3.0E+12  0.0  10.0   ! 10 duplicate pair", "  DUPLICATE", "END", ""]
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
    check(len(res["ok"]) == 3, "fixture: 3 written (reversible, irreversible, REV), got %d" % len(res["ok"]))
    check(res["counts"] == {"bNonZero": 1, "thirdBody": 1, "falloff": 1, "PLOG": 1, "FORD/RORD": 1, "DUPLICATE": 2},
          "fixture: not written by kind %s" % dict(sorted(res["counts"].items())))
    txt = open(os.path.join(case, "constant", "reactions")).read()
    m = re.search(r'r001 .*?A ([0-9.e+]+); Ea ([0-9.e+]+);', txt)
    check(bool(m) and abs(float(m.group(1)) - 1.0e7) < 1e-3 and abs(float(m.group(2)) - 41840) < 1e-6,
          "A conversion: 1e13 cm3/mol/s at order 2 -> 1e7 m3/mol/s; Ea 10 kcal/mol -> 41840 J/mol")
    r1, r2, r3 = txt.split("r001")[1].split("r002")[0], txt.split("r002")[1].split("r003")[0], txt.split("r003")[1]
    check("reversible true" in r1, "`=`/`<=>` -> reversible true")
    check("reversible" not in r2 and "A_rev" not in r2, "`=>` -> irreversible")
    check("A_rev" in r3 and "Ea_rev 8.36800000e+04" in r3 and "reversible" not in r3,
          "REV -> A_rev / Ea_rev only (20 kcal/mol = 83680 J/mol)")
    rep = open(os.path.join(case, "constant", "mechanismImport.txt")).read()
    check(all(s in rep for s in ("A+B+M=C+D+M", "A+B(+M)=C(+M)", "PLOG", "FORD", "DUPLICATE")),
          "every reaction not written is listed by its equation, with its reason")
    comp = open(os.path.join(case, "constant", "components", "A.dat")).read()
    check("model    NASA7;" in comp and "MW          2.0160" in comp and "parser fixture, no data" in comp,
          "species record: NASA7 model, MW from the engine's table, licence in provenance")
    compB = open(os.path.join(case, "constant", "components", "B.dat")).read()
    check("Tcommon  1000;" in compB, "blank Tcommon takes the THERMO ALL default (1000 K)")

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
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.mechanism or not a.case:
        ap.error("mechanism and --case are required")
    try:
        convert(a.mechanism, a.thermo, a.case, a.licence)
    except Refusal as e:
        print("REFUSED: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
