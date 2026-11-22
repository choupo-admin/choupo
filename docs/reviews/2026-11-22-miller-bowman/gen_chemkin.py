#!/usr/bin/env python3
"""Turn mb1989_table.tsv into CHEMKIN-format mechanism files (our own transcription).

    gen_chemkin.py A  > mb1989_appA.inp        Appendix A, 235 reactions
    gen_chemkin.py B  > mb1989_appB.inp        Appendix B, 73 reactions

Species names are the names the Choupo tree knows them by (water, acetylene,
ethylene, ethane, HCHO, C2H3_vinyl, C3H3_1propynl); the singlet CH2 is written
SCH2 here (CHEMKIN would read a leading `1` as a coefficient) and is the
component `1CH2` in the case.  Units: CAL/MOLE, MOLES, cm3-mol-s as the paper.
Reading of the paper's Troe footnote: see README.md (Interpretations).
"""
import csv, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
NAME = {'H2O': 'water', 'C2H2': 'acetylene', 'C2H4': 'ethylene', 'C2H6': 'ethane',
        'CH2O': 'HCHO', 'C2H3': 'C2H3_vinyl', 'C3H3': 'C3H3_1propynl', '1CH2': 'SCH2'}
def nm(s): return NAME.get(s, s)
def term(t):
    m = re.match(r'^(\d+)(.*)$', t)
    if m and not t.startswith('1CH2'):
        return m.group(1), nm(m.group(2))
    return '', nm(t)
def side(s):
    out = []
    for t in s.split('+'):
        if t == 'M': out.append('M'); continue
        c, sp = term(t)
        out.append((c if c != '1' else '') + sp)
    return '+'.join(out)
def eq(e):
    fall = '(+M)' in e
    e2 = e.replace('(+M)', '')
    l, r = e2.split('=')
    l, r = side(l), side(r)
    if fall: l += '(+M)'; r += '(+M)'
    return l + '=' + r
def species_in(rows):
    s = []
    for r in rows:
        for part in r['equation'].replace('(+M)', '').split('='):
            for t in part.split('+'):
                if t == 'M': continue
                sp = term(t)[1]
                if sp not in s: s.append(sp)
        for e in r['eff'].split():
            sp = nm(e.split('=')[0])
            if sp not in s: s.append(sp)
    return s
def main(tab):
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, 'mb1989_table.tsv')), delimiter='\t') if r['table'] == tab]
    page = {}
    print('! Miller & Bowman, Prog. Energy Combust. Sci. 15 (1989) 287-338, doi:10.1016/0360-1285(89)90017-8')
    print('! Appendix %s, pp. %s. Our own transcription of the printed table (numbers and reaction' % (tab, '331-336' if tab == 'A' else '337-338'))
    print('! strings only), read from the page images twice; see README.md. Units as printed:')
    print('! cm3, mol, s, K, cal/mol; k = A T**n exp(-E/RT).  Reversible reactions, reverse by equilibrium.')
    sp = species_in(rows)
    if tab == 'B': sp.append('He')     # the carrier gas of the Lyon & Hardy experiment; inert, no reaction
    print('ELEMENTS C H O N HE END' if tab == 'B' else 'ELEMENTS C H O N END')
    print('SPECIES')
    for i in range(0, len(sp), 8): print('  ' + ' '.join(sp[i:i+8]))
    print('END')
    print('REACTIONS CAL/MOLE MOLES')
    for r in rows:
        e = eq(r['equation'])
        print('%-44s %-10s %-8s %-9s ! A%s p.%s' % (e, r['A'].replace('e+', 'E+').replace('e-', 'E-'), r['n'], r['E'].rstrip('.') if r['E'] != '0.' else '0.0', r['rxn'] if tab == 'A' else '', r['page']) if tab=='A' else
              '%-44s %-10s %-8s %-9s ! B%s p.%s' % (e, r['A'].replace('e+', 'E+').replace('e-', 'E-'), r['n'], r['E'].rstrip('.') if r['E'] != '0.' else '0.0', r['rxn'], r['page']))
        if r['lowA']:
            f = lambda x: x.replace('e+', 'E+').replace('e-', 'E-')
            print('    LOW / %s %s %s /' % (f(r['lowA']), r['lowN'], r['lowE'].rstrip('.')))
            fo = r['falloff']
            if fo.startswith('Troe'):
                a = re.search(r'a=([0-9.e+-]+)', fo).group(1); t1 = re.search(r'T\*=([0-9.]+)', fo).group(1); t2 = re.search(r'T\*\*=([0-9.]+)', fo).group(1)
                # paper's numbers in the order of CHEMKIN-II TROE / a T*** T* /  (see README)
                print('    TROE / %s %s %s /' % (a, t1, t2))
            elif fo.startswith('SRI'):
                p = fo.split()[1:5]
                if len(p) == 4: p.append('0.0')     # the paper prints a b c d; e = 0 (CHEMKIN default), see README
                print('    SRI / %s /' % ' '.join(p))
        if tab == 'B' and r['rxn'] == '10':
            # B10 prints no efficiencies although B11 and B12 supply the H2 and H2O colliders (as A139);
            # same A, n, E as A139.  Interpretation recorded in README.
            print('    H2/0.0/ water/0.0/')
        if r['eff']:
            print('    ' + ' '.join('%s/%s/' % (nm(x.split('=')[0]), x.split('=')[1]) for x in r['eff'].split()))
    print('END')
main(sys.argv[1])
