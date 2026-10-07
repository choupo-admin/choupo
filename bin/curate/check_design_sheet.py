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

  (k) EVERY SIZING UNIT WORD IS ONE THE PARSER CAN READ -- it survives
      `Dictionary.cpp::isWordChar` and `core/Units.cpp` registers it.  Both
      sets are READ from those sources, never listed here.

      THIS ARM CLOSES THE BLIND SPOT THIS GATE DECLARED FOR ITSELF, and it
      fired the moment it was written.  The old text said: "a writer whose
      output the reader refuses is a bug in BOTH, and nothing here would catch
      a grammar the C++ parser rejects ... the day anything READS a sheet back,
      that reader is the check".  A reader was built on 2026-09-07 -- the GUI's
      printable exchanger datasheet -- and the FIRST sheet it opened would not
      parse.  Three unit words were unreadable: `W/(m2.K)` (`ShellTubeHX`;
      `(` is not a word character, so the tokenizer hands the parser `W/` and
      stops) and `um` + `rpm` (`SprayDryerSize`; `core/Units.cpp` has no name
      for either).  Every exchanger and every spray-dryer sheet the engine had
      ever written was a file its own `Dictionary` refuses, under a header
      reading "It is a Choupo dictionary: every value carries the unit it is
      in, named as the dict grammar names it".

      Verified BY HAND against the engine rather than deduced from the
      tokenizer -- a case dict carrying `U 600.0 W/(m2.K);` gives
      `ERROR: system/postDict:45:41: unknown unit suffix 'W/' after scalar
      value of 'U'` -- and NOT by patching a source and rebuilding, which is
      the 2026-08-18 shape only `check_gate_selftest` may take.

      `W/(m2.K)` is fixed to `W/m2/K`: the same unit at the same factor 1.0 in
      the same table, so NO number moved, and `docs/ai/dict-syntax.md` already
      called it "the one parseable spelling".  `um` and `rpm` are NOT fixed,
      because the remedy converts a VALUE and the 2026-09-04 slice reserved
      that class in its own words; they are pinned in
      `SHEET_UNIT_WORDS_UNPARSEABLE` with remedy and blocker, and
      the stale-pin half fails if either stops appearing.

  (n) A CATALYST BED IS SIZED FROM ITS OWN KINETIC VOLUME, AND ITS CHARGE
      IS PRICED ONLY FROM WHAT THE CASE DECLARES (2026-09-26).  On
      `ammoniaStaged04_kinetic` -- a `pfr` whose `V_R` a designSpec SOLVES,
      the first case where the post-processing chain runs on an outer
      driver's representative pass -- the converter's `shell` sheet carries
      the SAME `V_R` the unit's own KPI publishes in the result JSON (to the
      sheet's own printed precision); its `catalystCharge` sheet's mass is
      RECOMPUTED here as V_R x the `catalystBulkDensity` read from the case
      postDict; its purchased cost is RECOMPUTED as that mass x the declared
      `catalystPrice`, and equals its bare-module and total-module costs (no
      index, no F_BM), while the shell's total-module cost EXCEEDS its
      purchased cost -- the two cost SHAPES told apart on the numbers, and
      the provenance row names `declared-unit-price`.  Then two copies of
      the case are run from a temp directory: one WITHOUT `catalystPrice`,
      which must REFUSE the charge by name (`catalystPrice` in the FAILED
      line), keep the shell costed, and print `TOTALS (EUR) -- INCOMPLETE`
      naming `converter/catalystCharge` (the INCOMPLETE home the trays
      shared); one
      WITHOUT `catalystBulkDensity`, whose charge sheet must publish NO mass,
      state `mass not derivable` in its basis, and refuse at cost time
      naming the density.  Sabotage-verified BY HAND, restored with `cp`;
      the five sabotages and their observed lines are in the arm's own
      docstring (`check_catalyst_bed`).
      NOT CHECKED: whether 2500 kg/m3 or 15 EUR/kg are sensible -- they are
      the case's declared assumptions (its header says so in those words)
      and this arm only proves they reached the arithmetic unchanged.

  (o) A SPACE VELOCITY CARRIES ITS DECLARED GAS-VOLUME BASIS (2026-10-05).
      `VesselSize` used to divide the ACTUAL gas flow at the unit's own
      (T, P) by whatever `spaceVelocity` was typed, while every published
      GHSV is on NORMAL gas volume -- a factor of 77 at an ammonia
      converter's 700 K / 200 bar, taken at exit 0.  On
      `ammoniaStaged03_approach` (the one corpus case that sizes by space
      velocity) the converter sheet's `V_R` is RECOMPUTED here from the
      run's own `N_in_mol_s` KPI and the postDict's declared `spaceVelocity`
      as N R T_n / P_n x 3600 / SV (T_n 273.15 K, P_n 101325 Pa), at the
      sheet's printed precision, and the basis must say NORMAL.  Three
      copies then run from a temp directory: one with the
      `spaceVelocityBasis` statement deleted, which must refuse the
      converter BY NAME (`spaceVelocityBasis` on the FAILED line) and quote
      the normal/actual ratio at the unit's own conditions; one declaring
      `standard`, which must refuse naming both accepted words; and one
      declaring `actual` at 259.665 1/h, whose `V_R` is recomputed as
      N R T / P x 3600 / SV from the KPI T and P -- so both branches are
      held to arithmetic, not only the shipped one.
      SABOTAGES, by hand, 2026-10-05: four, all caught; recorded with the
      line each produced in `check_space_velocity_basis`.
      NOT CHECKED: whether 20000 Nm3/(m3 h) is a sensible GHSV -- it is the
      case's declared assumption; and any vessel sized by residence time,
      which is on actual volume by its own physics and was never ambiguous.

  (p) AN EXCHANGER'S LMTD IS NOT TYPED WHERE THE RUN KNOWS IT (2026-10-07,
      DEV.md 4c C44).  `ShellTubeHX` has three routes: `U` + `LMTD` (both
      author-set, the original), `U` + `utility <name>` (the LMTD computed
      counter-current from the unit's own `T_in`/`T_out` KPIs and the
      utility record's `T_in`/`T_out`), and neither (a RATED unit's own
      `area` passed through).  On `greenAmmoniaIndustrialN2` every cooler
      declaring a `utility` has its sheet's `LMTD` and `A` RECOMPUTED here
      from the run's KPI line, the postDict's `U` and the utility record
      read from `data/standards/utilities/`, at the sheet's printed
      precision; the rated FEHE's sheet `A` must equal the area its own
      flowsheetDict declares, and its `U`/`LMTD` the unit's own KPIs.  Three
      copies then run: one adding `LMTD` beside a `utility` (refused BY
      NAME, the run still exit 0), one with the Chiller's utility switched
      to `coolingWater` (a temperature cross, refused BY NAME), and one with
      a cooler's `U` and `utility` deleted (it publishes no area, so it is
      refused naming the two declarations that would size it).
      SABOTAGES, by hand, 2026-10-07, on ShellTubeHX.cpp, restored with
      `cp` and the engine rebuilt: recorded with the line each produced in
      `check_exchanger_routes`.
      NOT CHECKED: whether the declared U values are sensible, and the
      terminal-temperature LMTD on a cooler where something condenses is an
      approximation the basis states rather than a number this arm can
      improve.

  (q) A STORAGE TANK IS SIZED FROM ITS STREAM AND PRICED ON THE ROW THE
      PROGRAM CARRIES (2026-10-07, DEV.md 4c C44 slice 2).  On
      `greenAmmoniaIndustrialN2` the store attached to `ProductNH3` has its
      density RECOMPUTED from the case's component records, its volumes and
      tank count from the postDict's declarations and the stream's own
      `F_mass`, and each tank's three costs from the CAPCOST 2017
      fixed-roof row transcribed in this gate; the LOWER BOUND of a
      refrigerated store priced as an atmospheric tank must be said per
      tank; copies refuse a unitless storage time and a vapour stream BY
      NAME, and a larger tank ceiling makes ONE tank.  Sabotages in
      `check_storage`.

  (r) WHAT EACH ITEM HOLDS IS V x FRACTION x RHO x COMPOSITION (2026-10-07,
      DEV.md 4c C44 slice 3).  On `greenAmmoniaIndustrialN2` every item
      publishing an `inventory` has each held phase's density RECOMPUTED from
      the case's records (anchored Rackett for a liquid, the SRK vapour root
      for a gas), its mass and per-component split recomputed, its sheet's
      total held to it, the two product tanks held to storageTime of
      production, and the items without one listed as NOT DECLARED; copies
      refuse a declared volume beside a sized V_R, a two-phase stream and
      fractions above 1 BY NAME while the item keeps its size.  Sabotages in
      `check_inventory`.

  (l) THE GUI FIXTURE IS STILL THE ENGINE'S OWN OUTPUT.  The readers' unit
      tests run on a TRANSCRIPTION of a sheet, because arm (g) keeps `design/`
      gitignored and no committed file can be read from a test.  This arm runs
      the writer and holds the header words, every `sizing {}` triple and every
      port line in `gui/tests/designSheet.test.ts` and
      `gui/tests/columnDatasheet.test.ts` to what was just written -- the
      `check_estimate_visible` precedent, for the same reason.  Which TEST FILE
      holds a fixture is part of the entry: a single hard-coded path would have
      reported the column fixtures as checked while holding them to nothing.

      SABOTAGES, by hand, 2026-09-07 (the arm regenerates `design/`, so each
      lands on the FIXTURE between the run and the check):
        S1  one port temperature drifts in ONE of three identical column
            fixtures  -> SURVIVED the first version of this arm, which searched
            the WHOLE test file for each line and found the drifted line in a
            SIBLING fixture carrying the same port block.  Caught after the
            match was made per template literal.
        S2  a `sizing {}` value drifts (`swageGap`)  -> caught.
        S3  the whole column fixture file is removed  -> caught by name.

WHAT THIS DOES NOT CHECK, said plainly:

  * THAT THE ENGINE'S OWN PARSER ACCEPTS IT, IN FULL.  Arm (k) is still not a
    round trip through `Dictionary::fromFile`: it checks the unit words, which
    is where every failure found so far lived, and arm (h) checks the
    structure.  A grammar the C++ parser rejects for a subtler reason -- a key
    spelling, a nesting depth -- would still pass both.  The GUI's reader does
    parse a whole sheet with a real dict parser, but it is the TypeScript one;
    the two grammars are kept in step by hand.
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
    tutorials declare a `sizing {}` block at all.  Arm (k) therefore sees only
    the unit words THOSE two write; a sizer no witness exercises can still
    declare an unreadable one.
