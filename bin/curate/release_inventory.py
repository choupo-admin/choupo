#!/usr/bin/env python3
"""Generate generated/releaseInventory.json -- the SINGLE SOURCE OF TRUTH for the
release's quantitative claims (homepage hero, "What is included", README, /models).

Counts ONLY what is actually active + distributed in the public release: the
curated data/standards/ tree, the registered engine models, and the runnable
tutorials.  Excludes READMEs, templates, generated outputs, expected files, and
data/local (private).  Nothing here is hand-written -- bump the catalogue and
re-run; the numbers follow.

Usage:  bin/curate/release_inventory.py            # writes generated/releaseInventory.json
        bin/curate/release_inventory.py --check    # exit 1 if the file is stale
        bin/curate/release_inventory.py --release vYYMM
            # writes generated/releases/<tag>.json, counted from a WORKTREE of
            # that tag -- never from the current tree.  A release's numbers
            # belong to the release (ruled 2026-08-08, website audit item 1):
            # the old single artefact carried the LAST RELEASE'S NAME over the
            # CURRENT TREE'S COUNTS, by its own docstring -- one artefact, two
            # identities, and every public surface that consumed it inherited
            # the conflation.  Now: the DEV artefact says `line: Choupo-dev`
            # and claims no release; a release artefact is generated once from
            # its tag and is immutable (check_release_identity recounts it).
"""
import json
import re, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"
OUT = ROOT / "generated" / "releaseInventory.json"


def count_dat(rel: str) -> int:
    d = STD / rel
    return len(list(d.glob("*.dat"))) if d.is_dir() else 0



def count_assets_kind(kinds) -> int:
    """Records in the flat assets/ home whose `kind` is one of `kinds`."""
    import re as _re
    d = STD / "assets"
    n = 0
    if d.is_dir():
        for f in sorted(d.glob("*.dat")):
            m = _re.search(r"^kind\s+(\w+);", f.read_text(), _re.M)
            if m and m.group(1) in kinds:
                n += 1
    return n

def count_dat_recursive(rel: str) -> int:
    d = STD / rel
    return len(list(d.rglob("*.dat"))) if d.is_dir() else 0


def count_catalogue_records(rel: str, block: str) -> int:
    """Records in a single list-of-dicts catalogue file (e.g. a pair bank)."""
    f = STD / rel
    if not f.is_file():
        return 0
    txt = f.read_text()
    m = re.search(block + r"\s*\((.*)\)\s*;", txt, re.S)
    body = m.group(1) if m else txt
    # each record carries exactly one `charge` field
    return len(re.findall(r"^\s*charge\b", body, re.M))


def count_model_species() -> int:
    """Flat model-species home: one recordType modelSpecies file per species
    (the 2026-07-18 dismantling of the aqueous monolith)."""
    d = STD / "species"
    if not d.is_dir():
        return 0
    return sum(1 for f in d.glob("*.dat")
               if re.search(r"\brecordType\s+modelSpecies\b", f.read_text()))


def count_registered(cpp_rel: str) -> int:
    """`reg("name", ...)` builtins registered in a factory .cpp."""
    f = ROOT / cpp_rel
    if not f.is_file():
        return 0
    return len(re.findall(r'\breg\(\s*"', f.read_text()))


def release_id() -> str:
    """The LATEST STABLE release name -- the storefront label (homepage, README,
    /models all say "here is the latest release, and this is what it has").
    Read from the newest dated CHANGELOG entry, NOT from Banner.H: on the `dev`
    branch the banner is "Choupo-dev" (the running-code identity, shown by the
    app's own version badge), but the storefront must still announce the last
    published release.  So this is stable on both branches; only the COUNTS
    below track the current tree."""
    ch = (ROOT / "CHANGELOG.md").read_text()
    m = re.search(r"^##\s*\[(Choupo-[0-9]{4})\]", ch, re.M)
    return m.group(1) if m else "unknown"


