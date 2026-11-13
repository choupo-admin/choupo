#!/usr/bin/env python3
"""Probe: what the phase-holding units do with a PRODUCED inlet of the other
phase, and what a pure stream with a declared 0 < vaporFraction < 1 is priced as.

    python3 probe_wrong_phase_inlets.py <repo-root> <scratch-dir>

Cases (IF97 water from rankine02_water's constant/, 3.6 kmol/h):
  pump_fed_vapour      saturated liquid 8.586 bar -> boiler outletT 500 K (superheats) -> pump to 12 bar
  compressor_fed_liq   saturated vapour 8.586 bar -> condenser outletT 400 K (subcools) -> compressor to 12 bar
  turbine_fed_liq      saturated vapour 8.586 bar -> condenser outletT 400 K (subcools) -> turbine W -0.1 kW
  heater_vf05_P*       a declared vaporFraction 0.5 at T = 446.5158944 K, P = p_sat (1 + e), e in
                       (0, 1e-3, 0.5): heater Q = 0, read the boundary enthalpy
Prints exit code, the unit's KPIs and the run's stderr/stdout lines that refuse,
announce or warn.
"""
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_saturation_line import psat_if97  # noqa: E402

RESULT = re.compile(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", re.S)
T0 = 446.5158944


def state(T, P, extra):
    return ("componentMolarFlows\n{\n    water    3.6 kmol/h;\n}\n\n"
            f"T               {T!r} K;\nP               {P!r} Pa;\n{extra}")


def case(root, scr, name, units, streams):
    d = scr / name
    if d.exists():
        shutil.rmtree(d)
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(root / "tutorials/steady/power/rankine02_water/constant", d / "constant")
    (d / "system/controlDict").write_text('application choupoSolve;\ndescription "probe";\nverbosity 1;\nreports { }\n')
    (d / "system/flowsheetDict").write_text("units\n(\n" + units + "\n);\n")
    for n, txt in streams.items():
        (d / "0" / n).write_text(txt)
    env = {"CHOUPO_HOME": str(root), "LC_ALL": "C", "PATH": "/usr/bin:/bin"}
    p = subprocess.run([str(root / "choupoSolve"), "."], cwd=d, env=env, capture_output=True, text=True, timeout=300)
    out = p.stdout + p.stderr
    b = RESULT.findall(p.stdout)
    res = json.loads(b[-1]) if b else {}
    lines = [l.strip()[:260] for l in out.splitlines()
             if re.search(r"ERROR|refus|REFUS|other side|accept|WARN|warning|announce|not accepted", l)]
    return p.returncode, res, lines[:8]


def main():
    root = Path(sys.argv[1]).resolve()
    scr = Path(sys.argv[2]).resolve()
    scr.mkdir(parents=True, exist_ok=True)
    ps = psat_if97(T0)
    sat_liq = state(T0, ps, "phase           liquid;\n")
    sat_gas = state(T0, ps, "phase           gas;\n")
    seed = state(T0, ps, "")
    runs = {
        "pump_fed_vapour": (
            "{ name H; type boiler; in feed; outputs ( mid ); operation { outletT 500 K; } }\n"
            "{ name U; type pump; in mid; outputs ( out ); operation { P_out 12 bar; eta 0.8; } }",
            {"feed": sat_liq, "mid": seed, "out": seed}),
        "compressor_fed_liq": (
            "{ name H; type condenser; in feed; outputs ( mid ); operation { outletT 400 K; } }\n"
            "{ name U; type compressor; in mid; outputs ( out ); operation { P_out 12 bar; eta 0.8; } }",
            {"feed": sat_gas, "mid": seed, "out": seed}),
        "turbine_fed_liq": (
            "{ name H; type condenser; in feed; outputs ( mid ); operation { outletT 400 K; } }\n"
            "{ name U; type turbine; in mid; outputs ( out ); operation { W_shaft -0.1 kW; eta 0.85; } }",
            {"feed": sat_gas, "mid": seed, "out": seed}),
    }
    for e in (0.0, 1e-3, 0.5):
        P = ps * (1.0 + e)
        runs[f"heater_vf05_e{e:g}"] = (
            "{ name U; type heater; in feed; outputs ( out ); operation { Q 0 kW; } }",
            {"feed": state(T0, P, "vaporFraction   0.5;\n"), "out": state(T0, P, "")})
    print("case\texit\tunit_kpis\tmid_or_out_stream\tH_feeds_kW\tlines")
    for name, (units, streams) in runs.items():
        rc, res, lines = case(root, scr, name, units, streams)
        k = (res.get("kpis") or {}).get("U", {})
        keep = {x: k[x] for x in ("dT", "T_in", "T_out", "W_shaft_kW", "Q_kW", "vf_in", "vf_out", "P_out") if x in k}
        st = res.get("streams") or {}
        s = st.get("mid") or st.get("out") or {}
        sv = {x: s.get(x) for x in ("T", "P", "vf")} if isinstance(s, dict) else {}
        geb = (res.get("globalEnergyBoundary") or {}).get("H_feeds_kW")
        print("\t".join([name, str(rc), json.dumps(keep), json.dumps(sv), str(geb), " | ".join(lines)]))
        shutil.rmtree(scr / name)


if __name__ == "__main__":
    main()
