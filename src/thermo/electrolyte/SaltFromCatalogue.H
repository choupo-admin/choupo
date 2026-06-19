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
  loadSalt(cation, anion) -- the ONE place that turns a pair of ion NAMES into a
  configured single-salt Pitzer kernel, reading the curated catalogue
  data/standards/electrolyte/{ions.dat,pairs.dat}.  Charges come from ions.dat;
  the salt stoichiometry is DERIVED from electroneutrality (Ca + Cl -> CaCl2).

  Single source of the catalogue-loading + stoichiometry logic, shared by every
  choupoProps op that consumes the electrolyte model (pitzerActivity,
  crystallizer, singleEffectEvaporator) -- so the Pitzer math is never duplicated
  per op (the forum's "single-source-of-math" rule).
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/Database.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "core/Dictionary.H"

#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

namespace fs = std::filesystem;

// ---- Case-local overlay for the electrolyte catalogue -------------------
//  EXACTLY like the component overlay (Database): the NEAREST
//  `constant/electrolyte/<file>` walking UP from the cwd OVERRIDES the standard
//  `standards/electrolyte/<file>` -- so a case that copies the ion/pair/tau
//  entries it uses into `constant/electrolyte/` is FULLY self-contained (every
//  parameter the solver reads lives in the case), while the standard catalogue
//  fills any entry the case did not localise (per-ENTRY merge, case wins).
inline fs::path caseElectrolytePath(const std::string& file)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        fs::path cand = p / "constant" / "electrolyte" / file;
        if (fs::exists(cand)) return cand;
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return {};
}

// Catalogue files to scan, case-local FIRST (overlay) then standard (base).
inline std::vector<fs::path> electrolytePaths(const std::string& file)
{
    std::vector<fs::path> v;
    fs::path cl = caseElectrolytePath(file);
    if (!cl.empty()) v.push_back(cl);
    fs::path st = fs::path(Database::currentRoot()) / "standards" / "electrolyte" / file;
    if (fs::exists(st)) v.push_back(st);
    return v;
}

// Find a (cation,anion)-keyed entry, case-local first; LOUD announce when a
// case-local file supplies it (no silent crutch -- the student sees the overlay).
inline DictPtr findPair(const std::string& file, const std::string& listKey,
                        const std::string& cation, const std::string& anion)
{
    bool first = true;
    for (const auto& path : electrolytePaths(file))
    {
        const bool isCase = first && !caseElectrolytePath(file).empty();
        first = false;
        auto d = Dictionary::fromFile(path.string());
        for (const auto& p : d->lookupDictList(listKey))
            if (p->lookupWord("cation") == cation && p->lookupWord("anion") == anion)
            {
                if (isCase)
                    std::cerr << "[overlay] electrolyte (" << cation << "," << anion
                              << ") from case-local " << path.string() << "\n";
                return p;
            }
    }
    return nullptr;
}

