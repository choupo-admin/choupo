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
\*---------------------------------------------------------------------------*/

#include "ModelBoundaryLedger.H"
#include "BalanceMath.H"

#include "thermo/ChemistrySystem.H"
#include "thermo/Database.H"
#include "thermo/ThermoOverride.H"
#include "thermo/ThermoPackageBuilder.H"
#include "unitOperations/flash/StreamEquilibrium.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace reporting {

namespace {

//  A `thermo {}` fragment declares a WORLD only when it names a model.  The
//  predicate is the same one the engine applies, and it is written HERE
//  rather than reached for: an auditor that imports the auditee's private
//  helper inherits the auditee's blind spots along with them.
bool fragmentDeclaresWorld(const DictPtr& th)
{
    if (!th) return false;
    return th->found("equilibrium") || th->found("caloric")
        || th->found("volumetric") || th->found("transport")
        || th->found("pureFluids")
        || th->found("activityModel") || th->found("phases")
        || th->found("equationOfState") || th->found("propertyMethods")
        || th->found("chemistry");
}

//  Collect every INLINE unit declaration, namespaced exactly as the solver
//  flattens them (`sector.unit`).
//
//  What this deliberately does NOT do: follow a `units ( a b )` / `sectors
//  ( S )` WORD list.  Those are folder references whose world is resolved at
//  flatten time from disk, with an engine-injected `propertyContextBase`
//  that does not appear in any dict on disk.  The auditor cannot read that
//  declaration, so it does not claim to -- such a unit keeps status `none`
//  and, if it has an imbalance, keeps the RED alarm.  A named gap is worth
//  more than a guessed boundary.
void collectDeclarations(const DictPtr&                  node,
                         const std::string&              prefix,
                         std::map<std::string, DictPtr>& out,
                         std::map<std::string, int>&     count)
{
    if (!node || !node->hasDictList("units")) return;
    for (const auto& u : node->lookupDictList("units"))
    {
        const std::string name = prefix + u->lookupWordOrDefault("name", "?");
        ++count[name];
        if (u->found("thermo"))
        {
            DictPtr th;
            try { th = u->subDict("thermo"); }
            catch (const std::exception&) { th = nullptr; }
            if (fragmentDeclaresWorld(th)) out[name] = th;
        }
        //  An inline entry may itself be composite (a nested dict-list).
        if (u->hasDictList("units"))
            collectDeclarations(u, name + ".", out, count);
    }
}

//  Does the stream carry a species that SPECIATES between the two worlds?
//  Only then is an electrolyte<->molecular difference a real speciation
//  flip; a purely molecular stream shares the same reference in both.
bool carriesSpeciatingSpecies(const ProcessStream& s, const ThermoPackage& elec)
{
    for (std::size_t i = 0; i < elec.n(); ++i)
    {
        const bool present = (i < s.z.size() && s.z[i] > 1.0e-9)
                          || (i < s.s.size() && s.s[i] > 0.0);
        if (!present) continue;
        const Component& c = elec.comp(i);
        if (c.dissociation() > 1.5 || c.hasElectrolyteSpec()) return true;
    }
    return false;
}

bool anySolid(const FlashSolution& fs)
{
    for (const scalar v : fs.solidFlows) if (v > 0.0) return true;
    return false;
}

} // namespace

// ---------------------------------------------------------------------------

std::string describeThermoWorld(const DictPtr& d)
{
    if (!d) return "undeclared";
    std::string out;
    auto add = [&](const std::string& s)
    { if (!out.empty()) out += "|"; out += s; };

    //  A slot may be a sub-dict (`activityModel { model davies; }`) or a bare
    //  word (`activityModel pitzerHMW;`).  Both are declarations and both are
    //  named.
    auto modelIn = [&](const DictPtr& parent, const std::string& key,
                       const std::string& inner) -> std::string
    {
        if (!parent || !parent->found(key)) return "";
        try { return parent->subDict(key)->lookupWordOrDefault(inner, "<none>"); }
        catch (const std::exception&) { }
        return parent->lookupWordOrDefault(key, "<none>");
    };

    DictPtr eq;
    if (d->found("equilibrium"))
        try { eq = d->subDict("equilibrium"); } catch (const std::exception&) { }
    if (!eq) { add("formulation:<none declared>"); return out; }

    add("formulation:" + eq->lookupWordOrDefault("formulation", "<none>"));
    for (const char* phase : { "aqueous", "liquid", "organic" })
    {
        if (!eq->found(phase)) continue;
        DictPtr p;
        try { p = eq->subDict(phase); } catch (const std::exception&) { continue; }
        const std::string m = modelIn(p, "activityModel", "model");
        if (!m.empty()) add(std::string(phase) + ":" + m);
    }
    if (eq->found("vapour"))
    {
        DictPtr v;
        try { v = eq->subDict("vapour"); } catch (const std::exception&) { }
        if (v) add("vapour:" + v->lookupWordOrDefault("fugacityModel", "<none>"));
    }
    //  Commas would split the CSV cell this travels in.
    std::replace(out.begin(), out.end(), ',', ';');
    return out;
}

