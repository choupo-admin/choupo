#!/usr/bin/env python3
"""Build baulch2005_HO.tsv: Baulch et al. 2005 (J. Phys. Chem. Ref. Data 34, 757)
H/O reactions, converted to the cm3-mol-s-cal/mol basis and compared with
O Conaire et al. 2004 (Int. J. Chem. Kinet. 36, 603), Table 1.

Run:  python3 baulch_oconaire_convert.py > baulch2005_HO.tsv
The PRINTED values are the authority and are typed below exactly as printed.
Baulch term:  k = A * T**n * exp(-C/T)   (C < 0 means exp(+|C|/T)), A in the
printed unit (molecule basis).  O Conaire term: A T^n exp(-Ea/(R T)), Ea in
kcal/mol, A in cm3 mol s.
"""
import math

NA = 6.02214076e23
R_CAL = 1.98720425864083      # cal mol-1 K-1
R_SI = 8.314462618


def kB(terms, order, T):
    """Baulch terms -> k in cm3,mol,s basis (multiply by NA**(order-1))."""
    return sum(A * T**n * math.exp(-C / T) for A, n, C in terms) * NA**(order - 1)


def kO(terms, T, eff=1.0):
    return eff * sum(A * T**n * math.exp(-Ea * 1000.0 / (R_CAL * T)) for A, n, Ea in terms)


def inrange(T, rng):
    lo, hi = rng
    return "yes" if lo <= T <= hi else "no(extrapolated)"


# Kc forms used only to turn an O Conaire reverse rate into the Baulch direction.
# (a, n, C) -> a T^n exp(-C/T); all printed by Baulch.
KC_OOH = (3.48e-3, 0.367, -8390)         # O+OH->O2+H, p.804 (dimensionless)
KC_OHH2 = (6.29e-2, 0.161, -7510)        # OH+H2->H2O+H, p.1029
KC_2OH = (3.36e-2, 0.139, -8200)         # OH+OH->H2O+O, p.1032
KC_H2O_DISS = (9.7e24, -0.010, 59700)    # H2O->H+OH, molecule cm-3, p.918


def kc(f, T):
    a, n, C = f
    return a * T**n * math.exp(-C / T)


def mk(rxn, txt, terms, ref):
    return dict(rxn=rxn, txt=txt, terms=terms, ref=ref)


OC1 = mk("1", "H + O2 = O + OH", [(1.91e14, 0.00, 16.44)], "[39] Pirraglia et al. 1989")
OC2 = mk("2", "O + H2 = H + OH", [(5.08e4, 2.67, 6.292)], "[40] Sutherland et al. 1986")
OC3 = mk("3", "OH + H2 = H + H2O", [(2.16e8, 1.51, 3.43)], "[41] Michael & Sutherland 1988")
OC4 = mk("4", "O + H2O = OH + OH", [(2.97e6, 2.02, 13.4)], "[42] Sutherland et al. 1990")
OC5 = mk("5", "H2 + M = H + H + M", [(4.57e19, -1.40, 105.1)], "[43] Tsang & Hampson 1986")
OC8 = mk("8", "H + OH + M = H2O + M", [(4.50e22, -2.00, 0.00)], "[43] Tsang & Hampson 1986, A x2.0")
OC9 = mk("9", "H + O2 + M = HO2 + M (k0)", [(3.48e16, -0.41, -1.12)], "[44] Mueller et al. 1998")
OC9i = mk("9", "H + O2 = HO2 (k_inf)", [(1.48e12, 0.60, 0.00)], "[45] Cobos, Hippler & Troe 1985")
OC10 = mk("10", "HO2 + H = H2 + O2", [(1.66e13, 0.00, 0.82)], "[6] Mueller et al. 1999")
OC11 = mk("11", "HO2 + H = OH + OH", [(7.08e13, 0.00, 0.30)], "[6] Mueller et al. 1999")
OC12 = mk("12", "HO2 + O = OH + O2", [(3.25e13, 0.00, 0.00)], "[46] Baulch et al. 1994 (CEC Suppl. I)")
OC13 = mk("13", "HO2 + OH = H2O + O2", [(2.89e13, 0.00, -0.50)], "[46] Baulch et al. 1994 (CEC Suppl. I)")
OC14 = mk("14", "HO2 + HO2 = H2O2 + O2 (sum of two)", [(4.2e14, 0.00, 11.98), (1.3e11, 0.00, -1.629)],
          "[47] Hippler, Troe & Willner 1990/93")
