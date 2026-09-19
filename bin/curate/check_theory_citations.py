#!/usr/bin/env python3
"""Gate: the Theory Guide's bibliographic debt is VISIBLE and RATCHETS DOWN.

    bin/curate/check_theory_citations.py           # the gate
    bin/curate/check_theory_citations.py --seed    # re-measure the pin lists

WHY THIS EXISTS.  Pedro Mendes, co-author and curator of the guides, reviewed
the `Choupo-2608` Theory Guide and raised one Major point: *"falta de
referencias bibliograficas.  No espirito glass-box, acho que todas as
equacoes, hipoteses fisico-quimicas e dados deviam ser referenciados
sistematicamente.  Na versao atual, acontece esporadicamente."*

He is right, and this project already enforces exactly that EVERYWHERE ELSE.
A data record cites a primary source per value (`check_source_licence`,
`check_species_citation`).  A correlation is an OBJECT carrying a citation, a
validity window and a verification anchor -- *a correlation whose source is a
comment is one the reader cannot check*.  Every EduTool lesson symbol needs a
mechanically verified `file:line` citation into the engine
(`check_lesson_symbols`, waiver dict kept EMPTY).  The manuals had no
equivalent, and a manual is the one artefact with no compiler behind it.

THE SHAPE OF THE DEBT DECIDED THE SHAPE OF THE GATE.  Measured on
`docs/theoryGuide.tex`: 534 numbered equation environments across 92 numbered
sections, of which 81 carry at least one -- and on 2026-09-19, before any of
this, 58 of those 81 cited NOTHING AT ALL, while the four most-cited chapters
held most of the manual's scholarship.  So the debt is CONCENTRATED, not
uniform, and the task is a per-CHAPTER list rather than a per-equation sweep.

PER CHAPTER, AND NEVER PER EQUATION.  Nothing mechanical can separate an
equation that NEEDS a citation (a correlation) from one that does not (a
derivation step, a definition, a restatement of the first law).  A
per-equation arm would accuse the innocent, and *a gate that accuses the
innocent teaches the reader to ignore it* (2026-09-04).

THE TRAP THIS GATE WAS WARNED ABOUT BEFORE IT WAS WRITTEN, and it is the
project's own recurring one -- *a pattern anchored where its subject does not
live is a check that cannot fire* (the 2026-09-03 dossier-grammar slice).  A
`\\cite{...}` in this manual SPANS LINES:

    Langmuir--Hinshelwood--Hougen--Watson (LHHW) form \\cite{Langmuir1918,
    Hinshelwood1940, HougenWatson1943}.

opens on line 13760 and closes on 13761.  A line-anchored scan reports three
FALSE orphans on a clean guide.  Every scan here reads the file as ONE STRING
with DOTALL, and strips whitespace inside the braces (`\\cite{A, B}` renders
correctly -- LaTeX trims it -- and must not be reported).

THE FOUR ARMS

  C1  CHAPTER COVERAGE, RATCHETING.  A numbered `\\section` carrying at least
      one numbered equation environment must carry at least one `\\cite`.
      The failures are PINNED in KNOWN_UNCITED, measured by `--seed` and never
      typed, and the ratchet is two-sided in the `check_energy_closure` shape:
        * an unpinned chapter with equations and no citation FAILS (the debt
          grew, or a new chapter arrived owing one);
        * a PINNED chapter that now cites FAILS, asking for its pin back (a
          debt that closes must leave the ledger, or the ledger stops being a
          measurement);
        * a PINNED chapter that no longer exists FAILS (a stale pin is a claim
          about the guide that stopped being true).

  C2  NO DANGLING, NO ORPHAN.  Every `\\cite` key resolves to a `\\bibitem`
      (LaTeX renders a miss as a bare `[?]` and reports it only as a warning
      nothing reads), and every `\\bibitem` is cited by the body.  The
      dangling half is a hard refusal.  The orphan half is PINNED
      (KNOWN_ORPHAN, empty today) because deleting a curated reference is the
      authors' act and not a gate's -- but a NEW orphan fails, so an entry
      cannot be added and left pointing at nothing.

  C3  THE ENGINE'S OWN CITATIONS REACH THE GUIDE.  Measured before this gate
      was written: of 47 sampled works the engine carries, 27 were absent from
      the bibliography and 22 of those were NAMED IN THE GUIDE'S OWN PROSE
      while `src/` held the full reference.  For half the sample the citation
      was a MOVE, not a search.  So: a surname the engine cites in the
      project's own citation FORM -- `Surname, A. B. (YYYY)`, which is what
      `citation()` strings and header reference blocks use -- and which the
      guide's prose NAMES, must appear in some `\\bibitem`'s text.  Pinned in
      KNOWN_UNCARRIED, same two-sided ratchet.

  C4  A REGISTERED MODEL NAMED AFTER SOMEBODY HAS A SOURCE.  A model key
      registered in a factory (`reg("...")` / `registerType("...")`) that
      contains one of C3's engine-cited surnames, and that the guide names
      ANYWHERE -- including inside a `\\code{}` or a listing, which C3's prose
      scan does not reach -- must resolve to a `\\bibitem` naming that
      surname.  Pinned in KNOWN_UNSOURCED, same ratchet.  This is the arm that
      reaches a model the guide teaches only by its key.

WHAT THIS GATE CANNOT SEE, and it must say so on its own claim line because a
claim that implies more than it checks is the defect this project keeps paying
for:

  * WHETHER A CITATION IS TRUE OF THE EQUATION BESIDE IT.  A `\\cite` in a
    chapter proves the chapter cites something, not that it cites the right
    thing.  No gate here can read a paper.  This is exactly the limit
    `check_lesson_symbols` lives with, and why that gate verifies `file:line`
    into the ENGINE rather than into the literature.
  * WHETHER AN EQUATION NEEDS ONE.  See PER CHAPTER above.
  * THE HYPOTHESES.  Pedro's words were *hipoteses fisico-quimicas*.  A stated
    modelling assumption is prose; nothing here sees one.  That half of his
    point is NOT addressed by this gate and is not claimed to be.
  * THE 566 EQUATION TAGS INDIVIDUALLY.  C1 counts ENVIRONMENTS per chapter.
    It has no model of which tag belongs to which claim.
  * THE OTHER SEVEN GUIDES.  They contain zero `\\bibitem` and zero `\\cite`,
    which is a different finding and not this gate's.
  * WHETHER A SURNAME IN PROSE IS THE SAME PERSON as the surname in a `src/`
    comment.  C3 matches a word, not an identity.
  * THE FIRST AUTHOR OF A MULTI-AUTHOR CITATION.  C3's pattern anchors on
    the author ADJACENT TO THE YEAR, so `Chung, T.-H., ... and Starling,
    K. E. (1988)` yields STARLING.  Measured over src/ on 2026-09-19 the
    form yields 25 surnames with no false positive; a looser bare
    surname+year matcher yields junk such as `Coefficients 2012` and would
    accuse the innocent.  The arm is a FLOOR on the engine's citations
    reaching the guide, never a census of them.
  * A SURNAME NAMED ONLY INSIDE ANOTHER ENTRY'S PROSE satisfies C3 and C4:
    the test is that the bibliography NAMES the work somewhere, not that the
    work has an entry of its own.

SABOTAGES, all by hand, tree restored byte-identical after each (`git status`
clean, verified).  TWO DID NOT DO WHAT WAS PREDICTED and are recorded as
measured, because a sabotage list that records only its successes is a claim
about the author rather than about the gate.

  S1  strip every `\cite` from a chapter NOT pinned (ch:viscosity)
      -> C1 FAILS naming the chapter; C2 additionally fails on the six entries
      that chapter was the only citer of.                              caught
  S2  add a `\cite` to a PINNED chapter (ch:ideal-mixing)
      -> C1 FAILS asking for the pin back.                             caught
      FIRST ATTEMPT SURVIVED: the `\cite` went on the line ABOVE
      `\section{Ideal mixing}`, which belongs to the PREVIOUS chapter.  The
      gate was right and the sabotage was wrong -- a section's span starts at
      its own `\section`, and a probe placed one line early tests nothing.
  S3  rename a pinned chapter's `\label`
      -> C1 FAILS TWICE: on the now-unpinned chapter AND on the stale pin.
      PREDICTED one failure, measured two, which is right and is why the two
      halves carry different messages.                                 caught
  S4  point a `\cite` at a key with no `\bibitem`
      -> C2 FAILS dangling, key named (plus orphan on the abandoned entry).
                                                                       caught
  S5  append a `\bibitem` nothing cites -> C2 FAILS on the new orphan. caught
  S6  delete the multi-line `\cite{Langmuir1918,\n Hinshelwood1940,
      HougenWatson1943}` -> C2 reports those three as orphans.         caught
      THIS IS THE SABOTAGE THAT PROVES THE DOTALL READ, AND IT NEEDS ITS
      CONTROL: the same three keys are reported as orphans by a LINE-ANCHORED
      scan of the UNSABOTAGED tree.  A line-anchored arm would therefore have
      been crying wolf from the day it was written, and its true positive
      here would be indistinguishable from its three standing false ones.
  S7  delete the `Chung1988` entry; and again with every `Chung` scrubbed out
      of the bibliography
      -> C2 FAILS dangling.  PREDICTED C2 + C3 + C4; MEASURED C2 ALONE, and
      the reason is a real property of C3 worth stating rather than patching:
      the engine's citation form is `Chung, T.-H., Ajlan, M., Lee, L. L. and
      Starling, K. E. (1988)`, and the pattern anchors on the author ADJACENT
      TO THE YEAR -- so the surname C3 carries for that work is STARLING, not
      Chung.  See the blind-spot list.
  S8  disarm C3 and C4 by making the engine-citation pattern unmatchable
      -> the gate PASSES and its CLAIM LINE reads "0 of 0 engine-cited
      surnames" and "0 registered eponymous model keys".  Deliberate: what a
      disarmed arm owes the reader is a VISIBLY EMPTY claim, never a false
      full one (the `check_wasm_dialect` S2 lesson).  The counts sit on the
      claim line for exactly this reason.
  S9  delete the `Nusselt1916` entry and its citation, leaving the engine's
      reference and the registered `NusseltFilm` key in place
      -> C3 FAILS (Nusselt) AND C4 FAILS (`NusseltFilm (Nusselt)`).    caught

DOMAIN.  One file, `docs/theoryGuide.tex` -- the only source in `docs/` that
carries a bibliography at all (the other seven guides have none).  Plus
`src/**/*.H` and `src/**/*.cpp` for C3's surnames and C4's registered keys.
Nothing outside those is read, and nothing is written.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "theoryGuide.tex"
SRC = ROOT / "src"

BEGIN = "\\begin{thebibliography}"
END = "\\end{thebibliography}"

#  An equation environment that LaTeX numbers.  `equation*`/`align*` are
#  excluded by the closing brace: the pattern requires `}` right after.
EQ_ENV = re.compile(r'\\begin\{(equation|align|gather|multline|eqnarray)\}')

#  Read as ONE STRING with DOTALL -- see THE TRAP above.
CITE = re.compile(r'\\cite\{([^}]*)\}', re.S)
BIBITEM = re.compile(r'\\bibitem\{([^}]*)\}')

#  A numbered section, or a starred one (which ENDS the previous section's
#  span without owning equations of its own).
SECTION = re.compile(r'^[ \t]*\\section(\*?)\{', re.M)

#  The project's own citation FORM, as it appears in `citation()` strings and
#  header reference blocks: `Surname, A. B. (YYYY)`, with room for a lowercase
#  nobiliary particle (`Andrade, E. N. da C. (1930)`) and for a co-author run
#  before the year.  Measured over src/ on 2026-09-19: 25 surnames, no false
#  positive.  A looser bare surname+year matcher produces junk such as
#  "Coefficients 2012" and would accuse the innocent.
ENGINE_CITE = re.compile(
    r'\b([A-Z][a-zA-Z\'\-]{3,})\s*,\s*(?:[A-Z]\.\s*)+'
    r'(?:[a-z]{2,4}\s+[A-Z]\.\s*)?(?:and\s+[^()]{0,60})?\((\d{4})\)')

REGISTERED = re.compile(r'(?:registerType|reg)\("([A-Za-z0-9_]+)"')


# ---------------------------------------------------------------------------
#  THE PIN LISTS.  Regenerate with `--seed`; never type one.
#  Each entry is a DEBT WITH A NAME, not an absolution.  The ratchet is what
#  stops it turning into one.
# ---------------------------------------------------------------------------

#  C1: a numbered chapter with numbered equations and no citation anywhere in
#  it.  Keyed by the chapter's own `\label`, or by a slug of its title when it
#  declares none.  Seeded 2026-09-19 at 46, down from 58 the same day.
KNOWN_UNCITED = {
    "ch:balances",
    "ch:batch-adiabatic",
    "ch:conversion-reactor",
    "ch:coolingTower",
    "ch:criticals",
    "ch:cstr",
    "ch:drying-overview",
    "ch:dyn-cstr",
    "ch:economics",
    "ch:evap-mode2",
    "ch:extractor",
    "ch:gas-kinetics",
    "ch:gentle",
    "ch:gibbs-reactor",
    "ch:heat",
    "ch:hx-entu",
    "ch:ideal-mixing",
    "ch:mheatx",
    "ch:nr1d",
    "ch:pfr",
    "ch:pid",
    "ch:pinch",
    "ch:polymers",
    "ch:ponchon",
    "ch:rackett",
    "ch:rayleigh",
    "ch:rk4",
    "ch:rk4-packed",
    "ch:rotating",
    "ch:rr",
    "ch:size-vessel",
    "ch:stiff-ode",
    "ch:sublimation",
    "ch:three-pillars",
    "sec:column-control",
    "sec:reactioncurve",
    "title:heat-exchanger-sizing-shell-and-tube",
    "title:notation-units-and-basis",
}

#  C2: a `\bibitem` the body never cites.  EMPTY, and that is a measurement:
#  the six that were uncited on 2026-09-19 were all cited the same day.  A new
#  orphan FAILS -- an entry may not be added and left pointing at nothing.
KNOWN_ORPHAN: set = set()

#  C3: a surname the ENGINE cites in bibliographic form and the GUIDE names in
#  prose, with no `\bibitem` naming it.  Seeded 2026-09-19.
KNOWN_UNCARRIED: set = set()

#  C4: a registered model key carrying an engine-cited surname, named in the
#  guide, with no `\bibitem` naming that surname.  Seeded 2026-09-19.
KNOWN_UNSOURCED: set = set()


# ---------------------------------------------------------------------------

def sections(scan: str):
    """-> [(numbered, key, title, text)] over the guide with the bibliography
    already excised.  A section's span ends at the next `\\section`, starred
    or not: a starred appendix is not part of the chapter above it."""
    marks = [(m.start(), m.group(1) == '') for m in SECTION.finditer(scan)]
    out = []
    for i, (s, numbered) in enumerate(marks):
        e = marks[i + 1][0] if i + 1 < len(marks) else len(scan)
        text = scan[s:e]
        head = text[:400]
        title = re.match(r'[ \t]*\\section\*?\{([^}\\]*)', head)
        title = (title.group(1) if title else "?").strip()
        lab = re.search(r'\\label\{([^}]*)\}', head)
        key = lab.group(1) if lab else ("title:" + re.sub(
            r'[^a-z0-9]+', '-', title.lower()).strip('-'))
        out.append((numbered, key, title, text))
    return out


def load():
    src = GUIDE.read_text(encoding="utf-8")
    i0 = src.find(BEGIN)
    i1 = src.find(END)
    if i0 < 0 or i1 < 0:
        print("check_theory_citations: REFUSED -- no thebibliography "
              "environment in %s." % GUIDE.relative_to(ROOT))
        sys.exit(1)
    bib = src[i0:i1]
    scan = src[:i0] + src[i1 + len(END):]
    return src, bib, scan


def cited_keys(scan: str) -> set:
    keys = set()
    for m in CITE.finditer(scan):
        for k in (x.strip() for x in m.group(1).split(',')):
            if k:
                keys.add(k)
    return keys


def engine_surnames() -> dict:
    """-> {surname: 'file:line'} over src/, in the project's citation form."""
    found = {}
    for p in sorted(SRC.rglob("*")):
        if p.suffix not in (".H", ".cpp"):
            continue
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for i, ln in enumerate(t.split("\n"), 1):
            for m in ENGINE_CITE.finditer(ln):
                found.setdefault(m.group(1),
                                 "%s:%d" % (p.relative_to(ROOT), i))
    return found


