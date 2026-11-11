#!/usr/bin/env python3
"""transport_fit.py -- DEV.md 4c C327: liquid viscosity, liquid thermal
conductivity and surface tension of catalogue components, fitted from the
ThermoML archive under the C283/C285/C300 protocol.

  census   per-component funnel (docs/audits/2026-11-11-transport-thermoml-census.tsv)
  fit      fit every component with measured data -> the batch dataset
           (data/curation/batches/transport_c327/constant/transportDataset.json)
  write    edit data/standards/components/<name>.dat (a source edit by a tool;
           the engine itself refuses to write there, records::refuseStandardsWrite)
           for the fits that may ship
  verify   recompute every shipped record from the dataset (the gate's core)

Engine forms (read at src/thermo/transport/):
  viscosity     chemsepEq101  mu = exp(A + B/T + C ln T + D T^E)  (ChemSepVisc101.cpp kernel)
                written with A, B, C and D = 0
  conductivity  chemsepEq16   k = A + exp(B/T + C + D T + E T^2)  (ChemSepCond16.cpp kernel)
                written with A = 0, B, C, D (E = 0)
  surface tension  NO reader of a stored curve (SurfaceTensionModel: BrockBird
                only); sigma = s0 (1 - T/Tc)^n is fitted into the dataset ONLY.

Points: one-component blocks, liquid phase, variables only T and P, P <= 200 kPa
(absent P kept), T < Tc.  Limits (5/10/20 %), outlier rule (15 %) and grade
function are those of c287_new_components (one home).  Every laboratory (DOI)
is fitted; least squares on ln y, outliers dropped by name, then the largest
relative error minimised.  `fitGradeBasis inSample`; clean needs >= 2
temperatures AND >= 2 laboratories (C300 rule 2) else warning + fitGradeCap.
"""
import collections, hashlib, json, math, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import c287_new_components as c287  # noqa: E402

TOOL = "bin/curate/transport_fit.py"
CACHE = c287.CACHE
STD = c287.STD
LIMITS = c287.LIMITS
OUTLIER_PCT = c287.OUTLIER_PCT
P_MAX_KPA = c287.P_MAX_KPA
grade = c287.grade
BATCH = ROOT / "data" / "curation" / "batches" / "transport_c327"
DATASET = BATCH / "constant" / "transportDataset.json"
CENSUS = ROOT / "docs" / "audits" / "2026-11-11-transport-thermoml-census.tsv"

PROPS = {
    "viscosity, pa*s": "visc",
    "thermal conductivity, w/m/k": "cond",
    "surface tension liquid-gas, n/m": "sigma",
}
DIFF = ("binary diffusion coefficient", "tracer diffusion coefficient", "self diffusion coefficient")
BLOCK = {"visc": "liquidViscosity", "cond": "liquidThermalConductivity"}


def fam(name, phases):
    p = name.lower()
    for k, v in PROPS.items():
        if p.startswith(k):
            if v == "sigma" or any("Liquid" in x for x in phases):
                return v
    return None


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def catalogue():
    out = {}
    for p in sorted(STD.glob("*.dat")):
        raw = p.read_text(encoding="utf-8", errors="replace")
        t = strip_comments(raw)
        def w(k):
            m = re.search(r"(^|\s)" + k + r"\s+([^;\s]+)\s*;", t)
            return float(m.group(2)) if m else None
        out[p.stem] = {"text": raw, "clean": t, "Tc": w("Tc"), "Pc": w("Pc"), "Tb": w("Tb")}
    return out


def identity():
    idn = json.loads((CACHE / "identity.json").read_text())
    name2key = {}
    for k, ns in idn["byInchiKey"].items():
        for n in ns:
            name2key[n] = k
    return name2key


