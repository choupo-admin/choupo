#!/usr/bin/env python3
"""Write the case-local NASA-9 overrides of the stable species of the Miller & Bowman cases.

    build_components.py CASEDIR      (writes CASEDIR/constant/components/<name>.dat)

The catalogue's ideal-gas Cp of the stable species is a process-range cubic
(250-1500 K) that does not reach flame temperatures; the NASA/TP-2002-211556
NASA-9 coefficients do.  Each record is the catalogue record with its
standardThermochemistry and idealGasHeatCapacity replaced by the blocks printed by
bin/curate/nasa_tp2002_to_choupo.py (checked there against the report), exactly as
tutorials/batch/combustion/ignition04_h2air_sensitivity does for H2, N2, O2, water.
The radicals come from the NASA table and the nine RRHO species from RRHO-computed
(speciesTables of thermoPhysPropDict); H2O2 and C4H2 already carry NASA-9 in components/.
"""
import os, re, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ENTRY = {  # component -> NASA/TP-2002-211556 entry
    'water': 'H2O', 'acetylene': 'C2H2,acetylene', 'ethylene': 'C2H4', 'ethane': 'C2H6',
    'HCHO': 'HCHO,formaldehy', 'CH4': 'CH4', 'CO': 'CO', 'CO2': 'CO2', 'H2': 'H2', 'N2': 'N2',
    'O2': 'O2', 'NO': 'NO', 'NO2': 'NO2', 'N2O': 'N2O', 'NH3': 'NH3', 'HCN': 'HCN'}
def strip_block(text, key):
    m = re.search(r'^%s\b[^\n]*\n\{.*?^\}\n' % key, text, re.S | re.M)
    if not m: return text
    return text[:m.start()] + text[m.end():]
def main(case, names):
    out = os.path.join(case, 'constant', 'components'); os.makedirs(out, exist_ok=True)
    for n in names:
        if n not in ENTRY: continue
        cat = open(os.path.join(ROOT, 'data/standards/components', n + '.dat')).read()
        blk = subprocess.run([os.path.join(ROOT, 'bin/curate/nasa_tp2002_to_choupo.py'), 'block', ENTRY[n]],
                             capture_output=True, text=True, check=True).stdout
        blk = blk.split('\n', 1)[1]                       # drop the "// ---- entry ----" line
        t = strip_block(strip_block(strip_block(cat, 'standardThermochemistry'), 'idealGasHeatCapacity'), 'provenance')
        t = re.sub(r'^(reviewStatus|reviewReason|variationOf|variationReason)\b[^\n]*\n', '', t, flags=re.M)
        add = ('reviewStatus   interim;\n'
               'reviewReason   "idealGasHeatCapacity transcribed by machine from NASA/TP-2002-211556 and checked against the report itself, not yet read back against the page by a curator; the rest of this record is unchanged";\n'
               'variationOf    %s;\n'
               'variationReason "the case carries the flame-range ideal-gas heat capacity (NASA-9, 200-6000 K, NASA/TP-2002-211556) that the combustion chemistry needs; the catalogue cubic stops at 1500 K.";\n\n' % n)
        t = t.rstrip('\n') + '\n\n' + add + blk.replace('idealGasHeatCapacity\n{\n', 'idealGasHeatCapacity\n{\n    //  CASE-LOCAL OVERRIDE for flame temperatures (the catalogue Cp is a 250-1500 K process fit).\n', 1)
        open(os.path.join(out, n + '.dat'), 'w').write(t)
if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:] or list(ENTRY))
