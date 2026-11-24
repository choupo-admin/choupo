#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""rrho_thermo -- ideal-gas thermochemistry of a molecule from its molecular
constants: rigid rotor, harmonic oscillator, electronic levels.

    bin/curate/rrho_thermo.py validate             # the tool against species the NASA report holds
    bin/curate/rrho_thermo.py records              # print the computed records (what the home holds)
    bin/curate/rrho_thermo.py write                # (re)write data/standards/thermoTables/RRHO-computed/
    bin/curate/rrho_thermo.py curve NAME [T ...]   # Cp, H-H298, S of one species at given T

WHY THIS EXISTS.  The Miller & Bowman (1989) mechanism uses nine species that
neither the NASA/TP-2002-211556 table nor any other open table of the tree
holds (NNH, ketene, singlet CH2, HCCCH, H2CN, HOCN, HCNO, n-C4H3, ethynol).
A glass box does not paste coefficients it cannot explain: here Cp(T) and
S(T) come from the textbook statistical-mechanics formulas below, the inputs
are a small reviewed file (rrho_species.json: one entry per species, every
number with its source), and the NASA polynomial the engine reads is a
least-squares fit to that curve, its error printed.  The tool is VALIDATED
(`validate`) on seven species whose published thermochemistry is the NASA
report's, from their own published constants, before it is trusted on a
species with none.

THE FORMULAS (ideal gas, T in K, standard pressure P0 = 1 bar, as the NASA
report; textbook: McQuarrie, Statistical Mechanics (1976), chapters 4-8, and
the JANAF Tables' introduction; the equations are written out, with their
derivation, in the Theory Guide section "Ideal-gas thermochemistry from
molecular constants" -- label sec:rrho-thermo.  Equation NUMBERS of the
textbooks are NOT quoted here: they were not checked against the books, only
the formulas against the seven validation species).

  translation   Cp/R = 5/2
                S/R  = 5/2 + ln[ (2 pi m k T / h^2)^(3/2) k T / P0 ]       (Sackur-Tetrode)
  rotation      linear:     Cp/R = 1,   S/R = 1 + ln[ T / (sigma Theta) ]
                nonlinear:  Cp/R = 3/2, S/R = 3/2 + ln[ sqrt(pi)/sigma * sqrt(T^3/(ThA ThB ThC)) ]
                Theta = h c B / k  (B in cm-1, rotational constant)
  vibration     per mode, x = h c nu / (k T):
                Cp/R = x^2 e^x / (e^x - 1)^2
                (H-H0)/(RT) = x / (e^x - 1)
                S/R  = x / (e^x - 1) - ln(1 - e^-x)
  electronic    levels (E_i in cm-1, g_i): q = sum g_i e^(-E_i/kT)
                <E> = sum g_i E_i e^(-E_i/kT) / q
                Cp/R = (<E^2> - <E>^2) / (kT)^2,   S/R = ln q + <E>/(kT)

WHAT IT DOES NOT DO (the stated approximations, each one a number the
input file may carry as `approximations`): no anharmonicity (observed
fundamentals are used as if harmonic, the usual JANAF practice, which
compensates part of it at low T and under-counts the high-T Cp), no
rotation-vibration coupling or centrifugal stretching, no hindered
internal rotation (a torsion is a harmonic mode), no electronic states
beyond the listed ones, nuclear spin entropy not included (the elements
reference makes it cancel, as in every table).  Cp at T above ~2000 K is
the weakest range.

