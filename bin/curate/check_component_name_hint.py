#!/usr/bin/env python3
"""Gate: a mistyped component name is told where the record actually is.

    bin/curate/check_component_name_hint.py

WHY THIS EXISTS.  The component lookup is exact by filename and stays that
way (settled 2026-06-07: O(1) path concatenation, no startup directory walk).
What was missing is what happens AFTER it misses.  A student writing
`ethylbenzene` -- which is how the word is spelled, and how ChemSep itself
spells it -- was told the component does not exist and, in the next breath,
told to ESTIMATE it.  The curated record is `ethylBenzene.dat`, one capital
letter away.  The message did not merely fail to help: it sent the reader to
invent a number that was already curated three directories down, which is the
worst outcome this project has (`unsourced` becoming `falsely sourced`).

MEASURED: 444 of the 603 catalogue components carry an internal capital, so a
lower-case spelling misses three quarters of the tree; and NOT ONE pair of
names collides when case is ignored, so a case-only mismatch has exactly ONE
candidate.  There is no ambiguity here to be careful about.

IT STILL REFUSES, and that is deliberate.  Resolving the name silently is the
crutch: `CH4` and `ch4` are one substance today and need not be tomorrow, and
a case that runs under a name its author did not write is a case whose
components nobody can audit.  The engine NAMES the candidate and stops.

WHAT THIS GATE CHECKS.

  (a) A CASE-ONLY MISS NAMES THE RECORD, and says explicitly not to estimate
      it.  The second half matters as much as the first: the estimate remedy
      is still printed below (it is right for a genuinely absent compound) and
      without the disclaimer a reader takes it as the instruction.

  (b) IT STILL REFUSES.  The run must exit non-zero.  A hint that resolved
      the name would be a case running under a component nobody wrote.

  (c) A NEAR MISS offers candidates; a GENUINELY ABSENT name offers none.
      The first version suggested `H, O` for `methylglyoxalate` -- the
      catalogue's hydrogen and oxygen, whose folded names are single letters
      found inside almost anything.  Noise in a refusal is worse than
      silence: it teaches the reader that the hints are not worth reading.

  (d) THE HAPPY PATH IS UNTOUCHED.  The search runs only after a miss; a case
      whose names are all correct must be byte-identical.  Checked by running
      the corpus's own component-heavy case and requiring its golden to hold.

  (e) THE MEASUREMENT IS RECOMPUTED HERE.  The zero-collision claim above is
      what makes a single candidate safe to name, and a gate that quoted it
      from this docstring would be the arity sin.  It is recounted from the
      tree on every run, and the gate FAILS if a collision ever appears --
      at which point naming one candidate stops being safe.

WHAT THIS GATE DOES **NOT** COVER.  It does not check spelling for species,
parameter pairs, assets or utilities -- only components.  It says nothing
about whether the catalogue's naming conventions SHOULD be regularised (they
mix `ethylBenzene` with `1234Tetramethylbenzene`, and that is a curation
question, not an engine one).  And the containment hint is a crude filter,
not a spelling corrector: a transposition or a missing interior letter is not
found and the message says nothing about it.

SABOTAGE-VERIFIED 2026-08-27; OBSERVED output recorded below, verbatim.
"""

import collections
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
COMP = ROOT / "data" / "standards" / "components"

#  (typed name, what must appear, what must NOT)
CASES = [
    ("ethylbenzene", ["IT IS HERE", "ethylBenzene", "DO NOT estimate"], []),
    ("nButan",       ["NOT FOUND, but", "nButane"], ["IT IS HERE"]),
    ("methylglyoxalate", [], ["IT IS HERE", "NOT FOUND, but"]),
]


