#!/usr/bin/env python3
# -----------------------------------------------------------------------------
#  fit_lphi_pitzer.py -- Silvester-Pitzer dbeta/dT refit against Parker Phi_L
#
#  Curation-time resolver (the architecture puts fitting in curation tools,
#  never the runtime).  Replicates the C++ kernel BIT-FOR-BIT (PitzerSingleSalt
#  with the linear T-slots + SolventProperties A_phi(T)) and fits the three
#  Silvester-Pitzer (1977) temperature derivatives (dbeta0_dT, dbeta1_dT,
#  dCphi_dT) of a 1:1 salt to the measured relative apparent molal enthalpy
#  Phi_L(m, 25 C) -- Parker NSRDS-NBS 2 (1965), curated at
#  tutorials/props/electrolyte/enthalpy_naoh_water/constant/experiments/.
#
#  Identity (same as the C++ apparentMolarEnthalpy, slice 1):
#      g_ex(m,T) = nu [ (1 - phi(m,T)) + ln gamma_pm(m,T) ]
#      L_phi     = -R T^2 d g_ex/dT      (central FD, dT = 0.05 K)
#  L_phi is LINEAR in the dX/dT parameters -> exact linear least squares.
#
#  GATE (forum, docs/electrolyte-enthalpy-spec.md sec.6): rel-AAD < 5 % over
#  m = 0.1..6 mol/kg, skipping the near-zero band |Phi_L| < 50 cal/mol (the
#  curve crosses zero twice; a ratio there is noise -- the AadCompare
#  nNearZeroSkipped convention).  Prints the fitted values + provenance line
#  to paste into pairs.dat; exit 1 if the gate fails (flag stays FALSE).
# -----------------------------------------------------------------------------
import math, re, sys
from pathlib import Path
import numpy as np

R = 8.314462618
CAL = 4.184

# ---- SolventProperties.H replica -------------------------------------------
def eps_mm(t):  return 87.740 - 0.40008*t + 9.398e-4*t*t - 1.410e-6*t*t*t
def rho_kell(t):
    num = (999.83952 + 16.945176*t - 7.9870401e-3*t*t - 46.170461e-6*t**3
           + 105.56302e-9*t**4 - 280.54253e-12*t**5)
    return num / (1.0 + 16.879850e-3*t)
def eps_w(T):   return 78.45 * eps_mm(T-273.15) / eps_mm(25.0)
def dh_factor(T):
    # bit-for-bit replica of SolventProperties::debyeHuckelFactor (curated
    # 2026-07-02 against Silvester & Pitzer 1977 Table II, quintic, 0-300 C)
    Tc = 273.15 if T < 273.15 else (573.15 if T > 573.15 else T)
    x = Tc - 298.15
    return 1.0 + x*(1.67320874e-03 + x*(7.92300440e-06
              + x*(3.05989121e-08 + x*(-2.51844044e-10 + x*7.57942218e-13))))

# ---- PitzerSingleSalt replica (1:1, with T-slots) ----------------------------
class Salt:
    def __init__(s, beta0, beta1, Cphi, p=(0.0,0.0,0.0)):
        s.beta0, s.beta1, s.Cphi = beta0, beta1, Cphi
        s.db0, s.db1, s.dC = p
        s.alpha1, s.b, s.A25 = 2.0, 1.2, 0.3915
    def aPhi(s,T): return s.A25 * dh_factor(T)
    def b0(s,T): return s.beta0 + s.db0*(T-298.15)
    def b1(s,T): return s.beta1 + s.db1*(T-298.15)
    def C (s,T): return s.Cphi  + s.dC *(T-298.15)
    def lnGamma(s,m,T):
        I=m; sI=math.sqrt(I); nu=2.0
        fg = -s.aPhi(T)*(sI/(1+s.b*sI) + (2/s.b)*math.log(1+s.b*sI))
        aI=s.alpha1**2*I; asI=s.alpha1*sI
        h = (2*s.b1(T)/aI)*(1-(1+asI-0.5*aI)*math.exp(-asI)) if s.b1(T)!=0 else 0.0
        Bg = 2*s.b0(T)+h; Cg=1.5*s.C(T)
        return fg + m*Bg + m*m*Cg
    def phi(s,m,T):
        I=m; sI=math.sqrt(I)
        fphi=-s.aPhi(T)*sI/(1+s.b*sI)
        Bphi=s.b0(T)+s.b1(T)*math.exp(-s.alpha1*sI)
        return 1.0 + fphi + m*Bphi + m*m*s.C(T)
    def Lphi(s,m,T=298.15,dT=0.05):
        g=lambda TT: 2.0*((1.0-s.phi(m,TT))+s.lnGamma(m,TT))
        return -R*T*T*(g(T+dT)-g(T-dT))/(2*dT)     # J/mol

