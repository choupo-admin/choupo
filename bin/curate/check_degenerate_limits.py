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
      parent commit, at the 0.001 g the arm then ran: reactionExtent
      1.02570912736e-09 against 1.02743439018e-09 kmol/s).  Since the A7
      convergence fix the arm runs at CAT_MASS = 1 g, a charge that converts
      ~12 % of the acid -- the reaction MOVES the profile it is compared on.
  A5  (D06) the two refusals the fix brought with it: a kinetic reactant with
      no declared `order` refuses through Reaction::forwardOrder, and an
      `adsorption` law whose reacting species declares no K refuses by name.
  A6  (A7) the kinetic reactive column CONVERGES at charges that move its
      profile and its answer SATISFIES the balances it was solved on.  At
      1 g and 10 g (both runs exit 0): every component closes over the
      column, out - in = nu_i * reactionExtent, to 1e-9 of the total feed
      (measured ~1e-12), recomputed here from the result JSON's streams and
      the column's own reactionExtent (which the engine re-evaluates from the
      rate on the converged profile); the charge actually reacts (> 5 % of
      the acid at 1 g); and conversion RISES with the charge.  The closure is
      the arm that sees the defect: the column used to mix balances in
      kmol/s with the dimensionless Sum(y)-1 rows under one absolute
      tolerance, so a charge whose imbalance stayed under 1e-9 kmol/s was
      "converged" without a single Newton iteration -- a balance off by the
      whole reaction -- and a larger one stalled, refused by the line search.
      The run must also ANNOUNCE the balance scaling (a solver aid reports
      aloud).
  A7  (A7, the remedy taken for EVERY MESH, same day) every simultaneous and
      full-MESH column the corpus ships -- found by reading each case's own
      flowsheet, never from a hand-kept list -- runs, announces its
      dimensionless balances, and closes every component balance over its
      own ports, out - in - nu_i xi, to 1e-9 of its own feed, recomputed
      from the result JSON.  Measured before the remedy: the worst was
      4.4e-11 (stripper01), so on the corpus AS SHIPPED the absolute
      tolerance was hiding nothing -- this arm is the floor that keeps it
      so, and it is what catches a MESH that stops converging (S8, S9).
  A8  (A7) a column is SCALE-INVARIANT: multiply every molar flow by 1e-8
      and nothing intensive may move.  An ABSOLUTE kmol/s tolerance fails
      exactly where the seed already satisfies the scale-free rows, because
      at 1e-8 the balances are under it from the start and the seed comes
      back as the answer after ZERO iterations.  Three probes: column06
      (full-MESH, seeded from the converged CMO profile, so every bubble
      point already holds -- the defect bites here); column05 (the reactive
      column whose ~1e-5 kmol/s feed started A7 -- a regression probe of
      its homotopy at a tiny feed, NOT a place the defect bites, see S6);
      and column02 given its OWN
      converged interior as a declared seed and run at a reflux 1.2x higher
      -- every bubble point holds at the seed and every balance is open by
      the reflux change (the probe checks that the change moves x_D by more
      than 1e-4, or a returned seed would be invisible to it).  From a
      linear-T seed a simultaneous MESH hides nothing, because the Newton's
      direction is scale-free and solves the balances along with the Sum(y)
      rows -- so the declared interior is the probe, not a nicety.  The
      full-MESH probe is also run x1e4, where an energy row in kW sits in
      the 1e6 kW range and a 1e-9 tolerance on it is below what the
      finite-difference Newton resolves.
      COST: under the full sweep A7 reads the suite's own case pass
      (bin/curate/suite_cache.py) instead of re-running fifteen cases
      (acetonePlant alone is 40 s); standalone it runs them live, three at
      a time -- ~70 s standalone, ~23 s on the cache, against the ~12 s of
      A1-A6 alone.