// ---------------------------------------------------------------------------

ModelBoundaryLedger::ModelBoundaryLedger(const DictPtr&         flowsheetDict,
                                         const ThermoPackage&   reportPackage,
                                         const DictPtr&         packageDict,
                                         const Database*        db,
                                         const ChemistrySystem* chem,
                                         const DictPtr&         solverDict,
                                         int                    verbosity)
:
    flowsheetDict_(flowsheetDict),
    reportPackage_(reportPackage),
    packageDict_(packageDict),
    db_(db),
    chem_(chem),
    verbosity_(verbosity)
{
    //  A closure is not an iteration.  Convergence.H's posture on a control
    //  a solver does not implement is REFUSAL, not silent acceptance.
    if (solverDict && solverDict->found("modelBoundaryClosure"))
    {
        const DictPtr b = solverDict->subDict("modelBoundaryClosure");
        if (b->found("maxIter"))
            throw std::runtime_error("solverDict: modelBoundaryClosure {"
                " maxIter ...; } -- a CLOSURE is not an iteration: nothing"
                " here iterates, so maxIter could not be honoured.  It is"
                " refused rather than ignored (solver/Convergence.H).  The"
                " controls this test implements are tolerance and relTol.");
    }
    //  THE DEFAULTS, and where they come from (see the header sec.5).
    //  `tolerance 1e-6` is a NORMALIZED residual: one part in a million of
    //  the energy the audited equations balance.  It is set against the
    //  criterion it GATES, not against any measurement -- the closure band
    //  this report already judges by is 0.5 % (5e-3), and a reproduction
    //  test that credits a step must be far tighter than the residual that
    //  step is allowed to explain, or it could certify a step the size of
    //  the anomaly.  1e-6 is 5000x tighter than that band.  For scale, and
    //  NOT as the reason for the choice: basis01's step reproduces its raw
    //  imbalance to a normalized 1.7e-10 (9.4e-9 kW out of 40 kW), so there
    //  are four decades of headroom above what the reference case achieves.
    //  `relTol 0` disables the reduction test (Convergence.H's convention).
    //  `maxIter` is not read -- and declaring it is refused above.
    solver::ConvergenceControls defaults;
    defaults.tolerance = 1.0e-6;
    defaults.relTol    = 0.0;
    controls_ = solver::readConvergenceControls(solverDict,
        "modelBoundaryClosure", defaults, defaulted_);

    collectDeclarations(flowsheetDict_, "", declared_, declarations_);
    reportWorld_ = describeThermoWorld(packageDict_);

    if (!declared_.empty() && (!db_ || !packageDict_))
        unavailable_ =
            "the auditor has no Database and/or no authored"
            " thermophysicalPropertySystem to assemble the unit's declared"
            " world from -- it will not borrow the package the unit built";
}

// ---------------------------------------------------------------------------

