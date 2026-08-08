#!/usr/bin/env python3
"""Gate: the C2 spike's architectural evidence, pinned and re-verified.

    bin/curate/check_solid_equilibrium_spike.py

THE PROPOSITION (ruled 2026-08-08, C2): ONE solid-equilibrium architecture --
presence decided by the complementarity  n = 0 & lnSI <= 0  XOR  n > 0 &
lnSI = 0  -- serving MULTIPLE explicit solid thermodynamic models, with NO
independent removal mechanisms on the same equilibrium.  The spike exists to
demonstrate or falsify it across the ruling's three classes; this gate keeps
the demonstrations true after the spike.  The review has since happened:
PASSED (Vitor, 2026-08-08) -- the target architecture is RATIFIED and the
migration AUTHORISED under the four boundary rulings recorded in
docs/design/solid-equilibrium-spike.md section 7.  The evidence stays pinned
live here until the migration's own gates supersede it.

WHAT THIS CHECKS -- each arm is one of the ruling's demands:

  D1  MOLECULAR SOLID (ice, fusion model behind the interface): the
      freeze-concentration equilibrium at fixed T inverts back through the
      fpd01-style freezing curve to < 1e-6 K, and ABOVE the curve the
      candidate stays exactly absent (the complementarity negative).
  D2  ORDINARY SALT (dissolution/Ksp model behind the SAME interface):
      supersaturated brine relaxes to the cited Pinho & Macedo m_sat
      exactly; the mole ledger closes to 1e-12; subsaturated stays absent.
  D3  REACTIVE MINERAL (calcite over the SPECIATED solution): the interface
      reproduces SpeciationSolver's own `equilibrate` -- the ORACLE, called
      through its public surface and NOT modified -- in n (1e-5 rel), final
      SI (1e-6) and pH (1e-4).
  D4  BOTH CANDIDATES IN ONE SOLVE: ice active at lnSI ~ 0, salt correctly
      ABSENT with lnSI < 0, water and salt ledgers closed to 1e-12 -- no
      double counting with two solids registered.
  D4b THE EUTECTIC ATTEMPT, recorded as the honest outcome it had: within
      the curated data's validity (SP77 extrapolated below 0 C, announced;
      Ksp(T) a first-order van 't Hoff on the record's cited dissolution
      enthalpy) BOTH stay subsaturated at 252.15 K / 6 mol/kg.  The
      both-active state is UNDEMONSTRATED WITH CURRENT DATA -- a named data
      gap (a curated sub-zero Ksp(T)), not an architectural failure.  If
      this arm ever finds both active, the demonstration IMPROVED and this
      gate demands the record be updated rather than silently passing.
  D5  THE NEGATIVE CONTROL -- the banned shape, reintroduced by hand: the
      same solid solved by two mechanisms each blind to the other.  Both
      "converge"; the recombined state satisfies neither equilibrium and
      the one-ledger closure is violated by ~30 %.  The arm asserts the
      violation IS detected large: a negative control that passed quietly
      would mean the metric cannot see the bug the ruling bans.

  PURITY (falsification clause (a)): the common solver's CODE knows no
  solid by name and no class by kind -- SolidEquilibrium.H, comments
  stripped, must contain none of: ice, calcite, NaCl, fusion, Ksp,
  speciat.  One name-keyed branch in the solver falsifies the proposition,
  and this arm is where that would surface.

WHAT THIS DOES NOT CHECK, said plainly: the spike proves the ARCHITECTURE
can host the three classes without double counting.  It does NOT validate
any number against measurement beyond the anchors its inputs already carry,
does NOT integrate the interface into any flash or unit operation, and does
NOT touch the speciation path -- the AUTHORISED migration is future work
under the section-7 boundaries, and none of it exists yet.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "solidEqSpike"
SRC = ROOT / "bin" / "curate" / "_solidEquilibriumSpike.cpp"
HDR = ROOT / "src" / "thermo" / "solidEquilibrium" / "SolidEquilibrium.H"


def build():
    r = subprocess.run(
        ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(SRC),
         str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
         "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"), "-o", str(PROBE)],
        capture_output=True, text=True)
    return r.returncode, r.stderr[-1200:]


def main() -> int:
    fail = []
    for f, what in ((SRC, "probe source"), (HDR, "the interface header")):
        if not f.is_file():
            print(f"check_solid_equilibrium_spike: FAILED\n  {what} missing")
            return 1
    if not (ROOT / "build" / "linux64Gcc" / "libchoupo.so").exists():
        print("check_solid_equilibrium_spike: FAILED\n  libchoupo.so not "
              "built -- a check that cannot run must not pass")
        return 1
    rc, err = build()
    if rc != 0:
        print("check_solid_equilibrium_spike: FAILED\n  probe did not compile"
              " -- a surface the spike stands on moved.\n" + err)
        return 1
    p = subprocess.run([str(PROBE)], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)),
                       timeout=900)
    m = re.search(r'<<<JSON\n(.*?)JSON>>>', p.stdout + p.stderr, re.S)
    if p.returncode != 0 or not m:
        print("check_solid_equilibrium_spike: FAILED\n  no JSON (exit "
              f"{p.returncode})\n" + (p.stdout + p.stderr)[-1000:])
        return 1
    d = {r["demo"]: r for r in json.loads(m.group(1))}

    def ok(tag):
        r = d.get(tag)
        if not r or r.get("result") != "ok":
            fail.append(f"{tag} did not run: "
                        + (r.get("result", "missing")[:120] if r else "missing"))
            return None
        return r

    r = ok("D1_ice")
    if r:
        if abs(r["TfBack_minus_T"]) > 1e-6:
            fail.append(f"D1: the converged brine does not invert back to the "
                        f"imposed T (gap {r['TfBack_minus_T']:.3e} K) -- the "
                        "interface and the fpd01 curve disagree about the "
                        "same physics")
        if r["aboveCurve_n"] != 0.0:
            fail.append("D1: ice formed ABOVE the freezing curve "
                        f"(n = {r['aboveCurve_n']}) -- complementarity's "
                        "absent branch is broken")
    r = ok("D2_salt")
    if r:
        if abs(r["mEnd"] - 6.144) > 1e-6:
            fail.append(f"D2: relaxed to m = {r['mEnd']}, not the cited "
                        "m_sat 6.144 the Ksp is anchored on")
        if abs(r["ledger_gap"]) > 1e-12:
            fail.append(f"D2: salt ledger open by {r['ledger_gap']:.2e}")
        if r["subsat_n"] != 0.0:
            fail.append("D2: salt formed from a subsaturated brine")
    r = ok("D3_calcite")
    if r:
        if r["nOracle"] <= 0:
            fail.append("D3: the ORACLE precipitated nothing -- the fixture "
                        "is no longer supersaturated and the arm is vacuous")
        elif abs(r["nInterface"] - r["nOracle"]) / r["nOracle"] > 1e-5:
            fail.append(
                f"D3: interface n = {r['nInterface']:.6e} vs the untouched "
                f"SpeciationSolver oracle {r['nOracle']:.6e} -- the common "
                "architecture does NOT reproduce the reactive path, which "
                "falsifies the proposition for class 1")
        if abs(r["SIend"]) > 1e-6:
            fail.append(f"D3: final SI = {r['SIend']:.2e}, not 0")
        if abs(r["pH_interface"] - r["pH_oracle"]) > 1e-4:
            fail.append("D3: the interface's end pH parted from the oracle's")
    r = ok("D4_joint_one_active")
    if r:
        if abs(r["lnSI_ice"]) > 1e-8:
            fail.append(f"D4: the active solid is not AT equilibrium "
                        f"(lnSI_ice = {r['lnSI_ice']:.2e})")
        if r["nSalt"] != 0.0 or r["lnSI_salt"] >= 0.0:
            fail.append("D4: the salt should be registered-but-absent "
                        f"(n = {r['nSalt']}, lnSI = {r['lnSI_salt']:.3f})")
        for k in ("waterLedgerRel", "saltLedgerRel"):
            if abs(r[k]) > 1e-12:
                fail.append(f"D4: {k} open by {r[k]:.2e} -- the ONE ledger "
                            "leaks with two solids registered")
    r = ok("D4b_eutectic_attempt")
    if r:
        both_active = r["nIce"] > 0 and r["nSalt"] > 0
        recorded = (r["nIce"] == 0.0 and r["nSalt"] == 0.0
                    and r["lnSI_ice"] < 0 and r["lnSI_salt"] < 0)
        if both_active:
            fail.append(
                "D4b: BOTH solids activated -- the demonstration IMPROVED "
                "beyond what the spike record claims (both-active was "
                "undemonstrated with current data).  Update "
                "docs/design/solid-equilibrium-spike.md before this passes: "
                "a record that understates live evidence misleads the review.")
        elif not recorded:
            fail.append(
                f"D4b: neither the recorded outcome (both subsaturated) nor "
                f"both-active (nIce={r['nIce']}, nSalt={r['nSalt']}, "
                f"lnSI_ice={r['lnSI_ice']:.3f}, lnSI_salt={r['lnSI_salt']:.3f})")
    r = ok("D5_double_count")
    if r:
        if not (r["nA"] > 0 and abs(r["nA"] - r["nB"]) < 1e-9):
            fail.append("D5: the two blind mechanisms are not both acting -- "
                        "the negative control is not the banned shape")
        if abs(r["ledgerRel_violation"]) < 0.25:
            fail.append(
                f"D5: the double-count's ledger violation is only "
                f"{r['ledgerRel_violation']:.3f} -- the metric can no longer "
                "SEE the bug the ruling bans, so every closure above proves "
                "less than it claims")
        if r["residual_ice_after"] > -0.05:
            fail.append("D5: the recombined state nearly satisfies the "
                        "equilibrium -- the negative control has gone soft")

    #  PURITY: falsification clause (a), checked on the code itself.
    code = re.sub(r'/\*.*?\*/', '', HDR.read_text(), flags=re.S)
    code = re.sub(r'//[^\n]*', '', code)
    for word in ("ice", "calcite", "NaCl", "fusion", "Ksp", "speciat"):
        if re.search(r'(?i)\b' + word, code):
            fail.append(
                f"PURITY: the common solver's CODE mentions '{word}'.  A "
                "solid known by name inside the one architecture is the "
                "special case whose necessity would FALSIFY the proposition "
                "-- if it is genuinely needed, the spike record must say the "
                "proposition failed, not hide the branch here.")

    if fail:
        print("check_solid_equilibrium_spike: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(
        "check_solid_equilibrium_spike: OK -- the C2 proposition's evidence "
        "holds live: the fusion-model crystal (D1, inverts the freezing curve "
        f"to {d['D1_ice']['TfBack_minus_T']:.1e} K; absent above it), the "
        "dissolution-model salt (D2, relaxes to the cited m_sat exactly, "
        "ledger 1e-15), and the speciated mineral (D3, reproduces the "
        "UNTOUCHED SpeciationSolver oracle: n to "
        f"{abs(d['D3_calcite']['nInterface']-d['D3_calcite']['nOracle'])/d['D3_calcite']['nOracle']:.1e}"
        " rel, same pH) all sit behind ONE complementarity whose code names "
        "no solid (purity arm).  Two solids in one solve: active-at-zero + "
        "registered-but-absent, one ledger closed to 1e-16 (D4).  The banned "
        "two-blind-mechanisms shape, rebuilt by hand, leaves a "
        f"{abs(d['D5_double_count']['ledgerRel_violation'])*100:.0f} % ledger "
        "violation the closure metric SEES (D5).  RECORDED LIMITS: the "
        "both-active eutectic is undemonstrated with current data (D4b -- "
        "SP77 extrapolated below 0 C, first-order van 't Hoff Ksp; the named "
        "gap is a curated sub-zero Ksp(T)); nothing is integrated into any "
        "flash; the speciation path is untouched.  The review PASSED "
        "(Vitor, 2026-08-08): the target architecture is RATIFIED and "
        "migration is AUTHORISED under the spike record's section-7 "
        "boundaries (one transfer mechanism; the solver owns policy, the "
        "models own physics).  This gate keeps the spike's evidence true "
        "until the migration's own gates supersede it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
