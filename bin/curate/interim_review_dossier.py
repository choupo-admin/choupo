#!/usr/bin/env python3
"""D6 primary-review dossier generator (approved 2026-07-26).

Produces the curation-review dossier for Vitor's PRIMARY review: every
record carrying an INTERIM / pending-primary marker, the cross-convention
T-scan per comparable gas-liquid family, and the COVERAGE report that keeps
"N families diagnosed" from masquerading as complete coverage.

The ratified reading rules (Vitor, 2026-07-26) are printed into the dossier
itself:
  * a divergence between INDEPENDENT primaries is a CURATION FINDING, not
    an error -- contradicted equivalence (same source disagreeing) is the
    only error, and the families gate already fails on it;
  * every scan point is marked within-validity / boundary / EXTRAPOLATED
    against each record's DECLARED domain (undeclared domains are said so,
    never guessed from free text);
  * one record within validity vs one extrapolated grounds a REASONED
    recommendation -- never an average;
  * a more complex analytic form is not automatically better: selection
    weighs source, experimental quality, domain, fitted variables,
    pressure, temperature, convention, fit purpose, INTERIM status;
  * NOTHING here promotes anything: promotion of an INTERIM record is
    Vitor's primary-review decision alone.

Usage:  interim_review_dossier.py [--write]   (--write saves
        generated/interimReviewDossier.md; default prints to stdout)
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

PENDING_PATTERNS = ("INTERIM", "re-citation pending", "re-check pending",
                    "primary not stated")

SCAN_T = (273.15, 283.15, 298.15, 323.15, 348.15, 368.15, 373.15)
BOUNDARY_K = 5.0


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


# ---- gather parameterisations (same typed-identity reads as the gate) ------
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


hx, ph = [], []          # Sander H_xp pairs; PHREEQC molal records
for p in sorted((STD / "parameters" / "Henry").glob("*.dat")):
    t = strip(p.read_text())
    gs = re.search(r'^\s*gasSpecies\s+(\S+)\s*;', t, re.M)
    ds = re.search(r'^\s*dissolvedSpecies\s+(\S+)\s*;', t, re.M)
    sv = re.search(r'^\s*solvent\s+(\S+)\s*;', t, re.M)
    if not (gs and ds and sv):
        continue
    H = re.search(r'H_ref\s+([\d.eE+-]+)\s*Pa', t)
    dH = re.search(r'enthalpy\s+(-?[\d.eE+-]+)', t)
    Tr = re.search(r'Trange\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)', t)
    src = re.search(r'Reference:\s*([^\n]+)', p.read_text())
    hx.append(dict(fam=(gs.group(1), ds.group(1), sv.group(1)),
                   home=f"parameters/Henry/{p.name}",
                   H=float(H.group(1)) if H else None,
                   dH=float(dH.group(1)) if dH else 0.0,
                   Tlo=float(Tr.group(1)) if Tr else None,
                   Thi=float(Tr.group(2)) if Tr else None,
                   src=(src.group(1).strip() if src else "see record")))
for p in sorted((STD / "chemistry").glob("*.dat")):
    raw = p.read_text()
    if "recordType gasLiquidEquilibrium;" not in raw:
        continue
    t = strip(raw)
    gs = re.search(r'\bgasSpecies\s+(\S+)\s*;', t)
    ds = re.search(r'\bdissolvedSpecies\s+("[^"]+"|\S+)\s*;', t)
    sv = re.search(r'^\s*solvent\s+(\S+)\s*;', t, re.M)
    if not (gs and ds and sv):
        continue
    k25 = re.search(r'logK25\s+(-?[\d.eE+-]+)', t)
    dH = re.search(r'\bdH\s+(-?[\d.eE+-]+)\s*;', t)
    ana = re.search(r'analytic\s*\(\s*([^)]*)\)', t)
    src = re.search(r'source\s+"([^"]+)"', t)
    ph.append(dict(fam=(normGas(gs.group(1)), ds.group(1).strip('"'),
                        sv.group(1)),
                   home=f"chemistry/{p.name}",
                   logK25=float(k25.group(1)) if k25 else None,
                   dH=float(dH.group(1)) if dH else None,
                   ana=[float(x) for x in ana.group(1).split()] if ana
                       else None,
                   src=(src.group(1) if src else "?")))


def logK(b, T):
    if b["ana"]:
        c = (b["ana"] + [0.0] * 6)[:6]
        f = lambda T: (c[0] + c[1]*T + c[2]/T + c[3]*math.log10(T)
                       + c[4]/T**2 + c[5]*T*T)
        return b["logK25"] + f(T) - f(298.15)
    if b["dH"] is not None:
        return b["logK25"] - (b["dH"] / (math.log(10.0) * 8.314462618)) \
                             * (1.0/T - 1.0/298.15)
    return b["logK25"]


def Hx_from_molal(b, T):
    # explicit auxiliaries: 55.508 mol/kg water, ideal gas, 1 atm reference
    return 55.508 / (10.0 ** logK(b, T)) * 101325.0


def Hx_sander(a, T):
    return a["H"] * math.exp((a["dH"] or 0.0) / 8.314462618
                             * (1.0/T - 1.0/298.15))


def validity_mark(rec, T):
    if rec.get("Tlo") is None:
        return "domain UNDECLARED"
    lo, hi = rec["Tlo"], rec["Thi"]
    if T < lo or T > hi:
        return "EXTRAPOLATED"
    if T - lo < BOUNDARY_K or hi - T < BOUNDARY_K:
        return "boundary"
    return "within"


out = []
w = out.append
w("# INTERIM / primary-review dossier (D6)")
w("")
w("Generated by `bin/curate/interim_review_dossier.py` -- regenerate, never")
w("hand-edit.  NOTHING in this dossier promotes a record: promotion of an")
w("INTERIM/pending record is Vitor's primary-review decision alone.")
w("")
w("Reading rules (ratified 2026-07-26): a divergence between INDEPENDENT")
w("primaries is a curation FINDING, not an error; contradicted equivalence")
w("(same source disagreeing) is the only error (gate-enforced); a point")
w("outside a record's declared validity is EXTRAPOLATED and argues nothing")
w("about the record inside its domain; one-within vs one-extrapolated")
w("grounds a reasoned recommendation, never an average; more coefficients")
w("is not better -- weigh source, experimental quality, domain, fitted")
w("variables, pressure, temperature, convention, fit purpose, status.")
w("")

# ---- coverage report -------------------------------------------------------
w("## Coverage of the gas-liquid families")
w("")
w("The cross-convention diagnostic only sees the INTERSECTION of the two")
w("homes -- this table is what keeps that intersection from being mistaken")
w("for complete coverage.")
w("")
hxFams = {a["fam"]: a for a in hx}
phFams = {b["fam"]: b for b in ph}
both = sorted(set(hxFams) & set(phFams))
onlyHx = sorted(set(hxFams) - set(phFams))
onlyPh = sorted(set(phFams) - set(hxFams))

# identity-nonmatching: same normalised GAS but different dissolved token
gasHx = {}
for a in hx:
    gasHx.setdefault((a["fam"][0], a["fam"][2]), []).append(a)
mismatched = []
for b in ph:
    key = (b["fam"][0], b["fam"][2])
    for a in gasHx.get(key, []):
        if a["fam"] != b["fam"]:
            mismatched.append((a, b))

w(f"* families with BOTH parameterisations (directly comparable): "
  f"{len(both)}")
for f in both:
    w(f"    * {f[0]}(g) = {f[1]}(aq) in {f[2]}")
w(f"* families with only the H_xp (Sander-convention) pair: {len(onlyHx)}")
w(f"* families with only the PHREEQC molal record: "
  f"{len(onlyPh)}")
for f in onlyPh:
    w(f"    * {f[0]}(g) = {f[1]}(aq) in {f[2]}")
w(f"* same gas, NON-matching dissolved identity across homes (a curation"
  f" finding, no direct comparison): {len(mismatched)}")
for a, b in mismatched:
    w(f"    * {a['home']} ({a['fam'][1]}) vs {b['home']} ({b['fam'][1]})"
      f" -- different dissolved species (e.g. composite/fused or"
      f" label-level mismatch)")
w("")

# ---- per-family T-scans ----------------------------------------------------
w("## Cross-convention T-scans (comparable families)")
w("")
w("H_xp [Pa]: Sander pair evaluated by its van't Hoff form; PHREEQC molal")
w("K(T) converted with the explicit auxiliaries (55.508 mol/kgw, ideal gas,")
w("1 atm).  Validity marks are against DECLARED domains only; the PHREEQC")
w("analytic records declare no Trange (their literature span lives in the")
w("source note) -- marked `domain UNDECLARED`, never guessed.")
w("")
for f in both:
    a, b = hxFams[f], phFams[f]
    w(f"### {f[0]}(g) = {f[1]}(aq) in {f[2]}")
    w("")
    w(f"* A: `{a['home']}` -- {a['src']}")
    dom = (f"{a['Tlo']:.0f}-{a['Thi']:.0f} K" if a.get("Tlo") is not None
           else "UNDECLARED")
    w(f"    * declared validity: {dom}")
    w(f"* B: `{b['home']}` -- {b['src']}")
    w(f"    * declared validity: UNDECLARED (analytic; see source note)")
    w("")
    w("| T [K] | H_xp A [Pa] | H_xp B [Pa] | rel dev | A validity |"
      " B validity |")
    w("|---|---|---|---|---|---|")
    worst = 0.0
    for T in SCAN_T:
        Ha, Hb = Hx_sander(a, T), Hx_from_molal(b, T)
        dev = abs(Ha - Hb) / max(Ha, Hb)
        worst = max(worst, dev)
        w(f"| {T:.2f} | {Ha:.4g} | {Hb:.4g} | {dev:.1%} |"
          f" {validity_mark(a, T)} | domain UNDECLARED |")
    w("")
    srcA = a["src"].split("(")[0].strip()
    srcB = b["src"].split("(")[0].strip()
    kind = ("CONTRADICTED EQUIVALENCE (same source) -- ERROR"
            if srcA == srcB and worst > 0.02
            else "independent primaries -- curation finding")
    w(f"* classification: {kind}; worst deviation {worst:.1%} over the scan")
    w("")

# ---- INTERIM / pending inventory ------------------------------------------
w("## INTERIM / pending-primary inventory")
w("")
w("Every standards record carrying an explicit pending-review marker")
w("(INTERIM, re-citation/re-check pending, primary not stated).  Promotion")
w("requires Vitor's primary review of the cited source -- no exceptions.")
w("")
n = 0
for p in sorted(STD.glob("**/*.dat")):
    raw = p.read_text()
    hits = []
    for i, line in enumerate(raw.splitlines(), 1):
        if any(pat in line for pat in PENDING_PATTERNS):
            hits.append((i, line.strip()))
    if not hits:
        continue
    n += 1
    w(f"* `{p.relative_to(STD)}`")
    for i, line in hits[:4]:
        w(f"    * L{i}: {line[:150]}")
    if len(hits) > 4:
        w(f"    * ... {len(hits) - 4} more marker line(s)")
w("")
w(f"Total: {n} records with pending-review markers.")

text = "\n".join(out) + "\n"
if "--write" in sys.argv:
    dst = ROOT / "generated" / "interimReviewDossier.md"
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(text)
    print(f"wrote {dst.relative_to(ROOT)} ({len(text.splitlines())} lines,"
          f" {len(both)} comparable families, {n} pending records)")
else:
    sys.stdout.write(text)
