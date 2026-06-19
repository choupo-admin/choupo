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

void ElectrolyteActivity::configure(const std::vector<Component>& comps)
{
    // The salt = the component carrying an electrolyte{} block; the solvent =
    // the volatile carrier (water).  Loud failure (no silent crutch) if either
    // is missing -- a salt with no electrolyte{} block under model pitzer is a
    // mis-specified package.
    //  The REFERENCE solvent is water -- the volatile WITHOUT a declared
    //  relativePermittivity.  Antisolvents (ethanol, ...) carry one and are NOT
    //  the reference (the eNRTL tau / the molality basis are anchored on water);
    //  picking the last volatile would wrongly make ethanol the solvent (its Mw
    //  46 vs water 18) and corrupt the molality scale.
    const std::size_t N = comps.size();
    std::size_t salt = N, solv = N;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (comps[i].hasElectrolyteSpec()) { if (salt == N) salt = i; }
        else if (comps[i].hasVaporPressure())
        {
            if (solv == N
             || (comps[solv].relativePermittivity() > 0.0 && comps[i].relativePermittivity() == 0.0))
                solv = i;          // prefer the zero-permittivity reference (water)
        }
    }
    if (salt == comps.size())
        throw std::runtime_error("activityModel pitzer: no component carries an "
            "electrolyte{} block (the salt's cation/anion/solubility).");
    if (solv == comps.size())
        throw std::runtime_error("activityModel pitzer: no solvent (a volatile "
            "component, e.g. water) in the package.");

    const std::string cat = comps[salt].electrolyteCation();
    const std::string an  = comps[salt].electrolyteAnion();
    soluteIdx_  = salt;
    solventIdx_ = solv;
    soluteName_ = comps[salt].name();
    solventMW_  = comps[solv].MW();
    solubility_ = comps[salt].electrolyteSolubility();
    dHsolution_ = comps[salt].electrolyteDissolutionEnthalpy();   // J/mol; 0 -> Ksp flat in T
    if (isENRTL_) { enrtl_ = electrolyte::loadENRTL(cat, an); enrtl_.Mw = solventMW_; }
    else            salt_  = electrolyte::loadSalt(cat, an);
    // Calorimetric-fit flag (slice 3): true only when the pair row carries
    // T-slots regressed against measured heats of dilution.  Gates L_phi.
    // The calorimetric fit is per-KERNEL: the pairs.dat T-slots were regressed
    // for the Pitzer surface, so an eNRTL package must NOT inherit the flag --
    // its tau(T) is still the anchored (uncalibrated) form.  An eNRTL/mixed-
    // solvent calorimetric row is its own future curation act.
    calorimetricFit_ = !isENRTL_ && electrolyte::pairCalorimetricFit(cat, an);
    // Slice-4 enthalpy branch inputs: the ions' aqueous infinite-dilution
    // reference (slice-2 tier) + the fitted-data molality window.
    {
        const double nuC = isENRTL_ ? enrtl_.nu_c : salt_.nu_c;
        const double nuA = isENRTL_ ? enrtl_.nu_a : salt_.nu_a;
        double hf = 0.0, cp = 0.0;
        hasAqRef_ = electrolyte::ionAqReference(cat, an, nuC, nuA, hf, cp);
        hfAqSum_ = hf; cpAqSum_ = cp;
        auto pr = electrolyte::findPair("pairs.dat", "pairs", cat, an);
        lphiValidityMax_ = pr ? pr->lookupScalarOrDefault("lphiValidityMax", 0.0) : 0.0;
    }
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
