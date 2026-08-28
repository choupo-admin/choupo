#!/usr/bin/env python3
"""THE ONE HOME for every accepted violation in the project.

    bin/curate/debt_registry.py

WHY THIS EXISTS.  A pin is a **waiver**: a decision to tolerate a known
violation, taken once, that then silently outlives the reason for it unless
someone goes looking.  There are 90 `check_*` scripts under `bin/curate/`, and
the waivers were scattered across eight of them as ad-hoc module-level
constants -- `PINNED`, `PINS`, `PINNED_UP`, `ALLOW`.

That is **the arity doctrine violated by the machinery built to enforce it**.
The project's own rule is that a derived fact has exactly one home, and "the
set of violations this project has agreed to live with" is exactly such a
fact.  Nobody could answer *"what are we currently tolerating?"* without
reading eight files, and the answer was the thing most worth asking.

Raised by an external review (2026-08-05), which put it well: the gates are
"beginning to form a shadow architecture", and known-violation pin lists are
legitimate waivers that "should eventually become a unified architectural-debt
registry rather than separate ad hoc arrays embedded in gates".

WHAT A REGISTRY ENTRY OWES THE READER.  Every waiver carries:

  * `why`      -- what is wrong, in the terms a curator would need;
  * `remedy`   -- what removing it actually requires;
  * `blocked`  -- what stands in the way TODAY, or None if it is simply work.

The `remedy` field is the one that matters.  A pin without a stated exit is
indistinguishable from a decision to keep the defect for ever, and this
project has explicitly refused several fixes (inventing a citation, choosing
between two contradictory permeabilities) on the grounds that a VISIBLE GAP IS
STRICTLY BETTER THAN AN INVISIBLE FALSEHOOD.  That reasoning only holds while
the gap stays visible, which is what this file is for.

WHAT IS *NOT* HERE, deliberately.  Configuration that merely tells a gate
where to look (`SCAN`, `ALLOWED_PATHS`, superscript tables) is not a waiver
and stays with its gate.  The distinction is whether the entry EXCUSES A
KNOWN VIOLATION or merely parameterises a search.

STALENESS IS ENFORCED BY THE GATES, NOT HERE.  Each gate that reads a waiver
list must fail when a pin no longer fires -- a pin outliving its violation is
a licence.  This file holds the entries; the gates prove they are still true.
"""

# ---------------------------------------------------------------------------
#  DATA PROVENANCE
# ---------------------------------------------------------------------------

#  Aqueous species records that declare thermochemistry (hfAq / sAq / cpAq)
#  with no source, citation or origin field anywhere in the file.
#
#  NOT FIXED BY WRITING A PLAUSIBLE REFERENCE.  An invented citation converts
#  "unsourced" into "falsely sourced", and the second is undetectable by any
#  reader or tool.  This list IS the curation work-list.
SPECIES_WITHOUT_CITATION = {
    "Zn", "Al", "BOH4", "Cd", "CuI", "CuII", "FeII", "FeIII", "H3BO3",
    "H4SiO4", "HS", "HTart", "MnII", "NH4", "NO2", "Pb", "Tart",
    #  The 2026-08-05 audit named SEVENTEEN.  There are eighteen: the gate
    #  found Acetate.dat on its first run.  A hand-compiled list of violations
    #  is itself a hand-maintained derived fact, and it was already one short
    #  on the day it was written.  The gate recounts; the list remembers.
    "Acetate",
}

