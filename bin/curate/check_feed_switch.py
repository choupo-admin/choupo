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

Exit 1 listing failures."""
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

    if failures:
        print("check_feed_switch: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_feed_switch: OK -- A5 isothermal feed switch: positive"
          " witness runs + amendments ledgered (equal kmol both ways);"
          " 6 refusals fired and named (T/u/P swing, carrier, y-range,"
          " unknown component)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
