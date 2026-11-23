#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the methane-assembly ladder under tutorials/batch/combustion/ (C458, the methane lesson).

Seven cases, one Petersen, Davidson & Hanson 1999 shock-tube point (mixture 2, 3 CH4 + 2 O2 + 10 N2,
114.4 atm, 1244 K, measured 254 us, Table 2 p. 86), the same vessel in each, and ONLY the reaction
sets change -- the student reads the mechanism grow:

  methane01_h2o2_core         OConaire2004                                   (the H2/O2 core alone)
  methane02_ch4_attack        + MB1989_attack                                (CH4 -> CH3)
  methane03_methyl            + MB1989_methyl                                (CH3 -> CH2O)
  methane04_formyl            + MB1989_formyl                                (CH2O -> HCO -> CO)
  methane05_c1_chain          + MB1989_carbonMonoxide                        (CO -> CO2; the C1 chain)
  methane06_assembled         + MB1989_ethane = MillerBowman1989             (two CH3 -> ethane)
  methane07_sensitivity       methane06 with `sensitivity { response tauIgnition; ... }`

The reaction labels are the records' own aliases within their sets (the paper's numbers).
usage: build_cases.py [--point T P_atm]   (default the point above)
"""
import glob
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
KIN = os.path.join(ROOT, "data", "standards", "kinetics")
COMB = os.path.join(ROOT, "tutorials", "batch", "combustion")
R = 8314.462618  # J/(kmol K)

HEADER = """/*--------------------------------*- Choupo -*--------------------------------*\\
|       \\|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\\\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\\\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\\\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \\|/    P roperties    |  Tutorial case file -- part of Choupo         |
|        |     O ptimization  |                                               |
\\*-----------------------------------------------------------------------------*/
"""

COMPONENTS = "H2 O2 H O OH HO2 H2O2 water N2 CH4 CH3 CH2 HCHO HCO CO CO2 CH3O ethane C2H5 ethylene".split()
LOCAL = {  # the case-local NASA-9 thermo (flame range) copied from the cases that already carry it
    "H2": "ignition04_h2air_sensitivity", "N2": "ignition04_h2air_sensitivity",
    "O2": "ignition04_h2air_sensitivity", "water": "ignition04_h2air_sensitivity",
    "CH4": "nox03_millerbowman_large", "CO": "nox03_millerbowman_large",
    "CO2": "nox03_millerbowman_large", "HCHO": "nox03_millerbowman_large",
    "ethane": "nox03_millerbowman_large", "ethylene": "nox03_millerbowman_large",
}
MIX = {"CH4": 3.0 / 15, "O2": 2.0 / 15, "N2": 10.0 / 15}   # Petersen Table 1, mixture 2

CASES = [
    ("methane01_h2o2_core", ["OConaire2004"],
     "the H2/O2 core ALONE: methane is a spectator, nothing starts"),
    ("methane02_ch4_attack", ["OConaire2004", "MB1989_attack"],
     "+ the attack on CH4: CH3 appears, and has nowhere to go"),
    ("methane03_methyl", ["OConaire2004", "MB1989_attack", "MB1989_methyl"],
     "+ the methyl step: CH3 -> CH3O -> CH2O"),
    ("methane04_formyl", ["OConaire2004", "MB1989_attack", "MB1989_methyl", "MB1989_formyl"],
     "+ CH2O -> HCO -> CO (and CH2): the carbon reaches CO, not yet CO2"),
    ("methane05_c1_chain", ["OConaire2004", "MB1989_attack", "MB1989_methyl", "MB1989_formyl",
                            "MB1989_carbonMonoxide"],
     "+ CO -> CO2: the whole C1 chain, from CH4 to CO2"),
    ("methane06_assembled", ["OConaire2004", "MillerBowman1989"],
     "+ the ethane route (two CH3 recombine): the assembled mechanism"),
    ("methane07_sensitivity", ["OConaire2004", "MillerBowman1989"],
     "the assembled mechanism with the sensitivity of the ignition delay to every reaction"),
]


def labels(setname):
    """(label, file) of every record of a set, in the order of the paper's numbers."""
    out = []
    for f in sorted(glob.glob(os.path.join(KIN, "*.dat"))):
        t = open(f).read()
        m = re.search(r"^sets\s*\{([^}]*)\}", t, re.M)
        if not m:
            continue
        for sname, lab in re.findall(r"(\w+)\s+(\w+);", m.group(1)):
            if sname == setname:
                out.append(lab)
    def key(l):
        m = re.match(r"([A-Za-z]+)(\d+)(\w*)", l)
        return (m.group(1) if m else l, int(m.group(2)) if m else 0, m.group(3) if m else "")
    return sorted(out, key=key)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


