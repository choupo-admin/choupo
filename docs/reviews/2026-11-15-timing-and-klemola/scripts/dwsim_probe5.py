from common import *
import bench as B, time
from DWSIM.GlobalSettings import Settings
R = 1.98721
def choupo_params(sim):
    pp = list(sim.PropertyPackages.Values)[0].__implementation__
    p = pp.m_uni.InteractionParameters["Ethanol"]["Water"]
    p.A12 = 246.18 * R; p.B12 = -0.8009 * R; p.A21 = -586.0809 * R; p.B21 = 3.4578 * R; p.alpha12 = 0.30
    p.C12 = 0.0; p.C21 = 0.0
def one(label, par=True, cp=False):
    Settings.EnableParallelProcessing = par
    sim, d1, m2, m3, e1, e2 = B.build(B.CASES["ethanol_water"])
    if cp: choupo_params(sim)
    t0 = time.perf_counter(); errs = B.m.CalculateFlowsheet2(sim); dt = time.perf_counter() - t0
    print(f"{label:38s} {dt:7.2f} s  xD(EtOH) {float(m2.Phases[0].Compounds['Ethanol'].MoleFraction):.4f}  Qreb {float(e2.EnergyFlow):.1f} kW  errs {errs.Count if errs is not None else 0}", flush=True)
one("default params, parallel on")
one("default params, parallel off", par=False)
one("Choupo's NRTL pair, parallel off", par=False, cp=True)
