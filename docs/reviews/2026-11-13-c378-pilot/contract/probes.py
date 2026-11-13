#!/usr/bin/env python3
"""Probes of the C378 density pilot (review angle: contract and code).

    python3 probes.py <repo root> <scratch dir> [probe ...]

Each probe copies a shipped demonstration into <scratch dir>/<probe>/case,
edits the copy, runs the engine on it and prints the lines that decide the
finding (exit code + grep).  Nothing outside <scratch dir> is written.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
SCR = Path(sys.argv[2]).resolve()
ONLY = set(a for a in sys.argv[3:] if a != "--no-fix")
FIX_SOLUTION = "--no-fix" not in sys.argv
DEMO = ROOT / "tutorials" / "steady" / "thermo"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C")


def copy(name, demo):
    d = SCR / name / "case"
    if d.exists():
        shutil.rmtree(d)
    d.parent.mkdir(parents=True, exist_ok=True)
    src = demo if Path(demo).is_absolute() else DEMO / demo
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "converged", "iterations", "reports", "design", "economics", "*.log", "result*.json"))
    #  The seal's mirror of the NaOH solution record is gitignored (.gitignore
    #  `**/solution/`), so a clean checkout lacks it: supply the catalogue's
    #  copy, which the manifest names as the origin (finding PA-01).
    if FIX_SOLUTION and (d / "constant/propertyManifest").exists() and \
            "parameters/solution/NaOH-water.dat" in (d / "constant/propertyManifest").read_text():
        s = d / "constant/parameters/solution"
        s.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "data/standards/parameters/solution/NaOH-water.dat", s / "NaOH-water.dat")
    return d


def edit(path, old, new, count=1):
    t = path.read_text()
    if old not in t:
        sys.exit(f"probe edit failed: {old!r} not in {path}")
    path.write_text(t.replace(old, new, count))


def run(d, binary="choupoSolve", extra=(), timeout=900):
    r = subprocess.run([str(ROOT / binary), str(d), *extra], capture_output=True, text=True,
                       env=ENV, timeout=timeout)
    out = r.stdout + r.stderr
    (d.parent / "run.log").write_text(out)
    return r.returncode, out


def show(name, rc, out, pats, n=6):
    print(f"--- {name}: exit {rc}")
    for p in pats:
        hits = [l for l in out.splitlines() if re.search(p, l)]
        for h in hits[:n]:
            print("   ", h.strip()[:420])
        if not hits:
            print(f"    (no line matches /{p}/)")


TPP = "constant/thermoPhysPropDict"


# P1: a per-unit thermo{} world (gammaPhi) beside a diluteSolution package,
#     same components: the resolver keys "resolves differently" on the
#     components and pure-fluid selections only.
def p_world():
    d = copy("world", "liquidDensity05_CO2water")
    tp = d / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( CO2 ); maxMassFraction 0.06; reason "probe"; }
}
""")
    edit(d / "system/flowsheetDict", "        reactions   ( absentAcid );",
         """        reactions   ( absentAcid );
        thermo { equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } } }""")
    rc, out = run(d)
    show("world (pump: diluteSolution package; R1: per-unit gammaPhi world)", rc, out,
         [r"resolved to|earlier in this run", r"refus|REFUS|Error|error", r"liquidDensity"], 8)
    # control: the same case without the per-unit world
    d2 = copy("world_control", "liquidDensity05_CO2water")
    tp = d2 / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( CO2 ); maxMassFraction 0.06; reason "probe"; }
}
""")
    rc, out = run(d2)
    show("world control (no per-unit thermo)", rc, out, [r"liquidDensity +kernel|idealMixing", r"Error|error"], 4)


# P2: massWithoutVolume declared for a component that HAS a liquid volume:
#     the kernel ignores the declaration; the pump's Cp share obeys it.
def p_declared_but_volumetric():
    for tag, comps in (("mwv_ethanol", "ethanol"), ("mwv_none", None)):
        d = copy(tag, "liquidDensity02_waterEthanol")
        if comps:
            tp = d / TPP
            tp.write_text(tp.read_text() + f"""
