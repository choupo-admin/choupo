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
    Choupo::Adsorbent

Description
    An adsorbent MATERIAL: intrinsic identity only (name, material class,
    packed bulk density), loaded from `data/standards/adsorbents/<name>.dat`
    --- plus the per-species equilibrium isotherms ATTACHED to it by the
    AdsorbentRegistry from the pair catalogue
    `data/standards/parameters/adsorption/equilibria/<name>/<species>.dat`
    (forum #106: equilibrium is (adsorbent x adsorbate) PAIR data and never
    lives embedded in the material file; readIdentity REFUSES an embedded
    isotherms{} block --- dead data is a lie, there is no dual reader).

    The COMPETITIVE (extended-Langmuir) mixture loading is assembled here
    from the per-species IsothermModels --- a strong adsorbate suppresses a
    weak one through the shared site denominator:

        q_i = q_sat_i * b_i(T) * p_i / (1 + Sum_j b_j(T) * p_j)

    with b_j(T) = IsothermModel::affinity and p in each record's declared
    pressure basis (canonical SI [Pa] at this interface).  A henry species is
    the dilute-coverage limit --- it loads competition-free (q = H(T)*p) and
    occupies no competitive sites (affinity = 0).  A species with NO
    equilibrium record adsorbs nothing (q = 0): it falls fully to the
    raffinate (light product), the mirror of a membrane with no B_s,i.

    The Adsorbent class knows nothing about beds, cycles or hardware --- that
    lives on the PSA unit op.
\*---------------------------------------------------------------------------*/

#pragma once

#include "IsothermModel.H"

#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <string>

namespace Choupo {

class Adsorbent
{
public:
    Adsorbent() = default;

    // Load INTRINSIC identity from an adsorbents/<name>.dat dictionary.
    // REFUSES a file that still embeds an isotherms{} block, pointing at the
    // parameters/adsorption/equilibria/ layout (no silent dual reader).
    void readIdentity(const DictPtr& dict, const std::string& sourcePath);

    // Attach one per-species equilibrium record (keyed by its adsorbate).
    // Refuses a record labelled for a DIFFERENT adsorbent.
    void attachIsotherm(std::unique_ptr<IsothermModel> m,
                        const std::string& sourcePath);

    // ---- Identification ----------------------------------------------------
    const std::string& name() const { return name_; }
    const std::string& type() const { return type_; }
    scalar rho_bulk()         const { return rho_bulk_; }   // kg/m^3 (0 = unknown)
    scalar cpSolid()          const { return cp_solid_; }    // J/(kg.K), 0 = unknown
    scalar dParticle()        const { return d_particle_; }  // m, 0 = unknown
    scalar sphericity()       const { return sphericity_; }  // dimensionless

    // ---- Isotherm accessors ------------------------------------------------
    bool has(const std::string& comp) const;

    // The pure-component model, or nullptr if the species carries none.
    const IsothermModel* isotherm(const std::string& comp) const;

    // Competitive (extended-Langmuir) loading of `comp` [mol/kg] given the
    // partial pressures [Pa] of ALL species (keyed by component short-name)
    // and the bed temperature T [K].  Species without an equilibrium record
    // contribute neither loading nor site competition.
    scalar loading(const std::string& comp,
                   const std::map<std::string, scalar>& partialP_Pa,
                   scalar T) const;

    const std::map<std::string, std::unique_ptr<IsothermModel>>& isotherms() const
    {
        return iso_;
    }

private:
    std::string  name_;
    std::string  type_;
    scalar       rho_bulk_ = 0.0;
    scalar       cp_solid_ = 0.0;
    scalar       d_particle_ = 0.0;
    scalar       sphericity_ = 1.0;

    std::map<std::string, std::unique_ptr<IsothermModel>> iso_;
};

} // namespace Choupo
