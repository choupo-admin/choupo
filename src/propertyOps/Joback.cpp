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

#include "Joback.H"
#include "DerivedClosures.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"

#include <cmath>
#include <filesystem>
#include <map>

namespace Choupo {

namespace {

// One Joback first-order group: molecular weight + atom count (for Pc) +
// the tabulated contributions.  Values from Joback & Reid (1987), as
// tabulated in Poling, Prausnitz & O'Connell, "The Properties of Gases and
// Liquids", 5th ed., Table 2-2.  Cp coefficients give Cp_ig in J/(mol K)
// with T in K; dHf / dGf in kJ/mol; dHv (vaporisation at Tb) in kJ/mol;
// dVc in cm^3/mol; dTb / dTc dimensionless contributions per the formulas.
struct Group
{
    double MW;   int nA;
    double dTc, dPc, dVc, dTb, dHf, dGf;
    double a, b, c, d;     // ideal-gas Cp polynomial contributions
    double dHv;            // heat of vaporisation at Tb
};

// A readable, tokenizer-safe key per group (no special chars).  Alkene sp2
// carbons use an `e` prefix (ene); alkyne sp carbons a `yne` prefix; aromatic
// ring atoms an `ar` prefix; saturated-ring atoms an `r` prefix.  The full
// Joback Table 2-2 (41 groups) is covered: hydrocarbons (incl. alkynes and
// ring carbons), halogens (F/Cl/Br/I), O families (alcohol/phenol/ether/ring-
// ether/ketone/ring-ketone/aldehyde/acid/ester/=O), N families (amines, ring-
// NH, =N-, nitrile, nitro) and S families (thiol, sulfide, ring-sulfide).
// Loaded ONCE from data/standards/joback/groups.dat (resolved via
// Database::currentRoot()), replacing the former hard-coded table -- the
// parameters now live as curated DATA alongside UNIFAC/Henry, visible + editable.
// Values are unchanged (the .dat was generated from the old table verbatim).
// The table's stable identity (`tableId` in groups.dat) -- the ONE source the
// structured provenance's methodVersion and the drift checker both read.
const std::string& tableId()
{
    static const std::string id = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot()) / "standards" / "joback" / "groups.dat";
        return Dictionary::fromFile(p.string())->lookupWordOrDefault("tableId", "");
    }();
    return id;
}

const std::map<std::string, Group>& table()
{
    static const std::map<std::string, Group> t = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot()) / "standards" / "joback" / "groups.dat";
        const auto d = Dictionary::fromFile(p.string());
        std::map<std::string, Group> m;
        for (const auto& g : d->lookupDictList("groups"))
            m[g->lookupWord("name")] = Group{
                g->lookupScalar("MW"),  static_cast<int>(g->lookupScalar("nA")),
                g->lookupScalar("dTc"), g->lookupScalar("dPc"), g->lookupScalar("dVc"),
                g->lookupScalar("dTb"), g->lookupScalar("dHf"), g->lookupScalar("dGf"),
                g->lookupScalar("cpa"), g->lookupScalar("cpb"), g->lookupScalar("cpc"),
                g->lookupScalar("cpd"), g->lookupScalar("dHv") };
        return m;
    }();
    return t;
}

// Lee-Kesler acentric factor from (Tb, Tc, Pc) -- Poling et al. eq. 2-3.4.
// Pc in atm; Tbr = Tb/Tc.

} // namespace

std::string Joback::version() const
{
    return tableId();
}

std::vector<std::string> Joback::knownGroups() const
{
    std::vector<std::string> out;
    for (const auto& kv : table()) out.push_back(kv.first);
    return out;
}

ConstantEstimate Joback::estimate(const std::vector<GroupSpec>& groups,
                                  bool& ok, std::string& error) const
{
    ok = true; error.clear();
    ConstantEstimate r;

    int nA = 0;
    double sTc = 0, sPc = 0, sVc = 0, sTb = 0, sHf = 0, sGf = 0, sHv = 0;
    double sa = 0, sb = 0, sc = 0, sd = 0, MW = 0;

    for (const auto& gs : groups)
    {
        auto it = table().find(gs.first);
        if (it == table().end())
        {
            ok = false;
            error = "unknown group '" + gs.first + "'.  Known groups: ";
            for (const auto& kv : table()) error += kv.first + " ";
            return r;
        }
        const Group& g = it->second;
        const int n = gs.second;
        nA += n * g.nA;  MW += n * g.MW;
        sTc += n * g.dTc;  sPc += n * g.dPc;  sVc += n * g.dVc;  sTb += n * g.dTb;
        sHf += n * g.dHf;  sGf += n * g.dGf;  sHv += n * g.dHv;
        sa  += n * g.a;    sb  += n * g.b;    sc  += n * g.c;    sd  += n * g.d;
        r.breakdown.push_back({ gs.first, n, g.dTb, g.dTc, g.dHf });
    }

    // ---- Joback correlations (identical to the historical inline version) ----
    r.MW     = MW;
    r.nA     = nA;
    r.Tb     = 198.2 + sTb;                                       // K
    r.Tc     = r.Tb / (0.584 + 0.965 * sTc - sTc * sTc);         // K
    r.Pc_bar = 1.0 / std::pow(0.113 + 0.0032 * nA - sPc, 2);     // bar
    r.Vc     = 17.5 + sVc;                                        // cm^3/mol
    r.Hf     = 68.29 + sHf;                                       // kJ/mol (ig)
    r.Gf     = 53.88 + sGf;                                       // kJ/mol (ig)
    r.Hvap   = 15.30 + sHv;                                       // kJ/mol at Tb
    r.cpa = sa - 37.93;  r.cpb = sb + 0.210;
    r.cpc = sc - 3.91e-4;  r.cpd = sd + 2.06e-7;
    r.omega  = closures::leeKeslerOmega(r.Tb, r.Tc, r.Pc_bar / 1.01325);

    return r;
}

} // namespace Choupo
