#!/usr/bin/env python3
"""AN EQUILIBRIUM STAGE IS A FLASH -- the identity gate (2026-08-04).

Witness: tutorials/steady/distillation/column12_stage_is_a_flash.

A column's MESH equations and a flash drum's Rachford-Rice are different
code claiming the same physics.  The witness draws BOTH phases off one
equilibrium stage, recombines them, and re-flashes the mixture
adiabatically at the same pressure.  Nothing may happen.

What this gate asserts, all of it read from the run and none of it typed
into the case:

  I1  TEMPERATURE.  The re-flashed outlet temperature equals the stage's
      own temperature.  This is the sharp one: the flash SOLVES T from an
      energy balance, so recovering the column's T means the two agree
      about the enthalpy of both phases, not just about K-values.
  I2  LIQUID COMPOSITION.  checkLiquid == stageLiquid, component by
      component, on mole fractions.
  I3  VAPOUR COMPOSITION.  checkVapour == stageVapour, likewise.
  I4  THE SPLIT.  The re-flashed vapour fraction equals the ratio of the
      two side draws -- the flash re-derives the phase amounts, it does
      not inherit them.
  I5  THE STAGE IS REALLY TWO-PHASE.  x and y must DIFFER (here by more
      than 0.1 in benzene).  Without this the whole identity could pass
      trivially on a stage where nothing is separating, which is exactly
      how a broken K-value definition (all K == 1) would hide.
  I6  THE INLET'S PHASE STATE IS PRICED.  The adiabatic flash must
      announce the vapour fraction it read for its feed, and it must be
      the mixer's, not 0.  Building this witness is what found the flash
      pricing every inlet as a sub-cooled liquid.

  N1  THE NEGATIVE.  Draw the vapour from a DIFFERENT stage than the
      liquid.  That mixture is NOT an equilibrium mixture, so the flash
      must move it -- and the identity must FAIL.  Without this probe the
      gate would pass on an engine that simply copied its inlet through.

Tolerances are 1e-6 relative, stated in the witness README with the
measurement that justifies them: the observed agreement is ~1e-7, limited
by the adiabatic flash's own outer-Newton energy residual, not by the
physics.  A gate claiming machine precision here would be claiming
something the run does not deliver.

Exit 1 listing failures."""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "distillation" / "column12_stage_is_a_flash"

RTOL = 1.0e-6

failures = []


