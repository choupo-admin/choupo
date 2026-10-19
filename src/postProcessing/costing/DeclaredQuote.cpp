/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "DeclaredQuote.H"

#include <cmath>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace declaredQuote {

namespace {

//  Turton's contingency and fee, C_TM = 1.18 C_BM -- the same factor every
//  correlation row carries (`Turton.cpp`, where the model applies it).  A
//  vendor's price carries no PROJECT contingency, so a quote's total module
//  cost is on the same footing as its neighbours' and the share column of
//  the equipment table compares like with like.
constexpr scalar contingencyAndFee = 1.18;

std::string wordList(std::initializer_list<const char*> ws)
{
    std::string s;
    for (const char* w : ws) s += (s.empty() ? "" : " | ") + std::string(w);
    return s;
}

} // anonymous namespace

std::map<std::string, CostBreakdown>
price(const DictPtr& costingDict, const CostingModel& model,
      const SimulationResult& result)
{
    std::map<std::string, CostBreakdown> out;
    if (!costingDict || !costingDict->found("quotes")) return out;

    const std::map<std::string, scalar> pf = model.pricingFactors();
    auto factor = [&](const char* k, scalar& v) -> bool {
        auto it = pf.find(k);
        if (it == pf.end()) return false;
        v = it->second;
        return true;
    };

    //  What the run knows about names: the flowsheet's units (with their
    //  sector stamp), the units the sizing pass sized or refused.
    std::map<std::string, const FlatUnit*> units;
    for (const auto& fu : result.topology) units[fu.name] = &fu;
    std::set<std::string> sizedUnits;
    for (const auto& [item, sz] : result.sizings)
    {
        sizedUnits.insert(sz.unitName);
        (void)item;
    }

    const std::vector<DictPtr> list = costingDict->lookupDictList("quotes");
    int n = 0;
    for (const auto& q : list)
    {
        ++n;
        std::ostringstream at;
        at << "costing { quotes ( ... ) }, entry " << n;
        std::string where = at.str();

        //  ---- identity: exactly one of `unit` / `item` -------------------
        const bool hasUnit = q->found("unit");
        const bool hasItem = q->found("item");
        if (hasUnit == hasItem)
            throw std::runtime_error(where + ": a quote names EXACTLY ONE of"
                " `unit <flowsheet unit>;` (it prices that unit, which has no"
                " sized item) or `item <name>;` (it prices something that is"
                " not a unit, e.g. a building) -- this entry names "
                + std::string(hasUnit ? "both" : "neither") + ".");
        const std::string name = q->lookupWord(hasUnit ? "unit" : "item");
        where += " ('" + name + "')";
        if (out.count(name))
            throw std::runtime_error(where + ": a second quote on the same"
                " name -- one item, one price.  Merge the two entries.");

        std::string sector;
        if (hasUnit)
        {
            auto it = units.find(name);
            if (it == units.end())
            {
                std::string known;
                for (const auto& [u, fu] : units) { (void)fu; known += " " + u; }
                throw std::runtime_error(where + ": `unit " + name + ";` names"
                    " no unit of this flowsheet.  Units:" + known + ".  For"
                    " something that is not a unit (a building) declare"
                    " `item <name>;`.");
            }
            if (sizedUnits.count(name))
                throw std::runtime_error(where + ": unit '" + name + "' is SIZED"
                    " by the sizing pass and priced by its cost correlation; a"
                    " quote beside it would price it twice.  Remove it from"
                    " `sizing {}` to price it by the quote, or drop the quote.");
            if (result.sizingRefusals.count(name))
                throw std::runtime_error(where + ": unit '" + name + "' is"
                    " declared in `sizing {}` and its sizer REFUSED it ("
                    + result.sizingRefusals.at(name) + ").  That refusal is"
                    " the finding; a quote would hide it.  Fix the sizing, or"
                    " remove the unit from `sizing {}` and price it here.");
            sector = it->second->sector;
        }
        else
        {
            if (units.count(name))
                throw std::runtime_error(where + ": `item " + name + ";` is the"
                    " name of a flowsheet unit -- declare `unit " + name + ";`"
                    " so the quote says it prices that unit.");
            if (result.sizings.count(name) || result.costs.count(name))
                throw std::runtime_error(where + ": `item " + name + ";` is"
                    " already a sized or costed item of this run -- a quote"
                    " needs a name of its own.");
        }

        //  ---- the words a reader defends the number with -----------------
        CostBreakdown cb;
        for (const char* key : { "source", "reason" })
            if (!q->found(key) || q->lookupWord(key).empty())
                throw std::runtime_error(where + ": `" + key + " \"...\";` is"
                    " not declared -- a quoted cost is an assumption the case"
                    " owes its reader: where the number comes from (`source`:"
                    " the vendor, the quotation's date and reference, or"
                    " 'author-set placeholder') and why it is this plant's"
                    " (`reason`).  Nothing is defaulted.");
        cb.quoteSource = q->lookupWord("source");
        cb.quoteReason = q->lookupWord("reason");

        auto requireWord = [&](const char* key,
                               std::initializer_list<const char*> accepted) {
            if (!q->found(key))
                throw std::runtime_error(where + ": `" + key + "` is not"
                    " declared.  Accepted: " + wordList(accepted) + ".  It"
                    " changes the capital, so it is never defaulted.");
            const std::string w = q->lookupWord(key);
            for (const char* a : accepted) if (w == a) return w;
            throw std::runtime_error(where + ": `" + key + " " + w + ";` is"
                " not a word this quote knows.  Accepted: "
                + wordList(accepted) + ".");
        };
        const std::string currency = requireWord("currency", { "EUR", "USD" });
        cb.quoteBasis = requireWord("basis", { "installed", "purchased" });
        cb.quoteKind  = requireWord("kind",  { "equipment", "facility" });

        //  ---- the number -------------------------------------------------
        if (!q->found("value"))
            throw std::runtime_error(where + ": `value` is not declared -- the"
                " quoted price, in `currency`, money of `year`.");
        const scalar value = q->lookupScalar("value");
        if (!std::isfinite(value) || !(value > 0.0))
        {
            std::ostringstream m;
            m << where << ": `value " << value << ";` -- a quoted price must be"
                 " a positive number (an item that costs nothing needs no"
                 " quote; leave it out).";
            throw std::runtime_error(m.str());
        }

        //  ---- the money's year: the run's, or escalated by a declared index
        if (!q->found("year"))
            throw std::runtime_error(where + ": `year` is not declared -- the"
                " year whose money the quote is in.");
        const scalar qYear = q->lookupScalar("year");
        scalar runYear = 0.0, runCepci = 0.0;
        const bool haveIndex = factor("year", runYear) && factor("cepci", runCepci);
        scalar escalation = 1.0;
        scalar qCepci     = runCepci;
        const bool sameYear = haveIndex && std::fabs(qYear - runYear) < 0.5;
        if (sameYear)
        {
            if (q->found("cepci"))
                throw std::runtime_error(where + ": `cepci` is declared for a"
                    " quote in the costing year's own money -- no index is"
                    " applied, so the number would be read by nothing.  Delete"
                    " it.");
        }
        else
        {
            if (!haveIndex)
                throw std::runtime_error(where + ": the quote is in another"
                    " year's money and the costing model publishes no price"
                    " index to escalate it with.  Declare the quote in the"
                    " costing year's money.");
            if (!q->found("cepci"))
            {
                std::ostringstream m;
                m << where << ": the quote is in " << qYear << " money and the"
                     " costing year is " << runYear << " -- declare `cepci <the"
                     " index at " << qYear << ">;` and it is escalated by"
                     " CEPCI_run / cepci (" << runCepci << " / cepci).  No"
                     " index is defaulted.";
                throw std::runtime_error(m.str());
            }
            qCepci = q->lookupScalar("cepci");
            if (!(qCepci > 0.0))
                throw std::runtime_error(where + ": `cepci` must be a positive"
                    " index.");
            escalation = runCepci / qCepci;
        }

        scalar fx = 1.0;
        if (currency == "USD")
        {
            if (!factor("usdToEur", fx))
                throw std::runtime_error(where + ": a USD quote needs the"
                    " costing model's `usdToEur`, and this model publishes"
                    " none.");
        }

        //  ---- installed or purchased: the bare-module factor is the CASE's
        scalar Fbm = 1.0;
        if (cb.quoteBasis == "installed")
        {
            for (const char* key : { "bareModuleFactor", "bareModuleFactorSource" })
                if (q->found(key))
                    throw std::runtime_error(where + ": `" + key + "` is declared"
                        " beside `basis installed;` -- an installed price IS the"
                        " bare-module cost, so the factor would be read by"
                        " nothing.  Delete it, or declare `basis purchased;`.");
        }
        else
        {
            if (!q->found("bareModuleFactor"))
                throw std::runtime_error(where + ": `basis purchased;` and no"
                    " `bareModuleFactor` -- a purchased price becomes an"
                    " installed one only through an installation factor, and"
                    " Choupo has none for an item it has no correlation for.  Declare"
                    " the case's own (`bareModuleFactor 2.5;` with"
                    " `bareModuleFactorSource \"...\";`), or quote the installed"
                    " price (`basis installed;`).");
            Fbm = q->lookupScalar("bareModuleFactor");
            if (!std::isfinite(Fbm) || Fbm < 1.0)
            {
                std::ostringstream m;
                m << where << ": `bareModuleFactor " << Fbm << ";` -- an"
                     " installed cost is at least the purchased one (factor"
                     " >= 1).";
                throw std::runtime_error(m.str());
            }
            if (!q->found("bareModuleFactorSource")
                || q->lookupWord("bareModuleFactorSource").empty())
                throw std::runtime_error(where + ": `bareModuleFactorSource"
                    " \"...\";` is not declared -- the installation factor is"
                    " the case's assumption and must say where it comes from.");
            cb.quoteFactorSource = q->lookupWord("bareModuleFactorSource");
        }

        const scalar Cp  = value * escalation * fx;
        const scalar Cbm = Fbm * Cp;

        cb.unitName        = name;
        cb.sector          = sector;
        cb.purchasedCost   = Cp;
        cb.bareModuleCost  = Cbm;
        cb.totalModuleCost = contingencyAndFee * Cbm;
        //  The factors, stated as numbers so the row is reproducible from
        //  itself (the catalyst row's rule: a blank reads as a factor the
        //  pass forgot).  B1 = the bare-module factor, B2 = 0, so the old
        //  `C_p (B1 + B2 F_M F_P)` arithmetic still lands on C_BM.
        cb.factors["F_M"]              = 1.0;
        cb.factors["F_P"]              = 1.0;
        cb.factors["B1"]               = Fbm;
        cb.factors["B2"]               = 0.0;
        cb.factors["C_TM_over_C_BM"]   = contingencyAndFee;
        cb.factors["S"]                = 1.0;
        cb.factors["quoteValue"]       = value;
        cb.factors["quoteYear"]        = qYear;
        cb.factors["quoteCepci"]       = qCepci;
        cb.factors["quoteEscalation"]  = escalation;
        cb.factors["quoteCurrencyRate"]= fx;
        cb.factors["bareModuleFactor"] = Fbm;
        //  THE TERM THE AUXILIARY-FACILITIES ESTIMATE MULTIPLIES (read by
        //  EconomicsPass in place of C_p (B1 + B2)): a machine drives it like
        //  any module; a facility IS one, and drives none.
        cb.factors["C_BM_base"]        = (cb.quoteKind == "equipment") ? Cbm : 0.0;
        //  The run's index rides along UNAPPLIED where the quote is in the
        //  run's money, as on the catalyst row.
        for (const auto& [k, v] : pf) cb.factors[k] = v;
        cb.sizeKey     = "quote";
        cb.correlation = shapeWord;
        cb.material    = "none: declared quote";
        cb.currency    = "EUR";
        out.emplace(name, std::move(cb));
    }
    return out;
}

} // namespace declaredQuote
} // namespace Choupo
