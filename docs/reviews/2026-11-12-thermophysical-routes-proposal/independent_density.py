#!/usr/bin/env python3
"""Independent reference values for the density reproductions of the C378
review (thermophysical-property-routes, revision 2 + amendments).

Run:  python3 -I independent_density.py
Writes nothing; prints a TSV on stdout.

Implemented here from the PUBLISHED auxiliary equations (written by the
reviewer, not read from the engine):
  water  -- Wagner & Pruss, J. Phys. Chem. Ref. Data 31 (2002) 387, Eq. (2.6),
            saturated-liquid density (auxiliary to IAPWS-95).
  CO2    -- Span & Wagner, J. Phys. Chem. Ref. Data 25 (1996) 1509, Eq. (3.14).
  N2     -- Span, Lemmon, Jacobsen, Wagner, Yokozeki, J. Phys. Chem. Ref.
            Data 29 (2000) 1361, saturated-liquid ancillary.
  CH4    -- Setzmann & Wagner, J. Phys. Chem. Ref. Data 20 (1991) 1061,
            Eq. (3.6) (saturated-liquid ancillary).
Coefficients are typed from the reviewer's knowledge of those papers and were
NOT read back against the articles in this session: agreement with the
engine's own reference-equation op to <0.2 % is what corroborates them.

Also: the Rackett correlation (same form as src/thermo/DerivedClosures.H:65)
anchored at the temperature the component RECORD'S OWN COMMENT names for its
`Vliq`, versus the engine's anchoring at 298.15 K -- for ethane and HCl, whose
records state no temperature but whose values are cryogenic-range volumes.
"""
import math

def water_sat_liq(T):
    Tc, rc = 647.096, 322.0
    t = 1 - T / Tc
    b = [1.99274064, 1.09965342, -0.510839303, -1.75493479, -45.5170352, -6.74694450e5]
    e = [1/3, 2/3, 5/3, 16/3, 43/3, 110/3]
    return rc * (1 + sum(bi * t**ei for bi, ei in zip(b, e)))

def co2_sat_liq(T):
    Tc, rc = 304.1282, 467.6
    t = 1 - T / Tc
    a = [1.9245108, -0.62385555, -0.32731127, 0.39245142]
    e = [0.34, 0.5, 10/6, 11/6]
    return rc * math.exp(sum(ai * t**ei for ai, ei in zip(a, e)))

def n2_sat_liq(T):
    Tc, rc = 126.192, 11.1839 * 28.01348
    t = 1 - T / Tc
    N = [1.48654237, -0.280476066, 0.0894143085, -0.119879866]
    e = [0.3294, 2/3, 8/3, 35/6]
    return rc * math.exp(sum(n * t**k for n, k in zip(N, e)))

def ch4_sat_liq(T):
    Tc, rc = 190.564, 162.66
    t = 1 - T / Tc
    return rc * math.exp(1.9906389 * t**0.354 - 0.78756197 * t**0.5 + 0.036976723 * t**2.5)

def rackett(T, Tc, Pc_bar, w):
    R = 8.314462618
    Zra = 0.29056 - 0.08775 * w
    return (R * Tc / (Pc_bar * 1e5)) * Zra ** (1 + (1 - T / Tc) ** (2 / 7))

print("quantity\tT_K\tvalue_kg_m3\tmethod")
for T in (273.16, 277.16, 373.16, 573.16):
    print(f"water sat liquid\t{T}\t{water_sat_liq(T):.2f}\tWagner-Pruss 2002 Eq 2.6 (own code)")
for T in (280.0, 298.15):
    print(f"CO2 sat liquid\t{T}\t{co2_sat_liq(T):.2f}\tSpan-Wagner 1996 Eq 3.14 (own code)")
print(f"N2 sat liquid\t90\t{n2_sat_liq(90.0):.2f}\tSpan 2000 ancillary (own code)")
print(f"CH4 sat liquid\t120\t{ch4_sat_liq(120.0):.2f}\tSetzmann-Wagner 1991 ancillary (own code)")
# CO2: the record's Vliq (47.0 cm3/mol) is stated at 273 K; anchored there:
MW = 44.010
V273 = 4.70e-5
for T in (280.0, 298.15):
    V = V273 * rackett(T, 304.13, 73.83, 0.225) / rackett(273.0, 304.13, 73.83, 0.225)
    print(f"CO2 Rackett anchored at 273 K (record's stated T)\t{T}\t{MW/1000/V:.1f}\tRackett, own code")
# ethane / HCl: Vliq has no stated T; anchored at Tb vs at 298.15
for name, MWc, Vl, Tc, Pc, w, Tb in (("ethane", 30.070, 5.51e-5, 305.32, 48.72, 0.099, 184.55),
                                      ("HCl", 36.461, 3.05e-5, 324.55, 83.10, 0.133, 188.00)):
    for T in (250.0, 298.0):
        Vtb = Vl * rackett(T, Tc, Pc, w) / rackett(Tb, Tc, Pc, w)
        Vbare = rackett(T, Tc, Pc, w)
        print(f"{name} Rackett anchored at Tb\t{T}\t{MWc/1000/Vtb:.1f}\tRackett, own code")
        print(f"{name} bare Rackett (no Vliq)\t{T}\t{MWc/1000/Vbare:.1f}\tRackett, own code")
    print(f"{name} Vliq read as volume at Tb\t{Tb}\t{MWc/1000/Vl:.1f}\tMW/Vliq")
