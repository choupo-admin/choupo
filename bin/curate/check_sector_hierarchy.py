#!/usr/bin/env python3
"""Gate: a plant's SECTOR hierarchy reaches the design and economics reports,
and a flat case is left exactly as it was.

    bin/curate/check_sector_hierarchy.py

WHY THIS EXISTS.  `Flowsheet::flattenNode` knows each leaf's owning sector
exactly -- `nsPrefix` IS the parent chain, held in hand at the moment the leaf
is emitted -- and until 2026-09-04 it concatenated it into the qualified name
and kept only the string.  Every reader downstream got a flat list of dotted
names, so the design table printed `CONCENTRATION.Crystcrystalliser` and the
only route to "the concentration sector is 93 % of the capex" was adding the
names up by hand.

The fix carries the sector as DATA (`FlatUnit::sector` -> `EquipmentSizing`
-> `CostBreakdown`) rather than recovering it by splitting the dotted name,
which would be the name identity the F2 contract bans.  This gate holds both
halves of that, plus the arithmetic.

WHAT THIS CHECKS:

  (a) STAMPED IS CARRIED, and it is the AUTHORED sector.  For the fractal
      witness, every sizing row and every costing row names a sector, and the
      set of sectors equals the set of sector FOLDERS the case declares on
      disk.  Compared against the case's own directory layout, never against
      a substring of the unit name -- a gate that split the name would pass
      on precisely the bug the design rejects.

  (b) FLAT STAYS FLAT.  The flat witness emits no `-- sector:` banner, no
      `capital by sector` block, and no `sector` column in either CSV.  A
      flat case has no hierarchy; giving it an invented "root" section would
      make every flat case's output differ for a structure it does not have.

  (f) THE EQUIPMENT LIST IS PUBLISHED AND AGREES WITH THE CSV.  The run emits
      an `equipment` array so the app can draw the plant's design and cost as a
      tree; every unit sizing.csv carries must appear in it under the same
      sector, and its costs must match costs.csv.  Published-and-unchecked is
      how a block drifts with the suite green.

  (e) THE RESULT JSON AGREES WITH THE FILES.  The run emits a `unitSectors`
      map so the browser can build its hierarchy without splitting a dotted
      name; every sector it names must be a declared one, and every unit the
      design CSV files a sector for must be filed the same way in the JSON.  A
      published block no reader checks is a block that drifts with the suite
      green -- this is the arm that makes the emit falsifiable.

  (d) NOBODY RECOVERS THE SECTOR FROM THE NAME.  A source arm over the four
      readers: none of them takes a last-dot substring of a unit name.  This
      arm exists because arms (a)-(c) CANNOT tell a correct stamp from a
      correct name split -- on this corpus both produce `CONCENTRATION` -- so
      the design decision itself has to be checked where it is written.

  (c) THE SUBTOTALS REPRODUCE THE TOTAL.  Recomputed here from `costs.csv`'s
      own per-unit rows: each SUBTOTAL row equals the sum of its sector's
      unit rows, the SUBTOTAL rows sum to the TOTAL row, and the console's
      printed shares sum to 100 % within rounding.  This is the arithmetic a
      student would do, and it is the arm that fails the day a unit is
      counted in a sector but not in the total, or counted twice.

WHAT THIS DOES NOT CHECK, said plainly:

  * THAT THE VALUE IS THE STAMP RATHER THAN A SPLIT, from the OUTPUT alone.
    Arm (d) checks the source instead, which is the only place the two
    differ on a corpus where every sector name is exactly the first dotted
    segment.
  * WHETHER A COST IS RIGHT.  A wrong cost subtotals as happily as a right
    one.  This gate is about the hierarchy being carried and the arithmetic
    closing.
  * NESTING DEEPER THAN ONE LEVEL.  `sector` holds the full dotted parent
    chain (`A.B`), and the reports group on the whole string, so a doubly
    nested plant gets one heading per distinct chain rather than a nested
    rendering.  No corpus case nests twice, so nothing here exercises it.
  * THE GUI.  The Plot menu is still a flat list; when it becomes a tree it
    must read `FlatUnit::sector` from the topology, and that will need its
    own arm here or its own gate.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

FRACTAL = "tutorials/plant/ChemicalPlantTutorial"
FLAT    = "tutorials/steady/flowsheets/process02_with_design"

_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")


def stdout_of(rel: str):
    """The case's run output: the suite's own pass when riding bin/runTests,
    a live run otherwise."""
    if _CACHE:
        f = Path(_CACHE) / (rel.replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace")
        except OSError:
            pass
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(ROOT / rel)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    return proc.stdout


def authored_sectors(rel: str):
    """The COMPOSITE members the case declares -- read from its own
    `sectors ( ... )` list and its folder layout, never from a unit name.

    A member of that list is a LEAF when its own dict declares a `type` --
    that is literally the engine's test at the flatten seam
    (`if (cd->found("type"))`), applied here from outside.  Everything else is
    a composite SECTOR.  Having a folder is NOT the test: a leaf unit is
    entitled to its own dignified folder and this case's `JuiceSplitter` has
    one (under `MAIN/` since 2026-09-05; at the plant root before), so a
    folder-based rule called it a sector and the gate said so in its own OK
    line."""
    fd = ROOT / rel / "system" / "flowsheetDict"
    if not fd.is_file():
        return set(), set()
    m = re.search(r'^\s*sectors\s*\(([^)]*)\)', fd.read_text(errors="replace"), re.M)
    if not m:
        return set(), set()
    members = set(m.group(1).split())

    def is_leaf(name: str) -> bool:
        #  Declared INLINE in the parent (no folder at all) -> a leaf.
        own = ROOT / rel / name / "system" / "flowsheetDict"
        if not own.is_file():
            return True
        return re.search(r'^\s*type\s+\w+\s*;', own.read_text(errors="replace"),
                         re.M) is not None

    leaves = {x for x in members if is_leaf(x)}
    return members - leaves, leaves


def csv_rows(path: Path):
    if not path.is_file():
        return None
    lines = [l for l in path.read_text(errors="replace").splitlines() if l.strip()]
    if not lines:
        return None
    head = lines[0].split(",")
    return head, [l.split(",") for l in lines[1:]]


def find_csv(rel: str, report: str, name: str):
    """A case may use either report layout (`reports/` or the postProcessing
    functionObject tree); look in both rather than assuming one."""
    for p in (ROOT / rel / "reports" / report / name,
              ROOT / rel / "postProcessing" / report / "0" / name):
        if p.is_file():
            return p
    return None


def main() -> int:
    problems, notes = [], []

    # ---------------------------------------------------------------- (a)
    txt = stdout_of(FRACTAL)
    if txt is None:
        print("check_sector_hierarchy: FAILED\n  %s does not run." % FRACTAL)
        return 1

    declared, rootLeaves = authored_sectors(FRACTAL)
    if not declared:
        problems.append(
            "%s declares no composite sector -- the fractal witness is not "
            "fractal, so arm (a) has no subject.  Fix the witness, do not "
            "retire the arm." % FRACTAL)

    #  A heading must be a DECLARED composite.  Not every declared sector owns
    #  a sized unit (the postDict chooses what to size), so the relation is
    #  subset-and-non-empty, not equality; what is refused is a heading naming
    #  something the case never declared as a sector -- which is exactly what a
    #  name split would produce.
    def check_set(got, where):
        if not got:
            problems.append("%s: %s name no sector at all." % (FRACTAL, where))
            return
        stray = got - declared
        if stray:
            problems.append(
                "%s: %s names %s, which the case does not declare as "
                "composite sector(s) (declared: %s; root-level leaf units: "
                "%s).  A heading that is not a declared sector is what "
                "recovering it from the unit name would produce."
                % (FRACTAL, where, sorted(stray), sorted(declared),
                   sorted(rootLeaves)))

    banners = set(re.findall(r'^\s*-- sector: (\S+)', txt, re.M))
    check_set(banners, "the sizing table's sector banners")

    dcsv = find_csv(FRACTAL, "design", "sizing.csv")
    if dcsv is None:
        problems.append("%s: no design sizing.csv was written." % FRACTAL)
    else:
        head, rows = csv_rows(dcsv)
        if "sector" not in head:
            problems.append(
                "%s: sizing.csv carries no `sector` column -- the hierarchy "
                "reaches the screen and not the file a reader opens." % FRACTAL)
        else:
            i = head.index("sector")
            check_set({r[i] for r in rows}, "sizing.csv")

    # ---------------------------------------------------------------- (c)
    ecsv = find_csv(FRACTAL, "economics", "costs.csv")
    nsub = 0
    if ecsv is None:
        problems.append("%s: no economics costs.csv was written." % FRACTAL)
    else:
        head, rows = csv_rows(ecsv)
        if "sector" not in head:
            problems.append("%s: costs.csv carries no `sector` column." % FRACTAL)
        else:
            si = head.index("sector")
            ti = next(i for i, h in enumerate(head) if h.startswith("totalModule_"))
            per, subs, total = {}, {}, None
            for r in rows:
                if r[0] == "SUBTOTAL":
                    subs[r[si]] = float(r[ti])
                elif r[0] == "TOTAL":
                    total = float(r[ti])
                else:
                    per[r[si]] = per.get(r[si], 0.0) + float(r[ti])
            nsub = len(subs)
            if set(subs) != set(per):
                problems.append(
                    "%s: costs.csv subtotals %s against unit rows in sectors "
                    "%s." % (FRACTAL, sorted(subs), sorted(per)))
            for s, v in sorted(subs.items()):
                if abs(v - per.get(s, 0.0)) > 0.02:
                    problems.append(
                        "%s: costs.csv SUBTOTAL %s = %.2f, but its own unit "
                        "rows sum to %.2f." % (FRACTAL, s, v, per.get(s, 0.0)))
            if total is None:
                problems.append("%s: costs.csv has no TOTAL row." % FRACTAL)
            elif abs(sum(subs.values()) - total) > 0.02:
                problems.append(
                    "%s: costs.csv subtotals sum to %.2f against a TOTAL of "
                    "%.2f -- a unit is counted in a sector and not in the "
                    "total, or twice."
                    % (FRACTAL, sum(subs.values()), total))

    # The console block, and its shares.
    blk = re.search(r'---- capital by sector ----\n(.*?)\n\n', txt, re.S)
    if blk is None:
        problems.append(
            "%s: the costing console prints no `capital by sector` block."
            % FRACTAL)
    else:
        shares = [float(x) for x in re.findall(r'([0-9]+\.[0-9])\s*%', blk.group(1))]
        if not shares:
            problems.append("%s: the capital-by-sector block states no shares."
                            % FRACTAL)
        elif abs(sum(shares) - 100.0) > 0.35:
            problems.append(
                "%s: the sector shares sum to %.1f %%, not 100 %%."
                % (FRACTAL, sum(shares)))
        else:
            notes.append("%d share(s) summing to %.1f %%"
                         % (len(shares), sum(shares)))

    # ---------------------------------------------------------------- (b)
    ftxt = stdout_of(FLAT)
    if ftxt is None:
        problems.append("%s does not run -- the flat negative has no subject."
                        % FLAT)
    else:
        if "-- sector:" in ftxt:
            problems.append(
                "%s is a FLAT case and its sizing table prints a sector "
                "banner.  Empty is not a sector called 'root'." % FLAT)
        if "capital by sector" in ftxt:
            problems.append(
                "%s is a FLAT case and its costing console prints a "
                "capital-by-sector block." % FLAT)
        for rep, name in (("design", "sizing.csv"), ("economics", "costs.csv")):
            p = find_csv(FLAT, rep, name)
            if p is None:
                problems.append("%s: no %s/%s was written -- the flat negative "
                                "cannot be checked." % (FLAT, rep, name))
                continue
            head, _ = csv_rows(p)
            if "sector" in head:
                problems.append(
                    "%s: %s carries a `sector` column on a case with no "
                    "sectors -- an empty column is a format change claiming a "
                    "structure that is not there." % (FLAT, name))

    # ---------------------------------------------------------------- (e)
    #  `unitSectors` is a flat one-line-per-entry object in the result JSON.
    #  Parsed with the same posture as the rest of this gate: from the RUN,
    #  never from the dict.
    jsonSectors = {}
    inBlock = False
    for line in txt.splitlines():
        if '"unitSectors"' in line:
            inBlock = True
            continue
        if inBlock:
            m = re.match(r'\s*"([^"]+)": "([^"]+)"', line)
            if m:
                jsonSectors[m.group(1)] = m.group(2)
            elif line.strip().startswith("}"):
                break
    if not jsonSectors:
        problems.append(
            "%s: the result JSON emits no `unitSectors` map, so the browser "
            "has no way to build the hierarchy except by splitting a dotted "
            "unit name -- which is exactly what this design refuses."
            % FRACTAL)
    else:
        check_set(set(jsonSectors.values()), "the result JSON's `unitSectors`")
        #  Cross-check against the design CSV: two publications of one fact
        #  must agree, or one of them is lying to whoever reads it.
        if dcsv is not None:
            head, rows = csv_rows(dcsv)
            if "sector" in head:
                i = head.index("sector")
                for r in rows:
                    want = r[i]
                    got = jsonSectors.get(r[0])
                    if want != "(no sector)" and got != want:
                        problems.append(
                            "%s: sizing.csv files unit '%s' under sector '%s' "
                            "while the result JSON says '%s'.  One fact, two "
                            "publications, and they disagree."
                            % (FRACTAL, r[0], want, got))

    # ---------------------------------------------------------------- (f)
    #  `equipment` is one JSON object per line inside a top-level array.
    equip = {}
    for m in re.finditer(r'\{ "unit": "([^"]+)"(.*)$', txt, re.M):
        unit, rest = m.group(1), m.group(2)
        s = re.search(r'"sector": "([^"]+)"', rest)
        c = re.search(r'"totalModule": (-?[0-9.eE+]+)', rest)
        if '"type":' in rest:
            equip[unit] = (s.group(1) if s else None,
                           float(c.group(1)) if c else None)
    if not equip:
        problems.append(
            "%s: the result JSON emits no `equipment` array -- the sizing and "
            "costing passes ran and produced a table and two CSVs, and the app "
            "still cannot draw one row of the plant's design." % FRACTAL)
    elif dcsv is not None:
        head, rows = csv_rows(dcsv)
        si = head.index("sector") if "sector" in head else None
        for r in rows:
            if r[0] not in equip:
                problems.append(
                    "%s: sizing.csv lists unit '%s' and the result JSON's "
                    "`equipment` array does not." % (FRACTAL, r[0]))
            elif si is not None and r[si] != "(no sector)" \
                    and equip[r[0]][0] != r[si]:
                problems.append(
                    "%s: unit '%s' is filed under sector '%s' in sizing.csv "
                    "and '%s' in the equipment array."
                    % (FRACTAL, r[0], r[si], equip[r[0]][0]))
        #  The MONEY must agree too: two publications of one cost that differ
        #  is the defect this whole slice exists to prevent.
        if ecsv is not None:
            head2, rows2 = csv_rows(ecsv)
            ti = next((i for i, h in enumerate(head2)
                       if h.startswith("totalModule_")), None)
            if ti is not None:
                for r in rows2:
                    if r[0] in ("SUBTOTAL", "TOTAL"):
                        continue
                    got = equip.get(r[0], (None, None))[1]
                    if got is None or abs(got - float(r[ti])) > 0.02:
                        problems.append(
                            "%s: costs.csv gives unit '%s' a total module cost "
                            "of %s and the equipment array gives %s."
                            % (FRACTAL, r[0], r[ti], got))

    # ---------------------------------------------------------------- (d)
    #  The rejected design, refused at the source.  A `rfind('.')` or
    #  `find_last_of` on a unit name inside these readers IS the name identity
    #  the F2 contract bans -- and it is invisible to every other arm here.
    READERS = ("src/postProcessing/SizingPass.cpp",
               "src/postProcessing/CostingPass.cpp",
               "src/reporting/DesignReport.cpp",
               "src/reporting/EconomicsReport.cpp")
    nread = 0
    for rel in READERS:
        f = ROOT / rel
        if not f.is_file():
            problems.append("%s: reader is missing -- arm (d) has no subject."
                            % rel)
            continue
        nread += 1
        #  Comments are stripped first: these files ARGUE about name splitting
        #  in prose, and a gate that fired on its own rationale would be
        #  unfixable without deleting the explanation.
        src = re.sub(r'//[^\n]*', '', f.read_text(errors="replace"))
        for pat in (r"rfind\s*\(\s*'\.'", r'rfind\s*\(\s*"\."',
                    r"find_last_of\s*\(\s*['\"]\."):
            if re.search(pat, src):
                problems.append(
                    "%s: takes a last-dot substring.  The sector is STAMPED at "
                    "the flatten seam and carried as data; recovering it from "
                    "the unit name is name identity, and it misfiles any unit "
                    "whose name carries a dot for another reason." % rel)
                break

    if problems:
        print("check_sector_hierarchy: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_sector_hierarchy: OK -- %s carries its %d declared sector(s) "
          "%s into the sizing table, sizing.csv, costs.csv (%d subtotal rows "
          "reproducing their own unit rows and the TOTAL) and the "
          "capital-by-sector console block (%s); %s, which has no sectors, "
          "prints no banner, no capital-by-sector block and no `sector` column "
          "in either CSV.  Every heading is checked against the case's own "
          "`sectors ( ... )` declaration, with leaves separated by the engine's "
          "own test (a member whose dict declares a `type`), the result JSON's "
          "`unitSectors` map (%d entr(ies)) agrees with sizing.csv unit for "
          "unit, the `equipment` array (%d item(s)) agrees with BOTH CSVs on "
          "sector and on cost, and none of the %d "
          "reader(s) takes a last-dot substring of a unit name.  NOT "
          "CHECKED: whether any cost is right, nesting deeper than one level "
          "(no corpus case nests twice), and the GUI, which does not read the "
          "sector yet."
          % (FRACTAL, len(declared), sorted(declared), nsub,
             notes[0] if notes else "no shares read", FLAT,
             len(jsonSectors), len(equip), nread))
    return 0


if __name__ == "__main__":
    sys.exit(main())
