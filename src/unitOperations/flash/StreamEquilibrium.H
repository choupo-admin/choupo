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
    src/unitOperations/flash/StreamEquilibrium.H

Description
    ONE HOME for "what state is this stream actually in, and what does that
    state cost on the elements datum".

    R-E5 of `docs/design/tp-stream-energy-coherence.md` says the unit duty
    and the balance report must price a given stream identically -- resolved
    state for an unpinned stream, declared state for a pinned one, solid rung
    for any crystal.  It was implemented twice (the flash's duty block and
    `reporting/BalanceMath.H`), and the day after the two agreed, a THIRD
    surface was found disagreeing with both: the `heater` inverted its Q on a
    sensible Cp relation and wrote an outlet that, resolved at its own
    (T, P, z), was two-phase and cost 8x the declared duty (process02,
    827 % closure, 2026-08-09).  A rule enforced by repetition is a rule with
    an arity of three.

    So the two primitives live here, in `unitOperations` -- the lowest band
    that may call a flash:

      * `equilibriumAt(...)`  -- the constitution's unpinned reading.  An
        unpinned (T, P, z) MEANS its own equilibrium; a pinned stream keeps
        its declared reading and is not re-solved.  A package that refuses to
        resolve the state returns nothing and says so (never a crash, never a
        silent fall-back to the carried representation).

      * `hOfState(...)` -- the per-mole enthalpy of a resolved state on the
        elements datum: the phase blend at the equilibrium compositions, plus
        each crystallised mole moved from the apparent-liquid rung onto
        `h_formation(T, "solid")` (R-E3).

    `reporting/BalanceMath.H` and `unitOperations/heatTransfer/Heater.cpp`
    both read them; `applications/` never sees this header.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <exception>
#include <optional>
#include <string>

