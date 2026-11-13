#!/usr/bin/env python3
"""Probe how the component reader treats `VliqT` declarations, through a
case-local record in a scratch copy of a one-component choupoProps case.

usage: reader_probes.py REPO_ROOT SCRATCH_DIR OUT_TSV
Each probe writes constant/components/<comp>.dat (full shadow unless the body
starts with `overlayOf`) and asks rho_liquid_<comp> at one temperature.  The
TSV records the engine's verdict: the density it printed, or the first line
of the refusal, and the datum announcement it made.
"""
import os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import make_density_case  # noqa: E402
from run_engine_density import run  # noqa: E402

PROBES = [
    # id, component, T, local record body, what is probed
    ('R01', 'CH4', '105', 'VliqT 200;', 'VliqT above Tc (190.56 K), full-shadow file'),
    ('R02', 'CH4', '105', 'overlayOf CH4;\nVliqT 190.56;', 'VliqT exactly Tc, overlayOf file'),
    ('R03', 'CH4', '105', 'VliqT -5;', 'negative VliqT'),
    ('R04', 'CH4', '105', 'VliqT 0;', 'VliqT zero'),
    ('R05', 'CH4', '105', 'VliqT 111.66 K;', 'VliqT with a named unit K'),
    ('R06', 'CH4', '105', 'VliqT -161.49 degC;', 'VliqT in degC (= 111.66 K)'),
    ('R07', 'CH4', '105', 'VliqT 50 Pa;', 'VliqT with a PRESSURE unit (wrong dimension), value below Tc'),
    ('R08', 'CH4', '105', 'VliqT [0 0 0 1 0] 111.66;', 'VliqT in bracket dimensions (temperature)'),
    ('R09', 'CH4', '105', 'VliqT [1 -1 -2 0 0] 111.66;', 'VliqT in bracket dimensions of a PRESSURE'),
    ('R10', 'CH4', '105', 'VliqT hot;', 'VliqT a word'),
    ('R11', 'CH4', '105', 'Vliq 3.74e-5;', 'local Vliq without VliqT over a base with VliqT (must fall back to 298.15 K)'),
    ('R12', 'propane', '298.15', 'VliqT 276.65;', 'local VliqT only, base Vliq kept (full shadow)'),
    ('R13', 'propane', '298.15', 'overlayOf propane;\nVliqT 276.65;', 'local VliqT only, overlayOf'),
    ('R14', '2Methyl2Heptanol', '298.15', 'VliqT 300;', 'VliqT on a record with no Vliq'),
    ('R15', 'CH4', '105', 'VliqT 1e-3;', 'VliqT a tiny positive number (1 mK)'),
]


def main():
    repo, scratch, out = sys.argv[1:4]
    with open(out, 'w') as fo:
        fo.write('id\tcomponent\tT_K\tlocal_record\tprobe\tengine_verdict\tannouncement\n')
        for pid, comp, T, body, what in PROBES:
            case = os.path.join(scratch, 'probe_' + pid)
            sys.argv = ['x', case, comp, T]
            make_density_case.main()
            os.makedirs(os.path.join(case, 'constant', 'components'), exist_ok=True)
            with open(os.path.join(case, 'constant', 'components', comp + '.dat'), 'w') as f:
                f.write(body + '\n')
            rho, ann = run(repo, case)
            log = open(os.path.join(case, 'log.choupoProps')).read()
            if rho.startswith('refused') and 'see log' in rho:
                m = re.search(r'(?:error|Error|ERROR)[^\n]*', log)
                rho = 'refused: ' + (m.group(0) if m else log.strip().splitlines()[-1])
            fo.write('\t'.join([pid, comp, T, body.replace('\n', ' '), what,
                                rho.replace('\t', ' ')[:400], ann]) + '\n')


if __name__ == '__main__':
    main()
