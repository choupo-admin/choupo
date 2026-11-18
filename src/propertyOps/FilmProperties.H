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
    This file is part of Choupo.  GPL-3.0-or-later; see LICENSE.

    SPDX-License-Identifier: GPL-3.0-or-later

Description
    THE STIRRED-CELL FILM'S VISCOSITY AND DENSITY, ASKED OF THE PACKAGE
    (DEV.md 4c C435 (4)).  The membrane benches that price a film from a
    `massTransfer {}` block (polarisationIndex, fitParameters of kind
    membrane) used to read `viscosity` and `density` TYPED in that block.  A
    value typed in a unit is a second home for a fact the property dictionary
    owns, so the block REFUSES them by name (unitTypedProperties::refuse, the
    line to write in the message) and the bench asks the package through the
    one door, on the SOLVENT at the op's temperature.  A case that reproduces
    a reference program's own water properties states them ONCE, as records
    of kind adopted (constant/experiments/), selected in
    thermoPhysPropDict with a reason.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/LiquidPropertyDoor.H"
#include "unitOperations/UnitTypedProperties.H"
#include "unitOperations/membrane/massTransfer/MassTransferModel.H"

#include <iostream>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace filmProperties {

//  mu, rho of the film's liquid at (T, P), through the door: the feed's salts
//  (`feed`: component index, kmol/m3, positives only) in water, on the solvent's
//  molar density at T -- the same state PoreTransportBench prices.  `u` and
//  `d_h` are read from the block as before.
inline void read(const DictPtr& mt, const ThermoPackage& thermo, scalar T,
                 const std::vector<std::pair<std::size_t, scalar>>& feed,
                 const std::string& opType, const std::string& opName,
                 const std::string& site, int verbosity,
                 MassTransferContext& hyd)
{
    unitTypedProperties::refuse(mt, site + ": ", opType + " massTransfer");
    const std::size_t iW = thermo.aqueousSolventIndex();
    sVector xw(thermo.n(), 0.0);
    xw[iW] = 1.0;
    const scalar P_door = 101325.0;   // the film is at the cell's ambient pressure
    const liquidProperty::Consumer who{ opType, opName };
    const scalar rhoW = liquidProperty::evaluate(thermo, liquidProperty::Property::density,
                                T, P_door, xw).value;        // kg/m3, only to put the salts on a mole basis
    const scalar cW = rhoW / thermo.comp(iW).MW();           // kmol/m3
    scalar cSum = 0.0;
    for (const auto& f : feed) cSum += f.second;
    sVector xf(thermo.n(), 0.0);
    for (const auto& f : feed) xf[f.first] = f.second / (cW + cSum);
    xf[iW] = cW / (cW + cSum);
    liquidProperty::Request askRho;
    askRho.thermo = &thermo; askRho.T = T; askRho.P = P_door; askRho.x = xf; askRho.who = &who;
    hyd.rho = liquidProperty::density(askRho).value;
    hyd.mu  = liquidProperty::evaluate(thermo, liquidProperty::Property::viscosity,
                                       T, P_door, xf, &who).value;
    if (verbosity >= 1)
        std::cout << "  [" << opType << "] the film is priced on mu = " << hyd.mu
                  << " Pa.s and rho = " << hyd.rho << " kg/m3 of "
                  << thermo.comp(iW).name() << " at " << T
                  << " K, asked of the package through the door (the lines above name each source)\n";
    hyd.u   = mt->lookupScalarOrDefault("velocity", 0.0);
    hyd.d_h = mt->lookupScalarOrDefault("hydraulicDiameter", 0.0, Dims::length);
}

} // namespace filmProperties
} // namespace Choupo