README = {
    "methane01_h2o2_core": (
        "the hydrogen and oxygen core ALONE, on a methane mixture",
        "The vessel holds methane, oxygen and nitrogen behind a reflected shock (Petersen, Davidson and Hanson 1999, "
        "Table 1 mixture 2, the point of Table 2 page 86: 1244 K, 114.4 atm, measured delay 254 us).  The only "
        "reactions are the 21 records of the OConaire2004 set, none of which names a carbon species: the "
        "methane is a spectator, the temperature does not move, and the engine prints no ignition delay.  "
        "A mechanism is not a mixture."),
    "methane02_ch4_attack": (
        "+ the attack on methane: CH3 appears and has nowhere to go",
        "The same vessel with five records of Miller and Bowman 1989 Appendix A (reactions 3, 4, 5, 5a, 6: CH4 attacked by "
        "O2, H, OH, O and HO2) added to the core.  A trace of CH3 appears and nothing consumes it: the "
        "temperature barely moves and there is no ignition."),
    "methane03_methyl": (
        "+ the methyl step: the branching opens, the ignition is far too early",
        "Twelve more records: CH3 with O2 (a chain branching), O, HO2 and H, and CH3O to formaldehyde.  The "
        "mixture ignites, at a small fraction of the measured delay, and the carbon stops at formaldehyde.  A "
        "mechanism can ignite for the wrong reasons."),
    "methane04_formyl": (
        "+ formaldehyde, HCO and CH2 to CO",
        "Eighteen more records take formaldehyde through HCO to carbon monoxide and oxidise the CH2 of the "
        "methyl step.  The ignition delay hardly moves (it was decided by the branching) and the final "
        "temperature rises."),
    "methane05_c1_chain": (
        "+ CO to CO2: the whole C1 chain",
        "Four more records turn CO into CO2, where most of the heat is released.  The C1 chain is complete, "
        "from CH4 to CO2, and the delay is still far too short."),
    "methane06_assembled": (
        "+ two CH3 make ethane: the assembled mechanism",
        "Seven records of the ethane route (2CH3(+M) = C2H6(+M) with its Troe fall-off, and the attack on "
        "ethane) join the chain.  At this pressure the recombination of two methyl radicals dominates, the "
        "ignition delay grows by about an order of magnitude, and it lands near the measurement.  This is the "
        "set MillerBowman1989 (46 of the 235 reactions of Appendix A) beside the 21 of the OConaire2004 core."),
    "methane07_sensitivity": (
        "the assembled mechanism and the sensitivity of the delay to each rate constant",
        "methane06 with `sensitivity { response tauIgnition; factor 1.1; reactions all; top 8; }`: the engine "
        "integrates the vessel once per reaction with that reaction's net rate multiplied and prints "
        "S_j = d ln tau / d ln k_j.  Two reactions of the methyl radical head the table with opposite signs: the "
        "branching CH3 + O2 = CH3O + O (A8, negative) and the recombination of two CH3 (A1, positive)."),
}


def write_readme(name, T, P_atm):
    what, text = README[name]
    write(os.path.join(COMB, name, "README.md"),
          "# %s -- %s\n\n%s\n\n"
          "Run it:\n\n```\nrunCase tutorials/batch/combustion/%s\n```\n\n"
          "The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and "
          "methane07 adds the sensitivity.  The EduTool `methane-assembly` (\"Assemble methane combustion\") runs "
          "them in the browser.  The constants of the carbon records are ONE mechanism's values "
          "(Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, "
          "Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.\n"
          % (name, what, text, name))


