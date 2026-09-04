#!/usr/bin/env python3
"""Gate: the WASM crossing carries every field an OperationResult declares.

    bin/curate/check_operation_result_crossing.py

WHY THIS EXISTS.  `WasmAdapter.parseResult` does not hand the engine's
`operationResults` through -- it REBUILDS each row field by field, filtering
types as it goes.  That is the right shape for a trust boundary (the browser is
parsing text a worker produced), and it has one failure mode that nothing else
in this project can see:

    A CROSSING DROPS WHAT IT WAS NOT TAUGHT, and it drops it in SILENCE,
    because an absent optional field is indistinguishable from one the engine
    never sent.

Measured on 2026-09-04, when the fit's curation verdict was published into the
result JSON so a program could read it: the engine emitted it, the TypeScript
type declared it, `FitStatsPanel` drew it -- and this loop threw it away, so in
a real browser the badge could never appear.  The gate that shipped with that
slice said, honestly, that it did not check rendering; this is the hole that
disclaimer was covering.

The same read found an OLDER one: `headline` -- the op's own ranking of which
diagnostics ARE its answer, which `PropsView` reads and which `choupoProps`
REFUSES over when an op names a headline it did not publish -- had never
crossed either.  Two fields, one added that day and one long-standing, lost the
same way.

WHAT THIS GATE CHECKS.

  (a) EVERY FIELD THE TYPE DECLARES IS CARRIED.  The fields of
      `export interface OperationResult` in SolverAdapter.ts are harvested, and
      each must appear as a key the rebuild in WasmAdapter.ts actually writes.
      The TYPE is the contract; the crossing must satisfy it.

  (b) A DELIBERATE DROP MUST BE DECLARED, not merely absent.  A field the
      crossing intentionally does not carry belongs in the `CROSSING_DROPS`
      block below WITH ITS REASON -- so that "not carried" is a decision a
      reader can see, never an omission nobody noticed.  The list is empty
      today, and that is the honest state: nothing here is deliberately
      dropped.

  (c) IT CANNOT PASS BY HARVESTING NOTHING.  If either parse yields an empty
      set the gate FAILS rather than reporting agreement -- the shape it reads
      has changed and it is blind, not satisfied (the `check_true_ions` lesson).

SABOTAGE NOTE, worth more than the gate.  Verifying arm (c) took two attempts:
the first "sabotage" renamed the interface in THIS FILE's own docstring -- which
quotes the phrase the regex looks for -- so nothing about the TypeScript
changed and the gate went on passing.  A green run after a sabotage that did
not APPLY is evidence of nothing, and it reads exactly like a gate that cannot
fail.  That was the third time in one day a sabotage here edited the wrong
copy of a string.  Check that the sabotage changed what you meant before you
read its result: grep the file you targeted.

WHAT IT DOES NOT DO.  It does not check that a carried field is USED, that the
browser renders it, or that any other adapter agrees -- `MockAdapter` builds
fixtures, not engine output.  It reads the ONE crossing that parses a real run.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TYPE_FILE = ROOT / "gui" / "src" / "adapters" / "SolverAdapter.ts"
CROSS_FILE = ROOT / "gui" / "src" / "adapters" / "WasmAdapter.ts"

#  Fields the crossing deliberately does NOT carry, each with the reason a
#  reader needs.  EMPTY today, deliberately: nothing is dropped on purpose.
CROSSING_DROPS: dict = {}


def fail(msg):
    print("check_operation_result_crossing: FAIL -- " + msg)
    sys.exit(1)


def declared_fields(text):
    m = re.search(r"export interface OperationResult\s*\{(.*?)\n\}", text, re.S)
    if not m:
        return set()
    return set(re.findall(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\??:", m.group(1), re.M))


def carried_fields(text):
    """Keys the rebuild actually writes into the row it pushes."""
    m = re.search(r"rows\.push\(\{(.*?)\n      \}\);", text, re.S)
    if not m:
        return set()
    body = m.group(1)
    #  Two spellings appear: `name: orr.name` and a spread of a conditional
    #  object, `...(cond ? { provenance: prov } : {})`.  Both WRITE the key.
    return set(re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:", body))


def main():
    declared = declared_fields(TYPE_FILE.read_text())
    carried = carried_fields(CROSS_FILE.read_text())

    if not declared:
        fail(f"harvested NO fields from `export interface OperationResult` in"
             f" {TYPE_FILE.relative_to(ROOT)} -- the shape changed, so this"
             f" gate is blind rather than satisfied")
    if not carried:
        fail(f"harvested NO carried keys from the rows.push({{...}}) rebuild in"
             f" {CROSS_FILE.relative_to(ROOT)} -- the shape changed, so this"
             f" gate is blind rather than satisfied")

    missing = sorted(declared - carried - set(CROSSING_DROPS))
    if missing:
        fail("the WASM crossing does not carry " + ", ".join(missing) +
             " -- an OperationResult field the type DECLARES and the rebuild"
             " never writes is lost in silence, because an absent optional"
             " field looks exactly like one the engine did not send."
             "  Carry it in WasmAdapter's rows.push({...}), or declare it in"
             " this gate's CROSSING_DROPS with the reason.")

    stale = sorted(set(CROSSING_DROPS) & carried)
    if stale:
        fail("these fields are listed as deliberately DROPPED and the crossing"
             f" carries them anyway: {stale} -- remove the stale entry, a"
             " waiver that no longer describes the code is worse than none")

    unknown = sorted(set(CROSSING_DROPS) - declared)
    if unknown:
        fail(f"CROSSING_DROPS names {unknown}, which the type does not declare"
             " -- a waiver for a field that does not exist")

    print("check_operation_result_crossing: OK -- all %d field(s) that"
          " `OperationResult` declares (%s) are written by the rebuild in"
          " WasmAdapter, so a result the engine publishes reaches the browser"
          " instead of being dropped at the crossing; %d field(s) are declared"
          " as deliberate drops.  This is the hole that lost the fit's"
          " `curation` verdict on the day it was published, and `headline`"
          " for far longer.  NOT CHECKED: that a carried field is USED, that"
          " the browser renders it, or the other adapters (MockAdapter builds"
          " fixtures, not engine output)."
          % (len(declared), ", ".join(sorted(declared)), len(CROSSING_DROPS)))


main()
