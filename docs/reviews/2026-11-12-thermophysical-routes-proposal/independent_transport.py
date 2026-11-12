#!/usr/bin/env python3
"""Independent values for the transport reproductions of the C378 review.

Run:  python3 -I independent_transport.py      (prints a TSV; writes nothing)

  * Brock-Bird surface tension (Poling, Prausnitz & O'Connell 5ed Eq. 12-3.5,
    Q from Eq. 12-3.6), written here from the textbook form, fed the
    critical constants and Tb the component RECORDS carry.
  * Water surface tension, IAPWS R1-76 (2014):
    sigma = 235.8 (1-Tr)^1.256 (1 - 0.625 (1-Tr)) mN/m, Tc = 647.096 K.
  * CO2 in water, Versteeg & van Swaaij, J. Chem. Eng. Data 33 (1988) 29:
    D = 2.35e-6 exp(-2119/T) m2/s.
  * Wilke-Chang (Poling 5ed Eq. 11-9.1) with the engine's inputs (the
    record's 25 C-labelled Vliq of CO2, 47.0 cm3/mol, stated at 273 K in its
    comment) and with V_A = 34.0 cm3/mol, the molar volume at Tb commonly
    tabulated for CO2 (value recalled, NOT read back in this session).
Constants recalled from the cited sources, not re-read in this session.
"""
import math

def brock_bird(T, Tc, Pc_bar, Tb):
    Tbr = Tb / Tc
    Q = 0.1196 * (1 + Tbr * math.log(Pc_bar / 1.01325) / (1 - Tbr)) - 0.279
    return Pc_bar ** (2/3) * Tc ** (1/3) * Q * (1 - T / Tc) ** (11/9)   # mN/m

def iapws_sigma(T):
    t = 1 - T / 647.096
    return 235.8 * t ** 1.256 * (1 - 0.625 * t)

print("quantity\tT_K\tvalue\tunit\tmethod")
T = 298.15
for name, Tc, Pc, Tb in (("water", 647.096, 220.64, 373.124),
                         ("ethyleneGlycol", 719.0, 82.0, 470.45),
                         ("triethanolamine", 787.0, 35.9, 613.0),
                         ("monoethanolamine", 671.4, 80.3, 444.15),
                         ("nHexane", 507.6, 30.25, 341.88)):
    print(f"{name} Brock-Bird\t{T}\t{brock_bird(T, Tc, Pc, Tb):.2f}\tmN/m\tPoling Eq 12-3.5, own code, record constants")
print(f"water IAPWS R1-76\t{T}\t{iapws_sigma(T):.2f}\tmN/m\tIAPWS R1-76, own code")
D_vs = 2.35e-6 * math.exp(-2119 / T)
print(f"CO2 in water, measured correlation\t{T}\t{D_vs:.4e}\tm2/s\tVersteeg-van Swaaij 1988")
def wilke_chang(T, phi, Mb, eta_cP, Va_cm3):
    return 7.4e-8 * math.sqrt(phi * Mb) * T / (eta_cP * Va_cm3 ** 0.6) * 1e-4
eta = 0.8900   # cP, water 25 C (IAPWS R12-08: 0.8900 mPa s)
for Va, lab in ((47.0, "Va = record Vliq (47.0, 273 K liquid)"), (34.0, "Va = 34.0 at Tb (recalled)")):
    print(f"CO2 in water, Wilke-Chang {lab}\t{T}\t{wilke_chang(T, 2.6, 18.015, eta, Va):.4e}\tm2/s\tPoling Eq 11-9.1, own code")
