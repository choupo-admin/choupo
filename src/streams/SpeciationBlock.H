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

/*---------------------------------------------------------------------------*\
  speciationBlock -- THE one place a stream's `speciation {}` decomposition is
  built from a solved SpeciationResult.

  Two callers reach it, and they are asking DIFFERENT questions of the same
  chemistry:

    * IsothermalFlash, on its liquid outlet -- the speciation the FLASH
      solved, the state the phase equilibrium actually converged on;
    * Flowsheet's post-solve pass, on every other stream carrying a liquid --
      the material speciated AS IT IS (`speciateReactiveAsLiquid`, never a
      flash), so a feed is described as the feed and not as the liquid that
      would form from it.

  What is identical is the ARITHMETIC of the block, and that is what lives
  here: the network union, the molality -> kmol/s conversion against the
  liquid's own water, the precipitated minerals that are part of what the
  model resolved, and the `stoichiometric` basis mark.  It was written twice
  and drifted once (the minerals were added on one side first); one home.

  The block is REPORT-ONLY.  It decomposes (T, P, F, z, s) and nothing reads
  it back to build a stream -- the state stays on the component basis.  The
  stream-file writer verifies the closure on read, which is what keeps this
  honest: a decomposition that does not collapse back onto the material it
  describes is refused there, not here.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "streams/ProcessStream.H"

#include <memory>

namespace Choupo {

class ThermoPackage;
namespace electrolyte { struct SpeciationResult; }

//  Build the block, or return null when there is no water to convert against
//  (kgw <= 0: no aqueous phase, nothing to decompose).
//
//    thermo  the package -- read for the components' declared network names
//    sr      the SOLVED speciation (rows in molality, precipitated minerals)
//    kgw     kilograms of solvent water in THIS stream's liquid [kg/s]
//    pH      the solved pH of that liquid
std::shared_ptr<const ProcessStream::Speciation>
speciationBlock(const ThermoPackage&                  thermo,
                const electrolyte::SpeciationResult&  sr,
                scalar                                kgw,
                scalar                                pH);

} // namespace Choupo
