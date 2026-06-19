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
    Choupo::EnergyBalanceReport

Description
    Per-unit and global energy balance.  For each stream the molar
    enthalpy is evaluated by phase (Hliquid for vf<0.5, Hvapour for
    vf>=0.5) on the liquid sensible+latent reference; the stream
    enthalpy rate is H = F * h [kW].  Per unit, dH = Sigma H_out -
    Sigma H_in is the implied thermal/shaft duty (= Q + W supplied).

    Writes `reports/energyBalance_byUnit.csv`.

    Limitation: components without a `liquidHeatCapacity` block (the
    permanent gases N2, O2,...) have no enthalpy on this reference;
    streams containing them are written as `n/a` rather than failing
    the report.  A unified real-gas + liquid enthalpy is a thermo
    upgrade scheduled separately --- once it lands, this report
    becomes exact for gas-phase machines (compressor, turbine) too.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class EnergyBalanceReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "energyBalance";
};

} // namespace Choupo