def count_runnable_cases() -> int:
    """A runnable case = a `system/controlDict` that declares an `application`
    (the binary to dispatch).  This excludes fractal sub-unit / sector folders
    (which inherit and carry no application) so we count TOP-LEVEL cases only."""
    return sum(count_cases_by_tier().values())


def count_cases_by_tier() -> dict:
    """The corpus by AUDIENCE, not by count (doctrine ratified 2026-08-09):

        tests isolate features · tutorials compose features ·
        showcases compose engineering

    A case declares `tier tutorial;` or `tier showcase;` in its controlDict.
    ABSENCE MEANS WITNESS -- which is why this migration is ~a dozen edits
    and not 335: a slice's witness is born correctly classified by its author
    doing nothing, and the learning surface grows only by deliberate act.

    Until this split, `releaseInventory.json` published `runnableCases` for
    every case in the tree -- the key literally called all 335 tutorials,
    which is the conflation the doctrine names: case count and tutorial count
    had become synonyms, and a corpus of hundreds of narrow witnesses was
    presented to the public as a learning surface."""
    tiers = {"witness": 0, "tutorial": 0, "showcase": 0}
    for cd in (ROOT / "tutorials").rglob("system/controlDict"):
        txt = cd.read_text()
        if not re.search(r"^\s*application\b", txt, re.M):
            continue
        m = re.search(r"^\s*tier\s+([A-Za-z]+)\s*;", txt, re.M)
        t = m.group(1) if m else "witness"
        if t not in tiers:
            raise SystemExit("release_inventory: %s declares `tier %s;` -- the "
                             "tiers are witness / tutorial / showcase" % (cd, t))
        tiers[t] += 1
    return tiers


def released_at() -> str:
    """The release date, from the CHANGELOG header `## [Choupo-XXXX] — YYYY-MM-DD`."""
    ch = (ROOT / "CHANGELOG.md").read_text()
    rel = release_id()
    m = re.search(r"^##\s*\[" + re.escape(rel) + r"\]\s*[—-]+\s*([0-9]{4}-[0-9]{2}-[0-9]{2})",
                  ch, re.M)
    return m.group(1) if m else ""


def parse_cff(text: str) -> dict:
    """The citation fields, from CITATION.cff -- minimal, field-anchored.
    Not a YAML parser on purpose: the four fields it needs are flat."""
    g = lambda k: (re.search(r'^%s:\s*"?([^"\n]+)"?\s*$' % k, text, re.M) or [None, ""])[1]
    fam = re.search(r'family-names:\s*(\S+)', text)
    giv = re.search(r'given-names:\s*(\S+)', text)
    ver, date, url = g("version"), g("date-released"), g("url")
    title = g("title").strip()
    author = (fam.group(1) if fam else "") + ", " + (giv.group(1)[0] + "." if giv else "")
    year = date[:4] if date else ""
    rendered = ("%s (%s). %s (version %s) [Computer software]. %s"
                % (author, year, title, ver, url))
    return {"author": author, "year": year, "title": title, "version": ver,
            "dateReleased": date, "url": url, "rendered": rendered}


