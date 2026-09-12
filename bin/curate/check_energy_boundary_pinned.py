#!/usr/bin/env python3
"""Gate: the plant-boundary first law is PINNED where it is published, and
its heat/work decomposition CLOSES back onto the total it decomposes.

    bin/curate/check_energy_boundary_pinned.py

WHY THIS EXISTS.  2026-09-05: Vitor opened the flagship plant on the live site
and saw a first-law residual of 372.5 kW (1.79 %) under "Global energy
balance".  The engine's own energyBalance report, on the same run, closes the
boundary at 34.4 kW (0.163 %).  The GUI was not drawing the engine's number: it
summed utility-ALLOCATED duties itself, so the crystalliser's and the
fermentor's cooling -- served by no declared utility -- never entered its sum,
and 372.5 - 34.4 = 74.8 + 263.3 exactly (the one duty it saw, plus the engine's
boundary heat it never read).  A second home for a balance the doctrine says
is engine-owned.

The fix stamps the report's ledger on the result as ONE top-level object,
`globalEnergyBoundary`, and the GUI draws it.  A top-level block carrying a
number a reader acts on must arrive PINNED in the same commit (the 2026-08-12
rule), so the `boundary` golden kind reads it and this gate holds both
directions:

  (a) PUBLISHED IS PINNED: every case whose run emits `globalEnergyBoundary`
      and ships a golden carries `boundary global <term>` rows for the three
      TERMS -- H_feeds_kW, Q_boundary_kW, H_products_kW.  The residual is
      their difference; the generator pins it only when it is >= 1 W in
      magnitude (a 1e-13 kW residual pinned at 1e-4 RELATIVE is a golden over
      cancellation noise -- the column13 lesson), and that threshold has ONE
      home, in `bin/runTests`' generator.  This gate does not repeat it: it
      requires the three terms and checks any residual row it finds under (b).
  (b) PINNED IS PUBLISHED: every `boundary global` row names a field the run
      still emits.  A row matching nothing reads as coverage it does not give.

THE `boundary` KIND NAMES A LEDGER (2026-09-08).  Its `name` column used to be
the fixed word `global`, because there was one boundary ledger; it now SELECTS
one -- `global` is the first law, `mass` is the plant material summary in its
two scopes (`globalMassBoundary`).  This gate is about the FIRST LAW, so it
reads the `global` rows and COUNTS the rest rather than accusing them.
MEASURED rather than supposed, by adding one `boundary mass
process_closure_pct` row to a corpus golden by hand: with the old ledger-blind
read this gate FAILED -- "pins `boundary mass process_closure_pct`, which the
run does not emit" -- so recording the mass rows would have broken a gate about
energy.  With the ledger-aware read it passes and says how many rows belong to
the other ledger.  What checks a `mass` row is the row itself (the golden
compares it) plus `check_mass_closure`, which holds the closure it carries.

Reads the suite's single-pass cache (CHOUPO_SUITE_OUTPUTS) when present and
runs the case otherwise.  A case that exits non-zero, or emits no block
(batch, ctrl, props -- the report is choupoSolve's), owes nothing.

Q AND W, TOLD APART (2026-09-12).  The ledger published ONE net number,
`Q_boundary_kW`, with heat and shaft work already added together -- its own
comment in the report says a turbine's shaft work IS counted in it -- so
nothing downstream could draw  dH = Q - W, only its total.  It now publishes
`Q_heat_kW` and `W_shaft_kW` beside it.  The split is ADDITIVE: the report
accumulates the WORK items and derives the heat by SUBTRACTION, so
`Q_boundary_kW` keeps its value to the last bit (no golden recorded before
this moved) and the three close by construction rather than to within two
roundings -- the `phases {}` rule of 2026-07-30, one side stored and the other
derived.  Three arms hold that:

  (c) THE SPLIT CLOSES.  On every published block,
      Q_heat_kW + W_shaft_kW == Q_boundary_kW.  The tolerance is the JSON's
      own PRINTING precision (12 significant digits), not an arithmetic
      slack: the engine computes one of the two by subtracting the other from
      the total, so any real gap here means something stopped doing that.
  (d) PUBLISHED IS PINNED, for the new term.  A run whose |W_shaft_kW| is at
      least 1 W must pin `boundary global W_shaft_kW`.  It RATCHETS: a case
      that gains shaft work fails until its golden gains the row.  The 1 W
      floor has ONE home -- `bin/runTests`' generator, the same floor the
      residual row uses -- and this arm reads the published number, never the
      floor's reason.  `Q_heat_kW` is deliberately NOT required: it is
      `Q_boundary_kW - W_shaft_kW` and BOTH of those are pinned, so a row for
      it would be a third home for a number two pinned rows already fix.
  (e) THE CLASSIFICATION IS REAL, on named witnesses -- because (c) and (d)
      are both satisfied by a classifier that calls EVERYTHING heat (work
      would read 0 everywhere, the sum would still close, and no row would be
      required).  So three shapes are asserted structurally, never by value:
      a work-only plant publishes W == Q_boundary and Q_heat == 0; a
      heat-only plant publishes the mirror; and a MIXED plant publishes both
      non-zero and of OPPOSITE sign -- rankine02 nets 2e-10 kW out of
      +8.84 kW of heat and -8.84 kW of shaft work, which is precisely the
      physics the single total was hiding.

  (f) ONE HOME, in source.  `energyItemKpis()` in `src/reporting/BalanceMath.H`
      carries the item names AND their kind; `isEnergyItemKpi` and
      `isWorkItemKpi` both read it, so membership and kind cannot disagree,
      and there is no catch-all -- a name the map does not carry is not an
      energy item at all.  The report must DERIVE the heat by subtraction; an
      independently accumulated heat sum is refused by name, because two sums
      close only to within their roundings and this must close exactly.

SIGN, stated once: every energy item in this engine is POSITIVE when energy is
ADDED to the process streams, so a turbine's `W_shaft_kW` is negative and the
textbook W (work done BY the fluid) is `-W_shaft_kW`.  This gate never
negates; it checks the engine's own convention against itself.

SABOTAGES PERFORMED, 8 of them, each applied to the tree, READ BACK off disk,
rebuilt where it touches C++, run, and reverted:

  S1  `W_shaft_kW` reclassified as `Heat` in `energyItemKpis()`.
      CAUGHT by (e), on four witnesses: turbine01_air published Q_heat ==
      Q_boundary == -10 and W_shaft == 0.  NOT caught by (c) -- the sum still
      closed -- nor by (d), which had no work left to ask for.  That pair of
      blindnesses is exactly why (e) exists.
  S2  the report accumulates the heat in parallel (`globalQheat += ...`) and
      publishes THAT instead of deriving it.  (The first attempt at this
      sabotage never incremented the accumulator, so it published a flat zero
      and proved nothing; it was redone faithfully.)
      CAUGHT by (f), on the source, and by NOTHING ELSE: (c), (d) and (e) all
      passed, because two independent sums over the same items agree to well
      inside printing precision.  A gate arm on the output cannot see this.
  S3  `isEnergyItemKpi` given back its own private `std::set` of names beside
      the map.  CAUGHT by (f), both halves of it: the function no longer reads
      the one home, and a second literal list exists.
  S4  a `boundary global W_shaft_kW` row deleted from pump01_water's golden.
      CAUGHT by (d), naming the case and the remedy.
  S5  the split perturbed -- `gb.Q_heat_kW = Qheat * 1.000001`.
      CAUGHT by (c) on every witness carrying boundary heat, down to a
      1.7e-06 kW gap on column01.  It also made (e)'s heat-only arm MISDIAGNOSE
      ("heat is being classified as shaft work" about a run whose W_shaft was
      exactly 0); that message now follows which half is actually wrong,
      because a gate that accuses the innocent teaches the reader to ignore it.
  S6  SURVIVED FIRST CONTACT, and the arm list is longer for it.  `globalWshaft`
      accumulated for the `kind == 2` units too -- the electricLoad generator,
      which carries no process stream and whose `W_shaft_kW` is work that
      already left the fluid at the turbine.  The gate said OK.  Arm (c) is
      STRUCTURALLY blind here and always will be: the heat half is derived by
      SUBTRACTING the work from the total, so a wrong W is absorbed by Q and
      the sum closes exactly either way.  What did catch it was the GOLDEN
      (combined02: `boundary.global.W_shaft_kW: got 0 expected -650`), i.e.
      arm (d)'s row doing its job one layer up.  combined02 was then added as
      a second `mixed` witness -- it is the corpus's only plant with an
      electricLoad -- and the sabotage now fails inside the gate too.
  S7  the two halves published under each other's names (`Q_heat_kW = Wshaft`
      and vice versa).  CAUGHT by (e) on all three work-only witnesses.  (c)
      passed, as it must: a swap preserves the sum.
  S8  the mirror of S1 -- `Q_kW` reclassified as `Work`.  CAUGHT by (e), on
      both `mixed` witnesses.  NOT caught by the heat-only witness, and the
      reason is worth knowing: column01's heat items are `Q_reboiler_kW` and
      `Q_condenser_kW`, so no witness here covers a misclassified bare `Q_kW`
      on a heat-only plant.  The mixed pair covers it; a heat-only case whose
      duty is a bare `Q_kW` would cover it more directly and is not in the
      list.

NOT CHECKED: whether the engine's ledger is RIGHT (which duties are boundary
heat is the report's decision and has its own record), and per-unit closures
(`check_closure_ledger_pinned` covers the model-boundary ledger; the plain
per-unit residuals the report "cannot attribute" are pinned by nothing here).
Nor whether a KPI's DECLARED kind is true of the quantity the unit publishes:
`W_hydraulic_kW` and `Q_removed_kW` are declared in the map and emitted by no
unit in the tree, so their kind is a contract awaiting a publisher.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
#  The single-pass cache, and (under --fast) the SCOPE it becomes.  One home:
#  bin/curate/suite_cache.py.
from suite_cache import SCOPED, scope_sentence, stdout_of   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TERMS = ("H_feeds_kW", "Q_boundary_kW", "H_products_kW")

#  The 1 W floor above which the generator writes a `W_shaft_kW` row.  ONE
#  home: `bin/runTests`' generator.  Repeated here as the READING threshold of
#  arm (d) and nowhere else -- if the two ever disagree, the symptom is a gate
#  asking for a row the generator will not write, which is loud.
WORK_PIN_FLOOR_KW = 1.0e-3

#  Arm (e)'s witnesses.  Each names a SHAPE, never a value: the numbers belong
#  to the goldens.  `work` -- the plant's only boundary item is shaft work;
#  `heat` -- its only boundary item is heat; `mixed` -- both, with the work
#  term negative (a net producer) and the heat term positive, which is the
#  pair a single net total cannot express.
WITNESSES = {
    "tutorials/steady/rotating/turbine01_air": "work",
    "tutorials/steady/rotating/compressor01_air": "work",
    "tutorials/steady/rotating/pump01_water": "work",
    "tutorials/steady/distillation/column01_benzene_toluene": "heat",
    "tutorials/steady/power/rankine02_water": "mixed",
    #  S6's witness, added because S6 SURVIVED without it.  This plant carries
    #  an `electricLoad` generator -- a unit with NO process stream, whose
    #  `W_shaft_kW` is the work that ALREADY left the fluid at the turbine, so
    #  the report skips it in the boundary sum.  Counting it would net the
    #  turbine's own work to zero.  Arm (c) is structurally blind to that: the
    #  heat half is derived by SUBTRACTION, so a wrong W is absorbed by Q and
    #  the sum still closes exactly.  Only a witness that carries the
    #  double-count's shape can see it.
    "tutorials/steady/power/combined02_brayton_rankine_shaft": "mixed",
}


def app_of(case: Path) -> str:
    m = re.search(r"\bapplication\s+(\w+)", (case / "system/controlDict").read_text(errors="replace"))
    return m.group(1) if m else "choupoSolve"


NOT_RUN = object()      # the bare run could not be judged (see published())
OUT_OF_SCOPE = object() # the caller did not run this case at all (--fast)


def published(case: Path):
    """The emitted object's fields; None when a CLEAN run emits none; NOT_RUN
    when the run could not be performed here.  The third state matters: a
    userOps case needs bin/runTests' compile step and exits 2 when the bare
    binary is asked -- accusing its pinned rows of matching nothing would be a
    gate accusing the innocent (userOp02, first standalone run, 2026-09-05).
    Under the suite the cache carries the harness's own run and it IS judged."""
    out = stdout_of(case)
    if out is None and SCOPED:
        return OUT_OF_SCOPE
    if out is None:
        binary = ROOT / app_of(case)
        if not binary.exists():
            return NOT_RUN
        proc = subprocess.run([str(binary), str(case)], capture_output=True, text=True)
        if proc.returncode != 0:
            return NOT_RUN
        out = proc.stdout
    m = re.search(r'"globalEnergyBoundary": \{([^}]*)\}', out)
    if not m:
        return None
    return dict(re.findall(r'"(\w+)": (-?[0-9][0-9.eE+-]*|true|false)', m.group(1)))


