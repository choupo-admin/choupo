#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a flat Rachford-Rice function is DECLARED ill-conditioned, and V/F is
not left at the seed (DEV.md 4c C467, external review R-007).

    bin/curate/check_flash_ill_conditioned.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Benzene/toluene at 350 K, z_benzene =
1e-8, P = 34785.745859263276 Pa (inside a two-phase window a few 1e-4 Pa wide):
the Rachford-Rice function has |g'| = 8e-9, so the residual test |g| < 1e-8 is
met by the seed V = 0.5 and the Newton step did nothing.  The engine printed
"Converged: yes", V/F = 0.500000, against a root of 0.2753076 (an error of 22
percentage points); the closures were fine, every golden would have been green,
and nothing said the state was degenerate.  The mirror state (z_benzene =
1 - 1e-8, P = 91566.540468333696 Pa) did the same, root 0.7246924.

WHAT THIS GATE CHECKS (choupoSolve, a private copy of
tutorials/steady/flash/flash01_benzene_toluene with the two states above).
  (a) V/F within 1e-4 of the review's high-precision reference (0.2753076 and
      0.7246924, computed outside the engine: bisection of g at 60 digits with
      the same Antoine records);
  (b) the run NAMES the state: the log carries "Rachford-Rice equation is
      ILL-CONDITIONED" and the advisory record carries the locus
      "flash Rachford-Rice ill-conditioned";
  (c) an ordinary state (flash01 itself, 370 K, 1 bar) prints NO such warning;
  (d) a NEGATIVE WITNESS near the first criterion's band: p-xylene/m-xylene
      (alpha 1.019) at 410 K, z = 0.3, P = 95726 Pa has |g'| = 7e-5, which the
      first criterion (tolerance/|g'| > 1e-4) flagged although Newton had
      solved it.  It must print NO warning and V/F must equal an independent
      bisection of g (Antoine from the component files, K = Psat/P) to 1e-6.
  The criterion is the Newton step on V (dV = g/g' at the accepted V), not the
  residual: the warning fires only when the V the residual test accepted
  differs from the located root by more than 1e-6.
  SABOTAGE ARM.  The pre-fix output (V/F = 0.5, no warning) is handed to the
  same checker and must be refused, so the comparison has teeth.

NOT CHECKED: the path where g(0), g(1) do not bracket a root while Newton
"converged" (the flash publishes UNCONVERGED with its own message): no
two-phase state in the corpus reaches it, because the single-phase tests run
first; that the refined V/F is physically meaningful (it is determined by
differences far below what the K-values carry, which is what the warning says);
states whose width exceeds the band but whose g(0), g(1) do not bracket a root
(the seed is then kept and the warning still names the state).
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

CASE = "tutorials/steady/flash/flash01_benzene_toluene"
# The only directory walk is over the gate's own probe copy of CASE (gatekit.probe_copy);
# the tree is read by named path (CASE, the two component records).
SCAN_ROOTS = ()
STRIP = ("expected", "converged", "reports", "constant/propertyManifest")
MSG = "Rachford-Rice function g(V) is nearly flat"
LOCUS = "flash Rachford-Rice ill-conditioned"
# (benzene kmol/h, toluene kmol/h, T K, P Pa, reference V/F from the review)
STATES = (
    (1.0e-6, 99.999999, 350.0, 34785.745859263276, 0.2753076394154),
    (99.999999, 1.0e-6, 350.0, 91566.540468333696, 0.7246923711067),
)
TOL_VF = 1.0e-4


def vf_of(out):
    m = re.search(r"^\s*V/F:\s+([-+0-9.eE]+)\s*$", out, re.M)
    return float(m.group(1)) if m else None


def judge(out, ref, want_warning=True):
    """Findings for one run's stdout (empty = the state is handled)."""
    bad = []
    vf = vf_of(out)
    if vf is None:
        return ["no V/F line in the output"]
    if want_warning:
        if abs(vf - ref) > TOL_VF:
            bad.append(f"V/F = {vf:.6f}, reference {ref:.6f} (|diff| > {TOL_VF:g}): the flat state was accepted at the seed")
        if MSG not in out:
            bad.append("the run does not name the ill-conditioned state in its log")
        if LOCUS not in out:
            bad.append("the advisory record does not carry the ill-conditioned locus")
    elif MSG in out:
        bad.append("an ordinary state printed the ill-conditioned warning")
    return bad


def run_state(solve, state):
    fb, ft, T, P, _ = state
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        feed = (c / "0" / "feed").read_text()
        feed = re.sub(r"(?m)^(\s*)benzene\s+.*kmol/h;", rf"\g<1>benzene {fb!r} kmol/h;", feed)
        feed = re.sub(r"(?m)^(\s*)toluene\s+.*kmol/h;", rf"\g<1>toluene {ft!r} kmol/h;", feed)
        feed = re.sub(r"(?m)^T\s+.*;", f"T {T!r} K;", feed)
        feed = re.sub(r"(?m)^P\s+.*;", f"P {P!r} Pa;", feed)
        (c / "0" / "feed").write_text(feed)
        fd = (c / "system" / "flowsheetDict").read_text()
        fd, n = re.subn(r"operation\s*\{[^}]*\}", f"operation   {{ T {T!r} K;  P {P!r} Pa; }}", fd, count=1)
        (c / "system" / "flowsheetDict").write_text(fd)
        rc, out = gatekit.run(solve, c)
    return rc, out


def xylene_reference():
    """Independent root of Rachford-Rice for the negative witness: Antoine
    from the component records, K = Psat/P, bisection in plain doubles."""
    def antoine(name):
        t = (gatekit.repo / "data/standards/components" / (name + ".dat")).read_text()
        t = t[t.index("vaporPressure"):]
        a, b, c = map(float, re.search(r"coefficients\s*\(([^)]*)\)", t).group(1).split()[:3])
        return lambda T: 10 ** (a - b / (T + c)) * 1e5
    z = (0.3, 0.7)
    K = [antoine(n)(410.0) / 95726.0 for n in ("pXylene", "mXylene")]
    g = lambda V: sum(zi * (k - 1) / (1 + V * (k - 1)) for zi, k in zip(z, K))
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if g(mid) > 0 else (lo, mid)
    return 0.5 * (lo + hi)


def run_xylene(solve):
    """flash01's case with the pair swapped for p-xylene / m-xylene (z = 0.3)."""
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        for f in list((c / "0").iterdir()) + [c / "constant" / "thermoPhysPropDict"]:
            t = f.read_text().replace("benzene", "pXylene").replace("toluene", "mXylene")
            if f.parent.name == "0" and f.name == "feed":
                t = re.sub(r"(?m)^(\s*)pXylene\s+.*kmol/h;", r"\g<1>pXylene 30 kmol/h;", t)
                t = re.sub(r"(?m)^(\s*)mXylene\s+.*kmol/h;", r"\g<1>mXylene 70 kmol/h;", t)
                t = re.sub(r"(?m)^T\s+.*;", "T 410 K;", t)
                t = re.sub(r"(?m)^P\s+.*;", "P 95726 Pa;", t)
            f.write_text(t)
        fd = c / "system" / "flowsheetDict"
        fd.write_text(re.sub(r"operation\s*\{[^}]*\}", "operation   { T 410 K;  P 95726 Pa; }", fd.read_text(), count=1))
        return gatekit.run(solve, c)


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")

    seen = []
    for st in STATES:
        rc, out = run_state(solve, st)
        if rc != 0:
            failures.append(f"(a) state P={st[3]} did not run (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:]))
            continue
        seen.append(vf_of(out))
        failures += [f"(a/b) z_benzene~{st[0] / (st[0] + st[1]):.0e}: " + b for b in judge(out, st[4])]

    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        rc, out = gatekit.run(solve, c)
    if rc != 0:
        failures.append(f"(c) the ordinary witness did not run (exit {rc})")
    else:
        failures += ["(c) " + b for b in judge(out, 0.0, want_warning=False)]

    rc, out = run_xylene(solve)
    ref = xylene_reference()
    if rc != 0:
        failures.append(f"(d) the close-boiling witness did not run (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:]))
    else:
        vf = vf_of(out)
        if MSG in out or LOCUS in out:
            failures.append("(d) a close boiler Newton had solved (|g'| = 7e-5) printed the ill-conditioned warning")
        if vf is None or abs(vf - ref) > 1e-6:
            failures.append(f"(d) close-boiling V/F = {vf}, independent bisection {ref:.8f}")

    pre_fix = "  V/F:           0.500000\n"
    if not judge(pre_fix, STATES[0][4]):
        failures.append("sabotage arm: the pre-fix output (V/F = 0.5, no warning) passes -- the checker cannot see the defect")

    return gatekit.verdict(
        "check_flash_ill_conditioned", failures,
        "a flat Rachford-Rice function is declared and V/F is bisected, not left at the seed: "
        + " and ".join(f"{v:.6f}" for v in seen)
        + " against the references 0.275308 / 0.724692; an ordinary flash and a close boiler (|g'| 7e-5) print no warning; "
        "the pre-fix V/F = 0.5 output is refused",
    )


if __name__ == "__main__":
    sys.exit(main())
