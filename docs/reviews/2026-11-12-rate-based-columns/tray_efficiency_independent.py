#!/usr/bin/env python3
"""Independent recomputation of the computed sieve-tray efficiency of C329.

HOW TO RUN (standard library only):
    python3 tray_efficiency_independent.py            # prints the tables
    python3 tray_efficiency_independent.py --tsv DIR  # also writes .tsv files

WHAT IT DOES.  For the FRI 14 % sieve tray of Yanagi & Sakata (1982) with
cyclohexane / n-heptane at 34 kPa and F_s = 1.47 (the case
trayEfficiency01_yanagi14 and its ChanFair twin trayEfficiency05), it
  (1) computes every property the efficiency chain reads by its own route
      (ideal-gas vapour density; Chung low-pressure vapour viscosity with the
      LITERATURE critical volumes, Wilke mixing; Fuller vapour diffusivity
      with Poling's atomic volumes; liquid molar volume by Rackett with the
      Yamada-Gunn Z_RA, ideal mixing; Wilke-Chang at infinite dilution with
      Le Bas volumes; Brock-Bird surface tension, mole-fraction average;
      Raoult + Antoine for y*, the slope m by central difference);
  (2) computes Fair's flooding velocity from the Lygeros-Magoulas fit of
      the C_SB chart, on the net area;
  (3) computes the point efficiency, the eddy-diffusion Murphree efficiency
      and the Colburn entrainment correction for the AIChE (SI form as in
      Treybal 3ed) and the Chan-Fair (SI form, h_L in mm) correlations;
  (4) marches the closed column at total reflux (constant molar overflow --
      a simplification of the engine's enthalpy-based traffic, stated) from
      the declared reboiler liquid, iterating the efficiencies, and reports
      the overall tray efficiency by the Fenske slope.

Not transcribed from the engine: the property routes above differ from the
engine's (it estimates Vc from Zc(omega), uses Rackett anchored on the
record's Vliq, Butler for the mixture surface tension, Rackett volumes at Tb
in Wilke-Chang).  Transcribed and SAID SO: the Antoine constants, MW, Tc, Pc,
omega, Tb and the Fuller diffusion volumes (the case's own component records,
which are its inputs); the Colburn/Fair median entrainment constants
(-3.2108, -8.9049, 11.6291, Perry 9ed Eq 14-99, quoted in the engine header;
the reviewer could not consult Perry in this session).
"""
import math
import sys

R = 8.314462618
P = 34000.0  # Pa

# --- component data: the case's own records (inputs) -----------------------
C = {
    'cC6': dict(MW=84.1595, Tc=553.6, Pc=40.80526e5, w=0.20926, Tb=353.8649,
                Vliq298=1.0875e-4, sv=122.9, ant=(4.08223, 1271.07, -42.2622),
                Vc_lit=308.0e-6,  # Poling 5ed App A (literature, not the engine's estimate)
                LeBas=6 * 14.8 + 12 * 3.7 - 15.0),   # cm3/mol, six-ring -15
    'nC7': dict(MW=100.2020, Tc=541.2259, Pc=27.73824e5, w=0.349, Tb=371.5333,
                Vliq298=1.4746e-4, sv=148.27, ant=(4.11662, 1317.92, -51.0126),
                Vc_lit=428.0e-6,
                LeBas=7 * 14.8 + 16 * 3.7),
}
K1, K2 = 'cC6', 'nC7'


def psat(c, T):
    A, B, Cc = C[c]['ant']
    return 1e5 * 10 ** (A - B / (T + Cc))


def bubbleT(x1, T0=330.0):
    T = T0
    for _ in range(100):
        f = x1 * psat(K1, T) + (1 - x1) * psat(K2, T) - P
        h = 1e-3
        df = (x1 * psat(K1, T + h) + (1 - x1) * psat(K2, T + h) - P - f) / h
        dT = -f / df
        T += dT
        if abs(dT) < 1e-10:
            break
    return T


def ystar(x1, T0=330.0):
    T = bubbleT(x1, T0)
    return x1 * psat(K1, T) / P, T


def chung_mu(c, T):
    d = C[c]
    Ts = 1.2593 * T / d['Tc']
    Om = 1.16145 * Ts ** -0.14874 + 0.52487 * math.exp(-0.77320 * Ts) + 2.16178 * math.exp(-2.43787 * Ts)
    Fc = 1 - 0.2756 * d['w']
    mu_uP = 40.785 * Fc * math.sqrt(d['MW'] * T) / ((d['Vc_lit'] * 1e6) ** (2 / 3) * Om)
    return mu_uP * 1e-7


