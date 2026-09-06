#!/usr/bin/env python3
"""Gate: A STATE DIRECTORY IS A RESTARTABLE SNAPSHOT -- a state view carries
the streams that bound each unit AND what each unit holds inside it, the two
travel in the same grammar in both directions, and the unit that reads one back
SAYS which route it took.

    bin/curate/check_internal_states.py

WHY THIS EXISTS, and why its claim changed on 2026-09-06.  The interiors were
first written (2026-09-05) as a top-level `internalStates/` view, on the
`design/` precedent.  That was the wrong neighbour: `design/` is a DERIVATIVE
(equipment sizing computed from the answer), and a stage profile is STATE.  In
OpenFOAM a time directory holds one file per FIELD and that file carries the
boundary conditions AND the internal field together, which is what makes the
directory restartable; Choupo's state directories carried only the boundary
half.  So the interiors moved INSIDE the state views -- `converged/` for the
engine's, `0/` for the author's -- and `internalStates/` was retired one day
old.  The record is
docs/design/a-state-directory-is-a-restartable-snapshot.md.

The substantive half is not the move.  `DistillationColumn.H` said "Initial
T-profile (linear between guesses)": the column seeded its own interior in
code, undeclared and unannounced, which is the one solver aid in Choupo that
broke the 2026-05-30 rule.  Both routes speak now, and the declared one is a
file the case owns.

WHAT THIS CHECKS:

  (a) PUBLISHED IS WRITTEN, AT THE STAMPED ADDRESS.  Every unit whose JSON
      `profiles` entry carries an equipment-state axis has a file at
      `converged/<SECTOR>/<leaf>/<kind>`, where `<SECTOR>` is that unit's entry
      in the JSON's own `unitSectors` map -- the sector as DATA, never a split
      of the dotted name -- and `<kind>` is derived from the axis by the same
      table the writer uses (recounted here).

  (b) WRITTEN IS PUBLISHED.  No interior record under a state view names a unit
      the JSON does not publish a profile for.  Records are found by their own
      `recordType internalState;`, never by directory name, so a stream file
      beside them is never mistaken for one.

  (c) THE FILE REPRODUCES THE JSON, VALUE BY VALUE.  `nPoints` equals the axis
      column's length; every column the JSON names is in the file with the same
      length and the same values to 1e-9 relative (both are written at 12
      significant digits from the same double); markers agree in count,
      position and label.

  (d) A SWEPT PARAMETER IS NOT EQUIPMENT STATE.  On the `T_K` witness (the
      cooling tower's Merkel construction) no file and no unit directory is
      written, and the run says so.  The boundary made checkable: internal
      state is a field over a coordinate of the equipment or its inventory; a
      construction over a parameter sweep is an analysis and stays in the
      reports.

  (e) FLAT STAYS FLAT.  The flat witness's file sits at
      `converged/<unit>/<kind>` with no sector level and no `sector` key --
      empty is not a sector called "root".

  (f) THE SWING TABLE IS INTERNAL STATE (Vítor, 2026-09-05: loadings per
      component are an INVENTORY of the bed).

  (g) THE ROUND TRIP, WHICH IS WHAT "RESTARTABLE" MEANS.  On the witness
      `column16_declared_interior`, which SHIPS `0/column16/stageProfile`:
      the run announces `[seed] interior read from 0/`, its KPIs reproduce
      its own golden within the golden's own tolerances, and the SAME case
      with the declared interior removed announces the other route and takes
      AT LEAST as many outer iterations.  The declared file is one the writer
      produced, unchanged -- what `converged/` writes, `0/` accepts.

  (h) A DECLARATION THAT DOES NOT DESCRIBE THIS COLUMN REFUSES BY NAME.  A
      copy of the witness whose declared profile has one stage too few must
      exit non-zero and name the mismatch and the remedy -- never seed
      silently, and never ignore the file.

  (i) AN ORPHAN INTERIOR REFUSES.  A copy whose interior sits in a directory
      naming no unit of the flowsheet must exit non-zero -- the same posture
      as an orphan stream file.

  (j) A KIND NOBODY READS REFUSES.  A copy declaring a kind the unit does not
      list in `readsInteriorKinds()` must exit non-zero: a declared field
      nobody reads is a comment sitting in the state directory.

  (k) THE RETIRED VIEW IS GONE, in the tree and in the code.  No
      `internalStates/` directory exists under `tutorials/` after a run, and no
      line in `src/`, `bin/` (this file excepted), `gui/src/`, `gui/public/` or
      `.gitignore` still routes output there.

  (l) THE ENGINE'S HALF CANNOT BE COMMITTED, THE AUTHOR'S MUST BE.
      `git check-ignore` rejects `converged/<unit>/<kind>` and does NOT reject
      `0/<unit>/<kind>`; a new file under `docs/design/` stays committable; and
      `gui/src/cases/tutorials.ts` excludes `converged/**` from the case glob
      (the second lock -- the first is one `.gitignore` edit away, and the
      failure is one machine's stale stage profile baked into the shipped site).

WHAT THIS DOES NOT CHECK, said plainly:

  * WHETHER A DECLARED PROFILE IS RIGHT.  It is a SEED, not an answer; nothing
    here or in the engine checks it against the column equations.  Arm (g)
    checks that the ANSWER did not move, which is the only claim available.
  * THAT THE ENGINE'S PARSER ACCEPTS AN ARBITRARY FILE.  Arms (a)-(f) parse
    with a small reader in Python; arm (g) is the real round trip, through
    `Dictionary::fromFile`, on ONE kind (`stageProfile`).  No other kind has a
    reader yet.
  * EVERY AXIS.  Four witnesses cover the size axes, `stage` with a marker,
    `T_K` (the exclusion) and `componentIndex`.  `V`, `z`, `z_m`, `position`
    and the two undeclared axes (`module`, `chainLength`) are exercised by the
    suite's cases running through the same writer, not by an arm here.
  * `iterations/` AND THE DYNAMIC INSTANTS.  Neither carries interiors today
    (the record says why); nothing here would notice if one started to.
  * THE GUI.  The Case tree is pure and carries its own tests; the harvest is
    one entry in `OUTPUT_ROOTS` and is not exercised outside a browser.

SABOTAGES, all applied BY HAND -- to the GENERATED tree, to a COPY of a case,
or to a text file the gate READS -- between the run and the check.  No engine
source was patched and nothing was rebuilt (the 2026-08-18 tree-poisoning
rule).  Observed, verbatim:

  S1  deleted `converged/column09/stageProfile` after the run
      -> "unit 'column09' publishes a profile (xAxis stage) and has NO file at
          converged/column09/stageProfile."
  S2  changed one value of the flagship's
      `converged/CONCENTRATION/Cryst/sizeDistribution`
      -> "sizeDistribution column 'mass_density'[3] = 1.2345; the JSON says
          0.00343842655981 -- two projections of one record disagreeing."
  S3  copied a written interior to `converged/NotAUnit/stageProfile`
      -> "converged/NotAUnit/stageProfile is on disk and answers to NO
          published profile."
  S4  wrote `converged/coolingTower01/profile` on the T_K witness
      -> "internal state was written for a case whose only profile is a T_K
          construction" AND "a unit directory exists in converged/ ... for a
          case whose only profile is declined."

  S5-S7 attack the three REFUSAL arms, which the gate itself sets up: each
  offending copy was REPAIRED just before its run, so the arm met a case the
  engine accepts.  All three said so rather than passing:

  S5  the stage count restored -> "(stage count wrong by one): the run
      SUCCEEDED.  A declaration that does not describe the column must refuse,
      never be seeded from and never be ignored."
  S6  the orphan directory renamed back -> "(interior filed under a unit that
      does not exist): the run SUCCEEDED."
  S7  the unread kind deleted -> "(a kind the column does not read): the run
      SUCCEEDED.  A declared field nobody reads is a comment sitting in the
      state directory."

  S8  put the retired name back as a QUOTED path in the GUI glob
      -> "(k): 1 line(s) still name the retired `internalStates` view where
          output is routed: gui/src/cases/tutorials.ts:82."
  S9  the same edit removed the `converged/**` glob lock
      -> "(l): gui/src/cases/tutorials.ts does not exclude converged/ from the
          case glob -- the second lock on the tree that now carries the unit
          interiors."
  S10 added `tutorials/**/0/*/` to `.gitignore`, making the AUTHORED half
      uncommittable
      -> "(l): a unit interior DECLARED in 0/ is gitignored.  A case that
          declares the state it starts from must be able to commit it."

  The engine's own refusals, read by hand on the three offending copies:
      "DistillationColumn: the interior declared in
       0/<SECTOR>/<unit>/stageProfile does not describe this column -- it
       carries 14 stages and this column declares nStages 15. ..."
      "ORPHAN declared interior: 0/columnXX/stageProfile -- the directory
       'columnXX' names no unit in the flattened flowsheet. ..."
      "Flowsheet: 0/ declares an interior `axialProfile` for unit 'column16'
       (type distillationColumn), and NOTHING reads it. ...  It reads:
       stageProfile."

  NOT SABOTAGED, and said rather than implied: the two `[seed]` announcements
  themselves.  Suppressing one needs a source patch and a rebuild, which is the
  shape only `check_gate_selftest` may take; what stands instead is that both
  arms REQUIRE the line and the whole gate fails without it.
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

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"                   # sectors, sizeDistribution x2
FLAT    = "tutorials/steady/distillation/column09_tray_hydraulics"  # stageProfile + marker
SWEPT   = "tutorials/steady/heat/coolingTower01_merkel"             # T_K: NO file
SWING   = "tutorials/steady/separation/psa01_h2_psa"                # componentIndex -> swingTable
SEEDED  = "tutorials/steady/distillation/column16_declared_interior"  # ships 0/column16/stageProfile

VIEW = "converged"
TOL  = 1.0e-9

BEGIN, END = "<<<Choupo:result-begin>>>", "<<<Choupo:result-end>>>"


def kind_of(x_axis):
    """The writer's table, recounted.  Empty = declined."""
    if x_axis == "T_K":
        return ""
    if x_axis == "stage":
        return "stageProfile"
    if x_axis in ("V", "z", "z_m", "position"):
        return "axialProfile"
    if x_axis in ("L_micron", "diameter_micron"):
        return "sizeDistribution"
    if x_axis == "componentIndex":
        return "swingTable"
    return "profile"