const ThermoPackage* ModelBoundaryLedger::worldOf(const std::string& unit,
                                                  std::string& reason,
                                                  std::string& describedAs)
{
    auto cached = built_.find(unit);
    if (cached != built_.end())
    {
        describedAs = builtName_[unit];
        return cached->second.get();
    }

    auto it = declared_.find(unit);
    if (it == declared_.end()) return nullptr;

    if (!unavailable_.empty()) { reason = unavailable_; return nullptr; }

    try
    {
        //  THE AUDITOR'S OWN ASSEMBLY.  The declaration GRAMMAR is shared on
        //  purpose (§3 of the header): reading the fragment differently from
        //  the engine would audit a different case.  Everything after it --
        //  the build, the components, the evaluation -- is the auditor's.
        DictPtr merged = mergeThermoOverride(packageDict_, it->second,
            "energyBalance model-boundary audit of unit '" + unit + "'");
        std::vector<std::string> gnames;
        gnames.reserve(reportPackage_.n());
        for (std::size_t i = 0; i < reportPackage_.n(); ++i)
            gnames.push_back(reportPackage_.comp(i).name());
        merged->insert("components", EntryValue(gnames));

        auto pkg = std::make_unique<ThermoPackage>(
            ThermoPackageBuilder::build(merged, *db_, chem_));
        describedAs        = describeThermoWorld(merged);
        builtName_[unit]   = describedAs;
        const ThermoPackage* ref = pkg.get();
        built_[unit]       = std::move(pkg);
        return ref;
    }
    catch (const std::exception& ex)
    {
        reason = std::string("the declared world could not be assembled"
                             " independently -- ") + ex.what();
        return nullptr;
    }
}

// ---------------------------------------------------------------------------

