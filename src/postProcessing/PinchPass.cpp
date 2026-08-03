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
    This file is part of Choupo.  See PinchPass.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "PinchPass.H"

#include "core/Dictionary.H"
#include "core/SimulationResult.H"
#include "core/Units.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

//  One straight segment of the stream population (hypothesis: constant CP
//  per segment -- see the header).  Temperatures in K, CP in W/K.
struct Segment
{
    std::string unit;
    bool   hot = false;      // hot = being COOLED (a heat source)
    scalar Tlo = 0.0, Thi = 0.0;   // actual temperatures, Tlo < Thi
    scalar CP  = 0.0;              // |Q| / (Thi - Tlo)  [W/K]
};

//  Composite curve of one population: piecewise-linear H(T), built from the
//  boundary temperatures upward.  Returns (T, H) points with H in W,
//  H = 0 at the curve's cold end.
std::vector<std::pair<scalar, scalar>>
composite(const std::vector<Segment>& segs, bool hot, scalar shift)
{
    std::set<scalar> Ts;
    for (const auto& s : segs)
        if (s.hot == hot) { Ts.insert(s.Tlo + shift); Ts.insert(s.Thi + shift); }
    std::vector<std::pair<scalar, scalar>> pts;
    if (Ts.empty()) return pts;
    std::vector<scalar> T(Ts.begin(), Ts.end());
    scalar H = 0.0;
    pts.emplace_back(T.front(), 0.0);
    for (std::size_t i = 0; i + 1 < T.size(); ++i)
    {
        scalar cp = 0.0;
        const scalar mid = 0.5 * (T[i] + T[i + 1]) - shift;
        for (const auto& s : segs)
            if (s.hot == hot && s.Tlo <= mid && mid <= s.Thi) cp += s.CP;
        H += cp * (T[i + 1] - T[i]);
        pts.emplace_back(T[i + 1], H);
    }
    return pts;
}

} // anonymous

PinchPass::PinchPass(const DictPtr& dict)
{
    if (dict)
    {
        dTmin_       = dict->lookupScalarOrDefault("dTmin", 10.0,
                                                   Dims::temperature);
        latentWidth_ = dict->lookupScalarOrDefault("latentWidth", 1.0,
                                                   Dims::temperature);
    }
    if (dTmin_ <= 0.0)
        throw std::runtime_error("pinchPass: dTmin must be positive"
            " (a zero approach makes every match infinitely large).");
}

