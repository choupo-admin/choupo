#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Henry's-law constants of gases and volatile solutes in ORGANIC solvents,
regressed from ThermoML measurements (DEV.md 4c C321 part 2).

    bin/curate/henry_organic.py census            the archive's non-water blocks, counted
    bin/curate/henry_organic.py declare [--write] one curation case per fittable pair
    bin/curate/henry_organic.py fetch <case>      regenerate the case's measured series
    bin/curate/henry_organic.py fit <case> [--write]
                                                  fit, grade, and (with --write) record

WHERE THE DATA COME FROM.  The NIST/TRC ThermoML Archive (doi
10.18434/mds2-2422) LOCATES the measurements; each value belongs to the
article it was published in, cited by DOI in the record.  NO MEASURED POINT
IS COMMITTED (C282): a case declares each dataset by DOI, NIST URL, article
sha256, block and extract sha256 in `constant/henryArchiveDatasets`, and
`fetch` writes the points into constant/archiveExtracts/ (gitignored) from
the local cache ($CHOUPO_THERMOML_HOME, else thirdParty/thermoml) or the
NIST per-article URL, checking both sums.  The file is NOT named
`archiveDatasets`, because `bin/choupo-curate fetch` -- which bin/runTests
calls on every case carrying that file -- has no Henry extractor (it reads
bubble points and vapour pressures); see DEV.md 4c "C321 part 2 RESULT".

THE CENSUS.  Every two-compound, gas+liquid block of the archive's
vleIndex.json whose measured property is a Henry constant (mole-fraction,
molality or concentration scale), an Ostwald or Bunsen coefficient, an
activity coefficient at infinite dilution (a `Mole fraction` constraint of
0) or a liquid mole fraction of a gas (a solubility), with NEITHER compound
water (water is C321 part 1, Sander 2015).  Compounds are joined to the
catalogue by InChIKey through identity.json (never by name).  Only the
mole-fraction-scale Henry constant is FITTED: every other kind is counted
and refused by name, because turning it into H_xp needs a quantity the
measurement does not carry (the solvent's molar mass and density for the
molality and concentration scales and the Ostwald coefficient, the solute's
vapour pressure for gamma-infinity, the vapour composition for a
solubility) -- a derived number, not a measured one.

