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

  (g) NOR DOES THE STREAM SIDE.  The same rejected design had TWO further
      copies, on the other side of the engine: `StreamOwnership::sectorOf`
      decided which SECTOR FOLDER a stream's state file lives in, and
      `SolutionWriter::sectorOf` bucketed the per-sector `converged/` views --
      both by taking the FIRST dot-segment of the owning unit's NAME.  Arm (d)
      could not see them: it looks for a LAST-dot substring, and these split on
      the first.  Since 2026-09-06 both read `FlatUnit::sector` through the ONE
      home `topLevelSector` (core/FlatUnit.H), and the three files that carry
      the rule must each still call it and must not take a single-dot split of
      any UNIT NAME.  The detector is proven able to fire on a PROBE holding
      the three removed constructs verbatim, so a green arm is never a silent
      one.

  (h) WHERE A STREAM'S STATE FILE LIVES, recomputed from the AUTHORED root
      dict.  The rule was REPLACED on 2026-09-07: a stream lives at the LOWEST
      LEVEL of the case whose subtree contains EVERY ENDPOINT of it, not with
      the unit that PRODUCES it.  The engine publishes its own answer
      (`choupoSolve --manifest`, the ONE home `StreamOwnership::ownershipPath`)
      and this arm derives the same answer from the case's `connections {}`
      block -- an inlet and a sector-to-sector crossing at the domain's own
      level `MAIN/`, a plant OUTLET LABEL leaving the file with the sector that
      owns the identity, a stream no root edge mentions staying inside its
      sector, and nothing loose at the view root.

  (i) AND THE RUN'S OWN TABLE AGREES.  `streamTable.csv`'s `crossing` column
      is computed by a different reader that asks the topology directly, so it
      is an independent witness to which streams span two sectors; every one of
      them must be in NEITHER endpoint's folder.  This is the arm that fires on
      the defect that started the slice -- `Magma` (CONCENTRATION -> DRYING)
      filed inside CONCENTRATION, where the maintainer could not find it.
      `MAIN` is discounted as an endpoint here because the 2026-09-07 amendment
      makes it the domain's OWN level rather than a sector like the others: a
      stream handed from a plant-level unit into a sector has no level below
      the domain's own that contains both ends.

  (l) ONE ROW PER PHYSICAL STREAM.  `result.streams` is keyed by every NAME a
      stream answers to -- identity, bare sector label, plant boundary label --
      and until 2026-09-07 the table drew a row per KEY: 52 rows for 25 pipes
      on the flagship, the duplicates rendering with a blank PFD number in the
      app (a bare sector label is in no view's connection list and so belongs
      to no numbering class).  The row set must be EXACTLY the canonical
      manifest's keys -- the same set that gets a state file -- and the plant's
      own name for an exported stream rides a `label` COLUMN, checked against
      the AUTHORED root dict.  A labelled row must read `product`: `Topology`
      files a renamed product under the LABEL, so asking it about the identity
      answers `intermediate`, and nine of this plant's streams would have lost
      their role the moment the label rows stopped being drawn.  A FLAT case
      gains no column.

  (j) A FLAT CASE GAINS NOTHING.  Its units ARE the plant, so its state files
      stay flat -- no `MAIN/`, no folder at all.  The state-view form of the
      2026-09-04 ruling that empty is not a sector called "root".

  (k) A RELOCATION IS ANNOUNCED, NEVER SILENT.  The level is a function of the
      WHOLE topology, so an edit elsewhere in the plant can move a file that
      was written correctly yesterday.  A file left at the address the retired
      rule gave is REFUSED, and the refusal names the MOVE and both addresses
      rather than reporting an unrelated MISSING and ORPHAN.  Fired on a COPY
      in a temp directory; this gate never mutates the tree.

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
    The stream OWNERSHIP rule reads the chain WHOLE since 2026-09-07 (a stream
    internal to `A.B` lives at `A/B/`), while the converged/ VIEWS and the
    design sheets keep the chain's HEAD -- and nothing here exercises the
    difference, for the same reason.  Nor does anything exercise a case where
    the domain's own level and the folder `MAIN` stop coinciding with one tier.

  * WHETHER A STREAM'S 0/ FILE HOLDS THE RIGHT NUMBERS.  Arms (h)-(k) are
    about the ADDRESS.  A file at the right address with the wrong contents
    passes them all, and the golden is what says otherwise.
  * WHETHER A UNIT NAME AND ITS STAMP AGREE.  On this corpus they do, unit for
    unit -- which is why arms (a)-(c) and (e)-(f) are blind to the whole
    question and arms (d) and (g) read the source instead.
  * THE GUI.  The Plot menu is still a flat list; when it becomes a tree it
    must read `FlatUnit::sector` from the topology, and that will need its
    own arm here or its own gate.  `LogWorkspace.tsx` groups the log's jump
    list by splitting the qualified name it parsed out of the run LOG -- it
    genuinely has only a name there and no unit, and it is out of this gate's
    reach for that reason (recorded 2026-09-06, not fixed).