int PinchPass::run(SimulationResult& result)
{
    // ---- 1. the stream population, from the converged result ---------------
    //  Hypothesis (header): each duty-carrying unit contributes ONE segment
    //  between its first non-utility inlet's T and first non-utility
    //  outlet's T, at CP = |Q| / |dT|.
    auto processT = [&](const std::vector<std::string>& names) -> scalar
    {
        for (const auto& n : names)
        {
            auto it = result.streams.find(n);
            if (it == result.streams.end()) continue;
            if (it->second.category == "utility") continue;
            return it->second.T;
        }
        return -1.0;
    };

    std::vector<Segment> segs;
    scalar heatCur = 0.0, coolCur = 0.0;    // raw unintegrated duties [W]
    for (const auto& u : result.topology)
    {
        auto ku = result.kpis.find(u.name);
        if (ku == result.kpis.end()) continue;
        auto q = ku->second.find("Q");
        if (q == ku->second.end() || std::abs(q->second) < 1.0e-6) continue;
        const scalar Tin  = processT(u.ins);
        const scalar Tout = processT(u.outs);
        if (Tin <= 0.0 || Tout <= 0.0) continue;   // no process side found

        Segment s;
        s.unit = u.name;
        scalar dT = Tout - Tin;
        if (std::abs(dT) < latentWidth_)
        {
            //  Near-isothermal duty (latent): a slice of width latentWidth_
            //  centred on the unit temperature -- the standard treatment.
            const scalar Tc = 0.5 * (Tin + Tout);
            s.hot = q->second < 0.0;
            s.Tlo = Tc - 0.5 * latentWidth_;
            s.Thi = Tc + 0.5 * latentWidth_;
            s.CP  = std::abs(q->second) / latentWidth_;
        }
        else
        {
            s.hot = dT < 0.0;                       // cooled -> heat source
            s.Tlo = std::min(Tin, Tout);
            s.Thi = std::max(Tin, Tout);
            s.CP  = std::abs(q->second) / std::abs(dT);
        }
        (s.hot ? coolCur : heatCur) += std::abs(q->second);
        segs.push_back(std::move(s));
    }
    if (segs.empty())
    {
        std::cout << "[pinch] no duty-carrying units with process-side"
                     " temperatures -- nothing to target.\n";
        return 0;
    }

    // ---- 2. the problem table (Linnhoff & Flower 1978), printed ------------
    //  Shifted temperatures: hot - dTmin/2, cold + dTmin/2, so feasibility
    //  in the table means a real approach of at least dTmin.
    const scalar hs = -0.5 * dTmin_, cs = +0.5 * dTmin_;
    std::set<scalar, std::greater<scalar>> bounds;
    for (const auto& s : segs)
    {
        const scalar sh = s.hot ? hs : cs;
        bounds.insert(s.Tlo + sh);
        bounds.insert(s.Thi + sh);
    }
    std::vector<scalar> T(bounds.begin(), bounds.end());   // descending

    std::cout << "[pinch] problem table (Linnhoff-Flower), dTmin = "
              << dTmin_ << " K; shifted T* = T_hot - dTmin/2 = T_cold +"
                 " dTmin/2\n"
              << "[pinch]   interval        T* hi     T* lo   sumCP_hot"
                 "  sumCP_cold    dH [kW]   cascade [kW]\n";
    scalar cascade = 0.0, minCascade = 0.0;
    scalar Tpinch = T.empty() ? 0.0 : T.front();
    std::vector<scalar> cum;      // cascade AFTER each interval
    for (std::size_t i = 0; i + 1 < T.size(); ++i)
    {
        const scalar mid = 0.5 * (T[i] + T[i + 1]);
        scalar cpH = 0.0, cpC = 0.0;
        for (const auto& s : segs)
        {
            const scalar sh = s.hot ? hs : cs;
            if (s.Tlo + sh <= mid && mid <= s.Thi + sh)
                (s.hot ? cpH : cpC) += s.CP;
        }
        const scalar dH = (cpH - cpC) * (T[i] - T[i + 1]);   // surplus > 0
        cascade += dH;
        cum.push_back(cascade);
        std::cout << "[pinch]   " << std::setw(8) << (i + 1)
                  << std::fixed << std::setprecision(2)
                  << std::setw(10) << T[i] << std::setw(10) << T[i + 1]
                  << std::setw(12) << cpH / 1.0e3
                  << std::setw(12) << cpC / 1.0e3
                  << std::setw(11) << dH / 1.0e3
                  << std::setw(15) << cascade / 1.0e3 << "\n";
        std::cout.unsetf(std::ios::fixed);
        if (cascade < minCascade - 1.0e-9)
        {
            minCascade = cascade;
            Tpinch = T[i + 1];
        }
    }
    std::cout.precision(6);                           // the table's setprecision(2) must not leak
    const scalar QHmin = -minCascade;                 // >= 0
    const scalar QCmin = cascade + QHmin;
    std::cout << "[pinch] targets: Q_H,min = " << QHmin / 1.0e3
              << " kW, Q_C,min = " << QCmin / 1.0e3
              << " kW, pinch at T* = " << Tpinch
              << " K (hot " << Tpinch - hs << " K / cold "
              << Tpinch - cs << " K)\n";
    std::cout << "[pinch] current (unintegrated) duties: heating "
              << heatCur / 1.0e3 << " kW vs target " << QHmin / 1.0e3
              << " kW; cooling " << coolCur / 1.0e3 << " kW vs target "
              << QCmin / 1.0e3 << " kW -- integration could recover "
              << (heatCur - QHmin) / 1.0e3 << " kW of heating.\n";

    // ---- 3. composite curves CSV -------------------------------------------
    namespace fs = std::filesystem;
    fs::create_directories("reports/pinch");
    std::ofstream csv("reports/pinch/compositeCurves.csv");
    csv << "curve,T_K,H_kW\n" << std::setprecision(10);
    auto emit = [&](const char* name, bool hot, scalar shift)
    {
        for (const auto& [Tp, H] : composite(segs, hot, shift))
            csv << name << "," << Tp << "," << H / 1.0e3 << "\n";
    };
    emit("hot",         true,  0.0);
    emit("cold",        false, 0.0);
    emit("hotShifted",  true,  hs);
    emit("coldShifted", false, cs);

    // ---- 4. P2: the candidate-match analysis table -------------------------
    //  (Linnhoff & Hindmarsh 1983 design-method rules as ANALYSIS -- the
    //  table names what the physics ADMITS per region; it recommends no
    //  network, and no row is ever called "optimal".  Hypotheses: header.)
    const scalar TpHot  = Tpinch - hs;   // pinch on the hot/cold scales
    const scalar TpCold = Tpinch - cs;

    //  Clip a segment to one side of the pinch (its own scale's pinch T).
    auto clip = [](const Segment& s, scalar Tp, bool above)
        -> std::pair<bool, Segment>
    {
        Segment c = s;
        if (above) c.Tlo = std::max(s.Tlo, Tp);
        else       c.Thi = std::min(s.Thi, Tp);
        return { c.Thi - c.Tlo > 1.0e-9, c };
    };

    struct Row
    {
        std::string region, hotU, coldU, feas, rule, limit, rec;
        scalar Qmax = 0.0;
    };
    std::vector<Row> rows;
    std::size_t admissible = 0;

    for (const bool above : { true, false })
    {
        for (const auto& h : segs)
        {
            if (!h.hot) continue;
            auto [okH, H] = clip(h, TpHot, above);
            if (!okH) continue;
            for (const auto& c : segs)
            {
                if (c.hot) continue;
                auto [okC, C] = clip(c, TpCold, above);
                if (!okC) continue;

                Row r;
                r.region = above ? "abovePinch" : "belowPinch";
                r.hotU = H.unit;
                r.coldU = C.unit;

                //  The CP rule binds only AT the pinch: above, both
                //  segments must start there; below, both must end there.
                const bool pinchMatch = above
                    ? (std::abs(H.Tlo - TpHot) < 1.0e-6
                       && std::abs(C.Tlo - TpCold) < 1.0e-6)
                    : (std::abs(H.Thi - TpHot) < 1.0e-6
                       && std::abs(C.Thi - TpCold) < 1.0e-6);
                const bool cpOk = above ? (H.CP <= C.CP + 1.0e-9)
                                        : (H.CP + 1.0e-9 >= C.CP);
                if (!pinchMatch)
                    r.rule = "not a pinch match (CP rule does not bind)";
                else if (cpOk)
                    r.rule = above ? "pinch match: CP_hot <= CP_cold holds"
                                   : "pinch match: CP_hot >= CP_cold holds";
                else
                    r.rule = above
                        ? "pinch match: CP_hot <= CP_cold VIOLATED"
                        : "pinch match: CP_hot >= CP_cold VIOLATED";

                //  Exact counter-current bound of two straight segments at
                //  dTmin (end approaches suffice -- hypothesis, header).
                const scalar Qh = H.CP * (H.Thi - H.Tlo);
                const scalar Qc = C.CP * (C.Thi - C.Tlo);
                const scalar Qa = std::min(H.CP, C.CP)
                                * (H.Thi - C.Tlo - dTmin_);
                r.Qmax = std::max(0.0, std::min({ Qh, Qc, Qa }));
                r.feas = r.Qmax > 1.0e-9 ? "yes" : "no";
                if (r.Qmax <= 1.0e-9)
                    r.limit = "no feasible approach at dTmin";
                else if (Qa <= std::min(Qh, Qc) + 1.0e-9)
                    r.limit = "approach dTmin binds at an exchanger end";
                else if (Qh <= Qc)
                    r.limit = "hot stream duty exhausted";
                else
                    r.limit = "cold stream duty exhausted";

                if (r.Qmax <= 1.0e-9)
                    r.rec = "not admissible";
                else if (pinchMatch && !cpOk)
                    r.rec = "thermodynamically admissible candidate"
                            " (away from the pinch only)";
                else
                    r.rec = "thermodynamically admissible candidate";
                if (r.Qmax > 1.0e-9) ++admissible;
                rows.push_back(std::move(r));
            }
        }
    }

    //  The coursework violation diagnostics, applied to the P1 population:
    //  heating demanded below the pinch / cooling demanded above it.
    scalar heatBelow = 0.0, coolAbove = 0.0;
    std::cout << "[pinch] candidate matches (" << rows.size()
              << " pair(s), " << admissible << " admissible) ->"
                 " reports/pinch/candidateMatches.csv\n";
    for (const auto& s : segs)
    {
        if (s.hot)
        {
            auto [ok, A] = clip(s, TpHot, true);
            if (!ok) continue;
            const scalar Q = A.CP * (A.Thi - A.Tlo);
            coolAbove += Q;
            std::cout << "[pinch]   VIOLATION cooler above the pinch:"
                         " unit '" << s.unit << "' rejects "
                      << Q / 1.0e3 << " kW above " << TpHot
                      << " K -- the design method serves this by process"
                         " recovery, never a cold utility\n";
        }
        else
        {
            auto [ok, B] = clip(s, TpCold, false);
            if (!ok) continue;
            const scalar Q = B.CP * (B.Thi - B.Tlo);
            heatBelow += Q;
            std::cout << "[pinch]   VIOLATION heater below the pinch:"
                         " unit '" << s.unit << "' draws "
                      << Q / 1.0e3 << " kW below " << TpCold
                      << " K -- the design method serves this by process"
                         " recovery, never a hot utility\n";
        }
    }

    std::ofstream mcsv("reports/pinch/candidateMatches.csv");
    mcsv << "region,hotStream,coldStream,temperatureFeasible,pinchRule,"
            "maximumCandidateDuty_kW,limitingReason,recommendation\n"
         << std::setprecision(10);
    for (const auto& r : rows)
        mcsv << r.region << "," << r.hotU << "," << r.coldU << ","
             << r.feas << "," << r.rule << "," << r.Qmax / 1.0e3 << ","
             << r.limit << "," << r.rec << "\n";

    // ---- 5. KPIs ------------------------------------------------------------
    auto& k = result.kpis["pinch"];
    k["Q_H_min_kW"]        = QHmin / 1.0e3;
    k["Q_C_min_kW"]        = QCmin / 1.0e3;
    k["T_pinch_K"]         = Tpinch;              // shifted scale
    k["T_pinch_hot_K"]     = Tpinch - hs;
    k["T_pinch_cold_K"]    = Tpinch - cs;
    k["dTmin_K"]           = dTmin_;
    k["Q_heat_current_kW"] = heatCur / 1.0e3;
    k["Q_cool_current_kW"] = coolCur / 1.0e3;
    k["candidates_total"]      = static_cast<scalar>(rows.size());
    k["candidates_admissible"] = static_cast<scalar>(admissible);
    k["violation_heat_below_pinch_kW"] = heatBelow / 1.0e3;
    k["violation_cool_above_pinch_kW"] = coolAbove / 1.0e3;
    return 0;
}

} // namespace Choupo
