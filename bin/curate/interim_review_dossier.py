#!/usr/bin/env python3
"""D6 primary-review dossier generator (approved 2026-07-26; v2 with the
six ratified corrections of the same date).

Produces the curation-review dossier for Vitor's PRIMARY review of the
GAS-LIQUID EQUILIBRIUM PARAMETERISATIONS (not everything here is a Henry
constant): disjoint coverage categories, typed-identity resolution through
DECLARED mappings only, per-point validity marks with an explicit
presentation tolerance, deviation summaries separated by known validity,
and the pending-review inventory (structured metadata preferred, textual
markers as an announced legacy fallback).

The ratified reading rules are printed into the dossier itself.  NOTHING
here promotes a record: promotion of a pending record is Vitor's
primary-review decision alone, and a record whose `reviewStatus` is
`interim` is not promotable by definition.

Identity resolution (correction 2) uses DECLARED facts only:
  * direct token equality after normalising gas tokens through the
    components' declared `formula` (the gasOf contract);
  * a dissolved COMPONENT token and a dissolved species LABEL are
    equivalent iff the component's declared `aqueousMapping` master
    multiset equals the species' declared `masters` multiset (z = 0)
    in the aqueous formation registry -- the declared stoichiometric
    bridge, never lexical similarity;
  * a dissolved side containing several species ("H+ + HS-") is a
    COMPOSITE/FUSED equilibrium: direct Henry comparison unavailable;
    a future comparison goes through explicit thermodynamic
    decomposition (e.g. chemistry/H2Saq-formation.dat), never labels.

Usage:  interim_review_dossier.py [--write]   (--write saves
        generated/interimReviewDossier.md; default prints to stdout)
"""
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

TEXT_MARKERS = ("INTERIM", "re-citation pending", "re-check pending",
                "primary not stated")

SCAN_T = (273.15, 283.15, 298.15, 323.15, 348.15, 368.15, 373.15)
NEAR_K = 5.0          # PRESENTATION tolerance for the near-boundary label
                      # (the within/outside decision itself is exact)


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


# ---- declared-fact registries ---------------------------------------------
formulaOf, compFacts = {}, {}
for c in sorted((STD / "components").glob("*.dat")):
    t = strip(c.read_text())
    m = re.search(r'^\s*formula\s+(\S+)\s*;', t, re.M)
    if m:
        formulaOf.setdefault(m.group(1), []).append(c.stem)
    spec = re.search(r'\baqueousSpeciation\s+(\S+)\s*;', t)
    amap = re.findall(r'\{\s*species\s+([A-Za-z0-9_]+)\s*;\s*nu\s+(\d+)', t)
    compFacts[c.stem] = dict(
        speciation=(spec.group(1) if spec else None),
        mapping=Counter({s: int(n) for s, n in amap}) if amap else None)
compNames = set(compFacts)

# aqueous formation registry: dissolved LABEL (`ion "..."`) -> (species,
# master multiset, z) -- the declared species side of the bridge.
labelReg = {}
for p in sorted((STD / "chemistry").glob("*.dat")):
    raw = p.read_text()
    if "recordType aqueousSpeciation;" not in raw:
        continue
    t = strip(raw)
    sp = re.search(r'\bspecies\s+([A-Za-z0-9_]+)\s*;', t)
    ion = re.search(r'\bion\s+"([^"]+)"\s*;', t)
    z = re.search(r'\bz\s+(-?\d+)\s*;', t)
    ms = re.findall(r'\{\s*ion\s+([A-Za-z0-9_]+)\s*;\s*nu\s+(\d+)', t)
    if sp and ion:
        labelReg[ion.group(1)] = dict(
            species=sp.group(1),
            masters=Counter({m: int(n) for m, n in ms}),
            z=int(z.group(1)) if z else 0,
            home=f"chemistry/{p.name}")


def normGas(tok):
    if tok in compNames:
        return tok
    owners = formulaOf.get(tok, [])
    return owners[0] if len(owners) == 1 else tok


def resolve_dissolved(tokA, tokB):
    """Compare two dissolved-side identities via DECLARED facts only.
    Returns (verdict, reason): verdict in {equal, equivalent, differ,
    unresolved}."""
    if tokA == tokB:
        return "equal", "identical typed token"
    a, b = sorted((tokA, tokB))
    # component token vs species label: the declared stoichiometric bridge
    for comp, label in ((tokA, tokB), (tokB, tokA)):
        if comp in compNames and label in labelReg:
            mc = compFacts[comp]["mapping"]
            ls = labelReg[label]
            if mc is not None and ls["z"] == 0 and mc == ls["masters"]:
                return "equivalent", (
                    f"typed identities equivalent through declared mapping:"
                    f" component {comp} aqueousMapping"
                    f" {dict(mc)} == species {ls['species']} masters"
                    f" ({ls['home']}), z = 0")
            if mc is not None:
                return "differ", (
                    f"typed identities differ: component {comp} mapping"
                    f" {dict(mc) if mc else None} != species"
                    f" {ls['species']} masters {dict(ls['masters'])}")
            return "unresolved", (
                f"unresolved identity: component {comp} declares no"
                f" aqueousMapping to compare against species label {label}")
    return "unresolved", (f"unresolved identity: no declared mapping links"
                          f" '{a}' and '{b}'")


