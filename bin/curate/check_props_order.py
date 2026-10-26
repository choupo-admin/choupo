#!/usr/bin/env python3
"""Gate: THE ORDER OF A PROPERTIES WORKFLOW IS AN ENGINE FACT.
    bin/curate/check_props_order.py

WHY THIS EXISTS (DEV.md 4c C172 slice 2; docs/design/one-app-two-homes.md
item 4).  choupoProps runs `propsDict.operations ( ... )` in DECLARED order
and never re-sorts it, so an operation that reads a file a LATER operation
writes reads a previous run's leftovers -- or nothing -- and nothing said so.
`propsPlan::validate` (src/propertyOps/PropsPlan.{H,cpp}) refuses that by
name before operation [0] runs: the properties analogue of
`Flowsheet::validateSequentialPlan`.  What an op reads and writes has ONE
home, the file-traffic table in PropsPlan.cpp, which the engine PUBLISHES
(`choupoProps --file-traffic`); this gate asks the engine for it rather than
keeping a copy.  Arms:

  (a) THE TABLE IS COMPLETE.  Every type `PropertyOperation::registerBuiltins`
      registers has a row (no `UNTABLED` line), and no row names a type that
      is not registered (a stale row).
  (b) THE TABLE MATCHES THE OPS' OWN WRITES.  Every key an operation's source
      hands `records::refuseStandardsWrite(who, "<key>", path)` -- the ONE
      home of a write into a case -- is the leaf of a write slot of that op's
      row.  (The op's class is read off its `reg(...)` line; its files are
      src/propertyOps/<Class>*.cpp.)
  (c) THE GUI READS THE TABLE, AND KEEPS NO COPY OF ITS WRITES (C172 slice
      3).  gui/schemas/propsFileTraffic.json -- what the Workflow's inspector,
      the calculation map and the worker's read-back of the case's records
      all read -- is EXACTLY the table the engine prints, built by the one
      builder (bin/curate/gen_props_file_traffic.py `build`); a stale file
      fails naming the command that regenerates it.  No op schema carries an
      `x-choupo.writes` (the hand-written second copy slice 2 held equal to
      the table is gone).  For every tabled type with an op schema: every
      `x-choupo.data` key of kind `experiment` is a file read of the row, and
      every by-name membrane read of the row is a data key of kind `record`
      (the map's DATA labels stay in the schema: the table names files, not
      what kind of evidence they hold).
  (d) THE CORPUS IS IN ORDER.  `choupoProps --plan` on every
      tutorials/**/system/propsDict exits 0 -- except a case that DECLARES a
      process-run input (`writtenBy`), planned on a COPY without run outputs
      (whether the file exists depends on what last ran in this checkout, and
      a claim must not), which must refuse with the remedy -- and
      no operation is announced as unchecked (a case's own code/ op is
      outside the stock table and IS announced, which is the honest answer).
  (e) THE RULE, THROUGH THE REAL READER, on probe cases: a read of a LATER
      write refuses naming both operations, both keys and the remedy (move
      the writer earlier); the same two operations in the right order pass;
      a membrane read BY NAME before the fit that writes it refuses, by the
      path stem and by a declared `output.name`; a by-construction read
      (constant/reactions) of a later write refuses.
  (f) ctrl17, THE PROCESS RUN AS A WRITER: on a copy with no trajectory,
      both `--plan` and a full run refuse BEFORE the first operation, naming
      "Run the Flowsheet (choupoCtrl) first"; with the file present, the plan
      passes and says the input is the process run's; and `writtenBy` on a
      key the op does not read, a word other than `process`, a case with no
      system/flowsheetDict, and a file a Properties step also writes each
      refuse by name.

WHAT THIS GATE DOES NOT COVER, said so its green line cannot imply it.  It
does not prove the table lists every key an op READS a file through: arm (b)
can see writes (they pass one named home) and nothing equivalent exists for
reads.  A path an op COMPUTES (`proposal auto`, exchange's _isotherm.csv,
enthalpyConcentration's sidecar) and a record read by name through any
registry but the membrane one are outside the rule.  ReactionCurve and
ThielePellet write their CSVs without `refuseStandardsWrite`, so arm (b) has
nothing to compare for them (a finding, recorded in DEV.md C172, not fixed
here).  The thermo PACKAGE is assembled before operation [0] and is not part
of the order.

BY-HAND SABOTAGES (2026-10-26; each restored, the engine ones rebuilt with
`make all` before and after; all nine CAUGHT):
  S1  PropsPlan.cpp, the rule's `if (w.op <= r.op) continue;` reversed to
      `w.op >= r.op` (refuse an EARLIER write, pass a later one) -> arm (e):
      "read of a later write: --plan exited 0".  The corpus arm (d) does NOT
      see it: no corpus case reads an earlier op's write either, so only the
      probes can tell the rule from its mirror.
  S2  the membrane `fittedRecordName` stamp on a written record dropped ->
      arm (e): "a membrane read by name before its fit (path stem)".
  S3  the engine default of a key (`trajectory` -> trajectory.csv) not
      applied -> arm (e): "the default trajectory path, normalised".
  S4  (slice 2, against the copy slice 3 removed) ppr78Kij.schema.json's
      x-choupo `writes` removed -> arm (c).  Slice 3's arm (c), by hand: the
      ppr78Kij write row deleted from gui/schemas/propsFileTraffic.json ->
      "is not the engine's table"; an `x-choupo.writes` put back on
      fitParameters.schema.json -> "carries x-choupo.writes".
  S5  the table's ppr78Kij write slot removed -> arms (b) (Ppr78Kij.cpp
      guards a write through 'output.record') AND (c).
  S6  the absent-file test of a `writtenBy process` input disabled -> arm
      (f): "ctrl17 with no trajectory (--plan): --plan exited 0".
  S7  ctrl17's two `writtenBy` lines deleted -> arm (f), same line.
  S8  the thielePellet row renamed -> arms (a) (no row for a registered
      type) AND (d) (thiele01 announces an unchecked operation).
  S9  main.cpp: the order check run only under --plan -> arm (f): "ctrl17
      with no trajectory, full run: exit 1, expected the process-run
      refusal" (the op's own reader refused instead, after the package was
      built and with operation [0] already started).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
SCHEMAS = ROOT / "gui" / "schemas" / "operations"
REG = ROOT / "src" / "propertyOps" / "PropertyOperation.cpp"
OPS_DIR = ROOT / "src" / "propertyOps"
CTRL17 = ROOT / "tutorials" / "ctrl" / "ctrl17_step_reaction_curve"
fails = []


def fail(arm, msg):
    fails.append(f"({arm}) {msg}")


def run(args, timeout=300):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROPS)] + [str(a) for a in args], capture_output=True,
                       text=True, env=env, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def file_traffic():
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(PROPS), "--file-traffic"], capture_output=True,
                       text=True, env=env, timeout=300)
    rc, out = r.returncode, r.stdout
    if rc != 0:
        fail("a", f"choupoProps --file-traffic exited {rc}:\n{(r.stdout + r.stderr)[-2000:]}")
        return {}, [], []
    rows, untabled = {}, []
    for line in out.splitlines():
        f = line.split("\t")
        if len(f) == 2 and f[1] == "UNTABLED":
            untabled.append(f[0]); continue
        if len(f) == 2 and f[1] == "none":
            rows.setdefault(f[0], []); continue
        if len(f) >= 4 and f[1] in ("read", "write"):
            rows.setdefault(f[0], []).append(
                {"dir": f[1], "key": f[2], "kind": f[3],
                 "default": f[4] if len(f) > 4 else ""})
    return rows, untabled, out.splitlines()


def registered():
    """type -> class, off `reg("type", []{ return std::make_unique<Class>(); })`."""
    text = REG.read_text()
    return dict(re.findall(
        r'reg\(\s*"([A-Za-z0-9]+)"\s*,\s*\[\]\s*\{\s*return\s+std::make_unique<([A-Za-z0-9_]+)>',
        text))


# ---------------------------------------------------------------------------
def arm_a(rows, untabled, reg):
    if untabled:
        fail("a", "registered operation type(s) with no file-traffic row in "
             "src/propertyOps/PropsPlan.cpp: " + ", ".join(untabled))
    for t in reg:
        if t not in rows and t not in untabled:
            fail("a", f"registered type '{t}' is absent from --file-traffic")
    stale = sorted(set(rows) - set(reg))
    if stale:
        fail("a", "file-traffic row(s) for unregistered type(s): " + ", ".join(stale))


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", " ", t)


def arm_b(rows, reg):
    checked = 0
    for t, cls in reg.items():
        writes = {s["key"].split(".")[-1] for s in rows.get(t, []) if s["dir"] == "write"}
        for f in sorted(OPS_DIR.glob(cls + "*.cpp")):
            src = strip_comments(f.read_text())
            for key in re.findall(r'refuseStandardsWrite\(\s*[^,]+,\s*"([^"]+)"', src):
                checked += 1
                leaf = key.split(".")[-1]
                if leaf not in writes:
                    fail("b", f"{f.relative_to(ROOT)} guards a write through key "
                         f"'{key}', which is no write slot of '{t}' in the file-"
                         f"traffic table (its writes: {sorted(writes) or 'none'})")
    return checked


def arm_c(rows, lines):
    import gen_props_file_traffic as gen
    want = gen.render(gen.build(lines))
    if not gen.OUT.exists() or gen.OUT.read_text() != want:
        fail("c", f"{gen.OUT.relative_to(ROOT)} is not the engine's table "
             f"(choupoProps --file-traffic): run bin/curate/gen_props_file_traffic.py")
    for p in sorted(SCHEMAS.glob("*.schema.json")):
        if "writes" in json.loads(p.read_text()).get("x-choupo", {}):
            fail("c", f"{p.relative_to(ROOT)} carries x-choupo.writes: what an op writes "
                 f"has one home, the engine's table, which the GUI reads from "
                 f"{gen.OUT.relative_to(ROOT)}")
    n = 0
    for t, slots in sorted(rows.items()):
        p = SCHEMAS / f"{t}.schema.json"
        if not p.exists():
            continue
        x = json.loads(p.read_text()).get("x-choupo", {})
        n += 1
        reads = {s["key"] for s in slots if s["dir"] == "read" and s["kind"] == "file"}
        for d in x.get("data", []):
            if d.get("kind") == "experiment" and d.get("key") not in reads:
                fail("c", f"{p.relative_to(ROOT)}: x-choupo.data '{d.get('key')}' is "
                     f"a measured file the GUI shows, but no file read of '{t}' in "
                     f"the engine's table (its reads: {sorted(reads)})")
        recs = {d.get("key") for d in x.get("data", []) if d.get("kind") == "record"}
        for s in slots:
            if s["kind"] == "membraneName" and s["key"] not in recs:
                fail("c", f"{p.relative_to(ROOT)}: the engine reads a membrane "
                     f"record by name through '{s['key']}', which x-choupo.data "
                     f"does not declare as a record")
    return n


PROCESS_REFUSAL = "Run the Flowsheet ("


def arm_d(tmp):
    dicts = sorted(ROOT.glob("tutorials/**/system/propsDict"))
    ok = refused = 0
    for i, pd in enumerate(dicts):
        case = pd.parent.parent
        declares = "writtenBy" in re.sub(r"//[^\n]*", "", pd.read_text())
        if declares:
            #  A process-run input is a RUN OUTPUT, present or not depending on
            #  what last ran in this checkout; the claim must not depend on
            #  that, so such a case is planned on a copy without run outputs.
            c = Path(tmp) / f"d{i}_{case.name}"
            shutil.copytree(case, c, ignore=shutil.ignore_patterns(
                "*.csv", "log.*", "converged", "reports", "postProcessing"))
            case = c
        rc, out = run(["--plan", case])
        #  A case's own code/ op is not in the stock binary's table, and is
        #  ANNOUNCED as unchecked -- the honest answer, not a failure.
        if "NOT checked" in out and not (case / "code").is_dir():
            fail("d", f"{case}: an operation is announced as not "
                 f"checked:\n{out[-800:]}")
        if rc == 0:
            ok += 1
            continue
        if declares and PROCESS_REFUSAL in out:
            refused += 1
            continue
        fail("d", f"{case}: --plan exited {rc}:\n{out[-1500:]}")
    return len(dicts), ok, refused


CONTROL = """application choupoProps;
verbosity 2;
"""


def probe(tmp, name, ops_text, flowsheet=False):
    d = Path(tmp) / name
    (d / "system").mkdir(parents=True)
    (d / "system" / "controlDict").write_text(CONTROL)
    (d / "system" / "propsDict").write_text("operations\n(\n" + ops_text + "\n);\n")
    if flowsheet:
        (d / "system" / "flowsheetDict").write_text("units ( );\n")
    return d


def expect_refusal(arm, case, needles, what):
    rc, out = run(["--plan", case])
    if rc == 0:
        fail(arm, f"{what}: --plan exited 0, expected a refusal:\n{out[-800:]}")
        return
    for n in needles:
        if n not in out:
            fail(arm, f"{what}: the refusal does not say {n!r}:\n{out[-1500:]}")


def expect_pass(arm, case, needles, what):
    rc, out = run(["--plan", case])
    if rc != 0:
        fail(arm, f"{what}: --plan exited {rc}, expected a pass:\n{out[-1500:]}")
        return
    for n in needles:
        if n not in out:
            fail(arm, f"{what}: the plan does not say {n!r}:\n{out[-800:]}")


SCAN = """    { name %s; type propertyScan1D; output { file %s; } }"""
CURVE = """    { name %s; type reactionCurve; trajectory %s; manipulated u; measured y; }"""


def arm_e(tmp):
    wrong = probe(tmp, "e1", CURVE % ("identify", "out.csv") + "\n" + SCAN % ("scan", "out.csv"))
    expect_refusal("e", wrong, ["operation [0] 'identify'", "operation [1] 'scan'",
                                "`trajectory`", "`output.file`", "writes LATER",
                                "move 'scan' before 'identify'"], "read of a later write")
    right = probe(tmp, "e2", SCAN % ("scan", "out.csv") + "\n" + CURVE % ("identify", "out.csv"))
    expect_pass("e", right, ["[order] 2 operation(s) in declared order",
                             "no operation reads what a later one writes"], "right order")
    #  the default path: `trajectory` absent reads trajectory.csv
    dflt = probe(tmp, "e3", """    { name identify; type reactionCurve; manipulated u; measured y; }
