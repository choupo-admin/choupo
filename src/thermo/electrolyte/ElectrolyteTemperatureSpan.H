/* Copyright (C) 2026 Vítor Geraldes */
/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.

    ElectrolyteTemperatureSpan -- ONE home for "is this electrolyte pair being
    used outside the temperature validity of its parameters, and what do we
    say" (EL-01 / EL-02 of the 2026-11-12 electrolyte review).

    Before: three routes read the same Pitzer pair records and announced
    differently (the pitzerActivity op, the pitzerHMW speciation route and the
    package route every process unit uses -- the last said nothing), and the
    single-salt eNRTL, whose temperature rule is the engine's own
    tau(T) = tau(25 C) x 298.15/T, said nothing at all.  Now every route holds
    a TemperatureSpan read from the RECORD and calls check(T):

      * the record declares provenance{ validity{ temperature{ min; max; } } }
        -> that span ("declared");
      * a Pitzer record with temperature functions or slopes and no declared
        span -> its T-function window TvalidLo..TvalidHi (default
        273.15-573.15 K);
      * anything else (96 of the 99 Pitzer pair records carry no temperature
        dependence; an eNRTL record or a case-local pair that declares none)
        -> 298.15 K, the temperature of the data.

    The line is the molecular families' own (`PairSpanGuard::announceOutside`,
    channel `[pair-span]`, category `validity`), once per pair per run, and it
    changes no number.  The key is the MODEL and the PAIR, not the route, so
    the three Pitzer routes raise the SAME entry and print it once.  */

#pragma once

#include "thermo/PairAudit.H"
#include "core/Dictionary.H"

#include <cmath>
#include <string>

namespace Choupo
{
namespace electrolyte
{

struct TemperatureSpan
{
    double      lo = 298.15, hi = 298.15;   // [K]
    bool        declared  = false;          // the record declares provenance.validity.temperature
    bool        tFunction = false;          // Pitzer: the span is the window of the pair's T-functions
    std::string model;                      // "Pitzer" | "eNRTL"
    std::string pair;                       // "Na-Cl"
    bool        active = false;             // set by the loaders; a default-built kernel is silent

    void check(double T) const
    {
        if (!active) return;
        constexpr double tol = 0.01;        // K: 25 C + 273.15 rounding on a one-temperature span
        if (T >= lo - tol && T <= hi + tol) return;
        const std::string key = "pairSpan:" + model + ":" + pair;
        if (AdvisoryLog::instance().passHas(key)) return;   // hot path: stop before building text

        std::string consequence;
        if (model == "eNRTL")
            consequence =
                "the temperature scaling used is tau(T) = tau(25 C) x 298.15/T, the engine's"
                " own simplification, NOT a fitted temperature dependence (Chen & Evans 1986"
                " eq 45 has fitted temperature terms this record does not carry); measured"
                " against Archer (1992) for NaCl the error is tens of per cent at 273 K and"
                " 373 K (Theory Guide, eNRTL temperature statement)";
        else if (tFunction)
            consequence =
                "this pair's temperature functions are used beyond the window they were fitted"
                " for, so beta0, beta1 and Cphi are extrapolated in T";
        else
            consequence =
                "the record carries no temperature dependence of its own, so beta0, beta1 and"
                " Cphi stay at their 25 C values at every T (only the Debye-Hueckel slope"
                " follows T)";
        if (!declared && !tFunction)
            consequence += "; the record declares no span, so the temperature of its data,"
                           " 298.15 K, is taken";

        PairSpanGuard::announceOutside(key, model + " pair " + pair,
                                       model + " pair '" + pair + "'", T, lo, hi,
                                       consequence,
                                       declared ? "declared validity span" : "validity span");
    }
};

//  The declared span, as the bridges flatten it (`validityTmin` / `validityTmax`).
inline bool readDeclaredSpan(const DictPtr& flat, TemperatureSpan& s)
{
    if (!flat || !flat->found("validityTmin") || !flat->found("validityTmax")) return false;
    s.lo = flat->lookupScalar("validityTmin");
    s.hi = flat->lookupScalar("validityTmax");
    s.declared = true;
    return true;
}

//  Pitzer: the span the RECORD supports (see the header).
inline TemperatureSpan pitzerSpan(const DictPtr& flat, const std::string& pair)
{
    TemperatureSpan s;
    s.model = "Pitzer";  s.pair = pair;  s.active = true;
    if (readDeclaredSpan(flat, s)) return s;
    const bool hasT = flat && (flat->found("sp_q1") || flat->found("dbeta0_dT")
                            || flat->found("dbeta1_dT") || flat->found("dCphi_dT"));
    if (hasT)
    {
        s.lo = flat->lookupScalarOrDefault("TvalidLo", 273.15);
        s.hi = flat->lookupScalarOrDefault("TvalidHi", 573.15);
        s.tFunction = true;
    }
    return s;
}

inline TemperatureSpan enrtlSpan(const DictPtr& flat, const std::string& pair)
{
    TemperatureSpan s;
    s.model = "eNRTL";  s.pair = pair;  s.active = true;
    readDeclaredSpan(flat, s);
    return s;
}

} // namespace electrolyte
} // namespace Choupo
