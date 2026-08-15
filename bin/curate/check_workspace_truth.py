#!/usr/bin/env python3
"""check_workspace_truth -- the workspace must be PROVEN before it is believed.

WHY, as a CLASS and not as incidents.  This repository is developed in hosted
containers whose recycler restores an old snapshot ASYNCHRONOUSLY: an old
HEAD, tracked files rewound, a stale remote-tracking ref that makes `git
status` say "up to date with origin" while days behind, and an uncommitted
OVERLAY of five src/propertyOps files -- a pre-commit draft of work that
SHIPPED on 2026-08-11 in a different final form.  On 2026-08-15 alone this
struck ten-plus times and did not merely waste time: IT MANUFACTURED FALSE
EVIDENCE.  Measurements were taken on trees that were not the tree under
discussion (a warning count wrong by one; a shipped refusal reported as
having "no witness"); binaries were built from draft code all day; two
commits were created with days-old parents and one nearly landed as a
regression wearing a recovery's commit message.  The session's defence was a
growing list of manual procedures in DEV.md 5b -- which is prose, and prose
does not run.

THE ARCHITECTURAL DECISION (Vitor's challenge, 2026-08-15): origin is the
source of truth, so the workspace must PROVE, before any measurement or
build in which it matters, that it agrees with that truth -- or refuse, or
say exactly what it could not prove.  This gate is that proof, and
bin/runTests runs it BEFORE EVERYTHING, ahead of check_build_fresh (which
compares the build to the tree; this compares the tree to the truth).

WHAT IT PROVES (exit 0):
  P1  ANCESTRY.  A real `git fetch` of the current branch (the ONLY defence
      against a stale remote-tracking ref), then: origin's tip must be an
      ancestor of HEAD.  HEAD == origin is SYNCED; HEAD ahead is AHEAD
      (local commits listed -- push soon, the recycler eats local refs).
      Origin NOT an ancestor = the recycler struck: REFUSED, with the two
      tips and the merge-base named and the remediation printed.
  P2  NO POISONED OVERLAY.  The known overlay is detected by what it
      REMOVES, not by stored hashes: a dirty src/propertyOps file whose
      working copy LACKS a sentinel line that HEAD's copy carries (e.g.
      "R5 SHIPPED 2026-08-11" in EvidencePartition.H) is a rewound draft
      shadowing shipped code.  REFUSED; `--remediate` discards it.
  P3  VISIBILITY.  Any other dirty tracked file is LISTED loudly (never
      refused -- editing files is what development is).  The failure mode
      this closes is the human one: five phantom modifications were
      mentally filtered out of `git status` for an entire day.

DEGRADED MODE, stated not silent: if the fetch fails (offline user, proxy
down, or CHOUPO_WT_OFFLINE=1), P1 cannot be proven.  The gate then checks
P2/P3 only, prints exactly what was NOT proven, and exits 0 -- an offline
user's tree is not presumed poisoned.  The banner makes the reduced claim
unmistakable.

`--remediate`: performs the safe recovery ONLY.  Behind origin with no
local-only commits -> `reset --hard origin/<branch>`.  Poisoned overlay ->
`git checkout --` the named files.  DIVERGED with local-only commits ->
REFUSES to choose, lists the commits (they are cherry-pick candidates; a
generated file among them must be REGENERATED, not transported -- learned
the hard way the same day).

NOT GUARANTEED, delimited plainly:
  * the recycler itself (platform, outside the repository's reach);
  * the TOCTOU window INSIDE an action -- the tree can still be rewound
    between this proof and the action it guards.  The window is shrunk
    (this check is cheap enough to re-run), never closed; the backstop is
    git itself refusing a non-fast-forward push, which caught the one
    near-landing today;
  * the user-level stop hook (lives in ~/.claude, outside the repo).

SABOTAGE-VERIFIED 2026-08-15 -- and P1 was verified BY REALITY before any
synthetic sabotage could be: the gate's FIRST-EVER run caught a live rewind
(the recycler struck while the file was being written), printing
  HEAD 39305f90f8 / origin b2ebdcc3de <- the truth / REFUSED, exit 1
and `--remediate` then performed the reset ("no local-only commits existed,
nothing destroyed"), with the second pass SYNCED.  P2: the sentinel line
removed from EvidencePartition.H's working copy -> "THE POISONED OVERLAY IS
PRESENT", the file named, exit 1; restored -> OK.  DEGRADED: with
CHOUPO_WT_OFFLINE=1 the banner states exactly what was not proven and the
five dirty files were LISTED -- the visibility that was mentally filtered
away for a full day.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  P2 sentinels: (path, line HEAD's copy must keep).  A dirty copy of the
#  path LACKING the sentinel while HEAD carries it is a rewound draft.
OVERLAY_SENTINELS = [
    ("src/propertyOps/EvidencePartition.H", "R5 SHIPPED 2026-08-11"),
]
OVERLAY_PATHS = [
    "src/propertyOps/EstimateComponent.cpp",
    "src/propertyOps/EvidencePartition.H",
    "src/propertyOps/EvidencePartition.cpp",
    "src/propertyOps/FreezingPoint.cpp",
    "src/propertyOps/PitzerActivity.cpp",
]


def git(*args, timeout=30):
    p = subprocess.run(["git", "-C", str(ROOT)] + list(args),
                       capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def main() -> int:
    remediate = "--remediate" in sys.argv

    rc, branch, _ = git("rev-parse", "--abbrev-ref", "HEAD")
    if rc != 0 or branch == "HEAD":
        print("check_workspace_truth: REFUSED -- detached HEAD or no branch;"
              " a workspace with no branch cannot be compared to the truth.")
        return 1
    rc, head, _ = git("rev-parse", "HEAD")

    # ---- P1: ancestry against a FRESHLY FETCHED origin -------------------
    degraded = None
    if os.environ.get("CHOUPO_WT_OFFLINE"):
        degraded = "CHOUPO_WT_OFFLINE set"
    else:
        rc, _, err = git("fetch", "--quiet", "origin", branch, timeout=45)
        if rc != 0:
            degraded = "fetch failed: " + (err.splitlines()[-1] if err else "?")

    if degraded is None:
        rc, origin, _ = git("rev-parse", f"origin/{branch}")
        if rc != 0:
            degraded = f"origin/{branch} unknown after fetch"
        else:
            rc, _, _ = git("merge-base", "--is-ancestor", origin, head)
            if rc != 0:
                rc2, mb, _ = git("merge-base", head, origin)
                _, localonly, _ = git("log", "--oneline",
                                      f"{mb}..{head}") if rc2 == 0 else (0, "", "")
                print("check_workspace_truth: REFUSED -- THE WORKSPACE IS NOT"
                      " THE TREE YOU THINK IT IS.")
                print(f"  HEAD          {head[:10]} ({branch})")
                print(f"  origin/{branch}  {origin[:10]}  <- the truth")
                print(f"  merge-base    {mb[:10] if rc2 == 0 else '?'}")
                print("  The container recycler has rewound this checkout."
                      "  Every measurement, build or commit made here"
                      " describes a DIFFERENT tree and manufactures false"
                      " evidence.")
                if localonly:
                    print("  Commits on HEAD but not on origin (cherry-pick"
                          " candidates -- a GENERATED file among them must be"
                          " regenerated, never transported):")
                    for ln in localonly.splitlines()[:10]:
                        print("    " + ln)
                    print("  --remediate REFUSES this case: it will not choose"
                          " for you between discarding and cherry-picking.")
                    return 1
                if remediate:
                    git("reset", "--hard", f"origin/{branch}")
                    print(f"  REMEDIATED: reset --hard origin/{branch} (no"
                          " local-only commits existed, nothing destroyed).")
                    _, head, _ = git("rev-parse", "HEAD")
                else:
                    print(f"  Remedy: bin/curate/check_workspace_truth.py"
                          f" --remediate    (safe: no local-only commits)"
                          if not localonly else "")
                    return 1

    # ---- P2: the poisoned overlay, detected by what it removes -----------
    _, dirty_raw, _ = git("diff", "--name-only", "HEAD")
    dirty = set(dirty_raw.splitlines())
    poisoned = []
    for path, sentinel in OVERLAY_SENTINELS:
        if path in dirty:
            rc, headcopy, _ = git("show", f"HEAD:{path}")
            work = (ROOT / path).read_text(errors="replace") \
                if (ROOT / path).exists() else ""
            if sentinel in headcopy and sentinel not in work:
                poisoned = [p for p in OVERLAY_PATHS if p in dirty]
                break
    if poisoned:
        print("check_workspace_truth: REFUSED -- THE POISONED OVERLAY IS"
              " PRESENT.")
        print("  These dirty files are the recycler's pre-commit DRAFT of"
              " work that SHIPPED 2026-08-11 (DEV.md 5b).  Building them"
              " compiles the draft over shipped code; 'recovering' them"
              " regresses shipped work under a false provenance:")
        for p in poisoned:
            print("    " + p)
        if remediate:
            git("checkout", "--", *poisoned)
            print("  REMEDIATED: overlay discarded (git checkout --).")
        else:
            print("  Remedy: git checkout -- " + " ".join(poisoned)
                  + "   (or --remediate)")
            return 1

    # ---- P3: visibility of everything else -------------------------------
    _, dirty_raw, _ = git("diff", "--name-only", "HEAD")
    rest = [d for d in dirty_raw.splitlines() if d]
    note = ""
    if rest:
        note = (f"  DIRTY TRACKED FILES ({len(rest)}) -- legitimate edits or"
                " debris, but SEEN, never mentally filtered:\n" +
                "".join(f"    {d}\n" for d in rest[:15]))

    if degraded:
        print("check_workspace_truth: DEGRADED -- sync with origin NOT PROVEN"
              f" ({degraded}).  Proven: no poisoned overlay"
              + (", clean tree" if not rest else "") + ".  NOT proven: HEAD"
              f" ({head[:10]}) matches origin/{branch} -- a stale"
              " remote-tracking ref cannot be ruled out without a fetch.")
        sys.stdout.write(note)
        return 0

    rc, ahead_raw, _ = git("log", "--oneline", f"origin/{branch}..HEAD")
    ahead = [ln for ln in ahead_raw.splitlines() if ln]
    state = "SYNCED with" if not ahead else f"AHEAD of ({len(ahead)} commit(s), push soon -- the recycler eats local refs)"
    print(f"check_workspace_truth: OK -- HEAD {head[:10]} is {state}"
          f" origin/{branch} (freshly fetched), and the poisoned overlay is"
          " absent.  NOT GUARANTEED: the recycler itself, and the window"
          " between this proof and the action it guards -- git's own"
          " non-fast-forward refusal is the backstop there.")
    sys.stdout.write(note)
    return 0


if __name__ == "__main__":
    sys.exit(main())