def record_origin(text, prop):
    """none / measured / fitted / estimated / literature of the stored record."""
    bn = BLOCK[prop]
    t = strip_comments(text)
    if not re.search(r"^" + bn + r"\s*\{", t, re.M):
        return "none"
    m = re.search(r"^provenance\s*\{", t, re.M)
    if m:
        pm = re.search(r"^    " + bn + r"\s*\{(.*?)\n    \}", t[m.start():], re.M | re.S)
        if pm:
            o = re.search(r"origin\s+(\w+)", pm.group(1))
            if o:
                return {"regressed": "fitted"}.get(o.group(1), o.group(1))
    return "literature"      # ChemSep compilation (Artistic-2.0) or a hand-cited literature fit


def harvest(keys):
    ix = json.loads((CACHE / "index.json").read_text())
    dois = set()
    for e in ix["entries"]:
        decl = " ".join(e.get("propertiesDeclared", [])).lower()
        if not any(w in decl for w in ("viscosity, pa", "thermal conductivity", "surface tension", "diffusion coefficient")):
            continue
        if any(c.get("inchikey") in keys for c in e.get("compounds", [])):
            dois.add(e["doi"])
    out = {k: collections.defaultdict(list) for k in keys}
    diff = []
    sha = {}
    R = c287
    for doi in sorted(dois):
        path = CACHE / (doi + ".xml")
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8", errors="replace")
        org = {}
        for c in R.RE_CMP.findall(t):
            o, k = R.RE_ORG.search(c), R.RE_KEY.search(c)
            if o and k:
                org[o.group(1)] = k.group(1).strip()
        for b in R.RE_BLK.findall(t):
            cs = R.RE_COMP.findall(b)
            props = {}
            for p in R.RE_PROP.findall(b):
                n, m = R.RE_PN.search(p), R.RE_PNUM.search(p)
                if n and m:
                    props[m.group(1)] = (n.group(1), R.RE_PPH.findall(p))
            if len(cs) >= 2:
                dn = [n for n, _ in props.values() if n.lower().startswith(DIFF)]
                if dn:
                    ks = [org.get(R.RE_ORG.search(c).group(1)) for c in cs if R.RE_ORG.search(c)]
                    diff.append((doi, dn[0], ks))
                continue
            if len(cs) != 1:
                continue
            o = R.RE_ORG.search(cs[0])
            if not o or org.get(o.group(1)) not in keys:
                continue
            k = org[o.group(1)]
            vars_ = {}
            for v in R.RE_VAR.findall(b):
                m, vt = R.RE_VNUM.search(v), R.RE_VT.search(v)
                if m and vt:
                    vars_[m.group(1)] = vt.group(1)
            for nv in R.RE_NV.findall(b):
                vv = {}
                for x in R.RE_VV.findall(nv):
                    m, val = R.RE_VNUM.search(x), R.RE_VVAL.search(x)
                    if m and val and m.group(1) in vars_:
                        try:
                            vv[vars_[m.group(1)]] = float(val.group(1))
                        except ValueError:
                            pass
                if set(vv) - {"Temperature, K", "Pressure, kPa"}:
                    continue
                for pv in R.RE_PV.findall(nv):
                    m, val = R.RE_PNUM.search(pv), R.RE_PVAL.search(pv)
                    if not (m and val) or m.group(1) not in props:
                        continue
                    f = fam(*props[m.group(1)])
                    if not f:
                        continue
                    try:
                        v = float(val.group(1))
                    except ValueError:
                        continue
                    out[k][f].append({"doi": doi, "T": vv.get("Temperature, K"), "P": vv.get("Pressure, kPa"), "val": v})
                    sha[doi] = None
    for doi in sha:
        sha[doi] = hashlib.sha256((CACHE / (doi + ".xml")).read_bytes()).hexdigest()
    return out, sha, diff


def usable(rows, Tc):
    return [r for r in rows if r["T"] is not None and r["val"] > 0 and (r["P"] is None or r["P"] <= P_MAX_KPA)
            and (Tc is None or r["T"] < Tc)]


def eligible(rows, Tc):
    u = usable(rows, Tc)
    c = collections.Counter(r["doi"] for r in u)
    return u, (max(c.values()) if c else 0)


