#!/usr/bin/env python3
"""rackett_alpha.py <repo-root> <scratch-dir> [stage]
Stage 1 (default): build+run a choupoProps case with referenceEoS saturation
ops at T, T+-0.5 K for methane/N2/CO2 (and water IAPWS95).  Stage 2: state ops
at p = 1.01 psat(T) (liquid branch) at T, T+-0.5 K, then tabulate alpha from
the reference equation (isobaric, and along saturation) against alpha from
closures::rackettVliq (src/thermo/DerivedClosures.H:65-72), which is the
T-dependence of the anchored-Rackett route (ThermoPackage.cpp:2481-2484: V =
Vliq * R(T)/R(VliqT), so dlnV/dT is the bare Rackett's; the anchor cancels)."""
import sys, os, json, subprocess, shutil, math
repo, scr = os.path.abspath(sys.argv[1]), sys.argv[2]
case = os.path.join(scr, "probe_rackett")
# record constants READ from data/standards/components/*.dat (Tc K, Pc bar, omega)
REC = {"CH4": (190.56, 45.99, 0.011), "N2": (126.20, 33.98, 0.039),
       "CO2": (304.13, 73.83, 0.225), "water": None, "_w": (647.14, 220.64, 0.3449), "NH3": (405.40, 113.59, 0.252)}
EQ = {"CH4": ("SetzmannWagner1991", 190.564, [0.60, 0.75, 0.90]),
      "N2":  ("Span2000", 126.192, [0.60, 0.75, 0.90]),
      "CO2": ("SpanWagner1996", 304.1282, [0.72, 0.75, 0.90]),   # Tr 0.6 = 182 K is below the triple point 216.592 K
      "water": ("IAPWS95", 647.096, None)}
WT = [298.15, 350.0, 450.0]
def temps(c):
    eq, Tc, trs = EQ[c]
    return [round(tr * Tc, 3) for tr in trs] if trs else WT
def run(ops):
    shutil.rmtree(case, ignore_errors=True)
    os.makedirs(case + "/system"); os.makedirs(case + "/constant")
    open(case + "/probe_rackett.cho", "w").close()
    open(case + "/system/controlDict", "w").write('application choupoProps;\ndescription "rackett alpha probe";\nverbosity 1;\n')
    open(case + "/constant/thermoPhysPropDict", "w").write("""recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( water );
equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } }
""")
    open(case + "/system/propsDict", "w").write("operations\n(\n" + "\n".join(ops) + "\n);\n")
    p = subprocess.run([os.path.join(repo, "choupoProps"), "."], cwd=case, capture_output=True, text=True, timeout=600)
    log = p.stdout + p.stderr
    open(os.path.join(case, "run.log"), "w").write(log)
    recs = {}
    for line in log.splitlines():
        line = line.strip().rstrip(",").strip()
        if line.startswith('{ "name"'):
            try: r = json.loads(line)
            except ValueError: continue
            if "diagnostics" in r: recs[r["name"]] = r["diagnostics"]
    if p.returncode != 0: print(log[-2000:]); sys.exit(1)
    return recs
nm = lambda *a: "_".join(str(x) for x in a).replace(".", "p").replace("-", "m")
ops = []
for c in EQ:
    for T in temps(c):
        for d in (-0.5, 0.0, 0.5):
            ops.append(f"  {{ name {nm('sat',c,T,d)}; type referenceEoS; equation {EQ[c][0]}; saturation {{ T {T+d} K; }} }}")
sat = run(ops)
ops = []
for c in EQ:
    for T in temps(c):
        p = 1.01 * sat[nm('sat',c,T,0.0)]["psat"]
        for d in (-0.5, 0.0, 0.5):
            ops.append(f"  {{ name {nm('iso',c,T,d)}; type referenceEoS; equation {EQ[c][0]}; state {{ T {T+d} K; p {p} Pa; branch liquid; }} }}")
iso = run(ops)
def rk(T, rec):
    Tc, Pc, om = rec
    Tr = T / Tc; Zra = 0.29056 - 0.08775 * om
    return (8.314462618 * Tc / (Pc * 1e5)) * Zra ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0))
def rackett_alpha(T, rec):
    return (rk(T + 0.5, rec) - rk(T - 0.5, rec)) / rk(T, rec)
# water's record Rackett alpha: data/standards/components/water.dat Tc 647.14, Pc/omega read below
rows = []
print(f"{'fluid':6s} {'T K':>8s} {'Tr':>5s} | {'a_ref,P':>9s} {'a_ref,sat':>9s} {'a_Rackett':>9s} | {'aT ref':>7s} {'aT Rk':>7s} | {'1-aT ref':>8s} {'1-aT Rk':>8s} | {'ratio Rk/ref':>12s}")
for c in EQ:
    for T in temps(c):
        rhoP = {d: iso[nm('iso',c,T,d)]["rho"] for d in (-0.5,0.0,0.5)}
        rhoS = {d: sat[nm('sat',c,T,d)]["rhoL"] for d in (-0.5,0.0,0.5)}
        aP = -(rhoP[0.5] - rhoP[-0.5]) / rhoP[0.0]
        aS = -(rhoS[0.5] - rhoS[-0.5]) / rhoS[0.0]
        rec = REC[c] if REC[c] else REC["_w"]
        aR = rackett_alpha(T, rec)
        Tr = T / rec[0]
        r = (1 - aR*T) / (1 - aP*T)
        rows.append((c, T, Tr, aP, aS, aR, aP*T, aR*T, 1-aP*T, 1-aR*T, r))
        print(f"{c:6s} {T:8.2f} {Tr:5.3f} | {aP:9.3e} {aS:9.3e} {aR:9.3e} | {aP*T:7.4f} {aR*T:7.4f} | {1-aP*T:8.4f} {1-aR*T:8.4f} | {r:12.3f}")
nh3 = REC["NH3"]
for T in (239.18, 253.15, 255.04):
    print(f"NH3 Rackett at T={T}: Tr={T/nh3[0]:.3f} alpha={rackett_alpha(T,nh3):.3e} aT={rackett_alpha(T,nh3)*T:.4f} 1-aT={1-rackett_alpha(T,nh3)*T:.4f}")
import csv
with open(os.path.join(scr, "rackett_alpha.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["fluid","T_K","Tr_record","alpha_ref_isobaric","alpha_ref_sat","alpha_rackett","aT_ref","aT_rackett","one_minus_aT_ref","one_minus_aT_rackett","ratio_rackett_over_ref"]); w.writerows(rows)
