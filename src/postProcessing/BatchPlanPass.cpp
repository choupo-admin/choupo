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

#include "BatchPlanPass.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "result/ResultEmitter.H"   // overallMassFlow: the one home

#include <algorithm>
#include <array>
#include <cmath>
#include <filesystem>
#include <functional>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <variant>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo {

namespace {

//  THE UNIT TYPES WHOSE THROUGHPUT THEIR DECLARED HARDWARE FIXES -- the one
//  home of the list.  For these the flowsheet's rate of the stream a stage
//  holds is the MACHINE'S capacity (a spray dryer's chamber, wheel and gas
//  set how much it dries); for every other unit (a mixer or a splitter
//  standing for a blender or a press) the flowsheet rate is only a basis.
const std::set<std::string>& ratingUnitTypes()
{
    static const std::set<std::string> t = { "sprayDryer" };
    return t;
}

//  The stated default of the low-utilisation threshold, announced when used.
constexpr scalar lowUtilisationDefault = 0.25;

//  The band within which a declared operating time is taken to agree with a
//  rated machine's own rate (a rounding band, not a design margin).
constexpr scalar capacityBand = 0.01;

std::string fmt(scalar v, int prec = 4)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(prec) << v;
    return o.str();
}

std::string requireText(const DictPtr& d, const char* key, const std::string& where)
{
    if (!d->found(key) || !std::holds_alternative<std::string>(d->entryValue(key))
        || d->lookupWord(key).empty())
        throw std::runtime_error(where + ": `" + key + " \"...\";` is not"
            " declared -- every number of a batch plan is the case's"
            " assumption, and it owes its reader where it comes from"
            " (`source`) and why it is this plant's (`reason`).  Nothing is"
            " defaulted.");
    return d->lookupWord(key);
}

bool isWord(const DictPtr& d, const char* key)
{
    return d->found(key) && std::holds_alternative<std::string>(d->entryValue(key));
}

//  A dimensioned scalar, in its canonical SI, REFUSED without a unit.
scalar dimensioned(const DictPtr& d, const char* key, const Dimensions& dims,
                   const char* example, const std::string& where)
{
    if (!d->found(key))
        throw std::runtime_error(where + ": `" + key + "` is not declared"
            " (e.g. `" + key + " " + example + ";`).  Nothing is defaulted.");
    if (!std::holds_alternative<scalar>(d->entryValue(key)))
        throw std::runtime_error(where + ": `" + key + "` must be a number"
            " with its unit (e.g. `" + key + " " + example + ";`).");
    if (!d->hasDimensions(key))
        throw std::runtime_error(where + ": `" + key + " "
            + fmt(d->lookupScalar(key)) + ";` carries no unit -- declare it"
            " (e.g. `" + key + " " + example + ";`).  A bare number would be"
            " read as SI (seconds, kg, m3), which is never what a recipe"
            " table means.");
    const scalar v = d->lookupScalar(key, dims);
    if (!std::isfinite(v) || v < 0.0)
        throw std::runtime_error(where + ": `" + key + "` must be a finite,"
            " non-negative number.");
    return v;
}

scalar hoursOf(const DictPtr& d, const char* key, const std::string& where)
{
    return dimensioned(d, key, Dims::time, "2 h", where) / 3600.0;
}

int countOf(const DictPtr& d, const char* key, int def, const std::string& where)
{
    if (!d->found(key)) return def;
    const scalar v = d->lookupScalar(key);
    if (!std::isfinite(v) || v < 1.0 || std::fabs(v - std::round(v)) > 1e-9)
        throw std::runtime_error(where + ": `" + key + " " + fmt(v) + ";` --"
            " a count of units or lots is a whole number of at least 1.");
    return static_cast<int>(std::lround(v));
}

std::string wordList(const std::vector<std::string>& v)
{
    std::string s;
    for (const auto& w : v) s += (s.empty() ? "" : " ") + w;
    return s.empty() ? "(none)" : s;
}

//  A finding: the console, the end-of-run caveat block, and the record.
void announce(BatchPlanRecord& plan, const std::string& kind,
              const std::string& subject, scalar value, scalar limit,
              const std::string& message)
{
    BatchFinding f;
    f.id      = kind + ":" + subject;
    f.kind    = kind;
    f.subject = subject;
    f.value   = value;
    f.limit   = limit;
    f.message = message;
    plan.findings.push_back(f);
    std::cerr << "[batchPlan] " << message << "\n";
    AdvisoryLog::instance().add("batchPlan", "warning", f.id, message);
}

//  ONE CAMPAIGN'S OFFSETS on a train -- the one home of the schedule, called
//  once per train for a single product and once per (product, train) for
//  several.  `v` lists the train's stages in recipe order, each with the
//  stage it feeds and its charge, processing and cycle times; the offsets
//  are filled in and max_j (o_j + t_j) is returned.  The rule is the
//  header's: a stage fed by earlier ones starts when their discharge starts,
//  a side feed is scheduled backwards so that its discharge starts when the
//  stage it feeds starts processing, and the earliest start is time zero.
struct SchedStage
{
    std::string name, feeds;
    scalar charge = 0, proc = 0, cycle = 0, offset = 0;
};

scalar scheduleCampaign(std::vector<SchedStage>& v)
{
    std::map<std::string, std::size_t> at;
    for (std::size_t k = 0; k < v.size(); ++k) at[v[k].name] = k;
    std::map<std::string, std::vector<std::string>> fedBy;
    for (const auto& s : v)
        if (!s.feeds.empty()) fedBy[s.feeds].push_back(s.name);
    std::set<std::string> scheduled;
    for (std::size_t k = 0; k < v.size(); ++k)
    {
        SchedStage& s = v[k];
        if (k == 0) { s.offset = 0.0; scheduled.insert(s.name); continue; }
        bool any = false;
        scalar o = 0.0;
        for (const auto& f : fedBy[s.name])
        {
            if (!scheduled.count(f)) continue;
            const SchedStage& fs_ = v[at[f]];
            const scalar dischargeStart = fs_.offset + fs_.charge + fs_.proc;
            o = any ? std::max(o, dischargeStart) : dischargeStart;
            any = true;
        }
        if (any) { s.offset = o; scheduled.insert(s.name); }
    }
    for (std::size_t k = v.size(); k-- > 0;)
    {
        SchedStage& s = v[k];
        if (scheduled.count(s.name)) continue;
        if (!s.feeds.empty())
        {
            const SchedStage& tg = v[at[s.feeds]];
            s.offset = tg.offset + tg.charge - s.charge - s.proc;
        }
        else s.offset = 0.0;
        scheduled.insert(s.name);
    }
    scalar oMin = 0.0, last = 0.0;
    bool first = true;
    for (const auto& s : v)
    {
        oMin = first ? s.offset : std::min(oMin, s.offset);
        first = false;
    }
    for (auto& s : v)
    {
        s.offset -= oMin;
        last = std::max(last, s.offset + s.cycle);
    }
    return last;
}

//  A declared LOT: the plan's `lot {}`, or a product's own.
struct LotDecl
{
    bool        present = false;
    std::string rule, stream, source, reason;
    scalar      mass = 0, streamRate = 0;   // [kg], [kg/h]
};

using RateOf = std::function<scalar(const std::string&, const std::string&)>;

LotDecl parseLot(const DictPtr& ld, const std::string& lw, const RateOf& rateOf)
{
    LotDecl L;
    L.present = true;
    if (!isWord(ld, "rule"))
        throw std::runtime_error(lw + ": `rule` is not declared.  Accepted:"
            " declared | largestEquipment.");
    L.rule = ld->lookupWord("rule");
    if (L.rule != "declared" && L.rule != "largestEquipment")
        throw std::runtime_error(lw + ": `rule " + L.rule + ";` is not a"
            " lot rule.  Accepted: declared | largestEquipment.");
    L.source = requireText(ld, "source", lw);
    L.reason = requireText(ld, "reason", lw);
    if (L.rule == "declared")
    {
        if (!isWord(ld, "stream"))
            throw std::runtime_error(lw + ": `rule declared;` needs `stream <name>;`"
                " -- the stream whose mass per lot is declared (a lot of tablets"
                " is usually counted in kg of final blend).");
        L.stream     = ld->lookupWord("stream");
        L.streamRate = rateOf(L.stream, lw);
        L.mass       = dimensioned(ld, "mass", Dims::mass, "350 kg", lw);
        if (!(L.streamRate > 0.0) || !(L.mass > 0.0))
            throw std::runtime_error(lw + ": the lot stream and its mass must"
                " both be positive.");
    }
    else
    {
        for (const char* k : { "stream", "mass" })
            if (ld->found(k))
                throw std::runtime_error(lw + ": `" + k + "` is declared beside"
                    " `rule largestEquipment;` -- that rule DERIVES the lot from"
                    " the stages' `maxVolume`, so the number would be read by"
                    " nothing.  Delete it, or declare `rule declared;`.");
    }
    return L;
}

//  One declared PRODUCT of a multiproduct plan, as read.
struct ProductDecl
{
    BatchProduct                    rec;
    LotDecl                         lot;
    std::map<std::string, scalar>   mpp;      // stream -> kg per kg of product
    std::map<std::string, DictPtr>  over;     // stage  -> its override block
};

