#!/usr/bin/env python3
"""check_gibbs_real_gas -- every route that MINIMISES a Gibbs energy carries
the vapour the package DECLARES (2026-10-26, DEV.md 4c C173, the external
audit's claims 2 and 3).

WHY.  Two objectives stopped at the ideal-gas chemical potential while the
case declared a real one, and neither said so:

  * the gibbsReactor's `directMin` route summed n_i^V (g_i/RT + ln y_i +
    ln(P/P0)) with no ln phi_i, so ammonia synthesis at 700 K and 200 bar on
    an SRK package published the IDEAL-gas answer, 30.013 % NH3, while
    elementPotential (whose gas solve folds phi in) published 32.387 %;
  * the isothermalFlash's VLLE branch priced its vapour as ln y_i +
    ln(P/Psat_i) with no ln phi_i, so `fugacityModel SRK;` and `idealGas;`
    gave the same three-phase answer to every printed digit -- and the
    K-values the package itself prints for that answer sat 1.6-3.4 % away
    from y/x.

A declared model silently ignored is the worst kind of wrong answer: it is
a DIFFERENT problem from the one posed, solved correctly, at exit 0.

WHAT THIS CHECKS (every reference computed WITHOUT a unit operation, by the
case's own package through bin/curate/_gibbsAuditProbe.cpp):

  (a) AMMONIA, gibbs10_ammonia_fugacity (stoichiometric N2 + 3 H2, 700 K,
      200 bar, SRK): the probe solves the fugacity condition
      sum_i nu_i (g_i/RT + ln y_i + ln(P/P0) + ln phi_i) = 0 by bisection
      on the extent, with the package's ln phi at the current y.  Each of
      elementPotential, reactiveFlash and directMin must publish y_NH3
      within 2e-4 of it.  The witness must DISCRIMINATE: the same condition
      with ln phi = 0 must differ by more than 0.01 (otherwise the arm
      could not tell the two objectives apart).
  (b) VLLE, vlle03_audit_artificial with `fugacityModel SRK;` (350 K,
      1 bar): the published three-phase answer's y_i / x_alpha_i must equal
      the package's own K_i = gamma_i Psat_i / (phi_i P) at that (x, y)
      within 1 % for every component (the Nelder-Mead tolerance holds the
      ideal twin to 0.2 %; the defect was 1.6-3.4 %), and the run must say
      that the vapour term carries ln phi.

BY-HAND SABOTAGES (2026-10-26): DirectMin.cpp with the ln phi term removed
fails (a) (30.013 % against 32.387 %); IsothermalFlash.cpp's VLLE objective
with ln phi removed fails (b) (compB 3.4 % off).

NOT CHECKED, said plainly: the liquid side of the gamma-phi convention
(no Poynting, no phi_sat -- the package's own K omits them too, so this
gate holds the routes to the package, not to a measurement); and the
elementPotential / reactiveFlash LIQUID tests, which read the gas fugacity
as y_i P rather than y_i phi_i P (named, unestablished, in DEV.md C173).

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import gibbs_audit_probe as gap  # noqa: E402

SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
NH3 = ROOT / "tutorials" / "steady" / "gibbs" / "gibbs10_ammonia_fugacity"
VLLE = ROOT / "tutorials" / "steady" / "flash" / "vlle03_audit_artificial"
LABEL = "check_gibbs_real_gas"
failures = []


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def flows(path):
    s = path.read_text()
    blk = re.search(r"componentMolarFlows\s*\{(.*?)\}", s, re.S).group(1)
    d = {k: float(v) for k, v in re.findall(r"(\w+)\s+([0-9.eE+-]+)", blk)}
    t = sum(d.values())
    return {k: v / t for k, v in d.items()}


def copy(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "expected", "log.*", "converged", "reports"))
    mp = dst / "constant" / "propertyManifest"
    if mp.exists():
        mp.unlink()
    return dst


def main():
    if not SOLVE.exists():
        print(LABEL + ": FAILED\n  choupoSolve is not built -- a check that"
              " cannot run must not pass")
        return 1
    err = gap.build()
    if err:
        print(LABEL + ": FAILED\n  " + err)
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- (a) ammonia: three routes against the fugacity condition ----
        ref_case = copy(NH3, tmp / "ref")
        names = gap.ask(ref_case, ["NAMES"], tmp)[0]
        n0 = {"N2": 0.25, "H2": 0.75, "NH3": 0.0}
        nu = {"N2": -1, "H2": -3, "NH3": 2}
        vec = lambda d: " ".join(repr(float(d.get(k, 0.0))) for k in names)
        real, ideal = gap.ask(ref_case, [
            "REACT 700 2e7 %s %s" % (vec(n0), vec(nu)),
            "REACTIDEAL 700 2e7 %s %s" % (vec(n0), vec(nu))], tmp)
        yref = real[1 + names.index("NH3")]
        yid = ideal[1 + names.index("NH3")]
        if abs(yref - yid) < 0.01:
            failures.append("(a) the witness does not discriminate: real-gas"
                            " %.5f vs ideal %.5f" % (yref, yid))
        for model in ("elementPotential", "reactiveFlash", "directMin"):
            case = copy(NH3, tmp / model)
            fd = case / "system" / "flowsheetDict"
            s = fd.read_text()
            key = "type       gibbsReactor;"
            if s.count(key) != 1:
                raise SystemExit(LABEL + ": fixture text moved -- fix the GATE")
            fd.write_text(s.replace(key, key + "\n        model      %s;" % model))
            rc, out = run(case)
            if rc != 0:
                failures.append("(a) %s: exit %d" % (model, rc))
                continue
            y = flows(case / "converged" / "products").get("NH3", 0.0)
            if abs(y - yref) > 2.0e-4:
                failures.append(
                    "(a) %s publishes y_NH3 = %.5f; the fugacity condition"
                    " with the package's own ln phi gives %.5f (ideal gas:"
                    " %.5f)" % (model, y, yref, yid))

        # ---- (b) VLLE with an SRK vapour --------------------------------
        case = copy(VLLE, tmp / "vlle_srk")
        tp = case / "constant" / "thermoPhysPropDict"
        s = tp.read_text()
        if s.count("fugacityModel idealGas;") != 1:
            raise SystemExit(LABEL + ": fixture text moved -- fix the GATE")
        tp.write_text(s.replace("fugacityModel idealGas;", "fugacityModel SRK;"))
        rc, out = run(case)
        if rc != 0:
            failures.append("(b) VLLE/SRK: exit %d" % rc)
        else:
            if "three-phase" not in out:
                failures.append("(b) the VLLE/SRK fixture no longer reaches"
                                " three phases -- the arm tests nothing")
            if "carries ln phi_i from the declared SRK" not in out:
                failures.append("(b) the run does not say that the vapour"
                                " term carries the declared EoS's ln phi")
            cnames = gap.ask(case, ["NAMES"], tmp)[0]
            y = flows(case / "converged" / "vapor")
            xa = flows(case / "converged" / "liquidA")
            Y = [y.get(k, 0.0) for k in cnames]
            XA = [xa.get(k, 0.0) for k in cnames]
            K = gap.ask(case, ["K 350 100000 %s %s" % (
                " ".join(map(repr, XA)), " ".join(map(repr, Y)))], tmp)[0]
            for k, yi, xi, Ki in zip(cnames, Y, XA, K):
                ratio = (yi / xi) / Ki
                if abs(ratio - 1.0) > 0.01:
                    failures.append(
                        "(b) %s: published y/x_alpha = %.5f, the package's"
                        " own K there = %.5f (%.2f %% apart)"
                        % (k, yi / xi, Ki, 100.0 * (ratio - 1.0)))

    if failures:
        print(LABEL + ": FAILED")
        for f in failures:
            print("  - " + f)
        return 1
    print(LABEL + ": OK -- elementPotential, reactiveFlash and directMin"
          " publish the ammonia equilibrium the package's own fugacity"
          " condition gives (700 K, 200 bar, SRK; 2e-4 in y_NH3, against an"
          " ideal-gas answer 0.024 away), and a VLLE flash on an SRK vapour"
          " publishes y/x equal to the package's own K within 1 %.  NOT"
          " checked: the liquid's Poynting / phi_sat (absent from the"
          " package's K too), and the liquid-onset tests of the"
          " element-potential and reactive-flash routes, which read y_i P.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
