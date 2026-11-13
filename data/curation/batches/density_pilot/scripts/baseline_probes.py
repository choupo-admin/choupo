#!/usr/bin/env python3
"""Baseline probes of what today's engine answers, EXACTLY, for the states of
the demonstrations that have no measured number to compare against (a refusal,
a flat constant) or that need the consumers' own route:

  * propertyScan1D `rho_liquid_<c>` (the property bench's door to
    ThermoPackage::density, liquid branch), one component at a time;
  * a one-unit pump flowsheet on a scratch copy of tutorials/steady/rotating/
    pump01_water: the pump reads each component's `Vliq` flat (Pump.cpp:88-128)
    and prints `v_molar (liq)`; a component without Vliq REFUSES there.

usage: baseline_probes.py > baseline/probes.txt
"""
import os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E

SOLVE = os.environ.get("CHOUPO_SOLVE", "/home/vitor/Choupo/choupoSolve")
HOME = E.HOME
SC = E.SCRATCH


def bench(comp, T, P, label=""):
    d = E.make_case("probe_" + comp, [comp])
    out, log = E.scan(d, [(P, [T])], comp)
    v = out[(T, P)]
    if v is not None:
        return f"rho_liquid_{comp} at {T} K, {P/1e6:g} MPa: {v:.4f} kg/m3"
    # the refusal text, exactly as the run prints it
    m = [l.strip() for l in log.splitlines() if "rho_liquid" in l and ("needs" in l or "refus" in l or "T >=" in l or "critical" in l or "error" in l.lower())]
    m2 = [l.strip() for l in log.splitlines() if "ThermoPackage" in l or "liquidMolarVolume" in l or "NaN" in l.upper() and "rho" in l]
    return f"rho_liquid_{comp} at {T} K, {P/1e6:g} MPa: NaN; engine message: " + " | ".join((m + m2)[:3] or ["(none printed; see run.log)"])


def pump(tag, flows, T, P, thermo_extra=""):
    d = os.path.join(SC, "densityPilot_pump_" + tag)
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(os.path.join(HOME, "tutorials/steady/rotating/pump01_water"), d)
    shutil.rmtree(os.path.join(d, "expected"), ignore_errors=True)
    for f in os.listdir(os.path.join(d, "constant/components")):
        os.remove(os.path.join(d, "constant/components", f))
    for c in flows:
        shutil.copy(os.path.join(HOME, "data/standards/components", c + ".dat"), os.path.join(d, "constant/components", c + ".dat"))
    t = open(os.path.join(d, "constant/thermoPhysPropDict")).read()
    t = re.sub(r"components\s*\([^)]*\)", "components ( " + " ".join(flows) + " )", t)
    open(os.path.join(d, "constant/thermoPhysPropDict"), "w").write(t)
    feed = "componentMolarFlows\n{\n" + "".join(f"    {c} {v} kmol/h;\n" for c, v in flows.items()) + f"}}\n\nT {T} K;\nP {P} Pa;\n"
    out = "componentMolarFlows\n{\n" + "".join(f"    {c} {v} kmol/h;\n" for c, v in flows.items()) + f"}}\n\nT {T} K;\nP {P*1.5} Pa;\n"
    open(os.path.join(d, "0/feed"), "w").write(feed)
    open(os.path.join(d, "0/out"), "w").write(out)
    r = subprocess.run([SOLVE, d], capture_output=True, text=True)
    log = r.stdout + r.stderr
    v = re.search(r"v_molar \(liq\):\s+([0-9.eE+-]+)\s+m3/mol", log)
    if v:
        return f"pump on {tag} at {T} K, {P/1e5:g} bar: v_molar (liq) = {v.group(1)} m3/mol"
    err = [l.strip() for l in log.splitlines() if "fatal" in l.lower() or "error" in l.lower() or "Pump:" in l or "refus" in l.lower()]
    return f"pump on {tag} at {T} K, {P/1e5:g} bar: no result; engine message: " + " | ".join(err[:3] or ["(see log)"])


if __name__ == "__main__":
    lines = []
    # D1 consumers: the pump on water is flat in T and P
    for T, P in ((277.15, 1e5), (298.15, 1e5), (298.15, 5e7), (353.15, 1e5)):
        lines.append(pump("water", {"water": 36}, T, P))
    # D3: NaOH + water, 20 wt % (mole fractions from M_w 18.015, M_NaOH 39.997)
    nw, nn = 0.8 / 18.015, 0.2 / 39.997
    lines.append(bench("NaOH", 303.15, 1e5))
    lines.append(pump("water+NaOH 20 wt%", {"water": round(36 * nw / (nw + nn), 4), "NaOH": round(36 * nn / (nw + nn), 4)}, 303.15, 1e5))
    # D4: CO2
    for T in (293.15, 313.15):
        lines.append(bench("CO2", T, 2e7))
        lines.append(pump("water+CO2 x=0.02", {"water": 35.28, "CO2": 0.72}, T, 2e7))
    # D5: NaCl
    lines.append(bench("NaCl", 298.15, 1e5))
    lines.append(pump("water+ethanol+NaCl", {"water": 30, "ethanol": 5, "NaCl": 1}, 298.15, 1e5))
    print("\n".join(lines))
