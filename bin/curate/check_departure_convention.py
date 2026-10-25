#!/usr/bin/env python3
"""check_departure_convention -- every equation of state's residual entropy
is the (T, P) DEPARTURE that S_real = S_ig(T, P) + S_residual adds it to
(2026-10-25, DEV.md 4c C150 R08).

WHY.  `ThermoPackage::S_real` sums the ideal-gas entropy at (T, P) and the
EoS's `S_residual`.  That sum is right only if the residual is taken at the
same (T, P): s_dep(T, P) = s_res(T, rho) + R ln Z.  SRK and PR return the
(T, P) departure (the R ln(Z - B) of Sandler eq. 6.4-31); PC-SAFT returned
the (T, rho) residual, -T (da/dT)_rho - a, WITHOUT the R ln Z -- recorded as
an open divergence in docs/design/entropy-glass-box-trace.md §6 and quoted by
the What-is-entropy EduTool.  A test that re-adds the same parcels cannot see
a wrong convention; two THERMODYNAMIC IDENTITIES can, because they tie the
published entropy to two OTHER published quantities:

  (I1)  (dH_R/dT)_P = T (dS_R/dT)_P            -- the residual heat capacity
  (I2)  (dG_R/dP)_T = v - R T / P,  G_R = H_R - T S_R

Both hold for a departure at (T, P) and both fail by exactly the derivative
of R T ln Z for a (T, rho) residual (H_R is the same in both conventions).
The derivatives are central differences of the engine's own published
`propertyPoint` diagnostics (H_R, S_R, v_molar), nothing else.

CLAIM, through the real choupoProps binary, on two dense vapours (CH4 at
300 K / 50 bar; propane at 350 K / 15 bar) under each of PCSAFT, SRK and PengRobinson:
  (a) I1 holds to 1e-4 of |dH_R/dT|, and
  (b) I2 holds to 1e-4 of |v - RT/P| (both measured at ~1e-6 to 1e-7,
      the central-difference truncation at a 1e-3 relative step).
A (T, rho) residual misses I2 by roughly the whole right-hand side at these
states (R T dlnZ/dP is of the same size as v - RT/P), so the band is not
close to the defect.

MEASURED, 2026-10-25, against the parent build (PCSAFT.cpp without the
+ R ln Z): PCSAFT failed both identities on both states (I1 off by 56 % and
63 %, I2 by 103 % and 136 %) while SRK and PengRobinson passed at 1e-6; with
the term, PCSAFT passes at the cubics' level (I1 1.4e-6 / 1.8e-6, I2 1.4e-8
/ 1.1e-7).

NOT COVERED: the LIQUID root (`S_residual` reports the vapour root by the
family contract, PCSAFT.cpp), mixtures, the association term in isolation,
and whether the departure is RIGHT against measurement -- only that it is
self-consistent with H_R and v in the convention S_real assumes.

Exit 1 listing failures."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
CASE = ROOT / "tutorials" / "props" / "molecular" / "pcsaft02_states_crosscheck"
R = 8.314462618

MODELS = ["PCSAFT", "SRK", "PengRobinson"]
STATES = [("CH4", 300.0, 50.0e5), ("propane", 350.0, 15.0e5)]
RT_STEP = 1.0e-3            # relative step in T and in P

failures = []


def ops_text():
    blocks = []
    for model in MODELS:
        for comp, T, P in STATES:
            dT, dP = RT_STEP * T, RT_STEP * P
            for tag, Tk, Pk in (("0", T, P), ("Tp", T + dT, P),
                                ("Tm", T - dT, P), ("Pp", T, P + dP),
                                ("Pm", T, P - dP)):
                name = f"{model}_{comp}_{tag}"
                thermo = ("" if model == "PCSAFT" else
                          "        thermo      { equilibrium {"
                          f" equationOfState {{ model {model}; }} }} }}\n")
                blocks.append(
                    "    {\n"
                    f"        name        {name};\n"
                    "        type        propertyPoint;\n"
                    f"        state       {{ T {Tk!r} K;  P {Pk!r} Pa;"
                    f"  composition {{ {comp} 1.0; }} }}\n"
                    + thermo +
                    "        properties  ( Z );\n"
                    "    }\n")
    return "operations\n(\n" + "".join(blocks) + ");\n"


def diag_of(out: str, name: str):
    m = re.search(r'\{ "name": "' + re.escape(name)
                  + r'", "type": "propertyPoint", "diagnostics": (\{[^{}]*\})',
                  out)
    return json.loads(m.group(1)) if m else None


def main() -> int:
    if not PROPS.exists():
        print(f"check_departure_convention: {PROPS} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / "dep"
        shutil.copytree(CASE, case, ignore=shutil.ignore_patterns(
            "expected", "log.*", "reports", "converged"))
        pd = case / "system" / "propsDict"
        s = pd.read_text()
        i = s.index("operations")
        pd.write_text(s[:i] + ops_text())
        env = dict(os.environ, CHOUPO_HOME=str(ROOT))
        p = subprocess.run([str(PROPS), "."], cwd=case, env=env,
                           capture_output=True, text=True, timeout=600)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            print(out[-3000:])
            print(f"check_departure_convention: FAIL -- choupoProps exit"
                  f" {p.returncode}")
            return 1

    lines = []
    for model in MODELS:
        for comp, T, P in STATES:
            d = {t: diag_of(out, f"{model}_{comp}_{t}")
                 for t in ("0", "Tp", "Tm", "Pp", "Pm")}
            if any(v is None or "S_R" not in v for v in d.values()):
                failures.append(f"{model}/{comp}: a propertyPoint diag block"
                                " is missing from the result")
                continue
            dT, dP = RT_STEP * T, RT_STEP * P
            dH_dT = (d["Tp"]["H_R"] - d["Tm"]["H_R"]) / (2 * dT)
            TdS_dT = T * (d["Tp"]["S_R"] - d["Tm"]["S_R"]) / (2 * dT)
            G = {t: d[t]["H_R"] - d[t]["T"] * d[t]["S_R"] for t in ("Pp", "Pm")}
            dG_dP = (G["Pp"] - G["Pm"]) / (2 * dP)
            rhs = d["0"]["v_molar"] - R * T / P
            e1 = abs(dH_dT - TdS_dT) / abs(dH_dT)
            e2 = abs(dG_dP - rhs) / abs(rhs)
            lines.append(f"{model:12s} {comp:8s} Z={d['0']['Z']:.4f}"
                         f"  I1 {e1:.2e}  I2 {e2:.2e}")
            if e1 > 1.0e-4:
                failures.append(
                    f"{model}/{comp}: (dH_R/dT)_P = {dH_dT:.6g} but"
                    f" T (dS_R/dT)_P = {TdS_dT:.6g} J/(mol K)"
                    f" ({100 * e1:.2f} %) -- S_residual is not the (T, P)"
                    " departure H_residual belongs to")
            if e2 > 1.0e-4:
                failures.append(
                    f"{model}/{comp}: (dG_R/dP)_T = {dG_dP:.6g} but"
                    f" v - RT/P = {rhs:.6g} m3/mol ({100 * e2:.2f} %) --"
                    " S_residual is not the (T, P) departure (a (T, rho)"
                    " residual misses this by d(RT ln Z)/dP)")
    for ln in lines:
        print("  " + ln)
    if failures:
        for x in failures:
            print("  FAIL " + x)
        print("check_departure_convention: FAIL")
        return 1
    print("check_departure_convention: OK -- under PCSAFT, SRK and PengRobinson, the"
          " published S_R of CH4 (300 K, 50 bar) and propane (350 K, 15 bar)"
          " satisfies (dH_R/dT)_P = T (dS_R/dT)_P and (dG_R/dP)_T = v - RT/P"
          " to 1e-4, so S_real = S_ig(T, P) + S_R adds a (T, P) departure"
          " (vapour root only; no liquid root, no mixture)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