def run_case(path):
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(path)],
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def result_json(out):
    a = out.find(BEGIN)
    b = out.find(END)
    if a < 0 or b < 0:
        return None
    return json.loads(out[a + len(BEGIN):b])


def strip_comments(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//[^\n]*', '', t)


def is_interior_record(path):
    """The record identifies ITSELF -- the same rule the engine's reader uses.
    Nothing here decides by directory or file NAME."""
    try:
        body = path.read_text(errors="replace")
    except OSError:
        return False
    return "recordType" in body and "internalState" in body


def parse_file(text):
    """The file, as a small reader sees it: header words, columns, markers."""
    t = strip_comments(text)
    out = {"header": {}, "columns": {}, "markers": []}
    for k in ("recordType", "unit", "sector", "equipment", "xAxis", "nPoints"):
        m = re.search(r'^\s*%s\s+"?([^";\n]+)"?\s*;' % k, t, re.M)
        if m:
            out["header"][k] = m.group(1).strip()

    m = re.search(r'^columns\s*\n\{', t, re.M)
    if m:
        i = t.index("{", m.start())
        depth, j = 0, i
        while j < len(t):
            if t[j] == "{":
                depth += 1
            elif t[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = t[i + 1:j]
        for cm in re.finditer(r'([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*;', body):
            vals = []
            for tok in cm.group(2).split():
                if tok in ("nan", "-nan", "inf", "-inf"):
                    vals.append(None)
                else:
                    vals.append(float(tok))
            out["columns"][cm.group(1)] = vals

    mm = re.search(r'^markers\s*\n\((.*?)^\);', t, re.M | re.S)
    if mm:
        for k in re.finditer(r'\{\s*x\s+([-\d.eE+]+)\s*;\s*label\s+"((?:[^"\\]|\\.)*)"\s*;\s*\}',
                             mm.group(1)):
            out["markers"].append((float(k.group(1)),
                                   k.group(2).replace('\\"', '"').replace("\\\\", "\\")))
    return out


def close(a, b, tol=TOL):
    if a is None or b is None:
        return a is None and b is None
    d = max(abs(a), abs(b), 1.0e-300)
    return abs(a - b) / d <= tol


def leaf_of(unit, sector):
    leaf = unit
    if sector and leaf.startswith(sector + "."):
        leaf = leaf[len(sector) + 1:]
    return leaf


def sector_path(sector):
    return sector.replace(".", "/") if sector else ""


def check_case(rel, expect_sector, problems, notes):
    """Arms (a)(b)(c)(e) on one case.  Returns the number of files checked and
    the set of kinds seen."""
    rc, out, err = run_case(ROOT / rel)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d) -- nothing to check.\n    %s"
                        % (rel, rc, err.strip()[:300]))
        return 0, set()
    j = result_json(out)
    if j is None:
        problems.append("%s: no result JSON between the markers." % rel)
        return 0, set()
    profiles = j.get("profiles", {})
    sectors = j.get("unitSectors", {})
    view = ROOT / rel / VIEW

    expected = {}     # path -> (unit, profile)
    declined = []
    for unit, prof in profiles.items():
        kind = kind_of(prof.get("xAxis", ""))
        if kind == "":
            declined.append(unit)
            continue
        sector = sectors.get(unit, "")
        if expect_sector and not sector:
            problems.append("%s: unit '%s' publishes a profile and the JSON's "
                            "unitSectors names no sector for it on a fractal case."
                            % (rel, unit))
        d = view
        if sector:
            d = d / sector_path(sector)
        d = d / leaf_of(unit, sector) / kind
        expected[d] = (unit, prof)

    # ---------------------------------------------------------------- (b)
    #  Every INTERIOR RECORD on disk, found by what it says it is -- the stream
    #  files sitting beside them in the same view are not records and are not
    #  this gate's business.
    on_disk = set()
    if view.is_dir():
        for p in view.rglob("*"):
            if p.is_file() and is_interior_record(p):
                on_disk.add(p)
    for p in sorted(on_disk - set(expected)):
        problems.append("%s: %s is on disk and answers to NO published profile "
                        "-- a stale file, or one written for a declined axis."
                        % (rel, p.relative_to(ROOT / rel)))

    checked, kinds = 0, set()
    for path, (unit, prof) in expected.items():
        # ------------------------------------------------------------ (a)
        if not path.is_file():
            problems.append("%s: unit '%s' publishes a profile (xAxis %s) and has "
                            "NO file at %s." % (rel, unit, prof.get("xAxis"),
                                                path.relative_to(ROOT / rel)))
            continue
        checked += 1
        kinds.add(path.name)
        # ------------------------------------------------------------ (e)
        if not expect_sector and path.parent.parent != view:
            problems.append("%s: flat case grew a directory level under %s/ "
                            "(%s).  Empty is not a sector called 'root'."
                            % (rel, VIEW, path.relative_to(ROOT / rel)))

        raw = path.read_text(errors="replace")
        f = parse_file(raw)
        h = f["header"]
        if h.get("recordType") != "internalState":
            problems.append("%s: %s carries no `recordType internalState;`."
                            % (rel, path.relative_to(ROOT / rel)))
        body = strip_comments(raw)
        if body.count("{") != body.count("}"):
            problems.append("%s: %s has unbalanced braces." % (rel, path.name))
        if body.count("(") != body.count(")"):
            problems.append("%s: %s has unbalanced parentheses." % (rel, path.name))
        if h.get("unit") != unit:
            problems.append("%s: %s names unit '%s', expected '%s'."
                            % (rel, path.relative_to(ROOT / rel), h.get("unit"), unit))
        if h.get("xAxis") != prof.get("xAxis"):
            problems.append("%s: %s declares xAxis '%s'; the JSON says '%s'."
                            % (rel, path.name, h.get("xAxis"), prof.get("xAxis")))
        if expect_sector and h.get("sector") != sectors.get(unit):
            problems.append("%s: %s declares sector '%s'; unitSectors says '%s'."
                            % (rel, path.name, h.get("sector"), sectors.get(unit)))
        if not expect_sector and "sector" in h:
            problems.append("%s: %s declares a sector on a flat case." % (rel, path.name))

        # ------------------------------------------------------------ (c)
        cols = prof.get("columns", {})
        x = prof.get("xAxis")
        n_json = len(cols.get(x, [])) if x in cols else max((len(v) for v in cols.values()), default=0)
        try:
            n_file = int(h.get("nPoints", "-1"))
        except ValueError:
            n_file = -1
        if n_file != n_json:
            problems.append("%s: %s says nPoints %d; the JSON axis column has %d."
                            % (rel, path.name, n_file, n_json))
        for cname, jvals in cols.items():
            if cname not in f["columns"]:
                problems.append("%s: %s omits column '%s', which the JSON publishes."
                                % (rel, path.name, cname))
                continue
            fvals = f["columns"][cname]
            if len(fvals) != len(jvals):
                problems.append("%s: %s column '%s' has %d values; the JSON has %d."
                                % (rel, path.name, cname, len(fvals), len(jvals)))
                continue
            for i, (a, b) in enumerate(zip(fvals, jvals)):
                if not close(a, b):
                    problems.append("%s: %s column '%s'[%d] = %s; the JSON says %s "
                                    "-- two projections of one record disagreeing."
                                    % (rel, path.name, cname, i, a, b))
                    break
        for cname in f["columns"]:
            if cname not in cols:
                problems.append("%s: %s carries column '%s', which the JSON does not "
                                "publish." % (rel, path.name, cname))
        jm = [(m["x"], m["label"]) for m in prof.get("markers", [])]
        if len(jm) != len(f["markers"]):
            problems.append("%s: %s has %d marker(s); the JSON has %d."
                            % (rel, path.name, len(f["markers"]), len(jm)))
        else:
            for (fx, fl), (jx, jl) in zip(f["markers"], jm):
                if not close(fx, jx) or fl != jl:
                    problems.append("%s: %s marker (%s, '%s') vs JSON (%s, '%s')."
                                    % (rel, path.name, fx, fl, jx, jl))
        notes.append("%s/%s (%d pts)" % (leaf_of(unit, sectors.get(unit, "")),
                                         path.name, n_json))
    if declined:
        notes.append("declined on %s: %s" % (rel.split("/")[-1], ", ".join(declined)))
    return checked, kinds


