#!/usr/bin/env python3
"""Gate: the `internalStates/` tree a run writes is a faithful PROJECTION of
the profiles the same run publishes -- every published profile that is
equipment state has a file at the address its stamped sector dictates, every
file reproduces the JSON to the digit, a swept-parameter construction gets no
file, and a flat case grows no hierarchy.

    bin/curate/check_internal_states.py

WHY THIS EXISTS.  `internalStates/` was a directory NAME -- ratified in the
stream-state architecture, listed in the GUI's `RUN_OUTPUT_ROOTS`, drawn in the
nine-line student language as "what happens inside it" -- that nothing wrote,
and every document that named it said so in a parenthesis ("named; not written
yet").  The record it projects already existed four times over: a unit's
`UnitOperation::profile()` reaches `SimulationResult::profiles`, the result
JSON's `profiles` block, the Plot tab and `profile.csv`.  The writer
(`src/io/InternalStateWriter.cpp`) adds a fifth surface for the SAME record and
computes nothing.  Five surfaces of one record is exactly the shape where one
drifts in silence, so this gate holds the new one to the machine channel.

WHAT THIS CHECKS:

  (a) PUBLISHED IS WRITTEN, AT THE STAMPED ADDRESS.  On the fractal witness,
      every unit whose JSON `profiles` entry carries an equipment-state axis
      has a file at `internalStates/<SECTOR>/<leaf>/<kind>`, where `<SECTOR>`
      is that unit's entry in the JSON's own `unitSectors` map -- the sector
      as DATA, never a split of the dotted name -- and `<kind>` is derived
      from the axis by the same table the writer uses (recounted here, so a
      writer that renamed a kind must still agree with the file name the axis
      dictates).

  (b) WRITTEN IS PUBLISHED.  No file under `internalStates/` names a unit the
      JSON does not publish a profile for -- a stale file from a previous
      topology, or a file for a unit that was declined, is a claim the run
      did not make.

  (c) THE FILE REPRODUCES THE JSON, VALUE BY VALUE.  `nPoints` equals the
      length of the axis column; every column named in the JSON is in the
      file with the same length, and every value agrees to 1e-9 relative
      (both are written at 12 significant digits from the same double, so
      the tolerance is round-off, not slack); the markers agree in count,
      position and label.

  (d) A SWEPT PARAMETER IS NOT EQUIPMENT STATE.  On the `T_K` witness (the
      cooling tower's Merkel construction), the run publishes a profile and
      the writer produces NO file and NO directory -- and says so.  This is
      the boundary sentence made checkable: internal state is a field over a
      coordinate of the equipment or its inventory; a construction over a
      parameter sweep is an analysis and stays in the reports.

  (e) FLAT STAYS FLAT.  The flat witness's file sits at
      `internalStates/<unit>/<kind>`, with no sector level and no `sector`
      key -- empty is not a sector called "root".

  (f) THE SWING TABLE IS INTERNAL STATE.  The PSA witness's file is named
      `swingTable` (Vítor's ruling, 2026-09-05: loadings per component are an
      INVENTORY of the bed).

  (g) THE TREE CANNOT BE COMMITTED, AND THE RECORDS CAN.  `git check-ignore`
      must reject a path under a tutorial's `internalStates/` and must NOT
      reject a new file under `docs/design/`; and `gui/src/cases/tutorials.ts`
      must exclude `internalStates/**` from the case glob -- the second lock,
      because the first is one `.gitignore` edit away and the failure is a
      stale run output baked into the shipped site.

  (h) THE FILE IS A DICTIONARY, structurally: balanced braces and parentheses,
      `recordType internalState;` present, every column a `name ( ... );`
      entry.  See the blind spot below.

  (i) THE EXCLUSION IS STILL IN THE WRITER, read at its source: `kindOf`
      returns the empty kind for `T_K`, and the header carries the boundary
      sentence.  A source arm, because a gate that patches a source and
      rebuilds the engine is the 2026-08-18 tree-poisoning shape.

WHAT THIS DOES NOT CHECK, said plainly:

  * THAT THE ENGINE'S OWN PARSER ACCEPTS A FILE.  Arm (h) is a structural
    check in Python, not a round trip through `Dictionary::fromFile`.  The
    day anything reads one back, that reader replaces this arm.
  * WHETHER ANY PROFILE IS RIGHT.  A wrong stage temperature projects as
    faithfully as a right one.  This gate checks AGREEMENT between two
    surfaces of one record; the goldens' `csv` kind pins the values a case
    chose to pin.
  * EVERY AXIS.  Four witnesses cover `L_micron`/`diameter_micron` (the
    fractal plant), `stage` with a marker (the flat column), `T_K` (the
    exclusion) and `componentIndex` (the swing table).  `V`, `z`, `z_m`,
    `position` and the two undeclared axes in the corpus (`module`,
    `chainLength`) are exercised by the suite's cases running through the
    same writer, not by an arm here.
  * NESTING DEEPER THAN ONE LEVEL, and the GUI (the Case tree is recursive
    since 2026-09-05 and carries its own tests; the harvest channel is one
    entry in `OUTPUT_ROOTS` and is not exercised outside a browser).
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"                # sectors, sizeDistribution x2
FLAT    = "tutorials/steady/distillation/column09_tray_hydraulics"  # stageProfile + marker
SWEPT   = "tutorials/steady/heat/coolingTower01_merkel"           # T_K: NO file
SWING   = "tutorials/steady/separation/psa01_h2_psa"              # componentIndex -> swingTable

TOL = 1.0e-9

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


def run_case(rel):
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(ROOT / rel)],
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


def check_case(rel, expect_sector, problems, notes):
    """Arms (a)(b)(c)(e)(h) on one case.  Returns the number of files checked
    and the set of kinds seen."""
    rc, out, err = run_case(rel)
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
    tree = ROOT / rel / "internalStates"

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
        d = tree
        if sector:
            d = d / sector
        d = d / leaf_of(unit, sector) / kind
        expected[d] = (unit, prof)

    # ---------------------------------------------------------------- (b)
    on_disk = set(p for p in tree.rglob("*") if p.is_file()) if tree.is_dir() else set()
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
        if not expect_sector and path.parent.parent != tree:
            problems.append("%s: flat case grew a directory level under "
                            "internalStates/ (%s).  Empty is not a sector called "
                            "'root'." % (rel, path.relative_to(ROOT / rel)))

        raw = path.read_text(errors="replace")
        f = parse_file(raw)
        h = f["header"]
        # ------------------------------------------------------------ (h)
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
    """(d) The T_K witness: a profile is published, no file and no directory
    is written, and the run says why."""
    rc, out, err = run_case(SWEPT)
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
    tree = ROOT / SWEPT / "internalStates"
    if tree.exists():
        files = [str(p.relative_to(ROOT / SWEPT)) for p in tree.rglob("*") if p.is_file()]
        problems.append("%s: internalStates/ exists for a case whose only profile "
                        "is a T_K construction (%s).  A Merkel diagram is an "
                        "analysis over a swept parameter, not equipment state."
                        % (SWEPT, files or "empty directory"))
    if "T_K" not in out or "NOT written" not in out:
        problems.append("%s: the declined T_K profile was not ANNOUNCED.  A skipped "
                        "profile the reader cannot see is a silent drop." % SWEPT)
    notes.append("T_K declined and announced on %s (%s)" % (SWEPT.split("/")[-1], ", ".join(tk)))


def check_ignored(problems):
    """(g) Both directions of the .gitignore rule, plus the glob lock."""
    case_file = ROOT / FRACTAL / "internalStates" / "X" / "Y" / "z"
    case_file.parent.mkdir(parents=True, exist_ok=True)
    case_file.write_text("")
    rec = ROOT / "docs" / "design" / "__gate_probe_internal.md"
    rec.write_text("")
    try:
        r1 = subprocess.run(["git", "check-ignore", "-q", str(case_file)],
                            cwd=ROOT, capture_output=True)
        if r1.returncode != 0:
            problems.append(
                "check_internal_states(g): a tutorial's internalStates/ output is "
                "NOT gitignored.  The GUI bundle is a Vite glob over "
                "tutorials/*/*/**/* that inlines every match as a raw string.")
        r2 = subprocess.run(["git", "check-ignore", "-q", str(rec)],
                            cwd=ROOT, capture_output=True)
        if r2.returncode == 0:
            problems.append(
                "check_internal_states(g): a NEW file under docs/design/ is "
                "ignored -- the rule swallowed this project's design records.")
    finally:
        shutil.rmtree(ROOT / FRACTAL / "internalStates" / "X", ignore_errors=True)
        rec.unlink(missing_ok=True)
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/internalStates/**' not in tl:
        problems.append(
            "check_internal_states(g): gui/src/cases/tutorials.ts does not "
            "exclude internalStates/ from the case glob -- the second lock.")


def check_source(problems):
    """(i) The exclusion and the boundary sentence, at their source."""
    cpp = (ROOT / "src/io/InternalStateWriter.cpp").read_text(errors="replace")
    hdr = (ROOT / "src/io/InternalStateWriter.H").read_text(errors="replace")
    if 'xAxis == "T_K"' not in cpp:
        problems.append("check_internal_states(i): InternalStateWriter::kindOf no "
                        "longer excludes the T_K axis by name.")
    if "construction over a parameter sweep" not in hdr:
        problems.append("check_internal_states(i): the writer's header no longer "
                        "states the boundary (a field over a coordinate of the "
                        "equipment or its inventory vs a construction over a "
                        "parameter sweep).")
    #  The harvest list: the tree must reach the browser.
    wk = (ROOT / "gui/public/workers/solverWorker.js").read_text(errors="replace")
    if '"internalStates"' not in wk:
        problems.append("check_internal_states(i): solverWorker.js OUTPUT_ROOTS "
                        "does not list internalStates -- the tree is written into "
                        "MEMFS and thrown away with it.")


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
    check_ignored(problems)
    check_source(problems)

    if problems:
        print("check_internal_states: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_internal_states: OK -- %d file(s) on the fractal witness, %d on "
          "the flat column and %d on the PSA bed, each at the address its unit's "
          "STAMPED sector dictates (unitSectors from the JSON, never a split "
          "name; no level at all on a flat case), each reproducing its unit's "
          "published profile value by value at 1e-9 (%s); no file answers to an "
          "unpublished profile; the T_K construction on the cooling tower "
          "produced no file and no directory and was announced; the swing table "
          "is filed as internal state; the tree is gitignored and excluded from "
          "the GUI glob while docs/design/ stays committable; the exclusion and "
          "the boundary sentence are still at their source.  NOT CHECKED: that "
          "the engine's own parser accepts a file (structural arm only), whether "
          "any profile is RIGHT (agreement between two surfaces, not truth), the "
          "V/z/z_m/position axes and the two undeclared ones (module, "
          "chainLength) beyond the suite running them, nesting deeper than one "
          "level, and the browser harvest itself."
          % (n1, n2, n3, "; ".join(notes[:4])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
