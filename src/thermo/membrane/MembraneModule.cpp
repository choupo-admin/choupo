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

#include "MembraneModule.H"

#include "core/Origin.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"

#include <set>
#include <stdexcept>
#include <variant>

namespace Choupo {

const std::vector<std::string>& MembraneModule::acceptedFormats()
{
    static const std::vector<std::string> f = { "spiralWound", "flatSheetCell" };
    return f;
}

void MembraneModule::readFromDict(const DictPtr& d, const std::string& sourcePath)
{
    sourcePath_   = sourcePath;
    name_         = d->lookupWordOrDefault("name", "");
    manufacturer_ = d->lookupWordOrDefault("manufacturer", "");
    if (name_.empty())
        throw std::runtime_error("MembraneModule: " + sourcePath
            + " has no `name` entry");
    const std::string locus = "MembraneModule '" + name_ + "' (" + sourcePath + ")";

    // ---- format: a DECLARED WORD the engine dispatches on refuses a word it
    //      does not know (2026-09-07) -- through the one refusal sentence.
    format_ = d->lookupWordOrDefault("format", "");
    bool known = false;
    for (const auto& f : acceptedFormats()) if (f == format_) known = true;
    if (!known)
        throw std::runtime_error(locus + ": "
            + registryRefusal::message("module format", format_,
                                       acceptedFormats(), "Accepted"));

    // ---- the membrane: a spiral is WOUND with one; a cell takes any coupon,
    //      so the case declares it beside the module and the record may not.
    membrane_ = d->lookupWordOrDefault("membrane", "");
    if (!isFlatSheetCell() && membrane_.empty())
        throw std::runtime_error(locus + ": a `format spiralWound;` element is"
            " wound with ONE membrane -- declare `membrane <name>;` (a record"
            " in assets/ of kind RO | NF).");
    if (isFlatSheetCell() && !membrane_.empty())
        throw std::runtime_error(locus + ": a `format flatSheetCell;` takes"
            " any coupon, so the membrane is the CASE's to declare (`membrane"
            " <name>;` beside `module " + name_ + ";` in the operation) --"
            " remove `membrane` from the record.");

    // ---- channel geometry (SI, dimension-checked) --------------------------
    activeArea_     = d->lookupScalar("activeArea",     Dims::area);
    channelHeight_  = d->lookupScalar("channelHeight",  Dims::length);
    spacerPorosity_ = d->lookupScalar("spacerPorosity");
    if (activeArea_ <= 0.0 || channelHeight_ <= 0.0)
        throw std::runtime_error(locus + ": activeArea and channelHeight must be > 0");
    if (spacerPorosity_ <= 0.0 || spacerPorosity_ > 1.0)
        throw std::runtime_error(locus + ": spacerPorosity must lie in (0, 1]");
    if (isFlatSheetCell())
    {
        if (d->found("leafLength"))
            throw std::runtime_error(locus + ": `leafLength` is a spiral"
                " element's key.  A flat cell's channel length is"
                " activeArea / slotWidth, derived where it is used -- the tree"
                " never stores a derivative.  Declare `slotWidth` and"
                " `slotDepth` instead.");
        slotWidth_    = d->lookupScalar("slotWidth", Dims::length);
        slotDepth_    = d->lookupScalar("slotDepth", Dims::length);
        holdUpVolume_ = d->lookupScalarOrDefault("holdUpVolume", 0.0, Dims::volume);
        if (slotWidth_ <= 0.0 || slotDepth_ <= 0.0)
            throw std::runtime_error(locus + ": slotWidth and slotDepth must be > 0");
        if (channelHeight_ > slotDepth_)
            throw std::runtime_error(locus + ": channelHeight exceeds the slot"
                " depth -- the installed spacer (+ shims) must fit the slot.");
        if (d->found("availableSpacers"))
        {
            // A list carries no unit; the record states the unit in the key
            // comment and the values are read as metres (SI, like a raw scalar).
            spacers_ = d->lookupList("availableSpacers");
        }
    }
    else
    {
        for (const char* k : { "slotWidth", "slotDepth", "holdUpVolume", "availableSpacers" })
            if (d->found(k))
                throw std::runtime_error(locus + ": `" + std::string(k)
                    + "` is a flat cell's key; a spiral element declares"
                      " `leafLength`.");
        leafLength_ = d->lookupScalar("leafLength", Dims::length);
        if (leafLength_ <= 0.0)
            throw std::runtime_error(locus + ": leafLength must be > 0");
    }

    // ---- limits {} : each ABSENT unless declared -------------------------
    if (d->found("limits"))
    {
        auto l = d->subDict("limits");
        if (l->found("P_max"))        { limits_.hasP_max = true;        limits_.P_max        = l->lookupScalar("P_max", Dims::pressure); }
        if (l->found("T_max"))        { limits_.hasT_max = true;        limits_.T_max        = l->lookupScalar("T_max", Dims::temperature); }
        if (l->found("dP_max"))       { limits_.hasDP_max = true;       limits_.dP_max       = l->lookupScalar("dP_max", Dims::pressure); }
        if (l->found("feedFlow_max")) { limits_.hasFeedFlow_max = true; limits_.feedFlow_max = l->lookupScalar("feedFlow_max", Dims::volumetricFlow); }
        if (l->found("pH_min") != l->found("pH_max"))
            throw std::runtime_error(locus + ": limits{} declares one of"
                " pH_min / pH_max without the other -- a band has two ends.");
        if (l->found("pH_min"))
        {
            limits_.hasPH  = true;
            limits_.pH_min = l->lookupScalar("pH_min");
            limits_.pH_max = l->lookupScalar("pH_max");
        }
    }

    // ---- ratedTest {} : the data sheet's standard test, all or nothing ----
    if (d->found("ratedTest"))
    {
        auto r = d->subDict("ratedTest");
        rated_.declared         = true;
        rated_.solute           = r->lookupWord("solute");
        rated_.feedMassFraction = r->lookupScalar("feedMassFraction");
        rated_.P                = r->lookupScalar("P", Dims::pressure);
        rated_.T                = r->lookupScalar("T", Dims::temperature);
        rated_.recovery         = r->lookupScalar("recovery");
        rated_.permeateFlow     = r->lookupScalar("permeateFlow", Dims::volumetricFlow);
        rated_.rejection        = r->lookupScalar("rejection");
        if (rated_.feedMassFraction <= 0.0 || rated_.feedMassFraction >= 1.0
         || rated_.recovery <= 0.0 || rated_.recovery >= 1.0
         || rated_.rejection <= 0.0 || rated_.rejection > 1.0)
            throw std::runtime_error(locus + ": ratedTest{} feedMassFraction,"
                " recovery and rejection are FRACTIONS (2000 ppm -> 2.0e-3,"
                " 15 % -> 0.15, 97 % -> 0.97).");
    }

    // ---- provenance {} : the citation, and the per-value ESTIMATES --------
    //  Every sub-dict names a declared field.  An `origin estimate` block
    //  must carry a reviewStatus and a non-empty notes -- Vitor's ruling is
    //  "a value with a note saying it must be verified", and a marked value
    //  without the note is the silence the ruling forbids.
    if (!d->found("provenance"))
        throw std::runtime_error(locus + ": no `provenance {}` block -- a"
            " module record cites the data sheet it was transcribed from"
            " (`source \"...\";`) and marks each value the sheet does not"
            " state with `{ origin estimate; reviewStatus unverified;"
            " notes \"how to verify it\"; }`.");
    auto p = d->subDict("provenance");
    source_ = p->lookupWordOrDefault("source", "");
    if (source_.empty())
        throw std::runtime_error(locus + ": provenance{} names no `source`"
            " -- the data sheet (form number, revision, date).");
    for (const auto& k : p->keys())
    {
        const auto& ev = p->entryValue(k);
        if (!std::holds_alternative<DictPtr>(ev)) continue;   // source, licence
        if (!d->found(k))
            throw std::runtime_error(locus + ": provenance{} carries a block"
                " for `" + k + "`, which the record does not declare.");
        auto sub = std::get<DictPtr>(ev);
        const std::string word = sub->lookupWordOrDefault("origin", "unattributed");
        if (originFromWord(word) != Origin::estimated) continue;
        ModuleEstimate e;
        e.key          = k;
        e.value        = d->lookupScalar(k);
        e.reviewStatus = sub->lookupWordOrDefault("reviewStatus", "");
        e.notes        = sub->lookupWordOrDefault("notes", "");
        if (e.reviewStatus.empty() || e.notes.empty())
            throw std::runtime_error(locus + ": `" + k + "` is declared an"
                " ESTIMATE without " + (e.reviewStatus.empty() ? "a reviewStatus" : "notes")
                + " -- an educated value must say that it is one AND how it is"
                  " to be verified (`reviewStatus unverified; notes \"...\";`).");
        estimates_.push_back(std::move(e));
    }
}

} // namespace Choupo
