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

#include "SteamTables.H"

#include "thermo/iapws/IF97.H"

#include "thermo/RecordResolver.H"
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

// The formulation citation + the transcription self-check, announced ONCE per
// run (N identical lines teach nothing).  A failed self-check REFUSES the run:
// a steam table built on a mistranscribed coefficient is worse than no table.
void announceFormulationOnce()
{
    static bool announced = false;
    if (announced) return;
    announced = true;
    const double dev = IF97::verify();
    std::ostringstream os;   // local formatting: never leak state into cout
    os << "[steamTables] IAPWS-IF97 (R7-97(2012)) -- industrial "
          "formulation\n"
       << "[steamTables] self-check vs the release verification "
          "tables: max rel deviation = "
       << std::scientific << std::setprecision(2) << dev << "\n";
    std::cout << os.str();
    if (!(dev < 1.0e-8))
        throw std::runtime_error("steamTables: IF97 self-check FAILED (max "
            "rel deviation vs the release verification tables > 1e-8) -- a "
            "coefficient transcription error in src/thermo/iapws/IF97.cpp; "
            "fix the digit, do not loosen the tolerance");
}

// Open the op's output CSV (`output { file ...; }`), failing loudly.
std::ofstream openCsv(const DictPtr& dict)
{
    const std::string file = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("steamTables", "file", file);
    std::ofstream csv(file);
    if (!csv.is_open())
        throw std::runtime_error("steamTables: cannot open output file '"
                                 + file + "'");
    csv << std::scientific << std::setprecision(9);
    return csv;
}

// Grid point i of n over [from,to]; the last point lands EXACTLY on `to`
// (no floating drift past a validity edge).
double gridT(double from, double to, int n, int i)
{
    if (i == n - 1) return to;
    return from + i * (to - from) / (n - 1);
}

} // anonymous namespace

