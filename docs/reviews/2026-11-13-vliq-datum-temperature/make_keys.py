#!/usr/bin/env python3
"""Build the key file for thermoml_liquid_volume.py.

usage: make_keys.py REPO_ROOT MIRROR_DIR OUT_TSV
For each component it reads MW, Tc, Pc, omega, Vliq, VliqT, Tb from
REPO_ROOT/data/standards/components/<name>.dat (first occurrence of each key)
and the InChIKey from the mirror's identity.json bridge (CAS -> InChIKey,
built by the repository's own tool).  Two components the bridge does not
carry (H2, NO) are joined by their STANDARD InChI string as the archive's
own compound blocks print it -- a structural identifier, never a name.
"""
import json, os, re, sys

NAMES = ('CH4 CO H2 N2 NO O2 CO2 hitecSalt Ar He O3 ethylene ethane acetylene '
         'N2O HCl Cl2 H2S SO2 nButane propane propylene H2O2 HCHO HCN NO2').split()
BY_INCHI = {'H2': 'InChI=1S/H2/h1H', 'NO': 'InChI=1S/NO/c1-2'}


def field(text, key):
    m = re.search(r'^\s*' + key + r'\s+([-+0-9.eE]+)\s*;', text, re.M)
    return float(m.group(1)) if m else float('nan')


def main():
    repo, mirror, out = sys.argv[1:4]
    ident = json.load(open(os.path.join(mirror, 'identity.json')))['byInchiKey']
    inv = {n: k for k, v in ident.items() for n in v}
    idx = json.load(open(os.path.join(mirror, 'index.json')))
    byinchi = {}
    for e in idx['entries']:
        for c in e['compounds']:
            byinchi[c['inchi']] = c['inchikey']
    with open(out, 'w') as fo:
        fo.write('#component\tinchikey\tM\tTc\tPc_bar\tomega\tVliq_cm3\tVliqT_K\tTb_K\n')
        for n in NAMES:
            txt = open(os.path.join(repo, 'data/standards/components', n + '.dat')).read()
            key = inv.get(n) or byinchi.get(BY_INCHI.get(n, ''), '')
            VT = field(txt, 'VliqT')
            vals = [field(txt, 'MW'), field(txt, 'Tc'), field(txt, 'Pc'),
                    field(txt, 'omega'), field(txt, 'Vliq') * 1e6,
                    VT if VT == VT else 298.15, field(txt, 'Tb')]
            fo.write('\t'.join([n, key or 'none'] + ['%.6g' % v for v in vals]) + '\n')


if __name__ == '__main__':
    main()
