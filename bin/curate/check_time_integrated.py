#!/usr/bin/env python3
"""Gate: the time-integrated binaries do not hide an ill-posed case behind
exit 0.   bin/curate/check_time_integrated.py

WHY THIS EXISTS (review 2026-11-12, rows TI-01..TI-03 of docs/reviews/LEDGER.tsv).
The three findings were all silent: a trajectory.csv whose rows were wider than
its header, a closed loop whose circulating flow drifted with the time step,
and a `recipe` block accepted and never acted on.  Each arm below BUILDS its
probe from a shipped case in a temp directory, RUNS the engine and judges the
outcome; nothing is read from a stored result.

  (a) TI-01  TRAJECTORY SHAPE.  edbatch03 with the concentrate primed WITHOUT
      K and SO4 (ions the diluate carries).  Every row of trajectory.csv must
      have exactly the header's number of fields; the m_conc_K and m_conc_SO4
      columns must exist from the first row, be 0 there, and be > 0 at the end
      (the transfer put them in).  The runTests per-case arm (1b) holds the same
      shape on every shipped time-integrated case.

  (b) TI-02  AN UNDETERMINED LOOP FLOW IS REFUSED BEFORE INTEGRATING.
      unsteady03 with its mixer and splitter removed is a closed loop
      TANK -> NF -> TANK in which the permeate LEAVES: no feed, no unit that
      sets the flow (the vessel passes F_out = F_in), so the circulating flow
      would shrink at every step and the answer depend on the time step.  It
      must exit non-zero and the message must name the loop's units and
      streams.  The POSITIVES must still run: unsteady03 and unsteady04 (a
      feed-and-bleed loop: the flow is the balance of feed and splits) and
      unsteady05 (a dynamicTank with an outflow law), each cut to a few steps.

  (c) TI-03  A `recipe` THIS BINARY CANNOT ACT ON IS REFUSED BY NAME.
      unsteady05 and ctrl01 with a `recipe` block appended must exit non-zero,
      naming `recipe`, choupoBatch (the binary that acts on it) and the
      `Schedule` controller (the timed-change grammar of choupoCtrl).
"""
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc"
BATCH = BIN / "choupoBatch"
SEMI = BIN / "choupoSemiContinuous"
CTRL = BIN / "choupoCtrl"
ED3 = ROOT / "tutorials" / "batch" / "electrodialysis" / "edbatch03_multiionic_split"


def make_case(tmp, name, src):
    case = Path(tmp) / name

    def ignore(_d, names):
        out = []
        for nm in names:
            if nm.startswith("log.choupo") or nm in ("reports", "latest", "expected"):
                out.append(nm)
            elif nm.endswith(".csv") or nm.endswith(".meta"):
                out.append(nm)
            elif nm != "0" and nm.replace(".", "", 1).isdigit():
                out.append(nm)
        return out

    shutil.copytree(src, case, ignore=ignore)
    return case


def run(binary, case):
    import os
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                       cwd=ROOT, env=env)
    return r, r.stdout + r.stderr


def arm_a(tmp, bad):
    case = make_case(tmp, "ti01", ED3)
    rig = case / "0" / "internalStates" / "rig"
    s = rig.read_text()
    i = s.index("concentrate")
    s = s[:i] + """concentrate
    {
        totalMoles   0.2819168672;
        molarComposition
        {
            water    0.991132137552;
            Na       0.004433931224;
            K        0;
            Cl       0.004433931224;
            SO4      0;
        }
    }
}
"""
    rig.write_text(s)
    r, out = run(BATCH, case)
    if r.returncode != 0:
        bad.append(f"(a) the TI-01 fixture did not run: exit {r.returncode}")
        return None
    rows = list(csv.reader(open(case / "trajectory.csv")))
    h = rows[0]
    wrong = [n + 1 for n, row in enumerate(rows) if len(row) != len(h)]
    if wrong:
        bad.append(f"(a) trajectory.csv misaligned: header {len(h)} fields, rows"
                   f" {wrong[:5]} differ")
    for ion in ("K", "SO4"):
        name = f"rig.m_conc_{ion}"
        if name not in h:
            bad.append(f"(a) column {name} missing from the header")
            continue
        k = h.index(name)
        first, last = float(rows[1][k]), float(rows[-1][k])
        if first != 0.0 or not last > 0.0:
            bad.append(f"(a) {name}: first row {first} (want 0), last {last} (want > 0)")
    return len(h)