SABOTAGES for arm (g), all applied BY HAND to the source between the run and
the check, restored immediately after; NOTHING was rebuilt (the 2026-08-18
tree-poisoning rule -- this arm reads source, so no rebuild is needed for it
to see the damage).  Observed, verbatim:

  S1  `StreamOwnership::ownershipPath` goes back to `owner.find('.')`:
      "src/streams/StreamOwnership.H: takes a single-dot split of `owner`.  A
       stream's sector is its owning unit's STAMPED `FlatUnit::sector`, read
       through `topLevelSector`; ..."
      S1 SURVIVED its first form: the "calls `topLevelSector`" half stayed
      green because the file's BLOCK comment names the function, and only
      `//` comments were being stripped.  Both comment forms go now.

  S2  `SolutionWriter::sectorOf` goes back to `unit.name.find('.')` -- two
      refusals, the split and the lost home:
      "src/io/SolutionWriter.cpp: takes a single-dot split of `unit.name`. ..."
      "src/io/SolutionWriter.cpp: never calls `topLevelSector`. ..."

  S3  the SUPPLIER re-derives instead of handing the stamp over (init0's
      `sectorOfUnit` built from `uname.substr(0, dd)`):
      "src/unitOperations/flowsheet/Flowsheet.cpp: takes a single-dot split of
       `uname`. ..."
      "src/unitOperations/flowsheet/Flowsheet.cpp: builds no
       `StreamOwnership::SectorOfUnit`. ..."

  S4  the DETECTOR itself disarmed (its subject vocabulary emptied):
      "arm (g)'s detector no longer flags its own PROBE (found [] of the three
       removed constructs).  A detector that cannot fire reports nothing when
       the defect returns."

SABOTAGES for arms (h)-(k) (2026-09-07), all BY HAND between the run and the
check.  ONE of them touched a SOURCE file and rebuilt, and it ran under
`destructive_session.py`'s journal because that is the only way to do it
safely; the other five touch only this script or the state tree, and neither
needs a rebuild.  Observed, verbatim (truncated where a message is long):

  S1  THE DEFECT ITSELF, in the tree: `0/MAIN/Magma` moved back to
      `0/CONCENTRATION/Magma`, where the retired rule filed it --
      "tutorials/plant/ChemicalPlantTutorial does not run."
      Recorded exactly as observed, because it says something important: on a
      MIGRATED corpus the ENGINE refuses a misplaced file before any arm here
      can speak, so arms (h)/(i) are not what catches a moved FILE -- they
      catch a moved RULE.  Arm (k) is the one that reads that refusal.

  S2  THE RULE ITSELF (source + rebuild, journalled): the DOMAIN BOUNDARY
      stops being an endpoint, so a plant inlet sinks back into its consuming
      sector --
      "tutorials/plant/ChemicalPlantTutorial does not run."
      Same shape, same reason, and it is the reason this file's arms are
      backed by a second, independent statement of the rule at all.

  S3  arm (h)'s edge resolver disarmed (`edge_identity` returns None) --
      "the root edge `RawJuice` names no stream the manifest carries (tried
       `RawJuice` and its port).  Either the edge is dead or the manifest lost
       a stream."

  S4  arm (i) made VACUOUS (every endpoint discarded, not only the domain
      level) --
      "not one stream in the table crosses a sector boundary -- arm (i) has no
       subject, and the fractal witness has stopped being fractal."

  S5  arm (j)'s flat witness pointed at a case that HAS sectors --
      "tutorials/steady/flowsheets/process02_with_design has no sectors and its
       state files are no longer flat: ['MAIN/Feed', 'MAIN/reactorOut',
       'SEPARATION/liquid', 'SEPARATION/vapor']."

  S6  arm (k) required to see an address the engine never prints --
      "arm (k): the relocation was announced without naming BOTH addresses."

  S7  arm (h)'s domain literal changed to a real sector name --
      "`RawJuice` is a plant INLET (nobody in the case produces it) and its
       state file is at 0/MAIN/RawJuice.  Its other endpoint is the domain's
       own boundary, so it lives at the domain's own level 0/CONCENTRATION/."

