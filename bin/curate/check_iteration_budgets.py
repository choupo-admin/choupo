#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_iteration_budgets -- AN ITERATION BUDGET OF ZERO WAS A CONVERGED SOLVE,
AND A DISTRIBUTED NON-KEY WAS A PLAUSIBLE R_min (DEV.md 4c C467, R-001, R-002,
R-006; the external review of 2026-11-19).

THE REAL DEFECTS THIS GATE WOULD HAVE CAUGHT
  R-001  newton1D with maxIter <= 0 never ran its loop, kept `residual = 0`
         and returned converged = (0 < tol) = true without evaluating f.  An
         adiabaticFlash case with `maxOuterIter 0;` (or -1, or 0.5, cast to
         int) was published converged with a 917 kW energy imbalance.
  R-002  on an exhausted budget newton1D / newton1DSafeguarded returned the NEW
         x with the residual of the PREVIOUS x (x = 1.5, residual 1 for
         f = x^2 - 2, x0 = 1, maxIter = 1; |f(1.5)| = 0.25).
  R-006  shortcutColumn searched for a component with volatility strictly
         between the keys only inside the "no sign change" branch, so a
         ternary benzene / toluene / ethylbenzene (keys benzene, ethylbenzene)
         ran with a pole inside Underwood's bracket and published theta 3.207,
         R_min 0.148, while the lesson says such a case is refused.

WHAT THIS GATE CHECKS
  (a) a probe compiled HERE against src/solver/NewtonRaphson.cpp: newton1D and
      newton1DSafeguarded with maxIter 0 and -1 THROW and never return
      converged; with maxIter = 1 the residual returned is |f| at the RETURNED
      x (not the previous one); a full budget still converges; and
      requireIterationBudget refuses 0, -1, 0.5 by the key's name and accepts 30.
  (b) adiabaticFlash01 with `maxOuterIter` 0, -1 and 0.5 is refused by name;
      with 1 it is refused for non-convergence (exit non-zero, never "Converged: yes").
  (c) the ternary FUG (benzene / toluene / ethylBenzene, keys benzene and
      ethylBenzene) is refused, naming toluene.
  (d) the shipped shortcut01_benzene_toluene and adiabaticFlash01 still run
      and converge (the refusals do not reach them).

SABOTAGE ARMS (each run live by the gate): the probe is rebuilt from a copy of
NewtonRaphson.cpp with (i) the budget refusal removed and (ii) the final
residual re-evaluation removed: each must then be SEEN failing arm (a).  The
case arms are sabotaged in the data: `maxOuterIter 30` must pass (b)'s run and
a ternary with toluene ABSENT from the feed must not be refused as a
distributed non-key, so the refusal is shown to follow presence and not the
component list.

ARM (c) PATH, RECORDED BY HAND 2026-11-21: at 350 K the ternary's end signs of
Underwood's function DIFFER (glo < 0 < ghi in the bracket (1, alpha_LK)): with the
new pre-check disabled (`if (false && ...)`, engine rebuilt) the case ran, exit 0,
printing no "does not change sign" text -- the old refusal never fires on it, so the
wording asserted here ("non-key lies BETWEEN the keys (relative volatility") belongs
to the pre-check alone, and that engine sabotage made arm (c) FAIL.  It needs a
rebuilt binary, so it is not re-run by the gate itself.

NOT CHECKED: other unit keys that feed a loop budget through a cast (the list
is in the C467 commit), nor whether any corpus case should converge.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "bin" / "curate" / "_iterationBudgetProbe.cpp"
NR = ROOT / "src" / "solver" / "NewtonRaphson.cpp"
FLASH = "tutorials/steady/flash/adiabaticFlash01_benzene_toluene"
FUG = "tutorials/steady/distillation/shortcut01_benzene_toluene"
STRIP = ("expected", "converged", "constant/propertyManifest")


def build_probe(tmp, nr_source, tag):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        return None, "no C++ compiler: a check that cannot run must not pass"
    exe = Path(tmp) / ("probe_" + tag)
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-I", str(ROOT / "src"), "-I", str(ROOT / "src" / "solver"),
                        str(PROBE), str(nr_source), "-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None, "probe does not compile:\n" + r.stderr[-1500:]
    p = subprocess.run([str(exe)], capture_output=True, text=True, timeout=120)
    v = {}
    for line in p.stdout.splitlines():
        k, _, rest = line.partition(" ")
        v[k] = rest
    return v, ""


def probe_failures(v):
    f = []
    if v is None or "probeDone" not in v:
        return ["probe did not finish"]
    for k in ("plain_0", "plain_m1", "safe_0", "safe_m1"):
        if not v.get(k, "").startswith("THREW") or "maxIter" not in v.get(k, ""):
            f.append(f"{k}: a budget of {k.split('_')[1].replace('m1', '-1')} is not refused by name: {v.get(k)!r}")
    for k in ("plainOne", "safeOne"):
        m = re.match(r"x (\S+) residual (\S+) fAtX (\S+) converged (\d)", v.get(k, ""))
        if not m:
            f.append(f"{k}: unreadable {v.get(k)!r}")
            continue
        x, res, fx, conv = float(m[1]), float(m[2]), float(m[3]), m[4]
        if abs(res - fx) > 1e-9 * max(1.0, fx):
            f.append(f"{k}: residual {res:g} is not |f(x)| = {fx:g} at the returned x = {x:g}")
        if conv == "1":
            f.append(f"{k}: maxIter 1 at x0 = 1 for x^2 - 2 reported converged")
    if not v.get("plainFull", "").startswith("converged 1"):
        f.append("a full budget no longer converges")
    for k, want in (("budget_0", "THREW"), ("budget_-1", "THREW"),
                    ("budget_0.5", "THREW"), ("budget_30", "RAN 30")):
        if not v.get(k, "").startswith(want):
            f.append(f"requireIterationBudget {k}: {v.get(k)!r}, expected {want}")
        elif want == "THREW" and "'k'" not in v[k]:
            f.append(f"requireIterationBudget {k} does not name the key")
    return f


