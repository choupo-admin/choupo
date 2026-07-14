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
  ElectrolytePackageActivity -- the CONSUME side of the Aspen property
  architecture.  It reports gamma_pm(m), phi(m), a_w(m) for the electrolyte that
  the ThermoPackageBuilder ALREADY assembled, reading ONLY `thermo.electrolyte()`
  -- no `cation`/`anion` keys, no loadSalt, no file path.  The salt was resolved
  by the selected propertyPackage; this op merely consumes the package.

  Its existence is the proof that the new architecture RUNS end-to-end: a case
  selects a propertyPackage, the builder assembles a ThermoPackage, and this op
  produces a real number from it.

        {
            name      gamma_nacl;
            type      electrolyteActivity;
            molality  { from 0.1; to 6.0; n 30; }
            output    { file pitzer_nacl.csv; }
        }

  CSV columns: m[mol/kg], gamma_pm, phi, a_w.  Diagnostics: gamma_pm_1m,
  gamma_pm_3m, phi_1m, aw_1m (the same KPIs pitzerActivity emits).
\*---------------------------------------------------------------------------*/

#pragma once

#include "propertyOps/PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class ElectrolytePackageActivity : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "electrolyteActivity"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
