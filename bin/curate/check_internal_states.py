#!/usr/bin/env python3
"""Gate: A STATE DIRECTORY IS A RESTARTABLE SNAPSHOT -- a state view carries
the streams that bound each unit AND, under its own root, ONE file per unit
holding what that unit keeps inside it; the two halves travel in the same
grammar in both directions; a unit and a stream may share a name and never a
path; and the unit that reads its interior back SAYS which route it took.

    bin/curate/check_internal_states.py

WHY THIS EXISTS, and why its claim changed twice on 2026-09-06.  The interiors
were first written (2026-09-05) as a top-level `internalStates/` view, on the
`design/` precedent -- the wrong neighbour, because `design/` is a DERIVATIVE
and a stage profile is STATE.  That morning they moved INSIDE the state views
as a DIRECTORY per unit beside the stream files, one file per kind.  The same
afternoon a three-way reflection (Vitor, ChatGPT, the assistant) measured
that every such directory held ONE file, and that a unit file BESIDE the
stream files would overwrite a homonymous stream in silence (nothing forbids
the two sharing a name) -- so a unit's interior is now ONE file at

    <view>/internalStates/<SECTOR>/<unit>          (one BLOCK per kind)
    <view>/internalStates/<unit>                   (a flat case: no sector level)

with the streams unchanged, flat, as ratified 2026-07-06.  IDENTITY IS
(kind, sector, name), NEVER NAME ALONE; the homonym is ANNOUNCED, not
refused.  The reading, in one line: the view shows the boundary directly; the
interior is namespaced inside the same view.  The record is
docs/design/a-state-directory-is-a-restartable-snapshot.md, section 9.

The substantive half is still the SEED.  `DistillationColumn.H` said "Initial
T-profile (linear between guesses)": the column seeded its own interior in
code, undeclared and unannounced, the one solver aid in Choupo that broke the
2026-05-30 rule.  Both routes speak now, and the declared one is a file the
case owns.

WHAT THIS CHECKS:

  (a) PUBLISHED IS WRITTEN, ONE FILE PER UNIT, AT THE STAMPED ADDRESS.  Every
      unit whose JSON `profiles` entry carries an equipment-state axis has a
      file at `converged/internalStates/<SECTOR>/<leaf>`, where `<SECTOR>` is
      that unit's entry in the JSON's own `unitSectors` map -- the sector as
      DATA, never a split of the dotted name -- and the file carries a BLOCK
      named by the axis through the same table the writer uses (recounted
      here).

  (b) WRITTEN IS PUBLISHED.  No interior record under `converged/` names a
      unit the JSON does not publish a profile for.  Records are found by
      their own `recordType internalState;`, never by file name, so a stream
      file beside them is never mistaken for one.

  (c) EVERY BLOCK REPRODUCES THE JSON, VALUE BY VALUE.  `nPoints` equals the
      axis column's length; every column the JSON names is in the block with
      the same length and the same values to 1e-9 relative (both are written
      at 12 significant digits from the same double); markers agree in count,
      position and label; the header names the unit and its equipment type.

  (d) A SWEPT PARAMETER IS NOT EQUIPMENT STATE.  On the `T_K` witness (the
      cooling tower's Merkel construction) no `internalStates/` exists, no
      record is written anywhere in the view, and the run says so.

  (e) FLAT STAYS FLAT.  The flat witness's file sits DIRECTLY under
      `converged/internalStates/` with no sector level and no `sector` key --
      empty is not a sector called "root".

  (f) A UNIT WITH TWO KINDS GETS TWO BLOCKS -- and this arm has NO LIVE CASE
      on the writer's side, said plainly: `SimulationResult::profiles` is a map
      keyed by unit, so no unit CAN publish two kinds through the engine today;
      the writer's N is 1 on every case.  What IS exercised is the READER: a
      BUILT fixture puts a `stageProfile` and an `axialProfile` block in one
      declared file, and the run must refuse naming `axialProfile` as the kind
      nothing reads -- which is only possible if both blocks were parsed.  A
      second fixture carries a block whose name is not a kind at all, and the
      run must refuse it BY NAME.

  (g) THE ROUND TRIP, WHICH IS WHAT "RESTARTABLE" MEANS.  On the witness
      `column16_declared_interior`, which SHIPS `0/internalStates/column16`
      (the file `converged/` wrote, unchanged): the run announces `[seed]
      interior read from 0/`, its KPIs reproduce its own golden within the
      golden's own tolerances, and the SAME case with the declaration removed
      announces the other route and takes AT LEAST as many outer iterations.

  (h) THE REFUSALS, each on a copy of the witness: a declared profile with
      one stage too few refuses naming the mismatch; a file naming no unit
      refuses as an ORPHAN; the RETIRED shape (`0/<unit>/<kind>`, a record
      outside `internalStates/`) refuses as MISFILED, naming the address --
      never skipped in silence, which is what both readers would otherwise do
      with it; a kind the column does not read refuses (see (f)).

  (i) NO `<view>/<SECTOR>/<unit>/` DIRECTORY SURVIVES.  After the runs, no
      interior record sits anywhere under a `0/` or `converged/` of any case
      under `tutorials/` except under that view's `internalStates/`.

  (j) THE STREAM/UNIT HOMONYM.  A BUILT case gives the column's distillate the
      column's own name: `column16` is then both a stream and a unit.  The
      run succeeds; `0/column16` (a stream body) and `0/internalStates/column16`
      (a record) both exist and the interior was read; `converged/column16`
      and `converged/internalStates/column16` both exist, one a stream and one
      a record, neither overwritten; and the run ANNOUNCES the homonym once.

  (k) THE RETIRED TOP-LEVEL VIEW IS GONE.  No case under `tutorials/` has an
      `internalStates/` directory at its ROOT (only inside `0/`, `converged/`
      or an instant); the GUI's `RUN_OUTPUT_ROOTS` does not list it; the worker
      does not walk `/case/internalStates/`; no non-comment `.gitignore` line
      names it (a top-level rule would take the AUTHORED half with it).

  (l) THE ENGINE'S HALF CANNOT BE COMMITTED, THE AUTHOR'S MUST BE.
      `git check-ignore` rejects `converged/internalStates/<unit>` and does NOT
      reject `0/internalStates/<unit>`; a new file under `docs/design/` stays
      committable; and `gui/src/cases/tutorials.ts` excludes `converged/**`
      from the case glob.

  (m) THE RESOLVERS CARRY THE KIND (the D11 audit, made unforgettable).  The
      one bare-name resolver the audit FIXED -- `StreamStateIO::readStateDir`
      keyed every stream-looking file by its relative path, so a misfiled one
      under `internalStates/` became stream `internalStates.<x>` -- must still
      skip that subtree BY NAME; `InternalStateIO::read` must walk the ROOT
      constant and nothing else; the GUI's `caseTree` must carry no geography
      discriminator (`sectorPaths`, the rule that a directory in a view is a
      unit -- false since the root exists); and `CaseIntro`'s keep-list must
      read the VIEW (`isRunOutput`) and not the kind, because a run output of
      kind "interior" is still a run output.

  (n) SOURCE: the `T_K` exclusion, the boundary sentence, the column's
      declared kind and the base-class surface are where they were.

WHAT THIS DOES NOT CHECK, said plainly:

  * WHETHER A DECLARED PROFILE IS RIGHT.  It is a SEED, not an answer; nothing
    here or in the engine checks it against the column equations.  Arm (g)
    checks that the ANSWER did not move, which is the only claim available.
  * THAT THE ENGINE'S PARSER ACCEPTS AN ARBITRARY FILE.  Arms (a)-(f) parse
    with a small reader in Python; arm (g) is the real round trip, through
    `Dictionary::fromFile`, on ONE kind (`stageProfile`).  No other kind has a
    reader yet.
  * A UNIT WRITING TWO KINDS.  There is no such unit (see (f)).
  * EVERY AXIS.  Four witnesses cover the size axes, `stage` with a marker,
    `T_K` (the exclusion) and `componentIndex`.  `V`, `z`, `z_m`, `position`
    and the two undeclared axes (`module`, `chainLength`) are exercised by the
    suite's cases running through the same writer, not by an arm here.
  * `iterations/` AND THE DYNAMIC INSTANTS.  Neither carries interiors today
    (the record says why); nothing here would notice if one started to.
  * THE OWNERSHIP SPLIT -- CLOSED 2026-09-06, kept here so the absence is not
    read back as still open.  `StreamOwnership::sectorOf` used to derive a
    stream's sector by splitting the unit name where the interior uses the
    STAMP; the ownership rule now reads the stamp too, through the ONE home
    `topLevelSector`, and `check_sector_hierarchy` arm (g) holds it at the
    source.  Nothing here checks it.
  * THE GUI.  The Case tree is pure and carries its own tests; the harvest is
    one entry in `OUTPUT_ROOTS` and is not exercised outside a browser.

SABOTAGES, all applied BY HAND -- to the GENERATED tree, to a COPY of a case,
or to a text file the gate READS -- between the run and the check.  No engine
source was patched and nothing was rebuilt (the 2026-08-18 tree-poisoning
rule).  Observed, verbatim:

  The engine's own refusals, read by hand on the offending copies (the first
  on the witness ITSELF, before its declaration was migrated):
      "MISFILED declared interior: 0/column16/stageProfile declares
       `recordType internalState;` outside 0/internalStates/.  A unit's
       interior is ONE file at <view>/internalStates/<SECTOR>/<unit>, with one
       block per kind (stageProfile { ... }); the one-directory-per-unit shape
       <view>/<SECTOR>/<unit>/<kind> is retired.  Move the record there as a
       block, or delete it -- it would otherwise be skipped in silence, ..."
      "ORPHAN declared interior: 0/internalStates/columnXX -- the file
       'columnXX' names no unit in the flattened flowsheet.  A unit's interior
       lives at <view>/internalStates/<SECTOR>/<unit>, at the address its
       STAMPED sector dictates.  The units this flowsheet has: column16
       (column16)."
      "Flowsheet: 0/ declares an interior `axialProfile` for unit 'column16'
       (type distillationColumn), and NOTHING reads it. ...  It reads:
       stageProfile."
      "declared interior 0/internalStates/column16: block `bogusBlock` is not
       a kind of internal state.  A block's name is the kind of field it
       carries; the kinds are: stageProfile, axialProfile, sizeDistribution,
       swingTable, profile."
      "DistillationColumn: the stageProfile block declared in
       0/internalStates/<SECTOR>/<unit> does not describe this column -- it
       carries 14 stages and this column declares nStages 15. ..."
      "  [names] stream 'column16' and unit 'column16' share a name; they are
       different objects at different paths (<view>/<name> is the stream,
       <view>/internalStates/<name> the unit's interior)"

  S1  deleted `converged/internalStates/column09` after the run
      -> "unit 'column09' publishes a profile (xAxis stage) and has NO file at
          converged/internalStates/column09."
  S2  changed one value of the flagship's
      `converged/internalStates/CONCENTRATION/Cryst` (block sizeDistribution)
      -> "Cryst sizeDistribution column 'mass_density'[3] = 1.2345; the JSON
          says 0.00343842655981 -- two projections of one record disagreeing."
  S3  copied a written interior to `converged/internalStates/NotAUnit`
      -> "converged/internalStates/NotAUnit is on disk and answers to NO
          published profile."
  S4  wrote the RETIRED shape `converged/column09/stageProfile` (a record) on
      the flat witness -- TWO arms fired:
      -> "converged/column09/stageProfile is on disk and answers to NO
          published profile" AND "(i): an interior record sits OUTSIDE
          internalStates/ in a state view -- the retired
          <view>/<SECTOR>/<unit>/<kind> shape, or a misfiling: ...
          converged/column09/stageProfile"
  S5  wrote `converged/internalStates/coolingTower01` on the T_K witness
      -> "internal state was written for a case whose only profile is a T_K
          construction" AND "internalStates/ exists in converged/".
  S6-S9 attack the REFUSAL arms, which the gate itself sets up: each offending
  copy was REPAIRED just before its run (a one-line hand edit of this gate's
  fixture, reverted), so the arm met a case the engine accepts.  Each said so
  rather than passing:
  S6  the stage count restored -> "(stage count wrong by one): the run
      SUCCEEDED."
  S7  the orphan file renamed back -> "(interior filed under a unit that does
      not exist): the run SUCCEEDED."
  S8  the misfiled record deleted before the run -> "(the retired shape,
      0/column16/stageProfile): the run SUCCEEDED.  A record outside
      internalStates/ was skipped in silence."
  S9  the second block dropped from the two-block fixture -> "(two blocks,
      one unread): the run SUCCEEDED."
  S10 hand-removed the `internalStates` skip from `StreamStateIO::readStateDir`
      (source text only, NOT rebuilt, reverted)
      -> "(m): StreamStateIO::readStateDir no longer skips the internalStates
          subtree by name."
  S11 added `**/0/internalStates/` to `.gitignore`
      -> "(l): a unit interior DECLARED in 0/ is gitignored."
  S12 put "internalStates" into RUN_OUTPUT_ROOTS in caseTree.ts
      -> "(k): gui/src/ui/caseTree.ts lists internalStates as a run-output
          ROOT."
  S13 left the homonym fixture's stream as `distillate` (hand edit of the
      fixture line, reverted) -- THREE arms fired:
      -> "(j) homonym: 0/column16 (stream) and 0/internalStates/column16
          (record) do not BOTH exist as their own kind." / "converged/column16
          is not a stream state file" / "the run did not announce the
          stream/unit homonym.  Identity is (kind, sector, name); a shared
          name is SAID, never refused and never silent."

  NOT SABOTAGED, and said rather than implied: the two `[seed]` announcements
  and the `[names]` announcement themselves.  Suppressing one needs a source
  patch and a rebuild, which is the shape only `check_gate_selftest` may
  take; what stands instead is that the arms REQUIRE the line and the whole
  gate fails without it.
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
SEEDED  = "tutorials/steady/distillation/column16_declared_interior"  # ships 0/internalStates/column16

VIEW  = "converged"
IROOT = "internalStates"      # InternalStateIO::ROOT, recounted
TOL   = 1.0e-9
KINDS = ("stageProfile", "axialProfile", "sizeDistribution", "swingTable", "profile")

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


def is_stream_state(path):
    """The stream reader's own marker (StreamStateIO::looksLikeStreamState),
    recounted for the one form the witness writes."""
    try:
        body = path.read_text(errors="replace")
    except OSError:
        return False
    return "componentFlows" in body or "componentMolarFlows" in body


def _brace_body(t, open_at):
    """The text between the brace at `open_at` and its match."""
    depth, j = 0, open_at
    while j < len(t):
        if t[j] == "{":
            depth += 1
        elif t[j] == "}":
            depth -= 1
            if depth == 0:
                return t[open_at + 1:j], j
        j += 1
    return t[open_at + 1:], len(t)


def _parse_columns(body):
    cols = {}
    for cm in re.finditer(r'([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*;', body):
        vals = []
        for tok in cm.group(2).split():
            if tok in ("nan", "-nan", "inf", "-inf"):
                vals.append(None)
            else:
                vals.append(float(tok))
        cols[cm.group(1)] = vals
    return cols


def parse_file(text):
    """The file, as a small reader sees it: header words, then one entry per
    top-level BLOCK -- {xAxis, nPoints, columns, markers}."""
    t = strip_comments(text)
    out = {"header": {}, "blocks": {}}
    for k in ("recordType", "unit", "sector", "equipment"):
        m = re.search(r'^\s*%s\s+"?([^";\n]+)"?\s*;' % k, t, re.M)
        if m:
            out["header"][k] = m.group(1).strip()
    for bm in re.finditer(r'^([A-Za-z_][\w]*)\s*\n\{', t, re.M):
        name = bm.group(1)
        body, _ = _brace_body(t, t.index("{", bm.start()))
        blk = {"xAxis": None, "nPoints": None, "columns": {}, "markers": []}
        m = re.search(r'^\s*xAxis\s+(\S+)\s*;', body, re.M)
        if m:
            blk["xAxis"] = m.group(1)
        m = re.search(r'^\s*nPoints\s+(\d+)\s*;', body, re.M)
        if m:
            blk["nPoints"] = int(m.group(1))
        cm = re.search(r'^\s*columns\s*\n\s*\{', body, re.M)
        if cm:
            cbody, _ = _brace_body(body, body.index("{", cm.start()))
            blk["columns"] = _parse_columns(cbody)
        mm = re.search(r'^\s*markers\s*\n\s*\((.*?)^\s*\);', body, re.M | re.S)
        if mm:
            for k in re.finditer(r'\{\s*x\s+([-\d.eE+]+)\s*;\s*label\s+"((?:[^"\\]|\\.)*)"\s*;\s*\}',
                                 mm.group(1)):
                blk["markers"].append((float(k.group(1)),
                                       k.group(2).replace('\\"', '"').replace("\\\\", "\\")))
        out["blocks"][name] = blk
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


def records_under(view):
    """Every interior record on disk under a view, found by what it says."""
    out = set()
    if view.is_dir():
        for p in view.rglob("*"):
            if p.is_file() and is_interior_record(p):
                out.add(p)
    return out


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
    root = view / IROOT

    expected = {}     # file path -> (unit, kind, profile)
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
        d = root
        if sector:
            d = d / sector_path(sector)
        d = d / leaf_of(unit, sector)
        expected[d] = (unit, kind, prof)

    # ---------------------------------------------------------------- (b)
    on_disk = records_under(view)
    for p in sorted(on_disk - set(expected)):
        problems.append("%s: %s is on disk and answers to NO published profile "
                        "-- a stale file, or one written for a declined axis."
                        % (rel, p.relative_to(ROOT / rel)))

    checked, kinds = 0, set()
    for path, (unit, kind, prof) in expected.items():
        # ------------------------------------------------------------ (a)
        if not path.is_file():
            problems.append("%s: unit '%s' publishes a profile (xAxis %s) and has "
                            "NO file at %s." % (rel, unit, prof.get("xAxis"),
                                                path.relative_to(ROOT / rel)))
            continue
        checked += 1
        # ------------------------------------------------------------ (e)
        if not expect_sector and path.parent != root:
            problems.append("%s: flat case grew a directory level under %s/%s/ "
                            "(%s).  Empty is not a sector called 'root'."
                            % (rel, VIEW, IROOT, path.relative_to(ROOT / rel)))

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
        if expect_sector and h.get("sector") != sectors.get(unit):
            problems.append("%s: %s declares sector '%s'; unitSectors says '%s'."
                            % (rel, path.name, h.get("sector"), sectors.get(unit)))
        if not expect_sector and "sector" in h:
            problems.append("%s: %s declares a sector on a flat case." % (rel, path.name))
        if not h.get("equipment"):
            problems.append("%s: %s names no equipment type." % (rel, path.name))
        for bname in f["blocks"]:
            if bname not in KINDS:
                problems.append("%s: %s carries a block `%s` that is not a kind."
                                % (rel, path.name, bname))
        if kind not in f["blocks"]:
            problems.append("%s: %s has no `%s` block (blocks: %s); the JSON axis "
                            "is %s." % (rel, path.name, kind, sorted(f["blocks"]),
                                        prof.get("xAxis")))
            continue
        kinds.add(kind)
        blk = f["blocks"][kind]
        if blk["xAxis"] != prof.get("xAxis"):
            problems.append("%s: %s block %s declares xAxis '%s'; the JSON says '%s'."
                            % (rel, path.name, kind, blk["xAxis"], prof.get("xAxis")))

        # ------------------------------------------------------------ (c)
        cols = prof.get("columns", {})
        x = prof.get("xAxis")
        n_json = len(cols.get(x, [])) if x in cols else max((len(v) for v in cols.values()), default=0)
        n_file = blk["nPoints"] if blk["nPoints"] is not None else -1
        if n_file != n_json:
            problems.append("%s: %s block %s says nPoints %d; the JSON axis column has %d."
                            % (rel, path.name, kind, n_file, n_json))
        for cname, jvals in cols.items():
            if cname not in blk["columns"]:
                problems.append("%s: %s block %s omits column '%s', which the JSON "
                                "publishes." % (rel, path.name, kind, cname))
                continue
            fvals = blk["columns"][cname]
            if len(fvals) != len(jvals):
                problems.append("%s: %s block %s column '%s' has %d values; the JSON "
                                "has %d." % (rel, path.name, kind, cname, len(fvals), len(jvals)))
                continue
            for i, (a, b) in enumerate(zip(fvals, jvals)):
                if not close(a, b):
                    problems.append("%s: %s %s column '%s'[%d] = %s; the JSON says %s "
                                    "-- two projections of one record disagreeing."
                                    % (rel, path.name, kind, cname, i, a, b))
                    break
        for cname in blk["columns"]:
            if cname not in cols:
                problems.append("%s: %s block %s carries column '%s', which the JSON "
                                "does not publish." % (rel, path.name, kind, cname))
        jm = [(m["x"], m["label"]) for m in prof.get("markers", [])]
        if len(jm) != len(blk["markers"]):
            problems.append("%s: %s block %s has %d marker(s); the JSON has %d."
                            % (rel, path.name, kind, len(blk["markers"]), len(jm)))
        else:
            for (fx, fl), (jx, jl) in zip(blk["markers"], jm):
                if not close(fx, jx) or fl != jl:
                    problems.append("%s: %s marker (%s, '%s') vs JSON (%s, '%s')."
                                    % (rel, path.name, fx, fl, jx, jl))
        notes.append("%s (%s, %d pts)" % (leaf_of(unit, sectors.get(unit, "")),
                                          kind, n_json))
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
    recs = [str(p.relative_to(ROOT / SWEPT)) for p in records_under(view)]
    if recs:
        problems.append("%s: internal state was written for a case whose only "
                        "profile is a T_K construction (%s).  A Merkel diagram "
                        "is an analysis over a swept parameter, not equipment "
                        "state." % (SWEPT, recs))
    if (view / IROOT).exists():
        problems.append("%s: %s/ exists in %s/ for a case whose only profile is "
                        "declined." % (SWEPT, IROOT, VIEW))
    if "T_K" not in out or "NOT written" not in out:
        problems.append("%s: the declined T_K profile was not ANNOUNCED.  A skipped "
                        "profile the reader cannot see is a silent drop." % SWEPT)
    notes.append("T_K declined and announced on %s (%s)" % (SWEPT.split("/")[-1], ", ".join(tk)))


# ---------------------------------------------------------------------------
#  The round trip, the refusals, the two-block fixture and the homonym.  Each
#  works on a COPY of the witness under a temp directory: the sabotage is a
#  file operation, never a source patch and a rebuild.
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
    """(f)(g)(h)(j).  What `converged/` writes, `0/` accepts -- and every
    declaration that does not describe the column, or sits where nothing
    reads it, refuses by name."""
    tmp = Path(tempfile.mkdtemp(prefix="choupo_interior_"))
    decl = Path("0") / IROOT / "column16"
    try:
        # ---- (g) the shipped witness: seeded ---------------------------
        rc, out, err = run_case(ROOT / SEEDED)
        if rc != 0:
            problems.append("%s: the seeded run failed (rc=%d).\n    %s"
                            % (SEEDED, rc, err.strip()[:300]))
            return
        if not (ROOT / SEEDED / decl).is_file():
            problems.append("%s: does not ship %s -- the round-trip witness has "
                            "no declaration." % (SEEDED, decl))
        if "[seed] interior read from 0/" not in out:
            problems.append("%s: ships %s and did NOT announce `[seed] interior "
                            "read from 0/`.  A solver aid that binds without "
                            "saying so is the silence this slice exists to end."
                            % (SEEDED, decl))
        j = result_json(out) or {}
        it_seeded = (j.get("kpis", {}).get("column16", {}) or {}).get("iterations")

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
        shutil.rmtree(bare / "0" / IROOT)
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
        f = wrong / decl
        txt = f.read_text()
        #  Drop the LAST stage from the axis column: fifteen stages declared,
        #  fourteen offered.  A file edit, between the copy and the run.
        txt = txt.replace("            9 10 11 12 13 14 15\n", "            9 10 11 12 13 14\n", 1)
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

        # ---- (h) an orphan interior --------------------------------------
        orphan = copy_case(tmp / "orphan")
        (orphan / decl).rename(orphan / "0" / IROOT / "columnXX")
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

        # ---- (h) the RETIRED shape: a record outside internalStates/ ------
        misfiled = copy_case(tmp / "misfiled")
        (misfiled / "0" / "column16").mkdir()
        (misfiled / decl).rename(misfiled / "0" / "column16" / "stageProfile")
        shutil.rmtree(misfiled / "0" / IROOT)
        rc, out5, err5 = run_case(misfiled)
        blob = out5 + err5
        if rc == 0:
            problems.append("%s (the retired shape, 0/column16/stageProfile): the run "
                            "SUCCEEDED.  A record outside %s/ was skipped in "
                            "silence -- the case believes it was seeded and it was "
                            "not." % (SEEDED, IROOT))
        elif "MISFILED declared interior" not in blob:
            problems.append("%s (retired shape): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (f) two blocks in one file, the second unread ----------------
        two = copy_case(tmp / "two")
        f = two / decl
        txt = f.read_text()
        i = txt.index("stageProfile\n{")
        txt = txt + "\n" + txt[i:].replace("stageProfile\n{", "axialProfile\n{", 1)
        f.write_text(txt)
        rc, out6, err6 = run_case(two)
        blob = out6 + err6
        if rc == 0:
            problems.append("%s (two blocks, one unread): the run SUCCEEDED.  A "
                            "declared field nobody reads is a comment sitting in "
                            "the state directory -- or the reader parsed only the "
                            "first block." % SEEDED)
        elif "NOTHING reads it" not in blob or "axialProfile" not in blob:
            problems.append("%s (two blocks, one unread): refused, but not naming "
                            "the second block:\n    %s" % (SEEDED, blob.strip()[-300:]))
        else:
            notes.append("two blocks parsed from one file (the second refused by name)")

        # ---- (f) a block whose name is not a kind -------------------------
        bogus = copy_case(tmp / "bogus")
        f = bogus / decl
        txt = f.read_text()
        i = txt.index("stageProfile\n{")
        txt = txt + "\n" + txt[i:].replace("stageProfile\n{", "bogusBlock\n{", 1)
        f.write_text(txt)
        rc, out7, err7 = run_case(bogus)
        blob = out7 + err7
        if rc == 0:
            problems.append("%s (a block named bogusBlock): the run SUCCEEDED.  An "
                            "unknown block name must refuse by name." % SEEDED)
        elif "bogusBlock" not in blob or "not a kind" not in blob:
            problems.append("%s (unknown block): refused, but not by name:\n    %s"
                            % (SEEDED, blob.strip()[-300:]))

        # ---- (j) the stream/unit homonym ----------------------------------
        #  The column's distillate takes the column's own name.  Identity is
        #  (kind, sector, name): the stream `column16` and the unit `column16`
        #  live at different paths and the run must say so once.
        hom = copy_case(tmp / "homonym")
        fd = hom / "system" / "flowsheetDict"
        fdt = fd.read_text()
        if "distillate" not in fdt:
            problems.append("%s: its flowsheetDict names no `distillate` stream; the "
                            "homonym fixture cannot be built." % SEEDED)
        else:
            fd.write_text(re.sub(r'\bdistillate\b', "column16", fdt))
            (hom / "0" / "distillate").rename(hom / "0" / "column16")
            rc, out8, err8 = run_case(hom)
            blob = out8 + err8
            if rc != 0:
                problems.append("%s (homonym: stream and unit both named column16): the "
                                "run FAILED (rc=%d).  Two objects of different kinds "
                                "may share a name.\n    %s"
                                % (SEEDED, rc, blob.strip()[-300:]))
            else:
                s0, i0 = hom / "0" / "column16", hom / decl
                sc, ic = hom / VIEW / "column16", hom / VIEW / IROOT / "column16"
                if not (s0.is_file() and is_stream_state(s0) and i0.is_file()
                        and is_interior_record(i0)):
                    problems.append("(j) homonym: 0/column16 (stream) and %s (record) "
                                    "do not BOTH exist as their own kind." % decl)
                if "[seed] interior read from 0/" not in out8:
                    problems.append("(j) homonym: the interior was not read from 0/ "
                                    "beside the homonymous stream.")
                if not (sc.is_file() and is_stream_state(sc)):
                    problems.append("(j) homonym: converged/column16 is not a stream "
                                    "state file -- the interior overwrote it, or the "
                                    "stream was not written.")
                if not (ic.is_file() and is_interior_record(ic)):
                    problems.append("(j) homonym: converged/%s/column16 is not an "
                                    "interior record -- the stream overwrote it, or "
                                    "the interior was not written." % IROOT)
                if "[names] stream 'column16' and unit 'column16' share a name" not in out8:
                    problems.append("(j) homonym: the run did not announce the "
                                    "stream/unit homonym.  Identity is (kind, sector, "
                                    "name); a shared name is SAID, never refused and "
                                    "never silent.")
                else:
                    notes.append("homonym: stream column16 and unit column16 at two "
                                 "paths, announced")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_no_retired_shape(problems, notes):
    """(i) No interior record sits outside internalStates/ in any state view
    under tutorials/.  The sweep that retired the shape removed 85 such
    directories; this keeps them from coming back."""
    bad = []
    for view in list((ROOT / "tutorials").rglob("converged")) + \
                list((ROOT / "tutorials").rglob("0")):
        if not view.is_dir():
            continue
        for p in view.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(view)
            if rel.parts and rel.parts[0] == IROOT:
                continue
            if is_interior_record(p):
                bad.append(str(p.relative_to(ROOT)))
    if bad:
        problems.append("check_internal_states(i): an interior record sits OUTSIDE "
                        "%s/ in a state view -- the retired <view>/<SECTOR>/<unit>/"
                        "<kind> shape, or a misfiling: %s%s"
                        % (IROOT, ", ".join(bad[:5]),
                           " (+%d more)" % (len(bad) - 5) if len(bad) > 5 else ""))
    else:
        notes.append("no record outside %s/ in any state view under tutorials/" % IROOT)


def check_retired(problems, notes):
    """(k) The TOP-LEVEL view existed for one day.  It must be gone from the
    tree and from every line that could route output to it -- while the NAME
    lives on inside each state view as the interiors' own root."""
    stale = []
    for p in (ROOT / "tutorials").rglob(IROOT):
        if not p.is_dir():
            continue
        parent = p.parent.name
        if parent in ("0", VIEW) or re.fullmatch(r"\d+(\.\d+)?", parent):
            continue
        stale.append(str(p.relative_to(ROOT)))
    if stale:
        problems.append("check_internal_states(k): a top-level `%s/` directory still "
                        "exists at a case ROOT under tutorials/ (%s).  The view is "
                        "retired; the interiors live INSIDE 0/ and converged/."
                        % (IROOT, ", ".join(stale[:5])))
    tree = (ROOT / "gui/src/ui/caseTree.ts").read_text(errors="replace")
    m = re.search(r'RUN_OUTPUT_ROOTS[^=]*=\s*\[([^\]]*)\]', tree)
    roots = [x.strip().strip('"') for x in (m.group(1).split(",") if m else [])]
    if IROOT in roots:
        problems.append("check_internal_states(k): gui/src/ui/caseTree.ts lists %s as "
                        "a run-output ROOT.  It is not a root; it lives inside a "
                        "view, and a root would be a folder no writer produces."
                        % IROOT)
    worker = (ROOT / "gui/public/workers/solverWorker.js").read_text(errors="replace")
    if '"/case/%s/"' % IROOT in worker:
        problems.append("check_internal_states(k): the worker still walks a top-level "
                        "/case/%s/." % IROOT)
    gi = (ROOT / ".gitignore").read_text()
    hits = [n for n, line in enumerate(gi.splitlines(), 1)
            if IROOT in line and not line.lstrip().startswith("#")]
    if hits:
        problems.append("check_internal_states(k): .gitignore line(s) %s name `%s`.  "
                        "No rule may: converged/ already covers the engine's half, "
                        "and a rule on the name takes the AUTHORED 0/ half with it."
                        % (hits, IROOT))
    if not stale and IROOT not in roots and not hits:
        notes.append("no top-level %s/ view in the tree, the GUI roots or .gitignore" % IROOT)