def main():
    failures = []
    with tempfile.TemporaryDirectory() as td:
        v, err = build_probe(td, NR, "real")
        if err:
            return gatekit.verdict("check_iteration_budgets", [err], "")
        failures += ["(a) " + x for x in probe_failures(v)]

        text = NR.read_text()
        sab = {
            "budget refusal removed":
                re.sub(r"if \(opts\.maxIter <= 0\)\s*throw std::invalid_argument\(.*?\);", "", text, flags=re.S),
            "final residual re-evaluation removed":
                text.replace("residual = std::abs(f(x));", "(void)0;")
                    .replace("res.residual  = std::abs(nextF);", "(void)0;"),
        }
        for what, src in sab.items():
            if src == text:
                failures.append(f"sabotage '{what}': the text to remove is absent -- the arm is stale")
                continue
            p = Path(td) / "NRsab.cpp"
            p.write_text(src)
            vs, e2 = build_probe(td, p, "sab")
            if e2:
                failures.append(f"sabotage '{what}': {e2} -- a sabotage that does not build proves nothing")
            elif vs is not None and not probe_failures(vs):
                failures.append(f"sabotage '{what}' was NOT seen by arm (a)")

    solve = gatekit.binary("choupoSolve")

    def flash(val):
        with gatekit.probe_copy(FLASH, strip=STRIP) as c:
            if val is not None:
                gatekit.edit(c / "system/flowsheetDict", "P        1.01325 bar;",
                             f"P        1.01325 bar;\n            maxOuterIter {val};")
            return gatekit.run(solve, c)

    for val in ("0", "-1", "0.5"):
        rc, out = flash(val)
        if rc == 0 or "maxOuterIter" not in out or "positive whole number" not in out:
            failures.append(f"(b) maxOuterIter {val}: not refused by name (exit {rc}): "
                            + " | ".join(out.strip().splitlines()[-2:]))
    rc, out = flash("1")
    if rc == 0 or re.search(r"Converged:\s+yes", out):
        failures.append(f"(b) maxOuterIter 1: published converged (exit {rc})")
    rc, out = flash("30")
    if rc != 0 or not re.search(r"Converged:\s+yes", out):
        failures.append(f"(b/sabotage) maxOuterIter 30 no longer runs converged (exit {rc})")
    rc, out = flash(None)
    if rc != 0 or not re.search(r"Converged:\s+yes", out) or "NOT CLOSED" in out:
        failures.append(f"(d) shipped adiabaticFlash01 does not run converged (exit {rc})")

    def fug(ternary, dropMiddle=False):
        with gatekit.probe_copy(FUG, strip=STRIP) as c:
            if ternary:
                gatekit.edit(c / "constant/thermoPhysPropDict", "components       ( benzene  toluene );",
                             "components       ( benzene  toluene  ethylBenzene );")
                gatekit.edit(c / "0/feed", r"benzene\s+50 kmol/h;\s*toluene\s+50 kmol/h;",
                             "benzene 33 kmol/h;\n    toluene " + ("0" if dropMiddle else "34")
                             + " kmol/h;\n    ethylBenzene 33 kmol/h;", regex=True)
                gatekit.edit(c / "0/feed", "T               365 K;", "T               350 K;")
                gatekit.edit(c / "system/flowsheetDict", "heavyKey      toluene;", "heavyKey      ethylBenzene;")
                for s in ("0/distillate", "0/bottoms"):
                    gatekit.edit(c / s, r"toluene\s+[0-9.]+ kmol/h;", "toluene 1 kmol/h;\n    ethylBenzene 1 kmol/h;",
                                 regex=True)
            return gatekit.run(solve, c)

    rc, out = fug(True)
    if (rc == 0 or "toluene" not in out or "non-key lies BETWEEN the keys (relative volatility" not in out
            or "does not change sign" in out):
        failures.append(f"(c) ternary FUG not refused naming toluene (exit {rc}): "
                        + " | ".join(out.strip().splitlines()[-2:]))
    rc, out = fug(False)
    if rc != 0:
        failures.append(f"(d) shipped shortcut01 does not run (exit {rc})")
    rc, out = fug(True, dropMiddle=True)       # toluene ABSENT from the feed: no distributed non-key
    if "BETWEEN the keys" in out:
        failures.append("(c/sabotage) an ABSENT middle component was refused: the refusal must follow "
                        "presence (z > 0), not the component list")

    return gatekit.verdict(
        "check_iteration_budgets", failures,
        "an iteration budget of 0, -1 or 0.5 is refused by name and never published converged; "
        "an exhausted Newton returns |f| at the x it returns; a ternary FUG with a distributed non-key is "
        "refused naming it; shipped shortcut01 and adiabaticFlash01 unchanged; two engine sabotages and the "
        "converged control are seen",
    )


if __name__ == "__main__":
    sys.exit(main())
