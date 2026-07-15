#!/usr/bin/env python3
# validate_components.py -- deterministic VLE sanity check of the clean
# data/local/ candidate subset.  Style precedent: validate_salts.py
# (a python replica of the C++ kernel, AAD vs an independent anchor, markdown
# report mirroring parameters/electrolyte/VALIDATION.md).
#
# THE ANCHOR (no external data needed -- the file validates against ITSELF):
# a corresponding-states vapour-pressure model must reproduce the compound's
# own normal boiling point.  At Tb (a clean WIKIDATA/IUPAC value) the saturation
# pressure MUST be ~1 atm (101325 Pa) by definition.  We compute Psat(Tb) with
# the SAME Ambrose-Walton formula the C++ op uses (AmbroseWalton.cpp, replicated
# bit-for-bit below) from the file's own Tc/Pc/omega and report
#   AAD% = |Psat(Tb) - 1 atm| / 1 atm * 100.
# A large AAD means the Tc/Pc/omega/Tb quartet is internally inconsistent ->
# the file is marked DROP for promotion (never guessed/patched).
#
# Scope: files that (a) audit PASS, (b) carry a vaporPressure AmbroseWalton
# model, and (c) have live Tc, Pc, omega, Tb.  Antoine-model files are reported
# as 'antoine (own-fit)' -- their Psat(Tb) is the Antoine fit's own, a weaker
# self-check; listed but not AAD-ranked here.  Solids / no-Tb files: 'no-Tb'.
#
# Emits data/local/PROPOSED-VALIDATION.md.

import re, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROP = ROOT / 'data/local/components'
OUT  = ROOT / 'data/local/PROPOSED-VALIDATION.md'

ATM = 101325.0           # Pa, 1 standard atmosphere
TOL_PCT = 5.0            # AAD% threshold: PASS if Psat(Tb) within 5% of 1 atm

import importlib.util
spec = importlib.util.spec_from_file_location(
    'audit_proposed', Path(__file__).with_name('audit_proposed.py'))
audit = importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)


def aw_psat(T, Tc, Pc_Pa, omega):
    """Ambrose-Walton corresponding-states Psat [Pa] -- replica of
       AmbroseWalton::psat (src/thermo/vaporPressure/AmbroseWalton.cpp)."""
    if T >= Tc:
        return Pc_Pa
    Tr  = T / Tc
    tau = 1.0 - Tr
    t10 = tau
    t15 = tau * math.sqrt(tau)
    t25 = t15 * tau
    t50 = tau**5
    f0 = (-5.97616*t10 + 1.29874*t15 - 0.60394*t25 - 1.06841*t50) / Tr
    f1 = (-5.03365*t10 + 1.11505*t15 - 5.41217*t25 - 7.46628*t50) / Tr
    f2 = (-0.64771*t10 + 2.41539*t15 - 4.26979*t25 + 3.25259*t50) / Tr
    lnPr = f0 + omega*f1 + omega*omega*f2
    return Pc_Pa * math.exp(lnPr)


SCALAR_RE = lambda key: re.compile(r'^' + key + r'\s+([-0-9.eE]+)\s*;', re.MULTILINE)


def scalar(text, key):
    m = SCALAR_RE(key).search(text)
    return float(m.group(1)) if m else None


def vp_model(text):
    m = re.search(r'vaporPressure\s*\{[^}]*model\s+(\w+)', text)
    if m:
        return m.group(1)
    m = re.search(r'vaporPressure\s*\{\s*model\s+(\w+)', text)
    return m.group(1) if m else None


def antoine_coeffs(text):
    """Live (non-commented) Antoine coefficients (A,B,C) inside vaporPressure{}."""
    m = re.search(r'vaporPressure\s*\{(.*?)\}', text, re.DOTALL)
    if not m:
        return None
    body = m.group(1)
    cm = re.search(r'^\s*coefficients\s*\(([^)]*)\)', body, re.MULTILINE)
    if not cm:
        return None
    nums = [float(x) for x in cm.group(1).split()]
    return nums if len(nums) == 3 else None


def antoine_psat(T, A, B, C):
    """log10(Psat[bar]) = A - B/(T+C)  -> Pa  (replica of Antoine.cpp)."""
    return (10.0 ** (A - B / (T + C))) * 1.0e5


