#!/usr/bin/env python3
"""Item 6: recompute the plan's hand numbers from the 18 coefficients of its
section 4 (typed here from the plan, NOT imported from the batch scripts).

usage (repository root): python3 -I docs/reviews/2026-11-13-density-pilot-plan/item6_hand_numbers.py
"""
C = [
    [5007.2279636, -25131.164248, 74107.692582, -104657.48684, 69821.773186, -18145.911810],
    [-64.786269079, 525.34360564, -1608.4471903, 2350.9753235, -1660.9035108, 457.64374355],
    [0.24436776978, -1.9737722344, 6.04601497138, -8.9090614947, 6.37146769397, -1.7816083111],
]

def law(T, w_naoh):
    x = 1.0 - w_naoh                 # w[water]
    t = T - 273.15
    return sum(t ** j * sum(C[j][k] * x ** (k / 2) for k in range(6)) for j in range(3))

def row(name, plan, got):
    print(f"{name}\tplan={plan}\tcomputed={got:.6f}\tdiff={got-plan:+.6f}")

row("rho pure water 20C", 997.608, law(293.15, 0.0))
row("rho 50 wt% 20C", 1522.92, law(293.15, 0.5))
row("rho w0.20 303.15K", 1212.699, law(303.15, 0.20))
row("rho w0.20 333.15K", 1196.16, law(333.15, 0.20))
rho_m = 1213.8
m, dP, eta, V, g = 1.0, 2.0e5, 0.7, 1.0, 9.80665
Q = m / rho_m; tau = V * rho_m / m; W = Q * dP / eta; head = dP / (rho_m * g)
row("Q m3/s", 8.2386e-4, Q); row("tau s", 1213.8, tau); row("W_shaft W", 235.39, W); row("head m", 16.802, head)
row("law vs point %", -0.09, (law(303.15, 0.2) / rho_m - 1) * 100)
h = 1e-4
dT = (law(303.15 + h, 0.2) - law(303.15 - h, 0.2)) / (2 * h)
dw = (law(303.15, 0.2 + h) - law(303.15, 0.2 - h)) / (2 * h)
row("dRho/dT", -0.517, dT); row("dRho/dw", 1084, dw)
row("linear span +-1.5K,+-0.001", 1.86, abs(dT) * 1.5 + abs(dw) * 0.001)
corners = [law(303.15 + a, 0.2 + b) for a in (-1.5, 1.5) for b in (-0.001, 0.001)]
print(f"corner span (max-min)/2 of the law over the box\t{(max(corners)-min(corners))/2:.4f}\tcorners {['%.3f'%c for c in corners]}")
row("linear span +-3K,+-0.002", 3.7, abs(dT) * 3 + abs(dw) * 0.002)
# pure-water end of the law against itself at several T (the step to {water})
for T in (273.15, 293.15, 298.15, 303.15, 333.15, 353.15, 373.15, 423.15, 473.15):
    print(f"law at w[NaOH]=0, T={T}\t{law(T, 0.0):.4f}")

# The step between the set {water} (reference equation, IAPWS95 through the
# engine: needs <scratch_dir> as argv[1]) and {NaOH, water} as w[NaOH] -> 0.
import os, sys
if len(sys.argv) > 1:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import propscase as pc
    d = pc.make_case(os.path.abspath(sys.argv[1]), 'i6_water', ['water'], pc.ROUTES['IAPWS95'])
    Ts = [273.15 + 0.01, 293.15, 298.15, 303.15, 333.15, 353.15]
    o, _ = pc.scan(d, [(1e5, Ts)], {'water': 1.0}, ['rho_liquid_water'])
    for T in Ts:
        r = o[0][T]['rho_liquid_water']
        print(f"step at w[NaOH]->0, T={T}: law {law(T, 0.0):.4f}  IAPWS95(1 bar) {r:.4f}  law/ref-1 = {(law(T,0.0)/r-1)*100:+.4f} %")
