from common import *
import bench as B, time, copy
from DWSIM.UnitOperations.UnitOperations import Column
def one(label, pp=None, scheme=None):
    c = dict(B.CASES["ethanol_water"])
    if pp: c["pp"] = pp
    sim, d1, m2, m3, e1, e2 = B.build(c)
    if scheme is not None: d1.SolverScheme = getattr(Column.SolvingScheme, scheme)
    d1.CreateSolverConvergengeReport = True
    t0 = time.perf_counter(); errs = B.m.CalculateFlowsheet2(sim); dt = time.perf_counter() - t0
    rep = str(d1.ColumnSolverConvergenceReport or "")
    it = rep.count("Iteration") or rep.count("iteration")
    print(f"{label:34s} {dt:7.2f} s  xD {float(m2.Phases[0].Compounds['Ethanol'].MoleFraction):.4f}  report lines {len(rep.splitlines())}  'iteration' {it}", flush=True)
    return rep
r = one("NRTL, Direct (default)")
open("ns_report.txt","w").write(r)
one("ideal (Raoult), Direct", pp="Raoult's Law")
one("NRTL, Ideal_K_and_Enthalpy_Init", scheme="Ideal_K_and_Enthalpy_Init")
