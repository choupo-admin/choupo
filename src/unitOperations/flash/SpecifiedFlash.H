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
File
    src/unitOperations/flash/SpecifiedFlash.H

Description
    ONE HOME for a flash SPECIFIED by a pair other than (T, P): (P, H),
    (P, S), (T, V/F) and (P, V/F) (DEV.md 4c C214 W1, 2026-11-03).

    Until this file, the (P, H) search lived inside `adiabaticFlash` and
    `valve`, each with its own bracket and tolerance; the (P, S) search lived
    inside the rotating-equipment core on a single-phase vapour, so a wet
    isentropic expansion was answered nowhere; and a vapour-fraction
    specification existed only at 0 and 1 (bubble, dew).  A student could
    ask the props bench for none of them.

    `specifiedFlash` writes NO equilibrium of its own.  Every trial state is
    ONE `flashState::flashDiscardingSupercriticalSplit` at (T, P, z) -- the
    isothermal flash, its Michelsen stability test and the supercritical
    discard -- and is priced by `hOfState` / `sOfState`, the energy report's
    own surface.  The one equation solved here that no flash can solve is a
    PURE component's saturation curve, ln K(T, P) = 0 on the package's own K
    (on the curve a pure flash is undetermined by construction; it is the
    equation `pureSaturationProximity` solves).

    The algorithm per pair, its failure modes and what is not done:
    docs/design/a-general-flash-specification.md.  In one paragraph:
      * (P, H), (P, S): a pure stream is tested on its saturation plateau
        first (Tsat from ln K = 0, the legs from PureSaturationPlateau.H);
        inside the legs the state is closed-form (T = Tsat, the vapour
        fraction from the lever rule).  Otherwise the property of the
        equilibrium state, increasing in T at fixed P, is bracketed by
        stepping from the seed and refined by `solver::newton1D`.
      * (T, V/F), (P, V/F): a pure stream sits on its curve with the
        declared vapour fraction; a mixture with 0 < V/F < 1 is a root of
        V/F(T) - beta (or of V/F(ln P)); a bubble or dew point (beta = 0
        or 1) is the edge of the band as the FLASH draws it, by bisection
        on the flash's own split predicate.
      * The verdict is `solver/Convergence.H`'s one decision; a one-equation
        residual is that header's degenerate case, so it is taken on the RAW
        residual and the criterion says so.
      * Anything that cannot satisfy the specification REFUSES by name: a
        target outside the window, a trial the package cannot answer, a
        search that does not converge, a pure fluid with no saturation at
        the held variable.  Nothing is clamped.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "solver/Convergence.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <limits>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {
namespace flashState {

enum class SpecPair { PH, PS, TVF, PVF };

//  The pair's word ("PH", "PS", "TVF", "PVF"), and back.  An unknown word
//  returns nothing; the caller refuses naming the accepted list.
const char*             specPairWord(SpecPair p);
std::optional<SpecPair> specPairFromWord(const std::string& w);

struct FlashSpecification
{
    SpecPair pair = SpecPair::PH;

    //  The HELD variable: P for PH, PS, PVF; T for TVF.
    scalar T = std::numeric_limits<scalar>::quiet_NaN();   // [K]
    scalar P = std::numeric_limits<scalar>::quiet_NaN();   // [Pa]

    //  The SPECIFIED value: H [J/mol] for PH, S [J/(mol K)] for PS, the
    //  vapour fraction [-] for TVF and PVF.  Per mole of feed, on the
    //  surface hOfState / sOfState price.
    scalar target = std::numeric_limits<scalar>::quiet_NaN();

    //  Where the search for the unknown starts: T [K] for PH, PS, PVF;
    //  P [Pa] for TVF.  NaN = the documented default (the z-weighted normal
    //  boiling point; the z-weighted saturation pressure), never a guess
    //  hidden in code.
    scalar seed = std::numeric_limits<scalar>::quiet_NaN();

    //  The window the unknown is searched in.  A target the window cannot
    //  reach is REFUSED naming both ends and their values.
    scalar Tmin = 50.0,   Tmax = 1500.0;       // [K]
    scalar Pmin = 1.0e2,  Pmax = 1.0e8;        // [Pa]

    //  The flash every trial state is solved with.  Tighter than the
    //  isothermal unit's defaults, because a specification asked to 1e-8 in
    //  T must not be bounded by a 1e-6 composition loop.
    FlashOptions flash = defaultFlashOptions();

    //  The verdict's controls.  `controlsDeclared` false = the documented
    //  per-pair default (`defaultControls`), announced as such by the caller.
    solver::ConvergenceControls controls = defaultControls(SpecPair::PH);
    bool                        controlsDeclared = false;

    static FlashOptions defaultFlashOptions();
    static solver::ConvergenceControls defaultControls(SpecPair p);
};

struct SpecifiedState
{
    SpecPair      pair = SpecPair::PH;
    scalar        T  = 0.0;      // [K]
    scalar        P  = 0.0;      // [Pa]
    scalar        vaporFraction = 0.0;
    FlashSolution phases;        // the equilibrium the state IS
    scalar        H  = 0.0;      // [J/mol]      hOfState
    scalar        S  = std::numeric_limits<scalar>::quiet_NaN();
                                 // [J/(mol K)]  sOfState; NaN when not
                                 //  asked for (see `wantS` below)
    std::string   route;         // which branch answered, for the log
    bool          onSaturationPlateau = false;  // a pure fluid's two-phase state
    int           flashes = 0;   // trial flashes the search cost
    solver::ResidualReport report;
    std::vector<std::string> notes;   // said once, at the answer
};

//  The state `spec` names, for the feed `z` (normalised by the caller).
//  Throws std::runtime_error, naming the pair and the reason, when the
//  specification cannot be met.  `verbosity` >= 3 prints the search.
//  `wantS`: also price the entropy of the answer (always true for PS).
SpecifiedState specifiedFlash(const ThermoPackage&      thermo,
                              const sVector&            z,
                              const FlashSpecification& spec,
                              int                       verbosity = 0,
                              bool                      wantS     = true);

//  The equilibrium state at (T, P, z) priced on the same surface -- the
//  isothermal question, answered by the same machinery, so a reference state
//  (an isentropic expansion's inlet) and the specified state are priced
//  alike.
SpecifiedState stateAtTP(const ThermoPackage& thermo,
                         const sVector&       z,
                         scalar               T,
                         scalar               P,
                         const FlashOptions&  opts,
                         bool                 wantS);

} // namespace flashState
} // namespace Choupo
