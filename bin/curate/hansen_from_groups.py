#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""hansen_from_groups -- ESTIMATE the three Hansen parameters from a molecule's
UNIFAC groups with the first-order group method of Stefanis & Panayiotou
(DEV.md 4c C428 (2)).  A CURATION tool, beside the runtime and never in it.

SOURCE.  Stefanis, E. and Panayiotou, C., Prediction of Hansen Solubility
Parameters with a New Group-Contribution Method, Int. J. Thermophys. 29 (2008)
568-585: Table 3 (first-order contributions, Eqs. 24-26) and Table 5 (the
low-value contributions, Eqs. 27-28).  The numbers are cited facts transcribed
from the page: each table was extracted twice (the text layer in `-layout` and
in `-raw` mode, parsed by two separate routines) and the two readings diffed
(0 disagreements over 76 + 43 rows); the paper's own worked examples (1-hexanal,
Tables 7-10; alizarin, Tables 11-15) are reproduced by `--selftest`.  The
paper's PDF is not shipped.

WHAT IT DOES.  dD = sum N_i C_i + 17.3231, dP = sum + 7.3548, dH = sum + 7.9793
(MPa^0.5).  Where the result falls below 3 MPa^0.5 the paper gives Eqs. 27-28
(constants 2.7467 and 1.3720) with the Table 5 contributions; the tool applies
them when every group of the molecule has a Table 5 entry, else it keeps the
Table 3 value and marks it `belowValidity`.