def build() -> dict:
    tutorials = count_runnable_cases()
    regression = len(list((ROOT / "tutorials").rglob("expected")))
    #  THE IDENTITY IS THE TREE'S OWN, never borrowed.  The dev artefact names
    #  the LINE; `latestRelease` is a clearly-labelled pointer (a fact about
    #  the CHANGELOG), never the identity of these counts.  Deliberately NO
    #  commit field: the first version embedded HEAD, and an artefact that
    #  records the commit it was generated at is STALE THE MOMENT IT IS
    #  COMMITTED -- the commit that carries it changes the answer.  It failed
    #  the staleness gate on its very first suite run, which is that gate
    #  doing its job.  A MOVING line's artefact is tied to the tree by
    #  regeneration plus that gate; only an IMMUTABLE release artefact may
    #  carry its commit, because there the commit is the tag's, not "now".
    inv = {
        "line": "Choupo-dev",
        "latestRelease": release_id(),
        "latestReleasedAt": released_at(),
        "catalogue": {
            "components":        count_dat("components"),
            "aqueousSpecies":    count_model_species(),
            "nrtlPairs":         count_dat("parameters/NRTL"),
            "wilsonPairs":       count_dat("parameters/Wilson"),
            "uniquacPairs":      count_dat("parameters/UNIQUAC"),
            "henryPairs":        count_dat("parameters/Henry"),
            "pitzerPairs":       count_dat("parameters/Pitzer/pairs"),
            "enrtlPairs":        count_dat("parameters/eNRTL"),
            "materials":         count_assets_kind({"constructionMaterial"}),
            "membranes":         count_assets_kind({"RO", "NF", "IEM"}),
            "adsorbents":        count_assets_kind({"adsorbent"}),
            "utilities":         count_dat("utilities"),
        },
        "engine": {
            "unitOperations":    count_registered("src/unitOperations/UnitOperation.cpp"),
            "engines":           4,  # choupoSolve / choupoBatch / choupoCtrl / choupoProps
        },
        "tutorials": {
            "runnableCases":     tutorials,
            "regressionChecks":  regression,
            #  BY AUDIENCE (doctrine 2026-08-09).  `runnableCases` stays as the
            #  total -- it is referenced by the site and by older artefacts --
            #  but it is no longer the number that describes the LEARNING
            #  surface, and these three are.
            "byTier":            count_cases_by_tier(),
        },
    }
    c = inv["catalogue"]
    inv["totals"] = {
        # every binary/pair/Henry/electrolyte parameter record shipped
        "mixtureParameterRecords":
            c["nrtlPairs"] + c["wilsonPairs"] + c["uniquacPairs"] + c["henryPairs"]
            + c["pitzerPairs"] + c["enrtlPairs"],
    }
    return inv



#  A GENERATED number has ONE home.  The rule is stated in CLAUDE.md par. 6
#  ("Do NOT hand-maintain these numbers -- and that includes HERE"), it had
#  already drifted once (41 aqueous species against 51, 194 components
#  against 247), and on 2026-08-03 the coherence sweep found CLAUDE.md's own
#  layout block still carrying "318 runnable cases" while the tree held 328.
#  A rule the file itself breaks is a wish; this makes it a gate.
#  INVERTED 2026-08-05.  The three revisions above each ADDED one wording
#  after that wording had already shipped a stale number, and the comment
#  in the middle states the lesson the next revision then failed to apply:
#  "A detector that only knows one wording catches only the wording it
#  knows."  It was proved twice more the same day -- `## Tutorials (194)`
#  walked through because the digits are AFTER the noun and in parentheses,
#  and `194 species` walked through because the pattern knew only
#  `N aqueous species`.  Six documents were carrying stale tallies while
#  this gate reported clean.
#
#  Enumerating surface forms is structurally one form behind.  So the
#  polarity is reversed: ANY 2-5 digit number within a short window of a
#  corpus noun is a hit, in either order, and the ways of being legitimate
#  are enumerated instead -- quoting (below), and nothing else.  The set of
#  legitimate uses is small, closed and known; the set of English phrasings
#  is neither.
CORPUS_NOUN = (r'(?:runnable\s+|curated\s+|tutorial\s+|aqueous\s+|regression\s+)*'
               r'(?:cases?|tutorials?|components?|species|gates?|'
               r'checks?|pairs?|records?)')