THE CLASS (C321 part 2, stated defaults).  The SOLUTE is the compound the
block's Henry property names (its RegNum).  It qualifies if its record
declares `role solute;`, or it is a gas at the block's upper temperature
(T_max above its normal boiling point Tb) or supercritical there (T_max
above Tc).  The SOLVENT is the other compound; it qualifies if it is a
liquid at every data temperature under its own vapour pressure (T below
its Tc) and less volatile than the solute (its Tb above the solute's).
Melting points are not checked: the catalogue carries almost none.
Acetic acid is ARCHIVED (DEV.md 4c, 2026-11-10) and excluded on either side.

THE FIT (C283 amended, C285, C300).  Per pair, EVERY laboratory together:
    ln H(T) = ln H_ref + (enthalpy / R) * (1/T - 1/T_ref),  T_ref = 298.15 K
the van't Hoff form the loader reads (src/thermo/henrysLaw/HenrysLaw.cpp,
`vantHoff`).  Stage 1, least squares on the relative residual
r = H_model/H - 1 (equal weights); a point with |r| > 20 % is DISCARDED BY
NAME (doi, block, T) and stage 1 repeated without it.  Stage 2, minimax on
the same residual over the kept points, started from stage 1; its
coefficients are the record's.  GRADE on max |r| over the kept points:
<= 10 % clean, (10, 20] warning, (20, 30] severe, > 30 % refused -- the
limits of property class (B), Henry constants (DEV.md 4c C336; class (A),
5 / 10 / 20 %, was used until C336).  An
in-sample clean resting on one laboratory is capped at warning with
`fitGradeCap ( singleLaboratory );` (C300 rule 2).  A pair whose kept points
lie at ONE temperature cannot give the enthalpy, and the loader refuses a
Henry record without one: such a pair is REFUSED, never given an invented
enthalpy.  clean and warning are promoted into data/standards/parameters/
Henry/ (`reviewStatus autoPromoted; review { by none; }`), and so is a severe
one, voiced as severe (Vitor's ruling of 2026-11-12, C285 over C300 rule 3:
"com 19 % ainda pode ficar; so acima de 20 % e que nao"; C336 class (B):
only above 30 % is refused); refused writes
nothing.  An existing record for the same (solute, solvent) is never
overwritten.
"""
import hashlib
import json
import math
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
HENRY = ROOT / "data" / "standards" / "parameters" / "Henry"
CASES = ROOT / "data" / "curation" / "henry"
DECL = "constant/henryArchiveDatasets"
R = 8.314462618
TREF = 298.15
WATER_KEY = "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
ARCHIVED = ("aceticAcid",)
OUTLIER = 0.20
#  DEV.md 4c C336, property class (B) -- Henry constants, gamma-infinity,
#  transport: laboratories disagree by 10-30 % on these.  Max relative error
#  over the kept points, %: clean / warning / severe; above the last, refused.
HENRY_CLASS_B_LIMITS = (10.0, 20.0, 30.0)
LIMITS = HENRY_CLASS_B_LIMITS
NIST = "https://trc.nist.gov/ThermoML/"

KINDS = {
    "Henry's Law constant (mole fraction scale), kPa": "henryX",
    "Henry's Law constant (molality scale), kPa*kg/mol": "henryM",
    "Henry's Law constant (amount concentration scale), kPa*dm3/mol": "henryC",
    "Ostwald coefficient": "ostwald",
    "Bunsen coefficient": "bunsen",
}
WHY_NOT_FITTED = {
    "henryM": "molality-scale Henry constant: H_xp needs the solvent's molar mass, not converted",
    "henryC": "concentration-scale Henry constant: H_xp needs the solvent's molar density, not converted",
    "ostwald": "Ostwald coefficient: H_xp needs the solvent's molar density, not converted",
    "bunsen": "Bunsen coefficient: H_xp needs the solvent's molar density, not converted",
    "gammaInf": "activity coefficient at infinite dilution: H = gamma * Psat would rest on the "
                "solute's vapour-pressure record, a derived value, not a measured H",
    "solubility": "liquid composition measured at a stated (T, P) -- a gas solubility or a VLE "
                  "isotherm: H needs the vapour composition and fugacity at infinite dilution, "
                  "not reduced",
}


# ---------------------------------------------------------------- the cache
def cache_root():
    env = os.environ.get("CHOUPO_THERMOML_HOME")
    if env:
        return Path(env)
    d = ROOT / "thirdParty" / "thermoml"
    if not (d / "vleIndex.json").exists() and (d / "thermoml" / "vleIndex.json").exists():
        return d / "thermoml"
    return d


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(p):
    return sha_bytes(Path(p).read_bytes())


def loc(tag):
    return tag.rsplit("}", 1)[-1]


def txt(e, name, default=""):
    for x in e.iter():
        if loc(x.tag) == name and x.text and x.text.strip():
            return x.text.strip()
    return default


def all_(e, name):
    return [x for x in e.iter() if loc(x.tag) == name]


# ---------------------------------------------------------- catalogue facts
def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//.*$", "", t, flags=re.M)


def comp_facts(name):
    f = COMP / (name + ".dat")
    if not f.exists():
        return None
    t = strip(f.read_text())

    def num(k):
        m = re.search(r"^\s*" + k + r"\s+([-0-9.eE+]+)\s*;", t, re.M)
        return float(m.group(1)) if m else None
    role = re.search(r"^\s*role\s+(\S+)\s*;", t, re.M)
    cas = re.search(r"^\s*CAS\s+(\S+)\s*;", t, re.M)
    return {"Tc": num("Tc"), "Tb": num("Tb"), "role": role.group(1) if role else None,
            "CAS": cas.group(1) if cas else None}


def identity():
    d = json.loads((cache_root() / "identity.json").read_text())
    by = {}
    for r in d["records"]:
        if r.get("status") == "resolved":
            by[r["inchiKey"]] = r
    return by


# ---------------------------------------------------------- block reading
_ROOTS = {}


def parsed(xml_path):
    """One parse per article file (a census reads thousands of blocks)."""
    key = str(xml_path)
    if key not in _ROOTS:
        if len(_ROOTS) > 64:
            _ROOTS.clear()
        _ROOTS[key] = ET.parse(xml_path).getroot()
    return _ROOTS[key]


def read_block(xml_path, block):
    """The facts of ONE PureOrMixtureData block: members (orgnum -> compound),
    properties (name, phase, number, orgnum), variables, constraints, rows,
    and the article's citation."""
    root = parsed(xml_path)
    comps = {}
    for c in all_(root, "Compound"):
        comps[txt(c, "nOrgNum")] = {"name": txt(c, "sCommonName"),
                                    "inchiKey": txt(c, "sStandardInChIKey")}
    cite = {"doi": txt(root, "sDOI"), "year": txt(root, "yrPubYr"),
            "journal": txt(root, "sPubName"), "title": txt(root, "sTitle"),
            "authors": [(x.text or "").strip() for x in all_(root, "sAuthor")],
            "vol": txt(root, "sVol"), "page": txt(root, "sPage")}
    poms = all_(root, "PureOrMixtureData")
    pom = poms[block]
    members = [txt(c, "nOrgNum") for c in pom if loc(c.tag) == "Component"]
    props = []
    for p in pom:
        if loc(p.tag) != "Property":
            continue
        org = ""
        for rn in all_(p, "RegNum"):
            org = txt(rn, "nOrgNum")
        props.append({"name": txt(p, "ePropName"), "phase": txt(p, "ePropPhase"),
                      "num": txt(p, "nPropNumber"), "org": org})
    variables = []
    for v in pom:
        if loc(v.tag) != "Variable":
            continue
        name = ""
        for e in v.iter():
            if loc(e.tag).startswith("e") and loc(e.tag) != "eVarPhase" and e.text and e.text.strip():
                name = e.text.strip()
        variables.append({"name": name, "num": txt(v, "nVarNumber"), "phase": txt(v, "eVarPhase")})
    constraints = []
    for c in pom:
        if loc(c.tag) != "Constraint":
            continue
        name = ""
        for e in c.iter():
            if loc(e.tag).startswith("e") and loc(e.tag) != "eConstraintPhase" and e.text and e.text.strip():
                name = e.text.strip()
        constraints.append({"name": name, "value": txt(c, "nConstraintValue")})
    rows = []
    for nv in pom:
        if loc(nv.tag) != "NumValues":
            continue
        r = {"var": {}, "prop": {}, "U": {}}
        for vv in all_(nv, "VariableValue"):
            r["var"][txt(vv, "nVarNumber")] = txt(vv, "nVarValue")
        for pv in all_(nv, "PropertyValue"):
            k = txt(pv, "nPropNumber")
            r["prop"][k] = txt(pv, "nPropValue")
            u = txt(pv, "nCombExpandUncertValue") or txt(pv, "nStdUncertValue")
            if u:
                r["U"][k] = u
        rows.append(r)
    return {"comps": comps, "members": members, "props": props, "variables": variables,
            "constraints": constraints, "rows": rows, "cite": cite}


