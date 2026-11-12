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


def read_block(text, block, sub):
    """{A: .., B: ..} of `block { sub { ... } }` in a record, or None."""
    t = strip_comments(text)
    m = re.search(r"^" + block + r"\s*\{", t, re.M)
    if not m:
        return None
    seg = t[m.start():]
    sm = re.search(sub + r"\s*\{([^}]*)\}", seg)
    if not sm:
        return None
    return {k: float(v) for k, v in re.findall(r"(\w+)\s+([-+0-9.eE]+)\s*;", sm.group(1))}


def existing_value(text, prop, T):
    """The stored record evaluated with the engine's own form, or None."""
    if prop == "visc":
        d = read_block(text, "liquidViscosity", "chemsepEq101")
        if d:
            return math.exp(d["A"] + d["B"] / T + d.get("C", 0) * math.log(T) + (d.get("D", 0) * T ** d.get("E", 0) if d.get("D", 0) else 0))
        d = read_block(text, "liquidViscosity", "andrade")
        if d:
            return math.exp(d["A"] + d["B"] / T)
        d = read_block(text, "liquidViscosity", "vogel")
        if d:
            return math.exp(d["A"] + d["B"] / (T - d.get("C", 0)))
    else:
        d = read_block(text, "liquidThermalConductivity", "chemsepEq16")
        if d:
            return d["A"] + math.exp(d["B"] / T + d["C"] + d.get("D", 0) * T + d.get("E", 0) * T * T)
    return None


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
            f["dois"] = sorted({r["doi"] for r in f["kept"]})
            kc = collections.Counter(r["doi"] for r in f["kept"]); dc = collections.Counter(r["doi"] for r in f["dropped"])
            f["perDoi"] = {d: [kc.get(d, 0), dc.get(d, 0)] for d in sorted(set(kc) | set(dc))}
            f["nKept"] = len(f["kept"])
            f["nTemps"] = len({r["T"] for r in f["kept"]})
            if p != "sigma" and record_origin(c["text"], p) != "none":
                dev = []
                for r in f["kept"]:
                    ev = existing_value(c["text"], p, r["T"])
                    if ev:
                        dev.append(abs(ev / r["val"] - 1) * 100)
                if dev:
                    f["existingRecord"] = {"origin": record_origin(c["text"], p), "maxDevPct": max(dev), "meanDevPct": sum(dev) / len(dev), "n": len(dev)}
            ent[p] = f
            used |= {r["doi"] for r in f["kept"]} | {r["doi"] for r in f["dropped"]}
            if p == "sigma" and c["Tb"] and c["Pc"]:
                bb = [abs(brock_bird(c["Tc"], c["Pc"], c["Tb"], r["T"]) / r["val"] - 1) * 100 for r in f["kept"]]
                f["brockBird"] = {"max": max(bb), "mean": sum(bb) / len(bb)}
        if ent:
            ds["components"][name] = ent
    ds["sha"] = {d: hashlib.sha256((CACHE / (d + ".xml")).read_bytes()).hexdigest() for d in sorted(used)}
    for e in ds["components"].values():       # NO measured series in the tree (C287): the points are regenerated from the archive cache
        for f in e.values():
            f.pop("kept", None); f.pop("paramsLS", None)
    DATASET.parent.mkdir(parents=True, exist_ok=True)
    json.dump(ds, open(DATASET, "w"), indent=1, sort_keys=True)
    cnt = collections.Counter()
    for n, e in ds["components"].items():
        for p, f in e.items():
            cnt[(p, f["grade"])] += 1
    print(len(ds["components"]), "components fitted;", sorted(cnt.items()))


FIELDS = {"visc": ("liquidViscosity", "chemsepEq101"), "cond": ("liquidThermalConductivity", "chemsepEq16")}


def f10(x):
    return f"{x:.10g}"


def shippable(f, origin):
    return origin == "none" and f["grade"] in ("clean", "warning") and f["npar"] >= 2


