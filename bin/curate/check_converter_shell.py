#!/usr/bin/env python3
"""Gate: one pressure shell around a sector -- `type converterShell` -- sizes what it claims.

    bin/curate/check_converter_shell.py

WHY THIS EXISTS (DEV.md 4c C69, 2026-10-12).  A multibed converter is one
pressure vessel holding its beds and interbed exchangers; the flowsheet still
computes each as its own block.  `tutorials/plant/greenAmmonia03_basicDesign`
groups its three beds and two interbed coolers as the sector CONVERTER, and
its postDict sizes ONE shell for the sector (`converterShell`), which takes
over the beds' own shells (baskets, NOT costed) and carries ONE relief valve.
A golden pins what a run PRINTS; this gate recomputes the shell from its
members and fires the refusals.

WHAT THIS GATE CHECKS, on a copy of the witness run at its design point (the
outerDict removed -- the variables block holds the design point -- so one
pass, not a DesignSpec):

  (a) THE MEMBERS ARE THE SECTOR'S UNITS: nMembers equals the number of
      CONVERTER units in the topology; D equals the beds' ONE declared
      diameter and H the sum of the members' heights (a bed's H, a cooler's
      tubeLength x shells in series), at 1e-10; V = pi D^2/4 H.
  (b) THE BASKETS: every bed shell carries no cost and is listed NOT COSTED
      naming CONVERTER/shell; every catalyst charge and both coolers stay
      priced; the shell itself is priced on the vessel set; the capital
      total is the sum of the priced items' totals.
  (c) ONE VALVE: CONVERTER/psv is set at the shell's design pressure and
      relieves the sector's own outlet, CONVERTER.HotEffluent; no bed carries
      a valve.
  (d) THE SHEETS: design/CONVERTER/shell and design/CONVERTER/psv exist at
      the sector's own level -- never design/CONVERTER/CONVERTER/.
  (e) EVERY REFUSAL FIRES BY NAME: a `D` in the shell's designRules (a
      second home for the converter's diameter); a declared H smaller than
      the stack; the entry declared BEFORE its members; a name that is no
      sector; a shell rated below a member's design pressure; a bed at its
      OWN `L_over_D` inside the converter; two beds declaring two diameters.
  (f) ONE DIAMETER, AND THE SMALLEST ADMISSIBLE ONE: every bed's shell has
      the converter's D, which is every bed's published D_bed_declared_m
      (1e-12); every bed's height is ITS OWN V_R / (pi D^2 / 4) (1e-10);
      every cooler's Kern shell fits inside D; the binding bed is the one
      with the largest dP_over_allowable, the shell publishes that ratio,
      the run names that bed, and it sits at its allowable to 0.2 % while no
      bed exceeds it -- i.e. no narrower converter would do (the drop falls
      monotonically as D widens).
  (g) THE SMALLEST ADMISSIBLE DIAMETER, BRACKETED: the shell's
      D_smallestAdmissible is recomputed here a DIFFERENT way -- per bed,
      the root of r0 [(1-s) q^4 + s q^6] = 1 in q = D0/D (each bed's own
      published ratio and inertial share), then the LARGEST of the three
      diameters -- at 1e-9; the run names that bed as binding and prints
      the bracket.  Then END TO END, on runs at another diameter (the
      variable moved by +5 % and by -3 %, one pass each): the frozen-state
      law r0 (D0/D)^4..6 predicts each bed's ACTUAL drop at the new diameter
      to 1 % (the pressure the gas reacts at moved -- the one thing the law
      holds fixed), the +5 % run says the converter is WIDER than the
      smallest and finds that smallest back at the design D to 0.3 %, the
      -3 % run says NARROWER and warns; and an allowable no diameter in the
      bracket can meet REFUSES naming the bracket.
  (h) THE SOLVE HALF, WITHOUT NAMING THE BINDING BED: the DesignSpec's
      `largestOf` target on a two-bed fixture (two non-reacting Ergun beds
      of one declared diameter, the second three times the first) solves the
      diameter at which the LARGER drop sits at its allowable, names the bed
      it found largest, and leaves the other below; two EQUAL beds under a
      5 % tol say they share the bound; `largestOf` with one quantity,
      or beside `path`, refuses by name.  The witness's own DesignSpec is NOT
      run here (four unknowns over a recycle, minutes per Newton step); it
      starts at its design point, which (f) and (g) hold.

WHAT THIS DOES NOT CHECK, said plainly:
  * whether STACKING is how this converter would be built (a cartridge, an
    annulus, beds at one diameter): the shell is its members' envelope and
    the basis says so;
  * the cost of a tube bundle without its shell (no correlation exists; the
    coolers keep their exchanger cost, an over-estimate the basis states).

SABOTAGES PERFORMED (by hand, 2026-10-12), each against this gate.  S1-S3
were run against the first form (D the widest member's); S4 against the
one-diameter form:
  S1  H = the TALLEST member instead of the sum.  Caught by (a) (H and V)
      and by (e)'s H probe, which a 4.50 m stack no longer refuses.
  S2  the enclosed shells left costed (the SizingPass loop that sets
      notCostedBecause skipped).  Caught by (b), six findings.  The total
      arm did NOT fire: the costed baskets enter the printed total and the
      recomputed sum alike, so (b)'s per-item arms are the ones that see it.
  S3  the declared D/H refusal removed (`declaredOr` accepting any value).
      Caught by (e), both the D and the H probe.
  S4  the one-diameter refusal of a bed at its own L_over_D removed (the
      throw in ConverterShellSize skipped).  Caught by (e)'s L_over_D probe
      ALONE: the witness itself obeys the rule, so no arm that reads its
      run can see the guard go -- which is why the probe exists.
S5-S10 were run against arms (e), (g) and (h) on a COPY of the tree (each a
source edit, a rebuild, this gate, the restore), 2026-10-12:
  S5  the sizer's frozen-state law drops the inertial share (r0 q^4, viscous
      only).  Caught by (g) twice: the per-bed recomputation (2.228327 m vs
      2.228318 m -- close, because at D0 the law is exact whatever the
      share) and, decisively, the wider run, which then finds 2.1717 m.
  S6  the pfr publishes the VISCOUS share as the inertial one (Iv and Ii
      swapped).  Caught by check_pfr_ergun (g)'s closed form and here by
      (g)'s end-to-end arm (the law misses the actual drops by 9.7 % and
      6.7 %).  The per-bed recomputation does NOT see it: it reads the same
      published share the engine scaled on -- which is why the end-to-end
      runs exist.
  S7  largestOf takes the SMALLEST quantity.  Caught by (h), four findings
      (bed1 solved to its allowable with bed2 at 3.03 of its own).
  S8  the no-root-in-the-bracket refusal removed.  Caught by (e)'s probe ALONE
      (the witness has a root, so no arm reading its run can see it).
  S9  the tie never said.  Caught by (h)'s equal-beds fixture ALONE.
  S10 the bisection's bracket update inverted (it walks to the lower end).
      Caught by (g), both the recomputation and the wider run (0.1 m).
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/plant/greenAmmonia03_basicDesign"
ENTRY = "        { unitName CONVERTER;  type converterShell;  material SS316;\n" \
        "          designRules { pressureDesign  167; } }\n"


def run(case):
    p = subprocess.run([str(SOLVE)], cwd=str(case), capture_output=True,
                       text=True, timeout=1200)
    out = p.stdout + p.stderr
    js = None
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    if m:
        try:
            js = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    return p.returncode, out, js


def copy(td, post_edit=None):
    """A copy of the witness at its design point; `post_edit` edits its
    postDict, or is (relative path, edit) to edit another file."""
    dst = Path(td) / "case"
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "designspec_history.csv"))
    (dst / "system/outerDict").unlink()
    if post_edit:
        rel_path, edit = (post_edit if isinstance(post_edit, tuple)
                          else ("system/postDict", post_edit))
        pd = dst / rel_path
        t = pd.read_text()
        t2 = edit(t)
        assert t2 != t, f"{rel_path} edit did not apply; update this gate"
        pd.write_text(t2)
    return dst


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


def frozen_ratio(r0, s, D0, D):
    """A bed's drop over allowable at D from its own at D0: viscous ~ D^-4,
    inertial ~ D^-6 at a fixed volume and a frozen axial state."""
    q = D0 / D
    return r0 * ((1.0 - s) * q ** 4 + s * q ** 6)


def smallest_admissible(kp, beds, D0):
    """Per bed, the D at which its frozen-state ratio is exactly 1 (bisection
    in q, the ratio rising monotonically with q); the largest of them is the
    smallest diameter holding every bed.  A different route from the
    engine's (max over beds, then one bisection in ln D) to the same root."""
    best, which = -1.0, None
    for u in beds:
        r0, s = kp[u]["dP_over_allowable"], kp[u]["ergunInertialShare_bed"]
        lo, hi = 1e-6, 1e6
        for _ in range(400):
            mid = math.sqrt(lo * hi)
            if r0 * ((1.0 - s) * mid ** 4 + s * mid ** 6) > 1.0:
                hi = mid
            else:
                lo = mid
        Di = D0 / math.sqrt(lo * hi)
        if Di > best:
            best, which = Di, u
    return best, which


