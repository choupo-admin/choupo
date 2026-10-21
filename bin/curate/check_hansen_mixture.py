#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_hansen_mixture -- which solvent, or which solvent mixture, for a
declared target (DEV.md 4c C128 slice 2, 2026-10-21;
src/propertyOps/HansenMixture.cpp).

The op places a blend of two solvents by the volume-fraction rule, measures
Hansen's distance to a target with the factor 4 on the dispersion term, and
asks the case's activity model whether the pair is one liquid at every
point.  This gate holds, from runs it performs itself on the three witnesses
under tutorials/props/solvents/:

  (a) THE ARITHMETIC IS RECOMPUTED FROM THE RECORDS, never from the CSV's own
      columns: every solvent's and the target's `hansen {}` block is parsed
      out of the case-local .dat files (and Vliq / MW out of the catalogue
      records the overlays patch), the declared basis fraction of every row
      is converted to volume fractions through them, the blended triple, Ra,
      RED, the Teas fractions and the target's Teas point are rebuilt, and
      each must match the engine's cell to 1e-6 relative -- on the volume
      basis (solvent01, solvent02's first op) AND the mole basis (solvent02's
      second op), so the conversion is held and not only the average.
  (b) THE SYNTHETIC MINIMUM is where the hand arithmetic puts it: solvent01's
      smallest Ra is at s = 0.5 and equals 2.000 MPa^0.5 (RED 0.5), its pure
      ends 6.000 (RED 1.5); the diagnostics `Ra_min_MPa05` / `s_at_min` say
      the same; and the minimum is taken over rows that HAVE an Ra.
  (c) THE THREE PHASE WORDS, each on a witness: every blend of the ideal
      synthetic case is `notVerified` and its ends `pure`; every blend of
      hexane + acetone under UNIFAC is `homogeneous` with a non-negative
      tm; hexane + nitromethane under the same UNIFAC carries at least one
      `twoPhase` point, every such point has a NEGATIVE tm and EMPTY dD / dP
      / dH / Ra / RED cells (the refusal: no average for two liquids), and
      the console says a two-phase pair is not useless; the thirteen-solvent
      screen is `pure` throughout.  `tm` is the engine's own Michelsen
      number, and the SIGN rule is StabilityTest's (tm_min < -1e-3 means
      unstable), re-read here.
  (d) THE TEMPERATURE IS STATED, NOT APPLIED: the console says the
      parameters are held constant at their reference temperature and that
      no correction exists, every record parsed in (a) carries a Tref, and
      a probe run at T = 318.15 K (every Tref 298.15) raises the
      extrapolation advisory into the result JSON while publishing the SAME
      Ra column as the 298.15 K run -- T moves the phase check only.
  (e) REFUSALS BY NAME, each on a probe copy of solvent01: no `target`; a
      target record with no `hansen {}`; a solvent `hansen {}` with no
      `Tref` (refused by Component::readHansenBlock, naming Tref); a basis
      word the op does not know; a solvent not in the thermophysical system;
      a solvent with no `hansen {}` block; three solvents under a
      `composition {}`; no `T`.  Each probe must exit non-zero AND name the
      thing.
  (f) THE SENTENCES THAT MAKE IT HONEST are on every run: the mixture rule
      named as an approximation, Ra called an affinity and not a solubility
      with no concentration published, and -- on the ideal case -- the
      notVerified reason naming gamma = 1.
  (g) THE CONFRONTATION, measured and printed, weakly asserted: joining
      solvent03's screen with its constant/experimental ratings (Hansen 1967
      Table 2.3), every solvent the thesis rated 6 (no visible effect) lies
      OUTSIDE the sphere (RED > 1), every solvent rated 1 (soluble) lies
      inside or within the thesis's own 0.5 (cal/cm3)^0.5 band of the radius
      (RED < 1 + 0.5/3.5), and the residual (rated <= 2 yet RED > 1, or
      rated >= 3 yet RED < 1) is COUNTED and printed, never hidden.  This
      is the method on its own training set and the claim line says so.
  (h) SOURCE: the op calls `solver::michelsenTPD` and carries no
      tangent-plane arithmetic of its own; Ra is guarded by the phase word
      (`if (p.phase != "twoPhase")`); the distance carries the factor 4.

  (c) ALSO HOLDS THE STABILITY TEST ITSELF.  hexane + acetone under UNIFAC
      (gamma 1.52 / 1.56 at 50:50, a miscible pair) must read `homogeneous`
      with tm at the trivial point (>= -1e-3).  That is the arm that found a
      defect in src/solver/StabilityTest.cpp the day this gate was built:
      evalTm omitted the ln gamma_i(y) term, so tm(z) was -G^E/RT instead of
      0 and every positive-deviation mixture read "unstable" (tm -0.42 for
      this pair).  Fixed in the same slice; the 38 corpus cases that reach
      the test kept every golden (measured before and after).

