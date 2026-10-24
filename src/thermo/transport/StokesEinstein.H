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
Namespace
    Choupo::stokesEinstein

Description
    THE TEMPERATURE OF AN ION DIFFUSIVITY, IN ONE HOME (DEV.md 4c C145
    ruling, built C148).

    The ion-transport tier (thermo/electrolyte/IonTransport.H, `ionD0`)
    serves each ion's infinite-dilution diffusivity at 25 C.  At another
    temperature it is corrected by Stokes-Einstein, D proportional to T/mu:

        D_i(T) = D_i0 (T / T0) (mu(T0) / mu(T)),    T0 = 298.15 K,

    mu the SOLVENT's liquid viscosity from the package's OWN declared model
    (`transport { liquid { viscosity { model ...; } } }` in the case's
    thermoPhysPropDict), evaluated on the pure solvent at BOTH temperatures,
    so the ratio carries the model's shape and not its absolute error.
    With NO liquid-viscosity model declared there is no correction: the
    factor is 1 and the run SAYS so (`announce`), because a 25 C D0 used at
    20 C is 11 % high on water and a reader must be able to see that.  At
    T = T0 the factor is 1 EXACTLY (both ratios are a number divided by
    itself), so no number at 25 C moves whether a model is declared or not.

    The electrodialysis stack had this correction first (2026-09-16), as a
    literal; it calls this home now, with the same arithmetic in the same
    order.  The membrane units (the Polarisation object's per-ion D, the
    DSPM-DE pore's ion D) call it since C148.

    Primary: A. Einstein, Ann. Phys. 17 (1905) 549 (D = kT / (6 pi mu r)),
    with the hydrodynamic radius taken as temperature-independent -- the
    assumption the ratio form rests on, stated here.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

class ThermoPackage;

namespace stokesEinstein {

//- The temperature the ion-transport tier's D0 is curated at (25 C).
inline constexpr scalar referenceTemperature = 298.15;

//- The factor D(T)/D0 and what it was computed from.
struct Factor
{
    scalar      value  = 1.0;   // (T/T0)(mu(T0)/mu(T)), or 1 when not priced
    bool        priced = false; // a liquid-viscosity model was declared
    scalar      T      = referenceTemperature;
    scalar      mu     = 0.0;   // mu(T)  [Pa.s], the pure solvent
    scalar      muRef  = 0.0;   // mu(T0) [Pa.s]
    std::string solvent;        // the component the viscosity was asked for
};

//- The factor at T for the package's solvent: the declared `solvent` of
//  the package, else `water`.  Not priced (value 1) when the package
//  declares no liquid-viscosity model or carries no such component.
Factor factor(const ThermoPackage& thermo, scalar T_K);

//- The same, for an explicit solvent component index (the electrodialysis
//  stack, which already holds it).
Factor factorFor(const ThermoPackage& thermo, std::size_t iSolvent, scalar T_K);

//- Announce the factor once per pass per (locus, T): at T0, nothing; priced,
//  an info line naming the factor and both viscosities; NOT priced, a
//  warning naming the temperature and the declaration that would correct
//  it.  `reader` names what reads the D ("ion D0 of the polarisation film").
void announce(const Factor& f, const std::string& locus,
              const std::string& reader, int verbosity);

} // namespace stokesEinstein
} // namespace Choupo