""" + SCAN % ("scan", "./trajectory.csv"))
    expect_refusal("e", dflt, ["'trajectory.csv'", "move 'scan' before 'identify'"],
                   "the default trajectory path, normalised")
    mem = probe(tmp, "e4", """    { name bench; type poreTransport; membrane NF_fit; }
    { name fit; type fitParameters; output { record "constant/assets/NF_fit.dat"; } }""")
    expect_refusal("e", mem, ["the membrane record 'NF_fit'", "move 'fit' before 'bench'"],
                   "a membrane read by name before its fit (path stem)")
    named = probe(tmp, "e5", """    { name bench; type poreTransport; membrane MyFit; }
    { name fit; type fitParameters; output { record "constant/assets/x.dat"; name MyFit; } }""")
    expect_refusal("e", named, ["the membrane record 'MyFit'"],
                   "a membrane read by name before its fit (output.name)")
    lib = probe(tmp, "e6", """    { name law; type rateLawBench; reaction r; }
    { name scan; type propertyScan1D; output { file constant/reactions; } }""")
    expect_refusal("e", lib, ["(by construction)", "move 'scan' before 'law'"],
                   "a by-construction read of a later write")


def copy_ctrl17(tmp, name):
    d = Path(tmp) / name
    shutil.copytree(CTRL17, d, ignore=shutil.ignore_patterns(
        "*.csv", "log.*", "converged", "reports", "[0-9]*.[0-9]*", "postProcessing"))
    return d


def arm_f(tmp):
    c = copy_ctrl17(tmp, "f1")
    expect_refusal("f", c, ["WRITTEN BY THE PROCESS RUN", "Run the Flowsheet (choupoCtrl) first",
                            "operation [0] 'fopdt_jacket_to_composition'",
                            "operation [1] 'fopdt_jacket_to_temperature'"],
                   "ctrl17 with no trajectory (--plan)")
    rc, out = run([c])
    if rc == 0 or "Run the Flowsheet (choupoCtrl) first" not in out:
        fail("f", f"ctrl17 with no trajectory, full run: exit {rc}, expected the "
             f"process-run refusal:\n{out[-1500:]}")
    if ">>>  Operation [0]" in out:
        fail("f", "ctrl17 with no trajectory, full run: operation [0] STARTED before "
             "the refusal -- the order check must run before the first operation")
    (c / "trajectory.csv").write_text("t,JacketStep.MV,reactor.n_compB,reactor.T\n0,1,1,1\n")
    expect_pass("f", c, ["written by the process run (choupoCtrl) -- present",
                         "2 from the process run"], "ctrl17 with its trajectory present")
    pd = c / "system" / "propsDict"
    base = pd.read_text()
    for sub, needles, what in (
        (("writtenBy   { trajectory process; }", "writtenBy   { output process; }"),
         ["is not a key this operation reads a file through", "trajectory"],
         "writtenBy on a key the op does not read"),
        (("writtenBy   { trajectory process; }", "writtenBy   { trajectory measured; }"),
         ["'measured'", "process"], "writtenBy with a word other than process"),
    ):
        pd.write_text(base.replace(sub[0], sub[1], 1))
        expect_refusal("f", c, needles, what)
    pd.write_text(base)
    (c / "system" / "flowsheetDict").rename(c / "system" / "flowsheetDict.off")
    expect_refusal("f", c, ["has no system/flowsheetDict"], "writtenBy with no process half")
    (c / "system" / "flowsheetDict.off").rename(c / "system" / "flowsheetDict")
    two = probe(tmp, "f2", """    { name scan; type propertyScan1D; output { file trajectory.csv; } }
    { name identify; type reactionCurve; manipulated u; measured y;
      writtenBy { trajectory process; } }""", flowsheet=True)
    expect_refusal("f", two, ["one file, two writers"], "a process-run input a props step also writes")


def main():
    if not PROPS.exists():
        print(f"check_props_order: REFUSED -- {PROPS} not built (make all)")
        return 1
    rows, untabled, lines = file_traffic()
    reg = registered()
    if not reg:
        fail("a", f"no reg(...) lines parsed from {REG.relative_to(ROOT)}")
    arm_a(rows, untabled, reg)
    nb = arm_b(rows, reg)
    nc = arm_c(rows, lines)
    with tempfile.TemporaryDirectory() as tmp:
        nd, ok, refused = arm_d(tmp)
        arm_e(tmp)
        arm_f(tmp)
    if fails:
        print("check_props_order: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print(f"check_props_order: OK -- {len(reg)} registered op types each carry a "
          f"file-traffic row; {nb} guarded writes in their sources match a write slot; "
          f"the GUI's published copy (gui/schemas/propsFileTraffic.json) is the "
          f"engine's table and no op schema keeps its own writes; {nc} op schemas' "
          f"x-choupo data match the table; {nd} corpus "
          f"propsDicts in declared order ({ok} pass; {refused} declaring a process-run "
          f"input refuse, on a copy without run outputs, naming the Flowsheet run); a read of a later write, by "
          f"path, default path, membrane name and by construction, refuses with the "
          f"remedy and the right order passes; ctrl17's absent trajectory refuses "
          f"before operation [0] naming the Flowsheet run, and four writtenBy "
          f"misdeclarations refuse.  NOT checked: that the table lists every key an "
          f"op reads (no single home for reads), computed paths, registry reads "
          f"other than membranes, the package")
    return 0


if __name__ == "__main__":
    sys.exit(main())