def kind_of(b):
    """(kind, orgnum of the solute) of a block, or (None, None)."""
    names = [p["name"] for p in b["props"]]
    for p in b["props"]:
        if p["name"] in KINDS:
            return KINDS[p["name"]], p["org"]
    if names and all(n == "Activity coefficient" for n in names):
        for c in b["constraints"]:
            if c["name"] == "Mole fraction" and c["value"] and float(c["value"]) == 0.0:
                return "gammaInf", b["props"][0]["org"]
        return None, None
    if any(p["name"] == "Mole fraction" and p["phase"] == "Liquid" for p in b["props"]) and \
            any(v["name"].startswith(("Pressure", "Partial pressure")) for v in b["variables"]):
        return "solubility", None
    return None, None


def henry_points(b):
    """[(T_K, H_kPa, U_kPa)] of a mole-fraction-scale Henry block; T from a
    temperature variable or constraint."""
    pn = next(p["num"] for p in b["props"] if KINDS.get(p["name"]) == "henryX")
    tv = [v["num"] for v in b["variables"] if v["name"].startswith("Temperature")]
    tc = [c["value"] for c in b["constraints"] if c["name"].startswith("Temperature")]
    out = []
    for r in b["rows"]:
        T = r["var"].get(tv[0]) if tv else (tc[0] if tc else None)
        H = r["prop"].get(pn)
        if T is None or H is None:
            continue
        out.append((T, H, r["U"].get(pn, "")))
    return out


# ------------------------------------------------------------------ census
def census(verbose=True):
    """(records, counts): every non-water candidate block with its fate."""
    idx = json.loads((cache_root() / "vleIndex.json").read_text())
    ident = identity()
    cand = []
    for blk in idx["blocks"]:
        props = {p[0] for p in blk["properties"]}
        maybe = bool(props & set(KINDS)) or blk["geometry"] == "activityCoefficient" or \
            (("Mole fraction", "Liquid") in {tuple(p) for p in blk["properties"]}
             and any(v[0].startswith(("Pressure", "Partial pressure")) for v in blk["variables"]))
        if not maybe or len(blk["compounds"]) != 2:
            continue
        if any(c.get("inchiKey") == WATER_KEY for c in blk["compounds"]):
            continue
        cand.append(blk)
    out = []
    cand.sort(key=lambda x: (x['file'], x['block']))
    for blk in cand:
        f = cache_root() / blk["file"]
        try:
            b = read_block(f, blk["block"])
        except Exception as ex:  # noqa: BLE001
            out.append({"blk": blk, "kind": None, "fate": "unreadable", "why": str(ex)})
            continue
        kind, org = kind_of(b)
        if kind is None:
            continue
        rec = {"blk": blk, "b": b, "kind": kind, "doi": blk["doi"], "block": blk["block"],
               "file": blk["file"]}
        names = {}
        for o in b["members"]:
            k = b["comps"].get(o, {}).get("inchiKey", "")
            names[o] = ident[k]["component"] if k in ident else None
        rec["names"] = names
        if any(v is None for v in names.values()):
            rec["fate"], rec["why"] = "refused", "a compound is not in the catalogue (no InChIKey join)"
        elif kind != "henryX":
            rec["fate"], rec["why"] = "refused", WHY_NOT_FITTED[kind]
        else:
            solute = names.get(org)
            solvent = [v for o, v in names.items() if o != org]
            if solute is None or len(solvent) != 1:
                rec["fate"], rec["why"] = "refused", "the Henry property names no solute of the block"
            else:
                rec["solute"], rec["solvent"] = solute, solvent[0]
                rec["fate"], rec["why"] = classify(rec, b)
        out.append(rec)
    counts = {}
    for r in out:
        counts.setdefault(r["kind"], {}).setdefault((r["fate"], r["why"]), 0)
        counts[r["kind"]][(r["fate"], r["why"])] += 1
    if verbose:
        print(f"henry_organic census: {len(out)} non-water blocks of a Henry, Ostwald, Bunsen, "
              f"gamma-infinity or gas-solubility kind (cache {cache_root()})")
        for k in sorted(counts):
            tot = sum(counts[k].values())
            print(f"  {k}: {tot} block(s)")
            for (fate, why), n in sorted(counts[k].items(), key=lambda x: -x[1]):
                print(f"      {n:4d}  {fate}: {why}")
    return out, counts


def classify(rec, b):
    s, v = rec["solute"], rec["solvent"]
    if s in ARCHIVED or v in ARCHIVED:
        return "refused", "acetic acid is archived (DEV.md 4c, 2026-11-10)"
    pts = henry_points(b)
    if not pts:
        return "refused", "no (T, H) row"
    if any(not u for _, _, u in pts):
        return "refused", "no stated uncertainty on every point"
    Ts = [float(t) for t, _, _ in pts]
    fs, fv = comp_facts(s), comp_facts(v)
    if fs is None or fv is None:
        return "refused", "a catalogue record is missing"
    if not (fs["role"] == "solute" or (fs["Tb"] is not None and max(Ts) > fs["Tb"])
            or (fs["Tc"] is not None and max(Ts) > fs["Tc"])):
        return "refused", "class: the solute is a liquid over the whole range (T_max below its Tb)"
    if fv["Tc"] is None or max(Ts) >= fv["Tc"]:
        return "refused", "class: the solvent is not a liquid at every data temperature (T >= its Tc)"
    if fv["Tb"] is None or fs["Tb"] is None or fv["Tb"] <= fs["Tb"]:
        return "refused", "class: the solvent is not less volatile than the solute (Tb)"
    return "candidate", "mole-fraction Henry constant, both in the catalogue, class met"