SABOTAGES, performed by hand on 2026-10-21 and restored (each a one-line
edit; the engine rebuilt between them; the three files verified
byte-identical to pristine copies afterwards and touched + rebuilt).
OBSERVED, not predicted:

  S1  the factor 4 dropped from the distance (HansenMixture.cpp)
        -> caught by (a) 118 cells, (b) 4, (h) 1.
  S2  the TPD defect put back (ln gamma dropped from evalTm,
      StabilityTest.cpp)
        -> caught by (c) ONLY: 20 findings, hexane + acetone two-phase.
  S3  a twoPhase point given an Ra (the guard `if (p.phase != "twoPhase")`
      replaced by `if (true)`)
        -> SURVIVED the gate as first written: the CSV writer blanks a
           twoPhase row on its own, and arm (h)'s source check matched the
           same text at the JSON writer.  Caught after the result-block arm
           of (c) was added: the published minimum (x = 0.6) is a point the
           phase check refused, and is not the smallest surviving Ra.
  S4  the mole basis taken as volume fractions (no Vliq in the conversion)
        -> caught by (a), 8 findings -- on the rows that stayed one liquid
           only, because (a) skipped refused rows before checking their
           composition.  (a) now checks the composition on every row.
  S5  first form: the named Tref refusal disabled (`if (false && ...)`)
        -> SURVIVED: the dictionary's generic missing-key error still named
           `Tref`, and the probe matched the bare word.  Every probe in (e)
           now requires its refusal's OWN sentence.
      second form: the refusal disabled AND Tref defaulted to 298.15
      silently (the real failure mode)
        -> caught by (e): the probe ran to exit 0.
  S6  the ideal-liquid exception removed (an `ideal` package "verifies")
        -> caught by (c) (the synthetic words become `homogeneous`) and
           (f) (the gamma = 1 sentence is gone).

NOT CHECKED, said plainly: whether any Hansen value here is the right
number for the substance (the records are transcriptions of one thesis,
marked interim; nothing in this tree measures a solubility); whether the
mixture rule is right (it is a rule of thumb the thesis reports as checked,
and the witnesses carry no measured BLEND point -- the thesis tabulates pure
solvents only); whether UNIFAC's two-phase verdict for hexane/nitromethane
matches a measured miscibility gap (no LLE datum for that pair is in the
tree); a mass-basis sweep (no witness declares one; arm (a) holds the mole
conversion and the mass branch is the same two lines with MW).
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
BIN = ROOT / "choupoProps"
SOLV = ROOT / "tutorials/props/solvents"
SYN = SOLV / "solvent01_synthetic_mixture"
REAL = SOLV / "solvent02_polystyrene_hexane_blends"
OBS = SOLV / "solvent03_polystyrene_observed"
SRC = ROOT / "src/propertyOps/HansenMixture.cpp"
STD = ROOT / "data/standards/components"
MPA = 1.0e3
TM_TOL = -1.0e-3          # StabilityTest.H's default tmTol

fails = []
notes = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def read_csv(path):
    lines = path.read_text().splitlines()
    head = lines[0].split(",")
    rows = []
    for ln in lines[1:]:
        if not ln.strip():
            continue
        rows.append(dict(zip(head, ln.split(","))))
    return head, rows


def num(s):
    return math.nan if s in ("", None) else float(s)


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def scalar(text, key):
    """`key value [unit];` at any depth, first occurrence."""
    m = re.search(r"(?m)^\s*" + re.escape(key) + r"\s+([-+0-9.eE]+)", text)
    return float(m.group(1)) if m else math.nan