approximations
{{
    massWithoutVolume {{ components ( {comps} ); maxMassFraction 0.5; reason "probe"; }}
}}
""")
        rc, out = run(d)
        show(f"{tag}", rc, out, [r"P1 .*liquidDensity|liquidDensity .*P1", r"\[hypothesis\]",
                                 r"T_out|Outlet T|T out|dT", r"massWithoutVolume"], 6)


# P3: a marked measurement whose composition column names no component
#     (w[NaHO]): is the declaration refused, or silently never used?
def p_measured_typo():
    d = copy("measured_typo", "liquidDensity04_NaOHpoint")
    f = d / "constant/experiments/NaOH20_303K.dat"
    t = f.read_text().replace("w[NaOH]", "w[NaHO]")
    f.write_text(t)
    rc, out = run(d)
    show("measured column w[NaHO]", rc, out, [r"R1 .*liquidDensity|liquidDensity .*R1|solutionLaw|measured",
                                              r"NaHO", r"Error|error|refus"], 6)


# P4: a typo inside `replaces { }` (recrod for record).
def p_replaces_typo():
    d = copy("replaces_typo", "liquidDensity04_NaOHpoint")
    edit(d / TPP, "record NaOH-water;", "recrod NaOH-wter;")
    rc, out = run(d)
    show("replaces { recrod NaOH-wter; }", rc, out, [r"recrod|unknown", r"measured NaOH20_303K|replaces", r"Error|error"], 4)
    # and a typo'd extra key in the box
    d = copy("box_typo", "liquidDensity04_NaOHpoint")
    f = d / "constant/experiments/NaOH20_303K.dat"
    edit(f, "w[NaOH] ( 0.199 0.201 ); }", "w[NaOH] ( 0.199 0.201 ); Pmax 1; }")
    edit(f, "uncertainty 2.0;", "uncertainty 2.0;\nuncertainy 5.0;")
    rc, out = run(d)
    show("box with an unknown key Pmax, file with unknown key uncertainy", rc, out,
         [r"Pmax|uncertainy|unknown", r"Error|error"], 4)


# P5: massWithoutVolume naming a component that is not in the case.
def p_mwv_unknown_component():
    d = copy("mwv_unknown", "liquidDensity05_CO2water")
    tp = d / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( CO2 NaCI ); maxMassFraction 0.06; reason "probe"; }
}
""")
    rc, out = run(d)
    show("massWithoutVolume components ( CO2 NaCI )", rc, out, [r"NaCI", r"Error|error"], 4)


# P6: one transposed character in each new keyword.
def p_keywords():
    cases = [
        ("kw_measured", "liquidDensity04_NaOHpoint", TPP, "measured\n", "measrued\n"),
        ("kw_use", "liquidDensity04_NaOHpoint", TPP, "use method;", "use mehtod;"),
        ("kw_replaces_method", "liquidDensity04_NaOHpoint", TPP, "method solutionLaw;", "method soluitonLaw;"),
        ("kw_form", "liquidDensity03_NaOH", "constant/parameters/solution/NaOH-water.dat",
         "polynomialTSqrtX;", "polynomialTSqrtx;"),
        ("kw_returns", "liquidDensity03_NaOH", "constant/parameters/solution/NaOH-water.dat",
         "returns           solutionDensity;", "returns           solutoinDensity;"),
        ("kw_pressure", "liquidDensity03_NaOH", "constant/parameters/solution/NaOH-water.dat",
         "pressure          notCarried;", "pressure          notCarreid;"),
        ("kw_variable", "liquidDensity03_NaOH", "constant/parameters/solution/NaOH-water.dat",
         "variable          w[water];", "variable          w[wtaer];"),
        ("kw_extra_in_law", "liquidDensity03_NaOH", "constant/parameters/solution/NaOH-water.dat",
         "pressure          notCarried;", "pressure          notCarried;\n    temperatureOrign 0 K;"),
        ("kw_mwv_word", "liquidDensity05_CO2water", TPP, None, "massWithoutVolmue"),
        ("kw_mwv_key", "liquidDensity05_CO2water", TPP, None, "maxMassFractoin"),
        ("kw_mwv_extra", "liquidDensity05_CO2water", TPP, None, "extraKey"),
    ]
    for tag, demo, rel, old, new in cases:
        d = copy(tag, demo)
        p = d / rel
        if old is None:
            word, key, extra = "massWithoutVolume", "maxMassFraction", ""
            if new == "massWithoutVolmue":
                word = new
            elif new == "maxMassFractoin":
                key = new
            else:
                extra = " maximumMassFraction 0.001;"
            p.write_text(p.read_text() + f"""
approximations
{{
    {word} {{ components ( CO2 ); {key} 0.06;{extra} reason "probe"; }}
}}
""")
        else:
            edit(p, old, new)
        rc, out = run(d)
        show(tag, rc, out, [r"[Uu]nknown|unknown form|needs|mehtod|measrued|soluitonLaw|solutoin|notCarreid|wtaer|Orign|Volmue|Fractoin|maximumMassFraction|Error"], 3)


