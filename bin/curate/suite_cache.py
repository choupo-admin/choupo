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

OUT_OF_SCOPE = object()   # distinct from None ("no cached text"): see below


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
    return ("  SCOPED to the caller's own case pass (bin/runTests --fast): "
            "%d of %d candidate case(s) were in reach and %d were NOT RUN by "
            "this invocation and so were not judged -- this claim covers the "
            "fast set alone, never the corpus."
            % (considered, considered + skipped, skipped))
