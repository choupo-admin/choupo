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
  PitzerActivity --- mean ionic activity coefficient gamma_pm(m), osmotic
  coefficient phi(m) and water activity a_w(m) for a single fully-dissociated
  salt in water at 25 C, by the Pitzer ion-interaction model.

  Parameters are CURATED data read BY ION NAME from the frozen catalogue
  data/standards/species/aqueous.dat (species + charge) + parameters/electrolyte/pitzer/pairs/ (Pitzer
  beta0/beta1/beta2/Cphi per cation-anion pair), resolved via
  Database::currentRoot() -- visible + cited, never typed per case.  The salt
  stoichiometry is DERIVED from the charges by electroneutrality (Ca + Cl ->
  CaCl2).  The math is in thermo/electrolyte/PitzerSingleSalt.H (a closed form).

  Dictionary form:

        {
            name      gamma_nacl;
            type      pitzerActivity;
            cation    Na;                   // -> ions.dat / pairs.dat by name
            anion     Cl;
            molality  { from 0.1; to 6.0; n 30; }
            output    { file pitzer_nacl.csv; }
        }

  CSV columns: m[mol/kg], gamma_pm, phi, a_w.  This first slice is isothermal at
  25 C (the catalogue parameters are 25 C); temperature dependence and multi-salt
  mixing arrive with the multi-ion model.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class PitzerActivity : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "pitzerActivity"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    { return { "gamma_AAD_pct", "phi_AAD_pct", "Lphi_AAD_rel_pct", "Lphi_AAD_abs_Jmol" }; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