"""
import csv
import os
import math
import re
import shutil
import subprocess
import tempfile
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
#  THE WAIVERS LIVE IN ONE PLACE -- see `debt_registry.py`.
from debt_registry import SHEET_UNIT_WORDS_UNPARSEABLE   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"
FLAT    = "tutorials/steady/flowsheets/process02_with_design"
#  THE MULTI-ITEM WITNESS (2026-09-07).  The first case in the corpus where a
#  single flowsheet unit is sized as SEVERAL physical objects: a distillation
#  column is a shell, a tray stack, a condenser, a reboiler and a reflux drum.
#  The other two witnesses cannot exercise the 1:N address at all -- every unit
#  they carry realises exactly one item -- so without this one the sibling
#  sheets would be written and checked by nothing.
COLUMN  = "tutorials/steady/distillation/column09_tray_hydraulics"
#  THE KINETIC-BED WITNESS (2026-09-26).  A `pfr` sized as a shell and a
#  catalyst charge, from a volume a `designSpec` solved -- the first case in
#  the corpus where the post-processing chain runs on an outer driver's
#  representative pass at all, and the only one whose second item is priced
#  from a DECLARED unit price rather than a Turton correlation.
KINETIC = "tutorials/plant/ammoniaStaged04_kinetic"

#  THE SPACE-VELOCITY WITNESS (2026-10-05).  The one corpus case that sizes a
#  catalyst vessel from a declared `spaceVelocity`, and so the one whose
#  `spaceVelocityBasis` declaration reaches the arithmetic.
SPACEV  = "tutorials/plant/ammoniaStaged03_approach"

#  THE EXCHANGER-ROUTES WITNESS (2026-10-07).  The one corpus case whose
#  coolers declare a `utility` instead of an LMTD, and whose rated
#  interchanger is sized on its own area.
HXROUTE = "tutorials/plant/greenAmmoniaIndustrialN2"

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
    """A REAL CSV reader, because the `basis` column is a SENTENCE.

    This split on "," until 2026-09-07, and the column sizer's own basis --
    "straight tower at the wider section; D from the tray hydraulics, H = ..."
    -- shifted every numeric column after it by one.  `DesignReport` now quotes
    a field carrying a comma (RFC 4180, and ONLY when needed, so every CSV
    already written is byte-for-byte what it was); this reads the quoting back
    rather than a second hand-rolled splitter."""
    if path is None or not path.is_file():
        return None, []
    with path.open(newline="", errors="replace") as fh:
        rows = [r for r in csv.reader(fh) if r and any(c.strip() for c in r)]
    if not rows:
        return None, []
    return rows[0], rows[1:]


def parse_sheet(text: str):
    """The sheet, as a reader sees it.  Deliberately a SMALL reader: it pulls
    the header words, the `sizing {}` entries with their units, the `cost {}`
    scalars and each port's mdot.  It is not a dict parser and does not
    pretend to be one -- see the blind spot in the docstring."""
    #  Strip block comments and line comments before anything else.
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    t = re.sub(r'//[^\n]*', '', t)

    out = {"header": {}, "sizing": {}, "cost": {}, "inlets": [], "outlets": []}

    for k in ("recordType", "unit", "sector", "equipment", "item", "material"):
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


def check_case(rel, expect_sector, problems, notes, all_units):
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
    #  THE SHEET IS NAMED BY THE ITEM where a unit realises more than one.
    #  The column appears only on a case that has items to tell apart, so the
    #  address rule below is the one it always was for every other case.
    itag = head.index("equipmentTag") if "equipmentTag" in head else None

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

    sheets = []   # (equipmentType, V_magma) for arm (j)
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
        tag = r[itag] if itag is not None and r[itag].strip() else ""
        #  The ROW's own identity, and the name every message below uses: on a
        #  multi-item unit `column09` alone names five different sheets.
        ident = unit if not tag else unit + "/" + tag
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
        path = d / leaf / (tag if tag else etype)
        if not path.is_file():
            problems.append(
                "%s: item '%s' is in sizing.csv and has NO specification sheet "
                "at design/%s -- published as sized, absent where a reader "
                "audits."
                % (rel, ident, path.relative_to(ROOT / rel / 'design')))
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
        #  ---- (k) every unit word this sheet declares, for the readability
        #  arm.  Taken from the SHEET, not from sizing.csv's columns: a key the
        #  CSV does not carry is still a line the parser has to survive.
        for szKey, (_v, szUnit) in sheet["sizing"].items():
            if szUnit not in ("", "-"):
                all_units.append((rel, unit, szKey, szUnit))

        if "V_magma" in sheet["sizing"]:
            #  `equipment`, NOT `equipmentType`: that is the key the SHEET
            #  writes, and this line asked for the CSV column's name instead.
            #  So every tuple carried a None type, `check_crystalliser_volume`
            #  filtered on `ty == "crystalliser"`, found nothing and returned
            #  in silence -- arm (j), the load-bearing arm of the 2026-09-05
            #  slice and the only one here that can see a WRONG number, had
            #  never fired since the day it was written (found 2026-09-07).
            #  A gate arm that cannot fire pins nothing, which is the
            #  `check_true_ions` shape this project retired a gate over.
            sheets.append((sheet["header"].get("equipment"), sheet["sizing"]["V_magma"][0]))
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
            if k in ("unit", "sector", "equipmentTag", "equipmentType",
                     "material", "basis"):
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
        if ident in costs and sheet["cost"]:
            for sheetKey, csvKey in (("purchased", "C_purchased"),
                                     ("bareModule", "C_bare_module"),
                                     ("totalModule", "C_total_module")):
                if sheetKey in sheet["cost"] and csvKey in costs[ident]:
                    if not close(sheet["cost"][sheetKey], costs[ident][csvKey], 1.0e-4):
                        problems.append(
                            "%s: %s's sheet says %s = %g, costs.csv says %g."
                            % (rel, ident, sheetKey, sheet["cost"][sheetKey],
                               costs[ident][csvKey]))

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

    check_crystalliser_volume(rel, sheets, problems, notes)
    return checked


# ---------------------------------------------------------------------------
#  (k) A SHEET IS A DICTIONARY CHOUPO CAN ACTUALLY READ
# ---------------------------------------------------------------------------

def tokenizer_word_chars():
    """The dict tokenizer's own word-character set, READ from
    `core/Dictionary.cpp::isWordChar` rather than written down here.  A second
    copy of the grammar in a gate would be the arity sin in the machinery built
    to prevent it -- and it would go quietly false the day the tokenizer moves,
    which is the failure mode this arm exists to catch in the first place."""
    src = (ROOT / "src/core/Dictionary.cpp").read_text(errors="replace")
    i = src.index("bool isWordChar")
    body = src[i:src.index("}", i)]
    return set(re.findall(r"c == '(.)'", body))


def known_unit_names():
    """Every unit name `core/Units.cpp` registers.  Also read, never listed."""
    src = (ROOT / "src/core/Units.cpp").read_text(errors="replace")
    return set(re.findall(r'\{\s*"([^"]+)"\s*,\s*UnitSpec', src))


def declared_sizer_units():
    """Every unit word a sizer DECLARES at its `d.set` site, over ALL sizers.

    Read from the source, not from the sheets two witnesses happen to write:
    only 9 of 233 steady tutorials size anything and the gate runs two of them,
    so a sheet sweep alone would leave most sizers unexamined -- which is
    exactly how `um` and `rpm` survived (`SprayDryerSize` is exercised by
    `sprayDryer07_design`, a case this gate does not run)."""
    out = []
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*.cpp")):
        src = f.read_text(errors="replace")
        for m in re.finditer(r'\bset\(\s*"([A-Za-z_0-9]+)"\s*,.*?,\s*"([^"]*)"\s*\)',
                             src, re.S):
            out.append((f.relative_to(ROOT), m.group(1), m.group(2)))
    return out


def check_unit_words_readable(all_units, problems, notes):
    """(k) EVERY SIZING UNIT WORD SURVIVES THE TOKENIZER AND IS A NAME THE
    ENGINE KNOWS -- otherwise the sheet is a file Choupo's own `Dictionary`
    REFUSES, under a header that calls it a Choupo dictionary.

    This is the arm the docstring's own blind-spot list predicted: "a writer
    whose output the reader refuses is a bug in BOTH, and nothing here would
    catch a grammar the C++ parser rejects".  It was written the day the first
    reader of a sheet was built (the GUI's printable exchanger datasheet), and
    it fired immediately on THREE unit words.

    VERIFIED BY HAND against the engine, not deduced from the tokenizer: a
    case dict carrying `U 600.0 W/(m2.K);` under
    `process02_with_design/system/postDict` produced

        ERROR: system/postDict:45:41: unknown unit suffix 'W/' after scalar
        value of 'U'.  Known units listed in core/Units.H.

    and `ShellTubeHX.cpp` had been writing exactly that into every exchanger
    sheet since the sheets shipped.  Fixed to `W/m2/K` -- the SAME unit at the
    SAME factor in `core/Units.cpp`, so no number moved.

    The other two (`um`, `rpm`, both `SprayDryerSize`) are NOT fixed here and
    must not be: `core/Units.cpp` has no name for either, so the remedy
    converts a VALUE, and the 2026-09-04 slice reserved that class in its own
    words ("Nothing was converted: rebasing on SI moves numbers in every golden
    that pins them").  They are in `SHEET_UNIT_WORDS_UNPARSEABLE`
    with their remedy and blocker, and the STALE-PIN half below fails if one
    stops being declared -- a waiver that outlives its violation silently
    grants permission.

    TWO SWEEPS, because neither alone is the claim.  The SOURCE sweep is
    complete over the sizers and is what the pin is held against.  The SHEET
    sweep re-checks the words that actually reached a written file, which is
    the only half that could catch a unit arriving by some route other than
    `d.set`."""
    wordchars = tokenizer_word_chars()
    known = known_unit_names()
    declared = declared_sizer_units()
    if not wordchars or not known or not declared:
        problems.append(
            "check_design_sheet(k): could not read the tokenizer's word-char "
            "set, the unit table, or any `d.set` unit word out of src/ -- this "
            "arm CANNOT RUN, and a check that cannot run must not pass.")
        return

    def deliverable(word):
        return all(c.isalnum() or c in wordchars for c in word)

    def judge(where, key, word, problems):
        if word in ("", "-") or word in SHEET_UNIT_WORDS_UNPARSEABLE:
            return
        if not deliverable(word):
            problems.append(
                "%s: sizing value '%s' declares the unit '%s', which the dict "
                "tokenizer CANNOT DELIVER -- it stops at the first character "
                "outside `Dictionary.cpp::isWordChar`, so Choupo's own parser "
                "refuses the WHOLE sheet.  Use a spelling made of word "
                "characters (core/Units.cpp usually registers one at the same "
                "factor: `W/m2/K` for `W/(m2.K)`), at the `d.set` site."
                % (where, key, word))
        elif word not in known:
            problems.append(
                "%s: sizing value '%s' declares the unit '%s', which "
                "core/Units.cpp does not register -- the tokenizer delivers "
                "the word and the parser then refuses the whole sheet with "
                "`unknown unit suffix`.  Either register it or convert the "
                "value at the `d.set` site (converting MOVES a number: see "
                "SHEET_UNIT_WORDS_UNPARSEABLE)."
                % (where, key, word))

    for f, key, word in declared:
        judge(str(f), key, word, problems)
    for rel, unit, key, word in all_units:
        judge("%s: %s's written sheet" % (rel, unit), key, word, problems)

    #  STALE-PIN: a waiver whose violation has healed must go.
    declaredWords = {w for (_f, _k, w) in declared}
    for word in sorted(SHEET_UNIT_WORDS_UNPARSEABLE):
        if word not in declaredWords:
            problems.append(
                "check_design_sheet(k): debt_registry pins the unreadable unit "
                "word '%s' and no sizer declares it any more.  Either it was "
                "fixed -- remove the pin -- or the `d.set` that carried it "
                "went away, which is a different and worse thing." % word)
    notes.append("%d `d.set` unit word(s) over %d sizer file(s), %d pinned "
                 "unreadable" % (len(declaredWords),
                                 len({f for (f, _k, _w) in declared}),
                                 len(SHEET_UNIT_WORDS_UNPARSEABLE)))


# ---------------------------------------------------------------------------
#  (l) THE GUI FIXTURE IS STILL THE ENGINE'S OWN OUTPUT
# ---------------------------------------------------------------------------

#  (case, sheet path under design/, the test file that transcribes it).
#  THE TEST FILE IS PART OF THE ENTRY (2026-09-07): the column schematic's
#  fixtures live in their own test beside the reader they exercise, and a
#  single hard-coded `GUI_TEST` would have held them to nothing while
#  reporting that it had checked them.
GUI_FIXTURES = (
    (FLAT,    "heater/shellTubeHX",                 "gui/tests/designSheet.test.ts"),
    (FRACTAL, "FERMENTATION/Fermentor/stirredTank", "gui/tests/designSheet.test.ts"),
    (COLUMN,  "column09/shell",                     "gui/tests/columnDatasheet.test.ts"),
    (COLUMN,  "column09/trays",                     "gui/tests/columnDatasheet.test.ts"),
    (COLUMN,  "column09/refluxDrum",                "gui/tests/columnDatasheet.test.ts"),
)


def check_gui_fixture(problems, notes):
    """(l) The GUI's printable datasheet READS a specification sheet back, and
    its unit tests run on a TRANSCRIPTION of one -- because `design/` is a run
    output and arm (g) keeps it gitignored, so no committed file can be read
    from a test.  A transcription drifts from its original in silence.  This
    arm runs the writer and holds the fixture to what it wrote, which is the
    `check_estimate_visible` precedent for the same reason.

    It compares the HEADER words, every `sizing {}` triple (key, value, unit)
    and -- since 2026-09-07 -- every line of the `inlets {}` and `outlets {}`
    blocks, whitespace-normalised.  The ports were deliberately NOT held here
    until that day, on the stated ground that the GUI reader did not read them
    and a fixture held to more than its reader uses is a golden nobody asked
    for.  The column schematic READS them: it colours each nozzle by the
    temperature the run wrote.  So the reason expired the moment the reader
    arrived, which is the rule about burying an absence you have just filled.
    The cost block is still NOT held, because still nothing reads it back."""
    norm = lambda s: " ".join(s.split())
    #  EACH FIXTURE IS ITS OWN TEMPLATE LITERAL, and the wanted lines must all
    #  land in ONE of them (2026-09-07).  This arm used to search the WHOLE
    #  test file for each line, which was exact while a file held one fixture
    #  and became blind the day one held three: the column's shell, trays and
    #  reflux-drum sheets carry the SAME three port blocks, so a drifted
    #  temperature in one was still found -- in a sibling.  Verified by hand:
    #  the sabotage that edits one fixture's `T 370 K` SURVIVED the first
    #  version of this arm and fails this one.
    fixtures = {}
    for _, _, test_rel in GUI_FIXTURES:
        if test_rel in fixtures:
            continue
        f = ROOT / test_rel
        if not f.is_file():
            problems.append("check_design_sheet(l): %s is gone -- the reader "
                            "that replaced this gate's structural arm has no "
                            "tests." % test_rel)
            continue
        #  Split on UNESCAPED backticks only.  A sheet's own header comment
        #  contains backticks (it names `system/postDict` and `sizing {}`), so
        #  a faithful transcription escapes them -- and splitting on those cut
        #  every fixture in half, which made this arm accuse the correct
        #  fixture of missing its own first line.
        fixtures[test_rel] = [norm(c) for c in
                              re.split(r"(?<!\\)`", f.read_text(errors="replace"))]
    for rel, tail, test_rel in GUI_FIXTURES:
        chunks = fixtures.get(test_rel)
        if chunks is None:
            continue
        p = ROOT / rel / "design" / tail
        if not p.is_file():
            problems.append("check_design_sheet(l): the run wrote no %s, so "
                            "the GUI fixture is held to nothing." % tail)
            continue
        text = re.sub(r'/\*.*?\*/', '', p.read_text(errors="replace"), flags=re.S)
        want = []
        for k in ("recordType", "unit", "sector", "equipment", "item",
                  "material", "basis"):
            m = re.search(r'^\s*%s\s+.*;' % k, text, re.M)
            if m:
                want.append(m.group(0))
        for block in ("sizing", "inlets", "outlets"):
            m = re.search(r'^%s\s*\n\{(.*?)\n\}' % block, text, re.S | re.M)
            if m:
                want += [l for l in m.group(1).splitlines() if l.strip()]
        want = [norm(w) for w in want]
        #  The best-matching chunk decides, so the message names what is
        #  missing from the fixture that is CLOSEST to this sheet rather than
        #  from an unrelated one.
        best, missing = None, want
        for c in chunks:
            gap = [w for w in want if w not in c]
            if best is None or len(gap) < len(missing):
                best, missing = c, gap
        if missing:
            problems.append(
                "check_design_sheet(l): the GUI fixture in %s no longer "
                "matches design/%s, which the run just wrote.  Absent from the "
                "fixture: %s.  The GUI's reader tests are written on that "
                "transcription, so a drift makes them pass against a sheet the "
                "engine does not produce."
                % (test_rel, tail, "; ".join(missing[:4])))
        else:
            notes.append("GUI fixture matches design/%s" % tail)


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


def check_basis_stated(problems):
    """(i) SOURCE -- every sizer assigns `d.basis`.  Structural on purpose: a
    list of the expected strings would be a second home for the sizers' own
    vocabulary, and a sizer that forgets shows `(not stated)` on every surface
    at once, which is the visible form this arm keeps visible.  It cannot
    check that a basis is TRUE of its sizer; only a reader can (2026-09-05:
    the first one read found a kmol holdup labelled m3)."""
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*Size.cpp")) + \
             [ROOT / "src/postProcessing/sizing/ShellTubeHX.cpp",
              ROOT / "src/postProcessing/sizing/StirredTank.cpp"]:
        if f.name == "EquipmentSize.cpp":
            continue
        src = f.read_text(errors="replace")
        if "::size(" in src and not re.search(r"\b(d\.basis|basis)\s*=", src):
            problems.append(
                "%s states no design basis (`d.basis = ...`).  A size whose "
                "rule is invisible cannot be defended, only reported -- and the "
                "GUI header promises a basis for every item."
                % f.relative_to(ROOT))


def declared_crystalliser_volumes(rel):
    """Every `type crystalliser` block's `volume` under the case, read from
    the CASE DICTS -- never from the run."""
    vols = []
    for fd in sorted((ROOT / rel).rglob("flowsheetDict")):
        txt = fd.read_text(errors="replace")
        for m in re.finditer(r"type\s+crystalliser\s*;", txt):
            tail = txt[m.end():m.end() + 4000]
            v = re.search(r"\bvolume\s+([0-9.eE+-]+)\s*(\S*?)\s*;", tail)
            if not v:
                continue
            val, unit = float(v.group(1)), v.group(2)
            if unit in ("m3", "m^3", ""):
                vols.append(val)
            elif unit == "L":
                vols.append(val * 1.0e-3)
            else:
                vols.append(None)      # a unit this arm does not convert: say so
    return vols


def check_crystalliser_volume(rel, sheets, problems, notes):
    """(j) INDEPENDENT -- a crystalliser sheet's V_magma IS the unit's declared
    `operation.volume`.  This is the arm that would have fired for the whole
    life of the kmol-as-m3 defect: the golden pinned what the run PRINTED, and
    only a recomputation from the declaration can see a size that is wrong."""
    got = sorted(v for (ty, v) in sheets if ty == "crystalliser")
    if not got:
        return
    want = declared_crystalliser_volumes(rel)
    if any(w is None for w in want):
        problems.append("%s: a crystalliser declares its volume in a unit this "
                        "arm does not convert -- extend the arm, do not skip it."
                        % rel)
        return
    want = sorted(want)
    if len(got) != len(want) or any(not close(a, b, 1.0e-6) for a, b in zip(got, want)):
        problems.append(
            "%s: crystalliser sheet(s) size V_magma = %s m3 but the case "
            "declares operation.volume = %s m3.  The MSMPR is a rating model: "
            "its volume is the INPUT, and a sizer that computes something else "
            "is sizing a different vessel (2026-09-05: liquorFlow[kmol/s] * tau "
            "gave 18.46 'm3' on a 1.0 m3 vessel)."
            % (rel, got, want))
    else:
        notes.append("crystalliser V_magma %s m3 = declared volume" % got)


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


# ---------------------------------------------------------------------------
#  (m) ONE UNIT, FIVE ITEMS -- AND THREE OF THE NUMBERS RECOMPUTED
# ---------------------------------------------------------------------------

COLUMN_ITEMS = ("shell", "trays", "condenser", "reboiler", "refluxDrum")


def check_column_items(problems, notes):
    """(m) A unit that realises SEVERAL physical items writes one sheet per
    item, each naming itself; the two exchanger areas and the tower height are
    RECOMPUTED from the case's own declaration; and the tray stack's cost is
    recomputed by hand from its printed size (since 2026-10-05).

    WHY EACH HALF IS HERE.

      * THE ADDRESS.  Arm (a) already holds every sizing.csv row to a sheet,
        but on the other two witnesses every unit realises ONE item, so the
        sibling address `design/<unit>/<tag>` is exercised by nothing there.
        This names the five it expects, so a sizer that silently stopped
        emitting one would be caught rather than merely producing a shorter
        table.

      * THE RECOMPUTATION, and it is arm (j)'s precedent.  A golden pins what
        a run PRINTS, so a wrong area pins as happily as a right one; only a
        recomputation from the DECLARATION can see a number that is wrong.
        U and LMTD are read from the case postDict and Q from the run's own
        KPI line, and A = |Q|/(U*LMTD) is redone here.  The tower height is
        redone the same way from the tray count the hydraulics rated, the
        author-declared spacing and the two end allowances -- which is what
        caught this sizer computing `nStages - 2` trays where the hydraulics
        rates 14, half a tray spacing short.

      * THE SWAGE TEST.  The tower is built STRAIGHT at the larger section, so
        `D` must equal max(D_rectifying, D_stripping) and `swageGap` must be
        their relative difference.  A shell quietly sized on the NARROWER
        section would flood, and no other arm anywhere could see it.

      * THE TRAYS ARE COSTED BY THE TRAY (since 2026-10-05; until then
        they were refused by name, Choupo having no tray set).  The cost is
        RECOMPUTED from the sheet's A and nTrays with a reference set this
        gate transcribes itself, which is tied to the source program's own
        worked tower; and the refusal is kept alive on a probe copy that
        declares no material class.  See `check_tray_stack`.

    SABOTAGE-VERIFIED, seven of them, BY HAND and never by patching a source
    and rebuilding.  The first attempt proved NOTHING and is worth writing
    down: this arm runs the case itself and `design/` is regenerated whole, so
    every sheet edited beforehand was destroyed before it was read and all six
    sabotages "survived" while the gate was working perfectly.  That is the
    2026-09-05 trap in `check_internal_states`, met again one gate over -- the
    sabotage has to land BETWEEN the run and the check, which was done by
    wrapping `run_case` for the duration.  Fired then: (1) an item stops being
    written; (2) a wrong exchanger area; (3) the shell built on the NARROWER
    section; (4) the tray count back to `nStages - 2`; (5) the trays gain an
    invented cost block; (6) a sheet stops naming its item; (7) `swageGap` is
    not the difference of the two sections the sheet itself publishes.
    (Sabotage (5) guarded the tray REFUSAL, which was the decision then; the
    tray cost has its own four in `check_tray_stack` since 2026-10-05.)

    NOT CHECKED HERE: whether U, LMTD or the residence time are sensible --
    they are the author's declaration and this arm only proves they reached the
    arithmetic.  Nor whether the DIAMETER is right: that is the tray
    hydraulics' answer and `check_block_tridiagonal` is not its gate either;
    this arm holds the sizer to the hydraulics, not the hydraulics to physics.
    """
    rc, out, err = run_case(COLUMN)
    if rc != 0:
        problems.append("check_design_sheet(m): %s failed (rc=%d).\n    %s"
                        % (COLUMN, rc, err.strip()[:300]))
        return

    base = ROOT / COLUMN / "design" / "column09"
    got = sorted(p.name for p in base.iterdir()) if base.is_dir() else []
    if got != sorted(COLUMN_ITEMS):
        problems.append(
            "check_design_sheet(m): %s writes %s under design/column09/, not "
            "the five items a distillation column realises (%s).  The 1:N "
            "shape the sheet writer was built on has exactly one case in the "
            "corpus and this is it."
            % (COLUMN, got or "nothing", ", ".join(sorted(COLUMN_ITEMS))))
        return

    sheets = {}
    for name in COLUMN_ITEMS:
        s = parse_sheet((base / name).read_text(errors="replace"))
        sheets[name] = s
        if s["header"].get("item") != name:
            problems.append(
                "check_design_sheet(m): design/column09/%s declares `item %s;` "
                "-- a sheet of a multi-item unit must name which item it is, "
                "or five sheets under one unit are told apart only by their "
                "filename." % (name, s["header"].get("item")))

    #  ---- the two exchanger areas, from the CASE and the RUN ---------------
    post = (ROOT / COLUMN / "system" / "postDict").read_text(errors="replace")
    kpiLine = ""
    for line in out.splitlines():
        if '"column09": {' in line:
            kpiLine = line
            break
    if not kpiLine:
        problems.append("check_design_sheet(m): the run emits no KPI object "
                        "for column09, so no area can be recomputed.")
        return

    def kpi(name):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % name, kpiLine)
        return float(m.group(1)) if m else None

    for item, block, qkey in (("condenser", "condenser", "Q_condenser_kW"),
                              ("reboiler",  "reboiler",  "Q_reboiler_kW")):
        m = re.search(r'\b%s\s*\{(.*?)\}' % block, post, re.S)
        if not m:
            problems.append("check_design_sheet(m): the case declares no `%s "
                            "{}` block, so this arm cannot recompute its area."
                            % block)
            continue
        U = float(re.search(r'\bU\s+([0-9.eE+-]+)', m.group(1)).group(1))
        LM = float(re.search(r'\bLMTD\s+([0-9.eE+-]+)', m.group(1)).group(1))
        Q = kpi(qkey)
        if Q is None:
            problems.append("check_design_sheet(m): the run publishes no %s "
                            "KPI." % qkey)
            continue
        want = abs(Q) * 1000.0 / (U * LM)
        got_A = sheets[item]["sizing"].get("A", (None, ""))[0]
        if got_A is None or not close(got_A, want, 1.0e-6):
            problems.append(
                "check_design_sheet(m): the %s sheet says A = %s m2, but "
                "|%s|/(U*LMTD) with the case's own U = %g and LMTD = %g is "
                "%.6f m2.  A golden pins what the run PRINTS; only this "
                "recomputation can see an area that is wrong."
                % (item, got_A, qkey, U, LM, want))
        else:
            notes.append("%s A = %.4f m2 recomputed from the declaration"
                         % (item, want))

    #  ---- the tower height, from the tray count the HYDRAULICS rated -------
    nT = kpi("nTrays")
    sh = sheets["shell"]["sizing"]
    spacing = sh.get("traySpacing", (None, ""))[0]
    if nT is None or spacing is None:
        problems.append("check_design_sheet(m): no nTrays KPI or no declared "
                        "traySpacing -- the height cannot be recomputed.")
    else:
        if not close(sh.get("nTrays", (0.0, ""))[0], nT, 1.0e-9):
            problems.append(
                "check_design_sheet(m): the shell sheet says nTrays = %s while "
                "the hydraulics pass rated %g.  The stage count is NOT the tray "
                "count -- this solver stage list carries the reboiler and not "
                "the condenser, and `nStages - 2` was short by one."
                % (sh.get("nTrays"), nT))
        #  The two end allowances: whatever the case declares, else the engine
        #  default READ FROM `DesignDefaults.cpp` -- never a literal here.
        defs = (ROOT / "src/postProcessing/sizing/DesignDefaults.cpp"
                ).read_text(errors="replace")
        ends = 0.0
        for key in ("disengagementHeight", "sumpHeight"):
            m = re.search(r'^\s*%s\s+([0-9.eE+-]+)\s*;' % key, post, re.M)
            if m:
                ends += float(m.group(1))
                continue
            d = re.search(r'"%s",\s*([0-9.eE+-]+)\s*,' % key, defs)
            if not d:
                problems.append("check_design_sheet(m): neither the case nor "
                                "DesignDefaults.cpp names %s -- this arm "
                                "CANNOT RUN, and it must not pass." % key)
                ends = None
                break
            ends += float(d.group(1))
        if ends is not None:
            want = (nT - 1.0) * spacing + ends
            if not close(sh.get("H", (None, ""))[0], want, 1.0e-9):
                problems.append(
                    "check_design_sheet(m): the shell sheet says H = %s m; "
                    "(nTrays-1)*traySpacing + the two end allowances is "
                    "%.6f m."
                    % (sh.get("H"), want))
            else:
                notes.append("tower H = %.3f m recomputed from %g trays" % (want, nT))

    #  ---- the straight tower is the WIDER section --------------------------
    dr = sh.get("D_rectifying", (None, ""))[0]
    ds = sh.get("D_stripping", (None, ""))[0]
    if dr is None or ds is None:
        problems.append("check_design_sheet(m): the shell sheet publishes no "
                        "per-section diameters, so the swage decision is on "
                        "no surface a reader can audit.")
    else:
        big, sml = max(dr, ds), min(dr, ds)
        #  ONLY IN DESIGN MODE.  With `diameter` declared the pass RATES the
        #  trays against the author tower, which may be narrower than a
        #  section needs -- `column10_flooding` declares 1.1 m and floods at
        #  114 %.  The witness is a DESIGN case, so this arm holds; a rating
        #  case would legitimately fail it, and the sizer says which it is in
        #  its basis rather than leaving this arm to guess.
        designed = kpi("diameterDesigned")
        if designed is not None and designed == 0.0:
            notes.append("column RATED at a declared diameter; the "
                         "wider-section arm does not apply")
        elif not close(sh.get("D", (None, ""))[0], big, 1.0e-12):
            problems.append(
                "check_design_sheet(m): the shell is sized at D = %s m while "
                "its wider section needs %.6f m.  A tower built on the "
                "NARROWER section floods, and nothing else here could see it."
                % (sh.get("D"), big))
        #  1e-5, not the 1e-12 the two diameters are compared at: the gap is
        #  a DIFFERENCE of two nearly equal numbers, and both sides here are
        #  8-significant-digit renderings off the sheet, so the subtraction
        #  costs about four of those digits.  Tightening it would fail on
        #  correct arithmetic.
        if not close(sh.get("swageGap", (None, ""))[0], (big - sml) / big, 1.0e-5):
            problems.append(
                "check_design_sheet(m): the shell sheet swageGap is %s, not "
                "the relative difference %.6f of the two sections it "
                "publishes." % (sh.get("swageGap"), (big - sml) / big))
        else:
            notes.append("sections %.3f / %.3f m, gap %.1f %%, straight tower"
                         % (dr, ds, 100.0 * (big - sml) / big))

    #  ---- the trays are COSTED BY THE TRAY, and the cost recomputes --------
    check_tray_stack(sheets, out, problems, notes)


#  THE REFERENCE TRAY SET, transcribed HERE independently of the engine and
#  from the same source (2026-10-05, DEV.md 4c C38 item 1): CAPCOST 2017
#  (`capcost_2017_rev2.xlsm`, the program distributed with Turton,
#  Shaeiwitz, Bhattacharyya & Whiting, 5th ed., downloaded from Richard
#  Turton's WVU faculty page), sheet "Equipment Cost Data":
#    Tower Trays / Sieve, C257:G257 -> K1, K2, K3, Amin, Amax
#    FBM / Sieve, D262 (CS), D263 (SS), D265 (Ni-alloy)
#    B267 -> the F_q formula; macro `calculateTrayCosts` -> F_q = 1 for N >= 20
#  The book's printed table and page were NOT read; see Turton.cpp.
TRAY_SIEVE = (2.9949, 0.4465, 0.3961)
TRAY_AREA_RANGE = (0.07, 12.3)
TRAY_FBM = {"carbonSteel": 1.00, "stainlessSteel": 1.83, "nickelAlloy": 5.58}
#  The program's own worked tower, "T-101": 32 sieve trays, D 2.1 m, H 23 m,
#  carbon-steel shell.  Its "Base Equipment Cost" and "Base Bare Module Cost"
#  cells are formulas `ROUND(<k> * CEPCI, ...)`, and these are the two k's --
#  the cost per unit of CEPCI of the shell plus the trays at the carbon-steel
#  base (F_BM 1, F_P 1).  The program computes areas with pi = 3.14.
CAPCOST_T101 = {"D": 2.1, "H": 23.0, "N": 32,
                "baseEquipment_perCEPCI": 318.664206642066,
                "baseBareModule_perCEPCI": 741.819188191882}
#  The vertical-vessel set the engine's `vesselCoeffs` carries, which the same
#  program sheet carries identically (B239:F239, B1/B2 C244:D244).
VESSEL_VERTICAL = (3.4974, 0.4485, 0.1074, 2.25, 1.82)


def tray_quantity_factor(n):
    if n >= 20:
        return 1.0
    l = math.log10(n)
    return 10.0 ** (0.4771 + 0.08516 * l - 0.3473 * l * l)


def tray_cp0_2001(area):
    k1, k2, k3 = TRAY_SIEVE
    l = math.log10(area)
    return 10.0 ** (k1 + k2 * l + k3 * l * l)


def _cost_factors(text):
    """The `factors {}` scalars of a sheet's `cost {}` block, and its words."""
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    m = re.search(r'^cost\s*\n\{(.*?)^\}', t, re.S | re.M)
    if not m:
        return {}, {}
    body = m.group(1)
    f = {}
    fm = re.search(r'factors\s*\{(.*?)\}', body, re.S)
    if fm:
        for line in fm.group(1).splitlines():
            mm = re.match(r'\s*(\w+)\s+([-\d.eE+]+)\s*;', line)
            if mm:
                f[mm.group(1)] = float(mm.group(2))
    words = dict(re.findall(r'^\s*(correlation|sizeKey|pricedAs)\s+"?([^";\n]+)"?\s*;',
                            body, re.M))
    return f, words


def check_tray_stack(sheets, out, problems, notes):
    """(m, trays) THE TRAY STACK IS COSTED BY THE TRAY, AND THE COST IS
    RECOMPUTED HERE FROM THE SHEET'S OWN SIZE (2026-10-05, DEV.md 4c C38
    item 1).  Four claims, each a different way the cost could be wrong:

      * THE ANCHOR.  The reference set above reproduces the source program's
        OWN worked tower (CAPCOST's T-101) to 1e-5 on the CEPCI-397 basis --
        so the gate's transcription is tied to a number the source computed,
        not only to the engine's transcription of the same cells.
      * THE COEFFICIENTS.  The K1..K3 and F_BM the sheet publishes are the
        reference values for the class the case declared.
      * THE ARITHMETIC.  From the sheet's `A` and `nTrays` alone, with the
        reference set and the sheet's own index factors:
            C_p  = N x 10^(K1 + K2 log A + K3 log^2 A) x CEPCI/CEPCI_2001 x fx
            C_BM = C_p x F_BM x F_q(N);   C_TM = 1.18 C_BM
        must land on the sheet's three costs to 1e-6.  The case has 14 trays,
        so F_q != 1 and its N < 20 branch is exercised.
      * THE TOTAL IS COMPLETE, and the refusal still works when the class is
        not declared (a probe copy with the `trayMaterial` line removed: the
        trays refuse BY NAME, the total says INCOMPLETE naming them, and the
        other four items are still costed).  An unknown class word refuses
        through the one refusal home.

    SABOTAGE-VERIFIED 2026-10-05, by hand, each restored with `cp` and the
    engine rebuilt; every line below was OBSERVED:
      T1  Turton.cpp: K3 0.3961 -> 0.3916 (a transposed digit).  The
          coefficient check fires, and so does the arithmetic -- on a cost
          that moved only 0.005 %, because log10 A is small at A = 1.17 m2;
          the coefficient check is what names the cause.
      T2  Turton.cpp: F_q dropped from C_BM.  bareModule and totalModule
          fire (37252 recomputed against 28358 printed); purchased does not,
          correctly -- F_q is not in C_p.
      T3  Turton.cpp: an absent `trayMaterial` silently priced as carbon
          steel.  The no-class probe fires four times (no refusal, no
          remedy, no INCOMPLETE, a cost block written).
      T4  this gate's TRAY_SIEVE K1 2.9949 -> 2.9494 (the GATE's
          transcription drifting).  Only the anchor fires: the CAPCOST
          T-101 reproduction lands at 300.68 against 318.66 per CEPCI.
    NOT CHECKED: the stainless and nickel-alloy F_BM values beyond their
    transcription (the T-101 anchor is a carbon-steel base cost, so only
    F_BM(CS) = 1 is tied to a computed number), the valve-tray and demister
    rows (not transcribed: no unit sizes them), and the tray AREA's
    definition (pi D^2 / 4 at the tower diameter, the sizer's -- Turton's
    program uses the same cross-section with pi = 3.14)."""
    #  -- the anchor, pure arithmetic --------------------------------------
    k1, k2, k3, b1, b2 = VESSEL_VERTICAL
    pi = 3.14
    d, h, n = CAPCOST_T101["D"], CAPCOST_T101["H"], CAPCOST_T101["N"]
    v = pi * (d / 2) ** 2 * h
    a = pi * (d / 2) ** 2
    lv = math.log10(v)
    cv = 10.0 ** (k1 + k2 * lv + k3 * lv * lv)
    ct = n * tray_cp0_2001(a) * tray_quantity_factor(n)
    base_eq = (cv + n * tray_cp0_2001(a)) / 397.0
    base_bm = (cv * (b1 + b2) + ct * TRAY_FBM["carbonSteel"]) / 397.0
    if not (close(base_eq, CAPCOST_T101["baseEquipment_perCEPCI"], 1e-5)
            and close(base_bm, CAPCOST_T101["baseBareModule_perCEPCI"], 1e-5)):
        problems.append(
            "check_design_sheet(m): the reference tray set no longer "
            "reproduces CAPCOST's own worked tower T-101 (base equipment "
            "%.6f vs %.6f, base bare module %.6f vs %.6f per unit CEPCI) -- "
            "the transcription in this gate has drifted from its source."
            % (base_eq, CAPCOST_T101["baseEquipment_perCEPCI"], base_bm,
               CAPCOST_T101["baseBareModule_perCEPCI"]))
        return
    notes.append("reference tray set reproduces CAPCOST T-101 (%.4f, %.4f "
                 "per CEPCI)" % (base_eq, base_bm))

    #  -- the shipped case --------------------------------------------------
    trays = sheets["trays"]
    text = (ROOT / COLUMN / "design" / "column09" / "trays").read_text(
        errors="replace")
    fac, words = _cost_factors(text)
    if not trays["cost"] or not fac:
        problems.append(
            "check_design_sheet(m): the trays sheet carries no `cost {}` "
            "block -- the tray stack is not costed although the case declares "
            "its material class.")
        return
    post = (ROOT / COLUMN / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', post)
    mw = re.search(r'^\s*trayMaterial\s+(\w+)\s*;', post_nc, re.M)
    if not mw or mw.group(1) not in TRAY_FBM:
        problems.append("check_design_sheet(m): %s declares no recognised "
                        "`trayMaterial`, so the witness cannot price its "
                        "trays." % COLUMN)
        return
    cls = mw.group(1)
    if words.get("correlation") != "tray-stack":
        problems.append("check_design_sheet(m): the trays cost names "
                        "correlation %r, not `tray-stack`."
                        % words.get("correlation"))
    for key, want in (("K1", TRAY_SIEVE[0]), ("K2", TRAY_SIEVE[1]),
                      ("K3", TRAY_SIEVE[2]), ("F_BM", TRAY_FBM[cls])):
        if not close(fac.get(key), want, 1e-9):
            problems.append(
                "check_design_sheet(m): the trays sheet publishes %s = %s; "
                "the sieve-tray reference (CAPCOST 2017) for class %s is %s."
                % (key, fac.get(key), cls, want))
    area = trays["sizing"].get("A", (None, ""))[0]
    ntr = trays["sizing"].get("nTrays", (None, ""))[0]
    if not area or not ntr:
        problems.append("check_design_sheet(m): the trays sheet has no A or "
                        "nTrays to recompute the cost from.")
        return
    if not (TRAY_AREA_RANGE[0] <= area <= TRAY_AREA_RANGE[1]):
        notes.append("tray area %.4f m2 is outside the set's range -- the "
                     "witness exercises an extrapolation" % area)
    idx = fac.get("cepci", 0.0) / fac.get("cepci2001", 1.0) * fac.get("usdToEur", 0.0)
    fq = tray_quantity_factor(ntr)
    cp = ntr * tray_cp0_2001(area) * idx
    cbm = cp * TRAY_FBM[cls] * fq
    ctm = 1.18 * cbm
    got = trays["cost"]
    for key, want in (("purchased", cp), ("bareModule", cbm), ("totalModule", ctm)):
        if not close(got.get(key), want, 1e-6):
            problems.append(
                "check_design_sheet(m): the trays %s cost is %s; recomputed "
                "from the sheet's A = %.6g m2 and N = %g with the reference "
                "sieve set, F_BM(%s) and F_q(N) = %.6f it is %.6f."
                % (key, got.get(key), area, ntr, cls, fq, want))
    if not close(fac.get("F_q"), fq, 1e-6):
        problems.append("check_design_sheet(m): the trays sheet publishes "
                        "F_q = %s; F_q(%g) = %.7f." % (fac.get("F_q"), ntr, fq))
    if "INCOMPLETE" in out:
        problems.append("check_design_sheet(m): the column's costing total "
                        "still reads INCOMPLETE although every item, the "
                        "trays included, is priceable.")
    notes.append("trays costed by the tray: A %.4f m2, N %g, F_q %.4f, C_TM "
                 "%.0f recomputed" % (area, ntr, fq, ctm))

    #  -- the refusal, on a probe copy ------------------------------------
    def drop_class(t):
        return "\n".join(l for l in t.splitlines()
                         if not re.match(r'\s*trayMaterial\s', l)) + "\n"

    def bad_class(t):
        return re.sub(r'(trayMaterial\s+)\w+', r'\1stainless', t)

    for label, edit, need in (
            ("no trayMaterial", drop_class,
             ("is not costed: its material class is not declared",
              "trayMaterial <carbonSteel | stainlessSteel | nickelAlloy>")),
            ("unknown trayMaterial", bad_class,
             ("unknown tray material class 'stainless'",
              "Accepted: carbonSteel stainlessSteel nickelAlloy"))):
        dst, rc2, out2, err2 = _run_copy(ROOT / COLUMN, edit)
        try:
            both = out2 + err2
            if rc2 != 0:
                problems.append("check_design_sheet(m): the %s probe failed "
                                "to run (rc=%d)." % (label, rc2))
                continue
            for phrase in need:
                if phrase not in both:
                    problems.append(
                        "check_design_sheet(m): the %s probe does not refuse "
                        "the trays by name (missing: %r)." % (label, phrase))
            if "TOTALS (EUR) -- INCOMPLETE" not in both or \
               "OMITS 1 unit(s) that could not be costed: column09/trays" not in both:
                problems.append(
                    "check_design_sheet(m): the %s probe does not mark the "
                    "total INCOMPLETE naming exactly column09/trays." % label)
            if (dst / "design" / "column09" / "trays").is_file():
                ff, _ = _cost_factors((dst / "design" / "column09" / "trays")
                                      .read_text(errors="replace"))
                if ff:
                    problems.append(
                        "check_design_sheet(m): the %s probe still wrote a "
                        "cost block on the trays sheet." % label)
        finally:
            shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("trays refused by name with no / an unknown material class; "
                 "total INCOMPLETE naming them")


def _sig_digits(tok: str) -> int:
    """Significant digits of a printed decimal token, so a comparison can be
    made at the coarser surface's OWN precision instead of a tolerance
    somebody typed."""
    m = tok.lower().split("e")[0].lstrip("-+").replace(".", "").lstrip("0")
    return max(len(m), 1)


def _run_copy(src: Path, edit):
    """Run a COPY of a case whose postDict `edit` rewrites, from a temp
    directory the arm owns.  The copy is the probe surface: the shipped case
    stays exactly as shipped, and `design/` is regenerated whole by the run,
    so the probe is the DECLARATION and never a sheet edited beforehand."""
    tmp = Path(tempfile.mkdtemp(prefix="design_sheet_n_"))
    dst = tmp / src.name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "design", "reports", "converged", "postProcessing"))
    pd = dst / "system" / "postDict"
    pd.write_text(edit(pd.read_text(errors="replace")))
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(dst)],
                          capture_output=True, text=True)
    return dst, proc.returncode, proc.stdout, proc.stderr


