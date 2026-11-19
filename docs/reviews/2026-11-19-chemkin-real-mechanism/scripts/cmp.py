"""Compare a Choupo trajectory.csv with a Cantera csv.  usage: cmp.py choupo.csv cantera.csv [dt]"""
import sys, csv, numpy as np
R = 8.314462618
def load(p):
    with open(p) as f:
        r = csv.reader(f); h = next(r); a = np.array([[float(x) for x in row] for row in r])
    return h, a
hc, ac = load(sys.argv[1]); ht, at = load(sys.argv[2])
dt = float(sys.argv[3]) if len(sys.argv) > 3 else 1e-6
sp = [h.split(".n_")[1] for h in hc[1:-1]]
tc, nc, Tc = ac[:, 0], ac[:, 1:-1], ac[:, -1]
ntot = nc.sum(1)
Xc = nc / ntot[:, None]
Pc = ntot * 1000 * R * Tc / 1e-3   # n [kmol]*1000 -> mol; V = 1e-3 m3
tt, Tt, Pt = at[:, 0], at[:, 1], at[:, 2]
Xt = at[:, 3:]
idx = {s: i for i, s in enumerate(ht[3:])}
def tau(t, T):
    tg = np.arange(0, t[-1] + 1e-15, dt)
    Tg = np.interp(tg, t, T)
    d = np.diff(Tg) / dt
    return tg[int(np.argmax(d)) + 1], d.max()
tc_tau, dmax_c = tau(tc, Tc)
tt_tau, dmax_t = tau(tt, Tt)
print("grid dt %.1e s" % dt)
print("tau (max dT/dt on the grid)  choupo %.2f us   cantera %.2f us   diff %+.2f us" % (tc_tau * 1e6, tt_tau * 1e6, (tc_tau - tt_tau) * 1e6))
print("T_final  choupo %.3f  cantera %.3f  diff %+.3f K" % (Tc[-1], Tt[-1], Tc[-1] - Tt[-1]))
print("P_final  choupo %.5f  cantera %.5f bar  rel %+.3e" % (Pc[-1] / 1e5, Pt[-1] / 1e5, Pc[-1] / Pt[-1] - 1))
print("%-5s %12s %12s %10s" % ("sp", "X_choupo", "X_cantera", "rel"))
for s in sp:
    xc, xt = Xc[-1, sp.index(s)], Xt[-1, idx[s]]
    print("%-5s %12.6e %12.6e %10s" % (s, xc, xt, ("%+.2e" % (xc / xt - 1)) if xt > 1e-12 else "-"))
# profiles at times relative to tau of Cantera
print("profiles at matched times (T [K]; X_OH; X_H2O)")
for f in (0.5, 0.9, 1.0, 1.1, 2.0):
    t = f * tt_tau
    Tcv = np.interp(t, tc, Tc); Ttv = np.interp(t, tt, Tt)
    oc = np.interp(t, tc, Xc[:, sp.index("oh")]); ot = np.interp(t, tt, Xt[:, idx["oh"]])
    wc = np.interp(t, tc, Xc[:, sp.index("h2o")]); wt = np.interp(t, tt, Xt[:, idx["h2o"]])
    print("t=%.1f*tau=%7.2f us  T %9.2f %9.2f (%+7.2f)  X_OH %.3e %.3e  X_H2O %.3e %.3e" % (f, t * 1e6, Tcv, Ttv, Tcv - Ttv, oc, ot, wc, wt))
# max abs T difference over a 1us grid, and RMS
tg = np.arange(0, min(tc[-1], tt[-1]), dt)
d = np.interp(tg, tc, Tc) - np.interp(tg, tt, Tt)
print("max |dT| over grid %.2f K at %.1f us; rms %.2f K" % (abs(d).max(), tg[abs(d).argmax()] * 1e6, np.sqrt((d ** 2).mean())))
