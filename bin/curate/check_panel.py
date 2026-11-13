#!/usr/bin/env python3
"""Gate: an operator panel is DECLARED by the case, READ by the engine after the
time loop, and the engine reports FACTS about it -- never a grade.

    bin/curate/check_panel.py
    bin/curate/check_panel.py --keep DIR     keep the runs in DIR

WHY THIS EXISTS (2026-11-12, DEV.md 4c C371 slice S1; record
docs/design/operator-panel-in-the-case.md).  `system/panelDict` names
quantities a run publishes (the columns of trajectory.csv), the scales and
limits a person would read them against, the alarms and messages that would
call them, and the reason each element is on the panel.  The engine opens it
only after the integration has ended, from a read-only copy of the published
series, refuses what is not a panel and reports facts about what is.  Each arm
names the risk it holds:

  (a) THE PANEL CANNOT MOVE THE PHYSICS.  The witness
      (tutorials/batch/electrodialysis/edbatch01_constant_current) is run with
      and without its panelDict: trajectory.csv, every written instant and
      every other file, the result JSON minus its `panel` block, and the log
      minus its `[panel]` lines are byte-identical.
  (b) ABSENCE IS SILENCE.  Without a panelDict the JSON has no `panel` key and
      the log prints no `[panel]` line.
  (c) EVERY REFUSAL, fired through the real reader on a copy of the witness and
      each required to exit 2 and NAME its defect: an unknown unit, an unknown
      controller, a misspelled key (with the suggestion), an unknown display
      kind, an element with no reason, a limit with no source / no reason /
      neither end, an alarm with no limit / no action, a delay with no unit,
      a bar with no range, a placement outside the grid / on a held cell / with
      no grid, a duplicate name, a message naming no element, an empty panel,
      a lock with no reason, a `reference` on a lamp.
  (d) EVERY FACT, on a fixture built to trigger it, and RECOMPUTED HERE from
      trajectory.csv (an independent reader of the same file): notPublished,
      constant, outOfRange, limitOutsideRange, violated (k of n, first, last),
      neverViolated, alwaysViolated, neverApproached (closest approach over 0.5
      of the range), controllerWithoutElement, sameQuantityAlarms, alarmsActive
      (with a delay applied on the write grid; its maximum and first instant,
      the first instant ANY alarm is active, how many written instants carry
      one and those periods as intervals), a message that fires and one
      that never does; the limit-violation periods (`limitIntervals`) of every
      element with a limit, alarm or not, apart from the alarm's `intervals`;
      the `sameQuantityAlarms` id naming an element; the alarmsActive and
      violated log lines not reading the maximum's instant as a start; and
      the panel reaches all three surfaces: the `[panel]`
      log lines, the `panel` JSON block, and the golden `panel` kind (the
      witness's `expected` carries its rows).
  (e) THE OTHER BINARIES REFUSE the file by name: choupoSolve, choupoProps,
      choupoCtrl, choupoSemiContinuous.

NOT CHECKED, and said: that a panel is GOOD (no engine can grade that, which is
the design); alarm-management practice (no standard is held, the record writes
it as good practice from reasoning); the 0.5 threshold of `neverApproached`
(a default of the record); the dimension of a limit against its column (no
trajectory column declares one); `draftDiffers` (needs the draft tool, slice
S3); the GUI drawing (slice S2); a crossing between two written instants (the
facts are resolved to the write grid, by design); and the byte-identity of
OTHER cases without a panel against an earlier build (measured once in the
slice's own report, not gated).
"""
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "choupoBatch"
WITNESS = ROOT / "tutorials/batch/electrodialysis/edbatch01_constant_current"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}

fails = []
claims = []


def fail(msg):
    fails.append(msg)