OC15 = mk("15", "H2O2 + M = OH + OH + M (k0)", [(1.27e17, 0.00, 45.5)], "[48] Warnatz 1985")
OC15i = mk("15", "H2O2 = OH + OH (k_inf)", [(2.95e14, 0.00, 48.4)], "[49] Brouwer et al. 1985")
OC16 = mk("16", "H2O2 + H = H2O + OH", [(2.41e13, 0.00, 3.97)], "[43] Tsang & Hampson 1986")
OC17 = mk("17", "H2O2 + H = H2 + HO2", [(6.03e13, 0.00, 7.95)], "[43] Tsang & Hampson 1986, x1.25")
OC18 = mk("18", "H2O2 + O = OH + HO2", [(9.55e6, 2.00, 3.97)], "[43] Tsang & Hampson 1986")
OC19 = mk("19", "H2O2 + OH = H2O + HO2 (sum of two)", [(1.0e12, 0.00, 0.00), (5.8e14, 0.00, 9.56)],
          "[50] Hippler & Troe 1992")


def row(id, rx, kind, order, terms, rng, form, units, unc, pages, oc=None, mode="direct",
        eff=1.0, effnote="", rel="", notes="", kc=None):
    return dict(id=id, rx=rx, kind=kind, order=order, terms=terms, rng=rng, form=form, units=units,
                unc=unc, pages=pages, oc=oc, mode=mode, eff=eff, effnote=effnote, rel=rel,
                notes=notes, kc=kc)


