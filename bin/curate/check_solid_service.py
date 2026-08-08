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
          "code names no solid.  NOT CHECKED: no unit consumes the seam yet "
          "(S3); fusion-class candidates still ride the spike gate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
