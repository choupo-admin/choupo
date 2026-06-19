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

#include "Heater.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Heater::solve(const DictPtr& dict,
                  const ThermoPackage& thermo,
                  int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F    = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);
    const scalar Tref = operDict->lookupScalarOrDefault("Tref", 298.15);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    if (operDict->found("Tout"))
    {
        throw std::runtime_error(
            "Heater: 'Tout' is no longer a valid OP parameter.  "
            "Specify the absolute power 'Q' [W or kW] instead; the outlet "
            "temperature is now a RESULT, not a spec.  For 'I need T_out = X' "
            "wrap the unit in a DesignSpec that manipulates $Q with a target "
            "on this unit's `out.T` or `T_out`.");
    }
    if (!operDict->found("Q"))
    {
        throw std::runtime_error(
            "Heater: must specify 'Q' [W or kW] -- the absolute thermal "
            "power delivered to the stream.  T_out is a result.");
    }

    // Q in W (SI).  Positive = heating, negative = cooling.
    const scalar Q_W = operDict->lookupScalar("Q", Dims::power);

    // F is kmol/s SI; mol/s = F * 1000.  Q per mol of feed = Q_W / F_mol_s.
    const scalar F_mol_s   = F * 1000.0;
    const scalar Q_per_mol = Q_W / F_mol_s;             // J/mol

    // Phase-aware enthalpy.  A GAS stream (vf high) uses the
    // ideal-gas enthalpy H_ig --- its components may carry no liquid Cp
    // (e.g. N2 / O2) and Hliquid would throw or be wrong; a LIQUID stream
    // uses Hliquid.  The energy balance H_out - H_in = Q is reference-
    // consistent as long as ONE datum is used on both sides (it is).
    const scalar vf_in  = feedDict->lookupScalarOrDefault("vf", 0.0);
    const bool   useGas = vf_in >= 0.5;
    auto Hfun = [&](scalar T) {
        return useGas ? thermo.H_ig(T, z) : thermo.Hliquid(T, z, Tref);
    };

    // Inlet enthalpy [J/mol], target outlet enthalpy.
    const scalar H_in     = Hfun(T_in);
    const scalar H_target = H_in + Q_per_mol;

    auto f  = [&](scalar T) { return Hfun(T) - H_target; };
    auto df = [&](scalar T) {
        const scalar dT = 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };

    solver::NROptions nro;
    nro.tolerance          = 1.0;       // J/mol -- fine enough
    nro.maxIter            = 30;
    nro.lower              = 200.0;
    nro.upper              = useGas ? 3000.0 : 700.0;   // gas combustors reach >1000 K
    nro.bracket            = true;
    nro.monotoneIncreasing = true;
    nro.maxStep            = 50.0;

    if (verbosity >= 3)
    {
        std::cout << "Newton on T_out (energy balance):\n"
                  << "   it       T [K]        f(T)          df/dT          dT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        }
    };
    auto r = solver::newton1D(f, df, T_in, nro);
    const scalar T_out    = r.x;
    const bool   converged = r.converged;
    const int    iters     = r.iterations;

    // ---- Dome guard: a heater is SENSIBLE-ONLY ---------------------------
    // If the converged outlet temperature crosses the saturation line of the
    // dominant (or pure) component at the operating pressure, the stream is
    // changing phase -- a heater cannot represent that (it carries no latent
    // duty and emits a fixed-vf stream).  Refuse loudly and point at the
    // phaseChanger.  Inert on legacy single-phase heater cases by
    // construction (T_in and T_out stay on the same side of Tsat).
    if (converged)
    {
        // Dominant component.
        std::size_t dom = 0;
        for (std::size_t i = 1; i < n; ++i) if (z[i] > z[dom]) dom = i;
        scalar Tsat = -1.0;
        if (thermo.hasPureFluid(dom) && ThermoPackage::isEffectivelyPure(z, dom))
            Tsat = thermo.pureFluid(dom).T_sat(P_in);
        else if (thermo.comp(dom).hasVaporPressure())
        {
            const auto& vp = thermo.comp(dom).vp();
            // Only attempt the inversion when P is within the curve's range to
            // avoid extrapolation noise; bisection on Psat(T) = P.
            scalar lo = 150.0, hi = 1200.0;
            const scalar Plo = vp.Psat_Pa(lo), Phi = vp.Psat_Pa(hi);
            if ((Plo - P_in) * (Phi - P_in) < 0.0)
            {
                for (int it = 0; it < 90; ++it)
                {
                    const scalar mid = 0.5 * (lo + hi);
                    if (vp.Psat_Pa(mid) < P_in) lo = mid; else hi = mid;
                }
                Tsat = 0.5 * (lo + hi);
            }
        }
        if (Tsat > 0.0)
        {
            const scalar lo = std::min(T_in, T_out), hi = std::max(T_in, T_out);
            // Strict interior crossing (a tolerance so endpoints sitting exactly
            // on Tsat -- a saturated feed held single-phase -- do not trip).
            const scalar tol = 1.0e-3;
            if (Tsat > lo + tol && Tsat < hi - tol)
                throw std::runtime_error(
                    "heater outlet crosses the saturation dome at Tsat="
                    + std::to_string(Tsat) + " K (T_in=" + std::to_string(T_in)
                    + " K, T_out=" + std::to_string(T_out) + " K, P="
                    + std::to_string(P_in / 1.0e5) + " bar); a heater is "
                    "sensible-only -- use a phaseChanger/boiler/condenser.");
        }
    }

    const scalar duty_kW     = Q_W / 1000.0;
    const scalar duty_kJkmol = Q_per_mol;        // J/mol = kJ/kmol

    std::cout << "\n============================  Heater Result  =========================\n"
              << "  Converged:       " << (converged ? "yes" : "NO")
              << "\n  Newton iters:    " << iters
              << "\n  Q (hardware):    " << std::fixed << std::setprecision(4)
              << duty_kW << "  kW  (input)\n"
              << "  T_in:            " << std::fixed << std::setprecision(2)
              << T_in  << "  K  ( " << (T_in  - 273.15) << " degC )\n"
              << "  T_out:           " << std::fixed << std::setprecision(2)
              << T_out << "  K  ( " << (T_out - 273.15) << " degC )   <- result\n"
              << "  dT:              " << std::fixed << std::setprecision(2)
              << (T_out - T_in) << "  K\n"
              << "  H_in:            " << std::scientific << std::setprecision(4)
              << H_in << "  J/mol\n"
              << "  H_out:           " << Hfun(T_out) << "  J/mol\n"
              << "  Phase basis:     " << (useGas ? "ideal gas (H_ig)" : "liquid (Hliquid)") << "\n"
              << "  Q (specific):    " << std::fixed << std::setprecision(2)
              << duty_kJkmol << "  J/mol  (= kJ/kmol)\n"
              << "  Mode:            " << (Q_W > 0 ? "HEATER" : "COOLER") << "\n"
              << "=====================================================================\n\n";

    // -- Produced stream --------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T_out;
    out.P    = P_in;
    out.z    = z;
    out.vf   = useGas ? 1.0 : 0.0;
    produced_.push_back(out);

    // -- KPIs --------------------------------------------------------------
    kpis_.clear();
    kpis_["Q"]         = Q_W;                // SI canonical (W)
    kpis_["Q_kW"]      = duty_kW;
    kpis_["Q_per_mol"] = Q_per_mol;
    kpis_["T_in"]      = T_in;
    kpis_["T_out"]     = T_out;
    kpis_["dT"]        = T_out - T_in;
    kpis_["F"]         = F;
    kpis_["P"]         = P_in;

    return converged ? 0 : 1;
}

} // namespace Choupo