WHAT IT DOES NOT CHECK, stated so nothing is implied:
  * N >= 2 absorbers and strippers (the corpus goldens pin those);
  * that the kinetic profile is RIGHT -- no measured or published kinetic
    column is reproduced; A6 holds convergence, closure and monotonicity;
  * the WANG-HENKE columns' closure.  That path is not a Newton: it stops
    when the composition STEP falls under `compositionTol` (1e-6), and the
    balances it leaves open were measured on 2026-09-27 at up to 6.3e-8
    of the feed on the single-pass corpus cases (column15) and up to 8.6e-7
    on the optimisation cases' representative passes (pareto01).  Recorded in DEV.md §5
    A7 as found, not fixed -- moving that stopping rule moves every
    Wang-Henke golden and is a separate decision;
  * that the equilibrium homotopy converges beyond the 3 x 3 grid it was
    measured on (Ka298 5 / 38.7 / 500 x reflux 1.5 / 2.1 / 4, 9 of 9);
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
  engine fails all five arms.  (S1-S3 were performed with A4 at 0.001 g.)
  S4  (A7, same day) DistillationColumn.cpp's kinetic balance scale set back
      to 1 -> A4 FAILED, "the kinetic probe 'withReverse' did not converge
      (exit 2)", and nothing else (A6 needs A4's run).  The same build on the
      OLD 0.001 g probe exits 0 with every component balance off by
      5.44e-5 of the feed -- exactly reactionExtent/F, the whole reaction --
      at the reactionExtent 1.02743439018e-09 kmol/s A4 used to compare.
  S5  the published reactionExtent multiplied by (1 + 1e-6) -> A6 FAILED on
      all four components at both charges (5.31e-8 and 2.63e-7 of the feed
      against 1e-9), A4 green (both runs perturbed alike): the closure arm
      resolves a 1 ppm error in the extent.
  S4 and S5 in separate rebuilds, since S4 masks A6; restored by `cp`, then
  `make all`.
  Same day, for A7/A8 (each in its own rebuild, restored by `cp` then
  `make all`):
  S6  the balance scale set back to 1 on every MESH -> A4 (exit 2) and A8 on
      column06 and on column02's declared-interior probe (x_D_LK 0.981245
      against 0.987209: the seed returned after zero iterations).  A8's
      PLAIN column05 probe did NOT fire, and could not: from a linear-T
      seed the Newton direction is scale-free and closes the balances with
      the bubble points -- which is why the declared-interior probe exists.
  S7  the full-MESH energy rows back in kW -> SURVIVED the first version of
      A8 (x1e-8 only: the scaled material rows carry the Newton there,
      measured down to x1e-12); the x1e4 run was added, and it fires:
      column06 x1e4 exits 2, stalled at |F| 4.9e-8 kW.
  S8  the quotient seed floor removed (the K_a continuation alone) -> A7:
      column05 exits 2.  The continuation does not replace the seed.
  S9  the stage-refusal-on-a-trial rule removed -> A7: stripper02 exits 2
      -- a stage refusal ("the liquid solvent vanished") at a line-search
      trial nowhere near a column state (T = -98 K, water -1.16, measured).

Exit 0 = every probe reproduces its hand calculation.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
sys.path.insert(0, str(ROOT / "bin/curate"))
import suite_cache  # noqa: E402  (the suite's single-pass output cache)

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
        return prof["withReverse"][2], outs["withReverse"]


#  A charge that MOVES the profile: ~12 % of the acid converts at 1 g.  Until
#  the A7 fix (2026-09-27) the kinetic mode converged on this system at
#  nothing >= 0.01 g, so A4 ran at 0.001 g, where the reaction stayed inside
#  the absolute tolerance and the column returned its non-reactive profile
#  untouched -- A4 then compared the rate the column EVALUATED on a profile
#  the rate had not shaped.  A4's identity is exact at any charge (a'_water
#  = 0 makes both runs compute the same doubles), so it now holds on a
#  profile the reaction shaped.
CAT_MASS = "1 g"
#  A6's second charge: ~58 % conversion, 13 Newton iterations at full charge.
CAT_MASS_HIGH = "10 g"
CLOSURE_TOL = 1.0e-9      # of the total feed; measured ~1e-12 after the fix
NU = {"methanol": -1.0, "aceticAcid": -1.0, "methylAcetate": 1.0, "water": 1.0}