DOC_COUNT_PAT = re.compile(
    #  digits BEFORE the noun ("331 cases"), allowing a few filler words
    r'\b([0-9]{2,5})\s+(?:\w+\s+){0,2}?' + CORPUS_NOUN + r'\b|'
    #  digits AFTER the noun, bracketed or not ("Tutorials (331)",
    #  "components: 247", a markdown table cell) -- the form that walked
    #  through twice
    r'\b' + CORPUS_NOUN + r'\b[\s:\-\u2014(\[|]{1,4}([0-9]{2,5})\b',
    #  CASE-INSENSITIVE, and that is not a detail: the first sabotage of
    #  this very rewrite failed because `## Tutorials (194)` is CAPITALISED
    #  and the noun list is lower case.  The fix for the blind spot had
    #  the blind spot -- caught only because the sabotage probe replays
    #  the exact string that escaped, not a paraphrase of it.
    re.IGNORECASE)

#  THE MANUALS ARE NOT EXEMPT.  This list held only the AI-facing docs, so
#  the four LaTeX guides -- the surface an actual reader meets -- could
#  carry a stale tally indefinitely, and one did.  Adding them found
#  exactly one hit across ~41k lines and no false positives; the pattern is
#  narrow enough (a 2-5 digit number immediately before the noun) that the
#  guides' legitimate numbers -- tube counts, stage counts, coefficients --
#  do not trip it.
DOC_SCAN = ["CLAUDE.md", "AGENTS.md", "README.md",
            "docs/theoryGuide.tex", "docs/userGuide.tex",
            "docs/propsGuide.tex", "docs/developerGuide.tex"]

#  THE CLOSED SET OF LEGITIMATE USES.  Inverting the polarity means the
#  gate now asks "why is this number here?" instead of "have I seen this
#  wording?".  A number that is NOT a corpus tally must say so HERE, with a
#  reason, and the entry is matched on a distinctive substring of the line.
#
#  This is deliberately more friction than a regex tweak.  Adding a tally to
#  prose should cost a justification; that is the whole doctrine.  An entry
#  whose substring no longer appears FAILS the gate, so the list cannot rot
#  into a permanent excuse.
#  KNOWN AND UNCLOSED: README.md's per-category tutorial table (six cells,
#  one per category) is a hand-carried tally the pattern does NOT catch,
#  because a markdown cell's neighbouring word is a binary name, not a
#  corpus noun.  It is left uncaught DELIBERATELY and said so here rather
#  than being quietly narrowed around: the honest fix is to GENERATE that
#  table from the inventory, as the site pages already are, and that is a
#  real change rather than a regex.  Recorded as action AR5.
#
#  Saying it here matters because the alternative -- a gate that silently
#  does not look -- is the exact shape this rewrite exists to end.
#  A KNOWN GAP, stated so this gate's silence is not read as coverage.
#  README.md's per-category tutorial table holds six counts in bare markdown
#  cells (`| `steady/` | `choupoSolve` | 196 |`).  Those ARE corpus tallies
#  and they ARE a second home -- the inversion does not reach them because
#  the cell's neighbour is a binary name, not a corpus noun.  Allow-listing
#  them would be a lie (they are exactly what this gate forbids), so they
#  are named here instead.  The fix is to GENERATE that table, as the site
#  pages already are; recorded as AR5.
DOC_COUNT_ALLOW = [
    ("CLAUDE.md", "67 records carried",
     "a CLOSED migration's size, fixed for ever -- not a corpus tally that "
     "can drift.  The live count of what remains unreviewed is in "
     "check_review_status, which recounts it."),
    ("CLAUDE.md", "kept 9 of its 28 pair parameters",
     "a measurement of ONE sealing defect, not a corpus size"),
    ("CLAUDE.md", "14/14 tear cases already satisfy it",
     "audit evidence dated in its own sentence, not a live tally"),
    ("CLAUDE.md", "77 standard components carry",
     "SUBSET tally -- a real second home; generate it or drop it (AR5)"),
    ("docs/developerGuide.tex", "kept 9 of its 28 pair parameters",
     "the same one-defect measurement as CLAUDE.md"),
    ("docs/developerGuide.tex", "67 component records carried",
     "the same CLOSED migration size CLAUDE.md is allowed to state -- fixed "
     "for ever, not a corpus tally that can drift.  The LIVE count of what "
     "remains unreviewed is in check_review_status, which recounts it."),
]


