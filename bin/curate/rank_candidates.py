#!/usr/bin/env python3
# rank_candidates.py -- re-rank the data/local/components/ proposal tier into
# a promotion-candidate list, AFTER the CoolProp import + collision refresh.
# Supersedes the hand-built PROMOTION-CANDIDATES.md.  Deterministic; promotes
# NOTHING -- it writes a ranked review list with the exact (commented) `mv`
# command awaiting the founder's GO.
#
# Ranking signals (higher = more promotable):
#   * provenance tier   CoolProp-measured EOS  >  literature  >  Joback-estimated
#   * validation        Antoine/AW reproduces the file's own Tb (AAD, PASS/DROP)
#   * completeness      idealGasCp, liquidCp, gibbsFormation, groups, curated subl.
#   * teaching value    a small curated set of staple species
#
# Two tracks, because the ACT differs:
#   NEW      -- no data/standards/ twin -> a clean ADD (low risk)
#   REPLACE  -- a frozen standard already exists -> overwrite needs side-by-side
#               scrutiny (the standard may already be good, or may cite excluded
#               sources the CoolProp file fixes) -> listed separately, not ranked
#               for blind promotion.

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / 'data/local/components'
STD  = ROOT / 'data/standards/components'
VAL  = ROOT / 'data/local/PROPOSED-VALIDATION.md'
OUT  = ROOT / 'data/local/PROMOTION-CANDIDATES.md'

COMMON = {
    'water', 'methanol', 'ethanol', 'onePropanol', 'twoPropanol', 'acetone',
    'benzene', 'toluene', 'oXylene', 'mXylene', 'pXylene', 'ethylbenzene',
    'styrene', 'cumene', 'phenol', 'aniline', 'pyridine',
    'methane', 'ethane', 'propane', 'nButane', 'isobutane', 'nPentane',
    'nHexane', 'nHeptane', 'nOctane', 'cyclohexane', 'methylcyclohexane',
    'ethylene', 'propylene', 'butene1',
    'acetonitrile', 'chloroform', 'dichloromethane', 'carbonTetrachloride',
    'diethylEther', 'mtbe', 'tetrahydrofuran', 'dioxane14',
    'methylEthylKetone', 'methylIsobutylKetone', 'ethyleneGlycol', 'glycerol',
    'aceticAcid', 'formicAcid', 'dimethylSulfoxide', 'dimethylFormamide',
    'ammonia', 'CO2', 'N2', 'O2', 'nitrogen', 'oxygen', 'argon',
    'chlorobenzene', 'nitrobenzene', 'furfural',
}


def parse_validation():
    """name -> (model, verdict, aad)."""
    d = {}
    if not VAL.exists():
        return d
    for line in VAL.read_text().splitlines():
        m = re.match(r'\|\s*`([^`]+)`\s*\|\s*([A-Za-z]+)\s*\|\s*(PASS|DROP)\s*\|\s*([0-9.]+)', line)
        if m:
            d[m.group(1)] = (m.group(2), m.group(3), float(m.group(4)))
    return d


def has_block(text, name):
    return re.search(r'(?m)^[ \t]*' + re.escape(name) + r'\b', text) is not None


def hsub_subl(text):
    m = re.search(r'sublimation\b.*?\}', text, re.S)
    if not m:
        return False
    return bool(re.search(r'\bHsub\b[^\n;]*?([1-9][0-9.eE+\-]*)', m.group(0)))


def tier(text):
    if 'Imported from CoolProp' in text:
        return ('CoolProp-measured', 100)
    prov = text.lower()
    if re.search(r'\[origin=measured|codata|iupac|staveley|mathews', prov):
        return ('literature', 60)
    if re.search(r'joback|estimated|ambrosewalton', prov):
        return ('Joback-estimated', 30)
    return ('unattributed', 15)


def primary_cite(text):
    m = re.search(r'Reference EOS:\s*(.+)', text)
    if m:
        return m.group(1).strip()
    m = re.search(r'constants\s+"([^"]+)"', text)
    return m.group(1).strip() if m else '(unspecified)'


