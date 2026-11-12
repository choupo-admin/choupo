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
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>

namespace Choupo {

// BUILDER ctor: the ThermoPackageBuilder hands us a FULLY-RESOLVED assembly
// (kernel + Ksp + enthalpy state, all resolved from the unified substance records via the
// SaltFromCatalogue helpers).  Set EVERY member explicitly -- no silent header
// default -- so the package path is byte-identical to the legacy configure() tail.
ElectrolyteActivity::ElectrolyteActivity(std::vector<std::string> names,
                                         ElectrolyteAssembly a)
:   n_(names.size()), names_(std::move(names)),
    model_(a.isOlsson ? "OlssonNaOH" : (a.isENRTL ? "eNRTL" : "pitzer")),
    isENRTL_(a.isENRTL),
    salt_(std::move(a.pitzer)), enrtl_(std::move(a.enrtl)),
    soluteIdx_(a.soluteIdx), solventIdx_(a.solventIdx),
    solventMW_(a.solventMW), solubility_(a.solubility),
    calorimetricFit_(a.calorimetricFit), hasAqRef_(a.hasAqRef),
    //  DECLARATION ORDER, exactly: members are constructed in the order they
    //  are declared in the header, never in the order written here, and a list
    //  that disagrees reads as a promise the compiler does not keep.
    //  (`lphiValidityMax_` is declared AFTER `ccAvail_`, so it is initialised
    //  after it whatever this list says.)
    hfAqSum_(a.hfAqSum), cpAqSum_(a.cpAqSum),
    ccAvail_(a.ccAvail), lphiValidityMax_(a.lphiValidityMax),
    dHsolution_(a.dHsolution), soluteName_(std::move(a.soluteName))
{
    for (int k = 0; k < 5; ++k) ccNodes_[k] = a.ccNodes[k];
    if (isENRTL_) enrtl_.Mw = solventMW_;
    isOlsson_ = a.isOlsson;
    olsson_   = std::move(a.olsson);
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

// ===========================================================================
//  THE OlssonNaOH ROUTE (C377 (b), 2026-11-12).  Theory Guide sec:olsson-naoh;
//  docs/design/naoh-water-olsson1997.md.
//
//  Above `toMolality` the Olsson-Jernqvist-Aly correlations; below
//  `fromMolality` the Na-OH Pitzer pair (calorimetrically fitted to Parker up
//  to 6 mol/kg at 25 C); in between, ln a_w and L_phi are each blended with a
//  smooth step.  Above the band L_phi carries the paper's FULL temperature
//  dependence (its measured heat capacities), on the package's own
//  infinite-dilution leg, plus ONE constant fixed at 25 C where the Pitzer pair
//  is calibrated (olssonLphiOffset_).
// ===========================================================================

namespace {
//  0 at u <= 0, 1 at u >= 1, C1 in between (3u^2 - 2u^3).
scalar smoothStep(scalar u)
{
    if (u <= 0.0) return 0.0;
    if (u >= 1.0) return 1.0;
    return u * u * (3.0 - 2.0 * u);
}
} // namespace

void ElectrolyteActivity::olssonWindow_(electrolyte::OlssonNaOH::Property p,
                                        const char* what, scalar m, scalar T) const
{
    //  One line per property per run (the AdvisoryLog keeps it per pass);
    //  the latch skips the lock and the string on the hot path.
    static std::set<std::string> said;
    const scalar t = T - 273.15;
    const scalar x = olsson_.xOfMolality(m);
    if (olsson_.inWindow(p, x, t)) return;
    const std::string key = std::string("olssonWindow:") + what;
    if (said.count(key)) return;
    said.insert(key);
    std::ostringstream os;
    os << what << " of NaOH(aq) at " << std::fixed << std::setprecision(1)
       << t << " degC and " << std::setprecision(1) << 100.0 * (1.0 - x)
       << " wt % NaOH lies OUTSIDE the window Olsson, Jernqvist & Aly (1997)"
          " declare for it (" << olsson_.tLow(p) << "-" << olsson_.tHigh(p)
       << " degC; at this temperature water mass fraction >= "
       << std::setprecision(3) << olsson_.xMinAt(p, t)
       << ") -- the correlation is EXTRAPOLATED there.";
    if (AdvisoryLog::instance().addAnnouncedOnce(key, "electrolyte", "warning",
            "OlssonNaOH", os.str(), /*echoUnderTrial=*/false))
        std::cerr << "[OlssonNaOH] " << os.str() << "\n";
}

scalar ElectrolyteActivity::olssonWaterActivity_(scalar m, scalar T) const
{
    const scalar mF = olsson_.handoverFrom(), mT = olsson_.handoverTo();
    if (m <= mF) { salt_.span.check(T); return salt_.waterActivity(m, T); }
    olssonWindow_(electrolyte::OlssonNaOH::Property::vapourPressure,
                  "the water activity (vapour-pressure correlation)", m, T);
    const scalar lnO = olsson_.lnAw(olsson_.xOfMolality(m), T - 273.15);
    if (m >= mT) return std::exp(lnO);
    salt_.span.check(T);
    const scalar s   = smoothStep((m - mF) / (mT - mF));
    const scalar lnP = std::log(salt_.waterActivity(m, T));
    return std::exp((1.0 - s) * lnP + s * lnO);
}

scalar ElectrolyteActivity::olssonOsmotic_(scalar m, scalar T) const
{
    if (m <= olsson_.handoverFrom()) { salt_.span.check(T); return salt_.osmoticCoefficient(m, T); }
    //  The definition, on the same a_w: ln a_w = -phi nu m M_w.
    const scalar nu = salt_.nu_c + salt_.nu_a;
    return -std::log(olssonWaterActivity_(m, T)) / (nu * m * solventMW_ * 1.0e-3);
}

scalar ElectrolyteActivity::olssonGammaPM_(scalar m, scalar T) const
{
    //  GIBBS-DUHEM at constant T from the osmotic coefficient, started at the
    //  handover where the Pitzer gamma is known:
    //    ln g(m) = ln g(m0) + [phi(m) - 1] - [phi(m0) - 1] + int_m0^m (phi-1)/m' dm'
    //  (the integral form of n_w d ln a_w + n_s d ln a_s = 0).  Simpson, 64
    //  intervals: phi is smooth above m0 and the integrand has no singularity.
    const scalar m0 = olsson_.handoverFrom();
    salt_.span.check(T);
    if (m <= m0) return salt_.gammaPM(m, T);
    const int n = 64;
    const scalar h = (m - m0) / n;
    auto f = [&](scalar mm) { return (olssonOsmotic_(mm, T) - 1.0) / mm; };
    scalar s = f(m0) + f(m);
    for (int i = 1; i < n; ++i) s += f(m0 + i * h) * ((i % 2) ? 4.0 : 2.0);
    const scalar integral = s * h / 3.0;
    return salt_.gammaPM(m0, T)
         * std::exp(olssonOsmotic_(m, T) - salt_.osmoticCoefficient(m0, T) + integral);
}

scalar ElectrolyteActivity::pitzerLphi_(scalar m, scalar T) const
{
    //  The Pitzer FD L_phi of apparentMolarEnthalpy, on the Pitzer kernel
    //  itself (the routed osmotic()/gammaPM() would be the blended surface).
    if (m <= 1.0e-12) return 0.0;
    const scalar nu = salt_.nu_c + salt_.nu_a, dT = 0.05;
    auto gex = [&](scalar TT)
    { return nu * ((1.0 - salt_.osmoticCoefficient(m, TT)) + std::log(salt_.gammaPM(m, TT))); };
    return -constant::R * T * T * (gex(T + dT) - gex(T - dT)) / (2.0 * dT);
}

scalar ElectrolyteActivity::olssonLphi_(scalar m, scalar T) const
{
    const scalar mF = olsson_.handoverFrom(), mT = olsson_.handoverTo();
    salt_.span.check(T);
    if (m <= mF) return pitzerLphi_(m, T);
    olssonWindow_(electrolyte::OlssonNaOH::Property::enthalpy,
                  "the solution enthalpy (enthalpy correlation)", m, T);
    const scalar LO = olssonLphiCorrelation_(m, T);
    if (m >= mT) return LO;
    const scalar s = smoothStep((m - mF) / (mT - mF));
    return (1.0 - s) * pitzerLphi_(m, T) + s * LO;
}

scalar ElectrolyteActivity::olssonLphiCorrelation_(scalar m, scalar T) const
{
    //  THE CONVERSION.  The paper's H is per kg of solution, on liquid water at
    //  0 C and NaOH infinitely dilute at 20 C (p. 786), so per mole of NaOH
    //      Phi(m,t) = M_s [H(x,t) - x H(1,t)] / (1-x)
    //               = [Hbar_inf(t) - Hbar_inf(20 C)] + L_phi(m,t)       (paper)
    //  and the package writes the salt as hfAq + Hinf(T) + L_phi, Hinf being
    //  its own infinite-dilution leg cpAvg(T) (T - 298.15) (Criss-Cobble).  So
    //      L_phi(m,T) = Phi(m,t) - [Hinf(T) - Hinf(293.15)] + delta,
    //  and the package's solution enthalpy is then EXACTLY the paper's
    //  temperature dependence: the Criss-Cobble leg cancels.  delta is ONE
    //  constant: the correlation cannot resolve the infinite-dilution limit
    //  (0.32 kJ/kg of solution is 1.3 kJ/mol of NaOH at 1 mol/kg), so it is
    //  fixed where the Pitzer pair IS calibrated -- Parker, 25 C, at the top of
    //  the handover band -- and carried unchanged to every T and m.
    auto Hinf = [&](scalar TT) { return cpAvg25T_(TT) * (TT - 298.15); };
    if (!olssonOffsetSet_)
    {
        const scalar mT = olsson_.handoverTo(), T0 = 298.15;
        olssonLphiOffset_ = pitzerLphi_(mT, T0)
            - (olsson_.Phi(mT, T0 - 273.15) - (Hinf(T0) - Hinf(293.15)));
        olssonOffsetSet_ = true;
    }
    return olsson_.Phi(m, T - 273.15) - (Hinf(T) - Hinf(293.15)) + olssonLphiOffset_;
}

scalar ElectrolyteActivity::lphiConsistencyGap(scalar m, scalar T) const
{
    //  THE GIBBS-HELMHOLTZ CHECK (C377 b, part 2): the heat of diluting the
    //  solution at m to 20 wt %, from the vapour-pressure correlation through
    //  L1 = -R T^2 d ln a_w/dT and from the enthalpy correlation, minus each
    //  other [kJ/kg of solution].  Only where the correlation prices the
    //  surface (above the handover); the Pitzer part is consistent by
    //  construction.  Evaluated at the state a consumer publishes, never on
    //  the hot path (OlssonNaOH::gibbsHelmholtzGap integrates 200 steps).
    if (!isOlsson_ || m <= olsson_.handoverTo()) return 0.0;
    return olsson_.gibbsHelmholtzGap(olsson_.xOfMolality(m), T - 273.15);
}

scalar ElectrolyteActivity::olssonLphiMaxAt_(scalar T) const
{
    const scalar xMin = olsson_.xMinAt(electrolyte::OlssonNaOH::Property::enthalpy,
                                       T - 273.15);
    return xMin >= 1.0 ? 0.0 : olsson_.molalityOfX(xMin);
}

} // namespace Choupo
