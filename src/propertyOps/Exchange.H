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
  Exchange --- cation-exchange (ion-exchange softener) EQUILIBRIUM of ONE water
  analysis against a fixed-capacity resin (Gaines-Thomas mass action).  The
  water is FULLY equilibrated with the resin at the stated CEC and selectivity
  (exchange.dat), returning the LIMITING (softened) effluent: the post-exchange
  species table, the resin loadings (equivalent fractions), and the eq-for-eq
  salt penalty (Na added in exchange for Ca/Mg removed).

  THIS IS NOT A BED IN SERVICE.  A real fixed bed leaks rising hardness as the
  exchange front migrates to breakthrough, then must be regenerated -- TRANSIENT
  behaviour this equilibrium does not model.  A non-suppressible honesty banner
  says so on every run (verbosity >= 2 + an AdvisoryLog entry).

  Sibling of `speciate`: it reuses readAnalysis for the feed water (totals, pH,
  T) and adds the exchanger selection.  The math is the SAME log-space Newton
  (thermo/electrolyte/SpeciationSolver) with one extra master (the free resin
  site X-), one extra balance (CEC capacity), and the exchange half-reactions.

  Dictionary form:

        {
            name      softened;
            type      exchange;
            totals    { Ca 84 mg/L; Mg 27 mg/L; Na 363 mg/L; ... }
            pH        solve;                 // or a number (given)
            exchange  { resin SAC_Na; CEC 2.0 eq/L; }   // CEC optional (from .dat)
            temperature 298.15;              // [K] optional, default 25 C
            diagSpecies ( CaX2 NaX );        // optional: emit m_<name>
            output    { file softened.csv; }
        }

  CSV: the POST-exchange (softened) aqueous species table (species, molality,
  activity, gamma).  KPIs: hardness_in/out_mgL_CaCO3, hardness_removal_pct,
  Ca_leakage_mgL, Mg_leakage_mgL, Na_added_mgL, Na_added_meqL,
  resin_loading_beta_Ca/_Mg/_Na, CEC_utilised_pct, newtonIters.  Plus the
  exchange isotherm diag (loaded eq-fraction vs solution eq-fraction).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <map>
#include <string>

namespace Choupo {

namespace propertyOps {
// Read the `exchange { resin SAC_Na; CEC ...; }` block off an op dict -- a
// SEPARATE reader (readAnalysis stays untouched).  Resolves the resin .dat by
// exact name (data/standards/electrolyte/resins/ or case-local), loads the
// exchange.dat half-reaction network, converts CEC to eq/kg water (announcing
// the basis), and fills in.exchange.  Unknown keys / unknown resin / a bound
// species whose aqueous ion the analysis lacks are REFUSED.
void readExchange(const DictPtr& dict, electrolyte::SpeciationInput& in,
                  const electrolyte::SpeciationSolver& solver, int verbosity);
} // namespace propertyOps

class Exchange : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "exchange"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
