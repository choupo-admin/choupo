#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""dev_hs -- the DEVELOPMENT set of the C496 SQP work (2026-11-24).

THE RULE, written before the list was looked at.  Let S be the survivors of
rules 1-4 of docs/audits/2026-11-24-optimizer-bench-protocol.md section 2, in
order of number (optimizer_bench.select()[1]).  The JUDGE (protocol section 2,
amendment A2) is S[0::6].  The development set is S[3::6] (each problem half a
step from a judge problem, 18 problems) followed by the first six members of
S[5::6], in order of number: 24 problems, none of them a judge problem
(their indices are 3 or 5 modulo 6, the judge's are 0).

Runs the codes on that set, clean and at the protocol's noise levels and
seeds, with the protocol's counter, budget and 'solved' rule, and prints the
fraction solved at each tau per condition.  Usage (virtualenv python):

  dev_hs.py list
  dev_hs.py run LABEL [code ...]      # CHOUPO_SQP_OPTS selects the sqp variant
  dev_hs.py judge LABEL               # the 18 judge problems; used ONCE
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import optimizer_bench as ob   # noqa: E402


def dev_list():
    S = ob.select()[1]
    return S[3::6] + S[5::6][:6]


def run(label, codes, problems):
    out = ob.WORK / ("dev_%s.jsonl" % label)
    if out.exists():
        out.unlink()
    for k in problems:
        P = ob.HSProblem(k)
        budget = 100 * (P.n + 1)
        fscale = max(1.0, abs(P.raw(P.x0)[0]))
        for sigma, seed in [(0.0, 0)] + [(s, sd) for s in ob.LEVELS for sd in ob.SEEDS]:
            for code in codes:
                rng = np.random.default_rng([seed, k, int(-math.log10(sigma)) if sigma else 0])
                cnt = ob.Counter(P.raw, P.n, P.lo, P.hi, P.x0, budget, sigma, rng, fscale)
                info = ob.one_run(code, cnt, P.x0.copy(), P.lo, P.hi, P.mi, P.me, P.span_own, seed)
                rec = dict(problem=k, n=P.n, mi=P.mi, me=P.me, code=code, sigma=sigma, seed=seed,
                           count=cnt.count, t=cnt.times_to_solve(P.fstar), **info)
                with open(out, "a") as fh:
                    fh.write(json.dumps(rec, default=str) + "\n")
    return out


def summary(path):
    rows = [json.loads(ln) for ln in open(path)]
    codes = sorted({r["code"] for r in rows})
    print("fraction solved by the full budget; columns: sigma 0 | 1e-8 | 1e-6 | 1e-4")
    for ti, tau in enumerate(ob.TAUS):
        print("tau %g" % tau)
        for c in codes:
            cells = []
            for sg in [0.0] + ob.LEVELS:
                rr = [r for r in rows if r["code"] == c and r["sigma"] == sg]
                cells.append(np.mean([r["t"][ti] is not None for r in rr]) if rr else float("nan"))
            print("  %-12s" % c + " ".join("%.3f" % v for v in cells))
    ends = {}
    for r in rows:
        if r["code"].startswith("choupo"):
            st = str(r.get("status", "")).split(" ", 3)
            key = (r["code"], " ".join(st[3:] if len(st) > 3 else st)[:45])
            ends[key] = ends.get(key, 0) + 1
    for k, v in sorted(ends.items()):
        print("  end", k, v)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "list":
        print(dev_list())
    elif cmd == "run":
        summary(run(sys.argv[2], sys.argv[3:] or ["choupoSqp"], dev_list()))
    elif cmd == "judge":
        summary(run("judge_" + sys.argv[2], sys.argv[3:] or ["choupoSqp"], ob.select()[0]))