namespace Choupo {
namespace flashState {

//  The equilibrium of (T, P, z) in `thermo`'s world, or nothing.
//
//  Returns nothing when:
//    * the stream is PINNED to a single phase (R-E2 -- a declaration is not
//      re-solved; a saturation-quality pin, 0 < vf < 1, IS resolvable);
//    * the package has no vapour phase (an LL-only world has nothing to
//      split against here);
//    * the flash did not converge;
//    * the package REFUSED the state -- announced, or captured in `deferTo`
//      when the caller evaluates the same state many times (a Newton on T)
//      and must announce once rather than once per iteration.
//
//  A CONVERGED SINGLE-PHASE answer is returned, not discarded: the caller
//  that must decide a stream's vapour fraction needs to know the resolution
//  said "all liquid" rather than "could not tell".
inline std::optional<FlashSolution> equilibriumAt(scalar               T,
                                                  scalar               P,
                                                  const sVector&       z,
                                                  bool                 pinned,
                                                  scalar               vfCarried,
                                                  const ThermoPackage& thermo,
                                                  const std::string&   locus,
                                                  const char*          category,
                                                  std::string*         deferTo = nullptr)
{
    const bool resolvable = pinned
        ? (vfCarried > 1.0e-9 && vfCarried < 1.0 - 1.0e-9)
        : true;
    if (!resolvable)                          return std::nullopt;
    if (thermo.phasesOfType("vapor").empty()) return std::nullopt;

    FlashInput fin; fin.F = 1.0; fin.T = T; fin.P = P; fin.z = z;
    FlashOptions fopts; fopts.verbosity = 0;
    FlashSolution fs;
    try
    {
        fs = IsothermalFlash::solveCore(fin, thermo, fopts);
    }
    catch (const std::exception& ex)
    {
        //  A STREAM WHOSE OWN EQUILIBRIUM THE PACKAGE WILL NOT RESOLVE still
        //  has a defined enthalpy under the state it carries -- and refusing
        //  outright would report NOTHING about a unit whose energy is
        //  perfectly computable (flash19's vapour outlet carries no Ca, so
        //  the reactive package refuses to speciate it at all).  The caller
        //  prices what the stream carries, and SAYS SO: an announced
        //  fall-back is a reading the student can check, a silent one is the
        //  crutch.
        const std::string msg =
            "priced on the state it CARRIES (vf = " + std::to_string(vfCarried)
            + "): its own equilibrium at (T, P, z) could not be resolved -- "
            + ex.what();
        if (deferTo) *deferTo = msg;
        else AdvisoryLog::instance().add(category, "info", locus, msg);
        return std::nullopt;
    }
    if (!fs.converged) return std::nullopt;

    //  ---- A LIQUID CANNOT EXIST ABOVE EVERY COMPONENT'S Tc ---------------
    //
    //  MEASURED, 2026-09-08: ammonia02's converter outlet -- 842.9 K, 200 bar,
    //  N2/H2/NH3/Ar -- resolves to V/F = 0.2589.  74 % LIQUID in a mixture
    //  whose highest pure critical temperature is ammonia's 405.5 K.  The
    //  K-values say why: K_H2 = 0.5396 and K_N2 = 0.7713, both below 1,
    //  because their Henry pairs are being read ~500 K past the windows their
    //  own records declare and van't Hoff carried that far collapses H(T) to
    //  5 % of the fitted value.  A correlation asked far outside its data can
    //  return a root that violates no equation and is physically impossible.
    //
    //  Nothing downstream could tell: the report priced the converter outlet
    //  on that split and misattributed 22 376 kW between the reactor and the
    //  feed-effluent exchanger, at exit 0.
    //
    //  The test is the strongest one available without a mixture critical
    //  locus: above the HIGHEST pure Tc among the components actually present
    //  there is no liquid.  A mixture's critical temperature can exceed a
    //  single component's, but it is bounded well below this -- the case that
    //  forced this rule sits 437 K past the maximum, not a few degrees.  A
    //  component with no declared Tc does not vote (absence is not evidence),
    //  and if NO present component declares one the test does not run.
    //
    //  What happens then: the SPLIT is discarded and the caller prices the
    //  state the stream carries, announced -- never a silent substitution.
    if (fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9)
    {
        scalar TcMax = 0.0;
        for (std::size_t i = 0; i < z.size() && i < thermo.n(); ++i)
            if (z[i] > 1.0e-12 && thermo.comp(i).Tc() > TcMax)
                TcMax = thermo.comp(i).Tc();
        if (TcMax > 0.0 && T > TcMax)
        {
            const std::string msg =
                "resolved TWO-PHASE at T = " + std::to_string(T)
                + " K, which is above the highest critical temperature of any"
                  " component present (" + std::to_string(TcMax) + " K): no"
                  " liquid can exist there, so the split is DISCARDED and this"
                  " stream is priced on the state it carries.  A root like"
                  " this comes from a correlation evaluated far outside its"
                  " declared window -- read the [henry] and [psat]"
                  " extrapolation lines for this run";
            if (deferTo) *deferTo = msg;
            else AdvisoryLog::instance().add(category, "warning", locus, msg);
            return std::nullopt;
        }
    }
    return fs;
}

//  Per-mole enthalpy [J/mol] of a RESOLVED state on the elements datum.
//
//  The phase blend uses the equilibrium phase COMPOSITIONS (x, y), not the
//  overall z: the two differ by exactly the latent heat of separation, which
//  is what a blend-by-z would report as a phantom duty next to a Q = 0 flash.
//
//  R-E3: a resolved state may carry crystals the caller's own stream record
//  does not.  `fs.x` is the APPARENT liquid -- any precipitate resolved here
//  is still inside it, priced as dissolved -- so each such mole moves onto
//  the solid formation rung, the SAME leg `solidH_elements` reads.  Amounts
//  are on the flash's F = 1 basis, so the result is per mole of stream.
inline scalar hOfState(const FlashSolution& fs,
                       scalar               T,
                       scalar               P,
                       const sVector&       z,
                       const ThermoPackage& thermo)
{
    const scalar bV = fs.V_over_F;
    scalar h;
    if (bV <= 1.0e-9)            h = thermo.H_stream_formation(T, P, 0.0, z);
    else if (bV >= 1.0 - 1.0e-9) h = thermo.H_stream_formation(T, P, 1.0, z);
    else
        h = (1.0 - bV) * thermo.H_stream_formation(T, P, 0.0, fs.x)
          +        bV  * thermo.H_stream_formation(T, P, 1.0, fs.y);

    sVector e(thermo.n(), 0.0);
    for (std::size_t i = 0; i < fs.solidFlows.size() && i < thermo.n(); ++i)
    {
        const scalar s_i = fs.solidFlows[i];
        if (s_i <= 0.0) continue;
        e.assign(thermo.n(), 0.0);
        e[i] = 1.0;
        h += s_i * (thermo.comp(i).h_formation(T, "solid")
                    - thermo.H_liquid_formation(T, e));
    }
    return h;
}

} // namespace flashState
} // namespace Choupo
