#!/usr/bin/env python3
# =============================================================================
#  benchmarks/dwsim/read_sample.py -- read the FACTS out of one of the
#  reference simulator's sample files, as a Choupo `reference` dictionary.
#
#  Developer-facing (benchmarks/README.md).  The sample file is NOT in this
#  tree and is never copied into it (rule 1): give the path of your own copy,
#  e.g. from a sparse clone of github.com/DanWBR/dwsim at the commit the
#  benchmark cites, PlatformFiles/Common/samples/<sample>.dwxmz.
#
#  What it reads: the file's own GeneralInfo (BuildVersion, SavedOn), every
#  material stream's stored overall state (T, P, molar flow, mole fractions),
#  every energy stream, each column's declared specification and stored
#  stage results (T, x, y, L, V per stage), the pump and the recycle block.
#  What it NEVER reads: the property packages' parameters (the pair tables
#  this project excludes, DEV.md 4c C16).  It names the package TYPE only.
#
#      python3 -I benchmarks/dwsim/read_sample.py <sample.dwxmz> [--commit <sha>]
#
#  prints a `reference` dictionary on stdout.  The committed `reference`
#  files were written by this script and then annotated by hand (the
#  findings); rerun it to check a number against the file.
# =============================================================================

import argparse
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


def text(node, tag, default=None):
    v = node.findtext(tag)
    return default if v is None else v


def props(phase):
    # A phase carries a placeholder <Properties> string and then the real block.
    blocks = phase.findall('Properties')
    return blocks[-1] if blocks else None


def ident(name):
    # A stream/unit label as a Choupo word: letters and digits, camelCase.
    words = re.split(r'[^A-Za-z0-9]+', name)
    words = [w for w in words if w]
    if not words:
        return 'unnamed'
    out = words[0][0].lower() + words[0][1:]
    for w in words[1:]:
        out += w[0].upper() + w[1:]
    return out


