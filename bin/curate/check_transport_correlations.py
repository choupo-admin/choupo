#!/usr/bin/env python3
"""Gate: the transport families state their windows, cite their primaries, and prove themselves -- and the four silences of 2026-09-05 stay closed.

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

This gate pins the properties that make the slice worth having, on the
witness `tutorials/props/transport/transport01_gas_bench` and on copies it
builds itself.  NUMBERS ARE RECOMPUTED HERE from the sealed RECORDS -- MW,
Tc, Pc, omega, the Cp polynomial -- not read back from the engine's log; an
auditor that reuses the auditee's arithmetic checks nothing.

WHAT IS CHECKED

  (a) EVERY REGISTERED MODEL VERIFIES within 1e-4 of its own anchor, and the
      run prints its window, a dated PRIMARY citation and the KIND of anchor
      (theory | arithmetic).  The published anchor counts (2 theory, 7
      arithmetic) are recounted from the printed `kind:` lines.
  (b) RECOMPUTED FROM THE RECORDS, at the witness point (373.15 K):
        Chung   mu for each of N2, O2, CO2, water from MW/Tc/Pc/omega, with
                the Neufeld fit written out here (1e-9 relative);
        Neufeld Omega(T* = 1) from the three published coefficients equals
                the literal Chung's anchor carries;
        Eucken  k = (Cp + 5R/4) mu / M with Cp from the record polynomial;
        Wilke   mu_mix from the pure values and the record MWs, equimolar;
        Wassiljewa / Mason-Saxena  k_mix likewise, with A_ij = phi_ij.
  (c) THE SPREAD IS HONEST ABOUT ITS SIZE.  With one model registered per
      gas family the published spread is 0 and the output must SAY that a
      spread over one is not agreement; the day a second model registers,
      the sentence must be gone and the spread nonzero.
  (d) CHUNG ANNOUNCES on a polar gas: the witness holds water, and the
      caveat block and the result JSON must carry, for 'water', both facts
      -- Vc ESTIMATED and the polar/association terms DROPPED -- once per
      component (four entries, none for an absent species).
  (e) EUCKEN FLAGS the polyatomics: all four witness gases have Cp > 5R/2
      by their own records, so four APPROXIMATION HERE lines naming
      "polyatomic".
  (f) THE THEORY GUIDE CARRIES NO `model Sutherland;` / `lennardJones {`
      EXAMPLE WHILE NO ENGINE READER EXISTS.  The arm reads the engine first:
      if a Sutherland model is registered or a lennardJones block is read,
      the guide may show them and the arm says so instead of failing.
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
      of its own and reaches gasMixing::wilkeSum at BOTH call sites.
      Source inspection, because no output arm can see a second home that
      happens to agree.
  (k) THE CORPUS DID NOT MOVE: sprayDryer01 and membrane01 reproduce their
      goldens (through bin/runTests, verdict by runtests_verdict -- a
      harness that could not run is reported as such, never as a moved
      answer).

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * That any correlation is RIGHT.  Seven of the nine anchors are the
      correlation's own closed form and the other two are identities; the
      catalogue holds NO measured viscosity, conductivity or diffusivity,
      and no arm here compares with one.
  * Fuller, the liquid models and the liquid diffusivity (Wilke-Chang, which
      gained no window/citation/verify in this slice) are checked for
      verify() only, not recomputed.
  * The Chapman-Enskog / Sutherland ABSENCE is pinned, not their future
      correctness; arm (f) is designed to relax the day a reader exists.

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

A fifth sabotage was NOT performed and is named: nothing by-hand can make
the membrane arm (i) or the phi_ij source arm (j) fire without editing
source, so those two arms are verified only by reading them.
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
DRYER = ROOT / "tutorials/steady/drying/sprayDryer01_sugar"
MEMBRANE = ROOT / "tutorials/steady/membranes/membrane01_RO_NaCl_seawater"
PKG = ROOT / "src/thermo/ThermoPackage.cpp"
GUIDE = ROOT / "docs/theoryGuide.tex"
PROPS = ROOT / "choupoProps"
SOLVE = ROOT / "choupoSolve"

MODELS = ["Chung", "Eucken", "Fuller", "Andrade", "Vogel", "chemsepEq101",
          "SatoRiedel", "chemsepEq16", "wilkePhi"]
GASES = ["N2", "O2", "CO2", "water"]
T_CMP = 373.15
R = 8.314462618
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


def scalar_field(text, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s+([-+0-9.eE]+)\s*;", text, re.M)
    return float(m.group(1)) if m else None


def cp_poly(text):
    blk = re.search(r"idealGasHeatCapacity\s*\{(.*?)\n\}", text, re.S)
    if not blk or "polynomial" not in blk.group(1):
        return None
    co = re.search(r"coefficients\s*\(([^)]*)\)", blk.group(1))
    return [float(x) for x in co.group(1).split()]


def neufeld(tstar):
    return (1.16145 / tstar ** 0.14874 + 0.52487 / math.exp(0.77320 * tstar)
            + 2.16178 / math.exp(2.43787 * tstar))


def chung_mu(M, Tc, Pc, w, T):
    Zc = 0.2918 - 0.0928 * w
    Vc = Zc * 83.14 * Tc / Pc
    Fc = 1.0 - 0.2756 * w
    return 40.785 * Fc * math.sqrt(M * T) / (Vc ** (2.0 / 3.0) * neufeld(1.2593 * T / Tc)) * 1e-7


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


def main():
    for b in (PROPS, SOLVE):
        if not b.exists():
            print(f"check_transport_correlations: FAIL -- {b} missing; run `make all`")
            return 1

    rc, out = run(PROPS, CASE)
    if rc != 0:
        print(f"check_transport_correlations: FAIL -- the witness exited {rc}\n{out[-800:]}")
        return 1
    js = result_json(out) or {}
    diag = {}
    for op in js.get("operationResults", []):
        if op["name"] == "bench":
            diag = op.get("diagnostics", {})

    # ---- (a) every model verifies; window, dated primary, kind ----------
    for name in MODELS:
        if f"dev_{name}" not in diag:
            fails.append(f"{name} is not registered -- a family lost a member")
            continue
        if diag[f"dev_{name}"] > 1e-4:
            fails.append(f"{name} deviates {100*diag[f'dev_{name}']:.4f} % from its anchor (tolerance 0.01 %)")
        blk = out.split(f"  {name} ", 1)[-1][:1400] if f"  {name} " in out else ""
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
    if n_theory < 2:
        fails.append("fewer than 2 THEORY anchors -- Eucken's monatomic limit and Wilke's "
                     "phi_ii = 1 must both be present")

    # ---- (b) recomputed from the RECORDS ------------------------------
    rec = {}
    for g in GASES:
        f = CASE / "constant/components" / f"{g}.dat"
        if not f.exists():
            fails.append(f"witness is not sealed with {g}.dat -- cannot recompute from the record")
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
    if diag.get("dev_Eucken", 1.0) > 1e-12 or diag.get("dev_wilkePhi", 1.0) > 1e-12:
        fails.append("a THEORY anchor (Eucken monatomic limit / Wilke phi_ii) is not met "
                     "to machine precision -- these are identities, not fits")

    # ---- (c) the spread is honest about its size ----------------------
    for fam, nkey, skey in (("viscosity", "n_models_mu", "spread_mu_pct"),
                            ("conductivity", "n_models_k", "spread_k_pct")):
        n, s = diag.get(nkey), diag.get(skey)
        if n is None or s is None:
            fails.append(f"{nkey}/{skey} not published")
        elif n == 1:
            if s != 0:
                fails.append(f"{skey} is {s} with ONE {fam} model registered")
            if "A SPREAD OVER ONE MODEL IS NOT AGREEMENT" not in out:
                fails.append("one model per gas family and the output does not say a "
                             "spread over one is not agreement")
        elif "A SPREAD OVER ONE MODEL IS NOT AGREEMENT" in out and n >= 2 and \
                diag.get("n_models_mu", 0) >= 2 and diag.get("n_models_k", 0) >= 2:
            fails.append("two or more models per family and the output still says a spread "
                         "over one is not agreement -- the sentence is stale")

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

    # ---- (f) the guide shows no key the engine cannot read -------------
    src_text = "".join(p.read_text() for p in (ROOT / "src/thermo").rglob("*.cpp"))
    has_suth = bool(re.search(r'registerModel\("[Ss]utherland"', src_text))
    has_lj = "lennardJones" in src_text
    guide = GUIDE.read_text()
    if not has_suth and re.search(r"model\s+Sutherland\s*;", guide):
        fails.append("theoryGuide.tex shows `model Sutherland;` while the engine registers no "
                     "Sutherland model")
    if not has_lj and re.search(r"lennardJones\s*\{", guide):
        fails.append("theoryGuide.tex shows a `lennardJones {` block while no engine reader exists")
    if not has_suth and re.search(r"viscosityGas\s*\{", guide):
        fails.append("theoryGuide.tex shows a `viscosityGas {` record block no engine reads")

    # ---- (g) + (h) the dryer refuses, on copies this gate builds -------
    def dryer_copy(mutate):
        tmp = Path(tempfile.mkdtemp(prefix="ctc_dryer_",
                                    dir=str(ROOT / "build")))
        dst = tmp / DRYER.name
        shutil.copytree(DRYER, dst, ignore=shutil.ignore_patterns(
            "converged", "reports", "internalStates", "design", "log.*"))
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

    # ---- (j) one home for phi_ij ---------------------------------------
    pkg = PKG.read_text()
    if re.search(r"pow\(\s*Mj\s*/\s*Mi\s*,\s*0\.25\s*\)", pkg):
        fails.append("ThermoPackage.cpp carries its own phi_ij arithmetic again -- the "
                     "mixing rule has two homes")
    if pkg.count("gasMixing::wilkeSum") < 2:
        fails.append("ThermoPackage.cpp reaches gasMixing::wilkeSum fewer than twice -- "
                     "viscosity and conductivity must both go through the one home")

    # ---- (k) the corpus did not move -----------------------------------
    for case in (CASE, DRYER, MEMBRANE):
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
          "(five families + the shared Wilke phi_ij) verify against their own anchors "
          f"within 0.01 % and print a window, a dated PRIMARY citation and the KIND of "
          f"anchor ({n_theory} theory, {n_arith} arithmetic, recounted from the output); "
          "Chung mu, Eucken k, Wilke mu_mix and Wassiljewa k_mix for N2/O2/CO2/water at "
          "373.15 K are RECOMPUTED here from the sealed records to 1e-9 and agree; the "
          "spread column says a spread over ONE model is not agreement; Chung announces "
          "Vc-estimated and polar-terms-dropped once per present component, water "
          "included; Eucken flags every polyatomic by its record's own Cp; the Theory "
          "Guide shows no Sutherland/lennardJones/viscosityGas key while the engine has "
          "no reader; a spray dryer with no transport model REFUSES with the remedy "
          "(stripped copy) and a declared liquid model it cannot price REFUSES rather "
          "than substituting water; membrane01 announces its [legacy] mu_feed default; "
          "ThermoPackage.cpp keeps NO private phi_ij and reaches the one home twice; "
          "sprayDryer01 and membrane01 goldens unmoved.  NOT CHECKED: that any "
          "correlation is RIGHT -- the catalogue holds no measured transport data and "
          "seven anchors are the correlation's own closed form; Fuller and the liquid "
          "models are verify()-only here; Wilke-Chang gained nothing in this slice.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
