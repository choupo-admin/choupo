#!/usr/bin/env python3
"""Gate: the one-fluid mixing ledger re-adds, from the records up.

    bin/curate/check_mixing_ledger.py

WHY THIS EXISTS.  The `mixingRules` props op publishes the van der Waals
one-fluid decomposition of a cubic's a_mix/b_mix -- and its own internal
identity check shares code with nothing, but its NUMBERS all come from
`EquationOfState::mixingLedger`, a window on the same buildMix the hot
path runs.  One home is the right architecture and exactly what makes
the op self-consistent under an engine defect: if buildMix went wrong,
the ledger would go wrong WITH it and the op's re-addition would still
close.  So every arm here recomputes INDEPENDENTLY -- in Python, from
the witness's own sealed records where possible.

WHAT IS CHECKED, on the witness
(tutorials/props/molecular/mixrules01_natural_gas) and scratch probes:

  (a) THE DOUBLE SUM, INDEPENDENTLY.  a_mix recomputed here from the
      published a_i, k_ij and y; b_mix from the published b_i and y; and
      the published pair terms summed.  All three must land on the
      published a_mix/b_mix at printed precision.

  (b) THE PURE LEG FROM THE RECORDS.  a_i(T) and b_i recomputed from the
      witness's OWN sealed component records (Tc, Pc, omega) through
      Soave's published formulas (a_c = 0.42747 R^2 Tc^2/Pc,
      b = 0.08664 R Tc/Pc, m = 0.48508 + 1.55171 w - 0.15613 w^2).
      This is the arm a wrong constant or a stale ledger cannot survive.

  (c) PRESSURE INVARIANCE.  The 30 bar and 1 bar ops publish IDENTICAL
      a_mix/b_mix (the rule sees only T and y) while A and B re-verify
      against their definitions at each op's own pressure and Z differs.

  (d) THE k_ij IS THE DECLARED ONE.  kij_N2_CH4 equals the value in the
      witness's own mirrored record file; both CO2 pairs are exactly 0.

  (e) PARTIAL COVERAGE IS ANNOUNCED.  The run says "2 of 3 binary
      pair(s) undeclared" -- a declared block must not silence the pairs
      it does not name.

  (f) NO ONE-FLUID RULE REFUSES BY NAME.  A gamma-phi case whose vapour
      is idealGas must refuse the op, naming the model and the reason.

  (g) THE PR ROUTE SERVES THE SAME LEDGER.  The witness re-run under
      PengRobinson (kij record dropped -- an SRK kij is not portable)
      must run, re-add under this gate's own double sum, and announce
      its all-absent kij list.

SABOTAGE-VERIFIED (performed, gate observed failing, reverted, rebuild
between rounds):

  S1  kij dropped from the hot path's a_mix (one_kij = 1) -> the OP's OWN
      re-addition refusal fired first (its ledger still carried 0.0289
      against an a_mix that ignored it), witness exit 1, gate FAILED via
      could-not-run.  That refusal branch is therefore OBSERVED live.
  S2  mixingLedger handed a_c without alpha -> same route as S1 (the op
      re-adds from the stale a against the true a_mix).
  S2b the op PUBLISHED a_i scaled 1.001 with its internal identity left
      intact (consistent-but-wrong) -> arms (a), (b) and (g), which is
      the coverage the internal check structurally cannot give.
  S3  the partial-coverage announcement suppressed -> arm (e).
  S4  the refusal text stripped of the model name and "one-fluid" ->
      SURVIVED its first run: the arm grepped the WHOLE output, and the
      run banner prints "idealGas" whatever the refusal says.  The arm
      now judges the refusal line alone, and the re-run failed.

NOT CHECKED, deliberately: whether SRK with this kij reproduces any
MEASURED natural-gas property (no such measurement is in the tree; the
witness's header says so); and the dadT_mix channel (no independent
recompute here -- it feeds the departure functions, which
check_explain_property audits from the other side).

Exit 1 naming the arm that failed.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc" / "choupoProps"
WITNESS = ROOT / "tutorials" / "props" / "molecular" / "mixrules01_natural_gas"
FLASH01 = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"

R = 8.314462618
COMPS = ["N2", "CH4", "CO2"]
Y = {"N2": 0.05, "CH4": 0.90, "CO2": 0.05}
T = 250.0

IDEAL_CONTROL = """
application   choupoProps;
description   "probe: mixingRules against a model with no one-fluid rule";
verbosity     3;
"""

IDEAL_OPS = """
operations
(
    {
        name  mixNone;
        type  mixingRules;
        state
        {
            T            360 K;
            P            1 bar;
            composition  { benzene 0.5;  toluene 0.5; }
        }
    }
);
"""


def run_case(case: Path):
    return subprocess.run([str(BIN), str(case)], capture_output=True,
                          text=True, timeout=300, cwd=str(ROOT))


def result_json(stdout: str):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  stdout, re.S)
    return json.loads(m.group(1)) if m else None


def diag_of(js, name):
    for orr in js.get("operationResults", []):
        if orr.get("name") == name:
            return orr.get("diagnostics", {})
    return {}


def record_field(path: Path, key: str) -> float:
    m = re.search(rf"^\s*{key}\s+([-0-9.eE+]+)\s*;", path.read_text(),
                  re.M)
    if not m:
        raise KeyError(f"{path.name} declares no `{key}`")
    return float(m.group(1))


def soave_pure(Tc: float, Pc_bar: float, omega: float, T_K: float):
    """Soave (1972), the same closed forms SRK.H documents."""
    Pc = Pc_bar * 1.0e5
    a_c = 0.42747 * R * R * Tc * Tc / Pc
    b = 0.08664 * R * Tc / Pc
    m = 0.48508 + 1.55171 * omega - 0.15613 * omega * omega
    alpha = (1.0 + m * (1.0 - math.sqrt(T_K / Tc))) ** 2
    return a_c * alpha, b


def rel_gap(x: float, ref: float) -> float:
    return abs(x - ref) / max(abs(ref), 1.0e-30)


def double_sum(d, comps):
    """a_mix and b_mix from the PUBLISHED a_i, b_i, kij, y -- this gate's
    own arithmetic, never the ledger's."""
    a_mix = 0.0
    b_mix = 0.0
    for i, ni in enumerate(comps):
        b_mix += d[f"y_{ni}"] * d[f"b_{ni}"]
        for j, nj in enumerate(comps):
            if i < j:
                kij = d.get(f"kij_{ni}_{nj}", d.get(f"kij_{nj}_{ni}", 0.0))
            elif i > j:
                kij = d.get(f"kij_{nj}_{ni}", d.get(f"kij_{ni}_{nj}", 0.0))
            else:
                kij = 0.0
            a_mix += (d[f"y_{ni}"] * d[f"y_{nj}"] * (1.0 - kij)
                      * math.sqrt(d[f"a_{ni}"] * d[f"a_{nj}"]))
    return a_mix, b_mix


