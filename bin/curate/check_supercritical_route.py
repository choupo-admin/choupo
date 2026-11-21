#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a two-phase root above every pure Tc is judged by the route that made it.

    bin/curate/check_supercritical_route.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT (external review R-010, DEV.md 4c C467).
`flashState::supercriticalSplitDiscarded` threw away ANY two-phase answer at a T
above the highest pure Tc present and published V/F = 1, x = y = z, still
"converged".  That is right when the K came from Psat or a Henry law extrapolated
above Tc (gamma-phi: the ammonia converter outlet at 843 K, V/F 0.26, K_H2 below 1
from a van't Hoff law carried 500 K past its window).  It is wrong under phi-phi,
where K = phi_L/phi_V from ONE cubic and no correlation is read: a mixture's
critical locus lies above the pure Tc of its lighter component, and the converged
split has the LOWER Gibbs energy.  Every closure stays green on the wrong answer
(one phase closes mass perfectly), and no golden can see it: a golden pins what a
run prints.  Only the physical statement -- equal fugacities and a lower G than
the homogeneous state -- catches it.

WHAT THIS GATE CHECKS (choupoSolve, temporary cases built from flash09_n2ch4_stryjek):
 (a) the reviewer's witness: SRK phi-phi propane + n-butane, kij = -0.3 (a SYNTHETIC
     mathematical probe written into a case-local record, never a catalogue value),
     T = 426.12 K (highest pure Tc 425.12 K), P = 3962103.535596157 Pa,
     z_propane = 0.4728164999111161, 100 kmol/h.  The split must be PRESERVED:
     V/F = 0.5, x_propane 0.45520, y_propane 0.49043 (to 1e-4), the fugacities equal
     (y_i = K_i x_i with the K the run reports and K = phi_L/phi_V), mass closed
     between feed and the two products to 1e-6, no DISCARDED advisory.
 (b) a phi-phi control that is genuinely single-phase above Tc (the same pair at
     440 K): V/F = 1 and no DISCARDED advisory (the solver found one phase; nothing
     was thrown away).
 (c) a gamma-phi case above every Tc (ammonia03_quench_converter): the discard
     STILL happens and the advisory still names the correlations.

SABOTAGE ARMS (ENGINE sabotages, built by the gate itself).  The gate copies src/, make/,
the Makefile and the object tree to a temporary directory, patches
src/unitOperations/flash/StreamEquilibrium.H there, rebuilds choupoSolve (only the
translation units that include it recompile) and reruns the arm that must notice:
  S1  the unconditional discard restored (the route test never accepts a split):
      (a) must FAIL -- V/F 1, a DISCARDED advisory, fugacities no longer equal;
  S2  the discard disabled on every route: (c) must FAIL -- the gamma-phi advisory is gone.
A sabotage that does not build, or whose arm still passes, FAILS the gate.  (Data
sabotages -- kij = 0, T = 420 K -- were tried and dropped: neither state is a two-phase
root above every pure Tc, so neither reaches the new code.)

NOT CHECKED: a phi-phi root the Gibbs test rejects (none is known to be produced by
the solver; the rejection path is read, not run), PR (same code path), steady cases
other than the three above (the scope list in the C467 landing covers them).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