def build(name, sets, what, T, P_atm):
    d = os.path.join(COMB, name)
    n = P_atm * 101325.0 * 1.0e-3 / (R * T)           # kmol in 1 litre
    rx = []
    for s in sets:
        rx += labels(s)
    chunks = ["            " + "  ".join(rx[i:i + 6]) for i in range(0, len(rx), 6)]
    sens = ""
    if name.endswith("sensitivity"):
        sens = ("        sensitivity\n        {\n            response    tauIgnition;    // time T first exceeds T0 + rise\n"
                "            factor      1.1;            // k_j -> 1.1 k_j, one reaction at a time (forward and reverse)\n"
                "            reactions   all;\n            top         8;\n        }\n")
    write(os.path.join(d, name + ".cho"), "")
    write(os.path.join(d, "system", "controlDict"), HEADER + """/*---------------------------------------------------------------------------*\\
  %(n)s / controlDict
  %(what)s.
\\*---------------------------------------------------------------------------*/
application   choupoBatch;
description   "%(what)s (Petersen, Davidson & Hanson 1999, mixture 2, %(T)g K, %(P)g atm)";
verbosity     3;

startTime       0.0;
endTime         1.2e-3;      // s
deltaT          2.0e-6;      // s (the integrator is adaptive; this is the write grid)
writeInterval   2.0e-6;      // s -- 600 state directories
""" % dict(n=name, what=what, T=T, P=P_atm))
    write(os.path.join(d, "system", "flowsheetDict"), HEADER + """/*---------------------------------------------------------------------------*\\
  %(n)s / flowsheetDict -- ONE adiabatic constant-volume vessel, the sets of constant/reactions.
  %(what)s.
  Sets read: %(sets)s.
\\*---------------------------------------------------------------------------*/
units
(
    {
        name        vessel;
        type        batchReactor;
        operation   { mode adiabatic; energy gasConstantV; }
        solver      { integrator Rosenbrock23; jacobian analytic; verbosity 3; }
%(sens)s        reactions
        (
%(rx)s
        );
    }
);
""" % dict(n=name, what=what, sets=", ".join(sets), sens=sens, rx="\n".join(chunks)))
    write(os.path.join(d, "constant", "reactions"), HEADER + """/*---------------------------------------------------------------------------*\\
  %(n)s / reactions -- READ FROM THE KINETICS LIBRARY (data/standards/kinetics/).
  %(what)s.
  The H2/O2 core is O Conaire et al. 2004 (Int. J. Chem. Kinet. 36, 603, Table I); the carbon chain is
  Miller & Bowman 1989 (Prog. Energy Combust. Sci. 15, 287, Appendix A, pp. 331-332), every record with its
  page.  They are ONE mechanism's values, not evaluated constants (Baulch et al. 2005, Tsang & Hampson 1986
  are the evaluated sources and are not yet transcribed in this tree).  Reverse rates from equilibrium.
\\*-----------------------------------------------------------------------------*/

provenance
{
    status  "CURATED -- reaction sets of the kinetics library: %(sets)s";
    review  { state transcribed; reviewer "session 2026-11-22 (library records held to the page tables by check_kinetics_library)"; }
    kinetics_source  "data/standards/kinetics/ sets %(sets)s";
    thermo_source    "case-local NASA-9 (NASA/TP-2002-211556) for the stable species; the NASA table for the radicals";
}

reactionSets ( %(setlist)s );
""" % dict(n=name, what=what, sets=", ".join(sets), setlist=" ".join(sets)))
    write(os.path.join(d, "constant", "thermoPhysPropDict"), HEADER + """/*---------------------------------------------------------------------------*\\
  thermoPhysPropDict (v2) -- ideal gas, ONE thermochemistry per run.  The stable species carry the
  case-local NASA-9 of the flame range (constant/components/), the radicals come from the NASA/TP-2002-211556
  table (GAS-ONLY species, DEV.md 4c C458).
\\*---------------------------------------------------------------------------*/

recordType    thermophysicalPropertySystem;
schemaVersion 1;

components       ( %(c)s );

speciesTables ( NASA-TP-2002-211556 );

equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel ideal;
        standardState pureLiquid;
    }

    vapour
    {
        fugacityModel idealGas;
    }
}
""" % dict(c=" ".join(COMPONENTS)))
    os.makedirs(os.path.join(d, "constant", "components"), exist_ok=True)
    for sp, src in LOCAL.items():
        shutil.copyfile(os.path.join(COMB, src, "constant", "components", sp + ".dat"),
                        os.path.join(d, "constant", "components", sp + ".dat"))
    comp = ["        %s %s;" % (sp, ("%.6f" % MIX[sp]) if sp in MIX else "0.0") for sp in COMPONENTS]
    write(os.path.join(d, "0", "internalStates", "vessel"), """/*--------------------------------*- Choupo -*----------------------------------*\\
  %(n)s, 0/internalStates/vessel -- the initial HOLDUP of 'vessel'.  Petersen, Davidson & Hanson, J. Propulsion and
  Power 15 (1999) 82-91, Table 1 mixture 2 (3 CH4 + 2 O2 + 10 N2) at the point of Table 2 (p. 86):
  T5 = %(T)g K, P5 = %(P)g atm, measured ignition delay 254 us.  n = PV/(RT) exactly, V = 1 litre.
\\*-----------------------------------------------------------------------------*/

recordType  internalState;

unit        "vessel";
equipment   batchReactor;

holdup
{
    T            %(T)g K;
    P            %(P)g atm;
    V            0.001;                // m3
    totalMoles   %(nm).8e;      // kmol
    molarComposition
    {
%(comp)s
    }
}
""" % dict(n=name, T=T, P=P_atm, nm=n, comp="\n".join(comp)))
    write_readme(name, T, P_atm)
    print(name, len(rx), "reactions")


if __name__ == "__main__":
    T, P = 1244.0, 114.4
    if "--point" in sys.argv:
        i = sys.argv.index("--point")
        T, P = float(sys.argv[i + 1]), float(sys.argv[i + 2])
    for name, sets, what in CASES:
        build(name, sets, what, T, P)
