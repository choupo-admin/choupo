#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""make_case -- a choupoBatch case around a mechanism already imported by
bin/curate/chemkin_to_choupo.py into CASE/constant/ (components/, reactions).

    make_case.py CASE --T 1200 --P 1 --mix "A:0.1,B:0.2,..." [--endTime 1e-3]
                 [--deltaT 1e-5] [--solver "integrator Rosenbrock23;"] [--energy gasConstantV]
                 [--sensitivity "factor 1.1; top 5; rise 400;"]

writes CASE/<name>.cho, system/controlDict, system/flowsheetDict (one adiabatic
batchReactor `bomb` over every imported reaction), constant/thermoPhysPropDict and
0/internalStates/bomb.  A TIMING harness: nothing here is a tutorial.
"""
import argparse
import re
from pathlib import Path

HDR = "/* written by docs/reviews/2026-11-21-large-mechanism/scripts/make_case.py */\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("--T", type=float, default=1200.0)
    ap.add_argument("--P", type=float, default=1.0, help="bar")
    ap.add_argument("--mix", required=True)
    ap.add_argument("--endTime", default="1e-3")
    ap.add_argument("--deltaT", default="1e-4")
    ap.add_argument("--solver", default="integrator Rosenbrock23;")
    ap.add_argument("--energy", default="gasConstantV")
    ap.add_argument("--sensitivity", default="")
    ap.add_argument("--totalMoles", default="5.0e-5")
    ap.add_argument("--trace", type=float, default=0.0,
                    help="mole fraction given to every species --mix leaves at zero")
    a = ap.parse_args()
    c = Path(a.case)
    comps = sorted(p.stem for p in (c / "constant/components").glob("*.dat"))
    rx = re.findall(r"^(\w+)\s*\n\{", (c / "constant/reactions").read_text(), re.M)
    mix = {}
    if a.mix.startswith("first:"):          # the first K synthetic species S0..S{K-1}, equal
        K = int(a.mix.split(":")[1])
        for k in range(K):
            name = next(n for n in comps if n.startswith(f"S{k}_"))
            mix[name] = 1.0
        a.mix = ""
    for kv in filter(None, a.mix.split(",")):
        k, v = kv.split(":")
        mix[k.strip()] = float(v)
    s = sum(mix.values())
    for k in mix:
        if k not in comps:
            raise SystemExit(f"--mix names {k}, not an imported species")
    (c / "system").mkdir(exist_ok=True)
    (c / "0/internalStates").mkdir(parents=True, exist_ok=True)
    (c / (c.name + ".cho")).write_text("")
    (c / "system/controlDict").write_text(HDR + f"""
application   choupoBatch;
description   "timing harness: {len(comps)} species, {len(rx)} reactions";
verbosity     1;
startTime     0;
endTime       {a.endTime};
deltaT        {a.deltaT};
writeInterval {a.deltaT};
""")
    sens = f"        sensitivity {{ {a.sensitivity} }}\n" if a.sensitivity else ""
    rlist = "\n".join("            " + " ".join(rx[k:k + 8]) for k in range(0, len(rx), 8))
    (c / "system/flowsheetDict").write_text(HDR + f"""
units
(
    {{
        name        bomb;
        type        batchReactor;
        operation   {{ mode adiabatic; energy {a.energy}; }}
        solver      {{ {a.solver} }}
{sens}        reactions
        (
{rlist}
        );
    }}
);
""")
    (c / "constant/thermoPhysPropDict").write_text(HDR + f"""
recordType    thermophysicalPropertySystem;
schemaVersion 1;
components    ( {' '.join(comps)} );
equilibrium
{{
    formulation gammaPhi;
    liquid {{ activityModel ideal; standardState pureLiquid; }}
    vapour {{ fugacityModel idealGas; }}
}}
""")
    tr = a.trace
    body = "\n".join(f"        {k} {(mix[k] / s * (1.0 - tr * (len(comps) - len(mix))) if k in mix else tr):.10g};"
                     for k in comps)
    vline = "" if a.energy == "gasConstantP" else \
        f"    V             {float(a.totalMoles) * 1000 * 8.314462618 * a.T / (a.P * 1e5):.10g};\n"
    (c / "0/internalStates/bomb").write_text(HDR + f"""
recordType  internalState;
unit        "bomb";
equipment   batchReactor;
holdup
{{
    T             {a.T} K;
    P             {a.P} bar;
{vline}    totalMoles    {a.totalMoles};
    molarComposition
    {{
{body}
    }}
}}
""")
    print(f"{c}: {len(comps)} species, {len(rx)} reactions")


if __name__ == "__main__":
    main()