inline DictPtr findIon(const std::string& species)
{
    for (const auto& path : electrolytePaths("ions.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& i : d->lookupDictList("ions"))
            if (i->lookupWord("species") == species) return i;
    }
    return nullptr;
}

inline int ionCharge(const std::string& species)
{
    auto i = findIon(species);
    if (!i)
        throw std::runtime_error("electrolyte: ion '" + species
            + "' not in constant/electrolyte/ions.dat (case) or standards/electrolyte/ions.dat");
    return static_cast<int>(i->lookupScalar("z"));
}

// Molar mass [g/mol] of a named ion; 0.0 if not tabulated (a few complex ions
// ship with MW pending -- not needed for the gamma math).
inline double ionMW(const std::string& species)
{
    auto i = findIon(species);
    return (i && i->found("MW")) ? i->lookupScalar("MW") : 0.0;
}

// Build a configured PitzerSingleSalt for the salt M(nu_c) X(nu_a) named by its
// cation/anion species keys.  Throws (loudly) if either ion or the pair is absent.
inline PitzerSingleSalt loadSalt(const std::string& cation, const std::string& anion)
{
    const int zc = ionCharge(cation);          // > 0
    const int za = ionCharge(anion);           // < 0
    if (zc <= 0 || za >= 0)
        throw std::runtime_error("electrolyte: '" + cation + "' must be a cation and '"
            + anion + "' an anion (check ions.dat charges)");

    const int g = std::gcd(zc, -za);
    PitzerSingleSalt s;
    s.z_c = zc; s.z_a = -za;                    // magnitudes into the kernel
    s.nu_c = (-za) / g;                         // nu_c*zc = nu_a*|za| (electroneutral)
    s.nu_a = zc / g;

    auto p = findPair("pairs.dat", "pairs", cation, anion);
    if (!p)
        throw std::runtime_error("electrolyte: no Pitzer pair (" + cation + ", " + anion
            + ") in constant/electrolyte/pairs.dat (case) or standards/electrolyte/pairs.dat");
    s.beta0  = p->lookupScalar("beta0");
    s.beta1  = p->lookupScalar("beta1");
    s.beta2  = p->lookupScalarOrDefault("beta2", 0.0);
    s.Cphi   = p->lookupScalar("Cphi");
    s.alpha1 = p->lookupScalarOrDefault("alpha1", 2.0);
    s.alpha2 = p->lookupScalarOrDefault("alpha2", 12.0);
    // Silvester-Pitzer calorimetric T-slots (default 0 = frozen-beta; fitted
    // at curation time against Parker Phi_L -- bin/curate/fit_lphi_pitzer.py).
    s.dbeta0_dT = p->lookupScalarOrDefault("dbeta0_dT", 0.0);
    s.dbeta1_dT = p->lookupScalarOrDefault("dbeta1_dT", 0.0);
    s.dCphi_dT  = p->lookupScalarOrDefault("dCphi_dT",  0.0);
    return s;
}

// Aqueous infinite-dilution ion reference for a salt: Sum nu_i * (hfAq_i +
// cpAq_i (T-298.15)) [J/mol salt], on the H+(aq)=0 convention (the convention
// cancels for any neutral salt, so the sum sits on the ELEMENTS datum --
// consistent with h_pure_ig).  Returns false when an ion lacks the tier
// (ions.dat slice-2 fields) -- the caller must then keep the legacy path.
inline bool ionAqReference(const std::string& cation, const std::string& anion,
                           double nu_c, double nu_a,
                           double& hfAqSum, double& cpAqSum)
{
    auto c = findIon(cation), a = findIon(anion);
    if (!c || !a || !c->found("hfAq") || !a->found("hfAq")) return false;
    hfAqSum = nu_c * c->lookupScalar("hfAq") + nu_a * a->lookupScalar("hfAq");
    cpAqSum = nu_c * c->lookupScalarOrDefault("cpAq", 0.0)
            + nu_a * a->lookupScalarOrDefault("cpAq", 0.0);
    return true;
}

// Was this pair's T-dependence regressed against calorimetry?  Read the
// per-row flag (default false -- the slice-0 honesty gate).
inline bool pairCalorimetricFit(const std::string& cation, const std::string& anion)
{
    auto p = findPair("pairs.dat", "pairs", cation, anion);
    return p && p->lookupWordOrDefault("calorimetricFit", "false") == "true";
}

// Build a configured ENRTLSingleSalt (electrolyte-NRTL) for the named salt,
// reading tau/alpha from the curated catalogue electrolyte/enrtl.dat.
inline ENRTLSingleSalt loadENRTL(const std::string& cation, const std::string& anion)
{
    const int zc = ionCharge(cation), za = ionCharge(anion);
    if (zc <= 0 || za >= 0)
        throw std::runtime_error("eNRTL: '" + cation + "' must be a cation and '"
            + anion + "' an anion (check ions.dat charges)");
    const int g = std::gcd(zc, -za);
    ENRTLSingleSalt s;
    s.z_c = zc; s.z_a = -za;
    s.nu_c = (-za) / g; s.nu_a = zc / g;

    auto p = findPair("enrtl.dat", "enrtl", cation, anion);
    if (!p)
        throw std::runtime_error("eNRTL: no parameters for (" + cation + ", " + anion
            + ") in constant/electrolyte/enrtl.dat (case) or standards/electrolyte/enrtl.dat");
    s.tau_m_ca = p->lookupScalar("tau_m_ca");
    s.tau_ca_m = p->lookupScalar("tau_ca_m");
    s.alpha    = p->lookupScalarOrDefault("alpha", 0.2);
    return s;
}

} // namespace electrolyte
} // namespace Choupo