#  Records whose SOURCE does not meet the project's licence/provenance
#  protocol.  Each names what is wrong and what removing it costs.
SOURCE_LICENCE = {
    "data/standards/components/H3PO4.dat":
        "dHf_298 is taken FROM CRC (-1284.4 kJ/mol).  The file's own header "
        "names the primary (Wagman et al., NBS Tables 1982) and records that "
        "it gives -1279.0 -- a DIFFERENT number, so this is not a re-citation "
        "but a value change, and it moves a golden.  Needs Vitor.",
    "data/standards/components/methylAcetate.dat":
        "calls NIST WebBook / DIPPR-class compilations 'Primary data' -- the "
        "aggregator AS the authority, and no primary is named for Tc/Pc/omega/"
        "Tb/Hvap/dHf_298.  Either re-source from primaries or demote the "
        "record to data/local/.",
    "data/standards/parameters/NRTL/ethanol-water.dat":
        "'Curated from DECHEMA by V. Geraldes' over the VLE-IG bank -- direct "
        "transcription, the form the protocol names.  The bulk of the pair "
        "catalogue already moved to data/local/ in the legal scrub; this one "
        "survived and should follow.",
    "data/standards/parameters/SRK/N2-CH4.dat":
        "BORDERLINE, awaiting a ruling: cites Knapp, Doering, Oellrich, "
        "Ploecker & Prausnitz (1982) -- named authors of a published monograph "
        "that happens to appear in the DECHEMA series.  A named monograph is "
        "arguably a primary publication, not a databank transcription.  Ruled "
        "either way it should be explicit, not incidental.",
}

#  INVERTED_VALIDITY_WINDOWS -- REMOVED 2026-08-05, the waiver is discharged.
#
#  Six records declared `Trange (hi lo)` with hi <= lo and the engine merely
#  ANNOUNCED them.  The gap underneath was that a curator with no recoverable
#  window had no way to SAY so: omitting the key is indistinguishable from
#  never having considered it, so an impossible interval was the only available
#  signal.  `Trange unknown;` is that missing form.  All six declare it, and
#  `PolynomialCp` now REFUSES an inverted interval at construction.
#
#  Worth recording HOW this entry came out: it was not remembered.  The gate
#  stopped importing it, and `check_debt_registry`'s orphan arm failed the
#  build -- "a waiver nobody consults is not a waiver".  A registry that makes
#  a discharged waiver impossible to leave lying around is doing the job a
#  scattered pin list could not.

# ---------------------------------------------------------------------------
#  STRUCTURE
# ---------------------------------------------------------------------------

#  Upward subsystem edges (invariant I17).
#
#  EMPTY SINCE 2026-08-05, and that is the point: debts D1, D2, D4, D6 and D7
#  were paid, so `check_layering` ASSERTS I17 rather than bounding it.  Kept as
#  an empty set rather than deleted, because an empty waiver list is a claim --
#  "nothing is excused" -- and deleting it would leave that claim unstated.
LAYERING_UPWARD_EDGES = set()

#  Subsystem cycles (invariant I18).  ACCEPTED, not debt.
LAYERING_ACCEPTED_CYCLES = {
    frozenset(("solver", "thermo")):
        "Michelsen's stability test is a thermodynamic criterion solved "
        "numerically; `solver` and `thermo` genuinely need each other, and "
        "breaking the dependency would cost a worse abstraction than the "
        "cycle.  Ruling module-boundaries.md §7.3.  Listed rather than "
        "silently tolerated so the stale-pin arm still covers it: an "
        "acceptance that outlives its subject is a licence.",
}

# ---------------------------------------------------------------------------
#  RECORD SELF-CONSISTENCY
# ---------------------------------------------------------------------------

#  Components whose declared Tb disagrees with their OWN Antoine set by more
#  than 3 % in Psat(Tb), with Tb INSIDE the record's declared Trange
#  (2026-08-22 fresh-eyes audit; value = the observed deviation in %, sign
#  kept so a defect that MOVES is also a finding).
#  Why tolerated: deciding WHICH half of each record is wrong needs primary
#  literature -- unsourced must never become falsely sourced, so the values
#  stay until a curator opens the primaries.  Remedy: fix Tb or the Antoine
#  coefficients from a primary source and remove the pin (the stale-pin arm
#  in check_tb_antoine fails a pin that heals).  Blocker: literature access.
TB_ANTOINE_PINNED = {}   # emptied 2026-08-23: all 13 records fixed from
#  properly-licensed sources (Poling App. A / Landolt-Boernstein / curation
#  fits to McGarry and Perry curves); H2S's Tb was the wrong half there.