#  The two-bed fixture of arm (h): pfr02's case, two NON-reacting Ergun beds
#  in series (water + H2, no CO) at one declared diameter $D, the second
#  three times the first, each allowed 0.05 bar.
TWO_BEDS = """
units
(
    {
        name        bed1;
        type        pfr;
        in          feed;
        outputs     ( mid );
        operation
        {
            V_R           1.0e-3;
            nSteps        100;
            diameter      $D;
            catalyst      { particleDiameter 1 mm; }
            pressureDrop  { model Ergun;  voidFraction 0.40;  allowable 0.05 bar; }
        }
        reactions   ( wgs_reversible );
    }
    {
        name        bed2;
        type        pfr;
        in          mid;
        outputs     ( products );
        operation
        {
            V_R           3.0e-3;
            nSteps        100;
            diameter      $D;
            catalyst      { particleDiameter 1 mm; }
            pressureDrop  { model Ergun;  voidFraction 0.40;  allowable 0.05 bar; }
        }
        reactions   ( wgs_reversible );
    }
);

variables
{
    D   0.08 m;
}
"""

OUTER = """type designSpec;
manipulate ( { variable D;  initial 0.08;  min 0.01;  max 1.0; } );
targets
(
    { largestOf ( bed1.dP_over_allowable  bed2.dP_over_allowable );
      value 1.0;   tol %s; }
);
options { maxIter 40;  tolF 1.0;  fdStep 1.0e-6; }
report { file designspec_history.csv; }
"""