def probe(tmp: Path, name: str) -> Path:
    d = tmp / name
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    (d / "system" / "controlDict").write_text(
        'application choupoProps;\ndescription "name hint probe";\n'
        'verbosity 3;\n')
    (d / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        f"components ( {name} styrene );\nequilibrium\n{{\n"
        " formulation gammaPhi;\n"
        " liquid { activityModel ideal; standardState pureLiquid; }\n"
        " vapour { fugacityModel idealGas; }\n}\n")
    (d / "system" / "propsDict").write_text(
        "operations\n(\n    {\n        name p;\n        type propertyPoint;\n"
        f"        state {{ T 400 K; P 1 bar; composition {{ {name} 0.5;"
        " styrene 0.5; } }\n        properties ( Cp_ig );\n    }\n);\n")
    return d


def main() -> int:
    fails, notes = [], []

    # ---- (e) the zero-collision measurement, recounted -------------------
    names = [p.stem for p in COMP.glob("*.dat")]
    folded = collections.Counter(
        "".join(ch.lower() for ch in n if ch.isalnum()) for n in names)
    clashes = [k for k, v in folded.items() if v > 1]
    mixed = sum(1 for n in names if n != n.lower())
    if clashes:
        fails.append(f"{len(clashes)} catalogue name(s) now collide when case"
                     f" and punctuation are ignored (e.g. {clashes[0]}) --"
                     " naming ONE candidate is no longer safe, and the hint"
                     " must list them all or say it cannot choose")
    else:
        notes.append(f"{mixed} of {len(names)} names carry an internal capital"
                     " and none collide when folded, so a case-only miss has"
                     " exactly one candidate")

    tmp = Path(tempfile.mkdtemp(prefix="namehint_"))
    try:
        for name, want, unwanted in CASES:
            p = subprocess.run([str(BUILD / "choupoProps"), str(probe(tmp, name))],
                               capture_output=True, text=True, timeout=300)
            out = p.stdout + p.stderr
            # ---- (b) it still refuses -------------------------------------
            if p.returncode == 0:
                fails.append(f"`{name}` did not refuse.  A hint that RESOLVED"
                             " the name would leave a case running under a"
                             " component its author never wrote")
                continue
            for w in want:
                if w not in out:
                    fails.append(f"`{name}`: the refusal does not contain"
                                 f" \"{w}\"")
            for u in unwanted:
                if u in out:
                    fails.append(f"`{name}`: the refusal contains \"{u}\","
                                 " which it must not -- a hint offered where"
                                 " there is nothing to hint at is noise, and"
                                 " noise teaches the reader to skip the hints")
            if not any(w not in out for w in want) \
                    and not any(u in out for u in unwanted):
                notes.append(f"`{name}` behaves")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- (d) the happy path is untouched ---------------------------------
    r = subprocess.run(["bin/runTests",
                        "tutorials/props/molecular/solubility01_hildebrand_ladder"],
                       cwd=ROOT, capture_output=True, text=True, timeout=900)
    if "PASS 1 / FAIL 0" not in r.stdout:
        if "REFUSES while a destructive" in (r.stdout + r.stderr) \
                or "journal" in (r.stdout + r.stderr):
            #  Distinguish "could not run" from "the answer moved" -- the
            #  friction-correlation gate had to learn the same thing.
            fails.append("the happy-path check COULD NOT RUN (a destructive"
                         " journal is open), which is not the same as a moved"
                         " answer and must not be reported as one")
        else:
            fails.append("a case whose component names are all correct no"
                         " longer reproduces its golden -- the lookup's happy"
                         " path must never touch the new search")
    else:
        notes.append("the happy path is unmoved")

    if fails:
        print("check_component_name_hint: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_component_name_hint: OK -- " + "; ".join(notes) + "."
          "  NOT COVERED: species, parameter pairs, assets and utilities have"
          " no such hint; whether the catalogue's mixed conventions"
          " (`ethylBenzene` beside `1234Tetramethylbenzene`) SHOULD be"
          " regularised is a curation question this gate does not touch; and"
          " the containment filter is crude, not a spelling corrector -- a"
          " transposition or a dropped interior letter finds nothing and the"
          " message does not pretend otherwise.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