def run(binary, case, timeout=900):
    p = subprocess.run([str(ROOT / binary), str(case)], capture_output=True,
                       text=True, cwd=str(ROOT), timeout=timeout, env=ENV)
    return p.stdout, p.stderr, p.returncode


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def make_case(work, name, panel=None, endTime=None, flowsheet_extra=None):
    """A clean copy of the witness (inputs only) with the given panelDict."""
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    for sub in ("0", "constant", "system"):
        shutil.copytree(WITNESS / sub, d / sub)
    shutil.copy(WITNESS / "edbatch01_constant_current.cho", d / "case.cho")
    pd = d / "system" / "panelDict"
    if pd.exists():
        pd.unlink()
    if panel is not None:
        pd.write_text(panel)
    if endTime is not None:
        cd = d / "system" / "controlDict"
        cd.write_text(re.sub(r"^endTime\s+[^;]*;", f"endTime {endTime};",
                             cd.read_text(), flags=re.M))
    if flowsheet_extra:
        fs = d / "system" / "flowsheetDict"
        fs.write_text(fs.read_text() + "\n" + flowsheet_extra)
    return d


def strip_panel_text(out):
    """Log text without its [panel] lines, JSON without its panel block."""
    lines = [l for l in out.splitlines() if not l.startswith("[panel]")]
    text = "\n".join(lines)
    m = re.search(r"(<<<Choupo:result-begin>>>\s*\n)(.*?)(\n<<<Choupo:result-end>>>)",
                  text, re.S)
    if m:
        try:
            js = json.loads(m.group(2))
            js.pop("panel", None)
            text = text[:m.start(2)] + json.dumps(js, sort_keys=True) + text[m.end(2):]
        except json.JSONDecodeError:
            pass
    return text.replace("\r", "")


def normalise(out, d):
    return strip_panel_text(out).replace(str(d), "<CASE>")


def tree_files(d):
    skip = {"system/panelDict"}
    out = {}
    for p in sorted(d.rglob("*")):
        if p.is_file():
            rel = str(p.relative_to(d))
            if rel in skip:
                continue
            data = p.read_bytes()
            if p.name == "solution.log":      # one wall-clock stamp per instant
                data = re.sub(rb"\d{4}-\d{2}-\d{2}T[0-9:]{8}", b"<TIME>", data)
            out[rel] = data
    return out


# ---------------------------------------------------------------------------
# the witness's own panel text, as the fixtures' base
# ---------------------------------------------------------------------------
WITNESS_PANEL = (WITNESS / "system" / "panelDict").read_text()

BASE = """
elements
(
    {
        name        ok;
        kind        trend;
        measurement { unit rig;  cv U_V; }
        range       { min 0;  max 10; }
        reason      "base";
    }
);
"""


def panel(elements, messages="", head=""):
    return (head + "\nelements\n(\n" + elements + "\n);\n"
            + (("messages\n(\n" + messages + "\n);\n") if messages else ""))


def el(name="ok", kind="trend", meas="{ unit rig;  cv U_V; }", extra="",
       reason='reason "x";', rng="range { min 0; max 10; }"):
    s = "    {\n        name " + name + ";\n"
    if kind is not None:
        s += "        kind " + kind + ";\n"
    if meas is not None:
        s += "        measurement " + meas + "\n"
    if rng:
        s += "        " + rng + "\n"
    s += extra + "\n"
    if reason:
        s += "        " + reason + "\n"
    return s + "    }\n"


LIM = 'limit { high 5; source "s"; reason "r"; }'