# ---- Parker dataset ----------------------------------------------------------
def load(species):
    repo=Path(__file__).resolve().parents[2]
    txt=(repo/"tutorials/props/electrolyte/enthalpy_naoh_water/constant/experiments/phiL_25C_parker1965.dat").read_text()
    m=re.search(r"^%s\s*.*?\((.*?)\);"%species, txt, re.S|re.M)
    pts=re.findall(r"\{ m ([\d.]+);\s*phiL (-?\d+); \}", m.group(1))
    return [(float(a), float(b)) for a,b in pts]

def fit(name, beta0, beta1, Cphi, lo=0.1, hi=6.0):
    data=[(m,v*CAL) for m,v in load(name.lower()) if lo<=m<=hi]
    ms=[m for m,_ in data]; y=np.array([v for _,v in data])
    base=Salt(beta0,beta1,Cphi)
    y0=np.array([base.Lphi(m) for m in ms])             # param-free DH tail
    cols=[]
    for k in range(3):
        p=[0.0,0.0,0.0]; p[k]=1e-4
        yk=np.array([Salt(beta0,beta1,Cphi,tuple(p)).Lphi(m) for m in ms])
        cols.append((yk-y0)/1e-4)                       # exact (linear) sensitivity
    A=np.column_stack(cols)
    p,*_=np.linalg.lstsq(A, y-y0, rcond=None)
    fitted=Salt(beta0,beta1,Cphi,tuple(p))
    pred=np.array([fitted.Lphi(m) for m in ms])
    big=[i for i,(m,v) in enumerate(data) if abs(v)>=50*CAL]
    rel=float(np.mean([abs(pred[i]-y[i])/abs(y[i]) for i in big]))*100
    aad=float(np.mean(np.abs(pred-y)))/CAL
    print(f"\n== {name}: Silvester-Pitzer dX/dT fit vs Parker (m = {lo}..{hi}, {len(data)} pts) ==")
    print(f"  dbeta0_dT {p[0]:+.6e}   dbeta1_dT {p[1]:+.6e}   dCphi_dT {p[2]:+.6e}   [1/K]")
    print(f"  rel-AAD = {rel:.2f} %  (|PhiL|>=50 cal/mol, {len(big)}/{len(data)} pts)   abs-AAD = {aad:.1f} cal/mol")
    for m in (0.1,0.5,1.0,2.0,3.0,4.0,5.0,6.0):
        meas=dict(load(name.lower())).get(m)
        if meas is not None:
            print(f"    m={m:4.1f}   fit {fitted.Lphi(m)/CAL:+8.1f}   meas {meas:+8.1f}  cal/mol")
    if name.lower() == "naoh":
        print(f"  beyond the window: m=10 -> fit {fitted.Lphi(10.0)/CAL:+.0f} vs meas +903;"
              f"  m=22 -> fit {fitted.Lphi(22.2024)/CAL:+.0f} vs meas +4260  (EXTRAPOLATION -- flag loud)")
    return rel, p

# ---- CLI: fit any 1-1 salt whose Parker series is curated --------------------
#   bin/curate/fit_lphi_pitzer.py NaOH            (default)
#   bin/curate/fit_lphi_pitzer.py NaCl Na Cl      (series, cation, anion)
# The 25 C anchors (beta0/beta1/Cphi) are read from the FROZEN pair .dat --
# the fit only adds the T-slots, it never touches the 25 C surface.
if len(sys.argv) >= 4:
    series, cat, an = sys.argv[1], sys.argv[2], sys.argv[3]
    pair = Path(__file__).resolve().parents[2] / (
        "data/standards/parameters/Pitzer/pairs/%s-%s.dat" % (cat, an))
    txt = pair.read_text()
    def anchor(k):
        return float(re.search(r"\b%s\s+(-?[\d.eE+-]+);" % k, txt).group(1))
    rel, p_ = fit(series, anchor("beta0"), anchor("beta1"), anchor("Cphi"))
    print("\n  paste into %s:" % pair.name)
    print("    dbeta0_dT %.6e;\n    dbeta1_dT %.6e;\n    dCphi_dT %.6e;" % tuple(p_))
    print("    lphiValidityMax 6.0;\n    calorimetricFit true;")
else:
    rel, _ = fit("NaOH", 0.0864, 0.253, 0.0044)     # Appelo 2014 25 C anchors
sys.exit(0 if rel < 5.0 else 1)
