#!/usr/bin/env python3
"""ONE home for "a gate is about to mutate this tree, and may not survive it".

    from destructive_session import DestructiveSession, assert_tree_undisturbed

WHY THIS EXISTS -- the incident of 2026-08-18.

`check_gate_selftest` proves that other gates fail when they should, by
SABOTAGING sources and REBUILDING the engine.  It cleans up after itself, in
`try/finally`, and verifies the restored bytes.  That is exception-safe and it
is NOT death-safe, and the difference is the whole incident: a `finally` block
does not run against SIGKILL, and `subprocess.run(timeout=...)` -- which is
how `gate_manifest.py` invokes every gate -- kills with SIGKILL.

So the selftest was killed mid-sabotage, left a POISONED BINARY on disk, and
the manifest run carried on down its alphabetical walk recording seven
engine-running gates as FAILED: check_inlet_resolution, check_solid_service,
check_stage_identity, check_stream_transport_closure, check_tray_chemistry,
check_second_liquid, check_utility_allocation_pinned.  Every one of them
recovered from a single `make all`, with no source change whatsoever.  Those
seven failures were never about those gates.

Two things made it invisible rather than loud:

  * the failures looked exactly like real ones, and the tree was CLEAN -- the
    selftest's sabotage of `src/solver/Convergence.H` had been reverted by an
    earlier, successful run, so `git status` said nothing and only the BINARY
    carried the damage;
  * `gate_manifest.py` recorded `{"exit": 1, "claim": "check_x: FAILED"}` and
    wrote the file anyway, so contaminated evidence became a committed,
    authoritative artefact.  It had happened before: twelve such entries sit
    in the manifest committed on 2026-08-17.

WHAT IS FIXED HERE, and why it is a JOURNAL rather than a lock.

A lock would only stop two destructive runs colliding.  The failure mode is
different: ONE destructive run dies and nobody downstream can tell.  So this
writes a JOURNAL before the first mutation -- what is being changed, by whom,
with the sha256 of each file's original bytes -- and removes it only after a
verified restore.  The journal is therefore a claim in the negative: *while
this file exists, the tree and the build are not to be trusted.*

It survives SIGKILL because it is on disk and nothing but a successful restore
removes it.  That is the property `try/finally` cannot have.

THE CAMPAIGN-INVALIDATING RULE, which is the point.  Any harness that produces
EVIDENCE -- `gate_manifest.py`, `bin/runTests`, and above all `runTests
--record`, which freezes an answer into a golden -- calls
`assert_tree_undisturbed()` first and REFUSES while a journal is present.  A
check that cannot run must not pass; evidence gathered in a state known to be
untrustworthy must not be recorded at all.  Refusing loudly costs a rerun.
Recording it costs a manifest, or a golden, that lies with authority.

WHERE IT LIVES.  `build/` -- gitignored, persistent across processes, and
beside the artefact whose trustworthiness is in question.  If `build/` is
wiped the binary is gone too, so a missing journal there cannot mean "the
build is fine" when it is not.

WHAT THIS DOES NOT DO, stated so its silence cannot be read as a guarantee:
it does not itself repair anything -- `recover()` prints the remedy and the
operator (or the next selftest run, which refuses to start on a dirty file)
does the work; and it cannot detect damage done by something that never opened
a session, including a hand-run `make` over edited sources.  It covers
DECLARED destruction only.
"""
import hashlib
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOURNAL = ROOT / "build" / "destructiveSession.json"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class DestructiveSession:
    """Declare, on disk, that this process is about to damage the tree.

    Usage:
        with DestructiveSession("check_gate_selftest", files) as s:
            ...sabotage, build, run, restore...
        # the journal is removed on clean exit ONLY
    """

    def __init__(self, owner: str, files):
        self.owner = owner
        self.files = [Path(f) for f in files]

    def __enter__(self):
        JOURNAL.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "owner": self.owner,
            "pid": os.getpid(),
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "why": "This file exists because a destructive gate is running, or "
                   "died before restoring the tree.  While it exists, neither "
                   "the working tree nor build/ is trustworthy and no evidence "
                   "may be recorded from either.",
            "files": [
                {"path": p.relative_to(ROOT).as_posix(),
                 "sha256Before": sha256_of(p) if p.exists() else None}
                for p in self.files
            ],
            "alsoDamages": "build/ -- the gate rebuilds the engine from "
                           "sabotaged sources, so the BINARY carries the "
                           "damage even after the sources are reverted.  "
                           "Recovery is `make all` after the sources are "
                           "clean; a clean `git status` is NOT evidence that "
                           "the build is clean.",
        }
        JOURNAL.write_text(json.dumps(record, indent=2) + "\n")
        return self

    def __exit__(self, exc_type, exc, tb):
        #  Removed ONLY on a clean exit.  An exception leaves the journal
        #  standing, because an interrupted restore is exactly the state the
        #  journal exists to announce.  Suppress nothing.
        if exc_type is None:
            JOURNAL.unlink(missing_ok=True)
        return False


def journal():
    """The open session, or None.  Tolerates a truncated file: a journal
    written by a process that died mid-write still means the tree is
    untrustworthy, so unparseable is treated as PRESENT, never as absent."""
    if not JOURNAL.exists():
        return None
    try:
        return json.loads(JOURNAL.read_text())
    except Exception:
        return {"owner": "(unreadable journal)", "files": [],
                "startedAt": "unknown"}


def assert_tree_undisturbed(harness: str) -> None:
    """REFUSE, by raising SystemExit(1), while a destructive session is open.

    Call this at the START of anything that records evidence."""
    j = journal()
    if j is None:
        return
    named = ", ".join(f["path"] for f in j.get("files", [])) or "(none listed)"
    print(f"{harness}: REFUSING TO RUN -- a destructive session is open.\n"
          f"  owner   {j.get('owner')}   started {j.get('startedAt')}\n"
          f"  files   {named}\n"
          "  The gate that opened this either is running now, or was killed\n"
          "  before it could restore the tree.  A clean `git status` does NOT\n"
          "  clear it: the BUILD carries the damage even when the sources are\n"
          "  back, which is how seven gates recorded false FAILED claims into\n"
          "  a committed manifest on 2026-08-18.\n"
          "  RECOVERY, once nothing is running:\n"
          f"    git status --porcelain -- {named}\n"
          "    git checkout -- <any file listed above that is modified>\n"
          "    make all\n"
          f"    rm {JOURNAL.relative_to(ROOT)}\n"
          "  Then re-run this harness.  Do not delete the journal without\n"
          "  rebuilding: that reinstates exactly the silent failure it names.")
    raise SystemExit(1)


if __name__ == "__main__":
    #  Shell entry point, so bash harnesses (bin/runTests) enforce the SAME
    #  rule through the SAME code rather than reimplementing the check in a
    #  second language.  Two spellings of one refusal is how they drift.
    #      python3 bin/curate/destructive_session.py --assert <harness-name>
    import sys
    if "--assert" in sys.argv:
        i = sys.argv.index("--assert")
        assert_tree_undisturbed(sys.argv[i + 1] if i + 1 < len(sys.argv)
                                else "harness")
        raise SystemExit(0)
    j = journal()
    print("no destructive session is open" if j is None
          else json.dumps(j, indent=2))
