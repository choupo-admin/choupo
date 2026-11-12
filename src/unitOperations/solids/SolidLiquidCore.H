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
Description
    WHAT THE SOLID-LIQUID SEPARATORS READ AND WRITE (DEV.md 4c C361 slice 4:
    `cakeFilter` and `thickener`; `sedimentingCentrifuge` reads its feed
    through the classifier core of slice 3, because it splits on the size
    grid, and uses the property helpers here).

    A slurry stream carries its LIQUID in F and z (the fluid's flow and mole
    fractions) and its SOLIDS in s (kmol/s per component) with, optionally,
    one size distribution.  This file turns either inlet form the flowsheet
    hands a unit -- the single-inlet `feed {}` + `composition {}` +
    `solids {}`, or one entry of `inputStreams ( ... )` -- into one struct,
    and builds the product streams back from component flows, so a unit
    states its balance in kmol/s per component and nothing else.

    DENSITIES: the solid's is volume-additive over the solid components'
    `solid { rho_p; }` (refused by name when absent); the liquid's is the
    package's `density(T, P, x, Liquid)`.  VISCOSITY: the package's
    `viscosityLiquid(T, x)`, refused by name when the case declared no liquid
    viscosity model -- a filtration or settling law is never run on a
    viscosity nobody declared.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"

#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

struct SlurryState
{
    std::string name;                 // the stream's name, for messages
    scalar T = 0.0, P = 0.0, vf = 0.0;
    sVector liquid;                   // liquid molar flows [kmol/s] (= F z)
    sVector solid;                    // solid molar flows  [kmol/s] (= s)
    ParticleSizeDistribution psd;     // empty when the stream has none
    scalar mLiquid = 0.0;             // [kg/s]
    scalar mSolids = 0.0;             // [kg/s]
};

//  The single inlet of a one-inlet unit (`feed {}`, `composition {}`,
//  `solids {}` at the top of the unit dict).
SlurryState readSingleInlet(const DictPtr& dict, const ThermoPackage& thermo,
                            const std::string& owner);

//  The inlets of a multi-inlet unit, in the order of `inputs ( ... )`.
std::vector<SlurryState> readInputStreams(const DictPtr& dict,
                                          const ThermoPackage& thermo,
                                          const std::string& owner);

//  Mass flow of a component-flow vector [kg/s].
scalar massOf(const sVector& n, const ThermoPackage& thermo);

//  Volume-additive particle density of the solids in `s` [kg/m3]; refuses
//  (naming `owner`) a solid component with no `solid { rho_p; }`.
scalar solidDensity(const sVector& s, const ThermoPackage& thermo,
                    const std::string& owner);

//  The package's liquid density of the composition `n` at (T, P) [kg/m3].
scalar liquidDensity(const sVector& n, scalar T, scalar P,
                     const ThermoPackage& thermo);

//  The package's liquid viscosity of the composition `n` at T [Pa s];
//  refuses when the case declared no liquid viscosity model.
scalar liquidViscosity(const sVector& n, scalar T, const ThermoPackage& thermo,
                       const std::string& owner);

//  A product stream from component flows: F and z are the liquid's, s the
//  solids', vf 0.  `psd` is attached only when the stream carries solids.
ProcessStream makeSlurryStream(const std::string& name, scalar T, scalar P,
                               const sVector& liquid, const sVector& solid,
                               const ParticleSizeDistribution& psd);

//  max_i |SUM_out n_i - SUM_in n_i| / SUM_i SUM_in n_i, over every component
//  of the liquid and solid vectors together (molar): the closure each
//  separator of this slice prints.
scalar componentClosure(const std::vector<const sVector*>& in,
                        const std::vector<const sVector*>& out);

} // namespace Choupo