//  THE MULTIPRODUCT PLAN (2026-10-20, DEV.md 4c C110 G2): the products the
//  plan declares, made on the same stages in single-product campaigns in the
//  DECLARED order, every stage cleaned between products.  The method is in
//  the header; every per-product number lands in `plan.products`,
//  `productStages` and `productTrains`, every aggregate on the stage and the
//  train records the consumers already read (the size a vessel or a quote
//  takes is the LARGEST any product needs).
void designMultiProduct(BatchPlanRecord& plan, const std::string& top,
                        std::vector<ProductDecl>& prods,
                        const std::map<std::string, std::size_t>& stageIndex,
                        const std::map<std::string, std::size_t>& trainIndex)
{
    const std::size_t NP = prods.size();
    const std::size_t NS = plan.stages.size();
    std::vector<std::string> productNames;
    for (const auto& P : prods) productNames.push_back(P.rec.name);

    //  ---- the per-product overrides, checked against the stages ----------
    for (auto& P : prods)
    {
        const std::string pw = top + " { products ( '" + P.rec.name + "' ) }";
        for (const auto& kv : P.over)
        {
            if (!stageIndex.count(kv.first))
            {
                std::vector<std::string> sn;
                for (const auto& s : plan.stages) sn.push_back(s.name);
                throw std::runtime_error(pw + " { stages }: `stage " + kv.first
                    + ";` names no stage of the plan.  Stages: " + wordList(sn) + ".");
            }
            const BatchStage& s = plan.stages[stageIndex.at(kv.first)];
            const DictPtr& o = kv.second;
            const std::string w = pw + " { stages ( '" + s.name + "' ) }";
            std::set<std::string> ok = { "stage", "source", "reason", "chargeTime",
                                         "cleanTime", "dischargeTime", "changeoverTo" };
            if (s.type == "batch")
                ok.insert({ "processTime", "bulkDensity", "fillFraction" });
            else
                ok.insert("operatingTime");
            int n = 0;
            for (const auto& k : o->keys())
            {
                if (!ok.count(k))
                {
                    std::vector<std::string> acc;
                    for (const auto& a : ok)
                        if (a != "stage" && a != "source" && a != "reason") acc.push_back(a);
                    throw std::runtime_error(w + ": `" + k + "` is not something a"
                        " product changes at a " + s.type + " stage.  Accepted: "
                        + wordList(acc) + ".");
                }
                if (k != "stage" && k != "source" && k != "reason") ++n;
            }
            if (n == 0)
                throw std::runtime_error(w + ": the block changes nothing -- a"
                    " product's stage block declares what differs for it (a time,"
                    " a density, a clean); delete it, or declare the difference.");
            requireText(o, "source", w);
            requireText(o, "reason", w);
            if (o->found("changeoverTo"))
            {
                if (!std::holds_alternative<DictPtr>(o->entryValue("changeoverTo")))
                    throw std::runtime_error(w + ": `changeoverTo` must be a block --"
                        " `changeoverTo { <product> <time>; }`.");
                const DictPtr to = o->subDict("changeoverTo");
                for (const auto& k : to->keys())
                {
                    if (std::find(productNames.begin(), productNames.end(), k)
                            == productNames.end() || k == P.rec.name)
                        throw std::runtime_error(w + " { changeoverTo }: `" + k
                            + "` is not ANOTHER product of the plan -- the clean"
                            " named here is the one this stage needs when the next"
                            " campaign is that product.  Products: "
                            + wordList(productNames) + ".");
                    hoursOf(to, k.c_str(), w + " { changeoverTo }");
                }
            }
        }
        //  massPerProduct: a stream some stage of THIS product reads.
        for (const auto& kv : P.mpp)
        {
            bool read = (P.lot.rule == "declared" && P.lot.stream == kv.first);
            for (const auto& s : plan.stages) read = read || (s.holds == kv.first);
            if (!read)
                throw std::runtime_error(pw + " { massPerProduct }: stream '"
                    + kv.first + "' is held by no stage and is not this product's"
                    " lot stream -- the number would be read by nothing.");
        }
    }

    //  ---- per product: the lot, the sizes, the times ----------------------
    for (std::size_t i = 0; i < NP; ++i)
    {
        ProductDecl& P = prods[i];
        BatchProduct& pr = P.rec;
        pr.next = prods[(i + 1) % NP].rec.name;
        auto f = [&](const std::string& stream, scalar rate) -> scalar
        {
            const auto it = P.mpp.find(stream);
            return it != P.mpp.end() ? it->second : rate / plan.productRate;
        };
        for (const auto& kv : P.mpp) pr.ownBalance.push_back(kv.first);

        std::vector<BatchProductStage> ps(NS);
        for (std::size_t k = 0; k < NS; ++k)
        {
            const BatchStage& s = plan.stages[k];
            BatchProductStage& x = ps[k];
            const auto oit = P.over.find(s.name);
            const DictPtr o = (oit != P.over.end()) ? oit->second : DictPtr();
            const std::string w = top + " { products ( '" + pr.name + "' ) stages ( '"
                                + s.name + "' ) }";
            auto has = [&](const char* key) { return o && o->found(key); };
            x.product = pr.name;
            x.stage   = s.name;
            x.balanceFrom    = P.mpp.count(s.holds) ? "declared" : "flowsheet";
            x.massPerProduct = f(s.holds, s.massRate);
            x.chargeTime = has("chargeTime") ? hoursOf(o, "chargeTime", w) : s.chargeTime;
            x.cleanTime  = has("cleanTime")  ? hoursOf(o, "cleanTime", w)  : s.cleanTime;
            if (s.type == "batch")
            {
                x.bulkDensity = has("bulkDensity")
                    ? dimensioned(o, "bulkDensity", Dims::density, "450 kg/m3", w)
                    : s.bulkDensity;
                if (!(x.bulkDensity > 0.0))
                    throw std::runtime_error(w + ": `bulkDensity` must be positive.");
                x.fillFraction = has("fillFraction") ? o->lookupScalar("fillFraction")
                                                     : s.fillFraction;
                if (!(x.fillFraction > 0.0 && x.fillFraction <= 1.0))
                    throw std::runtime_error(w + ": `fillFraction "
                        + fmt(x.fillFraction) + ";` must lie in (0, 1].");
                x.processTime = has("processTime") ? hoursOf(o, "processTime", w)
                                                   : s.processTime;
                x.sizeFactor = x.massPerProduct / (x.bulkDensity * x.fillFraction);
            }
            else if (has("operatingTime"))
            {
                if (isWord(o, "operatingTime"))
                {
                    const std::string ow = o->lookupWord("operatingTime");
                    if (ow != "fromFlowsheet")
                        throw std::runtime_error(w + ": `operatingTime " + ow + ";` --"
                            " a time with its unit, or the word fromFlowsheet.");
                    if (s.ratingUnit.empty())
                        throw std::runtime_error(w + ": `operatingTime"
                            " fromFlowsheet;` on a stage with no RATED unit ("
                            + wordList(s.units) + ") -- only a unit whose hardware"
                            " the flowsheet models has a rate of its own.  Declare"
                            " the time.");
                    x.operatingFrom = "flowsheet";
                }
                else
                {
                    x.operatingFrom = "declared";
                    x.processTime   = hoursOf(o, "operatingTime", w);
                    if (!(x.processTime > 0.0))
                        throw std::runtime_error(w + ": `operatingTime` must be"
                            " positive.");
                }
            }
            else
            {
                x.operatingFrom = s.operatingFrom;
                x.processTime   = s.processTime;
            }
            if (has("dischargeTime"))
            {
                if (isWord(o, "dischargeTime"))
                {
                    const std::string dw = o->lookupWord("dischargeTime");
                    if (dw != "throughFedStage")
                        throw std::runtime_error(w + ": `dischargeTime " + dw + ";` --"
                            " a time with its unit, or the word throughFedStage.");
                    if (s.feeds.empty())
                        throw std::runtime_error(w + ": `dischargeTime"
                            " throughFedStage;` on a stage that feeds no stage --"
                            " declare the time.");
                    x.dischargeFrom = "fedStage";
                }
                else
                {
                    x.dischargeFrom = "declared";
                    x.dischargeTime = hoursOf(o, "dischargeTime", w);
                }
            }
            else
            {
                x.dischargeFrom = s.dischargeFrom;
                x.dischargeTime = s.dischargeTime;
            }
            //  The clean after this product's last campaign, before `next`.
            const BatchTrain& t = plan.trains[trainIndex.at(s.train)];
            if (NP < 2)
                x.changeoverAfter = t.changeover;
            else if (has("changeoverTo")
                     && o->subDict("changeoverTo")->found(pr.next))
                x.changeoverAfter = hoursOf(o->subDict("changeoverTo"),
                                            pr.next.c_str(), w + " { changeoverTo }");
            else
                x.changeoverAfter = s.productChangeover;
            if (o)
            {
                x.overrideSource = o->lookupWord("source");
                x.overrideReason = o->lookupWord("reason");
            }
        }

        //  The lot.
        pr.lotRule   = P.lot.rule;
        pr.lotSource = P.lot.source;
        pr.lotReason = P.lot.reason;
        if (P.lot.rule == "declared")
        {
            pr.lotStream     = P.lot.stream;
            pr.lotStreamMass = P.lot.mass;
            pr.lotSize       = P.lot.mass / f(P.lot.stream, P.lot.streamRate);
        }
        else
        {
            scalar best = -1.0;
            for (std::size_t k = 0; k < NS; ++k)
            {
                const BatchStage& s = plan.stages[k];
                if (s.type != "batch") continue;
                const scalar Bj = s.inPhase * s.maxVolume / ps[k].sizeFactor;
                if (best < 0.0 || Bj < best) { best = Bj; pr.lotLimitingStage = s.name; }
            }
            if (best <= 0.0)
                throw std::runtime_error(top + " { products ( '" + pr.name + "' ) }:"
                    " `rule largestEquipment;` and no BATCH stage -- only a"
                    " vessel's largest volume bounds a lot.");
            pr.lotSize = best;
        }
        {
            const scalar ratio = pr.perYear / pr.lotSize;
            pr.lotsPerYear = static_cast<int>(std::ceil(ratio - 1e-9 * ratio));
            if (pr.lotsPerYear < 1) pr.lotsPerYear = 1;
            pr.production = pr.lotsPerYear * pr.lotSize;
        }
        pr.equivalentHours = pr.perYear / plan.productRate;

        //  Sizes and processing times, then the cycles.
        for (std::size_t k = 0; k < NS; ++k)
        {
            const BatchStage& s = plan.stages[k];
            BatchProductStage& x = ps[k];
            x.massPerLot = x.massPerProduct * pr.lotSize;
            if (s.type == "batch")
            {
                x.volume        = x.sizeFactor * pr.lotSize;
                x.volumePerUnit = x.volume / s.inPhase;
            }
            else
            {
                if (x.operatingFrom == "flowsheet")
                    x.processTime = x.massPerLot / (s.inPhase * s.capacityRate);
                x.rate        = x.massPerLot / x.processTime;
                x.ratePerUnit = x.rate / s.inPhase;
            }
        }
        for (std::size_t k = 0; k < NS; ++k)
        {
            const BatchStage& s = plan.stages[k];
            BatchProductStage& x = ps[k];
            if (x.dischargeFrom == "fedStage")
                x.dischargeTime = ps[stageIndex.at(s.feeds)].processTime;
            x.cycleTime = x.chargeTime + x.processTime + x.dischargeTime + x.cleanTime;
            if (!(x.cycleTime > 0.0))
                throw std::runtime_error(top + " { products ( '" + pr.name
                    + "' ) }: the cycle time of stage '" + s.name + "' is zero --"
                    " a stage takes some time per lot.");
            x.effectiveCycle = x.cycleTime / s.outOfPhase;
        }
        for (auto& x : ps) plan.productStages.push_back(x);
        plan.products.push_back(pr);
    }

    auto pst = [&](std::size_t i, std::size_t k) -> BatchProductStage&
    { return plan.productStages[i * NS + k]; };

    //  ---- per train: each product's campaign, then the year in order ------
    for (auto& t : plan.trains)
    {
        scalar clock = 0.0;
        const int nc = t.lotsPerCampaign;
        for (std::size_t i = 0; i < NP; ++i)
        {
            const BatchProduct& pr = plan.products[i];
            BatchProductTrain pt;
            pt.product = pr.name;
            pt.train   = t.name;
            pt.next    = pr.next;
            for (const auto& n : t.stages)
            {
                const BatchProductStage& x = pst(i, stageIndex.at(n));
                if (x.effectiveCycle > pt.cycleTime + 1e-12)
                {
                    pt.cycleTime = x.effectiveCycle;
                    pt.limitingStage = n;
                }
            }
            std::vector<SchedStage> sv;
            for (const auto& n : t.stages)
            {
                const BatchStage& s = plan.stages[stageIndex.at(n)];
                const BatchProductStage& x = pst(i, stageIndex.at(n));
                SchedStage e;
                e.name = n;  e.feeds = s.feeds;
                e.charge = x.chargeTime;  e.proc = x.processTime;  e.cycle = x.cycleTime;
                sv.push_back(e);
            }
            const scalar last = scheduleCampaign(sv);
            scalar pco = (NP < 2) ? t.changeover : 0.0;
            for (const auto& e : sv)
            {
                BatchProductStage& x = pst(i, stageIndex.at(e.name));
                x.offset      = e.offset;
                x.utilisation = x.effectiveCycle / pt.cycleTime;
                x.limiting    = (e.name == pt.limitingStage);
                if (NP >= 2) pco = std::max(pco, x.changeoverAfter);
            }
            auto span = [&](int nLots) { return last + (nLots - 1) * pt.cycleTime; };
            const int N = pr.lotsPerYear;
            pt.campaigns        = (N + nc - 1) / nc;
            const int full = N / nc, rem = N % nc;
            pt.lotsLastCampaign = rem > 0 ? rem : std::min(nc, N);
            pt.campaignSpan     = span(std::min(nc, N));
            pt.productChangeover = pco;
            pt.start            = clock;
            pt.requiredTime     = full * span(nc) + (rem > 0 ? span(rem) : 0.0)
                                + (pt.campaigns - 1) * t.changeover + pco;

            //  The year's Gantt on this train, from the product's start.
            scalar c0 = clock;
            for (int k = 1; k <= pt.campaigns; ++k)
            {
                const int nl = (k <= full) ? nc : rem;
                BatchGanttRow cb;
                cb.train = t.name;  cb.product = pr.name;  cb.kind = "campaign";
                cb.campaign = k;  cb.lots = nl;
                cb.start = c0;  cb.end = c0 + span(nl);
                plan.gantt.push_back(cb);
                if (k == 1)
                    for (const auto& e : sv)
                    {
                        const BatchStage& s = plan.stages[stageIndex.at(e.name)];
                        for (int l = 0; l < nl; ++l)
                        {
                            BatchGanttRow g;
                            g.train = t.name;  g.product = pr.name;  g.kind = "lot";
                            g.stage = e.name;  g.campaign = 1;
                            g.lot   = l + 1;   g.unit = (l % s.outOfPhase) + 1;
                            g.start = c0 + e.offset + l * pt.cycleTime;
                            g.end   = g.start + e.cycle;
                            plan.gantt.push_back(g);
                        }
                    }
                c0 += span(nl);
                if (k < pt.campaigns || NP < 2)
                {
                    BatchGanttRow co;
                    co.train = t.name;  co.product = pr.name;  co.kind = "changeover";
                    co.stage = "changeover";  co.campaign = k;
                    co.start = c0;  co.end = c0 + t.changeover;
                    plan.gantt.push_back(co);
                    c0 += t.changeover;
                }
                else
                {
                    BatchGanttRow co;
                    co.train = t.name;  co.product = pr.name;
                    co.kind = "productChangeover";  co.stage = "productChangeover";
                    co.campaign = k;
                    co.start = c0;  co.end = c0 + pco;
                    plan.gantt.push_back(co);
                    for (const auto& e : sv)
                    {
                        BatchGanttRow g;
                        g.train = t.name;  g.product = pr.name;  g.kind = "stageClean";
                        g.stage = e.name;
                        g.start = c0;
                        g.end   = c0 + pst(i, stageIndex.at(e.name)).changeoverAfter;
                        plan.gantt.push_back(g);
                    }
                    c0 += pco;
                }
            }
            clock            += pt.requiredTime;
            t.requiredTime   += pt.requiredTime;
            t.campaigns      += pt.campaigns;
            t.changeoverHours += (pt.campaigns - 1) * t.changeover + pco;
            plan.productTrains.push_back(pt);
        }
        t.productChangeovers = (NP >= 2) ? static_cast<int>(NP) : 0;
        t.occupancy          = t.requiredTime / t.availableTime;
    }

    //  ---- per stage: the largest size, the year's busy hours -------------
    for (std::size_t k = 0; k < NS; ++k)
    {
        BatchStage& s = plan.stages[k];
        const BatchTrain& t = plan.trains[trainIndex.at(s.train)];
        scalar busy = 0.0, best = -1.0;
        for (std::size_t i = 0; i < NP; ++i)
        {
            const BatchProductStage& x = pst(i, k);
            const BatchProductTrain& pt = plan.productTrains[
                trainIndex.at(s.train) * NP + i];
            busy += plan.products[i].lotsPerYear * x.cycleTime / s.outOfPhase
                  + (pt.campaigns - 1) * t.changeover + x.changeoverAfter;
            //  The largest size; a tie within 1e-9 (a rated stage asks every
            //  product for the machine's own rate) stays with the first
            //  product in the order.
            const scalar size = (s.type == "batch") ? x.volumePerUnit : x.ratePerUnit;
            if (best < 0.0 || size > best * (1.0 + 1e-9))
            {
                best = size;
                s.sizingProduct = x.product;
                s.volume        = x.volume;
                s.volumePerUnit = x.volumePerUnit;
                s.rate          = x.rate;
                s.ratePerUnit   = x.ratePerUnit;
            }
            s.maxUtilisation = std::max(s.maxUtilisation, x.utilisation);
            s.limiting = s.limiting || x.limiting;
        }
        s.busyHours = busy;
        s.occupancy = busy / t.availableTime;
        s.idleHours = t.availableTime - busy;
    }

    //  ---- the year's totals -------------------------------------------
    plan.productPerYear = 0.0;
    plan.lotsPerYear    = 0;
    plan.production     = 0.0;
    for (const auto& pr : plan.products)
    {
        plan.productPerYear += pr.perYear;
        plan.lotsPerYear    += pr.lotsPerYear;
        plan.production     += pr.production;
    }
    plan.equivalentHours = plan.productPerYear / plan.productRate;
    plan.streamFactor    = plan.equivalentHours / 8760.0;

    //  ---- an impossible plan REFUSES ---------------------------------
    for (std::size_t k = 0; k < NS; ++k)
    {
        const BatchStage& s = plan.stages[k];
        const BatchTrain& t = plan.trains[trainIndex.at(s.train)];
        if (s.busyHours > t.availableTime * (1.0 + 1e-9))
        {
            std::ostringstream m;
            m << top << ": stage '" << s.name << "' is busy " << fmt(s.busyHours)
              << " h a year per unit (";
            scalar lots = 0.0;
            for (std::size_t i = 0; i < NP; ++i)
            {
                const BatchProductStage& x = pst(i, k);
                m << (i ? "; " : "") << x.product << " "
                  << plan.products[i].lotsPerYear << " lots x " << fmt(x.cycleTime)
                  << " h";
                lots += plan.products[i].lotsPerYear * x.cycleTime;
            }
            m << ", over " << s.outOfPhase << " out-of-phase unit(s), plus every"
              << " changeover) against the " << fmt(t.availableTime) << " h train '"
              << t.name << "' may run: occupancy " << fmt(100.0 * s.occupancy)
              << " %.  The plan cannot be run.  Remedies: an out-of-phase unit"
              << " (`outOfPhase " << (s.outOfPhase + 1) << ";` takes the lots'"
              << " share to " << fmt(lots / (s.outOfPhase + 1)) << " h), larger"
              << " lots, longer campaigns, or more available hours.";
            throw std::runtime_error(m.str());
        }
    }
    for (const auto& t : plan.trains)
        if (t.requiredTime > t.availableTime * (1.0 + 1e-9))
        {
            std::ostringstream m;
            m << top << ": train '" << t.name << "' needs " << fmt(t.requiredTime)
              << " h a year (";
            for (std::size_t i = 0; i < NP; ++i)
            {
                const BatchProductTrain& pt = plan.productTrains[
                    trainIndex.at(t.name) * NP + i];
                m << (i ? "; " : "") << pt.product << " " << fmt(pt.requiredTime)
                  << " h in " << pt.campaigns << " campaign(s), cycle "
                  << fmt(pt.cycleTime) << " h set by '" << pt.limitingStage << "'";
            }
            m << "; " << fmt(t.changeoverHours) << " h of it changeovers) and may"
              << " run " << fmt(t.availableTime) << " h: the production of "
              << fmt(plan.productPerYear) << " kg a year is unreachable.  Remedies:"
              << " an out-of-phase unit at a limiting stage, larger lots, longer"
              << " campaigns, shorter cleans between products, or more available"
              << " hours.";
            throw std::runtime_error(m.str());
        }
}

