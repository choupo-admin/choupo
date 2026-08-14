/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    src/reporting/ModelBoundaryLedger.H

Description
    THE MODEL-BOUNDARY LEDGER -- explain and classify the imbalance, never
    erase it.  Ruled by Vítor 2026-08-09; the architecture it serves was
    settled 2026-06-08 (forum 5/5) and is NOT reopened here.

    ---------------------------------------------------------------------
    1.  THE PROBLEM, MEASURED
    ---------------------------------------------------------------------

    `tutorials/steady/thermo/basis01_two_unit_chain` runs a heater that
    carries a per-unit `thermo {}` override.  The unit solves its outlet in
    ITS OWN declared world: 40 kW of duty buys 17.66 K there.  The energy
    report prices every stream in the CASE's package, and reads the same
    two streams 37.0149 kW apart.  The 2.985 kW difference was charged to
    the unit and labelled "an UNEXPLAINED first-law residual", raising the
    RED conservation alarm.

    The energy is not missing.  It is the ENTHALPY STEP at a model
    boundary, and the settled architecture says exactly what that is:

        H is the conserved truth; T is the model-dependent readout.

    A model boundary is not a physical device, so there is no real dT to
    absorb.  Choupo holds (T, P, z) across it and lets H STEP, and the
    discontinuity must be VISIBLE.  What was missing was not the physics --
    it was the ACCOUNTING: a ledger that names the step, prices it, and
    subtracts it from the imbalance in the open.

    ---------------------------------------------------------------------
    2.  THREE QUANTITIES, NEVER COLLAPSED
    ---------------------------------------------------------------------

        (a) raw_kW        the RAW physical imbalance, before any
                          model-boundary accounting.  It is what the report
                          measured and it stays on every surface that shows
                          it today -- dH_kW, energy_items_kW and
                          energy_closure_pct are all unchanged.
        (b) step_kW       the explicitly declared enthalpy step attributed
                          to the identified model transition.
        (c) remaining_kW  what is STILL unexplained: (a) - (b).

    The closure verdict is taken on (c).  (a) is never overwritten by (c),
    and (b) is never folded into either: a number that explains an anomaly
    must be readable APART from the anomaly, or the next reader cannot
    check the explanation.

    ---------------------------------------------------------------------
    3.  INDEPENDENCE -- the load-bearing constraint
    ---------------------------------------------------------------------

    "Do not let the reporting path share the same derivation as the model
    transition it is auditing."

    So this ledger does NOT accept a dH computed by the unit, and it does
    NOT call `Flowsheet::thermoFor`.  It reads the unit's `thermo {}` block
    out of the flowsheetDict ITSELF, merges it onto the case's authored
    system with the shared override grammar, assembles the result through
    the public `ThermoPackageBuilder`, evaluates the enthalpy of the SAME
    streams at the SAME (T, P, z) in both packages, and then CHECKS that
    its own step reproduces the raw imbalance the report measured.  If it
    does not, nothing is credited and the alarm stays.

    THIS DUPLICATES THE ASSEMBLY THE FLOWSHEET ALREADY DID, DELIBERATELY,
    AND IN FULL KNOWLEDGE OF THE ARITY DOCTRINE.  The doctrine forbids two
    homes for one FACT.  An audit is not a second home for a fact: it is a
    second, independent derivation of a claim, whose whole value is that it
    can DISAGREE.  An auditor that reuses the auditee's arithmetic checks
    nothing -- it re-prints it.  The one thing that is deliberately SHARED
    is the DECLARATION grammar (`mergeThermoOverride`): the auditor must
    read the same declaration the engine read, or it would be auditing a
    different case.  Grammar shared, arithmetic separate.

    ---------------------------------------------------------------------
    4.  WHEN THE RED ALARM STAYS
    ---------------------------------------------------------------------

    A step is credited ONLY when every one of these holds; otherwise the
    entry keeps (c) == (a), the alarm fires, and the entry says which of
    them failed.

      * DECLARED.  The unit carries a `thermo {}` block naming a world, in
        the flowsheetDict, where the auditor can read it.  A boundary is
        never INFERRED FROM COINCIDENT NUMBERS -- the size of an imbalance
        is not evidence of its cause, and no code path here looks at (a)
        before deciding whether a boundary exists.
      * UNAMBIGUOUS.  Exactly one declaration answers to the unit's name.
      * PRICEABLE.  Not a speciation flip (electrolyte <-> molecular with a
        speciating species actually present) and not a datum flip
        (pure-fluid <-> formation reference).  Those are the doctrine's
        existing hard refusals: across them the two worlds share no common
        reference and a single dH would lie.
      * READABLE.  Both worlds resolved the stream.  If one world's
        equilibrium converged and the other's did not, the two enthalpies
        rest on different readings and are not differenced.
        A DIFFERING VAPOUR FRACTION BETWEEN TWO CONVERGED VL RESOLUTIONS IS
        NOT A FLIP.  It is the step itself -- the whole quantity this
        ledger exists to publish -- and refusing it would make the feature
        vacuous for the only case it was ruled for.  What IS refused is a
        change in the phase SET that changes the composition basis: a solid
        present in one world and absent in the other.
      * REPRODUCED.  (c) satisfies the declared convergence criteria (§5).

    ---------------------------------------------------------------------
    5.  THE CRITERION, AND WHERE IT IS AN HONEST ADAPTATION
    ---------------------------------------------------------------------

    The reproduction test uses `solver/Convergence.H` -- the project's ONE
    normalized-residual contract -- and invents neither a second tolerance
    nor a second normalization.  Controls come from

        system/solverDict:  modelBoundaryClosure { tolerance ...; relTol ...; }

    and the residual system is one equation per AUDITED unit:

        r_k     = dH_k - items_k - step_k            ( == remaining_kW )
        terms_k = { dH_k , items_k , step_k }

    which is the caller's contract of Convergence.H §2(c): the terms
    combine, with the signs the equation gives them, into exactly r_k.

    TWO DEVIATIONS, STATED HERE RATHER THAN DISCOVERED LATER.

    (i)  THREE TERMS, NOT TWO.  The obvious pair {dH, items + step}
         degenerates by Convergence.H's own §2(b) -- with one equation and
         two terms the spread IS the residual -- which would force the
         verdict onto a RAW kW residual against a tolerance whose
         documented default (1e-12) is meaningless for an energy balance.
         Handing over the three quantities the equation actually balances
         is both closer to the equation as written and non-degenerate.  The
         degenerate branch is still honoured where it genuinely occurs (a
         unit whose three terms are all zero), and it then says so.

    (ii) THE CLOSURE BAND IS NOT RETRO-JUDGED.  A unit with NO declared
         boundary keeps the report's pre-existing verdict exactly -- the
         `energyBandPct` closure band, unchanged, on a residual that is
         unchanged because its step is 0.  The normalized criterion governs
         the NEW claim it was ruled for (a credited step) and is not
         silently applied to several hundred existing cases under a
         tolerance nobody chose for them.  Two claims, two criteria, one
         home each, and the CSV names which one decided every row.

    `maxIter` is part of the OpenFOAM triple but a closure is not an
    iteration.  Declaring it in this block is REFUSED by name rather than
    ignored, which is Convergence.H's own posture on a control a solver
    does not implement.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "core/Types.H"
