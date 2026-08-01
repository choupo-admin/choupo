/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vitor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.  See UnmodelledSolutes.H for what this
    measures and why it is measured in one place.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/electrolyte/UnmodelledSolutes.H"

#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <sstream>

namespace Choupo {

UnmodelledSolutes unmodelledSolutes(const ThermoPackage&            thermo,
                                    const sVector&                  x,
                                    const std::vector<std::size_t>& solventIdx,
                                    std::size_t                     iSalt)
{
    UnmodelledSolutes r;
    const std::size_t n = thermo.n();

    auto isSolvent = [&](std::size_t i)
    {
        return std::find(solventIdx.begin(), solventIdx.end(), i) != solventIdx.end();
    };

    scalar solventMoleMass = 0.0;   // sum x_s * MW_s  [g per mole of mixture]
    for (std::size_t s : solventIdx)
        if (s < n) solventMoleMass += x[s] * thermo.comp(s).MW();
    if (solventMoleMass <= 0.0) return r;

    scalar foreign = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (i == iSalt || isSolvent(i) || x[i] <= 0.0) continue;
        foreign += x[i];
        r.names.push_back(thermo.comp(i).name());
    }
    //  x_i / (sum_s x_s MW_s / 1000) = mol i per kg of solvent -- the same
    //  basis every molality in this project is on.
    r.molality = foreign * 1000.0 / solventMoleMass;
    return r;
}

std::string UnmodelledSolutes::note(const std::string& saltName,
                                    const std::string& whatIsAffected) const
{
    if (!any()) return {};
    std::ostringstream os;
    os << "[unmodelledSolutes] the liquid carries " << molality
       << " mol/kg of dissolved ";
    for (std::size_t i = 0; i < names.size(); ++i)
        os << (i ? ", " : "") << names[i];
    os << " -- not '" << saltName << "', and not represented by the"
          " single-salt electrolyte model.  " << whatIsAffected
       << " is evaluated on the salt alone, because that is the system the"
          " model was fitted on; their own contribution is NOT included.";
    return os.str();
}

} // namespace Choupo
