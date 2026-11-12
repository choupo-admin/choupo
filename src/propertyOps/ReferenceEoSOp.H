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
-------------------------------------------------------------------------------
Class
    Choupo::ReferenceEoSOp

Description
    `referenceEoS` -- a pure fluid from its REFERENCE (multiparameter
    Helmholtz) equation of state, the kernel in
    src/thermo/equationOfState/{HelmholtzEnergy,ReferenceFluid}.  One state
    per op, exactly ONE mode block:

      {
          name     water_500K_10MPa;
          type     referenceEoS;
          equation IAPWS95;                  // data/standards/parameters/Helmholtz/<equation>.dat
          state    { T 500 K; p 10 MPa; }    // (T, p): the stable root, its branch said
      }
      {   ...  state { T 300 K; rho 996.556 kg/m3; } }       // (T, rho): explicit
      {   ...  state { T 300 K; p 1 bar; branch vapour; } }  // a named (metastable) branch
      {   ...  saturation { T 450 K; } }                     // Maxwell: psat, rhoL, rhoV, h, s
      output { file state.csv; }                            // optional, SI

    Every run announces the equation, its primary publication, its
    validity window and the result of the record's own check values (all
    of them, at the printed precision; a record that fails is refused at
    load).  A (T, p) outside the window is ANNOUNCED as an extrapolation,
    with the publication's own words on extrapolating it.  Below T_c a
    (T, p) query lists EVERY density root of the isotherm (stable and
    metastable, with their Gibbs energies) -- the root is never chosen
    silently.  At verbosity 3 the term-by-term contributions to alpha and
    its derivatives are printed: the glass box of the equation.

    Diagnostics (SI, per unit mass): rho, p, h, u, s, g, cp, cv, w, phi
    (fugacity coefficient), and for a saturation op psat, rhoL, rhoV, hL,
    hV, sL, sV, hLV; always checkValues, checksReproduced,
    worstCheckRelDev.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class ReferenceEoSOp : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "referenceEoS"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::string diagnosticUnit(const std::string& key) const override;

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