cm3 = "cm3 molecule-1 s-1"
cm6 = "cm6 molecule-2 s-1"
s1 = "s-1"
ROWS = [
    row("B01", "O + H2 -> OH + H", "bimolecular", 2, [(6.34e-12, 0, 4000), (1.46e-9, 0, 9650)], (298, 3300),
        "[6.34e-12 exp(-4000/T) + 1.46e-9 exp(-9650/T)]", cm3, "+-0.2 over 298-3300 K",
        "803-804 (preferred p.804); summary Table 4.1 p.777", OC2,
        rel="independent experimental fit (Baulch lists Sutherland et al. 1986 as a measurement)"),
    row("B02", "O + OH -> O2 + H", "bimolecular", 2, [(2.00e-10, -0.352, -113)], (250, 3000),
        "2.00e-10 T^-0.352 exp(113/T)", cm3, "+-0.2 over 250-3000 K",
        "804-806 (preferred p.806); Table 4.1 p.777", OC1, mode="reverse", kc=KC_OOH,
        rel="OC lists only H+O2=O+OH; reverse formed here as k_OC1 x Kc, Kc printed by Baulch p.804"),
    row("B03", "O + HO2 -> OH + O2", "bimolecular", 2, [(2.7e-11, 0, -224)], (220, 1000),
        "2.7e-11 exp(224/T)", cm3, "+-0.1 at 220 K, rising to +-0.5 at 1000 K", "809; Table 4.1 p.777", OC12,
        rel="OC took the earlier CEC 1994 evaluation (their ref [46])"),
    row("B04", "O + H2O2 -> OH + HO2 (1) / O2 + H2O (2); overall k", "bimolecular", 2, [(1.4e-12, 0, 2000)], (283, 500),
        "1.4e-12 exp(-2000/T)", cm3, "+-0.3 over 283-500 K", "812; Table 4.1 p.777", OC18,
        rel="OC rxn 18 is channel (1) only; Baulch value is the overall k (k1/k only 0.2-1)",
        notes="range 283-500 K: both 1000 and 2000 K are extrapolation"),
    row("B05", "H + O2 -> OH + O", "bimolecular", 2, [(3.43e-10, -0.097, 7560)], (800, 3500),
        "3.43e-10 T^-0.097 exp(-7560/T)", cm3, "+-0.1 at 800 K, rising to +-0.2 at 3500 K",
        "895-896 (preferred p.896); Table 4.1 p.780", OC1,
        rel="independent (OC took Pirraglia et al. 1989, which Baulch cites as a measurement)"),
    row("B06", "H + HO2 -> H2 + O2 (k1)", "bimolecular", 2, [(1.75e-10, 0, 1030)], (250, 1000),
        "1.75e-10 exp(-1030/T)", cm3, "+-0.3 over 250-1000 K", "919; Table 4.1 p.780", OC10,
        rel="OC took Mueller et al. 1999 (their ref [6])"),
    row("B07", "H + HO2 -> 2 OH (k2)", "bimolecular", 2, [(7.4e-10, 0, 700)], (250, 1000),
        "7.4e-10 exp(-700/T)", cm3, "+-0.15 over 250-1000 K", "919; Table 4.1 p.780", OC11,
        rel="OC took Mueller et al. 1999 (their ref [6])"),
    row("B08", "H + HO2 -> H2O + O (k3)", "bimolecular", 2, [(2.4e-12, 0, 0)], (298, 298),
        "2.4e-12 (at 298 K only)", cm3, "+-0.5 at 298 K", "919; Table 4.1 p.780", None,
        notes="single value at 298 K; no temperature dependence recommended; not in OC"),
    row("B09", "H + H2O -> OH + H2", "bimolecular", 2, [(7.5e-16, 1.6, 9030)], (800, 2500),
        "7.5e-16 T^1.6 exp(-9030/T)", cm3, "+-0.2 over 800-2500 K", "922; Table 4.1 p.780", OC3,
        mode="reverse_div", kc=KC_OHH2,
        rel="reverse of OC rxn 3; k_OC = k_OC3 / Kc(OH+H2->H2O+H) printed p.1029",
        notes="the Kc printed on this sheet (15.9 T^1.52 exp(-7510/T)) is inconsistent with its own dS and with p.1029 (should read T^-0.161); the p.1029 Kc is used"),
    row("B10", "H + H2O2 -> H2 + HO2 (k1)", "bimolecular", 2, [(2.8e-12, 0, 1890)], (280, 1000),
        "2.8e-12 exp(-1890/T)", cm3, "+-0.5 over 280-1000 K", "924; Table 4.1 p.780", OC17,
        rel="OC took Tsang & Hampson 1986 x1.25"),
    row("B11", "H + H2O2 -> OH + H2O (k2)", "bimolecular", 2, [(1.7e-11, 0, 1800)], (300, 1000),
        "1.7e-11 exp(-1800/T)", cm3, "+-0.3 over 300-1000 K", "924; Table 4.1 p.780", OC16,
        rel="OC took Tsang & Hampson 1986"),
    row("B12", "OH + H2 -> H2O + H", "bimolecular", 2, [(3.6e-16, 1.52, 1740)], (250, 2500),
        "3.6e-16 T^1.52 exp(-1740/T)", cm3, "+-0.1 at 250 K, rising to +-0.3 at 2500 K",
        "1029; Table 4.1 p.783", OC3, rel="independent (OC took Michael & Sutherland 1988)"),
    row("B13", "OH + OH -> H2O + O", "bimolecular", 2, [(5.56e-20, 2.42, -970)], (250, 2400),
        "5.56e-20 T^2.42 exp(970/T)", cm3, "+-0.15 over 250-2400 K", "1032; Table 4.1 p.783", OC4,
        mode="reverse", kc=KC_2OH, rel="reverse of OC rxn 4; k_OC = k_OC4 x Kc printed p.1032"),
    row("B14a", "OH + HO2 -> H2O + O2 (low-T expression)", "bimolecular", 2, [(4.8e-11, 0, -250)], (250, 400),
        "4.8e-11 exp(250/T)", cm3, "+-0.2 over 250-400 K", "1038 (sheet 1037-1038); Table 4.1 p.783", OC13,
        rel="OC took CEC 1994 (their ref [46])",
        notes="two separate ranges recommended (B14a, B14b); 1000 K lies between them"),
    row("B14b", "OH + HO2 -> H2O + O2 (high-T expression)", "bimolecular", 2, [(1.54e-8, 0, 8810)], (1300, 2000),
        "1.54e-8 exp(-8810/T)", cm3, "+-0.5 over 1300-2000 K", "1038; Table 4.1 p.783", OC13,
        rel="OC took CEC 1994 (their ref [46])",
        notes="as printed; rises steeply with T; 1000 K is outside this range"),
    row("B15", "OH + H2O2 -> H2O + HO2", "bimolecular", 2, [(2.72e-6, 0, 14800), (3.2e-12, 0, 215)], (240, 1700),
        "[2.72e-6 exp(-14800/T) + 3.2e-12 exp(-215/T)]", cm3,
        "+-0.2 over 240-800 K, rising to +-0.5 over 800-1700 K",
        "1041 (sheet 1040-1041); Table 4.1 p.783", OC19,
        rel="OC took Hippler & Troe 1992 (their ref [50])", notes="2000 K is extrapolation"),
    row("B16", "HO2 + HO2 -> H2O2 + O2 (k1, channel 1)", "bimolecular", 2, [(7.0e-10, 0, 6030), (2.2e-13, 0, -820)], (550, 1250),
        "[7.0e-10 exp(-6030/T) + 2.2e-13 exp(820/T)]", cm3,
        "+-0.15 over 550-800 K, rising to +-0.4 at 1250 K", "1109; Table 4.1 p.785", OC14,
        rel="same source: Hippler, Troe & Willner 1990 (OC [47]; Baulch adopts it)",
        notes="2000 K is extrapolation; the pressure-dependent channel (2) of the sheet has no preferred value"),
    row("B17a", "H + O2 (+M) -> HO2 (+M), k0, M=Ar", "falloff k0", 3, [(1.9e-29, -1.2, 0)], (298, 2000),
        "k0 = 1.9e-29 T^-1.2", cm6, "+-0.1 at 298 K, rising to +-0.2 at 2000 K",
        "898-900 (preferred p.900); Table 4.2 p.797", OC9, eff=0.67, effnote="Ar 0.67 (fn g)",
        rel="OC [44] Mueller et al. 1998; Baulch from Bates et al."),
    row("B17b", "H + O2 (+M) -> HO2 (+M), k0, M=N2", "falloff k0", 3, [(7.3e-29, -1.3, 0)], (298, 2000),
        "k0 = 7.3e-29 T^-1.3", cm6, "+-0.1 at 298 K, rising to +-0.2 at 2000 K", "900; Table 4.2 p.797",
        OC9, eff=1.0, effnote="N2 1.0 (default)"),
    row("B17c", "H + O2 (+M) -> HO2 (+M), k0, M=H2O", "falloff k0", 3, [(1.0e-28, -1.0, 0)], (298, 2000),
        "k0 = 1.0e-28 T^-1.0", cm6, "+-0.1 at 298 K, rising to +-0.3 at 2000 K", "900; Table 4.2 p.797",
        OC9, eff=14.0, effnote="H2O 14 (fn g)"),
    row("B17d", "H + O2 (+M) -> HO2 (+M), k_inf", "falloff kinf", 2, [(0.32e-11, 0.56, 0), (2.9e4 * 1e-11, -1.7, 0)], (298, 1500),
        "k_inf = [0.32 T^0.56 + 2.9e4 T^-1.7] x 1e-11", cm3, "+-0.5 over 298-1500 K", "900; Table 4.2 p.797",
        OC9i, rel="OC [45] Cobos, Hippler & Troe 1985", notes="2000 K is extrapolation"),
    row("B18a", "H + H (+M) -> H2 (+M), k0, M=H2", "falloff k0", 3, [(2.8e-31, -0.6, 0)], (200, 5000),
        "k0 = 2.8e-31 T^-0.6", cm6, "+-0.5 over 200-5000 K", "905; Table 4.2 p.797", OC5,
        mode="assoc_from_diss", eff=2.5, effnote="H2 2.5 (fn a)", kc=(1.64e-24, -0.151, -52190),
        rel="OC gives dissociation (rxn 5); association derived with Baulch's Kc (cm3 molecule-1) p.905"),
    row("B18b", "H + H (+M) -> H2 (+M), k0, M=Ar", "falloff k0", 3, [(1.8e-30, -1.0, 0)], (200, 2500),
        "k0 = 1.8e-30 T^-1.0", cm6, "+-0.5 over 200-2500 K", "905; Table 4.2 p.797", OC5,
        mode="assoc_from_diss", eff=1.0, effnote="Ar 1.0 (not listed)", kc=(1.64e-24, -0.151, -52190),
        rel="as B18a"),
    row("B19a", "H2 (+M) -> H + H (+M), k0, M=Ar", "falloff k0 (dissociation)", 2, [(3.7e-10, 0, 48350)], (2500, 8000),
        "k0 = 3.7e-10 exp(-48350/T)", cm3, "+-0.3 over 2500-8000 K", "909; Table 4.3 p.800", OC5,
        eff=1.0, effnote="Ar 1.0 (not listed)", rel="OC took Tsang & Hampson 1986",
        notes="range 2500-8000 K: 1000 and 2000 K extrapolated"),
    row("B19b", "H2 (+M) -> H + H (+M), k0, M=H2", "falloff k0 (dissociation)", 2, [(1.5e-9, 0, 48350)], (2500, 8000),
        "k0 = 1.5e-9 exp(-48350T)  [sic, slash missing in print; read as exp(-48350/T)]", cm3,
        "+-0.5 over 2500-8000 K", "909; Table 4.3 p.800", OC5, eff=2.5, effnote="H2 2.5 (fn a)", rel="as B19a",
        notes="printed anomaly: 'exp(-48350T)' on the sheet; interpreted as /T"),
    row("B20a", "H + OH (+M) -> H2O (+M), k0, M=Ar", "falloff k0", 3, [(2.3e-26, -2.0, 0)], (300, 3000),
        "k0 = 2.3e-26 T^-2.0", cm6, "+-0.3 over 300-3000 K", "913; Table 4.2 p.797", OC8, eff=0.38,
        effnote="Ar 0.38 (fn e)", rel="Baulch = CEC 1992/94; OC multiplies Tsang & Hampson's A by 2"),
    row("B20b", "H + OH (+M) -> H2O (+M), k0, M=N2", "falloff k0", 3, [(6.1e-26, -2.0, 0)], (300, 3000),
        "k0 = 6.1e-26 T^-2.0", cm6, "+-0.5 over 300-3000 K", "913; Table 4.2 p.797", OC8, eff=1.0,
        effnote="N2 1.0"),
    row("B20c", "H + OH (+M) -> H2O (+M), k0, M=H2O", "falloff k0", 3, [(3.9e-25, -2.0, 0)], (300, 3000),
        "k0 = 3.9e-25 T^-2.0", cm6, "+-0.5 over 300-3000 K", "913; Table 4.2 p.797", OC8, eff=12.0,
        effnote="H2O 12 (fn e)"),
    row("B21", "H2O (+M) -> H + OH (+M), k0, M=N2", "falloff k0 (dissociation)", 2, [(8e-9, 0, 52920)], (2000, 6000),
        "k0 = 8e-9 exp(-52920/T)", cm3, "+-0.5 over 2000-6000 K", "918; Table 4.3 p.800", OC8,
        mode="diss_from_assoc", eff=1.0, effnote="N2 1.0", kc=KC_H2O_DISS,
        rel="OC gives association (rxn 8); dissociation derived with the Kc printed on p.918",
        notes="the association Kc printed p.913 (1.03e25 ... exp(+59700/T)) is not the reciprocal of p.918's 9.7e24 (reciprocal would be 1.03e-25); p.918 used; 2000 K is the lower edge of range 2000-6000 K"),
    row("B22a", "H2O2 (+M) -> 2 OH (+M), k0, M=Ar", "falloff k0 (dissociation)", 2, [(3.8e-8, 0, 21960)], (1000, 1500),
        "k0 = 3.8e-8 exp(-21960/T)", cm3, "+-0.2 over 1000-1500 K", "1036-1037 (preferred p.1037); Table 4.3 p.800",
        OC15, eff=0.45, effnote="Ar 0.45 (fn i)", rel="OC [48] Warnatz 1985", notes="2000 K is extrapolation"),
    row("B22b", "H2O2 (+M) -> 2 OH (+M), k0, M=N2", "falloff k0 (dissociation)", 2, [(2.0e-7, 0, 22900)], (700, 1500),
        "k0 = 2.0e-7 exp(-22900/T)", cm3, "+-0.2 over 700-1500 K", "1037; Table 4.3 p.800", OC15, eff=1.0,
        effnote="N2 1.0", rel="OC [48] Warnatz 1985", notes="2000 K is extrapolation"),
    row("B22c", "H2O2 (+M) -> 2 OH (+M), k_inf", "falloff kinf (dissociation)", 1, [(3.0e14, 0, 24400)], (1000, 1500),
        "k_inf = 3.0e14 exp(-24400/T)", s1,
        "+-0.5 over 700-1500 K (Reliability) while Preferred Values states 1000-1500 K", "1037; Table 4.3 p.800",
        OC15i, rel="OC [49] Brouwer et al. 1985 (Baulch also builds on it)", notes="2000 K is extrapolation"),
    row("B23a", "OH + OH (+M) -> H2O2 (+M), k0, M=N2", "falloff k0", 3, [(6.6e-29, -0.8, 0)], (200, 400),
        "k0 = 6.6e-29 T^-0.8", cm6, "+-0.2 over 200-400 K", "1035-1036 (preferred p.1035-1036); Table 4.2 p.798",
        OC15, mode="assoc_from_diss", eff=1.0, effnote="N2 1.0", kc=(3.91e-30, 1.066, -25660),
        rel="OC has only H2O2 dissociation; association derived with Kc printed p.1035",
        notes="range 200-400 K: 1000 and 2000 K are far extrapolations (a consistency check, not a test)"),
    row("B23b", "OH + OH (+M) -> H2O2 (+M), k0, M=H2O", "falloff k0", 3, [(4.0e-30, 0, 0)], (200, 400),
        "k0 = 4.0e-30", cm6, "+-0.2 over 200-400 K", "1036; Table 4.2 p.798", None,
        notes="no OC comparison made"),
    row("B23c", "OH + OH (+M) -> H2O2 (+M), k_inf", "falloff kinf", 2, [(2.6e-11, 0, 0)], (200, 400),
        "k_inf = 2.6e-11", cm3, "+-0.2 over 200-400 K", "1036; Table 4.2 p.798", None,
        notes="Fc = 0.5 for N2, H2O (+-0.1); no OC comparison made"),
]