def check_swept(problems, notes):
    """(d) The T_K witness: a profile is published, no record is written into
    the state view, and the run says why."""
    rc, out, err = run_case(ROOT / SWEPT)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d)." % (SWEPT, rc))
        return
    j = result_json(out)
    profs = (j or {}).get("profiles", {})
    tk = [u for u, p in profs.items() if p.get("xAxis") == "T_K"]
    if not tk:
        problems.append("%s: publishes no T_K profile any more -- the exclusion "
                        "arm has no witness.  Point it at a case that does."
                        % SWEPT)
        return
    view = ROOT / SWEPT / VIEW
    if view.is_dir():
        recs = [str(p.relative_to(ROOT / SWEPT)) for p in view.rglob("*")
                if p.is_file() and is_interior_record(p)]
        if recs:
            problems.append("%s: internal state was written for a case whose only "
                            "profile is a T_K construction (%s).  A Merkel diagram "
                            "is an analysis over a swept parameter, not equipment "
                            "state." % (SWEPT, recs))
        dirs = [str(p.relative_to(ROOT / SWEPT)) for p in view.iterdir() if p.is_dir()]
        if dirs:
            problems.append("%s: a unit directory exists in %s/ (%s) for a case "
                            "whose only profile is declined."
                            % (SWEPT, VIEW, dirs))
    if "T_K" not in out or "NOT written" not in out:
        problems.append("%s: the declined T_K profile was not ANNOUNCED.  A skipped "
                        "profile the reader cannot see is a silent drop." % SWEPT)
    notes.append("T_K declined and announced on %s (%s)" % (SWEPT.split("/")[-1], ", ".join(tk)))