def main():
    val = parse_validation()
    rows = []
    for p in sorted(COMP.glob('*.dat')):
        text = p.read_text()
        name = p.stem
        if not (has_block(text, 'vaporPressure') and re.search(r'(?m)^\s*Tc\b', text)):
            continue                       # not a volatile VLE component -> skip
        tname, tscore = tier(text)
        model, verdict, aad = val.get(name, (None, None, None))
        score = tscore
        if verdict == 'PASS' and aad is not None:
            score += max(0.0, 30.0 - aad * 3.0)
        elif verdict == 'DROP':
            score -= 25.0
        else:
            score -= 5.0
        comp = sum(6 for b in ('idealGasHeatCapacity', 'liquidHeatCapacity',
                               'gibbsFormation', 'groups') if has_block(text, b))
        if hsub_subl(text):
            comp += 6
        score += comp
        if name in COMMON:
            score += 12
        replace = (STD / f'{name}.dat').exists()
        rows.append(dict(name=name, tier=tname, model=model, verdict=verdict,
                         aad=aad, comp=comp, score=score, replace=replace,
                         cite=primary_cite(text)))
    rows.sort(key=lambda r: (-r['score'], r['name'].lower()))
    new = [r for r in rows if not r['replace']]
    rep = [r for r in rows if r['replace']]
    write(new, rep)
    print(f'ranked {len(rows)} volatile candidates: {len(new)} NEW (clean add), '
          f'{len(rep)} REPLACE (standards twin).')
    print('top 10 NEW:')
    for r in new[:10]:
        a = f'{r["aad"]:.2f}%' if r['aad'] is not None else 'n/a'
        print(f'  {r["score"]:6.1f}  {r["name"]:<20} {r["tier"]:<18} AAD {a}')


def fmtrow(r):
    a = f'{r["aad"]:.2f}' if r['aad'] is not None else '—'
    v = r['verdict'] or '—'
    return (f'| {r["name"]} | {r["score"]:.0f} | {r["tier"]} | {v} | {a} | '
            f'{r["comp"]//6} | {r["cite"]} |')


def write(new, rep):
    L = []
    L.append('# Promotion candidates -- RE-RANKED after CoolProp import + refresh')
    L.append('')
    L.append('Supersedes the pre-import hand-built list. Deterministic re-rank by '
             '`bin/curate/rank_candidates.py`. **Promotes nothing** -- review and '
             'run the (commented) `mv` per file.')
    L.append('')
    L.append('Score = provenance tier (CoolProp 100 / literature 60 / Joback 30) '
             '+ validation (30 - 3*AAD%, PASS; -25 DROP) + completeness (6 per of '
             'idealGasCp / liquidCp / gibbsFormation / groups / curated-sublimation) '
             '+ 12 if a teaching staple. "compl" column = blocks-present count.')
    L.append('')
    L.append('## Track NEW -- clean ADD to data/standards/ (no existing standard)')
    L.append('')
    L.append('| name | score | tier | valid | AAD% | compl | primary citation |')
    L.append('|---|---|---|---|---|---|---|')
    for r in new:
        L.append(fmtrow(r))
    L.append('')
    L.append('### Promotion commands (top of NEW, awaiting GO -- uncomment to run)')
    L.append('')
    L.append('```sh')
    for r in new[:25]:
        L.append(f'# mv data/local/components/{r["name"]}.dat data/standards/components/')
    L.append('```')
    L.append('')
    L.append('## Track REPLACE -- a frozen standard already exists (side-by-side review first)')
    L.append('')
    L.append('Promoting these OVERWRITES a committee-managed standard. Some standards cite '
             'excluded sources (e.g. `acetone` cites NIST WebBook + Poling) and a clean '
             'CoolProp file is a genuine fix; others may already be good. **Diff each '
             'against its standard before deciding.**')
    L.append('')
    L.append('| name | score | tier | valid | AAD% | compl | primary citation |')
    L.append('|---|---|---|---|---|---|---|')
    for r in rep:
        L.append(fmtrow(r))
    L.append('')
    OUT.write_text('\n'.join(L))


if __name__ == '__main__':
    main()
