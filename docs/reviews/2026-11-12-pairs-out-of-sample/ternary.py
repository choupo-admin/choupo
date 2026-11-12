#!/usr/bin/env python3
"""ternary.py ROOT ARCHIVE_DIR SCAN_JSON WORKDIR OUTDIR

Part (B) of the review 2026-11-12-pairs-out-of-sample: ternary VLE of the
ThermoML archive predicted from the catalogue's three BINARY pairs of one
model, nothing fitted.  Isobaric points (P held in the block): bubble T at
(x, P) and the vapour y.  Isothermal points: bubble P = sum x gamma Psat
(the records' own frame: ideal-gas vapour, no Poynting) and y.

The ENGINE computes every prediction (choupoProps: propertyScan1D T_bubble /
y_eq_<c> / Psat_<c>, activityCoefficients gamma_<c>).  INDEPENDENTLY this
script solves the same bubble point with its own kernels (oos_lib) on the
engine's Psat (a 0.25 K grid, ln P linear in 1/T) and reports the largest
engine-vs-independent gap; the NEGATIVE control re-solves with every
record's ij and ji parameters swapped.

Writes OUTDIR/ternaries.tsv (statistics per block and model, no measured
point) and OUTDIR/ternary_census.tsv; points to WORKDIR/ternary_points.tsv.
"""
import json
import math
import statistics as st
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oos_lib as L  # noqa: E402

MODELS = ("NRTL", "UNIQUAC", "Wilson")


