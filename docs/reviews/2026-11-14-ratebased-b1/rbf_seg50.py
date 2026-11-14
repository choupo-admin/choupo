#!/usr/bin/env python3
"""Independent Rocha-Bravo-Fair reconstruction of H_G, H_L and the analogy's h_G, h_L at
segment 50 of ratebased01 (golden point F 1.6), from the published state and properties
evaluated by choupoProps at that state (props01/out.txt).  Formulas transcribed from
PackingRBF.cpp:75-139 and RateBasedSegment.cpp:441-453; Wilke-Chang from
WilkeChang.cpp:57.  Args: none (numbers pasted from runs)."""
import math
# state, ratebased01 sweep point, segment index 50
TV, TL, P = 344.97713836, 344.566159463, 10155.3206529
V = L = 0.01089725109          # kmol/s
y = x = 0.581422543132
MW = 106.165
lam = 0.955824357906           # m V/L
# properties from choupoProps (props01)
muG, DG, kG_th = 7.11257424669e-06, 3.63922427741e-05, 0.0106667046769
rhoL, sigma, kL_th = 824.099208207, 0.0240171916466, 0.124573949664
muL = 3.91e-4
R = 8.314462618
rhoG = P * MW / (R * TV) / 1000.0   # kg/m3 (MW kg/kmol)
D = 1.22; AT = math.pi / 4 * D * D
ap, eps, th, S, CE, dPfl = 478.0, 0.92, math.radians(60), 0.009, 0.9, 1025.0
UGs = V * MW / (rhoG * AT); ULs = L * MW / (rhoL * AT)
# Wilke-Chang, V_A = Vliq as stored (1.2120e-4 o-x; p-x read below)
def wc(T, Va_m3, Mb=106.165, phi=1.0, eta=muL):
    return 7.4e-8 * math.sqrt(phi * Mb) * T / (eta * 1e3 * (Va_m3 * 1e6) ** 0.6) * 1e-4
import re, pathlib, sys
repo = pathlib.Path(sys.argv[1])
cd = repo / "tutorials/steady/distillation/ratebased01_schulz_0p10bar/constant/components"
Vp = float(re.search(r"^Vliq\s+([\d.eE+-]+)", (cd / "pXylene.dat").read_text(), re.M).group(1))
Vo = float(re.search(r"^Vliq\s+([\d.eE+-]+)", (cd / "oXylene.dat").read_text(), re.M).group(1))
D01 = wc(TL, Vp)   # solute 0 (pX) in solvent oX
D10 = wc(TL, Vo)
DL = x * D10 + (1 - x) * D01
g = 9.80665; sth = math.sin(th); cosG = 0.9
ReL = ULs * S * rhoL / muL; WeL = ULs**2 * rhoL * S / sigma; FrL = ULs**2 / (S * g)
Ft = 29.12 * (WeL * FrL) ** 0.15 * S ** 0.359 / (ReL ** 0.2 * eps ** 0.6 * (1 - 0.93 * cosG) * sth ** 0.3)
A = 0.177 * rhoG / (S * eps**2 * sth**2); B = 88.774 * muG / (S * S * eps * sth)
dPdry = A * UGs**2 + B * UGs; K2 = 0.614 + 71.35 * S
dP = dPdry
for _ in range(2000):
    geff = g * ((rhoL - rhoG) / rhoL) * (1 - dP / dPfl)
    hL = (4 * Ft / S) ** (2 / 3) * (3 * muL * ULs / (rhoL * sth * eps * geff)) ** (1 / 3)
    dPn = dPdry / (1 - K2 * hL) ** 5
    nxt = 0.5 * dP + 0.5 * dPn
    if abs(nxt - dP) <= 1e-14 * dPn: dP = dPn; break
    dP = nxt
Uge = UGs / (eps * (1 - hL) * sth); ULe = ULs / (eps * hL * sth)
kG = 0.054 * (DG / S) * ((Uge + ULe) * rhoG * S / muG) ** 0.8 * (muG / (DG * rhoG)) ** 0.33
kL = 2 * math.sqrt(DL * CE * ULe / (math.pi * S))
ae = (1 - 1.203 * FrL ** 0.111) * ap
HG = UGs / (kG * ae); HL = ULs / (kL * ae)
HOG = HG + lam * HL
print(f"rhoG {rhoG:.6g} UGs {UGs:.6g} ULs {ULs:.6g} DL {DL:.6g} (D01 {D01:.4g}, D10 {D10:.4g}) hL {hL:.6g} dP {dP:.6g} Pa/m ae/ap {ae/ap:.6g}")
pub = dict(HG=0.128835992774, HL=0.0292381982253, HOG=0.156782574819)
for k, v in dict(HG=HG, HL=HL, HOG=HOG).items():
    print(f"{k}: engine {pub[k]:.10g} mine {v:.10g} rel {(v-pub[k])/pub[k]:.2e}")
print(f"share {lam*HL/HOG:.8g}")
# the analogy (RateBasedSegment.cpp:441-453): cp from Cp_ig for the vapour (ideal gas);
cpV = 148.814273991   # J/(mol K), choupoProps Cp_ig at T_V, composition y (ideal-gas enthalpy slope)
cG = rhoG / MW * 1000  # mol/m3
rcpG = cG * cpV
aG = kG_th / rcpG
hG = kG * rcpG * (aG / DG) ** (2 / 3)
print(f"vapour: alpha_G {aG:.4g} m2/s, D_G {DG:.4g}, Le^-1=alpha/D {aG/DG:.4g}, h_G {hG:.5g} W/m2K, k_G {kG:.4g} m/s")
# liquid cp: polynomial of the records (liquidHeatCapacity), mole-averaged
def cpl(rec, T):
    t = (cd / rec).read_text()
    m = re.search(r"liquidHeatCapacity\s*\{[^}]*coefficients\s*\(\s*([^)]*)\)", t, re.S)
    a = list(map(float, m.group(1).split()))
    return sum(ai * T**i for i, ai in enumerate(a))
cpL = x * cpl("pXylene.dat", TL) + (1 - x) * cpl("oXylene.dat", TL)
rcpL = rhoL / MW * 1000 * cpL
aL = kL_th / rcpL
hLc = kL * rcpL * math.sqrt(aL / DL)
print(f"liquid: cpL {cpL:.5g} J/molK, alpha_L {aL:.4g}, D_L {DL:.4g}, alpha/D {aL/DL:.4g}, h_L {hLc:.5g} W/m2K, k_L {kL:.4g} m/s")
print(f"ratio of film heat conductances h_L/h_G = {hLc/hG:.4g}")