def braced_list(s):
    # "{0.1; 0.2}" -> [0.1, 0.2]
    s = s.strip().strip('{}')
    return [float(v) for v in s.split(';') if v.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sample')
    ap.add_argument('--commit', default='<commit>')
    a = ap.parse_args()

    with zipfile.ZipFile(a.sample) as z:
        xmls = [n for n in z.namelist() if n.endswith('.xml')]
        if len(xmls) != 1:
            sys.exit('read_sample: expected one XML document in the sample, found %d' % len(xmls))
        root = ET.fromstring(z.read(xmls[0]))

    gi = root.find('GeneralInfo')
    tags = {g.findtext('Name'): g.findtext('Tag') for g in root.find('GraphicObjects')}
    sample = a.sample.rsplit('/', 1)[-1]

    out = []
    w = out.append
    w('source')
    w('{')
    w('    repository   "https://github.com/DanWBR/dwsim";')
    w('    commit       %s;' % a.commit)
    w('    sample       "PlatformFiles/Common/samples/%s";' % sample)
    w('    buildVersion "%s";' % text(gi, 'BuildVersion'))
    w('    savedOn      "%s";' % text(gi, 'SavedOn'))
    w('}')
    w('')

    pkgs = sorted({text(p, 'Type').rsplit('.', 1)[-1] for p in root.find('PropertyPackages')})
    w('propertyPackage ( %s );   // the TYPE only; no parameter is read' % ' '.join(pkgs))
    w('')

    streams, energy, units = [], [], []
    for s in root.find('SimulationObjects'):
        typ = text(s, 'Type')
        label = tags.get(text(s, 'ComponentName'), text(s, 'ComponentName'))
        if typ.endswith('MaterialStream'):
            ph = {p.findtext('ID'): p for p in s.find('Phases')}
            p0 = props(ph['0'])
            comps = [(c.findtext('Name'), float(c.findtext('MoleFraction')))
                     for c in ph['0'].find('Compounds')]
            vf = props(ph['2']).findtext('molarfraction') if '2' in ph else None
            streams.append((label, p0, comps, vf, text(s, 'TotalEnergyFlow')))
        elif typ.endswith('EnergyStream'):
            energy.append((label, text(s, 'EnergyFlow')))
        else:
            units.append((label, typ, s))

    w('streams     // stored overall state: T [K], P [Pa], F [mol/s], mole fractions,')
    w('            // H_kW = the stream\'s stored TotalEnergyFlow (its own enthalpy datum)')
    w('{')
    for label, p0, comps, vf, h in streams:
        w('    %s   // "%s"' % (ident(label), label))
        w('    {')
        w('        T %s;  P %s;  F %s;  H_kW %s;' % (p0.findtext('temperature'), p0.findtext('pressure'),
                                                  p0.findtext('molarflow'), h))
        if vf is not None:
            w('        vaporFraction %s;' % vf)
        w('        x { %s }' % '  '.join('%s %.10g;' % (ident(n), x) for n, x in comps))
        w('    }')
    w('}')
    w('')
    w('energyStreams   // stored, kW')
    w('{')
    for label, q in energy:
        w('    %s %s;   // "%s"' % (ident(label), q, label))
    w('}')
    w('')

    w('units')
    w('{')
    for label, typ, s in units:
        kind = typ.rsplit('.', 1)[-1]
        w('    %s   // "%s", %s' % (ident(label), label, kind))
        w('    {')
        if kind in ('DistillationColumn', 'AbsorptionColumn'):
            w('        nStages %s;  method "%s";' % (text(s, 'NumberOfStages'), text(s, 'SolvingMethodName')))
            if kind == 'AbsorptionColumn':
                w('        operationMode %s;' % text(s, 'OperationMode'))
            stages = [st.findtext('Name') for st in s.find('Stages')]
            ids = {st.findtext('ID'): st.findtext('Name') for st in s.find('Stages')}
            for ms in s.find('MaterialStreams'):
                at = ms.findtext('AssociatedStage') or ''
                at = ids.get(at, at)
                w('        port { stream "%s"; behaviour %s; stage "%s"; }'
                  % (tags.get(ms.findtext('StreamID'), ms.findtext('StreamID')),
                     ms.findtext('StreamBehavior'), at))
            for sp in s.find('Specs'):
                w('        spec { kind %s; value %s; unit "%s"; calculated %s; }'
                  % (sp.findtext('SType'), sp.findtext('SpecValue'), sp.findtext('SpecUnit') or '',
                     sp.findtext('CalculatedValue')))
            w('        stageNames ( %s );' % ' '.join('"%s"' % n for n in stages))
            res = s.find('Results')
            comps = res.findtext('compids').split(',')
            for key in ('Tf', 'Lf', 'Vf'):
                w('        %s ( %s );' % (key, ' '.join('%.10g' % v for v in braced_list(res.findtext(key)))))
            for key in ('xf', 'yf'):
                rows = [braced_list(d.text) for d in res.find(key).findall('data')]
                for i, c in enumerate(comps):
                    w('        %s_%s ( %s );' % (key, ident(c), ' '.join('%.10g' % r[i] for r in rows)))
            for key in ('CondenserDuty', 'ReboilerDuty', 'RefluxRatio'):
                if text(s, key) is not None:
                    w('        %s %s;' % (key[0].lower() + key[1:], text(s, key)))
        elif kind == 'Pump':
            for key in ('Pout', 'Eficiencia', 'DeltaQ', 'OutletTemperature'):
                w('        %s %s;' % (key[0].lower() + key[1:], text(s, key)))
        elif kind == 'Recycle':
            w('        converged %s;  iterationsTaken %s;' % (text(s, 'Converged'), text(s, 'IterationsTaken')))
            for blk in ('Errors', 'Values'):
                items = s.find(blk)
                w('        %s { %s }' % (blk[0].lower() + blk[1:], '  '.join(
                    '%s %s;' % (it.get('Key'), it.get('Value')) for it in items)))
            cp = s.find('ConvergenceParameters')
            w('        tolerances { %s }' % '  '.join(
                '%s %s;' % (c.tag, c.text) for c in cp if c.tag != 'Type'))
        w('    }')
    w('}')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