def main() -> int:
    fail = []
    if not BIN.exists():
        print("check_mixing_ledger: FAILED\n  no choupoProps binary -- a"
              " check that cannot run must not pass.  Run `make all`.")
        return 1

    r = run_case(WITNESS)
    js = result_json(r.stdout) if r.returncode == 0 else None
    if js is None:
        print("check_mixing_ledger: FAILED\n  the witness did not run (exit "
              f"{r.returncode})\n" + (r.stdout + r.stderr)[-500:])
        return 1
    d30 = diag_of(js, "mix_30bar")
    d01 = diag_of(js, "mix_1bar")

    # ---- (a) the double sum, independently ------------------------------
    try:
        aRe, bRe = double_sum(d30, COMPS)
        if rel_gap(aRe, d30["a_mix"]) > 1e-4:
            fail.append(f"(a) a_mix recomputed here is {aRe:.6e}, the op"
                        f" published {d30['a_mix']:.6e}")
        if rel_gap(bRe, d30["b_mix"]) > 1e-4:
            fail.append(f"(a) b_mix recomputed here is {bRe:.6e}, the op"
                        f" published {d30['b_mix']:.6e}")
        termSum = sum(v for k, v in d30.items() if k.startswith("term_"))
        if rel_gap(termSum, d30["a_mix"]) > 1e-4:
            fail.append(f"(a) the published pair terms sum to {termSum:.6e},"
                        f" not the published a_mix {d30['a_mix']:.6e}")
    except KeyError as e:
        fail.append(f"(a) the witness stopped publishing {e}")

    # ---- (b) the pure leg from the sealed records -----------------------
    for name in COMPS:
        rec = WITNESS / "constant" / "components" / f"{name}.dat"
        try:
            a_i, b_i = soave_pure(record_field(rec, "Tc"),
                                  record_field(rec, "Pc"),
                                  record_field(rec, "omega"), T)
            if rel_gap(a_i, d30.get(f"a_{name}", 1e9)) > 1e-4:
                fail.append(f"(b) a_{name}(250 K) from the record's own"
                            f" Tc/Pc/omega is {a_i:.6e}, the ledger"
                            f" published {d30.get(f'a_{name}'):.6e}")
            if rel_gap(b_i, d30.get(f"b_{name}", 1e9)) > 1e-4:
                fail.append(f"(b) b_{name} from the record is {b_i:.6e},"
                            f" the ledger published"
                            f" {d30.get(f'b_{name}'):.6e}")
        except KeyError as e:
            fail.append(f"(b) {e}")

    # ---- (c) pressure invariance + the dimensionless definitions --------
    for k in ("a_mix", "b_mix"):
        if d30.get(k) != d01.get(k):
            fail.append(f"(c) {k} differs between 30 bar and 1 bar"
                        f" ({d30.get(k)} vs {d01.get(k)}) -- the one-fluid"
                        " rule sees only T and y")
    for d, tag in ((d30, "mix_30bar"), (d01, "mix_1bar")):
        try:
            RT = R * d["T_K"]
            if rel_gap(d["a_mix"] * d["P_Pa"] / (RT * RT), d["A"]) > 1e-4:
                fail.append(f"(c) {tag}: A does not re-verify against"
                            " a_mix*P/(RT)^2")
            if rel_gap(d["b_mix"] * d["P_Pa"] / RT, d["B"]) > 1e-4:
                fail.append(f"(c) {tag}: B does not re-verify against"
                            " b_mix*P/(RT)")
        except KeyError as e:
            fail.append(f"(c) {tag} stopped publishing {e}")
    if abs(d30.get("Z_vapour", 0.0) - d01.get("Z_vapour", 0.0)) < 1e-3:
        fail.append("(c) Z at 30 bar and 1 bar are indistinguishable -- the"
                    " pressure is not reaching the cubic")

    # ---- (d) the kij is the declared one --------------------------------
    kijRec = WITNESS / "constant" / "parameters" / "SRK" / "N2-CH4.dat"
    try:
        declared = record_field(kijRec, "kij")
        if d30.get("kij_N2_CH4") != declared:
            fail.append(f"(d) the ledger's kij_N2_CH4 = "
                        f"{d30.get('kij_N2_CH4')} is not the record's"
                        f" {declared}")
    except KeyError as e:
        fail.append(f"(d) {e}")
    for pair in ("kij_N2_CO2", "kij_CH4_CO2"):
        if d30.get(pair) != 0.0:
            fail.append(f"(d) {pair} = {d30.get(pair)} -- an undeclared pair"
                        " must run exactly 0")
    if d30.get("pairs_kij_nonzero") != 1.0 or d30.get("pairs_total") != 3.0:
        fail.append("(d) the pair counts moved"
                    f" (nonzero {d30.get('pairs_kij_nonzero')},"
                    f" total {d30.get('pairs_total')})")

    # ---- (e) partial coverage is announced ------------------------------
    if "2 of 3 binary pair(s) undeclared" not in r.stdout:
        fail.append("(e) the partial-coverage announcement is gone -- a"
                    " declared block silences the pairs it does not name")

    with tempfile.TemporaryDirectory(prefix="mixLedger.") as td:
        # ---- (f) no one-fluid rule refuses by name -----------------------
        probe = Path(td) / "idealProbe"
        (probe / "system").mkdir(parents=True)
        shutil.copytree(FLASH01 / "constant", probe / "constant")
        (probe / "system" / "controlDict").write_text(IDEAL_CONTROL)
        (probe / "system" / "propsDict").write_text(IDEAL_OPS)
        rf = run_case(probe)
        out = rf.stdout + rf.stderr
        if rf.returncode == 0:
            fail.append("(f) mixingRules over an idealGas vapour ran to"
                        " exit 0 -- a table was published for arithmetic"
                        " the model does not run")
        else:
            #  Judge the REFUSAL LINE, never the whole output: the run
            #  banner prints "idealGas" whatever the refusal says, so a
            #  whole-output grep is satisfied by text the refusal did not
            #  write (sabotage S4 survived exactly that way).
            refusal = next((ln for ln in out.splitlines()
                            if "fatal error" in ln), "")
            if ("one-fluid" not in refusal
                    or "'idealGas'" not in refusal):
                fail.append("(f) the no-one-fluid refusal no longer names"
                            " the model and the reason on its own line:"
                            f" {refusal[:200]}")

        # ---- (g) the PR route serves the same ledger ---------------------
        pr = Path(td) / "prProbe"
        shutil.copytree(WITNESS, pr)
        for junk in pr.glob("log.*"):
            junk.unlink()
        (pr / "constant" / "propertyManifest").unlink()
        tp = pr / "constant" / "thermoPhysPropDict"
        t = tp.read_text().replace("model      SRK;",
                                   "model      PengRobinson;")
        t = re.sub(r"binaryInteractions\s*\{.*?\}\s*\}", "", t, flags=re.S)
        tp.write_text(t)
        rp = run_case(pr)
        jp = result_json(rp.stdout) if rp.returncode == 0 else None
        if jp is None:
            fail.append(f"(g) the PR probe did not run (exit"
                        f" {rp.returncode})")
        else:
            dp = diag_of(jp, "mix_30bar")
            try:
                aRe, bRe = double_sum(dp, COMPS)
                if rel_gap(aRe, dp["a_mix"]) > 1e-4:
                    fail.append("(g) the PR ledger does not re-add under"
                                " this gate's own double sum")
                if dp["a_mix"] == d30.get("a_mix"):
                    fail.append("(g) PR and SRK published the SAME a_mix --"
                                " the model is not reaching the ledger")
            except KeyError as e:
                fail.append(f"(g) the PR ledger stopped publishing {e}")
            if "all 3 binary pair(s) run kij = 0" not in rp.stdout:
                fail.append("(g) the PR probe's all-absent kij announcement"
                            " is gone")

    if fail:
        print("check_mixing_ledger: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_mixing_ledger: OK -- the witness's a_mix/b_mix re-add under"
          " this gate's own double sum from the published a_i/kij/y, the"
          " pure a_i/b_i reproduce from the sealed records' Tc/Pc/omega"
          " through Soave's closed forms, a_mix/b_mix are pressure-invariant"
          " while A/B/Z re-verify at each pressure, the N2-CH4 kij is the"
          " record's own 0.0289 with both CO2 pairs at exactly 0, partial"
          " kij coverage is announced, the idealGas case refuses the op by"
          " name, and the PengRobinson route re-adds independently.  NOT"
          " checked: any MEASURED property (none in the tree for this"
          " witness) and the dadT_mix channel (audited from the departure"
          " side by check_explain_property).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