def block_text(prop, f):
    bn, sub = FIELDS[prop]
    p = f["params"]
    if prop == "visc":
        A, B, C = (list(p) + [0.0, 0.0])[:3]
        rows = [("A", A), ("B", B), ("C", C), ("D", 0), ("E", 0)]
    else:
        C, B, D = (list(p) + [0.0, 0.0])[:3]
        rows = [("A", 0), ("B", B), ("C", C), ("D", D), ("E", 0)]
    body = "".join(f"        {k:<5} {f10(v)};\n" for k, v in rows)
    body += f"        Tmin  {f10(f['Tmin'])};\n        Tmax  {f10(f['Tmax'])};\n"
    return f"{bn}\n{{\n    {sub}\n    {{\n{body}    }}\n}}\n"


def prov_text(prop, f, sha):
    bn, sub = FIELDS[prop]
    unit = {"visc": "Pa.s", "cond": "W/(m.K)"}[prop]
    ev = "".join(f'                {{ doi "{d}"; articleSha256 "{sha[d]}"; pointsKept {k}; pointsDropped {x}; provenance measured; }}\n'
                 for d, (k, x) in sorted(f["perDoi"].items()))
    drop = "; ".join(f"{r['doi']} T={r['T']:g} K {unit}={r['val']:g} err {r['err']:+.1f} %" for r in f["dropped"]) or "none"
    form = ("ln(mu/Pa.s) = A + B/T + C ln T (chemsepEq101 with D = 0)" if prop == "visc"
            else "ln(k/(W/m/K)) = C + B/T + D T (chemsepEq16 with A = 0, E = 0)")
    cap = f"        fitGradeCap   ( {' '.join(f['caps'])} );   // DEV.md 4c C300 rule 2\n" if f["caps"] else ""
    return (f"    {bn}\n    {{\n"
            "        origin        fitted;\n"
            f'        method        "least squares on ln y of {form}, {f["npar"]} parameter(s), then the largest relative error minimised; every laboratory the archive holds for the pure liquid at <= 200 kPa; points beyond 15 % after the first stage discarded by name";\n'
            f'        fittedBy      "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4: nobody has reviewed it\n"
            f"        fitGrade      {f['grade']};   // DEV.md 4c C285 limits 5 / 10 / 20 % on the max relative error\n"
            "        fitGradeBasis inSample;   // DEV.md 4c C300 rule 1\n"
            + cap +
            f"        fitGradeMaxRelativeError_pct {f['max']:.6f};\n"
            f"        Trange        ({f10(f['Tmin'])} {f10(f['Tmax'])});   // K, the kept points -- outside it the engine announces an extrapolation\n"
            '        reviewReason  "regressed by a machine from archive-transcribed measurements; not yet read back against the articles";\n'
            '        reuse         "Choupo\'s own regression; the measured points belong to the cited articles and are not reproduced in this record or this tree (DEV.md 4c C327)";\n'
            f"        evidence\n        (\n{ev}        );\n"
            "        acceptance\n        {\n"
            "            verdict     accepted;\n"
            f"            studies     {f['nDois']};\n"
            f"            pointsKept  {f['nKept']};\n"
            f"            pointsDropped {len(f['dropped'])};\n"
            f'            dropped     "{drop}";\n'
            f"            aad_pct     {f['aad']:.6f};\n"
            f"            max_pct     {f['max']:.6f};\n"
            "        }\n    }\n")


def cmd_write(dry=False):
    ds = json.load(open(DATASET))
    nw = 0
    held = collections.Counter()
    written = []
    for name, ent in sorted(ds["components"].items()):
        path = STD / f"{name}.dat"
        text = path.read_text(encoding="utf-8")
        for prop in ("visc", "cond"):
            f = ent.get(prop)
            if not f:
                continue
            orig = record_origin(text, prop)
            if not shippable(f, orig):
                why = ("record exists" if orig != "none" else
                       f"grade {f['grade']}" if f["grade"] not in ("clean", "warning") else "single temperature")
                held[(prop, why)] += 1
                continue
            bt = block_text(prop, f)
            pt = prov_text(prop, f, ds["sha"])
            m = re.search(r"^provenance\s*\{", text, re.M)
            if m:
                text = text[:m.start()] + bt + "\n" + text[m.start():]
                k = text.rstrip().rfind("}")
                text = text[:k] + pt + text[k:]
            else:
                text = text.rstrip("\n") + "\n\n" + bt + "\nprovenance\n{\n" + pt + "}\n"
            written.append([name, prop, f["grade"]])
        if not dry:
            path.write_text(text, encoding="utf-8")
    print("written", len(written), dict(collections.Counter((p, g) for _, p, g in written)), "held", dict(held))
    if not dry:
        json.dump(written, open(BATCH / "constant" / "written.json", "w"))