def kinetic_closure_arm(prof_1g):
    """A6: the kinetic column converges where the reaction moves it, and its
    answer satisfies the balances it was solved on."""
    runs = {CAT_MASS: prof_1g}
    with tempfile.TemporaryDirectory() as tds:
        rc, out = run(rd_probe(Path(tds), "high", "6.127e5", CAT_MASS_HIGH))
        if rc != 0:
            failures.append(f"A6: the kinetic column at {CAT_MASS_HIGH} did not"
                            f" converge (exit {rc}) -- a charge that moves the"
                            f" profile must be solvable (DEV.md §5 A7)")
            return None
        runs[CAT_MASS_HIGH] = out
    conv = {}
    for cat, out in runs.items():
        if "each component balance is divided by the total feed" not in out:
            failures.append(f"A6: the kinetic column at {cat} did not announce"
                            " its balance scaling -- a solver aid reports aloud")
        js = result_json(out)
        st = js.get("streams", {})
        kp = js.get("kpis", {}).get("rdColumn", {})
        need = ("feed", "acidFeed", "distillate", "bottoms")
        if "reactionExtent" not in kp or "conversion" not in kp \
                or any(s not in st for s in need):
            failures.append(f"A6: the run at {cat} published no reactionExtent,"
                            " conversion or port streams -- nothing to close")
            return None
        xi = kp["reactionExtent"]
        F_in = st["feed"]["F"] + st["acidFeed"]["F"]
        for c, nu in NU.items():
            gen = (flow(st["distillate"], c) + flow(st["bottoms"], c)
                   - flow(st["feed"], c) - flow(st["acidFeed"], c))
            err = abs(gen - nu * xi) / F_in
            if err > CLOSURE_TOL:
                failures.append(
                    f"A6: at {cat} the kinetic column does not satisfy its own"
                    f" balance for {c}: out - in = {gen*3600:.9g} kmol/h against"
                    f" nu*xi = {nu*xi*3600:.9g} kmol/h, off by {err:.3g} of the"
                    f" feed (tolerance {CLOSURE_TOL:.0e}).  Either the profile"
                    f" was not solved to the balances (a column stopping on an"
                    f" ABSOLUTE tolerance in kmol/s calls a profile the"
                    f" reaction never shaped 'converged') or the published"
                    f" extent is not the rate on that profile")
        conv[cat] = kp["conversion"]
    if conv[CAT_MASS] <= 0.05:
        failures.append(f"A6: at {CAT_MASS} only {conv[CAT_MASS]:.3%} of the acid"
                        " converts -- the probe no longer moves the profile it"
                        " claims to test")
    if not conv[CAT_MASS] < conv[CAT_MASS_HIGH] < 1.0:
        failures.append(f"A6: conversion does not rise with the charge"
                        f" ({CAT_MASS}: {conv[CAT_MASS]:.6g}, {CAT_MASS_HIGH}:"
                        f" {conv[CAT_MASS_HIGH]:.6g})")
    return conv


# ------------------------------------------------ A7/A8: every MESH closes
MESH_MODELS = {"simultaneous", "fullMESH", "MESH", "NaphtaliSandholm"}
#  A8's scale: small enough that EVERY component-balance row of a seed sits
#  under an absolute 1e-9 kmol/s (column02's feed becomes 2.8e-10 kmol/s), so
#  a Newton judging balances in kmol/s stops as soon as the OTHER rows do.
TINY = 1.0e-8
#  ...and the other way: x1e4 puts column06's energy rows in the 1e6 kW range,
#  where a 1e-9 tolerance in kW is below what a finite-difference Newton can
#  resolve -- measured, with the energy rows back in kW it stalls at |F| 4.9e-8
#  and exits 2; divided by the feed times the latent heat it converges in 4.
HUGE = 1.0e4
#  Plain rescaling: the full-MESH (its CMO seed already satisfies every
#  bubble point, so at x1e-8 an absolute tolerance is met by the seed), down
#  AND up, and the reactive column whose ~1e-5 kmol/s feed started A7, down.
SCALE_PROBES = (("tutorials/steady/distillation/column06_fullMESH",
                 (TINY, HUGE)),
                ("tutorials/steady/distillation/column05_reactive_methylacetate",
                 (TINY,)))
