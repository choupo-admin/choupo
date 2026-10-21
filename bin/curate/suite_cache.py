"""ONE home for the suite's single-pass output cache -- and for its SCOPE.

    from suite_cache import stdout_of, SCOPED, scope_sentence

WHAT THE CACHE IS (2026-08-24).  The corpus-sweeping meta-gates used to re-run
the corpus, each for its own sweep -- the same work in four homes, measured at
half the suite's wall clock.  `bin/runTests` now saves each clean case run's
stdout and hands the directory to those gates in `CHOUPO_SUITE_OUTPUTS`; a
gate invoked standalone sees no variable and runs the corpus live, exactly as
before.  Three gates carried their own eight-line copy of that lookup, which
is three homes for one convention -- this module is the first.

WHAT THE SCOPE IS (2026-09-07, the `--fast` tier).  `bin/runTests --fast` runs
ONE case per family, not the corpus, and then asks the conservation gates what
they make of it.  Without a scope those gates would run every case the fast
tier deliberately did not -- 222 s for check_mass_closure alone, measured,
against a tier whose whole budget is under 20 s.  So `CHOUPO_SUITE_SCOPE=1`
says the cache is not merely a cache but the SCOPE of this invocation: a case
the cache does not hold was not run by the caller and is OUT OF REACH.

A SCOPED GATE MUST SAY SO.  Skipping is not a licence to imply full coverage:
a gate that narrows its subject and prints its usual sentence is claiming
reach it does not have, which is the failure this project keeps paying for.
`scope_sentence()` is the sentence, and it is appended by every gate that
honours the scope, so the claim a reader (and gate_manifest) sees always
states what was in reach.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  The cache directory, or None when this gate was invoked standalone.
DIR = os.environ.get("CHOUPO_SUITE_OUTPUTS") or None

#  True only when a cache was handed over AND the caller declared it to be the
#  scope.  The full sweep never sets this: it runs the whole corpus, so a case
#  missing from its cache is a case that exited non-zero, which the gates run
#  live exactly as they always have.
SCOPED = DIR is not None and os.environ.get("CHOUPO_SUITE_SCOPE") == "1"

#  A SCOPE SET BY HAND, WRONGLY, IS SAID ALOUD (2026-10-20, DEV.md 4c C122).
#  `CHOUPO_SUITE_SCOPE=<a path>` -- what the commander exported that day --
#  is neither "1" nor accompanied by a cache, so every gate quietly fell back
#  to its standalone corpus sweep and took twenty minutes.  The right way to
#  scope these gates to a set of cases is `bin/runTests --scope <cases>`,
#  which fills the cache and sets both variables; anything else is announced
#  here, once per gate process, on stderr (the claim on stdout is untouched).
_raw_scope = os.environ.get("CHOUPO_SUITE_SCOPE")
if _raw_scope is not None and not SCOPED:
    import sys as _sys
    print("[suite_cache] CHOUPO_SUITE_SCOPE=%r is NOT a scope here (%s) -- "
          "this gate runs its cases LIVE, unscoped.  To scope the "
          "conservation gates to a set of cases, run `bin/runTests --scope "
          "<case>...`; it fills the cache and sets both variables."
          % (_raw_scope, "no CHOUPO_SUITE_OUTPUTS cache was handed over"
             if DIR is None else "the scope flag must read exactly 1"),
          file=_sys.stderr)

OUT_OF_SCOPE = object()   # distinct from None ("no cached text"): see below

#  WHO DECLARED THE SCOPE DECIDES WHAT AN EMPTY SUBJECT MEANS (2026-10-20,
#  DEV.md 4c C122).  `--fast` hands over a DECLARED set (tutorials/FASTSET)
#  whose job is to reach every conservation gate, so a gate that finds nothing
#  in it is a defect of the set and FAILS.  `--scope <cases>` is handed what a
#  merge touched, and a merge of props-bench cases reaches no plant at all:
#  that is a fact about the merge, not a failure of anything.  It is NOT a
#  PASS either -- a check that judged nothing must not print a claim -- so it
#  is a third outcome, NO SUBJECT, on its own exit code, which `bin/runTests`
#  reports apart and never counts.  `runTests` exports the kind; a scope set
#  without one is read as the declared set, the stricter of the two.
SCOPE_KIND = (os.environ.get("CHOUPO_SUITE_SCOPE_KIND") or "fast") \
    if SCOPED else None
NO_SUBJECT_EXIT = 3


def no_subject(gate: str, what: str):
    """Under `--scope <cases>`: print the NO SUBJECT line and return its exit
    code.  Under `--fast` (or unscoped): return None, and the caller FAILS as
    it always has -- its remedy there is the fast set, which only it can
    name."""
    if SCOPE_KIND != "named":
        return None
    print("%s: NO SUBJECT -- %s.  The cases named to `bin/runTests --scope` "
          "hold none this gate judges, so it judged nothing: not a PASS, and "
          "no claim of coverage." % (gate, what))
    return NO_SUBJECT_EXIT



def stdout_of(case: Path):
    """The cached stdout of `case`, or None when the cache does not hold it.

    None means "not cached", never "out of scope" -- the caller decides what
    to do with an absence, and under SCOPED it must skip and COUNT rather than
    run live.  Keeping the two apart is the reason this returns None and not a
    silent empty string: an empty run output would read as a case that printed
    nothing, which is a different fact.
    """
    if DIR is None:
        return None
    rel = case.resolve().relative_to(ROOT).as_posix().replace("/", "__")
    try:
        return (Path(DIR) / (rel + ".out")).read_text(errors="replace")
    except OSError:
        return None


def scope_sentence(considered: int, skipped: int) -> str:
    """The sentence a scoped gate appends to its claim.  Empty when unscoped,
    so an ordinary sweep's claim is unchanged byte for byte."""
    if not SCOPED:
        return ""
    return ("  SCOPED to the caller's own case pass (bin/runTests --fast or "
            "--scope): %d of %d candidate case(s) were in reach and %d were "
            "NOT RUN by this invocation and so were not judged -- this claim "
            "covers that pass alone, never the corpus."
            % (considered, considered + skipped, skipped))
