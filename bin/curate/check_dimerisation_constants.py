#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""A vapour-dimerisation constant is read off the table of the substance it names.

2026-11-03 (DEV.md 4c C201): `aceticAcid-dissolution.dat` carried
`logK25 2.555` from 2026-08-24.  That is the METHANOIC (formic) acid pair of
Chao & Zwolinski, J. Phys. Chem. Ref. Data 7, 363 (1978), Tables 4 and 6
(125.543 - 2 x 61.494); the ETHANOIC pair is Tables 11 and 12
(134.265 - 2 x 65.579 = 3.107 atm^-1).  The record carried acetic acid's dH
with formic acid's K -- 3.5x too small -- and no gate could see it, because a
golden pins what a run prints.

This gate holds the stored constant to the formation properties of the
substance, which are kept HERE as the page-checked table values:

  1. the standards record's logK25 equals log Kf(dimer) - 2 log Kf(monomer)
     of the ETHANOIC tables, within the table's own rounding (0.002), and its
     dH equals dHf(dimer) - 2 dHf(monomer) (-63.18 kJ/mol) within 0.1;
  2. every case mirror of the record carries the same logK25 and dH as the
     standards record (an adopted mirror is not hash-enforced, so it can drift);
  3. the formic-acid constant (2.555) is named as the wrong one: it must not
     appear as a logK25 anywhere in a vapourDimerisation block.

NOT checked: that the table values themselves are right (they were read from
the page images of the JPCRD reprint, srd.nist.gov/jpcrdreprint/1.555571.pdf),
and any dimerisation record other than acetic acid's (none exists).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REC = ROOT / "data/standards/chemistry/aceticAcid-dissolution.dat"

# Chao & Zwolinski 1978, ETHANOIC acid, 298.15 K (page-checked)
LOGKF_MONOMER = 65.579    # Table 11
LOGKF_DIMER = 134.265     # Table 12
DHF_MONOMER = -432.25     # kJ/mol, Table 11
DHF_DIMER = -927.68       # kJ/mol, Table 12
FORMIC_WRONG = 2.555      # Tables 4/6/8 of the METHANOIC acid


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


def block(path):
    t = strip(path.read_text())
    m = re.search(r'vapourDimerisation\s*\{(.*?)\}', t, re.S)
    if not m:
        return None
    k = re.search(r'logK25\s+(-?[\d.]+)\s*;', m.group(1))
    h = re.search(r'dH\s+(-?[\d.eE+]+)\s*;', m.group(1))
    return (float(k.group(1)) if k else None, float(h.group(1)) if h else None)


bad = []
std = block(REC)
if std is None or std[0] is None or std[1] is None:
    print(f"check_dimerisation_constants: FAIL -- {REC} has no readable vapourDimerisation block")
    sys.exit(1)
logk_expected = LOGKF_DIMER - 2 * LOGKF_MONOMER
dh_expected = (DHF_DIMER - 2 * DHF_MONOMER) * 1000.0
if abs(std[0] - logk_expected) > 0.002:
    bad.append(f"standards logK25 {std[0]} != ethanoic log Kf(dimer) - 2 log Kf(monomer) = {logk_expected:.3f}")
if abs(std[1] - dh_expected) > 100.0:
    bad.append(f"standards dH {std[1]} != dHf(dimer) - 2 dHf(monomer) = {dh_expected:.0f} J/mol")

mirrors = sorted((ROOT / "tutorials").rglob("chemistry/aceticAcid-dissolution.dat"))
for p in mirrors:
    b = block(p)
    if b != std:
        bad.append(f"{p.relative_to(ROOT)}: vapourDimerisation {b} != standards {std}")
for p in [REC] + mirrors:
    b = block(p)
    if b and b[0] is not None and abs(b[0] - FORMIC_WRONG) < 1e-9:
        bad.append(f"{p.relative_to(ROOT)}: logK25 {FORMIC_WRONG} is METHANOIC acid's constant")

if bad:
    print("check_dimerisation_constants: FAIL")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"check_dimerisation_constants: OK -- logK25 {std[0]} = ethanoic Tables 11/12 ({logk_expected:.3f}) and dH {std[1]:.0f} J/mol "
      f"= {dh_expected:.0f}; {len(mirrors)} case mirror(s) carry the same pair.  NOT checked: the table values themselves "
      f"(page-checked 2026-11-02), nor any dimerisation record other than acetic acid's")
