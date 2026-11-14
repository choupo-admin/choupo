#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_gates_judge_tracked -- a gate's verdict is a property of the COMMIT.

WHAT THIS HOLDS (DEV.md 4c C170 item 4; record
docs/design/gates-judge-the-tracked-tree.md).  Vitor's laptop swept 752 PASS /
15 FAIL on a main that passed in the container, and part of the difference was
the machine rather than the corpus: `data/local/` (the private gitignored
working tier) and untracked files.  A gate that walks a directory judges
whatever is on THAT disk.  The gates below were converted to read the files
`git ls-files` lists (`bin/curate/tracked_tree.py`), and this gate keeps them
converted by BEHAVIOUR, not by grep:

  (a) for each converted gate, an UNTRACKED file that violates exactly the
      rule the gate enforces is created in the tracked tier's own directory
      (and, where the gate used to read it, under `data/local/`); the gate
      must still exit 0 and must say it did NOT judge untracked/private
      files;
  (b) the NEGATIVE CONTROL, without which (a) could be a gate that judges
      nothing: the same violation, made TRACKED in a throw-away copy of the
      index (`GIT_INDEX_FILE` + `git add -N`; the real index is never
      touched), must make that gate exit non-zero;
  (c) `tracked_tree` itself refuses, by name and with exit 1, when
      `git ls-files` cannot enumerate the tree (a gate that cannot see what
      it audits must not pass): run from a directory that is not a
      repository.

WHAT IT DOES NOT HOLD.  That EVERY gate is converted: ~130 gates glob or walk
a directory, and only the ones listed in CONVERTED were MEASURED to change
their verdict or their claim with the presence of private or untracked files
(the measurement is in the record).  A gate not listed is not thereby
immune; a new probe row is the way to add one.  Gates whose SUBJECT is the
private tier (`check_evidence_records`, `check_evidence_partition`) are not
converted: they say what they check about it in their own claim.

