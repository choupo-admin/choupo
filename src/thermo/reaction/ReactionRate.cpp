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

#include "ElementaryRate.H"
#include "ExpressionRate.H"
#include "RateLaw.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoPackage.H"
#include <cmath>
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

bool ReactionRate::netRateGradient(const ThermoPackage&, const RateState&,
                                   RateGradient&) const
{
    return false;     // no analytic derivative: the caller differences the law
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
    //  The CHEMKIN-style words: the batch vessel reads them natively, and
    //  (slice 3 of the CHEMKIN line) so do the cstr / pfr multi-reaction paths.
    auto elementary = [](const DictPtr& rxn, const ThermoPackage& thermo,
                         const std::string& who, const RateOffer& offer)
        -> std::unique_ptr<ReactionRate>
    {
        //  Detailed balance uses the IDEAL-GAS Kc.  On a reactor that forms
        //  its concentrations on a LIQUID basis that is wrong whenever the
        //  reaction changes the number of moles -- the defect C131 refused for
        //  Arrhenius/LHHW (Reaction::refuseLiquidBasisDetailedBalance, which
        //  returns early for these words).  Found in the commander's review
        //  of slice 3, 2026-11-19: refused here, where the basis is known.
        if (rxn->lookupWordOrDefault("reversible", "false") == "true"
            && offer.concentrationBasis.find("liquid basis") != std::string::npos)
        {
            scalar sumNu = 0.0;
            for (const auto& s : rxn->lookupDictList("stoichiometry"))
                sumNu += s->lookupScalar("nu");
            if (std::abs(sumNu) > 1.0e-12)
                throw std::runtime_error(who + ": `reversible true;` changes the"
                    " number of moles (sum of nu = " + std::to_string(sumNu) + ") on a"
                    " LIQUID concentration basis (" + offer.concentrationBasis + ").\n"
                    "    The Kc this engine derives is the ideal-gas one in kmol/m3;"
                    " the equilibrium the reverse leg would relax to is neither the"
                    " gas's nor the liquid's.  Run the reaction in the gas phase, or"
                    " write it irreversible (`=>`) with its reverse as a separate"
                    " reaction.");
        }
        return std::make_unique<ElementaryRate>(ElementaryRate::fromDict(rxn, thermo, who, offer));
    };
    registerType("modifiedArrhenius", elementary);
    registerType("thirdBody",         elementary);
    registerType("falloff",           elementary);
    registerType("plog",              elementary);
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
