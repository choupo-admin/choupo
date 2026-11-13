#!/usr/bin/env python3
"""Evaluate today's engine liquid density at declared states, through the
existing property operation `propertyScan1D` with `rho_liquid_<component>`
(PropertyEvaluator.cpp: ThermoPackage::density, liquid branch) on a SCRATCH
case built here from the shipped component records.  Nothing in the tree is
edited and no shipped case is touched.

A pure-component key only: for a mixture the engine's liquid density is the
mole-weighted molar volume of the pure ones (ThermoPackage.cpp, step (3) of
`density`), and `mixture_rho` combines the engine's own pure values the same
way.  The combination is itself checked against the engine in the baseline
notes (a flowsheet pump is NOT used: it reads Vliq flat, Pump.cpp:88-128).

Environment: CHOUPO_BIN (choupoProps), CHOUPO_HOME (the tree whose component
records are copied), CHOUPO_SCRATCH (a writable directory).
"""
import csv, os, re, shutil, subprocess, tempfile

HOME = os.environ.get("CHOUPO_HOME", "/home/vitor/Choupo")
BIN = os.environ.get("CHOUPO_BIN", "/home/vitor/Choupo/choupoProps")
SCRATCH = os.environ.get("CHOUPO_SCRATCH", tempfile.gettempdir())

CONTROL = """application choupoProps;
description "density pilot baseline scratch case";
verbosity 3;
"""

THERMO = """recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( %(comps)s );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
%(pure)s
"""


def mw_of(name):
    txt = open(os.path.join(HOME, "data/standards/components", name + ".dat")).read()
    m = re.search(r"^\s*MW\s+([0-9.eE+-]+)\s*;", txt, re.M)
    return float(m.group(1))


def make_case(tag, comps, pure_block="", extra_dirs=()):
    d = os.path.join(SCRATCH, "densityPilot_" + tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "system"))
    os.makedirs(os.path.join(d, "constant/components"))
    for c in comps:
        shutil.copy(os.path.join(HOME, "data/standards/components", c + ".dat"),
                    os.path.join(d, "constant/components", c + ".dat"))
    for rel in extra_dirs:
        dst = os.path.join(d, "constant", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copytree(os.path.join(HOME, "data/standards", rel), dst)
    open(os.path.join(d, "system/controlDict"), "w").write(CONTROL)
    open(os.path.join(d, "constant/thermoPhysPropDict"), "w").write(
        THERMO % dict(comps=" ".join(comps), pure=pure_block))
    open(os.path.join(d, tag + ".cho"), "w").write("")
    return d


def scan(d, groups, comp, composition=None, prop=None):
    """groups: list of (P_Pa, [T_K ...]).  Returns {(T, P): rho or None}, log text."""
    comp_txt = " ".join(f"{k} {v};" for k, v in (composition or {comp: 1.0}).items())
    ops = []
    for i, (P, Ts) in enumerate(groups):
        ops.append(f"""    {{
        name g{i};
        type propertyScan1D;
        vary {{ variable T; points ( {' '.join(repr(float(t)) for t in Ts)} ); }}
        state {{ P {P!r} Pa; composition {{ {comp_txt} }} }}
        properties ( {prop or 'rho_liquid_' + comp} );
        output {{ file "g{i}.csv"; }}
    }}""")
    open(os.path.join(d, "system/propsDict"), "w").write("operations\n(\n" + "\n".join(ops) + "\n);\n")
    r = subprocess.run([BIN, d], capture_output=True, text=True)
    log = r.stdout + r.stderr
    out = {}
    for i, (P, Ts) in enumerate(groups):
        f = os.path.join(d, f"g{i}.csv")
        if not os.path.exists(f):
            for T in Ts:
                out[(T, P)] = None
            continue
        rows = list(csv.reader(open(f)))[1:]
        for T, row in zip(Ts, rows):
            v = float(row[1])
            out[(T, P)] = None if v != v else v
    return out, log


def mixture_rho(rho_pure, mw, x):
    """Ideal mixing of volumes from the engine's pure densities; x mole fractions."""
    Mbar = sum(x[k] * mw[k] for k in x)
    V = sum(x[k] * mw[k] / rho_pure[k] for k in x)
    return Mbar / V