//  The reports of a MULTIPRODUCT plan: the per-product tables beside the
//  stage and train aggregates, and the year's Gantt.
void writeMultiProductCsvs(const BatchPlanRecord& p, const fs::path& dir)
{
    {
        std::ofstream o(dir / "products.csv");
        o << "product,perYear_kg,lotFrom,lotRule,lotStream,lotStreamMass_kg,"
             "lotLimitingStage,lotSize_kg,lotsPerYear,production_kg,"
             "equivalentHours_h,ownBalance,next\n";
        o << std::setprecision(10);
        for (const auto& x : p.products)
        {
            std::string ob;
            for (const auto& s : x.ownBalance) ob += (ob.empty() ? "" : " ") + s;
            o << x.name << "," << x.perYear << "," << x.lotFrom << "," << x.lotRule
              << "," << x.lotStream << "," << x.lotStreamMass << ","
              << x.lotLimitingStage << "," << x.lotSize << "," << x.lotsPerYear
              << "," << x.production << "," << x.equivalentHours << "," << ob
              << "," << x.next << "\n";
        }
    }
    {
        std::ofstream o(dir / "productStages.csv");
        o << "product,stage,balanceFrom,massPerProduct,massPerLot_kg,sizeFactor_m3_per_kg,"
             "volume_m3,volumePerUnit_m3,rate_kg_h,ratePerUnit_kg_h,chargeTime_h,"
             "processTime_h,dischargeTime_h,cleanTime_h,cycleTime_h,effectiveCycle_h,"
             "utilisation,limiting,offset_h,changeoverAfter_h\n";
        o << std::setprecision(10);
        for (const auto& x : p.productStages)
            o << x.product << "," << x.stage << "," << x.balanceFrom << ","
              << x.massPerProduct << "," << x.massPerLot << "," << x.sizeFactor << ","
              << x.volume << "," << x.volumePerUnit << "," << x.rate << ","
              << x.ratePerUnit << "," << x.chargeTime << "," << x.processTime << ","
              << x.dischargeTime << "," << x.cleanTime << "," << x.cycleTime << ","
              << x.effectiveCycle << "," << x.utilisation << ","
              << (x.limiting ? "yes" : "no") << "," << x.offset << ","
              << x.changeoverAfter << "\n";
    }
    {
        std::ofstream o(dir / "productTrains.csv");
        o << "product,train,cycleTime_h,limitingStage,campaigns,lotsLastCampaign,"
             "campaignSpan_h,start_h,productChangeover_h,requiredTime_h,next\n";
        o << std::setprecision(10);
        for (const auto& x : p.productTrains)
            o << x.product << "," << x.train << "," << x.cycleTime << ","
              << x.limitingStage << "," << x.campaigns << "," << x.lotsLastCampaign
              << "," << x.campaignSpan << "," << x.start << ","
              << x.productChangeover << "," << x.requiredTime << "," << x.next << "\n";
    }
    {
        std::ofstream o(dir / "stages.csv");
        o << "stage,train,type,units,holds,feeds,sizingProduct,volume_m3,"
             "volumePerUnit_m3,rate_kg_h,ratePerUnit_kg_h,inPhase,outOfPhase,"
             "productChangeover_h,maxUtilisation,limiting,busyHours_h,occupancy,"
             "idleHours_h\n";
        o << std::setprecision(10);
        for (const auto& s : p.stages)
        {
            std::string u;
            for (const auto& x : s.units) u += (u.empty() ? "" : " ") + x;
            o << s.name << "," << s.train << "," << s.type << "," << u << ","
              << s.holds << "," << s.feeds << "," << s.sizingProduct << ","
              << s.volume << "," << s.volumePerUnit << "," << s.rate << ","
              << s.ratePerUnit << "," << s.inPhase << "," << s.outOfPhase << ","
              << s.productChangeover << "," << s.maxUtilisation << ","
              << (s.limiting ? "yes" : "no") << "," << s.busyHours << ","
              << s.occupancy << "," << s.idleHours << "\n";
        }
    }
    {
        std::ofstream o(dir / "trains.csv");
        o << "train,availableTime_h,lotsPerCampaign,changeover_h,campaigns,"
             "productChangeovers,changeoverHours_h,requiredTime_h,occupancy\n";
        o << std::setprecision(10);
        for (const auto& t : p.trains)
            o << t.name << "," << t.availableTime << "," << t.lotsPerCampaign << ","
              << t.changeover << "," << t.campaigns << "," << t.productChangeovers
              << "," << t.changeoverHours << "," << t.requiredTime << ","
              << t.occupancy << "\n";
    }
    {
        std::ofstream o(dir / "gantt.csv");
        o << "train,product,kind,stage,campaign,lot,lots,unit,start_h,end_h\n";
        o << std::setprecision(10);
        for (const auto& g : p.gantt)
            o << g.train << "," << g.product << "," << g.kind << "," << g.stage << ","
              << g.campaign << "," << g.lot << "," << g.lots << "," << g.unit << ","
              << g.start << "," << g.end << "\n";
    }
}

void writeCsvs(const BatchPlanRecord& p)
{
    const fs::path dir = "reports/batchPlan";
    std::error_code ec;
    fs::create_directories(dir, ec);
    if (ec) return;   // a report that cannot be written is not a refusal of the plan
    if (p.multiProduct())
    {
        writeMultiProductCsvs(p, dir);
        return;
    }
    {
        std::ofstream o(dir / "stages.csv");
        o << "stage,train,type,units,holds,feeds,massPerLot_kg,sizeFactor_m3_per_kg,"
             "volume_m3,volumePerUnit_m3,rate_kg_h,ratePerUnit_kg_h,inPhase,outOfPhase,"
             "chargeTime_h,processTime_h,dischargeTime_h,cleanTime_h,cycleTime_h,"
             "effectiveCycle_h,utilisation,limiting,offset_h,busyHours_h,occupancy,idleHours_h\n";
        o << std::setprecision(10);
        for (const auto& s : p.stages)
        {
            std::string u;
            for (const auto& x : s.units) u += (u.empty() ? "" : " ") + x;
            o << s.name << "," << s.train << "," << s.type << "," << u << ","
              << s.holds << "," << s.feeds << "," << s.massPerLot << ","
              << s.sizeFactor << "," << s.volume << "," << s.volumePerUnit << ","
              << s.rate << "," << s.ratePerUnit << "," << s.inPhase << ","
              << s.outOfPhase << "," << s.chargeTime << "," << s.processTime << ","
              << s.dischargeTime << "," << s.cleanTime << "," << s.cycleTime << ","
              << s.effectiveCycle << "," << s.utilisation << ","
              << (s.limiting ? "yes" : "no") << "," << s.offset << ","
              << s.busyHours << "," << s.occupancy << "," << s.idleHours << "\n";
        }
    }
    {
        std::ofstream o(dir / "trains.csv");
        o << "train,availableTime_h,lotsPerCampaign,changeover_h,cycleTime_h,"
             "limitingStage,campaigns,campaignSpan_h,campaignDuration_h,"
             "requiredTime_h,occupancy\n";
        o << std::setprecision(10);
        for (const auto& t : p.trains)
            o << t.name << "," << t.availableTime << "," << t.lotsPerCampaign << ","
              << t.changeover << "," << t.cycleTime << "," << t.limitingStage << ","
              << t.campaigns << "," << t.campaignSpan << "," << t.campaignDuration << ","
              << t.requiredTime << "," << t.occupancy << "\n";
    }
    {
        std::ofstream o(dir / "gantt.csv");
        o << "train,stage,lot,unit,start_h,end_h\n";
        o << std::setprecision(10);
        for (const auto& g : p.gantt)
            o << g.train << "," << g.stage << "," << g.lot << "," << g.unit << ","
              << g.start << "," << g.end << "\n";
    }
}

//  A declared DOSAGE UNIT (C264): what one unit of the product weighs, so
//  the plan can count the product in the units it is sold in.
struct DosageDecl
{
    bool        present = false;
    std::string name, source, reason;
    scalar      mass = 0;   // [kg]
};

DosageDecl parseDosage(const DictPtr& parent, const std::string& w)
{
    DosageDecl D;
    if (!parent->found("dosageUnit")) return D;
    if (!std::holds_alternative<DictPtr>(parent->entryValue("dosageUnit")))
        throw std::runtime_error(w + ": `dosageUnit` must be a block -- `dosageUnit"
            " { name tablet; mass 0.29 g; source \"...\"; reason \"...\"; }`.");
    const DictPtr dd = parent->subDict("dosageUnit");
    const std::string dw = w + " { dosageUnit }";
    if (!isWord(dd, "name"))
        throw std::runtime_error(dw + ": `name <word>;` is not declared -- what"
            " one unit is called (tablet, capsule, vial).");
    D.name   = dd->lookupWord("name");
    D.mass   = dimensioned(dd, "mass", Dims::mass, "0.29 g", dw);
    if (!(D.mass > 0.0))
        throw std::runtime_error(dw + ": `mass` must be positive.");
    D.source = requireText(dd, "source", dw);
    D.reason = requireText(dd, "reason", dw);
    D.present = true;
    return D;
}

//  THE DOSAGE FORM (C264): the product stream's OVERALL composition by mass
//  (every phase, from the converged balance) times one unit's declared mass.
//  The counts are the plan's own lot and year divided by that mass.
BatchDosage dosageOf(const SimulationResult& result, const BatchPlanRecord& plan,
                     const std::string& product, const DosageDecl& D,
                     scalar lotSize, int lotsPerYear, scalar production,
                     scalar perYear)
{
    BatchDosage x;
    x.product  = product;
    x.unitName = D.name;
    x.unitMass = D.mass;
    x.source   = D.source;
    x.reason   = D.reason;
    x.lotSize  = lotSize;
    x.lotsPerYear  = lotsPerYear;
    x.unitsPerLot  = lotSize / D.mass;
    x.unitsPerYear = production / D.mass;
    x.demandUnitsPerYear    = perYear / D.mass;
    x.unitsPerHourOfBalance = plan.productRate / D.mass;

    const ProcessStream& s = result.streams.at(plan.product);
    const auto& names = result.componentNames;
    scalar total = 0.0, fluid = 0.0;
    std::vector<std::array<scalar, 2>> m(names.size(), { 0.0, 0.0 });  // fluid, solid [kg/s]
    for (std::size_t i = 0; i < names.size(); ++i)
    {
        auto it = result.componentMolarMass.find(names[i]);
        if (it == result.componentMolarMass.end()) continue;
        const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
        const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
        m[i] = { s.F * zi * it->second, si * it->second };
        total += m[i][0] + m[i][1];
        fluid += m[i][0];
    }
    if (!(total > 0.0)) return x;
    x.fluidMassFraction = fluid / total;
    for (std::size_t i = 0; i < names.size(); ++i)
    {
        const scalar mi = m[i][0] + m[i][1];
        if (!(mi > 0.0)) continue;
        BatchDosageIngredient g;
        g.component     = names[i];
        g.massFraction  = mi / total;
        g.perUnit       = g.massFraction * D.mass;
        g.perLot        = g.massFraction * lotSize;
        g.solidFraction = m[i][1] / mi;
        x.ingredients.push_back(g);
    }
    return x;
}

//  The console echo of the bases and the dosage form (C264): what the JSON
//  carries, in the log a student reads first.
void printBasesAndDosage(const BatchPlanRecord& plan)
{
    std::cout << "\n  BASES -- one number per line, its definition and the field it"
                 " echoes (result JSON batchPlan.bases):\n";
    for (const auto& b : plan.bases)
        std::cout << "    " << std::left << std::setw(38) << b.label << " "
                  << std::right << std::setw(14) << fmt(b.amount, 7) << " "
                  << b.unit << "\n      " << b.definition << "\n";
    for (const auto& x : plan.dosage)
    {
        std::cout << "\n  DOSAGE FORM " << x.product << ": one " << x.unitName
                  << " = " << fmt(x.unitMass * 1e6, 7) << " mg (declared; source: "
                  << x.source << ");  " << fmt(x.unitsPerLot, 7) << " " << x.unitName
                  << "s per lot of " << fmt(x.lotSize, 7) << " kg;  "
                  << fmt(x.unitsPerYear, 8) << " a year in " << x.lotsPerYear
                  << " lots;  fluid phases " << fmt(100.0 * x.fluidMassFraction, 4)
                  << " % of the mass\n"
                  << "    " << std::left << std::setw(28) << "ingredient"
                  << std::setw(14) << "mass %" << std::setw(16) << ("mg per " + x.unitName)
                  << std::setw(14) << "kg per lot" << "solid %\n";
        for (const auto& g : x.ingredients)
            std::cout << "    " << std::left << std::setw(28) << g.component
                      << std::setw(14) << fmt(100.0 * g.massFraction, 6)
                      << std::setw(16) << fmt(g.perUnit * 1e6, 6)
                      << std::setw(14) << fmt(g.perLot, 6)
                      << fmt(100.0 * g.solidFraction, 4) << "\n";
    }
}