# ---------------------------------------------------------------- fits
def solve_ls(X, y):
    n = len(X[0])
    A = [[sum(X[k][i] * X[k][j] for k in range(len(X))) for j in range(n)] for i in range(n)]
    b = [sum(X[k][i] * y[k] for k in range(len(X))) for i in range(n)]
    for i in range(n):
        A[i][i] += 1e-12 * (1 + abs(A[i][i]))
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(A[r][i]))
        A[i], A[p] = A[p], A[i]; b[i], b[p] = b[p], b[i]
        for r in range(i + 1, n):
            f = A[r][i] / A[i][i]
            for c in range(i, n):
                A[r][c] -= f * A[i][c]
            b[r] -= f * b[i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (b[i] - sum(A[i][j] * x[j] for j in range(i + 1, n))) / A[i][i]
    return x


def basis(prop, T, npar):
    if prop == "visc":      # ln mu = A + B/T [+ C ln T]
        return [1.0, 1.0 / T, math.log(T)][:npar]
    return [1.0, 1.0 / T, T][:npar]   # cond with A=0: ln k = C + B/T [+ D T]; order (C, B, D)


def model(prop, p, T):
    return math.exp(sum(a * b for a, b in zip(p, basis(prop, T, len(p)))))


def nelder_mead(fn, x0, step, iters=3000):
    n = len(x0)
    pts = [list(x0)] + [[x0[j] + (step[j] if j == i else 0) for j in range(n)] for i in range(n)]
    vals = [fn(p) for p in pts]
    for _ in range(iters):
        o = sorted(range(n + 1), key=lambda i: vals[i]); pts = [pts[i] for i in o]; vals = [vals[i] for i in o]
        c = [sum(p[j] for p in pts[:-1]) / n for j in range(n)]
        xr = [c[j] + (c[j] - pts[-1][j]) for j in range(n)]; fr = fn(xr)
        if fr < vals[0]:
            xe = [c[j] + 2 * (c[j] - pts[-1][j]) for j in range(n)]; fe = fn(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = [c[j] + 0.5 * (pts[-1][j] - c[j]) for j in range(n)]; fc = fn(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                for i in range(1, n + 1):
                    pts[i] = [pts[0][j] + 0.5 * (pts[i][j] - pts[0][j]) for j in range(n)]; vals[i] = fn(pts[i])
        if max(vals) - min(vals) < 1e-14:
            break
    i = min(range(n + 1), key=lambda i: vals[i])
    return pts[i]


def relerr(prop, p, pts):
    return [abs(model(prop, p, r["T"]) / r["val"] - 1.0) * 100 for r in pts]


def fit_prop(prop, pts):
    Ts = sorted({r["T"] for r in pts})
    span = Ts[-1] - Ts[0]
    n = len(pts)
    npar = 3 if (n >= 6 and span >= 30 and len(Ts) >= 4) else (2 if (len(Ts) >= 2 and span >= 5) else 1)

    def ls(P, npar):
        return solve_ls([basis(prop, r["T"], npar) for r in P], [math.log(r["val"]) for r in P])
    p = ls(pts, npar)
    errs = relerr(prop, p, pts)
    keep = [r for r, e in zip(pts, errs) if e <= OUTLIER_PCT]
    dropped = [dict(r, err=(model(prop, p, r["T"]) / r["val"] - 1) * 100) for r, e in zip(pts, errs) if e > OUTLIER_PCT]
    if not keep:
        return None
    if dropped:
        Tk = sorted({r["T"] for r in keep})
        npar = min(npar, len(Tk), 3)
        if npar == 2 and Tk[-1] - Tk[0] < 5:
            npar = 1
        p = ls(keep, npar)
    fn = lambda q: max(relerr(prop, q, keep))
    sc = [max(abs(v), 1.0) * 0.01 for v in p]
    q = nelder_mead(fn, p, sc) if len(p) > 1 else p
    best = q if fn(q) < fn(p) else p
    e = relerr(prop, best, keep)
    return {"npar": len(best), "params": best, "paramsLS": p, "max": max(e), "aad": sum(e) / len(e),
            "kept": keep, "dropped": dropped, "Tmin": min(r["T"] for r in keep), "Tmax": max(r["T"] for r in keep)}


def fit_sigma(pts, Tc):
    pts = [r for r in pts if r["T"] < Tc]
    if len({r["T"] for r in pts}) < 3:
        return None
    ls = lambda P: solve_ls([[1.0, math.log(1 - r["T"] / Tc)] for r in P], [math.log(r["val"]) for r in P])
    m = lambda p, T: math.exp(p[0] + p[1] * math.log(1 - T / Tc))
    p = ls(pts)
    errs = [abs(m(p, r["T"]) / r["val"] - 1) * 100 for r in pts]
    keep = [r for r, e in zip(pts, errs) if e <= OUTLIER_PCT]
    dropped = [dict(r, err=(m(p, r["T"]) / r["val"] - 1) * 100) for r, e in zip(pts, errs) if e > OUTLIER_PCT]
    if len({r["T"] for r in keep}) < 3:
        return None
    if dropped:
        p = ls(keep)
    fn = lambda q: max(abs(m(q, r["T"]) / r["val"] - 1) * 100 for r in keep)
    q = nelder_mead(fn, p, [abs(p[0]) * 0.01 + 0.01, 0.01])
    best = q if fn(q) < fn(p) else p
    e = [abs(m(best, r["T"]) / r["val"] - 1) * 100 for r in keep]
    return {"s0": math.exp(best[0]), "n": best[1], "Tc": Tc, "max": max(e), "aad": sum(e) / len(e),
            "kept": keep, "dropped": dropped, "Tmin": min(r["T"] for r in keep), "Tmax": max(r["T"] for r in keep)}


def brock_bird(Tc, Pc_bar, Tb, T):
    """Reid-Prausnitz-Poling Brock-Bird, the form read at src/thermo/transport/BrockBird.cpp."""
    Tr, Tbr = T / Tc, Tb / Tc
    Q = 0.1196 * (1 + Tbr * math.log(Pc_bar / 1.01325) / (1 - Tbr)) - 0.279
    return 1e-3 * Pc_bar ** (2 / 3) * Tc ** (1 / 3) * Q * (1 - Tr) ** (11 / 9)


def cap_words(kept):
    ws = []
    if len({r["T"] for r in kept}) < 2:
        ws.append("singleTemperature")
    if len({r["doi"] for r in kept}) < 2:
        ws.append("singleLaboratory")
    return ws


def final_grade(maxerr, kept):
    g = grade(maxerr)
    caps = cap_words(kept)
    if g == "clean" and caps:
        return "warning", caps
    return g, []


def run_all():
    cat = catalogue()
    n2k = identity()
    keys = {n2k[n] for n in cat if n in n2k}
    data, sha, diff = harvest(keys)
    k2n = {n2k[n]: n for n in cat if n in n2k}
    return cat, n2k, k2n, data, sha, diff


def cmd_census():
    cat, n2k, k2n, data, sha, diff = run_all()
    rows = []
    funnel = {p: collections.Counter() for p in ("visc", "cond", "sigma")}
    for name, c in cat.items():
        r = {"component": name, "inchikey": n2k.get(name, "")}
        for p in ("visc", "cond", "sigma"):
            rr = data.get(n2k.get(name), {}).get(p, []) if name in n2k else []
            u, mx = eligible(rr, c["Tc"])
            ok = mx >= 5
            r[p + "_pts"] = len(u) if ok else 0
            r[p + "_dois"] = len({x["doi"] for x in u}) if ok else 0
            if p != "sigma":
                o = record_origin(c["text"], p)
                r[p + "_origin"] = o
                have = o != "none"
                if have and ok:
                    k = "have-record+measured-data"
                elif have:
                    k = "have-record-no-data"
                elif ok:
                    k = "NO-record+measured-data"
                else:
                    k = "no-record-no-data"
                funnel[p][k] += 1
                if have and ok and o == "estimated":
                    funnel[p]["measured-data-but-record-is-estimate"] += 1
                funnel[p]["origin:" + o] += 1
            else:
                funnel[p]["measured-data" if ok else "no-data"] += 1
        rows.append(r)
    cols = ["component", "inchikey", "visc_pts", "visc_dois", "visc_origin", "cond_pts", "cond_dois", "cond_origin", "sigma_pts", "sigma_dois"]
    CENSUS.parent.mkdir(parents=True, exist_ok=True)
    with open(CENSUS, "w") as f:
        f.write("\t".join(cols) + "\n")
        for r in rows:
            f.write("\t".join(str(r.get(c, "")) for c in cols) + "\n")
    print(f"catalogue components {len(cat)}; with identity (InChIKey) {len(k2n)}")
    for p, c in funnel.items():
        print(p, dict(c))
    pairs = collections.Counter()
    kinds = collections.Counter()
    for doi, nm, ks in diff:
        kinds[nm] += 1
        cs = sorted({k2n[k] for k in ks if k in k2n})
        if len(cs) >= 2:
            pairs[tuple(cs[:2])] += 1
    print("multi-component diffusion blocks:", dict(kinds), "; blocks with >=2 catalogue comps:", sum(pairs.values()), "; distinct pairs", len(pairs))
    src = "".join((ROOT / "src/thermo/transport" / f).read_text() for f in ("DiffusivityModel.cpp", "LiquidDiffusivityModel.cpp"))
    print("engine diffusivity registrations:", sorted(set(a or b for a, b in re.findall(r'register(?:Type|Model)\("(\w+)"', src) and [(x, "") for x in re.findall(r'register(?:Type|Model)\("(\w+)"', src)])))


def cmd_fit():
    cat, n2k, k2n, data, sha, diff = run_all()
    ds = {"tool": TOOL, "components": {}, "sha": {}}
    used = set()
    for name, c in cat.items():
        if name not in n2k:
            continue
        ent = {}
        for p in ("visc", "cond", "sigma"):
            rr = data.get(n2k[name], {}).get(p, [])
            u, mx = eligible(rr, c["Tc"])
            if mx < 5:
                continue
            if p == "sigma":
                if not c["Tc"]:
                    continue
                f = fit_sigma(u, c["Tc"])
            else:
                f = fit_prop(p, u)
            if not f:
                continue
            g, caps = final_grade(f["max"], f["kept"])
            f["grade"], f["caps"] = g, caps
            f["nDois"] = len({r["doi"] for r in f["kept"]})
            ent[p] = f
            used |= {r["doi"] for r in f["kept"]} | {r["doi"] for r in f["dropped"]}
            if p == "sigma" and c["Tb"] and c["Pc"]:
                bb = [abs(brock_bird(c["Tc"], c["Pc"], c["Tb"], r["T"]) / r["val"] - 1) * 100 for r in f["kept"]]
                f["brockBird"] = {"max": max(bb), "mean": sum(bb) / len(bb)}
        if ent:
            ds["components"][name] = ent
    ds["sha"] = {d: hashlib.sha256((CACHE / (d + ".xml")).read_bytes()).hexdigest() for d in sorted(used)}
    DATASET.parent.mkdir(parents=True, exist_ok=True)
    json.dump(ds, open(DATASET, "w"), indent=1, sort_keys=True)
    cnt = collections.Counter()
    for n, e in ds["components"].items():
        for p, f in e.items():
            cnt[(p, f["grade"])] += 1
    print(len(ds["components"]), "components fitted;", sorted(cnt.items()))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "census":
        cmd_census()
    elif cmd == "fit":
        cmd_fit()
    else:
        print(__doc__)
        sys.exit(2 if cmd else 0)