BASE = "tutorials/steady/flash/flash09_n2ch4_stryjek"
GAMMA_PHI = "tutorials/steady/reactors/ammonia03_quench_converter"
Z_C3 = 0.4728164999111161
P_PA = 3962103.535596157
# The walks read only the built binary under build/ (to copy it into the
# gate's scratch tree) and the gate's own scratch copy.
SCAN_ROOTS = ("build",)
STRIP = ("expected", "converged", "constant/propertyManifest", "reports")
RECORD = """recordType  eosBinaryInteraction;
schemaVersion 1;
i           propane;
j           nButane;
kij         {kij};
eos         SRK;
reviewStatus  interim;
reviewReason  "SYNTHETIC test value imposed as a mathematical probe (C467); not a measured or fitted kij";
provenance {{ origin assumed; }}
"""


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def build(c, T, kij):
    """Turn the copy of flash09 into the propane + n-butane SRK witness at T."""
    tp = c / "constant/thermoPhysPropDict"
    text = tp.read_text()
    text = text.replace("components ( N2 CH4 );", "components ( propane nButane );")
    text = re.sub(r"N2-CH4 \{[^}]*\}", "propane-nButane { }", text)
    tp.write_text(text)
    (c / "constant/parameters/SRK").mkdir(parents=True, exist_ok=True)
    (c / "constant/parameters/SRK/propane-nButane.dat").write_text(RECORD.format(kij=kij))
    flows = (f"    propane {100 * Z_C3:.14g} kmol/h;\n    nButane {100 * (1 - Z_C3):.14g} kmol/h;\n")
    for name in ("feed", "liq", "vap"):
        f = c / "0" / name
        t = f.read_text()
        t = re.sub(r"componentMolarFlows\s*\{[^}]*\}", "componentMolarFlows\n{\n" + flows + "}", t)
        t = re.sub(r"^T\s+.*$", f"T {T} K;", t, flags=re.M)
        t = re.sub(r"^P\s+.*$", f"P {P_PA!r} Pa;", t, flags=re.M)
        f.write_text(t)
    fd = c / "system/flowsheetDict"
    t = fd.read_text()
    t = re.sub(r"operation \{[^}]*\}", f"operation {{ T {T} K;  P {P_PA!r} Pa; }}", t)
    fd.write_text(t)


