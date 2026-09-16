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
Namespace
    Choupo::edLimitingCurrent

Description
    Implementation.  See LimitingCurrent.H for the equations and their
    numbering in Geraldes & Afonso, J. Membr. Sci. 360 (2010) 499-508.
\*---------------------------------------------------------------------------*/

#include "LimitingCurrent.H"

#include "unitOperations/electrochem/Electrochem.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {
namespace edLimitingCurrent {

const std::vector<std::string>& acceptedModels()
{
    static const std::vector<std::string> m =
        { "GeraldesAfonso2010", "CowanBrown" };
    return m;
}

scalar effectiveDiffusivity(const std::vector<Ion>& ions)
{
    //  Equivalent concentrations; C_S is their total over the cations (which
    //  equals the total over the anions, by electroneutrality).
    scalar eqCat = 0.0, eqAn = 0.0;
    for (const auto& i : ions)
    {
        if (i.z > 0.0) eqCat += i.z * i.C;
        else if (i.z < 0.0) eqAn += -i.z * i.C;
    }
    if (eqCat <= 0.0 || eqAn <= 0.0)
        throw std::runtime_error("edLimitingCurrent: the diluate carries "
            + std::string(eqCat <= 0.0 ? "no cation" : "no anion")
            + " -- the effective diffusivity of a multi-ionic solution"
              " (Geraldes & Afonso 2010, Eq. A13) is built from the"
              " equivalent fractions of BOTH signs.");

    //  D_eff = [ SUM_i X+_i D_i * SUM_j X-_j (z_i + |z_j|) D_j ]
    //          / [ SUM_i X+_i z_i D_i + SUM_j X-_j |z_j| D_j ]
    //  with the equivalent fractions taken on their OWN sign's total, which
    //  is what makes this identical to the salt-indexed Eq. (A13).
    scalar num = 0.0, den = 0.0;
    for (const auto& ci : ions)
    {
        if (ci.z <= 0.0) continue;
        const scalar Xc = ci.z * ci.C / eqCat;
        scalar inner = 0.0;
        for (const auto& aj : ions)
        {
            if (aj.z >= 0.0) continue;
            const scalar Xa = -aj.z * aj.C / eqAn;
            inner += Xa * (ci.z - aj.z) * aj.D;
        }
        num += Xc * ci.D * inner;
        den += Xc * ci.z * ci.D;
    }
    for (const auto& aj : ions)
    {
        if (aj.z >= 0.0) continue;
        den += (-aj.z * aj.C / eqAn) * (-aj.z) * aj.D;
    }
    if (den <= 0.0 || num <= 0.0 || !std::isfinite(num / den))
        throw std::runtime_error("edLimitingCurrent: the effective diffusivity"
            " of this solution did not come out positive and finite (Eq. A13"
            " numerator " + std::to_string(num) + ", denominator "
            + std::to_string(den) + ") -- every ion needs a positive"
            " diffusivity and a positive concentration.");
    return num / den;
}

std::vector<scalar> limitingTransportNumbers(const std::vector<Ion>& ions,
                                             bool cationExchangeMembrane)
{
    //  Eq. (12) for the CEM (over the cations), Eq. (13) for the AEM (over
    //  the anions).  Every CO-ion gets exactly zero: the model's own
    //  assumption, not a rounding.
    scalar sum = 0.0;
    for (const auto& i : ions)
    {
        const bool counter = cationExchangeMembrane ? (i.z > 0.0) : (i.z < 0.0);
        if (counter) sum += std::abs(i.z) * i.D * i.C;
    }
    std::vector<scalar> t(ions.size(), 0.0);
    if (sum <= 0.0) return t;
    for (std::size_t k = 0; k < ions.size(); ++k)
    {
        const bool counter = cationExchangeMembrane ? (ions[k].z > 0.0) : (ions[k].z < 0.0);
        if (counter) t[k] = std::abs(ions[k].z) * ions[k].D * ions[k].C / sum;
    }
    return t;
}

scalar limitingCurrentEq15(const std::vector<Ion>&    ions,
                           const std::vector<scalar>& t_lim,
                           scalar                     k_c_eff,
                           scalar                     D_eff)
{
    if (ions.size() != t_lim.size())
        throw std::runtime_error("edLimitingCurrent: Eq. 15 was handed "
            + std::to_string(t_lim.size()) + " transport numbers for "
            + std::to_string(ions.size()) + " ions.");
    scalar sumC = 0.0, sumT = 0.0;
    for (std::size_t k = 0; k < ions.size(); ++k)
    {
        sumC += ions[k].C;
        if (t_lim[k] != 0.0) sumT += t_lim[k] / (ions[k].z * ions[k].D);
    }
    if (sumT == 0.0)
        throw std::runtime_error("edLimitingCurrent: Eq. 15 has no counter-ion"
            " on this membrane -- every limiting transport number is zero.");
    return electrochem::Faraday * (k_c_eff / D_eff) * sumC / sumT;
}

bool singleSaltEq16(const std::vector<Ion>& ions,
                    scalar                  k_c,
                    scalar                  t_cu_lim,
                    scalar&                 i_lim)
{
    const Ion* cat = nullptr;
    const Ion* an  = nullptr;
    for (const auto& i : ions)
    {
        if (i.z > 0.0) { if (cat) return false; cat = &i; }
        else if (i.z < 0.0) { if (an) return false; an = &i; }
    }
    if (!cat || !an) return false;
    //  C_b is the SALT concentration in equiv./m3 (cation equivalents).
    const scalar C_b = cat->z * cat->C;
    const scalar zD1 = cat->z * cat->D;
    const scalar zD2 = -an->z * an->D;
    const scalar denom = t_cu_lim - zD1 / (zD1 + zD2);
    if (denom == 0.0) return false;
    i_lim = electrochem::Faraday * k_c * C_b / denom;
    return true;
}

} // namespace edLimitingCurrent
} // namespace Choupo