def cmd_case():
    """The batch case: every written record loaded and evaluated at its window's ends and middle."""
    ds = json.load(open(DATASET))
    written = json.load(open(BATCH / "constant" / "written.json"))
    names = sorted({n for n, _, _ in written})
    (BATCH / "system").mkdir(parents=True, exist_ok=True)
    hdr = (ROOT / "data/curation/batches/new_components_c309/system/controlDict").read_text().split("*/")[0] + "*/\n"
    (BATCH / "transport_c327.cho").write_text("")
    (BATCH / "system" / "controlDict").write_text(
        hdr + 'application   choupoProps;\n'
        f'description   "C327: the {len(written)} liquid-transport records fitted from the ThermoML archive (viscosity chemsepEq101, conductivity chemsepEq16), each evaluated at the ends and the middle of its own window";\n'
        'verbosity     2;\n')
    (BATCH / "constant" / "thermoPhysPropDict").write_text(
        hdr + "/*  C327: components that received a fitted liquidViscosity / liquidThermalConductivity.  An ideal liquid:\n"
        "    every property asked is a pure-component one.  NOT sealed.  */\n\n"
        "recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n\n"
        "components       ( " + "  ".join(names) + " );\n\n"
        "equilibrium\n{\n    formulation gammaPhi;\n    liquid { activityModel { model ideal; } }\n    vapour { fugacityModel idealGas; }\n}\n")
    ops = ""
    for n, p, _ in written:
        f = ds["components"][n][p]
        key, model_, mk = (("viscosity_liquid", "chemsepEq101", "viscosity") if p == "visc"
                           else ("thermal_conductivity_liquid", "chemsepEq16", "thermalConductivity"))
        ops += ("    {\n"
                f"        name        {p}_{n};\n        type        propertyScan1D;\n"
                f"        vary        {{ variable T;  from {f10(f['Tmin'])} K;  to {f10(f['Tmax'])} K;  n 3; }}\n"
                f"        state       {{ P 1 bar;  composition {{ {n} 1.0; }} }}\n"
                f"        thermo      {{ transport {{ liquid {{ {mk} {{ model {model_}; }} }} }} }}\n"
                f"        properties  ( {key} );\n"
                f"        output      {{ file {p}_{n}.csv; }}\n    }}\n")
    (BATCH / "system" / "propsDict").write_text(
        hdr + "/*  transport_c327 -- DEV.md 4c C327.  Written by `bin/curate/transport_fit.py case`.\n"
        "    Each record the tool added to data/standards/components is loaded and evaluated at the two ends and the\n"
        "    middle of its own validity window (Tmin, Tmid, Tmax): every value must evaluate with NO extrapolation\n"
        "    announcement, which is the engine reading the window the record declares.  The records are reproduced\n"
        "    from the archive by `transport_fit.py verify` (gate check_transport_records).  Surface tension fits are\n"
        "    in constant/transportDataset.json only: the engine has no reader of a stored sigma(T) yet.  */\n\n"
        "operations\n(\n" + ops + ");\n")
    print("case written:", len(written), "scans,", len(names), "components")


def _parse_entry(text, bn):
    t = strip_comments(text)
    m = re.search(r"^provenance\s*\{", t, re.M)
    if not m:
        return None
    pm = re.search(r"^    " + bn + r"\s*\{(.*?)\n    \}", t[m.start():], re.M | re.S)
    return pm.group(1) if pm else None