FC_ROWS = [
    ("F01", "H + O2 (+M) -> HO2 (+M), Fc",
     "Fc(Ar)=0.51, Fc(N2)=0.57, Fc(H2O)=0.81 over 298-1500 K (T-independent as printed)",
     "+-0.1 each", "900; Table 4.2 p.797", "9", "Troe a=0.5, T***=1e-30, T*=1e30, T**=1e100 => Fc = 0.5", "OC [44]"),
    ("F02", "OH + OH (+M) -> H2O2 (+M), Fc", "Fc = 0.5 for N2, H2O over 200-400 K", "+-0.1",
     "1036; Table 4.2 p.798", "(none)", "-", "-"),
    ("F03", "H2O2 (+M) -> 2 OH (+M), Fc", "Fc(Ar) = 0.5 over 1000-1500 K", "+-0.1 over 700-1500 K",
     "1037; Table 4.3 p.800", "15", "Troe a=0.5, T***=1e-30, T*=1e30 => Fc = 0.5", "OC"),
]


def fmt(x):
    return "" if x is None else f"{x:.4e}"


def oc_k(r, T):
    oc = r["oc"]
    if oc is None:
        return None
    base = kO(oc["terms"], T, r["eff"])
    m = r["mode"]
    if m == "direct":
        return base
    if m == "reverse":
        return base * kc(r["kc"], T)
    if m == "reverse_div":
        return base / kc(r["kc"], T)
    if m == "assoc_from_diss":          # Kc in cm3 molecule-1 -> cm3 mol-1
        return base * kc(r["kc"], T) * NA
    if m == "diss_from_assoc":          # Kc in molecule cm-3 -> mol cm-3
        return base * kc(r["kc"], T) / NA
    raise ValueError(m)


