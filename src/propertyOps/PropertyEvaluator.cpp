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

#include "PropertyEvaluator.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "unitOperations/saturation/BubblePoint.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>

namespace Choupo {
namespace propertyOps {

namespace {

// The heteroazeotrope of a partially-miscible BINARY at fixed P (the flat
// three-phase L-L-V line of the T-x-y).  Binary Gibbs rule: F = 0 at fixed P, so
// the V+Lα+Lβ coexistence is at a single temperature T_het.  We get the binodal
// (xα, xβ) from an LL flash and T_het from the lowest temperature at which the
// VLLE flash brings up a vapour over the two liquids (bisection); y* is that
// incipient vapour.  Returns exists=false for a miscible binary (no flat line).
struct Hetero { bool exists = false; scalar Thet = 0.0; sVector yStar; scalar xa = 0.0, xb = 0.0; };

Hetero findHetero(const ThermoPackage& thermo, scalar P_Pa)
{
    Hetero h;
    if (thermo.n() != 2) return h;
    // binodal at z = 0.5 (LL flash -- P-independent, the liquid split)
    FlashInput in; in.F = 1.0; in.P = P_Pa; in.z = sVector{0.5, 0.5};
    FlashOptions lo; lo.phaseSet = PhaseSet::LL; lo.verbosity = 0;
    in.T = 298.15;
    try {
        const FlashSolution s = IsothermalFlash::solveCore(in, thermo, lo);
        if (s.regime.find("two-phase liquid") == std::string::npos
            || s.x.size() != 2 || s.y.size() != 2
            || std::abs(s.x[0] - s.y[0]) < 1.0e-3) return h;      // miscible
        h.xa = std::min(s.x[0], s.y[0]);
        h.xb = std::max(s.x[0], s.y[0]);
    } catch (...) { return h; }

    FlashOptions vo; vo.phaseSet = PhaseSet::VLLE; vo.verbosity = 0;
    auto hasVapour = [&](scalar Tk) -> bool {
        FlashInput f; f.F = 1.0; f.T = Tk; f.P = P_Pa; f.z = sVector{0.5, 0.5};
        try {
            const FlashSolution s = IsothermalFlash::solveCore(f, thermo, vo);
            return s.betaVapor > 1.0e-6
                || (s.V_over_F > 1.0e-6 && s.regime.find("(LL") == std::string::npos);
        } catch (...) { return false; }
    };
    // bisect T on the LL -> vapour boundary = T_het (heteroazeotrope bubble)
    scalar Tlo = 250.0, Thi = 600.0;
    if (hasVapour(Tlo) || !hasVapour(Thi)) return h;             // no clean bracket
    for (int it = 0; it < 40 && (Thi - Tlo) > 0.02; ++it) {
        const scalar Tm = 0.5 * (Tlo + Thi);
        if (hasVapour(Tm)) Thi = Tm; else Tlo = Tm;
    }
    h.Thet = Thi;
    FlashInput f; f.F = 1.0; f.T = Thi + 0.05; f.P = P_Pa; f.z = sVector{0.5, 0.5};
    try {
        const FlashSolution s = IsothermalFlash::solveCore(f, thermo, vo);
        h.yStar = s.threePhase && s.xVapor.size() == 2 ? s.xVapor
                : (s.y.size() == 2 ? s.y : sVector{0.5, 0.5});
        h.exists = true;
    } catch (...) { return h; }
    return h;
}

// Compute-once-per-scan: the heteroazeotrope is a global of (components, P), but a
// 1-D T-x-y scan calls evaluateProperty per node.  Cache by (thermo, P) so the
// VLLE bisection runs once, not once per node.  The propertyScan1D path is
// single-threaded, so the bare map needs no lock.
const Hetero& cachedHetero(const ThermoPackage& thermo, scalar P_Pa)
{
    static std::map<std::pair<const void*, long>, Hetero> cache;
    const auto key = std::make_pair(static_cast<const void*>(&thermo),
                                    static_cast<long>(std::llround(P_Pa)));
    auto it = cache.find(key);
    if (it == cache.end())
        it = cache.emplace(key, findHetero(thermo, P_Pa)).first;
    return it->second;
}

// is x1 inside the open immiscibility gap (xα, xβ)?
bool inGap(const Hetero& h, scalar x1)
{
    return h.exists && x1 > h.xa + 1.0e-6 && x1 < h.xb - 1.0e-6;
}

} // namespace

scalar evaluateProperty(const std::string& propKey,
                        const ThermoPackage& thermo,
                        scalar T, scalar P_Pa,
                        const sVector& xLiquid)
{
    // Per-component properties of the form <prefix>_<componentName>.
    auto matchPerComp = [&](const std::string& prefix,
                            std::size_t& compIdxOut) -> bool
    {
        if (propKey.size() <= prefix.size() + 1) return false;
        if (propKey.compare(0, prefix.size(), prefix) != 0) return false;
        if (propKey[prefix.size()] != '_') return false;
        const std::string name = propKey.substr(prefix.size() + 1);
        try {
            compIdxOut = thermo.indexOf(name);
            return true;
        } catch (...) { return false; }
    };

    std::size_t i = 0;

    if (matchPerComp("Psat", i))
    {
        // Guard: a component with no vaporPressure model (e.g. a combustion
        // radical, an ion, a nonvolatile solute) would otherwise dereference a
        // null model and SEGFAULT.  Fail loudly so callers (PropertyScan*) can
        // catch it and write nan instead of crashing the whole run.
        const Component& c = thermo.comp(i);
        if (!c.hasVaporPressure())
            throw std::runtime_error(
                "Psat: '" + c.name()
                + "' has no vapour-pressure model (not a volatile component)");
        // PHYSICAL WALL: a vapour pressure does NOT exist above the critical
        // temperature -- there is no liquid/vapour coexistence past Tc.  The
        // Antoine/Wagner correlation, if asked, will happily extrapolate into a
        // meaningless number (N2 at 290 K -> ~600 bar).  Refuse it so the scan
        // writes nan and the curve BREAKS at Tc (no-silent-crutch credo).
        if (c.Tc() > 0.0 && T > c.Tc())
            throw std::runtime_error(
                "Psat: '" + c.name() + "' is supercritical over (part of) the "
                "range (Tc = " + std::to_string(c.Tc())
                + " K) -- no vapour pressure exists above the critical point");
        return c.vp().Psat_Pa(T);
    }

    if (matchPerComp("gamma", i))
        return thermo.activity().gamma(T, xLiquid)[i];

    // y_eq_<comp>: mole fraction of <comp> in the VAPOUR in equilibrium
    // with the supplied liquid composition `xLiquid` at the given P.
    // Solves the bubble-point internally and returns yᵢ.  Together with
    // T_bubble this gives the dew curve of a T-x-y diagram --- the
    // CsvAutoPlot recognises the (x[<comp>], T_bubble, y_eq_<comp>)
    // header trio and renders a classical T-x-y plot.
    if (matchPerComp("y_eq", i))
    {
        // Across the immiscibility gap the vapour is the FIXED heteroazeotrope y*
        // (the flat three-phase line), not the homogeneous bubble vapour.
        if (thermo.n() == 2)
        {
            const Hetero& h = cachedHetero(thermo, P_Pa);
            if (inGap(h, xLiquid[0]) && i < h.yStar.size()) return h.yStar[i];
        }
        auto r = BubblePoint::compute(thermo, xLiquid, P_Pa);
        if (!r.converged)
            throw std::runtime_error(
                "y_eq: bubble-point Newton did not converge at this point");
        return r.y[i];
    }

    // Cp_liquid_<comp>: PURE-component liquid molar heat capacity [J/(mol·K)]
    // at the scan T --- one curve per compound, composition-independent (the
    // Explorer's pure-component comparison).  Honest gap: a compound without a
    // liquidHeatCapacity block fails loudly rather than substituting Cp_ig.
    if (matchPerComp("Cp_liquid", i))
    {
        if (!thermo.comp(i).hasCpLiquid())
            throw std::runtime_error(
                "Cp_liquid: no liquidHeatCapacity model for '"
                + thermo.comp(i).name() + "' (it has only an ideal-gas Cp)");
        return thermo.comp(i).cpLiquid().Cp(T);
    }

    if (propKey == "T")        return T;
    if (propKey == "P")        return P_Pa;
    if (propKey == "Cp_ig")    return thermo.Cp_ig(T, xLiquid);
    if (propKey == "H_ig")     return thermo.H_ig(T, xLiquid);
    if (propKey == "S_ig")     return thermo.S_ig(T, P_Pa, xLiquid);
    if (propKey == "Z")        return thermo.eos().Z(T, P_Pa, xLiquid);
    if (propKey == "v_molar")  return thermo.eos().molarVolume(T, P_Pa, xLiquid);
    if (propKey == "H_R")      return thermo.eos().H_residual(T, P_Pa, xLiquid);
    if (propKey == "S_R")      return thermo.eos().S_residual(T, P_Pa, xLiquid);
    if (propKey == "H_real")   return thermo.H_real(T, P_Pa, xLiquid);
    if (propKey == "S_real")   return thermo.S_real(T, P_Pa, xLiquid);
    if (propKey == "viscosity" || propKey == "viscosity_gas" || propKey == "mu")
        return thermo.viscosityGas(T, xLiquid);   // Pa·s (low-pressure gas)
    if (propKey == "thermal_conductivity" || propKey == "thermalConductivity"
        || propKey == "k_gas" || propKey == "k")
        return thermo.thermalConductivityGas(T, xLiquid);   // W/(m·K)
    if (propKey == "diffusivity" || propKey == "D_gas" || propKey == "D")
        return thermo.diffusivityGas(T, P_Pa, 0, 1);        // m²/s (comps 0,1)
    if (propKey == "viscosity_liquid" || propKey == "mu_L")
        return thermo.viscosityLiquid(T, xLiquid);          // Pa·s (sat. liquid)
    if (propKey == "thermal_conductivity_liquid" || propKey == "k_liquid"
        || propKey == "k_L")
        return thermo.thermalConductivityLiquid(T, xLiquid); // W/(m·K)
    if (propKey == "diffusivity_liquid" || propKey == "D_liquid"
        || propKey == "D_L")
        return thermo.diffusivityLiquid(T, 0, 1);           // m²/s (solute 0, solvent 1)
    if (propKey == "surface_tension" || propKey == "surfaceTension"
        || propKey == "sigma")
        return thermo.surfaceTension(T, xLiquid);           // N/m

    if (propKey == "T_bubble")
    {
        // Across the immiscibility gap the boiling temperature is the FLAT
        // heteroazeotrope T_het (the three-phase L-L-V line), constant in x ---
        // not the phantom homogeneous bubble that a single-liquid solve would draw.
        if (thermo.n() == 2)
        {
            const Hetero& h = cachedHetero(thermo, P_Pa);
            if (inGap(h, xLiquid[0])) return h.Thet;
        }
        auto r = BubblePoint::compute(thermo, xLiquid, P_Pa);
        if (!r.converged)
            throw std::runtime_error(
                "T_bubble: Newton-1D did not converge at this point");
        return r.T;
    }

    // liquid_stable: 1 if the liquid at xLiquid is a single stable phase, 0 if a
    // Michelsen TPD finds a liquid-liquid split (the homogeneous bubble curve is a
    // PHANTOM there -- the T-x-y assumes one liquid).  Tested at the bubble-T so
    // the report matches the boiling envelope the student sees.  No silent crutch:
    // this is what lets the GUI mark the gap instead of drawing through it.
    if (propKey == "liquid_stable")
    {
        // A reliable liquid-liquid verdict needs the FLASH, not the bare TPD
        // (Michelsen TPD is a permissive screen that over-triggers — the flash
        // confirms).  Run the LL Gibbs-min at xLiquid at the bubble-T and report
        // a split only when the two liquids are genuinely distinct.  Same
        // criterion PropertyScanBinary uses for its binodal.
        auto r = BubblePoint::compute(thermo, xLiquid, P_Pa);
        const scalar Ttest = r.converged ? r.T : T;
        FlashInput in;
        in.F = 1.0; in.T = Ttest; in.P = P_Pa; in.z = xLiquid;   // FlashInput.P is Pa (SI)
        FlashOptions opts;
        opts.phaseSet = PhaseSet::LL;
        opts.verbosity = 0;
        try
        {
            const FlashSolution sol = IsothermalFlash::solveCore(in, thermo, opts);
            const bool split = sol.regime.find("two-phase liquid") != std::string::npos
                && sol.x.size() == 2 && sol.y.size() == 2
                && std::abs(sol.x[0] - sol.y[0]) > 1.0e-3;
            return split ? 0.0 : 1.0;
        }
        catch (const std::exception&) { return 1.0; }   // no split found -> stable
    }

    throw std::runtime_error(
        "PropertyEvaluator: unknown property '" + propKey
      + "'.  See PropertyEvaluator.H for the catalogue.");
}

} // namespace propertyOps
} // namespace Choupo