def wilke_mix(y, mus, Ms):
    out = 0.0
    for i in range(2):
        s = 0.0
        for j in range(2):
            phi = (1 + math.sqrt(mus[i] / mus[j]) * (Ms[j] / Ms[i]) ** 0.25) ** 2 / math.sqrt(8 * (1 + Ms[i] / Ms[j]))
            s += y[j] * phi
        out += y[i] * mus[i] / s
    return out


def fuller(T):
    MAB = 2 / (1 / C[K1]['MW'] + 1 / C[K2]['MW'])
    D = 0.00143 * T ** 1.75 / ((P / 1e5) * math.sqrt(MAB) * (C[K1]['sv'] ** (1 / 3) + C[K2]['sv'] ** (1 / 3)) ** 2)
    return D * 1e-4  # m2/s


def rackett_V(c, T):
    d = C[c]
    Zra = 0.29056 - 0.08775 * d['w']
    f = lambda TT: Zra ** (1 + (1 - TT / d['Tc']) ** (2 / 7))
    return d['Vliq298'] * f(T) / f(298.15)


def wilke_chang(solute, solvent, T, muL):
    # D (cm2/s) = 7.4e-8 (phi M_B)^0.5 T / (eta_cP V_A^0.6), phi = 1
    D = 7.4e-8 * math.sqrt(C[solvent]['MW']) * T / ((muL * 1e3) * C[solute]['LeBas'] ** 0.6)
    return D * 1e-4


def brock_bird(c, T):
    d = C[c]
    Tbr = d['Tb'] / d['Tc']
    Pc_bar = d['Pc'] / 1e5
    Q = 0.1196 * (1 + Tbr * math.log(Pc_bar / 1.01325) / (1 - Tbr)) - 0.279
    sig = Pc_bar ** (2 / 3) * d['Tc'] ** (1 / 3) * Q * (1 - T / d['Tc']) ** (11 / 9)  # dyn/cm
    return sig * 1e-3


# --- geometry (Table I of Yanagi & Sakata, as declared in the case) --------
D = 1.2
AT = math.pi * D * D / 4
Adf = 0.1238
Aa = AT * (1 - 2 * Adf)
An = AT * (1 - Adf)
lw = 0.7833 * D
hw = 0.0508
Rr = D / 2
Zp = D - 2 * (Rr - math.sqrt(Rr * Rr - (lw / 2) ** 2))  # liquid travel
zw = (D + lw) / 2                                        # average flow width
TS = 0.610
muL_decl = 3.7e-4


def tray_state(T, x1, y1, Vmol, Lmol):
    """Vmol, Lmol in kmol/s; x1, y1 light-key mole fractions."""
    MV = y1 * C[K1]['MW'] + (1 - y1) * C[K2]['MW']
    ML = x1 * C[K1]['MW'] + (1 - x1) * C[K2]['MW']
    rhoV = P * MV / (R * T) / 1000.0 * 1000.0 / 1000.0  # kg/m3: P M/(R T) with M in kg/kmol -> /1000
    rhoV = P * (MV / 1000.0) / (R * T)
    VL = x1 * rackett_V(K1, T) + (1 - x1) * rackett_V(K2, T)
    rhoL = (ML / 1000.0) / VL
    muV = wilke_mix([y1, 1 - y1], [chung_mu(K1, T), chung_mu(K2, T)], [C[K1]['MW'], C[K2]['MW']])
    DV = fuller(T)
    DL = x1 * wilke_chang(K2, K1, T, muL_decl) + (1 - x1) * wilke_chang(K1, K2, T, muL_decl)
    sig = x1 * brock_bird(K1, T) + (1 - x1) * brock_bird(K2, T)
    h = 1e-4
    m = (ystar(x1 + h, T)[0] - ystar(x1 - h, T)[0]) / (2 * h)
    QV = Vmol * MV / rhoV
    qL = Lmol * ML / rhoL
    return dict(MV=MV, ML=ML, rhoV=rhoV, rhoL=rhoL, muV=muV, DV=DV, DL=DL, sigma=sig,
                m=m, lam=m * Vmol / Lmol, QV=QV, qL=qL, ScV=muV / (rhoV * DV))


def fair_flood(s, Vmol, Lmol):
    FLV = (Lmol * s['ML']) / (Vmol * s['MV']) * math.sqrt(s['rhoV'] / s['rhoL'])
    CSB = 0.0105 + 8.127e-4 * (TS * 1000) ** 0.755 * math.exp(-1.463 * FLV ** 0.842)
    uf = CSB * (s['sigma'] / 0.020) ** 0.2 * math.sqrt((s['rhoL'] - s['rhoV']) / s['rhoV'])
    un = s['QV'] / An
    return un / uf, FLV, CSB


def eddy(EOG, lam, Pe):
    lE = lam * EOG
    eta = Pe / 2 * (math.sqrt(1 + 4 * lE / Pe) - 1)
    ep = eta + Pe
    return EOG * ((1 - math.exp(-ep)) / (ep * (1 + ep / eta)) + (math.exp(eta) - 1) / (eta * (1 + eta / ep)))


