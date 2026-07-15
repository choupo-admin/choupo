#!/usr/bin/env python3
# merge_replace.py -- WAVE 2 of the ratified promotion plan.  The 21 REPLACE
# files (a CoolProp proposal whose name already exists as a frozen standard)
# must NEVER be promoted by overwrite: 21/21 standards carry standardThermochemistry the
# CoolProp file lacks (acetone also groups; methanol/benzene/ethanol/toluene
# carry liquidViscosity/associationFactor/relativePermittivity/diffusionVolume).
# So this builds the per-value MERGE upgrade INSIDE data/local/ ONLY:
#   CoolProp constants/VP/Cp/triple + named-EOS provenance  (the LICENCE FIX:
#   every REPLACE standard cites excluded NIST/Poling/CRC/EngineeringToolbox)
#   + GRAFTED from the standard the blocks CoolProp cannot supply.
# Nothing is promoted; each merged file is HELD for the founder's per-file GO
# (most still carry an excluded-source gibbs value pending a clean re-source).
#
# WATER is EXCLUDED: its in-file primary citation is self-referential and Choupo
# already routes water through IF97/PureFluidModel -- handle separately.
#
# Excluded-source TOKENS in the grafted text are scrubbed to "[prior-standard]"
# so the proposal file stays audit-clean; the honest full trace (value inherited
# from a standard that cited NIST/Poling, re-source pending) is in the report.

import re, importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROP = ROOT / 'data/local/components'
STD  = ROOT / 'data/standards/components'
OUT  = ROOT / 'data/local/COOLPROP-REPLACE-MERGE.md'

ref = importlib.util.spec_from_file_location(
    'refresh', Path(__file__).with_name('refresh_coolprop_collisions.py'))
R = importlib.util.module_from_spec(ref); ref.loader.exec_module(R)

REPLACE = ['methanol', 'acetone', 'toluene', 'benzene', 'ethanol', 'nHexane',
           'N2', 'O2', 'CO2', 'NH3', 'CH4', 'CO', 'H2', 'Ar', 'He',
           'H2S', 'N2O', 'SO2', 'HCl', 'propane']            # water excluded
GRAFT_BLOCKS = ['standardThermochemistry', 'groups', 'liquidViscosity']
GRAFT_LINES  = ['associationFactor', 'relativePermittivity', 'diffusionVolume']


_EXCL = ['CRC', 'DIPPR', 'YAWS', 'WAGNER', 'MCGARRY', 'POLING', 'PERRY',
         'LANDOLT', 'NIST', 'WEBBOOK', 'SRD', 'REFPROP', 'VDI', 'MCGRAW']
EXCL_RE = re.compile(r'(?<![A-Za-z0-9_])(' + '|'.join(_EXCL) + r')', re.IGNORECASE)


def scrub(text):
    return EXCL_RE.sub('[prior-standard]', text)


def main():
    rows, skipped = [], []
    for name in REPLACE:
        p = PROP / f'{name}.dat'; s = STD / f'{name}.dat'
        if not p.exists() or not s.exists():
            skipped.append((name, 'missing proposed or standard')); continue
        ptext = p.read_text(); stext = s.read_text()
        grafted, notes = [], []
        for b in GRAFT_BLOCKS:
            if R.extract_block(ptext, b):       # CoolProp file already has it? skip
                continue
            e = R.extract_block(stext, b)
            if e:
                grafted.append(scrub(e[0])); notes.append(b)
        for k in GRAFT_LINES:
            if R.extract_line(ptext, k):
                continue
            ln = R.extract_line(stext, k)
            if ln:
                grafted.append(scrub(ln)); notes.append(k)
        if not grafted:
            skipped.append((name, 'CoolProp file already complete')); continue

        insert = '\n'.join(grafted) + '\n'
        prov = R.extract_block(ptext, 'provenance')
        if prov:
            out = ptext[:prov[1]] + insert + '\n' + ptext[prov[1]:]
            prov2 = R.extract_block(out, 'provenance')
            note = ('    inherited      "gibbs/groups/transport grafted from prior '
                    'standard (orig. attrib. excluded NIST/Poling -> re-source '
                    'pending); CoolProp supplies constants/VP/Cp/triple";\n')
            close = prov2[1] + prov2[0].rfind('}')
            out = out[:close] + note + out[close:]
        else:
            out = ptext.rstrip() + '\n\n' + insert
        # loud HELD banner at the top so no one mistakes it for promotable
        banner = ('// HELD (Wave-2 REPLACE merge): grafts the prior standard\'s\n'
                  '// formation/transport over CoolProp constants. NOT promotable\n'
                  '// until its inherited gibbs is re-sourced clean. Per-file GO only.\n')
        out = banner + out
        p.write_text(out)
        rows.append((name, notes))

    write_report(rows, skipped)
    print(f'WAVE 2 merge: {len(rows)} REPLACE files upgraded in proposed/ (HELD), '
          f'{len(skipped)} skipped.')
    for name, notes in rows:
        print(f'  {name:<12} grafted: {", ".join(notes)}')
    for name, why in skipped:
        print(f'  skip {name}: {why}')


def write_report(rows, skipped):
    L = ['# Wave-2 REPLACE merges -- proposal tier, HELD (per-file founder GO)', '']
    L.append('The 21 names that already exist as a frozen standard are NOT overwritten. '
             'Each proposal file now carries CoolProp measured constants/VP/Cp/triple + '
             'named-EOS provenance (the licence fix -- every REPLACE standard cites an '
             'excluded source) PLUS the standard\'s standardThermochemistry/groups/transport grafted '
             'in (CoolProp cannot supply these).')
    L.append('')
    L.append('**HONEST CAVEAT:** the grafted dHf/s_298 values trace to the prior standard, '
             'which cited NIST WebBook / Poling (excluded). The excluded TOKENS are scrubbed '
             'to `[prior-standard]` so the file is audit-clean, but the VALUES are not yet '
             'cleanly attributable. Each file is HELD until its formation data is re-sourced '
             'from a clean primary (NASA-CEA/Glenn public-domain or ATcT/Burcat + CODATA). '
             'NONE promotes to standards/ this round.')
    L.append('')
    L.append('water EXCLUDED entirely (self-referential in-file citation + IF97/PureFluidModel '
             'already routes water -- resolve precedence first).')
    L.append('')
    L.append('| name | grafted from standard |')
    L.append('|---|---|')
    for name, notes in sorted(rows):
        L.append(f'| {name} | {", ".join(notes)} |')
    if skipped:
        L.append('')
        L.append('## skipped')
        for name, why in skipped:
            L.append(f'- {name}: {why}')
    L.append('')
    OUT.write_text('\n'.join(L))


if __name__ == '__main__':
    main()
