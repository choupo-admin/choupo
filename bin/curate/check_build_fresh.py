#!/usr/bin/env python3
"""Gate: the binaries under test must match the source tree.

    bin/curate/check_build_fresh.py

WHY THIS EXISTS, and it was paid for on 2026-08-07.  A docs-only commit came
back PASS 286 / FAIL 135.  Nothing in the tree was wrong: the working directory
had been restored underneath a `build/` that was left over from a different
source state, so every case and probe was exercising a library that no longer
corresponded to any code in the repository.  A rebuild alone -- same commit,
same tree, not one file edited -- returned PASS 432 / FAIL 0.

`bin/runTests` does not build.  It runs `bin/buildCode` for a case that carries
its own `code/` directory, and otherwise takes `build/<platform>/` exactly as
it finds it.  That is the right division of labour -- a verifier should not be
a builder, or a compile error arrives disguised as a physics failure -- but it
leaves the suite unable to notice the one precondition every single result
depends on.

THE FAILURE MODE IS WORSE THAN 135 RED LINES, and that is the argument for
refusing rather than warning.  A stale library can also produce a PASS: if the
goldens were recorded against it, every case agrees with itself perfectly and
the suite reports a clean sheet for code that is not in the tree.  Red lines
are at least visible.  A green run over the wrong binary is the exact shape
this project keeps finding -- a verifier that reports on something other than
what it claims.

Two gates already got this right on the day, and their behaviour is the model:
`check_reference_rung` and `check_ice_freezing` each build a probe against the
library, and each refused with "a check that cannot build must not pass"
instead of skipping.  They failed loudly for the correct reason.  But 135
failures with no line anywhere naming the cause is a diagnosis the suite could
have given and did not, and the cost was one wrong attribution: the first
reading blamed the commit.

WHAT THIS CHECKS.  The newest modification time among the sources that
`libchoupo.so` is built from, against the library and the four binaries.  If
any source is newer, the build cannot be a build OF this tree, and the gate
refuses naming the offending file.

WHAT IT DOES NOT CHECK, said plainly:

  * NOT CONTENT.  This is a timestamp comparison, not a hash of the inputs.
    `git checkout` and `touch` both move an mtime without changing a byte, so
    the gate can fire on a tree that would compile identically.  That costs
    one `make all`, which is idempotent and fast when nothing changed -- far
    cheaper than the failure it prevents.  The reverse error is impossible in
    the direction that matters: a source edited AFTER the library was linked
    always has the newer mtime.
  * NOT CORRECTNESS OF THE BUILD.  A library can be current and wrong.  This
    says only that it was built from these files.
  * NOT THE WASM BUILD, which is separate (`make wasm`) and has its own stale
    failure mode, described in CLAUDE.md §13.

FLAGS ARE CHECKED BY THE BUILD'S OWN STAMP (2026-08-14), not by the mtime of
`make/*.mk`.  Sabotage-verified both ways, observed:
  * `touch build/<platform>/.stamp-cxx-sabotage00000000` -> FAILED, naming
    that stamp as what the artefacts predate.  A real flag change mints
    exactly such a file, so a rebuild is genuinely required.
  * a COMMENT-only edit to `make/compiler.mk` -> OK, where the old mtime rule
    failed and prescribed a `make all` that could not fix it.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  What the library is built FROM.  The Makefile fragments are included: a
#  changed compiler flag produces a different binary from identical sources.
#
#  THE MAKE FRAGMENTS ARE JUDGED BY THE BUILD'S OWN STAMP, NOT BY THEIR MTIME
#  (2026-08-14).  `make/*.mk` used to sit in this list, on the correct
#  reasoning that a changed compile flag yields a different binary from
#  identical sources.  The instrument was wrong: those files also hold
#  COMMENTS, and editing one made every artefact "predate a source" while
#  `make all` -- the remedy this gate prints -- could do nothing about it,
#  because the signature had not changed and make was right to decline.
#  Prescribing a remedy that cannot satisfy the check is the same defect this
#  gate was already narrowed once to remove.
#
#  The build already tracks flags BY CONTENT: `make/compiler.mk` mints
#  `.stamp-cxx-<COMPILE_SIG>`, a hash of the actual compile signature, and
#  `make/rules.mk` makes every object depend on it -- so a real flag change
#  rebuilds everything and a comment change correctly does not.  Comparing
#  the artefacts against that stamp asks the question the mtime was a proxy
#  for, and asks it exactly.
SOURCE_GLOBS = [("src", "**/*.H"), ("src", "**/*.cpp")]
SOURCE_FILES = []

#  What is built.  The library first: it is what the gates' probes link.
ARTEFACTS = ["libchoupo.so", "choupoSolve", "choupoBatch", "choupoCtrl",
             "choupoProps"]


def platform_dir():
    """The release build tree.  Debug lives in a parallel dir and is not
    what runTests exercises."""
    base = ROOT / "build"
    if not base.is_dir():
        return None
    #  Prefer a non-Debug directory; there is normally exactly one.
    cands = [d for d in sorted(base.iterdir())
             if d.is_dir() and not d.name.endswith("Debug")]
    return cands[0] if cands else None


def main() -> int:
    bdir = platform_dir()
    if bdir is None:
        print("check_build_fresh: FAILED\n  no build/<platform>/ directory -- "
              "nothing has been compiled.  Run `make all`.  Every case and "
              "every probe in this suite runs against that tree, so there is "
              "nothing to verify until it exists.")
        return 1

    #  The flag signature, by content (see SOURCE_GLOBS above).
    stamps = sorted(bdir.glob(".stamp-cxx-*"))
    if not stamps:
        print("check_build_fresh: FAILED\n  " + bdir.name + " carries no "
              ".stamp-cxx-* -- the build did not record the compile signature "
              "it was made with, so this gate cannot tell whether the flags "
              "have moved.  Run `make all`.")
        return 1

    missing = [a for a in ARTEFACTS if not (bdir / a).exists()]
    if missing:
        print("check_build_fresh: FAILED\n  " + bdir.name + " is missing "
              + ", ".join(missing) + ".  Run `make all`.  A suite that runs "
              "with a binary absent reports its absence as a physics failure, "
              "case by case, and names no cause.")
        return 1

    #  AN ARTEFACT IS COMPARED AGAINST THE SOURCES IT CAN DEPEND ON.
    #
    #  This gate used to take the newest mtime ANYWHERE under src/ and require
    #  every artefact to postdate it.  That is wrong for one specific and very
    #  common edit, and the wrongness is worse than a false alarm: editing
    #  `src/applications/choupoBatch/main.cpp` makes libchoupo.so, choupoSolve,
    #  choupoCtrl and choupoProps all "predate a source" -- and NO amount of
    #  `make all`, the remedy this gate prints, can fix it, because make is
    #  right to decline relinking targets whose dependencies did not change.
    #  The prescribed remedy could not satisfy the check.  Hit twice in ten
    #  minutes on 2026-08-14 while editing choupoBatch, each time costing a
    #  full `make clean` rebuild.
    #
    #  An application's own main.cpp is linked into THAT binary and nothing
    #  else, so it is excluded from every other artefact's comparison.  The
    #  library is compared against everything EXCEPT applications/.  Nothing
    #  else relaxes: a change under thermo/, solver/, core/ or any other
    #  subsystem still has to postdate every artefact, which is the case the
    #  gate exists for.
    def newest_for(exclude_app_dirs):
        newest, path = 0.0, None
        for sub, pat in SOURCE_GLOBS:
            for f in (ROOT / sub).glob(pat):
                rel = f.relative_to(ROOT).as_posix()
                if any(rel.startswith(d) for d in exclude_app_dirs):
                    continue
                m = f.stat().st_mtime
                if m > newest:
                    newest, path = m, f
        for rel in SOURCE_FILES:
            f = ROOT / rel
            if f.exists() and f.stat().st_mtime > newest:
                newest, path = f.stat().st_mtime, f
        return newest, path

    APP_DIR = "src/applications/"
    app_dirs = sorted(d.name for d in (ROOT / "src" / "applications").iterdir()
                      if d.is_dir()) if (ROOT / "src" / "applications").is_dir() else []

    def relevant(artefact):
        """Which application directories this artefact must NOT be judged by."""
        stem = artefact.replace(".so", "").replace("lib", "")
        if artefact.startswith("lib"):
            return [APP_DIR]                       # the library links no main
        return [APP_DIR + d + "/" for d in app_dirs if d != artefact]

    newest_src, newest_path = newest_for([])       # the whole-tree reference

    if newest_path is None:
        print("check_build_fresh: FAILED\n  no sources found under src/ -- "
              "the tree is not what this gate expects, and a freshness check "
              "over zero files would pass while checking nothing.")
        return 1

    #  The stamp is a FLOOR on every artefact: it is re-minted only when the
    #  compile signature actually changes, so an artefact older than it was
    #  built with different flags.  This is the make/*.mk check, asked exactly.
    stamp = max(stamps, key=lambda f: f.stat().st_mtime)
    stamp_t = stamp.stat().st_mtime

    stale = []
    for a in ARTEFACTS:
        art = bdir / a
        limit, limit_path = newest_for(relevant(a))
        if stamp_t > limit:
            limit, limit_path = stamp_t, stamp
        if art.stat().st_mtime < limit:
            stale.append(a)
            newest_path = limit_path               # name the source that bites

    if stale:
        rel = newest_path.relative_to(ROOT)
        print("check_build_fresh: FAILED")
        print(f"  {', '.join(stale)} in {bdir.name} predate(s) {rel}.")
        print("  THE BUILD IS NOT A BUILD OF THIS TREE.  Run `make all` and "
              "re-run the suite.")
        print("  Every result below this line would have been about a "
              "different library: cases, goldens, and every gate that links a "
              "probe.  On 2026-08-07 this exact state produced 135 failures "
              "on a commit that changed only two markdown files, and the "
              "first reading blamed the commit.  It can equally produce a "
              "clean PASS, which is worse, because a green run over the wrong "
              "binary looks exactly like a green run.")
        return 1

    #  THE SUCCESS LINE NAMES NO FILE, and that is deliberate.  The first
    #  version printed which source was newest; that filename changes with
    #  almost every build, so the claim recorded in generated/gateManifest.json
    #  churned on every run and produced a diff that meant nothing.  A manifest
    #  whose entries move constantly teaches its readers to skip the diff,
    #  which is precisely how a real drift gets waved through -- the file
    #  exists to make drift visible.  The newest source IS named in the failure
    #  message, where it is the diagnosis and the reader needs it.
    print("check_build_fresh: OK -- " + bdir.name + " carries all "
          + str(len(ARTEFACTS)) + " artefact(s), each newer than the newest "
          "source it can DEPEND on -- an application's own main.cpp is judged "
          "against that binary alone, the library against everything except "
          "applications/, and a shared source under thermo/, solver/, core/ or "
          "any other subsystem against all five.  The suite is "
          "therefore testing a build OF this tree.  NOT CHECKED: content -- "
          "this compares modification times, not hashes, so a `touch` or a "
          "`git checkout` that changes no byte can still trip it (the remedy "
          "is one idempotent `make all`), and a library built from these files "
          "can still be wrong.  The WASM build is separate and not covered.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