def colburn(EMV, Phi):
    psi = math.exp(-3.2108 - 8.9049 * Phi + 11.6291 * Phi * Phi)
    return EMV / (1 + EMV * psi / (1 - psi)), psi


def aiche(s, Phi):
    Va = s['QV'] / Aa
    Fa = Va * math.sqrt(s['rhoV'])
    q = s['qL']
    hL = 6.10e-3 + 0.725 * hw - 0.238 * hw * Fa + 1.225 * q / zw
    thL = hL * zw * Zp / q
    NG = (0.776 + 4.57 * hw - 0.238 * Fa + 104.6 * q / Zp) / math.sqrt(s['ScV'])
    NL = 40000 * math.sqrt(s['DL']) * (0.213 * Fa + 0.15) * thL
    NOG = 1 / (1 / NG + s['lam'] / NL)
    EOG = 1 - math.exp(-NOG)
    DE = (3.93e-3 + 0.0171 * Va + 3.67 * q / Zp + 0.18 * hw) ** 2
    Pe = Zp ** 2 / (DE * thL)
    EMVd = eddy(EOG, s['lam'], Pe)
    EMV, psi = colburn(EMVd, Phi)
    return dict(Fa=Fa, hL=hL, thL=thL, NG=NG, NL=NL, EOG=EOG, DE=DE, Pe=Pe, EMVdry=EMVd, psi=psi, EMV=EMV)


def chanfair(s, Phi):
    Va = s['QV'] / Aa
    Fa = Va * math.sqrt(s['rhoV'])
    Ks = Va * math.sqrt(s['rhoV'] / (s['rhoL'] - s['rhoV']))
    phie = math.exp(-12.55 * Ks ** 0.91)
    Cb = 0.501 + 0.438 * math.exp(-137.8 * hw)          # Bennett, m
    hL = phie * (hw + Cb * (s['qL'] / (lw * phie)) ** 0.67)  # m
    hLmm = 1000 * hL
    thL = hL * Aa / s['qL']
    tV = (1 - phie) * hL / (phie * Va)
    f = min(Phi, 0.6)                                     # entrainment applied separately
    kVa = 316 * math.sqrt(s['DV']) * (1030 * f - 867 * f * f) / math.sqrt(hLmm)
    kLa = 78.8 * math.sqrt(s['DL'] * 1e4) * (Fa + 0.425)  # D_L in cm2/s, as in the AIChE-derived form
    NV = kVa * tV
    NL = kLa * thL
    NOG = 1 / (1 / NV + s['lam'] / NL)
    EOG = 1 - math.exp(-NOG)
    DE = 6.675e-3 * Va ** 1.44 + 0.922e-4 * hLmm - 5.62e-3
    Pe = Zp ** 2 / (DE * thL)
    EMVd = eddy(EOG, s['lam'], Pe)
    EMV, psi = colburn(EMVd, Phi)
    return dict(Fa=Fa, hL=hL, phie=phie, thL=thL, NG=NV, NL=NL, EOG=EOG, DE=DE, Pe=Pe, EMVdry=EMVd, psi=psi, EMV=EMV)


def march(Fs, xN=0.29, ntray=10, model=aiche):
    yN, TN = ystar(xN)
    MV = yN * C[K1]['MW'] + (1 - yN) * C[K2]['MW']
    rhoV = P * (MV / 1000) / (R * TN)
    V = Fs * AT * math.sqrt(rhoV) / MV  # kmol/s, CMO: V = L everywhere
    E = [0.7] * ntray
    for it in range(200):
        x = [0.0] * ntray
        y = [0.0] * ntray
        T = [0.0] * ntray
        yb = yN
        for k in range(ntray - 1, -1, -1):     # k = 0 is the top tray
            x[k] = yb                          # total reflux: x_j = y_{j+1}
            ys, T[k] = ystar(x[k])
            y[k] = yb + E[k] * (ys - yb)
            yb = y[k]
        Enew = []
        for k in range(ntray):
            s = tray_state(T[k], x[k], y[k], V, V)
            Phi = fair_flood(s, V, V)[0]
            Enew.append(model(s, Phi)['EMV'])
        dE = max(abs(a - b) for a, b in zip(E, Enew))
        E = Enew
        if dE < 1e-10:
            break
    TT, TB = T[0], T[-1]
    a = lambda Tk: psat(K1, Tk) / psat(K2, Tk)
    alpha = math.sqrt(a(TT) * a(TB))
    r = lambda v: v / (1 - v)
    Nt = math.log(r(x[0]) / r(x[-1])) / math.log(alpha)
    return Nt / (ntray - 1), E, x, y, T, alpha, V