def cmd_verify(refit=True):
    """Return non-zero on any failure; prints one line per failure."""
    fails = []
    ds = json.load(open(DATASET))
    written = json.load(open(BATCH / "constant" / "written.json"))
    cat = catalogue()
    refits = {}
    if refit and (CACHE / "index.json").exists() and (CACHE / "identity.json").exists():
        n2k = identity()
        keys = {n2k[n] for n, _, _ in written if n in n2k}
        data, sha, _ = harvest(keys)
        refits = {"data": data, "n2k": n2k, "sha": sha}
    for name, prop, grade_w in written:
        tag = f"{name}.{prop}"
        text = cat[name]["text"]
        f = ds["components"][name][prop]
        bn, sub = FIELDS[prop]
        d = read_block(text, bn, sub)
        ent = _parse_entry(text, bn)
        if d is None or ent is None:
            fails.append(f"{tag}: record or provenance entry missing"); continue
        p = f["params"]
        want = (dict(zip("ABC", (list(p) + [0, 0])[:3])) if prop == "visc" else
                dict(zip("CBD", (list(p) + [0, 0])[:3])))
        if prop == "cond":
            want["A"] = 0.0
        for k, v in want.items():
            if abs(d.get(k, 0) - v) > 1e-8 * (1 + abs(v)):
                fails.append(f"{tag}: {k} {d.get(k)} != dataset {v}")
        if abs(d["Tmin"] - f["Tmin"]) > 1e-9 or abs(d["Tmax"] - f["Tmax"]) > 1e-9:
            fails.append(f"{tag}: Tmin/Tmax differ from the data's range")
        if d.get("D", 0) != 0 and prop == "visc" or d.get("E", 0) != 0:
            fails.append(f"{tag}: D/E written non-zero")
        m = re.search(r"fitGrade\s+(\w+);", ent)
        g = grade(f["max"])
        caps = sorted(f["caps"])
        gg = "warning" if (g == "clean" and caps) else g
        if not m or m.group(1) != gg or gg != f["grade"]:
            fails.append(f"{tag}: fitGrade {m and m.group(1)} != rule {gg}")
        cm = re.search(r"fitGradeCap\s*\(([^)]*)\)", ent)
        if sorted(cm.group(1).split() if cm else []) != (caps if g == "clean" else []):
            fails.append(f"{tag}: fitGradeCap label disagrees with the evidence")
        if "fitGradeBasis inSample" not in ent.replace("  ", " ") and not re.search(r"fitGradeBasis\s+inSample", ent):
            fails.append(f"{tag}: fitGradeBasis inSample missing")
        if not re.search(r"review\s*\{\s*by\s+none;", ent):
            fails.append(f"{tag}: review {{ by none; }} missing")
        if not re.search(r"origin\s+fitted;", ent):
            fails.append(f"{tag}: origin fitted missing")
        tr = re.search(r"Trange\s*\(\s*(\S+)\s+(\S+)\s*\)", ent)
        if not tr or abs(float(tr.group(1)) - d["Tmin"]) > 1e-9 or abs(float(tr.group(2)) - d["Tmax"]) > 1e-9:
            fails.append(f"{tag}: provenance Trange differs from the record window")
        if f["grade"] not in ("clean", "warning") or f["npar"] < 2:
            fails.append(f"{tag}: shipped though grade {f['grade']} / {f['npar']} parameter(s)")
        # the stored curve must reproduce the stated max error at the window's ends (self-consistency of the written numbers)
        mp = re.search(r"fitGradeMaxRelativeError_pct\s+(\S+);", ent)
        if not mp or abs(float(mp.group(1)) - f["max"]) > 1e-5:
            fails.append(f"{tag}: stated max error differs from the dataset")
        if refits:
            k = refits["n2k"].get(name)
            u, _ = eligible(refits["data"].get(k, {}).get(prop, []), cat[name]["Tc"])
            r = fit_prop(prop, u)
            if not r:
                fails.append(f"{tag}: refit impossible"); continue
            for a, b in zip(r["params"], f["params"]):
                if abs(a - b) > 1e-6 * (1 + abs(b)):
                    fails.append(f"{tag}: refit param {a} != stored {b}"); break
            if abs(r["max"] - f["max"]) > 1e-4 or r["Tmin"] != f["Tmin"] or r["Tmax"] != f["Tmax"]:
                fails.append(f"{tag}: refit max/window differ (max {r['max']:.4f} vs {f['max']:.4f})")
    for n, prop, _ in written:
        pass
    arm = ("each record REFIT from the ThermoML archive cache (parameters, window and max error equal the stored ones at 1e-6)"
           if refits else "the archive refit arm was NOT RUN (no ThermoML cache reachable) -- only the dataset-vs-record arms ran")
    if fails:
        print(f"check_transport_records: FAIL -- {len(fails)} failure(s) over {len(written)} record(s)")
    else:
        print(f"check_transport_records: OK -- {len(written)} fitted liquid-viscosity / liquid-thermal-conductivity record(s) held to the dataset "
              f"(parameters, window, D/E written as zero, review by none, fitGradeBasis inSample, grade limits 5/10/20 %, C300 cap words, "
              f"Trange = window, nothing below warning or with one parameter), and, when the ThermoML archive cache is reachable, each "
              "refit from it (parameters, window and max error equal the stored ones at 1e-6).  NOT CHECKED: that a fit agrees with the "
              "articles' own tables (a machine read them), surface tension (its own arm, `verify --surface-tension`), any molecule outside the written records.")
        print("  " + arm)
    for x in fails:
        print("  FAIL", x)
    return 1 if fails else 0