def check_catalyst_bed(problems, notes):
    """(n) -- see the module docstring.  The RECOMPUTATIONS are the point: a
    golden pins what the run PRINTS, and only a recomputation from the
    DECLARATION (the postDict's density and price) and from the unit's OWN
    KPI can see a shell sized on a volume that is not the bed's, or a charge
    priced through an index the case never asked for.

    SABOTAGES, BY HAND, each restored with `cp` and the engine rebuilt:
      S1  CatalystBedSize.cpp: the shell's V_R set to 1.01 x the KPI.
      (Guthrie.cpp is named Turton.cpp since 2026-10-05, DEV.md 4c C38.)
      S2  Guthrie.cpp: the missing-price refusal replaced by price = 0.
      S3  Guthrie.cpp: Cp multiplied by cepci_/cepci2001_ for the charge.
      S4  Guthrie.cpp: C_BM = Cp x (2.25 + 1.82) and C_TM = 1.18 C_BM for
          the charge (the vessel factors applied to a catalyst).
      S5  CatalystBedSize.cpp: m_catalyst = V_R x rho / 1000.
    OBSERVED, each with the shipped case and both probe copies re-run:
      S1  FAILED -- "the shell sheet says V_R = 7.0597241 m3 while the
          unit's own KPI is 6.98982587075 m3".
      S2  FAILED, three lines -- the charge is not refused BY NAME, the
          total is not marked INCOMPLETE, and the charge sheet still carries
          a `cost {}` block (costed at 0: a zero is a claim).
      S3  FAILED -- "costed at 541403.39, not price x mass = 15 x 17474.565
          = 262118.47".
      S4  FAILED -- "bareModule / totalModule (1066822.2 / 1258850.2)
          differ from its purchased cost 262118.47".
      S5  FAILED -- "m_catalyst_kg = 17.474565, but V_R x the case's own
          catalystBulkDensity (6.98982587075 x 2500) is 17474.564677 kg".
    All five restored with `cp` (md5 verified) and the engine rebuilt; the
    gate then returned OK.  Also paid for: the FIRST version of the price
    probe deleted the whole `catalystPrice` LINE, which carried the entry's
    closing braces, so the copy refused the RUN with a parse error and the
    arm reported the engine broken -- the probe removes the STATEMENT now.
    """
    rc, out, err = run_case(KINETIC)
    if rc != 0:
        problems.append("check_design_sheet(n): %s failed (rc=%d).\n    %s"
                        % (KINETIC, rc, err.strip()[:300]))
        return

    base = ROOT / KINETIC / "design" / "converter"
    got = sorted(p.name for p in base.iterdir()) if base.is_dir() else []
    if got != ["catalystCharge", "shell"]:
        problems.append(
            "check_design_sheet(n): %s writes %s under design/converter/, not "
            "the two items a catalyst bed realises (catalystCharge, shell)."
            % (KINETIC, got or "nothing"))
        return
    shell_txt  = (base / "shell").read_text(errors="replace")
    charge_txt = (base / "catalystCharge").read_text(errors="replace")
    shell, charge = parse_sheet(shell_txt), parse_sheet(charge_txt)

    #  ---- the unit's OWN V_R, off the result JSON, as a printed token -----
    kpiLine = ""
    for line in out.splitlines():
        if '"converter": {' in line:
            kpiLine = line
            break
    m = re.search(r'"V_R": *(-?[0-9][0-9.eE+-]*)', kpiLine)
    if not m:
        problems.append("check_design_sheet(n): the run publishes no V_R KPI "
                        "for `converter`, so the bed volume cannot be held to "
                        "anything.")
        return
    V_kpi = float(m.group(1))
    sheet_tok = re.search(r'^\s*V_R\s+([-\d.eE+]+)', shell_txt, re.M)
    sv = shell["sizing"].get("V_R", (None, ""))
    if sv[0] is None or sheet_tok is None:
        problems.append("check_design_sheet(n): the shell sheet publishes no V_R.")
        return
    #  Compared at the SHEET's own printed precision (8 significant digits
    #  today; read off the token, never assumed), the coarser of the two.
    tol = 10.0 ** (-(_sig_digits(sheet_tok.group(1)) - 1))
    if not close(sv[0], V_kpi, tol) or sv[1] != "m3":
        problems.append(
            "check_design_sheet(n): the shell sheet says V_R = %s %s while the "
            "unit's own KPI is %.12g m3 -- the sizer must READ the bed volume "
            "the unit integrated (here: the designSpec's answer), never "
            "rebuild or rescale it." % (sv[0], sv[1], V_kpi))
    if "read from the unit" not in shell_txt:
        problems.append("check_design_sheet(n): the shell's basis does not say "
                        "the volume was READ FROM THE UNIT -- a pass-through "
                        "that does not say it is one reads as a derivation.")

    #  ---- the charge: mass and price RECOMPUTED from the DECLARATION ------
    post = (ROOT / KINETIC / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    dens = re.search(r'\bcatalystBulkDensity\s+([0-9.eE+-]+)', post_nc)
    price = re.search(r'\bcatalystPrice\s+([0-9.eE+-]+)', post_nc)
    if not dens or not price:
        problems.append("check_design_sheet(n): the witness postDict declares "
                        "no catalystBulkDensity / catalystPrice, so nothing "
                        "here can be recomputed -- this arm CANNOT RUN and "
                        "must not pass.")
        return
    rho, pr = float(dens.group(1)), float(price.group(1))
    m_sheet = charge["sizing"].get("m_catalyst_kg", (None, ""))
    if m_sheet[0] is None or m_sheet[1] != "kg":
        problems.append("check_design_sheet(n): the charge sheet publishes no "
                        "m_catalyst_kg in kg.")
        return
    if not close(m_sheet[0], V_kpi * rho, 1.0e-6):
        problems.append(
            "check_design_sheet(n): the charge sheet says m_catalyst_kg = %s, "
            "but V_R x the case's own catalystBulkDensity (%.12g x %g) is "
            "%.6f kg." % (m_sheet[0], V_kpi, rho, V_kpi * rho))
    c = charge["cost"]
    if not c:
        problems.append("check_design_sheet(n): the charge sheet carries no "
                        "`cost {}` block although the case declares a price.")
    else:
        want = pr * m_sheet[0]
        if not close(c.get("purchased", 0.0), want, 1.0e-6):
            problems.append(
                "check_design_sheet(n): the charge is costed at %s, not "
                "price x mass = %g x %s = %.2f.  A declared unit price is the "
                "case's money and no index or factor may touch it."
                % (c.get("purchased"), pr, m_sheet[0], want))
        if not (close(c.get("bareModule", -1.0), c.get("purchased", 0.0), 1e-12)
                and close(c.get("totalModule", -1.0), c.get("purchased", 0.0), 1e-12)):
            problems.append(
                "check_design_sheet(n): the charge's bareModule / totalModule "
                "(%s / %s) differ from its purchased cost %s -- a module factor "
                "or the 1.18 was applied to a catalyst charge."
                % (c.get("bareModule"), c.get("totalModule"), c.get("purchased")))
    sc = shell["cost"]
    if not sc or not sc.get("totalModule", 0.0) > sc.get("purchased", 0.0):
        problems.append("check_design_sheet(n): the shell's total-module cost "
                        "does not exceed its purchased cost -- the vessel shape "
                        "(F_BM, 1.18) is what tells it from the charge, and it "
                        "is not there.")
    if not re.search(r'converter/catalystCharge\s+declared-unit-price\b', out):
        problems.append("check_design_sheet(n): the costing provenance table "
                        "does not name the charge's shape `declared-unit-price` "
                        "-- a reader cannot tell the declared price from a "
                        "Turton correlation on the printed line.")
    if not re.search(r'converter/catalystCharge[^\n]*DECLARED', out):
        problems.append("check_design_sheet(n): the charge's provenance row "
                        "does not say the price was DECLARED.")
    notes.append("catalyst bed: V_R %.4f m3 read from the unit, %.1f kg x %g "
                 "EUR/kg recomputed" % (V_kpi, m_sheet[0], pr))

    #  ---- WITHOUT a price: refused by name, total INCOMPLETE --------------
    #  The probe deletes the STATEMENT and nothing else: the first cut took
    #  the whole line, and with it the entry's closing braces, so the copy
    #  refused the RUN with a parse error -- the probe broken, not the engine.
    src = ROOT / KINETIC
    dst, rc2, out2, err2 = _run_copy(
        src, lambda t: re.sub(r'\bcatalystPrice\s+[^;]*;', '', t))
    if rc2 != 0:
        problems.append("check_design_sheet(n): the copy without catalystPrice "
                        "failed (rc=%d) -- a missing price must refuse the "
                        "ITEM, never the run.\n    %s" % (rc2, err2.strip()[:300]))
    else:
        both = out2 + err2
        if not re.search(r'converter/catalystCharge\s+FAILED:[^\n]*catalystPrice', both):
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "charge is not refused BY NAME (no FAILED line "
                            "naming `catalystPrice`).")
        if "TOTALS (EUR) -- INCOMPLETE" not in out2 or \
           not re.search(r'could not be costed:[^\n]*converter/catalystCharge', out2):
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "costing total is not marked INCOMPLETE naming "
                            "`converter/catalystCharge` -- a total that omits "
                            "the charge and does not say so reads as complete.")
        sh2 = dst / "design" / "converter" / "shell"
        if not sh2.is_file() or not parse_sheet(sh2.read_text(errors="replace"))["cost"]:
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "SHELL lost its cost too -- one refused item must "
                            "not cost the other.")
        ch2 = dst / "design" / "converter" / "catalystCharge"
        if ch2.is_file() and parse_sheet(ch2.read_text(errors="replace"))["cost"]:
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "charge sheet still carries a `cost {}` block.")
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- WITHOUT a density: no mass, said in the basis, refused at cost --
    dst, rc3, out3, err3 = _run_copy(
        src, lambda t: re.sub(r'\bcatalystBulkDensity\s+[^;]*;', '', t))
    if rc3 != 0:
        problems.append("check_design_sheet(n): the copy without "
                        "catalystBulkDensity failed (rc=%d).\n    %s"
                        % (rc3, err3.strip()[:300]))
    else:
        ch3 = dst / "design" / "converter" / "catalystCharge"
        t3 = ch3.read_text(errors="replace") if ch3.is_file() else None
        if t3 is None:
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "no charge sheet is written -- the item exists, "
                            "its mass does not, and the sheet must say which.")
        else:
            s3 = parse_sheet(t3)
            if "m_catalyst_kg" in s3["sizing"]:
                problems.append("check_design_sheet(n): without a density the "
                                "charge still publishes a mass -- from what?")
            if "mass not derivable" not in t3:
                problems.append("check_design_sheet(n): without a density the "
                                "charge's basis does not say `mass not "
                                "derivable`.")
            if s3["cost"]:
                problems.append("check_design_sheet(n): without a density the "
                                "charge is costed anyway.")
        if not re.search(r'converter/catalystCharge\s+FAILED:[^\n]*catalystBulkDensity',
                         out3 + err3):
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "the charge is not refused at cost time naming the "
                            "density.")
        if "TOTALS (EUR) -- INCOMPLETE" not in out3:
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "the total is not marked INCOMPLETE.")
    shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("charge refused by name without a price and without a "
                 "density; total INCOMPLETE both times")