def pairs_from(out):
    pairs = {}
    for r in out:
        if r["fate"] == "candidate":
            pairs.setdefault((r["solute"], r["solvent"]), []).append(r)
    return pairs


# --------------------------------------------------------------------- fit
def model_lnH(p, T):
    return p[0] + p[1] * (1.0 / T - 1.0 / TREF)


def rel(p, pts):
    return [math.exp(model_lnH(p, T) - math.log(H)) - 1.0 for T, H in pts]


def least_squares(pts):
    """Gauss-Newton on r_i = H_model/H_i - 1, started from the linear
    regression of ln H on (1/T - 1/T_ref)."""
    xs = [1.0 / T - 1.0 / TREF for T, _ in pts]
    ys = [math.log(H) for _, H in pts]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    p = [my - b * mx, b]
    for _ in range(100):
        r = rel(p, pts)
        J = [((1 + ri), (1 + ri) * x) for ri, x in zip(r, xs)]
        a11 = sum(j[0] * j[0] for j in J)
        a12 = sum(j[0] * j[1] for j in J)
        a22 = sum(j[1] * j[1] for j in J)
        g1 = sum(j[0] * ri for j, ri in zip(J, r))
        g2 = sum(j[1] * ri for j, ri in zip(J, r))
        det = a11 * a22 - a12 * a12
        d0 = -(a22 * g1 - a12 * g2) / det
        d1 = -(-a12 * g1 + a11 * g2) / det
        p = [p[0] + d0, p[1] + d1]
        if abs(d0) < 1e-14 and abs(d1) < 1e-10:
            break
    return p


def maxabs(p, pts):
    return max(abs(x) for x in rel(p, pts))


def minimax(p0, pts):
    """Nelder-Mead on max |r|, three restarts from the stage-1 answer; the
    result is never worse than the start."""
    def f(p):
        return maxabs(p, pts)
    best = list(p0)
    for _ in range(3):
        simplex = [best, [best[0] + 0.02, best[1]], [best[0], best[1] + 0.02 * max(1.0, abs(best[1]))]]
        vals = [f(s) for s in simplex]
        for _it in range(4000):
            order = sorted(range(3), key=lambda i: vals[i])
            simplex = [simplex[i] for i in order]
            vals = [vals[i] for i in order]
            if abs(vals[2] - vals[0]) < 1e-15 and max(abs(simplex[2][k] - simplex[0][k]) for k in (0, 1)) < 1e-12:
                break
            c = [(simplex[0][k] + simplex[1][k]) / 2 for k in (0, 1)]
            xr = [c[k] + (c[k] - simplex[2][k]) for k in (0, 1)]
            fr = f(xr)
            if fr < vals[0]:
                xe = [c[k] + 2 * (c[k] - simplex[2][k]) for k in (0, 1)]
                fe = f(xe)
                simplex[2], vals[2] = (xe, fe) if fe < fr else (xr, fr)
            elif fr < vals[1]:
                simplex[2], vals[2] = xr, fr
            else:
                xc = [c[k] + 0.5 * (simplex[2][k] - c[k]) for k in (0, 1)]
                fc = f(xc)
                if fc < vals[2]:
                    simplex[2], vals[2] = xc, fc
                else:
                    for i in (1, 2):
                        simplex[i] = [simplex[0][k] + 0.5 * (simplex[i][k] - simplex[0][k]) for k in (0, 1)]
                        vals[i] = f(simplex[i])
        i0 = min(range(3), key=lambda i: vals[i])
        if vals[i0] < f(best):
            best = simplex[i0]
    return best


def grade_of(mx_pct):
    if mx_pct <= LIMITS[0]:
        return "clean"
    if mx_pct <= LIMITS[1]:
        return "warning"
    if mx_pct <= LIMITS[2]:
        return "severe"
    return "refused"


def fit_points(series):
    """series: [(doi, block, [(T_str, H_str, U_str)])].  Returns the result
    dict; pure function of its input."""
    pts = []
    for doi, block, rows in series:
        for T, H, _U in rows:
            pts.append((doi, block, float(T), float(H) * 1e3))      # kPa -> Pa
    temps = {round(T, 6) for _, _, T, _ in pts}
    res = {"n": len(pts), "labs": len({d for d, _, _, _ in pts})}
    if len(temps) < 2:
        res.update(grade="refused", why="one temperature: the enthalpy cannot be fitted, and the "
                   "loader refuses a Henry record without one", discarded=[], kept=pts)
        return res
    p1 = least_squares([(T, H) for _, _, T, H in pts])
    r1 = rel(p1, [(T, H) for _, _, T, H in pts])
    #  ONE LABORATORY, NO OUTLIER (C321 part 2 amended, the commander's rule
    #  of 2026-11-12): a point is an outlier only against ANOTHER laboratory.
    #  Discarding points of a single series tailors the data to the model, so
    #  a one-laboratory pair keeps every point and is graded on its real error.
    multi = len({d for d, _, _, _ in pts}) >= 2
    discarded = [(d, b, T, ri) for (d, b, T, H), ri in zip(pts, r1)
                 if multi and abs(ri) > OUTLIER]
    kept = [q for q, ri in zip(pts, r1) if not (multi and abs(ri) > OUTLIER)]
    ktemps = {round(T, 6) for _, _, T, _ in kept}
    res.update(discarded=discarded, kept=kept, lsInitial=p1)
    if len(ktemps) < 2:
        res.update(grade="refused", why="the kept points lie at one temperature after the "
                   "outlier discard: no enthalpy")
        return res
    kp = [(T, H) for _, _, T, H in kept]
    p2 = least_squares(kp) if discarded else p1
    p3 = minimax(p2, kp)
    mx = 100.0 * maxabs(p3, kp)
    g = grade_of(mx)
    labs = len({d for d, _, _, _ in kept})
    caps = ["singleLaboratory"] if (g == "clean" and labs < 2) else []
    res.update(ls=p2, p=p3, maxRel_pct=mx, lsMaxRel_pct=100.0 * maxabs(p2, kp),
               grade_in=g, grade=("warning" if caps else g), caps=caps,
               labsKept=labs, Tmin=min(T for T, _ in kp), Tmax=max(T for T, _ in kp),
               why=("" if g != "refused" else f"max relative error {mx:.2f} % above {LIMITS[2]:g} %"))
    return res