def pctl(v, p):
    v = sorted(v)
    if not v:
        return float("nan")
    k = (len(v) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def extract(b, byorg):
    """[(x{name}, y{name} or None, T, P)] of a VLE block, or (None, why)."""
    phases = {v["phase"] for v in b["variables"]} | {p["phase"] for p in b["props"]} | \
        {c["phase"] for c in b["constraints"]}
    if any(ph.startswith("Liquid mixture") for ph in phases):
        return None, "two liquid phases named (LLE or VLLE)"
    names = list(byorg.values())
    xs, ys, Tk, Pk = {}, {}, None, None
    for v in b["variables"]:
        if v["name"] == "Mole fraction" and v["phase"] == "Liquid":
            xs[("v", v["num"])] = byorg.get(v["org"])
        elif v["name"] == "Mole fraction" and v["phase"] == "Gas":
            ys[("v", v["num"])] = byorg.get(v["org"])
        elif v["name"].startswith("Temperature"):
            Tk = ("v", v["num"])
        elif v["name"].startswith("Pressure"):
            Pk = ("v", v["num"])
    for p in b["props"]:
        if p["name"] == "Mole fraction" and p["phase"] == "Liquid":
            xs[("p", p["num"])] = byorg.get(p["org"])
        elif p["name"] == "Mole fraction" and p["phase"] == "Gas":
            ys[("p", p["num"])] = byorg.get(p["org"])
        elif p["name"].startswith("Boiling temperature") or p["name"].startswith("Temperature"):
            Tk = ("p", p["num"])
        elif p["name"].startswith("Vapor or sublimation pressure") or p["name"].startswith("Pressure"):
            Pk = ("p", p["num"])
        else:
            return None, f"property '{p['name']}' is not VLE"
    Tc = Pc = None
    for c in b["constraints"]:
        if c["name"].startswith("Temperature"):
            Tc = fnum(c["value"])
        elif c["name"].startswith("Pressure"):
            Pc = fnum(c["value"])
        elif c["name"] == "Mole fraction":
            return None, "a mole fraction held constant (a pseudo-binary section)"
    if len(xs) < 2 or (Tk is None and Tc is None) or (Pk is None and Pc is None):
        return None, "not a ternary VLE block (two liquid mole fractions, T and P needed)"
    if Tk is None and Pk is None:
        return None, "neither T nor P measured"
    out = []
    for r in b["rows"]:
        get = lambda k: fnum(r["var"].get(k[1]) if k[0] == "v" else r["prop"].get(k[1]))
        x = {}
        for k, n in xs.items():
            v = get(k)
            if v is None:
                break
            x[n] = v
        if len(x) != len(xs):
            continue
        miss = [n for n in names if n not in x]
        if len(miss) == 1:
            x[miss[0]] = 1.0 - sum(x.values())
        if len(x) != 3 or min(x.values()) < -1e-9 or abs(sum(x.values()) - 1) > 1e-6:
            continue
        y = None
        if ys:
            y = {}
            for k, n in ys.items():
                v = get(k)
                if v is not None:
                    y[n] = v
            m2 = [n for n in names if n not in y]
            if len(y) == 2 and len(m2) == 1:
                y[m2[0]] = 1.0 - sum(y.values())
            if len(y) != 3:
                y = None
        T = get(Tk) if Tk else Tc
        P = get(Pk) if Pk else Pc
        if T is None or P is None:
            continue
        out.append((x, y, T, P * 1000.0))
    if not out:
        return None, "no complete row"
    return out, None


def psat_fn(grid, n):
    Ts = [r["T"] for r in grid]
    lp = [math.log(r[f"Psat_{n}"]) for r in grid]

    def f(T):
        k = min(max(int((T - Ts[0]) / (Ts[1] - Ts[0])), 0), len(Ts) - 2)
        u = (1 / T - 1 / Ts[k]) / (1 / Ts[k + 1] - 1 / Ts[k])
        return math.exp(lp[k] + u * (lp[k + 1] - lp[k]))
    return f


def bubble_T(lng, ps, x, P, T0):
    """Newton-secant on ln(sum x gamma Psat / P) = 0."""
    def g(T):
        gm = lng(x, T)
        return math.log(sum(x[i] * math.exp(gm[i]) * ps[i](T) for i in range(3)) / P)
    a, fa = T0, g(T0)
    b = T0 + 1.0
    fb = g(b)
    for _ in range(100):
        if fb == fa:
            break
        c = b - fb * (b - a) / (fb - fa)
        a, fa = b, fb
        b, fb = c, g(c)
        if abs(b - a) < 1e-9:
            break
    gm = lng(x, b)
    y = [x[i] * math.exp(gm[i]) * ps[i](b) / P for i in range(3)]
    s = sum(y)
    return b, [v / s for v in y]


def main():
    root, arch, scanp, work, outd = (Path(a) for a in sys.argv[1:6])
    work.mkdir(parents=True, exist_ok=True)
    scan = json.loads(scanp.read_text())
    ident = json.loads((arch / "identity.json").read_text())["byInchiKey"]
    recs = {m: {frozenset((r["i"], r["j"])): r for r in L.read_records(root, m)} for m in MODELS}
    cen = Counter()
    blocks = []
    for art in scan["articles"]:
        doi = art["cite"]["doi"] or art["file"][:-4]
        for b in art["blocks"]:
            if b["kind"] != "ternary":
                continue
            cen["three-compound blocks with a liquid mole fraction"] += 1
            nm = []
            for m in b["members"]:
                v = ident.get(m.get("inchiKey", ""), [])
                nm.append(v[0] if len(v) == 1 else None)
            if None in nm:
                cen["T1 a compound not in the catalogue"] += 1
                continue
            byorg = {m["org"]: n for m, n in zip(b["members"], nm)}
            models = [m for m in MODELS if all(frozenset((nm[i], nm[j])) in recs[m]
                                               for i in range(3) for j in range(i + 1, 3))]
            if not models:
                cen["T2 three catalogue compounds, but no model holds all three pairs"] += 1
                continue
            pts, why = extract(b, byorg)
            if pts is None:
                cen["T3 " + why] += 1
                continue
            if max(p[3] for p in pts) > 500e3:
                cen["T3b a pressure above 500 kPa (outside the records' ideal-gas frame; "
                    "here an archive entry of 10264.2 kPa at an atmospheric boiling T)"] += 1
                continue
            cen["accepted VLE blocks"] += 1
            blocks.append((doi, b["block"], sorted(nm), models, pts))
    # T3c: a block whose numbers repeat another article's block of OTHER compounds
    sig = {}
    for art in scan["articles"]:
        doi = art["cite"]["doi"] or art["file"][:-4]
        for b in art["blocks"]:
            if b["kind"] != "ternary":
                continue
            for r in b["rows"]:
                k = tuple(sorted(list(r["var"].values()) + list(r["prop"].values())))
                sig.setdefault(k, set()).add((doi, tuple(sorted(m.get("inchiKey", "") for m in b["members"]))))
    kept_blocks = []
    for blk in blocks:
        doi, bi, names, models, pts = blk
        art = next(a for a in scan["articles"] if (a["cite"]["doi"] or a["file"][:-4]) == doi)
        b = next(x for x in art["blocks"] if x["block"] == bi)
        mine = tuple(sorted(m.get("inchiKey", "") for m in b["members"]))
        dup = 0
        other = set()
        for r in b["rows"]:
            k = tuple(sorted(list(r["var"].values()) + list(r["prop"].values())))
            o = {d for d in sig.get(k, ()) if d[0] != doi and d[1] != mine}
            if o:
                dup += 1
                other |= {d[0] for d in o}
        if dup >= 0.5 * len(b["rows"]):
            cen[f"T3c the block's rows repeat a block of OTHER compounds in another article "
                f"({doi} block {bi}: {dup}/{len(b['rows'])} rows also in {', '.join(sorted(other))})"] += 1
            cen["accepted VLE blocks"] -= 1
            continue
        kept_blocks.append(blk)
    blocks = kept_blocks
    rows_out = []
    allp = []
    solver_gap = 0.0
    gap_at = None
    for doi, bi, names, models, pts in blocks:
        Ps = {round(p[3], 3) for p in pts}
        Tset = {round(p[2], 3) for p in pts}
        mode = "isobaric" if len(Ps) == 1 else ("isothermal" if len(Tset) == 1 else "bubbleT-at-each-P")
        for model in models:
            r3 = {frozenset((names[i], names[j])): recs[model][frozenset((names[i], names[j]))]
                  for i in range(3) for j in range(i + 1, 3)}
            same = any(doi in r["dois"] for r in r3.values())
            if same:
                cen[f"T4 {model}: the article's BINARY blocks are in a record's own evidence "
                    "(the ternary block itself was not fitted; kept, reported apart)"] += 1
            Tlo = min(p[2] for p in pts) - 40
            Thi = max(p[2] for p in pts) + 40
            ops = [L.op_grid("grid", Tlo, Thi, int((Thi - Tlo) / 0.25) + 1, 101325.0, names,
                             {names[0]: 1.0}, [f"Psat_{n}" for n in names])]
            for k, (x, y, T, P) in enumerate(pts):
                if mode == "isothermal":
                    ops.append(L.op_gamma(f"g{k}", T, names, x))
                else:
                    ops.append(L.op_scan(f"s{k}", T, P, names, x,
                                         ["T_bubble"] + [f"y_eq_{n}" for n in names]))
            diags, rows, res, log, rc = L.run_engine(root, work / "eng", f"t_{model}_{bi}_{doi.replace('/', '_')}",
                                                     model, names, ops)
            if "grid" not in rows:
                cen[f"T5 {model}: the engine could not evaluate the vapour pressures"] += 1
                continue
            ps = [psat_fn(rows["grid"], n) for n in names]
            lng = L.model_for(r3, names, root)
            lns = L.model_for(r3, names, root, swap=True)
            res_pts = []
            for k, (x, y, T, P) in enumerate(pts):
                xv = [x[n] for n in names]
                inside = all(r["Tmin"] is not None and r["Tmin"] <= T <= r["Tmax"] for r in r3.values())
                if mode == "isothermal":
                    gd = diags.get(f"g{k}") or {}
                    ge = [gd.get(f"gamma_{n}") for n in names]
                    if None in ge:
                        continue
                    pe = sum(xv[i] * ge[i] * ps[i](T) for i in range(3))
                    ye = [xv[i] * ge[i] * ps[i](T) / pe for i in range(3)]
                    gi = lng(xv, T)
                    pi = sum(xv[i] * math.exp(gi[i]) * ps[i](T) for i in range(3))
                    gs = lns(xv, T)
                    psw = sum(xv[i] * math.exp(gs[i]) * ps[i](T) for i in range(3))
                    solver_gap = max(solver_gap, abs(pe / pi - 1) * 1e3)   # in permil, reported as such
                    rel = pe / P - 1
                    rels = psw / P - 1
                    res_pts.append({"kind": "P", "err": rel, "errSwap": rels, "y": y, "ye": ye,
                                    "inside": inside, "T": T})
                else:
                    sr = (rows.get(f"s{k}") or [{}])[0]
                    Te = sr.get("T_bubble")
                    if Te is None or Te != Te:
                        cen[f"T6 {model}: engine bubble T did not converge (points)"] += 1
                        continue
                    ye = [sr.get(f"y_eq_{n}") for n in names]
                    Ti, yi = bubble_T(lng, ps, xv, P, T)
                    Ts, ysw = bubble_T(lns, ps, xv, P, T)
                    if abs(Te - Ti) > solver_gap:
                        solver_gap = abs(Te - Ti)
                        gap_at = (doi, bi, model, xv, P, Te, Ti)
                    res_pts.append({"kind": "T", "err": Te - T, "errSwap": Ts - T, "y": y, "ye": ye,
                                    "inside": inside, "T": T})
            if not res_pts:
                continue
            for p in res_pts:
                p.update({"same": same, "model": model, "doi": doi, "block": bi, "system": "+".join(names), "mode": mode})
                if p["y"]:
                    p["dy"] = max(abs(p["ye"][i] - p["y"][names[i]]) for i in range(3))
                allp.append(p)
            e = [abs(p["err"]) for p in res_pts]
            es = [abs(p["errSwap"]) for p in res_pts]
            dy = [p["dy"] for p in res_pts if "dy" in p]
            unit = "K" if res_pts[0]["kind"] == "T" else "rel"
            grades = ",".join(sorted({r["fitGrade"] for r in r3.values()}))
            igr = ",".join(sorted({r["inSampleGrade"] or "none" for r in r3.values()}))
            anyout = any(not p["inside"] for p in res_pts)
            ann = "pair-span" in log
            cen[f"span: {model} blocks with a point outside a pair's span, "
                f"{'announced' if ann else 'NOT announced'}" if anyout else
                f"span: {model} blocks with every point inside, {'announced' if ann else 'silent'}"] += 1
            rows_out.append(f"{'+'.join(names)}\t{model}\t{doi}\t{bi}\t{mode}\t{len(res_pts)}\t"
                            f"{min(p['T'] for p in res_pts):.2f}\t{max(p['T'] for p in res_pts):.2f}\t"
                            f"{sum(p['inside'] for p in res_pts) / len(res_pts):.3f}\t{unit}\t"
                            f"{st.median(e):.4f}\t{max(e):.4f}\t{st.mean([p['err'] for p in res_pts]):+.4f}\t"
                            f"{st.median(es):.4f}\t{len(dy)}\t"
                            f"{(st.median(dy) if dy else float('nan')):.4f}\t{(max(dy) if dy else float('nan')):.4f}\t"
                            f"{grades}\t{igr}\t{same}\t{ann}\t" + ";".join(Path(r["path"]).name for r in r3.values()))
    outd.mkdir(parents=True, exist_ok=True)
    with open(outd / "ternaries.tsv", "w") as fh:
        fh.write("system\tmodel\tdoi\tblock\tmode\tnPoints\tTmin_K\tTmax_K\tallThreeInSpanFraction\terrUnit\t"
                 "median_abs_err\tmax_abs_err\tmean_err\tmedian_abs_err_swapped\tnPointsWithY\t"
                 "median_max_abs_dy\tmax_max_abs_dy\tfitGrades\tinSampleGrades\tsameArticleAsBinaryEvidence\tspanAnnounced\trecords\n")
        for r in rows_out:
            fh.write(r + "\n")
    with open(outd / "ternary_census.tsv", "w") as fh:
        fh.write("rule\tcount\n")
        for k, v in cen.items():
            fh.write(f"{k}\t{v}\n")
    with open(work / "ternary_points.tsv", "w") as fh:
        for p in allp:
            fh.write(json.dumps(p) + "\n")
    print(dict(cen))
    print("largest gap at", gap_at if solver_gap > 0 else None)
    print(f"engine vs independent bubble solver: max |dT| {solver_gap:.2e} K (isobaric) / "
          f"permil for isothermal P")
    for model in MODELS:
        for kind, lab in (("T", "isobaric bubble T [K]"), ("P", "isothermal bubble P [relative]")):
            pp = [p for p in allp if p["model"] == model and p["kind"] == kind]
            if not pp:
                continue
            for sub_lab, sub in (("all", pp), ("all three in span", [p for p in pp if p["inside"]]),
                                 ("independent articles", [p for p in pp if not p["same"]]),
                                 ("same article as a binary's evidence", [p for p in pp if p["same"]])):
                if not sub:
                    continue
                e = [abs(p["err"]) for p in sub]
                es = [abs(p["errSwap"]) for p in sub]
                dy = [p["dy"] for p in sub if "dy" in p]
                print(f"{model} {lab} {sub_lab}: systems {len({p['system'] for p in sub})}, blocks "
                      f"{len({(p['doi'], p['block']) for p in sub})}, points {len(sub)}, median {st.median(e):.4f}, "
                      f"p90 {pctl(e, .9):.4f}, max {max(e):.4f}; swapped median {st.median(es):.4f} p90 "
                      f"{pctl(es, .9):.4f}; y points {len(dy)} median max|dy| "
                      f"{(st.median(dy) if dy else float('nan')):.4f} p90 {pctl(dy, .9):.4f}")


if __name__ == "__main__":
    main()
