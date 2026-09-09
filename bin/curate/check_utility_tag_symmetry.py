#!/usr/bin/env python3
"""Gate: a utility `category` is applied only when the circuit has BOTH ends.

    bin/curate/check_utility_tag_symmetry.py

WHY THIS EXISTS.  `reporting::unitEnergyBalance` keeps a stream carrying a
`category` out of the process enthalpy and puts it into `qBoundary` instead:

    qBoundary += H(supply)        qBoundary -= H(return)

THE SUBTRACTION IS THE WHOLE POINT.  It cancels the medium's formation datum
and leaves the heat the circuit carried.  With the tag on ONE end only the
cancellation never happens, and the supply's whole datum offset is filed as a
duty.

Found by Vitor on 2026-09-09, reading the green-ammonia global energy panel and
asking whether it looked right.  `0/MAIN/Chw` carries `category chilledWater;`
and the ChwOut the run produces carries none, so 60.05 kg/s of chilled water
reported a 960 712 kW "duty" for a chiller whose real duty is 741.56 kW --
and, because the unit then failed EnergyBalanceReport's `internalExchanger`
test, its 741.56 kW was ALSO added to the plant's boundary term while its heat
was already leaving in the ChwOut stream counted in Sum H(products).  THAT
DOUBLE COUNT WAS THE PLANT'S 728.86 kW FIRST-LAW RESIDUAL; with the tag
applied symmetrically the same plant closes at -12.70 kW.

The scale was the worse half.  `residual_denom_kW` is "the energy the plant
exchanges", and 97.6 % of it was that phantom: 983 889 kW against an honest
22 436 kW.  The published closure read 0.0741 % where the truth is 0.057 % --
a number that happened to flatter, but which would have flattered a real
violation by the same factor of 44.

Nothing in the corpus tags a return.  Ten cases tag a supply; zero tag the
other end.  So the cancellation this arithmetic is built on had never once
happened, in any case, since the code was written.

WHAT THIS GATE CHECKS.

  (a) THE SOURCE RULE EXISTS.  `unitEnergyBalance` decides `applyTag` from
      tagged streams on BOTH sides before accumulating anything, and both
      branches record the ignored names.  A SOURCE arm because no output can
      distinguish "the rule is there" from "no case exercised it today".

  (b) THE ANNOUNCEMENT FIRES.  A live case with a half-tagged circuit prints
      `[utility]` naming the unit and the stream.  Silence here is the whole
      defect: the engine acted on the author's declaration in a way the author
      did not ask for.

  (c) THE ARITHMETIC IS RIGHT WHERE IT FIRES.  On the unit THE ANNOUNCEMENT
      NAMES -- and only there -- the medium now enters both sides, so |dH| is
      a rounding error against the enthalpy flowing through.  Checked as a
      RATIO, never as an absolute kW, so the arm does not become a second pin
      on a number the golden already holds.

      THE FIRST DRAFT APPLIED THIS TO EVERY UNIT AND ACCUSED AN INNOCENT ONE.
      `PURIFICATION.Deoxo` is a reactor: its dH is 141 % of its own stream
      enthalpy because it releases 348.7 kW of reaction heat into streams
      whose formation-datum enthalpies happen to be small.  Correct physics,
      flagged as a defect.  A gate that accuses the innocent teaches the
      reader to ignore it, so the arm now reads exactly the unit whose tag
      was ignored.

  (d) THE NEGATIVE.  A case with NO categorised stream prints no `[utility]`
      line at all.  Without it, an implementation that announced on every unit
      would pass (a)-(c) and teach every reader to ignore the message.

NOT CHECKED, and said plainly:

  * Whether a SYMMETRIC circuit computes the right duty.  No case in the
    corpus tags both ends, so that path has no witness here; the arm would be
    a guard whose only case satisfies it.  The day a case declares both ends
    (or the `utilities {}` block starts supplying the pairing), this gate
    gains that arm and this paragraph goes.
  * Whether the ten half-tagged cases SHOULD be declaring their circuits.
    That is a case-authoring decision, not the engine's, and the engine now
    says so on every run instead of deciding in silence.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
MATH = ROOT / "src/reporting/BalanceMath.H"

#  (b),(c): the ONLY shipped case that reaches this path, and picking it was
#  not a preference.  MEASURED 2026-09-09 over all ten cases that tag a
#  utility stream: this one announces; utility01 and utility02 REFUSE their
#  energy balance outright (a component with no enthalpy datum), so the
#  announcement site is never reached; and the other seven never present the
#  tagged stream to a unit's energy balance at all.  The first draft of this
#  gate used utility03 and failed on correct code for exactly that reason --
#  A WITNESS THAT CANNOT REACH THE CODE PROVES NOTHING ABOUT IT.
POSITIVE = "tutorials/plant/greenAmmoniaIndustrialN2"
#  (d): a case with no categorised stream anywhere.
NEGATIVE = "tutorials/steady/flash/flash01_benzene_toluene"


def run(case):
    p = subprocess.run([str(SOLVE), str(ROOT / case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fail = []

    if not SOLVE.exists():
        print("check_utility_tag_symmetry: REFUSED -- choupoSolve is not "
              "built, so this gate cannot run and therefore must not pass "
              "(run `make`).")
        return 1

    #  (a) the source rule.
    src = MATH.read_text()
    for needle, why in (
        ("const bool applyTag = (nTagIn > 0 && nTagOut > 0);",
         "the symmetry decision itself"),
        ("s->category.empty() || !applyTag",
         "the accumulation branch that honours it"),
        ("utilityTagIgnored.push_back",
         "the record of which streams had their tag ignored"),
    ):
        if needle not in src:
            fail.append(f"src/reporting/BalanceMath.H no longer carries "
                        f"{why} (`{needle}`) -- the tag may be applied to a "
                        "half-declared circuit again, and its datum offset "
                        "would be filed as a duty")

    #  (b),(c) the announcement and the cancellation.
    rc, out = run(POSITIVE)
    if rc != 0:
        fail.append(f"{POSITIVE} did not run (exit {rc}) -- this gate's "
                    "witness is broken, which is not evidence about the rule")
    else:
        #  A REFUSED energy balance cannot reach the announcement, and
        #  accusing the engine of silence there would be a false alarm --
        #  the gate says which state it is in rather than guessing.
        if "ERROR: energyBalance" in out:
            fail.append(f"{POSITIVE} REFUSES its energy balance, so it can no "
                        "longer witness this rule -- this gate needs a case "
                        "whose balance RUNS and whose circuit is half-tagged; "
                        "fix the witness, do not weaken the arm")
        lines = [l for l in out.splitlines() if l.startswith("[utility]")]
        if not lines:
            fail.append(f"{POSITIVE} declares a `category` on one end of a "
                        "circuit and the run says NOTHING -- the engine "
                        "changed how that stream is counted without telling "
                        "the author, which is the defect this gate exists for")
        else:
            one = lines[0]
            for phrase in ("ONE SIDE", "IGNORED", "tag both ends"):
                if phrase not in one:
                    fail.append(f"the [utility] line does not say '{phrase}': "
                                "an announcement that does not name what was "
                                "done, or the remedy, is a slightly louder "
                                f"form of silence -- got: {one[:160]}")

        #  (c) the cancellation, on the ANNOUNCED units only.
        csv = ROOT / POSITIVE / "reports/balances/energyBalance_byUnit.csv"
        named = set()
        for l in lines:
            m = re.search(r"unit '([^']+)'", l)
            if m:
                named.add(m.group(1))
        if not csv.is_file():
            fail.append(f"{csv.relative_to(ROOT)} was not written, so this "
                        "gate cannot check the cancellation it claims to")
        elif named:
            seen = set()
            #  ONLY THE FIRST SECTION.  The file carries three tables -- the
            #  per-unit enthalpy rows, then `# declared energy items`, then
            #  the model-boundary ledger, whose second column is a WORD.
            #  Reading past the blank line made the gate accuse the engine of
            #  writing a non-numeric enthalpy for a unit whose enthalpy row is
            #  fine, three tables up.
            for row in csv.read_text().splitlines()[1:]:
                if not row.strip() or row.lstrip().startswith("#"):
                    break
                f = row.split(",")
                if len(f) < 4 or f[0] not in named:
                    continue
                seen.add(f[0])
                try:
                    hIn, hOut, dH = float(f[1]), float(f[2]), float(f[3])
                except ValueError:
                    fail.append(f"unit '{f[0]}' has no numeric enthalpy row, "
                                "so the cancellation cannot be read")
                    continue
                scale = max(abs(hIn), abs(hOut))
                #  1 % is three orders of magnitude looser than the observed
                #  1.4e-6 %, and three orders tighter than an uncancelled
                #  datum (which puts the whole medium on one side, ~100 %).
                if scale > 1.0 and abs(dH) / scale > 0.01:
                    fail.append(
                        f"unit '{f[0]}' had its utility tag ignored, so the "
                        f"medium should enter BOTH sides, yet |dH| is "
                        f"{abs(dH) / scale * 100:.2f} % of the enthalpy "
                        "flowing through it -- the formation datum is still "
                        "landing on one side only")
            for miss in named - seen:
                fail.append(f"the run announced unit '{miss}' but the per-unit "
                            "ledger has no row for it -- the announcement and "
                            "the report disagree about which units exist")

    #  (d) the negative.
    rc, out = run(NEGATIVE)
    if rc != 0:
        fail.append(f"{NEGATIVE} did not run (exit {rc})")
    elif "[utility]" in out:
        fail.append(f"{NEGATIVE} categorises no stream and the run announced "
                    "a half-tagged circuit anyway -- an announcement that "
                    "fires everywhere teaches the reader to ignore it")

    if fail:
        print("check_utility_tag_symmetry: FAILED")
        for f in fail:
            print(f"  - {f}")
        return 1

    print("check_utility_tag_symmetry: OK -- a utility `category` is applied "
          "only when the circuit is declared on BOTH sides of a unit; a "
          "half-declared one has its tag ignored (the medium counted as "
          "material, which nets its own formation datum exactly) and the run "
          "ANNOUNCES it by unit and stream with the remedy.  Verified on the "
          "source rule, on a live case that has such a circuit, on that "
          "case's own per-unit ledger -- on the unit the announcement NAMES, "
          "|dH| is under 1 % of the enthalpy flowing through it, i.e. the "
          "medium's datum cancels -- and on a case with no categorised "
          "stream, which stays silent.  SCOPE, MEASURED: ten "
          "corpus cases tag a utility stream and exactly ONE reaches this "
          "path -- two refuse their energy balance for a missing enthalpy "
          "datum and seven never hand the tagged stream to a unit's balance, "
          "so this gate speaks for one case and says so.  NOT CHECKED: the "
          "SYMMETRIC path -- no case in the corpus tags both ends of a "
          "circuit, so nothing here witnesses that a fully declared circuit "
          "reports the right duty.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