def hansen_block(path):
    t = strip_comments(path.read_text())
    m = re.search(r"hansen\s*\{(.*?)\}", t, flags=re.S)
    if not m:
        return None
    b = m.group(1)
    return {k: scalar(b, k) for k in ("dD", "dP", "dH", "Tref", "R0")}


def record_scalar(case, name, key):
    """A bulk constant of a solvent: the case-local record if it declares
    it, else the catalogue record the overlay patches."""
    local = case / "constant/components" / f"{name}.dat"
    if local.exists():
        v = scalar(strip_comments(local.read_text()), key)
        if not math.isnan(v):
            return v
    std = STD / f"{name}.dat"
    return scalar(strip_comments(std.read_text()), key) if std.exists() else math.nan


def rel(a, b):
    return abs(a - b) / max(1e-12, abs(b))


def golden(case, key):
    exp = case / "expected"
    if not exp.exists():
        fail(f"{case.name} ships no `expected` golden -- arm (b) cannot hold"
             " its diagnostics to the hand arithmetic")
        return math.nan
    for line in exp.read_text().splitlines():
        f = line.split()
        if len(f) >= 4 and f[0] == "diag" and f[2] == key:
            return float(f[3])
    return math.nan


def check_arithmetic(case, csv_name, solvents, target_name, basis, tag):
    """Arm (a): rebuild every cell from the records."""
    head, rows = read_csv(case / csv_name)
    need = ["point", "label", "s_declared", "basis", "dD_mix_MPa05", "dP_mix_MPa05",
            "dH_mix_MPa05", "fd", "fp", "fh", "Ra_MPa05", "RED", "phase", "tm",
            "fd_target", "fp_target", "fh_target"] + [f"phi_{s}" for s in solvents]
    for c in need:
        if c not in head:
            fail(f"(a) {tag}: the CSV has no column `{c}`")
            return rows
    tgt = hansen_block(case / "constant/components" / f"{target_name}.dat")
    hb = {s: hansen_block(case / "constant/components" / f"{s}.dat") for s in solvents}
    if tgt is None or any(v is None for v in hb.values()):
        fail(f"(a) {tag}: a record has no parsable `hansen {{}}` block")
        return rows
    for s in solvents:
        if math.isnan(hb[s]["Tref"]):
            fail(f"(d) {tag}: {s}'s hansen block carries no Tref")
    if math.isnan(tgt["Tref"]):
        fail(f"(d) {tag}: the target's hansen block carries no Tref")
    vliq = {s: record_scalar(case, s, "Vliq") for s in solvents}
    mw = {s: record_scalar(case, s, "MW") for s in solvents}
    tsum = tgt["dD"] + tgt["dP"] + tgt["dH"]
    nchecked = 0
    for r in rows:
        # the composition: screen rows carry phi directly; sweep rows carry s.
        # Checked on EVERY row, a refused one included: a twoPhase row still
        # publishes its composition (sabotage S4 survived on those rows when
        # this check came after the skip).
        phi = {s: num(r[f"phi_{s}"]) for s in solvents}
        if r["basis"] != "pure":
            s_ = num(r["s_declared"])
            a, b = solvents
            if basis == "volume":
                want = {a: 1 - s_, b: s_}
            else:
                na = (1 - s_) / mw[a] if basis == "mass" else (1 - s_)
                nb = s_ / mw[b] if basis == "mass" else s_
                va, vb = na * vliq[a], nb * vliq[b]
                want = {a: va / (va + vb), b: vb / (va + vb)}
            for s in solvents:
                if abs(want[s] - phi[s]) > 1e-9:
                    fail(f"(a) {tag} row {r['point']}: phi_{s} = {phi[s]} but the"
                         f" {basis} fraction {s_} converts to {want[s]:.9f}")
        if r["phase"] == "twoPhase":
            continue
        dD = sum(phi[s] * hb[s]["dD"] for s in solvents)
        dP = sum(phi[s] * hb[s]["dP"] for s in solvents)
        dH = sum(phi[s] * hb[s]["dH"] for s in solvents)
        Ra = math.sqrt(4 * (dD - tgt["dD"]) ** 2 + (dP - tgt["dP"]) ** 2
                       + (dH - tgt["dH"]) ** 2)
        for col, want in (("dD_mix_MPa05", dD / MPA), ("dP_mix_MPa05", dP / MPA),
                          ("dH_mix_MPa05", dH / MPA), ("Ra_MPa05", Ra / MPA)):
            if rel(num(r[col]), want) > 1e-6:
                fail(f"(a) {tag} row {r['point']}: {col} = {r[col]} against"
                     f" {want:.6f} rebuilt from the records")
        ssum = dD + dP + dH
        for col, want in (("fd", dD / ssum), ("fp", dP / ssum), ("fh", dH / ssum),
                          ("fd_target", tgt["dD"] / tsum), ("fp_target", tgt["dP"] / tsum),
                          ("fh_target", tgt["dH"] / tsum)):
            if rel(num(r[col]), want) > 1e-6:
                fail(f"(a) {tag} row {r['point']}: {col} = {r[col]} against {want:.6f}")
        if abs(num(r["fd"]) + num(r["fp"]) + num(r["fh"]) - 1) > 1e-9:
            fail(f"(a) {tag} row {r['point']}: the Teas fractions do not sum to 1")
        if not math.isnan(tgt["R0"]) and tgt["R0"] > 0:
            if rel(num(r["RED"]), Ra / tgt["R0"]) > 1e-6:
                fail(f"(a) {tag} row {r['point']}: RED = {r['RED']} against"
                     f" {Ra / tgt['R0']:.6f}")
        elif r["RED"] != "":
            fail(f"(a) {tag} row {r['point']}: a RED is published with no R0 declared")
        nchecked += 1
    notes.append(f"{tag}: {nchecked} rows rebuilt ({basis})")
    return rows


