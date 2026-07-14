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

#include "SizingPass.H"
#include "materials/MaterialRegistry.H"
#include "sizing/EquipmentSize.H"

#include <iomanip>
#include <iostream>

namespace Choupo {

SizingPass::SizingPass(const DictPtr& dict)
:   sizingDict_(dict)
{}

int SizingPass::run(SimulationResult& result)
{
    auto units = sizingDict_->lookupDictList("units");
    if (units.empty())
    {
        std::cerr << "SizingPass: 'units (...)' is empty — nothing to size.\n";
        return 0;
    }

    std::cout << "\n========================  Equipment Sizing  ==========================\n";
    std::cout << "  " << std::left
              << std::setw(14) << "unit"
              << std::setw(16) << "equipment"
              << std::setw(12) << "material"
              << std::setw(10) << "size"
              << std::setw(12) << "value"
              << std::setw(10) << "wall (mm)"
              << std::setw(12) << "weight (kg)"
              << "\n  " << std::string(86, '-') << "\n";

    int failures = 0;
    for (const auto& u : units)
    {
        const std::string uname    = u->lookupWord("unitName");
        const std::string utype    = u->lookupWord("type");
        const std::string matName  = u->lookupWord("material");
        auto              rulesDict = u->subDict("designRules");

        try {
            const auto& material = MaterialRegistry::byName(matName);
            auto sizer = EquipmentSize::New(utype);
            auto dims  = sizer->size(uname, result, material, rulesDict);

            // Pick a canonical "size" to display.
            std::string sizeKey;
            scalar      sizeVal = 0.0;
            if      (dims.values.count("V_R")) { sizeKey = "V_R [m³]"; sizeVal = dims.values.at("V_R"); }
            else if (dims.values.count("A"))   { sizeKey = "A [m²]";   sizeVal = dims.values.at("A");   }
            const scalar t_mm = dims.values.count("t_wall") ? dims.values.at("t_wall") * 1000.0 : 0.0;
            const scalar w    = dims.values.count("weight") ? dims.values.at("weight") : 0.0;

            std::cout << "  " << std::left
                      << std::setw(14) << uname
                      << std::setw(16) << utype
                      << std::setw(12) << matName
                      << std::setw(10) << sizeKey
                      << std::setw(12) << std::fixed << std::setprecision(4) << sizeVal
                      << std::setw(10) << std::fixed << std::setprecision(2) << t_mm
                      << std::setw(12) << std::fixed << std::setprecision(1) << w
                      << "\n";

            // DESIGN INVERSION output (from a `design {}` rule): the geometry the
            // process targets require -- the rating model run BACKWARD.
            bool anyDesign = false;
            for (const auto& [key, val] : dims.values)
                if (key.rfind("design_", 0) == 0)
                {
                    if (!anyDesign)
                    { std::cout << "      --  design (targets -> geometry)  --\n"; anyDesign = true; }
                    std::cout << "        " << std::left << std::setw(26) << key
                              << std::fixed << std::setprecision(3) << val << "\n";
                }

            result.sizings[uname] = std::move(dims);
        }
        catch (const std::exception& e)
        {
            std::cerr << "  " << uname << "  FAILED: " << e.what() << "\n";
            ++failures;
        }
    }
    std::cout << "=====================================================================\n\n";
    return failures;
}

} // namespace Choupo
