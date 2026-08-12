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

#include "RowlinsonBondi.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

RowlinsonBondi::RowlinsonBondi(const DictPtr& dict)
{
    //  Tc and omega live at COMPONENT level and are injected here by
    //  Component::Component -- the same route AmbroseWalton's take, so the
    //  case author declares them ONCE and no block re-states them.
    Tc_    = dict->lookupScalarOrDefault("Tc",    0.0);
    omega_ = dict->lookupScalarOrDefault("omega", 0.0);
    owner_ = dict->lookupWordOrDefault("owner", "component");

    if (Tc_ <= 0.0)
        throw std::runtime_error("RowlinsonBondi liquid heat capacity for '"
            + owner_ + "' needs Tc (> 0) on the COMPONENT (not inside the"
            " liquidHeatCapacity block -- it is injected automatically)."
            "  This is a corresponding-states correlation: without a critical"
            " temperature there is no reduced temperature to correlate on.");

    //  THE IDEAL-GAS Cp IS THE BASE, NOT AN OPTIONAL EXTRA.  Rowlinson-Bondi
    //  gives a DEPARTURE (Cp_L - Cp_ig); with no Cp_ig there is nothing to add
    //  it to, and returning the departure alone would be off by the whole
    //  ideal-gas term -- a plausible number, silently wrong, which is the one
    //  failure mode this project refuses to ship.
    if (!dict->found("idealGasHeatCapacity"))
        throw std::runtime_error("RowlinsonBondi liquid heat capacity for '"
            + owner_ + "' needs the component's `idealGasHeatCapacity {}`"
            " block: the correlation predicts the DEPARTURE (Cp_L - Cp_ig),"
            " so the ideal-gas curve is what it departs FROM."
            "\n        Declare idealGasHeatCapacity on the component (a"
            " Joback estimate supplies one), or give a measured"
            " liquidHeatCapacity { model polynomial; ... } instead.");
    cpIg_ = HeatCapacityModel::New(dict->subDict("idealGasHeatCapacity"));

    if (omega_ == 0.0 && !dict->found("omega"))
        AdvisoryLog::instance().add("thermo", "warning", owner_,
            "RowlinsonBondi: no acentric factor declared, so omega = 0 is"
            " being used -- the omega-weighted half of the correlation is"
            " switched off and the liquid Cp is the spherical-molecule limit");
}


void RowlinsonBondi::announceRangeOnce(scalar T_K) const
{
    const scalar Tr = T_K / Tc_;
    if (Tr >= TrLow && Tr <= TrHigh) return;
    //  ABOVE THE POLE, SAY NOTHING HERE.  `departure()` is about to refuse,
    //  and this block's sentence ends in "extrapolated, still returned" -- so
    //  announcing first would tell the reader the value was returned one line
    //  before the engine refuses to return it.  A caveat that contradicts the
    //  refusal it precedes is worse than no caveat: the refusal is the honest
    //  message and it speaks for itself.
    if (Tr >= 1.0) return;
    if (announced_) return;
    announced_ = true;
    std::ostringstream os;
    os << "RowlinsonBondi liquid Cp evaluated at Tr = " << Tr
       << " (T = " << T_K << " K), OUTSIDE the correlation's declared window ("
       << TrLow << " " << TrHigh << ") -- extrapolated, still returned."
       << (Tr > TrHigh
           ? "  Above Tr ~ 0.85 the 1/(1-Tr) terms grow steeply toward the"
             " critical divergence and the value inflates fast."
           : "  Below Tr ~ 0.25 the correlation was not fitted and the"
             " departure is small, so the answer is close to the ideal-gas"
             " curve by construction rather than by evidence.");
    AdvisoryLog::instance().add("validity", "warning", owner_, os.str());
    std::cout << "[cp] component '" << owner_ << "': " << os.str() << "\n";
}


scalar RowlinsonBondi::departure(scalar T_K) const
{
    const scalar Tr = T_K / Tc_;

    //  Tr >= 1 is not an extrapolation, it is a category error: above the
    //  critical temperature there is no liquid whose heat capacity this could
    //  be.  The correlation's pole sits exactly there, so a "returned anyway"
    //  value would be an arbitrarily large number wearing units.
    if (Tr >= 1.0)
        throw std::runtime_error("RowlinsonBondi liquid Cp for '" + owner_
            + "': requested T = " + std::to_string(T_K) + " K is AT or ABOVE"
              " Tc = " + std::to_string(Tc_) + " K (Tr = "
            + std::to_string(Tr) + ").  There is no liquid there, and the"
              " correlation has a pole at Tr = 1 -- this is refused rather"
              " than returned as a very large number.");

    const scalar oneMinusTr = 1.0 - Tr;
    const scalar term =
          1.586
        + 0.49 / oneMinusTr
        + omega_ * ( 4.2775
                   + 6.3 * std::cbrt(oneMinusTr) / Tr
                   + 0.4355 / oneMinusTr );
    return constant::R * term;
}


scalar RowlinsonBondi::Cp(scalar T_K) const
{
    announceRangeOnce(T_K);
    return cpIg_->Cp(T_K) + departure(T_K);
}


scalar RowlinsonBondi::H(scalar T_K, scalar Tref_K) const
{
    announceRangeOnce(T_K);

    //  THE SPLIT: the ideal-gas part keeps its own EXACT integral (whatever
    //  the nested model is), and only the departure is quadratured.  The
    //  departure has no elementary antiderivative -- (1-Tr)^(1/3)/Tr does not
    //  integrate in closed form -- but it is the SMALL term, so the numerical
    //  error rides on the correction and not on the bulk.
    const scalar exact = cpIg_->H(T_K, Tref_K);

    //  Composite Simpson, fixed at 200 intervals.  Fixed rather than adaptive
    //  ON PURPOSE: an adaptive rule makes the answer depend on a tolerance
    //  nobody declared, and two runs of the same case could then differ in the
    //  last digits for reasons no reader could reconstruct.  200 intervals
    //  over any realistic (Tref, T) span puts the Simpson error far below the
    //  correlation's own accuracy, which is the honest bound here.
    const int n = 200;                         // even, as Simpson requires
    const scalar h = (T_K - Tref_K) / n;
    if (h == 0.0) return exact;
    scalar acc = departure(Tref_K) + departure(T_K);
    for (int i = 1; i < n; ++i)
        acc += (i % 2 ? 4.0 : 2.0) * departure(Tref_K + i * h);
    return exact + acc * h / 3.0;
}


scalar RowlinsonBondi::S(scalar T_K, scalar Tref_K) const
{
    announceRangeOnce(T_K);
    const scalar exact = cpIg_->S(T_K, Tref_K);
    const int n = 200;
    const scalar h = (T_K - Tref_K) / n;
    if (h == 0.0) return exact;
    auto f = [&](scalar t) { return departure(t) / t; };
    scalar acc = f(Tref_K) + f(T_K);
    for (int i = 1; i < n; ++i)
        acc += (i % 2 ? 4.0 : 2.0) * f(Tref_K + i * h);
    return exact + acc * h / 3.0;
}

}   // namespace Choupo
