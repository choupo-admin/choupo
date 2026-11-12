"""Read a run's <t>/internalStates/rig instants (named, so immune to the
trajectory.csv column shift) and print the panel series as TSV."""
import sys, os, re
case = sys.argv[1]
keys = ['I_A','U_V','i_A_per_m2','i_lim_A_per_m2','i_over_ilim','xi_eff','E_mem_pair_V',
        'P_electric_kW','W_electric_kJ','kappa_dil_S_per_m','kappa_conc_S_per_m','deminActual','m_dil_K','m_dil_H','m_dil_HTart']
rows = []
import csv
r0 = next(csv.DictReader(open(os.path.join(case,'trajectory.csv'))))  # t = 0 row: header-aligned
rows.append((0.0, {k: float(r0.get('rig.'+k,'nan')) for k in keys}))
for d in os.listdir(case):
    if d == '0': continue
    try: t = float(d)
    except ValueError: continue
    f = os.path.join(case, d, 'internalStates', 'rig')
    if not os.path.exists(f): continue
    txt = open(f).read()
    v = {}
    for k in keys:
        m = re.search(r'\b' + re.escape(k) + r'\s+([-0-9.eE+]+);', txt)
        v[k] = float(m.group(1)) if m else float('nan')
    rows.append((t, v))
rows.sort(key=lambda r: r[0])
k0 = None
print('t_s\t' + '\t'.join(keys) + '\tkappaRemoved')
for t, v in rows:
    print(f'{t:g}\t' + '\t'.join(f'{v[k]:.5g}' for k in keys), end='')
    print('\t-' if k0 is None else f'\t{1 - v["kappa_dil_S_per_m"]/k0:.4f}')
    if k0 is None: k0 = v['kappa_dil_S_per_m']
