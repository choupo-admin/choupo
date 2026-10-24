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

#include <cmath>
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

    // ---- the membrane: a commercial spiral is WOUND with one and its record
    //      names it; a GENERIC spiral (a standard size, C146) and a flat cell
    //      take whichever membrane the case declares beside the module, so
    //      their records name none.  A cell may not name one.
    membrane_ = d->lookupWordOrDefault("membrane", "");
    if (isFlatSheetCell() && !membrane_.empty())
        throw std::runtime_error(locus + ": a `format flatSheetCell;` takes"
            " any coupon, so the membrane is the CASE's to declare (`membrane"
            " <name>;` beside `module " + name_ + ";` in the operation) --"
            " remove `membrane` from the record.");

    // ---- channel geometry (SI, dimension-checked) --------------------------
    activeArea_     = d->lookupScalar("activeArea",     Dims::area);
    if (activeArea_ <= 0.0)
        throw std::runtime_error(locus + ": activeArea must be > 0");

    //  THE CHANNEL HAS ONE HOME (C146, 2026-10-24): EITHER the feed spacer
    //  the element is wound with, named as a record (`feedSpacer <name>;`,
    //  kind feedSpacer -- its thickness IS the channel height, its porosity
    //  and its Eq. 17 hydraulic diameter come with it), OR the legacy inline
    //  pair `channelHeight` + `spacerPorosity` for a sheet that names no
    //  spacer.  Both at once REFUSES; a flat cell keeps the inline pair (the
    //  user installs whatever spacer the slot takes).
    feedSpacer_ = d->lookupWordOrDefault("feedSpacer", "");
    if (!feedSpacer_.empty())
    {
        if (isFlatSheetCell())
            throw std::runtime_error(locus + ": `feedSpacer` is a spiral"
                " element's key -- a flat cell's channel is the spacer the"
                " user installs, declared as `channelHeight` + `spacerPorosity`.");
        std::vector<std::string> clash;
        for (const char* k : { "channelHeight", "spacerPorosity" })
            if (d->found(k)) clash.push_back(k);
        if (!clash.empty())
            throw std::runtime_error(locus + ": `feedSpacer " + feedSpacer_
                + ";` supplies the channel (the spacer thickness IS the channel"
                  " height, its porosity comes with it), and the record ALSO"
                  " declares `" + clash.front() + "` -- one home.  Remove the"
                  " inline value(s) or the spacer reference.");
    }
    else
    {
        channelHeight_  = d->lookupScalar("channelHeight",  Dims::length);
        spacerPorosity_ = d->lookupScalar("spacerPorosity");
        if (channelHeight_ <= 0.0)
            throw std::runtime_error(locus + ": channelHeight must be > 0");
        if (spacerPorosity_ <= 0.0 || spacerPorosity_ > 1.0)
            throw std::runtime_error(locus + ": spacerPorosity must lie in (0, 1]");
    }
    if (isFlatSheetCell())
    {
        if (d->found("leafLength"))
            throw std::runtime_error(locus + ": `leafLength` is a spiral"
                " element's key.  A flat cell's channel length is"
                " activeArea / slotWidth, derived where it is used -- the tree"
                " never stores a derivative.  Declare `slotWidth` and"
                " `slotDepth` instead.");
        for (const char* k : { "leaves", "leafWidth", "nominalDiameter", "elementLength" })
            if (d->found(k))
                throw std::runtime_error(locus + ": `" + std::string(k)
                    + "` is a spiral element's key; a flat cell is one coupon"
                      " in a slot.");
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

        //  THE LEAVES (C146).  An element is `leaves` envelopes, each with two
        //  membrane faces, so A = 2 n L W: of the four, the record stores the
        //  area (the data sheet's), the leaf length and the leaf count, and
        //  the leaf width is DERIVED, W = A/(2 n L) -- storing it as well
        //  would be a second home for one quantity.
        if (d->found("leafWidth"))
            throw std::runtime_error(locus + ": `leafWidth` is DERIVED, W ="
                " activeArea / (2 leaves leafLength) -- the tree never stores a"
                " derivative.  Declare `leaves <n>;` and remove `leafWidth`.");
        if (d->found("leaves"))
        {
            const scalar n = d->lookupScalar("leaves");
            if (!(n >= 1.0) || std::abs(n - std::round(n)) > 1.0e-12)
                throw std::runtime_error(locus + ": `leaves` is a whole number"
                    " of envelopes >= 1 -- got " + std::to_string(n));
            leaves_ = static_cast<int>(std::round(n));
        }
        if (d->found("nominalDiameter"))
            nominalDiameter_ = d->lookupScalar("nominalDiameter", Dims::length);
        if (d->found("elementLength"))
        {
            elementLength_ = d->lookupScalar("elementLength", Dims::length);
            if (leafLength_ > elementLength_)
                throw std::runtime_error(locus + ": leafLength exceeds the"
                    " elementLength -- the leaf is wound inside the element.");
        }
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
    //  Every sub-dict names a declared field.  An `origin estimated` block
    //  must carry a reviewStatus and a non-empty notes -- Vitor's ruling is
    //  "a value with a note saying it must be verified", and a marked value
    //  without the note is the silence the ruling forbids.
    if (!d->found("provenance"))
        throw std::runtime_error(locus + ": no `provenance {}` block -- a"
            " module record cites the data sheet it was transcribed from"
            " (`source \"...\";`) and marks each value the sheet does not"
            " state with `{ origin estimated; reviewStatus unverified;"
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