def read(out):
    j = result(out)
    try:
        k = j["kpis"]["node"]
        vap, liq = j["streams"]["vap"], j["streams"]["liq"]
        return {
            "VF": k["V_over_F"], "K": (k.get("K_propane", 0.0), k.get("K_nButane", 0.0)),
            "y": vap["composition"]["propane"], "x": liq["composition"]["propane"],
            "Fin": k["F_in"], "Fout": k["F_alpha"] + k["F_beta"],
            "discarded": any("DISCARDED" in json.dumps(a) for a in j.get("advisories", [])),
        }
    except (TypeError, KeyError):
        return None


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")

    def witness(T, kij):
        with gatekit.probe_copy(BASE, strip=STRIP) as c:
            build(c, T, kij)
            rc, out = gatekit.run(solve, c)
        return rc, out, (read(out) if rc == 0 else None)

    # (a) the reviewer's witness: the split is preserved.
    rc, out, a = witness(426.12, -0.3)
    if a is None:
        return gatekit.verdict("check_supercritical_route",
                               [f"(a) witness did not run / no result (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:])], "")

    def split_ok(r):
        errs = []
        if abs(r["VF"] - 0.5) > 1e-3:
            errs.append(f"V/F {r['VF']:.6f} is not 0.5")
        if abs(r["x"] - 0.45520) > 1e-4 or abs(r["y"] - 0.49043) > 1e-4:
            errs.append(f"x_propane {r['x']:.5f} / y_propane {r['y']:.5f} are not 0.45520 / 0.49043")
        if r["discarded"]:
            errs.append("the run carries a DISCARDED advisory")
        return errs

    for e in split_ok(a):
        failures.append("(a) witness: " + e)
    # equal fugacities: y_i = K_i x_i with K = phi_L(x)/phi_V(y) from the run
    fug = max(abs(a["y"] - a["K"][0] * a["x"]), abs((1 - a["y"]) - a["K"][1] * (1 - a["x"])))
    if fug > 1e-5:
        failures.append(f"(a) witness: fugacities differ, |y - K x| = {fug:.2e}")
    clos = abs(a["Fin"] - a["Fout"]) / a["Fin"]
    if clos > 1e-6:
        failures.append(f"(a) witness: mass not closed between feed and products ({clos:.2e})")

    # (b) control: genuinely single-phase above Tc stays single-phase.
    rc, out, b = witness(440.0, -0.3)
    if b is None:
        failures.append(f"(b) control did not run (exit {rc})")
    else:
        if abs(b["VF"] - 1.0) > 1e-9:
            failures.append(f"(b) control: V/F {b['VF']} is not 1 (a single phase was expected)")
        if b["discarded"]:
            failures.append("(b) control: a DISCARDED advisory was printed -- the solver found one phase, nothing to discard")

    # (c) gamma-phi above every Tc: still discarded, same advisory.
    with gatekit.probe_copy(GAMMA_PHI, strip=("expected", "converged", "reports")) as c:
        rc, out = gatekit.run(solve, c)
    j = result(out) if rc == 0 else None
    if j is None:
        failures.append(f"(c) {GAMMA_PHI}: did not run (exit {rc})")
    elif not any("DISCARDED" in json.dumps(x) and "[psat]" in json.dumps(x) for x in j.get("advisories", [])):
        failures.append(f"(c) {GAMMA_PHI}: the gamma-phi discard advisory (naming [henry]/[psat]) is gone")

    # ENGINE sabotage arms: patch-build a private copy of the tree and rerun the arm.
    header = "src/unitOperations/flash/StreamEquilibrium.H"
    gate = 'if (phiPhiRoute && phiPhiSplitLowersGibbs(fs, T, P, z, thermo, &phiWhy))'
    repo = gatekit.repo
    with tempfile.TemporaryDirectory(prefix="scroute_") as td:
        tree = Path(td) / "tree"
        tree.mkdir()
        for d in ("src", "make", "build"):
            shutil.copytree(repo / d, tree / d, symlinks=True)
        shutil.copy2(repo / "Makefile", tree / "Makefile")
        plat = next((p.name for p in (repo / "build").iterdir() if (p / "choupoSolve").exists()), None)
        if plat is None:
            failures.append("sabotage arms: no built choupoSolve under build/ to copy")
        text = (tree / header).read_text() if plat else ""
        if plat and gate not in text:
            failures.append("sabotage arms: the route test line is gone from the header -- the gate is stale")
        elif plat:
            exe = tree / "build" / plat / "choupoSolve"
            for tag in ("S1 unconditional discard", "S2 no discard on any route"):
                # S1 must make the split impossible to keep: the discard happens for phi-phi too.
                patched = text.replace(gate, "if (true)" if tag.startswith("S2") else
                                       gate.replace("if (", "if (false && ", 1))
                (tree / header).write_text(patched)
                os.utime(tree / header, None)
                r = subprocess.run(["make", "-j2", f"build/{plat}/choupoSolve"], cwd=tree,
                                   capture_output=True, text=True)
                if r.returncode != 0 or not exe.exists():
                    failures.append(f"sabotage {tag}: the patched engine did not build: "
                                    + " | ".join((r.stdout + r.stderr).strip().splitlines()[-2:]))
                    continue
                if tag.startswith("S1"):
                    with gatekit.probe_copy(BASE, strip=STRIP) as c:
                        build(c, 426.12, -0.3)
                        rc2, out2 = gatekit.run(exe, c)
                    s1 = read(out2) if rc2 == 0 else None
                    if s1 is None or not split_ok(s1):
                        failures.append("sabotage S1: under the unconditional discard the witness still passed (a) "
                                        "-- (a) cannot see the defect")
                else:
                    with gatekit.probe_copy(GAMMA_PHI, strip=("expected", "converged", "reports")) as c:
                        rc2, out2 = gatekit.run(exe, c)
                    j2 = result(out2) if rc2 == 0 else None
                    if j2 is not None and any("DISCARDED" in json.dumps(x) for x in j2.get("advisories", [])):
                        failures.append("sabotage S2: with no discard on any route (c) still saw the advisory "
                                        "-- (c) cannot see the defect")

    return gatekit.verdict(
        "check_supercritical_route", failures,
        f"above every pure Tc a phi-phi split stands when it lowers G (witness V/F {a['VF']:.4f}, x/y "
        f"{a['x']:.5f}/{a['y']:.5f}, |y-Kx| {fug:.1e}, mass {clos:.1e}); a single-phase phi-phi state stays "
        "single-phase; the gamma-phi discard and its advisory are unchanged; two engine sabotages (built here) are seen",
    )


if __name__ == "__main__":
    sys.exit(main())