def check_ignored(problems):
    """(l) Both halves of the snapshot, each on the right side of the line."""
    case = ROOT / FLAT
    written = case / VIEW / IROOT / "X"
    written.parent.mkdir(parents=True, exist_ok=True)
    written.write_text("")
    authored = case / "0" / IROOT / "X"
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
                "converged/%s/ is NOT gitignored.  The GUI bundle is a Vite glob "
                "over tutorials/*/*/**/* that inlines every match as a raw "
                "string: one machine's stale stage profile would ship." % IROOT)
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
        written.unlink(missing_ok=True)
        authored.unlink(missing_ok=True)
        for d in (case / VIEW / IROOT, case / "0" / IROOT):
            try:
                d.rmdir()
            except OSError:
                pass
        rec.unlink(missing_ok=True)
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/converged/**' not in tl:
        problems.append(
            "check_internal_states(l): gui/src/cases/tutorials.ts does not exclude "
            "converged/ from the case glob -- the second lock on the tree that now "
            "carries the unit interiors.")


def check_resolvers(problems, notes):
    """(m) The D11 audit's fixes, as source arms: a bare-name resolver that
    could hit either class must not come back.  A source arm because the
    alternative -- patching a source and rebuilding the engine -- is the
    2026-08-18 tree-poisoning shape."""
    ss = (ROOT / "src/streams/StreamStateIO.cpp").read_text(errors="replace")
    m = re.search(r'readStateDir\([^)]*\)\s*\{(.*?)\n\}', ss, re.S)
    body = m.group(1) if m else ""
    if '"%s"' % IROOT not in body:
        problems.append("check_internal_states(m): StreamStateIO::readStateDir no "
                        "longer skips the %s subtree by name.  It keys every "
                        "stream-looking file by its relative path, so a misfiled one "
                        "there becomes stream `%s.<x>` and the completeness "
                        "contract counts it." % (IROOT, IROOT))
    io = (ROOT / "src/io/InternalStateIO.cpp").read_text(errors="replace")
    hdr = (ROOT / "src/io/InternalStateIO.H").read_text(errors="replace")
    if 'ROOT = "%s"' % IROOT not in hdr:
        problems.append("check_internal_states(m): InternalStateIO.H no longer names "
                        "the root `%s` as its ONE constant." % IROOT)
    if "view / ROOT" not in io or "MISFILED declared interior" not in io:
        problems.append("check_internal_states(m): InternalStateIO::read no longer "
                        "walks the ROOT constant, or no longer refuses a record "
                        "found outside it (the retired shape would be skipped in "
                        "silence).")
    tree = (ROOT / "gui/src/ui/caseTree.ts").read_text(errors="replace")
    if "sectorPaths" in tree or "sectors?" in tree:
        problems.append("check_internal_states(m): gui/src/ui/caseTree.ts carries a "
                        "geography discriminator again.  A directory in a state "
                        "view is never a unit now; a rule that says it may be is "
                        "false, and false rules get read.")
    if 'INTERIOR_ROOT = "%s"' % IROOT not in tree:
        problems.append("check_internal_states(m): caseTree.ts no longer names "
                        "INTERIOR_ROOT = \"%s\"." % IROOT)
    intro = (ROOT / "gui/src/ui/CaseIntro.tsx").read_text(errors="replace")
    if "isRunOutput(" not in intro or re.search(r'kindOf\([^)]*\)\s*!==\s*"output"', intro):
        problems.append("check_internal_states(m): CaseIntro's keep-list reads the "
                        "KIND, not the VIEW -- a run output of kind \"interior\" "
                        "(converged/%s/<unit>) would be listed as a file the "
                        "student wrote." % IROOT)
    notes.append("resolvers carry the kind: readStateDir skips %s/, the reader walks "
                 "it alone, the GUI keeps no geography discriminator" % IROOT)


def check_source(problems):
    """(n) The exclusion, the boundary sentence and the two-way contract, at
    their source."""
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
        problems.append("%s: no stageProfile block was written." % FLAT)
    if "sizeDistribution" not in k1:
        problems.append("%s: no sizeDistribution block was written." % FRACTAL)
    if "swingTable" not in k3:
        problems.append("%s: the PSA profile is not filed as a swingTable block (%s)."
                        % (SWING, sorted(k3)))
    check_swept(problems, notes)
    check_round_trip(problems, notes)
    check_no_retired_shape(problems, notes)
    check_retired(problems, notes)
    check_ignored(problems)
    check_resolvers(problems, notes)
    check_source(problems)

    if problems:
        print("check_internal_states: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_internal_states: OK -- a state view carries the streams AND, under "
          "internalStates/, ONE file per unit: %d file(s) on the fractal witness, "
          "%d on the flat column and %d on the PSA bed, each at "
          "converged/internalStates/<SECTOR>/<unit> where the unit's STAMPED "
          "sector puts it (unitSectors from the JSON, never a split name; no "
          "level at all on a flat case), each block reproducing its unit's "
          "published profile value by value at 1e-9 (%s); no record answers to "
          "an unpublished profile; the T_K construction on the cooling tower "
          "produced no record and no internalStates/ and was announced; the swing "
          "table is filed as internal state.  THE ROUND TRIP HOLDS: the witness "
          "ships the file converged/ wrote, announces `[seed] interior read from "
          "0/`, reproduces its own golden, and the same case with the declaration "
          "removed announces the other route (%s); a stage count wrong by one, an "
          "orphan file, the RETIRED one-directory-per-unit shape, a second block "
          "nobody reads and a block that is not a kind each REFUSE by name (a unit "
          "WRITING two kinds has no live case: the result record holds one profile "
          "per unit).  THE HOMONYM: a stream and a unit both named column16 live "
          "at two paths, neither overwritten, and the run says so once.  No record "
          "sits outside internalStates/ in any state view under tutorials/; the "
          "retired top-level view is gone from the tree, the GUI roots and "
          ".gitignore; what the run writes is gitignored, what the case declares "
          "is not, docs/design/ stays committable, and the glob's second lock is "
          "on converged/.  THE RESOLVERS CARRY THE KIND: readStateDir skips "
          "internalStates/ by name, the interior reader walks it alone and "
          "refuses a record found elsewhere, the GUI keeps no geography "
          "discriminator and its keep-list reads the view.  NOT CHECKED: whether "
          "a declared profile is RIGHT (it is a SEED, not an answer), the engine's "
          "parser on any kind but stageProfile, a unit writing two kinds (none "
          "exists), the V/z/z_m/position axes and the two undeclared ones beyond "
          "the suite running them, iterations/ and the dynamic instants (neither "
          "carries interiors), the ownership rule's sector (it reads the same "
          "STAMP since 2026-09-06 and check_sector_hierarchy arm (g) holds "
          "it), and the browser harvest."
          % (n1, n2, n3, "; ".join(notes[:3]),
             next((n for n in notes if n.startswith("round trip")), "not measured")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