def pinned(case: Path):
    """-> (this gate's `global` rows, count of rows naming ANOTHER ledger).

    The second number is returned and reported rather than dropped: a gate
    that silently ignores rows of its own KIND is hiding the fact that another
    ledger exists at all."""
    rows, other = [], 0
    for line in (case / "expected").read_text(errors="replace").splitlines():
        parts = line.split()
        if parts[:1] == ["boundary"] and len(parts) >= 4:
            if parts[1] == "global":
                rows.append((parts[1], parts[2]))
            else:
                other += 1
    return rows, other


def run_case(case: Path):
    """The case's stdout fields, cache-first but ALWAYS run when not cached.

    Arm (e)'s witnesses go through this rather than `published()`: under
    `--fast` the cache IS the scope, and a witness that quietly drops out of
    scope is a check that cannot run reporting a pass.  Five short cases.
    """
    out = stdout_of(case)
    if out is None:
        binary = ROOT / app_of(case)
        if not binary.exists():
            return None
        proc = subprocess.run([str(binary), str(case)], capture_output=True, text=True)
        if proc.returncode != 0:
            return None
        out = proc.stdout
    m = re.search(r'"globalEnergyBoundary": \{([^}]*)\}', out)
    if not m:
        return None
    return dict(re.findall(r'"(\w+)": (-?[0-9][0-9.eE+-]*|true|false)', m.group(1)))