def run(case: Path):
    p = subprocess.run([str(SOLVE), "."], cwd=case, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def fresh(tmp: Path, tag: str) -> Path:
    d = tmp / tag
    shutil.copytree(CASE, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*", "resultJson*"))
    return d


def stream(case: Path, name: str):
    """-> (T [K], {component: molar flow}) from converged/<name>."""
    t = (case / "converged" / name).read_text()
    m = re.search(r'componentMolarFlows\s*\{(.*?)\n\}', t, re.S)
    flows = {} if not m else {
        k: float(v) for k, v in
        re.findall(r'([A-Za-z][A-Za-z0-9]*)\s+([-\d.eE+]+)\s*kmol/h;',
                   m.group(1))}
    mt = re.search(r'^T\s+([-\d.eE+]+)\s*K\s*;', t, re.M)
    return (float(mt.group(1)) if mt else None), flows


def fractions(flows: dict) -> dict:
    tot = sum(flows.values())
    return {k: v / tot for k, v in flows.items()} if tot > 0 else {}


def close(a, b, rtol=RTOL):
    return abs(a - b) <= rtol * max(abs(a), abs(b), 1.0e-12)


def compare(case: Path, tag: str, fail):
    """The four identity claims.  `fail` collects; returns True if all held."""
    ok = True
    T_L, f_L = stream(case, "stageLiquid")
    T_V, f_V = stream(case, "stageVapour")
    T_cL, f_cL = stream(case, "checkLiquid")
    T_cV, f_cV = stream(case, "checkVapour")

    # I1 -- temperature
    if T_L is None or T_cL is None or not close(T_L, T_cL):
        fail(f"{tag} I1: stage T {T_L} vs re-flashed T {T_cL}")
        ok = False
    if T_V is not None and T_cV is not None and not close(T_V, T_cV):
        fail(f"{tag} I1: stage vapour T {T_V} vs re-flashed vapour T {T_cV}")
        ok = False

    # I2 / I3 -- compositions
    for label, ref, got in (("I2 liquid", f_L, f_cL), ("I3 vapour", f_V, f_cV)):
        xr, xg = fractions(ref), fractions(got)
        if set(xr) != set(xg):
            fail(f"{tag} {label}: component sets differ {sorted(xr)} vs {sorted(xg)}")
            ok = False
            continue
        for c in sorted(xr):
            if not close(xr[c], xg[c]):
                fail(f"{tag} {label}: {c} {xr[c]:.12g} vs {xg[c]:.12g}")
                ok = False

    # I4 -- the split, re-derived
    U, W = sum(f_L.values()), sum(f_V.values())
    Lc, Vc = sum(f_cL.values()), sum(f_cV.values())
    if U + W <= 0 or Lc + Vc <= 0:
        fail(f"{tag} I4: a zero-flow stream (U={U} W={W} L={Lc} V={Vc})")
        ok = False
    elif not close(W / (U + W), Vc / (Lc + Vc)):
        fail(f"{tag} I4: draw ratio {W/(U+W):.12g} vs re-flashed V/F "
             f"{Vc/(Lc+Vc):.12g}")
        ok = False
    return ok


def main() -> int:
    if not SOLVE.exists():
        print(f"check_stage_identity: {SOLVE} missing -- build first")
        return 1

    def fail(msg):
        failures.append(msg)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- the witness, as shipped ---------------------------------
        base = fresh(tmp, "base")
        rc, out = run(base)
        if rc != 0:
            print("check_stage_identity: the witness itself did not run\n"
                  + out[-3000:])
            return 1
        compare(base, "witness", fail)

        # I5 -- the stage must really be separating something
        _, f_L = stream(base, "stageLiquid")
        _, f_V = stream(base, "stageVapour")
        xL, xV = fractions(f_L), fractions(f_V)
        key = "benzene"
        if key not in xL or abs(xL[key] - xV[key]) < 0.1:
            fail("I5: x and y are not distinct at stage 5 -- the identity "
                 "would hold trivially (x=%r y=%r)" % (xL.get(key), xV.get(key)))

        # I6 -- the flash announces the vapour fraction it READ for its feed
        m = re.search(r'^Feed:.*?vf\s*=\s*([\d.eE+-]+)', out, re.M)
        if not m:
            fail("I6: the adiabatic flash does not announce its feed's "
                 "vapour fraction")
        elif float(m.group(1)) <= 0.0:
            fail(f"I6: the flash priced its feed at vf = {m.group(1)} -- the "
                 "recombined stream is not a sub-cooled liquid")

        # ---- N1: the negative.  Vapour off a DIFFERENT stage. ---------
        neg = fresh(tmp, "neg")
        fs = neg / "system" / "flowsheetDict"
        txt = fs.read_text()
        moved = txt.replace(
            "{ stage 5;  phase vapor;   rate 10.0 kmol/h; }",
            "{ stage 6;  phase vapor;   rate 10.0 kmol/h; }")
        if moved == txt:
            fail("N1: could not move the vapour draw -- the probe edit did "
                 "not match, so the negative tested NOTHING")
        else:
            fs.write_text(moved)
            rc, _ = run(neg)
            if rc != 0:
                fail("N1: the off-stage variant failed to run, so the "
                     "negative proves nothing")
            else:
                broke = []
                held = compare(neg, "negative", broke.append)
                if held:
                    fail("N1: liquid from stage 5 and vapour from stage 6 "
                         "recombined into a mixture the flash did NOT move "
                         "-- the identity is insensitive and proves nothing")

    if failures:
        print("check_stage_identity: FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print("check_stage_identity: OK -- a stage's own two products, "
          "recombined and re-flashed, come back as the same stage "
          f"(T, x, y, V/F all within {RTOL:g} relative); the off-stage "
          "negative does not")
    return 0


if __name__ == "__main__":
    sys.exit(main())
