#!/usr/bin/env python3
"""PC-SAFT association gate (approved 2026-08-02, built with the three
ratified amendments): the engine's site fractions equal an INDEPENDENT
Python solution of the same Wertheim closure, the predicted liquid
densities sit on the published-class experimental anchors, the partial
and unknown-scheme records refuse by name, and the non-associating
corpus is numerically untouched.

Probes, through the real choupoProps binary:

  WITNESS      pcsaft03_association_pure announces the roster read from
               the RECORDS ([pcsaft] associating: water (2B), ethanol
               (2B)), and for each pure associating fluid THIS SCRIPT
               re-derives Delta and the closed-form site fraction from
               the record constants + the engine's printed rho, and the
               engine's X^D/X^A must match at 1e-6 (independent
               reimplementation -- not a copy of the C++).
  ANCHORS      rho_liq(water 2B) within 2 % of 922 kg/m3 (the SET'S OWN
               published trade-off -- the 2-site water fit is Psat-accurate
               and ~7.5 % light on ambient density; a CRC-truth anchor here
               would re-bless the 4C mis-curation) and rho_liq(ethanol 2B)
               within 3 % of 789.3 kg/m3 (CRC, 25 C).
  REFUSAL-1    a record carrying the association trio PARTIALLY (kappaAB
               removed) refuses at load naming the trio.
  REFUSAL-2    an unknown assocScheme refuses listing the known schemes.
  NEGATIVE     pcsaft01_pure_nhexane runs with NO association output and
               its Z / v_molar agree with the pre-association golden at
               1e-10 -- the byte-identity half of the widened validation.

Exit 1 listing failures."""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
CASE = ROOT / "tutorials" / "props" / "molecular" / "pcsaft03_association_pure"
NHEX = ROOT / "tutorials" / "props" / "molecular" / "pcsaft01_pure_nhexane"

failures = []

#  Record constants (G&S 2002 Table 1), repeated here ON PURPOSE: the gate
#  must not read them through the same parser the engine uses.  Water is
#  2B -- the paper lists TWO sites; this set mis-curated as 4C passed a
#  naive pure-density anchor (+0.6%, a coincidence) while the mixture
#  flash collapsed, which is why the water anchor below is the set's OWN
#  published behaviour (rho ~922, the Psat-over-density trade-off of the
#  2-site fit), not the CRC truth value.
RECORDS = {
    "water":   dict(m=1.0656, sigma=3.0007, epsK=366.51,
                    scheme="2B", nsite=1, epsAB=2500.7, kappa=0.034868,
                    MW=18.0153e-3, rho_exp=922.0, band=0.02),
    "ethanol": dict(m=2.3827, sigma=3.1771, epsK=198.24,
                    scheme="2B", nsite=1, epsAB=2653.4, kappa=0.032384,
                    MW=46.069e-3,  rho_exp=789.3, band=0.03),
}
T = 298.15


