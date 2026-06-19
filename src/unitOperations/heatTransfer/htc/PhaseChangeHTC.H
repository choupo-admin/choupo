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
Class
    Choupo::PhaseChangeHTC

Description
    Selectable PHASE-CHANGE heat-transfer-coefficient correlation -- the
    sibling factory of HeatTransferCorrelation (which is single-phase,
    convective Nu = f(Re, Pr)).  A phase-change h is governed by the LATENT
    heat and the condensate / vapour film, not by a bulk Reynolds number, so
    it carries a DIFFERENT context (saturated-liquid & -vapour properties,
    the latent heat h_fg, the film temperature difference dT_film) and a
    different result struct.  Kept a SEPARATE factory -- not shoehorned into
    HeatTransferCorrelation -- so that v2 (pool / flow boiling, Rohsenow /
    Chen) is purely additive against this base.

    v1 is FILM CONDENSATION ONLY (Nusselt 1916).  Pool / flow boiling is
    deferred to its own forum -- the boiling parameters sigma (surface
    tension) and C_sf / n_exp (Rohsenow surface-fluid constant) are PRESENT
    but UNUSED in this context so that adding them later is additive and
    breaks nothing.

    Built-in:

        NusseltFilm  --  laminar film condensation on a vertical plate /
                         vertical tube (coefficient 0.943) or a single
                         horizontal tube (coefficient 0.729):

            h_bar = C * [ k_l^3 rho_l (rho_l - rho_v) g h_fg' /
                          (mu_l L dT_film) ]^(1/4)

            h_fg' = h_fg + 0.68 cp_l dT_film    (Rohsenow subcooling
                                                 correction; Incropera eq.)

        References (public domain / textbook):
          * Nusselt, W. (1916) "Die Oberflaechenkondensation des
            Wasserdampfes", Z. Ver. Dt. Ing. 60, 541-575 -- the film theory.
          * Incropera & DeWitt, Fundamentals of Heat and Mass Transfer
            (Ch. 10): Example 10.3 (vertical plate) + Example 10.4
            (horizontal tube) -- the numeric anchors for verify().

    Film properties (rho_l, lambda_l, mu_l, cp_l) are evaluated by the CALLER
    at the film temperature T_f = (Tsat + T_wall)/2 and passed in; h_fg is at
    Tsat.  rho_v is the saturated-vapour density at Tsat.  This base only
    arithmetises the correlation -- it never touches the thermo package.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

// Saturated-film state at one condensing surface.  All properties pre-evaluated
// by the caller (rho_l/lambda_l/mu_l/cp_l at the film temperature T_f, h_fg and
// rho_v at Tsat) -- the correlation is pure arithmetic on these.
struct PhaseChangeContext
{
    scalar rho_l    = 0.0;     // saturated-liquid density        [kg/m^3]
    scalar rho_v    = 0.0;     // saturated-vapour density        [kg/m^3]
    scalar lambda_l = 0.0;     // liquid thermal conductivity     [W/(m.K)]
    scalar mu_l     = 0.0;     // liquid dynamic viscosity        [Pa.s]
    scalar cp_l     = 0.0;     // liquid MASS heat capacity       [J/(kg.K)]
    scalar h_fg     = 0.0;     // latent heat of vaporisation     [J/kg]
    scalar sigma    = 0.0;     // surface tension [N/m] -- UNUSED in v1 (boiling)
    scalar dT_film  = 0.0;     // CONDENSATION driving dT: Tsat - T_wall    [K]
    scalar dT_excess = 0.0;    // BOILING wall superheat: T_surface - Tsat  [K]
                               //  (a SEPARATE field -- never reuse dT_film:
                               //   condensation sub-cools, boiling super-heats)
    scalar charLength = 0.0;   // L (plate/tube height) or D (horiz tube) [m]
    scalar gravity  = 9.81;    // g                                [m/s^2]
    std::string orientation = "verticalPlate";  // verticalPlate | verticalTube
                                                //  | horizontalTube
    // Boiling parameters -- PRESENT but UNUSED in v1 (so v2 is additive):
    scalar C_sf  = -1.0;       // Rohsenow surface-fluid constant (<0 = unset)
    scalar n_exp =  0.0;       // Rohsenow Prandtl exponent
};

// The glass-box result of one phase-change correlation evaluation.
struct PhaseChangeResult
{
    scalar      h       = 0.0;     // film coefficient [W/(m^2.K)]
    scalar      Re_film = 0.0;     // condensate film Reynolds number
    std::string regime  = "laminar film";
    bool        valid   = true;    // false when the laminar bound binds
    std::string validityNote;      // "" when inside; a WARN string otherwise

    // ---- BOILING channel (additive; condensation models leave these 0) ----
    // A boiling correlation reports a heat FLUX, not a film coefficient -- the
    // nucleate-boiling flux is +/-100 % uncertain, so it is NEVER reduced to a
    // bare h.  q_flux is the model's nucleate flux; q_CHF is the Zuber critical
    // (burnout) ceiling; margin = q_flux / q_CHF (a SAFE/BURNOUT figure).  A
    // film-condensation model (NusseltFilm) leaves all three at 0.
    scalar      q_flux  = 0.0;     // nucleate boiling heat flux   [W/m^2]
    scalar      q_CHF   = 0.0;     // Zuber critical heat flux      [W/m^2]
    scalar      margin  = 0.0;     // q_flux / q_CHF  (<1 = SAFE, >=1 = BURNOUT)
};

class PhaseChangeHTC
{
public:
    using Factory = std::function<std::unique_ptr<PhaseChangeHTC>()>;

    virtual ~PhaseChangeHTC() = default;

    virtual const std::string& type() const = 0;

    // The stated validity window, for the SEE block.
    virtual const std::string& validityWindow() const = 0;

    // Read model-specific parameters (none for the v1 built-in).
    virtual void readParameters(const DictPtr&) {}

    // Evaluate h at this station, returning the full glass-box result.
    virtual PhaseChangeResult evaluate(const PhaseChangeContext& c) const = 0;

    // Self-check against a PUBLISHED h-bar anchor.  Returns the absolute
    // relative deviation at the anchor point + the source citation; the bench
    // (choupoProps heatTransferBench) prints it.  Laminar film theory carries
    // genuine scatter vs experiment -- the bench tolerance is honest (~15 %),
    // NOT a 1 % pin (stated at the anchor).
    struct VerifyResult
    {
        scalar dev = 0.0;        // abs relative deviation at the anchor
        scalar h_choupo = 0.0;
        scalar h_published = 0.0;
        std::string anchor;      // human-readable point + source citation
    };
    virtual VerifyResult verify() const = 0;

    // ---- Factory (machinery mirrored from HeatTransferCorrelation) ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<PhaseChangeHTC> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
