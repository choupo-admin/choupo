#!/usr/bin/env python3
"""Deterministic structural and unit-conversion audit of staged ChemSep pairs."""

import hashlib
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PAIR_ROOT = ROOT / 'data/local/binaryPairs'
SOURCE_ROOT = ROOT / 'thirdParty/chemsep/ipd'
REPORT = ROOT / 'data/local/CHEMSEP-PAIR-AUDIT.md'
R_CAL = 1.98720425864083
CAL2J = 4.184


def scalar(text: str, key: str):
    match = re.search(rf'^\s*{re.escape(key)}\s+([-+0-9.eE]+)\s*;',
                      text, re.MULTILINE)
    return float(match.group(1)) if match else None


def word(text: str, key: str):
    match = re.search(rf'^\s*{re.escape(key)}\s+"?([^;"\s]+)"?\s*;',
                      text, re.MULTILINE)
    return match.group(1) if match else None


def close(actual, expected):
    return actual is not None and math.isfinite(actual) and math.isclose(
        actual, expected, rel_tol=2e-5, abs_tol=2e-5)


def component_names():
    return {path.stem for tier in ('standards', 'proposed')
            for path in (ROOT / f'data/{tier}/components').glob('*.dat')}


def audit(path: Path, known: set):
    text = path.read_text(errors='ignore')
    problems = []
    model = word(text, 'model')
    expected_model = path.parent.name
    if model != expected_model:
        problems.append(f'model {model!r} != directory {expected_model}')
    comp = re.search(r'^\s*components\s*\(\s*(\S+)\s+(\S+)\s*\)\s*;',
                     text, re.MULTILINE)
    if not comp:
        return ['missing two-component list']
    a, b = comp.groups()
    i, j = word(text, 'i'), word(text, 'j')
    if [i, j] != sorted((a, b)):
        problems.append(f'parameters direction {i}-{j} != sorted components {a}-{b}')
    for name in (a, b):
        if name not in known:
            problems.append(f'orphan component {name}')
    base = re.sub(r'\.alt\d+$', '', path.stem)
    if base != f'{i}-{j}':
        problems.append(f'filename {path.stem} != {i}-{j}[.altN]')

    source_file = word(text, 'sourceFile')
    source_sha = word(text, 'sourceSha256')
    source = SOURCE_ROOT / source_file if source_file else None
    if not source or not source.exists():
        problems.append(f'missing source file {source_file!r}')
    elif hashlib.sha256(source.read_bytes()).hexdigest() != source_sha:
        problems.append('source SHA-256 mismatch')
    if word(text, 'origin') != 'literature':
        problems.append('origin is not literature')
    if word(text, 'license') != 'Artistic-2.0':
        problems.append('license is not Artistic-2.0')
    if 'state pending;' not in text:
        problems.append('review state is not pending')

    raw = dict(re.findall(r'^\s*A_(\S+)\s+([-+0-9.eE]+)\s*;',
                          text, re.MULTILINE))
    raw_ij = float(raw[f'{i}_{j}']) if f'{i}_{j}' in raw else None
    raw_ji = float(raw[f'{j}_{i}']) if f'{j}_{i}' in raw else None
    if raw_ij is None or raw_ji is None:
        problems.append('raw directional energies missing')
    elif model == 'NRTL':
        if not close(scalar(text, 'a_ij'), 0.0) or not close(scalar(text, 'a_ji'), 0.0):
            problems.append('NRTL a_ij/a_ji are not zero')
        if not close(scalar(text, 'b_ij'), raw_ij / R_CAL):
            problems.append('NRTL b_ij conversion mismatch')
        if not close(scalar(text, 'b_ji'), raw_ji / R_CAL):
            problems.append('NRTL b_ji conversion mismatch')
        alpha_values = re.findall(r'^\s*alpha\s+([-+0-9.eE]+)\s*;', text, re.MULTILINE)
        if len(alpha_values) != 2 or not close(float(alpha_values[0]), float(alpha_values[1])):
            problems.append('NRTL alpha source/parameter mismatch')
    elif model == 'UNIQUAC':
        if not close(scalar(text, 'a_ij'), raw_ij / R_CAL):
            problems.append('UNIQUAC a_ij conversion mismatch')
        if not close(scalar(text, 'a_ji'), raw_ji / R_CAL):
            problems.append('UNIQUAC a_ji conversion mismatch')
    elif model == 'Wilson':
        if not close(scalar(text, 'A_ij'), raw_ij * CAL2J):
            problems.append('Wilson A_ij conversion mismatch')
        if not close(scalar(text, 'A_ji'), raw_ji * CAL2J):
            problems.append('Wilson A_ji conversion mismatch')
    return problems


def main():
    known = component_names()
    rows = []
    files = sorted(PAIR_ROOT.glob('*/*.dat'))
    for path in files:
        problems = audit(path, known)
        if problems:
            rows.append((path.relative_to(ROOT), '; '.join(problems)))
    passed = len(files) - len(rows)
    lines = ['# ChemSep staged binary-pair audit', '',
             'Checks identity, model/direction, source SHA-256, licence, review state, '
             'finite parameters and exact unit conversion from the retained raw energies.', '',
             f'- files: **{len(files)}**', f'- PASS: **{passed}**',
             f'- FAIL: **{len(rows)}**', '']
    if rows:
        lines += ['| file | problems |', '|---|---|']
        lines += [f'| `{path}` | {problems} |' for path, problems in rows]
    else:
        lines.append('No violations.')
    REPORT.write_text('\n'.join(lines) + '\n')
    print(f'ChemSep pair audit: {passed}/{len(files)} PASS, {len(rows)} FAIL')
    print(f'wrote {REPORT.relative_to(ROOT)}')
    return 1 if rows else 0


if __name__ == '__main__':
    raise SystemExit(main())