def check_space_velocity_basis(problems, notes):
    """(o) -- see the module docstring.  The RECOMPUTATION is the point: a
    golden pins what the run PRINTS, and a bed sized on the wrong gas basis
    prints a plausible volume; only arithmetic from the DECLARATION and the
    unit's own KPIs can tell the two bases apart.

    SABOTAGES, BY HAND, 2026-10-05, each on VesselSize.cpp, restored with
    `cp` (md5 verified) and the engine rebuilt; the gate then returned OK:
      S1  the NORMAL branch divides Q_actual (the old behaviour: the basis
          word read and ignored)  -> FAILED: "the converter sheet says V_R =
          0.24186478 m3, but N_in R T_n/P_n x 3600 / SV (...) is 18.628985
          m3".
      S2  the missing-basis refusal disabled and an absent basis read as
          `actual`  -> FAILED: "without spaceVelocityBasis the converter is
          not refused BY NAME".
      S3  the unknown-word refusal disabled  -> FAILED: "`spaceVelocityBasis
          standard` is not refused naming the accepted words (normal,
          actual) (rc=0)".
      S4  both branches divide Q_normal  -> FAILED: "on `actual` the sheet
          says V_R = 1434.8476 m3, but N_in R T/P x 3600 / SV is 18.628986
          m3" -- the arm that holds the branch no shipped case uses.
    """
    R, T_N, P_N = 8.314462618, 273.15, 101325.0

    def kpis_of(out):
        for line in out.splitlines():
            if '"converter": {' in line and '"N_in_mol_s"' in line:
                vals = {}
                for key in ("N_in_mol_s", "T", "P"):
                    m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, line)
                    if not m:
                        break
                    vals[key] = float(m.group(1))
                if len(vals) == 3:
                    return vals
        return None

    def sheet_V(case_dir):
        f = case_dir / "design" / "converter" / "vessel"
        if not f.is_file():
            return None, None, ""
        txt = f.read_text(errors="replace")
        tok = re.search(r'^\s*V_R\s+([-\d.eE+]+)', txt, re.M)
        return (float(tok.group(1)) if tok else None,
                tok.group(1) if tok else None, txt)

    rc, out, err = run_case(SPACEV)
    if rc != 0:
        problems.append("check_design_sheet(o): %s failed (rc=%d).\n    %s"
                        % (SPACEV, rc, err.strip()[:300]))
        return
    k = kpis_of(out)
    post = (ROOT / SPACEV / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    sv = re.search(r'\bspaceVelocity\s+([0-9.eE+-]+)\s*;', post_nc)
    bw = re.search(r'\bspaceVelocityBasis\s+(\w+)\s*;', post_nc)
    if k is None or not sv or not bw or bw.group(1) != "normal":
        problems.append("check_design_sheet(o): the witness publishes no "
                        "converter N_in_mol_s/T/P KPI, or its postDict "
                        "declares no `spaceVelocity` with `spaceVelocityBasis "
                        "normal;` -- this arm CANNOT RUN and must not pass.")
        return
    SV = float(sv.group(1))
    V, tok, txt = sheet_V(ROOT / SPACEV)
    if V is None:
        problems.append("check_design_sheet(o): no V_R on the converter sheet.")
        return
    want = k["N_in_mol_s"] * R * T_N / P_N * 3600.0 / SV
    tol = 10.0 ** (-(_sig_digits(tok) - 1))
    if not close(V, want, tol):
        problems.append(
            "check_design_sheet(o): the converter sheet says V_R = %s m3, but "
            "N_in R T_n/P_n x 3600 / SV (%.12g x %.10g x %g / %g x 3600 / %g) "
            "is %.6f m3 -- the NORMAL basis the case declares did not reach "
            "the arithmetic." % (tok, k["N_in_mol_s"], R, T_N, P_N, SV, want))
    if "NORMAL gas volume" not in txt:
        problems.append("check_design_sheet(o): the converter sheet's basis "
                        "does not say NORMAL gas volume.")

    src = ROOT / SPACEV
    #  ---- no basis declared: refused by name, with the ratio -------------
    #  The probe deletes the STATEMENT, never the line (arm (n)'s lesson).
    dst, rc2, out2, err2 = _run_copy(
        src, lambda t: re.sub(r'\bspaceVelocityBasis\s+[^;]*;', '', t))
    both = out2 + err2
    ratio = k["P"] * T_N / (P_N * k["T"])
    if rc2 != 0:
        problems.append("check_design_sheet(o): the copy without "
                        "spaceVelocityBasis failed (rc=%d) -- a missing basis "
                        "must refuse the ITEM, never the run." % rc2)
    elif not re.search(r'converter\s+FAILED:[^\n]*spaceVelocityBasis', both):
        problems.append("check_design_sheet(o): without spaceVelocityBasis the "
                        "converter is not refused BY NAME (no FAILED line "
                        "naming `spaceVelocityBasis`).")
    elif ("%.2f" % ratio) not in both:
        problems.append("check_design_sheet(o): the missing-basis refusal does "
                        "not quote the normal/actual ratio %.2f at the unit's "
                        "own conditions." % ratio)
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- `standard`: refused naming the accepted words ------------------
    dst, rc3, out3, err3 = _run_copy(
        src, lambda t: re.sub(r'\bspaceVelocityBasis\s+normal\s*;',
                              'spaceVelocityBasis standard;', t))
    both = out3 + err3
    if rc3 != 0 or not re.search(
            r'converter\s+FAILED:[^\n]*space-velocity basis[^\n]*standard', both) \
            or not re.search(r'Accepted[^\n]*normal[^\n]*actual', both):
        problems.append("check_design_sheet(o): `spaceVelocityBasis standard` "
                        "is not refused naming the accepted words (normal, "
                        "actual) (rc=%d)." % rc3)
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- `actual`: the other branch, held to its own arithmetic ---------
    SV_act = 259.665

    def to_actual(t):
        t = re.sub(r'\bspaceVelocity\s+[0-9.eE+-]+\s*;',
                   'spaceVelocity %g;' % SV_act, t)
        return re.sub(r'\bspaceVelocityBasis\s+normal\s*;',
                      'spaceVelocityBasis actual;', t)
    dst, rc4, out4, err4 = _run_copy(src, to_actual)
    if rc4 != 0:
        problems.append("check_design_sheet(o): the `actual` copy failed "
                        "(rc=%d).\n    %s" % (rc4, err4.strip()[:300]))
    else:
        k4 = kpis_of(out4)
        V4, tok4, txt4 = sheet_V(dst)
        if k4 is None or V4 is None or "ACTUAL gas volume" not in txt4:
            problems.append("check_design_sheet(o): the `actual` copy wrote no "
                            "converter sheet on the ACTUAL basis -- the probe "
                            "did not land.")
        else:
            want4 = k4["N_in_mol_s"] * R * k4["T"] / k4["P"] * 3600.0 / SV_act
            if not close(V4, want4, 10.0 ** (-(_sig_digits(tok4) - 1))):
                problems.append(
                    "check_design_sheet(o): on `actual` the sheet says V_R = "
                    "%s m3, but N_in R T/P x 3600 / SV is %.6f m3."
                    % (tok4, want4))
    shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("space velocity: V_R %.4f m3 on NORMAL gas recomputed; no "
                 "basis and `standard` refused by name; `actual` recomputed"
                 % V)


def check_exchanger_routes(problems, notes):
    """(p) -- see the module docstring.  The RECOMPUTATION is the point: a
    golden pins what the run PRINTS, and an LMTD computed from the wrong end
    of a utility, or a rated area replaced by a computed one, prints a
    plausible area; only arithmetic from the run's KPIs, the declared U and
    the utility RECORD can see it.

    SABOTAGES, BY HAND, 2026-10-07, each on ShellTubeHX.cpp, restored with
    `cp` and the engine rebuilt; the gate then returned OK:
      S1  co-current terminal differences (T_in - t_in, T_out - t_out)
          -> FAILED on all four cooling-water coolers, e.g. "N2Cooler's
          sheet says LMTD = 47.941815, but the counter-current LMTD of
          process 473.769 -> 313.15 K against coolingWater 298.15 -> 308.15
          K is 62.715109 K".  The CHILLER did not fire, and cannot: its
          utility boils at one temperature (T_in = T_out), so co-current
          and counter-current are the same arithmetic there.
      S2  the `utility` + `LMTD` refusal disabled  -> FAILED: "a copy with
          LMTD beside utility on N2Cooler is not refused BY NAME".
      S3  route 3 computing A = |Q|/(U*LMTD) from the unit's own U and
          LMTD instead of passing its area through  -> FAILED: "rated
          FEHE's sheet says A = 1562.7184 m2, but its own flowsheetDict
          declares area 2000 m2" -- the two differ because the exchanger's
          published U*A*LMTD does not reproduce its duty (the case's
          postDict header says why).
    """
    case = ROOT / HXROUTE
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    entries = re.findall(
        r'\{\s*unitName\s+(\w+)\s*;\s*type\s+shellTubeHX\s*;[^{]*'
        r'designRules\s*\{([^}]*)\}', post_nc)
    routed = []        # (unit, U, utility)
    rated = []         # unit
    for unit, rules in entries:
        u = re.search(r'\bU\s+([0-9.eE+-]+)\s*;', rules)
        ut = re.search(r'\butility\s+(\w+)\s*;', rules)
        if ut and u:
            routed.append((unit, float(u.group(1)), ut.group(1)))
        elif not u and not ut and not re.search(r'\bLMTD\b', rules):
            rated.append(unit)
    if not routed or not rated:
        problems.append("check_design_sheet(p): %s declares %d cooler(s) on a "
                        "`utility` and %d rated exchanger(s) -- this arm needs "
                        "at least one of each and CANNOT RUN; it must not pass."
                        % (HXROUTE, len(routed), len(rated)))
        return

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(p): %s failed (rc=%d).\n    %s"
                        % (HXROUTE, rc, err.strip()[:300]))
        return

    def kpi_line(unit):
        for line in out.splitlines():
            if ('"%s": {' % unit) in line and '"Q_kW"' in line:
                return line
        return ""

    def kpi(line, key):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, line)
        return float(m.group(1)) if m else None

    def sheet_tok(unit, key):
        f = case / "design" / unit / "shellTubeHX"
        if not f.is_file():
            return None, None
        m = re.search(r'^\s*%s\s+([-\d.eE+]+)' % key,
                      f.read_text(errors="replace"), re.M)
        return (float(m.group(1)), m.group(1)) if m else (None, None)

    def utility_T(name):
        f = ROOT / "data" / "standards" / "utilities" / (name + ".dat")
        if not f.is_file():
            return None
        t = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '',
                   f.read_text(errors="replace"), flags=re.S))
        a = re.search(r'^\s*T_in\s+([0-9.eE+-]+)\s+K\s*;', t, re.M)
        b = re.search(r'^\s*T_out\s+([0-9.eE+-]+)\s+K\s*;', t, re.M)
        return (float(a.group(1)), float(b.group(1))) if a and b else None

    checked = 0
    for unit, U, uname in routed:
        line = kpi_line(unit)
        Q, Ti, To = kpi(line, "Q_kW"), kpi(line, "T_in"), kpi(line, "T_out")
        uT = utility_T(uname)
        if None in (Q, Ti, To) or uT is None:
            problems.append("check_design_sheet(p): %s publishes no Q_kW/T_in/"
                            "T_out KPI, or utility record '%s' declares no "
                            "T_in/T_out in K -- the LMTD cannot be recomputed."
                            % (unit, uname))
            continue
        t_in, t_out = uT
        if Q < 0.0:
            d1, d2 = Ti - t_out, To - t_in
        else:
            d1, d2 = t_out - Ti, t_in - To
        lm = d1 if abs(d1 - d2) < 1e-9 * max(d1, d2) else (d1 - d2) / math.log(d1 / d2)
        A = abs(Q) * 1000.0 / (U * lm)
        for key, want in (("LMTD", lm), ("A", A)):
            got, tok = sheet_tok(unit, key)
            if got is None:
                problems.append("check_design_sheet(p): %s's sheet carries no "
                                "`%s`." % (unit, key))
            elif not close(got, want, 10.0 ** (-(_sig_digits(tok) - 1))):
                problems.append(
                    "check_design_sheet(p): %s's sheet says %s = %s, but the "
                    "counter-current LMTD of process %.6g -> %.6g K against "
                    "%s %.6g -> %.6g K is %.6f K, and |Q|/(U*LMTD) with the "
                    "case's U = %g is %.6f m2."
                    % (unit, key, tok, Ti, To, uname, t_in, t_out, lm, U, A))
        checked += 1

    for unit in rated:
        fd = (case / unit / "system" / "flowsheetDict").read_text(errors="replace")
        m = re.search(r'\barea\s+([0-9.eE+-]+)\s*m2\s*;', fd)
        line = kpi_line(unit)
        got, tok = sheet_tok(unit, "A")
        if not m or got is None:
            problems.append("check_design_sheet(p): rated %s declares no "
                            "`area ... m2` in its flowsheetDict, or its sheet "
                            "carries no `A` -- nothing to hold." % unit)
            continue
        if not close(got, float(m.group(1)), 10.0 ** (-(_sig_digits(tok) - 1))):
            problems.append("check_design_sheet(p): rated %s's sheet says A = "
                            "%s m2, but its own flowsheetDict declares area %s "
                            "m2 -- the rated area was not passed through."
                            % (unit, tok, m.group(1)))
        for key in ("U", "LMTD"):
            g, gt = sheet_tok(unit, key)
            k = kpi(line, key)
            if g is None or k is None or \
                    not close(g, k, 10.0 ** (-(_sig_digits(gt) - 1))):
                problems.append("check_design_sheet(p): rated %s's sheet %s = "
                                "%s is not the unit's own %s KPI (%s)."
                                % (unit, key, gt, key, k))
        checked += 1

    #  ---- probes: three copies, each refusing ONE item BY NAME ----------
    def edit_rules(unit, f):
        def ed(t):
            pat = re.compile(r'(\{\s*unitName\s+%s\s*;[^{]*designRules\s*\{)'
                             r'([^}]*)(\})' % unit)
            return pat.sub(lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                           t, count=1)
        return ed

    victim = routed[0][0]
    probes = (
        ("LMTD beside utility on %s" % victim,
         edit_rules(victim, lambda r: r + " LMTD 30; "), victim,
         r'BOTH[^\n]*utility[^\n]*LMTD'),
        ("the Chiller served by coolingWater (a temperature cross)",
         edit_rules("Chiller", lambda r: re.sub(r'\butility\s+\w+\s*;',
                                                'utility coolingWater;', r)),
         "Chiller", r'temperature cross'),
        ("%s with its U and utility deleted (no rated area)" % victim,
         edit_rules(victim, lambda r: re.sub(r'\b(U|utility)\s+[^;]*;', '', r)),
         victim, r'publishes no `area`'),
    )
    for what, ed, unit, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("check_design_sheet(p): the copy with %s failed "
                            "(rc=%d) -- a refused exchanger must refuse the "
                            "ITEM, never the run." % (what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (unit, pat), both):
            problems.append("check_design_sheet(p): a copy with %s is not "
                            "refused BY NAME (no `%s  FAILED:` line matching "
                            "/%s/)." % (what, unit, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("exchanger routes: %d sheet(s) recomputed (LMTD from the run "
                 "and the utility record, the rated area passed through); "
                 "three probes refused by name" % checked)


#  THE CAPCOST 2017 FIXED-ROOF TANK ROW, transcribed HERE as well as in
#  `Turton.cpp` (2026-10-07): worksheet "Equipment Cost Data", block "Tank
#  Data", row "Fixed Roof", cells C204:I204.  A recomputation that read the
#  engine's own constants would agree with any transcription error.
TANK_K = (4.8509, -0.3973, 0.1445)
TANK_B1, TANK_VMIN, TANK_VMAX = 1.1, 90.0, 30000.0


def _record_scalars(path: Path, keys):
    t = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '',
               path.read_text(errors="replace"), flags=re.S))
    out = {}
    for k in keys:
        m = re.search(r'^\s*%s\s+([-0-9.eE+]+)' % k, t, re.M)
        if m:
            out[k] = float(m.group(1))
    return out


def _anchored_rackett_rho(case: Path, comp: dict, T: float):
    """The LIQUID density `ThermoPackage::density` documents, recomputed from
    the case's own component records: per component V = Vliq x
    Rackett(T)/Rackett(298.15) (bare Rackett where no Vliq), mole-weighted;
    a component at or above its Tc is given no volume (PhaseDensity.H).
    Returns (rho, excluded mole fraction)."""
    R = 8.314462618
    def rack(Tk, Tc, Pc_Pa, w):
        Tr = Tk / Tc
        return (R * Tc / Pc_Pa) * (0.29056 - 0.08775 * w) ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0))
    zs, mbar, vmix, excl = 0.0, 0.0, 0.0, 0.0
    sub = {}
    for name, z in comp.items():
        rec = _record_scalars(case / "constant" / "components" / (name + ".dat"),
                              ("MW", "Tc", "Pc", "omega", "Vliq"))
        if z <= 0.0:
            continue
        if T >= rec["Tc"]:
            excl += z
            continue
        sub[name] = (z, rec)
    zs = sum(z for z, _ in sub.values())
    for name, (z, rec) in sub.items():
        Pc = rec["Pc"] * 1.0e5
        if "Vliq" in rec:
            v = rec["Vliq"] * rack(T, rec["Tc"], Pc, rec["omega"]) / \
                rack(298.15, rec["Tc"], Pc, rec["omega"])
        else:
            v = rack(T, rec["Tc"], Pc, rec["omega"])
        mbar += z / zs * rec["MW"] / 1000.0
        vmix += z / zs * v
    return mbar / vmix, excl


