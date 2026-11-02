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
    This file is part of Choupo.  GPL-3.0-or-later; see AqueousSplit.H.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "AqueousSplit.H"

#include "core/Dimensions.H"
#include "core/Identifiers.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace membrane {

namespace {

std::string fmt(scalar v, const char* f = "%.6g")
{
    char b[64];
    std::snprintf(b, sizeof(b), f, static_cast<double>(v));
    return b;
}

bool isWord(const DictPtr& d, const std::string& k)
{ return std::holds_alternative<std::string>(d->entryValue(k)); }

bool isList(const DictPtr& d, const std::string& k)
{ return std::holds_alternative<std::vector<std::string>>(d->entryValue(k)); }

scalar fraction01(const DictPtr& d, const std::string& k, const std::string& who)
{
    const scalar v = d->lookupScalar(k, Dims::dimensionless);
    if (!std::isfinite(v) || v < 0.0 || v > 1.0)
        throw std::runtime_error(who + ": `" + k + "` is " + fmt(v) + " -- an"
            " intrinsic rejection lies in [0, 1].");
    return v;
}

} // namespace

// ---------------------------------------------------------------------------
AqueousSplitSpec readAqueousSplit(const DictPtr& split, const std::string& who0)
{
    const std::string who = who0 + ": `aqueousSplit {}`";
    AqueousSplitSpec s;
    for (const auto& k : split->keys())
        if (k != "component" && k != "acid" && k != "base" && k != "pH"
         && k != "pHSource" && k != "rejection")
            throw std::runtime_error(who + " declares `" + k + "`, which it"
                " does not read.  It reads `component`, `acid`, `base`, `pH`,"
                " `pHSource` and `rejection {}`.");
    for (const char* k : {"component", "acid", "base", "pH", "pHSource", "rejection"})
        if (!split->found(k))
            throw std::runtime_error(who + " declares no `" + std::string(k)
                + "` -- every key is required (the pH is DECLARED in Stage 1,"
                  " and the case must say where it comes from).");
    s.component = split->lookupWord("component");
    s.acid      = split->lookupWord("acid");
    s.base      = split->lookupWord("base");
    s.pH        = split->lookupScalar("pH");
    s.pHSource  = split->lookupWord("pHSource");
    if (!(s.pH >= 0.0 && s.pH <= 14.0))
        throw std::runtime_error(who + ": pH " + fmt(s.pH) + " is outside [0, 14].");
    if (s.pHSource.empty())
        throw std::runtime_error(who + ": `pHSource` is empty.");

    auto r = split->subDict("rejection");
    const auto keys = r->keys();
    auto has = [&](const char* k) { return r->found(k); };
    for (const auto& k : keys)
        if (k != "tests" && k != "acid" && k != "base")
            throw std::runtime_error(who + ": `rejection {}` declares `" + k
                + "`; it reads `tests ( id1 id2 )` (two rated tests at two pH"
                  " give both forms), or `acid` and `base`.");
    if (has("tests"))
    {
        if (has("acid") || has("base"))
            throw std::runtime_error(who + ": `rejection { tests ( ... ) }` and"
                " `acid`/`base` together -- two rated tests determine BOTH"
                " forms; declare either the tests or the pair, not both.");
        if (!isList(r, "tests"))
            throw std::runtime_error(who + ": `tests` is `( id1 id2 )`, the ids"
                " of two rated tests of the component.");
        s.testIds = r->lookupWordList("tests");
        if (s.testIds.size() != 2)
            throw std::runtime_error(who + ": `tests` names " + std::to_string(s.testIds.size())
                + " rated test(s); the split has TWO unknowns (the permeance of"
                  " the acid and of the base), identifiable only from TWO tests"
                  " at two different pH.  With one test, declare the acid from"
                  " it and give the base: `acid ( fromRatedTest <id> ); base"
                  " ( sameAs <solute> );` -- the base then enters as a declared"
                  " assumption, announced.");
        if (s.testIds[0] == s.testIds[1])
            throw std::runtime_error(who + ": `tests` names the same test twice"
                " ('" + s.testIds[0] + "') -- one pH, one equation, two unknowns.");
        return s;
    }
    if (!has("acid") || !has("base"))
        throw std::runtime_error(who + ": `rejection {}` needs `tests ( id1 id2 )`"
            " or BOTH `acid` and `base`.");
    //  the acid: a number, or ( fromRatedTest <id> )
    if (isList(r, "acid"))
    {
        const auto w = r->lookupWordList("acid");
        if (w.size() != 2 || w[0] != "fromRatedTest")
            throw std::runtime_error(who + ": `acid` is a number in [0, 1] or"
                " `( fromRatedTest <id> )`.");
        s.acidTest = w[1];
    }
    else if (isWord(r, "acid"))
        throw std::runtime_error(who + ": `acid` is the word `" + r->lookupWord("acid")
            + "`; write a number in [0, 1] or `( fromRatedTest <id> )`.");
    else
    {
        s.hasAcidValue = true;
        s.acidValue    = fraction01(r, "acid", who);
    }
    //  the base: a number, or ( sameAs <solute> )
    if (isList(r, "base"))
    {
        const auto w = r->lookupWordList("base");
        if (w.size() != 2 || w[0] != "sameAs")
            throw std::runtime_error(who + ": `base` is a number in [0, 1] or"
                " `( sameAs <solute> )` (the intrinsic rejection of another"
                " solute of the unit).");
        s.baseSameAs = w[1];
    }
    else if (isWord(r, "base"))
        throw std::runtime_error(who + ": `base` is the word `" + r->lookupWord("base")
            + "`; write a number in [0, 1] or `( sameAs <solute> )`.");
    else
    {
        s.hasBaseValue = true;
        s.baseValue    = fraction01(r, "base", who);
    }
    return s;
}