//  THE BASES (C264): every quantity a student must reconcile, each with its
//  definition and the published field it echoes.  Built from the finished
//  plan; nothing here is computed that the plan did not already publish.
void buildBases(BatchPlanRecord& plan)
{
    auto add = [&](const std::string& key, const std::string& label, scalar amount,
                   const std::string& unit, const std::string& def,
                   const std::string& home)
    {
        plan.bases.push_back({ key, label, amount, unit, def, home });
    };
    const std::string P = plan.product;

    //  The lot: declared on one stream, counted in the product.
    auto lotLines = [&](const std::string& who, const std::string& rule,
                        const std::string& lotStream, scalar lotStreamMass,
                        scalar lotSize, const std::string& limitingStage,
                        const std::string& homeOf)
    {
        const std::string sfx = who.empty() ? "" : ":" + who;
        const std::string of  = who.empty() ? "" : " (" + who + ")";
        if (rule == "declared")
        {
            add("lot" + sfx, "declared lot" + of, lotStreamMass, "kg of " + lotStream,
                "the mass of " + lotStream + " one lot is declared on (`lot { rule"
                " declared; stream " + lotStream + "; mass ...; }`): the size QC"
                " releases, a declaration of the case",
                homeOf + ".lotStreamMass");
            add("lotProduct" + sfx, "the lot's product mass" + of, lotSize, "kg of " + P,
                "B = M_lot x r_P / r_" + lotStream + ": the same lot counted in the"
                " product " + P + ".  It differs from the declared lot by what the"
                " steps between " + lotStream + " and " + P + " add or remove"
                " (r_P / r_" + lotStream + " = " + fmt(lotSize / lotStreamMass, 6)
                + " on the flowsheet's balance)",
                homeOf + ".lotSize");
        }
        else
            add("lotProduct" + sfx, "the lot's product mass" + of, lotSize, "kg of " + P,
                "B = min_j N_ip Vmax_j / S_j: the largest lot the declared equipment"
                " holds, set by stage '" + limitingStage + "'",
                homeOf + ".lotSize");
    };
    if (plan.multiProduct())
        for (const auto& pr : plan.products)
            lotLines(pr.name, pr.lotRule, pr.lotStream, pr.lotStreamMass, pr.lotSize,
                     pr.lotLimitingStage, "product:" + pr.name);
    else
        lotLines("", plan.lotRule, plan.lotStream, plan.lotStreamMass, plan.lotSize,
                 plan.lotLimitingStage, "batchPlan");

    add("balanceRate", "the balance basis", plan.productRate, "kg/h of " + P,
        "r_P, the flowsheet's rate of " + P + ": the steady balance is the material"
        " balance PER UNIT OF PRODUCT, and its absolute size is a basis the case"
        " chose, not the plant's capacity (except at a rated unit, whose hardware"
        " the flowsheet models)",
        "batchPlan.productRate");
    for (const auto& x : plan.dosage)
        add("balanceUnits:" + x.product, "the balance basis in " + x.unitName + "s ("
            + x.product + ")", x.unitsPerHourOfBalance, x.unitName + "s/h",
            "r_P / m_unit: the flowsheet's rate counted in " + x.unitName + "s of "
            + x.product + " (one " + x.unitName + " = " + fmt(x.unitMass * 1e6, 6)
            + " mg, declared)",
            "dosage:" + x.product + ".unitsPerHourOfBalance");
    if (plan.multiProduct())
        for (const auto& pr : plan.products)
            add("perYear:" + pr.name, "demand (" + pr.name + ")", pr.perYear, "kg/yr",
                "Q_i, the product's declared demand; the plan makes N_i B_i = "
                + fmt(pr.production, 8) + " kg in " + std::to_string(pr.lotsPerYear)
                + " whole lots", "product:" + pr.name + ".perYear");
    else
        add("perYear", "demand", plan.productPerYear, "kg/yr",
            "Q, the declared production; the plan makes N B = "
            + fmt(plan.production, 8) + " kg in " + std::to_string(plan.lotsPerYear)
            + " whole lots", "batchPlan.productPerYear");
    add("equivalentHours", "equivalent flowsheet hours", plan.equivalentHours, "h/yr",
        "H_eq = Q / r_P (summed over products): the hours the balance's hourly"
        " flows must be multiplied by to make the year's demand -- NOT the hours"
        " any machine runs (those are each train's year, below)",
        "batchPlan.equivalentHours");
    for (const auto& t : plan.trains)
    {
        add("requiredTime:" + t.name, "train " + t.name + ": its year",
            t.requiredTime, "h/yr",
            "every campaign's span plus every changeover of the year on train '"
            + t.name + "' (" + std::to_string(t.campaigns) + " campaigns): the hours"
            " the train is occupied, " + fmt(100.0 * t.occupancy, 3) + " % of its"
            " available time",
            "train:" + t.name + ".requiredTime");
        add("availableTime:" + t.name, "train " + t.name + ": hours available",
            t.availableTime, "h/yr",
            "declared (`availableTime`): the hours a year the train may run --"
            " shifts and weeks, a declaration of the case, not a result",
            "train:" + t.name + ".availableTime");
    }
}

} // anonymous namespace

BatchPlanPass::BatchPlanPass(const DictPtr& planDict)
:   planDict_(planDict)
{}