# P7: the remedy the D5 refusal names: a ternary solution record.
def p_ternary_record():
    d = copy("ternary", "liquidDensity06_NaClwaterEthanol")
    sol = d / "constant/parameters/solution"
    sol.mkdir(parents=True, exist_ok=True)
    law = (ROOT / "data/standards/parameters/solution/NaOH-water.dat").read_text()
    law = law.replace("solute      NaOH;", "solute      NaCl;").replace("w[water]", "w[water]")
    (sol / "ethanol-NaCl-water.dat").write_text(law)
    rc, out = run(d)
    show("ternary record ethanol-NaCl-water.dat (solute NaCl, solvent water)", rc, out,
         [r"SolutionLaw|differs|logic|Error|error|terminate|what\(\)"], 6)


# P8: pure water, no pureFluids, at 446.5 K and pressures around the two
#     saturation lines (the reference equation's and the package's Antoine).
def p_lines():
    for P in (8.40e5, 8.60e5, 9.0e5, 9.6e5, 11.0e5):
        d = copy(f"lines_{int(P)}", "liquidDensity01_water")
        edit(d / "0/feed", "T               298.15 K;", "T               446.5 K;")
        edit(d / "0/feed", "P               100000 Pa;", f"P               {P:.0f} Pa;")
        rc, out = run(d)
        show(f"water 446.5 K, {P:.0f} Pa", rc, out,
             [r"P1 .*liquidDensity|liquidDensity .*P1|pump P1", r"saturation|VAPOUR|vapour|both say",
              r"Error|error"], 4)


# P9: the kernel's probe at edge states (choupoProps --liquid-density-probe).
def p_kernel_edges():
    d = copy("kernel_edges", "liquidDensity01_water")
    (d / "system" / "propsDict").write_text("operations\n(\n);\n")
    states = [
        "270.0 100000 water 1",          # below the triple point, 1 bar
        "250.0 100000 water 1",          # far below the triple point
        "298.15 0 water 1",               # P = 0
        "298.15 -100000 water 1",         # a negative pressure
    ]
    f = d / "probe.txt"
    f.write_text("\n".join(states) + "\n")
    r = subprocess.run([str(ROOT / "choupoProps"), str(d), f"--liquid-density-probe={f}"],
                       capture_output=True, text=True, env=ENV, timeout=600)
    print("--- kernel edges: exit", r.returncode)
    for l in (r.stdout + r.stderr).splitlines():
        if l.startswith("probe") or "rror" in l:
            print("   ", l[:400])


