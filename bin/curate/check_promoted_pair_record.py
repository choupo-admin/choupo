#!/usr/bin/env python3
"""Gate: the pair record a student PROMOTES carries the evidence and the verdict.

    bin/curate/check_promoted_pair_record.py

WHY THIS EXISTS.  `fitParameters` can write a `.dat` the reader MOVES into
`constant/parameters/<model>/` and then simulates with.  That file outlives
every console line printed above it -- and until 2026-09-03 it discarded all
of them.  The run knew the two datasets, the role each had been frozen in, the
held-out AAD over the withheld points, the acceptance band declared before the
fit and the verdict; it printed all five and then wrote:

    provenance
    {
        source        fitted;
        fitDate       "2026-09-03";
        algorithm     "Levenberg-Marquardt (choupoProps fitParameters)";
        chi2          0.80969941;
        nDataPoints   8;
        identifiable  false;
    }

Against the ratified five axes (docs/design/provenance-semantics-five-axes.md)
that is the ORIGIN word in the slot whose one job is to say WHERE THE DATA CAME
FROM -- and it named no dataset, no DOI and no verdict.  `source fitted;` was
not even inert: `thermo/PairAudit.H` reads it as a LEGACY source word and
raises a deprecation advisory on every promoted proposal.

WHAT THIS GATE CHECKS, on a scratch copy of the corpus witness curate02:

  (a) THE RECORD IS WRITTEN, and its header states the VERDICT before the
      `mv` line.  The header is what a reader sees before promoting.

  (b) `origin` IS TYPED AND IN THE BLOCK THE READER PARSES.  `provenance {
      origin fitted; }`, never `source fitted;`.  The file layout follows the
      curated corpus (data/standards/parameters/NRTL/*.dat) rather than a
      second one invented here.

  (c) THE EVIDENCE IS NAMED, WITH ITS ROLES.  Both declared datasets appear
      under `evidence ( ... )`, each with the role it was frozen in, plus the
      partition FINGERPRINT -- so a reader can tell which points the model was
      scored on without the case that produced it.

  (d) THE VERDICT AND ITS NUMBERS ARE IN THE FILE, and they AGREE WITH THE
      CONSOLE of the same run: the same verdict word, the same held-out point
      count, and the same acceptance band with the reason it was set there.

  (e) THE RECORD ROUND-TRIPS.  It is promoted into a real flash case whose
      inline pair block has been removed, `choupoSolve` runs, and the pair
      resolution reports `origin regressed` (the typed word `fitted` maps to)
      with `method` and `methodVersion` carried -- NOT `unattributed`, and
      with no deprecation advisory.  A writer whose reader cannot see its
      output is a bug in both; this arm is the only thing that says so.

  (f) THE RESOLUTION JSON HAS NO DUPLICATE KEYS.  `ResultEmitter` emitted
      `origin`, `method` and `methodVersion` by hand AND then called the ONE
      shared formatter that emits them -- so every pair came out with those
      three keys twice in a single JSON object.  Found by reading (e)'s own
      output.

SABOTAGE-VERIFIED 2026-09-03, five times; every arm below fired on the
sabotage named beside it, and the gate passed again once it was reverted.

S1 -- `origin fitted;` reverted to `source fitted;` in the writer.  Arms (b)
      and (e): the round-trip drops to `origin regressed` via the LEGACY
      source-word path and the deprecation advisory appears.

S2 -- the `evidence ( ... )` emission suppressed (the `engaged` branch made to
      write only the fingerprint).  Arm (c), both datasets.

S3 -- the verdict hard-wired to `notClaimed` in the record while the console
      keeps computing the real one.  Arm (d) names the disagreement rather
      than the absence, which is the useful half: a record that merely lacked
      a verdict is a gap, and one that contradicts its own run is a lie.

S4 -- the three hand-written key emissions restored in ResultEmitter beside
      the shared formatter.  Arm (f).

S5 -- `proposal` removed from curate02's `output` block.  Arm (a).  This one
      is why the arm exists: without it the whole gate would pass vacuously on
      a case that had stopped writing the artefact at all.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It does not check any NUMBER in the record against measurement.  The
    fitted coefficients, the chi2 and the held-out AAD are the run's own
    output; this gate proves the file carries them and that they agree with
    the console, never that they are right.
  * Only the NRTL / v2 `binaryParameters` grammar is exercised.  The v1 flat
    `pairs[K]` grammar takes the same code path and is NOT run here.
  * Only the ENGAGED branch is exercised.  The legacy single-`dataset` form
    writes `evidence undeclared;` and `verdict notClaimed`, and no corpus case
    combines that form with `proposal`.
  * It says nothing about whether a record SHOULD be promoted.  That is a
    curation act and stays the reader's.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/curation/curate02_vle_heldout_ethanol_water"
FLASH = ROOT / "tutorials/steady/flash/flash02_ethanol_water"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
RECORD = "ethanol-water.proposal.dat"


def run(binary, case):
    p = subprocess.run([str(binary), "."], cwd=str(case),
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main():
    fails = []
    for b in (PROPS, SOLVE):
        if not b.exists():
            print("check_promoted_pair_record: FAIL")
            print("  - %s is not built -- the gate cannot run, so it must not "
                  "pass" % b.name)
            return 1

    tmp = Path(tempfile.mkdtemp(prefix="choupo-pairrec-"))
    try:
        # ---- (a) the record is written, header-first --------------------
        work = tmp / "curate02"
        shutil.copytree(CASE, work)
        for stale in work.glob("*.proposal.dat"):
            stale.unlink()
        rc, out = run(PROPS, work)
        if rc != 0:
            fails.append("curate02 exited %d -- the witness must run" % rc)
        rec_path = work / RECORD
        if not rec_path.exists():
            fails.append("curate02 wrote no %s -- the case's `output` block "
                         "must declare `proposal`, or this gate passes "
                         "vacuously on a witness that stopped writing the "
                         "artefact" % RECORD)
            raise SystemExit(_report(fails))
        rec = rec_path.read_text()

        head = rec.split("*/", 1)[0]
        m_console = re.search(r"VERDICT\s*\n\s+(\w+)", out)
        console_verdict = m_console.group(1) if m_console else ""
        if not console_verdict:
            fails.append("the run printed no VERDICT -- nothing to compare "
                         "the record against")
        if "VERDICT:" not in head:
            fails.append("the record's header states no VERDICT; the header "
                         "is what a reader sees before running `mv`")
        if "Promote by:" in head and head.index("VERDICT:") > head.index("Promote by:"):
            fails.append("the header puts the `mv` line ABOVE the verdict")

        # ---- (b) origin is typed, and inside provenance {} ---------------
        prov = _block(rec, "provenance")
        if prov is None:
            fails.append("the record carries no `provenance {}` block")
            prov = ""
        if not re.search(r"^\s*origin\s+fitted\s*;", prov, re.M):
            fails.append("`provenance {}` does not declare `origin fitted;` -- "
                         "the typed axis word, in the block PairAudit parses")
        if re.search(r"^\s*source\s+fitted\s*;", prov, re.M):
            fails.append("`provenance { source fitted; }` is back: the origin "
                         "word in the slot that says where the DATA came from, "
                         "which PairAudit reads as a legacy source word")
        if not re.search(r"^\s*method\s+\"", prov, re.M):
            fails.append("`provenance {}` declares no `method` -- which "
                         "operation produced these coefficients")

        # ---- (c) the evidence is named, with roles and fingerprint ------
        for ds, role in (("etoh-water-101kPa-fit.dat", "fit"),
                         ("etoh-water-101kPa-heldout.dat", "validation")):
            if ds not in prov:
                fails.append("the record does not name its %s dataset (%s)"
                             % (role, ds))
        if len(re.findall(r"^\s*role\s+fit\s*;", prov, re.M)) != 1:
            fails.append("the record does not carry exactly one `role fit` "
                         "evidence entry")
        if len(re.findall(r"^\s*role\s+validation\s*;", prov, re.M)) != 1:
            fails.append("the record does not carry exactly one "
                         "`role validation` evidence entry")
        if not re.search(r"^\s*fingerprint\s+\"", prov, re.M):
            fails.append("the record carries no partition `fingerprint` -- an "
                         "after-the-fact edit of the declaration would be "
                         "undetectable from the promoted file")

        # ---- (d) the verdict and its numbers agree with the console -----
        val = _block(rec, "validation")
        if val is None:
            fails.append("the record carries no `validation {}` block -- the "
                         "held-out result the run computed is missing")
            val = ""
        m_rec = re.search(r"^\s*verdict\s+(\w+)\s*;", val, re.M)
        rec_verdict = m_rec.group(1) if m_rec else ""
        if console_verdict and rec_verdict != console_verdict:
            fails.append("the record says `verdict %s` and the same run's "
                         "console says `%s` -- a record that contradicts its "
                         "own run is worse than one that carries no verdict"
                         % (rec_verdict or "<none>", console_verdict))
        m_pts = re.search(r"points\s+(\d+)\s*;", val)
        m_con_pts = re.search(r"points\s+(\d+)\s*\n", out)
        if m_pts and m_con_pts and m_pts.group(1) != m_con_pts.group(1):
            fails.append("held-out point count: record %s, console %s"
                         % (m_pts.group(1), m_con_pts.group(1)))
        m_band = re.search(r"maxAAD\s+([0-9.]+)\s*;", val)
        m_con_band = re.search(r"maxAAD\s+([0-9.]+)\s*%", out)
        if m_band and m_con_band:
            if abs(float(m_band.group(1)) - float(m_con_band.group(1))) > 1e-9:
                fails.append("acceptance band: record %s, console %s"
                             % (m_band.group(1), m_con_band.group(1)))
        elif not m_band:
            fails.append("the record's `validation {}` states no acceptance "
                         "band; a verdict with no band behind it cannot be "
                         "read back")
        if "origin" not in val:
            fails.append("the acceptance band names no origin -- a limit with "
                         "no stated reason cannot be told from one chosen "
                         "after the residuals were seen")

        # ---- (e) the record ROUND-TRIPS through the pair reader ----------
        rt = tmp / "flash"
        shutil.copytree(FLASH, rt)
        shutil.rmtree(rt / "converged", ignore_errors=True)
        tpd = rt / "constant" / "thermoPhysPropDict"
        text = _strip_block(tpd.read_text(), "binaryParameters")
        if _block_start(text, "binaryParameters") is not None:
            fails.append("the round-trip probe could not strip the inline "
                         "pair block, so the promoted file would never be "
                         "consulted -- the arm would pass without testing "
                         "anything")
        tpd.write_text(text)
        dest = rt / "constant" / "parameters" / "NRTL"
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy(rec_path, dest / "ethanol-water.dat")
        rc2, out2 = run(SOLVE, rt)
        if rc2 != 0:
            fails.append("the promoted record does not RUN: choupoSolve "
                         "exited %d.  A writer whose reader refuses its "
                         "output is a bug in both." % rc2)
        line = ""
        for l in out2.splitlines():
            if '"model": "NRTL"' in l and '"i": "ethanol"' in l:
                line = l
                break
        if not line:
            fails.append("the run reported no NRTL pair resolution for "
                         "ethanol-water -- the promoted file was not read")
        else:
            if '"origin": "regressed"' not in line:
                fails.append("the promoted record resolves to %s, not "
                             "`regressed`: the file declares its origin and "
                             "the engine does not see it"
                             % (re.search(r'"origin": "(\w+)"', line).group(1)
                                if re.search(r'"origin": "(\w+)"', line)
                                else "<no origin key>"))
            if '"method": "fitParameters' not in line:
                fails.append("the promoted record's `method` did not reach "
                             "the run's pair resolution")
            # ---- (f) no duplicate keys in one JSON object ---------------
            for key in ("origin", "method", "methodVersion"):
                n = len(re.findall(r'"%s":' % key, line))
                if n > 1:
                    fails.append('the pair-resolution JSON carries "%s" %d '
                                 "times in one object -- ResultEmitter is "
                                 "emitting by hand beside the ONE shared "
                                 "formatter" % (key, n))
        if "deprecation" in out2 and "origin" in out2:
            for l in out2.splitlines():
                if "deprecation" in l:
                    fails.append("the promoted record raises a deprecation "
                                 "advisory: " + l.strip())
                    break
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return _report(fails)


def _block_start(text, name):
    """Index of a `<name>` KEYWORD line, skipping any mention inside a comment.

    The first version of this arm used a DOTALL regex and matched the word
    where it appears in the dict's own header comment, deleting the whole
    liquid phase -- and then reported that the promoted record "does not RUN".
    A probe that mangles its own input blames the engine for its own edit.
    """
    for m in re.finditer(r"^([ \t]*)%s\b" % re.escape(name), text, re.M):
        line_start = m.start()
        before = text[:line_start]
        # inside a /* ... */ comment?
        if before.rfind("/*") > before.rfind("*/"):
            continue
        return line_start
    return None


def _strip_block(text, name):
    """Remove a `<name> { ... }` block by matching braces, comments excluded."""
    start = _block_start(text, name)
    if start is None:
        return text
    brace = text.index("{", start)
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[:start] + text[i + 1:].lstrip("\n")
    return text


def _block(text, name):
    """The body of a top-level `<name> { ... }` block, braces matched."""
    m = re.search(r"^%s\s*\n?\s*\{" % re.escape(name), text, re.M)
    if not m:
        return None
    depth = 0
    for i in range(m.end() - 1, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[m.end():i]
    return None


def _report(fails):
    if fails:
        print("check_promoted_pair_record: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_promoted_pair_record: OK -- the record curate02 proposes for "
          "promotion states its VERDICT in the header above the `mv` line; "
          "declares `origin fitted;` as a TYPED word inside the `provenance {}` "
          "block PairAudit parses (never `source fitted;`, which that parser "
          "reads as a deprecated source word); names BOTH declared datasets "
          "with the role each was frozen in plus the partition fingerprint; "
          "carries the held-out verdict, point count and pre-declared "
          "acceptance band, each AGREEING with the same run's console; and "
          "ROUND-TRIPS -- promoted into a flash case with its inline pair "
          "stripped, it runs and resolves to `origin regressed` with its "
          "method carried and no deprecation advisory, and the resolution JSON "
          "names each of those keys exactly once.  NOT COVERED: whether any "
          "number in the record is RIGHT (they are the run's own output); the "
          "v1 flat `pairs[K]` grammar; the legacy single-`dataset` branch, "
          "which no corpus case combines with `proposal`; and whether a record "
          "SHOULD be promoted, which stays a curation act.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