# ---------------------------------------------------------------------------
# (a)(b) the panel cannot move the physics; absence is silent
# ---------------------------------------------------------------------------
def arm_identity(work):
    wd = make_case(work, "withPanel", panel=WITNESS_PANEL)
    nd = make_case(work / "bare", "withPanel")           # same name, other parent
    # same case name in two parents so the printed paths differ only by prefix
    w_out, w_err, w_rc = run("choupoBatch", wd)
    n_out, n_err, n_rc = run("choupoBatch", nd)
    if w_rc != 0 or n_rc != 0:
        fail(f"(a) the witness run exited {w_rc} with and {n_rc} without its panel:"
             f" {(w_err or n_err)[-300:]}")
        return None
    if normalise(w_out, wd) != normalise(n_out, nd):
        a = normalise(w_out, wd).splitlines()
        b = normalise(n_out, nd).splitlines()
        first = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
        fail("(a) the log (minus [panel] lines) or the result JSON (minus the panel"
             f" block) differs with and without the panel; first difference at line {first}:"
             f" {a[first] if first < len(a) else '<end>'!r} against"
             f" {b[first] if first < len(b) else '<end>'!r}")
    fa, fb = tree_files(wd), tree_files(nd)
    if set(fa) != set(fb):
        fail(f"(a) the files written differ: {sorted(set(fa) ^ set(fb))[:5]}")
    else:
        for k in fa:
            if fa[k] != fb[k]:
                fail(f"(a) file {k} differs with and without the panel")
                break
    # (b) absence
    if '"panel"' in n_out or "[panel]" in n_out + n_err:
        fail("(b) a case without a panelDict published a panel block or a [panel] line")
    jn = result_json(n_out)
    if jn is None or "panel" in jn:
        fail("(b) the bare run's JSON is missing or carries a `panel` key")
    # the witness's panel reaches all three surfaces
    jw = result_json(w_out)
    if jw is None or "panel" not in jw:
        fail("(d) the witness run published no `panel` block")
    if "[panel]" not in w_out:
        fail("(d) the witness run printed no [panel] line")
    claims.append("(a) the witness with and without its panelDict: trajectory.csv, every"
                  " written file, the log minus [panel] lines and the JSON minus its"
                  " panel block are byte-identical; (b) a case without one prints and"
                  " publishes nothing of a panel")
    return wd, w_out, jw


# ---------------------------------------------------------------------------
# (c) refusals
# ---------------------------------------------------------------------------
REFUSALS = [
    ("unknown unit", panel(el(meas="{ unit rg;  cv U_V; }")), "unit `rg` is not a unit"),
    ("unknown controller", panel(el(meas="{ controller PIC1;  cv PV; }")),
     "controller `PIC1` is not declared"),
    ("misspelt key", panel(el().replace("measurement", "mesurement")),
     "unknown key `mesurement`"),
    ("key suggestion", panel(el().replace("measurement", "mesurement")),
     "did you mean `measurement`"),
    ("unknown kind", panel(el(kind="gauge")), "`kind gauge` is not a display kind"),
    ("no reason", panel(el(reason="")), "has no `reason`"),
    ("limit without source",
     panel(el(extra='        limit { high 5; reason "r"; }')),
     "`limit` has no `source`"),
    ("limit without reason",
     panel(el(extra='        limit { high 5; source "s"; }')),
     "`limit` has no `reason`"),
    ("limit with neither end",
     panel(el(extra='        limit { source "s"; reason "r"; }')),
     "has neither `low` nor `high`"),
    ("alarm without limit",
     panel(el(extra='        alarm { on high; action "a"; }')),
     "an alarm needs a `limit"),
    ("alarm without action",
     panel(el(extra="        " + LIM + "\n        alarm { on high; }")),
     "`alarm` has no `action`"),
    ("delay without unit",
     panel(el(extra="        " + LIM + '\n        alarm { on high; delay 5; action "a"; }')),
     "carries its unit"),
    ("bar without range", panel(el(kind="bar", rng="")), "is drawn on a scale"),
    ("place outside the grid",
     panel(el(extra="        place { column 12; row 1; width 3; height 1; }"),
           head="grid { columns 12; rows 8; }"),
     "placed outside the grid"),
    ("place on a held cell",
     panel(el(name="a", extra="        place { column 1; row 1; width 2; height 2; }")
           + el(name="b", extra="        place { column 2; row 2; width 2; height 2; }"),
           head="grid { columns 12; rows 8; }"),
     "both stand on grid cell"),
    ("place without a grid",
     panel(el(extra="        place { column 1; row 1; width 2; height 2; }")),
     "declares no `grid"),
    ("duplicate name", panel(el(name="a") + el(name="a")), "two elements are named `a`"),
    ("message from nothing",
     panel(el(), messages='    { name m; from nothing; on high; text "t"; }'),
     "names no element of this panel"),
    ("empty panel", "grid { columns 4; rows 2; }\n", "declares no `elements"),
    ("lock without reason",
     panel(el(), head='lock { by "me"; date "2026-11-12"; }'),
     "`lock` has no `reason`"),
    ("reference on a lamp",
     panel(el(kind="lamp", extra="        reference { unit rig; cv U_V; }")),
     "belongs to a `trend`"),
]