def troe(k0, kinf, M, Fc):
    """Lindemann-Hinshelwood x broadening, Baulch Sec. 2.4: N = 0.75 - 1.27 log Fc."""
    pr = k0 * M / kinf
    N = 0.75 - 1.27 * math.log10(Fc)
    logF = math.log10(Fc) / (1 + (math.log10(pr) / N) ** 2)
    return k0 * M / (1 + pr) * 10**logF


def fall(T, kind):
    M = 101325.0 / (R_SI * T) * 1e-6      # mol cm-3 at 1 atm
    if kind == "HO2":
        b = troe(kB([(7.3e-29, -1.3, 0)], 3, T), kB([(0.32e-11, 0.56, 0), (2.9e-7, -1.7, 0)], 2, T), M, 0.57)
        o = troe(kO([(3.48e16, -0.41, -1.12)], T), kO([(1.48e12, 0.60, 0.0)], T), M, 0.5)
    else:
        b = troe(kB([(3.8e-8, 0, 21960)], 2, T), kB([(3.0e14, 0, 24400)], 1, T), M, 0.5)
        o = troe(kO([(1.27e17, 0, 45.5)], T, 0.45), kO([(2.95e14, 0, 48.4)], T), M, 0.5)
    return b, o


def main():
    cols = ["id", "reaction_as_in_Baulch", "kind", "baulch_expression_printed", "units_printed", "T_range_K",
            "uncertainty_printed", "baulch_pages", "terms_printed(A;n;C per term, k=A T^n exp(-C/T))",
            "conv_A_cm3_mol_s", "conv_n", "conv_Ea_cal_mol", "OC_rxn", "OC_as_written", "OC_A_cm3_mol_s", "OC_n",
            "OC_Ea_kcal_mol", "OC_source", "OC_M_efficiency", "OC_relation", "OC_comparison_mode",
            "kBaulch_1000K", "kBaulch_2000K", "kOC_1000K", "kOC_2000K", "ratio_B_over_OC_1000K",
            "ratio_B_over_OC_2000K", "Baulch_in_range_1000K", "Baulch_in_range_2000K", "notes"]
    print("# Source: Baulch et al., J. Phys. Chem. Ref. Data 34 (2005) 757-1397, doi 10.1063/1.1748524 "
          "(data sheets, 'Preferred Values'; page numbers are the journal pages); comparison: O Conaire et al., "
          "Int. J. Chem. Kinet. 36 (2004) 603, doi 10.1002/kin.20036, Table 1 (LLNL manuscript copy).")
    print("# Printed units: bimolecular cm3 molecule-1 s-1; termolecular cm6 molecule-2 s-1; unimolecular s-1; "
          "k = A T^n exp(-C/T) with C in K. Converted columns: cm3 mol s basis, A T^n exp(-Ea/RT), Ea in cal/mol, "
          "R=1.98720 cal/mol/K (k in cm3 mol-1 s-1, cm6 mol-2 s-1 or s-1). k at 1000 and 2000 K are in the converted "
          "basis; 'no(extrapolated)' marks T outside the recommended range. Printed values are the authority.")
    print("\t".join(cols))
    for r in ROWS:
        terms = r["terms"]
        o = r["order"]
        fac = NA**(o - 1)
        t_pr = " | ".join(f"{A:g};{n:g};{C:g}" for A, n, C in terms)
        cA = " | ".join(f"{A*fac:.4e}" for A, n, C in terms)
        cn = " | ".join(f"{n:g}" for A, n, C in terms)
        cE = " | ".join(f"{C*R_CAL:.1f}" for A, n, C in terms)
        rng = r["rng"]
        rs = f"{rng[0]}-{rng[1]}" if rng[0] != rng[1] else f"{rng[0]} (single T)"
        oc = r["oc"]
        if r["id"] == "B08":
            kb = [None, None]
        else:
            kb = [kB(terms, o, T) for T in (1000.0, 2000.0)]
        ko = [oc_k(r, T) for T in (1000.0, 2000.0)]
        rat = [(kb[i] / ko[i]) if (kb[i] is not None and ko[i]) else None for i in range(2)]
        ir = [inrange(T, rng) for T in (1000.0, 2000.0)]
        out = [r["id"], r["rx"], r["kind"], r["form"], r["units"], rs, r["unc"], r["pages"], t_pr, cA, cn, cE,
               oc["rxn"] if oc else "", oc["txt"] if oc else "none",
               " | ".join(f"{A:.4e}" for A, n, E in oc["terms"]) if oc else "",
               " | ".join(f"{n:g}" for A, n, E in oc["terms"]) if oc else "",
               " | ".join(f"{E:g}" for A, n, E in oc["terms"]) if oc else "",
               oc["ref"] if oc else "", r["effnote"], r["rel"], r["mode"] if oc else "",
               fmt(kb[0]), fmt(kb[1]), fmt(ko[0]), fmt(ko[1]),
               "" if rat[0] is None else f"{rat[0]:.3f}", "" if rat[1] is None else f"{rat[1]:.3f}",
               ir[0], ir[1], r["notes"]]
        print("\t".join(out))
    for fid, name, kind, pages in (
            ("G01", "H + O2 (+M) -> HO2 (+M) at 1 atm, M=N2 (k0 N2, kinf, Fc(N2)=0.57 vs OC Fc=0.5); cm3 mol-1 s-1",
             "HO2", "900; OC rxn 9"),
            ("G02", "H2O2 (+M) -> 2 OH (+M) at 1 atm, M=Ar (s-1), Fc=0.5 both", "H2O2", "1037; OC rxn 15")):
        v = [fall(T, kind) for T in (1000.0, 2000.0)]
        rng = "298-1500 (kinf), 298-2000 (k0)" if kind == "HO2" else "1000-1500"
        i1 = "yes" if kind == "HO2" else "yes (edge)"
        i2 = "no(extrapolated)"
        print("\t".join([fid, name, "falloff full k (derived by this script, not printed)",
                         "Lindemann-Hinshelwood x Troe broadening per Baulch Sec. 2.4", "", rng, "", pages,
                         "", "", "", "", "", "", "", "", "", "", "", "", "derived",
                         fmt(v[0][0]), fmt(v[1][0]), fmt(v[0][1]), fmt(v[1][1]),
                         f"{v[0][0]/v[0][1]:.3f}", f"{v[1][0]/v[1][1]:.3f}", i1, i2,
                         "derived value, not a Baulch value"]))
    for f in FC_ROWS:
        print("\t".join([f[0], f[1], "Fc", f[2], "", "", f[3], f[4], "", "", "", "", f[5], f[6], "", "", "", f[7],
                         "", "", "text only"] + [""] * 9))


if __name__ == "__main__":
    main()
