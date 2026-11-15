from common import *
import bench as B
sim, d1, m2, m3, e1, e2 = B.build(B.CASES["benzene_toluene"])
pp = list(sim.PropertyPackages.Values)[0].__implementation__
pp.CurrentMaterialStream = m3
for name, mw, Ts in (("Benzene", 78.11, (298.15, 353.24, 382.9)), ("Toluene", 92.14, (298.15, 383.78, 382.9))):
    for T in Ts:
        try: h = pp.AUX_HVAPi(name, T)
        except Exception as e: h = str(e)[:80]
        print(name, T, "Hvap kJ/kg", h, "-> J/mol", (h*mw if isinstance(h,float) else ""))
for name in ("Benzene","Toluene"):
    c = sim.SelectedCompounds[name]
    print(name, "Tb", c.NBP, "Tc", c.Critical_Temperature, "Hvap correlation source:", getattr(c,'OriginalDB',''), "MW", c.Molar_Weight)
