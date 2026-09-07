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

  (l) THE GUI FIXTURE IS STILL THE ENGINE'S OWN OUTPUT.  The reader's unit
      tests run on a TRANSCRIPTION of a sheet, because arm (g) keeps `design/`
      gitignored and no committed file can be read from a test.  This arm runs
      the writer and holds the header words and every `sizing {}` triple in
      `gui/tests/designSheet.test.ts` to what was just written -- the
      `check_estimate_visible` precedent, for the same reason.

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
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
#  THE WAIVERS LIVE IN ONE PLACE -- see `debt_registry.py`.
from debt_registry import SHEET_UNIT_WORDS_UNPARSEABLE   # noqa: E402

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
        #  ---- (k) every unit word this sheet declares, for the readability
        #  arm.  Taken from the SHEET, not from sizing.csv's columns: a key the
        #  CSV does not carry is still a line the parser has to survive.
        for szKey, (_v, szUnit) in sheet["sizing"].items():
            if szUnit not in ("", "-"):
                all_units.append((rel, unit, szKey, szUnit))

        if "V_magma" in sheet["sizing"]:
            sheets.append((sheet["header"].get("equipmentType"), sheet["sizing"]["V_magma"][0]))
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

GUI_TEST = ROOT / "gui/tests/designSheet.test.ts"

#  (case, sheet path under design/) -> the sheets the GUI tests transcribe.
GUI_FIXTURES = (
    (FLAT,    "heater/shellTubeHX"),
    (FRACTAL, "FERMENTATION/Fermentor/stirredTank"),
)


def check_gui_fixture(problems, notes):
    """(l) The GUI's printable datasheet READS a specification sheet back, and
    its unit tests run on a TRANSCRIPTION of one -- because `design/` is a run
    output and arm (g) keeps it gitignored, so no committed file can be read
    from a test.  A transcription drifts from its original in silence.  This
    arm runs the writer and holds the fixture to what it wrote, which is the
    `check_estimate_visible` precedent for the same reason.

    It compares the HEADER words and every `sizing {}` triple (key, value,
    unit), whitespace-normalised.  NOT the ports or the cost block: the GUI
    reader does not read those, and a fixture held to more than its reader uses
    is a golden nobody asked for."""
    if not GUI_TEST.is_file():
        problems.append("check_design_sheet(l): %s is gone -- the reader that "
                        "replaced this gate's structural arm has no tests."
                        % GUI_TEST.relative_to(ROOT))
        return
    fixture = GUI_TEST.read_text(errors="replace")
    norm = lambda s: " ".join(s.split())
    flat_fixture = norm(fixture)
    for rel, tail in GUI_FIXTURES:
        p = ROOT / rel / "design" / tail
        if not p.is_file():
            problems.append("check_design_sheet(l): the run wrote no %s, so "
                            "the GUI fixture is held to nothing." % tail)
            continue
        text = re.sub(r'/\*.*?\*/', '', p.read_text(errors="replace"), flags=re.S)
        want = []
        for k in ("recordType", "unit", "sector", "equipment", "material", "basis"):
            m = re.search(r'^\s*%s\s+.*;' % k, text, re.M)
            if m:
                want.append(m.group(0))
        m = re.search(r'^sizing\s*\n\{(.*?)\n\}', text, re.S | re.M)
        if m:
            want += [l for l in m.group(1).splitlines() if l.strip()]
        missing = [norm(w) for w in want if norm(w) not in flat_fixture]
        if missing:
            problems.append(
                "check_design_sheet(l): the GUI fixture in %s no longer "
                "matches design/%s, which the run just wrote.  Absent from the "
                "fixture: %s.  The GUI's reader tests are written on that "
                "transcription, so a drift makes them pass against a sheet the "
                "engine does not produce."
                % (GUI_TEST.relative_to(ROOT), tail, "; ".join(missing[:4])))
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


def main() -> int:
    problems, notes = [], []

    all_units = []
    n1 = check_case(FRACTAL, True,  problems, notes, all_units)
    n2 = check_case(FLAT,    False, problems, notes, all_units)

    if n1 == 0:
        problems.append("%s: no sheet was checked at all -- the arms above "
                        "cannot fire." % FRACTAL)
    if n2 == 0:
        problems.append("%s: no sheet was checked at all." % FLAT)

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
          "witness and %d on the flat one, each at the address its own "
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
          "the GUI reader's transcribed fixture still matches the sheets the "
          "run just wrote.  A "
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
          "and every case but these two.  The GUI's Case tree is recursive "
          "since 2026-09-05 and carries its own tests."
          % (n1, n2, "; ".join(notes[:3]) if notes else "no balance rows read",
             len(SHEET_UNIT_WORDS_UNPARSEABLE)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