#  Records whose header contradicts the values they ship.
#
#  EMPTY SINCE 2026-08-05: NF270's contradiction was resolved by removing the
#  false KIND of claim (its cited datasheet publishes REJECTIONS, never
#  permeabilities) rather than by choosing between two numbers.  No value
#  moved, so no golden moved.
SELF_CONTRADICTING_RECORDS = {}


#  ---------------------------------------------------------------------------
#  STEADY CASES WHOSE STREAM CARRIES A PHASE LABEL THE ENGINE HAS DISPROVED
#  ---------------------------------------------------------------------------
#
#  The energy report prices each stream in the phase its state file declares
#  and CHECKS the label: a stream called liquid whose own Rachford-Rice
#  residual at (T, P, z) puts it above its bubble point cannot hold the name,
#  and the report says so -- naming the stream, the residual, and that the
#  enthalpy charged for it is "missing (or inventing) that phase change, which
#  is a residual of latent-heat size".  The check is not in question.
#
#  What is pinned here is that SEVEN shipped tutorials trigger it, five with a
#  real energy residual beside the label.  The corpus stayed green because the
#  finding is announced rather than refused, which is the right default for an
#  extrapolation and is doing more work than it should here: an extrapolated
#  Antoine is a qualified answer, while a stream priced in a phase it cannot
#  occupy is a wrong one, out by a latent heat.
#
#  WHY IT IS PINNED AND NOT FIXED.  Correcting a case means changing what it
#  DECLARES about its streams -- the `vaporFraction`/`phase` in 0/ -- which
#  changes published answers in five tutorials with recorded goldens.  That is
#  a curation decision about each case's physics and is Vitor's.  Refusing an
#  impossible label outright is a contract change with the same blast radius.
#
#  THE VALUE IS THE WORST ABSOLUTE ENERGY RESIDUAL, in kW, measured by
#  check_impossible_phase_pins from the run itself and never transcribed --
#  the first hand-taken version of this table was out by a factor of two on
#  two of the seven, in opposite directions, and the gate's own reader caught
#  it.  The gate fails if a case joins the list, leaves it, or gets worse.
#
#  REMEDY, per case: decide what the stream really is at its (T, P, z) and
#  declare it -- `vaporFraction`/`phase` in 0/ -- then re-record the golden.
#  BLOCKER: each is a thermodynamic judgement about that case, not a sweep.
IMPOSSIBLE_PHASE_CASES = {
    "phasechange01_partial_condenser":   898.64,
    "acetone03_luyben_reaction_section": 390.606,
    "combined01_brayton_rankine":        132.782,
    "stripper02_sour_water_h2s":          17.4804,
    "stripper01_sour_water":              12.7946,
    "tsa01_co2_twin_bed":                  0.023239,
    "flash10_ch4propane_pcsaft":           2.4e-05,
}


# ---------------------------------------------------------------------------
#  A STATED DEBT ABOUT THIS FILE ITSELF
# ---------------------------------------------------------------------------
#
#  The same external review asked for a second thing this file does NOT do: a
#  machine-readable declaration per gate (claim, scope, knownBlindSpots,
#  positiveWitness, negativeWitness, retirementCondition), so a maintainer need
#  not reverse-engineer policy from the scripts.
#
#  It is not built, and the reason is a measurement rather than reluctance:
#  there are NINETY `check_*` scripts, not the fifteen the review estimated.
#  Declaring all ninety in one pass would be mostly mechanical transcription
#  performed at speed, which is how a declaration comes to disagree with the
#  gate it describes -- the exact failure this project spent the day finding in
#  four hand-compiled counts.
#
#  The waivers came first because they are the part that DECAYS: a scope note
#  that drifts is misleading, but a waiver that outlives its violation silently
#  grants permission.
#
#  CONDITION FOR BUILDING IT: derive each declaration from the gate's own
#  output rather than transcribing its docstring -- every gate already prints
#  its claim, its coverage and its blind spots on the OK line, by convention
#  established across the 2026-08-05 slice.  A declaration generated from what
#  the gate SAYS AT RUNTIME cannot drift from it.
GATE_DECLARATIONS_DEBT = (
    "90 check_* scripts carry their contract in prose only; a machine-readable "
    "declaration should be DERIVED from each gate's own OK line, never "
    "transcribed from its docstring."
)

