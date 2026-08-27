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
#include "core/Advisory.H"
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
    //  Recorded BEFORE anything can fail: the fact being carried is "a sizing
    //  pass ran", not "a sizing pass succeeded".  CostingPass needs the first
    //  to tell an empty `sizings` that means "no pass" from one that means
    //  "every unit failed, and the reasons are printed above".
    result.sizingAttempted = true;
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

    std::vector<std::string> notSized;
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

            //  THE RULE THAT PRODUCED THE SIZE.  A volume whose rule is
            //  invisible can be reported and not defended: `V_R 7.6882` is
            //  the same table entry whether it came from a residence time, a
            //  space velocity, or the author typing it in, and those are
            //  three different design arguments.  `VesselSize` computed this
            //  string all along and discarded it.
            if (!dims.basis.empty())
            {
                std::cout << "        basis: " << dims.basis;
                //  AND SAY THAT Q IS IDEAL-GAS.  The volumetric flow driving
                //  every residence-time and space-velocity size is
                //  `N R T / P`, computed regardless of the thermo package the
                //  case declared.  At a knockout drum's 1 bar that is exact
                //  enough; at 50 bar a real Z of 0.8 undersizes the vessel by
                //  a fifth, and nothing said so.  Announced, never judged --
                //  the same posture as the extrapolated Antoine: the engine
                //  cannot know whether it matters to this reader, and a
                //  design correlation is entitled to its own approximations
                //  so long as they are not silent.
                if (dims.values.count("Q_gas"))
                    //  SIGNIFICANT digits, not decimals.  Q spans orders of
                    //  magnitude across the corpus (6e-4 m3/s for a bench
                    //  flash, tens for a plant), so a FIXED precision that
                    //  reproduces one is two significant figures on the
                    //  other -- and a reader multiplying by tau then misses
                    //  the printed volume.  Caught by the gate doing exactly
                    //  that: the same defect the B1/B2 columns had, one field
                    //  over, found because it was printed.
                    std::cout << "   (Q = N R T / P, IDEAL GAS, "
                              << std::defaultfloat << std::setprecision(6)
                              << dims.values.at("Q_gas") << " m3/s -- not the"
                                 " case's thermo package)";
                std::cout << "\n";
            }

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
            notSized.push_back(uname);
        }
    }

    //  AN INCOMPLETE SIZING SET SAYS SO (AS6), and it matters MORE here than
    //  in costing: `result.sizings` is what the costing pass reads, so a unit
    //  that fails to size cannot be costed either, and the omission
    //  propagates silently into FCI / NPV / IRR.  The returned count was
    //  discarded by both call sites.
    if (!notSized.empty())
    {
        std::cout << "  ^ " << notSized.size()
                  << " unit(s) could not be SIZED and are therefore absent"
                     " from `sizings` (and so from costing):";
        for (const auto& u : notSized) std::cout << " " << u;
        std::cout << "\n";
        AdvisoryLog::instance().add("sizing", "warning", "incomplete-sizing",
                                    "sizing omits " +
                                    std::to_string(notSized.size()) + " unit(s)");
    }
    std::cout << "=====================================================================\n\n";
    return failures;
}

} // namespace Choupo