def arm_refusals(work):
    n = 0
    for label, text, needle in REFUSALS:
        d = make_case(work, "ref", panel=text, endTime=100)
        out, err, rc = run("choupoBatch", d)
        blob = out + err
        if rc != 2:
            fail(f"(c) refusal `{label}`: exit {rc}, expected 2")
        elif "panelDict" not in blob or needle not in blob:
            fail(f"(c) refusal `{label}`: the message does not name the defect"
                 f" (needle {needle!r}): {blob.strip()[-300:]!r}")
        else:
            n += 1
    claims.append(f"(c) {n} refusals fired through the real reader, each exit 2 and"
                  " naming its defect")


# ---------------------------------------------------------------------------
# (d) facts, recomputed from trajectory.csv
# ---------------------------------------------------------------------------
def read_series(d):
    rows = list(csv.reader((d / "trajectory.csv").open()))
    head, data = rows[0], rows[1:]
    cols = {h: [float(r[i]) for r in data] for i, h in enumerate(head)}
    return cols


def records(js, key):
    out = {}
    for r in js["panel"][key]:
        out[r["id"]] = r
    return out


def approx(a, b, tol=1e-9):
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


FACT_ELEMENTS = """
    { name notPub;   kind trend; measurement { unit rig; cv noSuchColumn; }
      reason "a column the run does not publish"; }
    { name tempConst; kind number; measurement { unit rig; cv T; }
      range { min 273.15 K; max 333.15 K; }
      limit { high 330; source "fixture"; reason "far from the run"; }
      reason "constant, never violated, never approached"; }
    { name voltRange; kind trend; measurement { unit rig; cv U_V; }
      range { min 0; max 5; }
      limit { high 20; source "fixture"; reason "outside its own scale"; }
      reason "the scale hides the run; the limit is off the scale"; }
    { name lamp; kind lamp; measurement { unit rig; cv i_over_ilim; }
      range { min 0; max 2.5; }
      limit { high 1; source "fixture"; reason "regime boundary"; }
      alarm { on high; delay 0 s; action "act"; }
      reason "violated at k of n instants"; }
    { name lampDelayed; kind bar; measurement { unit rig; cv i_over_ilim; }
      range { min 0; max 2.5; }
      limit { high 1; source "fixture"; reason "regime boundary"; }
      alarm { on high; delay 100 s; action "act later"; }
      reason "an alarm with a delay on the write grid"; }
    { name lampLate; kind bar; measurement { unit rig; cv i_over_ilim; }
      range { min 0; max 2.5; }
      limit { high 1; source "fixture"; reason "regime boundary"; }
      alarm { on high; delay 500 s; action "act much later"; }
      reason "a delay longer than the excursion: never active"; }
    { name alwaysLow; kind number; measurement { unit rig; cv T; }
      range { min 273.15 K; max 500; }
      limit { low 400; source "fixture"; reason "above the run"; }
      reason "violated at every instant"; }
"""
FACT_MESSAGES = """
    { name fires;  from lamp;      on high; text "fires"; }
    { name never;  from tempConst; on high; text "never fires"; }
    { name theEnd; on end;                  text "end"; }
"""