# P10: a hard-domain refusal at the final state: does the run print the
#      refusal's remedy (PropertyDomainError::remedy)?
def p_remedy():
    d = copy("remedy_box", "liquidDensity04_NaOHpoint")
    t = (d / "0/feed").read_text()
    t = re.sub(r"\nT\s+[0-9.]+ K;", "\nT               333.15 K;", t)
    (d / "0/feed").write_text(t)
    rc, out = run(d)
    show("measured point at 333.15 K (outside its box)", rc, out,
         [r"ERROR", r"a state inside the box|wider box with its reason"], 3)
    d = copy("remedy_bound", "liquidDensity05_CO2water")
    tp = d / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( CO2 ); maxMassFraction 0.01; reason "probe"; }
}
""")
    rc, out = run(d)
    show("massWithoutVolume bound 0.01 (w 0.0475)", rc, out,
         [r"ERROR", r"a liquid within the declared bound|larger bound with its reason"], 3)


# P11: a dissolved gas that is NOT a declared Henry solute (gammaPhi), above
#      its Tc, with massWithoutVolume declared for it (the plan review's PP-13).
def p_declared_ignored_above_tc():
    for T in ("293.15", "313.15"):
        d = copy(f"gammaPhi_co2_{T}", "liquidDensity05_CO2water")
        tp = d / TPP
        t = tp.read_text()
        t = re.sub(r"equilibrium\n\{.*?\n\}\n", """equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
""", t, flags=re.S)
        t += """
approximations
{
    massWithoutVolume { components ( CO2 ); maxMassFraction 0.06; reason "probe"; }
}
"""
        tp.write_text(t)
        f = d / "0/feed"
        f.write_text(re.sub(r"\nT\s+[0-9.]+ K;", f"\nT               {T} K;", f.read_text()))
        rc, out = run(d)
        show(f"gammaPhi, CO2 dissolved, massWithoutVolume(CO2), T {T}", rc, out,
             [r"P1 .*liquidDensity|liquidDensity .*P1|idealMixing", r"\[hypothesis\]",
              r"ERROR|critical"], 4)


# P12: a measurement marked for use that REPLACES an idealMixing whose
#      leaves include the hypothesis massWithoutVolume.  The resolver holds
#      its mutex while building the Measured method, whose constructor
#      evaluates the replaced idealMixing, which notes the hypothesis' use
#      under the same mutex.
def p_measured_over_massless():
    d = copy("measured_over_massless", "liquidDensity06_NaClwaterEthanol")
    f = d / "0/feed"
    t = f.read_text()
    t = re.sub(r"componentMassFlows\n\{.*?\n\}", "componentMassFlows\n{\n    water      3474.0 kg/h;\n    NaCl       126.0 kg/h;\n}", t, flags=re.S)
    f.write_text(t)
    (d / "constant/experiments").mkdir(exist_ok=True)
    (d / "constant/experiments/brine35.dat").write_text("""
provenance { source "probe"; citation "probe value"; }
property    liquidDensity;
solvent     water;
columns     ( { name T; unit K; } { name P; unit kPa; } { name w[NaCl]; unit -; } { name rho; unit kg/m3; } );
data        ( 298.15  100  0.035  1022.6 );
uncertainty 2.0;
box         { T ( 297.15 299.15 ); P ( 50e3 1500e3 ); w[NaCl] ( 0.034 0.036 ); }
""")
    tp = d / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( NaCl ); maxMassFraction 0.05; reason "probe"; }
}
volumetric { liquid { measured {
    brine35 { use method; replaces { method idealMixing; } reason "probe"; }
} } }
""")
    try:
        rc, out = run(d, timeout=180)
    except subprocess.TimeoutExpired:
        print("--- measured over massless: TIMEOUT (the run did not end)")
        return
    show("measured over massless", rc, out, [r"liquidDensity|measured|brine35", r"ERROR"], 6)
    # control: the same case, the measurement replaced by `use check`
    d2 = copy("measured_over_massless_check", "liquidDensity06_NaClwaterEthanol")
    for p in ("0/feed", TPP):
        (d2 / p).write_text((d / p).read_text().replace(
            "use method; replaces { method idealMixing; } reason \"probe\";", "use check;"))
    shutil.copytree(d / "constant/experiments", d2 / "constant/experiments")
    rc, out = run(d2)
    show("control (use check)", rc, out, [r"check brine35|liquidDensity +kernel", r"ERROR"], 4)


