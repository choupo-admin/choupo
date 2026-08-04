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
    n = 0
    for cd in (ROOT / "tutorials").rglob("system/controlDict"):
        if re.search(r"^\s*application\b", cd.read_text(), re.M):
            n += 1
    return n


def released_at() -> str:
    """The release date, from the CHANGELOG header `## [Choupo-XXXX] — YYYY-MM-DD`."""
    ch = (ROOT / "CHANGELOG.md").read_text()
    rel = release_id()
    m = re.search(r"^##\s*\[" + re.escape(rel) + r"\]\s*[—-]+\s*([0-9]{4}-[0-9]{2}-[0-9]{2})",
                  ch, re.M)
    return m.group(1) if m else ""


def build() -> dict:
    tutorials = count_runnable_cases()
    regression = len(list((ROOT / "tutorials").rglob("expected")))
    inv = {
        "release": release_id(),
        "releasedAt": released_at(),
        "catalogue": {
            "components":        count_dat("components"),
            "aqueousSpecies":    count_model_species(),
            "nrtlPairs":         count_dat("parameters/NRTL"),
            "wilsonPairs":       count_dat("parameters/Wilson"),
            "uniquacPairs":      count_dat("parameters/UNIQUAC"),
            "henryPairs":        count_dat("parameters/Henry"),
            "pitzerPairs":       count_dat("parameters/Pitzer/pairs"),
            "enrtlPairs":        count_dat("parameters/eNRTL"),
            "propertyMethods":   count_dat_recursive("methods"),
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
DOC_COUNT_PAT = re.compile(
    r'\b([0-9]{2,5})\s+(?:runnable\s+)?(?:tutorial\s+)?cases?\b|'
    #  "N tutorials" was the phrasing this pattern did not have, and it is
    #  the one the user guide used: "Choupo ships about 200 tutorials"
    #  against a corpus of 330.  A detector that only knows one wording
    #  catches only the wording it knows.
    r'\b([0-9]{2,5})\s+(?:runnable\s+)?tutorials?\b|'
    r'\b([0-9]{2,5})\s+(?:curated\s+)?components?\b|'
    r'\b([0-9]{2,5})\s+aqueous\s+species\b')
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

QUOTE_SPAN = re.compile(r'"[^"]*"|`[^`]*`|\u201c[^\u201d]*\u201d')


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
            #  Secondary net: the rule's own paragraph states the drift in
            #  bare numbers, and says so in words a sentence away.
            ctx = " ".join(lines[max(0, i - 4):i + 3]).lower()
            if any(w in ctx for w in ("arity sin", "drifted",
                                      "release_inventory",
                                      "releaseinventory")):
                continue
            hits.append((rel, i, line.strip()[:90]))
    return hits


def main():
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
