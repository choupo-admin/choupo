#!/usr/bin/env python3
"""Item 5, D3 (NaOH + water, the Olsson law): which WRONG implementations of
the law could pass the D3 thresholds.

The per-point files are not in git; the law's own statistics against them are
(baseline/d3_olsson_summary.txt and the thresholds note 3.3: set A AAD 0.055 %,
max 0.206 %; set B at 2 MPa AAD 0.120 %, max 0.200 %).  For each variant the
deviation delta from the CORRECT law is computed on the states of each set
(set A: w_NaOH 0.20..0.50 step 0.01 x T 303.15..353.15 step 10 K, the 31 x 6
grid the thresholds note describes; set B at 2 MPa: 323.15 K, 23 points,
w_NaOH 0.0039..0.2468 uniform -- its grid is not on main).  By the triangle
inequality, AAD_variant lies in [mean|delta| - AAD_law, mean|delta| + AAD_law]
and max_variant >= max|delta| - max_law, so a variant is decided when those
bounds fall on one side of the threshold.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item5_d3.py > item5_d3.tsv
"""
C = [
    [5007.2279636, -25131.164248, 74107.692582, -104657.48684, 69821.773186, -18145.911810],
    [-64.786269079, 525.34360564, -1608.4471903, 2350.9753235, -1660.9035108, 457.64374355],
    [0.24436776978, -1.9737722344, 6.04601497138, -8.9090614947, 6.37146769397, -1.7816083111],
]
flat = [c for row in C for c in row]

def poly(M, x, t, half=True):
    return sum(t ** j * sum(M[j][k] * x ** ((k / 2) if half else k) for k in range(6)) for j in range(3))

def law(T, w):            return poly(C, 1 - w, T - 273.15)
V = {
    'correct': law,
    't_in_kelvin': lambda T, w: poly(C, 1 - w, T),
    'w_NaOH_for_w_water': lambda T, w: poly(C, w, T - 273.15),
    'flat_list_read_column_major': lambda T, w: poly([[flat[k * 3 + j] for k in range(6)] for j in range(3)], 1 - w, T - 273.15),
    'rows_reversed': lambda T, w: poly(C[::-1], 1 - w, T - 273.15),
    'x_not_sqrt_x': lambda T, w: poly(C, 1 - w, T - 273.15, half=False),
    'zero_at_273.16': lambda T, w: poly(C, 1 - w, T - 273.16),
    'mole_fraction_for_mass_fraction': lambda T, w: poly(C, (1 - w) / 18.015 / ((1 - w) / 18.015 + w / 39.997), T - 273.15),
    'last_coef_row0_typo_1e-3_rel': lambda T, w: poly([[C[0][k] * (1.001 if k == 5 else 1) for k in range(6)], C[1], C[2]], 1 - w, T - 273.15),
    'T_frozen_at_298.15': lambda T, w: law(298.15, w),
}
A = [(303.15 + 10 * i, 0.20 + 0.01 * j) for i in range(6) for j in range(31)]
B2 = [(323.15, 0.0039 + (0.2468 - 0.0039) * j / 22) for j in range(23)]
SETS = {'A_0.1MPa': (A, 0.055, 0.206, 0.10, 0.30), 'B_2MPa': (B2, 0.120, 0.200, 0.20, 0.30)}
print('variant\tset\tmean|delta|_pct\tmax|delta|_pct\tAAD_bounds_pct\tmax_lower_bound_pct\tverdict(thresholds)')
for n, f in V.items():
    for s, (pts, aad_law, max_law, tA, tM) in SETS.items():
        d = [abs(f(T, w) / law(T, w) - 1) * 100 for T, w in pts]
        m, M = sum(d) / len(d), max(d)
        lo, hi = max(0.0, m - aad_law), m + aad_law
        mlo = max(0.0, M - max_law)
        if n == 'correct':
            v = f'as measured: AAD {aad_law}, max {max_law} -> pass'
        elif lo > tA or mlo > tM:
            v = 'FAIL (decided)'
        elif hi <= tA and M + max_law <= tM:
            v = 'PASS (decided): the threshold cannot see it'
        else:
            v = 'undecided without the points'
        print(f'{n}\t{s}\t{m:.4f}\t{M:.4f}\t{lo:.3f}..{hi:.3f}\t{mlo:.3f}\t{v}')
