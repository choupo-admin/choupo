import time, warnings
warnings.simplefilter('ignore')
import cantera as ct
g = ct.Solution('/tmp/mb89/mbA.yaml')
g.TPX = 1300., 101325., {'CH4': 0.0558, 'O2': 0.1860, 'N2': 0.7581, 'NO': 1e-4}
r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3; net = ct.ReactorNet([r]); net.rtol = 1e-8; net.atol = 1e-15
net.advance(2.3e-3)
Y = g.Y.copy(); T = g.T; rho = g.density
N = 20000
t0 = time.perf_counter()
for i in range(N):
    g.TDY = T + 1e-9 * (i % 7 + 1), rho, Y
t1 = time.perf_counter()
for i in range(N):
    g.TDY = T + 1e-9 * (i % 7 + 1), rho, Y
    g.net_production_rates
t2 = time.perf_counter()
print('set state: %.1f us; set state + net_production_rates: %.1f us -> kinetics core %.1f us per rhs' % ((t1-t0)/N*1e6, (t2-t1)/N*1e6, ((t2-t1)-(t1-t0))/N*1e6))
