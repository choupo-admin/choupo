#!/usr/bin/env python3
"""check_guide_paths -- every path a MANUAL cites must exist in the tree.

WHY.  The guides are the one artefact with no compiler behind them.  A dict
key nobody reads gets caught, a stale golden gets caught, a stale generated
doc gets caught -- but a manual can send a reader to a file that was deleted
two hundred commits ago and nothing anywhere notices.  On 2026-08-14 the
developer guide was still offering `src/outerDriver/FitBinaryPair.{H,cpp}` as
one of "two concrete examples to read first"; that driver had been RETIRED,
its file removed, and the registration kept only so an old case gets a
refusal naming its replacement.  The guide's source-tree diagram was missing
`result/` and `curation/` -- the two subsystems the layering slice ADDED --
and listed a `tests/` directory that does not exist.

A manual that sends a reader to a file that is not there costs more than a
manual that says nothing: the reader concludes the tree is wrong, or that
they have misunderstood the layout, and either way they stop trusting the
document that was supposed to orient them.

WHAT IT CHECKS.  Every token in `docs/*.tex` that looks like a repository
path (starts with a known root and survives the placeholder filter below)
must resolve -- either exactly, or as a stem whose siblings exist
(`src/control/PIDController` is satisfied by `PIDController.H`).

WHAT IT DOES *NOT* CHECK, and this matters before anyone reads a green run
as more than it is:
  * whether the PROSE about a path is true.  This gate confirms
    `src/solver/NewtonND.cpp` exists, not that the paragraph describing it
    is still accurate.  Prose staleness is deliberately not gated (three
    attempts, three failures: a text search cannot tell a live claim from a
    recorded one).
  * NUMBERS in the manuals.  "four cases ship an expected" was wrong by two
    orders of magnitude and no path check would have seen it.
  * any manual that is not a `.tex` under `docs/`.
  * paths that appear only inside a figure, or built by string concatenation.

SABOTAGE-VERIFIED 2026-08-14, observed output:
  S1  a guide bullet repointed at `src/outerDriver/DeletedDriver.cpp` ->
      "docs/developerGuide.tex:1581: cites ..., which is not in the tree",
      exit 1.  That is the FitBinaryPair defect, reproduced.
  S2  `tutorials/steady/flash/flash01...` rewritten to the pre-2026 layout
      `tutorials/flash/flash01...` -> caught at developerGuide.tex:1839.
  S3  `mkdir tutorials/steady/flash/myFlash` -> the allowance fires in the
      OTHER direction: "now EXISTS -- it is no longer something the reader
      creates".  An allowlist nobody re-examines becomes a blindfold.

Its own first run caught two flaws in itself, which is the argument for
running a new gate before believing it: a TikZ style key (`src/.style`) read
as a path, and a run-output path (`.../log`) whose presence depended on
whether anyone had run the case.

Exit 0 = every cited path resolves.  Exit 1 = at least one does not.
"""

import os
import re
import sys
from glob import glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROOTS = ('tutorials', 'src', 'bin', 'data', 'gui', 'make', 'etc', 'docs')
TOKEN = re.compile(r'(?:' + '|'.join(ROOTS) + r')/[A-Za-z0-9_./+-]*')

#  A token that is CUT SHORT by one of these is a template, not a path:
#  `data/materials/<name>.dat`, `src/\{core,thermo\}`, `evaporator0*`,
#  `data/standards/\allowbreak parameters/`.  Judging them would be judging
#  a placeholder, so they are skipped -- and skipping them is why the gate
#  can be strict about everything else.
PLACEHOLDER_NEXT = set('<*{\\')

#  Run OUTPUTS are absent in a clean clone and present the moment anyone runs
#  the case, so judging them would make the verdict depend on whether a case
#  happened to have been run -- a gate whose answer moves with the working
#  directory is not a gate.  They are skipped, and that is stated below.
RUN_OUTPUT_TAILS = ('/log', '/converged', '/reports', '/iterations', '/design',
                    '/economics')