std::vector<EnergyClosureRecord> ModelBoundaryLedger::audit(
    const std::vector<ClosureInputs>& units)
{
    std::vector<EnergyClosureRecord> out;
    out.reserve(units.size());

    //  Indices of the entries that carry a computed step -- the residual
    //  system the ONE normalization runs over.
    std::vector<std::size_t> audited;
    sVector residual, terms;

    for (const auto& in : units)
    {
        EnergyClosureRecord e;
        e.unit         = in.unit;
        e.raw_kW       = in.dH_kW - in.items_kW;
        e.remaining_kW = e.raw_kW;          // until a step is CREDITED
        e.step_kW      = 0.0;
        e.magnitude    = 0.0;
        e.sign         = "0";
        e.upstreamWorld   = reportWorld_;
        e.downstreamWorld = "<none declared>";
        //  TWO DIFFERENT SILENCES, and the reader was shown only one
        //  (2026-08-24, the glass-box reading benchmark).  `declarations_`
        //  holds every unit this auditor could SEE inline.  A unit absent
        //  from it was reached through a folder / word reference, whose
        //  world resolves at flatten time from disk with an
        //  engine-injected context no dict on disk carries -- the reach
        //  this file's own header declines, deliberately.  Saying "no
        //  model boundary declared" there states as FACT something the
        //  auditor never looked at: esterification2sector's flash carries
        //  `thermo { equilibrium { liquid { activityModel NRTL } } }` in
        //  its own folder, and the row said none while an 808 kW
        //  latent-heat-sized residual stood under a red UNEXPLAINED alarm.
        //  A NAMED GAP IS WORTH MORE THAN A MISTAKEN CERTAINTY.
        e.rule = declarations_.count(in.unit)
               ? "no model boundary declared for this unit"
               : "UNREADABLE BY THIS AUDITOR: the unit was reached through a"
                 " folder/word reference, whose world is resolved at flatten"
                 " time from disk.  A per-unit `thermo {}` override may well"
                 " exist and is NOT credited here -- inline the unit's"
                 " declaration, or read its own flowsheetDict, before"
                 " concluding the residual is unexplained";

        //  NOTHING ABOVE OR BELOW THIS POINT LOOKS AT `raw_kW` TO DECIDE
        //  WHETHER A BOUNDARY EXISTS.  A boundary is a DECLARATION; an
        //  imbalance is a measurement; inferring the first from the second
        //  is exactly the coincidence the ruling forbids.
        const auto decl = declared_.find(in.unit);
        if (decl == declared_.end())
        {
            e.status = "none";
            out.push_back(std::move(e));
            continue;
        }

        auto dupIt = declarations_.find(in.unit);
        if (dupIt != declarations_.end() && dupIt->second > 1)
        {
            e.status = "ambiguous";
            e.reason = "more than one unit declaration answers to the name '"
                     + in.unit + "' -- the auditor will not choose between"
                       " them";
            e.rule   = "AMBIGUOUS -- no transition identified";
            out.push_back(std::move(e));
            continue;
        }

        std::string reason, described;
        const ThermoPackage* local = worldOf(in.unit, reason, described);
        if (!local)
        {
            e.status = "unavailable";
            e.reason = reason.empty()
                ? "the unit's declared world could not be reached"
                : reason;
            e.rule   = "UNAVAILABLE -- no independent evaluation possible";
            out.push_back(std::move(e));
            continue;
        }
        e.downstreamWorld = described;
        e.rule = "model boundary: hold (T;P;z) and let H step -- the unit"
                 " computes in its own declared world while the report"
                 " prices its streams in the case's world"
                 " (settled 2026-06-08; H is the conserved truth and T the"
                 " model-dependent readout)";

        //  ---- the step, evaluated INDEPENDENTLY --------------------------
        //  delta(s) = H_report(s) - H_local(s), both read with the SAME
        //  convention (`streamH_elements`), each in its own package, at the
        //  stream's own (T, P, z).  The unit's net step is what its outlets
        //  carry away minus what its inlets brought in:
        //      step = sum_out delta - sum_in delta
        //  which is algebraically (dH priced by the report) - (dH priced by
        //  the unit's world) -- so it must reproduce the raw imbalance of a
        //  unit whose declared duty IS its own world's dH.  That
        //  reproduction is CHECKED below; it is not assumed.
        scalar step = 0.0;
        std::ostringstream detail;
        bool refused = false;
        std::string refusal;

        auto crossing = [&](const ProcessStream* s, scalar sgn)
        {
            if (refused || !s) return;
            //  PROCESS streams only -- `dH` is over the process side and the
            //  step must be the same difference or it cannot reproduce it.
            //  A utility medium crossing the same boundary would carry its
            //  own step, and this omits it: no corpus case has both, and the
            //  omission FAILS SAFE, because a step that leaves the utility
            //  side out cannot reproduce the imbalance and is therefore not
            //  credited.  Named in the design record's gap list.
            if (!s->category.empty()) return;

            //  Doctrine refusal 1 -- SPECIATION flip.
            if (reportPackage_.hasElectrolyte() != local->hasElectrolyte())
            {
                const ThermoPackage& elec = reportPackage_.hasElectrolyte()
                    ? reportPackage_ : *local;
                if (carriesSpeciatingSpecies(*s, elec))
                {
                    refused = true;
                    refusal = "speciation flip on stream '" + s->name
                        + "' (electrolyte <-> molecular with a speciating"
                          " species present): the two worlds share no common"
                          " composition basis and a single dH would lie";
                    return;
                }
            }
            //  Doctrine refusal 2 -- DATUM flip.
            if (reportPackage_.pureFluidSelections().empty()
                != local->pureFluidSelections().empty())
            {
                refused = true;
                refusal = "datum flip on stream '" + s->name
                    + "' (pure-fluid <-> formation enthalpy reference): dH"
                      " would subtract two unrelated gauges";
                return;
            }
            //  Doctrine refusal 3 -- READABILITY.  See the header §4: a
            //  differing vapour FRACTION between two converged resolutions is
            //  the step itself, not a flip.  What is refused is one world
            //  resolving a two-phase state the other could not read at all,
            //  and a solid present in one world and absent in the other.
            std::string sinkA, sinkB;
            auto fa = flashState::equilibriumAt(s->T, s->P, s->z,
                s->phasePinned, s->vf, reportPackage_,
                "stream '" + s->name + "'", "modelBoundary", &sinkA);
            auto fb = flashState::equilibriumAt(s->T, s->P, s->z,
                s->phasePinned, s->vf, *local,
                "stream '" + s->name + "'", "modelBoundary", &sinkB);
            auto twoPhase = [](const std::optional<FlashSolution>& f)
            {
                return f && f->V_over_F > 1.0e-9 && f->V_over_F < 1.0 - 1.0e-9;
            };
            if (fa.has_value() != fb.has_value()
                && (twoPhase(fa) || twoPhase(fb)))
            {
                refused = true;
                refusal = "reading flip on stream '" + s->name + "': one world"
                    " resolved a two-phase equilibrium and the other could not"
                    " read the state at all -- the two enthalpies rest on"
                    " different readings and are not differenced";
                return;
            }
            if (fa && fb && anySolid(*fa) != anySolid(*fb))
            {
                refused = true;
                refusal = "phase-set flip on stream '" + s->name + "': a solid"
                    " phase is present in one world and absent in the other,"
                    " which changes the composition basis";
                return;
            }

            scalar dUp = 0.0, dDn = 0.0;
            try
            {
                dUp = streamH_elements(*s, reportPackage_);
                dDn = streamH_elements(*s, *local);
            }
            catch (const std::exception& ex)
            {
                refused = true;
                refusal = std::string("stream '") + s->name + "' could not be"
                    " priced on both sides of the boundary -- " + ex.what();
                return;
            }
            //  The CONTRIBUTION, signed -- not the direction and a magnitude.
            //  A per-stream breakdown whose entries do not add up to the
            //  total is a decoration; these do.
            const scalar contribution = sgn * (dUp - dDn);
            step += contribution;
            detail << (detail.tellp() > 0 ? ";" : "") << s->name << "="
                   << (contribution >= 0.0 ? "+" : "") << contribution;
        };

        for (const auto* s : in.ins)  crossing(s, -1.0);
        for (const auto* s : in.outs) crossing(s, +1.0);

        if (refused)
        {
            e.status = "refused";
            e.reason = refusal;
            e.rule   = "REFUSED by the model-boundary doctrine -- no step is"
                       " priced across this transition";
            out.push_back(std::move(e));
            continue;
        }

        e.step_kW      = step;
        e.magnitude    = std::abs(step);
        e.sign         = (step > 0.0) ? "+" : (step < 0.0 ? "-" : "0");
        e.remaining_kW = e.raw_kW - step;
        e.detail       = detail.str();
        e.status       = "pending";

        audited.push_back(out.size());
        residual.push_back(e.remaining_kW);
        terms.push_back(in.dH_kW);
        terms.push_back(in.items_kW);
        terms.push_back(step);

        out.push_back(std::move(e));
    }

    if (audited.empty()) return out;

    //  ---- THE VERDICT.  One normalization over the whole audited system
    //  (solver/Convergence.H §2), decomposed per unit.  `normInitial` is the
    //  same system BEFORE any step is credited, so `relTol` reads as "the
    //  declared step must reduce the imbalance by this factor".
    const auto norm = solver::normalizeResidual(residual, terms);
    sVector rawResidual;
    for (const std::size_t k : audited) rawResidual.push_back(out[k].raw_kW);
    const auto norm0 = solver::normalizeResidual(rawResidual, terms);

    for (const std::size_t k : audited)
    {
        EnergyClosureRecord& e = out[k];
        const scalar rk = std::abs(e.remaining_kW);
        e.normResidual = norm.degenerate ? rk : rk / norm.normFactor;

        std::string criterion;
        const bool ok = solver::convergedNow(controls_,
            norm0.degenerate ? norm0.rawL1 : norm0.normalized,
            e.normResidual, rk, norm.degenerate, criterion);
        e.criterion = criterion.empty()
            ? std::string("the remaining residual met neither test"
                          " (tolerance nor relTol) -- NOT reproduced")
            : criterion;
        if (ok)
        {
            e.status = "accounted";
        }
        else
        {
            e.status = "unconfirmed";
            e.reason = "the independently computed step does NOT reproduce"
                       " the raw imbalance: " + std::to_string(e.remaining_kW)
                     + " kW remains, which fails the declared criteria"
                       " (modelBoundaryClosure).  The step is NOT credited";
            //  NOT CREDITED: (c) goes back to (a).  The step stays printed --
            //  the reader must see the number that failed -- but it buys the
            //  unit nothing.
            e.remaining_kW = e.raw_kW;
        }
    }

    //  Announced in the run, because a default that is never printed is
    //  indistinguishable from a number nobody chose.  `describe()` is NOT
    //  used: it prints maxIter, and printing a control this test refuses to
    //  accept would advertise a knob that does not exist.
    if (verbosity_ >= 2)
    {
        //  Its OWN stream: `std::cout` arrives here carrying whatever
        //  fixed/precision the report last set on it, and a tolerance of
        //  1e-6 printed as "0.0000" is a control nobody can read.
        std::ostringstream os;
        os << "  [convergence] modelBoundaryClosure: "
           << (defaulted_ ? "DEFAULT" : "declared")
           << " controls -- tolerance " << controls_.tolerance
           << ", relTol " << controls_.relTol
           << (defaulted_
                 ? " (none declared in system/solverDict; documented"
                   " in reporting/ModelBoundaryLedger.H sec.5)"
                 : " (system/solverDict)");
        std::cout << os.str() << "\n";
    }
    return out;
}

} // namespace reporting
} // namespace Choupo
