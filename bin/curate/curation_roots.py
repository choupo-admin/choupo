#!/usr/bin/env python3
"""THE CURATION ROOTS -- the ONE home of where a curation case lives
(DEV.md 4c C295).

A case `bin/choupo-curate` (or `pairs_c283.py`, `pairs_px.py`,
`c287_new_components.py`) WRITES is the TRACE of how a catalogue record was
fitted -- its declaration, its evidence, its result -- not a tutorial.  So it
lives beside the data it justifies, under `data/curation/<origin>/`, keeping
its directory name `curateNN_<name>`:

    data/curation/pairs/       binary pairs (bubble-T and bubble-P regressions)
    data/curation/vp/          pure-component vapour pressures
    data/curation/components/  the cases that load and exercise new components

The hand-written TEACHING cases (curate01..19, and the synthetic ThermoML
fixtures they read) stay in `tutorials/props/curation/`: they are tutorials.

Split by ORIGIN, never by number: the numbers of three generals overlap
(`curate287_new_components` beside `curate287_nrtl_...`), so a case is found
by its directory, and a NEW number is taken over EVERY root at once
(`next_number`), exactly as it was when all of them shared one folder.

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
ORIGINS = ("pairs", "vp", "components")
TEACHING_REL = "tutorials/props/curation"

CURATION = ROOT / CURATION_REL
PAIRS = CURATION / "pairs"
VP = CURATION / "vp"
COMPONENTS = CURATION / "components"
TEACHING = ROOT / TEACHING_REL

_NUMBER = re.compile(r"curate(\d+)_")


def origin_rels():
    """The origin roots, repository-relative, in ORIGINS order."""
    return [f"{CURATION_REL}/{o}" for o in ORIGINS]


def all_rels():
    """Every root a curateNN case may live in (teaching first)."""
    return [TEACHING_REL] + origin_rels()


def all_case_dirs(base=ROOT):
    """Every `curateNN_*` directory under every root of `base` (a checkout),
    sorted by name -- the scan the tools did over the one shared folder."""
    out = []
    for rel in all_rels():
        d = Path(base) / rel
        if d.is_dir():
            out.extend(p for p in d.iterdir() if p.is_dir() and _NUMBER.match(p.name))
    return sorted(out, key=lambda p: p.name)


def case_roots(base=ROOT):
    """Every root a CASE of the corpus lives under: `tutorials/` and the
    curation traces.  A gate that sweeps cases for what they DECLARE (a
    record, a dossier, a seal, a golden) sweeps both, or a moved case
    leaves its scope in silence."""
    return [Path(base) / "tutorials", Path(base) / CURATION_REL]


def numbers(base=ROOT):
    return [int(_NUMBER.match(p.name).group(1)) for p in all_case_dirs(base)]


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
