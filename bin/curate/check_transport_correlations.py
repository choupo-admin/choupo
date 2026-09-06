#!/usr/bin/env python3
"""Gate: the transport families state their windows, cite their primaries, and prove themselves -- the four silences of 2026-09-05 stay closed, and the Chapman-Enskog slice of 2026-09-06 says what its constants are.

    bin/curate/check_transport_correlations.py

WHY THIS EXISTS.  Choupo's transport layer -- Chung, Eucken, Fuller, Andrade,
Vogel, chemsepEq101, SatoRiedel, chemsepEq16, with Wilke and Wassiljewa /
Mason-Saxena mixing -- was correct and cited in comments, and said nothing a
reader could check at run time: no window, no primary, no self-check, and
the one phi_ij written TWICE in ThermoPackage.cpp.  Around it sat four
silences, each found by reading rather than by a failing case: a Theory
Guide listing of dict keys no engine reads (`viscosityGas { model
Sutherland; }`, `lennardJones {}`); Chung estimating Vc from Zc(omega) and
dropping its polar terms without saying so; a spray dryer that "reported the
kinetics as zero" with no transport model, and swallowed a declared liquid-
viscosity model's refusal into a water constant; a membrane module with
mu_feed = 1e-3 and D_solute = 1.6e-9 hard-coded for every feed.

On 2026-09-06 the campaign the first slice named was run: Svehla's 1962
Table I(a) was transcribed from the page image into ONE committed home
(bin/curate/svehla1962/), `ChapmanEnskog` (gas mu) and `modifiedEucken`
(gas k) registered, the Neufeld collision-integral fit moved to one home
both viscosity models call, and a `lennardJones {}` reader arrived on the
Component.  Everything that slice claims is pinned here too.

This gate pins the properties that make both slices worth having, on the
witnesses `tutorials/props/transport/transport01_gas_bench` (four gases, no
lennardJones blocks) and `transport02_chapman_enskog` (seven gases, case-
local blocks), and on copies it builds itself.  NUMBERS ARE RECOMPUTED HERE
from the sealed RECORDS -- MW, Tc, Pc, omega, the Cp polynomial, sigma,
eps/k -- not read back from the engine's log; an auditor that reuses the
auditee's arithmetic checks nothing.

WHAT IS CHECKED

  (a) EVERY REGISTERED MODEL VERIFIES within its tolerance -- 1e-4 by
      default, or the tolerance the anchor DECLARES (printed beside the row
      and published as `tol_<model>`; only ChapmanEnskog declares one, and it
      may not exceed 1 %) -- and the run prints its window, a dated PRIMARY
      citation and the KIND of anchor (theory | arithmetic).  The published
      anchor counts (3 theory, 8 arithmetic) are recounted from the printed
      `kind:` lines.
  (b) RECOMPUTED FROM THE RECORDS, at transport01's point (373.15 K):
        Chung   mu for each of N2, O2, CO2, water from MW/Tc/Pc/omega, with
                the Neufeld fit written out here (1e-9 relative);
        Neufeld Omega(T* = 1) from the three published coefficients equals
                the literal Chung's anchor carries;
        Eucken  k = (Cp + 5R/4) mu / M with Cp from the record polynomial;
        Wilke   mu_mix from the pure values and the record MWs, equimolar;
        Wassiljewa / Mason-Saxena  k_mix likewise, with A_ij = phi_ij.
  (c) THE SPREAD IS HONEST ABOUT ITS SIZE, keyed on models EVALUATED and not
      registered: on transport01 (no lennardJones blocks) n_evaluated_mu is
      1, spread_mu_pct is 0 and the output SAYS a spread over one is not
      agreement; on transport02 both families evaluate 2, both spreads are
      nonzero and the sentence is ABSENT.
  (d) CHUNG ANNOUNCES on a polar gas: transport01 holds water, and the
      caveat block and the result JSON must carry, for 'water', both facts
      -- Vc ESTIMATED and the polar/association terms DROPPED -- once per
      component (four entries, none for an absent species).
  (e) EUCKEN FLAGS the polyatomics: all four transport01 gases have Cp > 5R/2
      by their own records, so four APPROXIMATION HERE lines naming
      "polyatomic"; on transport02 argon (Cp = 5R/2 by its record) is NOT
      flagged and the other six are.
  (f) THE THEORY GUIDE SHOWS ONLY WHAT THE ENGINE READS.  Sutherland: no
      `model Sutherland;` / `viscosityGas {` example while no reader exists
      (the arm reads the engine first).  lennardJones: a reader EXISTS since
      2026-09-06, so the guide MUST show the block, in the grammar the loader
      parses -- `sigma [0 1 0 0 0] <m>;` and `epsOverK <K> K;` -- and
      `model ChapmanEnskog;`.
  (g) THE SPRAY DRYER REFUSES WITHOUT A TRANSPORT MODEL, by name and with
      the remedy, on a copy of sprayDryer01 with its transport block
      stripped -- exit != 0, and NO `tau_dry_constant` in any result.
  (h) THE SPRAY DRYER REFUSES A DECLARED LIQUID MODEL IT CANNOT PRICE, on a
      copy declaring `liquid { viscosity { model Andrade; } }` for a feed
      whose sucrose carries no Andrade block: "will NOT substitute water".
  (i) THE MEMBRANE ANNOUNCES ITS LEGACY DEFAULT: membrane01 prints
      "[legacy] mu_feed 1e-3 Pa.s ASSUMED" with the remedy, and its golden
      is UNMOVED (arm k).
  (j) ONE HOME FOR phi_ij: ThermoPackage.cpp carries no `pow(Mj / Mi, 0.25)`
      of its own and reaches gasMixing::wilkeSum at BOTH call sites.  ONE
      HOME FOR Omega(2,2)*: ChungViscosity.cpp carries none of the six
      Neufeld coefficients and calls neufeld::omega22; NeufeldOmega.cpp
      carries each exactly once.  Source inspection, because no output arm
      can see a second home that happens to agree.
  (k) THE CORPUS DID NOT MOVE: transport01, transport02, sprayDryer01 and
      membrane01 reproduce their goldens (through bin/runTests, verdict by
      runtests_verdict -- a harness that could not run is reported as such,
      never as a moved answer).
  (l) CHAPMAN-ENSKOG RECOMPUTED FROM THE SEALED RECORDS, at transport02's
      point (300 K): for each of N2, O2, CO2, water, CH4, Ar, H2 the record's
      `lennardJones { sigma [0 1 0 0 0] <m>; epsOverK <K> K; }` is parsed
      here and mu = 26.693 sqrt(M T) / (sigma_A^2 Omega(T/epsK)) x 1e-7
      agrees with `mu_ChapmanEnskog_<g>` to 1e-9; the modified Eucken
      k = (R/M)[15/4 + 1.32(Cp/R - 5/2)] mu with Cp from the record polynomial
      and THIS mu agrees with `k_modifiedEucken_<g>` to 1e-9.
  (m) THE SVEHLA REPRODUCTION ANCHOR IS RECOMPUTED, not trusted: the gate
      evaluates Svehla's eq. (1) at HIS N2 constants (M 28.02, sigma 3.798,
      eps/k 71.4, 300 K) and requires the printed 177.7 muP within 1 %, the
      published dev_ChapmanEnskog to equal that recomputed deviation to 1e-6,
      and the anchor text to name report page 90 and 300 K.  The modified
      Eucken guard likewise: his eta and Cp/R through eq. (2) must give his
      lambda x 10^6 = 63.9 through his Table II calorie (4.185 J) within
      0.2 %.
  (n) CHAPMAN-ENSKOG REFUSES BY NAME, on a copy of transport02 with N2's
      lennardJones block removed: exit != 0, the refusal names 'N2', the
      block, and the remedy tool (propose_lennard_jones.py).
  (o) THE ORIGINS ARE ANNOUNCED: transport02's JSON carries one
      `ChapmanEnskog gas viscosity, component '<g>'` advisory per gas (seven,
      none for an absent species), each saying both constants are FITTED to
      measured transport data with Svehla's method and the report page, and
      the caveat block replays them.
  (p) THE TOOL IS DETERMINISTIC AND REFUSES THE PUBLIC TREE:
      propose_lennard_jones.py run twice into two build/ temp dirs writes
      byte-identical sets of at least 50 fragments; `--out` under
      data/standards/ exits nonzero saying REFUSED and writes nothing there;
      and the seven case-local blocks in transport02 EQUAL the tool's
      fragments for those components byte for byte (a transcription that
      moves without the witness following it fails here).
  (q) THE SEALED RECORDS CARRY THE FORM check_source_licence's public-domain
      contract requires: each of the seven names `NASA TR R-132` in its
      `source` and declares `licence publicDomain;` inside the block, with a
      per-value `origin` under both `sigma` and `epsOverK`.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * That any correlation is RIGHT.  Eight of the eleven anchors are the
      correlation's own closed form (or Svehla's computed table) and the
      other three are identities; the catalogue holds NO measured viscosity,
      conductivity or diffusivity, and no arm here compares with one.
      Svehla's sigma / eps-k are HIS fits to pre-1962 measurements; that
      they are right for any gas is not checked anywhere in this tree.
  * Fuller, the liquid models and the liquid diffusivity (Wilke-Chang, which
      gained no window/citation/verify) are checked for verify() only, not
      recomputed.
  * The transcription itself (page image -> TSV) is not re-read here; the
      tool's determinism and the witness's agreement with it are.
  * Sutherland's ABSENCE is pinned, not its future correctness; a Chapman-
      Enskog DIFFUSIVITY is not built (Omega(1,1)* not citable) and nothing
      here pins that beyond the source arm on NeufeldOmega.cpp.

SABOTAGES, 2026-09-05, performed BY HAND on OUTPUTS and INPUTS -- never by
patching a source and rebuilding (the 2026-08-18 tree-poisoning shape).  The
quoted lines are OBSERVED, and each was restored before the next:

  S1  the witness's `expected` edited so mu_Chung_water reads 1.1e-5:
        transport01_gas_bench no longer reproduces its golden
      Arm (b) stayed silent, correctly: the ENGINE still agreed with the
      RECORD; what moved was the golden.  The two arms are independent on
      purpose -- a golden re-recorded against a wrong engine passes (k) and
      fails (b).
  S2  `viscosityGas { model Sutherland; }` typed back into theoryGuide.tex:
        theoryGuide.tex shows `model Sutherland;` while the engine registers
        no Sutherland model
        theoryGuide.tex shows a `viscosityGas {` record block no engine reads
  S3  the SEALED water.dat inside the witness edited, omega 0.3449 -> 0.30:
        transport01_gas_bench no longer reproduces its golden
      and arm (b) again silent -- the recomputation reads the record the
      engine read, so both moved together and AGREED.  That is the arm
      doing what it claims (record-derived, not a constant of its own), and
      it is also why arm (k) exists: a record that drifts under a sealed
      golden is caught by the golden, not by the recount.  FINDING, outside
      this slice: the sealed run itself exited 0 on the changed record (see
      the record's section on what the seal did and did not say).
  S4  sprayDryer01's OWN transport block stripped from its thermoPhysPropDict
      (an input of the shipped case, not a copy):
        sprayDryer01 declares no transport block to strip -- arm (g) cannot
        run
        sprayDryer01_sugar no longer reproduces its golden
      Arm (g) says it COULD NOT RUN rather than passing on a strip that
      stripped nothing, and arm (k) sees the shipped case now refusing.

SABOTAGES, 2026-09-06, on the Chapman-Enskog arms, same rules -- OBSERVED
lines, each restored before the next:

  S5  transport02's sealed N2.dat: `epsOverK 71.4 K;` edited to `81.4 K;`
      (a record value moved under the seal):
        transport02: N2's case-local lennardJones block differs from the
        tool's fragment for N2 -- the witness no longer carries what the
        transcription says
        transport02_chapman_enskog no longer reproduces its golden
      Arm (l) stayed SILENT, correctly -- it reads the record the engine
      read, so both moved together and agreed (the S3 shape).  What sees a
      drifting record is the golden (k) and the fragment-equality arm (p),
      and (p) names WHAT moved.
  S6  the gate's OWN literal for Svehla's page changed, eta_uP 177.7 -> 179.7
      (the gate lying to itself about the report):
        Svehla's printed N2 eta at 300 K (177.7 muP, report page 90) is not
        reproduced from his own constants within 1 % (1.509 %)
        dev_ChapmanEnskog published 4.009522e-03 differs from the deviation
        recomputed here 1.509e-02 -- the engine and this gate read different
        anchors
        Svehla's printed N2 lambda at 300 K (63.9e-6 g-cal/(cm s K)) is not
        reproduced from his eta and Cp/R through eq. (2) within 0.2 %
        (1.173 %)
      The engine's anchor and the gate's are two homes for one page, and
      the second line is the arm that makes them agree or fail; the third
      fired because the lambda guard feeds on the same printed eta.
  S7  the lennardJones block removed from the SHIPPED transport02 N2.dat (an
      input of the witness, not the copy arm (n) builds):
        check_transport_correlations: FAIL -- the witness transport02 exited 1
      The gate stops at the witness run and says so.  That is why arm (n)
      strips a COPY: the refusal it tests is the same one, fired on a case
      the gate owns.
  S8  bin/curate/svehla1962/svehla1962_tableIa.tsv: N2's sigma 3.798 -> 3.789
      (the transcription moved, the witness did not):
        transport02: N2's case-local lennardJones block differs from the
        tool's fragment for N2 -- the witness no longer carries what the
        transcription says
      Arm (p)'s equality is what ties the ONE committed home to the case
      that runs from it; the recomputation arms stayed silent because the
      engine never read the TSV.

Sabotage NOT performed and named: nothing by-hand can make the Omega source
arm (j) or the membrane arm (i) fire without editing source, so those two
arms are verified only by reading them.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtests_verdict import verdict  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/transport/transport01_gas_bench"
CASE2 = ROOT / "tutorials/props/transport/transport02_chapman_enskog"
DRYER = ROOT / "tutorials/steady/drying/sprayDryer01_sugar"
MEMBRANE = ROOT / "tutorials/steady/membranes/membrane01_RO_NaCl_seawater"
PKG = ROOT / "src/thermo/ThermoPackage.cpp"
CHUNG = ROOT / "src/thermo/transport/ChungViscosity.cpp"
NEUFELD = ROOT / "src/thermo/transport/NeufeldOmega.cpp"
GUIDE = ROOT / "docs/theoryGuide.tex"
TOOL = ROOT / "bin/curate/propose_lennard_jones.py"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"

MODELS = ["Chung", "ChapmanEnskog", "Eucken", "modifiedEucken", "Fuller", "Andrade",
          "Vogel", "chemsepEq101", "SatoRiedel", "chemsepEq16", "wilkePhi"]
DECLARED_TOL_CAP = {"ChapmanEnskog": 1.0e-2}   # the only anchor allowed its own tolerance
GASES = ["N2", "O2", "CO2", "water"]
GASES2 = ["N2", "O2", "CO2", "water", "CH4", "Ar", "H2"]
T_CMP = 373.15
T_CMP2 = 300.0
R = 8.314462618
NEUFELD_COEFFS = ["1.16145", "0.14874", "0.52487", "0.77320", "2.16178", "2.43787"]
#  Svehla (1962) NASA TR R-132, Table III, report page 90: the N2 panel's
#  header and its 300 K row, read from the page image.  The engine carries
#  the same literals in ChapmanEnskog::svehlaAnchor(); arm (m) makes the two
#  homes agree or fail.
SVEHLA_N2 = dict(M=28.02, sigma=3.798, epsK=71.4, T=300.0, eta_uP=177.7, cpR=3.503,
                 lam_e6=63.9, cal_J=4.185, page="90")
fails = []


def run(binary, cwd, timeout=600):
    p = subprocess.run([str(binary)], cwd=str(cwd), capture_output=True,
                       text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def bench_diag(js):
    for op in js.get("operationResults", []):
        if op["name"] == "bench":
            return op.get("diagnostics", {})
    return {}


def scalar_field(text, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s+([-+0-9.eE]+)\s*;", text, re.M)
    return float(m.group(1)) if m else None


def cp_poly(text):
    blk = re.search(r"idealGasHeatCapacity\s*\{(.*?)\n\}", text, re.S)
    if not blk or "polynomial" not in blk.group(1):
        return None
    co = re.search(r"coefficients\s*\(([^)]*)\)", blk.group(1))
    return [float(x) for x in co.group(1).split()]


def lj_block(text):
    """The record's lennardJones block text, or None."""
    m = re.search(r"^lennardJones\s*\{", text, re.M)
    if not m:
        return None
    depth, i = 0, m.end() - 1
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[m.start():i + 1]
        i += 1
    return None


