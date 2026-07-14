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

#include "ElectrolyteActivity.H"

#include "thermo/Component.H"
#include "core/Advisory.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

// BUILDER ctor: the ThermoPackageBuilder hands us a FULLY-RESOLVED assembly
// (kernel + Ksp + enthalpy state, all resolved from the new-format records via the
// SaltFromCatalogue helpers).  Set EVERY member explicitly -- no silent header
// default -- so the package path is byte-identical to the legacy configure() tail.
ElectrolyteActivity::ElectrolyteActivity(std::vector<std::string> names,
                                         ElectrolyteAssembly a)
:   n_(names.size()), names_(std::move(names)),
    model_(a.isENRTL ? "eNRTL" : "pitzer"), isENRTL_(a.isENRTL),
    salt_(std::move(a.pitzer)), enrtl_(std::move(a.enrtl)),
    soluteIdx_(a.soluteIdx), solventIdx_(a.solventIdx),
    solventMW_(a.solventMW), solubility_(a.solubility),
    calorimetricFit_(a.calorimetricFit), hasAqRef_(a.hasAqRef),
    hfAqSum_(a.hfAqSum), cpAqSum_(a.cpAqSum), lphiValidityMax_(a.lphiValidityMax),
    ccAvail_(a.ccAvail),
    dHsolution_(a.dHsolution), soluteName_(std::move(a.soluteName))
{
    for (int k = 0; k < 5; ++k) ccNodes_[k] = a.ccNodes[k];
    if (isENRTL_) enrtl_.Mw = solventMW_;
    configured_ = true;
}

sVector ElectrolyteActivity::gamma(scalar T_K, const sVector& x) const
{
    sVector g(n_, 1.0);                 // salt is nonvolatile (K=0) -> gamma irrelevant
    if (!configured_) return g;
    const scalar xw = x[solventIdx_];
    const scalar xs = x[soluteIdx_];
    if (xw > 1.0e-12 && xs > 0.0)
    {
        const scalar m = 1000.0 * xs / (xw * solventMW_);   // mol salt / kg solvent
        g[solventIdx_] = waterActivity(m, T_K) / xw;        // gamma_w = a_w / x_w (routed, T-aware)
    }
    return g;
}

scalar ElectrolyteActivity::saturationKsp(scalar T) const
{
    if (solubility_ <= 0.0) return 0.0;
    const scalar nu = isENRTL_ ? (enrtl_.nu_c + enrtl_.nu_a) : (salt_.nu_c + salt_.nu_a);
    // Ksp anchored at the 25 C solubility datum (gamma_pm and m_sat at 25 C).
    const scalar Ksp25 = std::pow(gammaPM(solubility_, 298.15) * solubility_, nu);

    // The van't Hoff driver is the DIFFERENTIAL heat of solution AT SATURATION,
    //   dH_diff(m_sat) = dH_soln_inf + L2_bar(m_sat),  L2_bar = L_phi + m dL/dm
    // -- NOT the infinite-dilution dH alone.  The difference flips the SIGN of
    // d(solubility)/dT for NaOH-class salts: dH_inf = -44.5 kJ/mol (exothermic,
    // would say solubility falls with T) while L2_bar(m_sat) is large positive,
    // so dH_diff > 0 and solubility RISES with T -- the real caustic behaviour.
    // GATED like every L_phi consumer: the correction applies only when the
    // salt's surface is calorimetrically fitted (Pitzer T-slots) AND the ion
    // tier exists; unfitted salts keep the legacy infinite-dilution form
    // byte-identically.  An m_sat beyond the fitted window still corrects the
    // sign but is announced as an extrapolation (deduped advisory).
    scalar dH = dHsolution_;
    if (calorimetricFit_ && hasAqRef_)
    {
        dH += partialMolarRelativeEnthalpy(solubility_, 298.15);
        if (lphiValidityMax_ > 0.0 && solubility_ > lphiValidityMax_)
            AdvisoryLog::instance().add("electrolyte", "warning",
                "salt '" + soluteName_ + "'",
                "Ksp(T) uses the differential heat of solution at m_sat = "
                + std::to_string(solubility_) + " mol/kg, beyond the L_phi fit"
                " window (<= " + std::to_string(lphiValidityMax_)
                + ") -- the T-shift is sign-correct but extrapolated.");
    }
    if (dH == 0.0) return Ksp25;                             // flat in T (e.g. NaCl, ~T-independent)
    // van't Hoff shift to T: Ksp(T) = Ksp(298) exp[-dH_diff/R (1/T - 1/298)].
    constexpr scalar R = 8.314462618;                        // J/(mol K)
    return Ksp25 * std::exp(-dH / R * (1.0 / T - 1.0 / 298.15));
}

} // namespace Choupo