def registered_keys() -> set:
    keys = set()
    for p in sorted(SRC.rglob("*.cpp")):
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        keys.update(REGISTERED.findall(t))
    return keys


def word_in(text: str, w: str) -> bool:
    return re.search(r'\b' + re.escape(w) + r'\b', text) is not None


def measure():
    src, bib, scan = load()
    secs = sections(scan)
    #  C1
    uncited_now = set()
    titles = {}
    for numbered, key, title, text in secs:
        if not numbered:
            continue
        titles[key] = title
        if EQ_ENV.search(text) and not CITE.search(text):
            uncited_now.add(key)
    #  C2
    cites = cited_keys(scan)
    entries = BIBITEM.findall(bib)
    dangling = sorted(k for k in cites if k not in entries)
    orphan_now = set(k for k in entries if k not in cites)
    dup = sorted({k for k in entries if entries.count(k) > 1})
    #  C3
    eng = engine_surnames()
    uncarried_now = set()
    for name in eng:
        if word_in(scan, name) and not word_in(bib, name):
            uncarried_now.add(name)
    #  C4
    unsourced_now = set()
    keys = registered_keys()
    for k in keys:
        for name in eng:
            if name.lower() in k.lower() and word_in(src, k) \
               and not word_in(bib, name):
                unsourced_now.add("%s (%s)" % (k, name))
    return dict(secs=secs, titles=titles, uncited=uncited_now, cites=cites,
                entries=entries, dangling=dangling, orphan=orphan_now,
                dup=dup, eng=eng, uncarried=uncarried_now,
                unsourced=unsourced_now, keys=keys, bib=bib, scan=scan)