SABOTAGES for arm (l) (2026-09-07).  This gate RE-RUNS the case, so a table
edited beforehand is simply rewritten -- every one of these was applied BETWEEN
the run and the read, by inserting the mutation at the arm's own entry point in
a COPY of this script, and nothing was rebuilt.  Observed, verbatim (truncated):

  S1  a label row put back (`Cond1`, a bare sector label) --
      "streamTable.csv draws 1 row(s) the canonical manifest does not name:
       Cond1.  Those are LABELS -- other names for a pipe the table already
       drew -- and drawing them makes the plant look bigger than it is."

  S2  a real row dropped (`DRYING.Exhaust`) --
      "1 stream(s) have a state file and no row in streamTable.csv:
       DRYING.Exhaust.  The table and the state tree must count the same
       streams."

  S3  the `label` column removed --
      "streamTable.csv carries no `label` column, so the plant's own name for
       a stream it exports (`Powder`, `Stack`) appears nowhere -- and the row
       is the qualified identity, which is not that name."

  S4  a label the root dict never declared (`Powder` -> `Widget`) --
      "`DRYING.DryPowder` is labelled `Widget`, which the root dict declares as
       no boundary outlet.  A label is the name the AUTHOR gave the plant's
       boundary, never one the report invented."

  S5  a labelled row filed as `intermediate` -- the state the whole slice would
      have left behind if `roleOf` had not been taught to read the label --
      "`DRYING.DryPowder` carries the plant label `Powder` and is filed as
       `intermediate`.  A stream the plant declared as an outlet is a product."

  S6  the FLAT witness given a `label` column --
      "a FLAT case's streamTable.csv carries a `label` column.  Its units ARE
       the plant; it renames nothing at a boundary, so the column is a claim
       about a structure that is not there."

  FOUND BY RUNNING THEM: the first cut of this arm bound its declared-outlet
  set to a local named `declared`, which is the name arm (a) holds the case's
  SECTOR list in -- so the gate passed while its own OK line reported the nine
  boundary outlets as the plant's four sectors.  A gate's claim is the line it
  prints, and a shadowed local made that line false without failing anything.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

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



