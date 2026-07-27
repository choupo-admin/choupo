#!/usr/bin/env python3
"""Basis-rank gate: the component->species map's rank refusal actually fires,
and says the right thing.

WHY THIS EXISTS.  `flash15_refused_salt_basis_rank` is marked
`.expect-nonconvergence`, and that marker makes `bin/runTests` SKIP the case
entirely -- it is never run, so nothing checks that the refusal still happens
or that it still names the right numbers.  That is precisely how a refusal
rots: it keeps compiling, stops firing, and nobody notices until a case
returns a wrong answer with exit 0.

So this gate RUNS the case and asserts the refusal:

  1. the run must FAIL (a rank-deficient basis must never solve);
  2. the message must name the rank, the component count and the degrees of
     freedom -- and the numbers must be the ones the theorem predicts:
     four salts over two cations and two anions give rank 3 of 4 columns,
     which is exactly (c-1)(a-1) = (2-1)(2-1) = 1;
  3. it must carry the remedy, because a refusal without one is a dead end.

And the mirror check, which matters just as much: `flash14_calcite_carbonate_basis`
is NOT 1:1 either -- CaCO3 spans two master families -- but its matrix IS full
rank, so it must run and announce that the state reads back uniquely.  A gate
that only tested the refusal could be satisfied by an engine that refuses
everything.

Contract: docs/design/general-salt-reconstruction-proposal.md.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"

REFUSED = ROOT / "tutorials/steady/flash/flash15_refused_salt_basis_rank"
ACCEPTED = ROOT / "tutorials/steady/flash/flash14_calcite_carbonate_basis"

bad = []


def run(case):
    p = subprocess.run([str(SOLVE), "-case", str(case)],
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


#  ---- 1. the rank-deficient basis must REFUSE, with the theorem's numbers ---
rc, out = run(REFUSED)
if rc == 0:
    bad.append(f"{REFUSED.name}: exited 0 -- a rank-deficient component basis "
               f"must never solve; reading its converged state back as those "
               f"components is not unique")
else:
    m = re.search(r"maps onto (\d+) independent master total\(s\) but has "
                  r"(\d+) components -- (\d+) degree\(s\) of freedom", out)
    if not m:
        bad.append(f"{REFUSED.name}: refused, but not with the rank message -- "
                   f"the deficiency must be NAMED, not merely hit.  Got:\n"
                   f"    {out.strip().splitlines()[-1][:200] if out.strip() else '(no output)'}")
    else:
        rank, ncomp, dof = (int(x) for x in m.groups())
        #  K/Na x Cl/SO4: c = 2 cations, a = 2 anions -> (c-1)(a-1) = 1.
        if (rank, ncomp, dof) != (3, 4, 1):
            bad.append(f"{REFUSED.name}: rank {rank} of {ncomp} components, "
                       f"{dof} dof -- expected 3 of 4 with 1 dof, which is "
                       f"(c-1)(a-1) for two cations and two anions")
    if "Remedy:" not in out:
        bad.append(f"{REFUSED.name}: the refusal carries no remedy -- a "
                   f"refusal without one is a dead end")
    for name in ("K2SO4", "KCl", "Na2SO4", "NaCl"):
        if name not in out:
            bad.append(f"{REFUSED.name}: the refusal does not name component "
                       f"'{name}' -- the author must see WHICH basis is "
                       f"degenerate")

#  ---- 2. the full-rank multi-master basis must RUN and say so --------------
#  Without this half, an engine that refused everything would pass.
rc2, out2 = run(ACCEPTED)
if rc2 != 0:
    bad.append(f"{ACCEPTED.name}: exited {rc2} -- a FULL-RANK basis must "
               f"solve, even though CaCO3 spans two master families; rank, "
               f"not the presence of a salt, is what decides")
elif not re.search(r"\[basis\] component -> master map: 2 component\(s\), rank 2",
                   out2):
    bad.append(f"{ACCEPTED.name}: no '[basis] ... rank 2' announce -- the "
               f"student must SEE that the state reads back uniquely, not "
               f"merely benefit from it")

if bad:
    print("basis-rank gate FAILED:")
    for b in bad:
        print("  " + b)
    print("\n  contract: docs/design/general-salt-reconstruction-proposal.md")
    sys.exit(1)

print("basis-rank gate: rank-deficient basis refused with (c-1)(a-1) = 1 named "
      "and a remedy; full-rank multi-master basis runs and announces rank 2")
