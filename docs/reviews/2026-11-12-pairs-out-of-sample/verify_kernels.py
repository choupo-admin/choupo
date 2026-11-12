#!/usr/bin/env python3
"""verify_kernels.py ROOT WORKDIR OUT_TSV [N_PER_MODEL]

The VERIFIED column for NRTL, Wilson and UNIQUAC: the engine's gamma
(choupoProps propertyPoint, gamma_<comp>) against this review's own kernels
(oos_lib.py, written from the published equations) on N random catalogue
records per model (default 80), each at a random T inside or near its span
and a random x including both infinite-dilution ends, plus ternary points
built from three catalogue pairs of one model.  Writes one row per point
and prints the largest |d ln gamma| per model.  Exit 1 if any exceeds 1e-9.
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oos_lib as L  # noqa: E402


def main():
    root, work, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    nper = int(sys.argv[4]) if len(sys.argv) > 4 else 80
    rng = random.Random(20261112)
    rows = []
    worst = {}
    for model in ("NRTL", "Wilson", "UNIQUAC"):
        recs = [r for r in L.read_records(root, model)]
        sample = rng.sample(recs, min(nper, len(recs)))
        for k, rec in enumerate(sample):
            names = [rec["i"], rec["j"]]
            lo = rec["Tmin"] or 300.0
            hi = rec["Tmax"] or 360.0
            pts = []
            for xs in (0.0, 1.0, rng.random()):
                T = rng.uniform(lo - 20, hi + 20)
                pts.append((round(T, 4), 101325.0, {names[0]: xs, names[1]: 1 - xs},
                            [f"gamma_{n}" for n in names]))
            diags, _, res, log, rc = L.run_engine(root, work, f"v_{model}_{k}", model, names,
                                                  [L.op_gamma(f"p{q}", p[0], names, p[2]) for q, p in enumerate(pts)])
            diags = [diags.get(f"p{q}") for q in range(len(pts))]
            f = L.model_for({frozenset(names): rec}, names, root)
            for (T, P, comp, props), d in zip(pts, diags):
                x = [comp[n] for n in names]
                mine = f(x, T)
                for c, n in enumerate(names):
                    eng = d.get(f"gamma_{n}") if d else None
                    dl = abs(math.log(eng) - mine[c]) if eng else float("nan")
                    rows.append((model, Path(rec["path"]).name, f"{T}", f"{x[0]:.6f}", n,
                                 f"{eng!r}", f"{math.exp(mine[c])!r}", f"{dl:.3e}"))
                    worst[model] = max(worst.get(model, 0.0), dl if dl == dl else 1e9)
        # ternary points: three pairs of this model that close a triangle
        byset = {frozenset((r["i"], r["j"])): r for r in recs}
        comps = sorted({n for s in byset for n in s})
        tri = []
        adj = {}
        for s in byset:
            a, b = tuple(s)
            adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
        for a in comps:
            for b in sorted(adj.get(a, ())):
                for c in sorted(adj.get(b, ()) & adj.get(a, ())):
                    if a < b < c:
                        tri.append((a, b, c))
        for k, t in enumerate(rng.sample(tri, min(10, len(tri)))):
            names = list(t)
            recs3 = {frozenset((names[p], names[q])): byset[frozenset((names[p], names[q]))]
                     for p in range(3) for q in range(p + 1, 3)}
            pts = []
            for _ in range(3):
                w = [rng.random() for _ in range(3)]
                s = sum(w)
                pts.append((round(rng.uniform(320, 380), 4), 101325.0,
                            {n: w[c] / s for c, n in enumerate(names)}, [f"gamma_{n}" for n in names]))
            diags, _, res, log, rc = L.run_engine(root, work, f"v3_{model}_{k}", model, names,
                                                  [L.op_gamma(f"p{q}", p[0], names, p[2]) for q, p in enumerate(pts)])
            diags = [diags.get(f"p{q}") for q in range(len(pts))]
            f = L.model_for(recs3, names, root)
            for (T, P, comp, props), d in zip(pts, diags):
                x = [comp[n] for n in names]
                mine = f(x, T)
                for c, n in enumerate(names):
                    eng = d.get(f"gamma_{n}") if d else None
                    dl = abs(math.log(eng) - mine[c]) if eng else float("nan")
                    rows.append((model + "-ternary", "+".join(names), f"{T}", f"{x[0]:.6f}", n,
                                 f"{eng!r}", f"{math.exp(mine[c])!r}", f"{dl:.3e}"))
                    worst[model] = max(worst.get(model, 0.0), dl if dl == dl else 1e9)
    with open(out, "w") as fh:
        fh.write("model\trecord\tT_K\tx_first\tcomponent\tgamma_engine\tgamma_independent\tabs_dlngamma\n")
        for r in rows:
            fh.write("\t".join(r) + "\n")
    for m, w in worst.items():
        n = sum(1 for r in rows if r[0].startswith(m))
        print(f"{m}: {n} gamma values compared, max |d ln gamma| = {w:.3e}")
    sys.exit(0 if all(w < 1e-9 for w in worst.values()) else 1)


if __name__ == "__main__":
    main()
