#!/usr/bin/env python3
"""Probe: a PURE IF97 water inlet placed just below, on and just above p_sat(T),
sent through each single-process-inlet unit type that prices it.

    python3 probe_saturation_line.py <repo-root> <scratch-dir> [out.tsv]

For every (unit, T, declared phase, e) a one-unit case is built in <scratch-dir>
from tutorials/steady/power/rankine02_water's constant/ (IF97 water) and run
with <repo-root>/choupoSolve.  P = p_sat(T)(1 + e); e also takes the values
'down' / 'up' (one representable double below / above p_sat as computed here,
IAPWS-IF97 Eq. 30, the closed form the engine evaluates).  The row records the
unit's KPIs, the outlet streams' T and vf, the plant-boundary enthalpy terms
and whether the run printed the pure-fluid 'other side of the saturation
pressure' announcement or the CSTR/advisory caveat block lines.

Output: one TSV row per run (long format: one column per published number,
JSON-encoded in a single field to keep the file narrow).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)


def psat_if97(T):
    n = (0.0, 0.11670521452767e4, -0.72421316703206e6, -0.17073846940092e2,
         0.12020824702470e5, -0.32325550322333e7, 0.14915108613530e2,
         -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849,
         0.65017534844798e3)
    th = T + n[9] / (T - n[10])
    A = th * th + n[1] * th + n[2]
    B = n[3] * th * th + n[4] * th + n[5]
    C = n[6] * th * th + n[7] * th + n[8]
    return (2.0 * C / (-B + math.sqrt(B * B - 4.0 * A * C))) ** 4 * 1.0e6


HDR = "/*--- probe case ---*/\n"
STATE = HDR + ("componentMolarFlows\n{{\n    water    3.6 kmol/h;\n}}\n\n"
               "T               {T!r} K;\nP               {P!r} Pa;\n{ph}")


def phase_line(ph):
    return "" if ph == "none" else f"phase           {ph};\n"


def units_for(kind, P):
    """flowsheetDict units block, extra 0/ streams {name: (T, P, phase)}."""
    pout = repr(1.5 * P)
    plow = repr(0.9 * P)
    U = {
        "heater": ("{ name U; type heater; in probe; outputs ( out ); operation { Q 1 kW; } }", {}),
        "cooler": ("{ name U; type phaseChanger; in probe; outputs ( out ); operation { Q -1 kW; } }", {}),
        "valve": (f"{{ name U; type valve; in probe; outputs ( out ); operation {{ P {plow} Pa; }} }}", {}),
        "pipe": ("{ name U; type pipe; in probe; outputs ( out ); operation { geometry { D 0.1 m; L 50 m; roughness 4.6e-5 m; dz 0 m; } } }", {}),
        "mixer": ("{ name U; type mixer; inputs ( probe partner ); outputs ( out ); }",
                  {"partner": (300.0, 2.0 * P, "liquid")}),
        "splitter": ("{ name U; type splitter; in probe; outputs ( out out2 ); operation { fractions ( 0.3 0.7 ); } }", {}),
        "storageTank": ("{ name U; type storageTank; in probe; outputs ( out ); operation { residenceTime 1 h; } }", {}),
        "turbine": ("{ name U; type turbine; in probe; outputs ( out ); operation { W_shaft -1 kW; eta 0.85; } }", {}),
        "compressor": (f"{{ name U; type compressor; in probe; outputs ( out ); operation {{ P_out {pout} Pa; eta 0.8; }} }}", {}),
        "pump": (f"{{ name U; type pump; in probe; outputs ( out ); operation {{ P_out {pout} Pa; eta 0.8; }} }}", {}),
        "heatExchanger": ("{ name U; type heatExchanger; inputs ( probe partner ); outputs ( out pout ); operation { area 1 m2; U 500 W/m2/K; flow counter; } }",
                          {"partner": (300.0, 2.0 * P, "liquid")}),
        "isothermalFlash": (f"{{ name U; type isothermalFlash; in probe; outputs ( out vap ); operation {{ T {{T}} K; P {plow} Pa; }} }}", {}),
        "adiabaticFlash": (f"{{ name U; type adiabaticFlash; in probe; outputs ( out vap ); operation {{ P {plow} Pa; }} }}", {}),
    }
    return U[kind]


def build(root, scratch, kind, T, ph, tag, P):
    d = scratch / f"{kind}_{T}_{ph}_{tag}"
    if d.exists():
        shutil.rmtree(d)
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    tmpl = root / "tutorials/steady/power/rankine02_water"
    shutil.copytree(tmpl / "constant", d / "constant")
    (d / "system/controlDict").write_text(
        'application choupoSolve;\ndescription "probe";\nverbosity 1;\nreports { }\n')
    block, extra = units_for(kind, P)
    block = block.replace("{T}", repr(T))
    (d / "system/flowsheetDict").write_text("units\n(\n    " + block + "\n);\n")
    (d / "0/probe").write_text(STATE.format(T=T, P=P, ph=phase_line(ph)))
    for name, (Tx, Px, phx) in extra.items():
        (d / "0" / name).write_text(STATE.format(T=Tx, P=Px, ph=phase_line(phx)))
    return d


def run(root, case):
    env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL="C")
    # choupo-init0 materialises the produced streams' 0/ files
    subprocess.run([str(root / "bin/choupo-init0"), str(case)], env=env,
                   capture_output=True, text=True, timeout=300)
    p = subprocess.run([str(root / "choupoSolve"), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=300)
    out = p.stdout + p.stderr
    blocks = RESULT.findall(p.stdout)
    res = json.loads(blocks[-1]) if blocks else {}
    return p.returncode, res, out


def main():
    root = Path(sys.argv[1]).resolve()
    scratch = Path(sys.argv[2]).resolve()
    outp = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    kinds = os.environ.get("PROBE_UNITS", "heater cooler valve pipe mixer splitter storageTank turbine compressor pump heatExchanger isothermalFlash adiabaticFlash").split()
    Ts = [float(x) for x in os.environ.get("PROBE_T", "373.15 446.5158944 550.0").split()]
    phases = os.environ.get("PROBE_PHASES", "liquid gas").split()
    eps = os.environ.get("PROBE_E", "down 0 up -1e-12 1e-12 -1e-9 1e-9 -5e-7 5e-7 -2e-6 2e-6").split()
    scratch.mkdir(parents=True, exist_ok=True)
    rows = []
    for kind in kinds:
        for T in Ts:
            ps = psat_if97(T)
            for ph in phases:
                for e in eps:
                    if e == "down":
                        P = math.nextafter(ps, 0.0)
                    elif e == "up":
                        P = math.nextafter(ps, math.inf)
                    else:
                        P = ps * (1.0 + float(e))
                    case = build(root, scratch, kind, T, ph, e, P)
                    rc, res, out = run(root, case)
                    k = (res.get("kpis") or {}).get("U", {})
                    st = res.get("streams") or {}
                    outs = {}
                    for nm in ("out", "out2", "vap", "pout"):
                        s = st.get(nm)
                        if isinstance(s, dict):
                            outs[nm] = {kk: s.get(kk) for kk in ("T", "P", "vf")}
                    geb = res.get("globalEnergyBoundary") or {}
                    ann = "other side of the saturation pressure" in out
                    err = ""
                    if rc != 0 or not res:
                        m = re.findall(r"(?:ERROR|error|refus\w*)[^\n]*", out)
                        err = (m[0] if m else out[-200:]).replace("\t", " ").replace("\n", " ")[:300]
                    rows.append([kind, repr(T), ph, e, repr(P), str(rc),
                                 json.dumps({kk: v for kk, v in k.items() if isinstance(v, (int, float))}, sort_keys=True),
                                 json.dumps(outs, sort_keys=True),
                                 json.dumps({kk: geb.get(kk) for kk in ("H_feeds_kW", "H_products_kW", "Q_boundary_kW", "W_boundary_kW", "residual_kW") if kk in geb}, sort_keys=True),
                                 "yes" if ann else "no", err])
                    shutil.rmtree(case)
                    print("\t".join(rows[-1][:6]), file=sys.stderr, flush=True)
    hdr = ["unit", "T_K", "declared_phase", "e", "P_Pa", "exit", "kpis", "outlets", "boundary", "announced_other_side", "error"]
    text = "\t".join(hdr) + "\n" + "".join("\t".join(r) + "\n" for r in rows)
    if outp:
        outp.write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
