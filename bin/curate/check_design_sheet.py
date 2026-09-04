#!/usr/bin/env python3
"""Gate: the equipment SPECIFICATION SHEET a run writes says what the run
computed -- and a case with no hierarchy grows no hierarchy.

    bin/curate/check_design_sheet.py

WHY THIS EXISTS.  A student hands in a final-year project and somebody has to
audit it, per unit operation: what goes in, what comes out, what was sized,
what it costs.  Until 2026-09-04 those three answers lived in three unrelated
places -- the inlets and outlets ONLY inside `iterations/` (numerical history,
opt-in, off by default), the sizing only in two flat CSVs and on the screen,
the cost only beside it.  `design/` was a directory NAME ratified in
`docs/architecture/stream-state-architecture.md` two months earlier that
nothing wrote.

The sheets are written by `src/io/DesignSheetWriter.cpp` to
`design/<SECTOR>/<unit>/<equipmentTag>`, one dictionary per physical item,
regenerated whole on every run exactly as `converged/` is.

WHAT THIS CHECKS:

  (a) EVERY SIZED UNIT HAS A SHEET, AT THE RIGHT ADDRESS.  For the fractal
      witness, one file per row of `sizing.csv`, under that row's OWN sector
      directory, named by that row's equipment type.  The expected path is
      built from the CSV -- never by splitting the unit name -- so a writer
      that recovered the sector from the name would still have to agree with
      the column that was stamped.

  (b) THE SHEET REPRODUCES THE SIZING, VALUE AND UNIT.  Every `sizing {}`
      entry matches `sizing.csv`'s cell for the same key, and every entry
      carries a unit word (or is dimensionless).  This is the arm that fires
      the day a sizer writes `d.values[...]` past the one door.

  (c) THE SHEET REPRODUCES THE COST.  `purchased`, `bareModule` and
      `totalModule` match `costs.csv` for the same unit.  Two projections of
      one computed record must not disagree.

  (d) THE PORTS CLOSE, AGAINST A REPORT THIS WRITER DOES NOT PRODUCE.  The
      sheet's inlet mass flows sum to its outlet mass flows, and both equal
      the unit's row in `massBalance_byUnit.csv`.  This is the strongest arm
      and it is why it exists: the first draft of the writer computed the
      port mass as `F * Sigma z_i MW_i` and printed it as `mdot`, which on a
      crystalliser slurry silently omits the crystals -- 437 kg/h short on
      this very case while the unit's own balance closed at 100.0000 %.  That
      is the flash21 defect Vitor reported on 2026-08-09, reappearing in a
      new surface; `StreamMass::F_massTotal` exists to stop it and its header
      says balance and stream-table surfaces call the total.  An arm that
      only read the sheet could never have seen it.

  (e) THE REFUSAL EXISTS, checked at its SOURCE.  `DesignSheetWriter.cpp`
      must throw on an empty declared unit, naming the key and the remedy.
      This is a source arm, not a built one, and the reason is a rule this
      project paid for on 2026-08-18: a gate that patches sources and rebuilds
      the engine is the shape that poisoned the tree, because `finally` does
      not run against the SIGKILL `gate_manifest.py` uses to time gates out.
      `check_gate_selftest` is the ONE gate allowed to do that, and only under
      `destructive_session.py`'s disk journal.  The first draft of THIS gate
      did exactly the forbidden thing -- patched `StirredTank.cpp`, ran `make`,
      and rebuilt again in a `finally` -- and it is written down here rather
      than quietly deleted.

      The refusal was verified BY HAND instead, once, under the journal:
      `d.set("V_R", V_R, "m3")` in `StirredTank.cpp` was replaced by
      `d.values["V_R"] = V_R;`, the tree rebuilt, and
      `process02_with_design` run.  It printed

          WARNING: the equipment specification sheets were not written:
            design sheet: unit 'reactor' declares a sizing value 'V_R' with
            NO UNIT. ...  d.set("V_R", value, "m3");   // or kW, bar, kg, -

      and wrote no sheet for that unit.  Restored, rebuilt, gate re-run to
      exit 0.  A source arm cannot prove the message fires; it can prove the
      guard was not deleted, which is what regresses.

      THAT SABOTAGE FOUND A SECOND DEFECT, which is why it was worth doing by
      hand rather than trusting the guard's existence.  The refusal was a
      `throw` from inside the per-unit loop, so it aborted the whole walk: on
      this two-unit case `heater`'s sheet was already on disk, `reactor`'s was
      refused, and the run left a PARTIAL `design/` tree with one line on
      stderr -- a directory that lies by omission, which a reader opens and
      reads as complete.  That is the failure the report chain was fixed for
      on 2026-08-27.  A refused unit is now skipped BY NAME, writes no sheet
      at all (a sheet missing a value it should carry is worse than an absent
      one, because a reader cannot tell), every other unit still gets its
      page, and the refusals are printed together and ALWAYS -- not only when
      the run was asked to speak.  Re-fired after the fix: `[design] wrote 1
      specification sheet (1 refused, above)`, with `heater/shellTubeHX`
      present and `reactor/` absent.

  (f) FLAT STAYS FLAT.  The flat witness's sheets sit at `design/<unit>/`
      with NO sector level -- not a directory called `root`, not an empty
      one.  Empty is not a sector.

  (g) THE TREE CANNOT BE COMMITTED.  `git check-ignore` must reject a path
      under a tutorial's `design/`, AND must NOT reject a new file under
      `docs/design/`.  Both directions, because the obvious rule (`**/design/`)
      silently swallows this project's design RECORDS: the 135 already tracked
      would survive and every new one would be ignored without a word.  The
      first direction matters because the GUI bundle is a Vite glob over
      `tutorials/*/*/**/*` that inlines every match as a raw string -- a
      committable run output is a run output baked into the shipped site.

  (h) THE SHEET IS A DICTIONARY, structurally.  Balanced braces, every
      non-comment statement terminated, `recordType designSheet;` present.
      See the blind spot below.

WHAT THIS DOES NOT CHECK, said plainly:

  * THAT THE ENGINE'S OWN PARSER ACCEPTS IT.  Arm (h) is a structural check
    written in Python, not a round trip through `Dictionary::fromFile`.  A
    writer whose output the reader refuses is a bug in BOTH, and nothing here
    would catch a grammar the C++ parser rejects for a subtler reason.  The
    day anything READS a sheet back, that reader is the check and this arm
    should be replaced by it rather than kept beside it.
  * WHETHER ANY NUMBER IS RIGHT.  A wrong area reproduces into a sheet as
    faithfully as a right one.  Arms (b) and (c) check AGREEMENT between
    surfaces; arm (d) checks a conservation law, which is the only arm here
    that could notice a wrong number at all, and only for mass.
  * NESTING DEEPER THAN ONE LEVEL.  No corpus case nests sectors inside
    sectors (measured: 2 of 423 cases use sector folders at all, both one
    level), so the `<SECTOR>` component is never a dotted chain here.
  * THE GUI.  The case file tree groups by the FIRST path segment and draws
    the rest as one row, so `design/` reaches the browser as a flat list.
    Making it a real tree is separate work and needs its own arm.
  * EVERY CASE.  Two witnesses, one fractal and one flat, chosen because
    between them they exercise both address shapes.  Only 9 of 233 steady
    tutorials declare a `sizing {}` block at all.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"
FLAT    = "tutorials/steady/flowsheets/process02_with_design"

TOL = 1.0e-6      # relative, between two projections of the same number


def run_case(rel: str):
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(ROOT / rel)],
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def find_csv(rel: str, report: str, name: str):
    for p in (ROOT / rel / "reports" / report / name,
              ROOT / rel / "postProcessing" / report / "0" / name):
        if p.is_file():
            return p
    return None


def csv_rows(path):
    if path is None or not path.is_file():
        return None, []
    lines = [l for l in path.read_text(errors="replace").splitlines() if l.strip()]
    if not lines:
        return None, []
    return lines[0].split(","), [l.split(",") for l in lines[1:]]


def parse_sheet(text: str):
    """The sheet, as a reader sees it.  Deliberately a SMALL reader: it pulls
    the header words, the `sizing {}` entries with their units, the `cost {}`
    scalars and each port's mdot.  It is not a dict parser and does not
    pretend to be one -- see the blind spot in the docstring."""
    #  Strip block comments and line comments before anything else.
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    t = re.sub(r'//[^\n]*', '', t)

    out = {"header": {}, "sizing": {}, "cost": {}, "inlets": [], "outlets": []}

    for k in ("recordType", "unit", "sector", "equipment", "material"):
        m = re.search(r'^\s*%s\s+"?([^";\n]+)"?\s*;' % k, t, re.M)
        if m:
            out["header"][k] = m.group(1).strip()

    def block(name):
        m = re.search(r'^%s\s*\n\{' % name, t, re.M)
        if not m:
            return ""
        i = t.index("{", m.start())
        depth, j = 0, i
        while j < len(t):
            if t[j] == "{":
                depth += 1
            elif t[j] == "}":
                depth -= 1
                if depth == 0:
                    return t[i + 1:j]
            j += 1
        return ""

    #  sizing:  `key   value unit;`   (unit absent for a dimensionless value)
    for line in block("sizing").splitlines():
        #  A dimensionless value is `key [0 0 0 0 0] value;` -- the grammar's
        #  bracket form.  It is READ here as a declared unit ("-"), because a
        #  declared absence of dimension is not the same fact as a missing
        #  declaration, and the whole point of the format is that the file
        #  says which.
        m = re.match(r'\s*([A-Za-z_][\w]*)\s+\[([-\d ]+)\]\s+([-\d.eE+]+)\s*;', line)
        if m:
            out["sizing"][m.group(1)] = (float(m.group(3)), "-")
            continue
        m = re.match(r'\s*([A-Za-z_][\w]*)\s+([-\d.eE+]+)\s*([A-Za-z0-9/().*_]*)\s*;',
                     line)
        if m:
            out["sizing"][m.group(1)] = (float(m.group(2)), m.group(3))

    for line in block("cost").splitlines():
        m = re.match(r'\s*(purchased|bareModule|totalModule)\s+([-\d.eE+]+)\s*;', line)
        if m:
            out["cost"][m.group(1)] = float(m.group(2))

    for side in ("inlets", "outlets"):
        b = block(side)
        for m in re.finditer(r'mdot\s+([-\d.eE+]+)\s*kg/s\s*;', b):
            out[side].append(float(m.group(1)))

    return out


def close(a, b, tol=TOL):
    d = max(abs(a), abs(b), 1.0e-30)
    return abs(a - b) / d <= tol


def check_case(rel, expect_sector, problems, notes):
    rc, _, err = run_case(rel)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d) -- nothing to check.\n    %s"
                        % (rel, rc, err.strip()[:300]))
        return 0

    head, rows = csv_rows(find_csv(rel, "design", "sizing.csv"))
    if head is None:
        problems.append("%s: no sizing.csv -- this case is supposed to size." % rel)
        return 0
    iu = head.index("unit")
    ity = head.index("equipmentType")
    isec = head.index("sector") if "sector" in head else None

    chead, crows = csv_rows(find_csv(rel, "economics", "costs.csv"))
    costs = {}
    if chead and "unit" in chead:
        cu = chead.index("unit")
        for r in crows:
            if r[cu] in ("TOTAL",) or r[cu].startswith("SUBTOTAL"):
                continue
            costs[r[cu]] = {k: float(r[chead.index(k)])
                            for k in ("C_purchased", "C_bare_module", "C_total_module")
                            if k in chead and chead.index(k) < len(r)}

    #  The per-unit mass balance, written by a DIFFERENT pass than the sheet.
    mb = find_csv(rel, "massBalance", "massBalance_byUnit.csv")
    mhead, mrows = csv_rows(mb)
    balance = {}
    if mhead and "unit" in mhead:
        mu = mhead.index("unit")
        for r in mrows:
            try:
                balance[r[mu]] = (float(r[mhead.index("in_kg_per_h")]),
                                  float(r[mhead.index("out_kg_per_h")]))
            except (ValueError, IndexError):
                pass

    checked = 0
    for r in rows:
        unit, etype = r[iu], r[ity]
        sector = r[isec] if isec is not None else ""
        if sector in ("(no sector)",):
            sector = ""

        # ------------------------------------------------------------ (a)(f)
        leaf = unit
        d = ROOT / rel / "design"
        if sector:
            d = d / sector
            if leaf.startswith(sector + "."):
                leaf = leaf[len(sector) + 1:]
        path = d / leaf / etype
        if not path.is_file():
            problems.append(
                "%s: unit '%s' is in sizing.csv and has NO specification sheet "
                "at design/%s -- published as sized, absent where a reader "
                "audits."
                % (rel, unit, path.relative_to(ROOT / rel / 'design')))
            continue

        if not expect_sector:
            #  A flat case must grow no sector level at all: the sheet's
            #  parent's parent is `design/` itself.
            if path.parent.parent != ROOT / rel / "design":
                problems.append(
                    "%s: flat case grew a directory level under design/ (%s). "
                    "Empty is not a sector called 'root'."
                    % (rel, path.relative_to(ROOT / rel)))

        sheet = parse_sheet(path.read_text(errors="replace"))
        checked += 1

        # ---------------------------------------------------------------- (h)
        if sheet["header"].get("recordType") != "designSheet":
            problems.append("%s: %s carries no `recordType designSheet;`."
                            % (rel, unit))
        if sheet["header"].get("unit") != unit:
            problems.append("%s: %s's sheet names unit '%s'."
                            % (rel, unit, sheet["header"].get("unit")))
        raw = path.read_text(errors="replace")
        body = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)
        body = re.sub(r'//[^\n]*', '', body)
        if body.count("{") != body.count("}"):
            problems.append("%s: %s's sheet has unbalanced braces (%d vs %d)."
                            % (rel, unit, body.count("{"), body.count("}")))

        # ---------------------------------------------------------------- (b)
        for k in head:
            if k in ("unit", "sector", "equipmentType", "material", "basis"):
                continue
            cell = r[head.index(k)] if head.index(k) < len(r) else ""
            if not cell.strip():
                continue          # this unit does not carry that key
            if k not in sheet["sizing"]:
                problems.append(
                    "%s: %s's sheet omits sizing key '%s', which sizing.csv "
                    "carries (%s)." % (rel, unit, k, cell))
                continue
            val, unitword = sheet["sizing"][k]
            if not close(val, float(cell), 1.0e-4):
                problems.append(
                    "%s: %s's sheet says %s = %g, sizing.csv says %s -- two "
                    "projections of one record disagreeing."
                    % (rel, unit, k, val, cell))
            if unitword == "":
                problems.append(
                    "%s: %s's sizing value '%s' carries NO UNIT.  Every value "
                    "must declare it where it is computed "
                    "(`d.set(\"%s\", v, \"m3\")`); writing `d.values[...]` "
                    "bypasses the one door that records it."
                    % (rel, unit, k, k))

        # ---------------------------------------------------------------- (c)
        if unit in costs and sheet["cost"]:
            for sheetKey, csvKey in (("purchased", "C_purchased"),
                                     ("bareModule", "C_bare_module"),
                                     ("totalModule", "C_total_module")):
                if sheetKey in sheet["cost"] and csvKey in costs[unit]:
                    if not close(sheet["cost"][sheetKey], costs[unit][csvKey], 1.0e-4):
                        problems.append(
                            "%s: %s's sheet says %s = %g, costs.csv says %g."
                            % (rel, unit, sheetKey, sheet["cost"][sheetKey],
                               costs[unit][csvKey]))

        # ---------------------------------------------------------------- (d)
        if unit in balance and sheet["inlets"] and sheet["outlets"]:
            sin  = sum(sheet["inlets"])  * 3600.0
            sout = sum(sheet["outlets"]) * 3600.0
            bin_, bout = balance[unit]
            if not close(sin, bin_, 1.0e-3):
                problems.append(
                    "%s: %s's sheet inlet mass sums to %.4f kg/h; "
                    "massBalance_byUnit.csv says %.4f.  A port mass that is "
                    "not `StreamMass::F_massTotal` drops the crystals."
                    % (rel, unit, sin, bin_))
            if not close(sout, bout, 1.0e-3):
                problems.append(
                    "%s: %s's sheet outlet mass sums to %.4f kg/h; "
                    "massBalance_byUnit.csv says %.4f."
                    % (rel, unit, sout, bout))
            notes.append("%s in=%.1f out=%.1f kg/h" % (unit, sin, sout))

    return checked


def check_refusal(problems):
    """(e) The guard is still there, read at its source.  NOT built and NOT
    run: a gate that patches a source and rebuilds the engine is the 2026-08-18
    shape, and `check_gate_selftest` is the only gate permitted it."""
    src = (ROOT / "src/io/DesignSheetWriter.cpp").read_text(errors="replace")
    if 'u.empty()' not in src or 'NO UNIT' not in src:
        problems.append(
            "check_design_sheet(e): DesignSheetWriter no longer refuses a "
            "sizing value with no declared unit.  Without it a sheet ships a "
            "number whose unit nobody knows, and a plausible default would be "
            "the hand-written unit table this slice deleted, one indirection "
            "further away.")
    if 'd.set(' not in src:
        problems.append(
            "check_design_sheet(e): the refusal no longer names `set()` as the "
            "remedy.  A refusal that does not say what to do instead is advice "
            "the reader cannot act on.")
    #  And the one door is still the only door.
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*.cpp")):
        if "values[" in f.read_text(errors="replace"):
            problems.append(
                "%s writes `values[...]` directly, past `set()` -- the one "
                "call that records the unit beside the value."
                % f.relative_to(ROOT))


def check_ignored(problems):
    """(g) Both directions of the .gitignore rule."""
    case_file = ROOT / FRACTAL / "design" / "X" / "Y" / "z"
    case_file.parent.mkdir(parents=True, exist_ok=True)
    case_file.write_text("")
    rec = ROOT / "docs" / "design" / "__gate_probe.md"
    rec.write_text("")
    try:
        r1 = subprocess.run(["git", "check-ignore", "-q", str(case_file)],
                            cwd=ROOT, capture_output=True)
        if r1.returncode != 0:
            problems.append(
                "check_design_sheet(g): a tutorial's design/ output is NOT "
                "gitignored.  The GUI bundle is a Vite glob over "
                "tutorials/*/*/**/* that inlines every match as a raw string, "
                "so a committable run output is one machine's stale sizing "
                "baked into the shipped site.")
        r2 = subprocess.run(["git", "check-ignore", "-q", str(rec)],
                            cwd=ROOT, capture_output=True)
        if r2.returncode == 0:
            problems.append(
                "check_design_sheet(g): a NEW file under docs/design/ is "
                "ignored.  The 135 already tracked survive (git never ignores "
                "a tracked file) and every new design RECORD would vanish in "
                "silence, in a tree whose own rule is to write the record "
                "before promoting.")
    finally:
        shutil.rmtree(ROOT / FRACTAL / "design" / "X", ignore_errors=True)
        rec.unlink(missing_ok=True)

    #  The second lock: the glob exclusion, so the rule survives a .gitignore edit.
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/design/**' not in tl:
        problems.append(
            "check_design_sheet(g): gui/src/cases/tutorials.ts does not "
            "exclude design/ from the case glob.  The .gitignore is one edit "
            "away from being gone and this is the second lock.")


def main() -> int:
    problems, notes = [], []

    n1 = check_case(FRACTAL, True,  problems, notes)
    n2 = check_case(FLAT,    False, problems, notes)

    if n1 == 0:
        problems.append("%s: no sheet was checked at all -- the arms above "
                        "cannot fire." % FRACTAL)
    if n2 == 0:
        problems.append("%s: no sheet was checked at all." % FLAT)

    check_ignored(problems)
    check_refusal(problems)

    if problems:
        print("check_design_sheet: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_design_sheet: OK -- %d specification sheet(s) on the fractal "
          "witness and %d on the flat one, each at the address its own "
          "sizing.csv row dictates (sector directory where the row names a "
          "sector, NO extra level where it does not); every `sizing {}` entry "
          "reproduces that row's cell AND carries a declared unit, every "
          "`cost {}` reproduces costs.csv, and each sheet's inlet and outlet "
          "mass flows sum to the unit's own row in massBalance_byUnit.csv "
          "(%s) -- a report this writer does not produce, which is the only "
          "arm that could catch a port mass computed without the crystals.  A "
          "refusal for a value with no declared unit is still in the writer, "
          "and no sizer writes past `set()` (a SOURCE arm: a gate that "
          "rebuilds the engine is the 2026-08-18 shape, so the refusal was "
          "fired by hand under the journal instead -- see the docstring).  The tree is gitignored and excluded from the GUI case "
          "glob, and a NEW file under docs/design/ is NOT ignored -- both "
          "directions, because the obvious rule swallows this project's "
          "design records.  NOT CHECKED: that the engine's own parser accepts "
          "a sheet (arm (h) is structural, written in Python; the day anything "
          "reads one back, that reader replaces this arm), whether any number "
          "is RIGHT, nesting deeper than one level (no corpus case nests "
          "twice), the GUI's file tree (which groups by the first path segment "
          "and would draw design/ flat), and every case but these two."
          % (n1, n2, "; ".join(notes[:3]) if notes else "no balance rows read"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
