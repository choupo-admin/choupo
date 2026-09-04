#!/usr/bin/env python3
"""Gate: the origin census is RECOUNTED, at every depth, and the record says so.

    bin/curate/check_origin_census.py

WHY THIS EXISTS.  `docs/design/provenance-semantics-five-axes.md` scopes a
vocabulary migration -- which words may say HOW a number was produced -- and
its size decides whether that migration is a small mechanical sweep or a
campaign.  The record has now got that size wrong TWICE, the same way, one
nesting level apart, and its own text is the best statement of the failure:

    "Praising a form and never reading its values is how a census misses the
     largest population it was written to find."

  * The FIRST census counted the comment form (`origin=predictive`) and the
    scalar shorthand (`provenance measured;`) and missed the BLOCK form -- the
    very form the record had praised as already correct.  It was corrected the
    next day, in the record, with that lesson attached.
  * The CORRECTED census counted `origin` as a DIRECT child of `provenance {}`
    and missed the PER-VALUE blocks nested one level deeper --
    `provenance { MW { origin literature; } Tc { origin literature; } ... }` --
    which is the form `estimateComponent` writes and the form the Explorer's
    inspector was taught to read on 2026-09-03.

Measured on that day: 23 direct + 2184 per-value.  The record's stated scope
was "~95 values across 72 files ... a bounded, mechanical migration".

The largest population is the one that matters most: `literature`, which the
contract says is NOT AN ORIGIN AT ALL (it answers *where the value came from*
and belongs in `provenance`).  Restructuring that many declarations is not a
rename, and the records carrying them are ChemSep imports whose licence notes
travel with them.

WHAT THIS GATE CHECKS:

  (a) IT RECOUNTS, at both depths, over every `.dat` under data/standards/,
      with comments stripped, braces matched.  The count is never read from a
      document.

  (b) THE RECORD STATES THE CURRENT NUMBERS.  The five-axes record must carry a
      line of the form

          census: <D> direct + <P> per-value = <T> across <F> files

      and those four numbers must equal the recount.  This is the arity
      doctrine applied to the record's own arithmetic: the number has ONE home,
      it is derived, and a gate stands behind it.  A doc is not exempt.

  (c) NO NEW ORIGIN WORD APPEARS.  The vocabulary is enumerated below; a word
      outside it is either a typo or a decision nobody wrote down, and both
      should stop a run rather than be absorbed silently.

WHAT THIS GATE DOES **NOT** DO, stated so its OK line cannot imply it:

  * It does not perform, authorise or recommend the migration.  Whether
    `predictive` (356) and `estimated` (40) may collapse into the contract's
    single word `predicted` is a SCIENTIFIC CLASSIFICATION decision and is
    reserved: CLAUDE.md records their separation as deliberate (forum #67 --
    "a distinct class; collapsing it into `estimated` contradicted the
    resolution-priority ladder"), so the contract's five words and the engine's
    `core/Origin.H` enum genuinely disagree, and no gate may settle that.
  * It does not judge whether any individual mark is RIGHT for its value.
  * It reads `data/standards/` only.  `data/local/` is private and gitignored;
    `data/groupEstimative/` is the lake, whose own reform is a separate matter.

SABOTAGE-VERIFIED 2026-09-03, three times.

S1 -- a per-value `origin` added to a component record.  Arm (b) fires with
      both numbers, which is the whole point: the shallow count would not have
      moved.

S2 -- the record's census line edited to the old "~95".  Arm (b) fires naming
      the drift in both directions.

S3 -- `origin plausible;` written into a record.  Arm (c) fires naming the
      word and the file.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANDARDS = ROOT / "data" / "standards"
RECORD = ROOT / "docs" / "design" / "provenance-semantics-five-axes.md"

#  The words the tree uses today.  `core/Origin.H` accepts synonyms; this is the
#  set actually WRITTEN, and a new one must be a decision, not a surprise.
KNOWN = {"literature", "predictive", "estimated", "assumed", "measured",
         "standard", "regressed", "definition", "asserted", "placeholder",
         "experimental", "fitted", "predicted", "calculated"}


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def provenance_body(text):
    m = re.search(r"^\s*provenance\s*\n?\s*\{", text, re.M)
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


def split_levels(body):
    """(direct-level text, whole body) -- direct is the body with every nested
    block removed, so an `origin` at each depth is counted exactly once."""
    out, lvl = [], 0
    for ch in body:
        if ch == "{":
            lvl += 1
        elif ch == "}":
            lvl -= 1
        elif lvl == 0:
            out.append(ch)
    return "".join(out)


def main():
    if not STANDARDS.is_dir():
        print("check_origin_census: FAIL")
        print("  - data/standards/ is absent -- the gate cannot run, so it "
              "must not pass")
        return 1

    direct, per_value, unknown = {}, {}, []
    files = 0
    for p in sorted(STANDARDS.rglob("*.dat")):
        body = provenance_body(strip_comments(p.read_text(errors="ignore")))
        if body is None:
            continue
        files += 1
        top = split_levels(body)
        d = re.findall(r"^\s*origin\s+(\w+)\s*;", top, re.M)
        allw = re.findall(r"^\s*origin\s+(\w+)\s*;", body, re.M)
        for w in d:
            direct[w] = direct.get(w, 0) + 1
        nested = list(allw)
        for w in d:
            nested.remove(w)
        for w in nested:
            per_value[w] = per_value.get(w, 0) + 1
        for w in allw:
            if w not in KNOWN:
                unknown.append((p.relative_to(ROOT), w))

    D, P = sum(direct.values()), sum(per_value.values())
    T = D + P
    fails = []

    # ---- (c) no new word -------------------------------------------------
    for rel, w in unknown:
        fails.append("%s declares `origin %s;` -- not one of the words this "
                     "tree uses; a new origin is a decision somebody has to "
                     "write down, not a value a gate absorbs" % (rel, w))

    # ---- (b) the record states the current numbers ------------------------
    if not RECORD.exists():
        fails.append("%s is missing -- the census has no home to be stated in"
                     % RECORD.name)
    else:
        m = re.search(r"census:\s*(\d+)\s+direct\s*\+\s*(\d+)\s+per-value\s*=\s*"
                      r"(\d+)\s+across\s+(\d+)\s+files", RECORD.read_text())
        if not m:
            fails.append("%s carries no `census: <D> direct + <P> per-value = "
                         "<T> across <F> files` line.  The size of this "
                         "migration is the record's central claim and it must "
                         "be a DERIVED number with a gate behind it -- it has "
                         "been wrong twice, both times by counting at one depth"
                         % RECORD.name)
        else:
            said = tuple(int(x) for x in m.groups())
            got = (D, P, T, files)
            if said != got:
                fails.append("%s states `census: %d direct + %d per-value = %d "
                             "across %d files` and the recount is %d + %d = %d "
                             "across %d files" % (RECORD.name, *said, *got))

    if fails:
        print("check_origin_census: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    top_words = ", ".join(f"{w} {c}" for w, c in
                          sorted(per_value.items(), key=lambda kv: -kv[1])[:4])
    print("check_origin_census: OK -- recounted at BOTH depths over %d file(s) "
          "carrying a `provenance {}`: %d origin declaration(s) as direct "
          "children and %d nested one level deeper in per-value blocks (%d "
          "total; the largest are %s), and the five-axes record states exactly "
          "those numbers.  The record had this size wrong twice, each time by "
          "counting at one depth, and its own lesson is that praising a form "
          "and never reading its values is how a census misses the population "
          "it was written to find.  NOT DONE HERE: the migration itself -- "
          "whether `predictive` and `estimated` may collapse into one word is a "
          "scientific classification the contract and `core/Origin.H` disagree "
          "about, and is reserved; nor is any individual mark judged RIGHT for "
          "its value; nor is data/local/ or the groupEstimative lake read."
          % (files, D, P, T, top_words))
    return 0


if __name__ == "__main__":
    sys.exit(main())