#  The simultaneous MESH needs a seed that satisfies its Sum(y) rows too --
#  from a linear-T seed the Newton's scale-free direction solves the balances
#  along with the bubble points, and nothing is hidden.  So A8's third probe
#  DECLARES an interior: column02's own converged profile, handed to the same
#  column at a reflux 1.2x higher.  Every bubble point holds at that seed and
#  every balance is open by the reflux change.
INTERIOR_PROBE = "tutorials/steady/distillation/column02_simultaneous"
INTERIOR_REFLUX = 1.2
#  The intensive answer a scaled-down column must reproduce.  The balances
#  close to ~1e-12 of the feed on either side, so the profile agrees to far
#  better than this; 1e-6 is what a returned SEED cannot meet.
SCALE_KPIS = ("x_D_LK", "x_B_HK", "T_top", "T_bottom", "conversion")
SCALE_TOL = 1.0e-6


def _strip_comments(t: str) -> str:
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def _block_at(txt: str, k: int) -> str:
    depth = 0
    for j in range(k, len(txt)):
        if txt[j] == "{":
            depth += 1
        elif txt[j] == "}":
            depth -= 1
            if depth == 0:
                return txt[k:j + 1]
    return txt[k:]


def copy_case(src: Path, dst: Path):
    """The case AS SHIPPED (its seal included -- A7 and A8 edit no record),
    minus the run outputs a previous run left behind."""
    shutil.copytree(src, dst)
    for junk in ("converged", "reports", "design", "iterations",
                 "log.choupoSolve"):
        tgt = dst / junk
        if tgt.is_dir():
            shutil.rmtree(tgt)
        elif tgt.exists():
            tgt.unlink()


def column_units(fs: Path):
    """Every distillationColumn in a flowsheetDict: (name, model, inputs,
    outputs, {component: nu}).  Read from the case's own topology, never
    from a hand-kept list."""
    txt = _strip_comments(fs.read_text())
    cols = []
    for m in re.finditer(r"type\s+distillationColumn\s*;", txt):
        depth, k = 0, m.start()
        while k > 0:
            if txt[k] == "}":
                depth += 1
            elif txt[k] == "{":
                if depth == 0:
                    break
                depth -= 1
            k -= 1
        blk = _block_at(txt, k)
        top, d = "", 0                      # the unit's own keys, no sub-dicts
        for ch in blk[1:-1]:
            if ch == "{":
                d += 1
            elif ch == "}":
                d -= 1
            elif d == 0:
                top += ch
        name = re.search(r"\bname\s+(\S+?)\s*;", top).group(1)
        mm = re.search(r"\bmodel\s+(\w+)\s*;", top) \
            or re.search(r"\bmethod\s+(\w+)\s*;", blk)
        model = mm.group(1) if mm else "WangHenke"
        ins = re.search(r"\binputs\s*\(([^)]*)\)", top)
        ins = ins.group(1).split() if ins else \
            [re.search(r"\bin\s+(\S+?)\s*;", top).group(1)]
        outs = re.search(r"\boutputs\s*\(([^)]*)\)", top)
        outs = outs.group(1).split() if outs else \
            [re.search(r"\bout\s+(\S+?)\s*;", top).group(1)]
        nu = {}
        if re.search(r"\breaction\b", blk):
            for sm in re.finditer(r"component\s+(\w+)\s*;\s*nu\s+(-?[\d.]+)",
                                  blk):
                nu[sm.group(1)] = float(sm.group(2))
        cols.append((name, model, ins, outs, nu))
    return cols


def _stream(streams: dict, nm: str):
    if nm in streams:
        return streams[nm]
    hit = [k for k in streams if k.split(".")[-1] == nm]
    return streams[hit[0]] if len(hit) == 1 else None


def _kpis(js: dict, unit: str) -> dict:
    for k, v in js.get("kpis", {}).items():
        if k == unit or k.split(".")[-1] == unit:
            return v
    return {}


