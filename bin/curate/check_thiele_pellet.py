#!/usr/bin/env python3
"""Gate: the intraparticle field and eta(phi) reproduce the CLOSED FORM.

    bin/curate/check_thiele_pellet.py

WHY THIS EXISTS.  `reactor/CatalystPellet.H` announces that the pellet is a
point and eta = 1 is assumed; `thielePellet` is the slice that finally
COMPUTES eta, from the intraparticle boundary-value problem

    u'' + (s/xi) u' = phi_char^2 u,   u'(0) = 0,  u(1) = 1,

solved by hand-rolled central differences on the existing Newton + LU.  A
numerical answer nobody can check is a plausible number at exit 0, which is
the one failure this project refuses -- and the first-order isothermal pellet
is the rare case where an ORACLE exists in closed form for all three
geometries.  So the whole point of this gate is that it recomputes that
oracle HERE, in Python, from the geometry and the modulus alone, and never
reads the engine's own analytical column back as if it were an independent
statement.

WHAT THIS GATE CHECKS.

  (a) THE WITNESS RUNS and its own verification verdict passes.  A non-zero
      exit is RECORDED and the gate carries on -- see sabotage 1 for why.

  (b) THE NUMERICAL FIELD matches a Python closed form, node by node.  The
      comparison is against the CSV's `c_over_cs` column -- the discretised
      answer -- and the tolerance is the discretisation error the grid
      admits, not a number chosen to make the run pass.

  (c) THE ENGINE'S OWN CLOSED FORM matches the Python one to 1e-12 -- BOTH
      the field column and the analytical eta.  (b) and (c) are different
      claims and both are needed: (b) can only fail if the DISCRETISATION is
      wrong, (c) only if the ANALYTICAL formula in C++ is.  A gate with (b)
      alone would be satisfied by a solver and an oracle that are wrong in the
      same way.

      THE ETA HALF OF (c) WAS MISSING from the first version, and asking what
      sabotage would catch a wrong `effectivenessClosedForm` is what found it:
      none would have.  Every eta arm compared the engine's NUMERICAL eta with
      Python, so a broken analytical eta in C++ moved only the engine's own
      verdict and nothing this gate read.  Sabotage 3 exists because of that.

  (d) ETA, twice over: the engine's volume-integral eta against the Python
      closed form, and the engine's independent surface-flux eta against the
      same.  Two different functionals of one field agreeing is a stronger
      statement than either agreeing alone.

  (e) THE eta(phi) FAMILY: every row of the sweep CSV, all three geometries,
      recomputed here.

  (f) THE OBSERVED ORDER OF CONVERGENCE is 2.  This is the arm that says the
      scheme is the one it claims to be, rather than merely close on one
      grid: a first-order scheme, or a wrong ghost-node treatment at the
      centre, passes a loose (b) and fails here.

  (g) CONTINUITY WITH THE SENTENCE ALREADY IN THE TREE.  `CatalystPellet.H`
      quotes eta = (1/phi)[1/tanh(3 phi) - 1/(3 phi)] on the GENERALISED
      modulus.  This gate requires the engine's phi and phi_char to satisfy
      phi = phi_char/3 for the sphere and the engine's eta to satisfy that
      quoted formula, so the announcement and the computation cannot drift.

  (h) THE REFUSALS FIRE, seven of them, each on a probe case built here and
      thrown away: no route to D_eff; a D_eff filed on the catalyst record;
      a geometry declaring the other geometry's dimension; an even `nodes`;
      both spellings of the rate constant; a tortuosity below 1; an unknown
      geometry word.

  (i) THE MEASURED ROUTE, and the CROSS-CHECK FINDING.  A probe case gets a
      measured D_eff record set to 1.25x what the derivation gives.  The
      measured value must WIN, and the derived one must be reported beside it
      as a finding -- never silently preferred in either direction.  The arm
      also requires the announcement to name the BASE the percentage is
      normalised on: the same gap is 25 % of the derived value and 20 % of the
      measured one, and this arm FOUND A REAL DEFECT in the engine's sentence,
      which printed a bare "a relative difference of 20.000 %" with no base.
      Fixed to "the derived route is 20.000 % BELOW the measured value".
      Worth knowing HOW it was found: the first version of this arm asked
      whether the substring "25" appeared ANYWHERE in the output, which it
      always does, so the check was vacuous and the ambiguity survived it.

  (j) THE NEGATIVE for (i): the witness, which has no measured record, must
      NOT print a cross-check.  Without this arm the gate would pass just as
      happily if every run printed one.

  (k) THE THEORY ANCHOR `\\label{ch:thiele}` exists in docs/theoryGuide.tex.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.

  * It says NOTHING about whether the pellet in the witness case is real.  It
    is a declared TEACHING SURROGATE and its porosity and tortuosity are
    uncited; every claim here is about the numerics, and every one of them
    holds at whatever modulus those values happen to produce.
  * It does not test the NON-ISOTHERMAL pellet, orders other than one, the
    external film or a pellet size distribution -- none is modelled.
  * It does not check that eta is APPLIED anywhere.  No reactor multiplies by
    it yet; the four that assume eta = 1 still assume it, and
    `check_pellet_announcement` is what covers that.
  * Its D_eff arms exercise the GAS route only.  The liquid route
    (`medium liquid;`) is written and compiled but is not run here, because
    no probe in this gate declares a liquid transport model.

SABOTAGE-VERIFIED SIX WAYS, 2026-08-19.  Every block below is the OBSERVED
output, pasted verbatim, not the output that was predicted -- and three of the
six differed from the prediction in ways that changed the gate.

Sabotage 1 -- THE DISCRETISATION MADE FIRST ORDER.  The interior convection
term `(s*h/(2*xi))*(u[j+1]-u[j-1])` replaced by the one-sided
`(s*h/xi)*(u[j]-u[j-1])`:

    check_thiele_pellet: FAILED
      the witness case exited 1 -- its own verification verdict failed; the independent arms below still run
      the witness ran but its own verification verdict is not PASS -- the op compares itself against the closed form and says so; that line is missing or FAILED
      the NUMERICAL field deviates from the closed form by 9.189e-04, above the 4.840e-05 this grid admits (phi_char = 3.0483, h = 2.500e-03)
      eta (volume integral) = 0.665403448 against the closed form 0.665741516 recomputed here -- relative 5.078e-04, tol 1e-4
      eta (surface flux) = 0.666483857 against the closed form 0.665741516 -- relative 1.115e-03, tol 1e-3.  The flux route is an INDEPENDENT functional of the same field; the two disagreeing means the field is not a solution of the equation it was meant to solve
      eta = 0.665403448 does not satisfy the formula reactor/CatalystPellet.H already quotes, (1/phi)[1/tanh(3 phi) - 1/(3 phi)] = 0.665741516 at phi = 1.01609868 -- the announcement and the computation have drifted apart
      the observed order of convergence is 0.9971, outside [1.8, 2.2].  Central differences are SECOND order; anything else means the discretisation is not the one the header describes (the centre ghost node is the usual culprit)

    THE FIRST RUN OF THIS SABOTAGE PRODUCED **ONE** LINE, not seven.  The op
    returns exit 1 when its own verification fails, and the gate printed "the
    witness case did not run (exit 1)" and RETURNED -- so the Python closed
    form, the sweep, the flux route and the order study were all SKIPPED by
    the one sabotage that should have exercised every one of them.  That is
    the same shape as a `continue` past an unproven arm, and it left five arms
    verified by nothing.  The gate now records the exit code and carries on;
    the seven lines above are from the corrected gate.

    Also observed, and it is the reason arm (f) exists: the eta(phi) SWEEP arm
    (e) did NOT fire.  Its tolerance is 5e-3 and a first-order scheme at the
    sweep's 201 nodes stays inside it, so the family alone cannot tell first
    order from second.  The ORDER OF CONVERGENCE is what catches it: 0.9971.

Sabotage 2 -- THE ANALYTICAL FIELD WRONG IN C++.  The sphere's closed form
`sinh(phi xi)/(xi sinh phi)` loses its `1/xi`:

    check_thiele_pellet: FAILED
      the witness case exited 1 -- its own verification verdict failed; the independent arms below still run
      the witness ran but its own verification verdict is not PASS -- the op compares itself against the closed form and says so; that line is missing or FAILED
      the engine's OWN closed-form column differs from the one recomputed here by 2.892e-01 (tol 1e-12) -- the analytical formula in C++ is not the analytical formula

Sabotage 3 -- THE ANALYTICAL ETA WRONG IN C++.  The sphere prefactor 3 -> 2 in
`eta = (3/phi)(coth phi - 1/phi)`:

    check_thiele_pellet: FAILED
      the witness case exited 1 -- its own verification verdict failed; the independent arms below still run
      the witness ran but its own verification verdict is not PASS -- the op compares itself against the closed form and says so; that line is missing or FAILED
      the engine's OWN closed-form eta = 0.443827677246 differs from the one recomputed here, 0.665741515869, by 3.333e-01 (tol 1e-12) -- the analytical formula in C++ is not the analytical formula
      the observed order of convergence is 0.0000, outside [1.8, 2.2].  Central differences are SECOND order; anything else means the discretisation is not the one the header describes (the centre ghost node is the usual culprit)

    The third line is the arm that did not exist until this sabotage was
    designed (see (c) above).  The fourth is a knock-on worth reading: with a
    constant offset in the oracle, the "deviation" stops shrinking with h, so
    the measured order collapses to 0.0000 -- a refinement study reports the
    order of the ERROR it is handed, whatever that error actually is.

Sabotage 4 -- THE CROSS-CHECK COMPUTED BUT NEVER ANNOUNCED.  A measured D_eff
record still wins, the derived value is still computed, and the announcement
is suppressed (`if (false) announce(...)`):

    check_thiele_pellet: FAILED
      both routes were available and the derived value was NOT reported beside the measured one.  Two independent routes disagreeing is a FINDING; resolving it silently is the failure this arm exists for

    ONE line, and the witness still exits 0 -- because this sabotage touches
    nothing the witness reads.  A gate that only ran the witness would be
    entirely blind to it.

Sabotage 5 -- THE TWO MODULI DRIFT APART.  `Lambda/L` for a sphere changed
from 1/3 to 1/2 (24 lines; the first three and the shape of the rest):

    check_thiele_pellet: FAILED
      phi (generalised) = 1.52414801 is not phi_char/3 = 1.01609868 for a SPHERE -- the two moduli have drifted apart, and every textbook comparison downstream is then reading one convention as the other
      eta = 0.665742411 does not satisfy the formula reactor/CatalystPellet.H already quotes, (1/phi)[1/tanh(3 phi) - 1/(3 phi)] = 0.512753437 at phi = 1.52414801 -- the announcement and the computation have drifted apart
      sweep row (sphere, phi_char = 0.2): phi = 0.1, but Lambda/L = 0.3333333333333333 gives 0.0666666667
      ... one such line for each of the 21 sphere rows of the sweep ...

    THE WITNESS STILL EXITS 0 under this sabotage.  The op verifies itself
    against the closed form on `phi_char`, which is untouched, so every number
    it checks is still right -- and the number it PUBLISHES as the modulus is
    wrong by a factor of 1.5.  The engine cannot catch this about itself; only
    an independent recomputation can, which is the argument for this gate
    existing at all.

Sabotage 6 -- A SILENT DEFAULT FOR THE TWO INTRINSICS.  `epsilon_p` and `tau`
default to 0.45 and 3.0 when a record declares neither, i.e. exactly the
"pick a plausible tortuosity" failure the ruling forbids:

    check_thiele_pellet: FAILED
      refusal 'noRoute': the run SUCCEEDED (exit 0) where it must refuse

    One line, and it is the whole point: with a default in place the case
    produces an eta, a field and a Weisz-Prater number, all plausible, all
    invented, at exit 0.
"""