def num(pub, key):
    """A published field as a float, or None when the run does not carry it."""
    try:
        return float(pub[key])
    except (KeyError, TypeError, ValueError):
        return None


def check_split_closes(rel, pub, problems) -> bool:
    """Arm (c).  Q_heat + W_shaft == Q_boundary, to PRINTING precision."""
    q, h, w = (num(pub, "Q_boundary_kW"), num(pub, "Q_heat_kW"),
               num(pub, "W_shaft_kW"))
    if q is None:
        return False
    if h is None or w is None:
        problems.append(
            f"{rel}: publishes Q_boundary_kW but not Q_heat_kW/W_shaft_kW -- the "
            "first law's right-hand side arrives as one net number again, and no "
            "reader can draw dH = Q - W from it.")
        return False
    #  12 significant digits is what the emitter prints; the arithmetic itself
    #  is a subtraction and is exact.  Scale the slack by the magnitude so a
    #  megawatt plant is not held to a nanowatt of print rounding.
    slack = 1.0e-9 * max(1.0, abs(q), abs(h), abs(w))
    if abs(h + w - q) > slack:
        problems.append(
            f"{rel}: the heat/work split does NOT sum back to the total it "
            f"decomposes -- Q_heat {h!r} + W_shaft {w!r} = {h + w!r}, but "
            f"Q_boundary is {q!r} (gap {h + w - q!r} kW).  The report derives "
            "the heat by subtracting the work from the total, so a gap here "
            "means something stopped doing that.")
        return False
    return True