def worst_closure(js: dict, unit: str, ins, outs, nu):
    """max_i |out_i - in_i - nu_i xi| / F_in over the column's own ports,
    recomputed from the result JSON; None when a port is not published."""
    st = js.get("streams", {})
    sin = [_stream(st, n) for n in ins]
    sout = [_stream(st, n) for n in outs]
    if not st or any(x is None for x in sin + sout):
        return None
    xi = _kpis(js, unit).get("reactionExtent", 0.0)
    f_in = sum(x["F"] for x in sin)
    comps = set()
    for x in sin + sout:
        comps |= set(x["composition"])
    worst, where = 0.0, ""
    for c in sorted(comps):
        gen = sum(flow(x, c) for x in sout) - sum(flow(x, c) for x in sin)
        e = abs(gen - nu.get(c, 0.0) * xi) / f_in
        if e > worst:
            worst, where = e, c
    return worst, where, f_in


def mesh_cases():
    out = []
    for fs in sorted(ROOT.glob("tutorials/**/system/flowsheetDict")):
        if "distillationColumn" not in fs.read_text():
            continue
        cols = [c for c in column_units(fs) if c[1] in MESH_MODELS]
        if cols:
            out.append((fs.parent.parent, cols))
    return out


def mesh_closure_arm():
    """A7: every MESH column the corpus ships closes every component balance
    to CLOSURE_TOL of its own feed, and announces its dimensionless rows."""
    runs, worst, n_cols = {}, (0.0, "", ""), 0
    cases = mesh_cases()
    if len(cases) < 10:
        failures.append(f"A7: only {len(cases)} MESH column case(s) found in"
                        " the corpus -- the scan has gone blind")
        return None
    def one(case):
        #  The full sweep already ran every one of these cases; under it the
        #  cached stdout IS this engine's run of the case as shipped
        #  (bin/curate/suite_cache.py), so it is read rather than repeated --
        #  acetonePlant alone is 40 s.  Standalone, or for a case the cache
        #  does not hold, the case is run live.
        cached = suite_cache.stdout_of(case)
        if cached is not None:
            return 0, cached
        with tempfile.TemporaryDirectory() as td:
            probe = Path(td) / case.name
            copy_case(case, probe)
            return run(probe)

    #  Independent runs, so they go side by side: the arm is ~15 cases and a
    #  gate's wall clock is paid on every full suite.
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(one, [c for c, _ in cases]))
    for (case, cols), (rc, out) in zip(cases, results):
        rel = str(case.relative_to(ROOT))
        runs[rel] = (rc, out)
        if rc != 0:
            failures.append(f"A7: {rel} did not run (exit {rc}) -- its MESH"
                            " column's closure cannot be read")
            continue
        if "each component balance is divided by the total feed" not in out:
            failures.append(f"A7: {rel} did not announce its dimensionless"
                            " balances -- a solver aid reports aloud")
        js = result_json(out)
        for (unit, model, ins, outs, nu) in cols:
            n_cols += 1
            got = worst_closure(js, unit, ins, outs, nu)
            if got is None:
                failures.append(f"A7: {rel} column '{unit}' publishes no"
                                " port streams -- nothing to close")
                continue
            w, comp, f_in = got
            if w > worst[0]:
                worst = (w, f"{case.name}/{unit}", comp)
            if w > CLOSURE_TOL:
                failures.append(
                    f"A7: {rel} column '{unit}' ({model}) publishes its"
                    f" {comp} balance open by {w:.3g} of its feed"
                    f" ({f_in:.4g} kmol/s), tolerance {CLOSURE_TOL:.0e}.  A"
                    f" MESH judged in kmol/s calls a small column converged"
                    f" with its balances open -- see DEV.md §5 A7")
    return runs, n_cols, len(cases), worst


def _scaled(src: Path, dst: Path, factor: float = None):
    """The same column with EVERY molar flow multiplied by `factor` (TINY by
    default): the feeds' component flows and the column's distillate and draw
    rates.  Nothing intensive changes, so the answer must not."""
    factor = TINY if factor is None else factor
    copy_case(src, dst)
    pat = re.compile(r"(?<![\w.])([-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)(\s+k?mol/h\s*;)")
    n = 0
    for f in list((dst / "0").iterdir()) + [dst / "system/flowsheetDict"]:
        if not f.is_file():
            continue
        txt, k = pat.subn(lambda m: f"{float(m.group(1)) * factor:.12g}"
                          + m.group(2), f.read_text())
        n += k
        f.write_text(txt)
    return n