import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROPS = BUILD / "choupoProps"

WITNESS = ROOT / "tutorials" / "props" / "reactor" / "thiele01_sphere_first_order"

SHAPE = {"slab": 0, "cylinder": 1, "sphere": 2}
#  Lambda / (characteristic dimension): the ONE relation between the two
#  moduli, recomputed here rather than read from the engine.
LAMBDA_FACTOR = {"slab": 1.0, "cylinder": 0.5, "sphere": 1.0 / 3.0}


# ---------------------------------------------------------------------------
#  The oracle, in Python, from nothing but the geometry and the modulus.
# ---------------------------------------------------------------------------
def bessel_i(nu: int, x: float) -> float:
    """I0 or I1 by the ascending series -- all terms positive, no cancelling."""
    q = 0.25 * x * x
    term = 1.0
    total = 1.0
    for m in range(1, 4000):
        term *= q / (m * (m + nu))
        total += term
        if term <= 1e-18 * total:
            break
    if nu == 0:
        return total
    return 0.5 * x * total


def u_exact(geom: str, phi_char: float, xi: float) -> float:
    if phi_char < 1e-8:
        return 1.0
    if geom == "slab":
        return ((math.exp(phi_char * (xi - 1.0))
                 + math.exp(-phi_char * (xi + 1.0)))
                / (1.0 + math.exp(-2.0 * phi_char)))
    if geom == "cylinder":
        return bessel_i(0, phi_char * xi) / bessel_i(0, phi_char)
    if geom == "sphere":
        denom = 1.0 - math.exp(-2.0 * phi_char)
        if xi < 1e-12:
            return 2.0 * phi_char * math.exp(-phi_char) / denom
        return ((math.exp(phi_char * (xi - 1.0))
                 - math.exp(-phi_char * (xi + 1.0))) / (xi * denom))
    raise ValueError(f"unknown geometry {geom!r}")