// ---------------------------------------------------------------------------
SplitState splitAt(const ThermoPackage& thermo,
                   const AqueousSplitSpec& spec,
                   const std::vector<std::pair<std::size_t, scalar>>& bulk,
                   scalar rho, scalar T, scalar pH, int verbosity)
{
    const auto& chem = thermo.aqueousChemistry();
    if (!chem.declared || chem.activityModel.empty())
        throw std::runtime_error("aqueousSplit refused: this case declares no"
            " aqueous chemistry, and the split's alpha is the PACKAGE's.  Add"
            " to constant/thermoPhysPropDict:\n"
            "    equilibrium { aqueous { activityModel { model davies; } } }\n"
            "No default is applied.");

    scalar solutes = 0.0;                       // kg/m3
    for (const auto& b : bulk) solutes += b.second * thermo.comp(b.first).MW();
    const scalar water = rho - solutes;         // kg water per m3 of solution
    if (!(water > 0.0))
        throw std::runtime_error("aqueousSplit: the solutes weigh " + fmt(solutes)
            + " kg/m3, not less than the solution density " + fmt(rho) + ".");

    electrolyte::SpeciationInput in;
    in.solvePH = false;
    in.pH      = pH;
    in.T       = T;
    bool sawComponent = false;
    for (const auto& b : bulk)
    {
        if (!(b.second > 0.0)) continue;
        const std::string nm = thermo.comp(b.first).name();
        const auto it = chem.aqueousMapping.find(ComponentId(nm));
        if (it == chem.aqueousMapping.end() || it->second.empty())
            throw std::runtime_error("aqueousSplit: component '" + nm + "' is in"
                " the bulk and declares no aqueous bridge (`aqueousMapping` or"
                " `dissociatesTo`) -- the package cannot speciate what it cannot"
                " map to species, and no name-identity fallback is applied.");
        for (const auto& st : it->second)
            in.totals[st.species] += st.nu * b.second * 1.0e3 / water;
        if (nm == spec.component)
        {
            sawComponent = true;
            if (it->second.size() != 1 || it->second.front().species.key != spec.acid
             || it->second.front().nu != 1.0)
                throw std::runtime_error("aqueousSplit: component '" + nm
                    + "' must map one-to-one to the declared acid '" + spec.acid
                    + "' (`aqueousMapping ( { species " + spec.acid
                    + "; nu 1; } );`).");
        }
    }
    if (!sawComponent)
        throw std::runtime_error("aqueousSplit: the component '" + spec.component
            + "' is absent from the bulk the split is asked for.");

    const electrolyte::SpeciationResult res = thermo.speciateAqueous(in, verbosity);
    SplitState st;
    st.I = res.I;
    st.beyondDomain = res.activityBeyondDomain;
    st.domainNote   = res.activityDomainNote;
    st.pHScale      = res.pHScale;
    bool gotA = false, gotB = false;
    for (const auto& row : res.rows)
    {
        if (row.name == spec.acid)
        { st.m_acid = row.molality; st.gamma_acid = row.gamma; gotA = true; }
        else if (row.name == spec.base)
        { st.m_base = row.molality; st.gamma_base = row.gamma; gotB = true; }
    }
    if (!gotA || !gotB)
        throw std::runtime_error("aqueousSplit: the speciation returned no row for "
            + std::string(!gotA ? spec.acid : spec.base) + " -- the record"
            " chemistry/" + spec.base + "-formation.dat (acid " + spec.acid
            + " + water = base + H) is not in the case's network.");
    const scalar tot = st.m_acid + st.m_base;
    if (!(tot > 0.0))
        throw std::runtime_error("aqueousSplit: neither form is present in the"
            " speciated bulk.");
    st.alpha = st.m_base / tot;
    st.pKa_apparent = pH + std::log10(st.m_acid / st.m_base);

    bool found = false;
    for (const auto& r : thermo.speciator().reactions())
        if (r.species == spec.base)
        {
            st.logK_T = electrolyte::SpeciationSolver::logK_T(
                r.logK25, r.hasDH, r.dH, r.kt, T);
            found = true;
            break;
        }
    if (!found)
        throw std::runtime_error("aqueousSplit: no formation record for '"
            + spec.base + "' in the speciation network.");
    st.pKa_thermo = -st.logK_T;
    return st;
}

// ---------------------------------------------------------------------------
scalar effectiveRejection(scalar alpha, scalar R_acid, scalar R_base)
{
    return 1.0 - ((1.0 - alpha) * (1.0 - R_acid) + alpha * (1.0 - R_base));
}

SplitPassage splitPassage(scalar alpha, scalar R_acid, scalar R_base)
{
    const scalar wa = (1.0 - alpha) * (1.0 - R_acid);
    const scalar wb = alpha * (1.0 - R_base);
    SplitPassage p;
    const scalar tot = wa + wb;
    if (tot > 0.0) { p.permeateAcidShare = wa / tot; p.permeateBaseShare = wb / tot; }
    return p;
}

} // namespace membrane
} // namespace Choupo