# P13: what the run prints about the resolution (plan section 2's table:
#      method, leaves, passed over, domain, pressure, evidence).
def p_table():
    for demo in ("liquidDensity01_water", "liquidDensity02_waterEthanol", "liquidDensity03_NaOH"):
        d = copy(f"table_{demo}", demo)
        rc, out = run(d)
        print(f"--- {demo}: exit {rc}")
        lines = out.splitlines()
        for k, l in enumerate(lines):
            if "[liquid properties]" in l:
                for m in lines[k:k + 14]:
                    print("   ", m[:300])
                break
        for pat in (r"passed over|passedOver", r"AAD|not quantified|evidence", r"recordVolume \("):
            hits = [l for l in lines if re.search(pat, l)]
            print(f"    /{pat}/: {len(hits)} line(s)" + (": " + hits[0].strip()[:200] if hits else ""))
        js = list(d.rglob("*.json"))
        txt = "".join(p.read_text(errors="replace") for p in js)
        print(f"    result JSON files {len(js)}; 'passed' in them: {txt.count('passed')};"
              f" 'evidence' in them: {txt.count('evidence')}")


# P14: one liquid, two entries: the pump on the kernel and another unit on the
#      slice-0 door (plan section 1: "printed by PropertySourceLog's 'same
#      liquid, two numbers' line").
def p_twice():
    for rel in ("tutorials/steady/hydraulics/pumpSystem01_operating_point",
                "tutorials/steady/membranes/membrane27_swro_energy_recovery"):
        src = ROOT / rel
        d = copy("twice_" + src.name, src)
        rc, out = run(d)
        print(f"--- {src.name}: exit {rc}")
        lines = out.splitlines()
        for k, l in enumerate(lines):
            if "[liquid properties]" in l:
                for m in lines[k:k + 30]:
                    if re.search(r"density|\[twice\]|\[constant\]|\[hypothesis\]", m):
                        print("   ", m.strip()[:260])
                break


# P15: the two units' own balances after the pilot: the energy and mass
#      by-unit rows of three pump cases and three CSTR cases, and the KPIs
#      the density feeds (v_molar_liq, head_m, W_shaft; tau_s) recomputed.
def p_energy():
    cases = {
        "tutorials/steady/power/rankine02_water": ["feedPump"],
        "tutorials/steady/membranes/membrane27_swro_energy_recovery": ["HPpump", "Booster"],
        "tutorials/steady/hydraulics/pumpSystem01_operating_point": ["pump01"],
        "tutorials/steady/reactors/cstr01_first_order": ["reactor"],
        "tutorials/steady/flowsheets/process03_recycle": ["reactor"],
        "tutorials/steady/reactors/cstr08_furusawa_bistable": ["reactor"],
    }
    for rel, units in cases.items():
        src = ROOT / rel
        d = copy("energy_" + src.name, src)
        rc, out = run(d)
        print(f"--- {src.name}: exit {rc}")
        for name in ("energyBalance_byUnit.csv", "massBalance_byUnit.csv"):
            for f in d.rglob(name):
                rows = f.read_text().splitlines()
                print(f"    {name} header: {rows[0][:200]}")
                for r in rows[1:]:
                    if any(r.split(",")[0].strip().endswith(u) or ("," + u + ",") in r for u in units):
                        print("     ", r[:240])
        for l in out.splitlines():
            if re.search(r"\[liquid properties\]|liquidDensity +kernel|global first law|Plant first law|residual", l):
                print("    log:", l.strip()[:220])


# P17 (coordinator item 1): a feed that declares T and vaporFraction and no
#      P.  StreamStateIO reads an absent P as 0 (lookupScalarOrDefault).
def p_tq_feed():
    for demo, vf in (("liquidDensity01_water", "0"), ("liquidDensity02_waterEthanol", "0"),
                     ("liquidDensity03_NaOH", "0")):
        d = copy(f"tq_{demo}", demo)
        f = d / "0/feed"
        t = re.sub(r"\nP\s+[0-9.eE+-]+ Pa;", f"\nvaporFraction   {vf};", f.read_text())
        f.write_text(t)
        rc, out = run(d)
        show(f"{demo}: feed T + vaporFraction {vf}, no P", rc, out,
             [r"P_in|P_out|P1 .*liquidDensity|liquidDensity .*(P1|R1)", r"ERROR|refus|VAPOUR|both say",
              r"[Pp] = 0|0 Pa|P=0"], 5)
        for js in d.rglob("*.json"):
            txt = js.read_text(errors="replace")
            for k in ("\"P_in\"", "\"P_out\"", "\"head_m\"", "\"tau_s\"", "\"W_shaft\""):
                m = re.search(k + r"\s*:\s*([^,}\n]+)", txt)
                if m:
                    print(f"    {js.name} {k} = {m.group(1)}")