def check_witness(rel, shape, problems):
    """Arm (e).  The classification asserted as a SHAPE, never as a value."""
    pub = run_case(ROOT / rel)
    if pub is None:
        problems.append(
            f"{rel}: arm (e) witness could not be judged -- the case did not run "
            "here, or emitted no globalEnergyBoundary.  A check that cannot run "
            "must not pass; fix the case or move the witness.")
        return
    q, h, w = (num(pub, "Q_boundary_kW"), num(pub, "Q_heat_kW"),
               num(pub, "W_shaft_kW"))
    if q is None or h is None or w is None:
        problems.append(f"{rel}: arm (e) witness publishes no heat/work split.")
        return
    eps = 1.0e-9 * max(1.0, abs(q))
    if shape == "work":
        if abs(w - q) > eps or abs(h) > eps:
            problems.append(
                f"{rel}: a WORK-ONLY plant (its boundary items are a rotating "
                f"machine's shaft work) must publish W_shaft == Q_boundary and "
                f"Q_heat == 0; it publishes W_shaft {w!r}, Q_heat {h!r}, "
                f"Q_boundary {q!r}.  Shaft work is being classified as heat.")
    elif shape == "heat":
        if abs(h - q) > eps or abs(w) > eps:
            #  THE DIAGNOSIS FOLLOWS WHICH HALF IS WRONG.  A single sentence
            #  for both failures accused a classifier when the fault was the
            #  arithmetic: S5 perturbed Q_heat on a plant with no rotating
            #  machine and this arm said "heat is being classified as shaft
            #  work" about a run whose W_shaft was exactly 0.  A gate that
            #  accuses the innocent teaches the reader to ignore it.
            why = ("Heat is being classified as shaft work."
                   if abs(w) > eps else
                   "W_shaft is correctly 0, so the heat half no longer equals "
                   "the total it is supposed to BE here -- the arithmetic, not "
                   "the classification.")
            problems.append(
                f"{rel}: a HEAT-ONLY plant (reboiler + condenser, no rotating "
                f"machine) must publish Q_heat == Q_boundary and W_shaft == 0; "
                f"it publishes Q_heat {h!r}, W_shaft {w!r}, Q_boundary {q!r}.  "
                + why)
    elif shape == "mixed":
        #  S7: "both non-zero" alone is satisfied by a classifier that SWAPS
        #  the two labels.  This case is a net work PRODUCER heated from the
        #  boundary, so the signs are fixed by the physics: heat in (+), work
        #  out (-).
        if not (h > 1.0 and w < -1.0):
            problems.append(
                f"{rel}: a net-work-PRODUCING plant must publish heat IN "
                f"(Q_heat > 0) and shaft work OUT (W_shaft < 0); it publishes "
                f"Q_heat {h!r}, W_shaft {w!r}.  The engine's sign convention is "
                f"+ = energy ADDED to the process streams, and this case is the "
                f"one whose net total (Q_boundary {q!r}) hides both terms.")


