#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_time_state_layout -- the time-integrated classes read and write the
RATIFIED state layout, and write restartable time directories by default
(task #186, 2026-09-30, Vitor's ruling).

    0/<stream>                  ONE file per stream (the canonical grammar)
    0/internalStates/<unit>     ONE file per vessel, a `holdup {}` block
    <t>/                        the SAME layout at every writeInterval

Arms, each measured from files and runs, never from a docstring:

  (a) THE CORPUS: every choupoBatch / choupoCtrl / choupoSemiContinuous case
      under tutorials/ carries NO retired file (0/internalState,
      0/streamFaces); every file under 0/internalStates/ is a holdup record
      of a unit the flowsheet declares, with `equipment` = that unit's type,
      ONE `holdup {}` block and the inventory stated ONCE; on the dynamic
      driver every CONSUMED stream has its 0/<stream> file in the canonical
      grammar and no file in 0/ names a stream the topology does not have.
  (b) THE OLD SHAPE IS REFUSED, fired through the real reader on copies: a
      0/internalState (choupoSemiContinuous AND choupoBatch) and a
      0/streamFaces refuse by name, naming the one-shot migrator; an orphan
      stream file and a missing consumed stream refuse by name.
  (c) THE MIGRATOR is deterministic and the corpus is its output: the
      retired files of unsteady02 (embedded below, verbatim from the tree
      before the migration) migrate to BYTE-IDENTICAL copies of the tracked
      0/ files; a second run reports "already migrated"; a path under
      data/standards/ is refused.
  (d) TIME DIRECTORIES BY DEFAULT: unsteady02 (no solutionControl block)
      and batch01 write every writeInterval a <t>/ in the layout of 0/ --
      each declared stream a file, each vessel a holdup record -- and the
      holdup at t equals the trajectory row at t.
  (e) `solutionControl { write false; }` writes NO <t>/ (trajectory.csv
      still written), and says so.
  (f) RESTARTABLE: a written <t>/ renamed 0/ continues the SAME trajectory
      -- unsteady02 from 200 s and batch01 from 120 s, every column of every
      common row within rtol 1e-6 (the stream files carry 10 significant
      digits; the holdups 17).
  (g) NOT RESTARTABLE IS SAID AND REFUSED: a vessel whose state is more
      than its holdup (dryer01's batchDryer) writes `notRestored` in its
      record, and a restart from that <t>/ REFUSES by name.

NOT CHECKED, said plainly: a restart of a CLOSED LOOP (a controller's memory
is in no record; the run says so at start); a time-dependent recipe or
signal restarted at t (their clocks start at 0 -- a restart by renaming is
exact only for an autonomous case, which (f) uses); the GUI's harvest of the
directories (gui tests hold the parser).

SABOTAGES, by hand, 2026-09-30 (each a source edit + `make all`, restored
from a byte copy and rebuilt), outcomes as MEASURED:
  S1  `if (blk->found("notRestored"))` in InternalStateIO::readHoldups
      made `if (false && ...)` -> FAILED (1): arm (g), "a restart from an
      incomplete record was NOT refused by name (rc 0)" -- the dryer ran.
  S2  InternalStateIO::refuseRetiredDynamicShape made to return at once ->
      FAILED (3), all three retired-file probes of arm (b).  NOT as
      predicted in one respect, and worth knowing: on the dynamic driver the
      two probes were still REFUSED -- by the ORPHAN rule (`0/internalState`
      names no stream) -- but without naming the migrator, which is why the
      arm requires the words and not merely a non-zero exit; on choupoBatch,
      which has no stream contract, the case RAN to exit 0.
  S3  SolutionWriter::timeDirectoryControl defaulting `write` to false (both
      the absent-block and the absent-key default) -> FAILED (1): arm (d),
      "time directories []... != every 20 s", after which (f) and (g) are
      not judged (a first draft of the gate raised a traceback here instead
      of failing by name; it returns now).
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
import migrate_state_layout as mig   # noqa: E402  -- the ONE topology reader

U2 = ROOT / "tutorials/unsteady/unsteady02_tanks_in_series"
B1 = ROOT / "tutorials/batch/reactor/batch01_first_order"
DRY = ROOT / "tutorials/batch/drying/dryer01_sucrose_tray"
TIME_APPS = ("choupoBatch", "choupoCtrl", "choupoSemiContinuous")
DYN_APPS = ("choupoCtrl", "choupoSemiContinuous")
NUM = re.compile(r"^[0-9]+(\.[0-9]+)?$")

bad = []
notes = []

# The retired unsteady02 0/ files, VERBATIM from the tree before the
# migration (commit 5136390d1): the migrator's fixture.
OLD_U2_INTERNALSTATE = '/*--------------------------------*- Choupo -*----------------------------------*\\\n  0/internalState -- DYNAMIC initial holdup.  The tracer impulse is a\n  SUBSTITUTION in tank 1 (total holdup identical in all three tanks, so\n  every tau is exactly 80 s and the Erlang-3 closed forms are exact).\n\\*-----------------------------------------------------------------------------*/\ntime            0;\napplication     ctrl;\n\nunits\n{\n    "tank1"\n    {\n        type        dynamicCSTR;\n        T           330.0;\n        P           101325.0;\n        V           0.001;\n        holdupMolar\n        {\n            compA   0.0038;\n            compB   0.0002;\n        }\n    }\n    "tank2"\n    {\n        type        dynamicCSTR;\n        T           330.0;\n        P           101325.0;\n        V           0.001;\n        holdupMolar\n        {\n            compA   0.004;\n            compB   0.0;\n        }\n    }\n    "tank3"\n    {\n        type        dynamicCSTR;\n        T           330.0;\n        P           101325.0;\n        V           0.001;\n        holdupMolar\n        {\n            compA   0.004;\n            compB   0.0;\n        }\n    }\n}\n'
OLD_U2_STREAMFACES = '/*--------------------------------*- Choupo -*----------------------------------*\\\n  0/streamFaces -- DYNAMIC face state.  tank1.feed is the domain inlet;\n  tank2/tank3 faces are the t = 0 state of the ROUTED inlets (the router\n  overwrites them from the first accepted step on).\n\\*-----------------------------------------------------------------------------*/\ntime            0;\nfaces\n{\n    "tank1.feed"\n    {\n        bc          inlet;\n        T           330.0;\n        P           101325.0;\n        molarFlows\n        {\n            compA   5.0e-05;\n            compB   0.0;\n        }\n    }\n    "tank2.feed"\n    {\n        bc          inlet;\n        T           330.0;\n        P           101325.0;\n        molarFlows\n        {\n            compA   5.0e-05;\n            compB   0.0;\n        }\n    }\n    "tank3.feed"\n    {\n        bc          inlet;\n        T           330.0;\n        P           101325.0;\n        molarFlows\n        {\n            compA   5.0e-05;\n            compB   0.0;\n        }\n    }\n}\n'


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def app_of(case):
    t = strip_comments((case / "system/controlDict").read_text())
    m = re.search(r"(?m)^\s*application\s+(\w+)", t)
    return m.group(1) if m else ""


def copy_case(src, dst):
    def ign(_d, names):
        return [n for n in names
                if (NUM.match(n) and n != "0") or n.endswith(".csv")
                or n in ("latest", "reports", "postProcessing")
                or n.startswith("log.")]
    shutil.copytree(src, dst, ignore=ign, symlinks=True)
    return dst


def run(case, app):
    p = subprocess.run([str(ROOT / app), "."], cwd=case, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def sub(path, old, new):
    t = path.read_text()
    if old not in t:
        raise SystemExit("check_time_state_layout: anchor not found in %s: %r"
                         % (path, old))
    path.write_text(t.replace(old, new, 1))


def time_dirs(case):
    return sorted((d for d in case.iterdir()
                   if d.is_dir() and NUM.match(d.name) and d.name != "0"),
                  key=lambda d: float(d.name))


def trajectory(case):
    lines = (case / "trajectory.csv").read_text().strip().split("\n")
    head = lines[0].split(",")
    rows = {}
    for ln in lines[1:]:
        v = [float(x) for x in ln.split(",")]
        rows[round(v[0], 6)] = v[1:]
    return head[1:], rows


def holdup_of(path):
    t = strip_comments(path.read_text())
    m = re.search(r"holdup\s*\{", t)
    return t, m


# ---------------------------------------------------------------- (a)
def arm_a():
    n_cases = n_holdups = n_streams = 0
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        case = cd.parent.parent
        app = app_of(case)
        if app not in TIME_APPS:
            continue
        n_cases += 1
        rel = case.relative_to(ROOT)
        z = case / "0"
        for old in ("internalState", "streamFaces"):
            if (z / old).exists():
                bad.append("(a) %s: carries the RETIRED 0/%s" % (rel, old))
        units = {u["name"]: u for u in
                 mig.read_units((case / "system/flowsheetDict").read_text())}
        root = z / "internalStates"
        if root.is_dir():
            for f in sorted(root.rglob("*")):
                if not f.is_file():
                    continue
                n_holdups += 1
                t = strip_comments(f.read_text())
                name = f.relative_to(root).as_posix()
                if not re.search(r"(?m)^\s*recordType\s+internalState\s*;", t):
                    bad.append("(a) %s: 0/internalStates/%s has no `recordType"
                               " internalState;`" % (rel, name))
                if name not in units:
                    bad.append("(a) %s: 0/internalStates/%s names no unit of"
                               " the flowsheet" % (rel, name))
                    continue
                m = re.search(r'(?m)^\s*unit\s+"([^"]+)"\s*;', t)
                if not m or m.group(1) != name:
                    bad.append("(a) %s: 0/internalStates/%s declares unit %r"
                               % (rel, name, m.group(1) if m else None))
                m = re.search(r"(?m)^\s*equipment\s+(\w+)\s*;", t)
                if not m or m.group(1) != units[name]["type"]:
                    bad.append("(a) %s: 0/internalStates/%s declares equipment"
                               " %r; the flowsheet says %s"
                               % (rel, name, m.group(1) if m else None,
                                  units[name]["type"]))
                blocks = re.findall(r"(?m)^(\w+)\s*\n?\s*\{", t)
                if blocks != ["holdup"]:
                    bad.append("(a) %s: 0/internalStates/%s top-level blocks %s"
                               " -- a vessel's record is ONE `holdup {}`"
                               % (rel, name, blocks))
                both = "holdupMolar" in t and ("totalMoles" in t
                                               or "molarComposition" in t)
                if both:
                    bad.append("(a) %s: 0/internalStates/%s states the"
                               " inventory twice" % (rel, name))
        if app in DYN_APPS:
            consumed = {w for u in units.values() for w in u["in"]}
            produced = {w for u in units.values() for w in u["out"]}
            for w in sorted(consumed):
                f = z / w
                n_streams += 1
                if not f.is_file():
                    bad.append("(a) %s: consumed stream '%s' has no 0/%s"
                               % (rel, w, w))
                    continue
                t = strip_comments(f.read_text())
                for key in ("componentMolarFlows", "T", "P"):
                    if not re.search(r"(?m)^\s*%s\b" % key, t):
                        bad.append("(a) %s: 0/%s lacks `%s`" % (rel, w, key))
            for f in sorted(z.rglob("*")):
                if not f.is_file():
                    continue
                r = f.relative_to(z)
                if r.parts[0] == "internalStates":
                    continue
                nm = r.as_posix().replace("/", ".")
                if nm not in consumed | produced:
                    bad.append("(a) %s: 0/%s names no stream of the topology"
                               % (rel, r.as_posix()))
    if n_cases < 50:
        bad.append("(a) only %d time-integrated cases found -- the scan root"
                   " collapsed" % n_cases)
    notes.append("(a) %d time-integrated cases: no retired file, %d holdup"
                 " records well-formed, %d consumed streams filed"
                 % (n_cases, n_holdups, n_streams))


# ---------------------------------------------------------------- (b)
def arm_b(tmp):
    def refused(tag, src, app, edit, needles):
        c = copy_case(src, Path(tmp) / ("b_" + tag))
        edit(c)
        rc, out = run(c, app)
        if rc == 0:
            bad.append("(b) %s: the case RAN (exit 0) -- the refusal is gone"
                       % tag)
            return
        miss = [n for n in needles if n not in out]
        if miss:
            bad.append("(b) %s: refused (exit %d) without naming %s:\n    %s"
                       % (tag, rc, miss, out.strip().split("\n")[-1][:300]))
    old = ["RETIRED", "migrate_state_layout.py"]
    refused("semi_internalState", U2, "choupoSemiContinuous",
            lambda c: (c / "0/internalState").write_text(OLD_U2_INTERNALSTATE),
            old + ["0/internalState"])
    refused("semi_streamFaces", U2, "choupoSemiContinuous",
            lambda c: (c / "0/streamFaces").write_text(OLD_U2_STREAMFACES),
            old + ["0/streamFaces"])
    refused("batch_internalState", B1, "choupoBatch",
            lambda c: (c / "0/internalState").write_text(
                'time 0;\nunits { "reactor" { T 350 K; } }\n'),
            old + ["0/internalState"])
    refused("orphan_stream", U2, "choupoSemiContinuous",
            lambda c: shutil.copy(c / "0/feed", c / "0/bogus"),
            ["ORPHAN stream file 0/bogus"])
    refused("missing_stream", U2, "choupoSemiContinuous",
            lambda c: (c / "0/s12").unlink(),
            ["MISSING stream state 0/s12"])
    refused("missing_holdup", U2, "choupoSemiContinuous",
            lambda c: (c / "0/internalStates/tank2").unlink(),
            ["no 0/internalStates/tank2"])
    notes.append("(b) 6 refusals fired through the real reader (both"
                 " drivers)")


# ---------------------------------------------------------------- (c)
def arm_c(tmp):
    c = copy_case(U2, Path(tmp) / "c_mig")
    shutil.rmtree(c / "0")
    (c / "0").mkdir()
    (c / "0/internalState").write_text(OLD_U2_INTERNALSTATE)
    (c / "0/streamFaces").write_text(OLD_U2_STREAMFACES)
    msg = mig.migrate(c)
    if not msg.startswith("migrated"):
        bad.append("(c) the migrator did not migrate: %s" % msg)
        return
    want = sorted(p.relative_to(U2 / "0").as_posix()
                  for p in (U2 / "0").rglob("*") if p.is_file())
    got = sorted(p.relative_to(c / "0").as_posix()
                 for p in (c / "0").rglob("*") if p.is_file())
    if want != got:
        bad.append("(c) migrated file set %s != tracked %s" % (got, want))
    for r in want:
        if r in got and (U2 / "0" / r).read_bytes() != (c / "0" / r).read_bytes():
            bad.append("(c) migrated 0/%s is not byte-identical to the"
                       " tracked file" % r)
    if (U2 / "system/flowsheetDict").read_bytes() != \
            (c / "system/flowsheetDict").read_bytes():
        bad.append("(c) the migrator changed a flowsheetDict that already"
                   " declared its streams")
    again = mig.migrate(c)
    if not again.startswith("already migrated"):
        bad.append("(c) a second run is not idempotent: %s" % again)
    try:
        mig.migrate(ROOT / "data/standards/nowhere")
        bad.append("(c) a path under data/standards/ was NOT refused")
    except mig.Refused as e:
        if "data/standards" not in str(e):
            bad.append("(c) data/standards refusal does not say so: %s" % e)
    notes.append("(c) migrator: %d files byte-identical to the tracked 0/,"
                 " idempotent, data/standards/ refused" % len(want))


# ---------------------------------------------------------------- (d)(e)(f)(g)
def expect_grid(case, step, end):
    got = [float(d.name) for d in time_dirs(case)]
    want = [step * k for k in range(1, int(round(end / step)) + 1)]
    return got == want, got[:4], want[:4]


def check_dir(tag, d, streams, units, bad_list):
    for s in streams:
        f = d / s
        if not f.is_file() or "componentMolarFlows" not in f.read_text():
            bad_list.append("(d) %s: %s/%s missing or not a stream file"
                            % (tag, d.name, s))
    for u in units:
        f = d / "internalStates" / u
        if not f.is_file():
            bad_list.append("(d) %s: %s/internalStates/%s missing"
                            % (tag, d.name, u))
            continue
        t, m = holdup_of(f)
        if not m or "recordType" not in t:
            bad_list.append("(d) %s: %s/internalStates/%s is not a holdup"
                            " record" % (tag, d.name, u))


def value_in(text, key):
    m = re.search(r"(?m)^\s*%s\s+([-0-9.eE+]+)" % re.escape(key), text)
    return float(m.group(1)) if m else None


def restart(tmp, tag, src_run, t0, app, end_key_val):
    c = copy_case(src_run, Path(tmp) / ("f_" + tag))
    shutil.rmtree(c / "0")
    shutil.copytree(src_run / t0, c / "0")
    sub(c / "system/controlDict", end_key_val[0], end_key_val[1])
    rc, out = run(c, app)
    return c, rc, out


def arms_defg(tmp):
    # ---- (d) unsteady02: default ON, the layout of 0/ at every 20 s
    u2 = copy_case(U2, Path(tmp) / "d_u2")
    if "solutionControl" in (u2 / "system/controlDict").read_text():
        bad.append("(d) the unsteady02 witness declares a solutionControl"
                   " block -- it can no longer witness the DEFAULT")
    rc, out = run(u2, "choupoSemiContinuous")
    if rc != 0:
        bad.append("(d) unsteady02 failed to run:\n%s" % out[-400:])
        return
    ok, got, want = expect_grid(u2, 20.0, 1600.0)
    if not ok:
        bad.append("(d) unsteady02 time directories %s... != every 20 s %s..."
                   " -- (d), (f) and (g) cannot be judged without them"
                   % (got, want))
        return
    for d in time_dirs(u2):
        check_dir("unsteady02", d, ["feed", "s12", "s23", "product"],
                  ["tank1", "tank2", "tank3"], bad)
    head, rows = trajectory(u2)
    t200 = (u2 / "200/internalStates/tank3").read_text()
    col = head.index("tank3.n_compB")
    held = value_in(t200, "compB")
    if held is None or abs(held - rows[200.0][col]) > 1e-8 * max(abs(held), 1e-12) + 1e-17:
        bad.append("(d) 200/internalStates/tank3 compB %s != trajectory %s"
                   % (held, rows[200.0][col]))
    if "notRestored" in t200:
        bad.append("(d) a dynamicCSTR record claims it is NOT restartable")

    b1 = copy_case(B1, Path(tmp) / "d_b1")
    rc, out = run(b1, "choupoBatch")
    if rc != 0:
        bad.append("(d) batch01 failed to run:\n%s" % out[-400:])
        return
    ok, got, want = expect_grid(b1, 30.0, 600.0)
    if not ok:
        bad.append("(d) batch01 time directories %s... != every 30 s %s..."
                   % (got, want))
    for d in time_dirs(b1):
        check_dir("batch01", d, [], ["reactor"], bad)
    notes.append("(d) default ON: unsteady02 80 and batch01 20 time"
                 " directories in the layout of 0/")

    # ---- (e) write false
    e = copy_case(U2, Path(tmp) / "e_u2")
    with open(e / "system/controlDict", "a") as f:
        f.write("\nsolutionControl { write false; }\n")
    rc, out = run(e, "choupoSemiContinuous")
    if rc != 0 or time_dirs(e) or not (e / "trajectory.csv").exists() \
            or "write false" not in out:
        bad.append("(e) `write false;` did not turn the time directories off"
                   " (rc %d, %d dirs)" % (rc, len(time_dirs(e))))
    else:
        notes.append("(e) `write false;` writes no <t>/ and says so")

    # ---- (f) restartable
    for tag, src, t0, app, endkv, tend in (
            ("unsteady02", u2, "200", "choupoSemiContinuous",
             ("endTime         1600;", "endTime         1400;"), 1400.0),
            ("batch01", b1, "120", "choupoBatch",
             ("endTime         600;", "endTime         480;"), 480.0)):
        c, rc, out = restart(tmp, tag, src, t0, app, endkv)
        if rc != 0:
            bad.append("(f) %s restarted from %s/ failed:\n%s"
                       % (tag, t0, out[-400:]))
            continue
        h0, r0 = trajectory(src)
        h1, r1 = trajectory(c)
        worst = 0.0
        n = 0
        for t, v1 in r1.items():
            v0 = r0.get(round(t + float(t0), 6))
            if v0 is None:
                continue
            n += 1
            for a, b in zip(v0, v1):
                d = abs(a - b) / max(abs(a), abs(b), 1e-9)
                worst = max(worst, d)
        if n < 10 or worst > 1e-6:
            bad.append("(f) %s restarted from %s/: %d common rows, worst"
                       " relative gap %.3g (want <= 1e-6)"
                       % (tag, t0, n, worst))
        else:
            notes.append("(f) %s restarted from %s/: %d rows, worst gap %.2g"
                         % (tag, t0, n, worst))

    # ---- (g) not restartable: said, and refused
    g = copy_case(DRY, Path(tmp) / "g_dry")
    sub(g / "system/controlDict", "endTime         3000;",
        "endTime         200;")
    rc, out = run(g, "choupoBatch")
    if rc != 0 or not (g / "100").is_dir():
        bad.append("(g) dryer01 (200 s) did not run / write 100/ (rc %d)" % rc)
        return
    rec = (g / "100/internalStates/dryer").read_text()
    if "notRestored" not in rec:
        bad.append("(g) the batchDryer record does not say it is incomplete")
    c = copy_case(g, Path(tmp) / "g_restart")
    shutil.rmtree(c / "0")
    shutil.copytree(g / "100", c / "0")
    rc, out = run(c, "choupoBatch")
    if rc == 0 or "MORE than its" not in out:
        bad.append("(g) a restart from an incomplete record was NOT refused"
                   " by name (rc %d)" % rc)
    else:
        notes.append("(g) batchDryer: `notRestored` written, restart refused")


def main():
    for b in ("choupoBatch", "choupoSemiContinuous"):
        if not (ROOT / b).exists():
            print("check_time_state_layout: FAILED -- no native %s; run"
                  " `make all`" % b)
            return 1
    arm_a()
    with tempfile.TemporaryDirectory(prefix="choupo-tsl-") as tmp:
        arm_b(tmp)
        arm_c(tmp)
        arms_defg(tmp)
    if bad:
        print("check_time_state_layout: FAILED (%d)" % len(bad))
        for b in bad:
            print("  " + b)
        return 1
    print("check_time_state_layout: OK -- the time-integrated cases read and"
          " write the ratified layout (0/<stream>, 0/internalStates/<unit>),"
          " refuse the retired one, and write restartable <t>/ directories by"
          " default (not checked: a closed-loop or clock-driven restart)")
    for n in notes:
        print("  " + n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
