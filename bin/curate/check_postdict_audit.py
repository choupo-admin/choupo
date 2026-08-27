#!/usr/bin/env python3
"""Gate: a key nobody read in postDict is announced, and the auditor does not consult its subject.

    bin/curate/check_postdict_audit.py

WHY THIS EXISTS.  `src/core/DictAudit` was built on 2026-08-14 because
`murphreeEficiency` parsed cleanly, was never read, and the column ran
ideal-tray -- exit 0, not a word.  It was wired at exactly ONE site: each
unit's `operation {}` sub-dict.

`postDict` was outside it, and on 2026-08-27 that cost a capital cost.  A
`costing {}` block declaring `targetYearCEPCI 800;` priced a plant at the
DEFAULT index of 820: 2.5 % of the total module cost, silent, on a number the
author believed they had set.  The student defends a figure computed at an
index they did not choose.

`postDict` is a PURE parameter file -- every key in it belongs to the pass
named immediately above it, and there is no other reader -- so the scope
argument that keeps this pass off the case file at large does not apply.

WHAT THIS GATE CHECKS, by building probe cases and running the real binary:

  (a) A MISSPELLED KEY IN A TOP-LEVEL PASS BLOCK IS ANNOUNCED, naming the
      block (`postDict costing`) and the key as the author spelled it.

  (b) THE MENU IS PRINTED where edit distance has nothing to say.
      `targetYearCEPCI` is not a misspelling of `cepci`; it is a different
      word, and no distance threshold should ever connect them.  A bare "this
      key did nothing" leaves the author with a complaint and no move, so the
      finding lists the keys the block's reader asked for and did not find.
      Checked to name `cepci` specifically -- the one that was actually meant.

  (c) THE MENU IS PRINTED ONCE PER BLOCK, not once per key.  The list is a
      property of the block's reader; repeating it per finding is the same
      fact on screen twice.

  (d) A NEAR MISS STILL GETS THE SUGGESTION, and NOT the menu.  The 2026-08-14
      mechanism must survive: `cepcii` -> "did you mean `cepci`?".  If the
      menu displaced the suggestion, the gate's own remedy would have got
      worse in the name of improving it.

  (e) NESTED REACH.  An unknown key inside `sizing units[0].designRules {}` is
      found, and its dotted path names the block the author can find in their
      own file.  This is the level where a silent default actually changes a
      dimension.

  (f1) AN UNREAD BLOCK IS REPORTED AND NOT DESCENDED INTO.  An EXTRA block
      in a unit entry produces ONE line about the block, not several about its
      keys: "the whole block did nothing" is the true statement, and listing
      its keys would bury it while implying several separate mistakes.

      The probe uses an EXTRA block rather than a misspelled one on purpose:
      `designRules` is REQUIRED, so misspelling it throws before the audit
      runs.  A branch whose only live case cannot occur is a branch nothing
      tests -- so the case is built here rather than assumed.

  (f2) A MISSPELLED REQUIRED BLOCK REFUSES, AND THE REFUSAL NAMES THE NEAR
      MISS.  `missing sub-dictionary 'designRules'` was true and silent about
      the `designRuls` sitting in the same dict: the evidence was in hand and
      unread.  Every missing-key failure in Dictionary now lists what the dict
      declares and points at the closest name.

  (g) THE AUDITOR DOES NOT CONSULT ITS SUBJECT.  `childDictsUnnoted()` reads
      `entries_` directly and must never be rewritten in terms of `subDict()`
      / `lookupDictList()`, which call `note()`.  An auditor that marked every
      block it visited as read on the way in would then report that nothing
      was unread -- a check that erases its own subject.

      MEASURED, and the honest version is narrower than the obvious claim:
      with the walk rewritten to use `subDict()` (sabotage S2), arm (f1) does
      NOT fire and (g) is the ONLY arm that catches it.  `auditTree` audits a
      dict BEFORE descending into its children, so a finding at a given level
      is already recorded by the time the descent could note anything -- the
      defect is real but LATENT under the current ordering.  (g) is therefore
      a guard against that ordering changing, not a second view of a live
      bug, and saying otherwise would credit it with coverage it has not got.

  (h) THE NEGATIVE.  A correct postDict produces NO `[dict]` line for
      postDict.  A gate whose positive arms all fire on a mechanism that
      always fires proves nothing.

  (i) THE COSTING NUMBER IS UNMOVED by the audit.  An announcement that
      changes an answer is not an announcement.

SABOTAGE-VERIFIED 2026-08-27, five times; every quoted line is OBSERVED.

S1 -- the `dictAudit::report(auditTree(...))` call removed from main.cpp.
Arms (a), (b), (d), (e) and (f1) all fail; the negative still passes, which
is the point of having it.

S2 -- `childDictsUnnoted()` rewritten to walk via `subDict()`.  ONLY arm (g)
fires; see (g) above for why, and for what that means about its reach.

S3 -- `f.lookedFor = absent` deleted, so a key with no near miss gets a bare
complaint again.  Arm (b).

S4 -- the `if (unreadHere.count(head)) continue;` guard deleted, so the
auditor descends into unread blocks.  Arm (f1), reporting 2 keys of a block
whose one true finding is the block.

S5 -- `missingKeyHint_(key)` dropped from `subDict()`'s throw.  Arm (f2),
both halves: no near miss named and no list of what the dict declares.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * Only `choupoSolve` is wired.  `choupoBatch`, `choupoCtrl` and
    `choupoProps` dicts are NOT audited by this slice, and this gate does not
    check them.
  * `solverDict` and `outerDict` are parameter files of the same kind and are
    STILL outside the audit.  They are the obvious next candidates; nothing
    here measures or protects them.
  * The audit answers "did anybody read this?", never "did the INTENDED
    reader read this?".  A key written in the wrong block but read by another
    passes both the audit and this gate.
  * It ANNOUNCES; it does not refuse.  Nothing here asserts a run fails.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"
DICT_H = ROOT / "src/core/Dictionary.H"
DICT_CPP = ROOT / "src/core/Dictionary.cpp"
BIN = ROOT / "choupoSolve"

fails = []


def run(case_dir):
    p = subprocess.run([str(BIN), str(case_dir)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=300)
    return p.stdout + p.stderr


def make_probe(tmp, post_text):
    d = Path(tmp) / "probe"
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(CASE, d)
    (d / "system" / "postDict").write_text(post_text)
    return d


GOOD_POST = """\
sizing
{
    units
    (
        {
            unitName    reactor;
            type        stirredTank;
            material    SS316;
            designRules
            {
                L_over_D        2.5;
                pressureDesign  3.0;
                corrosionAllow  0.003;
                jointEfficiency 1.0;
            }
        }
    );
}

