from common import *
import statistics, json
N = int(sys.argv[1]) if len(sys.argv) > 1 else 26
m = Automation3()
CASES = {
 "benzene_toluene": dict(comps=("Benzene","Toluene"), pp="Raoult's Law", stages=16, feed=8,
                         z={"Benzene":50.0,"Toluene":50.0}, T=365.0, RR=2.0, B=50.0),
 "ethanol_water":   dict(comps=("Ethanol","Water"), pp="NRTL", stages=17, feed=8,
                         z={"Ethanol":30.0,"Water":70.0}, T=354.42, RR=2.5, B=75.0),
}
def build(c):
    sim = m.CreateFlowsheet()
    for k in c["comps"]: sim.AddCompound(k)
    m1 = sim.AddObject(ObjectType.MaterialStream, 50, 50, "feed").__implementation__
    m2 = sim.AddObject(ObjectType.MaterialStream, 250, 50, "distillate").__implementation__
    m3 = sim.AddObject(ObjectType.MaterialStream, 250, 50, "bottoms").__implementation__
    e1 = sim.AddObject(ObjectType.EnergyStream, 100, 50, "qc").__implementation__
    e2 = sim.AddObject(ObjectType.EnergyStream, 100, 50, "qr").__implementation__
    d1 = sim.AddObject(ObjectType.DistillationColumn, 100, 50, "column").__implementation__
    d1.SetNumberOfStages(c["stages"]); d1.ConnectFeed(m1, c["feed"])
    d1.ConnectDistillate(m2); d1.ConnectBottoms(m3)
    d1.ConnectCondenserDuty(e1); d1.ConnectReboilerDuty(e2)
    d1.SetCondenserSpec("Reflux Ratio", c["RR"], "")
    d1.SetReboilerSpec("Product Molar Flow Rate", c["B"] / 3.6, "mol/s", "")
    d1.SetTopPressure(101325.0); d1.ColumnPressureDrop = 0.0
    d1.SolvingMethodName = "Napthali-Sandholm (Simultaneous Correction)"
    sim.AutoLayout()
    sim.CreateAndAddPropertyPackage(c["pp"])
    m1.SetTemperature(c["T"]); m1.SetPressure(101325.0)
    tot = sum(c["z"].values()); m1.SetMolarFlow(tot / 3.6)
    for k, v in c["z"].items(): m1.SetOverallCompoundMolarFlow(k, v / 3.6)
    return sim, d1, m2, m3, e1, e2
def run(N, cases=None, method="Napthali-Sandholm (Simultaneous Correction)"):
    out = {}
    for name, c in CASES.items():
        if cases and name not in cases: continue
        times = []; res = None
        for i in range(N + 1):
            sim, d1, m2, m3, e1, e2 = build(c); d1.SolvingMethodName = method
            t0 = time.perf_counter(); errs = m.CalculateFlowsheet2(sim); dt = time.perf_counter() - t0
            if errs is not None and errs.Count > 0:
                print(name, "run", i, "ERRORS:", [str(e.Message)[:200] for e in errs]); break
            times.append(dt)
            if res is None:
                res = dict(Qreb_kW=float(e2.EnergyFlow), Qcond_kW=float(e1.EnergyFlow),
                           xD={k: float(m2.Phases[0].Compounds[k].MoleFraction) for k in c["comps"]},
                           D_kmolh=m2.GetMolarFlow()*3.6, TD=m2.GetTemperature(), TB=m3.GetTemperature())
        if times:
            first, rest = times[0], sorted(times[1:])
            p95 = rest[int(round(0.95*(len(rest)-1)))] if rest else float('nan')
            out[name] = dict(method=method, first_s=first, median_s=statistics.median(rest) if rest else None,
                             p95_s=p95, min_s=rest[0] if rest else None, n=len(rest), result=res)
    return out
if __name__ == "__main__":
    meth = sys.argv[2] if len(sys.argv) > 2 else "Napthali-Sandholm (Simultaneous Correction)"
    print(json.dumps(run(N, method=meth), indent=1))