def set_control(case, **kv):
    import re
    p = case / "system" / "controlDict"
    t = p.read_text()
    for k, v in kv.items():
        t = re.sub(r"(?m)^" + k + r"\s+[^;]*;", k + " " + str(v) + ";", t)
    p.write_text(t)


def drop_unit(body, name):
    k = body.index("name        " + name + ";")
    a = body.rfind("    {", 0, k)
    d, j = 0, a
    while True:
        if body[j] == "{":
            d += 1
        if body[j] == "}":
            d -= 1
            if d == 0:
                break
        j += 1
    return body[:a] + body[j + 1:]


def arm_b(tmp, bad):
    uns = ROOT / "tutorials" / "unsteady"
    case = make_case(tmp, "ti02", uns / "unsteady03_nf_feed_and_bleed_startup")
    fs = case / "system" / "flowsheetDict"
    s = fs.read_text()
    i = s.index("units\n(")
    body = drop_unit(drop_unit(s[i:], "MIX"), "SPLIT")
    body = body.replace("in          ToTank;", "in          Retentate;")
    fs.write_text(s[:i] + body)
    for f in ("Recycle", "Feed", "ToTank"):
        (case / "0" / f).unlink()
    set_control(case, endTime=100, deltaT=5)
    r, out = run(SEMI, case)
    if r.returncode == 0:
        bad.append("(b) the closed loop with a leak and no flow-setting unit RAN (exit 0)")
    else:
        for w in ("NO unit that sets its circulating flow", "TANK", "NF",
                  "Retentate", "ModuleIn", "Permeate"):
            if w not in out:
                bad.append("(b) the refusal does not name '" + w + "'")
    ok = []
    for nm in ("unsteady03_nf_feed_and_bleed_startup",
               "unsteady04_uf_feed_and_bleed_startup",
               "unsteady05_tank_valve_drain"):
        c = make_case(tmp, "pos_" + nm, uns / nm)
        set_control(c, endTime=100, deltaT=5)
        r, out = run(SEMI, c)
        if r.returncode != 0 or "circulating flow" in out:
            bad.append("(b) the well-posed " + nm + " was refused or failed: exit "
                       + str(r.returncode))
        else:
            ok.append(nm.split("_")[0])
    return ok


RECIPE = """
recipe
(
    { time 100 s; action setParameter; unit TANK; parameter opening; value 0.5; }
);
"""


def arm_c(tmp, bad):
    for tag, binary, src in (
            ("semi", SEMI, ROOT / "tutorials" / "unsteady" / "unsteady05_tank_valve_drain"),
            ("ctrl", CTRL, ROOT / "tutorials" / "ctrl" / "ctrl01_cstr_temp_control")):
        c = make_case(tmp, "ti03_" + tag, src)
        fs = c / "system" / "flowsheetDict"
        fs.write_text(fs.read_text() + RECIPE)
        r, out = run(binary, c)
        if r.returncode == 0:
            bad.append("(c) " + tag + ": a `recipe` block ran at exit 0")
        else:
            for w in ("recipe", "choupoBatch", "Schedule"):
                if w not in out:
                    bad.append("(c) " + tag + ": the refusal does not name '" + w + "'")


def main():
    for b in (BATCH, SEMI, CTRL):
        if not b.exists():
            print(f"check_time_integrated: no binary {b} -- run `make all`")
            return 2
    bad = []
    notes = []
    with tempfile.TemporaryDirectory() as tmp:
        w = arm_a(tmp, bad)
        if w:
            notes.append(f"TI-01 fixture: {w}-field header held on every row")
        ok = arm_b(tmp, bad)
        notes.append("TI-02: the closed leaking loop is refused; " + ", ".join(ok)
                     + " still run")
        arm_c(tmp, bad)
        notes.append("TI-03: a `recipe` is refused by name under choupoSemiContinuous"
                     " and choupoCtrl")
    if bad:
        print("check_time_integrated: FAILED")
        for b in bad:
            print("  - " + b)
        return 1
    print("check_time_integrated: OK -- " + "; ".join(notes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
