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
    This file is part of Choupo.  Choupo is free software under the GNU General
    Public License v3.0-or-later.  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  MolecularActivity -- the MOLECULAR twin of ElectrolytePackageActivity.  It
  reports the activity coefficient gamma_i of each component at a composition + T,
  reading ONLY `thermo.activity().gamma(T,x)` from the package the
  ThermoPackageBuilder assembled.  Proves U4: the same builder + the same consume
  pattern serve a molecular system (ethanol-water NRTL) as well as an electrolyte.

        {
            name        g_nrtl;
            type        activityCoefficients;
            temperature 298.15;
            composition { ethanol 0.5; water 0.5; }
            output      { file gamma.csv; }
        }

  Diagnostics: gamma_<component> for each component.
\*---------------------------------------------------------------------------*/

#pragma once

#include "propertyOps/PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class MolecularActivity : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "activityCoefficients"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