# ---- gather parameterisations ---------------------------------------------
def route_of(gasComp, dsTok, solvent, home):
    if "+" in dsTok:
        return "composite gas-liquid + aqueous reaction"
    if gasComp == solvent:
        return "condensable solvent vapour equilibrium"
    facts = compFacts.get(gasComp, {})
    if facts.get("speciation") not in (None, "none"):
        return "reactive molecular gas-liquid equilibrium"
    return "Henry / infinite-dilution solute"


hx, ph = [], []
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
    g = normGas(gs.group(1))
    hx.append(dict(gas=g, ds=ds.group(1), sv=sv.group(1),
                   home=f"parameters/Henry/{p.name}",
                   route=route_of(g, ds.group(1), sv.group(1), "hx"),
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
    g = normGas(gs.group(1))
    d = ds.group(1).strip('"')
    ph.append(dict(gas=g, ds=d, sv=sv.group(1),
                   home=f"chemistry/{p.name}",
                   route=route_of(g, d, sv.group(1), "ph"),
                   logK25=float(k25.group(1)) if k25 else None,
                   dHk=float(dH.group(1)) if dH else None,
                   ana=[float(x) for x in ana.group(1).split()] if ana
                       else None,
                   Tlo=None, Thi=None,          # PHREEQC: domain undeclared
                   src=(src.group(1) if src else "?")))

# ---- disjoint family buckets (correction 1 + 2) ---------------------------
# A family is (gas, solvent) resolved at the DISSOLVED level per the rules.
hxBy = {}
for a in hx:
    hxBy.setdefault((a["gas"], a["sv"]), []).append(a)
phBy = {}
for b in ph:
    phBy.setdefault((b["gas"], b["sv"]), []).append(b)

catA, catB, catE = [], [], []          # (a, b, verdict, reason) / reasons
for key in sorted(set(hxBy) & set(phBy)):
    for a in hxBy[key]:
        for b in phBy[key]:
            if "+" in b["ds"]:
                catB.append((a, b, "composite",
                             "composite/fused equilibrium (gas dissolution +"
                             " aqueous reaction in one constant): direct"
                             " Henry comparison unavailable; a future"
                             " comparison requires explicit thermodynamic"
                             " decomposition through the molecular species'"
                             " formation equilibrium, never labels"))
                continue
            verdict, reason = resolve_dissolved(a["ds"], b["ds"])
            if verdict in ("equal", "equivalent"):
                catA.append((a, b, verdict, reason))
            elif verdict == "differ":
                catB.append((a, b, "differ", reason))
            else:
                catE.append((a, b, verdict, reason))
bothKeys = set(hxBy) & set(phBy)
catC = sorted(set(hxBy) - set(phBy))
catD = sorted(set(phBy) - set(hxBy))
famTotal = len(set(hxBy) | set(phBy))


# ---- validity marks (correction 5) ----------------------------------------
def validity_mark(rec, T):
    if rec.get("Tlo") is None:
        return "domain undeclared"
    lo, hi = rec["Tlo"], rec["Thi"]
    if T < lo or T > hi:                       # exact comparison, no rounding
        return "outside"
    if T - lo < NEAR_K:
        return "within (near lower boundary)"
    if hi - T < NEAR_K:
        return "within (near upper boundary)"
    return "within"


def logK(b, T):
    if b["ana"]:
        c = (b["ana"] + [0.0] * 6)[:6]
        f = lambda T: (c[0] + c[1]*T + c[2]/T + c[3]*math.log10(T)
                       + c[4]/T**2 + c[5]*T*T)
        return b["logK25"] + f(T) - f(298.15)
    if b["dHk"] is not None:
        return b["logK25"] - (b["dHk"] / (math.log(10.0) * 8.314462618)) \
                             * (1.0/T - 1.0/298.15)
    return b["logK25"]


def Hx_from_molal(b, T):
    # explicit auxiliaries: 55.508 mol/kg water, ideal gas, 1 atm
    return 55.508 / (10.0 ** logK(b, T)) * 101325.0


def Hx_sander(a, T):
    return a["H"] * math.exp((a["dH"] or 0.0) / 8.314462618
                             * (1.0/T - 1.0/298.15))


# ---- structured review metadata (correction 4) ----------------------------
def review_metadata(raw):
    t = strip(raw)
    st = re.search(r'\breviewStatus\s+(\S+)\s*;', t)
    if not st:
        return None
    rs = re.search(r'\breviewReason\s*\(\s*([^)]*)\)', t)
    ow = re.search(r'\breviewOwner\s+(\S+)\s*;', t)
    return dict(status=st.group(1),
                reasons=rs.group(1).split() if rs else [],
                owner=ow.group(1) if ow else None)


out = []
w = out.append
w("# Gas-liquid equilibrium parameterisations -- primary-review dossier"
  " (D6)")
w("")
w("Generated by `bin/curate/interim_review_dossier.py` -- regenerate, never")
w("hand-edit.  NOTHING in this dossier promotes a record: promotion of a")
w("pending record is Vitor's primary-review decision alone, and a record")
w("whose `reviewStatus` is `interim` is not promotable by definition.")
w("")
w("Reading rules (ratified 2026-07-26): a divergence between INDEPENDENT")
w("primaries is a curation FINDING, not an error; contradicted equivalence")
w("(same source disagreeing) is the only error (gate-enforced); a point")
w("outside a record's declared validity argues nothing about the record")
w("inside its domain; one-within vs one-outside grounds a reasoned")
w("recommendation, never an average; more coefficients is not better --")
w("weigh source, experimental quality, domain, fitted variables, pressure,")
w("temperature, convention, fit purpose, status.")
w("")

# ---- coverage (disjoint) ---------------------------------------------------
w("## Coverage -- disjoint categories")
w("")
w(f"Totals: **{famTotal} unique gas-liquid families** ((gas, solvent) after")
w(f"typed normalisation), **{len(hx) + len(ph)} parameterisations**")
w(f"({len(hx)} H_xp pair records + {len(ph)} network gas-liquid records).")
w("A physical family and a parameterisation are NOT the same count.")
w("")
w(f"* **A. directly comparable** (same typed gas, dissolved identity and"
  f" solvent -- token-equal or equivalent through a declared mapping):"
  f" {len(catA)}")
for a, b, verdict, reason in catA:
    w(f"    * {a['gas']}(g) -> {a['ds']} in {a['sv']}: `{a['home']}` vs"
      f" `{b['home']}`" + (f" -- {reason}" if verdict == "equivalent"
                           else ""))
w(f"* **B. both homes exist, equilibrium identities differ**: {len(catB)}")
for a, b, kind, reason in catB:
    w(f"    * {a['gas']} in {a['sv']}: `{a['home']}` ({a['ds']}) vs"
      f" `{b['home']}` ({b['ds']})")
    w(f"        * {reason}")
w(f"* **C. only the H_xp (Sander-convention) pair**: {len(catC)}")
w(f"* **D. only a PHREEQC/network equilibrium**: {len(catD)}")
for key in catD:
    b = phBy[key][0]
    w(f"    * {b['gas']}(g) -> {b['ds']} in {b['sv']} ({b['route']})")
w(f"* **E. identity unresolved or ambiguous**: {len(catE)}")
for a, b, verdict, reason in catE:
    w(f"    * `{a['home']}` vs `{b['home']}`: {reason}")
w("")
w("Routes represented (a family's physical situation, NOT all 'Henry'):")
routes = Counter(q["route"] for q in hx + ph)
for r, nq in sorted(routes.items()):
    w(f"* {r}: {nq} parameterisation(s)")
w("")

# ---- per-family T-scans ----------------------------------------------------
w("## Cross-convention T-scans (category A families)")
w("")
w("H_xp [Pa]: the Sander pair by its own van't Hoff form; the PHREEQC")
w("molal K(T) converted with the explicit auxiliaries (55.508 mol/kgw,")
w("ideal gas, 1 atm).  Validity marks compare NUMERICALLY against the")
w("declared domain with no hidden rounding (373.15 K is outside a")
w(f"273-373 K Trange); the near-boundary label is a PRESENTATION note")
w(f"within {NEAR_K:.0f} K of a declared endpoint and changes no decision.")
w("`domain undeclared` means exactly that the machine-readable validity")
w("domain is MISSING from the record -- a curation debt, not a licence to")
w("use the correlation everywhere.  The scan below is a **common scan")
w("range**, NOT a common validity domain: no known-valid intersection")
w("exists until the PHREEQC domains are curated.")
w("")
for a, b, verdict, reason in catA:
    w(f"### {a['gas']}(g) = {a['ds']}(aq) in {a['sv']}")
    w("")
    if verdict == "equivalent":
        w(f"*{reason}*")
        w("")
    w(f"* A: `{a['home']}` ({a['route']}) -- {a['src']}")
    dom = (f"{a['Tlo']:.0f}-{a['Thi']:.0f} K" if a.get("Tlo") is not None
           else "UNDECLARED")
    w(f"    * declared validity: {dom}")
    w(f"* B: `{b['home']}` ({b['route']}) -- {b['src']}")
    w(f"    * declared validity: UNDECLARED (curation debt; the literature"
      f" span lives in the source note only)")
    w("")
    w("| T [K] | H_xp A [Pa] | H_xp B [Pa] | rel dev | A validity |"
      " B validity |")
    w("|---|---|---|---|---|---|")
    worstAll = 0.0
    worstValid = None
    nBoth = nOneOut = nUnknown = 0
    for T in SCAN_T:
        Ha, Hb = Hx_sander(a, T), Hx_from_molal(b, T)
        dev = abs(Ha - Hb) / max(Ha, Hb)
        worstAll = max(worstAll, dev)
        mA, mB = validity_mark(a, T), validity_mark(b, T)
        inA = mA.startswith("within")
        if mA == "domain undeclared" or mB == "domain undeclared":
            nUnknown += 1
        elif inA and mB.startswith("within"):
            nBoth += 1
            worstValid = max(worstValid or 0.0, dev)
        else:
            nOneOut += 1
        w(f"| {T:.2f} | {Ha:.4g} | {Hb:.4g} | {dev:.1%} | {mA} | {mB} |")
    w("")
    w(f"* points with BOTH records inside declared domains: {nBoth}")
    w(f"* points with at least one record outside its declared domain:"
      f" {nOneOut}")
    w(f"* points where some domain is undeclared (unknown validity):"
      f" {nUnknown}")
    if worstValid is None:
        w(f"* worst deviation over the known-valid intersection: NOT"
          f" AVAILABLE (no known-valid intersection -- B's domain is"
          f" undeclared)")
    else:
        w(f"* worst deviation over the known-valid intersection:"
          f" {worstValid:.1%}")
    w(f"* worst deviation over the full common scan range: {worstAll:.1%}")
    srcA = a["src"].split("(")[0].strip()
    srcB = b["src"].split("(")[0].strip()
    kind = ("CONTRADICTED EQUIVALENCE (same source) -- ERROR"
            if srcA == srcB and worstAll > 0.02
            else "independent primaries -- curation finding (no automatic"
                 " ranking; recommendation is a reasoned review decision)")
    w(f"* classification: {kind}")
    w("")

# ---- pending-review inventory ---------------------------------------------
w("## Pending-primary-review inventory")
w("")
w("Structured metadata (`reviewStatus` / `reviewReason` / `reviewOwner`)")
w("is PREFERRED; free-text markers (INTERIM, re-citation pending, primary")
w("not stated...) are a legacy fallback, announced as such below.  Records")
w("gain the structured block when they are reviewed or touched -- no")
w("mega-wave.  A record with `reviewStatus interim;` is not promotable.")
w("")
nStruct = nText = 0
for p in sorted(STD.glob("**/*.dat")):
    raw = p.read_text()
    meta = review_metadata(raw)
    hits = []
    for i, line in enumerate(raw.splitlines(), 1):
        if any(pat in line for pat in TEXT_MARKERS):
            hits.append((i, line.strip()))
    if not meta and not hits:
        continue
    if meta:
        nStruct += 1
        w(f"* `{p.relative_to(STD)}` -- **reviewStatus {meta['status']}**"
          + (f", reasons: {', '.join(meta['reasons'])}"
             if meta['reasons'] else "")
          + (f", owner: {meta['owner']}" if meta['owner'] else ""))
    else:
        nText += 1
        w(f"* `{p.relative_to(STD)}` -- *detected by TEXT MARKER only*"
          f" (structured metadata pending)")
    for i, line in hits[:3]:
        w(f"    * L{i}: {line[:150]}")
    if len(hits) > 3:
        w(f"    * ... {len(hits) - 3} more marker line(s)")
w("")
w(f"Totals: {nStruct} record(s) with structured review metadata,"
  f" {nText} detected by text marker only (legacy fallback -- migrate on"
  f" touch/review).")

text = "\n".join(out) + "\n"
if "--write" in sys.argv:
    dst = ROOT / "generated" / "interimReviewDossier.md"
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(text)
    print(f"wrote {dst.relative_to(ROOT)} ({len(text.splitlines())} lines;"
          f" {famTotal} families, {len(hx) + len(ph)} parameterisations;"
          f" A={len(catA)} B={len(catB)} C={len(catC)} D={len(catD)}"
          f" E={len(catE)}; review: {nStruct} structured, {nText}"
          f" text-only)")
else:
    sys.stdout.write(text)
