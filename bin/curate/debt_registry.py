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

#  Declared validity windows that are inverted or degenerate (hi <= lo).
#
#  Each is a CoolProp-derived liquid-Cp fit.  The remedy is to re-derive the
#  window from the regression that produced the coefficients -- a curation act,
#  not a code change.  Do NOT "fix" these by guessing a plausible interval:
#  a guessed window is a false claim about where a correlation is valid, which
#  is worse than an obviously broken one.
INVERTED_VALIDITY_WINDOWS = {
    "data/standards/components/neon.dat",
    "data/standards/components/krypton.dat",
    "data/standards/components/Xe.dat",
    "data/standards/components/D2.dat",
    "data/standards/components/OrthoDeuterium.dat",
    "data/standards/components/ParaDeuterium.dat",
}

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

#  Records whose header contradicts the values they ship.
#
#  EMPTY SINCE 2026-08-05: NF270's contradiction was resolved by removing the
#  false KIND of claim (its cited datasheet publishes REJECTIONS, never
#  permeabilities) rather than by choosing between two numbers.  No value
#  moved, so no golden moved.
SELF_CONTRADICTING_RECORDS = {}


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