def _compare_tiny(label, model, unit, ins, outs, nu, js_f, js_t,
                  factor=None):
    factor = TINY if factor is None else factor
    kt, kf = _kpis(js_t, unit), _kpis(js_f, unit)
    compared = 0
    for key in SCALE_KPIS:
        if key not in kf:
            continue
        compared += 1
        a, b = kt.get(key), kf[key]
        if a is None or abs(a - b) > SCALE_TOL * max(abs(b), 1e-30):
            failures.append(
                f"A8: {label} ({model}) x{factor:g}: {key} = {a!r} against the"
                f" full-size {b!r} -- the same column at a smaller feed gave"
                f" a different answer, which is what a Newton stopping on an"
                f" ABSOLUTE kmol/s tolerance does when its seed already meets"
                f" it")
    if compared < 4:
        failures.append(f"A8: {label}: only {compared} intensive KPI(s) to"
                        " compare -- the column stopped publishing them")
    got = worst_closure(js_t, unit, ins, outs, nu)
    if got is None or got[0] > CLOSURE_TOL:
        failures.append(f"A8: {label} x{factor:g}: the component balance is"
                        f" open by {got[0] if got else float('nan'):.3g} of"
                        f" the feed (tolerance {CLOSURE_TOL:.0e})")


def _mesh_column(src: Path, label: str):
    cols = [c for c in column_units(src / "system/flowsheetDict")
            if c[1] in MESH_MODELS]
    if len(cols) != 1:
        failures.append(f"A8: {label} no longer carries exactly one MESH"
                        " column -- the probe cannot pick its subject")
        return None
    return cols[0]


def scale_invariance_arm(runs):
    """A8: a column is scale-invariant -- multiply every flow by 1e-8 and the
    compositions, temperatures and conversion must not move.  An ABSOLUTE
    tolerance on kmol/s balances fails this wherever the seed already
    satisfies the scale-free rows: at 1e-8 the balances are under it from
    the start and the seed is returned as the answer."""
    seen = []
    for rel, factors in SCALE_PROBES:
        full = runs.get(rel)
        if not full or full[0] != 0:
            failures.append(f"A8: the full-size run of {rel} is missing (A7"
                            " did not run it) -- nothing to compare against")
            continue
        src = ROOT / rel
        col = _mesh_column(src, rel)
        if not col:
            continue
        unit, model, ins, outs, nu = col
        for factor in factors:
            with tempfile.TemporaryDirectory() as td:
                probe = Path(td) / "scaled"
                if _scaled(src, probe, factor) < 2:
                    failures.append(f"A8: {rel}: found no `<n> kmol/h;` flows"
                                    " to scale -- the probe is testing"
                                    " nothing")
                    break
                rc, out = run(probe)
            if rc != 0:
                failures.append(f"A8: {rel} with every flow x{factor:g} did"
                                f" not converge (exit {rc}) -- a column's"
                                " solvability must not depend on the size of"
                                " its feed")
                continue
            _compare_tiny(rel, model, unit, ins, outs, nu,
                          result_json(full[1]), result_json(out), factor)
        seen.append(f"{src.name} ({model})")

    # -- the declared-interior probe (the simultaneous MESH)
    src = ROOT / INTERIOR_PROBE
    col = _mesh_column(src, INTERIOR_PROBE)
    if not col:
        return seen
    unit, model, ins, outs, nu = col
    with tempfile.TemporaryDirectory() as tds:
        td = Path(tds)
        base = td / "base"
        copy_case(src, base)
        rc, out0 = run(base)
        interior = base / "converged/internalStates" / unit
        if rc != 0 or not interior.is_file():
            failures.append(f"A8: {INTERIOR_PROBE} wrote no converged"
                            f" interior for '{unit}' -- the seed the probe"
                            " declares does not exist")
            return seen
        outs_js = {}
        for tag in ("full", "tiny"):
            probe = td / tag
            if tag == "tiny":
                _scaled(src, probe)
            else:
                copy_case(src, probe)
            (probe / "0/internalStates").mkdir(parents=True, exist_ok=True)
            shutil.copy(interior, probe / "0/internalStates" / unit)
            fs = probe / "system/flowsheetDict"
            txt, k = re.subn(r"refluxRatio(\s+)([\d.eE+-]+)\s*;",
                             lambda m: f"refluxRatio{m.group(1)}"
                             f"{float(m.group(2)) * INTERIOR_REFLUX:.12g};",
                             fs.read_text())
            if k != 1:
                failures.append(f"A8: {INTERIOR_PROBE} carries no single"
                                " `refluxRatio` to move -- the probe cannot"
                                " open its balances")
                return seen
            fs.write_text(txt)
            rc, out = run(probe)
            if rc != 0:
                failures.append(f"A8: the declared-interior probe ({tag}) did"
                                f" not converge (exit {rc})")
                return seen
            outs_js[tag] = result_json(out)
    #  The probe must MOVE the answer, or a returned seed is invisible to it.
    a = _kpis(result_json(out0), unit).get("x_D_LK")
    b = _kpis(outs_js["full"], unit).get("x_D_LK")
    if a is None or b is None or abs(a - b) < 1.0e-4:
        failures.append(f"A8: the declared-interior probe does not move the"
                        f" distillate (x_D_LK {a!r} seed vs {b!r}) -- a"
                        f" returned seed would pass it")
        return seen
    _compare_tiny(f"{INTERIOR_PROBE} seeded with its own converged interior"
                  f" at reflux x{INTERIOR_REFLUX:g}", model, unit, ins, outs,
                  nu, outs_js["full"], outs_js["tiny"])
    seen.append(f"{src.name} ({model}, seeded with a converged interior at"
                f" reflux x{INTERIOR_REFLUX:g})")
    return seen