int BatchPlanPass::run(SimulationResult& result)
{
    const DictPtr& d = planDict_;
    const std::string top = "batchPlan";
    BatchPlanRecord plan;

    //  ---- the flowsheet's own masses: one reader --------------------------
    auto rateOf = [&](const std::string& stream, const std::string& where) -> scalar
    {
        auto it = result.streams.find(stream);
        if (it == result.streams.end())
            throw std::runtime_error(where + ": stream '" + stream + "' is not a"
                " stream of this flowsheet.  A batch plan reads its masses from"
                " the converged balance and types none.");
        return overallMassFlow(result, it->second) * 3600.0;   // kg/h
    };

    //  ---- the product and the year ------------------------------------
    if (!isWord(d, "product"))
        throw std::runtime_error(top + ": `product <stream>;` is not declared --"
            " the flowsheet stream that IS the plant's product; every size"
            " factor is per kg of it.");
    plan.product     = d->lookupWord("product");
    plan.productRate = rateOf(plan.product, top + " { product }");
    if (!(plan.productRate > 0.0))
        throw std::runtime_error(top + ": the product stream '" + plan.product
            + "' carries no mass in the converged run.");

    //  MULTIPRODUCT (C110 G2): `products ( ... )` declares several products
    //  and each its own year; `production {}` beside it would be a second
    //  home for the same demand, and is refused.
    const bool multi = d->found("products");
    if (multi)
    {
        if (d->found("production"))
            throw std::runtime_error(top + ": `production {}` is declared beside"
                " `products ( ... )` -- two homes for the year's demand.  In a"
                " multiproduct plan each product declares its own `perYear`;"
                " delete `production`.");
    }
    else
    {
        if (!d->found("production")
            || !std::holds_alternative<DictPtr>(d->entryValue("production")))
            throw std::runtime_error(top + ": `production { perYear <mass>;"
                " source \"...\"; reason \"...\"; }` is not declared -- the"
                " product the plant must make in a year (the market's demand).");
        {
            const DictPtr pd = d->subDict("production");
            const std::string w = top + " { production }";
            plan.productPerYear   = dimensioned(pd, "perYear", Dims::mass, "30000 kg", w);
            if (!(plan.productPerYear > 0.0))
                throw std::runtime_error(w + ": `perYear` must be positive.");
            plan.productionSource = requireText(pd, "source", w);
            plan.productionReason = requireText(pd, "reason", w);
        }
    }

    //  ---- the low-utilisation threshold (optional, a stated default) -----
    if (d->found("lowUtilisation"))
    {
        plan.lowUtilisation = d->lookupScalar("lowUtilisation");
        plan.lowUtilisationDeclared = true;
        if (!(plan.lowUtilisation > 0.0 && plan.lowUtilisation < 1.0))
            throw std::runtime_error(top + ": `lowUtilisation "
                + fmt(plan.lowUtilisation) + ";` is a fraction between 0 and 1.");
    }
    else
    {
        plan.lowUtilisation = lowUtilisationDefault;
        const std::string msg = "`lowUtilisation` is not declared in batchPlan:"
            " the stated default " + fmt(lowUtilisationDefault) + " decides which"
            " stages and trains are announced as under-used (declare it to own"
            " the threshold).";
        if (AdvisoryLog::instance().addAnnouncedOnce("batchPlan:lowUtilisation",
                "batchPlan", "info", "batchPlan.lowUtilisation", msg))
            std::cerr << "[batchPlan] " << msg << "\n";
    }

    //  ---- the trains ----------------------------------------------------
    if (!d->found("trains") || !d->hasDictList("trains"))
        throw std::runtime_error(top + ": `trains ( { train <name>;"
            " availableTime <h>; lotsPerCampaign <n>; changeover <h>; source;"
            " reason; } );` is not declared -- a train is the stages that run"
            " lot by lot together, between two intermediate stores.");
    std::map<std::string, std::size_t> trainIndex;
    for (const auto& td : d->lookupDictList("trains"))
    {
        if (!isWord(td, "train"))
            throw std::runtime_error(top + " { trains }: an entry with no"
                " `train <name>;`.");
        BatchTrain t;
        t.name = td->lookupWord("train");
        const std::string w = top + " { trains ( '" + t.name + "' ) }";
        if (trainIndex.count(t.name))
            throw std::runtime_error(w + ": a second train of the same name.");
        t.availableTime = hoursOf(td, "availableTime", w);
        if (!(t.availableTime > 0.0) || t.availableTime > 8760.0 + 1e-9)
            throw std::runtime_error(w + ": `availableTime` is the hours a year"
                " the train may run -- more than 0 and at most 8760.");
        if (!td->found("lotsPerCampaign"))
            throw std::runtime_error(w + ": `lotsPerCampaign` is not declared --"
                " how many lots run between two full changeovers (1 if every"
                " lot is followed by one).");
        t.lotsPerCampaign = countOf(td, "lotsPerCampaign", 1, w);
        t.changeover      = hoursOf(td, "changeover", w);
        t.source          = requireText(td, "source", w);
        t.reason          = requireText(td, "reason", w);
        trainIndex[t.name] = plan.trains.size();
        plan.trains.push_back(t);
    }
    if (plan.trains.empty())
        throw std::runtime_error(top + ": `trains` lists no train.");

    //  ---- the lot rule (read now, applied once the size factors exist) ---
    //  Required for one product; for several it is the DEFAULT lot of every
    //  product that declares none (and refused if every product does).
    LotDecl planLot;
    if (!multi || d->found("lot"))
    {
        if (!d->found("lot") || !std::holds_alternative<DictPtr>(d->entryValue("lot")))
            throw std::runtime_error(top + ": `lot { rule declared | largestEquipment;"
                " ... }` is not declared -- what fixes the batch size.");
        planLot = parseLot(d->subDict("lot"), top + " { lot }", rateOf);
    }
    scalar lotStreamRate = 0.0;
    if (!multi)
    {
        plan.lotRule       = planLot.rule;
        plan.lotSource     = planLot.source;
        plan.lotReason     = planLot.reason;
        plan.lotStream     = planLot.stream;
        plan.lotStreamMass = planLot.mass;
        lotStreamRate      = planLot.streamRate;
    }
    const std::string lw = top + " { lot }";

    //  ---- the dosage unit of ONE product (C264); a multiproduct plan
    //  declares it per product, because two strengths weigh differently.
    DosageDecl planDosage;
    std::map<std::string, DosageDecl> productDosage;   // multiproduct, by product
    if (multi && d->found("dosageUnit"))
        throw std::runtime_error(top + ": `dosageUnit {}` is declared at the plan"
            " level of a multiproduct plan -- each product's unit weighs its own;"
            " declare it inside each product's block.");
    if (!multi) planDosage = parseDosage(d, top);

    //  ---- the products (multiproduct only) -------------------------------
    std::vector<ProductDecl> prods;
    if (multi)
    {
        if (!d->hasDictList("products"))
            throw std::runtime_error(top + ": `products` must be a list of"
                " blocks -- `products ( { product <name>; perYear <mass>;"
                " source \"...\"; reason \"...\"; } ... );`.");
        bool anyOwnLot = false, allOwnLot = true;
        for (const auto& pd : d->lookupDictList("products"))
        {
            if (!isWord(pd, "product"))
                throw std::runtime_error(top + " { products }: an entry with no"
                    " `product <name>;`.");
            ProductDecl P;
            P.rec.name = pd->lookupWord("product");
            const std::string w = top + " { products ( '" + P.rec.name + "' ) }";
            for (const auto& q : prods)
                if (q.rec.name == P.rec.name)
                    throw std::runtime_error(w + ": a second product of the same name.");
            P.rec.perYear = dimensioned(pd, "perYear", Dims::mass, "20000 kg", w);
            if (!(P.rec.perYear > 0.0))
                throw std::runtime_error(w + ": `perYear` must be positive.");
            P.rec.source = requireText(pd, "source", w);
            P.rec.reason = requireText(pd, "reason", w);
            productDosage[P.rec.name] = parseDosage(pd, w);
            if (pd->found("lot"))
            {
                if (!std::holds_alternative<DictPtr>(pd->entryValue("lot")))
                    throw std::runtime_error(w + ": `lot` must be a block, as the"
                        " plan's is.");
                P.lot = parseLot(pd->subDict("lot"), w + " { lot }", rateOf);
                P.rec.lotFrom = "product";
                anyOwnLot = true;
            }
            else
            {
                allOwnLot = false;
                if (!planLot.present)
                    throw std::runtime_error(w + ": the product declares no `lot {}`"
                        " and the plan declares none for it to take -- declare one"
                        " here or a default `lot {}` in batchPlan.");
                P.lot = planLot;
                P.rec.lotFrom = "plan";
            }
            if (pd->found("massPerProduct"))
            {
                if (!std::holds_alternative<DictPtr>(pd->entryValue("massPerProduct")))
                    throw std::runtime_error(w + ": `massPerProduct` must be a block"
                        " -- `massPerProduct { <stream> <kg per kg of product>; }`.");
                const DictPtr mp = pd->subDict("massPerProduct");
                const std::string mw = w + " { massPerProduct }";
                for (const auto& s : mp->keys())
                {
                    if (!result.streams.count(s))
                        throw std::runtime_error(mw + ": stream '" + s + "' is not a"
                            " stream of this flowsheet.");
                    if (s == plan.product)
                        throw std::runtime_error(mw + ": '" + s + "' is the product"
                            " stream itself, 1 kg per kg by definition -- it cannot"
                            " be declared.");
                    if (!std::holds_alternative<scalar>(mp->entryValue(s)))
                        throw std::runtime_error(mw + ": `" + s + "` must be a"
                            " number, the kg of the stream per kg of this product.");
                    if (mp->hasDimensions(s) && !mp->dimensionsOf(s).isDimensionless())
                        throw std::runtime_error(mw + ": `" + s + "` is a mass"
                            " RATIO (kg per kg of product); it carries "
                            + mp->dimensionsOf(s).toPretty() + ".");
                    const scalar v = mp->lookupScalar(s);
                    if (!std::isfinite(v) || !(v > 0.0))
                        throw std::runtime_error(mw + ": `" + s + "` must be a"
                            " positive number.");
                    P.mpp[s] = v;
                }
                if (P.mpp.empty())
                    throw std::runtime_error(mw + ": declares no stream.");
            }
            if (pd->found("stages"))
            {
                if (!pd->hasDictList("stages"))
                    throw std::runtime_error(w + ": `stages` must be a list of"
                        " blocks -- `stages ( { stage <name>; <what differs>;"
                        " source \"...\"; reason \"...\"; } );`.");
                for (const auto& od : pd->lookupDictList("stages"))
                {
                    if (!isWord(od, "stage"))
                        throw std::runtime_error(w + " { stages }: an entry with no"
                            " `stage <name>;`.");
                    const std::string sn = od->lookupWord("stage");
                    if (P.over.count(sn))
                        throw std::runtime_error(w + " { stages }: stage '" + sn
                            + "' is listed twice.");
                    P.over[sn] = od;
                }
            }
            prods.push_back(P);
        }
        if (prods.empty())
            throw std::runtime_error(top + ": `products` lists no product.");
        if (planLot.present && anyOwnLot && allOwnLot)
            throw std::runtime_error(top + ": the plan's `lot {}` is declared and"
                " every product declares its own -- it would be read by nothing."
                "  Delete it, or delete a product's own.");

        //  The CAMPAIGN ORDER: the student's decision, declared once.
        std::vector<std::string> names;
        for (const auto& P : prods) names.push_back(P.rec.name);
        if (d->found("campaignOrder"))
        {
            const std::vector<std::string> ord = d->lookupWordList("campaignOrder");
            std::vector<std::string> a = ord, b = names;
            std::sort(a.begin(), a.end());
            std::sort(b.begin(), b.end());
            if (a != b)
                throw std::runtime_error(top + ": `campaignOrder ( " + wordList(ord)
                    + " );` must name every product exactly once.  Products: "
                    + wordList(names) + ".");
            std::vector<ProductDecl> inOrder;
            for (const auto& n : ord)
                for (const auto& P : prods)
                    if (P.rec.name == n) inOrder.push_back(P);
            prods.swap(inOrder);
            plan.campaignOrder = ord;
        }
        else if (prods.size() >= 2)
            throw std::runtime_error(top + ": `campaignOrder ( ... );` is not"
                " declared -- with " + std::to_string(prods.size()) + " products"
                " the order of the campaigns is the plan's decision (it decides"
                " which clean follows which product), and the engine does not"
                " choose it.  Products: " + wordList(names) + ".");
        else
            plan.campaignOrder = names;
    }
    else if (d->found("campaignOrder"))
        throw std::runtime_error(top + ": `campaignOrder` is declared and the"
            " plan has one product -- it would be read by nothing.  Declare"
            " `products ( ... )`, or delete it.");
    bool needMaxVolume = (plan.lotRule == "largestEquipment");
    for (const auto& P : prods)
        needMaxVolume = needMaxVolume || (P.lot.rule == "largestEquipment");

    //  ---- the stages ----------------------------------------------------
    if (!d->found("stages") || !d->hasDictList("stages"))
        throw std::runtime_error(top + ": `stages ( ... );` is not declared --"
            " one entry per step of the recipe, in recipe order.");
    std::map<std::string, std::string> unitType;
    for (const auto& fu : result.topology) unitType[fu.name] = fu.type;

    std::map<std::string, std::size_t> stageIndex;
    std::map<std::string, std::string> unitOwner;
    std::vector<DictPtr> stageDicts = d->lookupDictList("stages");
    for (const auto& sd : stageDicts)
    {
        if (!isWord(sd, "stage"))
            throw std::runtime_error(top + " { stages }: an entry with no"
                " `stage <name>;`.");
        BatchStage s;
        s.name = sd->lookupWord("stage");
        const std::string w = top + " { stages ( '" + s.name + "' ) }";
        if (stageIndex.count(s.name))
            throw std::runtime_error(w + ": a second stage of the same name.");
        if (!isWord(sd, "train") || !trainIndex.count(sd->lookupWord("train")))
        {
            std::vector<std::string> tn;
            for (const auto& t : plan.trains) tn.push_back(t.name);
            throw std::runtime_error(w + ": `train` names no declared train."
                "  Trains: " + wordList(tn) + ".");
        }
        s.train = sd->lookupWord("train");
        if (!isWord(sd, "type"))
            throw std::runtime_error(w + ": `type` is not declared.  Accepted:"
                " batch | semicontinuous.");
        s.type = sd->lookupWord("type");
        if (s.type != "batch" && s.type != "semicontinuous")
            throw std::runtime_error(w + ": `type " + s.type + ";` is not a"
                " stage type.  Accepted: batch (it holds a lot) |"
                " semicontinuous (it processes a lot at a rate).");
        if (!sd->found("units"))
            throw std::runtime_error(w + ": `units ( ... );` is not declared --"
                " the flowsheet units this stage's equipment stands for.");
        s.units = sd->lookupWordList("units");
        if (s.units.empty())
            throw std::runtime_error(w + ": `units` lists no unit.");
        for (const auto& u : s.units)
        {
            if (!unitType.count(u))
                throw std::runtime_error(w + ": unit '" + u + "' is not a unit"
                    " of this flowsheet.");
            if (unitOwner.count(u))
                throw std::runtime_error(w + ": unit '" + u + "' is already in"
                    " stage '" + unitOwner[u] + "' -- a unit belongs to one"
                    " stage.");
            unitOwner[u] = s.name;
            if (ratingUnitTypes().count(unitType[u]))
            {
                if (!s.ratingUnit.empty())
                    throw std::runtime_error(w + ": two rated units ('"
                        + s.ratingUnit + "', '" + u + "') in one stage -- whose"
                        " rate is the stage's capacity?  Split the stage.");
                s.ratingUnit = u;
            }
        }
        if (!isWord(sd, "holds"))
            throw std::runtime_error(w + ": `holds <stream>;` is not declared --"
                " the stream whose mass this stage handles per lot (its mass"
                " flow is READ from the flowsheet).");
        s.holds    = sd->lookupWord("holds");
        s.massRate = rateOf(s.holds, w);
        if (!(s.massRate > 0.0))
            throw std::runtime_error(w + ": stream '" + s.holds + "' carries no"
                " mass in the converged run.");
        s.inPhase        = countOf(sd, "inPhase", 1, w);
        s.outOfPhase     = countOf(sd, "outOfPhase", 1, w);
        s.unitsInstalled = s.inPhase * s.outOfPhase;
        s.source = requireText(sd, "source", w);
        s.reason = requireText(sd, "reason", w);

        if (s.type == "batch")
        {
            s.sizeKind     = "volume";
            s.bulkDensity  = dimensioned(sd, "bulkDensity", Dims::density,
                                         "450 kg/m3", w);
            if (!(s.bulkDensity > 0.0))
                throw std::runtime_error(w + ": `bulkDensity` must be positive.");
            if (!sd->found("fillFraction"))
                throw std::runtime_error(w + ": `fillFraction` is not declared --"
                    " the working fraction of the vessel's volume the lot may"
                    " fill.");
            s.fillFraction = sd->lookupScalar("fillFraction");
            if (!(s.fillFraction > 0.0 && s.fillFraction <= 1.0))
                throw std::runtime_error(w + ": `fillFraction " + fmt(s.fillFraction)
                    + ";` must lie in (0, 1].");
            if (needMaxVolume)
            {
                s.maxVolume = dimensioned(sd, "maxVolume", Dims::volume, "2 m3", w);
                if (!(s.maxVolume > 0.0))
                    throw std::runtime_error(w + ": `maxVolume` must be positive.");
            }
            else if (sd->found("maxVolume"))
                throw std::runtime_error(w + (multi
                    ? std::string(": `maxVolume` is declared and no product's lot"
                        " follows `rule largestEquipment;` -- only that rule reads"
                        " it, so here it would be read by nothing.  Delete it.")
                    : std::string(": `maxVolume` is declared under"
                        " `lot { rule declared; }` -- only `rule largestEquipment`"
                        " reads it, so here it would be read by nothing.  Delete it.")));
            if (!sd->found("processTime"))
                throw std::runtime_error(w + ": a batch stage declares"
                    " `processTime` (the time the lot is processed in it).");
            if (sd->found("operatingTime"))
                throw std::runtime_error(w + ": `operatingTime` is the time of a"
                    " SEMICONTINUOUS stage; a batch stage declares"
                    " `processTime`.");
            s.processTime = hoursOf(sd, "processTime", w);
        }
        else
        {
            s.sizeKind = "massRate";
            for (const char* k : { "bulkDensity", "fillFraction", "maxVolume", "processTime" })
                if (sd->found(k))
                    throw std::runtime_error(w + ": `" + k + "` is declared on a"
                        " SEMICONTINUOUS stage, which is sized by its rate --"
                        " the number would be read by nothing.  A semicontinuous"
                        " stage declares `operatingTime`.");
            if (!sd->found("operatingTime"))
                throw std::runtime_error(w + ": a semicontinuous stage declares"
                    " `operatingTime <h>;` (the time it runs per lot) or"
                    " `operatingTime fromFlowsheet;` (its rated unit's own"
                    " rate).");
            if (isWord(sd, "operatingTime"))
            {
                const std::string ow = sd->lookupWord("operatingTime");
                if (ow != "fromFlowsheet")
                    throw std::runtime_error(w + ": `operatingTime " + ow + ";` --"
                        " a time with its unit, or the word fromFlowsheet.");
                if (s.ratingUnit.empty())
                    throw std::runtime_error(w + ": `operatingTime fromFlowsheet;`"
                        " on a stage with no RATED unit (" + wordList(s.units)
                        + ") -- only a unit whose hardware the flowsheet models ("
                        + "a spray dryer) has a rate of its own; a placeholder's"
                        " flowsheet rate is a basis, not a capacity.  Declare the"
                        " time.");
                s.operatingFrom = "flowsheet";
            }
            else
            {
                s.operatingFrom = "declared";
                s.processTime   = hoursOf(sd, "operatingTime", w);
                if (!(s.processTime > 0.0))
                    throw std::runtime_error(w + ": `operatingTime` must be"
                        " positive.");
            }
            if (!s.ratingUnit.empty()) s.capacityRate = s.massRate;
        }
        s.chargeTime = hoursOf(sd, "chargeTime", w);
        s.cleanTime  = hoursOf(sd, "cleanTime", w);
        //  The clean between campaigns of DIFFERENT products (multiproduct).
        if (prods.size() >= 2)
        {
            if (!sd->found("productChangeover"))
                throw std::runtime_error(w + ": `productChangeover <time>;` is not"
                    " declared -- in a plan of " + std::to_string(prods.size())
                    + " products every stage declares its clean between campaigns"
                    " of different products (`0 h` where none is needed, e.g. a"
                    " train making an intermediate every product shares).");
            s.productChangeover = hoursOf(sd, "productChangeover", w);
        }
        else if (sd->found("productChangeover"))
            throw std::runtime_error(w + ": `productChangeover` is declared and the"
                " plan makes one product -- only a change of product reads it, so"
                " here it would be read by nothing.  Delete it (the clean between"
                " lots is `cleanTime`, between campaigns the train's"
                " `changeover`).");
        if (isWord(sd, "dischargeTime"))
        {
            const std::string dw = sd->lookupWord("dischargeTime");
            if (dw != "throughFedStage")
                throw std::runtime_error(w + ": `dischargeTime " + dw + ";` -- a"
                    " time with its unit, or the word throughFedStage.");
            s.dischargeFrom = "fedStage";
        }
        else
        {
            s.dischargeFrom = "declared";
            s.dischargeTime = hoursOf(sd, "dischargeTime", w);
        }
        stageIndex[s.name] = plan.stages.size();
        plan.trains[trainIndex[s.train]].stages.push_back(s.name);
        plan.stages.push_back(s);
    }
    if (plan.stages.empty())
        throw std::runtime_error(top + ": `stages` lists no stage.");
    for (const auto& t : plan.trains)
        if (t.stages.empty())
            throw std::runtime_error(top + ": train '" + t.name + "' has no"
                " stage -- delete it or give it one.");

    //  ---- what each stage feeds: declared, or the next of its train ------
    for (std::size_t i = 0; i < plan.stages.size(); ++i)
    {
        BatchStage& s = plan.stages[i];
        const DictPtr& sd = stageDicts[i];
        const std::string w = top + " { stages ( '" + s.name + "' ) }";
        const auto& order = plan.trains[trainIndex[s.train]].stages;
        const std::size_t pos =
            std::find(order.begin(), order.end(), s.name) - order.begin();
        if (sd->found("feeds"))
        {
            const std::string f = sd->lookupWord("feeds");
            if (f != "none")
            {
                if (!stageIndex.count(f) || plan.stages[stageIndex[f]].train != s.train)
                    throw std::runtime_error(w + ": `feeds " + f + ";` names no"
                        " stage of train '" + s.train + "'.  Its stages: "
                        + wordList(order) + " (or `feeds none;`).");
                const std::size_t fpos =
                    std::find(order.begin(), order.end(), f) - order.begin();
                if (fpos <= pos)
                    throw std::runtime_error(w + ": `feeds " + f + ";` names a"
                        " stage listed BEFORE it -- list the stages in recipe"
                        " order, so a stage feeds a later one.");
                s.feeds = f;
            }
        }
        else if (pos + 1 < order.size())
            s.feeds = order[pos + 1];
        if (s.dischargeFrom == "fedStage" && s.feeds.empty())
            throw std::runtime_error(w + ": `dischargeTime throughFedStage;` on a"
                " stage that feeds no stage -- declare the time.");
    }

    //  The cleaning is counted for ONE product (the plan as it stood) or for
    //  SEVERAL (C249 d): one lambda, called by both paths.
    auto runCleaning = [&]()
    {
        //  ---- the cleaning of the machines (DEV.md 4c C210, E3) -------------
        //  `cleaning ( { unit; waterPerLotClean; waterPerChangeover;
        //  effluentFraction; source; reason; } ... )`: the CASE declares the
        //  purified water of one clean of one instance of a machine and the
        //  fraction of it that leaves as effluent; the PLAN counts the cleans --
        //  a clean after every lot of every instance the lot is split over
        //  (N_ip), and a clean of every installed instance (N_ip N_op) at each
        //  campaign changeover.  Absent: nothing here runs and nothing moves.
        if (d->found("cleaning"))
        {
            if (!d->hasDictList("cleaning"))
                throw std::runtime_error(top + ": `cleaning ( { unit <machine>;"
                    " waterPerLotClean <vol>; waterPerChangeover <vol>;"
                    " effluentFraction <0..1>; source \"...\"; reason \"...\"; }"
                    " ... );` must be a list of entries.");
            std::set<std::string> seenUnits;
            scalar totalCleans = 0, totalWater = 0, totalEffluent = 0;
            for (const auto& cd : d->lookupDictList("cleaning"))
            {
                BatchCleaning c;
                if (!isWord(cd, "unit"))
                    throw std::runtime_error(top + " { cleaning }: an entry has no"
                        " `unit <machine>;`.");
                c.unit = cd->lookupWord("unit");
                const std::string w = top + " { cleaning } unit `" + c.unit + "`";
                if (!seenUnits.insert(c.unit).second)
                    throw std::runtime_error(w + ": declared twice -- one machine,"
                        " one cleaning entry.");
                const BatchStage* st = plan.stageOfUnit(c.unit);
                if (!st)
                    throw std::runtime_error(w + ": the unit is in no stage of the"
                        " plan, so the plan cannot count its cleans.  Units in a"
                        " stage: add it to a stage's `units`.");
                c.stage = st->name;
                c.train = st->train;
                const BatchTrain& t = plan.trains[trainIndex[st->train]];
                c.waterPerLotClean   = dimensioned(cd, "waterPerLotClean", Dims::volume, "0.4 m3", w);
                c.waterPerChangeover = dimensioned(cd, "waterPerChangeover", Dims::volume, "1.2 m3", w);
                if (!cd->found("effluentFraction"))
                    throw std::runtime_error(w + ": `effluentFraction` is not declared"
                        " (the share of the cleaning water that leaves as effluent,"
                        " between 0 and 1).  Nothing is defaulted.");
                c.effluentFraction = cd->lookupScalar("effluentFraction");
                if (!std::isfinite(c.effluentFraction) || c.effluentFraction < 0.0
                    || c.effluentFraction > 1.0)
                    throw std::runtime_error(w + ": `effluentFraction "
                        + fmt(c.effluentFraction) + ";` is a fraction between 0 and 1.");
                c.source = requireText(cd, "source", w);
                c.reason = requireText(cd, "reason", w);
                if (!plan.multiProduct())
                {
                    if (c.waterPerLotClean > 0.0 && !(st->cleanTime > 0.0))
                        throw std::runtime_error(w + ": it declares water for a clean after"
                            " every lot, and its stage '" + st->name + "' has `cleanTime 0"
                            " h` -- the clean has no time in the plan to draw it in.");
                    if (c.waterPerChangeover > 0.0 && !(t.changeover > 0.0))
                        throw std::runtime_error(w + ": it declares water for a clean at"
                            " each changeover, and train '" + t.name + "' has `changeover"
                            " 0 h`.");
                }
                else
                {
                    //  Several products: the same refusals, per product, naming it.
                    for (const auto& pr : plan.products)
                    {
                        const BatchProductStage* ps = nullptr;
                        const BatchProductTrain* pt = nullptr;
                        for (const auto& x : plan.productStages)
                            if (x.product == pr.name && x.stage == st->name) ps = &x;
                        for (const auto& x : plan.productTrains)
                            if (x.product == pr.name && x.train == t.name) pt = &x;
                        if (c.waterPerLotClean > 0.0 && !(ps->cleanTime > 0.0))
                            throw std::runtime_error(w + ": it declares water for a clean"
                                " after every lot, and product '" + pr.name + "' has"
                                " `cleanTime 0 h` at its stage '" + st->name + "' -- the"
                                " clean has no time in the plan to draw it in.");
                        const bool sameChg = (plan.products.size() < 2)
                            || (pt->campaigns > 1);
                        if (c.waterPerChangeover > 0.0 && sameChg && !(t.changeover > 0.0))
                            throw std::runtime_error(w + ": it declares water for a clean"
                                " at each changeover, and train '" + t.name + "' has"
                                " `changeover 0 h` (product '" + pr.name + "' runs "
                                + std::to_string(pt->campaigns) + " campaigns).");
                        if (c.waterPerChangeover > 0.0 && plan.products.size() >= 2
                            && !(pt->productChangeover > 0.0))
                            throw std::runtime_error(w + ": it declares water for a clean"
                                " at each product changeover, and the clean after product '"
                                + pr.name + "' on train '" + t.name + "' is 0 h.");
                    }
                }
                c.instancesPerLot = st->inPhase;
                c.instances       = st->unitsInstalled;
                if (plan.multiProduct())
                {
                    //  SEVERAL PRODUCTS.  Per product i: a clean after each of its
                    //  N_i lots on each of the N_ip instances; a clean of every
                    //  installed instance at each of its (c_i - 1) campaign
                    //  changeovers, and at the ONE product changeover after its
                    //  last campaign (a lone product: a changeover after every
                    //  campaign, c_i of them, as the single-product plan counts).
                    const bool several = plan.products.size() >= 2;
                    for (const auto& pr : plan.products)
                    {
                        const BatchProductTrain* pt = nullptr;
                        for (const auto& x : plan.productTrains)
                            if (x.product == pr.name && x.train == t.name) pt = &x;
                        BatchCleaningProduct q;
                        q.product = pr.name;
                        q.lotCleans = double(pr.lotsPerYear) * c.instancesPerLot;
                        q.campaignChangeoverCleans =
                            double(pt->campaigns - 1 + (several ? 0 : 1)) * c.instances;
                        q.productChangeoverCleans = several ? double(c.instances) : 0.0;
                        q.cleans = q.lotCleans + q.campaignChangeoverCleans
                                 + q.productChangeoverCleans;
                        q.water  = q.lotCleans * c.waterPerLotClean
                                 + (q.campaignChangeoverCleans + q.productChangeoverCleans)
                                   * c.waterPerChangeover;
                        q.effluent = c.effluentFraction * q.water;
                        c.lotCleansPerYear        += q.lotCleans;
                        c.changeoverCleansPerYear += q.campaignChangeoverCleans
                                                   + q.productChangeoverCleans;
                        c.waterPerYear            += q.water;
                        c.perProduct.push_back(q);
                    }
                    c.cleansPerYear   = c.lotCleansPerYear + c.changeoverCleansPerYear;
                    c.effluentPerYear = c.effluentFraction * c.waterPerYear;
                    totalCleans   += c.cleansPerYear;
                    totalWater    += c.waterPerYear;
                    totalEffluent += c.effluentPerYear;
                    plan.cleaning.push_back(c);
                    continue;
                }
                c.lotsPerCampaign = std::min(t.lotsPerCampaign, plan.lotsPerYear);

                c.lotCleansPerCampaign        = double(c.lotsPerCampaign) * c.instancesPerLot;
                c.changeoverCleansPerCampaign = double(c.instances);
                c.cleansPerCampaign = c.lotCleansPerCampaign + c.changeoverCleansPerCampaign;
                c.waterPerCampaign  = c.lotCleansPerCampaign * c.waterPerLotClean
                                    + c.changeoverCleansPerCampaign * c.waterPerChangeover;
                c.effluentPerCampaign = c.effluentFraction * c.waterPerCampaign;

                c.lotCleansPerYear        = double(plan.lotsPerYear) * c.instancesPerLot;
                c.changeoverCleansPerYear = double(t.campaigns) * c.instances;
                c.cleansPerYear = c.lotCleansPerYear + c.changeoverCleansPerYear;
                c.waterPerYear  = c.lotCleansPerYear * c.waterPerLotClean
                                + c.changeoverCleansPerYear * c.waterPerChangeover;
                c.effluentPerYear = c.effluentFraction * c.waterPerYear;

                totalCleans   += c.cleansPerYear;
                totalWater    += c.waterPerYear;
                totalEffluent += c.effluentPerYear;
                plan.cleaning.push_back(c);
            }

            std::cout << "\n=== BATCH PLAN: cleaning of the machines (purified water and effluent)"
                         " ====================\n"
                      << "  " << std::left << std::setw(22) << "machine" << std::setw(10) << "cleans/"
                      << std::setw(10) << "cleans/" << std::setw(11) << "water/camp" << std::setw(12)
                      << "effl/camp" << std::setw(11) << "water/yr" << std::setw(11) << "effl/yr"
                      << "\n  " << std::setw(22) << "" << std::setw(10) << "campaign"
                      << std::setw(10) << "year" << std::setw(11) << "m3" << std::setw(12) << "m3"
                      << std::setw(11) << "m3" << std::setw(11) << "m3" << "\n  "
                      << std::string(85, '-') << "\n";
            for (const auto& c : plan.cleaning)
                std::cout << "  " << std::left << std::setw(22) << c.unit
                          << std::setw(10) << (plan.multiProduct() ? std::string("-") : fmt(c.cleansPerCampaign, 5))
                          << std::setw(10) << fmt(c.cleansPerYear, 6)
                          << std::setw(11) << (plan.multiProduct() ? std::string("-") : fmt(c.waterPerCampaign, 5))
                          << std::setw(12) << (plan.multiProduct() ? std::string("-") : fmt(c.effluentPerCampaign, 5))
                          << std::setw(11) << fmt(c.waterPerYear, 6)
                          << std::setw(11) << fmt(c.effluentPerYear, 6) << "\n";
            if (plan.multiProduct())
            {
                std::cout << "  per product (lot cleans + campaign changeovers + the product"
                             " changeover):\n";
                for (const auto& c : plan.cleaning)
                    for (const auto& q : c.perProduct)
                        std::cout << "    " << std::left << std::setw(22) << c.unit
                                  << std::setw(14) << q.product << std::setw(10)
                                  << fmt(q.cleans, 6) << " cleans " << std::setw(11)
                                  << fmt(q.water, 6) << " m3 " << fmt(q.effluent, 6)
                                  << " m3 effluent\n";
            }
            std::cout << "  TOTAL: " << fmt(totalCleans, 7) << " cleans a year, "
                      << fmt(totalWater, 7) << " m3 of purified water, "
                      << fmt(totalEffluent, 7) << " m3 of effluent.  A clean after every"
                         " lot of each instance the lot is split over (N_ip) and of every"
                         " installed instance at each campaign changeover; the water per"
                         " clean and the effluent fraction are the CASE's.  The purified-"
                         "water demand of `cleanUtilities` reads these (one home).\n";
            if (plan.multiProduct())
            {
                const std::string msg = "cleaning counted over "
                    + std::to_string(plan.products.size()) + " products (a clean after"
                    " every lot of each, at each of its campaign changeovers and at"
                    " each product changeover)";
                if (AdvisoryLog::instance().addAnnouncedOnce("batchPlan:cleaningProducts",
                        "batchPlan", "info", "batchPlan.cleaning", msg))
                    std::cerr << "[batchPlan] " << msg << "\n";
            }

            //  The published KPIs: per machine, per train's full campaign, total.
            auto& k = result.kpis["cleaning"];
            std::map<std::string, std::array<scalar, 4>> perTrain;   // cleans, water, effluent, campaigns
            std::map<std::string, std::array<scalar, 3>> perProd;   // cleans, water, effluent
            for (const auto& c : plan.cleaning)
            {
                k[c.unit + "_cleans_year"]        = c.cleansPerYear;
                k[c.unit + "_water_m3_year"]      = c.waterPerYear;
                k[c.unit + "_effluent_m3_year"]   = c.effluentPerYear;
                for (const auto& q : c.perProduct)
                {
                    k[c.unit + "_" + q.product + "_cleans_year"]      = q.cleans;
                    k[c.unit + "_" + q.product + "_water_m3_year"]    = q.water;
                    k[c.unit + "_" + q.product + "_effluent_m3_year"] = q.effluent;
                    auto& b = perProd[q.product];
                    b[0] += q.cleans;  b[1] += q.water;  b[2] += q.effluent;
                }
                if (plan.multiProduct()) continue;
                auto& a = perTrain[c.train];
                a[0] += c.cleansPerCampaign;
                a[1] += c.waterPerCampaign;
                a[2] += c.effluentPerCampaign;
            }
            for (const auto& [pn, b] : perProd)
            {
                k["product_" + pn + "_cleans_year"]      = b[0];
                k["product_" + pn + "_water_m3_year"]    = b[1];
                k["product_" + pn + "_effluent_m3_year"] = b[2];
            }
            for (const auto& [tn, a] : perTrain)
            {
                k["train_" + tn + "_cleans_campaign"]      = a[0];
                k["train_" + tn + "_water_m3_campaign"]    = a[1];
                k["train_" + tn + "_effluent_m3_campaign"] = a[2];
            }
            k["cleans_year"]      = totalCleans;
            k["water_m3_year"]    = totalWater;
            k["effluent_m3_year"] = totalEffluent;

            const std::string msg = "the effluent of cleaning is published as a VOLUME"
                " (m3 a year, the declared fraction of the cleaning water); its LOAD"
                " (API, solvent, COD), the CIP chemicals and the rinse water are not"
                " computed";
            if (AdvisoryLog::instance().addAnnouncedOnce("batchPlan:cleaningEffluent",
                    "batchPlan", "info", "batchPlan.cleaning", msg))
                std::cerr << "[batchPlan] " << msg << "\n";
        }
    };

    //  ==== MULTIPRODUCT: its own design, findings, console and reports ====
    if (multi)
    {
        designMultiProduct(plan, top, prods, stageIndex, trainIndex);
        const std::size_t NP = plan.products.size(), NS = plan.stages.size();

        //  A defendable but poor plan is ANNOUNCED.
        for (std::size_t k = 0; k < NS; ++k)
        {
            const BatchStage& s = plan.stages[k];
            if (!s.limiting && s.maxUtilisation < plan.lowUtilisation)
                announce(plan, "lowUtilisation", s.name, s.maxUtilisation,
                    plan.lowUtilisation,
                    "stage '" + s.name + "' limits no product's cycle and is busy"
                    " at most " + fmt(100.0 * s.maxUtilisation, 3) + " % of one"
                    " (below " + fmt(100.0 * plan.lowUtilisation, 3) + " %): it"
                    " waits most of every lot of every product -- oversized for"
                    " this plan, or a step that could be shared.");
            for (std::size_t i = 0; i < NP; ++i)
            {
                const BatchProductStage& x = plan.productStages[i * NS + k];
                if (x.operatingFrom != "declared" || !(s.capacityRate > 0.0)) continue;
                const scalar r = x.ratePerUnit / s.capacityRate;
                if (std::fabs(r - 1.0) > capacityBand)
                    announce(plan, "capacityMismatch", x.product + ":" + s.name,
                        x.ratePerUnit, s.capacityRate,
                        "product '" + x.product + "' runs stage '" + s.name + "' "
                        + fmt(x.processTime) + " h per lot, which asks its rated"
                        " unit '" + s.ratingUnit + "' for " + fmt(x.ratePerUnit)
                        + " kg/h of " + s.holds + "; as modelled it delivers "
                        + fmt(s.capacityRate) + " kg/h (" + fmt(100.0 * (r - 1.0), 3)
                        + " %) -- the plan and the machine disagree.");
            }
        }
        for (const auto& t : plan.trains)
            if (t.occupancy < plan.lowUtilisation)
                announce(plan, "idleTrain", t.name, t.occupancy, plan.lowUtilisation,
                    "train '" + t.name + "' runs " + fmt(t.requiredTime) + " h of"
                    " its " + fmt(t.availableTime) + " h a year ("
                    + fmt(100.0 * t.occupancy, 3) + " %) for all "
                    + std::to_string(NP) + " products: the line is idle most of"
                    " the year -- larger lots on smaller equipment, more products,"
                    " or fewer available hours.");
        for (const auto& pr : plan.products)
            if (!pr.ownBalance.empty())
                announce(plan, "ownBalance", pr.name,
                    static_cast<scalar>(pr.ownBalance.size()), 0.0,
                    "product '" + pr.name + "' declares its own kg per kg of"
                    " product on " + wordList(pr.ownBalance) + ": its sizes and"
                    " times use them, but the flowsheet is ONE balance -- the"
                    " basis product's -- and the economics (`streamFactor"
                    " fromBatchPlan;`) prices every product's raw materials and"
                    " utilities on it.");

        //  A PRODUCT CLEAN SHORTER THAN THE CAMPAIGN CHANGEOVER (2026-11-13,
        //  DEV.md 4c C389 (4), PH-03).  A change of product is the train's
        //  full clean and line clearance AND the product's own part, so a
        //  declared product clean below the train's `changeover` makes
        //  changing product cost less time than continuing one.  Compared
        //  PER DECLARATION, never on the train's C_i = max_j c_ij: each c_ij
        //  is that stage's own busy time after the product's last campaign,
        //  and a max would hide a short stage behind a long one.  Every
        //  declaration is read, a `changeoverTo` the order does not use
        //  included (the student may reorder).  Equal is silent; nothing
        //  is refused and no number moves.
        auto cleanShort = [&](const BatchStage& s, scalar c, const std::string& subject,
                              const std::string& what)
        {
            const scalar co = plan.trains[trainIndex.at(s.train)].changeover;
            if (!(c < co - 1e-9)) return;
            announce(plan, "productCleanShort", subject, c, co,
                "stage '" + s.name + "' (train '" + s.train + "'): " + what
                + " is shorter than the train's campaign `changeover "
                + fmt(co) + " h`: changing product would cost less time than"
                " continuing the same product.  A change of product is the"
                " campaign clean and line clearance PLUS the product's own part"
                " -- declare it as " + fmt(co) + " h plus that increment.");
        };
        for (std::size_t k = 0; NP >= 2 && k < NS; ++k)    // one product: no
        {                                                  //  product clean exists
            const BatchStage& s = plan.stages[k];
            cleanShort(s, s.productChangeover, s.name,
                       "the clean between products `productChangeover "
                       + fmt(s.productChangeover) + " h`");
        }
        for (const auto& P : prods)
            for (const auto& kv : P.over)
            {
                if (!kv.second->found("changeoverTo")) continue;
                const BatchStage& s = plan.stages[stageIndex.at(kv.first)];
                const DictPtr to = kv.second->subDict("changeoverTo");
                for (const auto& nx : to->keys())
                {
                    const scalar c = hoursOf(to, nx.c_str(), kv.first);
                    cleanShort(s, c, P.rec.name + ":" + s.name + ":" + nx,
                               "the clean after product '" + P.rec.name + "' before '"
                               + nx + "' `changeoverTo { " + nx + " " + fmt(c) + " h; }`");
                }
            }

        for (const auto& fu : result.topology)
            if (!unitOwner.count(fu.name)) plan.unplannedUnits.push_back(fu.name);

        //  ---- the console -----------------------------------------------
        std::cout << "\n=== BATCH PLAN (" << NP << " products in single-product"
                     " campaigns, the limiting cycle of each) =========\n"
                  << "  Basis: the flowsheet's product " << plan.product << ", r_P = "
                  << fmt(plan.productRate, 6) << " kg/h (the balance per kg of"
                     " product every product shares unless it declares its own).\n"
                  << "  Campaign order (declared): " << wordList(plan.campaignOrder)
                  << ", then the year repeats.\n"
                  << "  req./unit is the size the plan REQUIRES per unit (a batch"
                     " stage at its declared fill); a rated machine's INSTALLED size"
                     " is held against it in the sizing pass.\n";
        for (const auto& pr : plan.products)
        {
            std::cout << "  " << std::left << std::setw(18) << pr.name
                      << " Q = " << fmt(pr.perYear, 8) << " kg/yr;  lot B = "
                      << fmt(pr.lotSize, 6) << " kg";
            if (pr.lotRule == "declared")
                std::cout << " (" << fmt(pr.lotStreamMass, 8) << " kg of "
                          << pr.lotStream << ", " << pr.lotFrom << "'s lot)";
            else
                std::cout << " (largest equipment, set by " << pr.lotLimitingStage
                          << ")";
            std::cout << ";  N = " << pr.lotsPerYear << " lots;  next: " << pr.next;
            if (!pr.ownBalance.empty())
                std::cout << ";  own balance on " << wordList(pr.ownBalance);
            std::cout << "\n";
        }
        std::cout << "  Total Q = " << fmt(plan.productPerYear, 8) << " kg/yr in "
                  << plan.lotsPerYear << " lots;  H_eq = sum Q / r_P = "
                  << fmt(plan.equivalentHours, 6) << " h/yr  (streamFactor "
                  << fmt(plan.streamFactor, 6) << ", read by the economics with"
                     " `streamFactor fromBatchPlan;`)\n";
        for (std::size_t ti = 0; ti < plan.trains.size(); ++ti)
        {
            const BatchTrain& t = plan.trains[ti];
            std::cout << "\n  Train " << t.name << ": available "
                      << fmt(t.availableTime) << " h/yr, " << t.lotsPerCampaign
                      << " lots per campaign, changeover " << fmt(t.changeover)
                      << " h between campaigns of one product  (source: "
                      << t.source << ")\n";
            for (std::size_t i = 0; i < NP; ++i)
            {
                const BatchProductTrain& pt = plan.productTrains[ti * NP + i];
                std::cout << "    " << pt.product << ": T_L = " << fmt(pt.cycleTime)
                          << " h (limiting stage, sets T_L: " << pt.limitingStage << ", *), "
                          << pt.campaigns << " campaign(s), the first spans "
                          << fmt(pt.campaignSpan) << " h; starts at "
                          << fmt(pt.start) << " h; then "
                          << fmt(pt.productChangeover) << " h clean before "
                          << pt.next << ";  " << fmt(pt.requiredTime) << " h/yr\n"
                          << "      " << std::left << std::setw(22) << "stage"
                          << std::setw(12) << "m/lot kg" << std::setw(14) << "size/unit"
                          << std::setw(9) << "t_j h" << std::setw(9) << "t/Nop h"
                          << std::setw(8) << "u %" << std::setw(10) << "clean h" << "\n";
                for (const auto& n : t.stages)
                {
                    const BatchStage& s = plan.stages[stageIndex[n]];
                    const BatchProductStage& x =
                        plan.productStages[i * NS + stageIndex[n]];
                    std::ostringstream size;
                    if (s.type == "batch") size << fmt(x.volumePerUnit, 4) << " m3";
                    else                   size << fmt(x.ratePerUnit, 4) << " kg/h";
                    std::cout << "      " << std::left << std::setw(22)
                              << (x.limiting ? n + " *" : n)
                              << std::setw(12) << fmt(x.massPerLot, 5)
                              << std::setw(14) << size.str()
                              << std::setw(9) << fmt(x.cycleTime, 4)
                              << std::setw(9) << fmt(x.effectiveCycle, 4)
                              << std::setw(8) << fmt(100.0 * x.utilisation, 3)
                              << std::setw(10) << fmt(x.changeoverAfter, 4) << "\n";
                }
            }
            std::cout << "    The year: " << t.campaigns << " campaigns, "
                      << t.productChangeovers << " product changes, "
                      << fmt(t.changeoverHours) << " h of changeovers;  required "
                      << fmt(t.requiredTime) << " h/yr = "
                      << fmt(100.0 * t.occupancy, 3) << " % of the available time.\n"
                      << "      " << std::left << std::setw(22) << "stage"
                      << std::setw(16) << "req./unit" << std::setw(14) << "sized by"
                      << std::setw(7) << "Nip/op" << std::setw(11) << "clean h"
                      << std::setw(11) << "busy h" << std::setw(8) << "occ %" << "\n";
            for (const auto& n : t.stages)
            {
                const BatchStage& s = plan.stages[stageIndex[n]];
                std::ostringstream size, nn;
                if (s.type == "batch") size << fmt(s.volumePerUnit, 4) << " m3";
                else                   size << fmt(s.ratePerUnit, 4) << " kg/h";
                nn << s.inPhase << "/" << s.outOfPhase;
                std::cout << "      " << std::left << std::setw(22) << n
                          << std::setw(16) << size.str()
                          << std::setw(14) << s.sizingProduct
                          << std::setw(7) << nn.str()
                          << std::setw(11) << (NP >= 2 ? fmt(s.productChangeover, 4)
                                                       : std::string("-"))
                          << std::setw(11) << fmt(s.busyHours, 6)
                          << std::setw(8) << fmt(100.0 * s.occupancy, 3) << "\n";
            }
        }
        std::cout << "\n  Per product i: S_ij = f_ij / (rho phi), V_j = max_i S_ij B_i"
                     " (R_j = max_i f_ij B_i / t_op); T_L,i = max_j t_ij / N_op.\n"
                     "  The year, per train, in the declared order: each product's"
                     " campaigns back to back, a campaign of n lots spanning"
                     " max_j (o_ij + t_ij) + (n - 1) T_L,i, followed by the train's"
                     " changeover -- or, after its last, by the clean before the"
                     " next product: max_j of the stages' own cleans (every stage"
                     " cleaned at once once the campaign has left the train).\n"
                     "  Units in no stage (continuous auxiliaries, storage): "
                  << wordList(plan.unplannedUnits) << "\n"
                  << "  The year's campaigns, changeovers and each product's first"
                     " campaign: reports/batchPlan/gantt.csv (and the result JSON).\n"
                  << "========================================================"
                     "=============================\n";

        runCleaning();
        for (const auto& pr : plan.products)
        {
            auto dz = productDosage.find(pr.name);
            if (dz != productDosage.end() && dz->second.present)
                plan.dosage.push_back(dosageOf(result, plan, pr.name, dz->second,
                    pr.lotSize, pr.lotsPerYear, pr.production, pr.perYear));
        }
        buildBases(plan);
        printBasesAndDosage(plan);
        writeCsvs(plan);
        plan.present = true;
        result.batchPlan = std::move(plan);
        return 0;
    }

    //  ---- the lot ------------------------------------------------------
    for (auto& s : plan.stages)
    {
        s.massPerProduct = s.massRate / plan.productRate;
        if (s.type == "batch")
            s.sizeFactor = s.massPerProduct / (s.bulkDensity * s.fillFraction);
    }
    if (plan.lotRule == "declared")
        plan.lotSize = plan.lotStreamMass * plan.productRate / lotStreamRate;
    else
    {
        scalar best = -1.0;
        for (const auto& s : plan.stages)
        {
            if (s.type != "batch") continue;
            const scalar Bj = s.inPhase * s.maxVolume / s.sizeFactor;
            if (best < 0.0 || Bj < best) { best = Bj; plan.lotLimitingStage = s.name; }
        }
        if (best <= 0.0)
            throw std::runtime_error(lw + ": `rule largestEquipment;` and no"
                " BATCH stage -- only a vessel's largest volume bounds a lot.");
        plan.lotSize = best;
    }
    {
        const scalar ratio = plan.productPerYear / plan.lotSize;
        plan.lotsPerYear = static_cast<int>(std::ceil(ratio - 1e-9 * ratio));
        if (plan.lotsPerYear < 1) plan.lotsPerYear = 1;
        plan.production = plan.lotsPerYear * plan.lotSize;
    }
    plan.equivalentHours = plan.productPerYear / plan.productRate;
    plan.streamFactor    = plan.equivalentHours / 8760.0;

    //  ---- sizes and processing times -------------------------------------
    for (auto& s : plan.stages)
    {
        s.massPerLot = s.massPerProduct * plan.lotSize;
        if (s.type == "batch")
        {
            s.volume        = s.sizeFactor * plan.lotSize;
            s.volumePerUnit = s.volume / s.inPhase;
        }
        else
        {
            if (s.operatingFrom == "flowsheet")
                s.processTime = s.massPerLot / (s.inPhase * s.capacityRate);
            s.rate        = s.massPerLot / s.processTime;
            s.ratePerUnit = s.rate / s.inPhase;
        }
    }
    for (auto& s : plan.stages)
    {
        if (s.dischargeFrom == "fedStage")
            s.dischargeTime = plan.stages[stageIndex[s.feeds]].processTime;
        s.cycleTime      = s.chargeTime + s.processTime + s.dischargeTime + s.cleanTime;
        if (!(s.cycleTime > 0.0))
            throw std::runtime_error(top + " { stages ( '" + s.name + "' ) }: the"
                " cycle time is zero -- a stage takes some time per lot.");
        s.effectiveCycle = s.cycleTime / s.outOfPhase;
    }

    //  ---- per train: the limiting cycle, the campaign, the year ----------
    for (auto& t : plan.trains)
    {
        for (const auto& n : t.stages)
        {
            const BatchStage& s = plan.stages[stageIndex[n]];
            if (s.effectiveCycle > t.cycleTime + 1e-12)
            {
                t.cycleTime = s.effectiveCycle;
                t.limitingStage = n;
            }
        }
        plan.stages[stageIndex[t.limitingStage]].limiting = true;

        //  Offsets: the one home of the campaign schedule.
        std::vector<SchedStage> sv;
        for (const auto& n : t.stages)
        {
            const BatchStage& s = plan.stages[stageIndex[n]];
            SchedStage e;
            e.name = n;  e.feeds = s.feeds;
            e.charge = s.chargeTime;  e.proc = s.processTime;  e.cycle = s.cycleTime;
            sv.push_back(e);
        }
        const scalar last = scheduleCampaign(sv);
        for (const auto& e : sv) plan.stages[stageIndex[e.name]].offset = e.offset;
        auto span = [&](int nLots) { return last + (nLots - 1) * t.cycleTime; };

        const int N  = plan.lotsPerYear;
        const int nc = t.lotsPerCampaign;
        t.campaigns  = (N + nc - 1) / nc;
        const int full = N / nc, rem = N % nc;
        const int nFirst = std::min(nc, N);
        t.campaignSpan     = span(nFirst);
        t.campaignDuration = t.campaignSpan + t.changeover;
        t.requiredTime     = full * (span(nc) + t.changeover)
                           + (rem > 0 ? span(rem) + t.changeover : 0.0);
        t.occupancy        = t.requiredTime / t.availableTime;

        for (const auto& n : t.stages)
        {
            BatchStage& s = plan.stages[stageIndex[n]];
            s.utilisation = s.effectiveCycle / t.cycleTime;
            s.busyHours   = N * s.cycleTime / s.outOfPhase + t.campaigns * t.changeover;
            s.occupancy   = s.busyHours / t.availableTime;
            s.idleHours   = t.availableTime - s.busyHours;
        }

        //  The first campaign's Gantt, as data.
        for (const auto& n : t.stages)
        {
            const BatchStage& s = plan.stages[stageIndex[n]];
            for (int i = 0; i < nFirst; ++i)
            {
                BatchGanttRow g;
                g.train = t.name;  g.stage = n;
                g.lot   = i + 1;   g.unit  = (i % s.outOfPhase) + 1;
                g.start = s.offset + i * t.cycleTime;
                g.end   = g.start + s.cycleTime;
                plan.gantt.push_back(g);
            }
        }
        BatchGanttRow co;
        co.train = t.name;  co.stage = "changeover";
        co.start = t.campaignSpan;  co.end = t.campaignDuration;
        plan.gantt.push_back(co);
    }

    //  ---- an impossible plan REFUSES, naming its numbers and remedies ----
    for (const auto& s : plan.stages)
    {
        const BatchTrain& t = plan.trains[trainIndex[s.train]];
        if (s.busyHours > t.availableTime * (1.0 + 1e-9))
        {
            std::ostringstream m;
            m << top << ": stage '" << s.name << "' is busy " << fmt(s.busyHours)
              << " h a year per unit (" << plan.lotsPerYear << " lots x "
              << fmt(s.cycleTime) << " h / " << s.outOfPhase << " out-of-phase"
              << " unit(s) + " << t.campaigns << " changeovers x "
              << fmt(t.changeover) << " h) against the " << fmt(t.availableTime)
              << " h train '" << t.name << "' may run: occupancy "
              << fmt(100.0 * s.occupancy) << " %.  The plan cannot be run."
              << "  Remedies: an out-of-phase unit (`outOfPhase "
              << (s.outOfPhase + 1) << ";` takes the lots' share to "
              << fmt(plan.lotsPerYear * s.cycleTime / (s.outOfPhase + 1)) << " h),"
              << " a larger lot (fewer lots), or more available hours.";
            throw std::runtime_error(m.str());
        }
    }
    for (const auto& t : plan.trains)
        if (t.requiredTime > t.availableTime * (1.0 + 1e-9))
        {
            std::ostringstream m;
            m << top << ": train '" << t.name << "' needs " << fmt(t.requiredTime)
              << " h a year (" << t.campaigns << " campaigns of up to "
              << t.lotsPerCampaign << " lots, cycle " << fmt(t.cycleTime)
              << " h set by '" << t.limitingStage << "', changeover "
              << fmt(t.changeover) << " h) to make " << plan.lotsPerYear
              << " lots, and may run " << fmt(t.availableTime) << " h: the"
              << " production of " << fmt(plan.productPerYear) << " kg a year"
              << " is unreachable.  Remedies: an out-of-phase unit at '"
              << t.limitingStage << "', a larger lot, longer campaigns, or more"
              << " available hours.";
            throw std::runtime_error(m.str());
        }

    //  ---- a defendable but poor plan is ANNOUNCED ------------------------
    for (const auto& s : plan.stages)
    {
        if (!s.limiting && s.utilisation < plan.lowUtilisation)
            announce(plan, "lowUtilisation", s.name, s.utilisation, plan.lowUtilisation,
                "stage '" + s.name + "' never limits and is busy "
                + fmt(100.0 * s.utilisation, 3) + " % of its train's "
                + fmt(plan.trains[trainIndex[s.train]].cycleTime) + " h cycle"
                " (below " + fmt(100.0 * plan.lowUtilisation, 3) + " %): it waits"
                " most of every lot -- oversized for this plan, or a step that"
                " could be shared.");
        if (s.operatingFrom == "declared" && s.capacityRate > 0.0)
        {
            const scalar r = s.ratePerUnit / s.capacityRate;
            if (std::fabs(r - 1.0) > capacityBand)
                announce(plan, "capacityMismatch", s.name, s.ratePerUnit,
                    s.capacityRate,
                    "stage '" + s.name + "' is declared to run "
                    + fmt(s.processTime) + " h per lot, which asks its rated"
                    " unit '" + s.ratingUnit + "' for " + fmt(s.ratePerUnit)
                    + " kg/h of " + s.holds + "; as modelled it delivers "
                    + fmt(s.capacityRate) + " kg/h ("
                    + fmt(100.0 * (r - 1.0), 3) + " %) -- the plan and the"
                    " machine disagree (declare `operatingTime fromFlowsheet;`"
                    " to run it at its own rate, or change its hardware).");
        }
    }
    for (const auto& t : plan.trains)
        if (t.occupancy < plan.lowUtilisation)
            announce(plan, "idleTrain", t.name, t.occupancy, plan.lowUtilisation,
                "train '" + t.name + "' runs " + fmt(t.requiredTime) + " h of"
                " its " + fmt(t.availableTime) + " h a year ("
                + fmt(100.0 * t.occupancy, 3) + " %): the line is idle most of"
                " the year -- larger lots on smaller equipment, a shared"
                " (multiproduct) line, or fewer available hours.");

    runCleaning();

    //  ---- the units no stage claims ------------------------------------
    for (const auto& fu : result.topology)
        if (!unitOwner.count(fu.name)) plan.unplannedUnits.push_back(fu.name);

    //  ---- the console ---------------------------------------------------
    std::cout << "\n=== BATCH PLAN (single product, size factors and the"
                 " limiting cycle) ===================\n"
              << "  Product " << plan.product << ": flowsheet rate r_P = "
              << fmt(plan.productRate, 6) << " kg/h (a BASIS -- the plant runs"
                 " in lots).\n"
              << "  Production Q = " << fmt(plan.productPerYear, 8) << " kg/yr"
              << "  (source: " << plan.productionSource << ")\n"
              << "  req./unit is the size the plan REQUIRES per unit (a batch"
                 " stage at its declared fill); a rated machine's INSTALLED size"
                 " is held against it in the sizing pass.\n";
    if (plan.lotRule == "declared")
        std::cout << "  Lot B = " << fmt(plan.lotStreamMass, 8) << " kg of "
                  << plan.lotStream << " x r_P / r_" << plan.lotStream << " ("
                  << fmt(plan.productRate, 6) << " / " << fmt(lotStreamRate, 6)
                  << ") = " << fmt(plan.lotSize, 6) << " kg of product   [rule"
                  << " declared; source: " << plan.lotSource << "]\n";
    else
        std::cout << "  Lot B = min_j N_ip Vmax_j / S_j = " << fmt(plan.lotSize, 6)
                  << " kg of product, set by stage '" << plan.lotLimitingStage
                  << "'   [rule largestEquipment; source: " << plan.lotSource << "]\n";
    std::cout << "  Lots a year N = ceil(Q / B) = " << plan.lotsPerYear
              << "  (the plant makes N B = " << fmt(plan.production, 8)
              << " kg)\n"
              << "  Equivalent flowsheet hours H_eq = Q / r_P = "
              << fmt(plan.equivalentHours, 6) << " h/yr  (streamFactor "
              << fmt(plan.streamFactor, 6) << ", read by the economics with"
                 " `streamFactor fromBatchPlan;`)\n";
    for (const auto& t : plan.trains)
    {
        std::cout << "\n  Train " << t.name << ": available " << fmt(t.availableTime)
                  << " h/yr, " << t.lotsPerCampaign << " lots per campaign,"
                  << " changeover " << fmt(t.changeover) << " h  (source: "
                  << t.source << ")\n"
                  << "    " << std::left << std::setw(22) << "stage"
                  << std::setw(8) << "type" << std::setw(12) << "m/lot kg"
                  << std::setw(14) << "S m3/kg" << std::setw(13) << "req./unit"
                  << std::setw(7) << "Nip/op" << std::setw(9) << "t_j h"
                  << std::setw(9) << "t/Nop h" << std::setw(8) << "u %"
                  << std::setw(9) << "occ %" << "\n";
        for (const auto& n : t.stages)
        {
            const BatchStage& s = plan.stages[stageIndex[n]];
            std::ostringstream size, nn;
            if (s.type == "batch") size << fmt(s.volumePerUnit, 4) << " m3";
            else                   size << fmt(s.ratePerUnit, 4) << " kg/h";
            nn << s.inPhase << "/" << s.outOfPhase;
            std::cout << "    " << std::left << std::setw(22)
                      << (s.limiting ? n + " *" : n)
                      << std::setw(8) << (s.type == "batch" ? "batch" : "semi")
                      << std::setw(12) << fmt(s.massPerLot, 5)
                      << std::setw(14) << (s.type == "batch" ? fmt(s.sizeFactor, 5) : "-")
                      << std::setw(13) << size.str() << std::setw(7) << nn.str()
                      << std::setw(9) << fmt(s.cycleTime, 4)
                      << std::setw(9) << fmt(s.effectiveCycle, 4)
                      << std::setw(8) << fmt(100.0 * s.utilisation, 3)
                      << std::setw(9) << fmt(100.0 * s.occupancy, 3) << "\n";
        }
        std::cout << "    T_L = " << fmt(t.cycleTime) << " h (limiting stage, sets T_L: "
                  << t.limitingStage << ", marked *);  " << t.campaigns
                  << " campaigns, a full one spans " << fmt(t.campaignSpan)
                  << " h + " << fmt(t.changeover) << " h changeover;  required "
                  << fmt(t.requiredTime) << " h/yr = " << fmt(100.0 * t.occupancy, 3)
                  << " % of the available time.\n";
    }
    std::cout << "\n  S_j = f_j / (rho_j phi_j), f_j = r_holds / r_P; a batch"
                 " stage's size is V = S_j B / N_ip, a semicontinuous one's"
                 " R = f_j B / t_op / N_ip.\n"
                 "  t_j = charge + process + discharge + clean; T_L = max t_j /"
                 " N_op; occupancy = (N t_j / N_op + campaigns x changeover) /"
                 " available.\n"
                 "  Units in no stage (continuous auxiliaries, storage): "
              << wordList(plan.unplannedUnits) << "\n"
              << "  The Gantt of each train's first campaign:"
                 " reports/batchPlan/gantt.csv (and the result JSON).\n"
              << "========================================================"
                 "=============================\n";

    if (planDosage.present)
        plan.dosage.push_back(dosageOf(result, plan, plan.product, planDosage,
            plan.lotSize, plan.lotsPerYear, plan.production, plan.productPerYear));
    buildBases(plan);
    printBasesAndDosage(plan);
    writeCsvs(plan);
    plan.present = true;
    result.batchPlan = std::move(plan);
    return 0;
}

} // namespace Choupo
