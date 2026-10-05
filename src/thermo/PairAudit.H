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
    a copied parser is how grammars diverge.

    PairSpanGuard -- THE run-time reader of that validity span (C35 item 5,
    2026-10-05).  The span was parsed, emitted to the result JSON and read
    by nobody at evaluation time, so a pair used far below the temperatures
    of its own evidence -- where a two-parameter b/T NRTL pair can split a
    liquid that is miscible in every proportion -- ran in silence.  Now a
    pair used outside its declared temperature span is ANNOUNCED, once per
    pair per run, and changes no number.  ONE home for the three families
    that share this parser (NRTL, UNIQUAC, Wilson).  */

#pragma once

#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "core/Origin.H"
#include "core/ThermoResolution.H"

#include "core/Types.H"

#include <cmath>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

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

    //  A PAIR RECORD'S `reviewStatus` IS READ, AND `interim` IS ANNOUNCED
    //  (2026-09-28).  The component loader has voiced it since 2026-08-05
    //  (Database.cpp, the `[unreviewed]` line); the pair loaders parsed
    //  nothing, so a pair record marked interim was indistinguishable at run
    //  time from a reviewed one -- the field was a comment.  The SAME word,
    //  the same once-per-process channel and the same tag, so a reader meets
    //  one convention for "somebody stated this is not yet reviewed" whatever
    //  kind of record carries it.  Only `interim` announces: an undeclared
    //  status makes no claim (the component loader's `[unmarked]` note is a
    //  catalogue fact, not a caveat on this run).
    if (provDict->lookupWordOrDefault("reviewStatus", "") == "interim")
    {
        const std::string why = provDict->lookupWordOrDefault("reviewReason", "");
        if (AdvisoryLog::instance().addAnnouncedOnce("interim:pair:" + pairName,
                "provenance", "warning", "pair " + pairName,
                "reviewStatus interim -- this pair record has not yet been"
                " reviewed against its evidence"))
            std::cerr << "[unreviewed] pair " << pairName
                      << ": reviewStatus interim -- not yet reviewed against its"
                         " evidence" << (why.empty() ? "" : " (" + why + ")")
                      << ".  Read its provenance{} block and the held-out verdict"
                         " it records before the result is cited, and mark"
                         " `reviewStatus reviewed;` once a human has.\n";
    }

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

//  A PAIR USED OUTSIDE ITS DECLARED TEMPERATURE SPAN IS ANNOUNCED (C35 item 5,
//  Vitor 2026-10-05).  The posture is the one the two existing extrapolation
//  channels already have, and the code mirrors them rather than inventing a
//  third: the vapour-pressure window (`VaporPressureModel::noteRange`,
//  src/thermo/vaporPressure/VaporPressureModel.cpp:161) and, closest in
//  shape because it is also a PAIR record, the Henry pair's Trange
//  (`HenrysLaw::announceOutsideWindow`, src/thermo/henrysLaw/HenrysLaw.cpp:136,
//  which already routes through `addAnnouncedOnce`).  Never a refusal --
//  extrapolation is a choice the student is entitled to make (I4) -- and it
//  moves no number: the guard reads T and x and writes only to the log.
//
//  WHAT "USED" MEANS HERE: both components of the pair carry composition
//  (x_i > 0 and x_j > 0) in the evaluated phase.  A pair whose components
//  are absent shapes nothing a run publishes; announcing it would fill the
//  caveat block of a big flowsheet with pairs that were never in play.  (An
//  infinite-dilution gamma of an ABSENT component does read the pair, and is
//  deliberately not announced: no stream carries that component.)
//
//  ONCE PER PAIR PER RUN, as ruled: the key is the pair, not the side, so a
//  run that walks both below and above a span reports its FIRST excursion.
//  The log holds the key (`addAnnouncedOnce`, core/Advisory.H, "THE LOG IS
//  PER PASS"): every pass of a sweep records it, the console line is printed
//  once per process.  INLINE pairs carry no provenance and so no span; they
//  are not guarded -- the absence is the inline grammar's, not the guard's.
class PairSpanGuard
{
public:
    //  Register the span a resolved pair record declares, if it declares one.
    void add(const std::string&    model,
             std::size_t           i,
             std::size_t           j,
             const std::string&    pairName,
             const PairResolution& r)
    {
        if (!r.validity.temperature) return;
        Span s;
        s.i = i;  s.j = j;
        s.lo = r.validity.temperature->lo;
        s.hi = r.validity.temperature->hi;
        s.locus = model + " pair '" + pairName + "'";
        s.key   = "pairSpan:" + model + ":" + pairName;
        s.tag   = model + " pair " + pairName;
        spans_.push_back(std::move(s));
    }

    //  Called from the model's gamma(T, x).  Cheap inside the span: one
    //  comparison per guarded pair, no string built.
    void check(scalar T, const sVector& x) const
    {
        for (const auto& s : spans_)
        {
            if (T >= s.lo && T <= s.hi) continue;
            if (s.i >= x.size() || s.j >= x.size()) continue;
            if (!(x[s.i] > 0.0 && x[s.j] > 0.0)) continue;
            announce(s, T);
        }
    }

private:
    struct Span
    {
        std::size_t i = 0, j = 0;
        scalar      lo = 0.0, hi = 0.0;
        std::string locus, key, tag;
    };
    std::vector<Span> spans_;

    static void announce(const Span& s, scalar T)
    {
        //  A pass that has already recorded this pair stops here, before the
        //  sentence is built -- the Henry site's early exit, for the same
        //  reason (gamma is asked for on every K evaluation).
        if (AdvisoryLog::instance().passHas(s.key)) return;

        const bool   above = (T > s.hi);
        const scalar edge  = above ? s.hi : s.lo;
        std::ostringstream m;
        m << "used at T = " << T << " K, " << (above ? "ABOVE" : "BELOW")
          << " its declared validity span (" << s.lo << " " << s.hi
          << " K) by " << std::abs(T - edge) << " K -- the parameters are"
             " extrapolated, still used; outside the span of its evidence the"
             " pair may predict phase behaviour that evidence does not show"
             " (a two-parameter b/T pair can split a liquid miscible in every"
             " proportion), and every activity coefficient computed from it"
             " inherits that";

        if (!AdvisoryLog::instance().addAnnouncedOnce(s.key, "validity",
                                                       "warning", s.locus,
                                                       m.str()))
            return;
        std::cerr << "[pair-span] " << s.tag << ": " << m.str()
                  << ".  Read the record's validity block and header before"
                     " the result is cited.\n";
    }
};

} // namespace Choupo