def coefficients(res):
    """(H_ref [Pa], enthalpy [J/mol]) as the record writes them."""
    p = res["p"]
    return float(f"{math.exp(p[0]):.5e}"), round(p[1] * R)


# ------------------------------------------------------------ the cases
def slug(doi):
    return doi.split("/", 1)[1].replace("/", "_")


def extract_text(solute, solvent, doi, block, pts):
    lines = [f"# Henry's-law constant (mole fraction scale) of {solute} in {solvent}",
             f"# doi {doi}, ThermoML block {block}; values as the archive prints them",
             "# T_K  H_kPa  U_kPa (combined expanded uncertainty)"]
    for T, H, U in pts:
        lines.append(f"{T}\t{H}\t{U}")
    return "\n".join(lines) + "\n"


def extract_name(solute, solvent, doi, block):
    return f"constant/archiveExtracts/{solute}-{solvent}-henry-{slug(doi)}-b{block}.dat"


def case_dir(solute, solvent):
    return CASES / f"{solute}-{solvent}"


def parse_decl(case):
    t = (case / DECL).read_text()
    out = []
    for m in re.finditer(r"\{\s*(file\s.*?)\n    \}", t, re.S):
        d = m.group(1)

        def w(k):
            mm = re.search(r"\b" + k + r"\s+\"?([^\";]+)\"?\s*;", d)
            return mm.group(1).strip() if mm else None
        out.append({k: w(k) for k in ("file", "doi", "url", "articleFile", "articleSha256",
                                      "block", "sha256", "role", "extractor")})
    sol = re.search(r"^solute\s+(\S+);", t, re.M).group(1)
    sv = re.search(r"^solvent\s+(\S+);", t, re.M).group(1)
    return sol, sv, out


_DOWNLOADED = {}


