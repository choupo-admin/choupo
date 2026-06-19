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
    Choupo::HeatTransferBench

Description
    A choupoProps bench that RUNS each registered heat-transfer correlation's
    verify() against its published Nusselt anchor and prints the deviation +
    the anchor's source.  An unwired self-check is itself a no-silent-crutch
    violation -- this op is the wire.

    `controlDict { application choupoProps; }` + a `heatTransferBench {}` op
    block (no parameters needed; an optional `aadTolerance` overrides the
    default 0.05).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

namespace Choupo {

class HeatTransferBench : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    inline static const std::string type_ = "heatTransferBench";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