def x_closed_form(rec, rho):
    """Independent pure-fluid closed form: d, zeta2/3, g_hs, Delta, then the
    quadratic root of  rho*n*Delta*X^2 + X - 1 = 0."""
    sigma = rec["sigma"] * 1.0e-10
    d = sigma * (1.0 - 0.12 * math.exp(-3.0 * rec["epsK"] / T))
    c = (math.pi / 6.0) * rho * rec["m"]
    z2, z3 = c * d**2, c * d**3
    om = 1.0 - z3
    dij = d / 2.0
    g = 1.0/om + dij * 3.0*z2/om**2 + dij*dij * 2.0*z2*z2/om**3
    delta = sigma**3 * g * rec["kappa"] * math.expm1(rec["epsAB"] / T)
    rnD = rho * rec["nsite"] * delta
    return (-1.0 + math.sqrt(1.0 + 4.0*rnD)) / (2.0*rnD)


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    if not PROPS.exists():
        print(f"check_pcsaft_association: {PROPS} missing -- build first")
        return 1

    # ---- WITNESS + ANCHORS ------------------------------------------------
    rc, out = run(CASE)
    if rc != 0:
        failures.append(f"witness: exit {rc}")
    if "[pcsaft] associating: water (2B), ethanol (2B)" not in out:
        failures.append("witness: association roster not announced")

    lines = re.findall(r"assoc pure component (\d+) \((\w+)\): rho_liq"
                       r" ([0-9.e+-]+) /m3, X\^D ([0-9.e+-]+),"
                       r" X\^A ([0-9.e+-]+)", out)
    order = ["water", "ethanol"]
    if len(lines) < 2:
        failures.append("witness: verify() did not echo both site-fraction"
                        " lines")
    else:
        seen = set()
        for idx, scheme, rho_s, xd_s, xa_s in lines[:2]:
            name = order[int(idx)]
            seen.add(name)
            rec = RECORDS[name]
            rho, xd, xa = float(rho_s), float(xd_s), float(xa_s)
            if scheme != rec["scheme"]:
                failures.append(f"{name}: scheme {scheme} != {rec['scheme']}")
            xref = x_closed_form(rec, rho)
            for tag, got in (("X^D", xd), ("X^A", xa)):
                if abs(got - xref) > 1.0e-6:
                    failures.append(f"{name}: engine {tag} {got} vs"
                                    f" independent closed form {xref}")
            # rho [molecules/m3] / Na = mol/m3;  x MW [kg/mol] = kg/m3
            rho_kg = rho / 6.02214076e23 * rec["MW"]
            dev = (rho_kg - rec["rho_exp"]) / rec["rho_exp"]
            if abs(dev) > rec["band"]:
                failures.append(f"{name}: rho_liq {rho_kg:.1f} kg/m3 is"
                                f" {100*dev:+.1f}% off the anchor"
                                f" {rec['rho_exp']} (band {rec['band']})")
        if seen != {"water", "ethanol"}:
            failures.append(f"witness: components seen {seen}")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        def probe_case(tag):
            case = tmp / tag
            shutil.copytree(CASE, case,
                            ignore=shutil.ignore_patterns("expected", "log.*"))
            #  Unseal: the probe edits the mirrored record, and the point is
            #  the COMPONENT refusal, not the manifest hash refusal.
            (case / "constant" / "propertyManifest").unlink()
            return case

        # ---- REFUSAL-1: partial trio ---------------------------------------
        r1 = probe_case("partial")
        w = r1 / "constant" / "components" / "water.dat"
        w.write_text(re.sub(r"^\s*kappaAB.*$", "", w.read_text(), flags=re.M))
        rc, out = run(r1)
        if rc == 0:
            failures.append("refusal-1: partial association trio accepted")
        elif "association trio is PARTIAL" not in out:
            failures.append("refusal-1: message lacks 'association trio is"
                            " PARTIAL'")

        # ---- REFUSAL-2: unknown scheme -------------------------------------
        r2 = probe_case("scheme")
        w = r2 / "constant" / "components" / "water.dat"
        w.write_text(w.read_text().replace("assocScheme 2B;",
                                           "assocScheme 5X;"))
        rc, out = run(r2)
        if rc == 0:
            failures.append("refusal-2: unknown assocScheme accepted")
        elif "unknown assocScheme '5X'" not in out:
            failures.append("refusal-2: message lacks \"unknown assocScheme"
                            " '5X'\"")

    # ---- NEGATIVE / byte-identity ----------------------------------------
    rc, out = run(NHEX)
    if rc != 0:
        failures.append(f"negative: pcsaft01 exit {rc}")
    if "[pcsaft] associating" in out or "assoc pure component" in out:
        failures.append("negative: association output on a non-associating"
                        " system")
    #  Z and v_molar must equal the pre-association golden at 1e-10 -- the
    #  term must not have touched the non-associating arithmetic at all.
    exp = {}
    for line in (NHEX / "expected").read_text().splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0] == "kpi":
            exp[(parts[1], parts[2])] = float(parts[3])
    m = re.search(r'"Z": ([0-9.e+-]+), .*?"v_molar": ([0-9.e+-]+)', out)
    if not m:
        failures.append("negative: could not parse pcsaft01 diagnostics")
    else:
        got = {"Z": float(m.group(1)), "v_molar": float(m.group(2))}
        for key, val in got.items():
            ref = exp.get(("liquid_298K_1bar", key))
            if ref is None:
                continue
            if abs(val - ref) > 1.0e-10 * max(1.0, abs(ref)):
                failures.append(f"negative: pcsaft01 {key} {val} !="
                                f" golden {ref} (byte-identity broken)")

    if failures:
        print("check_pcsaft_association: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_pcsaft_association: OK -- engine X^D/X^A equal the"
          " independent closed form (1e-6), densities on the per-set"
          " anchors (water: the 2-site fit's own published trade-off),"
          " partial trio + unknown scheme refuse by name,"
          " non-associating corpus numerically untouched (1e-10)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
