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
  Speciate --- aqueous speciation of ONE water analysis: free molality,
  activity and Davies activity coefficient of every species, the ionic
  strength, and the saturation index SI = log10(IAP/K(T)) of every mineral in
  the catalogue whose ions are present.  pH is GIVEN (`pH 7.8;`) or SOLVED
  (`pH solve;` -- H+ joins the unknowns, ELECTRONEUTRALITY closes the system,
  and the feed charge imbalance is ANNOUNCED before solving); optionally OPEN
  to the atmosphere (`atmosphere { pCO2 ... }` -- a(CO2aq) pinned by Henry,
  the HCO3 mole balance REPLACED by the pin, DIC a solved outcome).  The math
  (and the full given-vs-solved / closed-vs-open contract) is
  thermo/electrolyte/SpeciationSolver.

  Reactions/minerals are CURATED data (case constant/electrolyte/speciation.dat
  overlay, else chemistry/aqueousSpeciation/ + components/ solidPhases), charges
  from species/aqueous/.

  Dictionary form:

        {
            name      feed;
            type      speciate;
            totals    { Ca 84 mg/L; SO4 2.6 mmol/kg; HCO3 0.0030 mol/kg; ... }
            pH        solve;                // or a number (given): pH 7.8;
            atmosphere { pCO2 4.2e-4 atm; } // optional: OPEN system; the
                                            //   pressure unit is MANDATORY
            temperature 298.15;             // [K] optional, default 25 C
            diagSpecies ( OH CaSO4aq );     // optional: emit m_<name> diagnostics
            output    { file speciation.csv; }
        }

  CSV columns: species, molality, activity, gamma.  Diagnostics: I, aw, pH
  (solved or echoed), one SI_<mineral> per available mineral, and m_<name>
  per diagSpecies entry --- the golden master locks all of them.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <map>
#include <string>

namespace Choupo {

namespace propertyOps {
// Read the water analysis off an op dict (shared by speciate / scalingScan):
// optional `totals {}` (absent/empty = pure water; units mandatory per entry),
// REQUIRED `pH` (a number = given, or the word `solve` = electroneutrality
// closure), optional `atmosphere { pCO2 ... }` (OPEN system, pressure unit
// mandatory), optional `temperature` [K] (default 25 C).
electrolyte::SpeciationInput readAnalysis(const DictPtr& dict);

// Read the optional `equilibrate { minerals ( calcite gypsum ); }` block off an
// op dict (sibling of readAnalysis -- a SEPARATE reader, NOT an extension of it)
// and append the allowed-mineral set to `in`.  Absent block = empty set (today's
// SI-only behaviour, byte-identical by construction).  Unknown keys inside
// equilibrate{} are REFUSED naming the v1 grammar (seed{}/targetSI{} reserved,
// not implemented).
void readEquilibrate(const DictPtr& dict, electrolyte::SpeciationInput& in);
} // namespace propertyOps

class Speciate : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "speciate"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    { return { "pH", "I", "aw" }; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