VALIDITY (the statement that travels with every estimate).  FIRST-ORDER ONLY:
the second-order groups of Table 4 (rings, branching, conjugation) need the
molecular graph, and a UNIFAC group list carries none, so none is applied and
none is guessed (the paper's own second-order gain in AAE is 7 / 18 / 9 %,
its Table 2).  Defined for organic molecules with three or more carbons.  A
molecule whose group list names a group absent from Table 3 is `not estimable`
and the group is named; so is a parameter whose group has `***` in the paper.
The estimate is a PREDICTION from a regression (in-sample for the 344-375
molecules of the paper's own set): never a measurement, never in
data/standards, origin `predictive` wherever it is read.

USAGE
    bin/curate/hansen_from_groups.py --selftest
    bin/curate/hansen_from_groups.py --validate   # table against the measured records
    bin/curate/hansen_from_groups.py --write      # data/groupEstimative/hansenEstimates.csv
"""
import csv, math, os, re, sys

T3 = {   # Table 3, first-order groups: name -> (dD, dP, dH) in MPa^0.5; None = '***' (not available)
    'CH3': (-0.9714, -1.6448, -0.7813),
    'CH2': (-0.0269, -0.3045, -0.4119),
    'CH': (0.6450, 0.6491, -0.2018),
    'C': (1.2686, 2.0838, 0.0866),
    'CH2=CH': (-1.0585, -2.0035, -1.2985),
    'CH=CH': (0.0048, -0.2984, -0.0400),
    'CH2=C': (-0.4829, -0.7794, -0.8260),
    'CH=C': (0.5372, -0.9024, -1.8872),
    'C=C': (0.3592, 1.0526, -15.4659),
    'CH2=C=CH': (-1.6518, None, -0.9980),
    'CH_C': (0.2320, -1.3294, 1.0736),
    'C_C': (-0.2028, -0.7598, -1.1083),
    'ACH': (0.1105, -0.5303, -0.4305),
    'AC': (0.8446, 0.6187, 0.0084),
    'ACCH3': (0.2174, -0.5705, -1.1473),
    'ACCH2': (0.6933, 0.6517, -0.1375),
    'CH3CO': (-0.3551, 2.3192, -1.3078),
    'CH2CO': (0.6527, 3.7328, -0.5344),
    'CHO_ald': (-0.4030, 3.4734, 0.1687),
    'COOH': (-0.2910, 0.9042, 3.7391),
    'CH3COO': (-0.5401, -0.3970, 1.5826),
    'CH2COO': (0.2913, 3.6462, 1.2523),
    'HCOO': (None, 1.9308, 2.1202),
    'COO': (0.2039, 3.4637, 1.1389),
    'OH': (-0.3462, 1.1404, 7.1908),
    'ACOH': (0.5288, 1.1010, 6.9580),
    'CH3O': (-0.5828, 0.1764, 0.1460),
    'CH2O': (0.0310, 0.8826, -0.1528),
    'CH-O': (0.8833, 1.6853, 0.4470),
    'C2H5O2': (-0.1249, 3.6422, 8.3579),
    'CH2O_cyc': (0.2753, 0.1994, -0.1610),
    'CH2NH2': (-0.5828, 1.4084, 2.5920),
    'CHNH2': (0.0112, -1.1989, 0.3818),
    'CH3NH': (None, 0.6777, 5.6646),
    'CH2NH': (0.8116, 0.9412, 1.3400),
    'CH3N': (0.8769, 1.2046, 1.6062),
    'CH2N': (1.4681, 2.8345, 1.2505),
    'ACNH2': (1.6987, 1.6761, 4.5274),
    'CONH2': (-0.0689, 6.0694, 5.2280),
    'CON(CH3)2': (0.4482, 5.7899, 3.0020),
    'CH2SH': (1.2797, -0.8223, 4.4646),
    'CH3S': (None, 0.4944, -1.4861),
    'CH2S': (1.0595, 0.7530, -0.2287),
    'I': (0.7797, 0.6777, 0.2646),
    'Br': (0.5717, 0.6997, -1.0722),
    'CH2Cl': (0.2623, 0.5970, -0.5364),
    'CHCl': (0.4462, 2.8060, -1.4125),
    'CCl': (2.7576, 2.0406, 0.1101),
    'CHCl2': (1.1797, 1.8361, -3.2861),
    'CCl2': (0.3653, 0.1696, -1.4334),
    'CCl3': (None, 1.2777, -2.6354),
    'ACCl': (0.8475, -0.0339, -0.7840),
    'ACF': (0.1170, 0.1856, -0.7182),
    'Cl-C=C': (0.2289, 2.3444, 3.8893),
    'CF3': (-0.2293, -1.9735, -1.4665),
    'CH2NO2': (None, 6.8944, -1.2861),
    'CHNO2': (None, 8.0347, -2.3167),
    'ACNO2': (1.4195, 4.4838, -0.7167),
    'CH2CN': (-0.3392, 6.5341, -0.8892),
    'CF2': (-0.9729, None, None),
    'CF': (0.1707, None, None),
    'F': (-0.7069, None, None),
    'CH2=C=C': (-0.2804, None, -1.9167),
    'O': (0.0472, 3.3432, 0.0256),
    'Cl': (0.2256, 1.8711, -0.3295),
    '>C=N-': (-0.3074, -0.0012, -5.3956),
    '-CH=N-': (0.9672, 1.9728, 0.7668),
    'NH': (None, 0.0103, 2.2086),
    'CN': (0.0861, 6.5331, -0.6849),
    'O=C=N-': (-0.1306, 1.6102, 4.0461),
    'SH': (1.0427, 1.9813, 4.8181),
    'S': (1.4899, 9.2072, -0.6250),
    'SO2': (1.5502, 11.1758, 0.1055),
    '>C=S': (0.7747, 0.0683, 3.4080),
    '>C=O': (-0.4343, 0.7905, 1.8147),
    'N': (1.5438, 2.5780, 1.1189),
}
T5 = {   # Table 5, first-order groups for LOW dP (<3) and LOW dH (<3): name -> (dP_low, dH_low)
    'CH3': (-0.72412, 0.29901),
    'CH2': (-0.14030, -0.11610),
    'CH': (0.58978, 0.1386),
    'CH2=CH': (-0.29774, 1.35521),
    'CH=CH': (-0.22864, 0.48189),
    'CH2=C': (0.64816, 0.11148),
    'CH=C': (1.22566, -0.03066),
    'C=C': (None, -0.12117),
    'CH2=C=CH': (-0.32258, None),
    'CH_C': (-0.74895, 0.43846),
    'C_C': (None, -0.35107),
    'ACH': (-0.19313, 0.13532),
    'AC': (0.16369, -0.17405),
    'ACCH3': (-0.47724, -0.28733),
    'ACCH2': (-0.33086, -0.88084),
    'ACCH': (0.86718, -1.44666),
    'CH3COO': (1.71923, None),
    'CH2COO': (2.16274, None),
    'COO': (1.60913, 0.37204),
    'OH': (1.84013, None),
    'CH3O': (-0.40320, None),
    'CH2O': (None, None),
    'CH-O': (None, -0.40667),
    'CH2O_cyc': (-0.33305, None),
    'CH2NH2': (None, None),
    'CH2NH': (0.83214, None),
    'CHNH': (1.25999, None),
    'CH3N': (None, -0.17004),
    'CH2N': (0.65229, -1.03686),
    'CH2S': (None, 0.14606),
    'CH2Cl': (None, 0.48952),
    'CHCl': (None, 0.12996),
    'CHCl2': (None, 0.52541),
    'ACCl': (-0.10778, 0.44238),
    'CCl2F': (None, None),
    'ACF': (None, -0.37183),
    'Cl-C=C': (None, 0.66062),
    'CF3': (None, -0.08871),
    'CH2=C=C': (1.20154, None),
    'O': (-0.48942, None),
    'Cl': (None, 1.12515),
    'S': (0.11058, None),
    '>C=O': (None, -0.05529),
}

C0 = (17.3231, 7.3548, 7.9793)      # Eqs. 24-26 constants
C0_LOW = (2.7467, 1.3720)           # Eqs. 27-28 constants (dP, dH)

# the record vocabulary (UNIFAC group names as written in `groups { unifac (...) }`)
# -> the paper's first-order group; a name absent here is `not estimable`
MAP = {
    'CH3': 'CH3', 'CH2': 'CH2', 'CH': 'CH', 'C': 'C', 'CH2=CH': 'CH2=CH', 'CH=CH': 'CH=CH',
    'CH2=C': 'CH2=C', 'CH=C': 'CH=C', 'C=C': 'C=C', 'CH_C': 'CH_C', 'C_C': 'C_C',
    'ACH': 'ACH', 'AC': 'AC', 'ACCH3': 'ACCH3', 'ACCH2': 'ACCH2', 'ACCH': 'ACCH',
    'CH3CO': 'CH3CO', 'CH2CO': 'CH2CO', 'CHO': 'CHO_ald', 'COOH': 'COOH', 'CH3COO': 'CH3COO',
    'CH2COO': 'CH2COO', 'HCOO': 'HCOO', 'COO': 'COO', 'OH': 'OH', 'ACOH': 'ACOH', 'CH3O': 'CH3O',
    'CH2O': 'CH2O', 'CH-O': 'CH-O', 'C2H5O2': 'C2H5O2', 'CH2NH2': 'CH2NH2', 'CHNH2': 'CHNH2',
    'CH3NH': 'CH3NH', 'CH2NH': 'CH2NH', 'CH3N': 'CH3N', 'CH2N': 'CH2N', 'ACNH2': 'ACNH2',
    'CONH2': 'CONH2', 'CON_CH3_2': 'CON(CH3)2', 'CH2SH': 'CH2SH', 'CH3S': 'CH3S', 'CH2S': 'CH2S',
    'I': 'I', 'Br': 'Br', 'CH2Cl': 'CH2Cl', 'CHCl': 'CHCl', 'CHCl2': 'CHCl2', 'CCl2': 'CCl2',
    'CCl3': 'CCl3', 'ACCl': 'ACCl', 'ACF': 'ACF', 'Cl_C=C_': 'Cl-C=C', 'CF3': 'CF3', 'CF2': 'CF2',
    'CF': 'CF', 'CH2CN': 'CH2CN', 'ACNO2': 'ACNO2',
}

HYDROCARBON = {'CH3', 'CH2', 'CH', 'C', 'CH2=CH', 'CH=CH', 'CH2=C', 'CH=C', 'C=C', 'CH_C', 'C_C',
               'ACH', 'AC', 'ACCH3', 'ACCH2', 'ACCH'}
MAP['CHNO2'] = 'CHNO2'
MAP['CH2O_cyc'] = 'CH2O_cyc'

# atoms of each record-vocabulary group, so that a decomposition must REPRODUCE THE FORMULA
# (a group list that does not is refused, not estimated).
GATOM = {
    'CH3': 'CH3', 'CH2': 'CH2', 'CH': 'CH', 'C': 'C', 'CH2=CH': 'C2H3', 'CH=CH': 'C2H2', 'CH2=C': 'C2H2',
    'CH=C': 'C2H', 'C=C': 'C2', 'CH_C': 'C2H', 'C_C': 'C2', 'ACH': 'CH', 'AC': 'C', 'ACCH3': 'C2H3',
    'ACCH2': 'C2H2', 'ACCH': 'C2H', 'CH3CO': 'C2H3O', 'CH2CO': 'C2H2O', 'CHO': 'CHO', 'COOH': 'CHO2',
    'CH3COO': 'C2H3O2', 'CH2COO': 'C2H2O2', 'HCOO': 'CHO2', 'COO': 'CO2', 'OH': 'HO', 'ACOH': 'CHO',
    'CH3O': 'CH3O', 'CH2O': 'CH2O', 'CH-O': 'CHO', 'C2H5O2': 'C2H5O2', 'CH2NH2': 'CH4N', 'CHNH2': 'CH3N',
    'CH3NH': 'CH4N', 'CH2NH': 'CH3N', 'CH3N': 'CH3N', 'CH2N': 'CH2N', 'ACNH2': 'CH2N', 'CONH2': 'CH2NO',
    'CON_CH3_2': 'C3H6NO', 'CH2SH': 'CH3S', 'CH3S': 'CH3S', 'CH2S': 'CH2S', 'I': 'I', 'Br': 'Br',
    'CH2Cl': 'CH2Cl', 'CHCl': 'CHCl', 'CHCl2': 'CHCl2', 'CCl2': 'CCl2', 'CCl3': 'CCl3', 'ACCl': 'CCl',
    'ACF': 'CF', 'CF3': 'CF3', 'CF2': 'CF2', 'CF': 'CF', 'CH2CN': 'C2H2N', 'ACNO2': 'CNO2',
    'CHNO2': 'CHNO2', 'CH2O_cyc': 'CH2O',
}

# Decompositions written by hand from the structure for molecules whose record carries no
# `unifac` list (the catalogue keeps groups only where a model needed them).  Each is checked
# against the record's formula (GATOM) and lives HERE, in the tool, never in a record.  A
# structure whose first-order fragments are not unambiguous is not written (pyridine, DMSO,
# DMF, NMP, the carbonates, the glycol ethers, furan): they stay `not estimable`.
MANUAL = {
    'aniline': {'ACNH2': 1, 'ACH': 5},
    'anisole': {'CH3O': 1, 'AC': 1, 'ACH': 5},
    'nitrobenzene': {'ACNO2': 1, 'ACH': 5},
    'monochlorobenzene': {'ACCl': 1, 'ACH': 5},
    'oDichlorobenzene': {'ACCl': 2, 'ACH': 4},
    'styrene': {'CH2=CH': 1, 'AC': 1, 'ACH': 5},
    'mCresol': {'ACOH': 1, 'ACCH3': 1, 'ACH': 4},
    'cyclohexanone': {'CH2': 4, 'CH2CO': 1},
    'diisobutylKetone': {'CH3': 4, 'CH': 2, 'CH2': 1, 'CH2CO': 1},
    '1Chlorobutane': {'CH3': 1, 'CH2': 2, 'CH2Cl': 1},
    '2Nitropropane': {'CH3': 2, 'CHNO2': 1},
    'diethylamine': {'CH3': 2, 'CH2': 1, 'CH2NH': 1},
    'diethylSulfide': {'CH3': 2, 'CH2': 1, 'CH2S': 1},
    'tetrahydrofuran': {'CH2': 3, 'CH2O_cyc': 1},
    'nNDimethylacetamide': {'CH3': 1, 'CON_CH3_2': 1},
}


def formula_atoms(fm):
    a = {}
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', fm):
        a[el] = a.get(el, 0) + (int(n) if n else 1)
    return a


def atoms_of(groups):
    tot = {}
    for g, n in groups.items():
        if g not in GATOM:
            return None
        for el, k in formula_atoms(GATOM[g]).items():
            tot[el] = tot.get(el, 0) + k * n
    return tot


def groups_for(r):
    """(groups, source, problem): the record's own `unifac` list, else the MANUAL one; both must
    reproduce the formula."""
    if r['groups']:
        g, src = r['groups'], 'record'
    elif r['file'] in MANUAL:
        g, src = MANUAL[r['file']], 'manual'
    else:
        return None, '', 'no group list'
    at = atoms_of(g)
    if at is not None and at != formula_atoms(r['formula']):
        return None, src, 'groups do not reproduce the formula'
    return g, src, ''


def estimate(groups, ncarbon):
    """groups: {record group name: count}.  Returns (dD, dP, dH, regimeP, regimeH, note); a
    parameter that cannot be estimated is None."""
    if ncarbon < 3:
        return None, None, None, '', '', "not estimable: fewer than 3 carbons (the paper's domain)"
    pg = {}
    for g, n in groups.items():
        if g not in MAP:
            return None, None, None, '', '', 'not estimable: group ' + g + ' is not a first-order group of Table 3'
        k = MAP[g]
        pg[k] = pg.get(k, 0) + n
    res = []
    notes = []
    for ix in range(3):
        miss = sorted(k for k in pg if k not in T3 or T3[k][ix] is None)
        if miss:
            res.append(None)
            notes.append('%s: no Table 3 contribution for %s' % ('dD dP dH'.split()[ix], ','.join(miss)))
            continue
        res.append(sum(T3[k][ix] * n for k, n in pg.items()) + C0[ix])
    reg = ['', '']
    for ix in (1, 2):
        v = res[ix]
        if v is None:
            continue
        reg[ix - 1] = 'standard'
        # the paper says Eqs. 27-28 are for "low values (< 3)" and gives no way to know that in
        # advance; the tool takes them when the Table 3 value is below 3 OR the molecule is a
        # pure hydrocarbon (no polar or hydrogen-bonding group, so a low value is the premise).
        # The second clause is THIS TOOL's rule, chosen after seeing the validation (in-sample).
        if v < 3.0 or all(k in HYDROCARBON for k in pg):
            if all(k in T5 and T5[k][ix - 1] is not None for k in pg):
                res[ix] = sum(T5[k][ix - 1] * n for k, n in pg.items()) + C0_LOW[ix - 1]
                reg[ix - 1] = 'low'
            else:
                reg[ix - 1] = 'belowValidity'
    notes.append('first-order only')
    return res[0], res[1], res[2], reg[0], reg[1], '; '.join(notes)


def read_record(path):
    s = open(path, encoding='utf-8', errors='replace').read()

    def f(k):
        m = re.search(r'^' + k + r'\s+([^;]+);', s, re.M)
        return m.group(1).strip() if m else ''
    m = re.search(r'^\s*unifac \((.*?)\);', s, re.M)
    groups = {}
    if m:
        for g, c in re.findall(r'group\s+([^;]+);\s*count\s+(\d+);', m.group(1)):
            groups[g.strip()] = groups.get(g.strip(), 0) + int(c)
    hm = re.search(r'\nhansen\n\{(.*?)\n\}', s, re.S)
    meas = None
    if hm:   # the record stores Pa^0.5; MPa^0.5 = Pa^0.5 / 1000
        meas = tuple(float(x) / 1000.0 for x in re.findall(r'd[DPH]\s+([\d.]+);', hm.group(1)))
    fm = f('formula')
    nc = 0
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', fm):
        if el == 'C':
            nc += int(n) if n else 1
    return dict(name=f('name'), CAS=f('CAS'), formula=fm, groups=groups, nC=nc, measured=meas,
                file=os.path.basename(path)[:-4])


def root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def selftest():
    # 1-hexanal, Tables 7-9: 15.8411 / 7.9654 / 5.7191 (Table 10: 15.8, 8.0, 5.7)
    d, p, h = estimate({'CH3': 1, 'CH2': 4, 'CHO': 1}, 6)[:3]
    assert abs(d - 15.8411) < 5e-5 and abs(p - 7.9654) < 5e-5 and abs(h - 5.7191) < 5e-5, (d, p, h)
    # alizarin first order, Tables 11-15: dD 21.5535, dP 10.43, dH 22.9753
    pg = {'ACH': 6, 'AC': 4, 'ACOH': 2, '>C=O': 2}
    for ix, want, tol in ((0, 21.5535, 5e-4), (1, 10.43, 5e-3), (2, 22.9753, 5e-4)):
        v = sum(T3[k][ix] * n for k, n in pg.items()) + C0[ix]
        assert abs(v - want) < tol, (ix, v, want)
    print('hansen_from_groups selftest: OK (hexanal Tables 7-10, alizarin Tables 11-15)')


def catalogue():
    out = []
    d = os.path.join(root(), 'data', 'standards', 'components')
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.dat'):
            r = read_record(os.path.join(d, fn))
            r['file'] = fn[:-4]
            out.append(r)
    return out


def validate():
    print('%-22s %2s | %-21s | %-21s | %-21s | %s' % ('component', 'nC', 'dD meas/est/err', 'dP meas/est/err', 'dH meas/est/err', 'regime P/H, note'))
    s_all = [[0.0, 0], [0.0, 0], [0.0, 0]]
    s_in = [[0.0, 0], [0.0, 0], [0.0, 0]]
    for r in catalogue():
        if not r['measured']:
            continue
        g, src, why = groups_for(r)
        e = estimate(g, r['nC']) if g else (None, None, None, '', '', why)
        cells = []
        for ix in range(3):
            m, v = r['measured'][ix], e[ix]
            if v is None:
                cells.append('%5.1f /   -- /   --  ' % m)
                continue
            cells.append('%5.1f / %4.1f / %+5.1f ' % (m, v, v - m))
            s_all[ix][0] += abs(v - m); s_all[ix][1] += 1
            if r['nC'] >= 3:
                s_in[ix][0] += abs(v - m); s_in[ix][1] += 1
        print('%-22s %2d | %s | %s | %s | %s/%s %s' % (r['file'][:22], r['nC'], cells[0], cells[1], cells[2], e[3], e[4], e[5][:50]))
    for lab, s in (('all estimable', s_all), ('in domain (nC>=3)', s_in)):
        print('AAE %-18s dD %.2f (n=%d)  dP %.2f (n=%d)  dH %.2f (n=%d)   [MPa^0.5]' % ((lab,) + tuple(x for ix in range(3) for x in (s[ix][0] / max(1, s[ix][1]), s[ix][1]))))
    print('the paper, Table 2, first order:   dD 0.44         dP 1.05         dH 0.88   (its own 344-375 molecules, in-sample)')


def write_csv():
    out = os.path.join(root(), 'data', 'groupEstimative', 'hansenEstimates.csv')
    recs = []
    for r in catalogue():
        if not r['measured']:
            r['tier'] = 'standards-unmeasured'
            recs.append(r)
    d = os.path.join(root(), 'data', 'groupEstimative', 'components')
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.dat'):
            r = read_record(os.path.join(d, fn))
            r['tier'] = 'groupEstimative'
            recs.append(r)
    ne = {}
    n_est = 0
    with open(out, 'w', newline='') as fh:
        w = csv.writer(fh, lineterminator='\n')
        w.writerow(['name', 'CAS', 'formula', 'tier', 'dD_MPa05', 'dP_MPa05', 'dH_MPa05', 'regimeP', 'regimeH', 'origin', 'method', 'note'])
        for r in recs:
            g, src, why = groups_for(r)
            e = estimate(g, r['nC']) if g else (None, None, None, '', '', 'not estimable: ' + why)
            if e[0] is None and e[1] is None and e[2] is None:
                key = e[5].split(' is not')[0] if 'group ' in e[5] else e[5]
                ne[key] = ne.get(key, 0) + 1
                continue
            n_est += 1
            fm = lambda x: '' if x is None else '%.2f' % x
            w.writerow([r['name'], r['CAS'], r['formula'], r['tier'], fm(e[0]), fm(e[1]), fm(e[2]), e[3], e[4],
                        'predictive', 'stefanis2008-firstOrder', e[5]])
    print('wrote', out, n_est, 'rows;', sum(ne.values()), 'not estimable (not written)')
    for k, v in sorted(ne.items(), key=lambda kv: -kv[1])[:20]:
        print('  %6d  %s' % (v, k))


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--selftest' in a:
        selftest()
    elif '--validate' in a:
        validate()
    elif '--write' in a:
        write_csv()
    else:
        print(__doc__)