def fetch(case, quiet=False):
    """0 = every extract present and verified; 1 = refused; 2 = NOT RUN."""
    sol, sv, decl = parse_decl(case)
    for d in decl:
        dest = case / d["file"]
        if dest.exists() and sha_file(dest) == d["sha256"]:
            continue
        src = cache_root() / (d["doi"] + ".xml")
        if src.exists():
            data = src.read_bytes()
        elif d["url"] in _DOWNLOADED:
            data = _DOWNLOADED[d["url"]]
            src = None
        else:
            try:
                #  A generic client name (NIST refuses the library's default
                #  agent); one download per article per process.
                req = urllib.request.Request(d["url"], headers={"User-Agent": "choupo-curate"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                _DOWNLOADED[d["url"]] = data
            except Exception as ex:  # noqa: BLE001
                print(f"henry_organic fetch: NOT RUN -- NIST ThermoML unreachable for doi "
                      f"{d['doi']} ({ex}) and the archive cache does not hold it")
                return 2
            src = None
        if sha_bytes(data) != d["articleSha256"]:
            print(f"henry_organic fetch: REFUSED -- the article file of doi {d['doi']} is not the "
                  f"file the case declares (sha256 {sha_bytes(data)} != {d['articleSha256']})")
            return 1
        if src is None:
            tmp = case / "constant" / "archiveExtracts" / ("." + d["articleFile"])
            tmp.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_bytes(data)
            src = tmp
        b = read_block(src, int(d["block"]))
        text = extract_text(sol, sv, d["doi"], d["block"], henry_points(b))
        if sha_bytes(text.encode()) != d["sha256"]:
            print(f"henry_organic fetch: REFUSED -- the extract of doi {d['doi']} block "
                  f"{d['block']} does not match its declared sha256")
            return 1
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)
        if src.name.startswith("."):
            src.unlink()
    if not quiet:
        print(f"henry_organic fetch: {case.relative_to(ROOT)}: {len(decl)} dataset(s) verified")
    return 0


def read_series(case):
    sol, sv, decl = parse_decl(case)
    series = []
    for d in decl:
        rows = []
        for ln in (case / d["file"]).read_text().splitlines():
            if ln.startswith("#") or not ln.strip():
                continue
            rows.append(tuple(ln.split("\t")))
        series.append((d["doi"], int(d["block"]), rows))
    return sol, sv, decl, series


HEAD = """/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
"""


def cite_line(c):
    au = "; ".join(c["authors"][:3]) + (" et al." if len(c["authors"]) > 3 else "")
    return f"{au} ({c['year']}) {c['journal']} {c['vol']}, {c['page']}, doi:{c['doi']}"


def declare(write):
    out, counts = census(verbose=False)
    pairs = pairs_from(out)
    made = 0
    for (s, v), recs in sorted(pairs.items()):
        case = case_dir(s, v)
        if (case / DECL).exists():
            continue                    # declared already: a declaration is never rewritten
        if list(HENRY.glob(f"{s}-{v}.dat")):
            print(f"  {s}-{v}: a catalogue record already exists -- not declared")
            continue
        ds, studies = [], []
        for r in sorted(recs, key=lambda r: (r["doi"], r["block"])):
            art = cache_root() / r["file"]
            pts = henry_points(r["b"])
            ext = extract_text(s, v, r["doi"], r["block"], pts)
            Ts = [float(t) for t, _, _ in pts]
            ds.append({"file": extract_name(s, v, r["doi"], r["block"]), "doi": r["doi"],
                       "art": art, "block": r["block"], "sha": sha_bytes(ext.encode()),
                       "n": len(pts), "T": (min(Ts), max(Ts))})
            studies.append(f"      {r['doi']:<30} block {r['block']:<3} {len(pts):3d} pts  "
                           f"{min(Ts):.2f}-{max(Ts):.2f} K   {cite_line(r['b']['cite'])}")
        print(f"  {s}-{v}: {len(ds)} block(s), {sum(d['n'] for d in ds)} points")
        if not write:
            continue
        made += 1
        (case / "system").mkdir(parents=True, exist_ok=True)
        (case / "constant").mkdir(parents=True, exist_ok=True)
        (case / f"{s}-{v}.cho").write_text("")
        fs, fv = comp_facts(s), comp_facts(v)
        decl = [HEAD.replace("Tutorial case file", "Curation case file"),
                f"/*  constant/henryArchiveDatasets -- WHERE the Henry constants of {s} in {v}",
                "    come from, and how to regenerate them.  NO MEASURED POINT IS IN THIS TREE",
                "    (C282).  `bin/curate/henry_organic.py fetch <case>` writes each dataset into",
                "    constant/archiveExtracts/ (gitignored) from the local ThermoML cache or the",
                "    NIST URL, checking BOTH sha256 sums; a mismatch refuses, an unreachable NIST",
                "    is reported NOT RUN, never a pass.  Not named `archiveDatasets`: that file",
                "    is fetched by bin/choupo-curate, which has no Henry extractor.  */",
                "", "recordType    archiveDatasets;", "",
                f"solute        {s};", f"solvent       {v};", "",
                "archive", "{", '    tarball   "ThermoML.v2020-09-30.tgz";',
                '    doi       "10.18434/mds2-2422";', "}", "", "datasets", "("]
        for d in ds:
            decl += ["    {",
                     f'        file          "{d["file"]}";',
                     "        role          fit;   // C283 amended: every laboratory is fitted",
                     "        extractor     henryConstant;",
                     f'        doi           "{d["doi"]}";',
                     f'        url           "{NIST}{d["doi"]}.xml";',
                     f'        articleFile   "{d["art"].name}";',
                     f'        articleSha256 "{sha_file(d["art"])}";',
                     f"        block         {d['block']};",
                     f'        sha256        "{d["sha"]}";',
                     "    }"]
        decl += [");", ""]
        (case / DECL).write_text("\n".join(decl))
        (case / "system" / "controlDict").write_text(
            HEAD.replace("Tutorial case file", "Curation case file")
            + f"/*  {s}-{v}: a Henry's-law constant of {s} in {v} regressed by\n"
              "    bin/curate/henry_organic.py to every laboratory's measurements (DEV.md 4c\n"
              "    C321 part 2).  See system/propsDict for the declaration and the result.  */\n\n"
              "application   choupoProps;\n"
              f'description   "Henry {s} in {v}, van\'t Hoff fitted by the curation pipeline to every '
              'laboratory\'s measured Henry constants (ThermoML locates, the articles source), graded '
              'by max relative error (clean 10 %, warning 20 %, severe 30 %, refused above; C285, C336 class B)";\n'
              "verbosity     1;\n")
        (case / "constant" / "thermoPhysPropDict").write_text(
            "/*  Placeholder the bench requires; no operation reads it.  The case asks the\n"
            "    catalogue (or this case's own constant/parameters/Henry/) for the record.  */\n\n"
            "recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n\n"
            f"components       ( {v} );\n\nequilibrium\n{{\n    formulation gammaPhi;\n"
            "    liquid { activityModel { model ideal; } }\n    vapour { fugacityModel idealGas; }\n}\n")
        cls = (f"{s}: " + ("record `role solute;`" if fs["role"] == "solute" else
                           f"Tb {fs['Tb']} K, Tc {fs['Tc']} K") +
               f"; {v}: Tb {fv['Tb']} K, Tc {fv['Tc']} K")
        body = [HEAD, "/*---------------------------------------------------------------------------*\\",
                f"  {s}-{v} -- A HENRY'S-LAW CONSTANT FROM EVERY LABORATORY'S MEASUREMENTS.", "",
                "  WRITTEN BY bin/curate/henry_organic.py declare (DEV.md 4c C321 part 2).", "",
                "  THE DECLARATION -- WRITTEN AND COMMITTED BEFORE ANY FIT RAN (the",
                "  declarations of the run share one commit).", "",
                f"  IDENTITY.  Solute {s} (CAS {fs['CAS']}) in solvent {v} (CAS {fv['CAS']}),",
                "  joined to the archive by InChIKey through identity.json -- never by name.",
                "  The solute is the compound the block's Henry property names.",
                f"  CLASS: {cls}.", "",
                "  NO MEASURED SERIES IN THIS TREE.  constant/henryArchiveDatasets names each",
                "  dataset (DOI, NIST URL, article sha256, block, extract sha256);",
                "  `bin/curate/henry_organic.py fetch` writes the points into",
                "  constant/archiveExtracts/, which is gitignored.", "",
                "  STUDIES: every mole-fraction-scale Henry block of the pair with a stated",
                f"  uncertainty on every point ({len(ds)} block(s)).  FITTED, ALL OF THEM:"]
        body += studies
        body += ["",
                 "  THE RULE (DEV.md 4c C283 amended, C285, C300; C321 part 2).  The van't Hoff",
                 "  form the loader reads, ln H = ln H_ref + (enthalpy/R)(1/T - 1/298.15 K):",
                 "  two parameters.  Stage 1, least squares on the relative residual",
                 "  H_model/H - 1 (equal weights); a point above 20 % is DISCARDED BY NAME and",
                 "  stage 1 repeated -- ONLY when two or more laboratories are fitted: with ONE",
                 "  laboratory no point is discarded (no second series to call it an outlier",
                 "  against; C321 part 2 amended) and the grade is the series' real error.",
                 "  Stage 2, minimax on the same residual over the kept points; its",
                 "  coefficients are the record's.  GRADE on the max relative",
                 "  error over the kept points (C336 class B, Henry): clean up to 10 %,",
                 "  warning up to 20 %, severe up to 30 %, refused above.  An in-sample",
                 "  clean resting on ONE laboratory is",
                 "  capped at warning (C300 rule 2).  One temperature gives no enthalpy: refused.",
                 "  clean, warning and severe are promoted (autoPromoted, review by none)",
                 "  into data/standards/parameters/Henry/ (C285; Vitor's ruling of",
                 "  2026-11-12; C336 class B: only above 30 % is refused); refused writes",
                 "  nothing.", "",
                 "  @@RESULT-BEGIN@@", "  (the fit has not run)", "  @@RESULT-END@@", "",
                 "  WHAT IS NOT CLAIMED.  The constant is the infinite-dilution H_xp at the",
                 "  solvent's own vapour pressure, in the measured range only; the archive's",
                 "  transcription has NOT been read back against the articles.",
                 "\\*---------------------------------------------------------------------------*/",
                 "", "operations", "(",
                 f"    {{ name h_{s}_{v}; type pairLookup; components ( {s} {v} ); }}", ");", ""]
        (case / "system" / "propsDict").write_text("\n".join(body))
    print(f"henry_organic declare: {len(pairs)} pair(s) qualify; {made} case(s) written")
    return 0


def result_text(s, v, res):
    if res.get("p") is None:
        return [f"  REFUSED: {res['why']} ({res['n']} points, {res['labs']} laboratory(ies))."]
    Href, dH = coefficients(res)
    lines = [f"  {res['n']} points of {res['labs']} laboratory(ies); {len(res['kept'])} kept,",
             f"  {len(res['discarded'])} discarded after the least-squares stage (> 20 %):"]
    for d, b, T, ri in res["discarded"]:
        lines.append(f"      doi {d} block {b} T = {T:g} K (stage-1 residual {100 * ri:+.1f} %)")
    if res["labs"] < 2:
        lines.append("  ONE laboratory: no point was discarded (C321 part 2 amended).")
        if res["grade_in"] != "clean":
            lines.append(f"  THE SERIES DOES NOT FOLLOW VAN'T HOFF within {LIMITS[0]:g} %: the two-parameter")
            lines.append(f"  form misses its own measurements by up to {res['maxRel_pct']:.2f} %.")
    lines += [f"  H_ref = {Href:.5e} Pa at 298.15 K, enthalpy = {dH} J/mol;",
              f"  kept span {res['Tmin']:g}-{res['Tmax']:g} K; max relative error",
              f"  {res['maxRel_pct']:.4f} % (least squares {res['lsMaxRel_pct']:.4f} %); in-sample",
              f"  grade {res['grade_in']}" + (f", CAPPED to warning ({' '.join(res['caps'])})"
                                             if res["caps"] else "") + ".",
              {"clean": "  PROMOTED into data/standards/parameters/Henry/.",
               "warning": "  PROMOTED into data/standards/parameters/Henry/.",
               "severe": "  PROMOTED into data/standards/parameters/Henry/ with a SEVERE grade (C285).",
               "refused": f"  REFUSED: {res['why']}."}[res["grade"]]]
    return lines


def record_text(case, s, v, decl, res, fingerprint):
    Href, dH = coefficients(res)
    fs = comp_facts(s)
    cites = []
    _, _, dd = parse_decl(case)
    for d in decl:
        b = read_block(case_article(case, d), int(d["block"]))
        cites.append(cite_line(b["cite"]))
    case_rel = case.relative_to(ROOT).as_posix()
    lo, hi = math.floor(res["Tmin"]), math.ceil(res["Tmax"])
    h = ["/*--------------------------------*- Choupo -*-----------------------*\\",
         f"  Henry's-law constant for {s} in liquid {v} (infinite dilution).", "",
         "  Source DATA: the measurements of"]
    h += [f"    {c}" for c in cites]
    h += ["  located through the NIST/TRC ThermoML Archive (doi 10.18434/mds2-2422);",
          "  the values belong to those articles.  NO measured point is reproduced here",
          f"  or anywhere in this tree; {case_rel}",
          "  declares each dataset by DOI, block and sha256 and regenerates it.", "",
          f"  FIT (DEV.md 4c C321 part 2): van't Hoff in 1/T, every laboratory together,",
          "  least squares then minimax on the relative residual of H; points above",
          f"  20 % after the least-squares stage discarded by name ({len(res['discarded'])} here).",
          f"  {len(res['kept'])} kept points, {res['Tmin']:g}-{res['Tmax']:g} K; max relative error",
          f"  {res['maxRel_pct']:.2f} % in-sample (graded {LIMITS[0]:g} / {LIMITS[1]:g} / {LIMITS[2]:g} %, C336 class B).",
          ] + ([f"  ONE laboratory: no point discarded (C321 part 2 amended); the series does not",
                f"  follow van't Hoff within {LIMITS[0]:g} % -- it misses its own points by up to {res['maxRel_pct']:.2f} %."]
               if res["labs"] < 2 and res["grade_in"] != "clean" else []) + [
          "  Regressed by Choupo, NOT read by a human; the archive's transcription has",
          "  not been read back against the articles.", "",
          "  NOTE: INFINITE-DILUTION coefficient at the solvent's own vapour pressure;",
          f"  validity {lo}-{hi} K (the measured span; outside it an extrapolation).",
          "\\*---------------------------------------------------------------------------*/", "",
          f"solute      {s};", f"solvent     {v};", "",
          f"gasSpecies        {s};", f"dissolvedSpecies  {s};", "convention        Sander-Hxp-v1;", "",
          "model       vantHoff;", f"H_ref       {Href:.5e} Pa;", "T_ref       298.15 K;",
          f"enthalpy    {dH}  J/mol;", f"Trange      ( {lo}  {hi} );", "",
          "reviewStatus autoPromoted;", "review      { by none; }", "",
          "provenance", "{", "    origin        fitted;",
          f'    source        "{"; ".join("doi:" + d["doi"] for d in decl)} (located through ThermoML, doi 10.18434/mds2-2422)";',
          '    method        "van\'t Hoff fit, least squares then minimax on H_model/H - 1, bin/curate/henry_organic.py";',
          f"    CAS           {fs['CAS']};",
          f'    fittedInCase  "{case_rel}";',
          f"    fitGrade      {res['grade']};   // DEV.md 4c C285: max |H_model - H|/H over the kept points, graded {LIMITS[0]:g} / {LIMITS[1]:g} / {LIMITS[2]:g} % (C336 class B)",
          "    fitGradeBasis inSample;   // DEV.md 4c C300 rule 1"]
    if res["caps"]:
        h.append(f"    fitGradeCap   ( {' '.join(res['caps'])} );   // DEV.md 4c C300 rule 2")
    h += [f"    fitGradeMaxRelativeError_pct {res['maxRel_pct']:.4f};",
          f"    pointsKept    {len(res['kept'])};",
          f"    pointsDiscarded {len(res['discarded'])};",
          f'    fingerprint   "{fingerprint}";   // of the declaration, frozen before the fit',
          "    evidence", "    ("]
    for d in decl:
        h += ["        {", f'            doi           "{d["doi"]}";',
              f"            block         {d['block']};",
              f'            archiveFile   "{d["articleFile"]}";',
              f'            articleSha256 "{d["articleSha256"]}";',
              f'            sha256        "{d["sha256"]}";', "        }"]
    h += ["    );", "}", ""]
    return "\n".join(h)


def case_article(case, d):
    p = cache_root() / (d["doi"] + ".xml")
    if p.exists():
        return p
    raise SystemExit(f"henry_organic: the article of doi {d['doi']} is not in the cache "
                     f"{cache_root()} (the record's citation is read from it)")


def fingerprint(case):
    return sha_file(case / DECL)[:16]


def fit_case(case, write=False):
    if fetch(case, quiet=True) != 0:
        return None
    s, v, decl, series = read_series(case)
    res = fit_points(series)
    if write:
        pd = case / "system" / "propsDict"
        t = pd.read_text()
        new = "\n".join(result_text(s, v, res))
        t = re.sub(r"@@RESULT-BEGIN@@\n.*?\n  @@RESULT-END@@",
                   "@@RESULT-BEGIN@@\n" + new + "\n  @@RESULT-END@@", t, flags=re.S)
        pd.write_text(t)
        std = HENRY / f"{s}-{v}.dat"
        if res["grade"] == "refused" and std.exists() and "henry_organic" in std.read_text():
            std.unlink()            # no longer accepted into the catalogue
        if res["grade"] in ("clean", "warning", "severe"):
            text = record_text(case, s, v, decl, res, fingerprint(case))
            dest = HENRY / f"{s}-{v}.dat"
            if dest.exists() and "henry_organic" not in dest.read_text():
                raise SystemExit(f"henry_organic: {dest} exists and is not ours -- never overwritten")
            local = case / "constant" / "parameters" / "Henry" / f"{s}-{v}.dat"
            if local.exists():
                local.unlink()      # the C300-rule-3 case-local copy, retired by the 11-12 ruling
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)
    return res


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = argv[0]
    if cmd == "census":
        census()
        return 0
    if cmd == "declare":
        return declare("--write" in argv)
    if cmd == "fetch":
        return fetch(Path(argv[1]).resolve())
    if cmd == "fit":
        cases = [Path(a).resolve() for a in argv[1:] if not a.startswith("--")]
        if not cases:
            cases = sorted(p.parent.parent for p in CASES.glob("*/system/controlDict"))
        tally = {}
        for c in cases:
            res = fit_case(c, write="--write" in argv)
            if res is None:
                tally["notRun"] = tally.get("notRun", 0) + 1
                continue
            tally[res["grade"]] = tally.get(res["grade"], 0) + 1
            mx = f"{res['maxRel_pct']:.2f} %" if "maxRel_pct" in res else "-"
            print(f"  {c.name:<40} {res['grade']:<8} max {mx:>9}  kept {len(res['kept'])}/{res['n']}"
                  f"  labs {res['labs']}" + (f"  ({res['why']})" if res.get("why") else ""))
        print("henry_organic fit: " + ", ".join(f"{k} {v}" for k, v in sorted(tally.items())))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