#  Paths the reader is told to CREATE.  Each carries the recipe it belongs
#  to; an entry with no reason is not allowed to sit here quietly.
CREATED_BY_THE_READER = {
    'tutorials/steady/flash/myFlash':
        'Recipe: "your first case" -- the reader authors it',
    'tutorials/myOp01_quick_smoke':
        'Recipe A step 6 -- the smoke case for the unit op being added',
    'tutorials/steady/userops/splitter01_isothermal':
        'Recipe A -- the isothermalSplitter example case',
    'tutorials/steady/userops/splitter01_isothermal/expected':
        'Recipe A step 7 -- the golden the reader records',
    'src/unitOperations/mixer/IsothermalSplitter.H':
        'Recipe A -- the unit op the reader writes',
    'src/unitOperations/mixer/IsothermalSplitter.cpp':
        'Recipe A -- the unit op the reader writes',
    'src/thermo/vaporPressure/Clapeyron.H':
        'Recipe B -- the property model the reader writes',
    'src/thermo/vaporPressure/Clapeyron.cpp':
        'Recipe B -- the property model the reader writes',
    'gui/schemas/operations/myOp.schema.json':
        'Recipe A -- the GUI schema the reader adds for their type',
}


def resolves(rel):
    p = os.path.join(ROOT, rel)
    if os.path.exists(p):
        return True
    #  A reference without an extension is satisfied by any sibling sharing
    #  the stem: the guides write `src/io/SolutionWriter`, the tree carries
    #  `.H` and `.cpp`.
    return bool(glob(p + '.*'))


def main():
    misses, checked = [], 0
    for tex in sorted(glob(os.path.join(ROOT, 'docs', '*.tex'))):
        with open(tex, encoding='utf-8', errors='replace') as fh:
            for lineno, raw in enumerate(fh, 1):
                line = raw.replace('\\_', '_')
                for m in TOKEN.finditer(line):
                    tok = m.group(0)
                    nxt = line[m.end():m.end() + 1]
                    if nxt in PLACEHOLDER_NEXT or tok.endswith('/'):
                        continue
                    #  `src/.style` is a TikZ style key, not a path: a real
                    #  path component never begins with a dot.  Caught by the
                    #  gate's own first run, which is the argument for running
                    #  a new gate before believing its output.
                    if any(part.startswith('.') for part in tok.split('/')[1:]):
                        continue
                    if any(tok.endswith(t) for t in RUN_OUTPUT_TAILS):
                        continue
                    tok = tok.rstrip('.,;:)]}-')
                    if tok.count('/') < 1 or not tok:
                        continue
                    checked += 1
                    if tok in CREATED_BY_THE_READER or resolves(tok):
                        continue
                    misses.append((os.path.relpath(tex, ROOT), lineno, tok))

    #  An allowance that has become real is also drift -- in the other
    #  direction.  It means the guide is now citing something that EXISTS
    #  while this file still claims the reader has to create it.
    stale = [k for k in CREATED_BY_THE_READER if resolves(k)]

    if misses or stale:
        print('check_guide_paths: FAIL')
        for f, n, t in misses:
            print(f'  {f}:{n}: cites `{t}`, which is not in the tree')
        for k in stale:
            print(f'  allowance `{k}` now EXISTS -- it is no longer something '
                  f'the reader creates; remove it from CREATED_BY_THE_READER')
        return 1

    print(f'check_guide_paths: OK -- {checked} path citations across the .tex '
          f'manuals all resolve ({len(CREATED_BY_THE_READER)} allowed as '
          f'paths the reader is told to create).  NOT checked: whether the '
          f'PROSE about a path is true, any NUMBER stated in a manual, '
          f'anything outside docs/*.tex, or run OUTPUTS (log/, converged/, '
          f'reports/ ...), which a clean clone does not have.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