def check_storage(problems, notes):
    """(q) A STORAGE TANK IS SIZED FROM ITS STREAM AND COSTED ON THE ROW THE
    PROGRAM CARRIES (2026-10-07, DEV.md 4c C44 slice 2).  On
    `greenAmmoniaIndustrialN2`, whose postDict attaches `NH3Storage` to the
    boundary stream `ProductNH3`:

      * the tank's `massFlow` is the stream's own published `F_mass`;
      * its `rho` is RECOMPUTED from the case's component records (the
        anchored-Rackett liquid route, dissolved supercritical gases given no
        volume) at the stream's published T and composition;
      * V_stored = storageTime x massFlow / rho, V_tanks = V_stored /
        fillFraction, N = ceil(V_tanks / maxTankVolume), V_R = V_tanks / N
        -- RECOMPUTED from the postDict's own declarations, and exactly N
        sheets `design/NH3Storage/tank1..N` must exist carrying that V_R;
      * each tank's purchased, bare-module and total-module cost RECOMPUTED
        from the fixed-roof row transcribed above, the costing block's CEPCI
        and currency, B1 = 1.1, and 1.18;
      * the stored liquid is below 0 degC, so the run must say LOWER BOUND
        on the costing line of every tank and in the caveat block;
      * three copies: `storageTime` with no unit, the store attached to the
        VAPOUR stream FlashGas, each refused BY NAME (the run still exit 0);
        and `maxTankVolume 50000`, which must make ONE tank of V_tanks.

    SABOTAGES, BY HAND, 2026-10-07, each restored with `cp` and the engine
    rebuilt; the gate then returned OK:
      S1  StorageTankSize.cpp: V_tanks = V_stored (fillFraction ignored)
          -> FAILED: "NH3Storage/tank1 values.V_tanks = 32215.6846634,
          recomputed 35795.2052", and the V_R, the three costs and the
          sheet's V_R with it.
      S2  Turton.cpp: the refrigerated-service line suppressed  -> FAILED:
          "NH3Storage/tank1 stores a liquid at 238.15 K and its costing line
          does not say LOWER BOUND" (both tanks).
      S3  Turton.cpp: the tank row's size key V_R -> V_tanks (each tank
          priced at the WHOLE store's volume)  -> FAILED: "tank1
          cost.purchased = 2075006.28365, recomputed 1131204.02".
      S4  StorageTankSize.cpp: the unit requirement on storageTime removed
          -> FAILED: "a copy with storageTime with no unit is not refused BY
          NAME".
    NOT CHECKED: whether 21 days, 0.90 and 30 000 m3 are the right design
    basis -- they are the case's declared assumptions -- and whether the
    package's density is the TRUE density of liquid ammonia (it is the
    engine's; see the case README for the finding about the record's Vliq).
    """
    case = ROOT / HXROUTE
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    m = re.search(r'\bstorage\s*\(\s*\{([^}]*)\}', post_nc)
    if not m:
        problems.append("check_design_sheet(q): %s declares no `storage ( { "
                        "... } )` entry -- this arm CANNOT RUN; it must not "
                        "pass." % HXROUTE)
        return
    ent = m.group(1)

    def word(k):
        mm = re.search(r'\b%s\s+(\w+)\s*;' % k, ent)
        return mm.group(1) if mm else None

    def num(k):
        mm = re.search(r'\b%s\s+([-0-9.eE+]+)\s*(\w*)\s*;' % k, ent)
        return (float(mm.group(1)), mm.group(2)) if mm else (None, None)

    name, stream = word("name"), word("stream")
    t_val, t_unit = num("storageTime")
    fill, _ = num("fillFraction")
    vmax, _ = num("maxTankVolume")
    if None in (name, stream, t_val, fill, vmax) or t_unit not in ("day", "h"):
        problems.append("check_design_sheet(q): the storage entry does not "
                        "declare name/stream/storageTime (in day or h)/"
                        "fillFraction/maxTankVolume -- nothing to recompute.")
        return
    t_day = t_val if t_unit == "day" else t_val / 24.0

    cm = re.search(r'\bcosting\s*\{([^}]*)\}', post_nc)
    cepci = float(re.search(r'\bcepci\s+([0-9.]+)', cm.group(1)).group(1))
    cepci01 = float(re.search(r'\bcepci2001\s+([0-9.]+)', cm.group(1)).group(1))
    fx = float(re.search(r'\busdToEur\s+([0-9.]+)', cm.group(1)).group(1))

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(q): %s failed (rc=%d)." % (HXROUTE, rc))
        return
    sl = next((l for l in out.splitlines()
               if l.strip().startswith('"%s": {' % stream) and '"F_mass"' in l), "")
    fm = re.search(r'"F_mass": *([-0-9.eE+]+)', sl)
    Tm = re.search(r'"T": *([-0-9.eE+]+)', sl)
    comp = {k: float(v) for k, v in
            re.findall(r'"(\w+)": *([-0-9.eE+]+)',
                       (re.search(r'"composition": *\{([^}]*)\}', sl) or
                        re.search(r'()', '')).group(1))}
    if not (fm and Tm and comp):
        problems.append("check_design_sheet(q): stream %s is not in the result "
                        "JSON with F_mass, T and composition." % stream)
        return
    mdot, T = float(fm.group(1)), float(Tm.group(1))
    rho, excl = _anchored_rackett_rho(case, comp, T)

    V_stored = t_day * 86400.0 * mdot / rho
    V_tanks = V_stored / fill
    N = max(1, math.ceil(V_tanks / vmax - 1e-9))
    V_R = V_tanks / N

    eq = [l for l in out.splitlines() if '"item": "%s/tank' % name in l]
    if len(eq) != N:
        problems.append("check_design_sheet(q): %s should be %d tank(s) "
                        "(V_tanks %.6g m3 / at most %.6g m3), the result "
                        "carries %d." % (name, N, V_tanks, vmax, len(eq)))
    lc = math.log10(V_R)
    cp = 10.0 ** (TANK_K[0] + TANK_K[1] * lc + TANK_K[2] * lc * lc) \
        * cepci / cepci01 * fx
    want = {"values.massFlow": mdot, "values.rho": rho,
            "values.V_stored": V_stored, "values.V_tanks": V_tanks,
            "values.V_R": V_R, "values.nTanks": N,
            "cost.purchased": cp, "cost.bareModule": TANK_B1 * cp,
            "cost.totalModule": 1.18 * TANK_B1 * cp}
    for line in eq:
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        for key, w in want.items():
            sub, k = key.split(".")
            blk = re.search(r'"%s": \{([^}]*)' % ("values" if sub == "values" else "cost"),
                            line)
            g = re.search(r'"%s": *(-?[0-9.eE+]+)' % k, blk.group(1) if blk else "")
            if not g or not close(float(g.group(1)), w, 1e-6):
                problems.append("check_design_sheet(q): %s %s = %s, recomputed "
                                "%.9g (storageTime %g day x F_mass %.9g kg/s / "
                                "rho %.9g kg/m3, fill %g, at most %g m3; "
                                "CAPCOST fixed roof)."
                                % (item, key, g.group(1) if g else "(absent)",
                                   w, t_day, mdot, rho, fill, vmax))
        tag = item.split("/", 1)[1]
        f = case / "design" / name / tag
        if not f.is_file():
            problems.append("check_design_sheet(q): no sheet design/%s/%s."
                            % (name, tag))
        else:
            sz = parse_sheet(f.read_text(errors="replace"))["sizing"]
            if "V_R" not in sz or not close(sz["V_R"][0], V_R, 1e-6):
                problems.append("check_design_sheet(q): sheet design/%s/%s "
                                "V_R %s against %.9g." % (name, tag,
                                sz.get("V_R"), V_R))
        if T < 273.15 and not re.search(
                r"\[lower bound\] storageTank '%s'" % re.escape(item), out):
            problems.append("check_design_sheet(q): %s stores a liquid at "
                            "%.2f K and its costing line does not say LOWER "
                            "BOUND." % (item, T))
    if T < 273.15 and not re.search(r'"category": "costing"[^\n]*REFRIGERATED', out):
        problems.append("check_design_sheet(q): the refrigerated-storage floor "
                        "is not in the run's caveat record.")

    def edit_store(f):
        return lambda t: re.sub(r'(\bstorage\s*\(\s*\{)([^}]*)(\})',
                                lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                                t, count=1)
    probes = (
        ("storageTime with no unit",
         edit_store(lambda e: re.sub(r'storageTime\s+[^;]*;', 'storageTime 21;', e)),
         r'carries no unit'),
        ("the store attached to the vapour stream FlashGas",
         edit_store(lambda e: re.sub(r'\bstream\s+\w+\s*;', 'stream FlashGas;', e)),
         r'is a vapour'),
    )
    for what, ed, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        if rcp != 0:
            problems.append("check_design_sheet(q): the copy with %s failed "
                            "(rc=%d) -- a refused store must refuse the ITEM, "
                            "never the run." % (what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (name, pat), outp + errp):
            problems.append("check_design_sheet(q): a copy with %s is not "
                            "refused BY NAME (/%s/)." % (what, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)
    dst, rcp, outp, errp = _run_copy(case, edit_store(
        lambda e: re.sub(r'maxTankVolume\s+[^;]*;', 'maxTankVolume 50000;', e)))
    one = [l for l in outp.splitlines() if '"item": "%s/tank' % name in l]
    vr1 = re.search(r'"V_R": *([-0-9.eE+]+)', one[0]) if len(one) == 1 else None
    if rcp != 0 or len(one) != 1 or not vr1 or \
            not close(float(vr1.group(1)), V_tanks, 1e-6):
        problems.append("check_design_sheet(q): with maxTankVolume 50000 the "
                        "store should be ONE tank of %.9g m3; the copy made %d "
                        "(rc=%d)." % (V_tanks, len(one), rcp))
    shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("storage: %s on %s, %d tank(s) of %.1f m3 recomputed from "
                 "%g day x %.4g kg/s / %.2f kg/m3 / %g (%.3g mole fraction "
                 "given no volume), costed on the CAPCOST fixed-roof row, "
                 "LOWER BOUND said; three probes" % (name, stream, N, V_R,
                 t_day, mdot, rho, fill, excl))


def _srk_vapour_rho(case: Path, comp: dict, T: float, P: float):
    """SRK vapour density, kij = 0 (the case declares no binary block), the
    LARGEST real root -- recomputed here from the component records with the
    engine's own constants (Omega_a 0.42747, Omega_b 0.08664, Soave's m)."""
    R = 8.314462618
    zs = sum(comp.values())
    recs = {n: _record_scalars(case / "constant" / "components" / (n + ".dat"),
                               ("MW", "Tc", "Pc", "omega"))
            for n in comp}
    ai, bi = {}, {}
    for n, r in recs.items():
        Pc = r["Pc"] * 1.0e5
        m = 0.48508 + 1.55171 * r["omega"] - 0.15613 * r["omega"] ** 2
        alpha = (1.0 + m * (1.0 - math.sqrt(T / r["Tc"]))) ** 2
        ai[n] = 0.42747 * R * R * r["Tc"] ** 2 / Pc * alpha
        bi[n] = 0.08664 * R * r["Tc"] / Pc
    y = {n: z / zs for n, z in comp.items()}
    a = sum(y[i] * y[j] * math.sqrt(ai[i] * ai[j]) for i in y for j in y)
    b = sum(y[i] * bi[i] for i in y)
    A, B = a * P / (R * T) ** 2, b * P / (R * T)
    #  Z^3 - Z^2 + (A - B - B^2) Z - A B = 0: the largest real root, by
    #  Newton from Z = 1 (the vapour branch) -- no numpy in the gate.
    Z = 1.0
    for _ in range(200):
        f = Z ** 3 - Z ** 2 + (A - B - B * B) * Z - A * B
        d = 3 * Z * Z - 2 * Z + (A - B - B * B)
        Z -= f / d
    mbar = sum(y[n] * recs[n]["MW"] for n in y) / 1000.0
    return mbar / (Z * R * T / P)


def _stream_json(out: str, stream: str):
    sl = next((l for l in out.splitlines()
               if l.strip().startswith('"%s": {' % stream) and '"F_mass"' in l), "")
    if not sl:
        return None
    g = lambda k: float(re.search(r'"%s": *([-0-9.eE+]+)' % k, sl).group(1))
    comp = {k: float(v) for k, v in re.findall(
        r'"(\w+)": *([-0-9.eE+]+)', re.search(r'"composition": *\{([^}]*)\}', sl).group(1))}
    return {"T": g("T"), "P": g("P"), "vf": g("vf"), "F_mass": g("F_mass"),
            "comp": comp}


def check_inventory(problems, notes):
    """(r) WHAT EACH ITEM HOLDS IS ITS VOLUME x FRACTION x DENSITY x
    COMPOSITION, AND NOTHING ELSE (2026-10-07, DEV.md 4c C44 slice 3).  On
    `greenAmmoniaIndustrialN2`, for every item whose result line carries an
    `inventory` object:

      * the volume is the item's own `V_R`; each held stream's fraction is
        the one its postDict `held ( ... )` declares (a storage tank: its
        `fillFraction`);
      * each phase's density is RECOMPUTED from the case's component
        records at the stream's published state -- the anchored-Rackett
        liquid route (components the package cannot price alone given no
        volume) or the SRK vapour root with kij = 0 -- and its mass is
        V x fraction x rho;
      * `mass.<c>` is the sum over the phases of mass x w_c, w from the
        stream's published composition and the records' molar masses, and
        `mass.total` their sum; the two product tanks together hold exactly
        storageTime of production;
      * the item's sheet carries an `inventory {}` block whose total is the
        same number, and the console lists every sized item WITHOUT one
        under NOT DECLARED (never as zero);
      * three copies: a declared `volume` beside a sized V_R, a TWO-PHASE
        stream, and fractions summing above 1 -- each REFUSED by name while
        the item keeps its size and the run exits 0.

    SABOTAGES, BY HAND, 2026-10-07, each restored with `cp` and the engine
    rebuilt; the gate then returned OK:
      S1  Inventory.cpp: a phase's volume = V (its fraction ignored)  ->
          FAILED: "Converter HotEffluent.volume = 21.5822428747, recomputed
          8.63289715", the mass and every component with it.
      S2  PhaseDensity.cpp: the per-component split on MOLE fractions  ->
          FAILED: "Converter mass.H2 = 120.796640979, recomputed 26.1629745".
      S3  Inventory.cpp: the declared-volume-beside-V_R refusal removed  ->
          FAILED: "a copy with a declared volume beside the Separator's sized
          V_R is not refused BY NAME".
      S4  SizingPass.cpp: the NOT DECLARED list suppressed  -> FAILED: "the
          items with no declared inventory are not listed as NOT DECLARED".
    NOT CHECKED: whether the declared fractions (bed voidage, liquid level)
    are right -- they are the case's assumptions; and whether the engine's
    densities are the TRUE ones (the README's Vliq finding).
    """
    case = ROOT / HXROUTE
    post_nc = re.sub(r'//[^\n]*', '', re.sub(
        r'/\*.*?\*/', '', (case / "system" / "postDict").read_text(errors="replace"),
        flags=re.S))
    declared = {}
    for unit, body in re.findall(
            r'\{\s*unitName\s+(\w+)\s*;[^{]*designRules\s*\{[^}]*\}\s*'
            r'inventory\s*\{\s*held\s*\((.*?)\)\s*;\s*\}', post_nc, re.S):
        declared[unit] = {s: float(f) for s, f in re.findall(
            r'\{\s*stream\s+(\w+)\s*;\s*fraction\s+([0-9.eE+-]+)\s*;\s*\}', body)}
    if not declared:
        problems.append("check_design_sheet(r): %s declares no unit "
                        "`inventory { held ( ... ); }` -- this arm CANNOT RUN; "
                        "it must not pass." % HXROUTE)
        return

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(r): %s failed (rc=%d)." % (HXROUTE, rc))
        return
    mw = {}
    for f in (case / "constant" / "components").glob("*.dat"):
        mw[f.stem] = _record_scalars(f, ("MW",))["MW"]

    lines = [l for l in out.splitlines() if '"inventory": {' in l]
    seen, tank_total, n_phase = set(), 0.0, 0
    for line in lines:
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        inv = dict((k, float(v)) for k, v in re.findall(
            r'"([A-Za-z_][\w.]*)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"inventory": \{([^}]*)\}', line).group(1)))
        vals = dict((k, float(v)) for k, v in re.findall(
            r'"(\w+)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"values": \{([^}]*)\}', line).group(1)))
        seen.add(item)
        if "/tank" in item:
            stm = re.search(r'storage\s*\(\s*\{[^}]*\bstream\s+(\w+)', post_nc).group(1)
            held = {stm: vals["fillFraction"]}
        else:
            held = declared.get(item)
            if held is None:
                problems.append("check_design_sheet(r): %s publishes an "
                                "inventory the postDict does not declare." % item)
                continue
        if not close(inv.get("volume", -1.0), vals["V_R"], 1e-9):
            problems.append("check_design_sheet(r): %s inventory volume %s is "
                            "not its own V_R %s." % (item, inv.get("volume"), vals["V_R"]))
        want_c, total = {}, 0.0
        for stream, frac in held.items():
            sj = _stream_json(out, stream)
            if sj is None:
                problems.append("check_design_sheet(r): stream %s not in the "
                                "result." % stream)
                continue
            if sj["vf"] <= 1e-9:
                rho, _ = _anchored_rackett_rho(case, sj["comp"], sj["T"])
            else:
                rho = _srk_vapour_rho(case, sj["comp"], sj["T"], sj["P"])
            m = vals["V_R"] * frac * rho
            n_phase += 1
            for key, w in (("fraction", frac), ("volume", vals["V_R"] * frac),
                           ("rho", rho), ("mass", m)):
                got = inv.get("%s.%s" % (stream, key))
                if got is None or not close(got, w, 1e-6):
                    problems.append("check_design_sheet(r): %s %s.%s = %s, "
                                    "recomputed %.9g (V_R %.9g x %g x rho %.9g "
                                    "at %.2f K, %.6g Pa, vf %g)."
                                    % (item, stream, key, got, w, vals["V_R"],
                                       frac, rho, sj["T"], sj["P"], sj["vf"]))
            mbar = sum(z * mw[c] for c, z in sj["comp"].items())
            for c, z in sj["comp"].items():
                want_c[c] = want_c.get(c, 0.0) + m * z * mw[c] / mbar
            total += m
        for c, w in want_c.items():
            got = inv.get("mass." + c)
            if got is None or not close(got, w, 1e-6):
                problems.append("check_design_sheet(r): %s mass.%s = %s, "
                                "recomputed %.9g." % (item, c, got, w))
        if not close(inv.get("mass.total", -1.0), total, 1e-6):
            problems.append("check_design_sheet(r): %s mass.total = %s, "
                            "recomputed %.9g." % (item, inv.get("mass.total"), total))
        if "/tank" in item:
            tank_total += total
        name, _, tag = item.partition("/")
        sheet = case / "design" / name / (tag if tag else re.search(
            r'"type": "([^"]+)"', line).group(1))
        txt = sheet.read_text(errors="replace") if sheet.is_file() else ""
        mm = re.search(r'^inventory\s*\n\{.*?^\s*total\s+([-0-9.eE+]+)\s*kg\s*;',
                       txt, re.S | re.M)
        if not mm or not close(float(mm.group(1)), total, 1e-6):
            problems.append("check_design_sheet(r): %s's sheet carries no "
                            "`inventory {}` whose total is %.9g kg." % (item, total))

    for u in declared:
        if u not in seen:
            problems.append("check_design_sheet(r): %s declares an inventory "
                            "and the result publishes none." % u)
    #  The two tanks together hold storageTime of production.
    sm = re.search(r'storage\s*\(\s*\{([^}]*)\}', post_nc).group(1)
    stream = re.search(r'\bstream\s+(\w+)', sm).group(1)
    t_day = float(re.search(r'storageTime\s+([0-9.]+)\s*day', sm).group(1))
    prod = t_day * 86400.0 * _stream_json(out, stream)["F_mass"]
    if not close(tank_total, prod, 1e-6):
        problems.append("check_design_sheet(r): the tanks hold %.9g kg, and "
                        "%g day of %s is %.9g kg." % (tank_total, t_day, stream, prod))
    nd = re.search(r'NOT DECLARED \(no inventory computed -- not zero\):([^\n]*)', out)
    if not nd or "MakeupComp1" not in nd.group(1) or "Chiller" not in nd.group(1):
        problems.append("check_design_sheet(r): the items with no declared "
                        "inventory are not listed as NOT DECLARED.")

    def edit_held(unit, f):
        def ed(t):
            pat = re.compile(r'(\{\s*unitName\s+%s\s*;.*?inventory\s*\{)(.*?)(\}\s*\})'
                             % unit, re.S)
            return pat.sub(lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                           t, count=1)
        return ed
    probes = (
        ("a declared volume beside the Separator's sized V_R",
         edit_held("Separator", lambda b: b + " volume 5; "), r'beside a sized V_R'),
        ("the Separator holding the TWO-PHASE WaterCooledEffluent",
         edit_held("Separator", lambda b: b.replace("UnreactedGas",
                                                    "WaterCooledEffluent")),
         r'TWO-PHASE'),
        ("Separator fractions summing above 1",
         edit_held("Separator", lambda b: b.replace("fraction 0.75", "fraction 0.85")),
         r'sum to'),
    )
    for what, ed, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("check_design_sheet(r): the copy with %s failed "
                            "(rc=%d) -- a refused inventory must refuse the "
                            "INVENTORY, never the run." % (what, rcp))
        elif not re.search(r"REFUSED: inventory 'Separator'[^\n]*%s" % pat, both):
            problems.append("check_design_sheet(r): a copy with %s is not "
                            "refused BY NAME (/%s/)." % (what, pat))
        elif '"item": "Separator"' not in both or not re.search(
                r'"item": "Separator"[^\n]*"values"', both):
            problems.append("check_design_sheet(r): with %s the Separator lost "
                            "its SIZE -- a refused inventory must keep it." % what)
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("inventory: %d item(s), %d held phase(s) recomputed "
                 "(V x fraction x rho x w; rho from the records); the tanks "
                 "hold %.6g kg = storageTime of production; three probes"
                 % (len(lines), n_phase, tank_total))


