#!/usr/bin/env python3
"""Compare each record's stored Vliq at its assigned VliqT with the measured
saturated-liquid molar volume located in the ThermoML mirror.

usage: measured_vs_stored.py POINTS_TSV KEYS_TSV OUT_TSV CURVE_TSV
  POINTS_TSV  output of thermoml_liquid_volume.py
  KEYS_TSV    output of make_keys.py

The measured saturated-liquid curve V_sat(T) of a component is built from
  (a) points the archive marks as the LIQUID of a two-phase (Liquid|Gas) block
      -- coexistence values, used as they are;
  (b) ONLY when (a) gives fewer than 3 points: single-phase liquid points (archive phase Liquid, or Fluid below Tc on
      the dense side, V < 0.8 * 0.29 R Tc / Pc) at the LOWEST pressure of each
      (article, isotherm), and only when that pressure is <= 6 MPa.  The
      compressed-liquid offset from saturation is bounded by the isotherm's own
      slope: |dV/dP| * P_low, printed as pcorr_bound_pct (nan when the isotherm has one point).
Points at one temperature (within 0.05 K) are averaged.  V at a query T is the
linear interpolation of ln V in T between the two bracketing curve points; a
query outside the curve is NOT extrapolated ('not bracketed').  The
temperature where the measured curve equals the stored value is found on the
same piecewise curve.  Every value: transcribedNotCheckedAgainstArticle.
"""
import csv, math, sys
from collections import defaultdict

R = 8.314462618


def load_keys(path):
    k = {}
    for line in open(path):
        if line.startswith('#') or not line.strip():
            continue
        f = line.rstrip('\n').split('\t')
        k[f[0]] = dict(key=f[1], M=float(f[2]), Tc=float(f[3]), Pc=float(f[4]),
                       omega=float(f[5]), Vliq=float(f[6]), VliqT=float(f[7]),
                       Tb=float(f[8]) if len(f) > 8 else float('nan'))
    return k


def curve(rows, k):
    Tc, Pc = k['Tc'], k['Pc'] * 1e5
    Vlim = 0.8 * 0.29 * R * Tc / Pc * 1e6 if Pc == Pc and Pc > 0 else float('inf')
    pts = []   # (T, V, U, doi, kind, P, pcorr%)
    iso = defaultdict(list)
    for r in rows:
        T, V, P = float(r['T_K']), float(r['V_cm3_mol']), float(r['P_kPa'])
        U = float(r['U_V_cm3_mol'])
        if r['propPhase'] == 'Liquid' and 'Gas' in r['phases']:
            pts.append((T, V, U, r['doi'], 'sat', float('nan'), 0.0))
        elif r['propPhase'] in ('Liquid', 'Fluid (supercritical or subcritical phases)') \
                and '|' not in r['phases'] and P == P and T < Tc and V < Vlim:
            iso[(r['doi'], round(T, 1))].append((P, V, U, T))
    for (doi, _), lst in iso.items():
        lst.sort()
        P0, V0, U0, T0 = lst[0]
        if P0 > 6000:
            continue
        slope = float('nan')
        if len(lst) >= 2:
            P1, V1 = lst[1][0], lst[1][1]
            slope = (V1 - V0) / (P1 - P0) if P1 != P0 else 0.0
        pcorr = abs(slope) * P0 / V0 * 100.0
        pts.append((T0, V0, U0, doi, 'compressed@%.0fkPa' % P0, P0, pcorr))
    # When the archive carries >= 3 coexistence (saturated) points, the curve
    # is built from them ALONE: single-phase points of an isochoric or
    # high-pressure series would otherwise mix compressed states into it.
    nsat = sum(1 for p in pts if p[4] == 'sat')
    if nsat >= 3:
        pts = [p for p in pts if p[4] == 'sat']
    pts.sort()
    merged = []
    for p in pts:
        if merged and abs(merged[-1][0][0] - p[0]) < 0.05:
            merged[-1].append(p)
        else:
            merged.append([p])
    out = []
    for g in merged:
        T = sum(p[0] for p in g) / len(g)
        V = sum(p[1] for p in g) / len(g)
        spread = (max(p[1] for p in g) - min(p[1] for p in g)) / V * 100 if len(g) > 1 else 0.0
        out.append(dict(T=T, V=V, n=len(g), spread=spread,
                        U=max((p[2] for p in g if p[2] == p[2]), default=float('nan')),
                        dois=sorted(set(p[3] for p in g)), kinds=sorted(set(p[4] for p in g)),
                        pcorr=max((p[6] for p in g), key=lambda x: -1 if x != x else x)))
    return out


