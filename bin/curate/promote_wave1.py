#!/usr/bin/env python3
# promote_wave1.py -- execute the forum-ratified WAVE 1 promotion: the
# teaching-staple CoolProp ADD files data/proposed/components/ -> data/standards/
# components/.  Enforces the chair's deterministic gate IN SCRIPT (never trusts
# the self-anchoring Antoine number).  Promotes ONLY the explicit allowlist.
#
# Gates (ALL must hold, per file):
#   1. NEW: no same-name twin already in data/standards/components/.
#   2. allowlist membership (hard list -- anti-breadth; no refrigerant/isotope).
#   3. INDEPENDENT Ambrose-Walton self-check: recompute Psat(Tb) from the file's
#      own Tc/Pc/omega with AmbroseWalton.cpp's formula (NOT the file's fitted
#      Antoine, which is self-anchoring) and require AAD <= 5%.
#   4. PRIMARY citation named in-file (a real reference EOS), not "(unspecified)"
#      nor a self-referential "(citation in ...)".
#   5. CAS-dedupe: abort if any promoted CAS maps to >1 staged file; a lowercase
#      literature twin of the same CAS (heptane/nHeptane, ...) is left in
#      proposed/, never promoted alongside the camelCase CoolProp file.
#   6. no laundering: if a gibbsFormation block is present it must carry its
#      origin=estimated/method=Joback (or DERIVED) tag -- promoted verbatim.
#
# Action: plain mv (the human curation act; the engine itself refuses to write
# under data/standards/).  Commits NOTHING.

import re, sys, shutil, importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROP = ROOT / 'data/proposed/components'
STD  = ROOT / 'data/standards/components'

spec = importlib.util.spec_from_file_location(
    'validate_components', Path(__file__).with_name('validate_components.py'))
val = importlib.util.module_from_spec(spec); spec.loader.exec_module(val)

ATM = 101325.0

ALLOWLIST = ['nHeptane', 'nPentane', 'mXylene', 'pXylene', 'oXylene',
             'diethylEther', 'cyclohexane', 'nOctane', 'nNonane', 'nDecane',
             'isopentane', 'isohexane', 'neopentane', 'nButane']


def cas(text):
    m = re.search(r'(?m)^\s*CAS\s+([0-9][0-9-]*)\s*;', text)
    return m.group(1) if m else None


def primary_named(text):
    m = re.search(r'Reference EOS:\s*(.+)', text)
    if not m:
        return None
    s = m.group(1).strip()
    if not s or '(unspecified)' in s.lower() or '(citation in' in s.lower():
        return None
    return s


def aw_aad(text):
    Tc = val.scalar(text, 'Tc'); Pc = val.scalar(text, 'Pc')
    om = val.scalar(text, 'omega'); Tb = val.scalar(text, 'Tb')
    if None in (Tc, Pc, om, Tb):
        return None
    p = val.aw_psat(Tb, Tc, Pc * 1e5, om)        # Pc stored in bar -> Pa
    return abs(p - ATM) / ATM * 100.0


def gibbs_tagged_ok(text):
    """If a gibbsFormation block exists, it must show its estimate origin."""
    if 'gibbsFormation' not in text:
        return True
    blk = re.search(r'gibbsFormation\s*\{.*?\}', text, re.S)
    if not blk:
        return True
    b = blk.group(0)
    return ('origin=estimated' in b or 'Joback' in b or 'DERIVED' in b)


def build_std_cas():
    """CAS -> standard filename, over the existing frozen tree (catches a
    species already present under a DIFFERENT name, e.g. formula-named C4H10)."""
    m = {}
    for p in STD.glob('*.dat'):
        c = cas(p.read_text())
        if c:
            m[c] = p.stem
    return m


def main():
    # --- gate the whole batch first (no mv until every check passes) ---
    global STD_CAS
    STD_CAS = build_std_cas()
    staged, rejected = [], []
    cas_map = {}
    for name in ALLOWLIST:
        src = PROP / f'{name}.dat'
        dst = STD / f'{name}.dat'
        if not src.exists():
            rejected.append((name, 'absent from proposed/')); continue
        text = src.read_text()
        why = []
        if dst.exists():
            why.append('gate1: standards twin already exists (by name)')
        c = cas(text)
        if c is None:
            why.append('no CAS field')
        elif c in STD_CAS:
            # gate1b: a DIFFERENT-named standard already holds this CAS (e.g.
            # C4H10.dat == nButane, C8H18.dat == nOctane).  That is a REPLACE-
            # by-CAS, never a clean Wave-1 ADD -> reject (the flat by-name dir
            # must not hold one species twice).
            why.append(f'gate1b: CAS {c} already in standards as {STD_CAS[c]} (REPLACE-by-CAS, not an ADD)')
        a = aw_aad(text)
        if a is None:
            why.append('gate3: missing Tc/Pc/omega/Tb')
        elif a > 5.0:
            why.append(f'gate3: AW AAD {a:.2f}% > 5%')
        if not primary_named(text):
            why.append('gate4: no named primary EOS citation')
        if not gibbs_tagged_ok(text):
            why.append('gate6: gibbsFormation present without estimate tag (laundering)')
        if why:
            rejected.append((name, '; '.join(why))); continue
        cas_map.setdefault(c, []).append(name)
        staged.append((name, c, a))

    # --- gate5: CAS-dedupe across the staged batch + report leftover twins ---
    abort = False
    for c, files in cas_map.items():
        if len(files) > 1:
            print(f'ABORT gate5: CAS {c} maps to >1 staged file: {files}'); abort = True
    # lowercase literature twins left behind (informational, not promoted)
    twins = []
    for name, c, a in staged:
        for other in PROP.glob('*.dat'):
            if other.stem == name:
                continue
            if cas(other.read_text()) == c:
                twins.append((name, other.stem))
    if abort:
        sys.exit(1)

    # --- execute the mv ---
    print(f'WAVE 1 -- promoting {len(staged)} staples to data/standards/components/\n')
    for name, c, a in staged:
        src = PROP / f'{name}.dat'; dst = STD / f'{name}.dat'
        shutil.move(str(src), str(dst))
        print(f'  PROMOTED  {name:<14} CAS {c:<12} AW-AAD {a:.2f}%')
    if rejected:
        print('\n  NOT promoted:')
        for name, why in rejected:
            print(f'    - {name}: {why}')
    if twins:
        print('\n  lowercase literature twins LEFT in proposed/ (same CAS, not promoted):')
        for camel, twin in twins:
            print(f'    - {twin} (twin of promoted {camel})')
    print(f'\n  standards/ now: {len(list(STD.glob("*.dat")))} components.')


if __name__ == '__main__':
    main()
