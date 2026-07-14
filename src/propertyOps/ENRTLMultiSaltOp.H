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
  ENRTLMultiSaltOp --- gamma_pm of TWO (or more) salts sharing a solution, by
  the MULTICOMPONENT symmetric eNRTL of Song & Chen 2009 (DOI
  10.1021/ie9004578) on the aqueous infinite-dilution surface.  The math is
  thermo/electrolyte/ENRTLMultiSalt.H (closed form + FD oracle).

  Sweeps the salt-fraction at CONSTANT TOTAL MOLALITY (the classic Harned
  experiment: e.g. NaCl-KCl-H2O at 4 mol/kg total) and reports gamma_pm of
  every salt across the sweep.  Pair parameters come from the curated eNRTL
  catalogue by (cation, anion) name -- case-local overlay first, then
  data/standards/parameters/electrolyte/eNRTL/.

  Dictionary form:

        {
            name      harned_nacl_kcl;
            type      enrtlMultiSalt;
            salts     ( { cation Na; anion Cl; } { cation K; anion Cl; } );
            totalMolality 4.0;          // mol/kg, constant across the sweep
            sweepPoints   21;           // fraction grid of salt [1]
            tauEE         0.0;          // same-anion tau_(c a),(c' a) [optional]
            output    { file harned.csv; }
        }

  CSV columns: x2, m1, m2, gamma1, gamma2, ln_gamma1, ln_gamma2.
  Diagnostics (golden-locked): per-salt pure/trace gamma, Harned-rule slope +
  linearity R^2 per salt, the single-salt reduction pin (must be ~0), and the
  DECLARED Gibbs-Duhem inconsistency of the published multi-electrolyte
  expressions at the mid-sweep state (the refined-eNRTL motivation, printed
  aloud -- never hidden).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

namespace Choupo {

class ENRTLMultiSaltOp : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "enrtlMultiSalt"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    { return { "gamma1_trace", "gamma2_trace", "harned_R2_min", "gibbsDuhem_dev_mid" }; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
