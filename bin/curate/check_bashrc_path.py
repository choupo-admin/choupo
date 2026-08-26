#!/usr/bin/env python3
"""`source etc/bashrc` must not break the build.

WHAT THIS EXISTS FOR, because a gate whose reason is forgotten gets deleted:

`etc/bashrc` puts the project root on PATH, for the ./choupoSolve symlinks.
The project root also holds a DIRECTORY named `make/`.  A shell's PATH search
skips directories, so `make` typed at the prompt worked and nothing looked
wrong -- but GNU make execs a recursive `$(MAKE)` DIRECTLY, with no shell in
between, and its own PATH search does NOT skip them.  With the root first,
make found the directory and every recursive target died:

    make: make: Permission denied
    make: *** [make/wasm.mk:138: wasm] Error 127

`make wasm`, `make MODE=debug` and `make PLATFORM=win64MinGW` are all
recursive, so ALL THREE were broken -- and only for someone who had sourced
the file the documentation tells them to source.  The error names a line of
`wasm.mk` that is entirely correct, which sends the reader to the wrong file.

THE ARMS

  (a) THE MECHANISM, not a proxy for it.  A throwaway project carrying a
      `make/` directory and a recursive target is built with the PATH that
      `etc/bashrc` actually produces, and the inner make must run.  Checking
      the PATH ORDER instead would be checking today's fix rather than the
      property, and would pass the day someone adds a `bin/` shim or a second
      shadowing directory.

  (b) THE ROOT IS STILL ON PATH.  The fix must not have been "remove it" --
      the ./choupoSolve symlinks are why it is there, and a student who can
      no longer type `choupoSolve` has traded one broken workflow for
      another.

  (c) A POISONED PATH IS REPAIRED, NOT SKIPPED.  Sourcing the file from a
      shell that ALREADY carries the old broken order must fix it.  The first
      version of the fix failed this and nobody noticed for an hour: the
      guard was "if CHOUPO_HOME is already on PATH, do nothing", so the
      repair declined to act for precisely the people who needed it -- and
      `exec bash` did not help either, because it inherits the environment.
      Only a brand-new terminal did, and nothing said so.

  (d) bin/ IS STILL EARLY.  `runCase` and friends must win over anything
      similarly named later in PATH.

WHAT IT DOES NOT COVER, said so the OK line cannot imply it: it tests bash.
zsh and the POSIX fallback branch in `etc/bashrc` resolve their own location
differently and are not exercised here.  And it says nothing about whether
the real `make wasm` succeeds -- that needs emscripten, which CI does not
have; what is checked is that the PATH no longer prevents it from starting.

SABOTAGE-VERIFIED 2026-08-25, three times; the quoted lines are observed.

S1 -- the PATH line reverted to the old `"$CHOUPO_HOME:$CHOUPO_HOME/bin:$PATH"`.
Arm (a):

    recursive make is BROKEN under the PATH etc/bashrc produces:
    make: make: Permission denied

S2 -- the root dropped from PATH entirely (the tempting "fix").  Arm (b) fired
while arm (a) passed, which is the pair that matters: the build works and the
binaries have become untypeable.

    $CHOUPO_HOME is no longer on PATH at all -- ./choupoSolve and its three
    siblings are symlinks in the root and that is the only reason the root
    is there

S3 -- bin/ moved to the very end, after the root.  Arm (c):

    /home/user/choupo/bin is at PATH position 4, after 2 system
    director(y/ies) -- runCase and friends no longer win
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASHRC = ROOT / "etc/bashrc"

fails = []


def sourced_path():
    """The PATH a real bash gets from sourcing etc/bashrc.  Started from a
    MINIMAL PATH so the answer is about this file and not about whatever the
    caller happened to have."""
    env = dict(os.environ)
    env["PATH"] = "/usr/bin:/bin"
    env.pop("CHOUPO_HOME", None)
    p = subprocess.run(
        ["bash", "-c", f'source "{BASHRC}" >/dev/null 2>&1; printf "%s" "$PATH"'],
        capture_output=True, text=True, env=env, timeout=60)
    return p.stdout.strip()


def main():
    if not BASHRC.exists():
        print(f"check_bashrc_path: FAIL -- {BASHRC} is missing")
        return 1

    path = sourced_path()
    if not path:
        print("check_bashrc_path: FAIL -- sourcing etc/bashrc produced no PATH")
        return 1
    entries = path.split(":")

    # ---- (a) the MECHANISM: a recursive make must run under that PATH -----
    tmp = Path(tempfile.mkdtemp(prefix="choupoPathProbe"))
    try:
        (tmp / "make").mkdir()          # the shadowing directory, as in the root
        (tmp / "Makefile").write_text(
            "outer:\n\t@$(MAKE) --no-print-directory inner\n"
            "inner:\n\t@echo RECURSIVE-MAKE-OK\n")
        env = dict(os.environ)
        env["PATH"] = path
        r = subprocess.run(["make", "outer"], cwd=tmp, env=env,
                           capture_output=True, text=True, timeout=120)
        if "RECURSIVE-MAKE-OK" not in r.stdout:
            first = ((r.stderr or r.stdout).strip().splitlines()
                     or ["(no output)"])[0]
            fails.append("recursive make is BROKEN under the PATH etc/bashrc"
                         f" produces:\n      {first}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- (b) the root is still reachable ----------------------------------
    home = str(ROOT)
    if home not in entries:
        fails.append(f"{home} is no longer on PATH at all -- ./choupoSolve and"
                     " its three siblings are symlinks in the root and that is"
                     " the only reason the root is there")

    # ---- (c) a poisoned PATH is repaired ---------------------------------
    poisoned = f"{ROOT}:{ROOT}/bin:/usr/bin:/bin"
    env = dict(os.environ)
    env["PATH"] = poisoned
    env["CHOUPO_HOME"] = str(ROOT)
    r = subprocess.run(
        ["bash", "-c", f'source "{BASHRC}" >/dev/null 2>&1; printf "%s" "$PATH"'],
        capture_output=True, text=True, env=env, timeout=60)
    rep = r.stdout.strip().split(":")
    if rep and rep[0] == str(ROOT):
        fails.append("sourcing etc/bashrc from a shell that ALREADY has the"
                     " broken order leaves it broken -- the repair must"
                     " NORMALISE the PATH, not skip when it finds itself"
                     " already on it")
    elif rep.count(str(ROOT)) > 1 or rep.count(str(ROOT / "bin")) > 1:
        fails.append("sourcing etc/bashrc twice duplicates its own entries on"
                     f" PATH ({rep.count(str(ROOT))} x root,"
                     f" {rep.count(str(ROOT / 'bin'))} x bin)")

    # ---- (d) bin/ still wins ----------------------------------------------
    binp = str(ROOT / "bin")
    if binp not in entries:
        fails.append(f"{binp} is not on PATH -- runCase, listCases and"
                     " choupo-thermoml are unreachable")
    else:
        i = entries.index(binp)
        before = [e for e in entries[:i]
                  if e in ("/usr/bin", "/bin", "/usr/local/bin", "/sbin",
                           "/usr/sbin")]
        if before:
            fails.append(f"{binp} is at PATH position {i + 1}, after"
                         f" {len(before)} system director(y/ies) -- runCase and"
                         " friends no longer win")

    if fails:
        print("check_bashrc_path: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print(f"check_bashrc_path: OK -- sourcing etc/bashrc leaves recursive"
          f" `$(MAKE)` working (probed with a throwaway project carrying its"
          f" own `make/` directory, which is the actual failure, not the PATH"
          f" order that causes it), REPAIRS a PATH that already carries the"
          f" broken order rather than skipping because it finds itself on it,"
          f" keeps {home} reachable for the"
          f" ./choupoSolve symlinks, and keeps bin/ ahead of the system"
          f" directories.  NOT CHECKED: zsh and the POSIX fallback branch,"
          f" which resolve their own location differently; and whether"
          f" `make wasm` itself succeeds, which needs emscripten -- what is"
          f" established is that the PATH no longer stops it starting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