def seed(m) -> int:
    def block(name, s):
        #  An EMPTY set must print `set()` and never `{}`, which is an empty
        #  DICT -- pasted back into the pin lists it makes every `now - pinned`
        #  raise TypeError.  A seeder whose output cannot be pasted back is a
        #  measurement nobody can install.
        if not s:
            print("%s: set = set()\n" % name)
            return
        print("%s = {" % name)
        for x in sorted(s):
            print('    "%s",' % x)
        print("}\n")
    block("KNOWN_UNCITED", m["uncited"])
    block("KNOWN_ORPHAN", m["orphan"])
    block("KNOWN_UNCARRIED", m["uncarried"])
    block("KNOWN_UNSOURCED", m["unsourced"])
    print("#  %d chapters with equations, %d of them uncited."
          % (sum(1 for n, k, t, x in m["secs"] if n and EQ_ENV.search(x)),
             len(m["uncited"])))
    return 0


def ratchet(label, now: set, pinned: set, what: str, remedy: str,
            fails: list, alive=None):
    """The two-sided ratchet.  `alive` (when given) is the set of names that
    still EXIST, so a pin for something deleted is reported as stale rather
    than silently satisfied."""
    for x in sorted(now - pinned):
        fails.append("%s: %s %s and is NOT pinned.  %s"
                     % (label, what, x, remedy))
    for x in sorted(pinned - now):
        if alive is not None and x not in alive:
            fails.append("%s: `%s` is pinned but no longer exists in the "
                         "guide -- a stale pin is a claim that stopped being "
                         "true.  Remove it, or restore the chapter."
                         % (label, x))
        else:
            fails.append("%s: `%s` is pinned as a debt and the debt is PAID.  "
                         "Remove it from the pin list: a ledger that keeps a "
                         "closed debt stops being a measurement."
                         % (label, x))