costing
{
    method  Guthrie;
    cepci   820;
}
"""


def dict_lines(out):
    return [l for l in out.splitlines() if l.startswith("[dict]")]


def main():
    if not BIN.exists():
        print("check_postdict_audit: FAIL -- choupoSolve missing; run `make all`")
        return 1

    tmp = tempfile.mkdtemp(prefix="postdict_audit_")
    try:
        # ---- (h) the negative, first: the mechanism must be able to be quiet
        d = make_probe(tmp, GOOD_POST)
        out_good = run(d)
        if dict_lines(out_good):
            fails.append("NEGATIVE: a correct postDict produced [dict] findings:\n    "
                         + "\n    ".join(dict_lines(out_good)))
        m = re.search(r"C_total_mod|TOTALS", out_good)
        if not m:
            fails.append("NEGATIVE: the probe did not cost anything -- the "
                         "positive arms would then prove nothing about postDict")
        good_total = None
        for l in out_good.splitlines():
            if l.strip().startswith("TOTALS"):
                good_total = l.split()[-1]

        # ---- (a)(b)(c) the real defect: a different word, not a typo
        d = make_probe(tmp, GOOD_POST.replace("cepci   820;",
                                              "targetYearCEPCI  800.0;"))
        out = run(d)
        L = dict_lines(out)
        blob = "\n".join(L)
        if not re.search(r"postDict costing: `targetYearCEPCI`", blob):
            fails.append("(a) the unread `targetYearCEPCI` was not announced "
                         "naming its block:\n    " + blob)
        menus = [l for l in L if "looked for and did not find" in l]
        if not menus:
            fails.append("(b) no menu printed for a key with no near miss -- "
                         "the author is left with a complaint and no move")
        elif " cepci" not in menus[0]:
            fails.append("(b) the menu does not name `cepci`, which is the key "
                         "actually meant:\n    " + menus[0])
        if len(menus) > 1:
            fails.append(f"(c) the menu printed {len(menus)} times; it is a "
                         "property of the block, so once per block")

        # ---- (d) a near miss keeps the 2026-08-14 suggestion, and gets NO menu
        d = make_probe(tmp, GOOD_POST.replace("cepci   820;", "cepcii  820.0;"))
        out = run(d)
        L = dict_lines(out)
        blob = "\n".join(L)
        if "did you mean `cepci`?" not in blob:
            fails.append("(d) a near miss lost its suggestion -- the older "
                         "mechanism regressed:\n    " + blob)
        if any("looked for and did not find" in l for l in L):
            fails.append("(d) the menu displaced the suggestion on a near "
                         "miss; the precise answer must win over the list")

        # ---- (e) nested reach, with the dotted path
        d = make_probe(tmp, GOOD_POST.replace("L_over_D        2.5;",
                                              "L_over_DD       2.5;"))
        out = run(d)
        blob = "\n".join(dict_lines(out))
        if "designRules" not in blob or "L_over_DD" not in blob:
            fails.append("(e) an unread key inside units[0].designRules was "
                         "not found or not path-named:\n    " + blob)
        if "units[0]" not in blob:
            fails.append("(e) the finding does not index the list member, so "
                         "a multi-unit sizing block cannot be located:\n    " + blob)

        # ---- (f1) an unread BLOCK is one line, not several
        #  A block in the WRONG PLACE is the live case: `designRules` is
        #  required, so MISSPELLING it refuses (see f2) and never reaches the
        #  audit.  An EXTRA block does reach it, and is the shape the
        #  not-descended-into branch exists for.
        d = make_probe(tmp, GOOD_POST.replace(
            "            designRules\n",
            "            notes\n            {\n                author  me;\n"
            "                L_over_D  99.0;\n            }\n"
            "            designRules\n"))
        out = run(d)
        L = dict_lines(out)
        blob = "\n".join(L)
        if "notes" not in blob:
            fails.append("(f1) an extra sub-BLOCK nobody reads was not "
                         "reported -- this is the arm childDictsUnnoted() "
                         "exists for:\n    " + blob)
        inner = [l for l in L if re.search(r"`(author|L_over_D)`", l)]
        if inner:
            fails.append("(f1) the auditor descended into an unread block and "
                         f"reported {len(inner)} of its keys; the block itself "
                         "is the one true finding:\n    " + "\n    ".join(inner))

        # ---- (f2) a misspelled REQUIRED block refuses, and names the near miss
        #  This never reaches the audit: `subDict("designRules")` throws
        #  first.  It used to throw the bare "missing sub-dictionary
        #  'designRules'" -- true, and silent about the `designRuls` sitting
        #  in the same dict.  The evidence was in hand and unread.
        d = make_probe(tmp, GOOD_POST.replace("            designRules\n",
                                              "            designRuls\n"))
        out = run(d)
        if "missing sub-dictionary 'designRules'" not in out:
            fails.append("(f2) a misspelled required sub-block no longer "
                         "refuses at all")
        if "Did you mean `designRuls`?" not in out:
            fails.append("(f2) the refusal does not name the near miss "
                         "sitting in the same dict; the author is told a key "
                         "is absent and not that theirs is one letter off")
        if "This dict declares:" not in out:
            fails.append("(f2) the refusal does not list what the dict DOES "
                         "declare")

        # ---- (g) the mechanism, read from the source
        h = DICT_H.read_text()
        c = DICT_CPP.read_text()
        if "childDictsUnnoted" not in h:
            fails.append("(g) Dictionary::childDictsUnnoted() is gone")
        body = re.search(r"Dictionary::childDictsUnnoted\(.*?\n\{(.*?)\n\}",
                         c, re.S)
        if not body:
            fails.append("(g) childDictsUnnoted() has no readable body in "
                         "Dictionary.cpp")
        else:
            #  STRIP COMMENTS FIRST.  The first version of this arm read
            #  the body's own comment -- "no note() anywhere" -- as a CALL to
            #  note(), and reported the defect it was written to rule out.  A
            #  source-reading gate that does not strip comments reads prose as
            #  code, and its finding is about English, not C++.
            b = re.sub(r"/\*.*?\*/", "", body.group(1), flags=re.S)
            b = re.sub(r"//[^\n]*", "", b)
            for banned in ("subDict(", "lookupDictList(", "note("):
                if banned in b:
                    fails.append(
                        f"(g) childDictsUnnoted() calls `{banned}` -- that "
                        "marks every block it visits as READ, so the auditor "
                        "would erase its own subject and report nothing "
                        "unread")
            if "entries_" not in b:
                fails.append("(g) childDictsUnnoted() no longer reads entries_ "
                             "directly; it must not go through a noting lookup")

        # ---- (i) the announcement changed no number
        d = make_probe(tmp, GOOD_POST.replace("cepci   820;",
                                              "cepci   820;\n    spurious 1;"))
        out = run(d)
        total = None
        for l in out.splitlines():
            if l.strip().startswith("TOTALS"):
                total = l.split()[-1]
        if good_total is not None and total != good_total:
            fails.append(f"(i) an extra unread key moved the cost: "
                         f"{good_total} -> {total}.  An announcement that "
                         "changes an answer is not an announcement")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_postdict_audit: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_postdict_audit: OK -- postDict is audited: an unread key is "
          "announced with its block, a key with no near miss gets the menu of "
          "names its reader asked for (once per block), a near miss keeps its "
          "suggestion, nested designRules is reached with an indexed path, an "
          "unread BLOCK is one finding and is not descended into, a "
          "misspelled REQUIRED block refuses naming the near miss sitting in "
          "its own dict, childDictsUnnoted() reads entries_ without noting, a correct "
          "postDict is silent, and no cost moved.  NOT covered: choupoBatch / "
          "choupoCtrl / choupoProps dicts, solverDict and outerDict (still "
          "unaudited), whether the INTENDED reader read a key, and refusal "
          "(this announces only).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