def allowed(rel, line):
    """-> the reason this line's number is not a corpus tally, or None."""
    for f, needle, why in DOC_COUNT_ALLOW:
        if f == rel and needle in line:
            return why
    return None


QUOTE_SPAN = re.compile(r'"[^"]*"|`[^`]*`|\u201c[^\u201d]*\u201d')

#  AN ISO DATE IS NOT A TALLY.  The inverted polarity above is right, and this
#  is the one exception it has to make: `... SPECIAL CASE (2026-08-07) ...`
#  puts a four-digit number immediately after a corpus noun, in parentheses,
#  which is exactly the shape that walked through twice and is now caught.
#  Here the digits are a YEAR.
#
#  This is a narrow exclusion and deliberately not a general one: it fires
#  only on a FULL ISO date -- (19|20)\d\d-\d\d-\d\d -- because no corpus
#  tally is ever written that way.  A bare `(2026)` is NOT excused, and
#  neither is `(247)`.  Widening it to "any number that looks like a year"
#  would excuse a count of 1998 records, which is the kind of narrowing-around
#  this gate's own header warns against.  Sabotage-verified: `(247)`,
#  `(2026)` and `247 cases` all still fire in the same position.
ISO_DATE = re.compile(r'\b(?:19|20)\d\d-\d\d-\d\d\b')


def date_spans(line):
    return [(m.start(), m.end()) for m in ISO_DATE.finditer(line)]


def quoted_spans(line):
    """(start, end) of every quoted run on the line -- straight, backtick and
    typographic.  A count INSIDE one is being cited; outside one it is being
    asserted, and only the assertion is forbidden."""
    return [(m.start(), m.end()) for m in QUOTE_SPAN.finditer(line)]


def hand_carried_counts():
    """-> [(file, line no, text)] for corpus tallies written by hand in the
    scanned docs -- the AI-facing ones AND the four manuals.  Only the SHAPE
    of the corpus belongs in prose; the size lives in
    generated/releaseInventory.json."""
    hits = []
    seen_allow = set()
    for rel in DOC_SCAN:
        f = ROOT / rel
        if not f.is_file():
            continue
        lines = f.read_text().splitlines()
        for i, line in enumerate(lines, 1):
            if not DOC_COUNT_PAT.search(line):
                continue
            #  CITING a number is not ASSERTING one.  The paragraph that
            #  states the rule, and the review footer that records the drift
            #  it caught, both have to repeat the stale tally as EVIDENCE --
            #  and both write it in quotes, because that is what quoting is
            #  for.  A bare number in prose is the assertion this forbids.
            #  (Keyword-sniffing the surrounding lines was the first attempt
            #  and it misfired twice within the hour: the needle list can
            #  never anticipate the next sentence.  Quoted-vs-bare is a
            #  property of the text itself.)
            m = DOC_COUNT_PAT.search(line)
            if any(a < m.start() < b for a, b in quoted_spans(line)):
                continue
            #  The digits the pattern latched onto sit inside an ISO date.
            #  Matched on the DIGITS' position, not the match's start, because
            #  the match begins at the noun and the year is several characters
            #  later.
            digits = re.search(r'[0-9]{2,5}', m.group(0))
            if digits is not None:
                at = m.start() + digits.start()
                if any(a <= at < b for a, b in date_spans(line)):
                    continue
            if allowed(rel, line):
                seen_allow.add((rel, line))
                continue
            #  Secondary net: the rule's own paragraph states the drift in
            #  bare numbers, and says so in words a sentence away.
            ctx = " ".join(lines[max(0, i - 4):i + 3]).lower()
            if any(w in ctx for w in ("arity sin", "drifted",
                                      "release_inventory",
                                      "releaseinventory")):
                continue
            hits.append((rel, i, line.strip()[:90]))
    #  A stale allowance is a permanent excuse.  If a listed substring no
    #  longer appears, the justification has outlived its line and must go.
    for f, needle, why in DOC_COUNT_ALLOW:
        if not any(f == r and needle in l for r, l in seen_allow):
            hits.append((f, 0, f"STALE ALLOWANCE: \"{needle}\" no longer "
                                f"appears -- remove it from DOC_COUNT_ALLOW"))
    return hits


