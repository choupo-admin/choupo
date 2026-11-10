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

#include "ReactionHeat.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <exception>
#include <iostream>

namespace Choupo {

scalar reactionHeat(const ThermoPackage&            thermo,
                    const std::vector<std::size_t>& comps,
                    const std::vector<scalar>&      nu,
                    scalar                          T,
                    const std::string&              phase,
                    std::optional<scalar>           dictOverride,
                    const std::string&              context,
                    int                             verbosity,
                    std::string&                    sourceOut)
{
    const std::size_t m = comps.size();

    // Does EVERY reacting species (ν ≠ 0) carry the elements/formation datum?
    bool        allFormation = (m > 0);
    std::string missing;
    for (std::size_t s = 0; s < m; ++s)
    {
        if (nu[s] == 0.0) continue;
        if (!thermo.comp(comps[s]).hasGibbsData())
        {
            allFormation = false;
            if (!missing.empty()) missing += ", ";
            missing += thermo.comp(comps[s]).name();
        }
    }

    // -- (a) Formation datum is complete: it is authoritative. --------------
    if (allFormation)
    {
        scalar dH = 0.0;
        bool   ok = true;
        try
        {
            for (std::size_t s = 0; s < m; ++s)
            {
                if (nu[s] == 0.0) continue;
                // THE canonical per-species leg (forum #103/#105): the SAME
                // rung every balance and ledger duty reads, so the announced
                // dH_rxn and the ledger's E/dXi can never diverge again (the
                // 0.9% Watson-vs-Kirchhoff gap of the old h_formation path).
                // This is DeltaH_rxn on the STANDARD phase legs (#103's
                // distinction 1); a segment's real duty is the ledger's
                // extensive state difference (distinction 2), which adds
                // mixing enthalpy only when a calorimetric H^E is active.
                dH += nu[s] * thermo.speciesPhaseEnthalpy(
                    comps[s], T, 1.0e5, phase,
                    ThermoPackage::ReferenceContext::StandardPhase);
            }
        }
        catch (const std::exception& e)
        {
            // standardThermochemistry present but a Cp / Hvap leg is missing for this
            // phase -- announce and fall through to the explicit override.
            ok = false;
            std::cout << "  [reaction heat] " << context
                      << ": formation datum present but incomplete for the "
                      << phase << " phase (" << e.what()
                      << ") -- using the dict override if any.\n";
        }

        if (ok)
        {
            sourceOut = "formation";
            if (verbosity >= 2)
                std::cout << "  [reaction heat] " << context
                          << ": from FORMATION datum (Σ νᵢ·hᵢ(T)) = "
                          << (dH / 1000.0) << " kJ/mol  (T = " << T << " K, "
                          << phase << " basis)\n";

            // Cross-check (never silently override) an explicit dict value.
            if (dictOverride.has_value())
            {
                const scalar d   = *dictOverride;
                const scalar tol = std::max<scalar>(1.0e3, 0.02 * std::abs(dH));
                if (std::abs(d - dH) > tol)
                    std::cout << "  [reaction heat] WARNING " << context
                              << ": dict dH_rxn = " << (d / 1000.0)
                              << " kJ/mol disagrees with the formation datum "
                              << (dH / 1000.0) << " kJ/mol by "
                              << ((d - dH) / 1000.0)
                              << " kJ/mol -- the curated formation value is"
                              << " authoritative (the dict value is IGNORED).\n";
            }
            return dH;
        }
        // else: fall through to the override branch.
    }

    // -- (b) Explicit dict override (announced). ----------------------------
    if (dictOverride.has_value())
    {
        sourceOut = "dict-override";
        std::cout << "  [reaction heat] " << context
                  << ": from dict OVERRIDE dH_rxn = " << (*dictOverride / 1000.0)
                  << " kJ/mol  (no formation datum";
        if (!missing.empty()) std::cout << " for " << missing;
        std::cout << ")\n";
        return *dictOverride;
    }

    // -- (c) Neither: warn aloud, stay thermally neutral (no silent crutch). -
    sourceOut = "none";
    std::cout << "  [reaction heat] WARNING " << context
              << ": no formation datum";
    if (!missing.empty()) std::cout << " (missing for " << missing << ")";
    std::cout << " and no explicit dH_rxn -- the reaction is treated as"
                 " thermally NEUTRAL (heat of reaction = 0). Add standardThermochemistry"
                 " to the species or a dH_rxn override to give it a heat.\n";
    return 0.0;
}

std::optional<DeclaredHeat> parseDeclaredHeat(const Dictionary& rxn,
                                              const std::string& context)
{
    const bool hasBare  = rxn.found("dH_rxn");
    const bool hasBlock = rxn.found("heatOfReaction");
    if (hasBare && hasBlock)
        throw std::runtime_error(context + ": the reaction declares BOTH `dH_rxn`"
            " and `heatOfReaction {}` -- two homes for one number.  Keep the"
            " `heatOfReaction` block (value, T, phase, method, source, reason)"
            " and remove `dH_rxn`.");
    DeclaredHeat d;
    if (hasBare)
    {
        d.bare = true;
        d.value_J_per_mol = rxn.lookupScalar("dH_rxn");
        return d;
    }
    if (!hasBlock) return std::nullopt;

    const auto b = rxn.subDict("heatOfReaction");
    for (const char* k : {"value", "T", "phase", "method", "source", "reason"})
        if (!b->found(k))
            throw std::runtime_error(context + ": heatOfReaction is missing the"
                " required field `" + std::string(k) + "`.  All six of value, T,"
                " phase, method, source and reason are required: a declared heat"
                " that changes a duty must say what was measured, where, how and"
                " why it is declared.");
    d.value_J_per_mol = b->lookupScalar("value", Dims::molarEnergy);
    d.T_K             = b->lookupScalar("T", Dims::temperature);
    if (!(d.T_K > 0.0))
        throw std::runtime_error(context + ": heatOfReaction.T must be a"
            " positive absolute temperature (got " + std::to_string(d.T_K) + " K).");
    d.phase  = b->lookupWord("phase");
    if (d.phase != "liquid" && d.phase != "gas")
        throw std::runtime_error(context + ": heatOfReaction.phase '" + d.phase
            + "' is not accepted.  Accepted: liquid, gas (the two rungs the"
            " formation route is priced on).");
    d.method = b->lookupWord("method");
    if (d.method != "calorimetry" && d.method != "vantHoff")
        throw std::runtime_error(context + ": heatOfReaction.method '" + d.method
            + "' is not accepted.  Accepted: calorimetry, vantHoff.");
    d.source = b->lookupWord("source");
    d.reason = b->lookupWord("reason");
    if (d.source.empty())
        throw std::runtime_error(context + ": heatOfReaction.source is empty --"
            " cite the measurement.");
    if (d.reason.empty())
        throw std::runtime_error(context + ": heatOfReaction.reason is empty --"
            " say why the formation route is not trusted for this reaction.");
    return d;
}

HeatCorrection resolveDeclaredHeat(const ThermoPackage&            thermo,
                                   const std::vector<std::size_t>& comps,
                                   const std::vector<scalar>&      nu,
                                   const std::optional<DeclaredHeat>& decl,
                                   const std::string&              context,
                                   int                             verbosity)
{
    HeatCorrection hc;
    if (!decl) return hc;
    hc.decl     = *decl;
    hc.declared = decl->value_J_per_mol;
    // The bare key: unchanged behaviour, no evaluation, no output.
    if (decl->bare) { hc.overrideForResolver = decl->value_J_per_mol; return hc; }

    bool allFormation = !comps.empty();
    for (std::size_t s = 0; s < comps.size(); ++s)
        if (nu[s] != 0.0 && !thermo.comp(comps[s]).hasGibbsData())
            allFormation = false;
    if (!allFormation)
    {
        // Nothing to compare with: the declared value IS the heat.
        hc.overrideForResolver = decl->value_J_per_mol;
        std::cout << "  [reaction heat] " << context << ": heatOfReaction ("
                  << decl->method << ", " << decl->source << ") used as the heat"
                  << " (no formation datum), " << (decl->value_J_per_mol / 1000.0)
                  << " kJ/mol at T = " << decl->T_K << " K, " << decl->phase << "\n";
        return hc;
    }
    std::string src;
    const scalar f = reactionHeat(thermo, comps, nu, decl->T_K, decl->phase,
                                  decl->value_J_per_mol, context, verbosity, src);
    if (src != "formation")
    {
        hc.overrideForResolver = decl->value_J_per_mol;
        return hc;
    }
    hc.active    = true;
    hc.formation = f;
    hc.delta     = decl->value_J_per_mol - f;
    std::cout << "  [reaction heat] " << context << ": declared heat of reaction "
              << (decl->value_J_per_mol / 1000.0) << " kJ/mol (" << decl->method
              << ", " << decl->source << ") against " << (f / 1000.0)
              << " kJ/mol on the formation route at T = " << decl->T_K << " K, "
              << decl->phase << " basis: delta = " << (hc.delta / 1000.0)
              << " kJ/mol of extent (computed; not yet applied by this reactor)\n";
    return hc;
}

void refuseDeclaredHeat(const Dictionary& rxn, const std::string& unitType,
                        const std::string& physicalReason)
{
    if (!rxn.found("heatOfReaction")) return;
    throw std::runtime_error(unitType + ": a reaction declares `heatOfReaction {}`"
        " and this unit REFUSES it.  " + physicalReason);
}

void announceDeclaredHeatDivergence(const Dictionary& rxn, const std::string& context)
{
    if (!rxn.found("heatOfReaction")) return;
    std::cout << "  [problem divergence] " << context << ": the reaction declares a"
        " measured `heatOfReaction {}`, but the column's stage balances price the"
        " streams on the formation datum and do NOT apply it; the reboiler and"
        " condenser duties here come from the formation route.\n";
    ProblemDivergence::instance().add("substitution", context,
        "a measured heat of reaction (heatOfReaction {}) on the reaction",
        "the column's stage balances on the formation datum; the declared heat"
        " is not applied",
        "");
}

} // namespace Choupo
