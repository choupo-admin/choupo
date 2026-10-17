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

#include "ReactionRate.H"

#include "ExpressionRate.H"
#include "RateLaw.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoPackage.H"
#include <map>
#include <stdexcept>
#include <memory>
namespace Choupo {

std::map<std::string, ReactionRate::Factory>& ReactionRate::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void ReactionRate::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

bool ReactionRate::isRegistered(const std::string& name)
{
    return registry().count(name) != 0;
}

std::vector<std::string> ReactionRate::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

std::unique_ptr<ReactionRate> ReactionRate::New(const DictPtr&       rxn,
                                                const ThermoPackage& thermo,
                                                const std::string&   who,
                                                const RateOffer&     offer)
{
    const std::string word = rxn->subDict("kinetics")->lookupWord("type");
    auto it = registry().find(word);
    if (it == registry().end())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "rate law (kinetics.type)", word, availableTypes(), "Registered")
            + "  A law of your own may be written in the dict (`type"
              " expression;`), or registered from the case's `code/` folder"
              " (local only -- the site cannot compile it).");
    return it->second(rxn, thermo, who, offer);
}

scalar ReactionRate::rateConstant(const ThermoPackage&, const RateState&) const
{
    throw std::runtime_error("rate law '" + typeName() + "' declares no rate"
        " constant to report.");
}

void ReactionRate::checkLoading(bool reactorHasLoading, const std::string& who) const
{
    const std::string b = declaredBasis();
    if (b == "reactorVolume" && reactorHasLoading)
        throw std::runtime_error(who + ": the law declares `basis reactorVolume`"
            " -- its value is ALREADY per cubic metre of reactor -- and the"
            " reactor declares `catalystLoading`, which would multiply it by a"
            " bed density a second time.  Remove `catalystLoading`, or declare"
            " the law `basis catalystMass`.");
    if (b == "catalystMass" && !reactorHasLoading)
        throw std::runtime_error(who + ": the law declares `basis catalystMass`"
            " -- its value is per kilogram of catalyst -- and the reactor"
            " declares no `catalystLoading` (kg of catalyst per m3 of reactor)"
            " to convert it.  Declare the loading; none is assumed.");
}

//  THE BUILT-INS, registered explicitly (CLAUDE.md §5: no static
//  self-registration).  Each main that builds a reactor calls this BEFORE
//  `registerUserTypes()`, so a case's `code/` may add a law beside them.
void ReactionRate::registerBuiltins()
{
    auto powerLaw = [](const DictPtr& rxn, const ThermoPackage& thermo,
                       const std::string& who, const RateOffer&)
        -> std::unique_ptr<ReactionRate>
    {
        return std::make_unique<RateLaw>(RateLaw::fromDict(rxn, thermo, who));
    };
    registerType("Arrhenius", powerLaw);
    registerType("LHHW",      powerLaw);
    registerType("expression",
        [](const DictPtr& rxn, const ThermoPackage& thermo,
           const std::string& who, const RateOffer& offer)
            -> std::unique_ptr<ReactionRate>
        {
            std::vector<std::string> comps;
            for (std::size_t i = 0; i < thermo.n(); ++i)
                comps.push_back(thermo.comp(i).name());
            return std::make_unique<ExpressionRate>(rxn, comps, who, offer);
        });
}

} // namespace Choupo
