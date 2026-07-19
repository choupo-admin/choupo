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
    Choupo::ElementCompositionOp

Description
    choupoProps operation `elementalComposition` --- parse each declared
    formula (or each loaded component's `formula`) through THE shared
    elemental parser (src/thermo/ElementComposition) and print the atom
    table, or the UNAVAILABLE reason, per formula.  The glass-box surface
    of the parser every balance (batch campaign, steady element balance,
    dynamic snapshot) relies on: the student sees exactly how a formula
    decomposes into atoms -- groups, hydrates, ionic charge, isotopes.

    Dictionary form:

        {
            name     atoms;
            type     elementalComposition;
            formulas ( C2H6O "Ca(OH)2" "CaSO4:2H2O" "SO4-2" );  // raw strings
            // and/or
            components ( water gypsum );    // formula from the loaded set
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "propertyOps/PropertyOperation.H"

namespace Choupo {

class ElementCompositionOp : public PropertyOperation
{
public:
    ElementCompositionOp() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    { return diag_; }

private:
    std::string                   type_ = "elementalComposition";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
