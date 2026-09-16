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
    Choupo::EDStack

Description
    Implementation of the `kind edStack` record reader.  See EDStack.H.
\*---------------------------------------------------------------------------*/

#include "EDStack.H"

#include "core/Origin.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"

#include <stdexcept>
#include <variant>

namespace Choupo {

const std::vector<std::string>& EDStack::acceptedSpacerTypes()
{
    //  A DECLARED WORD the engine dispatches on refuses a word it does not
    //  know (2026-09-07).  Nothing selects on this one TODAY -- and the
    //  consumer says so on every run -- but the spacer is the fact a
    //  Sherwood correlation is fitted to, so it is declared rather than
    //  inferred from a coefficient.
    static const std::vector<std::string> w =
        { "mesh", "zigZag", "tortuousPath", "none" };
    return w;
}

const std::vector<std::string>& EDStack::acceptedSherwoodModels()
{
    static const std::vector<std::string> w = { "powerLaw", "leveque" };
    return w;
}

const std::vector<std::string>& EDStack::acceptedVelocityBases()
{
    static const std::vector<std::string> w = { "superficial", "interstitial" };
    return w;
}

namespace {

void requireKnown(const std::string& locus, const std::string& what,
                  const std::string& asked, const std::vector<std::string>& ok)
{
    for (const auto& w : ok) if (w == asked) return;
    throw std::runtime_error(locus + ": "
        + registryRefusal::message(what, asked, ok, "Accepted"));
}

} // anonymous namespace

void EDStack::readFromDict(const DictPtr& d, const std::string& sourcePath)
{
    sourcePath_   = sourcePath;
    name_         = d->lookupWordOrDefault("name", "");
    manufacturer_ = d->lookupWordOrDefault("manufacturer", "");
    if (name_.empty())
        throw std::runtime_error("EDStack: " + sourcePath + " has no `name` entry");
    const std::string locus = "EDStack '" + name_ + "' (" + sourcePath + ")";

    // ---- the IEM pair the stack is built with ------------------------------
    //  OPTIONAL, and the absence is a fact rather than a gap: a stack FRAME
    //  takes any ion-exchange membrane pair, exactly as the SEPA CF flat cell
    //  takes any coupon (2026-09-15).  A record whose source names the pair
    //  declares it here and the case may not; a record whose source does not
    //  leaves it out and the CASE declares `membrane <name>;` beside `stack`.
    //  Guessing a pair on the owner's behalf is the one thing neither side
    //  may do.
    membranes_ = d->lookupWordOrDefault("membranes", "");

    // ---- how many cell pairs, and how much area ----------------------------
    cellPairs_ = static_cast<int>(d->lookupScalar("cellPairs"));
    if (cellPairs_ <= 0)
        throw std::runtime_error(locus + ": cellPairs must be > 0");
    //  VITOR'S RULING (2026-09-16): the active area is the CELL-PAIR area --
    //  a stack of 50 m2 has 50 m2 of anionic membrane AND 50 m2 of cationic
    //  membrane.  Everything else is derived (see the header); a record that
    //  ALSO stores a derivative is refused, because two homes for one fact is
    //  the arity sin and this one costs a factor of two in current density.
    activeArea_ = d->lookupScalar("activeArea", Dims::area);
    if (activeArea_ <= 0.0)
        throw std::runtime_error(locus + ": activeArea must be > 0");
    for (const char* k : { "areaPerCellPair", "areaPerMembrane", "totalMembraneArea",
                           "membraneArea", "linearVelocity" })
        if (d->found(k))
            throw std::runtime_error(locus + ": `" + std::string(k) + "` is"
                " DERIVED from `activeArea` (the cell-pair area of the whole"
                " stack) and `cellPairs`, or from the diluate flow -- the tree"
                " never stores a derivative.  Remove it.");

    // ---- the channel -------------------------------------------------------
    channelHeight_  = d->lookupScalar("channelHeight", Dims::length);
    channelWidth_   = d->lookupScalar("channelWidth",  Dims::length);
    spacerPorosity_ = d->lookupScalar("spacerPorosity");
    //  THE LENGTH IS DECLARED OR DERIVED, never both stored and derived.
    //  A source that states it (the paper states 0.175 m beside its 0.114 m
    //  width AND its 0.020 m2 effective area -- three facts, not two) declares
    //  it and the consumer cross-checks; a source that does not leaves it out
    //  and it is activeArea / (cellPairs * channelWidth), resolved here.
    lengthDeclared_ = d->found("channelLength");
    channelLength_  = lengthDeclared_
        ? d->lookupScalar("channelLength", Dims::length)
        : activeArea_ / (static_cast<scalar>(cellPairs_) * channelWidth_);
    if (channelHeight_ <= 0.0 || channelWidth_ <= 0.0 || channelLength_ <= 0.0)
        throw std::runtime_error(locus + ": channelHeight, channelWidth and"
            " channelLength must all be > 0");
    if (spacerPorosity_ <= 0.0 || spacerPorosity_ > 1.0)
        throw std::runtime_error(locus + ": spacerPorosity must lie in (0, 1]");
    spacerType_ = d->lookupWordOrDefault("spacerType", "");
    requireKnown(locus, "spacer type", spacerType_, acceptedSpacerTypes());

    //  VITOR'S RULING (2026-09-16): the pass belongs to the EQUIPMENT.
    passes_ = static_cast<int>(d->lookupScalar("hydraulicPasses"));
    if (passes_ <= 0)
        throw std::runtime_error(locus + ": hydraulicPasses must be > 0");
    if (cellPairs_ % passes_ != 0)
        throw std::runtime_error(locus + ": " + std::to_string(cellPairs_)
            + " cell pairs do not divide into " + std::to_string(passes_)
            + " hydraulic passes -- a pass carries a whole number of channels"
              " side by side.");

    // ---- the Sherwood correlation fitted to THIS stack ---------------------
    if (!d->found("massTransfer"))
        throw std::runtime_error(locus + ": no `massTransfer {}` block -- the"
            " Sherwood correlation is EQUIPMENT-AND-SPACER data (a fit to this"
            " stack with this spacer), never a universal law, so the record"
            " carries it: `massTransfer { model powerLaw; a; b; c;"
            " velocityBasis superficial; }`.");
    {
        auto mt = d->subDict("massTransfer");
        sh_.model = mt->lookupWordOrDefault("model", "");
        requireKnown(locus + " massTransfer", "Sherwood correlation",
                     sh_.model, acceptedSherwoodModels());
        sh_.velocityBasis = mt->lookupWordOrDefault("velocityBasis", "");
        requireKnown(locus + " massTransfer", "velocity basis",
                     sh_.velocityBasis, acceptedVelocityBases());
        if (sh_.model == "powerLaw")
        {
            sh_.a = mt->lookupScalar("a");
            sh_.b = mt->lookupScalar("b");
            sh_.c = mt->lookupScalar("c");
        }
        else   // leveque: Sh = a (Re Sc d_h/L)^(1/3); only the prefactor is data
        {
            sh_.a = mt->lookupScalarOrDefault("a", 1.85);
            for (const char* k : { "b", "c" })
                if (mt->found(k))
                    throw std::runtime_error(locus + " massTransfer: `"
                        + std::string(k) + "` belongs to `model powerLaw;`;"
                        " `leveque` has the fixed exponent 1/3 and reads only"
                        " the prefactor `a`.");
        }
        if (sh_.a <= 0.0)
            throw std::runtime_error(locus + " massTransfer: the prefactor `a`"
                " must be > 0");
        //  The Reynolds band the fit was taken over -- a validity window, and
        //  this tree announces an extrapolation rather than refusing it.
        if (mt->found("validity"))
        {
            auto v = mt->subDict("validity");
            if (v->found("Re"))
            {
                auto band = v->lookupList("Re");
                if (band.size() != 2 || band[0] >= band[1] || band[0] <= 0.0)
                    throw std::runtime_error(locus + " massTransfer: `validity"
                        " { Re ( lo hi ); }` needs two positive numbers with"
                        " lo < hi -- an impossible interval has nothing to"
                        " extrapolate from.");
                sh_.hasReBand = true;
                sh_.Re_lo = band[0];
                sh_.Re_hi = band[1];
            }
        }
    }

    // ---- limits {} : each ABSENT unless declared ---------------------------
    if (d->found("limits"))
    {
        auto l = d->subDict("limits");
        if (l->found("i_max"))    { limits_.hasI_max = true;    limits_.i_max    = l->lookupScalar("i_max"); }
        if (l->found("T_max"))    { limits_.hasT_max = true;    limits_.T_max    = l->lookupScalar("T_max", Dims::temperature); }
        if (l->found("dP_max"))   { limits_.hasDP_max = true;   limits_.dP_max   = l->lookupScalar("dP_max", Dims::pressure); }
        if (l->found("flow_max")) { limits_.hasFlow_max = true; limits_.flow_max = l->lookupScalar("flow_max", Dims::volumetricFlow); }
        if (l->found("pH_min") != l->found("pH_max"))
            throw std::runtime_error(locus + ": limits{} declares one of pH_min"
                " / pH_max without the other -- a band has two ends.");
        if (l->found("pH_min"))
        {
            limits_.hasPH  = true;
            limits_.pH_min = l->lookupScalar("pH_min");
            limits_.pH_max = l->lookupScalar("pH_max");
        }
    }

    // ---- provenance {} : the citation, and the per-value ESTIMATES ---------
    //  Same contract as `kind membraneModule` (2026-09-15), with ONE extra
    //  reach: a provenance block whose key names a DECLARED SUB-DICT of the
    //  record (limits, massTransfer) describes the values INSIDE it, because
    //  that is where two of this stack's estimates live.  The announced key
    //  is then dotted, so a reader sees the value spelled as the record
    //  spells it.
    if (!d->found("provenance"))
        throw std::runtime_error(locus + ": no `provenance {}` block -- a stack"
            " record cites the document it was transcribed from (`source"
            " \"...\";`) and marks each value the document does not state with"
            " `{ origin estimate; reviewStatus unverified; notes \"how to"
            " verify it\"; }`.");
    auto p = d->subDict("provenance");
    source_ = p->lookupWordOrDefault("source", "");
    if (source_.empty())
        throw std::runtime_error(locus + ": provenance{} names no `source` --"
            " the document (authors, journal, volume, pages, doi) or the data"
            " sheet (form number, revision, date).");

    auto takeEstimate = [&](const DictPtr& owner, const DictPtr& sub,
                            const std::string& key, const std::string& dotted)
    {
        const std::string word = sub->lookupWordOrDefault("origin", "unattributed");
        if (originFromWord(word) != Origin::estimated) return;
        EDStackEstimate e;
        e.key          = dotted;
        e.value        = owner->lookupScalar(key);
        e.reviewStatus = sub->lookupWordOrDefault("reviewStatus", "");
        e.notes        = sub->lookupWordOrDefault("notes", "");
        if (e.reviewStatus.empty() || e.notes.empty())
            throw std::runtime_error(locus + ": `" + dotted + "` is declared an"
                " ESTIMATE without " + (e.reviewStatus.empty() ? "a reviewStatus" : "notes")
                + " -- an educated value must say that it is one AND how it is"
                  " to be verified (`reviewStatus unverified; notes \"...\";`).");
        estimates_.push_back(std::move(e));
    };

    for (const auto& k : p->keys())
    {
        const auto& ev = p->entryValue(k);
        if (!std::holds_alternative<DictPtr>(ev)) continue;   // source, licence
        if (!d->found(k))
            throw std::runtime_error(locus + ": provenance{} carries a block for"
                " `" + k + "`, which the record does not declare.");
        auto sub = std::get<DictPtr>(ev);
        const auto& recEv = d->entryValue(k);
        if (std::holds_alternative<DictPtr>(recEv))
        {
            //  `k` names a sub-dict of the record: this block describes the
            //  values inside it, one level down.
            auto owner = std::get<DictPtr>(recEv);
            for (const auto& kk : sub->keys())
            {
                const auto& sev = sub->entryValue(kk);
                if (!std::holds_alternative<DictPtr>(sev))
                    throw std::runtime_error(locus + ": provenance." + k + "."
                        + kk + " is not a block -- a provenance block for a"
                        " sub-dict describes the values inside it, one per"
                        " block.");
                if (!owner->found(kk))
                    throw std::runtime_error(locus + ": provenance{} carries a"
                        " block for `" + k + "." + kk + "`, which the record"
                        " does not declare.");
                takeEstimate(owner, std::get<DictPtr>(sev), kk, k + "." + kk);
            }
            continue;
        }
        takeEstimate(d, sub, k, k);
    }
}

} // namespace Choupo
