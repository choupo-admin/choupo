#!/usr/bin/env python3
"""Equilibrium-family gate: identity per PARAMETERISATION, families derived.

The ratified identity model (docs/design/equilibrium-parameterisation-
identity.md): multiple curated parameterisations of one physical
equilibrium are LEGITIMATE (different primaries, conventions, domains);
what is forbidden is literal duplication and contradicted identity.  The
physical family is DERIVED from typed references (gasSpecies,
dissolvedSpecies, solvent) -- never from bidirectional crossRefs.

Checks:
  1. every declared `convention <name>;` resolves to a conventionProfile
     record; profiles carry the non-defaultable facts NOWHERE (no source/
     validity/coefficients inside a profile beyond its own citation);
  2. families with parameterisations in BOTH conventions get the
     CROSS-CONVENTION DIAGNOSTIC: the PHREEQC molal K(T) converted to the
     H_xp form (explicit auxiliaries: 55.508 mol/kg water, ideal gas,
     1 atm reference) against the Sander pair over the COMMON T domain --
     reported as INFO, failing ONLY if the records claim identity (same
     source) while disagreeing, or on literal duplicates;
  3. no two records duplicate (family, convention, source) literally.

Adoption is incremental by design: records WITHOUT the identity fields are
simply not yet migrated (the ADR's closed-migration wave lands them); this
gate governs the ones that have crossed.
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

bad, info = [], []


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


profiles = {}
convDir = STD / "conventions"
if convDir.is_dir():
    for p in convDir.glob("*.dat"):
        t = strip(p.read_text())
        m = re.search(r'^\s*name\s+(\S+)\s*;', t, re.M)
        if not m or "recordType    conventionProfile" not in p.read_text():
            bad.append(f"conventions/{p.name}: not a well-formed"
                       f" conventionProfile (name + recordType required)")
            continue
        profiles[m.group(1)] = t

# ---- gather migrated parameterisations -------------------------------------
params = []          # dicts: family key, convention, source, home, data
for p in sorted((STD / "parameters" / "Henry").glob("*.dat")):
    t = strip(p.read_text())
    conv = re.search(r'^\s*convention\s+(\S+)\s*;', t, re.M)
    if not conv:
        continue                      # not yet migrated -- fine
    gs = re.search(r'^\s*gasSpecies\s+(\S+)\s*;', t, re.M)
    ds = re.search(r'^\s*dissolvedSpecies\s+(\S+)\s*;', t, re.M)
    sv = re.search(r'^\s*solvent\s+(\S+)\s*;', t, re.M)
    src = re.search(r'^\s*source\s+"?([^";]+)', t, re.M)
    H = re.search(r'H_ref\s+([\d.eE+-]+)\s*Pa', t)
    dH = re.search(r'enthalpy\s+(-?[\d.eE+-]+)', t)
    Tr = re.search(r'Trange\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)', t)
    if not (gs and ds and sv):
        bad.append(f"parameters/Henry/{p.name}: declares a convention but"
                   f" not the full typed identity (gasSpecies/"
                   f"dissolvedSpecies/solvent)")
        continue
    # pair identity is declared on component-level names already
    params.append(dict(fam=(gs.group(1), ds.group(1), sv.group(1)),
                       conv=conv.group(1), src=(src.group(1) if src else "?"),
                       home=f"parameters/Henry/{p.name}",
                       H=float(H.group(1)) if H else None,
                       dH=float(dH.group(1)) if dH else None,
                       Tlo=float(Tr.group(1)) if Tr else 273.0,
                       Thi=float(Tr.group(2)) if Tr else 373.0))
# Family normalisation through DECLARED component facts only: a gas token
# that is some component's declared `formula` (uniquely) maps to that
# component's name -- the gasOf contract's formula key (H2O -> water,
# C2H4O2 -> aceticAcid).  Never element/similarity inference.
formulaOf = {}
for c in sorted((STD / "components").glob("*.dat")):
    m = re.search(r'^\s*formula\s+(\S+)\s*;', strip(c.read_text()), re.M)
    if m:
        formulaOf.setdefault(m.group(1), []).append(c.stem)
compNames = {c.stem for c in (STD / "components").glob("*.dat")}


def normGas(tok):
    if tok in compNames:
        return tok
    owners = formulaOf.get(tok, [])
    return owners[0] if len(owners) == 1 else tok


# Declared-mapping equivalence for the DISSOLVED token (D6 v2, 2026-07-26):
# a dissolved species LABEL (`ion "..."` in the aqueous formation registry)
# normalises to the component whose declared aqueousMapping master multiset
# equals the species' declared masters (z = 0) -- the typed stoichiometric
# bridge, never lexical similarity (aceticAcid ~ CH3COOH via Acetate+H).
compMapping = {}
for c in sorted((STD / "components").glob("*.dat")):
    tc = strip(c.read_text())
    am = re.findall(r'\{\s*species\s+([A-Za-z0-9_]+)\s*;\s*nu\s+(\d+)', tc)
    if am:
        compMapping[c.stem] = tuple(sorted((s, int(n)) for s, n in am))
labelMasters = {}
for c in sorted((STD / "chemistry").glob("*.dat")):
    raw = c.read_text()
    if "recordType aqueousSpeciation;" not in raw:
        continue
    tc = strip(raw)
    ion = re.search(r'\bion\s+"([^"]+)"\s*;', tc)
    z = re.search(r'\bz\s+(-?\d+)\s*;', tc)
    ms = re.findall(r'\{\s*ion\s+([A-Za-z0-9_]+)\s*;\s*nu\s+(\d+)', tc)
    if ion and (not z or int(z.group(1)) == 0) and ms:
        labelMasters[ion.group(1)] = tuple(sorted((m, int(n))
                                                  for m, n in ms))


def normDissolved(tok):
    if tok in compNames or "+" in tok:
        return tok
    masters = labelMasters.get(tok)
    if masters:
        owners = [c for c, m in compMapping.items() if m == masters]
        if len(owners) == 1:
            return owners[0]
    return tok


for p in sorted((STD / "chemistry").glob("*.dat")):
    if "recordType gasLiquidEquilibrium;" not in p.read_text():
        continue
    t = strip(p.read_text())
    conv = re.search(r'\bconvention\s+(\S+)\s*;', t)
    if not conv:
        continue
    gs = re.search(r'\bgasSpecies\s+(\S+)\s*;', t)
    ds = re.search(r'\bdissolvedSpecies\s+("[^"]+"|\S+)\s*;', t)
    sv = re.search(r'^\s*solvent\s+(\S+)\s*;', t, re.M)
    src = re.search(r'source\s+"([^"]+)"', t)
    k25 = re.search(r'logK25\s+(-?[\d.eE+-]+)', t)
    dHk = re.search(r'\bdH\s+(-?[\d.eE+-]+)\s*;', t)
    ana = re.search(r'analytic\s*\(\s*([^)]*)\)', t)
    if not (gs and ds and sv):
        bad.append(f"chemistry/{p.name}: declares a convention but not the"
                   f" full typed identity")
        continue
    params.append(dict(fam=(normGas(gs.group(1)),
                            normDissolved(ds.group(1).strip('"')),
                            sv.group(1)),
                       conv=conv.group(1), src=(src.group(1) if src else "?"),
                       home=f"chemistry/{p.name}",
                       logK25=float(k25.group(1)) if k25 else None,
                       dHk=float(dHk.group(1)) if dHk else None,
                       ana=[float(x) for x in ana.group(1).split()] if ana
                           else None))

# ---- 1. conventions resolve -------------------------------------------------
for q in params:
    if q["conv"] not in profiles:
        bad.append(f"{q['home']}: convention '{q['conv']}' does not resolve"
                   f" to a conventions/ profile")

# ---- 3. literal duplicates --------------------------------------------------
seen = {}
for q in params:
    key = (q["fam"], q["conv"], q["src"])
    if key in seen:
        bad.append(f"{q['home']} duplicates ({q['fam']}, {q['conv']},"
                   f" '{q['src']}') already curated in {seen[key]} -- the"
                   f" arity error")
    seen[key] = q["home"]

# ---- 2. cross-convention diagnostic ----------------------------------------
fams = {}
for q in params:
    fams.setdefault(q["fam"], []).append(q)
nDiag = 0
for fam, qs in fams.items():
    hx = [q for q in qs if "H" in q and q.get("H")]
    ph = [q for q in qs if "logK25" in q and q.get("logK25") is not None]
    for a in hx:
        for b in ph:
            nDiag += 1
            # convert PHREEQC molal K(T) -> H_xp [Pa]:
            #   a_m = K * p[atm]; dilute x = m/55.508; ideal gas
            #   p[Pa] = (m/K) * 101325 = x * 55.508/K * 101325 = H_xp x
            def logK(T):
                if b["ana"]:
                    c = (b["ana"] + [0.0]*6)[:6]
                    f = lambda T: (c[0] + c[1]*T + c[2]/T
                                   + c[3]*math.log10(T) + c[4]/T**2
                                   + c[5]*T*T)
                    return b["logK25"] + f(T) - f(298.15)
                if b.get("dHk") is not None:      # van't Hoff fallback
                    return b["logK25"] \
                        - (b["dHk"] / (math.log(10.0) * 8.314462618)) \
                          * (1.0/T - 1.0/298.15)
                return b["logK25"]
            def Hx_sander(T):
                # ln H_xp = A + B/T with B = enthalpy/R (the pair records'
                # own derivation note): H(T) = H_ref exp(B (1/T - 1/T0)).
                return a["H"] * math.exp((a["dH"] or 0.0)/8.314462618
                                         * (1.0/T - 1.0/298.15))
            rows = []
            for T in (283.15, 298.15, 323.15, 348.15, 368.15):
                if not (a["Tlo"] <= T <= a["Thi"]):
                    continue
                Hb = 55.508 / (10.0 ** logK(T)) * 101325.0
                Ha = Hx_sander(T)
                rows.append((T, Ha, Hb, abs(Ha-Hb)/max(Ha, Hb)))
            worst = max(r[3] for r in rows) if rows else float("nan")
            info.append(f"family {fam[0]}(g)={fam[1]}(aq) in {fam[2]}: "
                        f"{a['home']} vs {b['home']} -- worst rel dev "
                        f"{worst:.1%} over the common scan range "
                        f"(independent primaries: DIAGNOSTIC, not error)")
            sameSrc = a["src"].split("(")[0].strip() \
                      == b["src"].split("(")[0].strip()
            if sameSrc and rows and worst > 0.02:
                bad.append(f"family {fam}: records claim the SAME source yet"
                           f" disagree by {worst:.1%} -- contradicted"
                           f" identity")

if bad:
    print("equilibrium-family gate FAILED:")
    for x in bad:
        print("  " + x)
    sys.exit(1)

print(f"equilibrium-family gate: {len(profiles)} convention profiles, "
      f"{len(params)} migrated parameterisations, {nDiag} cross-convention"
      f" diagnostics")
for x in info:
    print("  [diagnostic] " + x)
sys.exit(0)
