"""Catalogue thermo vs the LLNL (O Conaire 2004) thermo, species by species, and the
adiabatic constant-volume equilibrium end state under each thermo set.

usage: /usr/bin/python3 thermo_cmp.py CASE_DIR LLNL_DIR WORKDIR
  CASE_DIR  tutorials/batch/combustion/ignition04_h2air_sensitivity (local components first,
            then data/standards/components)
  LLNL_DIR  holds h2_v1a_therm.txt and h2_v1b_mech.txt (thirdParty, not in the repository)
Reads the engine's own records (NASA9 or `polynomial` Cp with dHf_298 and s_298, H = dHf +
int_298.15^T Cp, S = s_298 + int Cp/T, NASA9 split at Tcommon, extrapolated outside).
"""
import sys, os, re, subprocess, numpy as np, cantera as ct

case, llnl, work = sys.argv[1:4]
os.makedirs(work, exist_ok=True)
std = os.path.join(os.path.dirname(os.path.abspath(case)), "..", "..", "..", "data", "standards", "components")
std = os.path.normpath(os.path.join(case, "..", "..", "..", "..", "data", "standards", "components"))
R = 8.314462618
MAP = {"H2": "h2", "O2": "o2", "H": "h", "O": "o", "OH": "oh", "HO2": "ho2", "H2O2": "h2o2",
       "water": "h2o", "N2": "n2"}


def block(txt, name):
    m = re.search(r"^%s\s*\{(.*?)^\}" % name, txt, re.S | re.M)
    return m.group(1) if m else None


def nums(s):
    return [float(x) for x in re.findall(r"[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?", s)]


def load(sp):
    p = os.path.join(case, "constant", "components", sp + ".dat")
    src = "case"
    if not os.path.exists(p):
        p = os.path.join(std, sp + ".dat"); src = "standards"
    t = re.sub(r"//[^\n]*", "", open(p).read())
    st = block(t, "standardThermochemistry")
    dHf = float(re.search(r"dHf_298\s+([-\d.eE+]+)", st).group(1))
    s298 = float(re.search(r"s_298\s+([-\d.eE+]+)", st).group(1))
    cp = block(t, "idealGasHeatCapacity")
    model = re.search(r"model\s+(\w+)", cp).group(1)
    if model == "NASA9":
        low = nums(re.search(r"low\s*\(([^)]*)\)", cp).group(1))
        high = nums(re.search(r"high\s*\(([^)]*)\)", cp).group(1))
        Tc = float(re.search(r"Tcommon\s+([\d.]+)", cp).group(1))
        Tl = float(re.search(r"Tlow\s+([\d.]+)", cp).group(1))
        Th = float(re.search(r"Thigh\s+([\d.]+)", cp).group(1))
        # NASA9 7 coefficients a0..a6 (T^-2 .. T^4); a7,a8 added below
        return dict(src=src, model=model, dHf=dHf, s298=s298, low=low, high=high, Tc=Tc, rng=(Tl, Th))
    c = nums(re.search(r"coefficients\s*\(([^)]*)\)", cp).group(1))
    tr = nums(re.search(r"Trange\s*\(([^)]*)\)", cp).group(1))
    # J/mol/K polynomial c0 + c1 T + c2 T^2 + c3 T^3 as NASA9 a2..a5 (divide by R)
    a = [0.0, 0.0] + [x / R for x in c] + [0.0] * (7 - 2 - len(c))
    return dict(src=src, model="polynomial", dHf=dHf, s298=s298, low=a, high=a, Tc=1e9, rng=tuple(tr))


def cpR(a, T):
    return a[0] / T**2 + a[1] / T + a[2] + T * (a[3] + T * (a[4] + T * (a[5] + T * a[6])))


def hA(a, T):  # int cp/R dT
    return -a[0] / T + a[1] * np.log(T) + a[2] * T + a[3] * T**2 / 2 + a[4] * T**3 / 3 + a[5] * T**4 / 4 + a[6] * T**5 / 5


def sA(a, T):  # int cp/R / T dT
    return -a[0] / (2 * T**2) - a[1] / T + a[2] * np.log(T) + a[3] * T + a[4] * T**2 / 2 + a[5] * T**3 / 3 + a[6] * T**4 / 4


