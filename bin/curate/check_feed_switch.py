#!/usr/bin/env python3
"""A5 feed-switch gate: the fixed bed's ONE existing cycle step is the
isothermal feed switch, its refusals are real, and its datum amendments
are ledgered.

All probes are temp variants of batch19_feed_switch_purge shortened to a
60 s window (switch at 10 s) so the gate runs in seconds; the full-length
physics witness stays batch19's golden in the main suite.

  POSITIVE  feed.CO2 = 0 at t = 10 s must run to completion, ANNOUNCE the
            switch, ledger BOTH feedAmendment records (the switched species
            out, the by-difference carrier in) with EQUAL kmol (c_tot is
            pinned), and expose the campaign amend KPIs.  This is also the
            sabotage witness for the refusal probes below: a unit that
            refused every key would fail HERE.

  REFUSALS  each fired through the real recipe path (setParameter inside a
            running campaign), each asserted on exit != 0 AND the message
            naming the reason -- a gutted throw fails the gate:
              feed.T      thermal swing        -> non-isothermal balance
              u           (constantVelocity)   -> points at the ergun valve control
              P           feed pressure        -> points at setParameter P_out
              feed.He     the by-difference carrier cannot be set
              feed.CO2=1.2  a feed MOLE FRACTION out of [0,1]
              feed.N2     a name that is not a component of the case

  CI-00 (2026-11-13) -- a species nothing feeds or holds, on any math
  library.  The bed's linear solve pivots by magnitude, so on another libm a
  last-bit change in one pow() left 1e-25 mol of an ABSENT species in a pure
  helium bed, its closure divided that by a floor of 1e-30 (41 246 936 on a
  hosted runner), and the campaign's element closure divided by a floor of
  1e-15 kmol and called a correct run NON-CONVERGED.  This machine imitates
  another libm with ulp_shim.c (this gate's own tool, built here; a gate
  that cannot build or preload it REFUSES, it does not pass):

  HELD      batch25_blowdown_thermal under nine patterns of moved pow()
            results: every run exits 0, announces the hold, publishes no
            mass_closure_CO2 and mass_residual_CO2_mol = 0 exactly,
            n_CO2_final = 0, no CO2 in any transfer, and only He in the
            element closure (the verdict line says "(closed)").
  RELEASED  batch19 variant whose CO2 starts ABSENT (pure He feed and bed)
            and is fed by a recipe at t = 20 s: the hold is announced, the
            release is announced, the closure is published and small, the
            trajectory's model_closure_CO2 cell is EMPTY before 20 s and a
            number after, and CO2 is in the bed at the end.
  RESOLUTION batch25 variant that DECLARES 1e-30 CO2 in the initial gas (so
            nothing holds it: it is in play and carries round-off) under
            five pow patterns: exit 0, C and O publish element_*_residual_
            kmolatom and no element_*_closure_rel, the campaign says they
            are below its resolution -- (b) proven alone, without (c).

  Sabotages, each by hand, rebuilt, the arm failed, restored + make all:
    S1 holdAbsentAtZero_ returns at once      -> HELD fails (pow 3, 7, ...:
                                                  residual, n_CO2_final and a
                                                  transfer carry CO2; C and O
                                                  enter the element closure)
    S2 the KPI publishes the ratio for every  -> HELD fails (mass_closure_CO2
       species                                    published, no residual)
    S3 releaseIfFed_ returns at once          -> RELEASED fails (exit 1: the
                                                  fed CO2 is held at zero and
                                                  the campaign leaks it)
    S4 main's resolution test made false      -> RESOLUTION fails (C and O
                                                  ratios at every pattern;
                                                  exit 1 at pow 7)
    S5 the CSV writes a NaN as it is          -> RELEASED fails (cells 'nan'
                                                  before the feed)

Exit 1 listing failures."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
BASE = ROOT / "tutorials" / "batch" / "adsorber" / "batch19_feed_switch_purge"

failures = []


def make_variant(tmp: Path, key: str, value: str) -> Path:
    case = tmp / f"probe_{re.sub(r'[^A-Za-z0-9]', '_', key + value)}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "[0-9]*", "resultJson*"))
    ctrl = case / "system" / "controlDict"
    txt = ctrl.read_text()
    txt = txt.replace("endTime         9000;", "endTime         60;")
    txt = txt.replace("writeInterval   300;", "writeInterval   30;")
    assert "endTime         60;" in txt, "controlDict shortening failed"
    ctrl.write_text(txt)
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    txt = txt.replace("time     3600;", "time     10;")
    txt = txt.replace("key      feed.CO2;", f"key      {key};")
    txt = txt.replace("value    0.0;", f"value    {value};")
    assert f"key      {key};" in txt and f"value    {value};" in txt, \
        "flowsheetDict probe rewrite failed"
    fs.write_text(txt)
    return case


def run(case: Path):
    p = subprocess.run([str(BATCH), "."], cwd=case,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def expect_refusal(tmp: Path, key: str, value: str, *needles: str):
    rc, out = run(make_variant(tmp, key, value))
    if rc == 0:
        failures.append(f"REFUSAL {key}={value}: expected nonzero exit,"
                        " got 0 (the refusal is gone)")
        return
    for n in needles:
        if n not in out:
            failures.append(f"REFUSAL {key}={value}: message lacks"
                            f" '{n}'\n--- got:\n"
                            + out[-800:])


SHIM_SRC = ROOT / "bin" / "curate" / "ulp_shim.c"
POW_PATTERNS = (1, 2, 3, 7, 101, 1009, 10007, 99991, 500009)
B25 = ROOT / "tutorials" / "batch" / "adsorber" / "batch25_blowdown_thermal"


def result_json(out: str):
    """The engine's result block, parsed from the run's stdout."""
    i = out.find('{ "version"')
    if i < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(out[i:])[0]
    except ValueError:
        return None


def build_shim(tmp: Path):
    """The shim built and PROVEN preloaded (it counts pow calls), or None
    with the reason recorded as a failure: a check that cannot run must not
    pass."""
    gcc = shutil.which("gcc")
    if gcc is None:
        failures.append("SHIM: gcc not found -- the CI-00 arms cannot run"
                        " (refused, not passed)")
        return None
    so = tmp / "ulp.so"
    p = subprocess.run([gcc, "-O1", "-fPIC", "-shared", "-fno-builtin",
                        "-o", str(so), str(SHIM_SRC), "-ldl", "-lm"],
                       capture_output=True, text=True)
    if p.returncode != 0 or not so.exists():
        failures.append("SHIM: ulp_shim.c did not build -- the CI-00 arms"
                        " cannot run (refused)\n" + p.stderr[-600:])
        return None
    case = copy_case(tmp, B25, "shimcheck")
    rep = tmp / "ulp_report.txt"
    run_shim(case, so, "pow", 0, {"ULP_REPORT": str(rep)})
    counts = dict(l.split() for l in rep.read_text().splitlines()) \
        if rep.exists() else {}
    if int(counts.get("pow", "0")) == 0:
        failures.append("SHIM: preloaded, but counted no pow() call -- the"
                        " preload does not reach the engine (refused)")
        return None
    return so


def copy_case(tmp: Path, base: Path, tag: str) -> Path:
    case = tmp / f"ci00_{tag}"
    if case.exists():
        shutil.rmtree(case)
    shutil.copytree(base, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "[1-9]*", "resultJson*", "log.*"))
    return case


def run_shim(case: Path, so, fn: str, every: int, extra=None):
    import os
    env = dict(os.environ)
    if so is not None and every > 0:
        env.update({"LD_PRELOAD": str(so), "ULP_FN": fn,
                    "ULP_EVERY": str(every)})
    elif so is not None:
        env.update({"LD_PRELOAD": str(so)})       # counts, moves nothing
    env.update(extra or {})
    p = subprocess.run([str(BATCH), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def arm_held(tmp: Path, so):
    case = copy_case(tmp, B25, "held")
    for ev in POW_PATTERNS:
        tag = f"HELD pow/{ev}"
        rc, out = run_shim(case, so, "pow", ev)
        if rc != 0:
            failures.append(f"{tag}: exit {rc}, expected 0\n" + out[-600:])
            continue
        if "neither fed nor held" not in out:
            failures.append(f"{tag}: the zero hold of CO2 is not announced")
        r = result_json(out)
        if r is None:
            failures.append(f"{tag}: no result block")
            continue
        bed = r.get("kpis", {}).get("bed", {})
        camp = r.get("kpis", {}).get("campaign", {})
        if "mass_closure_CO2" in bed:
            failures.append(f"{tag}: mass_closure_CO2 published"
                            f" ({bed['mass_closure_CO2']}) for a species"
                            " with no material in play")
        if bed.get("mass_residual_CO2_mol") != 0:
            failures.append(f"{tag}: mass_residual_CO2_mol ="
                            f" {bed.get('mass_residual_CO2_mol')}, not 0")
        if bed.get("n_CO2_final") != 0:
            failures.append(f"{tag}: n_CO2_final = {bed.get('n_CO2_final')}")
        for tr in r.get("transfers", []):
            if tr.get("dn", {}).get("CO2", 0) != 0:
                failures.append(f"{tag}: a transfer carries CO2"
                                f" ({tr['dn']['CO2']})")
        elems = sorted(k for k in camp if k.startswith("element_")
                       and k != "element_worst_closure_rel")
        if elems != ["element_He_closure_rel"]:
            failures.append(f"{tag}: element keys {elems}, expected He only")
        if "(closed)" not in out or "LEAK" in out:
            failures.append(f"{tag}: the campaign verdict is not '(closed)'")


def arm_released(tmp: Path):
    case = copy_case(tmp, BASE, "released")
    ctrl = case / "system" / "controlDict"
    txt = ctrl.read_text()
    txt = txt.replace("endTime         9000;", "endTime         60;")
    txt = txt.replace("writeInterval   300;", "writeInterval   10;")
    ctrl.write_text(txt)
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    txt = txt.replace("feed    { molarComposition { CO2 0.15; He 0.85; } }",
                      "feed    { molarComposition { He 1.0; } }")
    txt = txt.replace("time     3600;", "time     20;")
    txt = txt.replace("value    0.0;", "value    0.15;")
    if "{ He 1.0; } }" not in txt or "value    0.15;" not in txt \
            or "endTime         60;" not in ctrl.read_text():
        failures.append("RELEASED: the batch19 rewrite did not apply")
        return
    fs.write_text(txt)
    rc, out = run(case)
    tag = "RELEASED"
    if rc != 0:
        failures.append(f"{tag}: exit {rc}\n" + out[-800:])
        return
    for n in ("component 'CO2' is neither fed nor held",
              "component 'CO2' is fed from t = 20"):
        if n not in out:
            failures.append(f"{tag}: output lacks '{n}'")
    r = result_json(out) or {}
    bed = r.get("kpis", {}).get("bed", {})
    mc = bed.get("mass_closure_CO2")
    if mc is None or not mc <= 1e-10:
        failures.append(f"{tag}: mass_closure_CO2 = {mc} (expected"
                        " published and <= 1e-10 once fed)")
    if "mass_residual_CO2_mol" in bed:
        failures.append(f"{tag}: mass_residual_CO2_mol published for a"
                        " species in play")
    if not bed.get("n_CO2_final", 0) > 0:
        failures.append(f"{tag}: no CO2 in the bed after the feed"
                        f" (n_CO2_final = {bed.get('n_CO2_final')})")
    rows = [l.split(",") for l in
            (case / "trajectory.csv").read_text().splitlines()]
    col = rows[0].index("bed.model_closure_CO2") \
        if "bed.model_closure_CO2" in rows[0] else None
    if col is None:
        failures.append(f"{tag}: trajectory has no model_closure_CO2 column")
        return
    if any(len(r_) != len(rows[0]) for r_ in rows):
        failures.append(f"{tag}: trajectory.csv is not rectangular")
    before = [r_[col] for r_ in rows[1:] if float(r_[0]) < 20.0]
    after = [r_[col] for r_ in rows[1:] if float(r_[0]) > 20.0]
    if not before or any(c != "" for c in before):
        failures.append(f"{tag}: model_closure_CO2 cells before the feed"
                        f" are {before}, expected empty")
    if not after or any(c == "" for c in after):
        failures.append(f"{tag}: model_closure_CO2 cells after the feed"
                        f" are {after}, expected numbers")


def arm_resolution(tmp: Path, so):
    case = copy_case(tmp, B25, "resolution")
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    new = txt.replace("initial { molarComposition { He 1.0; } }",
                      "initial { molarComposition { He 1.0; CO2 1e-30; } }")
    if new == txt:
        failures.append("RESOLUTION: the batch25 rewrite did not apply")
        return
    fs.write_text(new)
    for ev in (0, 3, 7, 101, 10007):
        tag = f"RESOLUTION pow/{ev}"
        rc, out = run_shim(case, so if ev else None, "pow", ev)
        if rc != 0:
            failures.append(f"{tag}: exit {rc} -- a floor decided the"
                            " verdict\n" + out[-600:])
            continue
        camp = (result_json(out) or {}).get("kpis", {}).get("campaign", {})
        for sym in ("C", "O"):
            if f"element_{sym}_closure_rel" in camp:
                failures.append(f"{tag}: element_{sym}_closure_rel published"
                                " for an element below resolution")
            if f"element_{sym}_residual_kmolatom" not in camp:
                failures.append(f"{tag}: element_{sym}_residual_kmolatom"
                                " not published")
        if "below the campaign's resolution" not in out:
            failures.append(f"{tag}: the campaign does not say C and O are"
                            " below its resolution")


def main() -> int:
    if not BATCH.exists():
        print(f"check_feed_switch: {BATCH} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- POSITIVE: the switch itself works and is ledgered ----------
        rc, out = run(make_variant(tmp, "feed.CO2", "0.0"))
        if rc != 0:
            failures.append("POSITIVE feed.CO2=0: expected exit 0, got "
                            f"{rc}\n--- tail:\n" + out[-1200:])
        else:
            for n in ("A5 feed switch: CO2 y_feed -> 0",
                      "follows by difference",
                      "FROZEN at their pre-switch values",
                      "datum amendments (A5 feed switching)",
                      "mass_kg_amend_in",
                      "mass_kg_amend_out"):
                if n not in out:
                    failures.append(f"POSITIVE: output lacks '{n}'")
            # both amendment records, opposite directions
            outbound = re.findall(
                r"FEED AMENDMENT ([0-9.eE+-]+) kmol bed -> \(external"
                r" boundary\)", out)
            inbound = re.findall(
                r"FEED AMENDMENT ([0-9.eE+-]+) kmol \(external boundary\)"
                r" -> bed", out)
            if len(outbound) != 1 or len(inbound) != 1:
                failures.append("POSITIVE: expected exactly one outbound"
                                " (CO2) and one inbound (He) feedAmendment"
                                f" record, got {len(outbound)}/{len(inbound)}")
            else:
                a, b = float(outbound[0]), float(inbound[0])
                if abs(a - b) > 1e-9 * max(a, b, 1e-30):
                    failures.append("POSITIVE: pinned c_tot demands equal"
                                    f" amendment moles, got {a} vs {b}")

        # ---- REFUSALS, each named ---------------------------------------
        expect_refusal(tmp, "feed.T", "310",
                       "DECLARED CONSTANT", "thermal-swing",
                       "non-isothermal bed energy balance")
        #  P-swing contract (2026-08-03): in constantVelocity mode u is
        #  still a declared constant, and the refusal now POINTS AT the
        #  ergun-mode valve control instead of a blanket "transient Ergun";
        #  P (the FEED pressure) refuses pointing at the downstream P_out.
        expect_refusal(tmp, "u", "0.1",
                       "DECLARED CONSTANT of the constant-velocity closure",
                       "ergun-mode control")
        expect_refusal(tmp, "P", "200000",
                       "FEED pressure", "DECLARED CONSTANT",
                       "setParameter P_out")
        expect_refusal(tmp, "feed.He", "1.0",
                       "by-difference CARRIER",
                       "the carrier follows")
        expect_refusal(tmp, "feed.CO2", "1.2",
                       "feed MOLE FRACTION", "need 0 <= y <= 1")
        expect_refusal(tmp, "feed.N2", "0.1",
                       "not a component of this case")

        # ---- CI-00: the absent species, on any math library ------------
        arm_released(tmp)
        so = build_shim(tmp)
        if so is not None:
            arm_held(tmp, so)
            arm_resolution(tmp, so)

    if failures:
        print("check_feed_switch: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_feed_switch: OK -- A5 isothermal feed switch: positive"
          " witness runs + amendments ledgered (equal kmol both ways);"
          " 6 refusals fired and named (T/u/P swing, carrier, y-range,"
          " unknown component); CI-00: an absent species held at exactly"
          " zero under 9 moved-pow patterns with no ratio published, released"
          " by a recipe feed, and an element below resolution kept out of"
          " the verdict under 5")
    return 0


if __name__ == "__main__":
    sys.exit(main())