# ---------------------------------------------------------------------------
#  EDUTOOLS THAT ARE STILL INSTRUMENT PANELS
# ---------------------------------------------------------------------------

#  THE RULE (Vitor, 2026-08-28): an EduTool is a page you SCROLL, carrying the
#  explanation and the equations, with the interactive earned by the
#  paragraphs above it.  The Explorer is the other surface, and it is for
#  studies that only make sense once you have CHOSEN compounds and
#  compositions -- which is why the pellet has no business there.
#
#  A tool may legitimately live in BOTH: the flash is a study of a chosen pair
#  in the Explorer and a lesson about the operating line in EduTools.  What it
#  may not be is an instrument panel in EduTools, because a panel shows a
#  reader who already knows the method what it does, and teaches a reader who
#  does not exactly nothing.
#
#  These are the tools still built as MethodSetupRail panels: knobs down one
#  side, a drawing pinned into what height is left, and the provenance in
#  small grey type underneath.  Every number on them is correct.  None of them
#  teaches.
#
#  The list is expected to SHRINK to nothing.  check_edutool_form fails if a
#  name here has already been converted (a pin outliving its violation is a
#  licence) and if a tool NOT here is a panel (which is how a new one would
#  arrive built the old way).
#  TWO OF THESE ARE NOT FILES.  McCabeTool and PsychroTool are defined INLINE
#  in MethodsWorkspace.tsx, which is how they escaped the first version of
#  check_edutool_form entirely -- it globbed methods/*Tool.tsx and reported 16
#  tools while the registry declared 18.  They are keyed by the label the
#  registry-driven gate resolves them to, so a tool cannot hide by being
#  named differently or by having no file of its own.
EDUTOOL_STILL_A_PANEL = {
    "MethodsWorkspace.tsx::PsychroTool": "psychrometric chart",
    "BreakthroughTool.tsx":     "adsorption breakthrough",
    "ColumnControlTool.tsx":    "column control structure",
    "DryingCurveTool.tsx":      "batch tray drying",
    "EpsilonNtuTool.tsx":       "heat exchanger effectiveness-NTU",
    "FugShortcutTool.tsx":      "Fenske-Underwood-Gilliland",
    "KremserTool.tsx":          "absorption",
    "LevenspielTool.tsx":       "reactor sizing",
    "MerkelTool.tsx":           "cooling tower",
    "PinchCompositeTool.tsx":   "pinch composite curves",
    "PumpSystemTool.tsx":       "pump vs system curve",
    "RayleighTool.tsx":         "batch still",
    "TieTriangleTool.tsx":      "Hunter-Nash extraction",
    "VanHeerdenTool.tsx":       "ignition / extinction",
}

EDUTOOL_PANEL_DEBT = {
    "why": "These EduTools are built as MethodSetupRail instrument panels "
           "rather than as scrolling lessons: the knobs and the drawing are "
           "there, the explanation and the equations are not. A reader who "
           "does not already know the method leaves knowing that.",
    "remedy": "Convert each to the scrolling form the temperature, flash and "
              "Thiele tools now use: numbered steps carrying the equations, "
              "the interactive placed where the paragraphs have earned it, "
              "the limits block kept, and the step content held as DATA so a "
              "test can assert the argument still runs end to end.",
    "blocked": None,   # not blocked on anything -- it is work
}
