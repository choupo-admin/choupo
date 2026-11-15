from common import *
import statistics, json
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
PP = sys.argv[2] if len(sys.argv) > 2 else "Raoult's Law"
m = Automation3()
feed = {"Propane":8.915024, "Isobutane":132.567090, "N-butane":305.260832, "1-butene":0.934219, "Isobutene":0.934219,
        "Trans-2-butene":0.467110, "Neopentane":0.363246, "Isopentane":2.905971, "N-pentane":0.363246}
Dk = 142.023556; Bk = sum(feed.values()) - Dk
def build():
    sim = m.CreateFlowsheet()
    for k in feed: sim.AddCompound(k)
    m1 = sim.AddObject(ObjectType.MaterialStream, 50, 50, "feed").__implementation__
    m2 = sim.AddObject(ObjectType.MaterialStream, 250, 50, "distillate").__implementation__
    m3 = sim.AddObject(ObjectType.MaterialStream, 250, 50, "bottoms").__implementation__
    e1 = sim.AddObject(ObjectType.EnergyStream, 100, 50, "qc").__implementation__
    e2 = sim.AddObject(ObjectType.EnergyStream, 100, 50, "qr").__implementation__
    d1 = sim.AddObject(ObjectType.DistillationColumn, 100, 50, "column").__implementation__
    d1.SetNumberOfStages(76); d1.ConnectFeed(m1, 37)
    d1.ConnectDistillate(m2); d1.ConnectBottoms(m3); d1.ConnectCondenserDuty(e1); d1.ConnectReboilerDuty(e2)
    d1.SetCondenserSpec("Reflux Ratio", 11.440296, ""); d1.SetReboilerSpec("Product Molar Flow Rate", Bk / 3.6, "mol/s", "")
    d1.SetTopPressure(658600.0); d1.ColumnPressureDrop = 0.0
    d1.SolvingMethodName = "Napthali-Sandholm (Simultaneous Correction)"
    sim.AutoLayout(); sim.CreateAndAddPropertyPackage(PP)
    m1.SetTemperature(329.5214); m1.SetPressure(658600.0); m1.SetMolarFlow(sum(feed.values()) / 3.6)
    for k, v in feed.items(): m1.SetOverallCompoundMolarFlow(k, v / 3.6)
    return sim, d1, m2, m3, e1, e2
times = []; res = None
for i in range(N + 1):
    sim, d1, m2, m3, e1, e2 = build()
    t0 = time.perf_counter(); errs = m.CalculateFlowsheet2(sim); dt = time.perf_counter() - t0
    if errs is not None and errs.Count > 0: print("run", i, "ERRORS", [str(e.Message)[:300] for e in errs]); break
    times.append(dt)
    if res is None:
        mw = {"N-butane":58.123, "Isobutane":58.123}
        res = dict(Qreb_kW=float(e2.EnergyFlow), Qcond_kW=float(e1.EnergyFlow), D_kmolh=m2.GetMolarFlow()*3.6,
                   xD_nC4=float(m2.Phases[0].Compounds["N-butane"].MoleFraction), xD_iC4=float(m2.Phases[0].Compounds["Isobutane"].MoleFraction),
                   xB_iC4=float(m3.Phases[0].Compounds["Isobutane"].MoleFraction))
if times:
    rest = sorted(times[1:]) or times
    print(json.dumps(dict(pp=PP, first_s=times[0], median_s=statistics.median(rest), p95_s=rest[int(round(0.95*(len(rest)-1)))], min_s=rest[0], n=len(rest), result=res), indent=1))
