#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_unit_acceptance -- what a unit accepts is a DECLARATION, checked by
ONE function, before the solve on every authored inlet and at the solve on
the stream a unit is handed (DEV.md 4c C188 item 5, slice A; the contract is
docs/design/what-a-unit-accepts.md).

THE CONTRACT.  `UnitOperation::acceptance()` returns a `UnitAcceptance`
(src/unitOperations/UnitAcceptance.H): accepted inlet phases, the aqueous
solvent requirement, the components the equations carry (a rule word, a
sentence, a test), the pass-through fates offered (none yet) and any further
condition.  `acceptanceFindings` (UnitAcceptance.cpp) is the ONLY place an
acceptance refusal is written; `checkAcceptance` throws its findings at a
unit's solve and `Flowsheet::checkAuthoredInletAcceptance`
(FlowsheetAcceptance.cpp) collects them for every AUTHORED inlet before the
first unit runs (and so `choupo-lint` reports them).  Slice A migrates the two
units that already refused: `spiralWoundModule` and `pump`.

  (a) THE REFUSALS LIVE IN THE CONTRACT, NOT IN THE UNITS (source arm).
      Pump.cpp and SpiralWoundModule.cpp carry none of the refusal heads
      ("not a liquid", "carries no ", "does not model", "carries
      component(s)"); each calls `checkAcceptance(` and defines its
      `::acceptance()` with `declared = true`; UnitAcceptance.cpp writes the
      heads.
  (b) AN AUTHORED INLET IS REFUSED BEFORE ANY UNIT RUNS.  Two witnesses built
      from membrane01 (ethanol added to the feed) and pump01 (feed at 400 K,
      1 bar): each run exits non-zero with the pre-solve header ("checked
      before any unit runs"), the clause's words, and WITHOUT the
      "Flowsheet topology" banner that prints after the lint seam -- so no
      unit ran.  `choupoSolve --lint` on each exits 1 and reports "authored
      inlet not accepted".
  (c) A PRODUCED VAPOUR IS STILL REFUSED, AT THE SOLVE.  pump01 with an
      isothermal flash before the pump (400 K, 1 bar: the 36 kmol/h of water
      leave as vapour) feeding its vapour outlet to the pump: the pre-solve
      pass passes it (the pump's inlet is produced), the
      flowsheet starts, and the pump refuses "is not a liquid" naming the
      compressor.
  (d) `choupoSolve --describe-units` LISTS THE CONTRACTS.  pump: declared,
      phases [liquid]; spiralWoundModule: declared, aqueous solvent required,
      rule aqueousSolventAndNonvolatileSolutes; mixer (unmigrated): not
      declared, both phases, rule everyComponent.
  (e) THE TWO DEFECT GATES STILL PASS: check_membrane_feed_scope and
      check_pump_liquid_inlet.

SABOTAGES (by hand, 2026-10-31, each restored and rebuilt; outputs verbatim,
long tails elided):
  S1  the call line in Flowsheet::solve replaced by a comment (the pre-solve
      pass never runs).  FAILED, four lines, all arm (b):
        (b) ethanol-in-RO: the refusal came from the unit's solve, not the
            pre-solve pass: ...
        (b) ethanol-in-RO: --lint exited 0
        (b) vapour-into-pump: the refusal came from the unit's solve, ...
        (b) vapour-into-pump: --lint exited 0
      Arms (a), (c), (d), (e) stayed green: only (b) can see the pass.
  S2  `a.phases.vapour = true;` in Pump::acceptance (the pump's rule gone).
      FAILED:
        (b) vapour-into-pump: ran to exit 0
        (b) vapour-into-pump: --lint exited 0
        (c) a flash's vapour was pumped to exit 0
        (d) pump's contract is not declared liquid-only: {... 'accepted':
            ['liquid', 'vapour'] ...}
        (e) check_pump_liquid_inlet.py FAILED: ... (a) water fed at 400 K
            and 1 bar was pumped to exit 0
  S3  a string literal "fed a stream that is not a liquid" added to Pump.cpp
      (no rebuild: a source-arm probe).  FAILED, first line:
        (a) rotating/Pump.cpp still writes acceptance refusal text
            ['not a liquid'] -- it belongs in UnitAcceptance.cpp

WHAT IS NOT CHECKED.  Any unit beyond the two migrated ones (the default
contract is asserted on one, mixer); the pass-through declaration (not built);
a recycle that brings a new component into a migrated unit after the first
pass (no witness).

Exit 1 naming the arm that failed.
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
RO = ROOT / "tutorials" / "steady" / "membranes" / "membrane01_RO_NaCl_seawater"
PUMP = ROOT / "tutorials" / "steady" / "rotating" / "pump01_water"
SRC = ROOT / "src" / "unitOperations"
PRESOLVE = "checked before any unit runs"
BANNER = "Flowsheet topology"


def run(args, case=None):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    cmd = [str(BIN)] + args + ([str(case)] if case else [])
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
    return r.returncode, r.stdout + r.stderr


def copy_case(base, dest):
    shutil.copytree(base, dest)
    for sub in ("constant/propertyManifest", "expected"):
        p = dest / sub
        if p.exists():
            p.unlink()
    return dest


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def arm_a(fail, ok):
    heads = ["not a liquid", "carries no ", "does not model", "carries component(s)"]
    for rel, cls in (("rotating/Pump.cpp", "Pump"),
                     ("membrane/SpiralWoundModule.cpp", "SpiralWoundModule")):
        code = strip_comments((SRC / rel).read_text())
        left = [h for h in heads if h in code]
        if left:
            fail.append(f"(a) {rel} still writes acceptance refusal text {left} "
                        "-- it belongs in UnitAcceptance.cpp")
        if "checkAcceptance(" not in code:
            fail.append(f"(a) {rel} does not call checkAcceptance(")
        m = re.search(cls + r"::acceptance\(\)\s*const\s*\{(.*?)\n\}", code, re.S)
        if not m or "declared = true" not in m.group(1):
            fail.append(f"(a) {rel} defines no {cls}::acceptance() declaring itself")
    core = strip_comments((SRC / "UnitAcceptance.cpp").read_text())
    for h in ("carries no ", "this unit does not", '" is not " + notWhat'):
        if h not in core:
            fail.append(f"(a) UnitAcceptance.cpp does not write the head {h!r}")
    if not any(f.startswith("(a)") for f in fail):
        ok.append("the two units' refusals live in the contract (source)")


def ethanol_ro(tmp):
    w = copy_case(RO, Path(tmp) / "accRO_ethanol")
    tp = w / "constant" / "thermoPhysPropDict"
    tp.write_text(tp.read_text().replace("( water  NaCl )", "( water  NaCl  ethanol )"))
    feed = w / "0" / "feed"
    t = feed.read_text()
    t2 = t.replace("NaCl    5.98 kmol/h;", "NaCl    5.98 kmol/h;\n    ethanol  5.0 kmol/h;")
    feed.write_text(t2)
    return w if t2 != t else None


def vapour_pump(tmp):
    w = copy_case(PUMP, Path(tmp) / "accPump_vapour")
    feed = w / "0" / "feed"
    t = feed.read_text()
    t2 = re.sub(r"^T\s+298\.15 K;", "T               400 K;", t, flags=re.M)
    feed.write_text(t2)
    return w if t2 != t else None


def produced_vapour_pump(tmp):
    w = copy_case(PUMP, Path(tmp) / "accPump_produced")
    fd = w / "system" / "flowsheetDict"
    t = fd.read_text()
    t2 = t.replace("""units
(
    {""", """units
(
    {
        name        boil;
        type        isothermalFlash;
        in          feed;
        outputs     ( wet  hot );
        operation   { T 400 K;  P 1.0 bar; }
    }
    {""", 1).replace("in          feed;\n        outputs     ( out );",
                     "in          hot;\n        outputs     ( out );")
    fd.write_text(t2)
    shutil.copy(w / "0" / "feed", w / "0" / "hot")
    shutil.copy(w / "0" / "feed", w / "0" / "wet")
    return w if ("name        boil;" in t2 and "in          hot;" in t2) else None


def arm_b(tmp, fail, ok):
    w = ethanol_ro(tmp)
    pw = vapour_pump(tmp)
    for tag, case, words in (("ethanol-in-RO", w, ["'ethanol'", "does not model", "B_s"]),
                             ("vapour-into-pump", pw, ["is not a liquid", "compressor"])):
        if case is None:
            fail.append(f"(b) {tag}: could not build the witness (the base case moved)")
            continue
        rc, out = run([], case)
        missing = [x for x in [PRESOLVE] + words if x not in out]
        if rc == 0:
            fail.append(f"(b) {tag}: ran to exit 0")
        elif PRESOLVE not in out:
            fail.append(f"(b) {tag}: the refusal came from the unit's solve, not "
                        "the pre-solve pass:\n      " + out[-400:])
        elif missing:
            fail.append(f"(b) {tag}: refused before the solve but without {missing}")
        elif BANNER in out:
            fail.append(f"(b) {tag}: the '{BANNER}' banner printed -- the "
                        "flowsheet started before the refusal")
        else:
            ok.append(f"{tag} refused before any unit ran")
        rc, out = run(["--lint"], case)
        if rc == 0:
            fail.append(f"(b) {tag}: --lint exited 0")
        elif "authored inlet not accepted" not in out:
            fail.append(f"(b) {tag}: --lint failed (exit {rc}) but not with the "
                        "acceptance finding:\n      " + out[-400:])
        else:
            ok.append(f"choupo-lint reports {tag}")


def arm_c(tmp, fail, ok):
    w = produced_vapour_pump(tmp)
    if w is None:
        fail.append("(c) could not build the produced-vapour witness (pump01 moved)")
        return
    rc, out = run([], w)
    if rc == 0:
        fail.append("(c) a flash's vapour was pumped to exit 0")
    elif PRESOLVE in out:
        fail.append("(c) the pre-solve pass refused a PRODUCED stream")
    elif BANNER not in out:
        fail.append(f"(c) the run stopped before the flowsheet started (exit {rc}):"
                    "\n      " + out[-400:])
    elif "is not a liquid" not in out or "compressor" not in out:
        fail.append(f"(c) refused (exit {rc}) but not by the pump's acceptance:"
                    "\n      " + out[-400:])
    else:
        ok.append("a produced vapour is refused by the pump at its solve")


def arm_d(fail, ok):
    rc, out = run(["--describe-units"])
    if rc != 0:
        fail.append(f"(d) --describe-units exited {rc}: " + out[-300:])
        return
    #  The run banner precedes the document (every choupoSolve prints it);
    #  the JSON starts at the first line that is exactly "{".
    lines = out.splitlines()
    start = next((i for i, l in enumerate(lines) if l == "{"), None)
    try:
        if start is None:
            raise ValueError("no JSON document in the output")
        units = {u["type"]: u for u in json.loads("\n".join(lines[start:]))["units"]}
    except (ValueError, KeyError) as e:
        fail.append(f"(d) --describe-units is not the expected JSON ({e})")
        return
    p, r, m = units.get("pump"), units.get("spiralWoundModule"), units.get("mixer")
    if not p or not p["declared"] or p["phases"]["accepted"] != ["liquid"]:
        fail.append(f"(d) pump's contract is not declared liquid-only: {p}")
    if (not r or not r["declared"] or not r["solvent"]["aqueousRequired"]
            or r["models"]["rule"] != "aqueousSolventAndNonvolatileSolutes"):
        fail.append(f"(d) spiralWoundModule's contract is wrong: {r}")
    if (not m or m["declared"] or m["phases"]["accepted"] != ["liquid", "vapour"]
            or m["models"]["rule"] != "everyComponent"):
        fail.append(f"(d) mixer does not carry the default contract: {m}")
    if not any(f.startswith("(d)") for f in fail):
        nd = sum(1 for u in units.values() if u["declared"])
        ok.append(f"--describe-units lists {len(units)} types, {nd} declared")


def arm_e(fail, ok):
    for g in ("check_membrane_feed_scope.py", "check_pump_liquid_inlet.py"):
        r = subprocess.run([sys.executable, str(ROOT / "bin" / "curate" / g)],
                           capture_output=True, text=True, timeout=1800)
        if r.returncode != 0:
            fail.append(f"(e) {g} FAILED:\n      " + (r.stdout + r.stderr)[-500:])
    if not any(f.startswith("(e)") for f in fail):
        ok.append("check_membrane_feed_scope and check_pump_liquid_inlet pass")


def main() -> int:
    if not BIN.exists():
        print(f"check_unit_acceptance: FAILED\n  no {BIN} -- build the tree "
              "first.  A check that cannot run must not pass.")
        return 1
    fail, ok = [], []
    arm_a(fail, ok)
    with tempfile.TemporaryDirectory(prefix="unitAcceptance_") as tmp:
        arm_b(tmp, fail, ok)
        arm_c(tmp, fail, ok)
    arm_d(fail, ok)
    arm_e(fail, ok)
    if fail:
        print("check_unit_acceptance: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_unit_acceptance: OK -- " + "; ".join(ok) + ".  Scope: the two "
          "migrated units (spiralWoundModule, pump) and the default on mixer; "
          "NOT checked: any other unit's contract, pass-through (not built), a "
          "recycle bringing a new component into a migrated unit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
