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
        const double p = pt->lookupScalar("P");   // canonical SI [Pa]
        const double T = pt->lookupScalar("T");   // canonical SI [K]

        const IF97::Props r = IF97::props(p, T);  // routed; refuses 3/5 loudly

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
        if (!(from >= IF97::Tmin && to <= IF97::Tmax1 && from < to))
            throw std::runtime_error("steamTables.saturation: the f/g columns "
                "come from regions 1/2 evaluated ON the saturation line, valid "
                "273.15 K (0 degC) <= T <= 623.15 K (350 degC) only -- above "
                "that the liquid side is IF97 region 3 (not in this slice). "
                "Requested from = " + std::to_string(from) + " K, to = "
                + std::to_string(to) + " K.");

        auto csv = openCsv(dict);
        csv << "T,psat,v_f,v_g,h_f,h_g,s_f,s_g,h_fg\n";   // canonical SI
        for (int i = 0; i < n; ++i)
        {
            const double T  = gridT(from, to, n, i);
            const double ps = IF97::psat(T);
            // Regions 1/2 evaluated AT the saturation pressure: the
            // IAPWS-sanctioned way to tabulate the saturated states.
            const IF97::Props f = IF97::region1(ps, T);
            const IF97::Props g = IF97::region2(ps, T);
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
        const IF97::Props r = IF97::props(p, T);   // router refuses 3/5 loudly
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
