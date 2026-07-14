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

#include "MultiStreamHX.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <set>
#include <stdexcept>
#include <vector>

namespace Choupo {

int MultiStreamHX::solve(const DictPtr& dict,
                         const ThermoPackage& thermo,
                         int verbosity)
{
    // ---- Inputs: any number of process streams -------------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() < 2)
        throw std::runtime_error("MultiStreamHX: expected at least 2 input"
            " streams; got " + std::to_string(ins.size()) + ".  Declare in"
            " flowsheetDict as  inputs ( hot1 hot2 cold1 ... );");
    const std::size_t n = thermo.n();

    // Enthalpy datum: formation reference when every component carries
    // gibbsFormation (so a stream that flashes inside the unit is summed
    // consistently), else the sensible Hliquid datum.  For a non-reacting
    // exchanger the per-component zero cancels in h_out - h_in either way.
    bool useFormation = true;
    for (std::size_t i = 0; i < n; ++i)
        if (!thermo.comp(i).hasGibbsData()) { useFormation = false; break; }
    const scalar Tref = 298.15;
    auto hStream = [&](scalar T, scalar P, scalar vf, const sVector& z) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, vf, z)
                            : thermo.Hliquid(T, z, Tref);
    };

    // ---- Outlet target temperatures (the spec) -------------------------
    // operation.outlet { <streamName> { T <value>; [vf <value>;] } }
    // Every inlet MUST have a target -- the unit VERIFIES the balance, it
    // does not back-compute a missing outlet (no-magic credo).
    auto oper = dict->subDict("operation");
    if (!oper->found("outlet"))
        throw std::runtime_error("MultiStreamHX: missing `operation.outlet"
            " { <stream> { T <K>; } ... }` -- each inlet needs an outlet"
            " target temperature (this unit VERIFIES the energy balance).");
    auto outDict = oper->subDict("outlet");

    // tolerance: fractional imbalance allowed (default 1 %).
    const scalar tolFrac = oper->lookupScalarOrDefault("tolerance", 0.01);

    // ---- Per-stream read + duty ----------------------------------------
    struct StreamInfo
    {
        std::string name;
        scalar      F = 0, T_in = 0, T_out = 0, P = 0, vf_in = 0, vf_out = 0;
        sVector     z;
        scalar      h_in = 0, h_out = 0;
        scalar      Q = 0;          // F * (h_out - h_in)   [W]
    };
    std::vector<StreamInfo> S;
    S.reserve(ins.size());

    scalar Q_hot = 0.0, Q_cold = 0.0;     // hot: releasing (Q<0); cold: absorbing (Q>0)

    for (const auto& sd : ins)
    {
        StreamInfo s;
        s.name  = sd->name();
        s.F     = sd->lookupScalar("F");                      // kmol/s (SI)
        s.T_in  = sd->lookupScalar("T");
        s.P     = sd->lookupScalar("P");
        s.vf_in = sd->lookupScalarOrDefault("vf", 0.0);

        s.z.assign(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar zsum = 0.0;
        for (const auto& k : cd->keys()) { s.z[thermo.indexOf(k)] = cd->lookupScalar(k); zsum += cd->lookupScalar(k); }
        if (zsum > 0.0) for (auto& v : s.z) v /= zsum;

        if (!outDict->found(s.name))
            throw std::runtime_error("MultiStreamHX: no outlet target for"
                " inlet '" + s.name + "'.  Add  operation.outlet { " + s.name
                + " { T <K>; } }.");
        auto od    = outDict->subDict(s.name);
        s.T_out    = od->lookupScalar("T", Dims::temperature);
        s.vf_out   = od->lookupScalarOrDefault("vf", s.vf_in);

        s.h_in  = hStream(s.T_in,  s.P, s.vf_in,  s.z);        // J/mol
        s.h_out = hStream(s.T_out, s.P, s.vf_out, s.z);
        // F kmol/s -> mol/s = *1000;  (J/mol)*(mol/s) = W.
        s.Q     = s.F * 1000.0 * (s.h_out - s.h_in);

        if (s.Q < 0.0) Q_hot  += s.Q;       // stream cools  -> releases heat
        else           Q_cold += s.Q;       // stream heats  -> absorbs heat

        S.push_back(std::move(s));
    }

    // ---- First-law closure --------------------------------------------
    // Σ Q over all streams.  Adiabatic shell => 0.  Non-zero = the external
    // duty the bundle would import (>0) / export (<0): reported, never hidden.
    const scalar imbalance = Q_hot + Q_cold;          // W
    const scalar scaleQ    = std::max(std::abs(Q_hot), std::abs(Q_cold));
    const scalar relImb    = (scaleQ > 0.0) ? std::abs(imbalance) / scaleQ : 0.0;
    const bool   closes    = (relImb <= tolFrac);

    // ---- Internal pinch: hot & cold composite curves -------------------
    // The textbook composite-curve construction.  Each pool (hot, cold) is a
    // parametric polyline in the (cumulative-Q, T) plane: as T rises from the
    // pool's coldest to its hottest temperature, the cumulative duty grows by
    // the heat-capacity-flow of whichever streams are active in that band.
    // Each pool is built over ITS OWN temperature breakpoints (anchored at
    // Q = 0 at the pool's coldest end) -- NOT padded with the other pool's
    // range, which would corrupt the interpolation.
    auto poolDutyInInterval = [&](scalar Ta, scalar Tb, bool hot) -> scalar
    {
        // [Ta, Tb] with Ta < Tb; magnitude of duty this pool exchanges over
        // that band (W, always >= 0).  A stream's segment is linearised: its
        // share of duty is proportional to its share of its (T_in -> T_out) span.
        scalar q = 0.0;
        for (const auto& s : S)
        {
            const bool sHot = (s.Q < 0.0);
            if (sHot != hot) continue;
            const scalar tlo  = std::min(s.T_in, s.T_out);
            const scalar thi  = std::max(s.T_in, s.T_out);
            const scalar span = thi - tlo;
            if (span <= 0.0) continue;
            const scalar lo = std::max(Ta, tlo);
            const scalar hi = std::min(Tb, thi);
            if (hi <= lo) continue;
            q += std::abs(s.Q) * (hi - lo) / span;
        }
        return q;
    };

    // Build one pool's composite curve over its own breakpoints.
    auto buildComposite = [&](bool hot,
                              std::vector<scalar>& Q, std::vector<scalar>& T)
    {
        std::set<scalar> tset;
        for (const auto& s : S)
            if ((s.Q < 0.0) == hot)
            {
                tset.insert(s.T_in);
                tset.insert(s.T_out);
            }
        std::vector<scalar> br(tset.begin(), tset.end());   // ascending
        Q.clear(); T.clear();
        if (br.empty()) return;
        Q.push_back(0.0); T.push_back(br.front());
        for (std::size_t k = 0; k + 1 < br.size(); ++k)
        {
            const scalar dq = poolDutyInInterval(br[k], br[k+1], hot);
            Q.push_back(Q.back() + dq);
            T.push_back(br[k+1]);
        }
    };

    std::vector<scalar> Qh, Th, Qc, Tc;
    buildComposite(/*hot=*/true,  Qh, Th);    // hot composite  (T vs released duty)
    buildComposite(/*hot=*/false, Qc, Tc);    // cold composite (T vs absorbed duty)
    const scalar Qh_tot = Qh.empty() ? 0.0 : Qh.back();   // = |Q_hot|
    const scalar Qc_tot = Qc.empty() ? 0.0 : Qc.back();   // =  Q_cold

    // Minimum approach: over the OVERLAPPING duty range (counter-current
    // convention -- cold composite shifted to share the hot duty range from
    // the cold end), sample T_hot(q) - T_cold(q) and take the minimum.
    auto interpT = [&](const std::vector<scalar>& Q, const std::vector<scalar>& T,
                       scalar q) -> scalar
    {
        if (q <= Q.front()) return T.front();
        if (q >= Q.back())  return T.back();
        for (std::size_t i = 0; i + 1 < Q.size(); ++i)
            if (q >= Q[i] && q <= Q[i+1])
            {
                const scalar dQ = Q[i+1] - Q[i];
                if (dQ <= 0.0) return T[i];
                return T[i] + (T[i+1] - T[i]) * (q - Q[i]) / dQ;
            }
        return T.back();
    };

    scalar dTmin = std::numeric_limits<scalar>::infinity();
    bool   havePinch = (Qh_tot > 0.0 && Qc_tot > 0.0);
    if (havePinch)
    {
        // Counter-current: align the cold end of both composites at q = 0,
        // sample over the shared duty span (the smaller of the two totals).
        const scalar Qspan = std::min(Qh_tot, Qc_tot);
        const int    NSAMP = 50;
        for (int i = 0; i <= NSAMP; ++i)
        {
            const scalar q  = Qspan * static_cast<scalar>(i) / NSAMP;
            const scalar Th_q = interpT(Qh, Th, q);
            const scalar Tc_q = interpT(Qc, Tc, q);
            dTmin = std::min(dTmin, Th_q - Tc_q);
        }
    }
    else
    {
        dTmin = 0.0;       // a one-sided bundle has no internal approach
    }

    // ---- Outlet streams (order matches inputs) -------------------------
    // The Flowsheet rebinds these names from the unit's `outputs (...)`
    // declaration (by order); the placeholder here is only a fallback for a
    // single-unit / standalone run.
    produced_.clear();
    for (const auto& s : S)
    {
        ProcessStream o;
        o.name = s.name + "Out";
        o.F    = s.F;
        o.T    = s.T_out;
        o.P    = s.P;
        o.z    = s.z;
        o.vf   = s.vf_out;
        produced_.push_back(o);
    }

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["nStreams"]      = static_cast<scalar>(S.size());
    kpis_["Q_hot"]         = Q_hot;                 // W (negative)
    kpis_["Q_hot_kW"]      = Q_hot / 1000.0;
    kpis_["Q_cold"]        = Q_cold;                // W (positive)
    kpis_["Q_cold_kW"]     = Q_cold / 1000.0;
    kpis_["imbalance"]     = imbalance;             // W (external duty)
    kpis_["imbalance_kW"]  = imbalance / 1000.0;
    kpis_["relImbalance"]  = relImb;
    kpis_["dT_min"]        = (dTmin == std::numeric_limits<scalar>::infinity())
                                ? 0.0 : dTmin;      // internal pinch (K)
    kpis_["balanceCloses"] = closes ? 1.0 : 0.0;
    // per-stream duty (kW), keyed by stream name -- feeds sensitivity / sizing.
    for (const auto& s : S)
        kpis_["Q_" + s.name + "_kW"] = s.Q / 1000.0;

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n==================  Multi-Stream Heat Exchanger (MHeatX)  =========\n"
                  << "  Streams: " << S.size() << "   (energy-balance verification)\n"
                  << "  Datum:   " << (useFormation ? "formation (H_stream)"
                                                    : "sensible (Hliquid)") << "\n"
                  << "  ------------------------------------------------------------------\n"
                  << std::fixed;
        for (const auto& s : S)
        {
            const bool sHot = (s.Q < 0.0);
            std::cout << "  " << std::left << std::setw(12) << s.name << std::right
                      << (sHot ? "  HOT " : "  COLD")
                      << "  T: " << std::setprecision(2) << std::setw(8) << s.T_in
                      << " -> " << std::setw(8) << s.T_out << " K"
                      << "   F = " << std::setprecision(4) << std::setw(8)
                      << (s.F * 3600.0) << " kmol/h"
                      << "   Q = " << std::setprecision(2) << std::setw(10)
                      << (s.Q / 1000.0) << " kW\n";
        }
        std::cout << "  ------------------------------------------------------------------\n"
                  << "  Total hot duty  (released): " << std::setprecision(2)
                  << std::setw(10) << (Q_hot  / 1000.0) << " kW\n"
                  << "  Total cold duty (absorbed): " << std::setw(10)
                  << (Q_cold / 1000.0) << " kW\n"
                  << "  Imbalance (Σ Q, external):  " << std::setw(10)
                  << (imbalance / 1000.0) << " kW   (" << std::setprecision(3)
                  << (relImb * 100.0) << " % of duty)\n"
                  << "  First law: " << (closes
                        ? "CLOSES (adiabatic shell, within tolerance)"
                        : "DOES NOT close -- external duty required (see imbalance)")
                  << "\n";
        if (havePinch)
        {
            std::cout << "  Internal pinch (min approach dT): "
                      << std::setprecision(2) << dTmin << " K";
            if (dTmin <= 0.0)
                std::cout << "   <-- TEMPERATURE CROSS: requested outlets are"
                             " infeasible for a single adiabatic bundle";
            std::cout << "\n";
        }
        std::cout << "  Assumptions: single adiabatic shell, sensible+latent via the\n"
                  << "               enthalpy datum, counter-current composite approach.\n"
                  << "==================================================================\n\n";
    }

    if (!closes && verbosity >= 1)
        std::cout << "WARNING: MultiStreamHX energy balance does not close by "
                  << std::setprecision(3) << (relImb * 100.0) << " % ("
                  << std::setprecision(2) << (imbalance / 1000.0) << " kW); the"
                  << " bundle is NOT adiabatic with these outlet targets.\n";
    if (havePinch && dTmin <= 0.0 && verbosity >= 1)
        std::cout << "WARNING: MultiStreamHX internal temperature cross (dT_min = "
                  << std::setprecision(2) << dTmin << " K); the requested outlet"
                  << " temperatures violate the 2nd law for one adiabatic shell.\n";

    return 0;
}

} // namespace Choupo
