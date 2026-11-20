"""Cantera brute-force ignition-delay sensitivity, S_j = d ln tau / d ln k_j.

The same definition Choupo's `sensitivity { }` block uses (REPORT.md section 10):
  tau = time at which T first exceeds T0 + rise, linearly interpolated between
        the two accepted integrator states that bracket it;
  one run per reaction with gas.set_multiplier(factor, j)  (net rate: forward
  and reverse together), S_j = (ln tau_j - ln tau_0) / ln(factor).

usage: ct_sensitivity.py mech.yaml out.csv [T0=1100] [P0atm=2] [tend=3e-4] [factor=1.1]
                         [rise=400] [rtol=1e-10] [atol=1e-18]
Constant-volume adiabatic IdealGasReactor, X = H2:2 O2:1 N2:3.76 (stoichiometric air).
"""
import sys, csv, math, cantera as ct

yaml, out = sys.argv[1], sys.argv[2]
T0 = float(sys.argv[3]) if len(sys.argv) > 3 else 1100.0
P0 = (float(sys.argv[4]) if len(sys.argv) > 4 else 2.0) * ct.one_atm
tend = float(sys.argv[5]) if len(sys.argv) > 5 else 3e-4
factor = float(sys.argv[6]) if len(sys.argv) > 6 else 1.1
rise = float(sys.argv[7]) if len(sys.argv) > 7 else 400.0
rtol = float(sys.argv[8]) if len(sys.argv) > 8 else 1e-10
atol = float(sys.argv[9]) if len(sys.argv) > 9 else 1e-18

gas = ct.Solution(yaml)


def tau_of(mult_index=None):
    gas.set_multiplier(1.0)
    if mult_index is not None:
        gas.set_multiplier(factor, mult_index)
    gas.TPX = T0, P0, {"h2": 2.0, "o2": 1.0, "n2": 3.76}
    r = ct.IdealGasReactor(gas, energy="on")
    r.volume = 1e-3
    net = ct.ReactorNet([r])
    net.rtol, net.atol = rtol, atol
    net.max_time_step = tend * 2e-4          # same short-step cap as Choupo
    thr = T0 + rise
    tp, Tp = 0.0, T0
    while net.time < tend:
        net.step()
        t, T = net.time, r.T
        if T > thr:
            return tp + (thr - Tp) / (T - Tp) * (t - tp)
        tp, Tp = t, T
    raise RuntimeError("no ignition")


tau0 = tau_of()
rows = []
for j in range(gas.n_reactions):
    tj = tau_of(j)
    rows.append((j, gas.reaction(j).equation, tj, math.log(tj / tau0) / math.log(factor)))
gas.set_multiplier(1.0)

# the equilibrium check: a multiplied run ends where the base run ends
def final_T(mult_index=None):
    gas.set_multiplier(1.0)
    if mult_index is not None:
        gas.set_multiplier(factor, mult_index)
    gas.TPX = T0, P0, {"h2": 2.0, "o2": 1.0, "n2": 3.76}
    r = ct.IdealGasReactor(gas, energy="on")
    r.volume = 1e-3
    net = ct.ReactorNet([r])
    net.rtol, net.atol = rtol, atol
    net.advance(tend)
    return r.T

with open(out, "w") as f:
    w = csv.writer(f)
    w.writerow(["index", "equation", "tau_s", "S", "tau0_s", "factor"])
    for j, eq, tj, S in rows:
        w.writerow([j, eq, "%.12g" % tj, "%.8g" % S, "%.12g" % tau0, factor])
print("ct", ct.__version__, "tau0_us %.6f" % (tau0 * 1e6), "T_final base %.4f, R1x1.1 %.4f"
      % (final_T(), final_T(0)))
for j, eq, tj, S in sorted(rows, key=lambda r: -abs(r[3])):
    print("%2d %-32s S=%+.4f tau=%.6f us" % (j, eq, S, tj * 1e6))
