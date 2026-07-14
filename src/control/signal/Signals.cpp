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

#include "Signals.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

// ===========================================================================
//  StepSignal:   t < tStep ? mean : mean + step
// ===========================================================================
void StepSignal::initialise(const DictPtr& d)
{
    mean_  = d->lookupScalar("mean");
    step_  = d->lookupScalar("step");      // deviation added AFTER tStep
    tStep_ = d->lookupScalarOrDefault("tStep", 0.0);
}

scalar StepSignal::value(scalar t) const
{
    return (t < tStep_) ? mean_ : mean_ + step_;
}

// ===========================================================================
//  StaircaseSignal:  ZOH over an ascending (time,value) list.  This body is
//  the verbatim legacy ScheduleController math --- keep it identical so the
//  step train of every existing ctrl case stays byte-for-byte the same.
// ===========================================================================
void StaircaseSignal::initialise(const DictPtr& d)
{
    auto schedList = d->lookupDictList("schedule");
    if (schedList.empty())
        throw std::runtime_error("StaircaseSignal: schedule list is empty");

    entries_.clear();
    entries_.reserve(schedList.size());
    for (const auto& e : schedList)
    {
        const scalar t = e->lookupScalar("time");
        const scalar v = e->lookupScalar("value");
        entries_.emplace_back(t, v);
    }
    std::sort(entries_.begin(), entries_.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });
}

scalar StaircaseSignal::value(scalar t) const
{
    // Walk the (sorted) schedule, pick the latest entry with time <= t.
    // The +1e-12 tolerance and front-default are PRESERVED from the legacy
    // ScheduleController::update so the trajectory is byte-identical.
    scalar val = entries_.front().second;
    for (const auto& [tk, v] : entries_)
    {
        if (tk <= t + 1.0e-12) val = v;
        else                    break;
    }
    return val;
}

// ===========================================================================
//  RampSignal:   mean + slope * max(0, min(t, tEnd) - tStart)
// ===========================================================================
void RampSignal::initialise(const DictPtr& d)
{
    mean_   = d->lookupScalar("mean");
    slope_  = d->lookupScalar("slope");
    tStart_ = d->lookupScalarOrDefault("tStart", 0.0);
    tEnd_   = d->lookupScalarOrDefault("tEnd", 1.0e30);
}

scalar RampSignal::value(scalar t) const
{
    const scalar tc = std::min(t, tEnd_);
    const scalar dt = std::max<scalar>(0.0, tc - tStart_);
    return mean_ + slope_ * dt;
}

// ===========================================================================
//  PulseSignal:  rectangular pulse of height amplitude on [tStart,tStart+width]
// ===========================================================================
void PulseSignal::initialise(const DictPtr& d)
{
    mean_      = d->lookupScalar("mean");
    amplitude_ = d->lookupScalar("amplitude");
    tStart_    = d->lookupScalarOrDefault("tStart", 0.0);
    width_     = d->lookupScalar("width");
}

scalar PulseSignal::value(scalar t) const
{
    const bool inside = (t >= tStart_) && (t < tStart_ + width_);
    return inside ? mean_ + amplitude_ : mean_;
}

// ===========================================================================
//  SineSignal:  mean + amplitude * sin(2*pi*(t-tStart)/period + phase).
//  `period` XOR `frequency` (cross-rejected); the derived twins are printed.
// ===========================================================================
void SineSignal::initialise(const DictPtr& d)
{
    mean_      = d->lookupScalar("mean");
    amplitude_ = d->lookupScalar("amplitude");
    phase_     = d->lookupScalarOrDefault("phase", 0.0);
    tStart_    = d->lookupScalarOrDefault("tStart", 0.0);

    const bool hasPeriod = d->found("period");
    const bool hasFreq   = d->found("frequency");
    if (hasPeriod && hasFreq)
        throw std::runtime_error("SineSignal: specify `period` XOR `frequency`,"
            " not both (they are the same datum: f = 1/period)");
    if (!hasPeriod && !hasFreq)
        throw std::runtime_error("SineSignal: needs a `period` (s) or a"
            " `frequency` (Hz)");

    if (hasPeriod)
        period_ = d->lookupScalar("period");
    else
    {
        const scalar f = d->lookupScalar("frequency");
        if (f <= 0.0)
            throw std::runtime_error("SineSignal: frequency must be > 0");
        period_ = 1.0 / f;
    }
    if (period_ <= 0.0)
        throw std::runtime_error("SineSignal: period must be > 0");

    // Glass-box: print the derived twins so a student sees f and omega.
    const scalar f     = 1.0 / period_;
    const scalar omega = 2.0 * constant::pi * f;
    std::cout << "  Signal[sine]:  mean=" << mean_
              << "  amplitude=" << amplitude_
              << "  period=" << period_ << " s"
              << "  (f=" << f << " Hz, omega=" << omega << " rad/s)"
              << "  phase=" << phase_ << " rad\n";
}

scalar SineSignal::value(scalar t) const
{
    const scalar arg = 2.0 * constant::pi * (t - tStart_) / period_ + phase_;
    return mean_ + amplitude_ * std::sin(arg);
}

// ---- prbs ------------------------------------------------------------------

