#!/usr/bin/env python3
"""Gate: ONE CASE, TWO MODES -- a membrane fitted in Properties mode, the
record it writes, and the Process mode that refuses a stale one.
    bin/curate/check_fit_then_simulate.py

WHY THIS EXISTS (DEV.md 4c C149, C152).  `fitParameters` gained a residual of
kind `membrane`: a membrane record's transport parameters (the DSPM-DE pore,
an SDEM or solution-diffusion permeance, ...) estimated from measured
rejections and fluxes, one operating point per dataset row, on the evidence
partition / band / identifiability / verdict discipline.  Its `output {
record ...; }` writes a `kind` membrane record into the case's constant/assets/
with a `fit {}` block of FINGERPRINTS, and a Process-mode run of the SAME case
(system/flowsheetDict beside system/propsDict) reads that record and REFUSES
it when its inputs have moved.  Four claims are pinned here, each by RUNNING
the engine (nothing is read from a stale run output):

  (a) IDENTIFIABILITY, ON DATA THE ENGINE GENERATED ITSELF.  A synthetic NF270
      (r_p 0.62 nm, X_d -25 mol/m3, everything else the witness's) is solved by
      the props BENCH (`poreTransport`, an independent caller of the same
      DSPM-DE law at the witness's own J_v points); its intrinsic rejections
      become four zero-noise datasets (`source synthetic`), and the witness's
      own fit, started at (0.50 nm, -5), must recover both parameters to 1e-5
      relative, converge, call itself identifiable, reach chi2 < 1e-12 and a
      held-out AAD < 1e-4 points, and say `validated`.
  (b) THE WITNESS (membrane24_fit_then_simulate, real data: Fernandez de
      Labastida & Yaroshchuk 2021, CC BY 4.0) in Properties mode: exit 0, the
      verdict word reaches the result JSON's `curation`, and the record it
      writes is BYTE-IDENTICAL to the committed one (a re-run of an unchanged
      case must not dirty the tree), its FITTED values are the published
      fit.<i>.value to 6 significant figures, and no fitted value carries more
      than 6.
  (c) THE ROUND TRIP: Process mode runs to exit 0, prints the `[fitted]` line
      naming the operation that wrote the record and its verdict, and the
      stage's DSPM-DE banner shows the RECORD's pore radius and charge.
  (d) THE FINGERPRINTS, on copies of the witness: a moved dataset NUMBER, a
      changed fit block (the band), a hand-edited fitted value and a changed
      base record each REFUSE Process mode by name with the remedy (`runCase
      ... props`); a COMMENT added to a dataset does not (the fingerprint is
      the canonical parse); a case whose propsDict is gone refuses; and the
      remedy works -- Properties mode re-fits the moved dataset and Process
      mode then runs.
  (e) THE TWO MODES THROUGH runCase: `runCase <copy> props` and `runCase
      <copy> process` both exit 0 and run the binary the mode names; `runCase
      <single-dict case> props` refuses by name; an unknown mode word refuses.
  (f) THE GRAMMAR'S REFUSALS, each fired through the real reader: a record
      path under data/standards/, a record path outside constant/assets/, a
      unit on `initial`, a dataset column the residual does not read, a `Jv`
      column under a law that cannot take an imposed flux, and no `rejection`
      declaration.

WHAT THIS GATE DOES NOT COVER, said so its green line cannot imply it.  It
does not say NF270 IS this pore: the held-out set is two salts of the SAME
study, chosen for identifiability (the witness's propsDict says which other
partitions were measured and what they gave).  It does not exercise the SDEM,
solutionDiffusion and constantRejection residuals on real data (their paths
share the evaluation loop; arm (f) fires the solutionDiffusion refusal only).
The thermophysical package -- the ion radii and diffusivities -- is NOT
fingerprinted, so a changed species record is NOT caught.

SABOTAGE-VERIFIED (engine edits BY HAND, rebuilt, run, restored -- the gate
never patches a source): see the record docs/design/one-case-two-modes.md
section 8 for the list and what each one did.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/membranes/membrane24_fit_then_simulate"
REC = "constant/assets/NF270_FdL2021.dat"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"
fails = []


def run(binary, case, timeout=900):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True, text=True,
                       env=env, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def result(text):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>", text, re.S)
    return json.loads(m.group(1)) if m else None


def op(res, name):
    for o in (res or {}).get("operationResults", []):
        if o.get("name") == name:
            return o
    return None


def fail(arm, msg):
    fails.append(f"({arm}) {msg}")


def copy_case(tmp, name):
    d = Path(tmp) / name
    shutil.copytree(CASE, d, ignore=shutil.ignore_patterns("converged", "postProcessing",
                                                           "reports", "log.*", "*.csv"))
    return d


def sig_digits(s):
    s = s.strip().lower().lstrip("-")
    mant = s.split("e")[0].replace(".", "").lstrip("0")
    return len(mant)


# ---------------------------------------------------------------------------
def arm_a(tmp):
    d = copy_case(tmp, "synthetic")
    #  the TRUTH: a base record with the synthetic pore
    base = (d / "constant/assets/NF270_dspmde.dat").read_text()
    truth = re.sub(r"^name\s+NF270_dspmde;", "name           NF270_truth;", base, flags=re.M)
    truth = re.sub(r"poreRadius\s+6\.0e-10;", "poreRadius             6.2e-10;", truth)
    truth = re.sub(r"chargeDensity\s+-5;", "chargeDensity          -25;", truth)
    if truth == base or "NF270_truth" not in truth or "6.2e-10" not in truth or "-25;" not in truth:
        fail("a", "could not build the synthetic truth record from NF270_dspmde.dat")
        return
    (d / "constant/assets/NF270_truth.dat").write_text(truth)
    salts = {"NaCl": "Na", "MgCl2": "Mg", "Na2SO4": "Na", "MgSO4": "Mg"}
    jv = {}
    for s in salts:
        txt = (d / f"constant/experimental/fdl2021_{s}.dat").read_text()
        blk = txt.split("\ndata\n", 1)[1]
        jv[s] = [float(l.split()[0]) for l in blk.splitlines() if re.match(r"\s+[0-9]", l)]
    ops = []
    for s in salts:
        ops.append(f"""    {{ name gen_{s}; type poreTransport; T 293.15 K; membrane NF270_truth;
      transport DSPM-DE;
      transportParameters {{ poreSolver {{ method finiteDifference; nodes 101; wallClosure porePermeate; }}
                            hindrance DechadilokDeen2006; activity ideal; }}
      feedMolPerM3 {{ {s} 10; }} J_v ( {' '.join('%.6e' % v for v in jv[s])} ); k_film 10;
      polarisation {{ suctionCorrection GeraldesAfonso2006; ionCoupling electroneutral; }} }}""")
    gen = Path(tmp) / "synthetic_gen"
    shutil.copytree(d, gen)
    (gen / REC).unlink()
    (gen / "system/propsDict").write_text("operations\n(\n" + "\n".join(ops) + "\n);\n")
    rc, out = run(PROPS, gen)
    res = result(out)
    if rc != 0 or not res:
        fail("a", f"the bench that generates the synthetic data did not run (exit {rc})")
        return
    for s, cat in salts.items():
        o = op(res, f"gen_{s}")
        r = [o["diagnostics"][f"Rreal_{cat}_p{k + 1}"] for k in range(len(jv[s]))]
        lines = "\n".join(f"    {a:.10e}  {b:.12f}" for a, b in zip(jv[s], r))
        (d / f"constant/experimental/fdl2021_{s}.dat").write_text(f"""// SYNTHETIC: the props bench at r_p 6.2e-10 m, X_d -25 mol/m3 (check_fit_then_simulate)
