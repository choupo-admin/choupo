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
  ENRTLMixedSolventOp --- gamma_pm(m) of a 1-1 salt in a water+alcohol mixed
  solvent by the GENERALIZED segment-based eNRTL (Chen & Song 2004, DOI
  10.1002/aic.10151), VALIDATED point-by-point against a measured dataset the
  case carries inline (cited).  The math is thermo/electrolyte/
  ENRTLMixedSolvent.H (closed form, glass-box).

  Dictionary form (all taus/X:Z default to the published water-ethanol-NaCl
  values; override to run another alcohol/salt):

        {
            name     esteso;
            type     enrtlMixedSolvent;
            systems
            (
                {
                    wtAlcohol 20;        // wt% alcohol in the salt-free solvent
                    Aphi      0.4878;    // measured mixed-solvent A_phi (cite!)
                    data ( { m 0.1005; gamma 0.730; } ... );   // measured gamma_pm
                }
                ...
            );
            output   { file enrtl_esteso.csv; }
        }

  CSV columns: wt_alcohol, m, gamma_exp, gamma_calc, err_pct.  Diagnostics:
  AAD_total_pct (the headline), AAD_wt<NN>_pct per composition, n_points ---
  locked by the golden master.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

namespace Choupo {

class ENRTLMixedSolventOp : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "enrtlMixedSolvent"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    { return { "AAD_total_pct", "n_points" }; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
