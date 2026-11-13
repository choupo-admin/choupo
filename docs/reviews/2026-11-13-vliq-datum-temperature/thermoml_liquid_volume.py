#!/usr/bin/env python3
"""Extract measured PURE-component liquid volumetric data from a local ThermoML
mirror, by InChIKey, with the Python standard library only.  Read-only.

usage: thermoml_liquid_volume.py MIRROR_DIR OUT_TSV KEYFILE
  KEYFILE: tsv  <component>\t<InChIKey>\t<M g/mol>\t<Tc K>
Every point found for a pure block of one of the keys is written with its
property, phases, T, P (kPa, NaN when not stated), the molar volume in
cm3/mol, the stated expanded uncertainty converted to cm3/mol, and the DOI.
Values are as the archive carries them: status transcribedNotCheckedAgainstArticle.
"""
import json, math, sys, os
import xml.etree.ElementTree as ET

NS = '{http://www.iupac.org/namespaces/ThermoML}'
VOLPROPS = ('Mass density, kg/m3', 'Amount density, mol/m3',
            'Molar volume, m3/mol', 'Specific volume, m3/kg')


def t(el, name):
    x = el.find(NS + name)
    return None if x is None else x.text


def to_V(prop, v, M):
    # molar volume in cm3/mol
    if prop.startswith('Mass density'):
        return 1000.0 * M / v           # (g/mol)/(kg/m3) = L/mol; x1000 -> cm3/mol
    if prop.startswith('Amount density'):
        return 1e6 / v
    if prop.startswith('Molar volume'):
        return v * 1e6
    if prop.startswith('Specific volume'):
        return v * M * 1e3
    raise ValueError(prop)


def main():
    mirror, out, keyfile = sys.argv[1:4]
    keys = {}
    for line in open(keyfile):
        if not line.strip() or line.startswith('#'):
            continue
        name, key, M, Tc = line.rstrip('\n').split('\t')[:4]
        keys[key] = (name, float(M), float(Tc) if Tc else float('nan'))
    idx = json.load(open(os.path.join(mirror, 'index.json')))
    files = set()
    for e in idx['entries']:
        if any(c['inchikey'] in keys for c in e['compounds']):
            files.add((e['doi'], e['file']))
    rows = []
    for doi, f in sorted(files):
        path = f if os.path.exists(f) else os.path.join(mirror, doi + '.xml')
        try:
            root = ET.parse(path).getroot()
        except Exception as ex:
            print('unreadable', path, ex, file=sys.stderr)
            continue
        org = {}
        for c in root.findall(NS + 'Compound'):
            n = c.find(NS + 'RegNum/' + NS + 'nOrgNum')
            k = t(c, 'sStandardInChIKey')
            if n is not None and k:
                org[n.text] = k
        for blk in root.findall(NS + 'PureOrMixtureData'):
            comps = blk.findall(NS + 'Component')
            if len(comps) != 1:
                continue
            n = comps[0].find(NS + 'RegNum/' + NS + 'nOrgNum').text
            key = org.get(n)
            if key not in keys:
                continue
            name, M, Tc = keys[key]
            phases = [p.text for p in blk.findall(NS + 'PhaseID/' + NS + 'ePhase')]
            props = {}
            for p in blk.findall(NS + 'Property'):
                pn = p.find('.//' + NS + 'ePropName')
                if pn is None or pn.text not in VOLPROPS:
                    continue
                ph = p.find('.//' + NS + 'ePropPhase')
                props[t(p, 'nPropNumber')] = (pn.text, ph.text if ph is not None else '')
            if not props:
                continue
            varkind = {}
            for v in blk.findall(NS + 'Variable'):
                vt = v.find(NS + 'VariableID/' + NS + 'VariableType')
                kind = list(vt)[0].tag.replace(NS, '') if vt is not None and len(vt) else ''
                varkind[t(v, 'nVarNumber')] = (kind, list(vt)[0].text if len(vt) else '')
            cons = {}
            for c in blk.findall(NS + 'Constraint'):
                ct = c.find(NS + 'ConstraintID/' + NS + 'ConstraintType')
                if ct is None or not len(ct):
                    continue
                cons[list(ct)[0].tag.replace(NS, '')] = (list(ct)[0].text, float(t(c, 'nConstraintValue')))
            for nv in blk.findall(NS + 'NumValues'):
                T = P = float('nan')
                if 'eTemperature' in cons:
                    T = cons['eTemperature'][1]
                if 'ePressure' in cons:
                    P = cons['ePressure'][1] * (1000.0 if 'MPa' in cons['ePressure'][0] else 1.0)
                for vv in nv.findall(NS + 'VariableValue'):
                    kind, unit = varkind.get(t(vv, 'nVarNumber'), ('', ''))
                    val = float(t(vv, 'nVarValue'))
                    if kind == 'eTemperature':
                        T = val
                    elif kind == 'ePressure':
                        P = val * (1000.0 if 'MPa' in unit else 1.0)
                for pv in nv.findall(NS + 'PropertyValue'):
                    pnum = t(pv, 'nPropNumber')
                    if pnum not in props:
                        continue
                    prop, pph = props[pnum]
                    val = float(t(pv, 'nPropValue'))
                    U = float('nan')
                    u = pv.find('.//' + NS + 'nCombExpandUncertValue')
                    if u is None:
                        u = pv.find('.//' + NS + 'nCombStdUncertValue')
                    if u is not None:
                        U = float(u.text)
                    try:
                        V = to_V(prop, val, M)
                        Vhi = to_V(prop, val - U, M) if prop.startswith(('Mass', 'Amount')) else to_V(prop, val + U, M)
                        UV = abs(Vhi - V) if not math.isnan(U) else float('nan')
                    except (ValueError, ZeroDivisionError):
                        continue
                    rows.append((name, key, prop, pph, '|'.join(phases), T, P, val, V, UV, doi))
    with open(out, 'w') as fo:
        fo.write('component\tinchikey\tproperty\tpropPhase\tphases\tT_K\tP_kPa\tvalue\tV_cm3_mol\tU_V_cm3_mol\tdoi\tstatus\n')
        for r in rows:
            fo.write('\t'.join(str(x) for x in r) + '\ttranscribedNotCheckedAgainstArticle\n')
    print(len(rows), 'points from', len(files), 'files')


if __name__ == '__main__':
    main()
