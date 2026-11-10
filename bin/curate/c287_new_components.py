#!/usr/bin/env python3
"""c287_new_components.py -- NEW catalogue components from the ThermoML archive
(DEV.md 4c C287, slice 1; Vitor 2026-11-10: "o que eu quero e criar
componentes novos e binarios").

    bin/curate/c287_new_components.py plan
    bin/curate/c287_new_components.py write <name>... | all  [--provisional]

WHAT IT DOES.  For compounds the catalogue does NOT carry, and that the local
ThermoML cache (thirdParty/thermoml, a finding aid -- the articles are the
sources) measures for vapour pressure, liquid density, liquid heat capacity
AND critical constants, it writes data/standards/components/<name>.dat:

  * Tc, Pc     MEASURED: the median of the per-article medians, every DOI
               named, the spread (min-max of every reported value) stated.
  * Tb         MEASURED where the archive reports a boiling temperature at
               100-102.5 kPa (median, DOIs); otherwise ABSENT, said in the
               header -- never a Tb read back off the fitted curve (that
               would make the vapour-pressure pipeline's Tb criterion test a
               curve against itself) and never a group estimate.
  * vaporPressure  written as the AmbroseWalton block `bin/choupo-curate vp`
               replaces; that pipeline (C281/C283/C285) fits, grades and
               promotes the Antoine.  THIS tool never fits a vapour pressure.
  * omega      from the vapour pressure the pipeline FITTED (its case's
               RESULT paragraph), omega = -log10(Psat(0.7 Tc)/Pc) - 1 (the
               definition), extrapolated where the data stop below 0.7 Tc --
               the distance is written in the provenance; beyond 50 K (a
               stated default) the component is HELD, not written.  `--provisional`
               writes a placeholder (0.5, origin placeholder) so the pipeline
               can run before the fit exists; a record is never committed so.
  * Vliq       FITTED: the one parameter of the engine's OWN liquid density
               (ThermoPackage::density, liquid branch: V(T) = Vliq
               Rackett(T)/Rackett(298.15 K) with the record's Tc, Pc, omega)
               to every measured liquid density at or below 200 kPa, every
               laboratory (C283 amended): least squares in the relative
               density error, points beyond 15 % discarded by name and the
               least squares repeated once, then the largest relative error
               minimised (closed form for one parameter); graded on that
               maximum, clean / warning / severe / refused at 5 / 10 / 20 %
               (C285).  `fitGrade` in its provenance entry.
  * liquidHeatCapacity  FITTED: a polynomial in T (degree 2 with >= 6 points
               over >= 30 K, 1 with >= 3 over >= 10 K, else a constant) to
               every measured liquid isobaric heat capacity at or below
               200 kPa, the same two-stage objective, outlier rule and grade.
  * idealGasHeatCapacity, standardThermochemistry  ESTIMATED by Joback
               (data/standards/parameters/Joback.dat, the table the engine's
               estimateComponent reads; the case
               tutorials/props/curation/curate287_new_components reproduces
               every number); s_298 DERIVED as (dHf - dGf)/298.15 plus the
               elements' standard entropies (CODATA Key Values).  The archive
               carries no enthalpy of formation or combustion block for any
               of them (searched; two articles name one in a title only).
  * reviewStatus autoPromoted; humanReviewed false -- on the record AND on
               every per-value entry a machine decided, so the loader voices
               each (src/thermo/Database.cpp).

NO MEASURED SERIES IS WRITTEN INTO THE TREE (Vitor, 2026-11-10): the record
carries parameters, DOIs, the article files' sha256 and the counts; the points
are regenerated from the cache by this tool.

EXCLUDED, BY NAME (plan prints them): a compound the catalogue already holds
under an identity the bridge did not resolve (HFO-1234ze(E) = R1234zeE); an
identity that is not one substance (ethyl nonafluorobutyl ether: three CAS,
the commercial fluid an n/iso mixture); a structure Joback cannot express
(N-methylpiperidine, N-formylmorpholine: no ring tertiary-amine group in the
table); no usable vapour-pressure study for the pipeline (1,2-dimethoxyethane,
N-methylformamide: every study fewer than 5 points).
"""
import collections
import hashlib
import json
import math
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "thirdParty" / "thermoml"
STD = ROOT / "data" / "standards" / "components"
JOBACK = ROOT / "data" / "standards" / "parameters" / "Joback.dat"
CURATION = ROOT / "tutorials" / "props" / "curation"
REPRO_CASE = "tutorials/props/curation/curate287_new_components"
TOOL = "bin/curate/c287_new_components.py"

