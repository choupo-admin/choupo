#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_unit_acceptance -- what a unit accepts is a DECLARATION, checked by
ONE function, before the solve on every authored inlet and at the solve on
the stream a unit is handed (DEV.md 4c C188 item 5, slices A, B and C; the contract is
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

SLICE B (2026-10-31; docs/design/what-a-unit-accepts.md section 10) adds
electrodialysisStack, ionExchanger, crystalliser (judged on its COMBINED
feed), and the choupoBatch vessels batchElectrodialysis and batchDiafilter
(choupoBatch has no pre-solve seam: a vessel judges its initial holdup in
its own initialise), the `needs` capability word `aqueousActivityModel`,
and `passThrough` on the ED stack (witness ed10_passthrough_benzene).

  (f) SOURCE: the five slice-B units carry none of their old refusal
      phrases, call checkAcceptance (the rig through checkInitialTanks),
      define ::acceptance() with `declared = true`; UnitAcceptance.cpp
      writes the new heads; the stack calls readPassThrough and
      recordPassThrough.
  (g) AN AUTHORED FEED IS REFUSED BEFORE ANY UNIT RUNS: ed10 without its
      passThrough block (benzene, naming the bridge's own sentence and the
      passThrough remedy); ed01 with no aqueous chemistry; membrane08 with
      Ca's bridge removed (the softener); crystalliser01 with no sucrose.
  (h) A PRODUCED diluate carrying benzene is refused AT THE SOLVE by a second
      stack that declares no pass-through (the flowsheet banner printed).
  (i) THE PASS-THROUGH: ed10 runs; the declaredApproximation is in the run
      output and once in converged/problemDivergence; benzene 0.01 kmol/h in
      the diluate feed is 0.01 kmol/h in the diluate and 0 in the
      concentrate; the stack's mass row closes at 100.0000 % and the carbon
      row carries benzene's 0.06 kmol C/h at 100.0000 %; and every stack KPI
      equals the benzene-free twin's EXACTLY (benzene entered no equation).
  (j) EACH PASS-THROUGH REFUSAL FIRES BY NAME before any unit runs: a fate
      not offered, no fate, no reason, a modelled ion (Na), the solvent, a
      name that is not a component, the block on a unit that offers none
      (the rectifier, an unmigrated electricLoad).
  (k) `choupoBatch --describe-units` lists the vessels' contracts, and the
      rig with no aqueous chemistry refuses through its contract.
  (d) also holds the three new steady contracts.

SABOTAGES, slice B (by hand, 2026-10-31, each restored and rebuilt):
  S4  `recordPassThrough(passThrough, locus);` commented out in
      ElectrodialysisStack.cpp.  FAILED:
        (f) ElectrodialysisStack.cpp does not call recordPassThrough(
        (i) the pass-through is not on the divergence channel (0 mention(s)
            of 'pass benzene through to the diluate outlet')
        (i) converged/problemDivergence does not record the pass-through
  S5  benzene VANISHES instead of passing (both outlet flows of the
      pass-through set to 0 in the stack).  FAILED:
        (h) a produced diluate carrying benzene was accepted by a stack that
            declares no pass-through
        (i) benzene was not carried unchanged to the diluate: fed 0.01,
            diluate 0.0, concentrate 0.0 kmol/h
        (i) the stack's mass balance does not close: 'edStack,653.6157,
            652.8346,-0.7811,99.8805,'
        (i) the carbon balance does not carry benzene's 0.06 kmol C/h:
            'C,6.000000e-02,0.000000e+00,-6.000000e-02,0.0000'
      (the (h) line is the second stack being fed NO benzene, so it had
      nothing to refuse -- the sabotage reaches it too.)
  S6  the pre-solve pass ignores the declaration (`nullptr` handed to
      acceptanceFindings in place of the pass-through).  FAILED:
        (h) the pre-solve pass refused a PRODUCED stream  [it refused the
            first stack's AUTHORED inlet -- the arm's wording names the
            symptom it expects, not this one]
        (i) ed10 did not run (exit 2): ... passThrough { <component> { fate
            diluate | concentrate; }  reason "..."; }

SLICE C (2026-10-31; docs/design/what-a-unit-accepts.md section 11).

  (l) THE BATCH DIAFILTER REFUSES A COMPONENT IT DOES NOT MODEL.  Its
      contract carries rule aqueousSolventAndNonvolatileSolutes (read off
      `choupoBatch --describe-units`), and diafilter01 with 0.001 of ethanol
      in the holdup refuses at initialise naming the vessel, the clause, the
      component and the `role nonvolatile` remedy.  THE PARENT BEHAVIOUR
      (main 6277d47c7, the same case copy): exit 0, `n_ethanol_final
      0.0005555` -- the 0.001 x 0.5555 kmol charged, retained WHOLE after
      5.43 diavolumes that washed NaCl to 50.2 % -- with no word said.
  (m) THE GENERATED TEXT.  bin/curate/gen_unit_acceptance_docs.py's outputs
      (the docs/ai/unit-ops.md regions and gui/schemas/unitAcceptance.json)
      equal what it generates from the current binaries, and each names
      EXACTLY the declared units (a type and its aliases share one region,
      `spiralWoundModule,membraneSW`); the undeclared mixer is in neither.

SABOTAGES, slice C (by hand, 2026-10-31, each restored):
  S7  `a.models.rule = ...` in BatchDiafilter::acceptance commented out,
      rebuilt.  FAILED:
        (l) batchDiafilter's models rule is 'everyComponent', not
            aqueousSolventAndNonvolatileSolutes
        (l) a diafilter holdup carrying ethanol ran to exit 0 -- the
            component would be retained in silence
        (m) docs/ai/unit-ops.md or gui/schemas/unitAcceptance.json is not
            what the current binaries generate -- run
            bin/curate/gen_unit_acceptance_docs.py
  S8  a hand-written region for `mixer` added before the splitter heading.
      FAILED (and the generator's own --check reported STALE):
        (m) docs/ai/unit-ops.md or gui/schemas/unitAcceptance.json is not
            what the current binaries generate -- ...
        (m) docs/ai/unit-ops.md carries a contract for undeclared unit(s)
            ['mixer']
        (m) the undeclared mixer got a generated section
  S9  the batchDiafilter region deleted by hand.  FAILED:
        (m) docs/ai/unit-ops.md or gui/schemas/unitAcceptance.json is not
            what the current binaries generate -- ...
        (m) docs/ai/unit-ops.md omits declared unit(s) ['batchDiafilter']

SLICE D (2026-11-01; docs/design/what-a-unit-accepts.md section 12).

  (n) THE NEW REFUSALS FIRE BEFORE ANY UNIT RUNS, by name: rankine01 with its
      feed at 420 K (liquid water) refuses at the turbine ("is not a vapour";
      THE PARENT expanded it as vapour, 5 bar -> 4.21 bar, published vf = 1,
      exit 0); absorber01 with 5 kmol/h of a `role solute` component that has
      no Henry pair ('air') refuses naming the pair (THE PARENT passed it
      through unwashed, exit 0); absorber01 with a 400 K wash refuses at the
      "liquid wash inlet" (the per-port phase); evaporator01 with ethanol in
      the feed refuses `oneVolatileSolvent` naming 'water' and 'ethanol'.
  (o) SOURCE + --describe-units: absorber, stripper, compressor, evaporator
      and the batch crystalliser carry none of their old inline refusal text
      and call checkAcceptance; turbine and extractor call it; the absorber
      lists ports [gas feed: vapour, liquid wash: liquid] and the
      soluteWithoutHenryPair clause; the stripper's ports are the mirror; the
      batch crystalliser carries the steady crystalliser's two clauses (k).
  (m) also holds docs/theoryGuide-unitAcceptanceTable.tex current.

SABOTAGES, slice D (by hand, 2026-11-01, each restored and rebuilt):
  S10 `a.phases.liquid = true;` in Turbine::acceptance.  FAILED, three arms:
        (n) liquid-into-turbine: ran to exit 0
        (o) turbine / compressor are not vapour-only
        (m) docs/ai/unit-ops.md or gui/schemas/unitAcceptance.json is not what
            the current binaries generate
  S11 the soluteWithoutHenryPair test made to return "satisfied" always.
      FAILED, one arm: (n) solute-without-Henry-pair: ran to exit 0.  Only
      the run witness sees it: the clause id is still listed.
  S12 `a.ports = ...` dropped in kremserAcceptance.  FAILED:
        (n) vapour-wash-into-absorber: ran to exit 0
        (o) absorber's per-port phases are wrong: []
        (o) stripper's per-port phases are wrong: []
        (m) the generated text is stale

WHAT IS NOT CHECKED.  The pass-through's ENERGY balance: ed10's energy
report is UNAVAILABLE for want of an enthalpy datum on Na and Cl (ed01's own
records), so only the priceable part could be read (the water+benzene
enthalpy flow is the same in and out); the batch diafilter's NO-SOLVENT
refusal fired (source arm only; arm (l) fires its models refusal); a recycle that brings a new component into a migrated
unit after the first pass (no witness).

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
    p, r, m = units.get("pump"), units.get("spiralWoundModule"), units.get("cyclone")
    if not p or not p["declared"] or p["phases"]["accepted"] != ["liquid"]:
        fail.append(f"(d) pump's contract is not declared liquid-only: {p}")
    if (not r or not r["declared"] or not r["solvent"]["aqueousRequired"]
            or r["models"]["rule"] != "aqueousSolventAndNonvolatileSolutes"):
        fail.append(f"(d) spiralWoundModule's contract is wrong: {r}")
    if (not m or m["declared"] or m["phases"]["accepted"] != ["liquid", "vapour"]
            or m["models"]["rule"] != "everyComponent"):
        fail.append(f"(d) cyclone does not carry the default contract: {m}")
    e, x, c = units.get("electrodialysisStack"), units.get("ionExchanger"), \
        units.get("crystalliser")
    if (not e or not e["declared"] or e["models"]["rule"] != "aqueousSolventAndIons"
            or not e["models"].get("atLeastOne")
            or [n["capability"] for n in e["needs"]] != ["aqueousActivityModel"]
            or e["passThrough"]["fates"] != ["diluate", "concentrate"]):
        fail.append(f"(d) electrodialysisStack's contract is wrong: {e}")
    if (not x or not x["declared"] or x["models"]["rule"] != "aqueousSolventAndIons"
            or x["passThrough"]["fates"] != []):
        fail.append(f"(d) ionExchanger's contract is wrong: {x}")
    if (not c or not c["declared"] or c["appliesTo"] != "combinedFeed"
            or [r["id"] for r in c["refusesAlso"]]
            != ["crystallisableSolute", "volatileCarrier"]):
        fail.append(f"(d) crystalliser's contract is wrong: {c}")
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


# ===========================================================================
#  SLICE B (2026-10-31): the ED stack, the ion exchanger, the crystalliser,
#  the two batch vessels, and `passThrough` on the stack.
# ===========================================================================
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
ED01 = ROOT / "tutorials" / "steady" / "electrodialysis" / "ed01_nacl_desalination"
ED10 = ROOT / "tutorials" / "steady" / "electrodialysis" / "ed10_passthrough_benzene"
SOFT = ROOT / "tutorials" / "steady" / "membranes" / "membrane08_softened_scaling"
SUGAR = ROOT / "tutorials" / "steady" / "crystallisation" / "crystalliser01_sugar"
EDB = ROOT / "tutorials" / "batch" / "electrodialysis" / "edbatch01_constant_current"
PT_REQ = "pass benzene through to the diluate outlet"

#  (unit source, class, old refusal phrases that must be GONE from it)
MIGRATED_B = (
    ("electrochem/ElectrodialysisStack.cpp", "ElectrodialysisStack",
     ["declares no aqueous chemistry", "needs aqueous activities"]),
    ("separation/IonExchanger.cpp", "IonExchanger",
     ["declares no aqueous chemistry", "no row in ions.dat",
      "carries no ions", "feed has no water"]),
    ("crystallisation/Crystalliser.cpp", "Crystalliser", []),
    ("batch/BatchElectrodialysis.cpp", "BatchElectrodialysis",
     ["declares no aqueous chemistry", "is not a component"]),
    ("batch/BatchDiafilter.cpp", "BatchDiafilter", ["is not a component"]),
)


def run_bin(binary, args, case=None):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    cmd = [str(binary)] + args + ([str(case)] if case else [])
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
    return r.returncode, r.stdout + r.stderr


def edit(path, old, new):
    t = path.read_text()
    if old not in t:
        raise AssertionError(f"probe anchor missing in {path.name}: {old!r}")
    path.write_text(t.replace(old, new, 1))


def strip_block(path, head):
    """Delete the brace block that starts at `head` (brace-matched)."""
    t = path.read_text()
    i = t.index(head)
    j = t.index("{", i)
    depth = 0
    for k in range(j, len(t)):
        if t[k] == "{":
            depth += 1
        elif t[k] == "}":
            depth -= 1
            if depth == 0:
                path.write_text(t[:i] + t[k + 1:])
                return
    raise AssertionError(f"unbalanced block {head!r} in {path}")


def arm_f(fail, ok):
    """(f) source: every slice-B unit refuses through the contract."""
    for rel, cls, gone in MIGRATED_B:
        code = strip_comments((SRC / rel).read_text())
        left = [h for h in gone if h in code]
        if left:
            fail.append(f"(f) {rel} still writes its old refusal text {left} "
                        "-- it belongs in its contract (UnitAcceptance.cpp)")
        if "checkAcceptance(" not in code and "checkInitialTanks(" not in code:
            fail.append(f"(f) {rel} does not call checkAcceptance(")
        m = re.search(cls + r"::acceptance\(\)\s*const\s*\{(.*?)\n\}", code, re.S)
        if not m or "declared = true" not in m.group(1):
            fail.append(f"(f) {rel} defines no {cls}::acceptance() declaring itself")
    core = strip_comments((SRC / "UnitAcceptance.cpp").read_text())
    for h in ("needs aqueous activities", "carries none of the components",
              "offers NO pass-through", "is the aqueous solvent",
              "is a component this unit", "offered by this unit", "no `reason`",
              "declaredApproximation"):
        if h not in core:
            fail.append(f"(f) UnitAcceptance.cpp does not write the head {h!r}")
    ed = strip_comments((SRC / "electrochem/ElectrodialysisStack.cpp").read_text())
    for call in ("readPassThrough(", "recordPassThrough("):
        if call not in ed:
            fail.append(f"(f) ElectrodialysisStack.cpp does not call {call}")
    if not any(f.startswith("(f)") for f in fail):
        ok.append("the five slice-B units refuse through their contracts (source)")


def presolve(tag, case, words, fail, ok, arm):
    rc, out = run([], case)
    missing = [x for x in [PRESOLVE] + words if x not in out]
    if rc == 0:
        fail.append(f"({arm}) {tag}: ran to exit 0")
    elif PRESOLVE not in out:
        fail.append(f"({arm}) {tag}: the refusal came from the unit's solve, not "
                    "the pre-solve pass:\n      " + out[-500:])
    elif missing:
        fail.append(f"({arm}) {tag}: refused before the solve but without {missing}:"
                    "\n      " + out[-700:])
    elif BANNER in out:
        fail.append(f"({arm}) {tag}: the '{BANNER}' banner printed")
    else:
        ok.append(f"{tag} refused before any unit ran")


def arm_g(tmp, fail, ok):
    """(g) the migrated steady units refuse an authored feed before the solve."""
    # ED: benzene with NO pass-through declared.
    w = copy_case(ED10, Path(tmp) / "accED_benzene")
    strip_block(w / "system" / "flowsheetDict", "        passThrough")
    presolve("benzene-into-ED", w, ["'benzene'", "does not model",
             "declares no aqueous mapping", "passThrough { <component>"],
             fail, ok, "g")
    # ED: no aqueous activity model.
    w = copy_case(ED01, Path(tmp) / "accED_noAqueous")
    strip_block(w / "constant" / "thermoPhysPropDict", "    aqueous")
    presolve("ED-without-aqueous-chemistry", w,
             ["the case declares no aqueous chemistry", "`aqueousActivityModel`"],
             fail, ok, "g")
    # ion exchanger: Ca's bridge removed (the bridge's own sentence travels).
    w = copy_case(SOFT, Path(tmp) / "accIX_bridge")
    ca = w / "constant" / "components" / "Ca.dat"
    t = ca.read_text()
    u = re.sub(r"(?ms)^aqueousMapping\s*\([^)]*\)\s*;\s*$", "", t, count=1)
    if u == t:
        u = re.sub(r"(?m)^dissociatesTo.*$", "", t, count=1)
    if u == t:
        fail.append("(g) ionExchanger: Ca.dat declares no bridge to remove")
    else:
        ca.write_text(u)
        presolve("unbridged-Ca-into-softener", w,
                 ["ionExchanger 'softener'", "'Ca'", "declares no aqueous mapping"],
                 fail, ok, "g")
    # crystalliser: a sugar feed with no sugar.
    w = copy_case(SUGAR, Path(tmp) / "accCryst_noSolute")
    edit(w / "0" / "feed", "    sucrose    15 kmol/h;\n", "")
    presolve("solute-free-crystalliser-feed", w,
             ["crystalliser", "carries no crystallising solute"], fail, ok, "g")


def arm_h(tmp, fail, ok):
    """(h) a PRODUCED stream carrying an undeclared component is refused by the
    consuming stack at its own solve: ed10 with a second stack downstream that
    declares no pass-through."""
    w = copy_case(ED10, Path(tmp) / "accED_produced")
    fd = w / "system" / "flowsheetDict"
    t = fd.read_text()
    second = """    {
        name        edStack2;
        type        electrodialysisStack;
        inputs      ( diluate  concentrate );
        outputs     ( diluate2  concentrate2 );
        operation
        {
            N_cellpairs       100;
            current           1.0;
            xi                0.9;
            membraneArea      0.2 m2;
            channelThickness  0.5 mm;
            channelLength     0.4 m;
            linearVelocity    0.05 m/s;
            E_electrodes      1.5;
            membrane          CMX_AMX;
        }
    }
    {
        name        rectifier;"""
    if "    {\n        name        rectifier;" not in t:
        fail.append("(h) could not build the produced-stream witness (ed10 moved)")
        return
    fd.write_text(t.replace("    {\n        name        rectifier;", second, 1))
    shutil.copy(w / "0" / "diluate", w / "0" / "diluate2")
    shutil.copy(w / "0" / "concentrate", w / "0" / "concentrate2")
    rc, out = run([], w)
    if rc == 0:
        fail.append("(h) a produced diluate carrying benzene was accepted by a"
                    " stack that declares no pass-through")
    elif PRESOLVE in out:
        fail.append("(h) the pre-solve pass refused a PRODUCED stream")
    elif BANNER not in out:
        fail.append(f"(h) the run stopped before the flowsheet started (exit {rc}):"
                    "\n      " + out[-500:])
    elif "edStack2" not in out or "'benzene'" not in out or "does not model" not in out:
        fail.append(f"(h) refused (exit {rc}) but not by edStack2's contract:"
                    "\n      " + out[-500:])
    else:
        ok.append("a produced diluate carrying benzene is refused by the next stack at its solve")


def num(tag, text):
    m = re.search(tag, text)
    return float(m.group(1)) if m else None


def arm_i(tmp, fail, ok):
    """(i) THE PASS-THROUGH: ed10 runs, records the approximation once, carries
    benzene unchanged to the diluate, closes its balances, and reproduces
    ed01's stack numbers (benzene entered no equation)."""
    w = copy_case(ED10, Path(tmp) / "accED_witness")
    rc, out = run([], w)
    if rc != 0:
        fail.append(f"(i) ed10 did not run (exit {rc}):\n      " + out[-600:])
        return
    if out.count(PT_REQ) < 2:          # the banner + the result JSON
        fail.append(f"(i) the pass-through is not on the divergence channel "
                    f"({out.count(PT_REQ)} mention(s) of {PT_REQ!r})")
    pd = w / "converged" / "problemDivergence"
    if not pd.exists() or PT_REQ not in pd.read_text() \
            or "declaredApproximation" not in pd.read_text():
        fail.append("(i) converged/problemDivergence does not record the pass-through")
    elif pd.read_text().count(PT_REQ) != 1:
        fail.append("(i) converged/problemDivergence records the pass-through "
                    f"{pd.read_text().count(PT_REQ)} times, not once")
    # benzene: in == out, and all of it in the diluate.
    def benz(stream):
        f = w / "converged" / stream
        if not f.exists():
            return None
        m = re.search(r"^\s*benzene\s+(\S+)\s+kmol/h;", f.read_text(), re.M)
        return float(m.group(1)) if m else 0.0
    bin_, bout, bcon = benz("diluateFeed"), benz("diluate"), benz("concentrate")
    if bin_ is None or bout is None:
        fail.append(f"(i) converged/ lacks the diluate streams ({bin_}, {bout})")
    elif abs(bin_ - 0.01) > 1e-9 or abs(bout - bin_) > 1e-9 * max(1.0, bin_) \
            or (bcon or 0.0) != 0.0:
        fail.append(f"(i) benzene was not carried unchanged to the diluate: fed "
                    f"{bin_}, diluate {bout}, concentrate {bcon} kmol/h")
    # the balances the run closes: the stack's mass row and the carbon atoms
    # (benzene's only element no other component carries).
    mb = w / "reports" / "balances" / "massBalance_byUnit.csv"
    eb = w / "reports" / "balances" / "elementBalance.csv"
    row = next((l for l in (mb.read_text().splitlines() if mb.exists() else [])
                if l.startswith("edStack,")), "")
    if row.split(",")[4:5] != ["100.0000"]:
        fail.append(f"(i) the stack's mass balance does not close: {row!r}")
    crow = next((l for l in (eb.read_text().splitlines() if eb.exists() else [])
                 if l.startswith("C,")), "")
    cells = crow.split(",")
    if len(cells) < 5 or cells[4] != "100.0000" or abs(float(cells[1]) - 0.06) > 1e-9:
        fail.append(f"(i) the carbon balance does not carry benzene's 0.06 kmol C/h: {crow!r}")
    # benzene moves no stack number: the same case without benzene.
    tw = copy_case(ED10, Path(tmp) / "accED_twin")
    for s in ("diluateFeed", "diluate"):
        edit(tw / "0" / s, "    benzene    0.01 kmol/h;\n", "")
    rc2, out2 = run([], tw)
    if rc2 != 0:
        fail.append(f"(i) the benzene-free twin did not run (exit {rc2})")
    else:
        for key in ("I", "U", "demin_ratio", "i_lim", "E_mem_pair", "R_pair",
                    "specific_energy_kWh_per_m3"):
            pat = r'"' + re.escape(key) + r'"\s*:\s*([-0-9.eE+]+)'
            g, v = num(pat, out2), num(pat, out)
            if g is None or v is None or v != g:
                fail.append(f"(i) edStack {key} = {v} with benzene against {g}"
                            " without: benzene moved a number it should not reach")
    if not any(f.startswith("(i)") for f in fail):
        ok.append(f"ed10: benzene {bin_} kmol/h carried to the diluate unchanged, "
                  "recorded once as a declaredApproximation, mass and carbon "
                  "balances closed, every stack KPI equal to the benzene-free twin's")


def arm_j(tmp, fail, ok):
    """(j) each pass-through refusal fires, by name, before any unit runs."""
    probes = (
        ("fate-not-offered", lambda w: edit(w / "system" / "flowsheetDict",
            "benzene { fate diluate; }", "benzene { fate permeate; }"),
         "fate 'permeate' is not offered"),
        ("no-fate", lambda w: edit(w / "system" / "flowsheetDict",
            "benzene { fate diluate; }", "benzene { }"),
         "no `fate`"),
        ("no-reason", lambda w: edit(w / "system" / "flowsheetDict",
            '            reason  "trace organic', '            //reason  "trace organic'),
         "no `reason`"),
        ("modelled-ion", lambda w: edit(w / "system" / "flowsheetDict",
            "benzene { fate diluate; }", "benzene { fate diluate; }\n            Na { fate diluate; }"),
         "'Na' is a component this unit MODELS"),
        ("the-solvent", lambda w: edit(w / "system" / "flowsheetDict",
            "benzene { fate diluate; }", "benzene { fate diluate; }\n            water { fate diluate; }"),
         "'water' is the aqueous solvent"),
        ("not-a-component", lambda w: edit(w / "system" / "flowsheetDict",
            "benzene { fate diluate; }", "benzene { fate diluate; }\n            toluene { fate diluate; }"),
         "'toluene' is not a component of this package"),
        ("unit-offers-none", lambda w: edit(w / "system" / "flowsheetDict",
            "        operation   { eta 1.0; }",
            "        operation   { eta 1.0; }\n        passThrough { benzene { fate diluate; } reason \"x\"; }"),
         "electricLoad 'rectifier' (type electricLoad) `passThrough`: this unit offers NO pass-through"),
    )
    for tag, mutate, words in probes:
        w = copy_case(ED10, Path(tmp) / ("accPT_" + tag))
        try:
            mutate(w)
        except AssertionError as e:
            fail.append(f"(j) {tag}: {e}")
            continue
        presolve("passThrough " + tag, w, [words], fail, ok, "j")


def arm_k(tmp, fail, ok):
    """(k) choupoBatch: the vessels' contracts, and the initialise check."""
    if not BATCH.exists():
        fail.append(f"(k) no {BATCH} -- build the tree first")
        return
    rc, out = run_bin(BATCH, ["--describe-units"])
    lines = out.splitlines()
    start = next((i for i, l in enumerate(lines) if l == "{"), None)
    try:
        units = {u["type"]: u for u in
                 json.loads("\n".join(lines[start:]))["units"]}
    except (TypeError, ValueError, KeyError) as e:
        fail.append(f"(k) choupoBatch --describe-units is not the expected JSON ({e})")
        return
    b, d = units.get("batchElectrodialysis"), units.get("batchDiafilter")
    if (not b or not b["declared"] or b["models"]["rule"] != "aqueousSolventAndIons"
            or [n["capability"] for n in b["needs"]] != ["aqueousActivityModel"]):
        fail.append(f"(k) batchElectrodialysis's contract is wrong: {b}")
    if not d or not d["declared"] or not d["solvent"]["aqueousRequired"]:
        fail.append(f"(k) batchDiafilter's contract is wrong: {d}")
    w = copy_case(EDB, Path(tmp) / "accEDB_noAqueous")
    strip_block(w / "constant" / "thermoPhysPropDict", "    aqueous")
    rc, out = run_bin(BATCH, [], w)
    if rc == 0:
        fail.append("(k) a batch ED rig with no aqueous chemistry ran to exit 0")
    elif "`aqueousActivityModel`" not in out or "batchElectrodialysis 'rig'" not in out:
        fail.append(f"(k) the batch rig refused (exit {rc}) but not through its"
                    " contract:\n      " + out[-500:])
    bc = units.get("batchCrystalliser")
    if (not bc or not bc["declared"] or [r["id"] for r in bc["refusesAlso"]]
            != ["crystallisableSolute", "volatileCarrier"]):
        fail.append(f"(k) batchCrystalliser does not carry the steady "
                    f"crystalliser's contract: {bc}")
    if not any(f.startswith("(k)") for f in fail):
        nd = sum(1 for u in units.values() if u["declared"])
        ok.append(f"choupoBatch --describe-units lists {len(units)} vessel types, "
                  f"{nd} declared; the rig refuses through its contract at initialise")


DIAF = ROOT / "tutorials" / "batch" / "membrane" / "diafilter01_nf_desalting"


def arm_l(tmp, fail, ok):
    """(l) the batch diafilter refuses, by name, a holdup component it does
    not model (slice C; before it, the vessel retained it in silence)."""
    if not BATCH.exists():
        fail.append(f"(l) no {BATCH} -- build the tree first")
        return
    _, out = run_bin(BATCH, ["--describe-units"])
    lines = out.splitlines()
    start = next((i for i, l in enumerate(lines) if l == "{"), None)
    try:
        d = {u["type"]: u for u in
             json.loads("\n".join(lines[start:]))["units"]}["batchDiafilter"]
    except (TypeError, ValueError, KeyError) as e:
        fail.append("(l) no batchDiafilter contract in choupoBatch "
                    f"--describe-units ({e})")
        return
    if d["models"]["rule"] != "aqueousSolventAndNonvolatileSolutes":
        fail.append("(l) batchDiafilter's models rule is "
                    f"{d['models']['rule']!r}, not "
                    "aqueousSolventAndNonvolatileSolutes")
    w = copy_case(DIAF, Path(tmp) / "accDiaf_ethanol")
    try:
        edit(w / "constant" / "thermoPhysPropDict",
             "components       ( water  NaCl  MgSO4 );",
             "components       ( water  NaCl  MgSO4  ethanol );")
        edit(w / "0" / "internalStates" / "retentate",
             "        water    0.99928;",
             "        water    0.99828;\n        ethanol  0.00100;")
    except AssertionError as e:
        fail.append(f"(l) {e}")
        return
    rc, out = run_bin(BATCH, [], w)
    words = ("batchDiafilter 'retentate'",
             "carries component(s) this unit does not model",
             "'ethanol'", "role nonvolatile")
    missing = [x for x in words if x not in out]
    if rc == 0:
        fail.append("(l) a diafilter holdup carrying ethanol ran to exit 0 -- "
                    "the component would be retained in silence")
    elif missing:
        fail.append(f"(l) the diafilter refused (exit {rc}) but without "
                    f"{missing}:\n      " + out[-600:])
    else:
        ok.append("the batch diafilter refuses ethanol in its holdup by name, "
                  "through its contract (rule "
                  "aqueousSolventAndNonvolatileSolutes)")


def arm_m(fail, ok):
    """(m) the generated "what this unit accepts" text: current, and naming
    every declared unit and no undeclared one."""
    sys.path.insert(0, str(ROOT / "bin" / "curate"))
    try:
        import gen_unit_acceptance_docs as gen
        doc, js, units, _, tex = gen.outputs()
    except Exception as e:  # noqa: BLE001 -- a check that cannot run must not pass
        fail.append(f"(m) the generator could not run: {e}")
        return
    if gen.DOC.read_text() != doc or not gen.JSON_OUT.exists() \
            or gen.JSON_OUT.read_text() != js \
            or not gen.TEX_OUT.exists() or gen.TEX_OUT.read_text() != tex:
        fail.append("(m) docs/ai/unit-ops.md or gui/schemas/unitAcceptance.json"
                    " is not what the current binaries generate -- run "
                    "bin/curate/gen_unit_acceptance_docs.py")
    declared = set(units)
    in_doc = {x for key in re.findall(
                  r"^<!-- BEGIN GENERATED unit-acceptance (\S+) ",
                  gen.DOC.read_text(), re.M) for x in key.split(",")}
    in_js = (set(json.loads(gen.JSON_OUT.read_text())["units"])
             if gen.JSON_OUT.exists() else set())
    for where, got in (("docs/ai/unit-ops.md", in_doc),
                       ("gui/schemas/unitAcceptance.json", in_js)):
        if got - declared:
            fail.append(f"(m) {where} carries a contract for undeclared "
                        f"unit(s) {sorted(got - declared)}")
        if declared - got:
            fail.append(f"(m) {where} omits declared unit(s) "
                        f"{sorted(declared - got)}")
    for need in ("batchDiafilter", "spiralWoundModule", "pump", "compressor",
                 "turbine", "absorber", "stripper", "extractor", "evaporator",
                 "batchCrystalliser", "distillationColumn", "shortcutColumn",
                 "isothermalFlash", "adiabaticFlash", "valve", "heatExchanger",
                 "mixer", "splitter"):
        if need not in declared:
            fail.append(f"(m) {need} is not among the declared contracts")
    if "cyclone" in in_doc | in_js:
        fail.append("(m) the undeclared cyclone got a generated section")
    for need in sorted(declared):
        if "\\texttt{" + need.replace("_", "\\_") + "}" not in gen.TEX_OUT.read_text():
            fail.append(f"(m) docs/theoryGuide-unitAcceptanceTable.tex omits {need}")
    if not any(f.startswith("(m)") for f in fail):
        ok.append("the generated acceptance text is current and names exactly "
                  f"the {len(declared)} declared unit(s) in unit-ops.md and "
                  "the GUI's unitAcceptance.json")


# ---------------------------------------------------------------------------
#  SLICE D (2026-11-01; docs/design/what-a-unit-accepts.md section 12)
# ---------------------------------------------------------------------------
TURB = ROOT / "tutorials" / "steady" / "power" / "rankine01_water"
ABS = ROOT / "tutorials" / "steady" / "absorption" / "absorber01_NH3_water"
EVAP = ROOT / "tutorials" / "steady" / "evaporation" / "evaporator01_brine"


def unseal(w):
    for sub in ("components", "species", "parameters", "chemistry", "conventions"):
        d = w / "constant" / sub
        if d.exists():
            shutil.rmtree(d)
    return w


def sub1(path, pattern, repl):
    t = path.read_text()
    t2, n = re.subn(pattern, repl, t, count=1, flags=re.M)
    path.write_text(t2)
    return n == 1


def arm_n(tmp, fail, ok):
    """(n) slice D: the new refusals fire BEFORE any unit runs, by name."""
    # turbine fed a LIQUID (the parent expanded it as vapour at exit 0).
    w = copy_case(TURB, Path(tmp) / "accTurbine_liquid")
    good = (sub1(w / "0" / "feedSteam", r"^T\s+800 K;", "T               420 K;")
            and sub1(w / "system" / "flowsheetDict", r"W_shaft\s+-10\.0 kW;",
                     "W_shaft -0.5 kW;"))
    if not good:
        fail.append("(n) could not build the turbine witness (rankine01 moved)")
    else:
        presolve("liquid-into-turbine", w,
                 ["type turbine", "is not a vapour", "valve"], fail, ok, "n")

    # absorber: a `role solute` with no Henry pair (parent: passed on, exit 0).
    w = copy_case(ABS, Path(tmp) / "accAbs_air")
    air = ROOT / "data" / "standards" / "components" / "air.dat"
    (w / "constant" / "components").mkdir(exist_ok=True)
    (w / "constant" / "components" / "air.dat").write_text(
        air.read_text() + "\nrole solute;\n")
    good = sub1(w / "constant" / "thermoPhysPropDict",
                r"components\s+\( NH3  N2  water \);",
                "components       ( NH3  N2  air  water );")
    for f in ("gasFeed", "cleanGas"):
        good &= sub1(w / "0" / f, r"^    N2    90 kmol/h;",
                     "    N2    85 kmol/h;\n    air    5 kmol/h;")
    if not good:
        fail.append("(n) could not build the absorber witness (absorber01 moved)")
    else:
        presolve("solute-without-Henry-pair", w,
                 ["type absorber", "'air'", "no Henry pair"], fail, ok, "n")

    # absorber PER-PORT: the wash arrives as a vapour (400 K, 1 atm).
    w = copy_case(ABS, Path(tmp) / "accAbs_port")
    if not sub1(w / "0" / "solvent", r"^T\s+298\.15 K;", "T               400 K;"):
        fail.append("(n) could not build the absorber port witness")
    else:
        presolve("vapour-wash-into-absorber", w,
                 ["type absorber", "liquid wash inlet", "is not a liquid"],
                 fail, ok, "n")

    # evaporator: two volatile species in the feed.
    w = unseal(copy_case(EVAP, Path(tmp) / "accEvap_two"))
    good = sub1(w / "constant" / "thermoPhysPropDict",
                r"components\s+\( water NaCl \);",
                "components       ( water NaCl ethanol );")
    good &= sub1(w / "0" / "feed", r"^    NaCl    1\.067 kmol/h;",
                 "    NaCl    1.067 kmol/h;\n    ethanol 1 kmol/h;")
    if not good:
        fail.append("(n) could not build the evaporator witness")
    else:
        presolve("two-volatiles-into-evaporator", w,
                 ["type evaporator", "'water'", "'ethanol'"], fail, ok, "n")


def arm_o(fail, ok):
    """(o) SOURCE: the slice-D units carry none of their old inline refusals
    and call the contract; --describe-units shows the per-port form."""
    olds = {
        "separation/Absorber.cpp": ["names no SOLVENT", "not one component is a SOLUTE",
                                     "neither the solvent"],
        "separation/Stripper.cpp": ["names no SOLVENT", "not one component is a SOLUTE",
                                     "neither the solvent"],
        "rotating/Compressor.cpp": ["carries LIQUID"],
        "heatTransfer/Evaporator.cpp": ["multiple volatile", "feed has no volatile"],
        "batch/BatchCrystalliser.cpp": ["no crystallising solute"],
    }
    for rel, heads in olds.items():
        code = strip_comments((SRC / rel).read_text())
        left = [h for h in heads if h in code]
        if left:
            fail.append(f"(o) {rel} still writes refusal text {left} -- it "
                        "belongs to the contract")
        if "checkAcceptance(" not in code:
            fail.append(f"(o) {rel} does not call checkAcceptance(")
    for rel in ("rotating/Turbine.cpp", "separation/Extractor.cpp"):
        if "checkAcceptance(" not in strip_comments((SRC / rel).read_text()):
            fail.append(f"(o) {rel} does not call checkAcceptance(")
    rc, out = run(["--describe-units"])
    lines = out.splitlines()
    start = next((i for i, l in enumerate(lines) if l == "{"), None)
    try:
        units = {u["type"]: u for u in json.loads("\n".join(lines[start:]))["units"]}
    except (TypeError, ValueError, KeyError):
        fail.append("(o) --describe-units is not JSON")
        return
    a, s, tb, c = (units.get("absorber"), units.get("stripper"),
                   units.get("turbine"), units.get("compressor"))
    if not a or [p["name"] for p in a.get("ports", [])] != ["gas feed", "liquid wash"] \
            or [p["accepted"] for p in a["ports"]] != [["vapour"], ["liquid"]]:
        fail.append(f"(o) absorber's per-port phases are wrong: {a and a.get('ports')}")
    if not s or [p["accepted"] for p in s.get("ports", [])] != [["liquid"], ["vapour"]]:
        fail.append(f"(o) stripper's per-port phases are wrong: {s and s.get('ports')}")
    if not tb or tb["phases"]["accepted"] != ["vapour"] \
            or not c or c["phases"]["accepted"] != ["vapour"]:
        fail.append("(o) turbine / compressor are not vapour-only")
    ids = [r["id"] for r in (a or {}).get("refusesAlso", [])]
    if "soluteWithoutHenryPair" not in ids:
        fail.append(f"(o) absorber lacks the soluteWithoutHenryPair clause: {ids}")
    if not any(f.startswith("(o)") for f in fail):
        ok.append("the slice-D units refuse through the contract (source) and"
                  " declare per-port phases")


def main() -> int:
    if not BIN.exists():
        print(f"check_unit_acceptance: FAILED\n  no {BIN} -- build the tree "
              "first.  A check that cannot run must not pass.")
        return 1
    fail, ok = [], []
    arm_a(fail, ok)
    arm_f(fail, ok)
    with tempfile.TemporaryDirectory(prefix="unitAcceptance_") as tmp:
        arm_b(tmp, fail, ok)
        arm_c(tmp, fail, ok)
        arm_g(tmp, fail, ok)
        arm_h(tmp, fail, ok)
        arm_i(tmp, fail, ok)
        arm_j(tmp, fail, ok)
        arm_k(tmp, fail, ok)
        arm_l(tmp, fail, ok)
        arm_n(tmp, fail, ok)
    arm_d(fail, ok)
    arm_o(fail, ok)
    arm_m(fail, ok)
    arm_e(fail, ok)
    if fail:
        print("check_unit_acceptance: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_unit_acceptance: OK -- " + "; ".join(ok) + ".  Scope: the "
          "migrated units (slices A-C: spiralWoundModule, pump, electrodialysisStack, "
          "ionExchanger, crystalliser, batchElectrodialysis, batchDiafilter; "
          "slice D: compressor, turbine, absorber, stripper, extractor, "
          "evaporator, batchCrystalliser, plus the declaration-only column, "
          "shortcut, flashes, valve, heatExchanger, mixer, splitter), the "
          "default on cyclone, and passThrough on the ED stack; NOT checked: "
          "a run witness of the extractor's liquid-only ports and of the batch "
          "crystalliser's refusals (source and --describe-units arms only); "
          "the energy balance of a pass-through on a case whose package prices "
          "it on a different phase than it carries, the text outside the "
          "generated acceptance regions, a recycle bringing a new component into a migrated "
          "unit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
