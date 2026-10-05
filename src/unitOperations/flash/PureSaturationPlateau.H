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
    src/unitOperations/flash/PureSaturationPlateau.H

Description
    ONE HOME for the saturation PLATEAU of a pure component: the one state a
    temperature and a pressure cannot name.

    For a stream carrying ONE component, H(T) at fixed P is not a function a
    root-finder can invert across saturation: it JUMPS by the whole latent
    heat at Tsat(P), because a pure component is single-phase on either side
    of its curve and a flash on the curve has no split to return (K == 1,
    Rachford-Rice holds for every V/F).  A target enthalpy INSIDE that jump
    is a perfectly physical state -- a partially boiled or partially
    condensed pure fluid at Tsat -- and its coordinate is the vapour fraction,
    not the temperature.  A bisection on T converges onto Tsat and publishes
    the nearer single phase, short of its duty by the unboiled (or
    uncondensed) fraction's latent heat, at exit 0 (DEV.md §5, 2026-10-05,
    HEAT EXCHANGER; `utility02_hitec_csp_heater` at 40 bar, 3.06 kW short).

    Ruling (DEV.md §4c C36 item 3, CLAUDE.md §3 "A STREAM IS FIXED BY TWO
    VARIABLES", the pure-component exception): such an outlet is published at
    T = Tsat with its vapour fraction PINNED -- for a pure fluid on its curve
    (T, P) do not fix the split, so the pin IS the state.

    Three units read it:

      * `heatExchanger` and `heater`, which invert H(T) by a root-finder and
        must recognise that they landed on the jump;
      * `phaseChanger`, which tests the plateau FIRST on its duty and
        geometry modes -- and carried, in three copies, an extrapolation to
        the saturated legs that was exact only when the enthalpy datum is
        zero (see `pureSaturationLegs`).

    Nothing here resolves a stream's state: that is
    `flash/StreamEquilibrium.H`'s, and it is untouched.  These are the legs of
    ONE pure fluid's two-phase blend, priced through the SAME
    `H_stream_formation(T, P, q, z)` the energy report prices a pinned
    two-phase stream with, so a state published from them is priced back to
    the target to round-off.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cstddef>
#include <optional>

namespace Choupo {
namespace flashState {

//  The index of the ONE component the stream carries, or nothing.
//
//  "Carries" is z_i > 0, exactly the test the flash applies when it decides
//  which terms enter Rachford-Rice and the phase test (`IsothermalFlash.cpp`,
//  `RR` / `dRR_dV` / g(V=0), g(V=1)): a component present at ANY amount makes
//  a mixture, whose (T, P) between bubble and dew DO fix a split the flash
//  finds, so the plateau rule must not fire on it.  This is deliberately
//  narrower than `ThermoPackage::isEffectivelyPure` (z_i >= 0.999), which is
//  a dominant-component APPROXIMATION a unit may choose to make; the plateau
//  here is a fact about a single-component stream.
inline std::optional<std::size_t> soleComponent(const sVector& z)
{
    std::optional<std::size_t> only;
    for (std::size_t i = 0; i < z.size(); ++i)
    {
        if (!(z[i] > 0.0)) continue;
        if (only) return std::nullopt;
        only = i;
    }
    return only;
}

//  The saturated-liquid and saturated-vapour molar enthalpies [J/mol] of a
//  pure stream at (T, P) -- the two ends of its plateau.
//
//  Read off the package's own TWO-PHASE blend at two INTERIOR qualities and
//  extrapolated linearly to q = 0 and q = 1.  Why interior: at q in {0, 1}
//  the pure-fluid route (IF97) prices the single phase (T, P) select, which
//  ON the curve is the same side for both ends and carries no latent heat.
//  For 0 < q < 1 the blend is LINEAR in q on every route
//  (`ThermoPackage::H_stream_formation`), h(q) = h_L + q (h_V - h_L), so the
//  extrapolation is exact and h(q) evaluated afterwards reproduces any target
//  between the legs to round-off.
//
//  THE EXTRAPOLATION THIS REPLACES WAS EXACT ONLY FOR A ZERO DATUM.
//  `phaseChanger` carried, at three sites, h_f = (h_lo - eps h_hi)/(1 - 2 eps)
//  and h_g = (h_hi - eps h_lo)/(1 - 2 eps).  With h_lo = h_L + eps L and
//  h_hi = h_L + (1 - eps) L that is h_L (1 - eps)/(1 - 2 eps) + O(eps^2 L):
//  the legs are scaled about ZERO, not translated, so on the elements datum
//  (water's liquid leg is about -2.86e5 J/mol) both moved by ~eps |h_L|,
//  ~28.6 J/mol, and the plateau quality and the delivered duty with them
//  (on the two IF97 corpus cases that land on the plateau: 1.15 and
//  3.00 J/mol, a published duty 0.029 % and 0.016 % off the unit's own).
//  The exact form translates: h_L = h_lo - eps L, h_V = h_hi + eps L,
//  L = (h_hi - h_lo)/(1 - 2 eps).
struct SaturationLegs
{
    scalar hLiquid = 0.0;   // J/mol, q = 0 end of the plateau
    scalar hVapour = 0.0;   // J/mol, q = 1 end of the plateau
    scalar latent() const { return hVapour - hLiquid; }
};

inline SaturationLegs pureSaturationLegs(scalar               T,
                                         scalar               P,
                                         const sVector&       z,
                                         const ThermoPackage& thermo,
                                         scalar               eps = 1.0e-4)
{
    const scalar h_lo = thermo.H_stream_formation(T, P, eps,       z);
    const scalar h_hi = thermo.H_stream_formation(T, P, 1.0 - eps, z);
    const scalar L    = (h_hi - h_lo) / (1.0 - 2.0 * eps);
    SaturationLegs legs;
    legs.hLiquid = h_lo - eps * L;
    legs.hVapour = h_hi + eps * L;
    return legs;
}

//  The vapour fraction at which a pure stream at (T, P) carries `hTarget`,
//  when the target lies STRICTLY inside its plateau; nothing otherwise.
//  (T is the caller's saturation temperature: the plateau exists only there,
//  and outside it the answer is the single phase, which this does not price.)
inline std::optional<scalar> plateauQuality(scalar               hTarget,
                                            scalar               T,
                                            scalar               P,
                                            const sVector&       z,
                                            const ThermoPackage& thermo)
{
    const SaturationLegs legs = pureSaturationLegs(T, P, z, thermo);
    const scalar L = legs.latent();
    if (!(L > 0.0)) return std::nullopt;
    const scalar q = (hTarget - legs.hLiquid) / L;
    if (!(q > 0.0 && q < 1.0)) return std::nullopt;
    return q;
}

//  ---- WHERE A ROOT-FINDER ON H(T) STOPPED, AND WHETHER IT WAS ON A JUMP ---
//
//  A bracket-and-bisect on an INCREASING f(T) = H(T) - H_target.  It is
//  written once because two units need the same bracket ends afterwards:
//  where H(T) is continuous the two residuals at the converged bracket are
//  both ~ dH/dT x (hi - lo), a few micro-J/mol; where it JUMPS they straddle
//  the latent heat.  The arithmetic is exactly the exchanger's bisection as it
//  stood (`HeatExchanger.cpp`, 2026-09-08): the same stopping rule, the same
//  midpoint, the same answer -- what is new is that the residual at the
//  upper end is kept rather than thrown away.
struct BracketedRoot
{
    scalar T   = 0.0;   // the midpoint of the final bracket (the answer)
    scalar fLo = 0.0;   // f at the final lower end  (<= 0)
    scalar fHi = 0.0;   // f at the final upper end  (>= 0)
};

template <class F>
inline BracketedRoot bisectIncreasing(F f, scalar lo, scalar flo,
                                      scalar hi, scalar fhi)
{
    for (int k = 0; k < 200 && (hi - lo) > 1.0e-10 * std::max<scalar>(1.0, hi); ++k)
    {
        const scalar mid = 0.5 * (lo + hi), fm = f(mid);
        if (flo * fm <= 0.0) { hi = mid; fhi = fm; }
        else                 { lo = mid; flo = fm; }
    }
    return BracketedRoot{ 0.5 * (lo + hi), flo, fhi };
}

//  The vapour fraction a pure stream must carry when a bisection on its H(T)
//  converged onto the saturation JUMP rather than onto a root; nothing when
//  the stream is a mixture, when the bracket closed on a continuous root, or
//  when the target is not strictly inside the plateau at the answer.
//
//  `jumpTol` [J/mol]: the bracket ends must disagree by more than this for
//  the answer to be a jump.  A continuous root leaves them a few micro-J/mol
//  apart (dH/dT ~ 1e2 J/mol/K over a 5e-8 K bracket); a latent heat leaves
//  them tens of kJ/mol apart.  1e-3 J/mol sits between by orders of magnitude
//  on both sides, and at a jump the q it rejects is below 1e-7.
inline std::optional<scalar> qualityAtJump(const BracketedRoot& r,
                                           scalar               hTarget,
                                           scalar               P,
                                           const sVector&       z,
                                           const ThermoPackage& thermo,
                                           scalar               jumpTol = 1.0e-3)
{
    if (!soleComponent(z))              return std::nullopt;
    if (!(r.fHi - r.fLo > jumpTol))     return std::nullopt;
    return plateauQuality(hTarget, r.T, P, z, thermo);
}

//  A stream dict that DECLARES a pure two-phase state: pinned, 0 < vf < 1,
//  one component.  Its quality, or nothing.
//
//  For such a stream (T, P) sit on the saturation curve and do not fix the
//  split; the pin IS the state (CLAUDE.md §3).  A reader that resolves the
//  stream by a flash at (T, P, z) gets one side of the curve, chosen by the
//  last digits of T, and loses the pin -- so a unit that prices its INLET
//  through such a resolution must ask this first.  (The energy report does
//  not need to: `flashState::priceState` prices the CARRIED vapour fraction
//  whenever the resolution is not a split, which for a pure stream it never
//  is.)
inline std::optional<scalar> pinnedPureQuality(const DictPtr& streamDict,
                                               const sVector& z)
{
    if (!streamDict) return std::nullopt;
    if (streamDict->lookupScalarOrDefault("phasePinned", 0.0) < 0.5)
        return std::nullopt;
    const scalar vf = streamDict->lookupScalarOrDefault("vf", 0.0);
    if (!(vf > 0.0 && vf < 1.0)) return std::nullopt;
    if (!soleComponent(z)) return std::nullopt;
    return vf;
}

} // namespace flashState
} // namespace Choupo
