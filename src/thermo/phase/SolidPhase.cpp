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

#include "SolidPhase.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include <cmath>
#include <iostream>
#include "thermo/Component.H"

#include <stdexcept>

namespace Choupo {

SolidPhase::SolidPhase(const DictPtr& d,
                       const std::vector<std::string>& names,
                       const std::vector<Component>& comps)
:   name_(d->lookupWordOrDefault("name", "solid")),
    components_(&comps)
{
    const std::string m = d->lookupWordOrDefault("mode", "inert");
    if      (m == "inert")         mode_ = Mode::Inert;
    else if (m == "crystallizing") mode_ = Mode::Crystallizing;
    else throw std::runtime_error(
        "SolidPhase: unknown mode '" + m + "' (expected 'inert' or 'crystallizing')");

    if (mode_ != Mode::Crystallizing) return;

    //  WHICH component crystallises.  Refused rather than guessed: with one
    //  component it would be inferable, but a rule that works only for the
    //  simplest case teaches the wrong thing about what the phase IS.
    if (!d->found("component"))
        throw std::runtime_error("SolidPhase[crystallizing] '" + name_ +
            "': declare `component <name>;` -- a pure crystal is ONE"
            " component's solid, and the fugacity of every other component in"
            " it is zero, which is a claim rather than a default.");
    crystalName_ = d->lookupWord("component");
    bool found = false;
    for (std::size_t i = 0; i < names.size(); ++i)
        if (names[i] == crystalName_) { crystalIdx_ = i; found = true; break; }
    if (!found)
        throw std::runtime_error("SolidPhase[crystallizing] '" + name_ +
            "': component '" + crystalName_ + "' is not in this package.");
}

//  THE PURE-CRYSTAL REFERENCE FUGACITY -- the model the old refusal named.
//
//  For a pure solid in equilibrium with its own liquid,
//
//      f_solid(T) = f_pureLiquid(T) * exp(-dG_fus(T) / (R T))
//      dG_fus(T)  = dHfus (1 - T/Tfus)
//
//  and f_pureLiquid is Psat(T) -- the SAME reference LiquidPhase::fEffective
//  uses (gamma_i * Psat_i), reached by the same call, so the two phases cannot
//  drift onto different references.
//
//  Everything else follows from Kvec_phases without a line of new code:
//  K = f_solid/f_liquid = exp(-dG_fus/(RT)) / (gamma_w x_w), so K = 1 gives
//
//      ln a_w = -dG_fus(T) / (R T)
//
//  which IS freezing-point depression -- derived, not declared.  See
//  docs/design/ice-as-a-solid-phase-of-the-solvent.md.
sVector SolidPhase::fEffective(scalar T, scalar, const sVector& x) const
{
    if (mode_ == Mode::Inert)
        throw std::runtime_error(
            "SolidPhase[inert] '" + name_ + "': does not participate in "
            "phase equilibrium.  Inert solids are propagated as a phase of "
            "the Stream, but the flash must skip them.  This path will be "
            "implemented.");

    const Component& c = (*components_)[crystalIdx_];

    if (!(c.subHfus() > 0.0))
        throw std::runtime_error("SolidPhase[crystallizing] '" + name_ +
            "': component '" + crystalName_ + "' declares no enthalpy of"
            " fusion.  Add `sublimation { Hfus <J/mol>; }` to its record,"
            " with a citation -- the pure-crystal reference fugacity cannot"
            " be formed without it, and no value may be assumed.");
    if (!(c.subTripleT() > 0.0))
        throw std::runtime_error("SolidPhase[crystallizing] '" + name_ +
            "': component '" + crystalName_ + "' declares no fusion"
            " temperature.  Add `triplePoint { T <K>; }` to its record."
            "  (The triple point stands in for the melting point; they differ"
            " by 0.01 K for water and the record says so.)");
    if (!c.hasVaporPressure())
        throw std::runtime_error("SolidPhase[crystallizing] '" + name_ +
            "': component '" + crystalName_ + "' has no vapour-pressure"
            " model, so the liquid reference fugacity this is measured"
            " against does not exist.");

    const scalar Tfus  = c.subTripleT();
    const scalar dGfus = c.subHfus() * (1.0 - T / Tfus);

    //  Say what is NOT in dGfus, once, and quote the distance it depends on.
    //  A silently-omitted correction is indistinguishable from one nobody
    //  knew about; this is the same posture the psat window takes.
    if (!announcedNoDeltaCp_)
    {
        announcedNoDeltaCp_ = true;
        const scalar gap = std::fabs(T - Tfus);
        AdvisoryLog::instance().add(
            "thermo", "info", "solid phase '" + name_ + "'",
            "dG_fus uses dHfus alone; the liquid/solid heat-capacity term "
            "-dCp/R*((T-Tfus)/T + ln(Tfus/T)) is NOT modelled.  dHfus is "
            "measured at Tfus, so the approximation degrades with distance "
            "from it -- here |T - Tfus| = " + std::to_string(gap) + " K.");
        std::cerr << "  [solid] '" << name_ << "': dG_fus omits the "
                     "liquid/solid heat-capacity term (dHfus is measured AT "
                     "Tfus); |T - Tfus| = " << gap << " K here.  The crystal "
                     "is exact at Tfus and degrades away from it.\n";
    }

    sVector f(x.size(), 0.0);     // every other component: zero, by the
                                  // purity claim declared in the header
    f[crystalIdx_] = c.vp().Psat_Pa(T)
                   * std::exp(-dGfus / (constant::R * T));
    return f;
}

} // namespace Choupo