# ---- surface tension (C328): sigma = A tau^n + B tau^(n+1), A = s0, B = 0 ----------------------------------------
def sigma_block_text(f):
    rows = [("A", f["s0"]), ("B", 0), ("Tc", f["Tc"]), ("n", f["n"]), ("Tmin", f["Tmin"]), ("Tmax", f["Tmax"])]
    body = "".join(f"    {k:<5} {f10(v)};\n" for k, v in rows)
    return f"surfaceTension\n{{\n{body}}}\n"


def sigma_prov_text(f, sha):
    ev = "".join(f'                {{ doi "{d}"; articleSha256 "{sha[d]}"; pointsKept {k}; pointsDropped {x}; provenance measured; }}\n'
                 for d, (k, x) in sorted(f["perDoi"].items()))
    drop = "; ".join(f"{r['doi']} T={r['T']:g} K sigma/(N/m)={r['val']:g} err {r['err']:+.1f} %" for r in f["dropped"]) or "none"
    cap = f"        fitGradeCap   ( {' '.join(f['caps'])} );   // DEV.md 4c C300 rule 2\n" if f["caps"] else ""
    return ("    surfaceTension\n    {\n"
            "        origin        fitted;\n"
            '        method        "least squares on ln sigma of sigma/(N/m) = A tau^n, tau = 1 - T/Tc (A, n; B = 0; Tc the record\'s own), then the largest relative error minimised; every laboratory the archive holds for the pure liquid at <= 200 kPa; points beyond 15 % after the first stage discarded by name";\n'
            f'        fittedBy      "{TOOL}";\n'
            "        reviewStatus  autoPromoted;\n"
            "        review        { by none; }   // DEV.md 4c C300 rule 4: nobody has reviewed it\n"
            f"        fitGrade      {f['grade']};   // DEV.md 4c C285 limits 5 / 10 / 20 % on the max relative error\n"
            "        fitGradeBasis inSample;   // DEV.md 4c C300 rule 1\n"
            + cap +
            f"        fitGradeMaxRelativeError_pct {f['max']:.6f};\n"
            f"        Trange        ({f10(f['Tmin'])} {f10(f['Tmax'])});   // K, the kept points -- outside it the engine announces an extrapolation\n"
            '        reviewReason  "regressed by a machine from archive-transcribed measurements; not yet read back against the articles";\n'
            '        reuse         "Choupo\'s own regression; the measured points belong to the cited articles and are not reproduced in this record or this tree (DEV.md 4c C328)";\n'
            f"        evidence\n        (\n{ev}        );\n"
            "        acceptance\n        {\n"
            "            verdict     accepted;\n"
            f"            studies     {f['nDois']};\n"
            f"            pointsKept  {f['nKept']};\n"
            f"            pointsDropped {len(f['dropped'])};\n"
            f'            dropped     "{drop}";\n'
            f"            aad_pct     {f['aad']:.6f};\n"
            f"            max_pct     {f['max']:.6f};\n"
            "        }\n    }\n")


