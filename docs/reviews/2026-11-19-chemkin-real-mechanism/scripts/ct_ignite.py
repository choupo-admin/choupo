"""Cantera constant-volume adiabatic ignition.
usage: ct_ignite.py mech.yaml out.csv [T0] [P0atm] [tend] [dt] [seedH] [rtol] [atol]"""
import sys, time, csv, numpy as np, cantera as ct
yaml, out = sys.argv[1], sys.argv[2]
T0 = float(sys.argv[3]) if len(sys.argv) > 3 else 1100.0
P0 = float(sys.argv[4]) * ct.one_atm if len(sys.argv) > 4 else ct.one_atm
tend = float(sys.argv[5]) if len(sys.argv) > 5 else 1e-3
dt = float(sys.argv[6]) if len(sys.argv) > 6 else 1e-6
seed = float(sys.argv[7]) if len(sys.argv) > 7 else 0.0
gas = ct.Solution(yaml)
X = {"h2": 2.0, "o2": 1.0, "n2": 3.76}
if seed > 0:
    X["h"] = seed
gas.TPX = T0, P0, X
r = ct.IdealGasReactor(gas, energy="on")
r.volume = 1e-3
net = ct.ReactorNet([r])
net.rtol = float(sys.argv[8]) if len(sys.argv) > 8 else 1e-9
net.atol = float(sys.argv[9]) if len(sys.argv) > 9 else 1e-15
names = gas.species_names
t_wall = time.perf_counter()
rows = [(0.0, r.T, r.thermo.P, *r.thermo.X)]
nsteps = 0
while net.time < tend:
    net.step()
    nsteps += 1
    rows.append((net.time, r.T, r.thermo.P, *r.thermo.X))
wall = time.perf_counter() - t_wall
a = np.array(rows)
with open(out, "w") as f:
    w = csv.writer(f)
    w.writerow(["t", "T", "P"] + names)
    for row in rows:
        w.writerow(["%.10g" % x for x in row])
t, T = a[:, 0], a[:, 1]
d = np.diff(T) / np.diff(t)
i = int(np.argmax(d))
tau_step = 0.5 * (t[i] + t[i + 1])
tg = np.arange(0, tend + 1e-15, dt)
Tg = np.interp(tg, t, T)
dg = np.diff(Tg) / dt
j = int(np.argmax(dg))
tau_grid = tg[j + 1]
print("ct", ct.__version__, "species", names)
print("steps %d wall_s %.4f tau_step_us %.4f tau_grid_us %.4f Tfinal %.3f Pfinal_bar %.5f" % (nsteps, wall, tau_step * 1e6, tau_grid * 1e6, T[-1], a[-1, 2] / 1e5))
print("Xfinal", {n: float("%.6g" % x) for n, x in zip(names, a[-1, 3:])})