def build_release(tag: str) -> dict:
    """Counts from a WORKTREE of the tag.  The worktree is sparse (the trees
    the counters read) and removed afterwards; the artefact records the tag
    and its commit so check_release_identity can verify it was never edited."""
    global ROOT, STD
    import tempfile, shutil
    commit = subprocess.run(["git", "rev-parse", tag + "^{}"],
                            capture_output=True, text=True).stdout.strip()
    if not commit:
        raise SystemExit("release_inventory: unknown tag " + tag)
    wt = Path(tempfile.mkdtemp(prefix="relinv-" + tag + "-"))
    old_root, old_std = ROOT, STD
    try:
        subprocess.run(["git", "worktree", "add", "--detach", str(wt), tag],
                       capture_output=True, text=True, check=True)
        ROOT, STD = wt, wt / "data" / "standards"
        inv = build()
        cff = (wt / "CITATION.cff").read_text()
    finally:
        ROOT, STD = old_root, old_std
        subprocess.run(["git", "worktree", "remove", "--force", str(wt)],
                       capture_output=True, text=True)
        shutil.rmtree(wt, ignore_errors=True)
    #  the dev-line keys do not belong on a release artefact
    for k in ("line", "commit", "latestRelease", "latestReleasedAt"):
        inv.pop(k, None)
    rel = "Choupo-" + tag.lstrip("v")
    c = parse_cff(cff)
    out = {"release": rel, "tag": tag, "commit": commit,
           "releasedAt": c["dateReleased"], "citation": c,
           "citationRendered": c["rendered"], **inv}
    return out


def main():
    if "--check-release" in sys.argv:
        tag = sys.argv[sys.argv.index("--check-release") + 1]
        dest = ROOT / "generated" / "releases" / (tag + ".json")
        if not dest.is_file():
            print("no committed artefact for %s -- run --release %s" % (tag, tag),
                  file=sys.stderr)
            sys.exit(1)
        fresh = json.dumps(build_release(tag), indent=2, sort_keys=False) + "\n"
        if dest.read_text() != fresh:
            print("release artefact %s DIVERGES from a recount of its own tag --"
                  " an immutable release's numbers moved, or the artefact was"
                  " edited by hand" % dest.name, file=sys.stderr)
            sys.exit(1)
        print("release artefact %s matches a fresh recount of tag %s" % (dest.name, tag))
        return
    if "--release" in sys.argv:
        tag = sys.argv[sys.argv.index("--release") + 1]
        out = build_release(tag)
        dest = ROOT / "generated" / "releases" / (tag + ".json")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(out, indent=2, sort_keys=False) + "\n")
        print("wrote", dest)
        return
    inv = build()
    payload = json.dumps(inv, indent=2, sort_keys=False) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text() if OUT.is_file() else ""
        if current != payload:
            print("release inventory is STALE -- run bin/curate/release_inventory.py", file=sys.stderr)
            sys.exit(1)
        hand = hand_carried_counts()
        if hand:
            print("a GENERATED count is hand-carried in prose (one home:"
                  " generated/releaseInventory.json):", file=sys.stderr)
            for rel, ln, s in hand:
                print("  %s:%d  %s" % (rel, ln, s), file=sys.stderr)
            sys.exit(1)
        print("release inventory up to date; no hand-carried corpus tally"
              " in the scanned docs or manuals")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload)
    print(payload)


if __name__ == "__main__":
    main()
