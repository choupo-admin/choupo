#!/usr/bin/env python3
"""Gate: an ADIABATIC gibbsReactor's approach direction is read from the
answer, never from the seed.

    bin/curate/check_adiabatic_approach_direction.py

WHY THIS EXISTS (DEV.md 5, entry 2026-10-01; fixed 2026-10-03).  The case
declares `temperatureApproach` as a MAGNITUDE and the engine assigns the
sign from the thermicity of the transformation feed -> equilibrium
(TemperatureApproach.H, one home).  In `mode adiabatic` the physical T is
the ANSWER of an outer Newton, and until 2026-10-03 the thermicity was read
at that Newton's SEED, `operation.T`.  A feed that already carries product
is itself at equilibrium at some temperature; seeded HOTTER than that, the
equilibrium at the seed holds less product than the feed, the transformation
reads as DECOMPOSITION (endothermic), the approach takes T - |dT|, and the
bed ends MORE converted than its own dT = 0 equilibrium outlet -- the
approach helps instead of hurting, and a colder seed on the SAME case takes
the other sign.  Measured with the old rule on the witness's feed (16 % NH3,
150 bar, 415 C in, dT = 10 K): seed 768 K -> 734.2 K and 19.32 % NH3 (sign
"-"); seed 708 K -> 721.1 K and 18.36 % (sign "+"); the dT = 0 outlet is
727.6 K and 18.84 % from either seed.  The RULE now: solve the adiabatic bed
ONCE with no approach, read the thermicity of feed -> THAT state (its own
equilibrium outlet T0, which no seed can move), announce T0 and the enthalpy
change, re-solve from T0 with the signed approach
(GibbsReactor.cpp, the adiabatic branch; GibbsReactor.H `AdiabaticProbe`).

WHAT THIS GATE CHECKS, on the witness
tutorials/steady/gibbs/gibbs13_adiabatic_approach_direction (sealed; seeded
80 K HOT on purpose) and two scratch copies of it.

  (a) ONE OUTLET, WHICHEVER SEED.  The witness under its own hot seed and a
      copy seeded 60 K colder publish the SAME `T`, `y_NH3` and
      `temperatureApproach_K` (1e-9 relative) and the same sign word.  A rule
      that read the seed passes neither half of this arm with one sign.
  (b) BELOW ITS OWN EQUILIBRIUM.  A copy with `temperatureApproach 0;` is the
      bed's dT = 0 outlet; the approach run must end with LESS NH3 and a
      LOWER T (the reaction is exothermic, so a bed short of equilibrium is
      colder).  Under the old rule the hot seed ended ABOVE on both.
  (c) THE ANNOUNCEMENT NAMES WHAT DECIDED IT.  The `[gibbs] temperatureApproach`
      line of the witness names the dT = 0 ADIABATIC outlet `T0 = <value> K`,
      and that value equals the dT = 0 copy's own `T` KPI to the two decimals
      it prints; it names the seed it was reached from; it says the seed
      cannot move the sign; and the same sentence reaches the end-of-run
      caveat block, not only its site.
  (d) THE COST IS PUBLISHED.  `approachProbeOuterIterations` is a KPI of the
      witness (> 0), absent from the dT = 0 copy (no probe ran).
  (e) THE ISOTHERMAL PATH AND THE NO-APPROACH PATH ARE UNTOUCHED.  The dT = 0
      copy prints NO approach line and no `(adiabatic mode:` clause;
      gibbs10_ammonia_fugacity (isothermal, no approach) runs to exit 0 with
      its golden unmoved -- measured byte-identical against a build of the
      parent commit on 2026-10-03 for ammoniaStaged03_approach (isothermal
      WITH an approach) and for the dT = 0 copies, a two-build comparison
      this gate does not repeat.
  (f) SOURCE ARM.  The adiabatic branch of GibbsReactor.cpp calls
      `approachDirection` with the probe's root and an `AdiabaticProbe`, and
      no call site passes `T_guess` to it with a probe (comments stripped).
      A source arm, because an output arm cannot tell a correct answer from
      a correct answer reached by luck of the seed.

BY-HAND SABOTAGES (2026-10-03, each restored by copy + make; results as
MEASURED, see the record):
  S1 GibbsReactor.cpp: the adiabatic direction read at the SEED again
     (`approachDirection(..., T_guess, ..., &probe)` in place of `r0.x`)
     -> (a) hot seed T 734.235 against cold 721.052, y_NH3 0.19322 against
        0.18355, sign - against +; (b) hot seed ABOVE the dT = 0 outlet on
        both T and NH3; (c) T0 printed as 768.15, not the dT = 0 run's
        727.63; (f) the call passes T_guess.
  S2 GibbsReactor.cpp: the `(adiabatic mode: ...)` clause dropped from the
     message
     -> (c) no `T0 =` on the approach line and none in the caveat block;
        (a), (b), (d) PASS -- the answer is right and the reader is not
        told what decided it, which is why (c) exists.
  S3 GibbsReactor.cpp: `approachProbeOuterIterations` not published
     -> (d) only.

WHAT THIS GATE DOES NOT CHECK, stated so its green line cannot imply it.
Whether 10 K is RIGHT for any bed (the magnitude is empirical, calibrated,
never predicted).  A bed whose dT = 0 outer Newton does not converge (the
probe is then ANNOUNCED through announceOuterNotConverged and the direction
read at its last iterate; no corpus case reaches it).  A multi-bed converter
on a recycle (ammonia03_quench_converter declares no approach).  The
isothermal direction itself, which check_reaction_subset_approach's source
arm and the ammoniaStaged03 golden cover.  And it reads no number of the
physics beyond the ORDER of three outlets: it does not say 18.36 % is the
right answer, only that it is below 18.84 % and the same from two seeds.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
SRC = ROOT / "src" / "unitOperations" / "reactor" / "GibbsReactor.cpp"
WITNESS = (ROOT / "tutorials" / "steady" / "gibbs"
           / "gibbs13_adiabatic_approach_direction")
ISO = ROOT / "tutorials" / "steady" / "gibbs" / "gibbs10_ammonia_fugacity"

HOT_SEED = "T 768.15 K;"          # the witness's own seed line (flowsheetDict)
COLD_SEED = "T 708.15 K;"         # 60 K colder
APPROACH = "temperatureApproach 10;"
NO_APPROACH = "temperatureApproach 0;"

fails = []


def run(case: Path):
    p = subprocess.run([str(BIN)], cwd=str(case), capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            js = None
    return p.returncode, out, js


def fixture(td: str, name: str, edits) -> Path:
    """Copy the witness to td/name and apply (old, new) edits to its
    flowsheetDict; every edit must land exactly once, or the fixture is
    STALE and the probe would run the engine on the wrong question."""
    dst = Path(td) / name
    shutil.copytree(WITNESS, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "iterations", "design"))
    f = dst / "system" / "flowsheetDict"
    t = f.read_text()
    for old, new in edits:
        if t.count(old) != 1:
            raise SystemExit(f"check_adiabatic_approach_direction: the probe "
                             f"'{name}' cannot find '{old}' exactly once in "
                             "system/flowsheetDict -- the fixture is STALE")
        t = t.replace(old, new)
    f.write_text(t)
    return dst


def kpis(js, unit="bed3"):
    return ((js or {}).get("kpis") or {}).get(unit, {})


def close(a, b, rel):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-300)


def sign_word(out: str):
    m = re.search(r"equilibrium at T = [0-9.]+ K is (EXOTHERMIC|ENDOTHERMIC)",
                  out)
    return m.group(1) if m else None


def main() -> int:
    if not BIN.exists():
        print("check_adiabatic_approach_direction: FAILED -- no native build "
              f"at {BIN.relative_to(ROOT)} (run make all)")
        return 1
    if not WITNESS.exists():
        print("check_adiabatic_approach_direction: FAILED -- the witness "
              f"{WITNESS.relative_to(ROOT)} is missing")
        return 1

    with tempfile.TemporaryDirectory() as td:
        hot = fixture(td, "hot", [])
        cold = fixture(td, "cold", [(HOT_SEED, COLD_SEED)])
        dt0 = fixture(td, "dt0", [(APPROACH, NO_APPROACH)])
        runs = {}
        for name, case in (("hot", hot), ("cold", cold), ("dt0", dt0)):
            rc, out, js = run(case)
            if rc != 0 or js is None:
                err = re.findall(r"ERROR:.*", out)
                print("check_adiabatic_approach_direction: FAILED -- the "
                      f"'{name}' run exited {rc}"
                      + (f": {err[-1][:160]}" if err else ""))
                return 1
            runs[name] = (out, kpis(js))

        out_h, k_h = runs["hot"]
        out_c, k_c = runs["cold"]
        out_0, k_0 = runs["dt0"]

        # (a) one outlet, whichever seed
        for key in ("T", "y_NH3", "temperatureApproach_K", "y_N2", "y_H2"):
            if key not in k_h or key not in k_c:
                fails.append(f"(a) KPI {key} missing from the hot or cold run")
            elif not close(k_h[key], k_c[key], 1e-9):
                fails.append(f"(a) {key}: hot seed {k_h[key]} against cold "
                             f"seed {k_c[key]} -- the seed moved the answer")
        if sign_word(out_h) is None or sign_word(out_h) != sign_word(out_c):
            fails.append(f"(a) sign word: hot {sign_word(out_h)} against cold "
                         f"{sign_word(out_c)} -- the seed moved the sign")
        if k_h.get("temperatureApproach_K", 0.0) <= 0.0:
            fails.append("(a) the witness's signed approach is "
                         f"{k_h.get('temperatureApproach_K')}; ammonia "
                         "synthesis from this feed is exothermic, so it must "
                         "be +10")

        # (b) below its own equilibrium
        if not (k_h.get("y_NH3", 1.0) < k_0.get("y_NH3", 0.0)):
            fails.append(f"(b) y_NH3 with the approach {k_h.get('y_NH3')} is "
                         f"not BELOW the dT = 0 outlet's {k_0.get('y_NH3')}")
        if not (k_h.get("T", 1e9) < k_0.get("T", 0.0)):
            fails.append(f"(b) T with the approach {k_h.get('T')} K is not "
                         f"BELOW the dT = 0 outlet's {k_0.get('T')} K")

        # (c) the announcement names what decided it
        m = re.search(r"dT = 0 ADIABATIC outlet T0 = ([0-9.]+) K", out_h)
        if not m:
            fails.append("(c) the approach line does not name the dT = 0 "
                         "ADIABATIC outlet T0")
        else:
            T0 = float(m.group(1))
            if abs(T0 - k_0.get("T", 0.0)) > 0.006:
                fails.append(f"(c) announced T0 = {T0} K is not the dT = 0 "
                             f"run's own T = {k_0.get('T')} K")
        if "solved first from the seed 768.15 K" not in out_h:
            fails.append("(c) the announcement does not name the seed the "
                         "dT = 0 solve started from")
        if "the seed cannot move the sign" not in out_h:
            fails.append("(c) the announcement does not say the seed cannot "
                         "move the sign")
        tail = out_h.split("ASSUMPTIONS AND CAVEATS", 1)
        if len(tail) < 2 or "dT = 0 ADIABATIC outlet T0 =" not in tail[1]:
            fails.append("(c) the direction sentence did not reach the "
                         "caveat block")

        # (d) the cost is published
        if not (k_h.get("approachProbeOuterIterations", 0.0) > 0.0):
            fails.append("(d) approachProbeOuterIterations is not a positive "
                         "KPI of the witness")
        if "approachProbeOuterIterations" in k_0:
            fails.append("(d) the dT = 0 run publishes "
                         "approachProbeOuterIterations although no probe ran")

        # (e) the no-approach path and the isothermal path untouched
        if "[gibbs] temperatureApproach" in out_0 or "(adiabatic mode:" in out_0:
            fails.append("(e) the dT = 0 run prints an approach line")
        if ISO.exists():
            iso = Path(td) / "iso"
            shutil.copytree(ISO, iso, ignore=shutil.ignore_patterns(
                "converged", "reports", "iterations", "design"))
            rc, out_i, js_i = run(iso)
            if rc != 0 or js_i is None:
                fails.append(f"(e) gibbs10_ammonia_fugacity exited {rc}")
            else:
                exp = (ISO / "expected").read_text()
                mm = re.search(r"kpi\s+ammonia\s+y_NH3\s+([0-9.eE+-]+)", exp)
                got = kpis(js_i, "ammonia").get("y_NH3")
                if not mm or got is None or not close(got, float(mm.group(1)), 1e-4):
                    fails.append(f"(e) gibbs10's y_NH3 {got} against its golden "
                                 f"{mm.group(1) if mm else None}")
                if "[gibbs] temperatureApproach" in out_i:
                    fails.append("(e) gibbs10 (no approach) prints an approach line")

    # (f) source arm
    code = SRC.read_text()
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    code = re.sub(r"//[^\n]*", "", code)
    if not re.search(r"approachDirection\(\*method,\s*prob,\s*r0\.x,\s*dTmagnitude,\s*&probe\)",
                     code):
        fails.append("(f) the adiabatic branch does not call approachDirection "
                     "at the dT = 0 root r0.x with an AdiabaticProbe")
    if re.search(r"approachDirection\([^;]*T_guess[^;]*&probe", code, re.S):
        fails.append("(f) a call passes T_guess (the SEED) to approachDirection "
                     "with a probe -- the direction is read at the seed again")
    if "AdiabaticProbe probe;" not in code:
        fails.append("(f) no AdiabaticProbe is built in GibbsReactor.cpp")

    if fails:
        print("check_adiabatic_approach_direction: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_adiabatic_approach_direction: OK -- an ADIABATIC "
          "gibbsReactor's approach direction is read from the dT = 0 "
          "adiabatic answer, never from the seed: the witness gibbs13 under "
          "its hot seed and a 60 K colder seed ends at ONE outlet (T, y_NH3, "
          "the signed +10 K, the sign word; 1e-9); that outlet is BELOW the "
          "dT = 0 outlet in NH3 and in T; the announcement names the dT = 0 "
          "outlet T0 (equal to the dT = 0 run's own T), the seed it started "
          "from and that the seed cannot move the sign, and reaches the "
          "caveat block; the probe's cost is a KPI of the approach run and "
          "absent from the dT = 0 run; the dT = 0 run prints no approach "
          "line and gibbs10 (isothermal, no approach) holds its golden; the "
          "adiabatic branch calls approachDirection at the probe's root with "
          "an AdiabaticProbe and no call passes the seed with one.  "
          "NOT checked: whether 10 K is right for any bed, an unconverged "
          "dT = 0 probe, a multi-bed recycle, the isothermal direction (other "
          "gates), and any number of the physics beyond the ORDER of three "
          "outlets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