def main():
    out = None
    if '--tsv' in sys.argv:
        out = sys.argv[sys.argv.index('--tsv') + 1]
    # (A) tray 5 of trayEfficiency01 at Fs 1.47: the engine's own column state
    #     (T, x, y, V, L) taken as the efficiency's input, every property
    #     and correlation recomputed here.
    eng = dict(T=322.868844473, x=0.90146, y=0.93485, V=72.1476401394 / 3600, L=71.8859960228 / 3600)
    eng_out = dict(Fa=1.93170607232, EOG=0.634616853582, Pe=22.9501701732, EMV=0.746420003451, flood=0.584)
    s = tray_state(eng['T'], eng['x'], eng['y'], eng['V'], eng['L'])
    Phi, FLV, CSB = fair_flood(s, eng['V'], eng['L'])
    a = aiche(s, Phi)
    rows = [('quantity', 'independent', 'engine', 'rel_diff_pct')]
    def add(name, mine, theirs):
        rows.append((name, '%.5g' % mine, '%.5g' % theirs if theirs is not None else 'not printed',
                     '%.2f' % (100 * (mine - theirs) / theirs) if theirs else ''))
    add('F_LV', FLV, 0.0383)
    add('C_SB m/s', CSB, 0.104)
    add('flood approach', Phi, eng_out['flood'])
    add('F_active', a['Fa'], eng_out['Fa'])
    add('E_OG (AIChE)', a['EOG'], eng_out['EOG'])
    add('Pe (AIChE)', a['Pe'], eng_out['Pe'])
    add('E_MV with entrainment (AIChE)', a['EMV'], eng_out['EMV'])
    for k in ('rhoV', 'rhoL', 'muV', 'DV', 'DL', 'sigma', 'm', 'ScV'):
        rows.append((k, '%.5g' % s[k], 'not printed', ''))
    for k in ('NG', 'NL', 'hL', 'thL', 'DE', 'EMVdry', 'psi'):
        rows.append(('AIChE ' + k, '%.5g' % a[k], 'not printed', ''))
    print('(A) trayEfficiency01, tray 5, F_s 1.47, AIChE')
    for r in rows:
        print('\t'.join(r))
    if out:
        with open(out + '/tray5_aiche_trayEfficiency01.tsv', 'w') as f:
            for r in rows:
                f.write('\t'.join(r) + '\n')

    # (B) ChanFair, tray 5 of trayEfficiency05 (engine state from its own run)
    engc = dict(T=322.39, x=0.93743, y=0.96329, V=72.349 / 3600, L=72.129 / 3600)
    s2 = tray_state(engc['T'], engc['x'], engc['y'], engc['V'], engc['L'])
    Phi2 = fair_flood(s2, engc['V'], engc['L'])[0]
    c = chanfair(s2, Phi2)
    rows2 = [('quantity', 'independent', 'engine', 'rel_diff_pct'),
             ('flood approach', '%.4f' % Phi2, '0.580', '%.2f' % (100 * (Phi2 - 0.58) / 0.58)),
             ('E_MV with entrainment (ChanFair)', '%.4f' % c['EMV'], '0.8894', '%.2f' % (100 * (c['EMV'] - 0.8894) / 0.8894))]
    for k in ('Fa', 'hL', 'phie', 'NG', 'NL', 'EOG', 'DE', 'Pe', 'EMVdry', 'psi'):
        rows2.append(('ChanFair ' + k, '%.5g' % c[k], 'not printed', ''))
    print('\n(B) trayEfficiency05, tray 5, F_s 1.47, ChanFair')
    for r in rows2:
        print('\t'.join(r))
    if out:
        with open(out + '/tray5_chanfair_trayEfficiency05.tsv', 'w') as f:
            for r in rows2:
                f.write('\t'.join(r) + '\n')

    # (C) the whole column, independent CMO march
    rows3 = [('model', 'Fs', 'Eo_independent_CMO', 'Eo_engine', 'diff_pts', 'Eo_measured', 'measured_source')]
    for name, mdl, eng_eo in (('AIChE', aiche, 0.737719), ('ChanFair', chanfair, 0.901068)):
        Eo, E, x, y, T, alpha, V = march(1.47, model=mdl)
        rows3.append((name, '1.47', '%.4f' % Eo, '%.4f' % eng_eo, '%.2f' % (100 * (Eo - eng_eo)),
                      '0.708', 'Yanagi & Sakata 1982 Table III run 628 (tabulated)'))
    print('\n(C) overall tray efficiency, independent march (CMO, Raoult)')
    for r in rows3:
        print('\t'.join(r))
    if out:
        with open(out + '/overall_efficiency_independent.tsv', 'w') as f:
            for r in rows3:
                f.write('\t'.join(r) + '\n')


if __name__ == '__main__':
    main()