def hs(rec, T, Tref=298.15):
    """engine's H(T) (J/mol, formation datum) and S(T) (J/mol/K)"""
    lo, hi, Tc = rec["low"], rec["high"], rec["Tc"]
    def seg(f):
        if T <= Tc: return f(lo, T) - f(lo, Tref)
        return (f(lo, Tc) - f(lo, Tref)) + (f(hi, T) - f(hi, Tc))
    return rec["dHf"] + R * seg(hA), rec["s298"] + R * seg(sA)


def nasa9_yaml_entry(sp, rec):
    lo, hi, Tc = rec["low"], rec["high"], rec["Tc"]
    if Tc > 1e8: Tc = 1000.0   # single-range polynomial: split anywhere, continuity is exact
    # integration constants: H/R continuous, equal to dHf/R at 298.15 on the low range
    b1 = rec["dHf"] / R - hA(lo, 298.15)
    b2 = rec["s298"] / R - sA(lo, 298.15) - 0.0
    # S/R = sA + b2 (low); high continues at Tc
    h_Tc = hA(lo, Tc) + b1; s_Tc = sA(lo, Tc) + b2
    b1h = h_Tc - hA(hi, Tc); b2h = s_Tc - sA(hi, Tc)
    return ([float(x) for x in lo] + [float(b1), float(b2)], [float(x) for x in hi] + [float(b1h), float(b2h)], Tc)


def mkspecies(sp, rec):
    lo, hi, Tc = nasa9_yaml_entry(sp, rec)
    return lo, hi, Tc


# ---------------- reference: LLNL yaml via ck2yaml (REV lines removed, as the report says)
mech = open(os.path.join(llnl, "h2_v1b_mech.txt")).read().splitlines()
out, skip = [], False
for ln in mech:
    if re.match(r"\s*rev\s*/", ln, re.I): continue
    out.append(ln)
open(os.path.join(work, "mech_norev.txt"), "w").write("\n".join(out) + "\n")
subprocess.run([sys.executable, "-m", "cantera.ck2yaml", "--input=" + os.path.join(work, "mech_norev.txt"),
                "--thermo=" + os.path.join(llnl, "h2_v1a_therm.txt"), "--output=" + os.path.join(work, "norev.yaml"),
                "--permissive"], check=True, capture_output=True)
ref = ct.Solution(os.path.join(work, "norev.yaml"))

recs = {sp: load(sp) for sp in MAP}
print("records used:", {sp: (r["src"], r["model"], r["rng"]) for sp, r in recs.items()})

print("\n== h(T) [kJ/mol, formation datum]  engine | LLNL | diff     s(T) [J/mol/K] engine | LLNL | diff")
Ts = [300, 1000, 2000, 3000, 3500]
hrow = {}
for sp, nm in MAP.items():
    for T in Ts:
        ref.TP = T, ct.one_atm
        i = ref.species_index(nm)
        Hm = ref.standard_enthalpies_RT[i] * ct.gas_constant * T / 1e6  # J/kmol -> kJ/mol
        # Cantera: standard_* are at 1 atm in Cantera's convention (ref pressure of NASA = 1 atm for this file)
        Sm = ref.standard_entropies_R[i] * ct.gas_constant / 1e3
        he, se = hs(recs[sp], T)
        print("%-6s T=%5d  h %10.3f %10.3f %8.3f   s %9.3f %9.3f %7.3f" % (sp, T, he / 1e3, Hm, he / 1e3 - Hm, se, Sm, se - Sm))
    ref.TP = 298.15, ct.one_atm
    i = ref.species_index(nm)
    print("%-6s dHf298 engine %.3f  LLNL %.3f kJ/mol   s298 engine %.3f LLNL %.3f" % (
        sp, recs[sp]["dHf"] / 1e3, ref.standard_enthalpies_RT[i] * ct.gas_constant * 298.15 / 1e6,
        recs[sp]["s298"], ref.standard_entropies_R[i] * ct.gas_constant / 1e3))