def interp(c, Tq):
    for a, b in zip(c, c[1:]):
        if a['T'] <= Tq <= b['T']:
            w = (Tq - a['T']) / (b['T'] - a['T'])
            return math.exp((1 - w) * math.log(a['V']) + w * math.log(b['V'])), (a, b)
    return None, None


def invert(c, V):
    for a, b in zip(c, c[1:]):
        lo, hi = sorted((a['V'], b['V']))
        if lo <= V <= hi and a['V'] != b['V']:
            w = (math.log(V) - math.log(a['V'])) / (math.log(b['V']) - math.log(a['V']))
            return a['T'] + w * (b['T'] - a['T']), (a, b)
    return None, None


def main():
    pts, keys, out, curvefile = sys.argv[1:5]
    rows = list(csv.DictReader(open(pts), delimiter='\t'))
    byc = defaultdict(list)
    for r in rows:
        byc[r['component']].append(r)
    keys = load_keys(keys)
    with open(out, 'w') as fo, open(curvefile, 'w') as fc:
        fo.write('component\tinchikey\tM_g_mol\tstored_Vliq_cm3_mol\tassigned_VliqT_K\t'
                 'measured_V_at_VliqT_cm3_mol\tdifference_pct\tT_where_measured_equals_stored_K\t'
                 'T_distance_K\tpoints_used\tdois\tstatus\n')
        fc.write('component\tT_K\tV_cm3_mol\tn\tspread_pct\tmax_U_cm3_mol\tpcorr_bound_pct\tkinds\tdois\tstatus\n')
        for name, k in keys.items():
            c = curve(byc.get(name, []), k)
            for p in c:
                fc.write('%s\t%.3f\t%.4f\t%d\t%.3f\t%.4f\t%.3f\t%s\t%s\ttranscribedNotCheckedAgainstArticle\n'
                         % (name, p['T'], p['V'], p['n'], p['spread'], p['U'], p['pcorr'],
                            ','.join(p['kinds']), ','.join(p['dois'])))
            Vm, br = interp(c, k['VliqT'])
            Te, br2 = invert(c, k['Vliq'])
            if not c:
                note = 'no measured liquid volume in the mirror'
            else:
                note = 'curve %.1f-%.1f K' % (c[0]['T'], c[-1]['T'])
            used, dois = [], set()
            for b in (br, br2):
                if b:
                    for p in b:
                        used.append('%.2fK:%.3f' % (p['T'], p['V']))
                        dois.update(p['dois'])
            fo.write('\t'.join([
                name, k['key'], '%g' % k['M'], '%g' % k['Vliq'], '%g' % k['VliqT'],
                '%.3f' % Vm if Vm else 'not bracketed (%s)' % note,
                '%+.2f' % ((k['Vliq'] / Vm - 1) * 100) if Vm else '-',
                '%.2f' % Te if Te else 'not bracketed',
                '%+.2f' % (Te - k['VliqT']) if Te else '-',
                ';'.join(dict.fromkeys(used)) or '-',
                ','.join(sorted(dois)) or '-',
                'transcribedNotCheckedAgainstArticle' if c else '-']) + '\n')


if __name__ == '__main__':
    main()