def lj_values(block):
    """sigma [m] and eps/k [K] parsed from the block in the grammar the loader reads."""
    s = re.search(r"^\s*sigma\s+\[\s*0\s+1\s+0\s+0\s+0\s*\]\s+([-+0-9.eE]+)\s*;", block, re.M)
    e = re.search(r"^\s*epsOverK\s+([-+0-9.eE]+)\s+K\s*;", block, re.M)
    return (float(s.group(1)) if s else None, float(e.group(1)) if e else None)


def neufeld(tstar):
    return (1.16145 / tstar ** 0.14874 + 0.52487 / math.exp(0.77320 * tstar)
            + 2.16178 / math.exp(2.43787 * tstar))


def chung_mu(M, Tc, Pc, w, T):
    Zc = 0.2918 - 0.0928 * w
    Vc = Zc * 83.14 * Tc / Pc
    Fc = 1.0 - 0.2756 * w
    return 40.785 * Fc * math.sqrt(M * T) / (Vc ** (2.0 / 3.0) * neufeld(1.2593 * T / Tc)) * 1e-7


def ce_mu(M, sigma_A, epsK, T):
    """Svehla eq. (1): eta [muP] = 26.693 sqrt(MT) / (sigma^2 Omega(2,2)*); -> Pa.s."""
    return 26.693 * math.sqrt(M * T) / (sigma_A * sigma_A * neufeld(T / epsK)) * 1e-7