def cmd_write_sigma(dry=False):
    ds = json.load(open(DATASET))
    held = collections.Counter()
    written = []
    for name, ent in sorted(ds["components"].items()):
        f = ent.get("sigma")
        if not f:
            continue
        path = STD / f"{name}.dat"
        text = path.read_text(encoding="utf-8")
        if re.search(r"^surfaceTension\s*\{", strip_comments(text), re.M):
            held[("sigma", "record exists")] += 1
            continue
        if f["grade"] not in ("clean", "warning"):
            held[("sigma", f"grade {f['grade']}")] += 1
            continue
        bt, pt = sigma_block_text(f), sigma_prov_text(f, ds["sha"])
        m = re.search(r"^provenance\s*\{", text, re.M)
        if m:
            text = text[:m.start()] + bt + "\n" + text[m.start():]
            k = text.rstrip().rfind("}")
            text = text[:k] + pt + text[k:]
        else:
            text = text.rstrip("\n") + "\n\n" + bt + "\nprovenance\n{\n" + pt + "}\n"
        written.append([name, "sigma", f["grade"]])
        if not dry:
            path.write_text(text, encoding="utf-8")
    print("written", len(written), dict(collections.Counter(g for _, _, g in written)), "held", dict(held))
    if not dry:
        json.dump(written, open(BATCH / "constant" / "writtenSigma.json", "w"))


def read_block_flat(text, block):
    t = strip_comments(text)
    m = re.search(r"^" + block + r"\s*\{([^}]*)\}", t, re.M)
    if not m:
        return None
    return {k: float(v) for k, v in re.findall(r"(\w+)\s+([-+0-9.eE]+)\s*;", m.group(1))}


def check_sigma_record(name, text, f):
    """Failures of one stored surfaceTension record against its dataset entry (pure on text, so the sabotages run on it)."""
    fails = []
    tag = f"{name}.sigma"
    d = read_block_flat(text, "surfaceTension")
    ent = _parse_entry(text, "surfaceTension")
    if d is None or ent is None:
        return [f"{tag}: record or provenance entry missing"]
    want = {"A": f["s0"], "B": 0.0, "Tc": f["Tc"], "n": f["n"]}
    for k, v in want.items():
        if abs(d.get(k, 1e300) - v) > 1e-8 * (1 + abs(v)):
            fails.append(f"{tag}: {k} {d.get(k)} != dataset {v}")
    if abs(d.get("Tmin", -1) - f["Tmin"]) > 1e-9 or abs(d.get("Tmax", -1) - f["Tmax"]) > 1e-9:
        fails.append(f"{tag}: Tmin/Tmax differ from the data's range")
    g = grade(f["max"])
    caps = sorted(f["caps"])
    gg = "warning" if (g == "clean" and caps) else g
    m = re.search(r"fitGrade\s+(\w+);", ent)
    if not m or m.group(1) != gg or gg != f["grade"]:
        fails.append(f"{tag}: fitGrade {m and m.group(1)} != rule {gg}")
    cm = re.search(r"fitGradeCap\s*\(([^)]*)\)", ent)
    if sorted(cm.group(1).split() if cm else []) != (caps if g == "clean" else []):
        fails.append(f"{tag}: fitGradeCap label disagrees with the evidence")
    if not re.search(r"fitGradeBasis\s+inSample", ent):
        fails.append(f"{tag}: fitGradeBasis inSample missing")
    if not re.search(r"review\s*\{\s*by\s+none;", ent):
        fails.append(f"{tag}: review {{ by none; }} missing")
    if not re.search(r"origin\s+fitted;", ent):
        fails.append(f"{tag}: origin fitted missing")
    tr = re.search(r"Trange\s*\(\s*(\S+)\s+(\S+)\s*\)", ent)
    if not tr or abs(float(tr.group(1)) - d.get("Tmin", -1)) > 1e-9 or abs(float(tr.group(2)) - d.get("Tmax", -1)) > 1e-9:
        fails.append(f"{tag}: provenance Trange differs from the record window")
    if f["grade"] not in ("clean", "warning"):
        fails.append(f"{tag}: shipped though grade {f['grade']}")
    mp = re.search(r"fitGradeMaxRelativeError_pct\s+(\S+);", ent)
    if not mp or abs(float(mp.group(1)) - f["max"]) > 1e-5:
        fails.append(f"{tag}: stated max error differs from the dataset")
    return fails


def sigma_sabotages(text):
    """Three sabotages BY NAME, applied to the record text in memory: the checker must refuse each."""
    out = {}
    out["parameter-A-changed"] = re.sub(r"(^    A\s+)(\S+);", lambda m: m.group(1) + f10(float(m.group(2)) * 1.01) + ";", text, count=1, flags=re.M)
    k = text.rfind("\n    surfaceTension\n")   # the surfaceTension provenance entry, not another property's
    out["grade-label-flipped"] = text[:k] + re.sub(r"fitGrade\s+(clean|warning);", lambda m: "fitGrade " + ("severe" if m.group(1) == "clean" else "clean") + ";", text[k:], count=1)
    out["window-moved"] = re.sub(r"(^    Tmax\s+)(\S+);", lambda m: m.group(1) + f10(float(m.group(2)) + 5) + ";", text, count=1, flags=re.M)
    return out


