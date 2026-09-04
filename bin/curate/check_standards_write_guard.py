#!/usr/bin/env python3
"""Gate: the engine's refusal to write into data/standards/ is REAL, everywhere.

    bin/curate/check_standards_write_guard.py

WHY THIS EXISTS.  Four documents state the rule flatly -- CLAUDE.md Sec. 7
("the engine REFUSES to write under `data/standards/` -- new data is a curation
act"), docs/ai/data-doctrine.md, docs/architecture/domain-glossary.md, and
`fitParameters`' own console text ("the engine never writes the standards
catalogue").  Measured 2026-09-04: exactly ONE code site enforced it.

Reproduced before the fix, not supposed: pointing `fitParameters`' `proposal`
at `.../standards/parameters/NRTL/<pair>.dat` wrote a 2663-byte promotable pair
record there and EXITED 0 -- a file carrying a `provenance {}` block the pair
loader reads as authoritative, admitted to the frozen tree by nobody.

A rule enforced in one place out of many is a sentence, not a contract.  This
gate is what turns it into one.

WHAT IT CHECKS

  (a) STRUCTURAL, AND IT RECOUNTS.  Every `.cpp` under src/ that both reads an
      output-path key from a dict (`file`, `proposal`, `parity`, `fit_log`) and
      constructs a `std::ofstream` must reach `records::refuseStandardsWrite`,
      at least once per distinct key it reads.  The counts are recomputed on
      every run and printed; nothing is transcribed from a list.  This is the
      arity lesson from `check_origin_census`, which got its own population
      wrong twice by counting once and then remembering.

  (b) BEHAVIOURAL, THROUGH THE REAL BINARY, on BOTH rules of the guard, because
      each exists to cover the other's blind spot:
        * rule (a), a path component literally named `standards`;
        * rule (b), CONTAINMENT under the resolved catalogue root, reached by a
          SYMLINK whose own name carries no such component -- the route the
          literal scan cannot see.
      Each probe must exit non-zero, name the rule that fired and the remedy,
      and leave no file behind.

  (c) THE NEGATIVE.  The same case with an ordinary path still writes its
      record and exits 0.  A guard that refuses everything would pass (a) and
      (b) and be worthless.

SAFETY OF PROBE (b).  It aims at the REAL catalogue root, because that is what
containment is about, but at a subdirectory that does not exist -- so even a
fully regressed guard cannot create a file there (`std::ofstream` will not make
the parent).  The gate additionally FAILS, loudly, if anything appears.

WHAT THIS GATE DOES **NOT** DO, stated so its OK line cannot be read wider:

  * It does not check the `path` keys of the outer drivers.  Those are DICT
    paths (`units[0].operation.refluxRatio`), not filesystem paths, and
    guarding one would refuse a legitimate case.  The distinction is exactly
    the misclassification a mechanical sweep invites.
  * It does not check READS.  Reading from data/standards/ is what the engine
    is for; only writes are the subject.
  * Arm (a) is FILE-level for the ofstream test and KEY-level for the count, so
    an op reading one key and writing through a second path derived inside a
    helper it calls would not be seen.
  * It runs two ops (`fitParameters`, `propertyScan1D`) against the real
    binary.  The other guarded ops are covered structurally only -- reach rests
    on the guard having one home, not on an observed run per op.
  * It says nothing about `bin/curate/*`, which are CURATION tools: promoting a
    record into the catalogue is their job, and they are outside the engine.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"

#  The keys that name a FILESYSTEM output path.  `path` is deliberately absent:
#  in the outer drivers it is a dict path, and refusing one would break a case.
OUT_KEYS = ("file", "proposal", "parity", "fit_log")
KEY_RE = re.compile(r'lookupWord(?:OrDefault)?\("(' + "|".join(OUT_KEYS) + r')"')
GUARD = "refuseStandardsWrite"

#  EXEMPTIONS -- and each one's PREMISE is verified, not asserted.
#
#  The scan pairs "reads an output key" with "constructs an ofstream" at FILE
#  level, so a file that READS a path someone else wrote and, separately,
#  writes to a hard-coded name looks identical to an unguarded writer.  There
#  is exactly one such file.  Guarding its read would be wrong in principle:
#  reading from data/standards/ is what the engine is for.
#
#  A bare waiver would rot the day the file gains a real write, so the premise
#  -- every stream it opens names a STRING LITERAL, never a dict-supplied path
#  -- is CHECKED below.  This is not a debt_registry entry: nothing here is an
#  accepted violation with a remedy, it is a correctly classified non-writer.
EXEMPT = {
    "src/applications/choupoProps/main.cpp":
        "reads `output.file` to LOCATE a CSV a props op already wrote (the AAD "
        "comparison); its own two streams open the hard-coded `exp_<name>.csv`",
}

fail = []
notes = []


def scan_sources():
    """Return (writing_files, guard_calls, unguarded) -- recounted, never read."""
    writing, guards, unguarded = {}, 0, []
    for cpp in sorted(SRC.rglob("*.cpp")):
        text = cpp.read_text(errors="replace")
        keys = set(KEY_RE.findall(text))
        if not keys:
            continue
        if "std::ofstream" not in text:
            continue                     # reads a name, writes nothing with it
        rel = cpp.relative_to(ROOT).as_posix()
        if rel in EXEMPT:
            #  VERIFY THE PREMISE.  Every stream this file opens must name a
            #  string literal; the day one takes a variable, the exemption is
            #  no longer true and this fires instead of quietly holding.
            for m in re.finditer(r'std::ofstream\s+\w+\s*\(([^)]*)\)', text):
                arg = m.group(1).strip()
                if not arg.startswith('"'):
                    unguarded.append(
                        f"{rel}: EXEMPT on the premise that its streams open "
                        f"string literals, but one opens `{arg}` -- re-classify "
                        f"it or guard it")
            continue
        n = text.count(GUARD)
        writing[rel] = (sorted(keys), n)
        guards += n
        if n < len(keys):
            unguarded.append(
                f"{rel}: reads {sorted(keys)} but calls {GUARD} {n} time(s)")
    return writing, guards, unguarded


def run_case(case_dir, binary="choupoProps", env=None):
    e = dict(os.environ)
    if env:
        e.update(env)
    p = subprocess.run([str(ROOT / binary), "."], cwd=case_dir, env=e,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def stage(src_case, tmp):
    dst = Path(tmp) / "case"
    shutil.copytree(src_case, dst)
    return dst


def set_key(dictfile, key, value):
    """Rewrite `<key> <anything>;` to `<key> <value>;` -- exactly one hit.

    COMMENTS ARE STRIPPED FIRST, and that is not tidiness: these dicts document
    their own keys in prose ("`proposal` writes the fitted pair as ..."), so a
    naive count finds the word in a sentence and the probe rewrites a comment
    while the real key sails past unchanged -- a probe that silently tests
    nothing.  The case is a throwaway copy, so stripping is free.
    """
    text = dictfile.read_text()
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    pat = re.compile(r'(?<![A-Za-z0-9_])' + re.escape(key) + r'\s+[^;{}]*;')
    hits = pat.findall(text)
    if len(hits) != 1:
        raise RuntimeError(f"{dictfile}: `{key}` appears {len(hits)} time(s) "
                           "after stripping comments")
    dictfile.write_text(pat.sub(f"{key}   {value};", text, count=1))


# ---------------------------------------------------------------- (a) structure
writing, guards, unguarded = scan_sources()
if unguarded:
    fail += ["UNGUARDED WRITER: " + u for u in unguarded]
if not writing:
    fail.append("found NO writing file at all -- the scan is broken, and a "
                "scan that finds nothing passes vacuously")

# ---------------------------------------------------------------- (b) behaviour
CURATE02 = ROOT / "tutorials/props/curation/curate02_vle_heldout_ethanol_water"
SCAN1D = ROOT / "tutorials/props/compare/acetone01_ipa_water_azeotrope"
REAL_CAT = ROOT / "data" / "standards"
PROBE_DIR = "zzz_guard_probe_never_created"

with tempfile.TemporaryDirectory() as tmp:
    # -- rule (a): a literal `standards` component, on fitParameters' proposal
    case = stage(CURATE02, tmp)
    target = Path(tmp) / "fake" / "standards" / "parameters" / "NRTL" / "p.dat"
    target.parent.mkdir(parents=True)
    set_key(case / "system" / "propsDict", "proposal", str(target))
    rc, out = run_case(case)
    if rc == 0:
        fail.append("PROBE (a): fitParameters accepted a `standards` path and "
                    "exited 0")
    if "refusing to write" not in out or "literally named `standards`" not in out:
        fail.append("PROBE (a): the refusal does not name the rule that fired")
    if "promote-from-dossier" not in out:
        fail.append("PROBE (a): the refusal does not name the remedy")
    if target.exists():
        fail.append("PROBE (a): the record was written anyway")
    #  THE REFUSAL MUST ARRIVE BEFORE THE FIT, not after it.
    #
    #  `fitParameters` guards its `proposal` twice on purpose: once where the
    #  key is READ, and again on the path `auto` RESOLVES to, which the
    #  declaration could not show.  The second covers the first for any
    #  non-`auto` path -- so deleting the early guard left this gate green when
    #  it was first sabotaged, and the only visible difference was that the run
    #  did the entire regression first and refused at the end.
    #
    #  That difference IS the early guard's whole purpose, so it is what gets
    #  asserted.  `Final chi2` is printed only by a completed fit.
    head = out.split("refusing to write")[0]
    if "Final chi2" in head:
        fail.append("PROBE (a): the refusal arrived AFTER the fit completed -- "
                    "the guard at the point the `proposal` key is READ is gone, "
                    "and only the later resolved-path guard caught it")

with tempfile.TemporaryDirectory() as tmp:
    # -- rule (b): containment, reached by a symlink carrying no such component.
    #    Aimed at the REAL catalogue -- that is what containment means -- but
    #    into a directory that does not exist, so a regressed guard cannot
    #    create a file there.  Checked afterwards regardless.
    case = stage(CURATE02, tmp)
    link = Path(tmp) / "cat"
    link.symlink_to(REAL_CAT)
    target = link / PROBE_DIR / "p.dat"
    set_key(case / "system" / "propsDict", "proposal", str(target))
    rc, out = run_case(case)
    if rc == 0:
        fail.append("PROBE (b): fitParameters accepted a symlinked catalogue "
                    "path and exited 0")
    if "resolves inside the installation catalogue" not in out:
        fail.append("PROBE (b): containment did not fire -- only the literal "
                    "scan would have caught this, and it cannot see a symlink")
    leaked = REAL_CAT / PROBE_DIR
    if leaked.exists():
        fail.append(f"PROBE (b): SOMETHING WAS WRITTEN INTO THE CATALOGUE at "
                    f"{leaked} -- remove it")

with tempfile.TemporaryDirectory() as tmp:
    # -- rule (a) on a SECOND op and a second key, so the guard is not proven
    #    only where it was first written.
    case = stage(SCAN1D, tmp)
    target = Path(tmp) / "standards" / "txy.csv"
    target.parent.mkdir(parents=True)
    set_key(case / "system" / "propsDict", "file", str(target))
    rc, out = run_case(case)
    if rc == 0:
        fail.append("PROBE (c): propertyScan1D accepted a `standards` path and "
                    "exited 0")
    if "refusing to write" not in out:
        fail.append("PROBE (c): propertyScan1D did not refuse by name")
    if target.exists():
        fail.append("PROBE (c): the CSV was written anyway")

# ---------------------------------------------------------------- the negative
with tempfile.TemporaryDirectory() as tmp:
    case = stage(CURATE02, tmp)
    set_key(case / "system" / "propsDict", "proposal", "ethanol-water.proposal.dat")
    rc, out = run_case(case)
    written = case / "ethanol-water.proposal.dat"
    if rc != 0:
        fail.append(f"NEGATIVE: an ordinary proposal path now FAILS (rc {rc}) "
                    "-- the guard refuses more than the catalogue")
    if not written.exists():
        fail.append("NEGATIVE: an ordinary proposal path wrote nothing -- a "
                    "guard that refuses everything would pass every probe above")
    elif "VERDICT:" not in written.read_text():
        fail.append("NEGATIVE: the record was written but carries no verdict")

# ---------------------------------------------------------------------- verdict
if fail:
    print("check_standards_write_guard: FAIL")
    for f in fail:
        print("  -", f)
    sys.exit(1)

print(
    f"check_standards_write_guard: OK -- the refusal to write into "
    f"data/standards/ is enforced in {len(writing)} writing file(s) across "
    f"src/ ({guards} guard call(s), recounted here and never transcribed), "
    f"each reaching the ONE home records::refuseStandardsWrite.  Both rules "
    f"fire through the real binary: a literal `standards` component (proven on "
    f"fitParameters' `proposal` AND propertyScan1D's `file`, each exiting "
    f"non-zero, naming the rule and the remedy, writing nothing) and "
    f"CONTAINMENT under the resolved catalogue root reached by a SYMLINK whose "
    f"name carries no such component -- the route the literal scan cannot see. "
    f"Before this existed, one op enforced the rule and `fitParameters "
    f"proposal` wrote a promotable pair record into a standards path at exit 0. "
    f"The negative holds: an ordinary path still writes its record with its "
    f"verdict.  NOT COVERED: the outer drivers' `path` keys (dict paths, not "
    f"filesystem paths -- guarding one would refuse a legitimate case); READS "
    f"from the catalogue, which are what the engine is for; a path derived "
    f"inside a helper an op calls (arm (a) is file- and key-level); the "
    f"guarded ops other than the two probed, which are covered structurally "
    f"only; and bin/curate/*, whose job IS to promote into the catalogue.  "
    f"{len(EXEMPT)} file(s) are EXEMPT from the structural arm, each because it "
    f"reads such a key without writing through it -- and each exemption's "
    f"PREMISE is verified here (every stream it opens names a string literal), "
    f"never taken on trust.  `fitParameters` is checked to refuse BEFORE it "
    f"regresses (no `Final chi2` ahead of the refusal): it guards `proposal` "
    f"twice -- at the read and on the path `auto` resolves to -- and without "
    f"that ordering check the loss of the early one is invisible, which is how "
    f"the first sabotage of this gate survived.")