Exit 1 naming the arm that failed.

    Copyright (C) 2026 Vítor Geraldes
    Licence: GPL-3.0-or-later
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
"""
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

TAG = "zzc170" + uuid.uuid4().hex[:8]

#  gate -> list of (relative path of the probe, text).  Each text violates the
#  rule the gate enforces and nothing else.  `{T}` is the unique tag.
DUP = "name {T};\nMW 10;\nMW 11;\n"
PROBES = {
    "check_duplicate_keys.py": [
        ("data/standards/components/{T}.dat", DUP),
        ("data/local/components/{T}.dat", DUP),
        ("tutorials/steady/{T}/constant/{T}.dat", DUP),
    ],
    "check_glossary_bans.py": [
        ("docs/{T}.md", ("The " + "tr" + "ue basis of the ledger.\n")),
        ("data/local/{T}.md", ("The " + "tr" + "ue basis of the ledger.\n")),
    ],
    "check_source_licence.py": [
        ("data/standards/components/{T}.dat",
         "name {T};\nprovenance { source \"GRI-Mech 3.0 thermo file\"; }\n"),
    ],
    #  The engine falls back to data/local/ for a pair the standards lack, so a
    #  private acetone pair turned this gate's "uncurated pair" probes into
    #  curated ones and the gate FAILED on the machine (C170).  The probe is a
    #  copy of a real pair file under the two names the gate leaves uncurated (its own case-local probe
    #  component zzprobeacetone, which no catalogue carries).
    "check_problem_divergence.py": [
        ("data/local/parameters/NRTL/water-zzprobeacetone.dat",
         "@copy:data/standards/parameters/NRTL/ethanol-water.dat"),
        ("data/local/parameters/NRTL/methanol-zzprobeacetone.dat",
         "@copy:data/standards/parameters/NRTL/ethanol-water.dat"),
    ],
    "check_registry_scan.py": [
        ("data/standards/parameters/NRTL/{T}b-{T}a.dat", "name x;\n"),
        ("data/local/parameters/NRTL/{T}b-{T}a.dat", "name x;\n"),
    ],
}

#  gate -> ONE probe that is made TRACKED for the negative control.
CONTROL = {
    "check_duplicate_keys.py": "data/standards/components/{T}.dat",
    "check_glossary_bans.py": "docs/{T}.md",
    "check_source_licence.py": "data/standards/components/{T}.dat",
    "check_registry_scan.py": "data/standards/parameters/NRTL/{T}b-{T}a.dat",
    "check_problem_divergence.py": "data/standards/parameters/NRTL/water-zzprobeacetone.dat",
}

#  The claim line must say what was NOT judged.
NOT_JUDGED = {
    "check_duplicate_keys.py": "NOT judged",
    "check_glossary_bans.py": "NOT judged",
}


def run(gate, env=None, cwd=None):
    p = subprocess.run([sys.executable, str(HERE / gate)], capture_output=True,
                       text=True, timeout=900, cwd=str(cwd or ROOT), env=env)
    return p.returncode, (p.stdout + p.stderr)


def write(rel, text, made):
    path = ROOT / rel.replace("{T}", TAG)
    if path.exists():
        #  NEVER overwrite or delete a file that is already there: on a machine
        #  with private data the condition this probe plants already holds,
        #  and the file is the owner's.  The gate is judged with it in place.
        return None
    new_dirs = []
    d = path.parent
    while not d.exists():
        new_dirs.append(d)
        d = d.parent
    path.parent.mkdir(parents=True, exist_ok=True)
    if text.startswith("@copy:"):
        text = (ROOT / text[len("@copy:"):]).read_text()
    path.write_text(text.replace("{T}", TAG))
    made.append((path, new_dirs))
    return path


def cleanup(made):
    for path, new_dirs in reversed(made):
        try:
            path.unlink()
        except OSError:
            pass
        for d in new_dirs:
            shutil.rmtree(d, ignore_errors=True)


def main() -> int:
    fail = []
    made = []
    nUntracked = nControl = 0
    try:
        for gate, probes in PROBES.items():
            rc0, out0 = run(gate)
            if rc0 != 0:
                fail.append(f"{gate}: fails on the clean tree before any probe "
                            f"(rc={rc0}); this gate cannot judge the arm:\n"
                            + out0[-400:])
                continue
            for rel, text in probes:
                write(rel, text, made)
            try:
                rc, out = run(gate)
            finally:
                cleanup(made)
                made.clear()
            if rc != 0:
                fail.append(f"(a) {gate}: an UNTRACKED / data/local violation "
                            f"changed the verdict (rc={rc}) -- the gate judges "
                            "the disk, not the commit:\n      " + out[-500:])
                continue
            if gate in NOT_JUDGED and NOT_JUDGED[gate] not in out:
                fail.append(f"(a) {gate}: passed, but its claim does not say "
                            f"'{NOT_JUDGED[gate]}' about untracked/private files")
                continue
            nUntracked += 1

            # ---- (b) negative control through a throw-away index -----------
            rel = CONTROL[gate]
            texts = dict(PROBES[gate])
            path = write(rel, texts.get(rel, PROBES[gate][-1][1]), made)
            if path is None:
                fail.append(f"(b) {gate}: the control path {rel} already "
                            "exists, so the control cannot be staged")
                continue
            idx = Path(tempfile.mkdtemp(prefix="c170idx-")) / "index"
            try:
                gi = subprocess.run(["git", "rev-parse", "--git-path", "index"],
                                    cwd=str(ROOT), capture_output=True,
                                    text=True).stdout.strip()
                shutil.copy(gi if os.path.isabs(gi) else str(ROOT / gi), idx)
                env = dict(os.environ, GIT_INDEX_FILE=str(idx))
                a = subprocess.run(["git", "add", "-N", "--",
                                    str(path.relative_to(ROOT))],
                                   cwd=str(ROOT), env=env, capture_output=True,
                                   text=True)
                if a.returncode != 0:
                    fail.append(f"(b) {gate}: could not stage the control "
                                "probe in the scratch index: " + a.stderr[-200:])
                    continue
                rcc, outc = run(gate, env=env)
            finally:
                cleanup(made)
                made.clear()
                shutil.rmtree(idx.parent, ignore_errors=True)
            if rcc == 0:
                fail.append(f"(b) {gate}: the SAME violation, tracked, did not "
                            "fail the gate -- (a) proves nothing, the gate "
                            "judges nothing")
            else:
                nControl += 1

        # ---- (c) the helper refuses when it cannot enumerate ---------------
        with tempfile.TemporaryDirectory(prefix="c170nogit-") as nogit:
            r = subprocess.run(
                [sys.executable, "-c",
                 "import sys; sys.path.insert(0, %r); "
                 "from tracked_tree import tracked_files; "
                 "tracked_files(%r, 'data', gate='probe')" % (str(HERE), nogit)],
                capture_output=True, text=True, timeout=60)
        if r.returncode == 0 or "CANNOT RUN" not in r.stdout:
            fail.append("(c) tracked_tree returned from a directory that is "
                        "not a repository instead of refusing by name:\n      "
                        + (r.stdout + r.stderr)[-300:])
    finally:
        cleanup(made)

    if fail:
        print("check_gates_judge_tracked: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"check_gates_judge_tracked: OK -- {nUntracked} of {len(PROBES)} "
          "converted gates keep their verdict when an UNTRACKED file and a "
          f"data/local/ file violate their rule, and {nControl} of {len(CONTROL)}"
          " FAIL on the same violation once it is tracked (scratch index, the "
          "real one untouched); tracked_tree refuses by name outside a "
          "repository.  NOT checked: the ~130 other gates that walk a "
          "directory (only the converted ones were measured to differ), and "
          "gates whose subject is the private tier itself.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