THE NASA FIT.  Cp/R = a1/T^2 + a2/T + a3 + a4 T + a5 T^2 + a6 T^3 + a7 T^4
(NASA/TP-2002-211556 eq. (1), the `NASA9` form of the tree's records) on
200-1000 K (step 10 K) and 1000-6000 K (step 50 K), minimising the sum of
squared RELATIVE errors, solved EXACTLY (rational arithmetic on the normal
equations: no numpy, deterministic).  H(298.15) = dHf_298 and S(298.15) come
from the record's own fields, as for the NASA records; the fit carries only
Cp.  The worst relative Cp error of each interval is printed and written in
the record.
"""
import json
import math
import os
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INPUTS = HERE / "rrho_species.json"
HOME = ROOT / "data" / "standards" / "thermoTables" / "RRHO-computed"

# CODATA 2018 (exact SI values)
H_PLANCK = 6.62607015e-34
K_B = 1.380649e-23
C_CM = 2.99792458e10          # cm/s
N_A = 6.02214076e23
R = K_B * N_A                 # 8.314462618... J/(mol K)
P0 = 1.0e5                    # Pa, 1 bar
THETA_PER_CM = H_PLANCK * C_CM / K_B   # K per cm-1  (1.438776877)
T0 = 298.15
AMU = 1.0 / (N_A * 1000.0)    # kg per u (g/mol -> kg)

# standard atomic weights (IUPAC 2013 conventional values, as used by thermo tables)
ATOMIC_WEIGHT = {"H": 1.00794, "C": 12.0107, "N": 14.0067, "O": 15.9994}
ATOMIC_Z = {"H": 1, "C": 6, "N": 7, "O": 8}


def parse_formula(f):
    import re
    parts = re.findall(r"([A-Z][a-z]?)(\d*)", f)
    if "".join(a + b for a, b in parts) != f:
        raise SystemExit("rrho_thermo: cannot parse formula " + f)
    comp = {}
    for el, k in parts:
        comp[el] = comp.get(el, 0) + (int(k) if k else 1)
    return comp


def mass_u(formula):
    return sum(ATOMIC_WEIGHT[e] * n for e, n in parse_formula(formula).items())


def electrons(formula):
    return sum(ATOMIC_Z[e] * n for e, n in parse_formula(formula).items())


# ---------------------------------------------------------------- the model

def cp_s_h(sp, T):
    """Return (Cp, S, H-H0_vib_rot_trans_elec_at_T) in J/(mol K), J/(mol K), J/mol
    -- H is the thermal enthalpy above 0 K (no zero-point), used only for
    differences."""
    m = mass_u(sp["formula"]) * AMU
    cp = 2.5
    # Sackur-Tetrode
    lam = (2.0 * math.pi * m * K_B * T / H_PLANCK ** 2) ** 1.5
    s = 2.5 + math.log(lam * K_B * T / P0)
    h = 2.5 * T
    sigma = sp["sigma"]
    rot = sp["rotor"]
    if rot["kind"] == "linear":
        th = THETA_PER_CM * rot["B"]
        cp += 1.0
        s += 1.0 + math.log(T / (sigma * th))
        h += T
    elif rot["kind"] == "nonlinear":
        tha, thb, thc = (THETA_PER_CM * rot[k] for k in ("A", "B", "C"))
        cp += 1.5
        s += 1.5 + math.log(math.sqrt(math.pi) / sigma * math.sqrt(T ** 3 / (tha * thb * thc)))
        h += 1.5 * T
    elif rot["kind"] == "atom":
        pass
    else:
        raise SystemExit("rrho_thermo: rotor kind " + rot["kind"])
    for nu in sp["vib"]:
        x = THETA_PER_CM * nu / T
        ex = math.exp(-x)
        cp += x * x * ex / (1.0 - ex) ** 2
        s += x * ex / (1.0 - ex) - math.log(1.0 - ex)
        h += THETA_PER_CM * nu * ex / (1.0 - ex)
    lv = sp["electronic"]
    e0 = min(l[0] for l in lv)
    w = [g * math.exp(-THETA_PER_CM * (E - e0) / T) for E, g in lv]
    q = sum(w)
    eav = sum(wi * THETA_PER_CM * (E - e0) for wi, (E, g) in zip(w, lv)) / q   # kelvin
    e2 = sum(wi * (THETA_PER_CM * (E - e0)) ** 2 for wi, (E, g) in zip(w, lv)) / q
    cp += (e2 - eav ** 2) / T ** 2
    s += math.log(q) + eav / T
    h += eav
    return R * cp, R * s, R * h


def delta_h(sp, T):
    """H(T) - H(298.15 K), J/mol."""
    return cp_s_h(sp, T)[2] - cp_s_h(sp, T0)[2]


# ---------------------------------------------------------------- the fit

def basis(T):
    return [T ** -2, T ** -1, 1.0, T, T ** 2, T ** 3, T ** 4]


def solve_exact(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c and M[r][c] != 0:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]


def fit_interval(sp, lo, hi, step):
    """Weighted (1/Cp, relative) exact least squares of Cp/R on the 7-term basis."""
    Ts = []
    T = lo
    while T <= hi + 1e-9:
        Ts.append(float(T))
        T += step
    # scale columns so the exact arithmetic is on numbers of order 1
    scale = [Fraction(1)] * 7
    rows, rhs = [], []
    for T in Ts:
        cp = cp_s_h(sp, T)[0] / R
        w = Fraction(1.0 / cp)
        rows.append([w * Fraction(v) for v in basis(T)])
        rhs.append(w * Fraction(cp))
    A = [[sum(r[i] * r[j] for r in rows) for j in range(7)] for i in range(7)]
    bvec = [sum(r[i] * y for r, y in zip(rows, rhs)) for i in range(7)]
    a = solve_exact(A, bvec)
    a = [float(x) for x in a]
    worst, at = 0.0, lo
    for T in Ts:
        cp = cp_s_h(sp, T)[0] / R
        fit = sum(ai * bi for ai, bi in zip(a, basis(T)))
        e = abs(fit - cp) / cp
        if e > worst:
            worst, at = e, T
    return a, worst, at


def nasa_fit(sp):
    lo, e1, t1 = fit_interval(sp, 200.0, 1000.0, 10.0)
    hi, e2, t2 = fit_interval(sp, 1000.0, 6000.0, 50.0)
    return dict(low=lo, high=hi, err_low=e1, at_low=t1, err_high=e2, at_high=t2)


def nasa_cp(coef_low, coef_high, T):
    a = coef_low if T < 1000.0 else coef_high
    return R * sum(ai * bi for ai, bi in zip(a, basis(T)))


# ---------------------------------------------------------------- inputs

def load():
    with open(INPUTS, encoding="utf-8") as f:
        d = json.load(f)
    return d


def check_input(sp):
    for k in ("name", "formula", "sigma", "rotor", "vib", "electronic"):
        if k not in sp:
            raise SystemExit("rrho_thermo: %s: missing %s" % (sp.get("name", "?"), k))
    nat = sum(parse_formula(sp["formula"]).values())
    kind = sp["rotor"]["kind"]
    nvib = len(sp["vib"])
    want = {"atom": 0, "linear": 3 * nat - 5, "nonlinear": 3 * nat - 6}[kind]
    if nat == 2 and kind == "linear":
        want = 1
    if nvib != want:
        raise SystemExit("rrho_thermo: %s: %d vibrations listed, %d expected for a %s "
                         "molecule of %d atoms" % (sp["name"], nvib, want, kind, nat))


# ---------------------------------------------------------------- NASA reference

def nasa_record_reference(name):
    """S298 and the NASA coefficients of a table record of the tree (the NASA
    report's own, machine transcribed)."""
    p = ROOT / "data" / "standards" / "thermoTables" / "NASA-TP-2002-211556" / (name + ".dat")
    t = p.read_text()
    import re
    s = float(re.search(r"s_298\s+([-\d.]+);", t).group(1))
    lo = [float(x.replace("D", "e")) for x in re.search(r"\blow\s+\(([^)]*)\)", t).group(1).split()]
    hi = [float(x.replace("D", "e")) for x in re.search(r"\bhigh\s+\(([^)]*)\)", t).group(1).split()]
    return s, lo, hi


def report_reference(entry):
    """The same from the report PDF when a species is not a table record
    (H2O); needs thirdParty/nasa-tp2002 (fetch with nasa_tp2002_to_choupo.py --fetch)."""
    sys.path.insert(0, str(HERE))
    import nasa_tp2002_to_choupo as T
    lines = T.report_lines()
    ad, b1 = T.parse(lines)
    page = T.page_of(lines)
    c = T.checked(entry, ad, b1, page)
    return c["row"]["S"], c["ivs"][0]["a"], c["ivs"][1]["a"]


def validate(spec, verbose=True, need_report=True):
    """Return (rows, ok).  Acceptance (the brief): S298 within 1 J/(mol K) of
    the reference and Cp within 2 % from 300 to 1500 K; larger deviations
    above are reported, not failed."""
    rows, ok = [], True
    for sp in spec["validation"]:
        check_input(sp)
        ref = sp["reference"]
        if ref["kind"] == "table":
            s_ref, lo, hi = nasa_record_reference(ref["entry"])
        else:
            if not (ROOT / "thirdParty/nasa-tp2002/NASA-TP-2002-211556.pdf").is_file():
                if need_report:
                    raise SystemExit("rrho_thermo: validation of %s needs the NASA report "
                                     "(nasa_tp2002_to_choupo.py --fetch)" % sp["name"])
                continue
            s_ref, lo, hi = report_reference(ref["entry"])
        s_tool = cp_s_h(sp, T0)[1]
        worst, at = 0.0, 300.0
        worst_hi, at_hi = 0.0, 1500.0
        T = 300.0
        while T <= 3000.0 + 1e-9:
            c_ref = nasa_cp(lo, hi, T)
            c_tool = cp_s_h(sp, T)[0]
            e = (c_tool - c_ref) / c_ref
            if T <= 1500.0:
                if abs(e) > abs(worst):
                    worst, at = e, T
            elif abs(e) > abs(worst_hi):
                worst_hi, at_hi = e, T
            T += 50.0
        row = dict(name=sp["name"], s_tool=s_tool, s_ref=s_ref,
                   cp298_tool=cp_s_h(sp, T0)[0], cp298_ref=nasa_cp(lo, hi, T0),
                   worst=worst, at=at, worst_hi=worst_hi, at_hi=at_hi,
                   cp1500_tool=cp_s_h(sp, 1500.0)[0], cp1500_ref=nasa_cp(lo, hi, 1500.0))
        row["ok"] = abs(s_tool - s_ref) <= 1.0 and abs(worst) <= 0.02
        ok = ok and row["ok"]
        rows.append(row)
    if verbose:
        print("%-8s %9s %9s %7s | %9s %9s | %9s %5s | %9s %5s" %
              ("species", "S298tool", "S298ref", "dS", "Cp298t", "Cp298r", "maxdCp%", "atT", "dCp%>1500", "atT"))
        for r in rows:
            print("%-8s %9.3f %9.3f %+7.3f | %9.3f %9.3f | %+9.2f %5.0f | %+9.2f %5.0f  %s" %
                  (r["name"], r["s_tool"], r["s_ref"], r["s_tool"] - r["s_ref"],
                   r["cp298_tool"], r["cp298_ref"], 100 * r["worst"], r["at"],
                   100 * r["worst_hi"], r["at_hi"], "ok" if r["ok"] else "OUT"))
    return rows, ok


# ---------------------------------------------------------------- records

def fmt9(x):
    return "%.9e" % x



PYSCF_DOI = "10.1063/5.0006074"      # Sun et al., Recent developments in the PySCF program package, J. Chem. Phys. 153, 024109 (2020)


def inputs_block(sp, indent):
    """The `inputs ( {...} )` list origin `derived` requires (check_origin_census):
    every constant the computation reads, with its value, unit, its source kind
    (measured/derived/calculated) and a DOI -- the database's for a measured
    value, PySCF's for a calculated one."""
    pad = " " * indent
    mdoi = sp.get("measured_doi", "10.18434/T4D303")

    def item(q, v, unit, kind, extra=""):
        doi = PYSCF_DOI if kind.startswith("calc") else mdoi
        return '%s    { quantity "%s (%s)"; value %s; unit %s; doi "%s"; }' % (pad, q, kind, v, unit, doi)
    L = [pad + "inputs", pad + "("]
    for i, (nu, src) in enumerate(zip(sp["vib"], sp.get("vib_source", ["?"] * len(sp["vib"])))):
        L.append(item("vibrational wavenumber %d" % (i + 1), "%g" % nu, "cm-1", src))
    rot = sp["rotor"]
    rsrc = sp.get("rot_source", "?")
    for k in ("A", "B", "C"):
        if k in rot:
            L.append(item("rotational constant " + k, "%g" % rot[k], "cm-1", rsrc))
    L.append(item("rotational symmetry number", "%d" % sp["sigma"], "1", "point group of the cited structure"))
    for j, (E, g) in enumerate(sp["electronic"]):
        L.append(item("electronic level %d energy" % (j + 1), "%g" % E, "cm-1", "cited state table"))
        L.append(item("electronic level %d degeneracy" % (j + 1), "%d" % g, "1", "cited state table"))
    L.append(pad + ");")
    return L


def record_text(sp, spec):
    """The text of data/standards/thermoTables/RRHO-computed/<name>.dat."""
    check_input(sp)
    fit = nasa_fit(sp)
    s298 = cp_s_h(sp, T0)[1]
    dhf = sp["dHf_298"]["value_kJ"] * 1000.0
    mw = mass_u(sp["formula"])
    role = role_of(sp)
    nm = sp["name"]
    cp298 = cp_s_h(sp, T0)[0]
    cp1500 = cp_s_h(sp, 1500.0)[0]
    L = []
    L.append("/*--------------------------------*- Choupo -*-----------------------*\\")
    L.append("  Species %s (%s): ideal-gas thermochemistry COMPUTED from molecular" % (nm, sp["description"]))
    L.append("  constants by bin/curate/rrho_thermo.py (rigid rotor, harmonic")
    L.append("  oscillator, electronic levels) from the inputs of bin/curate/rrho_species.json,")
    L.append("  anchored to a cited enthalpy of formation.  NOT a transcription of a")
    L.append("  published table: the NASA/TP-2002-211556 report holds no entry for it.")
    L.append("  Re-run `bin/curate/rrho_thermo.py write`; the gate check_rrho_thermo holds this")
    L.append("  file equal to the tool's output.")
    L.append("\\*---------------------------------------------------------------------------*/")
    L.append("name           %s;" % nm)
    L.append("formula        %s;" % sp["formula"])
    L.append("CAS            %s;" % sp.get("CAS", "n/a"))
    L.append("MW             %.5f;       // kg/kmol, standard atomic weights" % mw)
    L.append("role           %s;       // %s" % (role[0], role[1]))
    L.append("tags           ( gasPhase thermoTable rrhoComputed );")
    L.append("reviewStatus   interim;")
    L.append('reviewReason   "computed by bin/curate/rrho_thermo.py from molecular constants (inputs and sources in bin/curate/rrho_species.json); not read back against the cited papers by a curator"; ')
    L.append("standardThermochemistry")
    L.append("{")
    L.append("    dHf_298    %.3f;   // J/mol  -- ideal gas; %s" % (dhf, sp["dHf_298"]["source_short"]))
    L.append("    s_298      %.3f;     // J/(mol K) -- RRHO at 298.15 K, P0 = 1 bar (rrho_thermo.py)" % s298)
    L.append("}")
    L.append("")
    L.append("idealGasHeatCapacity")
    L.append("{")
    L.append("    //  Cp/R = a1/T^2 + a2/T + a3 + a4 T + a5 T^2 + a6 T^3 + a7 T^4 (NASA9 form, as the")
    L.append("    //  NASA/TP-2002-211556 records), LEAST-SQUARES FIT to the RRHO Cp(T) curve of")
    L.append("    //  rrho_thermo.py on 200-1000 K (10 K) and 1000-6000 K (50 K).")
    L.append("    //  Worst relative Cp error of the fit: %.2e at %g K (low), %.2e at %g K (high)." %
             (fit["err_low"], fit["at_low"], fit["err_high"], fit["at_high"]))
    L.append("    model    NASA9;")
    L.append("    Tlow     200;")
    L.append("    Tcommon  1000;")
    L.append("    Thigh    6000;")
    L.append("    low      ( " + " ".join(fmt9(x) for x in fit["low"]) + " );")
    L.append("    high     ( " + " ".join(fmt9(x) for x in fit["high"]) + " );")
    L.append("}")
    L.append("")
    L.append("provenance")
    L.append("{")
    L.append("    dHf_298")
    L.append("    {")
    L.append("        origin        %s;" % sp["dHf_298"].get("origin", "literature"))
    L.append('        method        "%s";' % sp["dHf_298"]["method"])
    L.append('        methodVersion "%s";' % sp["dHf_298"]["version"])
    # A dHf DERIVED from a printed 0 K value names that value as its input
    # (check_origin_census (d); found at the C335 integration, 2026-11-24).
    if sp["dHf_298"].get("inputs"):
        L.append("        inputs")
        L.append("        (")
        for x in sp["dHf_298"]["inputs"]:
            L.append('            { quantity "%s"; value %s; unit %s; doi "%s"; }'
                     % (x["quantity"], x["value"], x["unit"], x["doi"]))
        L.append("        );")
    L.append('        uncertainty   "%s";' % sp["dHf_298"]["uncertainty"])
    L.append('        notes         "%s";' % sp["dHf_298"]["notes"])
    L.append("    }")
    L.append("    s_298")
    L.append("    {")
    L.append("        origin        derived;")
    L.append('        method        "RRHO from molecular constants via bin/curate/rrho_thermo.py with the inputs of bin/curate/rrho_species.json (Sackur-Tetrode translation, rigid rotor, harmonic oscillator, electronic levels), 1 bar";')
    L.append('        methodVersion "rrho_thermo.py rrho_species.json";')
    L += inputs_block(sp, 8)
    L.append('        uncertainty   "%s";' % sp["uncertainty_S"])
    L.append('        notes         "constants: %s";' % sp["constants_source"])
    L.append("    }")
    L.append("    idealGasHeatCapacity")
    L.append("    {")
    L.append("        origin        derived;")
    L.append('        method        "RRHO from molecular constants via bin/curate/rrho_thermo.py with the inputs of bin/curate/rrho_species.json, then a 7-term NASA9 least-squares fit (200-1000 K and 1000-6000 K)";')
    L.append('        methodVersion "rrho_thermo.py rrho_species.json";')
    L += inputs_block(sp, 8)
    L.append('        uncertainty   "%s";' % sp["uncertainty_Cp"])
    L.append('        notes         "Cp(298.15) = %.3f, Cp(1500) = %.3f J/(mol K) from the RRHO curve; fit error %.1e (<1000 K) and %.1e (>=1000 K), relative. Approximations: %s";' %
             (cp298, cp1500, fit["err_low"], fit["err_high"], sp["approximations"]))
    L.append("    }")
    L.append('    source   "%s";' % sp["source"])
    L.append("    licence  publicDomain;    // inputs: NIST (US government) data and published spectroscopy; the computation is Choupo's own")
    L.append("}")
    return "\n".join(L) + "\n"


def role_of(sp):
    """gasOnly for a radical (odd electron count) or a listed biradical/
    transient; gasData for a closed-shell molecule (the gas-only slice's rule,
    DEV.md 4c C458, docs/ai/components.md)."""
    if electrons(sp["formula"]) % 2 == 1:
        return "gasOnly", "free radical (odd electron count)"
    if sp.get("biradical"):
        return "gasOnly", "listed biradical or transient: " + sp["biradical"]
    return "gasData", "closed-shell molecule: ideal-gas data only, no liquid model"


def write_all(spec):
    HOME.mkdir(parents=True, exist_ok=True)
    names = []
    for sp in spec["records"]:
        (HOME / (sp["name"] + ".dat")).write_text(record_text(sp, spec))
        names.append(sp["name"])
    idx = ["# RRHO-computed species table", "",
           "Ideal-gas records COMPUTED from molecular constants by",
           "`bin/curate/rrho_thermo.py` (rigid rotor + harmonic oscillator + electronic",
           "levels), inputs in `bin/curate/rrho_species.json`, each anchored to a cited",
           "enthalpy of formation.  A case reads them with",
           "`speciesTables ( NASA-TP-2002-211556 RRHO-computed );`.  Written by the tool,",
           "held equal to its output by `bin/curate/check_rrho_thermo.py`.", "",
           "## written", ""]
    idx += ["- " + n for n in names]
    (HOME / "INDEX.md").write_text("\n".join(idx) + "\n")
    return names


def main(argv):
    spec = load()
    cmd = argv[1] if len(argv) > 1 else "validate"
    if cmd == "validate":
        _, ok = validate(spec)
        return 0 if ok else 1
    if cmd == "records":
        for sp in spec["records"]:
            print(record_text(sp, spec))
        return 0
    if cmd == "write":
        print("wrote", ", ".join(write_all(spec)))
        return 0
    if cmd == "curve":
        sp = next(s for s in spec["records"] + spec["validation"] if s["name"] == argv[2])
        Ts = [float(x) for x in argv[3:]] or [298.15, 500, 1000, 1500, 2000, 3000]
        for T in Ts:
            cp, s, _ = cp_s_h(sp, T)
            print("T %7.1f  Cp %8.3f  S %8.3f  H-H298 %10.1f" % (T, cp, s, delta_h(sp, T)))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
