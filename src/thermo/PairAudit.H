/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.

    fillPairAudit -- THE parser of a binary-pair file's provenance{} block into
    the typed audit fields of PairResolution (forum #75-5): origin (typed,
    consistency-checked against the raw source word), method/methodVersion,
    the canonical `validity { temperature { min/max } }` grammar (legacy
    numeric validityRange{Tmin/Tmax} read during migration; half-declared
    blocks refuse), and promotedDespite (all four fields REQUIRED -- an
    override without justification, authorship and date is not auditable).
    ONE implementation, consumed by every family loader (NRTL, Wilson, ...);
    a copied parser is how grammars diverge.  */

#pragma once

#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "core/Origin.H"
#include "core/ThermoResolution.H"

#include <optional>
#include <stdexcept>
#include <string>

namespace Choupo
{

inline void fillPairAudit(PairResolution&    r,
                          const DictPtr&     provDict,
                          const std::string& pairName,
                          bool               requireOrigin = false)
{
    if (!provDict) { r.origin = originFromWord(r.provSource); return; }

    // Forum #77-1: a CURATED (standards) pair file must declare its typed
    // `origin`; the source-word fallback survives only for case-local legacy,
    // announced -- never a second silent truth.
    if (!provDict->found("origin"))
    {
        if (requireOrigin)
            throw std::runtime_error("pair " + pairName + ": a curated pair "
                "file must declare `origin literature|regressed|predictive|"
                "estimated|assumed;` -- the source word is a citation label, "
                "not a class");
        if (!r.provSource.empty())
            AdvisoryLog::instance().add("provenance", "warning",
                "pair " + pairName,
                "legacy source-word origin ('" + r.provSource
                + "') -- declare a typed `origin`; deprecation");
    }
    r.origin        = originFromWord(provDict->lookupWordOrDefault("origin", r.provSource));
    r.method        = provDict->lookupWordOrDefault("method",
                          provDict->lookupWordOrDefault("algorithm", ""));
    r.methodVersion = provDict->lookupWordOrDefault("methodVersion", "");

    auto readRange = [&](const DictPtr& blk, const char* lo, const char* hi,
                         const Dimensions& dims) -> std::optional<Range>
    {
        const bool hasLo = blk->found(lo), hasHi = blk->found(hi);
        if (!hasLo && !hasHi) return std::nullopt;
        if (hasLo != hasHi)
            throw std::runtime_error("pair " + pairName
                + ": validity block declares only one of "
                + lo + "/" + hi);
        Range rg{ blk->lookupScalar(lo, dims), blk->lookupScalar(hi, dims) };
        if (rg.lo > rg.hi)
            throw std::runtime_error("pair " + pairName + ": validity "
                + lo + " > " + hi);
        return rg;
    };
    if (provDict->found("validity"))
    {
        auto v = provDict->subDict("validity");
        if (v->found("temperature"))
            r.validity.temperature = readRange(v->subDict("temperature"),
                                               "min", "max", Dims::temperature);
        if (v->found("pressure"))
            r.validity.pressure = readRange(v->subDict("pressure"),
                                            "min", "max", Dims::pressure);
        r.validity.note = v->lookupWordOrDefault("note", "");
    }
    else if (provDict->found("validityRange"))
    {
        auto v = provDict->subDict("validityRange");
        r.validity.temperature = readRange(v, "Tmin", "Tmax", Dims::temperature);
    }

    if (provDict->found("promotedDespite"))
    {
        auto pd = provDict->subDict("promotedDespite");
        PromotionOverride po;
        po.identifiable =
            static_cast<int>(pd->lookupScalarOrDefault("identifiable", -1.0));
        po.reason = pd->lookupWordOrDefault("reason", "");
        po.by     = pd->lookupWordOrDefault("by", "");
        po.date   = pd->lookupWordOrDefault("date", "");
        if (po.reason.empty() || po.by.empty() || po.date.empty()
            || !pd->found("identifiable"))
            throw std::runtime_error("pair " + pairName
                + ": promotedDespite requires identifiable + reason + by + date"
                  " -- an override without them is not auditable");
        r.promotedDespite = po;
    }

    if (provDict->found("origin") && !r.provSource.empty())
    {
        const Origin fromSource = originFromWord(r.provSource);
        if (fromSource != Origin::unattributed && fromSource != r.origin)
            throw std::runtime_error("pair " + pairName
                + ": provenance origin '" + originToWord(r.origin)
                + "' contradicts source word '" + r.provSource
                + "' -- one truth, fix the file");
    }
}

} // namespace Choupo
