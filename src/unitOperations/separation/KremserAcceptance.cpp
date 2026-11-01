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

#include "KremserAcceptance.H"

#include "thermo/ThermoPackage.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"

#include <algorithm>
#include <cstdio>
#include <string>

namespace Choupo {

namespace {

//  Round-off an upstream unit can hand over is carried through, never refused
//  (the same fraction the two solves used).
constexpr scalar kTraceFraction = 1.0e-12;

//  A component the cascade TRANSFERS: `role solute` AND a Henry pair against
//  the solvent -- both, as the solves classify.
bool transferred(const ThermoPackage& thermo, std::size_t i)
{
    const std::string& solv = thermo.solventName();
    return !solv.empty() && thermo.comp(i).role() == "solute"
        && HenrysLawRegistry::has(thermo.comp(i).name(), solv);
}

std::string pct(scalar z)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(100.0 * z));
    return std::string(b) + " mol%";
}

} // namespace

UnitAcceptance kremserAcceptance(bool absorber)
{
    const std::string unit = absorber ? "absorber" : "stripper";
    const int liquidPort = absorber ? 1 : 0;

    UnitAcceptance a;
    a.declared = true;

    // ---- Per-port phases ----------------------------------------------------
    UnitAcceptance::Port gas, liquid;
    gas.name = absorber ? "gas feed" : "stripping gas";
    gas.phases.liquid = false;
    gas.phases.vapour = true;
    gas.phases.why = "The Kremser cascade carries the gas as a vapour and takes"
        " its flow and heat capacity as such; a liquid fed to this port would be"
        " counted as gas.";
    gas.phases.remedy = "send the stream through a `flash` first and feed this"
        " port the vapour, or feed it to the liquid port if it is the liquid.";
    liquid.name = absorber ? "liquid wash" : "rich liquid";
    liquid.phases.liquid = true;
    liquid.phases.vapour = false;
    liquid.phases.why = "The Kremser cascade holds the solvent in the liquid"
        " (it never evaporates) and takes this stream's flow and heat capacity"
        " as a liquid's; a vapour fed to this port would be counted as liquid.";
    liquid.phases.remedy = "condense or cool the stream so it arrives liquid,"
        " or feed it to the gas port if it is the gas.";
    a.ports = absorber ? std::vector<UnitAcceptance::Port>{gas, liquid}
                       : std::vector<UnitAcceptance::Port>{liquid, gas};
    a.phases.liquid = true;
    a.phases.vapour = true;   // the default for a port not listed (none here)

    // ---- What the equations carry -------------------------------------------
    a.models.rule = UnitAcceptance::ModelsRule::everyComponent;
    a.models.sentence = absorber
        ? "the declared solvent (held in the liquid, never evaporated), every"
          " `role solute` component that has a Henry pair against it (moved"
          " between the phases by the Kremser cascade), and every other gas"
          " component as an insoluble carrier that leaves in the gas"
        : "the declared solvent (held in the liquid, never evaporated), every"
          " `role solute` component that has a Henry pair against it (stripped"
          " out of the liquid by the Kremser cascade), and every other gas"
          " component as an inert carrier that leaves in the gas";

    // ---- Refusal conditions -------------------------------------------------
    {
        UnitAcceptance::Condition c;
        c.id = "noSolvent";
        c.sentence = "The Kremser method here reads HENRY'S LAW, not the activity"
            " model -- a `gammaPhi` package with UNIFAC or NRTL carries no answer"
            " it can use -- and it needs a package that names a SOLVENT to tell"
            " which component washes and which is washed out.  With no solvent"
            " every component is inert, so the gas would leave unchanged and the"
            " liquid stream would vanish.";
        c.remedy = "declare the dilute-solution formulation: `equilibrium {"
            " formulation diluteSolution; liquid { solvent { component <name>;"
            " ... } solutes { ... } } }` (see tutorials/steady/absorption/"
            + unit + "01_NH3_water).";
        c.test = [](const AcceptanceInlet& in, const ThermoPackage& th)
            -> std::optional<std::string>
        {
            if (in.port > 0 || !th.solventName().empty()) return std::nullopt;
            return std::string("is handed to a package that names no SOLVENT");
        };
        a.refusesAlso.push_back(std::move(c));
    }
    {
        UnitAcceptance::Condition c;
        c.id = "noSolute";
        c.sentence = "A component transfers only when its record declares `role"
            " solute;` AND a Henry pair <component>-<solvent> exists.  With no"
            " such component there is nothing to transfer: the gas would leave"
            " unchanged and the liquid stream would vanish, which is an answer"
            " only in the sense that it is a number.";
        c.remedy = "declare the component a solute (`role solute;`) and curate"
            " its Henry pair against the solvent, or use another unit.";
        c.test = [](const AcceptanceInlet& in, const ThermoPackage& th)
            -> std::optional<std::string>
        {
            if (in.port > 0 || th.solventName().empty()) return std::nullopt;
            for (std::size_t i = 0; i < th.n(); ++i)
                if (transferred(th, i)) return std::nullopt;
            std::string present;
            for (std::size_t i = 0; i < th.n() && i < in.z.size(); ++i)
                if (in.z[i] > 1.0e-9 && th.comp(i).name() != th.solventName())
                    present += (present.empty() ? "" : ", ") + th.comp(i).name();
            return "carries not one component that is a SOLUTE this unit can"
                   " transfer into '" + th.solventName() + "' (present besides"
                   " the solvent: " + (present.empty() ? std::string("none")
                                                       : present) + ")";
        };
        a.refusesAlso.push_back(std::move(c));
    }
    {
        UnitAcceptance::Condition c;
        c.id = "soluteWithoutHenryPair";
        c.sentence = "A component is transferred only when its record declares"
            " `role solute;` AND a Henry pair against the solvent exists.  A"
            " solute with no pair is not transferred -- the cascade would carry"
            " it through as an inert, in silence, and report a gas it never"
            " washed (or a liquid it never stripped) at exit 0.";
        c.remedy = "curate the Henry pair <component>-<solvent> (a curation act,"
            " cited to its primary source), or change the component's role if"
            " it is meant to be an inert carrier.";
        c.test = [](const AcceptanceInlet& in, const ThermoPackage& th)
            -> std::optional<std::string>
        {
            if (th.solventName().empty()) return std::nullopt;
            std::string lost;
            for (std::size_t i = 0; i < th.n() && i < in.z.size(); ++i)
                if (in.z[i] > kTraceFraction && th.comp(i).role() == "solute"
                    && !transferred(th, i))
                    lost += "\n      '" + th.comp(i).name() + "' (" + pct(in.z[i])
                        + ") is `role solute` but has no Henry pair against '"
                        + th.solventName() + "'";
            if (lost.empty()) return std::nullopt;
            return "carries component(s) declared solutes that this unit cannot"
                   " transfer:" + lost;
        };
        a.refusesAlso.push_back(std::move(c));
    }
    {
        UnitAcceptance::Condition c;
        c.id = "nonSoluteInTheLiquid";
        c.sentence = "The cascade moves SOLUTES (`role solute;` with a Henry pair"
            " against the solvent) between the phases, holds the solvent in the"
            " liquid and every other component in the gas.  It has no rule for a"
            " non-solute that arrives in the LIQUID (absorbed, stripped or"
            " carried through are three different answers, and Kremser makes"
            " none of them), so that component would leave in neither outlet."
            "  A TRACE (below 1e-12 of the stream) is carried through.";
        c.remedy = "remove it from the liquid stream, declare it a solute with a"
            " Henry pair, or model the column rigorously (`distillationColumn`"
            " with `model simultaneous;`).";
        c.test = [liquidPort](const AcceptanceInlet& in, const ThermoPackage& th)
            -> std::optional<std::string>
        {
            if (in.port != liquidPort || th.solventName().empty())
                return std::nullopt;
            const std::size_t iSolv = th.indexOf(th.solventName());
            std::string bad;
            for (std::size_t i = 0; i < th.n() && i < in.z.size(); ++i)
                if (i != iSolv && in.z[i] > kTraceFraction
                    && !transferred(th, i) && th.comp(i).role() != "solute")
                    bad += "\n      '" + th.comp(i).name() + "' (" + pct(in.z[i])
                        + ") is neither the solvent '" + th.solventName()
                        + "' nor a solute this unit transfers";
            if (bad.empty()) return std::nullopt;
            return "carries component(s) with no route in the liquid:" + bad;
        };
        a.refusesAlso.push_back(std::move(c));
    }
    if (!absorber)
    {
        UnitAcceptance::Condition c;
        c.id = "solventInTheStrippingGas";
        c.sentence = "The cascade holds the solvent in the liquid and has no rule"
            " for solvent that arrives as VAPOUR (steam stripping, if the"
            " solvent is water): whether it condenses and pays the stripping"
            " heat or passes overhead is the solvent's own vapour-liquid"
            " equilibrium, which a Kremser cascade on Henry's law does not"
            " solve, so that solvent would leave in neither outlet.";
        c.remedy = "strip with a gas that carries no solvent, or model a steam"
            " stripper rigorously with `distillationColumn` (`model"
            " simultaneous;` -- see tutorials/steady/distillation/"
            "stripper01_sour_water).";
        c.test = [](const AcceptanceInlet& in, const ThermoPackage& th)
            -> std::optional<std::string>
        {
            if (in.port != 1 || th.solventName().empty()) return std::nullopt;
            const std::size_t iSolv = th.indexOf(th.solventName());
            if (iSolv >= in.z.size() || !(in.z[iSolv] > kTraceFraction))
                return std::nullopt;
            return "carries the SOLVENT '" + th.solventName() + "' ("
                   + pct(in.z[iSolv]) + ") as vapour";
        };
        a.refusesAlso.push_back(std::move(c));
    }
    return a;
}

} // namespace Choupo
