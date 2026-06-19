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
-------------------------------------------------------------------------------
Class
    Choupo::GasSolidSplitter

Description
    Ideal, SPECIFICATION-DRIVEN gas-solid separator --- the simple sibling of
    the Cyclone / BagFilter.  Where those COMPUTE a size-dependent collection
    efficiency from physics, this one just applies the split the user states:

        solidsRecovery   fraction of the solid mass sent to capturedSolids
                         (default 1.0 --- a perfect separator)
        gasCarryover     fraction of the gas sent out WITH the solids
                         (default 0.0 --- no gas in the solids outlet)

    Use it when a physics model is overkill ("assume 95 % capture"), as a
    placeholder, or to bound a design.  It carries the feed PSD through
    UNCHANGED (a spec'd split does not classify by size --- that is exactly
    what distinguishes it from a cyclone).

    Inputs (feed );   outputs (cleanGas  capturedSolids ).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>

namespace Choupo {

class GasSolidSplitter : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "gasSolidSplitter";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
};

} // namespace Choupo