def modified_eucken(cp, mu, M_kg):
    """Svehla eq. (2): lambda = (R/M)[15/4 + 1.32(Cp/R - 5/2)] eta."""
    return (R / M_kg) * (3.75 + 1.32 * (cp / R - 2.5)) * mu


def wilke_mix(y, q, eta, M):
    out = 0.0
    for i in range(len(y)):
        den = 0.0
        for j in range(len(y)):
            t = 1.0 + math.sqrt(eta[i] / eta[j]) * (M[j] / M[i]) ** 0.25
            den += y[j] * t * t / math.sqrt(8.0 * (1.0 + M[i] / M[j]))
        out += y[i] * q[i] / den
    return out


def strip_transport(text):
    """Remove the top-level `transport { ... }` block by brace matching."""
    m = re.search(r"^transport\s*\{", text, re.M)
    if not m:
        return None
    depth, i = 0, m.end() - 1
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[:m.start()] + text[i + 1:]
        i += 1
    return None


def case_copy(src, ignore=("converged", "reports", "design", "log.*",
                           "expected")):
    tmp = Path(tempfile.mkdtemp(prefix="ctc_", dir=str(ROOT / "build")))
    dst = tmp / src.name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(*ignore))
    return tmp, dst


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_transport_correlations: FAIL -- {b} missing; run `make all`")
            return 1

    rc, out = run(PROPS, CASE)
    if rc != 0:
        print(f"check_transport_correlations: FAIL -- the witness transport01 exited {rc}\n{out[-800:]}")
        return 1
    js = result_json(out) or {}
    diag = bench_diag(js)

    rc2, out2 = run(PROPS, CASE2)
    if rc2 != 0:
        print(f"check_transport_correlations: FAIL -- the witness transport02 exited {rc2}\n{out2[-800:]}")
        return 1
    js2 = result_json(out2) or {}
    diag2 = bench_diag(js2)

    # ---- (a) every model verifies; window, dated primary, kind, tolerance --
    for name in MODELS:
        if f"dev_{name}" not in diag:
            fails.append(f"{name} is not registered -- a family lost a member")
            continue
        tol = 1e-4
        if f"tol_{name}" in diag:
            if name not in DECLARED_TOL_CAP:
                fails.append(f"{name} declares its own anchor tolerance ({diag[f'tol_{name}']}); "
                             "only the Svehla reproduction anchor may")
            elif diag[f"tol_{name}"] > DECLARED_TOL_CAP[name]:
                fails.append(f"{name} declares a tolerance of {100*diag[f'tol_{name}']:.3f} %, "
                             f"above the {100*DECLARED_TOL_CAP[name]:.1f} % this gate allows -- "
                             "a loosened anchor")
            else:
                tol = diag[f"tol_{name}"]
                if f"tolerance DECLARED by the anchor = {100*tol:.4f} %" not in out:
                    fails.append(f"{name}'s declared tolerance is published but not PRINTED "
                                 "beside its row")
        elif name in DECLARED_TOL_CAP:
            fails.append(f"{name} no longer declares the tolerance its reproduction anchor needs")
        if diag[f"dev_{name}"] > tol:
            fails.append(f"{name} deviates {100*diag[f'dev_{name}']:.4f} % from its anchor "
                         f"(tolerance {100*tol:.4f} %)")
        blk = out.split(f"  {name} ", 1)[-1][:1800] if f"  {name} " in out else ""
        if "window:" not in blk:
            fails.append(f"no validity window printed for {name}")
        if "source:" not in blk or not re.search(r"\((1[89]\d\d|20\d\d)\)", blk):
            fails.append(f"no dated citation printed for {name}")
        if not re.search(r"kind: (theory|arithmetic)", blk):
            fails.append(f"{name} does not state the KIND of its anchor")
    n_theory = len(re.findall(r"kind: theory", out))
    n_arith = len(re.findall(r"kind: arithmetic", out))
    if diag.get("n_theory_anchors") != n_theory or diag.get("n_arithmetic_anchors") != n_arith:
        fails.append(f"published anchor counts ({diag.get('n_theory_anchors')} theory, "
                     f"{diag.get('n_arithmetic_anchors')} arithmetic) disagree with a recount "
                     f"of the printed kind lines ({n_theory}, {n_arith})")
    if n_theory < 3:
        fails.append("fewer than 3 THEORY anchors -- Eucken's and the modified Eucken's monatomic "
                     "limits and Wilke's phi_ii = 1 must all be present")

    # ---- (b) recomputed from the RECORDS (transport01) --------------------
    rec = {}
    for g in GASES:
        f = CASE / "constant/components" / f"{g}.dat"
        if not f.exists():
            fails.append(f"transport01 is not sealed with {g}.dat -- cannot recompute from the record")
            continue
        tx = f.read_text()
        rec[g] = dict(M=scalar_field(tx, "MW"), Tc=scalar_field(tx, "Tc"),
                      Pc=scalar_field(tx, "Pc"), w=scalar_field(tx, "omega"),
                      cp=cp_poly(tx))
        if None in rec[g].values():
            fails.append(f"{g}.dat lacks one of MW/Tc/Pc/omega/polynomial Cp")
    if len(rec) == len(GASES) and not any(None in r.values() for r in rec.values()):
        mu, k, M = [], [], []
        for g in GASES:
            r = rec[g]
            m_ = chung_mu(r["M"], r["Tc"], r["Pc"], r["w"], T_CMP)
            cp = sum(a * T_CMP ** i for i, a in enumerate(r["cp"]))
            k_ = (cp + 1.25 * R) * m_ / (r["M"] / 1000.0)
            mu.append(m_); k.append(k_); M.append(r["M"])
            for key, mine in ((f"mu_Chung_{g}", m_), (f"k_Eucken_{g}", k_)):
                theirs = diag.get(key)
                if theirs is None:
                    fails.append(f"{key} not published")
                elif abs(mine - theirs) / mine > 1e-9:
                    fails.append(f"{key}: engine {theirs:.6e}, recomputed from the record "
                                 f"{mine:.6e} ({100*abs(mine-theirs)/mine:.3f} %)")
            if cp <= 2.5 * R:
                fails.append(f"{g}'s record Cp at {T_CMP} K is not above 5R/2 -- arm (e) "
                             "would then have no polyatomic to flag")
        y = [1.0 / len(GASES)] * len(GASES)
        for key, mine in (("mu_mix_Wilke", wilke_mix(y, mu, mu, M)),
                          ("k_mix_Wassiljewa", wilke_mix(y, k, mu, M))):
            theirs = diag.get(key)
            if theirs is None:
                fails.append(f"{key} not published")
            elif abs(mine - theirs) / mine > 1e-9:
                fails.append(f"{key}: engine {theirs:.6e}, Wilke recomputed here {mine:.6e}")
        omega1 = neufeld(1.0)
        m = re.search(r"three-term value ([0-9.]+)", out)
        if not m or abs(float(m.group(1)) - omega1) > 1e-5:
            fails.append(f"Chung's anchor literal {m.group(1) if m else '(absent)'} is not the "
                         f"Neufeld fit's own value at T* = 1 ({omega1:.5f})")
    for name in ("Eucken", "modifiedEucken", "wilkePhi"):
        if diag.get(f"dev_{name}", 1.0) > 1e-12:
            fails.append(f"a THEORY anchor ({name}) is not met to machine precision -- "
                         "these are identities, not fits")

    # ---- (c) the spread is honest about its size, on both witnesses ------
    for label, d, o, want in (("transport01", diag, out, 1), ("transport02", diag2, out2, 2)):
        for fam, nkey, skey in (("viscosity", "n_evaluated_mu", "spread_mu_pct"),
                                ("conductivity", "n_evaluated_k", "spread_k_pct")):
            n, s = d.get(nkey), d.get(skey)
            if n is None or s is None:
                fails.append(f"{label}: {nkey}/{skey} not published")
                continue
            if fam == "viscosity" and n != want:
                fails.append(f"{label}: {nkey} is {n}; expected {want} (the witness's records "
                             f"{'lack' if want == 1 else 'carry'} lennardJones blocks)")
            if n == 1 and s != 0:
                fails.append(f"{label}: {skey} is {s} with ONE {fam} model evaluable")
            if n >= 2 and s <= 0:
                fails.append(f"{label}: {skey} is {s} with two {fam} models evaluated -- two "
                             "models that never differ is a second home, not a second opinion")
        if d.get("n_models_mu", 0) < 2 or d.get("n_models_k", 0) < 2:
            fails.append(f"{label}: fewer than two models registered per gas family")
        one = "A SPREAD OVER ONE MODEL IS NOT AGREEMENT" in o
        if want == 1 and not one:
            fails.append(f"{label}: one viscosity model evaluable and the output does not say a "
                         "spread over one is not agreement")
        if want == 2 and one:
            fails.append(f"{label}: two models evaluated per family and the output still says a "
                         "spread over one is not agreement -- the sentence is stale")
    if "not evaluable by ChapmanEnskog" not in out or \
            len(re.findall(r"not evaluable by ChapmanEnskog", out)) != len(GASES):
        fails.append("transport01 does not LIST each of its four components as not evaluable by "
                     "ChapmanEnskog -- a component skipped in silence")

    # ---- (d) Chung announces on a polar gas ---------------------------
    advs = [a for a in js.get("advisories", [])
            if a.get("locus", "").startswith("Chung gas viscosity, component")]
    water = [a for a in advs if "'water'" in a.get("locus", "")]
    if len(water) != 1:
        fails.append(f"Chung announced {len(water)} time(s) for water; expected exactly 1")
    elif not ("Vc ESTIMATED" in water[0]["message"] and "DROPPED" in water[0]["message"]):
        fails.append("Chung's water announcement lacks one of its two facts (Vc ESTIMATED / "
                     "polar and association terms DROPPED)")
    if len(advs) != len(GASES):
        fails.append(f"Chung announced for {len(advs)} components; the witness gas has {len(GASES)}")
    if "MODEL ASSUMPTIONS" not in out or "Chung gas viscosity, component 'water'" not in out:
        fails.append("the end-of-run caveat block does not replay Chung's announcement for water")

    # ---- (e) Eucken flags the polyatomics -----------------------------
    n_flag = len(re.findall(r"APPROXIMATION HERE", out))
    if n_flag != len(GASES):
        fails.append(f"Eucken flagged {n_flag} component(s) as an approximation; all "
                     f"{len(GASES)} witness gases are polyatomic by their records")
    if "polyatomic" not in out:
        fails.append("Eucken's approximation note does not name the reason (polyatomic)")
    n_flag2 = len(re.findall(r"APPROXIMATION HERE", out2))
    if n_flag2 != len(GASES2) - 1:
        fails.append(f"transport02: Eucken flagged {n_flag2} component(s); six of seven are "
                     "polyatomic and argon is not")
    if re.search(r"^\s*Ar\s+Eucken\s+[0-9.e+-]+\s+<-- APPROXIMATION", out2, re.M):
        fails.append("transport02: argon flagged as polyatomic -- its record's Cp is 5R/2")

    # ---- (f) the guide shows what the engine reads --------------------
    src_text = "".join(p.read_text() for p in (ROOT / "src/thermo").rglob("*.cpp"))
    has_suth = bool(re.search(r'registerModel\("[Ss]utherland"', src_text))
    has_lj = 'found("lennardJones")' in src_text
    guide = GUIDE.read_text()
    if not has_suth and re.search(r"model\s+Sutherland\s*;", guide):
        fails.append("theoryGuide.tex shows `model Sutherland;` while the engine registers no "
                     "Sutherland model")
    if not has_suth and re.search(r"viscosityGas\s*\{", guide):
        fails.append("theoryGuide.tex shows a `viscosityGas {` record block no engine reads")
    if not has_lj:
        fails.append("the Component no longer reads a lennardJones block -- the Chapman-Enskog "
                     "model has nothing to read")
        if re.search(r"lennardJones\s*\{", guide):
            fails.append("theoryGuide.tex shows a `lennardJones {` block while no engine reader exists")
    else:
        m = re.search(r"lennardJones\s*(?:/\*.*?\*/|//[^\n]*)?\s*\n\{(.*?)\n\}", guide, re.S)
        if not m:
            fails.append("a lennardJones reader exists and theoryGuide.tex shows no `lennardJones {` "
                         "block -- the grammar the loader reads is not taught")
        else:
            shown = m.group(1)
            if not re.search(r"sigma\s+\[0 1 0 0 0\]\s+[0-9.e+-]+\s*;", shown):
                fails.append("the guide's lennardJones example does not write sigma in the bracket "
                             "length form the loader checks (`sigma [0 1 0 0 0] <m>;`)")
            if not re.search(r"epsOverK\s+[0-9.]+\s+K\s*;", shown):
                fails.append("the guide's lennardJones example does not write `epsOverK <K> K;`")
            if "licence" not in shown or "origin" not in shown:
                fails.append("the guide's lennardJones example omits the per-value origin or the "
                             "licence word")
        if not re.search(r"model\s+ChapmanEnskog\s*;", guide):
            fails.append("theoryGuide.tex does not show `model ChapmanEnskog;` although it ships")
        if re.search(r"Chapman-Enskog.{0,200}NOT implemented", guide, re.S) and \
                not re.search(r"diffusivity by Chapman-Enskog is NOT implemented", guide):
            fails.append("theoryGuide.tex still calls Chapman-Enskog NOT implemented")

    # ---- (g) + (h) the dryer refuses, on copies this gate builds -------
    def dryer_copy(mutate):
        tmp, dst = case_copy(DRYER)
        d = dst / "constant/thermoPhysPropDict"
        d.write_text(mutate(d.read_text()))
        return tmp, dst
    stripped = strip_transport((DRYER / "constant/thermoPhysPropDict").read_text())
    if stripped is None:
        fails.append("sprayDryer01 declares no transport block to strip -- arm (g) cannot run")
    else:
        tmp, dst = dryer_copy(lambda t: strip_transport(t))
        try:
            rc, o = run(SOLVE, dst)
            if rc == 0:
                fails.append("the stripped copy did NOT refuse -- a dryer with no transport "
                             "model ran to exit 0")
            if "declares no transport model" not in o:
                fails.append("the no-transport refusal does not name its cause")
            if "transport { vapour { viscosity { model Chung; }" not in o:
                fails.append("the no-transport refusal does not carry the remedy")
            if "tau_dry_constant" in o and rc == 0:
                fails.append("a drying time was published with no transport model")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        tmp, dst = dryer_copy(lambda t: t.replace(
            "transport\n{", "transport\n{\n    liquid { viscosity { model Andrade; } }", 1))
        try:
            rc, o = run(SOLVE, dst)
            if rc == 0:
                fails.append("a declared Andrade model that cannot price sucrose did NOT refuse")
            if "will NOT substitute water" not in o:
                fails.append("the declared-liquid-model refusal does not say it will not "
                             "substitute water")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ---- (i) the membrane announces its legacy default -----------------
    rc, o = run(SOLVE, MEMBRANE)
    if rc != 0:
        fails.append(f"membrane01 exited {rc}")
    if "[legacy] mu_feed 1e-3 Pa.s ASSUMED" not in o:
        fails.append("membrane01 does not announce its legacy mu_feed default")
    if "declare transport { liquid { viscosity" not in o:
        fails.append("the legacy mu_feed announcement carries no remedy")

    # ---- (j) one home for phi_ij, one home for Omega(2,2)* -------------
    pkg = PKG.read_text()
    if re.search(r"pow\(\s*Mj\s*/\s*Mi\s*,\s*0\.25\s*\)", pkg):
        fails.append("ThermoPackage.cpp carries its own phi_ij arithmetic again -- the "
                     "mixing rule has two homes")
    if pkg.count("gasMixing::wilkeSum") < 2:
        fails.append("ThermoPackage.cpp reaches gasMixing::wilkeSum fewer than twice -- "
                     "viscosity and conductivity must both go through the one home")
    chung_src = CHUNG.read_text()
    neu_src = NEUFELD.read_text()
    for c in NEUFELD_COEFFS:
        if c in chung_src:
            fails.append(f"ChungViscosity.cpp carries the Neufeld coefficient {c} -- the "
                         "collision-integral fit has two homes again")
        if neu_src.count(c) != 1:
            fails.append(f"NeufeldOmega.cpp carries the coefficient {c} {neu_src.count(c)} "
                         "time(s); exactly once is the one home")
    if "neufeld::omega22" not in chung_src:
        fails.append("ChungViscosity.cpp does not call neufeld::omega22")
    ce_src = (ROOT / "src/thermo/transport/ChapmanEnskog.cpp").read_text()
    if "neufeld::omega22" not in ce_src:
        fails.append("ChapmanEnskog.cpp does not call neufeld::omega22")

    # ---- (l) Chapman-Enskog and the modified Eucken from the sealed records
    rec2 = {}
    for g in GASES2:
        f = CASE2 / "constant/components" / f"{g}.dat"
        if not f.exists():
            fails.append(f"transport02 is not sealed with {g}.dat -- cannot recompute from the record")
            continue
        tx = f.read_text()
        blk = lj_block(tx)
        if blk is None:
            fails.append(f"transport02's {g}.dat carries no lennardJones block")
            continue
        sig, eps = lj_values(blk)
        rec2[g] = dict(M=scalar_field(tx, "MW"), cp=cp_poly(tx), sigma=sig, eps=eps, block=blk, text=tx)
        if None in (rec2[g]["M"], rec2[g]["cp"], sig, eps):
            fails.append(f"transport02's {g}.dat: MW / polynomial Cp / `sigma [0 1 0 0 0] <m>;` / "
                         "`epsOverK <K> K;` not all readable")
    good2 = len(rec2) == len(GASES2) and not any(
        None in (r["M"], r["cp"], r["sigma"], r["eps"]) for r in rec2.values())
    if good2:
        for g in GASES2:
            r = rec2[g]
            mu_ = ce_mu(r["M"], r["sigma"] * 1e10, r["eps"], T_CMP2)
            cp = sum(a * T_CMP2 ** i for i, a in enumerate(r["cp"]))
            k_ = modified_eucken(cp, mu_, r["M"] / 1000.0)
            for key, mine in ((f"mu_ChapmanEnskog_{g}", mu_), (f"k_modifiedEucken_{g}", k_)):
                theirs = diag2.get(key)
                if theirs is None:
                    fails.append(f"{key} not published")
                elif abs(mine - theirs) / mine > 1e-9:
                    fails.append(f"{key}: engine {theirs:.6e}, recomputed from the record "
                                 f"{mine:.6e} ({100*abs(mine-theirs)/mine:.3f} %)")

    # ---- (m) the Svehla reproduction anchor, recomputed here -----------
    a = SVEHLA_N2
    mine_uP = ce_mu(a["M"], a["sigma"], a["epsK"], a["T"]) * 1e7
    dev_here = abs(mine_uP - a["eta_uP"]) / a["eta_uP"]
    if dev_here > 1e-2:
        fails.append(f"Svehla's printed N2 eta at 300 K (177.7 muP, report page {a['page']}) is not "
                     f"reproduced from his own constants within 1 % ({100*dev_here:.3f} %)")
    pub = diag.get("dev_ChapmanEnskog")
    if pub is None or abs(pub - dev_here) > 1e-6:
        fails.append(f"dev_ChapmanEnskog published {pub if pub is None else f'{pub:.6e}'} differs "
                     f"from the deviation recomputed here {dev_here:.3e} -- the engine and this "
                     "gate read different anchors")
    blk = out.split("  ChapmanEnskog ", 1)[-1][:1800] if "  ChapmanEnskog " in out else ""
    if f"report page {a['page']}" not in blk or "300 K" not in blk:
        fails.append("ChapmanEnskog's anchor text does not name Svehla's report page 90 and 300 K")
    if "kind: arithmetic" not in blk:
        fails.append("ChapmanEnskog's anchor is not declared ARITHMETIC -- Svehla's table is "
                     "computed, not measured")
    lam_mine = modified_eucken(a["cpR"] * R, a["eta_uP"] * 1e-7, a["M"] * 1e-3)
    lam_his = a["lam_e6"] * 1e-6 * a["cal_J"] * 100.0
    if abs(lam_mine - lam_his) / lam_his > 2e-3:
        fails.append(f"Svehla's printed N2 lambda at 300 K (63.9e-6 g-cal/(cm s K)) is not "
                     f"reproduced from his eta and Cp/R through eq. (2) within 0.2 % "
                     f"({100*abs(lam_mine-lam_his)/lam_his:.3f} %)")
    mblk = out.split("  modifiedEucken ", 1)[-1][:1800] if "  modifiedEucken " in out else ""
    if "kind: theory" not in mblk or "report page 90" not in mblk:
        fails.append("modifiedEucken's anchor is not the THEORY monatomic limit with the Svehla "
                     "reproduction named beside it")

    # ---- (n) Chapman-Enskog refuses by name, on a copy -----------------
    tx = (CASE2 / "constant/components/N2.dat").read_text()
    blk = lj_block(tx)
    if blk is None:
        fails.append("transport02's N2.dat has no lennardJones block to strip -- arm (n) cannot run")
    else:
        tmp, dst = case_copy(CASE2)
        try:
            f = dst / "constant/components/N2.dat"
            f.write_text(f.read_text().replace(blk, ""))
            rc, o = run(PROPS, dst)
            if rc == 0:
                fails.append("a ChapmanEnskog case whose N2 has no lennardJones block ran to exit 0")
            if "'N2'" not in o or "lennardJones" not in o:
                fails.append("the Chapman-Enskog refusal does not name the component and the block")
            if "propose_lennard_jones.py" not in o:
                fails.append("the Chapman-Enskog refusal does not name the curation remedy")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ---- (o) the origins are announced --------------------------------
    advs2 = [x for x in js2.get("advisories", [])
             if x.get("locus", "").startswith("ChapmanEnskog gas viscosity, component")]
    if len(advs2) != len(GASES2):
        fails.append(f"ChapmanEnskog announced for {len(advs2)} components; transport02 has {len(GASES2)}")
    for x in advs2:
        msg = x.get("message", "")
        if msg.count("FITTED to measured transport data") != 2 or "report page" not in msg:
            fails.append(f"ChapmanEnskog's announcement for {x.get('locus')} does not state both "
                         "constants FITTED to measured data with the report page")
    if "ChapmanEnskog gas viscosity, component 'water'" not in out2.split("<<<Choupo:result-begin>>>")[0]:
        fails.append("transport02's caveat block does not replay the Chapman-Enskog announcement")

    # ---- (p) the tool is deterministic and refuses the public tree -----
    if not TOOL.exists():
        fails.append("bin/curate/propose_lennard_jones.py is missing")
    else:
        outs = []
        tmps = []
        try:
            for _ in range(2):
                t = Path(tempfile.mkdtemp(prefix="ctc_lj_", dir=str(ROOT / "build")))
                tmps.append(t)
                p = subprocess.run([sys.executable, str(TOOL), "--out", str(t)],
                                   capture_output=True, text=True, timeout=300)
                if p.returncode != 0:
                    fails.append(f"propose_lennard_jones.py exited {p.returncode}: {p.stderr[-300:]}")
                outs.append({f.name: f.read_bytes() for f in sorted(t.glob("*.dat"))})
            if outs and outs[0] != outs[-1]:
                fails.append("propose_lennard_jones.py is not deterministic -- two runs differ")
            if outs and len(outs[0]) < 50:
                fails.append(f"propose_lennard_jones.py wrote {len(outs[0])} fragment(s); at least 50 "
                             "matched components were expected from the transcription")
            if good2 and outs:
                for g in GASES2:
                    frag = outs[0].get(f"{g}.dat")
                    if frag is None:
                        fails.append(f"the tool writes no fragment for {g}")
                        continue
                    fb = lj_block(frag.decode("utf-8"))
                    if fb != rec2[g]["block"]:
                        fails.append(f"transport02: {g}'s case-local lennardJones block differs from "
                                     f"the tool's fragment for {g} -- the witness no longer carries "
                                     "what the transcription says")
        finally:
            for t in tmps:
                shutil.rmtree(t, ignore_errors=True)
        std = ROOT / "data/standards/components/_ctc_probe"
        p = subprocess.run([sys.executable, str(TOOL), "--out", str(std)],
                           capture_output=True, text=True, timeout=60)
        if p.returncode == 0 or "REFUSED" not in (p.stdout + p.stderr):
            fails.append("propose_lennard_jones.py did not REFUSE an --out under data/standards/")
        if std.exists():
            shutil.rmtree(std, ignore_errors=True)
            fails.append("propose_lennard_jones.py created a directory under data/standards/")

    # ---- (q) the sealed records carry the public-domain form -----------
    if good2:
        for g in GASES2:
            b = rec2[g]["block"]
            if "NASA TR R-132" not in b or not re.search(r"^\s*source\s+\"", b, re.M):
                fails.append(f"transport02's {g}: lennardJones block does not cite NASA TR R-132 in "
                             "`source`")
            if not re.search(r"^\s*licence\s+publicDomain\s*;", b, re.M):
                fails.append(f"transport02's {g}: lennardJones block does not declare "
                             "`licence publicDomain;`")
            for key in ("sigma", "epsOverK"):
                if not re.search(key + r"\s*\{[^}]*origin\s+\w+\s*;", b, re.S):
                    fails.append(f"transport02's {g}: no per-value `origin` under {key}")

    # ---- (k) the corpus did not move -----------------------------------
    for case in (CASE, CASE2, DRYER, MEMBRANE):
        state, _rout, reason = verdict(case)
        if state == "could-not-run":
            fails.append(f"the golden arm for {case.name} COULD NOT RUN -- this is NOT a "
                         "statement about its answer: " + reason)
        elif state == "fail":
            fails.append(f"{case.name} no longer reproduces its golden -- an honesty fix "
                         "that moves an answer is not an honesty fix")

    if fails:
        print("check_transport_correlations: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print(f"check_transport_correlations: OK -- all {len(MODELS)} transport correlations "
          "(five families + the shared Wilke phi_ij) verify against their own anchors within "
          "their tolerance (1e-4, or the 1 % the Chapman-Enskog reproduction anchor DECLARES "
          "and prints) and print a window, a dated PRIMARY citation and the KIND of anchor "
          f"({n_theory} theory, {n_arith} arithmetic, recounted from the output); Chung mu, "
          "Eucken k, Wilke mu_mix and Wassiljewa k_mix for N2/O2/CO2/water at 373.15 K and "
          "Chapman-Enskog mu and modified-Eucken k for seven gases at 300 K are RECOMPUTED "
          "here from the sealed records (sigma, eps/k parsed in the loader's grammar) to 1e-9 "
          f"and agree; Svehla's printed N2 viscosity is reproduced from his constants within "
          f"{100*dev_here:.2f} % and the engine's anchor deviation equals this recount; the "
          "spread sentence keys on models EVALUATED (present on transport01, absent on "
          "transport02, whose two spreads are nonzero) and a component without a block is "
          "LISTED as not evaluable; Chung announces Vc-estimated and polar-terms-dropped once "
          "per component; Chapman-Enskog announces both origins FITTED with the report page "
          "for all seven; Eucken flags every polyatomic and not argon; the Theory Guide shows "
          "the lennardJones grammar the loader reads and no Sutherland/viscosityGas key; a "
          "record without the block REFUSES by name with the remedy (stripped copy); a spray "
          "dryer with no transport model REFUSES with the remedy and a declared liquid model "
          "it cannot price REFUSES rather than substituting water; membrane01 announces its "
          "[legacy] default; phi_ij and Omega(2,2)* each have ONE home (source arms); "
          "propose_lennard_jones.py is deterministic, writes the blocks the witness carries, "
          "and REFUSES data/standards/; the sealed blocks cite NASA TR R-132 with `licence "
          "publicDomain;` and per-value origins; four goldens unmoved.  NOT CHECKED: that any "
          "correlation is RIGHT -- the catalogue holds no measured transport data, Svehla's "
          "sigma/eps-k are his fits to pre-1962 measurements and are not validated here; the "
          "page-image transcription is not re-read; Fuller and the liquid models are "
          "verify()-only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
