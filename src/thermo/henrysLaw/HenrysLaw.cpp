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

#include "HenrysLaw.H"
#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"
#include <iostream>
#include <sstream>
#include "core/Constants.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

void HenrysLaw::readFromDict(const DictPtr& d)
{
    solute_  = d->lookupWord("solute");
    solvent_ = d->lookupWord("solvent");
    model_   = d->lookupWordOrDefault("model", "vantHoff");
    if (model_ != "vantHoff")
        throw std::runtime_error("HenrysLaw '" + solute_ + "-" + solvent_ +
            "': only `model vantHoff;` is implemented");

    H_ref_   = d->lookupScalar("H_ref",   Dims::pressure);
    T_ref_   = d->lookupScalar("T_ref",   Dims::temperature);
    dHdiss_  = d->lookupScalar("enthalpy", Dims::molarEnergy);

    // Optional Krichevsky-Kasarnovsky / Krichevsky-Ilinskaya constants.
    v_inf_     = d->lookupScalarOrDefault("v_inf",     0.0);   // m^3/mol (raw SI)
    margulesA_ = d->lookupScalarOrDefault("margulesA", 0.0);   // J/mol   (raw SI)

    if (d->found("Trange"))
    {
        auto r = d->lookupList("Trange");
        if (r.size() == 2) { T_min_ = r[0]; T_max_ = r[1]; hasTrange_ = true; }
    }
}

//  ONE excursion report PER PAIR PER SIDE, on `AdvisoryLog`.
//
//  Round-4 (professor) taught this record's `Trange` to be consumed rather than
//  stored and discarded.  Two things were still wrong with the report, and both
//  were MEASURED on ammonia02 (2026-09-08) rather than supposed.
//
//  (1) IT WENT TO `std::cerr` ALONE.  A `[henry]` line at log line 108 of 1200
//      is the slightly-louder form of silence that `core/AdvisorySummary.H`
//      exists to end: it never reached the end-of-run caveat block, the result
//      JSON or the GUI, so nothing downstream could know the model had left its
//      data.  It rides `AdvisoryLog` now, like every other validity warning.
//
//  (2) IT LATCHED ON THE PAIR ALONE, so BELOW-window and ABOVE-window -- two
//      physically different situations -- shared one report, and whichever
//      came first silenced the other.  ammonia02 asks H2-NH3 (fitted
//      288-333 K) for the separator at 250 K AND for the synthesis loop
//      hundreds of kelvin above it.  The old latch announced 250 K -- 38 K
//      under the window, unremarkable -- and was then silent about the
//      excursion above, which is the one that matters: van't Hoff carried that
//      far drives H down (measured on ammonia02: to 5.0 % of the fitted H_ref
//      for H2-NH3) until K < 1, so a flash at 843 K finds hydrogen and
//      nitrogen preferring a LIQUID at 843 K and returns a physically
//      impossible two-phase split.  The energy balance then priced the
//      converter outlet on that split and misattributed 22 376 kW between the
//      reactor and the feed-effluent exchanger.
//
//      The latch is per (pair, SIDE) now.  What that does NOT do, said rather
//      than implied: WITHIN a side it still reports the FIRST excursion, not
//      the worst -- ammonia02 names 656 K above the window where the run also
//      reaches 843 K.  Reporting the worst needs a report taken at the END of
//      a run rather than at the call, which is a different slice.  The same
//      blind spot is written out in `VaporPressureModel.cpp`'s own comment,
//      and is NOT closed there by this change either: that model has a
//      separate supercritical branch and its latch is a different object.
//
//  Still NEVER a refusal: the van't Hoff form extrapolates smoothly, a sweep
//  may legitimately walk outside the fit, and I4 says extrapolation is a
//  choice the student is entitled to make -- with their eyes open.
void HenrysLaw::announceOutsideWindow(scalar T) const
{
    const bool   above = (T > T_max_);
    const scalar edge  = above ? T_max_ : T_min_;
    const std::string pair = solute_ + "-" + solvent_;

    if (!announceOnce("henryTrange:" + pair + (above ? ":above" : ":below")))
        return;

    //  A COMPUTED consequence, not an adjective: how far the van't Hoff form
    //  has carried the constant away from the value that was actually fitted.
    //  Read from `vantHoff`, the ONE home of the correlation -- calling H(T)
    //  here would re-enter this reporter, and copying the exponential would
    //  give the formula a second home.
    const scalar ratio = vantHoff(T) / H_ref_;

    std::ostringstream m;
    m << "evaluated at T = " << T << " K, " << (above ? "ABOVE" : "BELOW") << " "
      << (hasTrange_ ? "the fitted Trange (" : "the DEFAULT window (")
      << T_min_ << " " << T_max_ << ")"
      << (hasTrange_ ? "" : ", no Trange declared in the pair file")
      << " by " << std::abs(T - edge) << " K -- van't Hoff extrapolation,"
         " still returned; H(T) is " << ratio << "x the fitted H_ref, and every"
         " K-value computed from it inherits that";

    if (!AdvisoryLog::instance().add("validity", "warning",
                                     "Henry pair '" + pair + "'", m.str()))
        return;

    std::cerr << "[henry] " << pair << ": " << m.str() << ".\n";
}

scalar HenrysLaw::H(scalar T) const
{
    if (T < T_min_ || T > T_max_)
        announceOutsideWindow(T);
    return vantHoff(T);
}

//  The correlation itself, with NO reporting: the ONE home of the van't Hoff
//  form, so `H()` and the excursion report cannot drift apart.
scalar HenrysLaw::vantHoff(scalar T) const
{
    // van't Hoff:  H(T) = H_ref * exp[ +dHdiss/R * (1/T - 1/T_ref) ]
    //
    // Sign: from d(ln K_sol)/dT = dHdiss/(R T^2) with K_sol = 1/H, so
    //   ln H = ln H_ref + dHdiss/R * (1/T - 1/T_ref).
    // With dHdiss < 0 (exothermic dissolution) and T > T_ref, both
    // factors are negative -> exp(+) > 1 -> H RISES with T, i.e. the
    // gas is LESS soluble hot (ammonia boils out of warm water).  The
    // earlier `-dHdiss` inverted this; it was latent because every case
    // ran at T_ref = 298 K, where H = H_ref regardless of sign.
    return H_ref_ * std::exp(dHdiss_ / constant::R * (1.0/T - 1.0/T_ref_));
}

} // namespace Choupo