# ---------------- catalogue thermo as a Cantera object (NASA9, species of the case, no reactions)
def yaml_for(recs_sel):
    sp_lines = []
    for sp, nm in MAP.items():
        r = recs_sel[sp]
        lo, hi, Tc = mkspecies(sp, r)
        comp = ref.species(nm).composition
        sp_lines.append("""- name: %s
  composition: %s
  thermo:
    model: NASA9
    temperature-ranges: [200.0, %r, 6000.0]
    data:
    - %s
    - %s""" % (nm, "{" + ", ".join("%s: %d" % (k, v) for k, v in comp.items()) + "}", Tc, list(lo), list(hi)))
        if Tc > 1e8:  # single range polynomial: duplicate over two ranges
            pass
    return "phases:\n- name: g\n  thermo: ideal-gas\n  species: [%s]\n  state: {T: 300, P: 1 atm}\nspecies:\n%s\n" % (
        ", ".join(MAP.values()), "\n".join(sp_lines))


def end_state(gas, label):
    n0 = 2.2157448e-5 * 1000.0  # mol
    gas.TPX = 1100.0, 2 * ct.one_atm, {"h2": 2.0, "o2": 1.0, "n2": 3.76}
    gas.equilibrate("UV")
    print("%-34s T_eq(UV) %.3f K  P %.1f bar  X: %s" % (label, gas.T, gas.P / 1e5,
          {k: float("%.4g" % v) for k, v in gas.mole_fraction_dict().items() if v > 1e-4}))
    return gas.T


print("\n== adiabatic constant-volume equilibrium, 1100 K, 2 atm, H2:O2:N2 = 2:1:3.76")
T_ref = end_state(ref, "LLNL thermo")
yml = os.path.join(work, "cat.yaml")
open(yml, "w").write(yaml_for(recs))
cat = ct.Solution(yml)
T_cat = end_state(cat, "catalogue thermo (case records)")
print("difference T: %.3f K" % (T_cat - T_ref))

# swap ONE species' record to the LLNL-equivalent? Not possible in the same form; instead swap each
# species of the LLNL set to the catalogue record, one at a time (the other nine LLNL), using NASA9 for it.
print("\n== one species at a time: LLNL thermo with ONE species replaced by the catalogue record")
for sp, nm in MAP.items():
    lines = ["phases:\n- name: g\n  thermo: ideal-gas\n  species: [%s]\n  state: {T: 300, P: 1 atm}\nspecies:" % ", ".join(MAP.values())]
    for sp2, nm2 in MAP.items():
        if sp2 == sp:
            lo, hi, Tc = mkspecies(sp, recs[sp])
            comp = ref.species(nm2).composition
            lines.append("- name: %s\n  composition: {%s}\n  thermo:\n    model: NASA9\n    temperature-ranges: [200.0, %r, 6000.0]\n    data:\n    - %s\n    - %s" % (
                nm2, ", ".join("%s: %d" % (k, v) for k, v in comp.items()), Tc, list(lo), list(hi)))
        else:
            # LLNL species: sample as NASA9 from the NASA-7 object by writing its own nasa7 block
            s = ref.species(nm2)
            tp = s.thermo
            c = [float(x) for x in tp.coeffs]  # [Tmid, high a1..a7, low a1..a7]
            comp = s.composition
            lines.append("- name: %s\n  composition: {%s}\n  thermo:\n    model: NASA7\n    temperature-ranges: [%r, %r, %r]\n    data:\n    - %s\n    - %s" % (
                nm2, ", ".join("%s: %d" % (k, v) for k, v in comp.items()), float(tp.min_temp), c[0], float(tp.max_temp), c[8:15], c[1:8]))
    f = os.path.join(work, "swap_%s.yaml" % sp)
    open(f, "w").write("\n".join(lines) + "\n")
    g = ct.Solution(f)
    g.TPX = 1100.0, 2 * ct.one_atm, {"h2": 2.0, "o2": 1.0, "n2": 3.76}
    g.equilibrate("UV")
    print("  %-5s replaced: T_eq %.3f K (%+.3f vs LLNL)" % (sp, g.T, g.T - T_ref))