provenance {{ source synthetic; reviewStatus generatedByEngine; }}
T 293.15 K;
feed {{ {s} 10 mol/m3; }}
columns ( {{ name Jv; unit m/s; }} {{ name R_{s}; unit -; }} );
data
(
{lines}
);
""")
    pd = (d / "system/propsDict").read_text()
    pd = pd.replace("initial 6.0e-10;", "initial 5.0e-10;").replace("initial -20;", "initial -5; ")
    pd = pd.replace('record   "constant/assets/NF270_FdL2021.dat";', 'record   "constant/assets/NF270_synthetic.dat";')
    (d / "system/propsDict").write_text(pd)
    rc, out = run(PROPS, d)
    res = result(out)
    o = op(res, "fit_NF270_FdL2021")
    if rc != 0 or not o:
        fail("a", f"the synthetic fit did not run (exit {rc}): {out[-600:]}")
        return
    dg = o["diagnostics"]
    for i, want in ((0, 6.2e-10), (1, -25.0)):
        got = dg.get(f"fit.{i}.value")
        if got is None or abs(got - want) > 1e-5 * abs(want):
            fail("a", f"fit.{i}.value recovered {got} against the truth {want} (1e-5 relative)")
    if dg.get("converged") != 1 or dg.get("identifiable") != 1:
        fail("a", f"converged {dg.get('converged')} identifiable {dg.get('identifiable')} on zero-noise data")
    if not (dg.get("chi2", 1.0) < 1e-12):
        fail("a", f"chi2 {dg.get('chi2')} on zero-noise data the engine generated itself (want < 1e-12)")
    if not (dg.get("heldOut_AAD_pct", 1.0) < 1e-4):
        fail("a", f"held-out AAD {dg.get('heldOut_AAD_pct')} points (want < 1e-4)")
    if o.get("curation", {}).get("verdict") != "validated":
        fail("a", f"verdict {o.get('curation', {}).get('verdict')} on zero-noise data (want validated)")
    if not (d / "constant/assets/NF270_synthetic.dat").exists():
        fail("a", "the synthetic fit wrote no record")
    return dg


def arm_b():
    committed = (CASE / REC).read_bytes()
    rc, out = run(PROPS, CASE)
    res = result(out)
    o = op(res, "fit_NF270_FdL2021")
    if rc != 0 or not o:
        fail("b", f"Properties mode of the witness exited {rc}")
        return None
    v = o.get("curation", {}).get("verdict")
    if v not in ("validated", "notValidated", "heldOutPerformed", "validationRefused", "notClaimed"):
        fail("b", f"no verdict word in the result JSON's curation (got {v!r})")
    now = (CASE / REC).read_bytes()
    if now != committed:
        (CASE / REC).write_bytes(committed)
        fail("b", "re-running Properties mode on the unchanged witness rewrote the record with "
                  "DIFFERENT bytes -- an unchanged case must not dirty the tree (restored)")
    text = now.decode()
    for i, key in ((0, "poreRadius"), (1, "chargeDensity")):
        m = re.search(rf"^\s+{key}\s+(\S+);\s*//.*FITTED", text, re.M)
        if not m:
            fail("b", f"the record marks no FITTED `{key}`")
            continue
        if sig_digits(m.group(1)) > 6:
            fail("b", f"`{key} {m.group(1)}` carries more than 6 significant figures")
        pub = o["diagnostics"].get(f"fit.{i}.value")
        if pub is None or float(m.group(1)) != float(f"{pub:.6g}"):
            fail("b", f"`{key} {m.group(1)}` is not the published fit.{i}.value {pub} at 6 figures")
    return o


def arm_c(o):
    rc, out = run(SOLVE, CASE)
    if rc != 0:
        fail("c", f"Process mode of the witness exited {rc}: {out[-500:]}")
        return
    m = re.search(r"\[fitted\] membrane 'NF270_FdL2021' is a FITTED record: operation "
                  r"'fit_NF270_FdL2021' .*held-out verdict (\w+)", out)
    if not m:
        fail("c", "no `[fitted]` line naming the operation that wrote the record")
    elif o and m.group(1) != o.get("curation", {}).get("verdict"):
        fail("c", f"the [fitted] line says verdict {m.group(1)}, the fit published "
                  f"{o.get('curation', {}).get('verdict')}")
    rec = (CASE / REC).read_text()
    rp = float(re.search(r"^\s+poreRadius\s+(\S+);", rec, re.M).group(1))
    xd = float(re.search(r"^\s+chargeDensity\s+(\S+);", rec, re.M).group(1))
    b = re.search(r"\[DSPM-DE\] charged-pore .*r_p = (\S+) nm,\s+X_d = (\S+) mol/m3", out)
    #  the banner prints 4 decimals
    if not b or abs(float(b.group(1)) - rp * 1e9) > 5e-5 or abs(float(b.group(2)) - xd) > 5e-5:
        fail("c", f"the stage's DSPM-DE banner is not the record's pore "
                  f"(record r_p {rp*1e9} nm X_d {xd}; banner {b.groups() if b else None})")


def arm_d(tmp):
    cases = {
        "dataset":  ("constant/experimental/fdl2021_NaCl.dat", r"(\n    1\.234400e-05  )0\.533778", r"\g<1>0.543778",
                     r"STALE FIT.*fit dataset 'constant/experimental/fdl2021_NaCl\.dat' has changed"),
        "fitblock": ("system/propsDict", r"maxAAD  10 percent;", "maxAAD  12 percent;",
                     r"STALE FIT.*the fit block of operation 'fit_NF270_FdL2021'"),
        "record":   (REC, r"(chargeDensity\s+)-10\.525;", r"\g<1>-12;", r"NOT THE FIT ITS fit \{\} BLOCK DESCRIBES"),
        "base":     ("constant/assets/NF270_dspmde.dat", r"(chargeDensity\s+)-5;", r"\g<1>-6;",
                     r"STALE FIT.*its base record NF270_dspmde"),
    }
    for label, (rel, pat, rep, want) in cases.items():
        d = copy_case(tmp, "d_" + label)
        p = d / rel
        t = p.read_text()
        t2, n = re.subn(pat, rep, t, count=1)
        if n != 1:
            fail("d", f"{label}: the probe edit did not apply to {rel}")
            continue
        p.write_text(t2)
        rc, out = run(SOLVE, d)
        if rc == 0 or not re.search(want, out, re.S):
            fail("d", f"{label}: Process mode did not refuse the stale record (exit {rc}; wanted /{want}/)")
        elif "runCase " not in out or " props" not in out:
            fail("d", f"{label}: the refusal does not name the remedy (`runCase <case> props`)")
        if label == "dataset":
            rc2, out2 = run(PROPS, d)
            rc3, out3 = run(SOLVE, d)
            if rc2 != 0 or rc3 != 0 or "[fitted]" not in out3:
                fail("d", f"the remedy did not work: Properties mode exit {rc2}, Process mode exit {rc3}")
    d = copy_case(tmp, "d_comment")
    p = d / "constant/experimental/fdl2021_NaCl.dat"
    p.write_text("// a comment: canonically the same dataset\n" + p.read_text())
    rc, out = run(SOLVE, d)
    if rc != 0 or "[fitted]" not in out:
        fail("d", f"a COMMENT in a dataset made the fit stale (exit {rc}) -- the fingerprint must be the canonical parse")
    d = copy_case(tmp, "d_noprops")
    (d / "system/propsDict").unlink()
    rc, out = run(SOLVE, d)
    if rc == 0 or "carries no system/propsDict" not in out:
        fail("d", f"a fitted record in a case with no propsDict was not refused (exit {rc})")


def arm_e(tmp):
    d = copy_case(tmp, "e_modes")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT), CHOUPO_NO_RESIDUAL_PLOT="1")
    for mode, binary in (("props", "choupoProps"), ("process", "choupoSolve")):
        r = subprocess.run([str(ROOT / "bin/runCase"), "-f", str(d), mode], capture_output=True,
                           text=True, env=env, timeout=900)
        if r.returncode != 0 or not (d / f"log.{binary}").exists():
            fail("e", f"runCase <case> {mode} exited {r.returncode} or wrote no log.{binary}")
    single = Path(tmp) / "e_single"
    shutil.copytree(ROOT / "tutorials/steady/membranes/membrane10_dspmde_divalent", single,
                    ignore=shutil.ignore_patterns("converged", "postProcessing", "reports", "log.*"))
    r = subprocess.run([str(ROOT / "bin/runCase"), str(single), "props"], capture_output=True,
                       text=True, env=env, timeout=300)
    if r.returncode == 0 or "mode 'props' runs system/propsDict" not in r.stderr:
        fail("e", "runCase <single-dict case> props did not refuse by name")
    r = subprocess.run([str(ROOT / "bin/runCase"), str(d), "simulate"], capture_output=True,
                       text=True, env=env, timeout=300)
    if r.returncode == 0 or "unknown mode 'simulate'" not in r.stderr:
        fail("e", "an unknown mode word was not refused")


def arm_f(tmp):
    base = (CASE / "system/propsDict").read_text()
    probes = {
        "standards": (lambda t: t.replace('record   "constant/assets/NF270_FdL2021.dat";',
                                          'record   "data/standards/assets/X.dat";'),
                      r"refusing to write `record data/standards/assets/X\.dat`"),
        "outside":   (lambda t: t.replace('record   "constant/assets/NF270_FdL2021.dat";',
                                          'record   "constant/NF270_x.dat";'),
                      r"constant/assets/<name>\.dat, the one home the membrane registry reads"),
        "unit":      (lambda t: t.replace("initial 6.0e-10;", "initial 6.0e-10 m;"),
                      r"declares a unit on `initial`"),
        "noRejection": (lambda t: t.replace("rejection   intrinsic;", ""),
                        r"declare `rejection intrinsic;`"),
        "law":       (lambda t: t.replace("model       DSPM-DE;", "model       solutionDiffusion;")
                                 .replace("path poreModel.poreRadius;     initial 6.0e-10;  min 3.0e-10;  max 3.0e-9;",
                                          "path permeabilities.NaCl;  initial 5e-6;")
                                 .replace("path poreModel.chargeDensity;  initial -20;      min -3000;    max 3000;",
                                          "path permeabilities.MgSO4;  initial 5e-8;"),
                      r"only DSPM-DE honours an imposed J_v"),
    }
    for label, (edit, want) in probes.items():
        d = copy_case(tmp, "f_" + label)
        t = edit(base)
        if t == base:
            fail("f", f"{label}: the probe edit did not apply")
            continue
        (d / "system/propsDict").write_text(t)
        rc, out = run(PROPS, d, timeout=300)
        if rc == 0 or not re.search(want, out):
            fail("f", f"{label}: not refused by name (exit {rc}; wanted /{want}/)")
    d = copy_case(tmp, "f_column")
    p = d / "constant/experimental/fdl2021_NaCl.dat"
    t = p.read_text().replace("{ name R_NaCl;  unit -; }", "{ name R_NaCl;  unit -; }\n    { name pH;  unit -; }")
    head, blk = t.split("\ndata\n", 1)
    blk = re.sub(r"^(\s+[0-9][0-9.e+-]*\s+[0-9.e+-]+)\s*$", r"\1  7.0", blk, flags=re.M)
    p.write_text(head + "\ndata\n" + blk)
    rc, out = run(PROPS, d, timeout=300)
    if rc == 0 or "column 'pH' is not one this residual reads" not in out:
        fail("f", f"an unread dataset column was not refused by name (exit {rc})")


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_fit_then_simulate: CANNOT RUN -- {b} is not built (make all)")
            return 1
    with tempfile.TemporaryDirectory(prefix="fitsim-") as tmp:
        dg = arm_a(tmp)
        o = arm_b()
        arm_c(o)
        arm_d(tmp)
        arm_e(tmp)
        arm_f(tmp)
    if fails:
        print("check_fit_then_simulate: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    rp = o["diagnostics"]["fit.0.value"] if o else float("nan")
    xd = o["diagnostics"]["fit.1.value"] if o else float("nan")
    print("check_fit_then_simulate: OK -- (a) zero-noise data the props bench generated at r_p 0.62 nm, "
          "X_d -25 are fitted back to 1e-5 (identifiable, chi2 < 1e-12, validated); (b) the witness "
          f"membrane24 fits r_p {rp*1e9:.4f} nm, X_d {xd:.3f} mol/m3 to Fernandez de Labastida & "
          f"Yaroshchuk 2021 (verdict {o.get('curation', {}).get('verdict') if o else '?'}) and rewrites "
          "its record byte-identically at 6 figures; (c) Process mode reads it and names the fit; "
          "(d) a moved dataset, fit block, base record or hand-edited value refuses Process mode with "
          "the remedy, a comment does not, and the remedy works; (e) runCase runs both modes and "
          "refuses a missing one; (f) six grammar refusals fire.  NOT CHECKED: that NF270 is this pore "
          "(the held-out salts are of the same study), the other three laws on real data, and the "
          "thermophysical package, which is not fingerprinted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
