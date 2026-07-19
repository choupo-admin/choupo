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
    Choupo::ElementBalanceReport

Description
    Report `elementBalance` --- the plant-boundary ELEMENT conservation
    diagnostic, its own artefact beside the mass balance (different domain:
    the mass balance's rows are COMPONENTS; these rows are ELEMENTS in
    kmol-atom/h).  In a reacting flowsheet the species change across the
    boundary but the atoms cannot: this is the diagnostic that catches a
    chemically wrong stoichiometry that a total-mass balance would bless.

    Feeds/products come from the solved topology (reporting::readTopology);
    per-component boundary flow is fluid F*z_i plus the particulate solid
    s[i], both kmol/s; atoms come from THE shared parser
    (src/thermo/ElementComposition).  A boundary species whose formula the
    parser refuses withholds ONLY the elemental claim -- the artefact
    records UNAVAILABLE with each species + reason, and the mass balance
    stays available.  Never a silent zero.

    Output: elementBalance.csv
        element,in_kmol_atom_h,out_kmol_atom_h,residual_kmol_atom_h,closure_pct
      or, on refusal:
        status,UNAVAILABLE
        species,<name>,<reason>   (one row per refusing species)
\*---------------------------------------------------------------------------*/

#pragma once

#include "reporting/Report.H"

namespace Choupo {

class ElementBalanceReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    std::string type_ = "elementBalance";
};

} // namespace Choupo
