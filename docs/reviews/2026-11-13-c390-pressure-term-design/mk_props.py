#!/usr/bin/env python3
"""mk_props.py <repo-root> <scratch-dir>: build a choupoProps probe case that
prints the kernel liquid density, the record route density, Psat and Cp_liquid
for water/ethanol/benzene at T, T+-0.5 K and several P, plus IF97 points."""
import sys, os, shutil
repo, scr = sys.argv[1], sys.argv[2]
case = os.path.join(scr, "probe_props")
shutil.rmtree(case, ignore_errors=True)
os.makedirs(case + "/system"); os.makedirs(case + "/constant")
open(case + "/probe_props.cho", "w").close()
open(case + "/system/controlDict", "w").write(
 'application choupoProps;\ndescription "C390 probe";\nverbosity 2;\n')
open(case + "/constant/thermoPhysPropDict", "w").write("""recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( water ethanol benzene );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
""")
ops = []
Ts = [298.15, 350.0, 450.0]
Ps = [1.0, 10.0, 50.0, 100.0]   # bar
comps = ["water", "ethanol", "benzene"]
for c in comps:
    for T in Ts:
        for dT in (-0.5, 0.0, 0.5):
            for P in (Ps if T < 400 else [20.0, 50.0, 100.0]):
                nm = f"{c}_T{T+dT:.2f}_P{P:g}".replace(".", "p")
                props = f"rho_liquid_kernel rho_liquid_{c} Psat_{c} Cp_liquid_{c}"
                ops.append(f"""    {{ name {nm}; type propertyPoint;
      state {{ T {T+dT} K; P {P} bar; composition {{ {c} 1.0; }} }}
      properties ( {props} ); }}""")
for T in Ts:
    for P in (Ps if T < 400 else [20.0, 50.0, 100.0]):
        nm = f"if97_T{T:.2f}_P{P:g}".replace(".", "p")
        ops.append(f"""    {{ name {nm}; type steamTables; source "IAPWS R7-97(2012)";
      point {{ P {P} bar; T {T} K; }} }}""")
ops.append("""    { name if97sat2; type steamTables; source "IAPWS R7-97(2012)";
      saturation { from 350 K; to 450 K; n 2; } output { file sat2.csv; } }""")
ops.append("""    { name if97sat; type steamTables; source "IAPWS R7-97(2012)";
      saturation { from 298.15 K; to 450 K; n 2; } output { file sat.csv; } }""")
open(case + "/system/propsDict", "w").write("operations\n(\n" + "\n".join(ops) + "\n);\n")
print(case)