#  Arm (f), on the SOURCE.  Each entry: (file, must-contain..., must-NOT-contain)
#  -- the claim is one home for the item list and its kind, and a heat half
#  that is DERIVED rather than separately accumulated.
def check_one_home(problems):
    bm = (ROOT / "src/reporting/BalanceMath.H").read_text(errors="replace")
    #  The map is the ONE list; `isEnergyItemKpi` must read it rather than
    #  carry a second literal set of the same names.
    if "energyItemKpis()" not in bm:
        problems.append("src/reporting/BalanceMath.H: no `energyItemKpis()` -- "
                        "the one home for an energy item's name AND its kind is gone.")
        return
    body = bm.split("inline bool isEnergyItemKpi")[1].split("}")[0] \
        if "inline bool isEnergyItemKpi" in bm else ""
    if "energyItemKpis()" not in body:
        problems.append(
            "src/reporting/BalanceMath.H: `isEnergyItemKpi` no longer reads "
            "`energyItemKpis()` -- membership and kind are back in two homes, "
            "so a KPI can be an energy item nobody classified.")
    if re.search(r"isEnergyItemKpi[\s\S]{0,400}?std::set<std::string>", bm):
        problems.append(
            "src/reporting/BalanceMath.H: `isEnergyItemKpi` carries its own "
            "std::set of item names beside the kind map -- two homes for one "
            "list, which is how a name gains membership without a kind.")
    if "isWorkItemKpi" not in bm or "energyItemKpis()" not in bm.split("isWorkItemKpi")[-1]:
        problems.append(
            "src/reporting/BalanceMath.H: `isWorkItemKpi` is missing or no "
            "longer reads `energyItemKpis()`.")
    rep = (ROOT / "src/reporting/EnergyBalanceReport.cpp").read_text(errors="replace")
    if not re.search(r"Qheat\s*=\s*Qext\s*-\s*Wshaft", rep):
        problems.append(
            "src/reporting/EnergyBalanceReport.cpp: the heat half is no longer "
            "DERIVED as `Qext - Wshaft`.  Two independently accumulated sums "
            "agree only to within their roundings; this decomposition must "
            "close exactly, so one side is stored and the other subtracted "
            "(the `phases {}` rule).")
    if re.search(r"\bglobal(Qheat|Heat)\s*\+=", rep):
        problems.append(
            "src/reporting/EnergyBalanceReport.cpp: a heat accumulator is being "
            "summed independently -- see above; derive it by subtraction.")