# P18 (coordinator item 2): a design specification whose Newton trial leaves
#      the declared bound of massWithoutVolume.  Feed: water 3600 kg/h mixed
#      with a CO2-rich stream (water 2000 + CO2 300 kg/h per 2300 kg/h) whose
#      total flow the designSpec manipulates (streams.rich.F); w_CO2 at the
#      pump = 0.1304 m / (3600 + m), so the bound 0.04 is crossed at m ~ 1594
#      kg/h (~81.7 kmol/h).  Target: P1.W_shaft at m = 1000 kg/h (inside) or
#      at m = 4000 kg/h (outside the bound).
def build_dspec(tag, rich_kg_h, bound, with_outer, init_kmol_h=10.0, target=None):
    d = copy(f"dspec_{tag}", "liquidDensity05_CO2water")
    tp = d / TPP
    tp.write_text(tp.read_text() + """
approximations
{
    massWithoutVolume { components ( CO2 ); maxMassFraction %g; reason "probe"; }
}
""" % bound)
    hdr = (d / "0/feed").read_text().split("componentMassFlows")[0]
    s = rich_kg_h / 2300.0
    (d / "0/water").write_text(hdr + "componentMassFlows\n{\n    water 3600 kg/h;\n}\nT 293.15 K;\nP 20000000 Pa;\n")
    (d / "0/rich").write_text(hdr + "componentMassFlows\n{\n    water %r kg/h;\n    CO2 %r kg/h;\n}\nT 293.15 K;\nP 20000000 Pa;\n" % (2000 * s, 300 * s))
    fd = d / "system/flowsheetDict"
    fd.write_text(fd.read_text().replace("units\n(", """units
(
    {
        name        M1;
        type        mixer;
        inputs      ( water rich );
        outputs     ( feed );
    }""", 1))
    if with_outer:
        (d / "system/outerDict").write_text(hdr + """type designSpec;
manipulate
(
    { variable streams.rich.F; initial %g kmol/h; min 0.1 kmol/h; max 1000 kmol/h; }
);
targets
(
    { path P1.W_shaft; value %r W; tol 0.01 W; }
);
options { maxIter 30; tolF 1.0; fdStep 1.0e-3; }
""" % (init_kmol_h, target))
    return d


def p_designspec_trial():
    import json
    W = {}
    for tag, m in (("inside", 1000.0), ("outside", 4000.0)):
        d = build_dspec("single_" + tag, m, 0.10, False)
        rc, out = run(d)
        mm = re.findall(r'"W_shaft"\s*:\s*([0-9.eE+-]+)', out)
        W[tag] = float(mm[0]) if mm else None
        print(f"    single pass rich {m} kg/h (bound 0.10): exit {rc}, W_shaft {W[tag]}"
              + ("" if rc == 0 else " | " + out.strip().splitlines()[-1][:300]))
    for tag in ("inside", "outside"):
        d = build_dspec(tag, 230.0, 0.04, True, 10.0, W[tag])
        rc, out = run(d)
        show(f"designSpec {tag} (bound 0.04; target W_shaft {W[tag]})", rc, out,
             [r"[Ii]nfeasible|reject|trial|line search|alpha|Armijo|step", r"massWithoutVolume|maxMassFraction",
              r"ERROR|converged|CONVERGED|did not converge|FAILED|DesignSpec"], 10)
        mm = re.findall(r'"W_shaft"\s*:\s*([0-9.eE+-]+)', out)
        print("    published W_shaft:", mm[:3])


TARGETS = {}


def main():
    probes = {k[2:]: v for k, v in globals().items() if k.startswith("p_") and callable(v)}
    for name, f in probes.items():
        if ONLY and name not in ONLY:
            continue
        print(f"===== {name}")
        f()


main()