def main() -> int:
    problems, notes = [], []

    all_units = []
    n1 = check_case(FRACTAL, True,  problems, notes, all_units)
    n2 = check_case(FLAT,    False, problems, notes, all_units)
    n3 = check_case(COLUMN,  False, problems, notes, all_units)

    if n1 == 0:
        problems.append("%s: no sheet was checked at all -- the arms above "
                        "cannot fire." % FRACTAL)
    if n2 == 0:
        problems.append("%s: no sheet was checked at all." % FLAT)
    if n3 == 0:
        problems.append("%s: no sheet was checked at all -- the 1:N address "
                        "is then exercised by nothing." % COLUMN)
    check_column_items(problems, notes)
    check_catalyst_bed(problems, notes)
    check_space_velocity_basis(problems, notes)
    check_exchanger_routes(problems, notes)
    check_storage(problems, notes)
    check_inventory(problems, notes)

    check_ignored(problems)
    check_refusal(problems)
    check_basis_stated(problems)
    check_unit_words_readable(all_units, problems, notes)
    check_gui_fixture(problems, notes)

    if problems:
        print("check_design_sheet: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_design_sheet: OK -- %d specification sheet(s) on the fractal "
          "witness, %d on the flat one and %d on the multi-item column "
          "(one flowsheet unit, five physical items -- shell, trays, "
          "condenser, reboiler, reflux drum -- whose two exchanger areas, "
          "tower height, per-section diameters and swage gap are RECOMPUTED "
          "here from the case declaration and the run KPIs, and whose tray "
          "stack's cost is RECOMPUTED by hand from its printed size with a "
          "sieve-tray set this gate transcribes from CAPCOST 2017 and ties to "
          "that program's own worked tower, while copies declaring no or an "
          "unknown tray material class refuse the trays BY NAME and mark the "
          "total INCOMPLETE) and on "
          "the kinetic-bed witness (one `pfr`, two items: the SHELL's V_R is "
          "the unit's own solved KPI to the sheet's printed precision, the "
          "CHARGE's mass and price are RECOMPUTED from the case's declared "
          "density and unit price with no index and no module factor, and two "
          "copies run without the price and without the density each refuse "
          "the charge BY NAME and mark the total INCOMPLETE) and on the "
          "space-velocity witness (the converter's V_R RECOMPUTED from its "
          "inlet KPI and the declared spaceVelocity on the NORMAL gas basis "
          "the case declares; a copy with no basis and one declaring "
          "`standard` each refused BY NAME, and one declaring `actual` "
          "recomputed on the unit's own T and P) and on the exchanger-routes "
          "witness (every cooler declaring a `utility` has its LMTD and area "
          "RECOMPUTED from its own T_in/T_out KPIs, the declared U and the "
          "utility record; the rated interchanger's area is its own declared "
          "one; copies with an LMTD beside a utility, a temperature cross and "
          "a cooler with no basis each refused BY NAME) and on the storage "
          "witness (the product tanks' density, volumes, count and three "
          "costs RECOMPUTED from the case's records, its declarations, the "
          "stream's own mass flow and the CAPCOST fixed-roof row; LOWER BOUND "
          "said per tank for refrigerated storage; a unitless storage time "
          "and a vapour stream refused BY NAME) and on the inventory "
          "witness (every held phase's density, mass and per-component split "
          "RECOMPUTED from the case's records and declarations, the tanks "
          "held to storageTime of production, the undeclared items listed as "
          "NOT DECLARED, three malformed declarations refused BY NAME), each "
          "at the address its own "
          "sizing.csv row dictates (sector directory where the row names a "
          "sector, NO extra level where it does not); every `sizing {}` entry "
          "reproduces that row's cell AND carries a declared unit, every "
          "`cost {}` reproduces costs.csv, and each sheet's inlet and outlet "
          "mass flows sum to the unit's own row in massBalance_byUnit.csv "
          "(%s) -- a report this writer does not produce, which is the only "
          "arm that could catch a port mass computed without the crystals.  "
          "EVERY sizing unit word survives the tokenizer's own word-char set "
          "and is a name core/Units.cpp registers, except the %d pinned in "
          "SHEET_UNIT_WORDS_UNPARSEABLE (whose remedy MOVES a "
          "number and is reserved) -- the arm that closed this gate's own "
          "declared blind spot and found three on the day it was written; and "
          "each GUI reader's transcribed fixture still matches the sheets the "
          "run just wrote -- header words, sizing triples AND port lines, in "
          "the test file that holds it.  A "
          "refusal for a value with no declared unit is still in the writer, "
          "and no sizer writes past `set()` (a SOURCE arm: a gate that "
          "rebuilds the engine is the 2026-08-18 shape, so the refusal was "
          "fired by hand under the journal instead -- see the docstring).  The tree is gitignored and excluded from the GUI case "
          "glob, and a NEW file under docs/design/ is NOT ignored -- both "
          "directions, because the obvious rule swallows this project's "
          "design records.  NOT CHECKED: that the engine's own parser accepts "
          "a sheet IN FULL (arms (h) and (k) cover its structure and its unit "
          "words, which is where every failure found so far lived, but neither "
          "is a round trip through Dictionary::fromFile), whether any number "
          "is RIGHT beyond the crystalliser volume (arm (j) recomputes THAT "
          "from the declared operation.volume, which is how a kmol holdup "
          "labelled m3 would have been caught), whether any stated basis is "
          "TRUE of its sizer (arm (i) only requires that every sizer states "
          "one), nesting deeper than one level (no corpus case nests twice), "
          "and every case but these THREE.  The GUI's Case tree is recursive "
          "since 2026-09-05 and carries its own tests."
          % (n1, n2, n3, "; ".join(notes[:3]) if notes else "no balance rows read",
             len(SHEET_UNIT_WORDS_UNPARSEABLE)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