# ---------------------------------------------------------------------------
#  The round trip and the three refusals.  Each works on a COPY of the witness
#  under a temp directory: the sabotage is a file operation, never a source
#  patch and a rebuild.
# ---------------------------------------------------------------------------
def copy_case(dst):
    shutil.copytree(ROOT / SEEDED, dst,
                    ignore=shutil.ignore_patterns("converged", "reports",
                                                  "iterations", "design",
                                                  "log.*"))
    return dst


def golden_rows(case):
    """The `expected` rows this gate can compare from the result JSON: the
    per-unit KPIs and the per-stream F/T, with each row's own tolerance."""
    rows = []
    for line in (case / "expected").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 5 or parts[0] not in ("kpi", "stream"):
            continue
        rows.append((parts[0], parts[1], parts[2], float(parts[3]), float(parts[4])))
    return rows


def check_round_trip(problems, notes):
    """(g)(h)(i)(j).  What `converged/` writes, `0/` accepts -- and a
    declaration that does not describe the column refuses by name."""
    tmp = Path(tempfile.mkdtemp(prefix="choupo_interior_"))
    try:
        # ---- (g) the shipped witness: seeded ---------------------------
        rc, out, err = run_case(ROOT / SEEDED)
        if rc != 0:
            problems.append("%s: the seeded run failed (rc=%d).\n    %s"
                            % (SEEDED, rc, err.strip()[:300]))
            return
        if "[seed] interior read from 0/" not in out:
            problems.append("%s: ships 0/column16/stageProfile and did NOT announce "
                            "`[seed] interior read from 0/`.  A solver aid that "
                            "binds without saying so is the silence this slice "
                            "exists to end." % SEEDED)
        j = result_json(out) or {}
        it_seeded = (j.get("kpis", {}).get("column16", {}) or {}).get("iterations")

        #  The golden, at its own tolerances: the seed must not move the answer.
        for kind, name, key, want, reltol in golden_rows(ROOT / SEEDED):
            if kind == "kpi":
                got = (j.get("kpis", {}).get(name, {}) or {}).get(key)
            else:
                got = (j.get("streams", {}).get(name, {}) or {}).get(key)
            if got is None:
                problems.append("%s: the golden pins %s %s.%s and the run publishes "
                                "no such value." % (SEEDED, kind, name, key))
                continue
            if abs(got - want) > reltol * max(abs(want), 1.0e-300):
                problems.append("%s: seeded run gives %s %s.%s = %.12g; its own "
                                "golden says %.12g (reltol %g).  A declared "
                                "interior is a SEED and must not move the answer."
                                % (SEEDED, kind, name, key, got, want, reltol))

        # ---- (g) the same case with the declaration removed -------------
        bare = copy_case(tmp / "bare")
        shutil.rmtree(bare / "0" / "column16")
        rc, out2, err2 = run_case(bare)
        if rc != 0:
            problems.append("%s (declaration removed): the run failed (rc=%d).\n    %s"
                            % (SEEDED, rc, err2.strip()[:300]))
        else:
            if "[seed] interior seeded by the unit" not in out2:
                problems.append("%s (declaration removed): the unit did not announce "
                                "that it seeded its OWN interior.  Silence must mean "
                                "'nothing to say', never 'the block did not run'."
                                % SEEDED)
            j2 = result_json(out2) or {}
            it_bare = (j2.get("kpis", {}).get("column16", {}) or {}).get("iterations")
            if it_seeded is None or it_bare is None:
                problems.append("%s: the column publishes no `iterations` KPI, so "
                                "the round trip cannot be measured." % SEEDED)
            elif it_seeded > it_bare:
                problems.append("%s: the run seeded from 0/ took %g outer iterations "
                                "and the unseeded one took %g.  A declared interior "
                                "that costs iterations is not a restart."
                                % (SEEDED, it_seeded, it_bare))
            else:
                notes.append("round trip: %g outer iterations seeded from 0/, %g "
                             "unseeded" % (it_seeded, it_bare))

        # ---- (h) a declaration that does not describe this column -------
        wrong = copy_case(tmp / "wrong")
        f = wrong / "0" / "column16" / "stageProfile"
        txt = f.read_text()
        #  Drop the LAST stage from the axis column: fifteen stages declared,
        #  fourteen offered.  A file edit, between the copy and the run.
        txt = txt.replace("        9 10 11 12 13 14 15\n", "        9 10 11 12 13 14\n", 1)
        f.write_text(txt)
        rc, out3, err3 = run_case(wrong)
        blob = out3 + err3
        if rc == 0:
            problems.append("%s (stage count wrong by one): the run SUCCEEDED.  A "
                            "declaration that does not describe the column must "
                            "refuse, never be seeded from and never be ignored."
                            % SEEDED)
        elif "does not describe this column" not in blob:
            problems.append("%s (stage count wrong by one): refused, but the message "
                            "does not name the mismatch:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (i) an orphan interior --------------------------------------
        orphan = copy_case(tmp / "orphan")
        (orphan / "0" / "column16").rename(orphan / "0" / "columnXX")
        rc, out4, err4 = run_case(orphan)
        blob = out4 + err4
        if rc == 0:
            problems.append("%s (interior filed under a unit that does not exist): "
                            "the run SUCCEEDED.  An orphan interior is a claim about "
                            "nothing, and the case keeps believing it was read."
                            % SEEDED)
        elif "ORPHAN declared interior" not in blob:
            problems.append("%s (orphan interior): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (j) a kind nobody reads --------------------------------------
        unread = copy_case(tmp / "unread")
        d = unread / "0" / "column16"
        shutil.copy(d / "stageProfile", d / "axialProfile")
        rc, out5, err5 = run_case(unread)
        blob = out5 + err5
        if rc == 0:
            problems.append("%s (a kind the column does not read): the run "
                            "SUCCEEDED.  A declared field nobody reads is a comment "
                            "sitting in the state directory." % SEEDED)
        elif "NOTHING reads it" not in blob:
            problems.append("%s (unread kind): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_retired(problems, notes):
    """(k) `internalStates/` was a view for one day.  It must be gone from the
    tree AND from every line that could write one."""
    stale = [str(p.relative_to(ROOT))
             for p in (ROOT / "tutorials").rglob("internalStates") if p.is_dir()]
    if stale:
        problems.append("check_internal_states(k): an `internalStates/` directory "
                        "still exists under tutorials/ (%s).  The view is retired; "
                        "a unit's interior lives inside the state view that holds "
                        "its streams." % ", ".join(stale[:5]))
    #  A NAME IN PROSE IS HISTORY; A NAME IN A STRING IS A PATH.  The records,
    #  the headers and this gate's own docstring must be free to SAY
    #  `internalStates` -- the retirement is a fact worth writing down.  What
    #  may not survive is the name as a QUOTED string: that is a directory
    #  being built, harvested, ignored or copied, and it is the only form that
    #  can still route output to a view nothing writes.
    me = Path(__file__).resolve()
    quoted = re.compile(r"""["']internalStates["']|["'][^"']*/internalStates(/|["'])""")
    roots = [ROOT / "src", ROOT / "bin", ROOT / "gui/src", ROOT / "gui/public"]
    hits = []
    for r in roots:
        for p in r.rglob("*"):
            if not p.is_file() or p.resolve() == me:
                continue
            if "__pycache__" in p.parts or p.suffix in (".png", ".pdf", ".wasm", ".ods"):
                continue
            try:
                body = p.read_text(errors="replace")
            except OSError:
                continue
            for n, line in enumerate(body.splitlines(), 1):
                if quoted.search(line):
                    hits.append("%s:%d" % (p.relative_to(ROOT), n))
    gi = (ROOT / ".gitignore").read_text()
    for n, line in enumerate(gi.splitlines(), 1):
        if "internalStates" in line and not line.lstrip().startswith("#"):
            hits.append(".gitignore:%d" % n)
    if hits:
        problems.append("check_internal_states(k): %d line(s) still name the retired "
                        "`internalStates` view where output is routed: %s."
                        % (len(hits), ", ".join(hits[:6])))
    else:
        notes.append("no source or ignore line still routes to internalStates/")


def check_ignored(problems):
    """(l) Both halves of the snapshot, each on the right side of the line."""
    case = ROOT / FLAT
    written = case / VIEW / "X" / "stageProfile"
    written.parent.mkdir(parents=True, exist_ok=True)
    written.write_text("")
    authored = case / "0" / "X" / "stageProfile"
    authored.parent.mkdir(parents=True, exist_ok=True)
    authored.write_text("")
    rec = ROOT / "docs" / "design" / "__gate_probe_internal.md"
    rec.write_text("")
    try:
        r1 = subprocess.run(["git", "check-ignore", "-q", str(written)],
                            cwd=ROOT, capture_output=True)
        if r1.returncode != 0:
            problems.append(
                "check_internal_states(l): a unit interior the RUN wrote into "
                "converged/ is NOT gitignored.  The GUI bundle is a Vite glob "
                "over tutorials/*/*/**/* that inlines every match as a raw "
                "string: one machine's stale stage profile would ship.")
        r2 = subprocess.run(["git", "check-ignore", "-q", str(authored)],
                            cwd=ROOT, capture_output=True)
        if r2.returncode == 0:
            problems.append(
                "check_internal_states(l): a unit interior DECLARED in 0/ is "
                "gitignored.  A case that declares the state it starts from must "
                "be able to commit it -- that is the whole point of the slice.")
        r3 = subprocess.run(["git", "check-ignore", "-q", str(rec)],
                            cwd=ROOT, capture_output=True)
        if r3.returncode == 0:
            problems.append(
                "check_internal_states(l): a NEW file under docs/design/ is "
                "ignored -- a rule swallowed this project's design records.")
    finally:
        shutil.rmtree(case / VIEW / "X", ignore_errors=True)
        shutil.rmtree(case / "0" / "X", ignore_errors=True)
        rec.unlink(missing_ok=True)
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/converged/**' not in tl:
        problems.append(
            "check_internal_states(l): gui/src/cases/tutorials.ts does not exclude "
            "converged/ from the case glob -- the second lock on the tree that now "
            "carries the unit interiors.")


def check_source(problems):
    """The exclusion, the boundary sentence and the two-way contract, at their
    source.  A source arm, because a gate that patches a source and rebuilds the
    engine is the 2026-08-18 tree-poisoning shape."""
    cpp = (ROOT / "src/io/InternalStateIO.cpp").read_text(errors="replace")
    hdr = (ROOT / "src/io/InternalStateIO.H").read_text(errors="replace")
    if 'xAxis == "T_K"' not in cpp:
        problems.append("check_internal_states: InternalStateIO::kindOf no longer "
                        "excludes the T_K axis by name.")
    if "construction over a parameter sweep" not in hdr:
        problems.append("check_internal_states: the module's header no longer states "
                        "the boundary (a field over a coordinate of the equipment or "
                        "its inventory vs a construction over a parameter sweep).")
    col = (ROOT / "src/unitOperations/distillation/DistillationColumn.H").read_text(errors="replace")
    if "stageProfile" not in col or "readsInteriorKinds" not in col:
        problems.append("check_internal_states: DistillationColumn no longer DECLARES "
                        "the interior kind it reads, so the flowsheet would refuse "
                        "every file the writer produces for it.")
    base = (ROOT / "src/unitOperations/UnitOperation.H").read_text(errors="replace")
    if "readsInteriorKinds" not in base or "setDeclaredInterior" not in base:
        problems.append("check_internal_states: the declared-interior surface is gone "
                        "from UnitOperation -- nothing can read a state view back.")


def main() -> int:
    problems, notes = [], []
    n1, k1 = check_case(FRACTAL, True, problems, notes)
    n2, k2 = check_case(FLAT, False, problems, notes)
    n3, k3 = check_case(SWING, False, problems, notes)
    if n1 == 0:
        problems.append("%s: no file was checked -- the arms cannot fire." % FRACTAL)
    if n2 == 0:
        problems.append("%s: no file was checked." % FLAT)
    if "stageProfile" not in k2:
        problems.append("%s: no stageProfile was written." % FLAT)
    if "sizeDistribution" not in k1:
        problems.append("%s: no sizeDistribution was written." % FRACTAL)
    if "swingTable" not in k3:
        problems.append("%s: the PSA profile is not filed as swingTable (%s)."
                        % (SWING, sorted(k3)))
    check_swept(problems, notes)
    check_round_trip(problems, notes)
    check_retired(problems, notes)
    check_ignored(problems)
    check_source(problems)

    if problems:
        print("check_internal_states: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_internal_states: OK -- a state view carries the streams AND each "
          "unit's interior: %d record(s) on the fractal witness, %d on the flat "
          "column and %d on the PSA bed, each at converged/<SECTOR>/<unit>/<kind> "
          "where the unit's STAMPED sector puts it (unitSectors from the JSON, "
          "never a split name; no level at all on a flat case), each reproducing "
          "its unit's published profile value by value at 1e-9 (%s); no record "
          "answers to an unpublished profile; the T_K construction on the cooling "
          "tower produced no record and no directory and was announced; the swing "
          "table is filed as internal state.  THE ROUND TRIP HOLDS: the witness "
          "ships the file converged/ wrote, announces `[seed] interior read from "
          "0/`, reproduces its own golden, and the same case with the declaration "
          "removed announces the other route (%s); a stage count wrong by one, an "
          "orphan directory and a kind nobody reads each REFUSE by name.  The "
          "retired internalStates/ view is gone from the tree and from every line "
          "that could write one; what the run writes is gitignored, what the case "
          "declares is not, docs/design/ stays committable, and the glob's second "
          "lock is on converged/.  NOT CHECKED: whether a declared profile is RIGHT "
          "(it is a SEED, not an answer), the engine's parser on any kind but "
          "stageProfile, the V/z/z_m/position axes and the two undeclared ones "
          "(module, chainLength) beyond the suite running them, iterations/ and the "
          "dynamic instants (neither carries interiors), and the browser harvest."
          % (n1, n2, n3, "; ".join(notes[:3]),
             next((n for n in notes if n.startswith("round trip")), "not measured")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