def probe(tmp, tag, edit):
    """A copy of solvent01 with `edit(dir)` applied; returns (rc, out+err)."""
    d = Path(tmp) / tag
    shutil.copytree(SYN, d, ignore=shutil.ignore_patterns("expected", "*.csv"))
    edit(d)
    rc, out, err = run(d)
    return rc, out + err


def main():
    if not BIN.exists():
        print("check_hansen_mixture: FAILED -- choupoProps is not built")
        return 1
    tmp = tempfile.mkdtemp(prefix="hansen_mixture_")
    try:
        # ---- the three witnesses ------------------------------------------------
        runs = {}
        for case in (SYN, REAL, OBS):
            rc, out, err = run(case)
            runs[case] = (rc, out, err)
            if rc != 0:
                fail(f"{case.name} exited {rc}:\n{err[-2000:]}")
        if fails:
            print(f"check_hansen_mixture: FAILED ({len(fails)} finding(s))")
            return 1

        # ---- (a) the arithmetic from the records ---------------------------------
        syn_rows = check_arithmetic(SYN, "hansenMixture.csv", ["solventA", "solventB"],
                                    "polymerP", "volume", "solvent01")
        ace_rows = check_arithmetic(REAL, "hansen_hexane_acetone.csv",
                                    ["nHexane", "acetone"], "polystyrene", "volume",
                                    "solvent02/hexaneAcetone")
        nit_rows = check_arithmetic(REAL, "hansen_hexane_nitromethane.csv",
                                    ["nHexane", "nitromethane"], "polystyrene", "mole",
                                    "solvent02/hexaneNitromethane")
        scr_solv = ["nHexane", "cyclohexane", "benzene", "toluene", "diethylEther",
                    "ethylAcetate", "methylEthylKetone", "acetone", "nitroethane",
                    "nitromethane", "nButanol", "ethanol", "methanol"]
        scr_rows = check_arithmetic(OBS, "hansen_screen.csv", scr_solv, "polystyrene",
                                    "pure", "solvent03/screen")

        # ---- (b) the synthetic minimum ---------------------------------------------
        have = [r for r in syn_rows if r["Ra_MPa05"] != ""]
        best = min(have, key=lambda r: num(r["Ra_MPa05"]))
        if abs(num(best["s_declared"]) - 0.5) > 1e-12 or rel(num(best["Ra_MPa05"]), 2.0) > 1e-9:
            fail(f"(b) solvent01's minimum is Ra {best['Ra_MPa05']} at s ="
                 f" {best['s_declared']}; the hand arithmetic says 2.000 at 0.5")
        if rel(num(best["RED"]), 0.5) > 1e-9:
            fail(f"(b) solvent01's minimum RED is {best['RED']}, not 0.5")
        for r in (syn_rows[0], syn_rows[-1]):
            if rel(num(r["Ra_MPa05"]), 6.0) > 1e-9 or rel(num(r["RED"]), 1.5) > 1e-9:
                fail(f"(b) solvent01's pure end {r['label']} is Ra {r['Ra_MPa05']},"
                     f" RED {r['RED']}; the hand arithmetic says 6.000, 1.5")
        for key, want in (("Ra_min_MPa05", 2.0), ("s_at_min", 0.5), ("RED_min", 0.5)):
            g = golden(SYN, key)
            if math.isnan(g) or rel(g, want) > 1e-6:
                fail(f"(b) solvent01's golden `diag blend {key}` is {g}, not {want}")
        notes.append("synthetic minimum 2.000 at 0.5, ends 6.000")

        # ---- (c) the three phase words ------------------------------------------------
        def words(rows):
            return [r["phase"] for r in rows]
        w = words(syn_rows)
        if w[0] != "pure" or w[-1] != "pure" or any(x != "notVerified" for x in w[1:-1]):
            fail(f"(c) solvent01's phase words are {sorted(set(w))}: the ideal"
                 " liquid must give `pure` at the ends and `notVerified` between")
        w = words(ace_rows)
        if any(x != "homogeneous" for x in w[1:-1]):
            fail(f"(c) hexane + acetone under UNIFAC carries {sorted(set(w[1:-1]))}"
                 " between its ends; expected `homogeneous` throughout")
        for r in ace_rows[1:-1]:
            if num(r["tm"]) < TM_TOL:
                fail(f"(c) hexane + acetone row {r['point']} (`{r['phase']}`) carries"
                     f" tm {r['tm']} below StabilityTest's tolerance -- the"
                     " stability test calls a miscible pair unstable")
        two = [r for r in nit_rows if r["phase"] == "twoPhase"]
        if not two:
            fail("(c) hexane + nitromethane under UNIFAC carries NO `twoPhase` point"
                 " -- the refusal arm has no witness")
        for r in two:
            if not (num(r["tm"]) < TM_TOL):
                fail(f"(c) row {r['point']} is `twoPhase` with tm {r['tm']}, not"
                     " below StabilityTest's tolerance")
            for col in ("dD_mix_MPa05", "dP_mix_MPa05", "dH_mix_MPa05", "Ra_MPa05", "RED"):
                if r[col] != "":
                    fail(f"(c) row {r['point']} is `twoPhase` and still publishes"
                         f" {col} = {r[col]} -- the average of two liquids")
        rc, out, err = runs[REAL]
        if two and "two-phase pair is not useless" not in " ".join(out.split()):
            fail("(c) the console does not say a two-phase pair is not useless"
                 " (it may serve an extraction)")
        hom_n = [r for r in nit_rows if r["phase"] == "homogeneous"]
        notes.append(f"hexane/nitromethane: {len(two)} twoPhase, {len(hom_n)} homogeneous"
                     " of 21")
        if any(x != "pure" for x in words(scr_rows)):
            fail("(c) the screen carries a non-`pure` word")
        res = result_json(out)
        if res:
            blocks = res.get("hansenMixtures", [])
            if len(blocks) != 2:
                fail(f"(c) solvent02's result JSON carries {len(blocks)} hansenMixtures"
                     " blocks, not 2")
            for b in blocks:
                if b.get("phaseCheck", {}).get("model") != "UNIFAC" or not b["phaseCheck"]["verified"]:
                    fail("(c) solvent02's block does not say the check ran on UNIFAC")
                # THE REFUSAL REACHES THE ANSWER, not only the CSV: the CSV
                # writer blanks a twoPhase row on its own, so only the block
                # can show a refused point winning the minimum.
                for pt in b.get("points", []):
                    if pt.get("phase") == "twoPhase" and "Ra_Pa05" in pt:
                        fail(f"(c) {b['op']}: a twoPhase point carries Ra in the"
                             " result block")
                mlabel, ms = b["minimum"]["label"], b["minimum"]["s"]
                won = [pt for pt in b["points"]
                       if pt["label"] == mlabel and pt["s"] == ms]
                if not won or won[0]["phase"] == "twoPhase":
                    fail(f"(c) {b['op']}: the published minimum ({mlabel}, s ="
                         f" {ms}) is not a point that survived the phase check")
                surv = [pt["Ra_Pa05"] for pt in b["points"] if "Ra_Pa05" in pt]
                if surv and abs(b["minimum"]["Ra_Pa05"] - min(surv)) > 1e-9 * min(surv):
                    fail(f"(c) {b['op']}: the published minimum Ra is not the"
                         " smallest over the surviving points")

        # ---- (d) the temperature is stated, not applied ---------------------------------
        rc, out, err = runs[SYN]
        flat = " ".join(out.split())
        if "HELD CONSTANT at their reference temperature" not in flat:
            fail("(d) the run does not say the parameters are held constant at Tref")
        if "no temperature correction exists" not in flat:
            fail("(d) the run does not say that no temperature correction exists")
        rc2, out2 = probe(tmp, "warm", lambda d: (d / "system/propsDict").write_text(
            (d / "system/propsDict").read_text().replace("T          298.15 K;",
                                                         "T          318.15 K;")))
        if rc2 != 0:
            fail(f"(d) the 318.15 K probe exited {rc2}")
        else:
            res2 = result_json(out2)
            adv = json.dumps(res2.get("advisories", res2)) if res2 else out2
            if "held constant at their reference" not in adv:
                fail("(d) a T away from Tref does not raise the extrapolation advisory")
            _, rows2 = read_csv(Path(tmp) / "warm/hansenMixture.csv")
            for r1, r2 in zip(syn_rows, rows2):
                if r1["Ra_MPa05"] != r2["Ra_MPa05"]:
                    fail("(d) T moved the Ra column -- a correction was applied that"
                         " the run says does not exist")
                    break
        notes.append("T stated beside Tref; a warm probe announced, Ra unmoved")

        # ---- (e) refusals by name ----------------------------------------------------------
        def pd_edit(fn):
            def e(d):
                p = d / "system/propsDict"
                p.write_text(fn(p.read_text()))
            return e

        def rec_edit(name, fn):
            def e(d):
                p = d / "constant/components" / f"{name}.dat"
                p.write_text(fn(p.read_text()))
            return e
        def three_solvents(d):
            # a GENUINE third solvent in the package, so the count refusal
            # is reached (listing one twice trips the earlier duplicate one)
            a = (d / "constant/components/solventA.dat").read_text()
            (d / "constant/components/solventC.dat").write_text(
                a.replace("name        solventA;", "name        solventC;"))
            tp = d / "constant/thermoPhysPropDict"
            tp.write_text(tp.read_text().replace("( solventA solventB )",
                                                 "( solventA solventB solventC )"))
            pd = d / "system/propsDict"
            pd.write_text(pd.read_text().replace("( solventA solventB )",
                                                 "( solventA solventB solventC )"))
        probes = [
            #  Each probe requires its refusal's OWN sentence, never a bare
            #  key: a generic dictionary error names the key too, and a
            #  probe satisfied by it proves the named refusal nothing.
            ("no-target", pd_edit(lambda t: t.replace("target     polymerP;", "")),
             "declares no `target`"),
            ("target-no-hansen", rec_edit("polymerP", lambda t: re.sub(r"hansen\s*\{.*?\}", "", t, flags=re.S)),
             "the target record 'polymerP' declares no `hansen {}` block"),
            #  The NAMED refusal's own words, not the bare key: a generic
            #  "key not found" also contains `Tref`, and with the named
            #  refusal disabled it let sabotage S5 (first form) pass.
            ("solvent-no-tref", rec_edit("solventA", lambda t: t.replace("    Tref  298.15 K;", "")),
             "declares no `Tref`"),
            ("bad-basis", pd_edit(lambda t: t.replace("basis  volume;", "basis  weight;")),
             "`composition.basis weight` is not a basis this op"),
            ("solvent-not-in-package", pd_edit(lambda t: t.replace("( solventA solventB )", "( solventA solventC )")),
             "solvent 'solventC' is not a component of this case's"),
            ("solvent-no-hansen", rec_edit("solventB", lambda t: re.sub(r"hansen\s*\{.*?\}", "", t, flags=re.S)),
             "solvent 'solventB' declares no `hansen {}` block"),
            ("three-solvents", three_solvents, "exactly TWO solvents"),
            ("listed-twice", pd_edit(lambda t: t.replace("( solventA solventB )", "( solventA solventB solventA )")),
             "solvent 'solventA' is listed twice"),
            ("no-T", pd_edit(lambda t: t.replace("T          298.15 K;", "")), "declares no `T`"),
        ]
        for tag, edit, word in probes:
            rc, text = probe(tmp, tag, edit)
            if rc == 0:
                fail(f"(e) probe {tag} ran to exit 0 -- nothing refused")
            elif word not in text:
                fail(f"(e) probe {tag} refused without naming `{word}`")
        notes.append(f"{len(probes)} refusals by name")

        # ---- (f) the honest sentences --------------------------------------------------------
        rc, out, err = runs[SYN]
        flat = " ".join(out.split())
        for sent in ("VOLUME-FRACTION RULE, an approximation",
                     "Ra IS AN AFFINITY, NOT A SOLUBILITY",
                     "No saturation concentration (g/L)", "gamma = 1 has"):
            if sent not in flat:
                fail(f"(f) the synthetic run does not say `{sent}`")
        notes.append("rule named an approximation; affinity not solubility; gamma = 1 named")

        # ---- (g) the confrontation, measured ---------------------------------------------------
        _, obs = read_csv(OBS / "constant/experimental/hansen1967_table23_polystyrene.csv")
        rating = {r["solvent"]: int(r["rating"]) for r in obs}
        red = {r["label"]: num(r["RED"]) for r in scr_rows}
        band = 1 + 0.5 / 3.5            # the thesis's own +-0.5 (cal/cm3)^0.5 on R_A0 = 3.5
        residual = []
        for s, g in rating.items():
            if s not in red:
                fail(f"(g) the screen carries no row for observed solvent {s}")
                continue
            if g == 6 and red[s] <= 1:
                fail(f"(g) {s} is rated 6 (no visible effect) and lies inside the"
                     f" sphere (RED {red[s]:.3f})")
            if g == 1 and red[s] >= band:
                fail(f"(g) {s} is rated 1 (soluble) and lies beyond the thesis's band"
                     f" (RED {red[s]:.3f} >= {band:.3f})")
            if (g <= 2 and red[s] > 1) or (g >= 3 and red[s] < 1):
                residual.append(f"{s} (RED {red[s]:.2f}, rated {g})")
        notes.append(f"confrontation: {len(rating)} solvents, residual {len(residual)}:"
                     f" {', '.join(residual) if residual else 'none'}")

        # ---- (h) source -------------------------------------------------------------------------
        src = SRC.read_text()
        if "solver::michelsenTPD(" not in src:
            fail("(h) the op does not call solver::michelsenTPD")
        if "std::log(Yi)" in src or "evalTm" in src or "runProbe" in src:
            fail("(h) the op carries tangent-plane arithmetic of its own")
        if 'if (p.phase != "twoPhase")' not in src:
            fail("(h) Ra is not guarded by the twoPhase word")
        if "4.0 * a * a" not in src:
            fail("(h) the distance does not carry the factor 4 on the dispersion term")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print(f"check_hansen_mixture: FAILED ({len(fails)} finding(s))")
        return 1
    print("check_hansen_mixture: OK -- " + "; ".join(notes)
          + ".  Rebuilt from the records, never from the CSV's own columns."
          "  NOT checked: any measured blend point (the thesis tabulates pure"
          " solvents only), the Hansen values themselves (transcriptions, interim),"
          " UNIFAC's gap against a measured miscibility, a mass-basis sweep.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
