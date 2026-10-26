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
    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>

namespace Choupo {

class TSATwinBed : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return out_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }
    std::vector<ClosureVariable> closureVariables() const override { return closures_; }
    std::optional<UnitProfile> profile() const override { return profile_; }

private:
    inline static const std::string type_ = "tsaTwinBed";

    std::vector<ProcessStream> out_;
    std::map<std::string, scalar> kpis_;
    std::vector<ClosureVariable>   closures_;   // DEV.md 4c C174
    std::optional<UnitProfile> profile_;
};

} // namespace Choupo
