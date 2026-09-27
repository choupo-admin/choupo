#!/usr/bin/env python3
"""check_degenerate_limits -- a model's degenerate limit is the LIMIT, not a
special case somebody forgot.

WHY.  An external review of distillation (2026-09-07) found two defects of
one shape, both LATENT -- no corpus case reaches either -- and both a wrong
answer at exit 0 on the day a case does (DEV.md §5 A7):

  D08  `Absorber` and `Stripper` built the stage tridiagonal's right-hand
       side by ASSIGNMENT: `d[0] = L x_in` (top feed), then
       `d[N-1] = V y_in` (bottom feed).  With ONE stage the top and the
       bottom are the same slot, and the second write erased the first -- a
       stripper with a clean stripping gas lost its whole solute load, an
       absorber lost what a semi-lean solvent carried in.  The energy rows
       beside them always used `+=`.  The corpus runs 6, 8 and 9 stages, so
       every golden was blind to it.

  D06  The kinetic reactive column's rate multiplied an activity into a leg
       only when it was POSITIVE, then patched the FORWARD leg alone for a
       zero one (`else if (nu < 0) af = 0`).  An ABSENT PRODUCT therefore
       left the reverse leg at 1.0 -- priced as though the product sat at
       unit activity.  Every other rate in the engine (RateLaw, the CSTR, the
       PFR, the batch reactor, the dynamic CSTR) raises the activity with
       std::pow, which is 0 at 0 for a positive exponent on both legs.

WHAT IT CHECKS
  A1  a ONE-STAGE absorber is a flash of the combined feeds.  The probe is a
      copy of absorber01_NH3_water with `stages 1`, the heat of absorption
      zeroed (so the stage sits at the feed temperature and K is the unit's
      own published K_NH3), and a SEMI-LEAN solvent carrying NH3 -- a lean
      solvent carries none, and then the overwrite erases nothing, which is
      why the corpus could not see it.  By hand, for the solute:
          x = (L x_in + V y_in) / (L + V K),   liquid out = L x,
          gas out = V K x.
      Both outlets are compared with that, and the solute must be conserved.
  A2  the same for a ONE-STAGE stripper, a copy of stripper01_NH3_water: its
      stripping gas is clean, so the overwrite erased the ENTIRE solute.
  A3  the probes provably reached the branch they test: `stages == 1` and
      `nonIsothermal == 0` are read off the run before the identity is --
      a probe that silently ran six stages or the energy loop would test
      something else and could pass by accident.
  A4  (D06) a kinetic reactive column whose product carries an explicit
      adsorption constant `K 0;` has that product's adsorbed activity
      a'_i = K_i a_i / M_i identically ZERO on every stage, so its reverse
      leg must vanish: the run must reproduce, EXACTLY (every KPI and every
      stream in the result JSON), the SAME column with its reverse rate
      constant set to zero.  Before the fix the reverse leg priced the absent
      product at unit activity and the two runs parted (measured on the
      parent commit: reactionExtent 1.02570912736e-09 against
      1.02743439018e-09 kmol/s).  The probe's catalyst charge is small enough
      that the column converges; see CAT_MASS for why it must be.
  A5  (D06) the two refusals the fix brought with it: a kinetic reactant with
      no declared `order` refuses through Reaction::forwardOrder, and an
      `adsorption` law whose reacting species declares no K refuses by name.

WHAT IT DOES NOT CHECK, stated so nothing is implied:
  * N >= 2 absorbers and strippers (the corpus goldens pin those);
  * whether the kinetic reactive column CONVERGES at a catalyst charge that
    moves its profile -- on column05's system it does not at 0.01 g or
    above, identically on the parent commit (DEV.md §5 A7), so the probe
    runs at a charge where the reaction stays inside the Newton tolerance;
  * a Newton TRIAL that drives a product's x to zero -- the same limit, but
    no output can show which trials the solver took.

SABOTAGES, performed by hand on 2026-09-27, restored by `cp` then `make all`:
  S1  Absorber.cpp rows back to `d[0] = ...` / `d[N-1] = ...` -> A1 FAILED,
      "-2 kmol/h unaccounted": exactly the semi-lean solvent's NH3.
  S2  Stripper.cpp likewise -> A2 FAILED, "the engine 0 / 0 kmol/h (-5
      kmol/h unaccounted)": the whole solute load, both outlets empty.
  S3  DistillationColumn.cpp rate loop back to the positive-only multiply with
      the forward-only patch -> A4 FAILED, reactionExtent 1.02570912736e-09
      against 1.02743439018e-09 kmol/s.
  All three in ONE rebuild: each fired its own arm and no other (A5 stayed
  green), which is what makes one rebuild enough.  The PARENT commit's
  engine fails all five arms.

Exit 0 = every probe reproduces its hand calculation.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"

ABSORBER = ROOT / "tutorials/steady/absorption/absorber01_NH3_water"
STRIPPER = ROOT / "tutorials/steady/absorption/stripper01_NH3_water"
RDCOLUMN = ROOT / "tutorials/steady/distillation/column05_reactive_methylacetate"

REL_TOL = 1.0e-9          # the identity is algebraic; the JSON carries 12 figures
failures = []


def run(case: Path):
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def result_json(out: str) -> dict:
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def copy_probe(src: Path, dst: Path):
    shutil.copytree(src, dst)
    #  The probe is not testing the seal, and a modified record would
    #  legitimately diverge from it (check_lumped_cp_note's precedent).
    for junk in ("converged", "reports", "design", "log.choupoSolve",
                 "expected", "constant/propertyManifest"):
        tgt = dst / junk
        if tgt.is_dir():
            shutil.rmtree(tgt)
        elif tgt.exists():
            tgt.unlink()


def edit(path: Path, old: str, new: str, arm: str) -> bool:
    txt = path.read_text()
    if old not in txt:
        failures.append(f"{arm}: the probe cannot edit {path.name} -- it no"
                        f" longer carries {old!r}, so this arm is testing"
                        f" nothing")
        return False
    path.write_text(txt.replace(old, new, 1))
    return True


def flow(stream: dict, comp: str) -> float:
    return stream["F"] * stream["composition"].get(comp, 0.0)


def close(a: float, b: float, scale: float) -> bool:
    return abs(a - b) <= REL_TOL * max(abs(scale), 1e-300)


def one_stage(arm: str, src: Path, unit: str, liq_in: str, gas_in: str,
              liq_out: str, gas_out: str, extra_edit):
    """A single equilibrium stage is a flash of the combined feeds."""
    with tempfile.TemporaryDirectory() as td:
        probe = Path(td) / "probe"
        copy_probe(src, probe)
        fs = probe / "system/flowsheetDict"
        txt = fs.read_text()
        new, k = re.subn(r"stages(\s+)\d+;", r"stages\g<1>1;", txt, count=1)
        if k != 1:
            failures.append(f"{arm}: no `stages N;` to set to 1 in {src.name}")
            return
        fs.write_text(new)
        henry = probe / "constant/parameters/Henry/NH3-water.dat"
        if not edit(henry, "enthalpy    -33700  J/mol;",
                    "enthalpy         0  J/mol;", arm):
            return
        if extra_edit and not extra_edit(probe):
            return
        rc, out = run(probe)
        js = result_json(out)
        if rc != 0 or not js:
            failures.append(f"{arm}: the one-stage {unit} probe did not run"
                            f" (exit {rc})")
            return
        kp = js["kpis"].get(unit, {})
        # -- A3: the branch was reached
        if kp.get("stages") != 1 or kp.get("nonIsothermal") != 0:
            failures.append(f"A3/{arm}: the probe did not reach the one-stage"
                            f" isothermal branch (stages={kp.get('stages')},"
                            f" nonIsothermal={kp.get('nonIsothermal')}) --"
                            f" its identity would prove nothing")
            return
        st = js["streams"]
        L, V = st[liq_in]["F"], st[gas_in]["F"]
        S = flow(st[liq_in], "NH3") + flow(st[gas_in], "NH3")
        K = kp["K_NH3"]
        x = S / (L + V * K)
        want_liq, want_gas = L * x, V * K * x
        got_liq, got_gas = flow(st[liq_out], "NH3"), flow(st[gas_out], "NH3")
        if S <= 0.0:
            failures.append(f"{arm}: the probe feeds no NH3 -- nothing to test")
            return
        if not (close(got_liq, want_liq, S) and close(got_gas, want_gas, S)):
            failures.append(
                f"{arm}: a ONE-STAGE {unit} is not a flash of its combined"
                f" feeds.  NH3 in = {S*3600:.9g} kmol/h, K = {K:.9g}:"
                f" by hand liquid {want_liq*3600:.9g} / gas"
                f" {want_gas*3600:.9g} kmol/h, the engine"
                f" {got_liq*3600:.9g} / {got_gas*3600:.9g} kmol/h"
                f" ({(got_liq+got_gas-S)*3600:+.9g} kmol/h unaccounted).  A"
                f" top feed and a bottom feed that share the only stage must"
                f" BOTH reach it -- see the `d[0]`/`d[N-1]` rows")
            return
        return (S, K, got_liq, got_gas)


def semi_lean_solvent(probe: Path) -> bool:
    return edit(probe / "0/solvent", "    water    150 kmol/h;",
                "    NH3    2 kmol/h;\n    water    150 kmol/h;", "A1")


# ---------------------------------------------------------------- D06 probe
KINETICS_BLOCK = """kinetics
            {
                model adsorption;
                forward { A 8.497e6; Ea 60470; }
                reverse { A %s; Ea 63730; }
                adsorption ( { component methanol;      K 5.64; }
                             { component aceticAcid;    K 3.15; }
                             { component methylAcetate; K 4.15; }
                             { component water;         K 0; } );
                catalystMass %s;
            }"""


def rd_probe(td: Path, tag: str, reverse_A: str, cat: str,
             orders: bool = True, water_k: bool = True) -> Path:
    probe = td / tag
    copy_probe(RDCOLUMN, probe)
    fs = probe / "system/flowsheetDict"
    txt = fs.read_text()
    blk = KINETICS_BLOCK % (reverse_A, cat)
    if not water_k:
        blk = blk.replace("\n                             { component water;"
                          "         K 0; }", "")
    txt = txt.replace("equilibrium { Ka298 38.7; dHrxn -5670; }", blk)
    if orders:
        txt = txt.replace("{ component methanol;      nu -1; }",
                          "{ component methanol;      nu -1; order 1; }")
        txt = txt.replace("{ component aceticAcid;    nu -1; }",
                          "{ component aceticAcid;    nu -1; order 1; }")
    fs.write_text(txt)
    #  Methyl acetate in the acid feed, so the OTHER product sits at a real
    #  activity on every reactive stage: before the fix the reverse leg then
    #  priced k_r a'_MeOAc x 1 -- a visible number -- instead of the
    #  near-zero it would be with a product-free feed.
    af = probe / "0/acidFeed"
    af.write_text(af.read_text().replace(
        "    aceticAcid    0.0308 kmol/h;",
        "    aceticAcid    0.0308 kmol/h;\n    methylAcetate    0.005 kmol/h;",
        1))
    return probe


def reactive_arms():
    with tempfile.TemporaryDirectory() as tds:
        td = Path(tds)
        src = (RDCOLUMN / "system/flowsheetDict").read_text()
        if "equilibrium { Ka298 38.7; dHrxn -5670; }" not in src:
            failures.append("A4: column05's reaction block changed shape; the"
                            " kinetic probe cannot be built, so A4/A5 test"
                            " nothing")
            return None
        # -- A4: an absent product's reverse leg vanishes
        outs = {}
        for tag, revA in (("withReverse", "6.127e5"), ("noReverse", "0")):
            rc, out = run(rd_probe(td, tag, revA, CAT_MASS))
            if rc != 0:
                failures.append(f"A4: the kinetic probe '{tag}' did not"
                                f" converge (exit {rc}); the arm needs both"
                                f" runs to compare")
                return None
            outs[tag] = out
        prof = {}
        for tag, out in outs.items():
            js = result_json(out)
            r = re.search(r"Reaction: .*", out)
            prof[tag] = (js.get("kpis", {}).get("rdColumn"), js.get("streams"),
                         (r.group(0) if r else ""))
        kp = prof["withReverse"][0] or {}
        if "reactionExtent" not in kp or not prof["withReverse"][2]:
            failures.append("A4: the kinetic probe published no reactionExtent"
                            " or reaction line -- nothing was compared")
            return None
        #  EXACT equality, deliberately: with a'_water = 0 the reverse term is
        #  k_r * 0 and r = k_f*af - 0 is the same double as the no-reverse
        #  run's k_f*af - 0*0, so the two runs take the same iterates bit for
        #  bit.  A tolerance here would only hide the defect it exists for.
        if prof["withReverse"][:2] != prof["noReverse"][:2]:
            e1 = kp.get("reactionExtent")
            e0 = (prof["noReverse"][0] or {}).get("reactionExtent")
            failures.append(
                "A4: water declares `K 0;`, so its adsorbed activity is ZERO"
                " on every stage and the reverse leg k_r a'_MeOAc a'_water"
                " must vanish -- yet the column with a reverse rate differs"
                f" from the one without: reactionExtent {e1!r} against"
                f" {e0!r} kmol/s.  An absent product is being priced at a"
                " nonzero activity on the reverse leg (D06).")
        # -- A5: the refusals
        rc, out = run(rd_probe(td, "noOrder", "6.127e5", CAT_MASS,
                               orders=False))
        if rc == 0 or "declares no `order`" not in out:
            failures.append("A5: a kinetic reactant with no `order` did not"
                            " refuse through Reaction::forwardOrder -- the"
                            " rate would take |nu| as a mechanism nobody"
                            " declared")
        rc, out = run(rd_probe(td, "noK", "6.127e5", CAT_MASS,
                               water_k=False))
        if rc == 0 or "declares no K" not in out or "'water'" not in out:
            failures.append("A5: an `adsorption` law whose product 'water'"
                            " declares no K did not refuse by name -- its"
                            " reverse leg would vanish on a number nobody"
                            " declared")
        return prof["withReverse"][2]


#  Small enough that the probe CONVERGES: on this system the kinetic mode does
#  not converge at 0.01 g or above, identically before and after D06 (a
#  pre-existing finding, DEV.md §5 A7).  At 0.001 g the reaction does not move
#  the profile past the Newton tolerance, so A4 tests the rate the column
#  EVALUATES and REPORTS (reactionExtent is recomputed from rateAt on the
#  converged profile) -- which is exactly where D06 lived.
CAT_MASS = "0.001 g"


def main() -> int:
    if not SOLVE.exists():
        print("check_degenerate_limits: choupoSolve missing -- build first")
        return 1

    a1 = one_stage("A1", ABSORBER, "scrubber", "solvent", "gasFeed",
                   "richLiquid", "cleanGas", semi_lean_solvent)
    a2 = one_stage("A2", STRIPPER, "stripper", "liquidFeed", "strippingGas",
                   "strippedLiquid", "richGas", None)
    rx = reactive_arms()

    if failures:
        print("check_degenerate_limits: FAIL")
        for f in failures:
            print("  -", f)
        return 1

    print("check_degenerate_limits: OK -- a ONE-STAGE absorber (semi-lean"
          " solvent, NH3 in both feeds: %.6g kmol/h, K %.6g) and a ONE-STAGE"
          " stripper (%.6g kmol/h, K %.6g) each reproduce the flash of their"
          " combined feeds to %.0e of the solute, both probes provably on the"
          " one-stage isothermal branch; a kinetic reactive column whose"
          " product adsorbs with K 0 reproduces the same column with no"
          " reverse rate EXACTLY, every KPI and stream (%s); a kinetic reactant"
          " with no `order` and an adsorbing product with no K both refuse by"
          " name.  NOT checked: N >= 2 (the goldens pin those), whether a"
          " kinetic reactive column converges at a catalyst charge that"
          " moves its profile (on this system it does not, before or after"
          " the fix), or a Newton trial crossing a zero activity."
          % (a1[0] * 3600, a1[1], a2[0] * 3600, a2[1], REL_TOL, rx))
    return 0


if __name__ == "__main__":
    sys.exit(main())
