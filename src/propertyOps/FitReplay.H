// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
//  REPLAY BEFORE REFIT (DEV.md 4c C432 (a), 2026-11-19).
//
//  The test suite re-runs a curation fit only when the fit's inputs moved.  When
//  the only thing that moved is the engine, bin/curate/suite_reuse.py first asks
//  whether the engine moved THIS fit: it evaluates the fit's objective and its
//  statistics once, at the parameters the fit stored, and bin/runTests compares
//  them with the golden.  This header is the engine's half of that question.
//
//  CHOUPO_FIT_REPLAY names a file of `<operation name> TAB <parameter path> TAB
//  <value>` lines.  A fitParameters operation listed there starts from those
//  values and runs NO search (no Levenberg-Marquardt step, no minimax stage);
//  it publishes the statistics at them.  An operation NOT listed refuses, so a
//  replay never half-runs a case and the suite falls back to the full refit.
//  The variable is never set by a case: only the suite sets it, and the
//  operation announces the replay in its output.
//
//  Header-only and generic over the parameter record (anything with `path` and
//  `value`), so FitParameters.cpp carries four lines of it and no more.

#include "core/Types.H"

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo
{
namespace fitReplay
{

//  The stored values of operation `opName`, or nullopt when no replay is asked.
inline std::optional<std::map<std::string, scalar>> stored(const std::string& opName)
{
    const char* rf = std::getenv("CHOUPO_FIT_REPLAY");
    if (!rf || !*rf) return std::nullopt;
    std::ifstream in(rf);
    if (!in)
        throw std::runtime_error(std::string("fitParameters(replay): cannot read ") + rf);
    std::map<std::string, scalar> values;
    for (std::string line; std::getline(in, line); )
    {
        const auto t1 = line.find('\t');
        const auto t2 = (t1 == std::string::npos) ? t1 : line.find('\t', t1 + 1);
        if (t2 == std::string::npos) continue;
        if (line.substr(0, t1) == opName)
            values[line.substr(t1 + 1, t2 - t1 - 1)] = std::stod(line.substr(t2 + 1));
    }
    if (values.empty())
        throw std::runtime_error("fitParameters(replay): no stored parameters for operation '"
            + opName + "' in " + rf + " -- the suite refits it");
    return values;
}

//  Put each parameter at its stored value; refuse one that has none.
template <class Param>
inline void apply(const std::string& opName, const std::map<std::string, scalar>& values,
                  std::vector<Param>& params)
{
    for (auto& ps : params)
    {
        auto it = values.find(ps.path);
        if (it == values.end())
            throw std::runtime_error("fitParameters(replay): '" + opName + "' has no stored value for "
                + ps.path + " -- the suite refits it");
        ps.value = it->second;
    }
    std::cout << "[fitParameters] REPLAY of '" << opName << "': parameters taken from the stored "
                 "record, NO search; the statistics below are evaluated at them (C432)\n";
}

} // namespace fitReplay
} // namespace Choupo