#include "solver/Convergence.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Database;
struct ChemistrySystem;

namespace reporting {

// The per-unit energy figures the auditor needs to state its equation.
// Supplied by the caller (the energy balance report) -- the auditor never
// asks the UNIT for them.
struct ClosureInputs
{
    std::string                        unit;
    scalar                             dH_kW    = 0.0;   // report's process dH
    scalar                             items_kW = 0.0;   // declared energy items
    std::vector<const ProcessStream*>  ins;
    std::vector<const ProcessStream*>  outs;
};

class ModelBoundaryLedger
{
public:
    //  `reportPackage` is the package the REPORT priced the streams in (the
    //  case's global world).  `packageDict` is the case's AUTHORED system --
    //  the base a per-unit fragment merges onto -- and `db` the record home.
    //  Without those two the auditor cannot assemble anything and says so
    //  (`unavailable`) instead of guessing.
    ModelBoundaryLedger(const DictPtr&         flowsheetDict,
                        const ThermoPackage&   reportPackage,
                        const DictPtr&         packageDict,
                        const Database*        db,
                        const ChemistrySystem* chem,
                        const DictPtr&         solverDict,
                        int                    verbosity);

    //  Audit every unit at once: the verdict needs ONE normalization over
    //  the whole residual system (Convergence.H §2), so the entries cannot
    //  be decided one at a time.  Returns one record per input unit, in
    //  order.
    std::vector<EnergyClosureRecord> audit(
        const std::vector<ClosureInputs>& units);

    //  The controls in force, for the run to announce.
    const solver::ConvergenceControls& controls() const { return controls_; }
    bool controlsDefaulted() const { return defaulted_; }

private:
    //  Assemble the unit's DECLARED world, independently.  Cached per unit;
    //  null when the unit declares none.  Throws nothing -- a failure to
    //  assemble becomes a `reason` on the entry.
    const ThermoPackage* worldOf(const std::string& unit, std::string& reason,
                                 std::string& describedAs);

    DictPtr                flowsheetDict_;
    const ThermoPackage&   reportPackage_;
    DictPtr                packageDict_;
    const Database*        db_   = nullptr;
    const ChemistrySystem* chem_ = nullptr;
    int                    verbosity_ = 3;

    std::string                             reportWorld_;   // described
    std::map<std::string, DictPtr>          declared_;      // unit -> thermo{}
    std::map<std::string, int>              declarations_;  // unit -> count
    std::map<std::string, std::unique_ptr<ThermoPackage>> built_;
    std::map<std::string, std::string>      builtName_;

    solver::ConvergenceControls controls_;
    bool                        defaulted_ = true;
    std::string                 unavailable_;   // non-empty -> cannot audit
};

//  Name a thermo world BY ITS DECLARED MODELS, from the system dict the
//  builder was handed -- never from a runtime object's class names.  A
//  ledger entry has to identify both sides of the boundary, and the side a
//  reader can check is the one the case declares.  Contains no comma (it
//  travels in a CSV cell).
std::string describeThermoWorld(const DictPtr& systemDict);

} // namespace reporting
} // namespace Choupo