def main() -> int:
    m = measure()
    if "--seed" in sys.argv[1:]:
        return seed(m)

    fails: list = []

    #  ---- C1 ---------------------------------------------------------------
    alive = {k for n, k, t, x in m["secs"] if n}
    ratchet("C1", m["uncited"], KNOWN_UNCITED,
            "chapter carries numbered equations and cites NOTHING:",
            "Cite the works it teaches -- and if this repository states no "
            "source for them, say so rather than inventing one.",
            fails, alive=alive)

    #  ---- C2 ---------------------------------------------------------------
    for k in m["dup"]:
        fails.append("C2: duplicate \\bibitem key `%s` -- one of the two can "
                     "never be reached by a citation." % k)
    for k in m["dangling"]:
        fails.append("C2: \\cite{%s} resolves to no \\bibitem -- LaTeX renders "
                     "it as a bare [?] and reports it only as a warning "
                     "nothing reads." % k)
    ratchet("C2", m["orphan"], KNOWN_ORPHAN,
            "\\bibitem is cited nowhere:",
            "Cite it where it belongs, or take it to the guide's authors: "
            "deleting a curated reference is their act.",
            fails)

    #  ---- C3 ---------------------------------------------------------------
    ratchet("C3", m["uncarried"], KNOWN_UNCARRIED,
            "the engine cites this work and the guide names it, with no "
            "\\bibitem:",
            "The citation is a MOVE, not a search -- carry the reference "
            "across from src/ and cite it.",
            fails)

    #  ---- C4 ---------------------------------------------------------------
    ratchet("C4", m["unsourced"], KNOWN_UNSOURCED,
            "this registered model key is named in the guide and its "
            "namesake has no \\bibitem:",
            "Add the entry from the model's own citation() or header.",
            fails)

    for f in fails:
        print("  " + f)

    withEq = sum(1 for n, k, t, x in m["secs"] if n and EQ_ENV.search(x))
    numbered = sum(1 for n, k, t, x in m["secs"] if n)
    envs = len(EQ_ENV.findall(m["scan"]))
    covered = withEq - len(m["uncited"])

    if fails:
        print("check_theory_citations: FAIL -- %d finding(s) above.  "
              "Re-measure the pin lists with "
              "`bin/curate/check_theory_citations.py --seed`, which measures "
              "them and never types them." % len(fails))
        return 1

    print("check_theory_citations: OK -- docs/theoryGuide.tex: %d of %d "
          "chapters that carry numbered equations carry a citation (%d "
          "pinned as owing one, ratcheting down); %d \\cite keys all resolve, "
          "%d \\bibitem entries all cited (%d orphans pinned); %d of %d "
          "engine-cited surnames the guide names reach the bibliography; %d "
          "registered eponymous model keys the guide names are sourced. "
          "SCANNED: that one file plus src/ for surnames and factory keys; "
          "nothing else in docs/ carries a bibliography. NOT CHECKED: whether "
          "a citation is TRUE of the equation beside it, whether an equation "
          "NEEDS one, the physico-chemical HYPOTHESES Pedro also asked for, "
          "the %d numbered equation environments individually, and the other "
          "seven guides."
          % (covered, withEq, len(KNOWN_UNCITED), len(m["cites"]),
             len(m["entries"]), len(KNOWN_ORPHAN),
             len([n for n in m["eng"] if word_in(m["scan"], n)])
             - len(m["uncarried"]),
             len([n for n in m["eng"] if word_in(m["scan"], n)]),
             len([k for k in m["keys"]
                  if any(n.lower() in k.lower() for n in m["eng"])
                  and word_in(m["scan"], k)]),
             envs))
    print("  (%d numbered sections, %d of them with equations; the debt was "
          "58 chapters on 2026-09-19 before the citation campaign began.)"
          % (numbered, withEq))
    return 0


if __name__ == "__main__":
    sys.exit(main())