def manifest_of(rel: str):
    """The ONE home's own answer: streamId -> relative state path, published by
    `choupoSolve --manifest`.  Read rather than recomputed on purpose -- the
    arms below check that answer against the case's AUTHORED dict, and a gate
    that recomputed the rule to compare with itself would check nothing."""
    proc = subprocess.run([str(ROOT / "choupoSolve"), "--manifest", str(ROOT / rel)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    out, keep = {}, False
    for line in proc.stdout.splitlines():
        if line.strip() == "[manifest] begin":
            keep = True
            continue
        if line.strip() == "[manifest] end":
            keep = False
            continue
        if keep and "\t" in line:
            sid, path = line.split("\t", 1)
            out[sid] = path
    return out or None


def root_edges(fd: Path):
    """The root `connections {}` block as (edgeName, fromPort, toPort).  Read
    from the AUTHORED dict -- the whole point of arm (h) is to recompute the
    level from what the author wrote, not from what the engine concluded."""
    if not fd.is_file():
        return []
    txt = fd.read_text(errors="replace")
    m = re.search(r'\bconnections\s*\{', txt)
    if not m:
        return []
    i = m.end() - 1
    depth, j = 0, i
    while j < len(txt):
        if txt[j] == '{':
            depth += 1
        elif txt[j] == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    body = txt[i + 1:j]
    edges = []
    for em in re.finditer(r'(\w+)\s*\{([^}]*)\}', body):
        inner = em.group(2)
        fr = re.search(r'\bfrom\s+([^\s;]+)', inner)
        to = re.search(r'\bto\s+([^\s;]+)', inner)
        edges.append((em.group(1), fr.group(1) if fr else "",
                      to.group(1) if to else ""))
    return edges


def sector_of_port(port: str) -> str:
    """The member a `<member>/<port>` reference names; "" for a bare name."""
    return port.split("/", 1)[0] if "/" in port else ""


def edge_identity(name: str, frm: str, manifest):
    """Which stream in the manifest a root edge names.  An edge with a producer
    takes its identity from the producing PORT -- spelled `<member>.<port>` when
    the member is a composite and `<port>` when it is a leaf, which is a fact of
    the flatten seam and not this gate's to decide -- so both spellings are
    proposed and the published manifest confirms one.  An edge with no producer
    IS its own identity (a plant inlet is declared at the plant's level)."""
    if not frm:
        return name if name in manifest else None
    for cand in (frm.replace("/", "."), frm.rsplit("/", 1)[-1]):
        if cand in manifest:
            return cand
    return None

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


def roleOfRow(head, rows, sid):
    """The `role` cell of one stream-table row, by stream id."""
    ri = head.index("role")
    for r in rows:
        if r[0] == sid:
            return r[ri]
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


    # ---------------------------------------------------------------- (h)
    #  WHERE A STREAM'S STATE FILE LIVES, recomputed from the case's own root
    #  dict.  The rule (2026-09-07) is that a stream lives at the LOWEST LEVEL
    #  whose subtree contains every one of its endpoints; the engine publishes
    #  its answer with `choupoSolve --manifest`, and this arm derives the same
    #  answer from the AUTHORED `connections {}` block, which the engine never
    #  reads for this purpose.  Four statements, and together they pin every
    #  stream of a fractal case:
    #      an edge with a `to` and no `from`   -- a plant INLET -- lives at the
    #          domain's own level, `MAIN/`;
    #      an edge whose two ends are in DIFFERENT sectors -- a CROSSING --
    #          lives at the domain's own level too;
    #      an edge with a `from` and no `to`   -- the plant's LABEL for a
    #          sector's product -- leaves the file in the producing sector;
    #      a stream the root dict never mentions is internal to one sector and
    #          must NOT rise.
    #  What this does NOT reach: a case nesting a sector inside a sector, where
    #  "the domain's own level" and "MAIN" stop coinciding with one tier.  No
    #  corpus case nests, and the arm says so rather than implying coverage.
    STREAM_HOMES = (FRACTAL, "tutorials/plant/lithiumBrinePlant")
    DOMAIN = "MAIN"
    nhome = nstreams = 0
    for rel in STREAM_HOMES:
        man = manifest_of(rel)
        if man is None:
            problems.append(
                "%s: `choupoSolve --manifest` published no stream manifest, so "
                "arm (h) has nothing to check.  The manifest is the ONE home's "
                "own answer; without it the rule is unfalsifiable." % rel)
            continue
        fd = ROOT / rel / "system" / "flowsheetDict"
        edges = root_edges(fd)
        if not edges:
            problems.append("%s: no root `connections {}` edges parsed -- arm "
                            "(h) has no subject." % rel)
            continue
        nhome += 1
        composites, _leaves = authored_sectors(rel)
        named = set()
        for name, frm, to in edges:
            sid = edge_identity(name, frm, man)
            if sid is None:
                problems.append(
                    "%s: the root edge `%s` names no stream the manifest "
                    "carries (tried `%s` and its port).  Either the edge is "
                    "dead or the manifest lost a stream."
                    % (rel, name, frm.replace("/", ".") if frm else name))
                continue
            named.add(sid)
            where = str(PurePosixPath(man[sid]).parent)
            fs_, ts_ = sector_of_port(frm), sector_of_port(to)
            if frm and to and fs_ != ts_:
                if where != DOMAIN:
                    problems.append(
                        "%s: `%s` crosses %s -> %s and its state file is at "
                        "0/%s.  A stream is an EDGE: an edge between two "
                        "subgraphs belongs to neither, it belongs to the graph "
                        "that contains both (expected 0/%s/)."
                        % (rel, sid, fs_, ts_, man[sid], DOMAIN))
            elif to and not frm:
                if where != DOMAIN:
                    problems.append(
                        "%s: `%s` is a plant INLET (nobody in the case produces "
                        "it) and its state file is at 0/%s.  Its other endpoint "
                        "is the domain's own boundary, so it lives at the "
                        "domain's own level 0/%s/."
                        % (rel, sid, man[sid], DOMAIN))
            elif frm and not to:
                #  Only assertable when the producing member is a DECLARED
                #  COMPOSITE sector.  A root-level LEAF member producing a
                #  plant outlet has no sector at all, so its stream sits at the
                #  domain's own level and `fs_` (the member's NAME) is not a
                #  level to compare against.  No witness here has that shape;
                #  the guard is so the arm cannot accuse one that does.
                if fs_ in composites and where != fs_:
                    problems.append(
                        "%s: `%s` is the plant's LABEL for a stream %s owns "
                        "(`%s`), and a boundary alias is a label, not a second "
                        "state file -- the file stays with the sector that owns "
                        "the identity.  It is at 0/%s."
                        % (rel, sid, fs_, name, man[sid]))
        for sid, p in sorted(man.items()):
            nstreams += 1
            if sid in named:
                continue
            if str(PurePosixPath(p).parent) == DOMAIN:
                problems.append(
                    "%s: `%s` is named by no root edge -- every endpoint it has "
                    "is inside one sector -- yet its file rose to 0/%s/.  The "
                    "level is the LOWEST one containing every endpoint, not the "
                    "highest." % (rel, sid, DOMAIN))
            if "/" not in p:
                problems.append(
                    "%s: `%s` has a state file at the view ROOT (0/%s), loose "
                    "beside the sector folders.  That is the mixed level the "
                    "2026-09-05 convention was adopted to remove: in a fractal "
                    "case every file in a view sits inside a level of the "
                    "plant's geography." % (rel, sid, p))

    # ---------------------------------------------------------------- (i)
    #  AND THE RUN'S OWN TABLE AGREES.  `streamTable.csv`'s `crossing` column
    #  is computed by a different reader (`StreamTableReport::crossingOf`,
    #  which asks the topology directly and never the ownership rule), so it
    #  is an independent witness to which streams span two sectors.  Every one
    #  of them must be filed in NEITHER endpoint's folder.  This is the arm
    #  that fires on the defect that started the slice: `Magma` filed inside
    #  CONCENTRATION, one of its two endpoints.
    ncross = 0
    stbl = find_csv(FRACTAL, "streamTable", "streamTable.csv")
    man = manifest_of(FRACTAL)
    if stbl is None:
        problems.append("%s: no streamTable.csv -- arm (i) has no independent "
                        "witness to which streams cross." % FRACTAL)
    elif man is not None:
        head, rows = csv_rows(stbl)
        if "crossing" not in head or "sector" not in head:
            problems.append(
                "%s: streamTable.csv carries no `crossing`/`sector` column, so "
                "nothing outside the ownership rule says which streams span "
                "two sectors." % FRACTAL)
        else:
            ci, si2 = head.index("crossing"), head.index("sector")
            for r in rows:
                if not r[ci].strip():
                    continue
                ends = set()
                for hop in r[ci].split():
                    a, _, b = hop.partition("->")
                    ends.add(a); ends.add(b)
                #  `MAIN` IS THE DOMAIN'S OWN LEVEL, NOT A SECTOR LIKE THE
                #  OTHERS (the 2026-09-07 amendment).  A stream handed from a
                #  plant-level unit into a sector therefore has no level BELOW
                #  the domain's own that contains both ends, and landing there
                #  is the rule working, not the defect.  What this arm refuses
                #  is a crossing filed inside one of two real SECTORS.
                ends.discard(DOMAIN)
                if not ends:
                    continue
                ncross += 1
                if r[si2] in ends:
                    problems.append(
                        "%s: `%s` crosses %s and the table files it in `%s`, "
                        "which is one of its own endpoints."
                        % (FRACTAL, r[0], r[ci], r[si2]))
                sid = r[0]
                if sid in man and str(PurePosixPath(man[sid]).parent) in ends:
                    problems.append(
                        "%s: `%s` crosses %s and its state file is at 0/%s, "
                        "inside one of its own endpoints."
                        % (FRACTAL, sid, r[ci], man[sid]))
            if ncross == 0:
                problems.append(
                    "%s: not one stream in the table crosses a sector boundary "
                    "-- arm (i) has no subject, and the fractal witness has "
                    "stopped being fractal." % FRACTAL)

    # ---------------------------------------------------------------- (l)
    #  ONE ROW PER PHYSICAL STREAM, and the plant's own name beside it.
    #  `result.streams` is keyed by every NAME a stream answers to -- its
    #  identity, the bare sector label the relabel pass mints, the plant's
    #  boundary label -- and the table used to emit a row per KEY: 52 rows for
    #  25 pipes on this plant, twenty-one of them two or three times with
    #  byte-identical numbers, and the duplicates showed a blank PFD number in
    #  the app.  The row set must now be EXACTLY the canonical manifest's keys,
    #  which is the same set `StreamOwnership` gives a state file to -- so the
    #  table and the `0/` tree cannot disagree about how many streams a plant
    #  has.  The `label` column is checked against the AUTHORED root dict, not
    #  against the engine's own conclusion: a plant DECLARES its outlets, and
    #  a label naming anything else would be a boundary the case does not have.
    nrows, nlabels = 0, 0
    if stbl is not None and man is not None:
        head, rows = csv_rows(stbl)
        ids = [r[0] for r in rows]
        nrows = len(ids)
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            problems.append(
                "%s: streamTable.csv repeats %d stream id(s): %s.  One physical "
                "stream, one row." % (FRACTAL, len(dupes), ", ".join(dupes)))
        extra   = sorted(set(ids) - set(man))
        missing = sorted(set(man) - set(ids))
        if extra:
            problems.append(
                "%s: streamTable.csv draws %d row(s) the canonical manifest "
                "does not name: %s.  Those are LABELS -- other names for a pipe "
                "the table already drew -- and drawing them makes the plant "
                "look bigger than it is."
                % (FRACTAL, len(extra), ", ".join(extra)))
        if missing:
            problems.append(
                "%s: %d stream(s) have a state file and no row in "
                "streamTable.csv: %s.  The table and the state tree must count "
                "the same streams." % (FRACTAL, len(missing), ", ".join(missing)))
        if "label" not in head:
            problems.append(
                "%s: streamTable.csv carries no `label` column, so the plant's "
                "own name for a stream it exports (`Powder`, `Stack`) appears "
                "nowhere -- and the row is the qualified identity, which is not "
                "that name." % FRACTAL)
        else:
            li = head.index("label")
            declaredOutlets = {n for n, frm, to in root_edges(
                ROOT / FRACTAL / "system" / "flowsheetDict") if frm and not to}
            labelled = {r[0]: r[li].strip() for r in rows if r[li].strip()}
            nlabels = len(labelled)
            if not labelled:
                problems.append(
                    "%s: the `label` column is empty on every row -- arm (l) "
                    "has no subject, and a plant that exports nine products "
                    "under its own names has stopped saying so." % FRACTAL)
            for sid, lab in sorted(labelled.items()):
                if lab not in declaredOutlets:
                    problems.append(
                        "%s: `%s` is labelled `%s`, which the root dict "
                        "declares as no boundary outlet.  A label is the name "
                        "the AUTHOR gave the plant's boundary, never one the "
                        "report invented." % (FRACTAL, sid, lab))
            for sid, lab in sorted(labelled.items()):
                if roleOfRow(head, rows, sid) != "product":
                    problems.append(
                        "%s: `%s` carries the plant label `%s` and is filed as "
                        "`%s`.  A stream the plant declared as an outlet is a "
                        "product; the row used to read `intermediate` because "
                        "`Topology` files a renamed product under the LABEL."
                        % (FRACTAL, sid, lab,
                           roleOfRow(head, rows, sid)))

    #  ...AND THE FLAT WITNESS GAINS NO COLUMN.  A case whose plant renames
    #  nothing has no boundary label to show, and a column of blanks would
    #  claim a structure it does not have -- the same ruling the `sector`
    #  pair already follows.
    #  The two report layouts name the directory differently (`reports/streams`
    #  vs the functionObject tree's `postProcessing/streamTable/0`), so ask for
    #  both rather than assume the one the fractal witness happens to use.
    ftbl = (find_csv(FLAT, "streamTable", "streamTable.csv")
            or find_csv(FLAT, "streams", "streamTable.csv"))
    if ftbl is None:
        problems.append("%s: no streamTable.csv -- arm (l) cannot check that a "
                        "flat case gains no `label` column." % FLAT)
    else:
        fh, _ = csv_rows(ftbl)
        if "label" in fh:
            problems.append(
                "%s: a FLAT case's streamTable.csv carries a `label` column. "
                "Its units ARE the plant; it renames nothing at a boundary, so "
                "the column is a claim about a structure that is not there."
                % FLAT)

    # ---------------------------------------------------------------- (j)
    #  A FLAT CASE GAINS NOTHING.  Its units ARE the plant, so the domain's own
    #  level is the view root and every state file is flat: no `MAIN/`, no
    #  folder of any kind.  Inventing one would make every flat case's state
    #  tree differ for a structure it does not have -- the 2026-09-04 ruling
    #  that empty is not a sector called "root", applied to the state view.
    flatman = manifest_of(FLAT)
    nflat = 0
    if flatman is None:
        problems.append("%s: publishes no manifest -- arm (j) has no subject."
                        % FLAT)
    else:
        nflat = len(flatman)
        deep = sorted(p for p in flatman.values() if "/" in p)
        if deep:
            problems.append(
                "%s has no sectors and its state files are no longer flat: %s.  "
                "A flat case's units are the plant." % (FLAT, deep))

    # ---------------------------------------------------------------- (k)
    #  A RELOCATION IS ANNOUNCED, NEVER SILENT.  The level is a function of the
    #  WHOLE topology, so an edit elsewhere in the plant can move a file that
    #  was written correctly yesterday.  The engine must never move it, ignore
    #  it, or report it as two unrelated faults (a MISSING and an ORPHAN): it
    #  names the move, both addresses, and the remedy.  Fired on a COPY of the
    #  witness in a temp directory -- this gate never mutates the tree.
    reloc = "not run"
    tmp = tempfile.mkdtemp(prefix="choupo_streamhome_")
    try:
        dst = os.path.join(tmp, "case")
        shutil.copytree(str(ROOT / FRACTAL), dst,
                        ignore=shutil.ignore_patterns("converged", "iterations",
                                                      "postProcessing", "design",
                                                      "economics"))
        src = os.path.join(dst, "0", "MAIN", "Magma")
        dest_dir = os.path.join(dst, "0", "CONCENTRATION")
        if not os.path.isfile(src):
            problems.append(
                "arm (k) could not stage its own subject: %s has no "
                "0/MAIN/Magma to put back where the retired rule filed it."
                % FRACTAL)
        else:
            shutil.move(src, os.path.join(dest_dir, "Magma"))
            r = subprocess.run([str(ROOT / "choupoSolve"), dst],
                               capture_output=True, text=True)
            out = r.stdout + r.stderr
            if r.returncode == 0:
                problems.append(
                    "arm (k): a state file at the address the RETIRED rule gave "
                    "was accepted, exit 0.  A file the engine cannot place is "
                    "never read in silence.")
            elif "RELOCATED" not in out:
                problems.append(
                    "arm (k): the engine refused the moved file but did not "
                    "ANNOUNCE it as a RELOCATION -- reported as an unrelated "
                    "MISSING and ORPHAN, which is a puzzle rather than a "
                    "remedy.  Output tail:\n%s" % out[-600:])
            elif "0/CONCENTRATION/Magma" not in out or "0/MAIN/Magma" not in out:
                problems.append(
                    "arm (k): the relocation was announced without naming BOTH "
                    "addresses.  Output tail:\n%s" % out[-600:])
            else:
                reloc = "announced with both addresses"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

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

    # ---------------------------------------------------------------- (g)
    #  The STREAM side of the same rejected design.  Two more copies of it
    #  lived here until 2026-09-06, and arm (d) was blind to both: they split
    #  on the FIRST dot, and (d) looks for a LAST-dot substring.
    #
    #  What is refused is a SINGLE-DOT split whose subject is a unit NAME --
    #  `unitName.find('.')`, `dottedUnit.find(".")`, `u.name.rfind('.')`.  A
    #  split of a STREAM name (`stream.rfind('.')`, the file's own basename
    #  rule) and a prefix test (`nm.rfind(".tmp_", 0)`) are different acts and
    #  stay legal, which is why the literal must be a bare dot and the subject
    #  must name a unit.
    #  Two ROLES, and they are not the same requirement.  A file that READS
    #  the chain's head must call the one home; the file that SUPPLIES the
    #  stamp to the ownership rule must hand it over as data.  Requiring the
    #  call of the supplier failed the gate on correct code -- the first draft
    #  did exactly that.
    #  THREE ROLES SINCE 2026-09-07, because the stream rule changed shape.
    #    reads-head  -- still wants the chain's HEAD (the converged/ per-sector
    #                   views; the streamTable's `crossing` column), so it must
    #                   go through the ONE home `topLevelSector`;
    #    reads-chain -- the ownership rule itself, which now reads the chain
    #                   WHOLE (a stream lives at the LOWEST level containing
    #                   every endpoint, at any fractal depth), so it must
    #                   consume the STAMPED chain and must not call the head
    #                   accessor to get there;
    #    supplies    -- hands the stamp over as data.
    #  The no-split ban applies to all of them: whatever a file does with a
    #  chain, it must never recover one from a unit NAME.
    STREAM_READERS = {
        "src/streams/StreamOwnership.H":                 "reads-chain",
        "src/io/SolutionWriter.cpp":                     "reads-head",
        "src/reporting/StreamTableReport.cpp":           "reads-head",
        "src/unitOperations/flowsheet/Flowsheet.cpp":    "supplies",
    }
    SPLIT = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)"
                       r"\s*\.\s*(?:find|rfind|find_first_of|find_last_of)"
                       r"\s*\(\s*(['\"])\.\2")
    UNITISH = re.compile(r"(?i)(unit|name|owner|dotted)")

    def unit_name_splits(src: str):
        return sorted({m.group(1) for m in SPLIT.finditer(src)
                       if UNITISH.search(m.group(1))})

    #  THE PROBE.  A gate that cannot be shown to fire is a gate nobody can
    #  trust; this is the construct that was removed, verbatim, and the
    #  detector must still reject it.
    PROBE = ("const auto d = unitName.find('.');\n"
             "const auto e = dottedUnit.find(\".\");\n"
             "sectors.insert(u.name.rfind('.'));\n")
    probed = unit_name_splits(PROBE)
    if len(probed) != 3:
        problems.append(
            "arm (g)'s detector no longer flags its own PROBE (found %s of the "
            "three removed constructs).  A detector that cannot fire reports "
            "nothing when the defect returns." % probed)

    nstream = nreads = nsupplies = 0
    for rel, role in sorted(STREAM_READERS.items()):
        f = ROOT / rel
        if not f.is_file():
            problems.append("%s: reader is missing -- arm (g) has no subject."
                            % rel)
            continue
        nstream += 1
        if role.startswith("reads"):
            nreads += 1
        else:
            nsupplies += 1
        raw = f.read_text(errors="replace")
        #  BOTH comment forms go, and the block form matters: these files
        #  ARGUE about the rule in their headers, and a `topLevelSector`
        #  mentioned only in prose would satisfy the "calls it" requirement
        #  while the code had stopped calling it (observed while sabotaging).
        src = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)
        src = re.sub(r'//[^\n]*', '', src)
        bad = unit_name_splits(src)
        if bad:
            problems.append(
                "%s: takes a single-dot split of %s.  A stream's sector is its "
                "owning unit's STAMPED `FlatUnit::sector`, read through "
                "`topLevelSector`; splitting the unit name is the name "
                "identity the F2 contract bans, and it misfiles the state file "
                "of the first unit whose name carries a dot for another reason."
                % (rel, ", ".join("`%s`" % b for b in bad)))
        if role == "reads-head" and "topLevelSector" not in src:
            problems.append(
                "%s: never calls `topLevelSector`.  The ONE home for reading a "
                "stamped sector chain's head is core/FlatUnit.H; a reader that "
                "stops calling it has either lost the rule or grown a second "
                "copy of it." % rel)
        if role == "reads-chain" and "SectorOfUnit" not in src:
            problems.append(
                "%s: consumes no stamped sector chain (`SectorOfUnit`).  The "
                "ownership rule reads the chain WHOLE -- a stream lives at the "
                "lowest level containing every endpoint -- and a rule that has "
                "stopped taking the stamp has gone back to guessing." % rel)
        if role == "supplies" and not re.search(
                r'SectorOfUnit', src):
            problems.append(
                "%s: builds no `StreamOwnership::SectorOfUnit`.  The pre-solve "
                "0/ path assembly gets the sector from the flattened dict's "
                "own stamped `sector` key; without it every stream would be "
                "filed flat and the sector would have to be guessed from a "
                "name again." % rel)
        if role == "supplies" and not re.search(
                r'lookupWordOrDefault\(\s*"sector"', src):
            problems.append(
                "%s: never reads the flattened dict's stamped `sector` key, so "
                "the map it hands the ownership rule cannot carry the stamp."
                % rel)

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
          "sector and on cost, and none of the %d reader(s) takes a last-dot "
          "substring of a unit name.  THE STREAM SIDE IS HELD THE SAME WAY, in "
          "the three roles it has: the %d file(s) that read a stamped chain's "
          "HEAD (the converged/-view bucketing, the stream table's `crossing` "
          "column) do it through the ONE home `topLevelSector`, the ownership "
          "rule itself reads the chain WHOLE and consumes the stamp, the %d "
          "that SUPPLIES the stamp to the pre-solve path assembly builds a "
          "`SectorOfUnit` from the flattened dict's own `sector` key, none of "
          "the %d takes a single-dot split of a unit name, and the detector "
          "saying so is proven to flag all three removed constructs on its own "
          "probe.  WHERE EACH STREAM'S STATE FILE LIVES (the 2026-09-07 rule: "
          "the LOWEST level whose subtree contains every endpoint) is checked "
          "for %d fractal case(s), %d stream(s) in all, by recomputing the "
          "level from the AUTHORED root `connections {}` block and comparing "
          "it with the engine's published `--manifest`: a plant inlet and a "
          "sector-to-sector crossing at the domain's own level `MAIN/`, a "
          "plant outlet LABEL leaving the file with the sector that owns the "
          "identity, a stream no root edge mentions staying inside its sector, "
          "and no file loose at the view root.  The run's own streamTable "
          "agrees on the %d stream(s) it independently reports as crossing -- "
          "each in NEITHER endpoint's folder.  %s has no sectors and all %d of "
          "its state files stay flat.  A file left at the address the retired "
          "rule gave is REFUSED and the move is %s.  ONE ROW PER PHYSICAL "
          "STREAM: the fractal witness's streamTable draws %d row(s), exactly "
          "the manifest's stream ids and no label among them, and the %d row(s) "
          "the plant exports carry its OWN outlet name in a `label` column -- "
          "each one a name the root dict declares, each row filed as a product "
          "-- while the flat witness gains no such column.  NOT "
          "CHECKED: whether any cost is right; NESTING DEEPER THAN ONE LEVEL "
          "-- no corpus case puts a sector inside a sector, so nothing here "
          "distinguishes `A/B/` from `A/` for an internal stream, and nothing "
          "exercises the case where the domain's own level and `MAIN` stop "
          "coinciding with one tier; whether a unit name and its stamp agree "
          "(on this corpus they do, which is why arms (d) and (g) read the "
          "source); whether a stream's OWN 0/ file holds the right numbers "
          "(this arm is about the address, never the contents); and the GUI, "
          "which does not read the sector yet."
          % (FRACTAL, len(declared), sorted(declared), nsub,
             notes[0] if notes else "no shares read", FLAT,
             len(jsonSectors), len(equip), nread, nreads, nsupplies,
             nstream, nhome, nstreams, ncross, FLAT, nflat, reloc,
             nrows, nlabels))
    return 0


if __name__ == "__main__":
    sys.exit(main())