CONTROLLER = """
controllers
(
    {
        name        C1;
        type        PID;
        measurement { unit rig; cv T; }
    }
);
"""


def arm_facts(work):
    fixture = panel(FACT_ELEMENTS, FACT_MESSAGES)
    d = make_case(work, "facts", panel=fixture, flowsheet_extra=CONTROLLER)
    out, err, rc = run("choupoBatch", d)
    if rc != 0:
        fail(f"(d) the fact fixture run exited {rc}: {(err or out)[-400:]}")
        return
    js = result_json(out)
    if js is None or "panel" not in js:
        fail("(d) the fact fixture published no panel block")
        return
    S = read_series(d)
    t = S["t"]
    n = len(t)
    E, F, M, SUM = (records(js, "elements"), records(js, "facts"),
                    records(js, "messages"), js["panel"]["summary"][0])
    ids = set(F)
    ok = 0

    def need(cond, msg):
        nonlocal ok
        if cond:
            ok += 1
        else:
            fail("(d) " + msg)

    # notPublished
    need("notPublished:notPub" in ids, "a column the run does not publish gave no"
         " `notPublished` fact")
    need(E["element:notPub"]["published"] == 0, "notPub is marked published")
    # constant (T)
    T = S["rig.T"]
    need("constant:tempConst" in ids and approx(F["constant:tempConst"]["value"], T[0]),
         "the constant temperature was not reported as constant at its value")
    need("constant:voltRange" not in ids, "a moving series was reported constant")
    # neverViolated + neverApproached on tempConst: d = 330 - max(T)
    d_ = 330.0 - max(T)
    frac = d_ / (333.15 - 273.15)
    need("neverViolated:tempConst" in ids
         and approx(F["neverViolated:tempConst"]["closestApproach"], d_),
         "the closest approach of a never-violated limit is not recomputed")
    need(frac > 0.5 and "neverApproached:tempConst" in ids
         and approx(F["neverApproached:tempConst"]["closestApproachFraction"], frac),
         "a limit the run never came within half a range of gave no `neverApproached`")
    need("neverApproached:lamp" not in ids, "`neverApproached` fired on a violated limit")
    # outOfRange + limitOutsideRange on voltRange (range max 5, U up to ~9)
    U = S["rig.U_V"]
    cnt = sum(1 for v in U if v < 0 or v > 5)
    need("outOfRange:voltRange" in ids and F["outOfRange:voltRange"]["count"] == cnt,
         f"outOfRange count is not {cnt}")
    need("limitOutsideRange:voltRange" in ids, "a limit off its own scale gave no"
         " `limitOutsideRange`")
    # violated on lamp: k of n, first, last
    r = S["rig.i_over_ilim"]
    viol = [k for k, v in enumerate(r) if v > 1]
    need(0 < len(viol) < n and "violated:lamp" in ids
         and F["violated:lamp"]["violated"] == len(viol)
         and F["violated:lamp"]["n"] == n
         and approx(F["violated:lamp"]["first"], t[viol[0]])
         and approx(F["violated:lamp"]["last"], t[viol[-1]]),
         "violated k, n, first or last are not recomputed from trajectory.csv")
    # alwaysViolated: T < 400 at every instant
    need("alwaysViolated:alwaysLow" in ids
         and F["alwaysViolated:alwaysLow"]["violated"] == n,
         "`alwaysViolated` was not reported")
    # sameQuantityAlarms on rig.i_over_ilim: lamp, lampDelayed, lampLate.
    # (note 3, 2026-11-13) the id names an ELEMENT, like every other fact --
    # the first in declaration order -- and the column rides as a word.
    SQ = F.get("sameQuantityAlarms:lamp", {})
    need(SQ.get("count") == 3 and SQ.get("column") == "rig.i_over_ilim"
         and SQ.get("elements") == "lamp lampDelayed lampLate",
         "three alarms on one column were not reported as"
         " `sameQuantityAlarms:lamp` (the first element) with the column and"
         f" the elements as words: {SQ or sorted(i for i in ids if i.startswith('sameQ'))}")
    need(all(i.split(":", 1)[1] in {e.split(":", 1)[1] for e in E}
             for i in ids if ":" in i
             and not i.startswith(("notPublished:", "controllerWithoutElement:"))),
         "a fact id (other than notPublished:<e>:reference and"
         " controllerWithoutElement:<controller>) carries something other than"
         " an element name after the colon:"
         f" {sorted(i for i in ids if ':' in i and not i.startswith(('notPublished:', 'controllerWithoutElement:')) and i.split(':', 1)[1] not in {e.split(':', 1)[1] for e in E})}")

    # alarms active with the delay on the write grid
    def active(delay):
        res, start = [], None
        for k in range(n):
            if r[k] > 1:
                if start is None:
                    start = t[k]
                res.append(t[k] - start >= delay - 1e-9)
            else:
                start = None
                res.append(False)
        return res
    a0, a1, a2 = active(0), active(100), active(500)
    counts = [int(a0[k]) + int(a1[k]) + int(a2[k]) for k in range(n)]
    amax = max(counts)
    amaxAt = t[counts.index(amax)]
    need("alarmsActive" in ids and F["alarmsActive"]["max"] == amax
         and approx(F["alarmsActive"]["at"], amaxAt),
         f"alarmsActive max {amax} at {amaxAt} not recomputed")
    need(SUM["alarmsMax"] == amax, "summary.alarmsMax disagrees")
    # (note 2, 2026-11-13) WHEN any alarm was first active and for how long:
    # the first instant with at least one alarm active, the number of such
    # written instants, and those periods as the row's intervals.
    anyk = [k for k in range(n) if counts[k] > 0]
    want_iv = []
    for k in anyk:
        if want_iv and k > 0 and counts[k - 1] > 0:
            want_iv[-1][1] = t[k]
        else:
            want_iv.append([t[k], t[k]])
    AA = F.get("alarmsActive", {})
    need(anyk and "first" in AA and approx(AA["first"], t[anyk[0]]),
         "alarmsActive publishes no `first` (the first instant any alarm is"
         " active) or it is not recomputed")
    need(AA.get("count") == len(anyk),
         f"alarmsActive `count` is not {len(anyk)} (written instants with at"
         " least one alarm active)")
    got_iv = AA.get("intervals")
    need(isinstance(got_iv, list) and len(got_iv) == len(want_iv)
         and all(approx(g[0], w[0]) and approx(g[1], w[1])
                 for g, w in zip(got_iv, want_iv)),
         f"alarmsActive `intervals` {got_iv} are not the periods with at least"
         f" one alarm active {want_iv}")
    iv = E["element:lampLate"]["intervals"]
    need(sum(a2) == 0 and iv == [], "an alarm whose delay outlasts the excursion"
         " was active")
    first_active = next((t[k] for k in range(n) if a1[k]), None)
    iv1 = E["element:lampDelayed"]["intervals"]
    need(first_active is not None and iv1 and approx(iv1[0][0], first_active),
         "the delayed alarm's first active instant is not recomputed")
    # (note 6, 2026-11-13) EVERY element with a limit, alarm or not, carries
    # the periods its limit is violated (write grid, no delay) as
    # `limitIntervals`; `intervals` stays the alarm's and is absent without one.
    def periods(flags):
        out = []
        for k in range(n):
            if flags[k]:
                if out and k > 0 and flags[k - 1]:
                    out[-1][1] = t[k]
                else:
                    out.append([t[k], t[k]])
        return out
    nlim = 0
    for eid, er in E.items():
        if "limitLow" not in er and "limitHigh" not in er:
            need("limitIntervals" not in er, f"{eid} has no limit and publishes limitIntervals")
            continue
        if not er.get("published"):
            continue
        col = S[er["column"]]
        flags = [("limitHigh" in er and v > er["limitHigh"])
                 or ("limitLow" in er and v < er["limitLow"]) for v in col]
        want = periods(flags)
        got = er.get("limitIntervals")
        need(isinstance(got, list) and len(got) == len(want)
             and all(approx(g[0], w[0]) and approx(g[1], w[1]) for g, w in zip(got, want)),
             f"{eid}: limitIntervals {got} are not the limit-violation periods {want}")
        if "alarmOn" not in er:
            need("intervals" not in er, f"{eid} has no alarm and publishes alarm intervals")
        nlim += 1
    need(nlim >= 6 and E["element:alwaysLow"].get("limitIntervals")
         and E["element:lampLate"].get("limitIntervals")
         and E["element:lampLate"].get("intervals") == [],
         "the fixture no longer holds a limit without an alarm that is violated, and an"
         " alarm whose delay hides a violation its limitIntervals still show")
    # controllerWithoutElement: C1 measures rig.T, tempConst shows rig.T -> shown;
    # the fixture below removes it.
    need("controllerWithoutElement:C1" not in ids,
         "a controller whose measurement an element shows was reported unseen")
    # messages
    need(M["message:fires"]["fired"] == 1 and approx(M["message:fires"]["t"], t[viol[0]]),
         "the message on the limit crossing did not fire at the first violation")
    need(M["message:never"]["fired"] == 0 and "t" not in M["message:never"],
         "a message on a limit the run never crosses fired")
    need(M["message:theEnd"]["fired"] == 1 and approx(M["message:theEnd"]["t"], t[-1]),
         "the end message did not fire at the last instant")
    # (note 4, 2026-11-13) the log must not let the maximum's instant be read
    # as the start of the alarms: it names the first activation and says the
    # maximum's instant is when the MAXIMUM was first reached.
    aline = next((l for l in out.splitlines() if l.startswith("[panel] alarmsActive")), "")
    fmt6 = lambda v: f"{v:.6g}"
    need(anyk and f"the first alarm became active at t = {fmt6(t[anyk[0]])} s" in aline
         and f"was first reached at t = {fmt6(amaxAt)} s" in aline
         and "first at t =" not in aline,
         "the alarmsActive log line does not name the first activation"
         f" ({fmt6(t[anyk[0]]) if anyk else '-'} s) apart from the instant the"
         f" maximum was first reached ({fmt6(amaxAt)} s): {aline!r}")
    vline = next((l for l in out.splitlines() if l.startswith("[panel] violated:lamp")), "")
    need("first at t =" not in vline and f"the first of them is t = {fmt6(t[viol[0]])} s" in vline,
         f"the violated log line is ambiguous or wrong: {vline!r}")
    # log lines
    for needle in ("[panel] notPublished:notPub", "[panel] constant:tempConst",
                   "[panel] violated:lamp", "[panel] neverApproached:tempConst",
                   "[panel] alarmsActive", "[panel] message:fires",
                   "[panel] summary"):
        need(needle in out, f"the log has no line `{needle}`")

    # controllerWithoutElement, positively: a panel with no element on rig.T
    d2 = make_case(work, "ctrl", panel=panel(el(), ""), endTime=100,
                   flowsheet_extra=CONTROLLER)
    out2, err2, rc2 = run("choupoBatch", d2)
    j2 = result_json(out2) if rc2 == 0 else None
    need(j2 is not None and "controllerWithoutElement:C1" in records(j2, "facts"),
         "a PID whose measurement no element shows gave no `controllerWithoutElement`")
    # a not-known controller measurement in batch refuses (checked in (c)); and a
    # controller named by an element is known only when the flowsheet declares it
    d3 = make_case(work, "ctrl2", panel=panel(
        el(meas="{ controller C1; cv PV; }")), endTime=100, flowsheet_extra=CONTROLLER)
    out3, err3, rc3 = run("choupoBatch", d3)
    j3 = result_json(out3) if rc3 == 0 else None
    need(j3 is not None and "notPublished:ok" in records(j3, "facts"),
         "a declared controller whose PV column the run does not publish was not"
         " reported `notPublished`")
    claims.append(f"(d) {ok} fact checks on fixtures, each recomputed from trajectory.csv:"
                  " notPublished, constant, outOfRange, limitOutsideRange, violated /"
                  " neverViolated / alwaysViolated (k, n, first, last, closest approach),"
                  " neverApproached, controllerWithoutElement, sameQuantityAlarms,"
                  " limit-violation intervals of every limited element apart from the alarm's,"
                  " alarmsActive with a delay (maximum and its instant, first instant any"
                  " alarm is active, instants with one, their intervals), three messages; on the log, the JSON block")