def main():
    files = sorted(PROP.glob('*.dat'))
    rows = []     # (name, status, aad_pct, Tb, Psat_Tb_atm, note)
    n_validated = n_pass = n_drop = 0
    for f in files:
        verdict, _, _ = audit.audit_file(f)
        text = f.read_text()
        name = f.stem
        if verdict != 'PASS':
            rows.append((name, 'unclean', None, None, None, 'audit REJECT'))
            continue
        model = vp_model(text)
        Tb = scalar(text, 'Tb')
        if Tb is None:
            rows.append((name, 'no-Tb', None, None, None, 'solid / no boiling point'))
            continue

        Psat = None; kind = None
        if model and 'AmbroseWalton' in model:
            Tc = scalar(text, 'Tc'); Pc = scalar(text, 'Pc'); om = scalar(text, 'omega')
            if None in (Tc, Pc, om):
                rows.append((name, 'gap', None, Tb, None, 'missing Tc/Pc/omega'))
                continue
            Psat = aw_psat(Tb, Tc, Pc*1.0e5, om); kind = 'AW'
        elif model and 'Antoine' in model:
            ac = antoine_coeffs(text)
            if ac is None:
                rows.append((name, 'skip', None, Tb, None, 'Antoine, no live coeffs'))
                continue
            Psat = antoine_psat(Tb, *ac); kind = 'Antoine'
        else:
            rows.append((name, 'skip', None, Tb, None, 'no recognised VP model'))
            continue

        aad = abs(Psat - ATM) / ATM * 100.0
        n_validated += 1
        if aad <= TOL_PCT:
            status = 'PASS'; n_pass += 1
        else:
            status = 'DROP'; n_drop += 1
        rows.append((name, status, aad, Tb, Psat/ATM, kind))

    # sort: validated rows by AAD ascending, then the rest
    def key(r):
        order = {'PASS': 0, 'DROP': 1}.get(r[1], 2)
        return (order, r[2] if r[2] is not None else 1e9, r[0])
    rows.sort(key=key)

    with OUT.open('w') as o:
        o.write('# `data/local/` component VLE validation — Psat(Tb) self-check\n\n')
        o.write('Deterministic check by `bin/curate/validate_components.py`. The '
                'anchor needs no external data: a corresponding-states vapour-'
                'pressure model **must reproduce the compound\'s own normal '
                'boiling point** — at `Tb` the saturation pressure is 1 atm by '
                'definition. We compute `Psat(Tb)` with the same Ambrose-Walton '
                'formula the C++ op uses (`AmbroseWalton.cpp`, replicated bit-for-'
                'bit) from each file\'s own `Tc/Pc/omega`, and report\n\n')
        o.write('```\nAAD% = |Psat(Tb) − 1 atm| / 1 atm × 100\n```\n\n')
        o.write(f'**PASS** if `AAD ≤ {TOL_PCT:.0f}%` (the Tc/Pc/omega/Tb quartet '
                'is internally consistent); **DROP** otherwise (inconsistent — '
                'not promotable; never guessed/patched). Antoine-model files use '
                'their own fit (a weaker self-check) and are listed `skip`; '
                'solids without a boiling point are `no-Tb`.\n\n')
        o.write('## Summary\n\n')
        o.write('| metric | value |\n|---|---|\n')
        o.write(f'| files validated (AW + Antoine self-check) | {n_validated} |\n')
        o.write(f'| — PASS (AAD ≤ {TOL_PCT:.0f}%) | {n_pass} |\n')
        o.write(f'| — DROP (AAD > {TOL_PCT:.0f}%) | {n_drop} |\n')
        o.write(f'| total files scanned | {len(files)} |\n\n')
        o.write('## VP self-check candidates (AAD-ranked)\n\n')
        o.write('`model` = `AW` (Ambrose-Walton corresponding-states, from '
                'Tc/Pc/omega) or `Antoine` (the file\'s own live CoolProp-fitted '
                'Antoine coefficients).\n\n')
        o.write('| component | model | status | AAD % | Tb (K) | Psat(Tb)/atm |\n')
        o.write('|-----------|-------|--------|-------|--------|--------------|\n')
        for name, status, aad, Tb, pr, note in rows:
            if status not in ('PASS', 'DROP'):
                continue
            o.write(f'| `{name}` | {note} | {status} | {aad:.2f} | {Tb:.2f} | {pr:.4f} |\n')
        o.write('\n## Non-AW / skipped files\n\n')
        o.write('| component | status | note |\n|-----------|--------|------|\n')
        for name, status, aad, Tb, pr, note in rows:
            if status in ('PASS', 'DROP'):
                continue
            o.write(f'| `{name}` | {status} | {note} |\n')

    print(f'validate: {n_validated} AW files -> PASS {n_pass}, DROP {n_drop}')
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
