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

#include "Adsorbent.H"

#include <stdexcept>

namespace Choupo {

void Adsorbent::readIdentity(const DictPtr& d, const std::string& sourcePath)
{
    auto a = d->subDict("adsorbent");
    name_     = a->lookupWord("name");
    type_     = a->lookupWordOrDefault("type", "");
    rho_bulk_ = a->lookupScalarOrDefault("rho_bulk", 0.0);
    cp_solid_ = a->found("cpSolid")
              ? a->lookupScalar("cpSolid", Dims::heatCapacity)
              : 0.0;
    d_particle_ = a->found("dParticle")
                ? a->lookupScalar("dParticle", Dims::length)
                : 0.0;
    sphericity_ = a->lookupScalarOrDefault("sphericity", 1.0);

    if (name_.empty())
        throw std::runtime_error("Adsorbent: " + sourcePath
            + " has no `name` entry");
    if (cp_solid_ < 0.0)
        throw std::runtime_error("Adsorbent '" + name_ + "': " + sourcePath
            + " declares a negative cpSolid; omit an unknown value or declare"
              " a positive heat capacity with provenance");
    if (d_particle_ < 0.0)
        throw std::runtime_error("Adsorbent '" + name_ + "': " + sourcePath
            + " declares a negative dParticle; omit an unknown value or"
              " declare a positive representative particle diameter");
    if (sphericity_ <= 0.0 || sphericity_ > 1.0)
        throw std::runtime_error("Adsorbent '" + name_ + "': " + sourcePath
            + " requires sphericity in (0,1]");

    // The material file carries IDENTITY only.  An embedded isotherms{} block
    // is the pre-migration layout --- refuse it with the remedy, never read it
    // silently alongside the pair catalogue (dead data is a lie).
    if (d->found("isotherms"))
        throw std::runtime_error("Adsorbent '" + name_ + "': " + sourcePath
            + " still embeds an isotherms{} block.  Equilibrium is "
            "(adsorbent x adsorbate) PAIR data and lives in the catalogue: "
            "move each species block to "
            "parameters/adsorption/equilibria/" + name_ + "/<species>.dat "
            "(model langmuir; parameters { q_max; b_298; dH_ads; } tRef; "
            "loadingBasis; pressureBasis; provenance{}) and DELETE isotherms{} "
            "from the adsorbent file.  bin/curate/check_adsorption_tree.py "
            "gates this layout.");
}

void Adsorbent::attachIsotherm(std::unique_ptr<IsothermModel> m,
                               const std::string& sourcePath)
{
    if (m->adsorbent() != name_)
        throw std::runtime_error("Adsorbent '" + name_ + "': equilibrium "
            "record " + sourcePath + " declares `adsorbent "
            + m->adsorbent() + ";` --- a mislabelled record is refused, not "
            "re-homed.");
    const std::string species = m->adsorbate();
    if (iso_.count(species))
        throw std::runtime_error("Adsorbent '" + name_ + "': species '"
            + species + "' already carries an equilibrium record; "
            + sourcePath + " is a SECOND source of truth (arity-1: one pair, "
            "one record).");
    iso_[species] = std::move(m);
}

bool Adsorbent::has(const std::string& comp) const
{
    return iso_.find(comp) != iso_.end();
}

const IsothermModel* Adsorbent::isotherm(const std::string& comp) const
{
    auto it = iso_.find(comp);
    if (it == iso_.end()) return nullptr;
    it->second->announceUse();
    return it->second.get();
}

scalar Adsorbent::loading(const std::string& comp,
                          const std::map<std::string, scalar>& partialP_Pa,
                          scalar T) const
{
    auto cit = iso_.find(comp);
    if (cit == iso_.end()) return 0.0;   // no equilibrium record => adsorbs nothing

    const IsothermModel& m = *cit->second;
    m.announceUse();

    // A non-saturating (henry) species is the dilute-coverage limit: it loads
    // competition-free and occupies no competitive sites.
    if (!m.saturates()) return m.q(T, partialP_Pa.count(comp)
                                        ? partialP_Pa.at(comp) : 0.0);

    // Shared competitive denominator: 1 + Sum_j b_j(T) * p_j over all species
    // that carry an equilibrium record on THIS adsorbent (each in its own
    // declared pressure basis).
    scalar denom = 1.0;
    for (const auto& kv : partialP_Pa)
    {
        auto jit = iso_.find(kv.first);
        if (jit == iso_.end()) continue;
        const IsothermModel& mj = *jit->second;
        mj.announceUse();
        denom += mj.affinity(T) * mj.pInBasis(kv.second);
    }

    auto pit = partialP_Pa.find(comp);
    const scalar p_i = (pit == partialP_Pa.end()) ? 0.0 : pit->second;
    return m.q_sat() * m.affinity(T) * m.pInBasis(p_i) / denom;
}

} // namespace Choupo