int SteamTables::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                     int verbosity)
{
    diag_.clear();
    announceFormulationOnce();

    const bool hasPoint = dict->found("point");
    const bool hasSat   = dict->found("saturation");
    const bool hasIso   = dict->found("isobar");
    if (static_cast<int>(hasPoint) + hasSat + hasIso != 1)
        throw std::runtime_error("steamTables: give exactly ONE mode block -- "
            "point { P ...; T ...; } | saturation { from ...; to ...; n ...; }"
            " | isobar { P ...; from ...; to ...; n ...; }");

    // --- point: one (p,T) state, full property set + region -----------------
    if (hasPoint)
    {
        auto pt = dict->subDict("point");
        const double T = pt->lookupScalar("T");   // canonical SI [K]
        const bool hasP   = pt->found("P");
        const bool hasRho = pt->found("rho");
        if (hasP == hasRho)
            throw std::runtime_error("steamTables.point: give exactly ONE of "
                "P (any region, routed) or rho (region 3 only, the variable "
                "its Helmholtz equation is written in) beside T");

        IF97::Props r;
        double p = 0.0;
        if (hasP)
        {
            p = pt->lookupScalar("P");            // canonical SI [Pa]
            r = IF97::props(p, T);                // routed; refuses region 5
        }
        else
        {
            // (rho, T): Eq. 25 evaluated directly -- and REFUSED unless the
            // pressure it gives routes back to region 3, so a density on a
            // region-1/2 state, or inside the two-phase dome, is never
            // reported as a region-3 answer.
            const double rho = pt->lookupScalar("rho");   // [kg/m3]
            r = IF97::region3(rho, T);
            p = r.p;
            const int routed = (p > 0.0 && p <= IF97::pmax && T >= IF97::Tmin
                                && T <= IF97::Tmax12)
                                   ? IF97::pT_region(p, T) : 0;
            const bool sameRoot = routed == 3
                && std::fabs(IF97::rho3(p, T) - rho) <= 1.0e-9 * rho;
            if (!sameRoot)
            {
                std::ostringstream os;
                os << "steamTables.point: (rho = " << rho << " kg/m3, T = "
                   << T << " K) is not a single-phase IF97 region-3 state -- "
                      "Eq. 25 gives p = " << p / 1.0e6 << " MPa, which "
                   << (routed == 3 ? "routes to region 3 on the other "
                                     "branch of the isotherm (the state is "
                                     "inside the two-phase dome or "
                                     "metastable)"
                                   : "does not route to region 3")
                   << "; give point { P ...; T ...; } for regions 1/2";
                throw std::runtime_error(os.str());
            }
        }

        if (verbosity >= 2)
        {
            std::ostringstream os;
            os << std::setprecision(9)
               << "steamTables: T = " << T << " K, p = " << p / 1.0e6
               << " MPa -> IF97 region " << r.region << "\n"
               << "    v  = " << r.v   << " m3/kg     rho = " << r.rho
               << " kg/m3\n"
               << "    h  = " << r.h   << " kJ/kg     u   = " << r.u
               << " kJ/kg\n"
               << "    s  = " << r.s   << " kJ/(kg K)\n"
               << "    cp = " << r.cp  << " kJ/(kg K) cv  = " << r.cv
               << " kJ/(kg K)\n"
               << "    w  = " << r.w   << " m/s\n";
            std::cout << os.str();
        }

        diag_["region"] = r.region;
        diag_["v"]  = r.v;   diag_["h"]  = r.h;  diag_["u"] = r.u;
        diag_["s"]  = r.s;   diag_["cp"] = r.cp; diag_["cv"] = r.cv;
        diag_["w"]  = r.w;
        // Region 3 is written in (rho, T): publish the variable the input
        // did not give, so a (p,T) point shows the density the backward
        // iteration found and a (rho,T) point the pressure Eq. 25 gives.
        if (r.region == 3)
        {
            diag_["p_MPa"] = p / 1.0e6;
            diag_["rho"]   = r.rho;
        }
        // psat at this T is a free verification pin whenever T is on the
        // region-4 range (release Table 35 speaks MPa, so the diag does too).
        if (T >= IF97::Tmin && T <= IF97::Tcrit)
            diag_["psat_MPa"] = IF97::psat(T) / 1.0e6;

        if (dict->found("output"))                // optional one-row CSV (SI)
        {
            auto csv = openCsv(dict);
            csv << "T,P,region,v,rho,h,u,s,cp,cv,w\n";
            csv << T << "," << p << "," << r.region << "," << r.v << ","
                << r.rho << "," << r.h * 1.0e3 << "," << r.u * 1.0e3 << ","
                << r.s * 1.0e3 << "," << r.cp * 1.0e3 << ","
                << r.cv * 1.0e3 << "," << r.w << "\n";
        }
        return 0;
    }

    // --- saturation: T scan of the region-4 line + the f/g property pairs ---
    if (hasSat)
    {
        auto sd = dict->subDict("saturation");
        const double from = sd->lookupScalar("from");   // [K] (degC converted)
        const double to   = sd->lookupScalar("to");
        const int    n    = static_cast<int>(sd->lookupScalar("n"));
        if (n < 2)
            throw std::runtime_error("steamTables.saturation: n must be >= 2");
        if (!(from >= IF97::Tmin && to <= IF97::Tcrit && from < to))
            throw std::runtime_error("steamTables.saturation: the saturation "
                "line runs from the triple point to the critical point, "
                "273.15 K (0 degC) <= T <= 647.096 K (373.946 degC) -- above "
                "Tc there is no saturation.  Requested from = "
                + std::to_string(from) + " K, to = " + std::to_string(to)
                + " K.");

        auto csv = openCsv(dict);
        csv << "T,psat,v_f,v_g,h_f,h_g,s_f,s_g,h_fg\n";   // canonical SI
        for (int i = 0; i < n; ++i)
        {
            const double T  = gridT(from, to, n, i);
            const double ps = IF97::psat(T);
            // Up to 623.15 K: regions 1/2 evaluated AT the saturation
            // pressure, the IAPWS-sanctioned way to tabulate the saturated
            // states.  Above it the saturated states are region 3's: Eq. 25
            // on its liquid and vapour branches at psat (Wagner et al. 2000,
            // Section 5.5.4 -- v' and v'' "from the intersection of the
            // saturation pressure from Eq. (28) with the pressure from the
            // Helmholtz free energy equation").
            const bool r3 = T > IF97::Tmax1;
            const IF97::Props f = r3
                ? IF97::region3(IF97::rho3(ps, T, IF97::Root::Liquid), T)
                : IF97::region1(ps, T);
            const IF97::Props g = r3
                ? IF97::region3(IF97::rho3(ps, T, IF97::Root::Vapour), T)
                : IF97::region2(ps, T);
            csv << T << "," << ps << ","
                << f.v << "," << g.v << ","
                << f.h * 1.0e3 << "," << g.h * 1.0e3 << ","
                << f.s * 1.0e3 << "," << g.s * 1.0e3 << ","
                << (g.h - f.h) * 1.0e3 << "\n";
        }

        diag_["n_points"]    = n;
        diag_["psat_from_Pa"] = IF97::psat(from);
        diag_["psat_to_Pa"]   = IF97::psat(to);

        if (verbosity >= 2)
            std::cout << "steamTables: saturation line, " << n
                      << " points, T = " << from << " .. " << to << " K -> "
                      << dict->subDict("output")->lookupWord("file") << "\n";
        return 0;
    }

    // --- isobar: h,s,v,cp vs T at fixed p, crossing announced ---------------
    auto id = dict->subDict("isobar");
    const double p    = id->lookupScalar("P");
    const double from = id->lookupScalar("from");
    const double to   = id->lookupScalar("to");
    const int    n    = static_cast<int>(id->lookupScalar("n"));
    if (n < 2)
        throw std::runtime_error("steamTables.isobar: n must be >= 2");
    if (!(from < to))
        throw std::runtime_error("steamTables.isobar: need from < to");

    // Announce the saturation crossing BEFORE the scan: a subcritical isobar
    // jumps in h and s at Tsat, and the student should expect it, not be
    // surprised by it.
    if (p >= IF97::psatTriple && p <= IF97::pcrit)
    {
        const double Ts = IF97::Tsat(p);
        diag_["Tsat_K"] = Ts;
        if (from < Ts && Ts < to && verbosity >= 1)
        {
            std::ostringstream os;
            os << "steamTables: the " << p / 1.0e5
               << " bar isobar crosses the saturation line at Tsat = "
               << std::setprecision(9) << Ts << " K -- expect the "
                  "h/s/v jump between the rows on either side\n";
            std::cout << os.str();
        }
    }

    auto csv = openCsv(dict);
    csv << "T,region,v,h,s,cp\n";                         // canonical SI
    for (int i = 0; i < n; ++i)
    {
        const double T = gridT(from, to, n, i);
        const IF97::Props r = IF97::props(p, T);   // router refuses region 5 loudly
        csv << T << "," << r.region << "," << r.v << "," << r.h * 1.0e3 << ","
            << r.s * 1.0e3 << "," << r.cp * 1.0e3 << "\n";
    }
    diag_["n_points"] = n;

    if (verbosity >= 2)
        std::cout << "steamTables: isobar p = " << p / 1.0e6 << " MPa, " << n
                  << " points, T = " << from << " .. " << to << " K -> "
                  << dict->subDict("output")->lookupWord("file") << "\n";
    return 0;
}

} // namespace Choupo
