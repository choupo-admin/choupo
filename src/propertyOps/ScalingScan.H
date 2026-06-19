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

/*---------------------------------------------------------------------------*\
  ScalingScan --- the membrane-scaling audit: speciate a feed water analysis
  at a series of RO/NF recoveries and report the mineral saturation indices.

  At recovery r the concentrate totals are feed/(1 - r): PURE WATER REMOVAL
  (every dissolved master concentrates by the same factor; no permeation of
  ions, no precipitation credit).  pH is HELD at the feed value (`pH 7.8;`)
  or SOLVED per point (`pH solve;` -- electroneutrality closes each
  concentrate state; the feed charge imbalance is announced at the first
  point).  Optional `atmosphere { pCO2 ... }` = OPEN system: a(CO2aq) is
  pinned by Henry at every point, the HCO3 mole balance is REPLACED by the
  pin, and DIC is a solved outcome.  THE LESSON: closed + solve = DIC is
  conserved and concentrates with the water; open + solve = the concentrate
  exchanges CO2 with the atmosphere per point (a CO2-rich groundwater
  DEGASES -- the pH and the calcite SI jump ABOVE the closed curve) -- the
  calcite SI curves DIFFER, and that contrast is the lesson.  Speciation/SI
  math (and the full contract): thermo/electrolyte/SpeciationSolver (Davies
  activity -- trustworthy to I ~ 0.5 mol/kg, indicative beyond).

  Dictionary form:

        {
            name      scan;
            type      scalingScan;
            totals    { Ca 84 mg/L; SO4 2.6 mmol/kg; HCO3 0.0030 mol/kg; ... }
            pH        solve;                // or a number (held across the scan)
            atmosphere { pCO2 4.2e-4 atm; } // optional: OPEN system; the
                                            //   pressure unit is MANDATORY
            temperature 298.15;             // [K] optional, default 25 C
            recovery  { from 0; to 0.85; n 18; }
            output    { file scaling_scan.csv; }
        }

  CSV columns: recovery, I, pH, then one SI_<mineral> column per catalogue
  mineral whose ions are present (the GUI auto-plots SI vs recovery).
  Diagnostics: I, pH and each SI at r = from (suffix _r0) and r = to (_rmax).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class ScalingScan : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "scalingScan"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