def main() -> int:
    problems, npin, ncase, notrun, nskipped = [], 0, 0, [], 0
    nother = 0      # `boundary` rows naming a ledger other than the first law
    nsplit = 0      # cases whose heat/work split was checked and closes
    nwork  = 0      # cases publishing shaft work above the pin floor
    #  (f) and (e) run ALWAYS -- they are source and named witnesses, neither
    #  of which the corpus walk's scope can narrow away.
    check_one_home(problems)
    for wrel, wshape in WITNESSES.items():
        check_witness(wrel, wshape, problems)
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        case = exp.parent
        if not (case / "system/controlDict").exists():
            continue
        if (case / ".known-broken").exists() or (case / ".expect-nonconvergence").exists():
            continue
        pub = published(case)
        pin, nOtherLedger = pinned(case)
        nother += nOtherLedger
        rel = case.relative_to(ROOT).as_posix()
        if pub is OUT_OF_SCOPE:
            nskipped += 1
            continue
        if pub is NOT_RUN:
            notrun.append(rel)
            continue
        if pub is None:
            for name, key in pin:
                problems.append(f"{rel}: pins `boundary {name} {key}` but the run emits no "
                                "globalEnergyBoundary -- a row matching nothing reads as coverage.")
            continue
        ncase += 1
        for t in TERMS:
            if ("global", t) not in pin:
                problems.append(f"{rel}: publishes globalEnergyBoundary but pins no `boundary global {t}`."
                                f"  Remedy: bin/runTests --record-append {rel}")
        #  (c) the split closes back onto the total it decomposes.
        if check_split_closes(rel, pub, problems):
            nsplit += 1
        #  (d) published is pinned, for the work term -- a RATCHET: a case
        #  that gains shaft work fails until its golden gains the row.
        w = num(pub, "W_shaft_kW")
        if w is not None and abs(w) >= WORK_PIN_FLOOR_KW:
            nwork += 1
            if ("global", "W_shaft_kW") not in pin:
                problems.append(
                    f"{rel}: publishes W_shaft_kW = {w!r} kW (>= 1 W) but pins no "
                    f"`boundary global W_shaft_kW`.  The plant does shaft work and "
                    f"nothing holds how much -- Q_boundary alone cannot say, it is "
                    f"the two added together.  Remedy: bin/runTests --record-append {rel}")
        for name, key in pin:
            if name != "global" or key not in pub:
                problems.append(f"{rel}: pins `boundary {name} {key}`, which the run does not emit.")
            else:
                npin += 1
    if SCOPED and ncase == 0 and not problems:
        print("check_energy_boundary_pinned: FAILED\n"
              "  no case IN SCOPE publishes a globalEnergyBoundary -- the "
              "caller ran none that does, so this gate checked nothing.  "
              "Remedy: the fast set must carry at least one steady case whose "
              "golden pins `boundary global ...` rows.")
        return 1
    if problems:
        print("check_energy_boundary_pinned: FAILED")
        for p in problems[:40]:
            print("  " + p)
        if len(problems) > 40:
            print(f"  ... and {len(problems) - 40} more")
        return 1
    print(f"check_energy_boundary_pinned: OK -- {npin} plant-boundary first-law quantit(ies) pinned "
          f"across {ncase} golden-shipping case(s) that publish `globalEnergyBoundary`, in both "
          f"directions (published implies pinned for the three terms; every pinned row is still "
          f"emitted).  The residual row follows the generator's own >= 1 W rule and is checked only "
          f"for existence here.  "
          f"The heat/work split SUMS BACK to Q_boundary on all {nsplit} of them "
          f"(Q_heat + W_shaft == Q_boundary to printing precision, the report deriving the heat by "
          f"subtraction); {nwork} case(s) publish shaft work of 1 W or more and each pins "
          f"`boundary global W_shaft_kW` (Q_heat is pinned by those two rows together and is "
          f"deliberately given none of its own).  The classification itself is held on "
          f"{len(WITNESSES)} named witness(es) -- work-only, heat-only and a net-work producer "
          f"whose two terms a single total cannot express -- and on the ONE source home for an "
          f"item's name and kind (src/reporting/BalanceMath.H `energyItemKpis`).  "
          + (f"{nother} `boundary` row(s) name ANOTHER ledger (today: `mass`, the "
             f"plant material summary) and are outside this gate's subject -- counted "
             f"here rather than dropped, and held by the golden itself and by "
             f"check_mass_closure.  " if nother else "")
          + (f"NOT JUDGED standalone: {len(notrun)} case(s) whose bare run fails here ({', '.join(notrun)}) "
             f"-- judged under the suite, whose cache carries the harness's own run.  " if notrun else "")
          + "NOT CHECKED: whether the engine's ledger is right, and the per-unit residuals the report "
          "cannot attribute."
          + scope_sentence(ncase, nskipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
