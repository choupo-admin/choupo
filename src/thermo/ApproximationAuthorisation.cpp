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

#include "thermo/ApproximationAuthorisation.H"
#include "core/Advisory.H"
#include "core/ProblemDivergence.H"

#include <iostream>
#include <set>
#include <stdexcept>

namespace Choupo {

void resolveIdealPairSubstitution(const std::string& model,
                                  const std::vector<std::string>& idealDefaulted)
{
    if (idealDefaulted.empty()) return;

    const auto& auth = ApproximationAuthorisation::instance();

    //  (1) REFUSE what nobody authorised.  Gated on wasRead(): on a path
    //  where no case-level block was ever read, "authorises nothing" and
    //  "nobody looked" are the same silence, and refusing on the second
    //  produces a refusal the author cannot escape.
    std::vector<std::string> unauthorised;
    if (auth.wasRead())
        for (const auto& pr : idealDefaulted)
        {
            const auto dash = pr.find('-');
            if (!auth.authorisesIdealPair(pr.substr(0, dash),
                                          pr.substr(dash + 1)))
                unauthorised.push_back(pr);
        }

    if (!unauthorised.empty())
    {
        std::string list, block;
        for (std::size_t k = 0; k < unauthorised.size(); ++k)
        {
            list  += (k ? ", " : "") + unauthorised[k];
            block += (k ? " "  : "") + unauthorised[k];
        }
        throw std::runtime_error(model + ": the case declares " + model
            + ", but " + std::to_string(unauthorised.size()) + " binary"
            " pair(s) have no parameters and would therefore run as IDEAL: "
            + list + ".\n"
            "        That is a DIFFERENT MODEL from the one requested.  It is"
            " refused rather than announced-and-applied, because the problem"
            " solved would not be the problem posed.\n"
            "        Four legitimate paths, all of which exist today:\n"
            "          * add the parameter record(s) under constant/parameters/"
            + model + "/ (or the sealed snapshot);\n"
            "          * fit them from experimental data -- fitParameters,"
            " residual kind T_bubble (tutorials/props/curation/);\n"
            "          * declare a PREDICTIVE model that needs no pair"
            " (UNIFAC), if every component carries group decompositions;\n"
            "          * or AUTHORISE the approximation, which then runs and"
            " is recorded as a declared divergence:\n"
            "                approximations { idealBinaryPair { pairs ( "
            + block + " ); reason \"...\"; } }");
    }

    //  (2) RECORD what survived.  It runs because the author accepted it, and
    //  it rides the RESULT, not only the log -- that is the whole point of the
    //  divergence channel.
    //
    //  THE NotRead CASE IS ANNOUNCED AS A DEFECT, NOT ABSORBED AS A REASON.
    //  Reaching here with wasRead() false means the contract was NOT enforced
    //  on this path: the substitution ran unexamined.  Sabotage S1 of
    //  check_problem_divergence (2026-08-11) forced the branch on and NOTHING
    //  CHANGED -- every probe still passed -- which is the signature of a
    //  degradation nobody can see.  No known construction path reaches it
    //  today (the ONE parse sits at `buildV2Dispatch`, which every v2
    //  formulation passes through), so if it ever fires, the interesting fact
    //  is not the approximation: it is that a new path bypassed the parse.
    //  It says so, loudly, and the gate asserts no witness produces it.
    const bool unexamined = !auth.wasRead();
    if (unexamined)
        std::cout << "  [divergence] " << model << ": the case-level"
                     " `approximations` block was NEVER READ on this"
                     " construction path, so the ideal substitution below"
                     " could not be checked against it.  The run continues"
                     " and records it -- but this is a DEFECT in the"
                     " construction order, not an authorised approximation."
                     "  Please report it.\n";
    for (const auto& pr : idealDefaulted)
        ProblemDivergence::instance().add("substitution", model + " pair " + pr,
            model, "ideal (no parameters)",
            unexamined ? std::string("UNEXAMINED -- the case's authorisation"
                                     " was never read on this construction"
                                     " path (engine defect, not an authored"
                                     " choice)")
                       : auth.reason());

    //  (3) ANNOUNCE.  Gated on the AdvisoryLog dedup: an activity model is
    //  constructed more than once per thermo build (the liquid Phase + the
    //  legacy activity_ pointer), so without this the SAME warning prints
    //  twice and reads like a bug.
    std::string list;
    for (std::size_t k = 0; k < idealDefaulted.size(); ++k)
        list += (k ? ", " : "") + idealDefaulted[k];
    const bool isNew = AdvisoryLog::instance().add("thermo", "warning", model,
        std::to_string(idealDefaulted.size())
        + " binary pair(s) defaulted to ideal (no parameters): " + list
        + " -- fit or add them to constrain these interactions");
    if (isNew)
        std::cout << "  [thermo] " << model << ": " << idealDefaulted.size()
                  << " binary pair(s) have no parameters -> defaulted to"
                     " IDEAL: " << list
                  << "  (fit or add them to constrain these interactions)\n";
}

//  ---- a component the activity model cannot price -----------------------
std::set<std::string>
resolveGrouplessComponents(const std::string& model,
                           const std::vector<std::string>& groupless)
{
    std::set<std::string> authorised;
    if (groupless.empty()) return authorised;

    const auto& auth = ApproximationAuthorisation::instance();

    //  (1) REFUSE what nobody authorised.  Gated on wasRead() for the same
    //  reason as the pair substitution: where no case-level block was ever
    //  read, "authorises nothing" and "nobody looked" are the same silence.
    std::vector<std::string> unauthorised;
    for (const auto& c : groupless)
    {
        if (auth.wasRead() && auth.authorisesOutsideActivity(c))
            authorised.insert(c);
        else
            unauthorised.push_back(c);
    }

    if (!unauthorised.empty())
    {
        std::string list, block;
        for (std::size_t k = 0; k < unauthorised.size(); ++k)
        {
            list  += (k ? ", " : "") + unauthorised[k];
            block += (k ? " "  : "") + unauthorised[k];
        }
        throw std::runtime_error(model + ": component(s) " + list
            + " have no group decomposition, so " + model + " cannot price"
            " them.\n"
            "        Running them at gamma = 1 anyway would turn a"
            " group-contribution model into \"ideal for whoever lacks data\","
            " which is a DIFFERENT MODEL from the one requested.\n"
            "        Three legitimate paths:\n"
            "          * add `groups { unifac ( ... ); }` to the component's"
            " .dat, IF a decomposition exists -- for a permanent gas such as"
            " H2 none does, and inventing one is fabrication;\n"
            "          * drop the component from the package, or give the"
            " unit its own `thermo {}` world without it;\n"
            "          * or AUTHORISE the approximation, which then runs and"
            " is recorded as a declared divergence:\n"
            "                approximations { componentOutsideActivityModel {"
            " components ( " + block + " ); reason \"...\"; } }");
    }

    //  (2) RECORD what survived, on the RESULT and not only in the log.
    const bool unexamined = !auth.wasRead();
    for (const auto& c : authorised)
        ProblemDivergence::instance().add("substitution",
            model + " component " + c,
            model, "outside the activity model (gamma = 1)",
            unexamined ? std::string("UNEXAMINED -- the case's authorisation"
                                     " was never read on this construction"
                                     " path (engine defect, not an authored"
                                     " choice)")
                       : auth.reasonOutside());

    //  (3) ANNOUNCE, and say what gamma = 1 does NOT establish.  This is the
    //  half a bare "defaulted to ideal" line would leave out: for a
    //  supercritical permanent gas the LIQUID-side reference is a vapour
    //  pressure extrapolated far above its own critical temperature, which
    //  the validity channel already flags as "not a vapour pressure".  Such a
    //  component can come out of the flash on the right side for the wrong
    //  reason, and a case relying on it should know that is what it bought.
    if (!authorised.empty())
    {
        std::string list;
        for (const auto& c : authorised) list += (list.empty() ? "" : ", ") + c;
        const bool isNew = AdvisoryLog::instance().add("thermo", "warning",
            model, std::to_string(authorised.size())
            + " component(s) run OUTSIDE the activity model at gamma = 1"
              " (authorised): " + list
            + " -- gamma = 1 is not a solubility model; if the component is"
              " supercritical its liquid reference is an extrapolated"
              " pseudo-Psat, so its phase split may be right for the wrong"
              " reason");
        if (isNew)
            std::cout << "  [thermo] " << model << ": " << authorised.size()
                      << " authorised component(s) OUTSIDE the activity model"
                         " (gamma = 1): " << list
                      << "  -- recorded as a declared divergence\n";
    }
    return authorised;
}

}   // namespace Choupo