void PrbsSignal::initialise(const DictPtr& d)
{
    mean_      = d->lookupScalar("mean");
    amplitude_ = d->lookupScalar("amplitude");
    bitPeriod_ = d->lookupScalar("bitPeriod");
    tStart_    = d->lookupScalarOrDefault("tStart", 0.0);
    nReg_      = static_cast<int>(d->lookupScalar("registers"));
    if (bitPeriod_ <= 0.0)
        throw std::runtime_error("PrbsSignal: bitPeriod must be > 0");
    if (nReg_ < 2 || nReg_ > 16)
        throw std::runtime_error("PrbsSignal: registers must be in [2, 16]"
            " (period 2^n - 1 = " + std::to_string((1 << 2) - 1) + ".."
            + std::to_string((1 << 16) - 1) + " bits)");

    // The seed is DECLARED (identification experiments must be exactly
    // repeatable); zero is the LFSR fixed point and is refused.
    const unsigned seed =
        static_cast<unsigned>(d->lookupScalar("seed"));
    if (seed == 0)
        throw std::runtime_error("PrbsSignal: seed 0 is the LFSR fixed point"
            " (the all-zero state never leaves itself) -- declare a nonzero"
            " seed");
    if (seed >= (1u << nReg_))
        throw std::runtime_error("PrbsSignal: seed " + std::to_string(seed)
            + " does not fit in " + std::to_string(nReg_) + " registers"
            " (max " + std::to_string((1u << nReg_) - 1) + ")");

    // Taps: declared, or from the canonical maximal-length table
    // `prbsTaps-1` (primitive polynomials x^n + x^k (+..) + 1 over GF(2)).
    std::vector<int> taps;
    std::string tapSource;
    if (d->found("taps"))
    {
        for (scalar v : d->lookupList("taps"))
            taps.push_back(static_cast<int>(v));
        tapSource = "declared";
    }
    else
    {
        static const std::map<int, std::vector<int>> kCanonical = {
            { 2, {2, 1} },        { 3, {3, 2} },        { 4, {4, 3} },
            { 5, {5, 3} },        { 6, {6, 5} },        { 7, {7, 6} },
            { 8, {8, 6, 5, 4} },  { 9, {9, 5} },        {10, {10, 7} },
            {11, {11, 9} },       {12, {12, 11, 10, 4} },
            {13, {13, 12, 11, 8} }, {14, {14, 13, 12, 2} },
            {15, {15, 14} },      {16, {16, 15, 13, 4} } };
        taps = kCanonical.at(nReg_);
        tapSource = "canonical table prbsTaps-1";
    }
    for (int tp : taps)
        if (tp < 1 || tp > nReg_)
            throw std::runtime_error("PrbsSignal: tap position "
                + std::to_string(tp) + " outside [1, " + std::to_string(nReg_)
                + "]");

    // Walk the LFSR ONCE from the seed, recording the output bit stream,
    // and VERIFY the cycle length is exactly 2^n - 1: a non-maximal tap
    // set is refused aloud, never passed off as a PRBS.
    const unsigned period = (1u << nReg_) - 1u;
    bits_.clear();
    bits_.reserve(period);
    unsigned state = seed;
    for (unsigned k = 0; k < period; ++k)
    {
        bits_.push_back(static_cast<char>((state >> (nReg_ - 1)) & 1u));
        unsigned fb = 0;
        for (int tp : taps) fb ^= (state >> (tp - 1)) & 1u;
        state = ((state << 1) | fb) & period;   // period == the n-bit mask
        if (state == seed && k + 1 < period)
            throw std::runtime_error("PrbsSignal: taps ("
                + [&]{ std::string s2; for (int tp : taps)
                       s2 += (s2.empty() ? "" : " ") + std::to_string(tp);
                       return s2; }()
                + ") give cycle length " + std::to_string(k + 1)
                + " != 2^n - 1 = " + std::to_string(period)
                + " -- a LINEARLY NON-MAXIMAL set; use the canonical table"
                " (omit `taps`) or a primitive polynomial");
    }
    if (state != seed)
        throw std::runtime_error("PrbsSignal: internal check failed -- the"
            " LFSR did not return to the seed after 2^n - 1 steps");

    // Glass-box announce: the whole experiment is reproducible from this
    // line (the #101 contract: the choice is EMITTED, never implicit).
    std::string tapStr;
    for (int tp : taps) tapStr += (tapStr.empty() ? "" : " ") + std::to_string(tp);
    std::string firstBits;
    for (std::size_t k = 0; k < std::min<std::size_t>(16, bits_.size()); ++k)
        firstBits += (bits_[k] ? '1' : '0');
    std::cout << "  Signal[prbs]:  mean=" << mean_
              << "  amplitude=+/-" << amplitude_
              << "  bitPeriod=" << bitPeriod_ << " s"
              << "  registers=" << nReg_
              << "  seed=" << seed
              << "  taps=(" << tapStr << ") [" << tapSource << "]"
              << "\n                 period=" << period << " bits = "
              << period * bitPeriod_ << " s (VERIFIED maximal)"
              << "  first bits: " << firstBits
              << (bits_.size() > 16 ? "..." : "") << "\n";
}

scalar PrbsSignal::value(scalar t) const
{
    if (t < tStart_ || bits_.empty()) return mean_;
    const auto k = static_cast<std::size_t>(
        std::floor((t - tStart_) / bitPeriod_))
        % bits_.size();
    return mean_ + (bits_[k] ? amplitude_ : -amplitude_);
}

} // namespace Choupo