def cmd_verify_sigma(refit=True):
    fails = []
    ds = json.load(open(DATASET))
    written = json.load(open(BATCH / "constant" / "writtenSigma.json"))
    cat = catalogue()
    refits = {}
    if refit and (CACHE / "index.json").exists() and (CACHE / "identity.json").exists():
        n2k = identity()
        keys = {n2k[n] for n, _, _ in written if n in n2k}
        data, _, _ = harvest(keys)
        refits = {"data": data, "n2k": n2k}
    for name, _, _ in written:
        text = cat[name]["text"]
        f = ds["components"][name]["sigma"]
        fails += check_sigma_record(name, text, f)
        if refits:
            k = refits["n2k"].get(name)
            u, _ = eligible(refits["data"].get(k, {}).get("sigma", []), cat[name]["Tc"])
            r = fit_sigma(u, cat[name]["Tc"])
            if not r:
                fails.append(f"{name}.sigma: refit impossible"); continue
            if abs(r["s0"] - f["s0"]) > 1e-6 * (1 + abs(f["s0"])) or abs(r["n"] - f["n"]) > 1e-6 * (1 + abs(f["n"])):
                fails.append(f"{name}.sigma: refit parameters differ from the stored ones")
            if abs(r["max"] - f["max"]) > 1e-4 or r["Tmin"] != f["Tmin"] or r["Tmax"] != f["Tmax"]:
                fails.append(f"{name}.sigma: refit max/window differ (max {r['max']:.4f} vs {f['max']:.4f})")
    # THE SABOTAGES: the checker must catch each, on a record it passes unsabotaged
    probe = next((n for n, _, g in written if g == "clean"), written[0][0])
    ptext, pf = cat[probe]["text"], ds["components"][probe]["sigma"]
    if check_sigma_record(probe, ptext, pf):
        fails.append(f"{probe}.sigma: the unsabotaged probe already fails (cannot test the sabotages)")
    caught = []
    for sname, stext in sorted(sigma_sabotages(ptext).items()):
        if stext == ptext or not check_sigma_record(probe, stext, pf):
            fails.append(f"sabotage '{sname}' NOT caught by the surface-tension arm")
        else:
            caught.append(sname)
    arm = ("each record REFIT from the ThermoML archive cache (A, n, window and max error equal the stored ones at 1e-6)"
           if refits else "the archive refit arm was NOT RUN (no ThermoML cache reachable) -- only the dataset-vs-record arms ran")
    if fails:
        print(f"check_transport_records surfaceTension: FAIL -- {len(fails)} failure(s) over {len(written)} record(s)")
    else:
        print(f"check_transport_records surfaceTension: OK -- {len(written)} stored surfaceTension record(s) held to the dataset "
              f"(A, B = 0, Tc, n, window, review by none, fitGradeBasis inSample, grade limits 5/10/20 %, C300 cap words, Trange = window, "
              f"nothing below warning), and 3 sabotages caught by name ({', '.join(caught)}).  NOT CHECKED: that a fit agrees with the "
              "articles' own tables, any molecule outside the written records.")
        print("  " + arm)
    for x in fails:
        print("  FAIL", x)
    return 1 if fails else 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "census":
        cmd_census()
    elif cmd == "fit":
        cmd_fit()
    elif cmd == "write" and "--surface-tension" in sys.argv:
        cmd_write_sigma("--dry" in sys.argv)
    elif cmd == "write":
        cmd_write("--dry" in sys.argv)
    elif cmd == "case":
        cmd_case()
    elif cmd == "verify" and "--surface-tension" in sys.argv:
        sys.exit(cmd_verify_sigma("--no-refit" not in sys.argv))
    elif cmd == "verify":
        sys.exit(cmd_verify("--no-refit" not in sys.argv))
    else:
        print(__doc__)
        sys.exit(2 if cmd else 0)