#  name, InChIKey, formula, CAS (PubChem by InChIKey; the identity bridge
#  re-derives InChIKey from CAS through two resolvers that must agree),
#  Joback groups (atom count checked against the formula below).
CANDIDATES = [
    ("di2EthylhexylPhthalate", "BJQHLKABXJIVAM-UHFFFAOYSA-N", "C24H38O4", "117-81-7",
     "bis(2-ethylhexyl) phthalate",
     [("CH3", 4), ("CH2", 10), ("CH", 2), ("ester", 2), ("arC", 2), ("arCH", 4)]),
    ("2Ethoxyethanol", "ZNQVEEAIQZEUHB-UHFFFAOYSA-N", "C4H10O2", "110-80-5",
     "2-ethoxyethanol", [("CH3", 1), ("CH2", 3), ("ether", 1), ("OH", 1)]),
    ("ethylOctanoate", "YYZUSRORWSJGET-UHFFFAOYSA-N", "C10H20O2", "106-32-1",
     "ethyl octanoate", [("CH3", 2), ("CH2", 7), ("ester", 1)]),
    ("13Propanediamine", "XFNJVJPLKCPIBV-UHFFFAOYSA-N", "C3H10N2", "109-76-2",
     "1,3-propanediamine", [("CH2", 3), ("NH2", 2)]),
    ("16Hexanediamine", "NAQMVNRVTILPCV-UHFFFAOYSA-N", "C6H16N2", "124-09-4",
     "1,6-hexanediamine", [("CH2", 6), ("NH2", 2)]),
    ("13Propanediol", "YPFDHNVEDLHUCE-UHFFFAOYSA-N", "C3H8O2", "504-63-2",
     "1,3-propanediol", [("CH2", 3), ("OH", 2)]),
    ("13Butanediol", "PUPZLCDOIYMWBV-UHFFFAOYSA-N", "C4H10O2", "107-88-0",
     "1,3-butanediol", [("CH3", 1), ("CH2", 2), ("CH", 1), ("OH", 2)]),
    ("methylTetradecanoate", "ZAZKJZBWRNNLDS-UHFFFAOYSA-N", "C15H30O2", "124-10-7",
     "methyl tetradecanoate (methyl myristate)", [("CH3", 2), ("CH2", 12), ("ester", 1)]),
    ("16Hexanediol", "XXMIOPMDWAUFGU-UHFFFAOYSA-N", "C6H14O2", "629-11-8",
     "1,6-hexanediol", [("CH2", 6), ("OH", 2)]),
    ("allylAlcohol", "XXROGKLTLUQVRX-UHFFFAOYSA-N", "C3H6O", "107-18-6",
     "allyl alcohol (prop-2-en-1-ol)", [("eCH2", 1), ("eCH", 1), ("CH2", 1), ("OH", 1)]),
    ("glycerylTrioctanoate", "VLPFTAMPNXLGLX-UHFFFAOYSA-N", "C27H50O6", "538-23-8",
     "glyceryl trioctanoate (tricaprylin)", [("CH3", 3), ("CH2", 20), ("CH", 1), ("ester", 3)]),
    ("33Oxydipropanol", "SZXQTJUDPRGNJN-UHFFFAOYSA-N", "C6H14O3", "2396-61-4",
     "3,3'-oxydipropan-1-ol", [("CH2", 6), ("ether", 1), ("OH", 2)]),
    ("glycerylTridecanoate", "LADGBHLMCUINGV-UHFFFAOYSA-N", "C33H62O6", "621-71-6",
     "glyceryl tridecanoate (tricaprin)", [("CH3", 3), ("CH2", 26), ("CH", 1), ("ester", 3)]),
    ("methylLevulinate", "UAGJVSRUFNSIHR-UHFFFAOYSA-N", "C6H10O3", "624-45-3",
     "methyl levulinate (methyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 2), ("ketone", 1), ("ester", 1)]),
    ("ethylLevulinate", "GMEONFUTDYJSNV-UHFFFAOYSA-N", "C7H12O3", "539-88-8",
     "ethyl levulinate (ethyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 3), ("ketone", 1), ("ester", 1)]),
    ("butylLevulinate", "ISBWNEKJSSLXOD-UHFFFAOYSA-N", "C9H16O3", "2052-15-5",
     "butyl levulinate (butyl 4-oxopentanoate)",
     [("CH3", 2), ("CH2", 5), ("ketone", 1), ("ester", 1)]),
]

#  HELD (DEV.md 4c C287): every value fitted and graded, the vapour-pressure
#  fit PROMOTABLE, but 0.7 Tc lies more than OMEGA_MAX_EXTRAPOLATION_K
#  beyond the measured vapour pressures, so omega (the definition, at
#  Tr = 0.7) would be an extrapolation of an Antoine by 58-237 K.  Their
#  records and cases are not shipped until Vitor rules how omega is taken.
HELD = ["methylTetradecanoate", "13Propanediamine", "di2EthylhexylPhthalate",
        "ethylLevulinate", "16Hexanediamine", "butylLevulinate",
        "glycerylTrioctanoate", "glycerylTridecanoate"]

EXCLUDED = [
    ("CDOOAUSHHFGWSA-OWOJBTEDSA-N", "HFO-1234ze(E)",
     "already in the catalogue as R1234zeE (its CAS did not resolve in the identity bridge)"),
    ("DFUYAWQUODQGFF-UHFFFAOYSA-N", "1-ethoxy-nonafluorobutane",
     "identity ambiguous: PubChem lists three CAS (631897-30-8, 163702-05-4, "
     "813458-04-7); the commercial fluid is an n/iso isomer mixture"),
    ("PAMIQIKDUOTOBW-UHFFFAOYSA-N", "N-methylpiperidine",
     "Joback has no ring tertiary-amine group: its Cp_ig and formation data cannot be estimated"),
    ("LCEDQNDDFOCWGG-UHFFFAOYSA-N", "N-formylmorpholine",
     "Joback has no ring tertiary-amine group: its Cp_ig and formation data cannot be estimated"),
    ("XTHFKEDIFFGKHM-UHFFFAOYSA-N", "1,2-dimethoxyethane",
     "no vapour-pressure study with >= 5 points (four articles, one point each)"),
    ("ATHHXGZTWNVVOU-UHFFFAOYSA-N", "N-methylformamide",
     "no vapour-pressure study with >= 5 points (three articles, four points)"),
]

#  CODATA Key Values for Thermodynamics (Cox, Wagman & Medvedev, Hemisphere,
#  1989), standard molar entropies at 298.15 K and 1 bar, J/(mol K), per
#  ELEMENT REFERENCE STATE: C(cr, graphite); H2, O2, N2 (g).
S_EL = {"C": 5.74, "H": 130.680 / 2, "O": 205.152 / 2, "N": 191.609 / 2}
S_EL_CITE = ("CODATA Key Values for Thermodynamics (Cox, Wagman & Medvedev, 1989): "
             "S(C, graphite) 5.74, S(H2, g) 130.680, S(O2, g) 205.152, "
             "S(N2, g) 191.609 J/(mol K)")
ATOMIC = {"C": 12.011, "H": 1.008, "O": 15.999, "N": 14.007, "F": 18.998}
OUTLIER_PCT = 15.0
GRADES = ("clean", "warning", "severe", "refused")
LIMITS = (5.0, 10.0, 20.0)
P_MAX_KPA = 200.0
RACKETT_TREF = 298.15
#  STATED DEFAULT (DEV.md 4c C287): omega is read off the fitted Antoine at
#  0.7 Tc only when 0.7 Tc lies within this distance of the fitted range;
#  beyond it the component is HELD, not written (see HELD).
OMEGA_MAX_EXTRAPOLATION_K = 50.0


def refuse(msg):
    print("c287_new_components: REFUSED\n  " + msg)
    sys.exit(1)


def formula_counts(f):
    c = collections.Counter()
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        c[el] += int(n or 1)
    return c


def mw_of(f):
    return sum(ATOMIC[el] * n for el, n in formula_counts(f).items())


# --------------------------------------------------------------------------
#  the archive (cache only; regex on the published dialect, single-component
#  blocks only)
# --------------------------------------------------------------------------
R = lambda p: re.compile(p, re.S)
RE_CMP = R(r"<Compound>(.*?)</Compound>"); RE_ORG = R(r"<nOrgNum>(\d+)</nOrgNum>")
RE_KEY = R(r"<sStandardInChIKey>([^<]+)</sStandardInChIKey>")
RE_BLK = R(r"<PureOrMixtureData>(.*?)</PureOrMixtureData>"); RE_COMP = R(r"<Component>(.*?)</Component>")
RE_PROP = R(r"<Property>(.*?)</Property>"); RE_PN = R(r"<ePropName>([^<]+)</ePropName>")
RE_PNUM = R(r"<nPropNumber>(\d+)</nPropNumber>"); RE_PPH = R(r"<ePropPhase>([^<]+)</ePropPhase>")
RE_VAR = R(r"<Variable>(.*?)</Variable>"); RE_VNUM = R(r"<nVarNumber>(\d+)</nVarNumber>")
RE_VT = R(r"<VariableType>\s*<\w+>([^<]+)</\w+>")
RE_NV = R(r"<NumValues>(.*?)</NumValues>"); RE_VV = R(r"<VariableValue>(.*?)</VariableValue>")
RE_PV = R(r"<PropertyValue>(.*?)</PropertyValue>")
RE_VVAL = R(r"<nVarValue>([^<]+)</nVarValue>"); RE_PVAL = R(r"<nPropValue>([^<]+)</nPropValue>")


def family(name, phases):
    p = name.lower()
    liq = any("Liquid" in x for x in phases)
    if p.startswith("boiling temperature"):
        return "Tboil"
    if p.startswith("mass density") and liq:
        return "rho"
    if p.startswith("molar heat capacity at constant pressure") and liq:
        return "Cp"
    if p.startswith("specific heat capacity at constant pressure") and liq:
        return "cp_spec"
    if p.startswith("critical temperature"):
        return "Tc"
    if p.startswith("critical pressure"):
        return "Pc"
    return None


def harvest(keys):
    """{key: {family: [ {doi, T, P_kPa, val} ]}}, plus {doi: sha256}."""
    ix = json.loads((CACHE / "index.json").read_text())
    files = sorted({e["doi"] for e in ix["entries"]
                    if any(c.get("inchikey") in keys for c in e.get("compounds", []))})
    out = {k: collections.defaultdict(list) for k in keys}
    sha = {}
    for doi in files:
        path = CACHE / (doi + ".xml")
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8", errors="replace")
        org = {}
        for c in RE_CMP.findall(t):
            o, k = RE_ORG.search(c), RE_KEY.search(c)
            if o and k:
                org[o.group(1)] = k.group(1).strip()
        for b in RE_BLK.findall(t):
            cs = RE_COMP.findall(b)
            if len(cs) != 1:
                continue
            o = RE_ORG.search(cs[0])
            if not o or org.get(o.group(1)) not in keys:
                continue
            k = org[o.group(1)]
            props = {}
            for p in RE_PROP.findall(b):
                n, m = RE_PN.search(p), RE_PNUM.search(p)
                if n and m:
                    props[m.group(1)] = (n.group(1), RE_PPH.findall(p))
            vars_ = {}
            for v in RE_VAR.findall(b):
                m, vt = RE_VNUM.search(v), RE_VT.search(v)
                if m and vt:
                    vars_[m.group(1)] = vt.group(1)
            for nv in RE_NV.findall(b):
                vv = {}
                for x in RE_VV.findall(nv):
                    m, val = RE_VNUM.search(x), RE_VVAL.search(x)
                    if m and val and m.group(1) in vars_:
                        vv[vars_[m.group(1)]] = float(val.group(1))
                if set(vv) - {"Temperature, K", "Pressure, kPa"}:
                    continue            # a third variable: not a pure (T, P) point
                for pv in RE_PV.findall(nv):
                    m, val = RE_PNUM.search(pv), RE_PVAL.search(pv)
                    if not (m and val) or m.group(1) not in props:
                        continue
                    f = family(*props[m.group(1)])
                    if not f:
                        continue
                    out[k][f].append({"doi": doi, "T": vv.get("Temperature, K"),
                                      "P": vv.get("Pressure, kPa"),
                                      "val": float(val.group(1))})
                    sha[doi] = None
    for doi in sha:
        sha[doi] = hashlib.sha256((CACHE / (doi + ".xml")).read_bytes()).hexdigest()
    return out, sha


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def measured_constant(rows):
    """Median of the per-article medians; (value, dois, all values)."""
    per = collections.defaultdict(list)
    for r in rows:
        per[r["doi"]].append(r["val"])
    meds = [median(v) for v in per.values()]
    return median(meds), sorted(per), [x for v in per.values() for x in v]


# --------------------------------------------------------------------------
#  fits
# --------------------------------------------------------------------------
def grade(x):
    for g, lim in zip(GRADES, LIMITS):
        if x <= lim:
            return g
    return "refused"


def rackett(T, Tc, Pc_Pa, omega):
    """src/thermo/DerivedClosures.H rackettVliq, the same arithmetic."""
    Rg = 8.314462618
    Zra = 0.29056 - 0.08775 * omega
    return (Rg * Tc / Pc_Pa) * Zra ** (1.0 + (1.0 - T / Tc) ** (2.0 / 7.0))


def fit_vliq(rows, MW, Tc, Pc_bar, omega):
    """The one parameter of V(T) = Vliq R(T)/R(298.15).  With u = 1/Vliq the
    relative density error is u a_i - 1, a_i = MW/(1000 f_i rho_i): least
    squares u = sum a / sum a^2; minimax u = 2/(min a + max a)."""
    pts = [r for r in rows if r["T"] is not None and (r["P"] is None or r["P"] <= P_MAX_KPA)
           and r["T"] < Tc]
    if not pts:
        return None
    f = lambda T: rackett(T, Tc, Pc_bar * 1e5, omega) / rackett(RACKETT_TREF, Tc, Pc_bar * 1e5, omega)
    a = [MW / (1000.0 * f(r["T"]) * r["val"]) for r in pts]
    u = sum(a) / sum(x * x for x in a)
    keep = [i for i, x in enumerate(a) if abs(u * x - 1.0) * 100 <= OUTLIER_PCT]
    dropped = [pts[i] | {"err": 100 * (u * a[i] - 1)} for i in range(len(pts)) if i not in keep]
    if dropped:
        ak = [a[i] for i in keep]
        u = sum(ak) / sum(x * x for x in ak)
    ak = [a[i] for i in keep]
    u_mm = 2.0 / (min(ak) + max(ak))
    errs = [abs(u_mm * x - 1.0) * 100 for x in ak]
    kept = [pts[i] for i in keep]
    return {"value": 1.0 / u_mm, "valueLS": 1.0 / u, "max": max(errs),
            "aad": sum(errs) / len(errs), "kept": kept, "dropped": dropped,
            "Tmin": min(r["T"] for r in kept), "Tmax": max(r["T"] for r in kept)}


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                k = M[r][c] / M[c][c]
                for j in range(c, n + 1):
                    M[r][j] -= k * M[c][j]
    return [M[i][n] / M[i][i] for i in range(n)]


def nelder_mead(fn, x0, step, iters=4000):
    n = len(x0)
    pts = [x0[:]] + [[x0[j] + (step[j] if j == i else 0.0) for j in range(n)] for i in range(n)]
    val = [fn(p) for p in pts]
    for _ in range(iters):
        o = sorted(range(n + 1), key=lambda i: val[i])
        pts, val = [pts[i] for i in o], [val[i] for i in o]
        if abs(val[-1] - val[0]) < 1e-13:
            break
        c = [sum(p[j] for p in pts[:-1]) / n for j in range(n)]
        xr = [c[j] + (c[j] - pts[-1][j]) for j in range(n)]
        fr = fn(xr)
        if fr < val[0]:
            xe = [c[j] + 2 * (c[j] - pts[-1][j]) for j in range(n)]
            fe = fn(xe)
            pts[-1], val[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < val[-2]:
            pts[-1], val[-1] = xr, fr
        else:
            xc = [c[j] + 0.5 * (pts[-1][j] - c[j]) for j in range(n)]
            fc = fn(xc)
            if fc < val[-1]:
                pts[-1], val[-1] = xc, fc
            else:
                pts = [pts[0]] + [[pts[0][j] + 0.5 * (p[j] - pts[0][j]) for j in range(n)]
                                  for p in pts[1:]]
                val = [val[0]] + [fn(p) for p in pts[1:]]
    i = min(range(n + 1), key=lambda i: val[i])
    return pts[i], val[i]


def fit_cp(rows, MW):
    pts = [dict(r) for r in rows if r["T"] is not None
           and (r["P"] is None or r["P"] <= P_MAX_KPA)]
    for r in pts:
        if r.get("spec"):
            r["val"] = r["val"] * MW / 1000.0
    if not pts:
        return None
    Ts = [r["T"] for r in pts]
    span = max(Ts) - min(Ts)
    deg = 2 if (len(pts) >= 6 and span >= 30) else (1 if (len(pts) >= 3 and span >= 10) else 0)
    Tm = 0.5 * (max(Ts) + min(Ts))
    S = 100.0

    def ls(P):
        # relative least squares: rows weighted by 1/Cp
        n = deg + 1
        A = [[0.0] * n for _ in range(n)]
        b = [0.0] * n
        for r in P:
            t = (r["T"] - Tm) / S
            w = 1.0 / r["val"]
            phi = [w * t ** k for k in range(n)]
            for i in range(n):
                b[i] += phi[i] * 1.0
                for j in range(n):
                    A[i][j] += phi[i] * phi[j]
        return solve(A, b)
    ev = lambda c, T: sum(c[k] * ((T - Tm) / S) ** k for k in range(len(c)))
    c = ls(pts)
    rel = [100 * (ev(c, r["T"]) / r["val"] - 1) for r in pts]
    kept = [r for r, e in zip(pts, rel) if abs(e) <= OUTLIER_PCT]
    dropped = [r | {"err": e} for r, e in zip(pts, rel) if abs(e) > OUTLIER_PCT]
    if dropped:
        c = ls(kept)
    mx = lambda cc: max(abs(ev(cc, r["T"]) / r["val"] - 1) for r in kept)
    cls = c
    cm, _ = nelder_mead(mx, cls, [0.01 * abs(x) + 1e-3 for x in cls])
    if mx(cm) > mx(cls):
        cm = cls
    # back to monomials in T: sum c_k ((T - Tm)/S)^k
    mono = [0.0] * (deg + 1)
    for k, ck in enumerate(cm):
        for j in range(k + 1):
            mono[j] += ck * math.comb(k, j) * (-Tm) ** (k - j) / S ** k
    errs = [abs(ev(cm, r["T"]) / r["val"] - 1) * 100 for r in kept]
    return {"coef": mono, "deg": deg, "max": max(errs), "aad": sum(errs) / len(errs),
            "maxLS": mx(cls) * 100, "kept": kept, "dropped": dropped,
            "Tmin": min(r["T"] for r in kept), "Tmax": max(r["T"] for r in kept)}


# --------------------------------------------------------------------------
#  Joback (the table the engine reads; formulas of src/propertyOps/Joback.cpp)
# --------------------------------------------------------------------------
def joback_table():
    t = {}
    for m in re.finditer(r"\{\s*name\s+(\w+);([^}]*)\}", JOBACK.read_text()):
        t[m.group(1)] = {k: float(v) for k, v in re.findall(r"(\w+)\s+([-+0-9.eE]+);", m.group(2))}
    return t


def joback(groups):
    J = joback_table()
    s = lambda k: sum(J[g][k] * n for g, n in groups)
    return {"dHf": (68.29 + s("dHf")) * 1000.0, "dGf": (53.88 + s("dGf")) * 1000.0,
            "cp": [s("cpa") - 37.93, s("cpb") + 0.210, s("cpc") - 3.91e-4, s("cpd") + 2.06e-7]}


# --------------------------------------------------------------------------
#  omega from the pipeline's fitted Antoine
# --------------------------------------------------------------------------
def vp_case(name):
    for p in sorted(CURATION.glob(f"curate*_vp_{name}")):
        return p
    return None


def fitted_antoine(name):
    case = vp_case(name)
    if case is None:
        return None, None
    t = " ".join((case / "system" / "propsDict").read_text().split())
    m = re.search(r"Antoine log10\(Psat/bar\) = ([-0-9.]+) - ([-0-9.]+)/\(T \+ ([-0-9.]+)\)", t)
    rng = re.search(r"kept points, ([0-9.]+)-([0-9.]+) K", t)
    if not m:
        return case, None
    return case, {"A": float(m.group(1)), "B": float(m.group(2)), "C": float(m.group(3)),
                  "Tmin": float(rng.group(1)), "Tmax": float(rng.group(2))}


# --------------------------------------------------------------------------
#  record
# --------------------------------------------------------------------------
def ev_list(rows_by_doi, sha, kept_count, drop_count, ind="            "):
    out = ""
    for doi in sorted(rows_by_doi):
        out += (f"{ind}{{ doi \"{doi}\"; articleSha256 \"{sha[doi]}\"; "
                f"pointsKept {kept_count.get(doi, 0)}; pointsDropped {drop_count.get(doi, 0)}; "
                "provenance measured; }\n")
    return out


def fit_entry(key, fit, sha, method, unit_word):
    kc = collections.Counter(r["doi"] for r in fit["kept"])
    dc = collections.Counter(r["doi"] for r in fit["dropped"])
    dois = set(kc) | set(dc)
    drop_txt = "; ".join(f"{r['doi']} T={r['T']:g} K {unit_word}={r['val']:g} err {r['err']:+.1f} %"
                         for r in fit["dropped"]) or "none"
    g = grade(fit["max"])
    return (f"    {key}\n    {{\n"
            "        origin        fitted;\n"
            f'        method        "{method}";\n'
            f'        fittedBy      "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        humanReviewed false;\n"
            f"        fitGrade      {g};   // DEV.md 4c C285 limits 5 / 10 / 20 %\n"
            f"        fitGradeMaxRelativeError_pct {fit['max']:.6f};\n"
            '        reviewReason  "regressed by a machine from archive-transcribed measurements; not yet read back against the articles";\n'
            '        reuse         "Choupo\'s own regression; the measured points belong to the cited articles and are not reproduced in this record or this tree";\n'
            "        evidence\n        (\n" + ev_list(dois, sha, kc, dc) + "        );\n"
            "        acceptance\n        {\n"
            '            rule        "the default graded acceptance of DEV.md 4c C285 on the max relative error over the kept points (clean / warning / severe up to 5 / 10 / 20 %); every laboratory fitted, points beyond 15 % after the least-squares stage discarded by name (C283 amended)";\n'
            "            verdict     accepted;\n"
            f"            studies     {len(dois)};\n"
            f"            pointsKept  {len(fit['kept'])};\n"
            f"            pointsDropped {len(fit['dropped'])};\n"
            f'            dropped     "{drop_txt}";\n'
            f"            aad_pct     {fit['aad']:.6f};\n"
            f"            max_pct     {fit['max']:.6f};\n"
            + (f"            Trange      ({fit['Tmin']:g} {fit['Tmax']:g});   // K, the kept points\n"
               if fit["Tmax"] > fit["Tmin"] else
               f"            measuredAt  {fit['Tmin']:g};   // K: ONE measurement -- the parameter reproduces it exactly and the grade says nothing about its temperature dependence\n")
            + "        }\n    }\n")


def constant_entry(key, val, dois, allv, unit, note=""):
    lo, hi = min(allv), max(allv)
    return (f"    {key}\n    {{\n"
            "        origin        measured;\n"
            f'        method        "median of the per-article medians of every value the ThermoML archive locates ({len(allv)} value(s), {len(dois)} article(s)){note}";\n'
            f'        uncertainty   "spread of the reported values {lo:g} - {hi:g} {unit}";\n'
            f'        doi           "{"; ".join(dois)}";\n'
            f'        combinedBy    "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        humanReviewed false;\n"
            '        reviewReason  "combined by a machine from archive-transcribed values; not yet read back against the articles";\n'
            "    }\n")


def build(c, data, sha, provisional):
    name, key, formula, cas, label, groups = c
    d = data[key]
    fc = formula_counts(formula)
    gc = collections.Counter()
    atoms = {"CH3": "CH3", "CH2": "CH2", "CH": "CH", "C": "C", "eCH2": "CH2", "eCH": "CH",
             "OH": "OH", "ether": "O", "ester": "CO2", "ketone": "CO", "arC": "C",
             "arCH": "CH", "NH2": "NH2"}
    for g, n in groups:
        for el, m in formula_counts(atoms[g]).items():
            gc[el] += m * n
    if gc != fc:
        refuse(f"{name}: Joback groups give {dict(gc)}, the formula {formula}")
    MW = mw_of(formula)
    if not d["Tc"] or not d["Pc"]:
        refuse(f"{name}: no measured Tc AND Pc in the archive")
    Tc, Tc_dois, Tc_all = measured_constant(d["Tc"])
    Pc_kPa, Pc_dois, Pc_all = measured_constant(d["Pc"])
    Pc = Pc_kPa / 100.0
    tb_rows = [r for r in d["Tboil"] if r["P"] is not None and 100.0 <= r["P"] <= 102.5]
    Tb = measured_constant(tb_rows) if tb_rows else None
    case, ant = fitted_antoine(name)
    if ant is None:
        if not provisional:
            refuse(f"{name}: no fitted Antoine yet ({'no case' if case is None else case.name}"
                   " has no RESULT) -- run `bin/choupo-curate vp` first, or --provisional")
        omega, omega_entry = 0.5, ("    omega\n    {\n        origin        placeholder;\n"
                                   '        method        "PROVISIONAL: replaced from the fitted vapour pressure before the record is committed";\n    }\n')
    else:
        T7 = 0.7 * Tc
        P7 = 10 ** (ant["A"] - ant["B"] / (T7 + ant["C"]))     # bar
        omega = -math.log10(P7 / Pc) - 1.0
        beyond = max(0.0, T7 - ant["Tmax"], ant["Tmin"] - T7)
        if beyond > OMEGA_MAX_EXTRAPOLATION_K:
            refuse(f"{name}: omega would be read off the fitted Antoine {beyond:.1f} K outside "
                   f"its fitted range (0.7 Tc = {T7:.2f} K, data {ant['Tmin']:g}-{ant['Tmax']:g} K), "
                   f"more than the stated {OMEGA_MAX_EXTRAPOLATION_K:g} K -- HELD for Vitor "
                   "(DEV.md 4c C287): a three-parameter Antoine carried that far gives an "
                   "omega nobody can defend (butylLevulinate: 0.096)")
        extra = ("inside the fitted range" if ant["Tmin"] <= T7 <= ant["Tmax"] else
                 f"EXTRAPOLATED {T7 - ant['Tmax']:+.1f} K beyond the fitted range "
                 f"({ant['Tmin']:g}-{ant['Tmax']:g} K)" if T7 > ant["Tmax"] else
                 f"EXTRAPOLATED {T7 - ant['Tmin']:+.1f} K below the fitted range")
        omega_entry = (
            "    omega\n    {\n"
            "        origin        regressed;\n"
            f'        method        "DERIVED from a fit: omega = -log10(Psat(0.7 Tc)/Pc) - 1 from the Antoine the vapour-pressure pipeline fitted ({case.relative_to(ROOT).as_posix()}) and the measured Tc, Pc; 0.7 Tc = {T7:.2f} K, {extra}";\n'
            f'        derivedBy     "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        humanReviewed false;\n"
            '        reviewReason  "derived by a machine; read it with the fitGrade of the vapour pressure it comes from";\n'
            "    }\n")
    rho = fit_vliq(d["rho"], MW, Tc, Pc, omega)
    cp_rows = d["Cp"] + [r | {"spec": True} for r in d["cp_spec"]]
    cp = fit_cp(cp_rows, MW)
    if rho is None or cp is None:
        refuse(f"{name}: no usable liquid density or liquid Cp at or below {P_MAX_KPA:g} kPa")
    J = joback(groups)
    nel = formula_counts(formula)
    if set(nel) - set(S_EL):
        refuse(f"{name}: no element entropy for {set(nel) - set(S_EL)}")
    s298 = (J["dHf"] - J["dGf"]) / 298.15 + sum(S_EL[el] * n for el, n in nel.items())
    today = date.today().isoformat()
    fp = ",".join(f"{g}:{n}" for g, n in sorted(groups))
    JTAB = re.search(r"^tableId\s+(\S+);", JOBACK.read_text(), re.M).group(1)
    jgroups = " ".join(f"{{ group {g}; count {n}; }}" for g, n in groups)
    cpig = J["cp"]
    cpl = cp["coef"]
    vp_note = ("  Psat: fitted by `bin/choupo-curate vp`; its promotion replaces the\n"
               "  AmbroseWalton block this tool writes (provenance.vaporPressure).\n")
    tb_line = (f"Tb          {Tb[0]:.6g};      // K, measured (provenance.Tb)\n" if Tb else
               "//  Tb: NOT DECLARED -- the archive reports no boiling temperature at\n"
               "//  101.3 kPa for it, and a Tb read back off the fitted Antoine would be\n"
               "//  the curve tested against itself (the fitted normal boiling point is\n"
               "//  in provenance.vaporPressure.acceptance.Tnb_fit).\n")
    head = f"""/*--------------------------------*- Choupo -*-----------------------*\\
  Component: {name}  ({label}; CAS {cas})
  NEW in the catalogue (DEV.md 4c C287, {today}), built by
  {TOOL} from measurements the NIST/TRC ThermoML Archive
  locates (the articles are the sources; their DOIs are in provenance).
  MEASURED: Tc, Pc{', Tb' if Tb else ''}.  FITTED: vapour pressure (bin/choupo-curate vp),
  Vliq, liquid Cp.  DERIVED: omega (from the fitted vapour pressure).
  ESTIMATED (Joback): ideal-gas Cp, dHf_298; s_298 derived from Joback's
  dHf and dGf.  No measured series is reproduced here.
  reviewStatus autoPromoted, humanReviewed false: NO human has read it back.
{vp_note}\\*---------------------------------------------------------------------------*/

name        {name};
CAS         {cas};
formula     {formula};
reviewStatus autoPromoted;
humanReviewed false;
MW          {MW:.4f};      // kg/kmol, from the formula (IUPAC standard atomic weights)
Tc          {Tc:.6g};      // K, measured (provenance.Tc)
Pc          {Pc:.6g};      // bar, measured (provenance.Pc)
omega       {omega:.6f};      // [-] (provenance.omega)
{tb_line}
standardThermochemistry
{{
    dHf_298   {J['dHf']:.0f};        // J/mol, ideal gas, Joback ESTIMATE (provenance.dHf_298)
    s_298     {s298:.2f};        // J/(mol K), ideal gas, DERIVED from Joback (provenance.s_298)
}}

vaporPressure
{{
    model AmbroseWalton;  // [origin=estimated method=Ambrose-Walton]
}}

Vliq        {rho['value']:.6e};      // m3/mol at 25 C, FITTED (provenance.Vliq)

idealGasHeatCapacity
{{
    model         polynomial;
    // Cp [J/(mol K)] = a0 + a1 T + a2 T^2 + a3 T^3, Joback ESTIMATE
    coefficients  ({cpig[0]:.6g}  {cpig[1]:.6g}  {cpig[2]:.6e}  {cpig[3]:.6e});
    Trange        (273  1000);
}}

liquidHeatCapacity
{{
    model         polynomial;
    // Cp [J/(mol K)] = a0 + a1 T + a2 T^2, FITTED (provenance.liquidHeatCapacity)
    coefficients  ({'  '.join(f'{x:.10g}' for x in cpl)});
    Trange        ({cp['Tmin']:g}  {cp['Tmax']:g});
}}

groups
{{
    joback ( {jgroups} );
}}

provenance
{{
    MW
    {{
        origin        literature;
        method        "sum of IUPAC standard atomic weights over the formula";
    }}
""" + constant_entry("Tc", Tc, Tc_dois, Tc_all, "K") \
    + constant_entry("Pc", Pc, Pc_dois, [x / 100 for x in Pc_all], "bar",
                     "; the archive reports kPa, divided by 100") \
    + (constant_entry("Tb", Tb[0], Tb[1], Tb[2], "K",
                      "; boiling temperatures reported at 100 - 102.5 kPa") if Tb else "") \
    + omega_entry \
    + fit_entry("Vliq", rho, sha,
                "one-parameter fit of the engine's own liquid density, V(T) = Vliq Rackett(T)/Rackett(298.15 K) "
                "with this record's Tc, Pc, omega (ThermoPackage::density, liquid branch), to every measured "
                f"liquid mass density at or below {P_MAX_KPA:g} kPa; least squares in the relative density error, "
                "then its largest value minimised", "rho") \
    + fit_entry("liquidHeatCapacity", cp, sha,
                f"polynomial of degree {cp['deg']} in T fitted to every measured liquid isobaric heat capacity "
                f"at or below {P_MAX_KPA:g} kPa (specific values converted with MW); least squares in the "
                "relative error, then its largest value minimised", "Cp") \
    + f"""    idealGasHeatCapacity
    {{
        origin           estimated;
        method           "Joback";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        reproducedInCase "{REPRO_CASE}";
        uncertainty      {{ status unquantified; reason "Joback group contribution (Joback & Reid 1987); a few percent for Cp_ig of ordinary organics"; }}
    }}
    dHf_298
    {{
        origin           estimated;
        method           "Joback";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        reproducedInCase "{REPRO_CASE}";
        uncertainty      {{ status unquantified; reason "Joback group contribution (Joback & Reid 1987); several kJ/mol, more for polyfunctional molecules"; }}
        notes            "the ThermoML archive carries no enthalpy of formation or combustion block for this compound (searched)";
    }}
    s_298
    {{
        origin           estimated;
        method           "derived from Joback: s_298 = (dHf_298 - dGf_298)/298.15 + the sum of the elements' standard entropies, with Joback's dGf_298 = {J['dGf']:.0f} J/mol (not stored: dGf derives from dHf and s_298)";
        methodVersion    "{JTAB}";
        input            joback;
        inputFingerprint "{fp}";
        elementEntropies "{S_EL_CITE}";
        reproducedInCase "{REPRO_CASE}";
        uncertainty      {{ status unquantified; reason "inherits the errors of Joback's dHf_298 and dGf_298"; }}
    }}
    vaporPressure
    {{
        origin        predictive;
        method        "Ambrose-Walton corresponding states";
        methodVersion "choupo-aw-1989";
        uncertainty   "not quantified; validate against saturation data";
        notes         "computed from ChemSep Tc/Pc/omega";
    }}
}}
"""
    #  The vaporPressure provenance entry above is the EXACT text
    #  `bin/choupo-curate vp --promote` replaces (its AW_PROV, whose note
    #  names ChemSep); the promotion overwrites it with the fit's entry.
    return head, {"rho": rho, "cp": cp, "Tc": Tc, "Pc": Pc, "Tb": Tb, "omega": omega,
                  "J": J, "s298": s298, "ant": ant}


def splice_promoted_vp(old, new, p):
    """A record whose vapour pressure `bin/choupo-curate vp --promote` already
    replaced keeps THAT block and THAT provenance entry verbatim; everything
    else is rewritten by this tool."""
    blk = re.compile(r"^vaporPressure\n\{\n.*?\n\}\n", re.S | re.M)
    ent = re.compile(r"\n    vaporPressure\n    \{\n.*?\n    \}\n", re.S)
    ob, oe = blk.search(old), ent.search(old)
    if not (ob and oe and "promotedBy" in oe.group(0)):
        refuse(f"{p.relative_to(ROOT)}: its vapour pressure is neither the AmbroseWalton "
               "block nor one `vp --promote` wrote -- not rewritten")
    new = blk.sub(lambda _: ob.group(0), new, count=1)
    new = ent.sub(lambda _: oe.group(0), new, count=1)
    return new.replace("its promotion replaces the", "its promotion replaced the")


def main(argv):
    if not argv or argv[0] not in ("plan", "write"):
        print(__doc__)
        return 2
    keys = {c[1] for c in CANDIDATES}
    data, sha = harvest(keys)
    if argv[0] == "plan":
        for k, n, why in EXCLUDED:
            print(f"EXCLUDED  {n:<28} {why}")
        for n in HELD:
            print(f"HELD      {n:<28} 0.7 Tc beyond the measured vapour pressures by more "
                  f"than {OMEGA_MAX_EXTRAPOLATION_K:g} K")
        for c in CANDIDATES:
            d = data[c[1]]
            print(f"{c[0]:<24} Tc {len(d['Tc'])} Pc {len(d['Pc'])} Tb {len(d['Tboil'])} "
                  f"rho {len(d['rho'])} Cp {len(d['Cp']) + len(d['cp_spec'])}")
        return 0
    prov = "--provisional" in argv
    names = [a for a in argv[1:] if not a.startswith("--")]
    sel = ([c for c in CANDIDATES if c[0] not in HELD] if names == ["all"]
           else [c for c in CANDIDATES if c[0] in names])
    if not sel:
        refuse("no candidate named")
    for c in sel:
        text, facts = build(c, data, sha, prov)
        p = STD / f"{c[0]}.dat"
        if p.exists():
            old = p.read_text()
            if "C287" not in old:
                refuse(f"{p.relative_to(ROOT)} exists and was not written by this tool")
            if "model AmbroseWalton;" not in old:
                text = splice_promoted_vp(old, text, p)
        p.write_text(text)
        r, cp = facts["rho"], facts["cp"]
        print(f"{c[0]:<24} Tc {facts['Tc']:g} Pc {facts['Pc']:.4g} omega {facts['omega']:.4f} "
              f"Tb {facts['Tb'][0] if facts['Tb'] else '-'} | Vliq {r['value']:.4e} "
              f"max {r['max']:.2f}% ({grade(r['max'])}) n {len(r['kept'])}/{len(r['dropped'])} | "
              f"Cp deg {cp['deg']} max {cp['max']:.2f}% ({grade(cp['max'])}) n "
              f"{len(cp['kept'])}/{len(cp['dropped'])} | dHf {facts['J']['dHf']:.0f} "
              f"s298 {facts['s298']:.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
