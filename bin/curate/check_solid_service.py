#!/usr/bin/env python3
"""Gate: the S2b service seam -- assembly from the case's own declaration.

    bin/curate/check_solid_service.py

Migration S2 (boundaries R1-R4).  R2 as code layout: DATA defines what a
solid IS (the provider's mineral records), the CASE declares whether it is
ADMITTED, the SERVICE decides whether it is PRESENT.  This gate proves the
seam end to end:

  A1  the ADMITTED list is parsed from a real case declaration
      (flash16's chemistryDict `solidPhases ( calcite )`) -- never typed
      into the probe;
  A2  the SolidEquilibriumService reproduces the provider's INTERNAL
      equilibrate oracle on the same aqueous state: formed amount (1e-6
      rel), final SI ~ 0, same pH -- through candidate ASSEMBLY (S2a's
      provider-resolved sinks + the common complementarity), not the
      spike's hand-built closures;
  A3  THE CHAINING CARRIED: the consumed sink legs name the CARBONATE
      MASTER (HCO3), though the mineral record's leg says CO3 -- evidence
      the service ran on the provider's resolution (one home), because a
      hand copy of the record would name CO3;
  A4  an appearance is NARRATED (>= 1 event -- solver/service behaviour
      per R1);
  A5  the NEGATIVE: an admitted name the data does not define refuses
      through the provider's own message, naming what is available;
  A6  PURITY: the service's code (comments stripped) names no mineral and
      no solid class -- the R4 layering, executable.

NOT CHECKED, said plainly: no unit operation consumes the seam yet (the
internal equilibrate path is untouched until S3); ice/fusion candidates
ride the spike gate until the service grows their assembly.
"""
import json
import math
import pathlib
import re
import subprocess
import sys

ROOT  = pathlib.Path(__file__).resolve().parents[2]
SRC   = ROOT / "bin" / "curate" / "_solidServiceProbe.cpp"
SVC   = ROOT / "src" / "thermo" / "solidEquilibrium" / "SolidEquilibriumService.cpp"
PROBE = ROOT / "build" / "linux64Gcc" / "_solidServiceProbe"
CASE  = ROOT / "tutorials" / "steady" / "flash" / "flash16_calcite_precipitation"


def build():
    r = subprocess.run(
        ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(SRC),
         str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
         "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"), "-o", str(PROBE)],
        capture_output=True, text=True)
    return r.returncode, r.stderr[-1200:]


def run_probe(mineral: str):
    return subprocess.run([str(PROBE), mineral], capture_output=True,
                          text=True, timeout=300,
                          env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})