def arm_golden(wd):
    exp = (WITNESS / "expected").read_text().splitlines()
    rows = [l.split() for l in exp if l.startswith("panel")]
    keys = {(r[1], r[2]) for r in rows}
    want = [("violated:overLimiting", "violated"), ("violated:overLimiting", "first"),
            ("constant:currentDensity", "value"), ("constant:temperature", "value"),
            ("summary", "alarmsMax"), ("message:overLimiting", "t"),
            ("message:batchEnd", "t")]
    for w in want:
        if w not in keys:
            fail(f"(d) the witness's golden has no `panel {w[0]} {w[1]}` row")
    claims.append(f"the witness's golden pins {len(rows)} panel rows")


# ---------------------------------------------------------------------------
# (e) the other binaries refuse the file
# ---------------------------------------------------------------------------
OTHERS = [
    ("choupoSolve", "tutorials/steady/flash/adiabaticFlash01_benzene_toluene"),
    ("choupoProps", "tutorials/props/compare/compare_visc_liquid_ammonia"),
    ("choupoCtrl", "tutorials/ctrl/ctrl01_cstr_temp_control"),
    ("choupoSemiContinuous", "tutorials/unsteady/unsteady01_startup_transient"),
]


def arm_others(work):
    n = 0
    for binary, rel in OTHERS:
        src = ROOT / rel
        d = work / ("other_" + binary)
        if d.exists():
            shutil.rmtree(d)
        shutil.copytree(src, d, ignore=shutil.ignore_patterns(
            "reports", "converged", "design", "iterations", "trajectory.csv"))
        (d / "system").mkdir(exist_ok=True)
        (d / "system" / "panelDict").write_text(panel(el()))
        out, err, rc = run(binary, d, timeout=300)
        blob = out + err
        if rc != 2 or "panelDict" not in blob:
            fail(f"(e) {binary} did not refuse a panelDict by name (exit {rc}):"
                 f" {blob.strip()[-200:]!r}")
        else:
            n += 1
    claims.append(f"(e) {n} other binaries refuse a panelDict by name")


def main():
    keep = Path(sys.argv[sys.argv.index("--keep") + 1]).resolve() if "--keep" in sys.argv else None
    for b in ("choupoBatch", "choupoSolve", "choupoProps", "choupoCtrl",
              "choupoSemiContinuous"):
        if not (ROOT / b).exists():
            print(f"check_panel: FAIL -- no {b} build; run `make all`")
            return 1
    work = keep or Path(tempfile.mkdtemp(prefix="panelgate."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        res = arm_identity(work)
        arm_refusals(work)
        arm_facts(work)
        arm_golden(res[0] if res else None)
        arm_others(work)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_panel: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_panel: OK -- " + "; ".join(claims)
          + ".  NOT CHECKED: that a panel is good (no engine can grade it), alarm"
          " practice (no standard is held), the 0.5 `neverApproached` default, the"
          " dimension of a limit against its column, `draftDiffers` (slice S3), the"
          " GUI drawing (slice S2), a crossing between two written instants (facts"
          " are resolved to the write grid) and byte-identity of other cases against"
          " an earlier build (measured once in the slice report, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
