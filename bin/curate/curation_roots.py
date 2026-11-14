#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""THE CURATION ROOTS -- the ONE home of where a curation case lives
(DEV.md 4c C295, names ruled by C296).

A case `bin/choupo-curate` (or `pairs_c283.py`, `pairs_px.py`,
`c287_new_components.py`) WRITES is the TRACE of how a catalogue record was
fitted -- its declaration, its evidence, its result -- not a tutorial.  So it
lives beside the data it justifies, under `data/curation/`, NAMED BY WHAT IT
FITS and carrying no number (C296):

    data/curation/pairs/<a>-<b>/          one pair case; <a>-<b> is EXACTLY the
                                          stem of the record
                                          data/standards/parameters/NRTL/<a>-<b>.dat
                                          (byte order, alphaPairFilename)
    data/curation/pairs/<a>-<b>/Tx/       a pair with TWO live cases keeps both
    data/curation/pairs/<a>-<b>/Px/       as siblings, named by the kind of data
                                          (two cases of ONE kind: the bulk run
                                          is `Tx`, the C282 pilot that held a
                                          laboratory out is `Tx-heldout`)
    data/curation/components/<name>/      a pure-component vapour pressure
                                          (<name> = the component record's stem)
    data/curation/batches/<name>/         a case that loads several components
    data/curation/electrolytes/<c>-<a>/   one salt (DEV.md 4c C311): Pitzer and
                                          eNRTL fitted to gamma_pm and phi;
                                          <c>-<a> is EXACTLY the stem of
                                          parameters/Pitzer/pairs/<c>-<a>.dat
                                          and parameters/eNRTL/<c>-<a>.dat
                                          (cation first, as the engine reads)

The hand-written TEACHING cases (curate01..14, and the synthetic ThermoML
fixtures they read) stay in `tutorials/props/curation/`: they are tutorials.

A case is found by WALKING, never by a number: a directory under the origin
roots that holds `system/controlDict`.  The direction (i, j) of a pair lives
inside the case (`case_pair`), never in the name.  No symbolic link anywhere
under data/ (gate check_no_symlinks).

Importable (the Python tools) and runnable (the shell tools):

    curation_roots.py            prints the curation root, `data/curation`
    curation_roots.py --origins  prints one origin root per line
    curation_roots.py --teaching prints `tutorials/props/curation`
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CURATION_REL = "data/curation"
ORIGINS = ("pairs", "components", "batches", "electrolytes")
TEACHING_REL = "tutorials/props/curation"

CURATION = ROOT / CURATION_REL
PAIRS = CURATION / "pairs"
COMPONENTS = CURATION / "components"
BATCHES = CURATION / "batches"
ELECTROLYTES = CURATION / "electrolytes"
TEACHING = ROOT / TEACHING_REL

_NUMBER = re.compile(r"curate(\d+)_")
_ORIENT = re.compile(r"binaryParameters\.([A-Za-z0-9]+)-([A-Za-z0-9]+)\.b_ij")


def origin_rels():
    """The origin roots, repository-relative, in ORIGINS order."""
    return [f"{CURATION_REL}/{o}" for o in ORIGINS]


def pair_stem(c1, c2):
    """The record stem of a pair, in the byte order the engine sorts."""
    return "-".join(sorted((c1, c2)))


def is_case(p):
    return (Path(p) / "system" / "controlDict").is_file()


def generated_case_dirs(base=ROOT):
    """Every generated case under `base` (a checkout): a directory under an
    origin root that holds system/controlDict, any depth (`<a>-<b>/Tx`)."""
    out = []
    for rel in origin_rels():
        d = Path(base) / rel
        if d.is_dir():
            out.extend(c.parent.parent for c in d.glob("**/system/controlDict"))
    return sorted(out)


def teaching_case_dirs(base=ROOT):
    d = Path(base) / TEACHING_REL
    if not d.is_dir():
        return []
    return sorted(p for p in d.iterdir() if p.is_dir() and _NUMBER.match(p.name))


def all_case_dirs(base=ROOT):
    """Every curation case of `base`: the teaching ones, then the generated."""
    return teaching_case_dirs(base) + generated_case_dirs(base)


def case_roots(base=ROOT):
    """Every root a CASE of the corpus lives under: `tutorials/` and the
    curation traces.  A gate that sweeps cases for what they DECLARE (a
    record, a dossier, a seal, a golden) sweeps both, or a moved case
    leaves its scope in silence."""
    return [Path(base) / "tutorials", Path(base) / CURATION_REL]


def label(case):
    """The case's name for prose: its path under data/curation with the origin
    dropped, e.g. `acetone-methanol`, `ethanol-water/Tx`."""
    try:
        rel = Path(case).resolve().relative_to(CURATION.resolve())
    except ValueError:
        return Path(case).name
    return "/".join(rel.parts[1:]) or rel.name


def pair_stem_of(case):
    """The record stem a pairs/ case fits, from its path."""
    rel = Path(case).resolve().relative_to(PAIRS.resolve())
    return rel.parts[0]


def case_pair(case):
    """(c1, c2) of a pairs/ case in the direction the case declares (read
    from its propsDict), or the record's byte order when it declares none."""
    pd = Path(case) / "system" / "propsDict"
    if pd.is_file():
        m = _ORIENT.search(pd.read_text())
        if m:
            return m.group(1), m.group(2)
    a, b = pair_stem_of(case).split("-")
    return a, b


def pair_cases(base=ROOT):
    """[(case dir, c1, c2)] for every generated pair case, sorted by path."""
    out = []
    d = Path(base) / CURATION_REL / "pairs"
    for c in generated_case_dirs(base):
        try:
            c.relative_to(d)
        except ValueError:
            continue
        a, b = case_pair(c)
        out.append((c, a, b))
    return out


def new_pair_case_dir(c1, c2, kind):
    """Where a NEW pair case is born.  The pair's directory is the case when
    the pair has one case; `kind` (`Tx` or `Px`) names a sibling when it has
    two.  A pair that already has ONE case directly in its directory and wants
    a second needs the first moved under `<kind>/` by hand: refused."""
    d = PAIRS / pair_stem(c1, c2)
    if not d.exists():
        return d
    if is_case(d):
        raise FileExistsError(
            f"{d.relative_to(ROOT)} is already a case: a second case of the pair needs "
            f"the first moved to {d.relative_to(ROOT)}/<Tx|Px> by hand (a rename that "
            f"keeps history), then this one is born beside it")
    k = d / kind
    if k.exists():
        raise FileExistsError(f"{k.relative_to(ROOT)} exists -- never overwritten")
    return k


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--origins"]:
        print("\n".join(origin_rels()))
    elif a == ["--teaching"]:
        print(TEACHING_REL)
    elif not a:
        print(CURATION_REL)
    else:
        sys.exit("usage: curation_roots.py [--origins | --teaching]")