def eta_exact(geom: str, phi_char: float) -> float:
    if geom == "slab":
        if phi_char < 1e-4:
            return 1.0 - phi_char * phi_char / 3.0
        return math.tanh(phi_char) / phi_char
    if geom == "cylinder":
        if phi_char < 1e-4:
            return 1.0 - phi_char * phi_char / 8.0
        return 2.0 * bessel_i(1, phi_char) / (phi_char * bessel_i(0, phi_char))
    if geom == "sphere":
        if phi_char < 0.1:
            p2 = phi_char * phi_char
            return 1.0 - p2 / 15.0 + 2.0 * p2 * p2 / 315.0 - p2 ** 3 / 1575.0
        return 3.0 * (1.0 / math.tanh(phi_char) - 1.0 / phi_char) / phi_char
    raise ValueError(f"unknown geometry {geom!r}")


def eta_generalised_sphere(phi: float) -> float:
    """The formula reactor/CatalystPellet.H quotes, on the generalised phi."""
    return (1.0 / phi) * (1.0 / math.tanh(3.0 * phi) - 1.0 / (3.0 * phi))


# ---------------------------------------------------------------------------
#  Running things.
# ---------------------------------------------------------------------------
def run_case(case_dir) -> tuple:
    p = subprocess.run([str(PROPS), str(case_dir)],
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def read_csv(path: Path):
    lines = [l for l in path.read_text().splitlines() if l.strip()]
    head = lines[0].split(",")
    rows = []
    for l in lines[1:]:
        parts = l.split(",")
        rows.append(dict(zip(head, parts)))
    return head, rows


# ---------------------------------------------------------------------------
#  Probe cases -- built here, run once, thrown away.  A probe-built record must
#  never enter the catalogue, which is why none of this touches data/.
# ---------------------------------------------------------------------------
CONTROL = """application   choupoProps;
description   "thiele gate probe";
verbosity     3;
"""

THERMO = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( CO  N2 );
equilibrium
{
    formulation gammaPhi;
    liquid  { activityModel { model ideal; } }
    vapour  { fugacityModel idealGas; }
}
transport
{
    vapour { diffusivity { model Fuller; } viscosity { model Chung; } }
}
"""

PELLET_TEMPLATE = """kind catalyst;
catalyst
{{
    name         probePellet;
    type         "gate probe -- never a catalogue record";
    geometry     {geometry};
    {dimkey}     1.5 mm;
    rho_particle 1300;
{extra}}}
reviewStatus  interim;
provenance {{ identity {{ origin teachingSurrogate; method "gate probe"; }} }}
"""

PROPS_TEMPLATE = """operations
(
    {{
        name       probe;
        type       thielePellet;
        catalyst   probePellet;
        species    CO;
        T          573.15 K;
        P          1 atm;
        {rate}
        diffusion  {{ medium gas; counterDiffusing N2; }}
        nodes      {nodes};
    }}
);
"""


def build_probe(tmp: Path, name: str, *, geometry="sphere", dimkey="radius",
                extra="    epsilon_p    0.45;\n    tau          3.0;\n",
                rate="rateConstant 40.0;", nodes=401, measured=None) -> Path:
    d = tmp / name
    (d / "system").mkdir(parents=True)
    (d / "constant" / "assets").mkdir(parents=True)
    (d / "system" / "controlDict").write_text(CONTROL)
    (d / "constant" / "thermoPhysPropDict").write_text(THERMO)
    (d / "constant" / "assets" / "probePellet.dat").write_text(
        PELLET_TEMPLATE.format(geometry=geometry, dimkey=dimkey, extra=extra))
    (d / "system" / "propsDict").write_text(
        PROPS_TEMPLATE.format(rate=rate, nodes=nodes))
    if measured is not None:
        p = d / "constant" / "parameters" / "diffusion" / "effective" / "probePellet"
        p.mkdir(parents=True)
        (p / "CO.dat").write_text(
            "recordType effectiveDiffusivity;\n"
            "schemaVersion 2;\n"
            "catalyst  probePellet;\n"
            "species   CO;\n"
            f"D_eff     {measured:.9e};\n"
            "T         573.15;\n"
            "Trange    ( 500 650 );\n"
            'provenance { identity { origin gateProbe; '
            'method "a probe value, never a measurement"; } }\n')
    return d


def expect_refusal(failures, tmp, label, phrases, **kw):
    """Build a probe, run it, require a NON-zero exit naming every phrase."""
    d = build_probe(tmp, label, **kw)
    rc, out = run_case(d)
    if rc == 0:
        failures.append(f"refusal '{label}': the run SUCCEEDED (exit 0) where "
                        "it must refuse")
        return
    for ph in phrases:
        if ph not in out:
            failures.append(f"refusal '{label}': fired, but its message never "
                            f"says {ph!r} -- a refusal that does not name the "
                            "remedy teaches only unease")


def main() -> int:
    failures = []

    if not PROPS.exists():
        print("check_thiele_pellet: FAILED")
        print(f"  {PROPS} is not built -- run `make all` first")
        return 1

    # ---------------------------------------------------------------- (a)
    #
    #  A NON-ZERO EXIT IS RECORDED AND THE GATE CARRIES ON.  The first version
    #  printed it and RETURNED, which was wrong in the way this project keeps
    #  paying for: the op fails its own verification with exit 1, so sabotaging
    #  the discretisation made the witness exit 1 -- and every independent arm
    #  below (the Python closed form, the sweep, the order of convergence) was
    #  then skipped, leaving them UNPROVEN by the one sabotage that should have
    #  exercised them all.  Observed, not predicted: sabotage 1 reported a
    #  single line where five were expected.  The engine's own verdict and this
    #  gate's independent recomputation are different claims, and the second
    #  must not be silenced by the first.
    rc, out = run_case(WITNESS)
    if rc != 0:
        failures.append(f"the witness case exited {rc} -- its own verification "
                        "verdict failed; the independent arms below still run")

    if "ALL CHECKS: PASS" not in out:
        failures.append("the witness ran but its own verification verdict is "
                        "not PASS -- the op compares itself against the closed "
                        "form and says so; that line is missing or FAILED")

    # ---------------------------------------------------------------- (b,c)
    field_csv = WITNESS / "pelletConcentrationField.csv"
    if not field_csv.exists():
        failures.append("the witness published no concentration field CSV -- "
                        "the field IS the deliverable")
    else:
        _, rows = read_csv(field_csv)
        max_num = 0.0
        max_ana = 0.0
        phi_char = float(rows[0]["phi_char"])
        geom = rows[0]["geometry"]
        h = 1.0 / (len(rows) - 1)
        for r in rows:
            xi = float(r["xi"])
            ex = u_exact(geom, float(r["phi_char"]), xi)
            max_num = max(max_num, abs(float(r["c_over_cs"]) - ex))
            max_ana = max(max_ana,
                          abs(float(r["c_over_cs_closedForm"]) - ex))
        #  The tolerance the GRID admits, not one chosen to pass: central
        #  differences carry a relative error ~ (phi_char*h)^2/24, and 20x
        #  that is a generous band which a first-order scheme still fails.
        admissible = 20.0 * (phi_char * h) ** 2 / 24.0
        if max_num > admissible:
            failures.append(
                f"the NUMERICAL field deviates from the closed form by "
                f"{max_num:.3e}, above the {admissible:.3e} this grid admits "
                f"(phi_char = {phi_char:.6g}, h = {h:.3e})")
        if max_ana > 1e-12:
            failures.append(
                f"the engine's OWN closed-form column differs from the one "
                f"recomputed here by {max_ana:.3e} (tol 1e-12) -- the "
                "analytical formula in C++ is not the analytical formula")

    # ---------------------------------------------------------------- (d,g)
    m_eta = re.search(r"eta \(volume integral of the field\)\s*=\s*([0-9.eE+-]+)",
                      out)
    m_flx = re.search(r"eta \(surface flux, independent\)\s*=\s*([0-9.eE+-]+)",
                      out)
    m_phi = re.search(r"phi_char\s*=\s*([0-9.eE+-]+)\s+phi \(generalised, on "
                      r"Lambda\)\s*=\s*([0-9.eE+-]+)", out)
    m_ana = re.search(r"eta \(closed form\)\s*=\s*([0-9.eE+-]+)", out)
    if not (m_eta and m_flx and m_phi):
        failures.append("the witness output does not publish eta (both routes) "
                        "and both moduli in the lines this gate reads")
    else:
        eta_num = float(m_eta.group(1))
        eta_flx = float(m_flx.group(1))
        phi_char = float(m_phi.group(1))
        phi_gen = float(m_phi.group(2))
        exact = eta_exact("sphere", phi_char)
        if abs(eta_num - exact) / exact > 1e-4:
            failures.append(
                f"eta (volume integral) = {eta_num:.9g} against the closed "
                f"form {exact:.9g} recomputed here -- relative "
                f"{abs(eta_num - exact) / exact:.3e}, tol 1e-4")
        if abs(eta_flx - exact) / exact > 1e-3:
            failures.append(
                f"eta (surface flux) = {eta_flx:.9g} against the closed form "
                f"{exact:.9g} -- relative {abs(eta_flx - exact) / exact:.3e}, "
                "tol 1e-3.  The flux route is an INDEPENDENT functional of the "
                "same field; the two disagreeing means the field is not a "
                "solution of the equation it was meant to solve")
        #  (c-bis) THE ENGINE'S OWN ANALYTICAL ETA, against the Python one.
        #  This is the eta twin of arm (c) and it was MISSING from the first
        #  version -- found by asking what sabotage would catch a wrong
        #  `effectivenessClosedForm` in C++, and discovering that none would:
        #  every eta arm compared the engine's NUMERICAL eta with Python, so a
        #  broken analytical formula in the engine changed only the engine's
        #  own verdict and nothing this gate read.  A gate whose arms all point
        #  at one of two claims cannot check the other.
        if not m_ana:
            failures.append("the witness does not publish its analytical eta "
                            "in the line this gate reads")
        else:
            eta_ana = float(m_ana.group(1))
            if abs(eta_ana - exact) / exact > 1e-12:
                failures.append(
                    f"the engine's OWN closed-form eta = {eta_ana:.12g} "
                    f"differs from the one recomputed here, {exact:.12g}, by "
                    f"{abs(eta_ana - exact) / exact:.3e} (tol 1e-12) -- the "
                    "analytical formula in C++ is not the analytical formula")

        #  (g) the modulus relation and the sentence already in the tree.
        if abs(phi_gen - phi_char / 3.0) > 1e-9 * max(phi_gen, 1.0):
            failures.append(
                f"phi (generalised) = {phi_gen:.9g} is not phi_char/3 = "
                f"{phi_char / 3.0:.9g} for a SPHERE -- the two moduli have "
                "drifted apart, and every textbook comparison downstream is "
                "then reading one convention as the other")
        quoted = eta_generalised_sphere(phi_gen)
        if abs(eta_num - quoted) / quoted > 1e-4:
            failures.append(
                f"eta = {eta_num:.9g} does not satisfy the formula "
                "reactor/CatalystPellet.H already quotes, "
                f"(1/phi)[1/tanh(3 phi) - 1/(3 phi)] = {quoted:.9g} at phi = "
                f"{phi_gen:.9g} -- the announcement and the computation have "
                "drifted apart")

    # ---------------------------------------------------------------- (e)
    sweep_csv = WITNESS / "pelletEtaPhi.csv"
    if not sweep_csv.exists():
        failures.append("the witness published no eta(phi) sweep CSV")
    else:
        _, rows = read_csv(sweep_csv)
        seen = set()
        worst = 0.0
        worst_row = None
        for r in rows:
            g = r["geometry"]
            seen.add(g)
            pc = float(r["phi_char"])
            ex = eta_exact(g, pc)
            dev = abs(float(r["eta"]) - ex) / ex
            if dev > worst:
                worst, worst_row = dev, (g, pc, float(r["eta"]), ex)
            #  The generalised modulus must be the characteristic one times
            #  Lambda/L, recomputed here for every geometry.
            want = pc * LAMBDA_FACTOR[g]
            if abs(float(r["phi"]) - want) > 1e-9 * max(want, 1.0):
                failures.append(
                    f"sweep row ({g}, phi_char = {pc:.6g}): phi = "
                    f"{float(r['phi']):.9g}, but Lambda/L = "
                    f"{LAMBDA_FACTOR[g]} gives {want:.9g}")
        if seen != set(SHAPE):
            failures.append(f"the sweep covers {sorted(seen)}, not all three "
                            "geometries -- the near-collapse of the three on "
                            "the generalised modulus IS the lesson")
        if worst > 5e-3:
            g, pc, got, ex = worst_row
            failures.append(
                f"the eta(phi) family departs from the closed form by "
                f"{worst:.3e} (tol 5e-3), worst at {g}, phi_char = {pc:.6g}: "
                f"{got:.9g} against {ex:.9g}")

    # ---------------------------------------------------------------- (f)
    ref_csv = WITNESS / "pelletGridRefinement.csv"
    if not ref_csv.exists():
        failures.append("the witness published no grid-refinement CSV -- the "
                        "order of convergence is the arm that says the scheme "
                        "is second order rather than merely close on one grid")
    else:
        _, rows = read_csv(ref_csv)
        if len(rows) < 2:
            failures.append("the refinement study has fewer than two grids")
        else:
            a, b = rows[-2], rows[-1]
            da, db = float(a["relDeviation"]), float(b["relDeviation"])
            na, nb = int(a["nodes"]) - 1, int(b["nodes"]) - 1
            if da <= 0.0 or db <= 0.0:
                failures.append("a refinement grid reports zero deviation -- "
                                "an order cannot be measured from it")
            else:
                order = math.log(da / db) / math.log(nb / na)
                if not (1.8 <= order <= 2.2):
                    failures.append(
                        f"the observed order of convergence is {order:.4f}, "
                        "outside [1.8, 2.2].  Central differences are SECOND "
                        "order; anything else means the discretisation is not "
                        "the one the header describes (the centre ghost node "
                        "is the usual culprit)")

    # ---------------------------------------------------------------- (j)
    if "CROSS-CHECK" in out:
        failures.append("the witness declares NO measured D_eff record, yet "
                        "the run announced a cross-check -- an absence stopped "
                        "meaning what it meant")

    # ---------------------------------------------------------- (h) and (i)
    tmp = Path(tempfile.mkdtemp(prefix="thiele_gate_"))
    try:
        expect_refusal(
            failures, tmp, "noRoute",
            ["no route to an effective diffusivity",
             "Route 1 (MEASURED)", "Route 2 (DERIVED",
             "NO default tortuosity"],
            extra="")

        expect_refusal(
            failures, tmp, "deffOnRecord",
            ["(catalyst, species) PAIR quantity",
             "parameters/diffusion/effective"],
            extra=("    epsilon_p    0.45;\n    tau          3.0;\n"
                   "    D_eff        1.0e-6;\n"))

        expect_refusal(
            failures, tmp, "dimensionMismatch",
            ["is measured by `radius`", "declares `halfThickness`"],
            dimkey="halfThickness")

        expect_refusal(
            failures, tmp, "evenNodes",
            ["is EVEN", "Simpson"],
            nodes=400)

        expect_refusal(
            failures, tmp, "twoRateConstants",
            ["declares BOTH", "two homes for one number"],
            rate="rateConstant 40.0; rateConstantMass 3.0e-2;")

        expect_refusal(
            failures, tmp, "tortuosityBelowOne",
            ["is BELOW 1", "arrived before it left"],
            extra="    epsilon_p    0.45;\n    tau          0.5;\n")

        expect_refusal(
            failures, tmp, "unknownGeometry",
            ["unknown pellet geometry", "slab", "cylinder", "sphere"],
            geometry="dodecahedron")

        # ------------------------------------------------------------- (i)
        #  The derived route on this probe gives (0.45/3.0)*D_Fuller; a
        #  measured record 25 % away must WIN and be reported as a finding.
        #  The derived value is read back from a first run rather than
        #  hard-coded, so this arm cannot go stale against the correlation.
        #  The probes' EXIT CODE is deliberately not gated on here.  D_eff is
        #  resolved and announced BEFORE the boundary-value problem is solved,
        #  so these lines exist whether or not the op's own verification
        #  verdict passes -- and gating on the exit code would make this arm
        #  collapse under any sabotage of the discretisation, which is a
        #  different subject.  The lines themselves are the claim.
        d0 = build_probe(tmp, "derivedOnly")
        _, out0 = run_case(d0)
        m = re.search(r"D_eff:\s+([0-9.eE+-]+)\s+m2/s\s+\(derived\)", out0)
        if not m:
            failures.append("the derived-route probe never announced a derived "
                            "D_eff -- the cross-check arm cannot be built "
                            "without it")
        else:
            derived = float(m.group(1))
            measured = 1.25 * derived
            d1 = build_probe(tmp, "measuredWins", measured=measured)
            _, out1 = run_case(d1)
            m1 = re.search(r"D_eff:\s+([0-9.eE+-]+)\s+m2/s\s+\(measured\)",
                           out1)
            if not m1:
                failures.append("a measured D_eff record exists, but the run "
                                "did not report the measured route as the one "
                                "used")
            elif abs(float(m1.group(1)) - measured) / measured > 1e-6:
                failures.append(
                    f"the measured record declares {measured:.6e} m2/s but "
                    f"the run used {float(m1.group(1)):.6e} -- the measured "
                    "value must stand, not be adjusted")
            if "CROSS-CHECK" not in out1:
                failures.append(
                    "both routes were available and the derived value was NOT "
                    "reported beside the measured one.  Two independent routes "
                    "disagreeing is a FINDING; resolving it silently is the "
                    "failure this arm exists for")
            #  THE NUMBER *AND* ITS BASE.  The probe sets the measured value
            #  to 1.25x the derived one, so the derived route is 25 % below the
            #  measured when normalised on the DERIVED value and 20 % below it
            #  when normalised on the MEASURED one.  The engine normalises on
            #  the measured value -- the one that stands -- and must say so.
            #  A bare percentage is not checkable, and the first version of
            #  this arm accepted the substring "25" appearing ANYWHERE in the
            #  output, which it always does; that vacuous check is how the
            #  ambiguity survived to be found here.
            elif not re.search(r"the derived route is 20\.0\d* % BELOW the "
                               r"measured value", out1):
                failures.append(
                    "the cross-check fired but does not report the size of the "
                    "disagreement AND the base it is normalised on -- expected "
                    "'the derived route is 20.0.. % BELOW the measured value' "
                    "(the probe puts the measured value 25 % above the derived "
                    "one, which is 20 % of the measured).  A percentage with "
                    "no base is an impression, not a finding")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---------------------------------------------------------------- (k)
    guide = ROOT / "docs" / "theoryGuide.tex"
    if r"\label{ch:thiele}" not in guide.read_text(errors="ignore"):
        failures.append(r"docs/theoryGuide.tex carries no \label{ch:thiele} "
                        "-- the tool declares it as its theory anchor and a "
                        "dangling anchor sends the reader nowhere")

    if failures:
        print("check_thiele_pellet: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_thiele_pellet: OK -- the intraparticle field and eta(phi) are "
          "recomputed HERE from the closed form (series Bessel, no engine "
          "value read back as an oracle) and the engine reproduces them: the "
          "numerical field within the discretisation error its own grid "
          "admits, its analytical column to 1e-12, eta by BOTH the volume "
          "integral and the independent surface flux, the whole eta(phi) "
          "family over all three geometries, an observed order of convergence "
          "of 2, and phi = phi_char/3 satisfying the formula "
          "reactor/CatalystPellet.H already quotes.  Seven refusals fire on "
          "probe cases (no D_eff route, D_eff filed on the catalyst record, a "
          "geometry/dimension mismatch, even nodes, two rate-constant "
          "spellings, tortuosity below 1, an unknown geometry); a measured "
          "D_eff record WINS and the derived value is reported beside it as a "
          "finding, while a case without one announces no cross-check.  NOT "
          "covered: whether the witness pellet is real (it is a declared "
          "teaching surrogate), the non-isothermal pellet, orders other than "
          "one, the external film, the liquid-medium route, and whether any "
          "reactor APPLIES eta -- none does yet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