def main() -> int:
    if not SOLVE.exists():
        print("check_degenerate_limits: choupoSolve missing -- build first")
        return 1

    a1 = one_stage("A1", ABSORBER, "scrubber", "solvent", "gasFeed",
                   "richLiquid", "cleanGas", semi_lean_solvent)
    a2 = one_stage("A2", STRIPPER, "stripper", "liquidFeed", "strippingGas",
                   "strippedLiquid", "richGas", None)
    rx = reactive_arms()
    conv = kinetic_closure_arm(rx[1]) if rx else None
    a7 = mesh_closure_arm()
    a8 = scale_invariance_arm(a7[0]) if a7 else []

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
          " reverse rate EXACTLY at %s, every KPI and stream (%s); a kinetic"
          " reactant with no `order` and an adsorbing product with no K both"
          " refuse by name; the kinetic column converges at %s and %s"
          " (conversion %.4g -> %.4g), announces its balance scaling and"
          " closes every component balance to %.0e of the feed; all %d MESH"
          " columns in %d corpus cases (simultaneous and full-MESH, derived"
          " from the flowsheets) close every component balance to %.0e of"
          " their own feed, worst %.3g (%s, %s); and %s, re-run with every"
          " flow x%g (and the full-MESH x%g), reproduce their full-size"
          " compositions, temperatures and conversion to %.0e.  NOT checked: N >= 2 (the goldens pin those),"
          " that a kinetic profile is RIGHT (nothing measured is reproduced),"
          " the WANG-HENKE columns' closure (a successive-substitution"
          " tolerance on the composition step, not a residual -- DEV.md §5"
          " A7 records their measured closures), or a Newton trial crossing"
          " a zero activity."
          % (a1[0] * 3600, a1[1], a2[0] * 3600, a2[1], REL_TOL, CAT_MASS,
             rx[0], CAT_MASS, CAT_MASS_HIGH, conv[CAT_MASS],
             conv[CAT_MASS_HIGH], CLOSURE_TOL, a7[1], a7[2], CLOSURE_TOL,
             a7[3][0], a7[3][1], a7[3][2], ", ".join(a8), TINY, HUGE,
             SCALE_TOL))
    return 0


if __name__ == "__main__":
    sys.exit(main())
