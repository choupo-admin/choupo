#!/usr/bin/env python3
"""Gate: a seal follows its case's reach -- $variables seen, growth learned.

    bin/curate/check_seal_growth.py

WHY THIS EXISTS.  Two importer defects found 2026-08-28 (recorded in
bjerrum01's variables block), fixed 2026-08-30:

  * the dependency closure harvested by regex and its value patterns
    expected a leading digit, so `Li $bg;` seeded nothing -- the seal
    shipped without species/Li.dat and the sealed run refused on a record
    the closure never staged;
  * a sealed case whose reach GREW could not re-seal: the staged
    validation run refused and the importer died BEFORE reading the
    consumption ledger, so the engine's "re-run bin/choupo-import" advice
    could not work and the only working sequence (manual manifest surgery)
    was written nowhere.

WHAT IS CHECKED, on a MINIMAL sealed speciation case this gate builds
itself (one op, so two imports stay cheap):

  (a) FIRST SEAL.  The mini case (Na/Cl literals) seals.

  (b) GROWTH THROUGH A $VARIABLE IS SEEN BY THE HARVEST.  A new op adds
      `Li $bg;` with `bg` declared in the case's `variables {}`; the
      re-import must seal species/Li.dat, claim it in the manifest, and
      do it WITHOUT the ledger-learning fallback ("learning ... from the
      observed ledger" absent) -- proving the harvest itself resolved the
      variable rather than being rescued.

  (c) THE COMPONENT ASK REACHES THE LEDGER.  A sealed run missing a
      component record must write "- components/<name>.dat" into
      CHOUPO_RECORD_LEDGER before refusing -- this seam note is what the
      learn-on-refusal path stands on for components (Database.cpp noted
      nothing there until 2026-08-30).

WHAT IS NOT CHECKED, deliberately, and why: the learn-on-REFUSAL path
itself (validate_staged reading the ledger of a refused staged run).  Any
record the harvest misses is a harvest bug, so no honest probe reaches
that branch without sabotaging the harvest -- which was DONE on
2026-08-30 (resolve_dict_variables neutered; observed: "staged run
refused (exit 1), and the ledger names the record(s) it wanted -- the
reach grew; learning instead of failing", then "+ species/Li.dat", seal
complete).  A gate that sabotages on every run is the destructive-session
class; this one records the observation instead and pins the seam it
depends on (arm c).

Exit 1 naming the arm that failed.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CONTROL = """recordType controlDict;
application   choupoProps;
description   "seal-growth gate probe";
verbosity     2;
"""

THERMO = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( water );
equilibrium
{
    formulation gammaPhi;
    liquid  { activityModel ideal;  standardState pureLiquid; }
    vapour  { fugacityModel idealGas; }
}
"""

PROPS_V1 = """operations
(
    { name base; type speciate; analyticalTotals { Na 0.001 mol/kg; Cl 0.001 mol/kg; }
      pH solve; activityModel davies; output { file base.csv; } }
);
"""

PROPS_V2 = """variables
{
    bg  0.0005 mol/kg;
}

operations
(
    { name base; type speciate; analyticalTotals { Na 0.001 mol/kg; Cl 0.001 mol/kg; }
      pH solve; activityModel davies; output { file base.csv; } }
    { name grown; type speciate; analyticalTotals { Cl 0.0005 mol/kg; Li $bg; }
      pH solve; activityModel davies; output { file grown.csv; } }
);
"""


def run_import(case: Path):
    return subprocess.run([str(ROOT / "bin" / "choupo-import"), str(case)],
                          capture_output=True, text=True, timeout=900)


def main() -> int:
    fail = []
    binProps = ROOT / "build" / "linux64Gcc" / "choupoProps"
    if not binProps.exists():
        print("check_seal_growth: FAILED\n  no choupoProps binary -- a check"
              " that cannot run must not pass.  Run `make all`.")
        return 1

    with tempfile.TemporaryDirectory(prefix="sealGrowth.") as td:
        case = Path(td) / "growProbe"
        (case / "system").mkdir(parents=True)
        (case / "constant").mkdir()
        (case / "system" / "controlDict").write_text(CONTROL)
        (case / "system" / "propsDict").write_text(PROPS_V1)
        (case / "constant" / "thermoPhysPropDict").write_text(THERMO)
        (case / "growProbe.cho").write_text("")

        # ---- (a) first seal ------------------------------------------------
        r = run_import(case)
        if r.returncode != 0 \
           or not (case / "constant" / "propertyManifest").exists():
            fail.append("(a) the mini case did not seal (exit "
                        f"{r.returncode}):\n" + (r.stdout + r.stderr)[-600:])
        else:
            # ---- (b) growth through a $variable ---------------------------
            (case / "system" / "propsDict").write_text(PROPS_V2)
            r2 = run_import(case)
            out2 = r2.stdout + r2.stderr
            if r2.returncode != 0:
                fail.append("(b) the GROWN case did not re-seal (exit "
                            f"{r2.returncode}) -- the 2026-08-28 defect is"
                            " back:\n" + out2[-600:])
            else:
                if not (case / "constant" / "species" / "Li.dat").exists():
                    fail.append("(b) species/Li.dat did not enter the seal --"
                                " `Li $bg;` is invisible to the closure again")
                mani = (case / "constant" / "propertyManifest").read_text()
                if "species/Li.dat" not in mani:
                    fail.append("(b) the manifest does not claim"
                                " species/Li.dat")
                if "from the observed ledger" in out2:
                    fail.append("(b) the re-seal needed the ledger-learning"
                                " FALLBACK -- the harvest itself no longer"
                                " resolves $variables (the fallback saved it,"
                                " but the first line of defence is gone)")

            # ---- (c) the component ask reaches the ledger ------------------
            #  Remove a claimed component record from the sealed case and run
            #  it: the refusal must be PRECEDED by a ledger note at the seam.
            comp = case / "constant" / "components" / "water.dat"
            if comp.exists():
                comp.unlink()
                ledger = Path(td) / "asked.txt"
                env = {k: v for k, v in os.environ.items()
                       if k != "CHOUPO_HOME"}
                env["CHOUPO_RECORD_LEDGER"] = str(ledger)
                r3 = subprocess.run([str(binProps), "."], cwd=str(case),
                                    env=env, capture_output=True, text=True,
                                    timeout=300)
                if r3.returncode == 0:
                    fail.append("(c) a sealed case missing a claimed"
                                " component RAN -- the seal is not sealing")
                elif not ledger.exists() \
                        or "- components/water.dat" not in ledger.read_text():
                    fail.append("(c) the refused run left no"
                                " '- components/water.dat' in the consumption"
                                " ledger -- the learn-on-refusal path is"
                                " blind to component growth again")
            else:
                fail.append("(c) probe is STALE: the seal carries no"
                            " components/water.dat to remove")

    if fail:
        print("check_seal_growth: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_seal_growth: OK -- a minimal sealed case re-seals when its"
          " reach grows through a `$variable` ion (species record installed"
          " and claimed, WITHOUT the ledger-learning fallback -- the harvest"
          " itself resolved it), and a sealed run missing a component notes"
          " '- components/<name>.dat' at the resolver seam before refusing."
          "  NOT checked: the learn-on-refusal branch itself -- no honest"
          " probe reaches it (a harvest miss is a harvest bug); it was"
          " sabotage-verified 2026-08-30 and the observed output is in this"
          " gate's docstring.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