def main() -> int:
    fail = []
    if not (ROOT / "build" / "linux64Gcc" / "libchoupo.so").exists():
        print("check_solid_service: FAILED\n  libchoupo.so not built -- a "
              "check that cannot run must not pass")
        return 1
    rc, err = build()
    if rc != 0:
        print("check_solid_service: FAILED\n  probe did not compile -- a "
              "surface the seam stands on moved.\n" + err)
        return 1

    # A1 -- the admitted list comes from the CASE's declaration.
    chem = (CASE / "constant" / "chemistryDict").read_text()
    chem = re.sub(r"/\*.*?\*/", "", chem, flags=re.S)
    m = re.search(r"solidPhases\s*\(\s*([\w\s]+?)\s*\)", chem)
    if not m:
        print("check_solid_service: FAILED\n  flash16's chemistryDict "
              "declares no solidPhases -- the witness lost its declaration")
        return 1
    admitted = m.group(1).split()
    if admitted != ["calcite"]:
        fail.append(f"A1: flash16 declares {admitted!r}, expected ['calcite'] "
                    "-- update this gate WITH the case, not instead of it")

    p = run_probe(admitted[0])
    j = re.search(r"<<<JSON\n(.*?)JSON>>>", p.stdout, re.S)
    if p.returncode != 0 or not j:
        print("check_solid_service: FAILED\n  probe run failed (exit "
              f"{p.returncode})\n" + (p.stdout + p.stderr)[-800:])
        return 1
    d = json.loads(j.group(1))

    # A2 -- the oracle reproduced through assembly.
    if d["nOracle"] <= 0:
        fail.append(f"A2: oracle formed {d['nOracle']!r} -- the witness state "
                    "no longer precipitates, the comparison is vacuous")
    elif abs(d["nService"] - d["nOracle"]) > 1e-6 * d["nOracle"]:
        fail.append(f"A2: service n = {d['nService']!r} vs oracle "
                    f"{d['nOracle']!r} -- the seam disagrees with the "
                    "mechanism it must replace")
    if abs(d["siService"]) > 1e-6:
        fail.append(f"A2: final SI = {d['siService']!r} -- the present phase "
                    "does not sit on its saturation ceiling")
    if abs(d["pHService"] - d["pHOracle"]) > 1e-6:
        fail.append(f"A2: pH {d['pHService']!r} vs oracle {d['pHOracle']!r}")

    # A3 -- the chaining carried (record says CO3; the resolution says HCO3).
    if "HCO3" not in d["sinkLegs"]:
        fail.append(f"A3: sink legs '{d['sinkLegs']}' name no HCO3 -- the "
                    "carbonate chaining did not come through the provider's "
                    "resolution")
    if "CO3:" in d["sinkLegs"].replace("HCO3:", ""):
        fail.append(f"A3: sink legs '{d['sinkLegs']}' still name CO3 raw -- "
                    "a hand copy of the record's legs, not the resolution")

    # A4 -- narration.
    if d["events"] < 1:
        fail.append("A4: no appearance event -- presence changed silently")

    # A7 (S3) -- TWO ROUTES, ONE MECHANISM: the coupled route (the provider's
    # own simultaneous solve through the service's door) must equal the
    # oracle EXACTLY, and the general probed route must agree with both --
    # the executable claim that these are one complementarity twice
    # implemented, never two mechanisms.
    if d["nCoupled"] != d["nOracle"]:
        fail.append(f"A7: coupled route n = {d['nCoupled']!r} != oracle "
                    f"{d['nOracle']!r} -- the door changed the math")
    if abs(d["pHCoupled"] - d["pHOracle"]) != 0.0:
        fail.append(f"A7: coupled route pH {d['pHCoupled']!r} != oracle "
                    f"{d['pHOracle']!r}")

    # A8 (S3b) -- THE ONE-ENTRY LOCKDOWN: no code outside the service fills
    # SpeciationInput::equilibrate.  R2's sentence made a compile fact
    # (check_layering-style): material enters a solid phase through ONE door,
    # and this arm is what makes a second door a FAILING build instead of a
    # code-review hope.  Readers (.equilibrate.empty(), .clear()) stay free.
    writers = []
    for ext in ("*.cpp", "*.H"):
        for f in (ROOT / "src").rglob(ext):
            if f.name == "SolidEquilibriumService.cpp":
                continue
            body = re.sub(r"/\*.*?\*/", "", f.read_text(), flags=re.S)
            body = re.sub(r"//[^\n]*", "", body)
            for i, line in enumerate(body.splitlines(), 1):
                if re.search(r"\.equilibrate\s*=", line):
                    writers.append(f"{f.relative_to(ROOT)}:{i}")
    if writers:
        fail.append("A8: SpeciationInput::equilibrate is filled outside the "
                    "service door: " + ", ".join(writers))

    # A9 (S4a, amended S4b 2026-08-09) -- THE C3 UNIFORM GRAMMAR, three
    # claims run live from a synthesized case (vlle01's dict rewritten to
    # `phases ( ... )`):
    #   (a) COEXISTENCE: the uniform two-liquid declaration reproduces
    #       vlle01's own split (the grammar changes nothing it does not say);
    #   (b) REFUSED-BY-SHAPE: adding `{ name ice; type solid; component
    #       water; }` BESIDE vlle01's two liquids and vapour BUILDS the
    #       package and reaches the flash's S4c refusal -- the SERVED shape
    #       (one liquid, no vapour) is the SLE branch, witnessed by
    #       flash21_freeze_concentration and asserted in A10 below; every
    #       OTHER shape must refuse by name, never run as a plain VLE with
    #       the declaration dropped.  (Until S4b this arm asserted the old
    #       unconditional refusal; the claim moved with the architecture.)
    #   (c) TWO AUTHORITIES: `phases` beside `liquidPhases` refuses.
    import shutil, tempfile
    with tempfile.TemporaryDirectory() as td:
        base = pathlib.Path(td) / "c3"
        shutil.copytree(ROOT / "tutorials/steady/flash/vlle01_waterButanol", base)
        tp = base / "constant" / "thermoPhysPropDict"
        s0 = tp.read_text()
        m = re.search(r"liquidPhases\s*\((.*?)\);", s0, re.S)
        entries = re.findall(r"\{[^}]*\}", m.group(1)) if m else []
        if not m or len(entries) < 2:
            fail.append("A9: vlle01's liquidPhases form moved -- resynthesize "
                        "this probe against the new grammar")
        else:
            uni = "phases\n    (\n" + "".join(
                "        " + e.replace("{", "{ type liquid; ", 1) + "\n"
                for e in entries)
            solid_row = "        { name ice; type solid; component water; }\n"

            def run_case():
                for junk in base.glob("log.*"):
                    junk.unlink()
                return subprocess.run(
                    [str(ROOT / "bin" / "runCase"), "-f", str(base)],
                    capture_output=True, text=True, timeout=600,
                    env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})

            # (a) coexistence
            tp.write_text(s0[:m.start()] + uni + "    );" + s0[m.end():])
            run_case()
            logf = base / "log.choupoSolve"
            log = logf.read_text() if logf.exists() else ""
            if "UNIFORM" not in log:
                fail.append("A9a: the uniform-phases announce did not fire")
            if '"water": 0.98299754' not in log:
                fail.append("A9a: the uniform two-liquid case does not "
                            "reproduce vlle01's split (waterRich x_water "
                            "0.98299754...) -- the grammar changed physics")
            # (b) refused by shape (solid beside vapour + two liquids = S4c)
            tp.write_text(s0[:m.start()] + uni + solid_row + "    );"
                          + s0[m.end():])
            run_case()
            log = logf.read_text() if logf.exists() else ""
            if "in a shape the flash does not serve" not in log:
                fail.append("A9b: a solid declared beside a vapour and two "
                            "liquids did not reach the flash's S4c refusal "
                            "-- either the grammar dropped it silently, the "
                            "refusal moved, or the flash ran a shape it "
                            "does not serve")
            # (c) two authorities
            tp.write_text(s0[:m.start()] + "liquidPhases ( { name x; } );\n    "
                          + uni + "    );" + s0[m.end():])
            run_case()
            log = logf.read_text() if logf.exists() else ""
            if "two authorities on one phase set" not in log:
                fail.append("A9c: phases beside liquidPhases did not refuse")

    # A10 (S4b) -- THE SERVED SHAPE: one liquid + one crystallizing solid,
    # no vapour, run live from a copy of the flash21 witness.  Three claims:
    # the SLE branch (not a refusal) answers; the answer satisfies the
    # closed-form freezing-point-depression identity gamma_w * x_w =
    # exp(-dG_fus/RT), recomputed HERE from the record's own Hfus/Tfus
    # (never from the engine's aEq echo alone); and the duty is withheld as
    # the NAMED rung gap, not published as a fluid-only number.
    with tempfile.TemporaryDirectory() as td:
        base = pathlib.Path(td) / "sle"
        shutil.copytree(
            ROOT / "tutorials/steady/flash/flash21_freeze_concentration", base)
        for junk in base.glob("log.*"):
            junk.unlink()
        r = subprocess.run(
            [str(ROOT / "bin" / "runCase"), "-f", str(base)],
            capture_output=True, text=True, timeout=600,
            env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
        logf = base / "log.choupoSolve"
        log = logf.read_text() if logf.exists() else ""
        if r.returncode != 0 or "liquid + solid (SLE" not in log:
            fail.append("A10: the flash21 SLE witness did not run the "
                        "LIQUID+SOLID branch (rc=%d)" % r.returncode)
        else:
            ma = re.search(r'"a_water":\s*([0-9.eE+-]+)', log)
            wat = (ROOT / "data/standards/components/water.dat").read_text()
            hfus = float(re.search(r"Hfus\s+([0-9.]+)", wat).group(1))
            tfus = float(re.search(r"triplePoint\s*\{[^}]*?\bT\s+([0-9.]+)",
                                   wat, re.S).group(1))
            T = 258.15
            a_eq = math.exp(-hfus * (1.0 - T / tfus) / (8.31446 * T))
            if not ma:
                fail.append("A10: flash21 published no a_water KPI")
            elif abs(float(ma.group(1)) - a_eq) > 1e-6:
                fail.append("A10: the SLE answer is off the closed-form "
                            "identity: a_water=%s vs exp(-dG_fus/RT)=%.9f"
                            % (ma.group(1), a_eq))
            if '"Q"' in log.split("freezer01", 1)[-1].split("}", 1)[0]:
                fail.append("A10: an SLE duty was PUBLISHED -- the rung gap "
                            "must withhold Q, never price the crystal as "
                            "fluid")
            if "duty UNAVAILABLE" not in log:
                fail.append("A10: the withheld duty did not announce its "
                            "named gap")

    # A5 -- the negative.
    n = run_probe("notAMineralAnywhere")
    neg = n.stdout + n.stderr
    if n.returncode == 0 or "not in minerals.dat" not in neg:
        fail.append("A5: an undefined admitted mineral did not refuse "
                    "through the provider's message")

    # A6 -- purity of the service code.
    body = re.sub(r"/\*.*?\*/", "", SVC.read_text(), flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    for word in ("calcite", "gypsum", "NaCl", "ice", "fusion", "Ksp"):
        #  \b: 'ice' must not match inside 'Service' -- the first run of this
        #  arm failed on the class's own name, which is the gate testing the
        #  gate, kept as a comment so the boundary is a recorded lesson.
        if re.search(rf"\b{word}\b", body):
            fail.append(f"A6: the service's CODE names '{word}' -- the seam "
                        "must know no solid (R4)")

    if fail:
        print("check_solid_service: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_solid_service: OK -- the S2/S3 seam holds live: TWO ROUTES, "
          "ONE MECHANISM (the coupled route through the service's door equals "
          "the internal solve exactly; the general probed route agrees to "
          "1e-6) -- and flash16's own "
          "chemistryDict declaration assembles through the provider-resolved "
          f"sinks ({d['sinkLegs']} -- the CO3 leg chained onto the carbonate "
          "master, not copied), the service reproduces the internal "
          f"equilibrate oracle (n rel {abs(d['nService']-d['nOracle'])/d['nOracle']:.1e}, "
          f"SI {d['siService']:.1e}, same pH), the appearance is narrated, an "
          "undefined mineral refuses with the available list, and the service "
          "code names no solid.  THE LOCKDOWN HOLDS (A8): the service is the "
          "engine's ONLY writer of the equilibrate channel -- Speciate, "
          "ScalingScan and ReactiveVLE all walk through the door.  THE C3 "
          "GRAMMAR HOLDS (A9): the uniform phases list reproduces vlle01's "
          "split unchanged, a solid declared in an UNSERVED shape (beside a "
          "vapour and two liquids) refuses by name as the S4c gap, and two "
          "authorities refuse.  THE SLE BRANCH SERVES (A10): flash21's "
          "liquid+crystal answer sits on the closed-form identity gamma_w * "
          "x_w = exp(-dG_fus/RT) recomputed here from water.dat's own "
          "Hfus/Tfus, and the duty is WITHHELD as the named rung gap (never "
          "a fluid-only Q).  NOT CHECKED: the SLE duty itself (waits on the "
          "enthalpy-rung ratification); solid beside vapour or a second "
          "liquid (S4c, refused); inert solids (stub, refused).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