def two_beds(td, outer):
    src = ROOT / "tutorials/steady/reactors/pfr02_reversible_wgs"
    dst = Path(td) / "twobeds"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "log.*", "iterations", "design"))
    fs = dst / "system/flowsheetDict"
    t = fs.read_text()
    assert "\nunits\n" in t, "pfr02's flowsheetDict layout changed; update this gate"
    fs.write_text(t[:t.index("\nunits\n")] + TWO_BEDS)
    shutil.copy(dst / "0/products", dst / "0/mid")
    f0 = dst / "0/feed"
    f0.write_text(re.sub(r"componentMolarFlows\s*\{.*?\}\n",
                         "componentMolarFlows\n{\n    water 1.0 kmol/h;\n"
                         "    H2 1.0 kmol/h;\n}\n", f0.read_text(), flags=re.S))
    tp = dst / "constant/thermoPhysPropDict"
    tp.write_text(tp.read_text()
                  + "\ntransport { vapour { viscosity { model Chung; } } }\n")
    (dst / "system/outerDict").write_text(outer)
    return dst


def main() -> int:
    fails, claims = [], []
    if not SOLVE.exists():
        print("check_converter_shell: CANNOT RUN -- no native build at " + str(SOLVE))
        return 1
    if ENTRY not in (CASE / "system/postDict").read_text():
        print("check_converter_shell: FAIL -- the witness postDict no longer"
              " carries the converterShell entry this gate edits")
        return 1

    with tempfile.TemporaryDirectory() as td:
        case = copy(td)
        rc, out, js = run(case)
        if rc != 0 or js is None:
            print("check_converter_shell: FAIL -- the witness did not run (exit %d):\n%s"
                  % (rc, out[-1500:]))
            return 1
        eq = {e["item"]: e for e in js["equipment"]}
        shell = eq.get("CONVERTER/shell")
        if shell is None:
            print("check_converter_shell: FAIL -- no CONVERTER/shell item")
            return 1
        v = shell["values"]
        members = [e for e in eq.values()
                   if e.get("sector") == "CONVERTER" and e["unit"] != "CONVERTER"]
        units = sorted({e["unit"] for e in members})
        kp = js.get("kpis", {})
        beds = sorted(u for u in units if "D_bed_declared_m" in kp.get(u, {}))
        geo, coolers = [], []
        for e in members:
            x = e["values"]
            if "D" in x and "H" in x:
                geo.append((x["D"], x["H"]))
            elif "shellID" in x and "tubeLength" in x:
                geo.append((x["shellID"], x.get("shellsInSeries", 1) * x["tubeLength"]))
                coolers.append((e["item"], x["shellID"]))
        D = kp[beds[0]]["D_bed_declared_m"] if beds else float("nan")
        H = sum(g[1] for g in geo)
        if int(v["nMembers"]) != len(units) or len(geo) != len(units):
            fails.append(f"(a) nMembers {v['nMembers']} against {len(units)} CONVERTER"
                         f" units, {len(geo)} with a geometry")
        for key, ref in (("D", D), ("H", H), ("V_R", math.pi * D * D / 4 * H)):
            if rel(v[key], ref) > 1e-10:
                fails.append(f"(a) shell {key} = {v[key]!r}, from its members {ref!r}")
        claims.append(f"(a) shell D {D:.4f} m (the beds' one diameter), H {H:.4f} m"
                      f" (the {len(units)} members stacked), V {v['V_R']:.3f} m3 recomputed")

        #  (f) ONE DIAMETER, AND THE SMALLEST ADMISSIBLE ONE
        if len(beds) != 3:
            fails.append(f"(f) {len(beds)} beds publish a declared diameter, not 3")
        ratios = {}
        for u in beds:
            k = kp[u]
            if abs(k["D_bed_declared_m"] - D) > 1e-12 * D:
                fails.append(f"(f) {u} declares D {k['D_bed_declared_m']!r}, not the"
                             f" converter's {D!r}")
            sh = eq.get(u + "/shell", {}).get("values", {})
            if not sh or abs(sh["D"] - D) > 1e-12 * D:
                fails.append(f"(f) {u}/shell is not at the converter's diameter")
            elif rel(sh["H"], k["V_R"] / (math.pi * D * D / 4)) > 1e-10:
                fails.append(f"(f) {u}/shell H {sh['H']!r} is not its V_R / (pi D^2/4)")
            ratios[u] = k["dP_over_allowable"]
        for item, sid in coolers:
            if sid > D:
                fails.append(f"(f) {item}'s Kern shell {sid} m does not fit in D {D} m")
        if ratios:
            bind = max(ratios, key=ratios.get)
            r = ratios[bind]
            if rel(v.get("dP_binding_over_allowable", -1.0), r) > 1e-10:
                fails.append("(f) the shell's dP_binding_over_allowable is not the"
                             " largest bed ratio")
            if ("the binding bed there is " + bind) not in out:
                fails.append(f"(f) the run does not name {bind} as the binding bed")
            if abs(r - 1.0) > 2e-3 or any(x > 1.0 + 2e-3 for x in ratios.values()):
                fails.append(f"(f) the binding bed is not AT its allowable with every"
                             f" other bed inside it: {ratios}")
            if "m is that diameter: the binding bed sits at" not in out:
                fails.append("(f) the run does not say the diameter is the smallest"
                             " admissible one")
            claims.append(f"(f) ONE diameter {D:.4f} m in all {len(beds)} beds, each H ="
                          f" V_R/(pi D^2/4); binding bed {bind} at {r:.4f} of its"
                          f" allowable, the others at " + ", ".join(
                              f"{ratios[u]:.3f}" for u in beds if u != bind)
                          + f"; {len(coolers)} coolers fit")

        #  (g) the bracketed smallest diameter, recomputed per bed
        if ratios:
            dmin, which = smallest_admissible(kp, beds, D)
            got = v.get("D_smallestAdmissible")
            if got is None or rel(got, dmin) > 1e-9:
                fails.append(f"(g) the shell's D_smallestAdmissible {got!r} is not the"
                             f" per-bed recomputation {dmin!r}")
            if ("the binding bed there is " + which) not in out:
                fails.append(f"(g) the run does not name {which} as the bed binding at"
                             " the smallest diameter")
            if "bracketed on [0.10, 10.00] m" not in out:
                fails.append("(g) the run does not print the bracket it searched")
            claims.append(f"(g) smallest admissible D {dmin:.5f} m recomputed per bed"
                          f" (binding {which}), the bracket printed")
        D0, ratios0, share0 = D, dict(ratios), {u: kp[u]["ergunInertialShare_bed"]
                                                  for u in ratios}

        beds = [i for i in eq if re.fullmatch(r"CONVERTER\.Bed\d/shell", i)]
        for b in beds:
            if "cost" in eq[b]:
                fails.append(f"(b) {b} is still costed inside the converter shell")
            if not re.search(re.escape(b) + r"\s+--\s+inside the pressure shell CONVERTER/shell", out):
                fails.append(f"(b) {b} is not listed NOT COSTED naming CONVERTER/shell")
        priced = [i for i in eq if re.fullmatch(r"CONVERTER\.Bed\d/catalystCharge", i)] \
            + ["CONVERTER.InterbedCooler1", "CONVERTER.InterbedCooler2", "CONVERTER/shell"]
        for i in priced:
            if "cost" not in eq.get(i, {}):
                fails.append(f"(b) {i} is not priced")
        tot = re.search(r"TOTALS \(EUR\)( -- INCOMPLETE)?\s+[0-9]+\s+[0-9]+\s+([0-9]+)", out)
        s = sum(e["cost"]["totalModule"] for e in eq.values() if "cost" in e)
        if not tot or tot.group(1) or abs(s - float(tot.group(2))) > 0.5 * len(eq):
            fails.append("(b) the capital total is INCOMPLETE or not the sum of the"
                         " priced items' totals")
        claims.append(f"(b) {len(beds)} bed shells are baskets (not costed, naming the"
                      " shell); charges, coolers and the shell priced; the total sums")

        psv = eq.get("CONVERTER/psv")
        if psv is None:
            fails.append("(c) no CONVERTER/psv")
        else:
            pv = psv["values"]
            if pv["P_set_gauge"] != v["pressureDesign"]:
                fails.append("(c) the valve is not set at the shell's design pressure")
            if "blocked_CONVERTER_HotEffluent_A" not in pv:
                fails.append("(c) the valve does not relieve the sector's outlet"
                             " CONVERTER.HotEffluent")
        if any(re.fullmatch(r"CONVERTER\.Bed\d/psv", i) for i in eq):
            fails.append("(c) a bed still carries its own valve")
        claims.append("(c) ONE valve on the shell, set at its design pressure, on the"
                      " sector's outlet")

        for sheet in ("design/CONVERTER/shell", "design/CONVERTER/psv"):
            if not (case / sheet).is_file():
                fails.append(f"(d) no sheet at {sheet}")
        if (case / "design/CONVERTER/CONVERTER").exists():
            fails.append("(d) design/CONVERTER/CONVERTER/ exists -- the sector named twice")
        claims.append("(d) the shell's sheets at the sector's own level")

    probes = [
        ("a D in the shell's designRules",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;",
                                                  "pressureDesign  167;  D 3.0 m;")),
         "second home for the converter's diameter"),
        ("an H smaller than the stack",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;",
                                                  "pressureDesign  167;  H 5 m;")),
         "SMALLER than its members"),
        ("the entry before its members",
         lambda t: t.replace(ENTRY, "").replace(
             "        { unitName CONVERTER.Bed1;", ENTRY + "        { unitName CONVERTER.Bed1;"),
         "AFTER every member's own entry"),
        ("a name that is no sector",
         lambda t: t.replace(ENTRY, ENTRY.replace("unitName CONVERTER;", "unitName REACTOR;")),
         "REACTOR"),
        ("a shell rated below a member",
         lambda t: t.replace(ENTRY, ENTRY.replace("pressureDesign  167;", "pressureDesign  150;")),
         "rated below what it contains"),
        ("a bed at its own L_over_D",
         ("CONVERTER/Bed2/system/flowsheetDict",
          lambda t: t.replace("diameter     $D_converter;", "L_over_D     1.5;")),
         "diameter is its OWN"),
        ("two beds, two diameters",
         ("CONVERTER/Bed2/system/flowsheetDict",
          lambda t: t.replace("diameter     $D_converter;", "diameter     2.5 m;")),
         "TWO diameters"),
    ]
    #  (g) end to end: the witness at another diameter, one pass each, and
    #  an allowable no diameter in the bracket can meet.
    def at_diameter(factor):
        def edit(t):
            return re.sub(r"(D_converter\s+)([0-9.]+)( m;)",
                          lambda m: m.group(1) + repr(float(m.group(2)) * factor)
                          + m.group(3), t, count=1)
        return ("system/flowsheetDict", edit)
    diameter_runs = [("wider", at_diameter(1.05)), ("narrower", at_diameter(0.97))]
    probes.append(("an allowable no diameter in the bracket meets",
                   ("CONVERTER/Bed1/system/flowsheetDict",
                    lambda t: t.replace("allowable 1 bar;", "allowable 0.00001 bar;")),
                   "NO diameter in the bracket [0.1, 10] m"))

    #  The probes are independent runs: in parallel, so the gate costs one
    #  run's wall clock and not five (the faster-gates rule, never fewer arms).
    def probe(args):
        label, edit, expect = args
        with tempfile.TemporaryDirectory() as td:
            rc, out, js = run(copy(td, edit))
        return label, expect, out, js

    def diameter_probe(args):
        label, edit = args
        with tempfile.TemporaryDirectory() as td:
            rc, out, js = run(copy(td, edit))
        return label, rc, out, js

    def fixture(tol):
        with tempfile.TemporaryDirectory() as td:
            case = two_beds(td, OUTER % tol)
            if tol != "1.0e-6":
                #  The tie: two EQUAL beds, whose drops differ only by the
                #  second one's slightly lower pressure (~1 %), inside a 5 % tol.
                fs = case / "system/flowsheetDict"
                fs.write_text(fs.read_text().replace("V_R           3.0e-3;",
                                                     "V_R           1.0e-3;"))
            return tol, run(case)

    fixture_refusals = [
        ("largestOf with one quantity",
         OUTER.replace("bed1.dP_over_allowable  bed2", "bed2") % "1.0e-6",
         "needs at least two quantities"),
        ("largestOf beside path",
         OUTER.replace("value 1.0;", "path bed1.dP_bed_bar;  value 1.0;") % "1.0e-6",
         "Keep one form"),
    ]

    def fixture_refusal(args):
        label, outer, expect = args
        with tempfile.TemporaryDirectory() as td:
            rc, out, js = run(two_beds(td, outer))
        return label, expect, rc, out

    with ThreadPoolExecutor(max_workers=4) as ex:
        f_results = ex.map(probe, probes)
        f_diam = ex.map(diameter_probe, diameter_runs)
        f_fix = ex.map(fixture, ["1.0e-6", "0.05"])
        f_fixref = ex.map(fixture_refusal, fixture_refusals)
        results = list(f_results)
        diam = list(f_diam)
        fix = list(f_fix)
        fixref = list(f_fixref)

    for label, rc, out, js in diam:
        if rc != 0 or js is None:
            fails.append(f"(g) the witness at a {label} diameter did not run (exit {rc})")
            continue
        kp = js["kpis"]
        Dn = kp["CONVERTER.Bed1"]["D_bed_declared_m"]
        worst = 0.0
        for u, r0 in ratios0.items():
            pred = frozen_ratio(r0, share0[u], D0, Dn)
            worst = max(worst, rel(kp[u]["dP_over_allowable"], pred))
        if worst > 1e-2:
            fails.append(f"(g) at the {label} diameter {Dn:.4f} m the frozen-state law"
                         f" misses a bed's actual drop by {worst:.2%} (> 1 %)")
        sh = {e["item"]: e for e in js["equipment"]}.get("CONVERTER/shell", {})
        dmin = sh.get("values", {}).get("D_smallestAdmissible")
        if label == "wider":
            if "m is WIDER than that" not in out:
                fails.append("(g) the wider run does not say the converter is WIDER"
                             " than the smallest admissible diameter")
            if dmin is None or rel(dmin, D0) > 3e-3:
                fails.append(f"(g) the wider run's smallest admissible diameter"
                             f" {dmin!r} is not the design D {D0!r} to 0.3 %")
            wider = (Dn, worst, dmin)
        else:
            if "m is NARROWER than that" not in out or "EXCEEDS its allowable" not in out:
                fails.append("(g) the narrower run does not say the converter is"
                             " NARROWER and a bed EXCEEDS its allowable")
            if not re.search(r'"category": "rating", "severity": "warning", "locus":'
                             r' "converterShell \'CONVERTER\'", "message": "the smallest',
                             out):
                fails.append("(g) the narrower verdict is not a WARNING in the caveat log")
            narrower = (Dn, worst)
    if not [f for f in fails if f.startswith("(g) at the") or "did not run" in f]:
        claims.append(f"(g) end to end: at {wider[0]:.4f} m and {narrower[0]:.4f} m the"
                      f" frozen-state law predicts every bed's actual drop to"
                      f" {max(wider[1], narrower[1]):.2%}; the wider run finds the"
                      f" design D back at {wider[2]:.5f} m and says WIDER, the narrower"
                      " warns")

    #  (h) the DesignSpec's largestOf on the two-bed fixture
    for tol, (rc, out, js) in fix:
        if rc != 0 or js is None:
            fails.append(f"(h) the two-bed fixture (tol {tol}) did not run (exit {rc}):"
                         + out[-400:])
            continue
        k1, k2 = js["kpis"]["bed1"], js["kpis"]["bed2"]
        m = re.search(r"largestOf: at the design point the largest is (\S+)\.dP_over_allowable"
                      r" = ([0-9.eE+-]+)", out)
        if not m or m.group(1) != "bed2":   # equal beds: bed2 is at the lower P
            fails.append(f"(h) tol {tol}: the run does not name bed2 (the longer bed) as"
                         " the largest")
        if tol == "1.0e-6":
            if abs(k2["dP_over_allowable"] - 1.0) > 1e-6 or k1["dP_over_allowable"] >= 1.0:
                fails.append(f"(h) the fixture did not solve the diameter at which the"
                             f" LARGER drop sits at its allowable: bed1"
                             f" {k1['dP_over_allowable']}, bed2 {k2['dP_over_allowable']}")
            if "share the bound" in out:
                fails.append("(h) a 0.33 / 1.00 pair was called a tie")
            fixD, fixr1 = k1["D_bed_declared_m"], k1["dP_over_allowable"]
        elif "share the bound" not in out:
            fails.append("(h) two equal beds under a 5 % tol: their drops are within it"
                         " of each other, and the run does not say they share the bound")
    for label, expect, rc, out in fixref:
        if rc == 0 or expect not in out:
            fails.append(f"(h) {label}: no refusal naming `{expect}`")
    if not [f for f in fails if f.startswith("(h)")]:
        claims.append(f"(h) the DesignSpec's largestOf solves the two-bed fixture's"
                      f" diameter {fixD:.5f} m with the longer bed at its allowable and"
                      f" the other at {fixr1:.3f}, names it, says a tie under a wide tol,"
                      f" and {len(fixture_refusals)} grammar refusals fire")
    for label, expect, out, js in results:
            #  A sizing refusal is caught per entry and listed; the run goes on.
            if expect not in out:
                fails.append(f"(e) {label}: no refusal naming `{expect}`")
            elif js and any(e["item"] == "CONVERTER/shell" for e in js.get("equipment", [])) \
                    and label != "a name that is no sector":
                fails.append(f"(e) {label}: refused AND sized")
    claims.append(f"(e) {len(probes)} refusals fired by name")

    if fails:
        print("check_converter_shell: FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("check_converter_shell: OK -- " + "; ".join(claims))
    return 0


if __name__ == "__main__":
    sys.exit(main())
