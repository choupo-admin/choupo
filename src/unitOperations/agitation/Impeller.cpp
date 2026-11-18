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

#include "Impeller.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <stdexcept>

namespace Choupo {
namespace agitation {

namespace fs = std::filesystem;

namespace {

void onlyKeys(const DictPtr& d, const std::vector<std::string>& allowed, const std::string& where)
{
    for (const auto& k : d->keys())
        if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed) list += (list.empty() ? "" : ", ") + a;
            throw std::runtime_error(where + ": unknown word '" + k + "' -- this block reads " + list + ".");
        }
}

} // namespace

ImpellerRecord loadImpeller(const std::string& name)
{
    std::vector<fs::path> dirs;
    for (const auto& d : records::localScanDirs("assets")) dirs.push_back(d);
    if (!Database::currentRoot().empty())
        dirs.push_back(fs::path(Database::currentRoot()) / "standards" / "assets");
    fs::path file;
    std::string searched;
    for (const auto& d : dirs)
    {
        searched += (searched.empty() ? "" : ", ") + d.string();
        const fs::path f = d / (name + ".dat");
        if (fs::exists(f)) { file = f; break; }
    }
    if (file.empty())
        throw std::runtime_error("impeller record '" + name + "' not found (searched: " + (searched.empty() ? "(nowhere)" : searched)
            + ").  An impeller is an asset record, `kind impeller;`, in the case's constant/assets/ or data/standards/assets/.");
    const DictPtr d = Dictionary::fromFile(file.string());
    const std::string where = file.string();
    if (d->lookupWordOrDefault("kind", "") != "impeller")
        throw std::runtime_error(where + ": `kind " + d->lookupWordOrDefault("kind", "") + ";` -- an impeller record says `kind impeller;`.");
    onlyKeys(d, { "name", "kind", "type", "provenance", "geometry", "shearConstant", "laminarPower", "turbulentPower" }, where);
    ImpellerRecord r;
    r.name = d->lookupWordOrDefault("name", name);
    r.type = d->lookupWordOrDefault("type", "");
    r.home = where;
    if (!d->found("provenance"))
        throw std::runtime_error(where + ": no `provenance { origin ...; citation \"...\"; basis \"...\"; }` -- the constants of an impeller have a source.");
    {
        const DictPtr pv = d->subDict("provenance");
        r.citation = pv->lookupWordOrDefault("citation", "");
        r.basis    = pv->lookupWordOrDefault("basis", "");
        r.origin   = pv->lookupWordOrDefault("origin", "");
        if (r.citation.empty()) throw std::runtime_error(where + ": `provenance` names no `citation`.");
    }
    if (d->found("geometry"))
    {
        const DictPtr g = d->subDict("geometry");
        for (const auto& k : g->keys()) r.geometry[k] = g->lookupScalar(k);
    }
    if (!d->found("shearConstant"))
        throw std::runtime_error(where + ": no `shearConstant { ks <value>; uncertainty <relative>; source \"...\"; }` -- the Metzner-Otto constant"
            " (gamma_avg = k_s N, eq. 8.9) with its stated uncertainty is a fact of the impeller (R7).");
    {
        const DictPtr s = d->subDict("shearConstant");
        onlyKeys(s, { "ks", "uncertainty", "source" }, where + " shearConstant");
        r.ks = s->lookupScalar("ks");
        r.ksSource = s->lookupWordOrDefault("source", "");
        if (!s->found("uncertainty"))
            throw std::runtime_error(where + ": `shearConstant` states no `uncertainty` (relative; the book: +-25-30 %, p. 395) -- the power printed carries it.");
        r.ksUncertainty = s->lookupScalar("uncertainty");
        if (!(r.ks > 0.0) || !(r.ksUncertainty >= 0.0 && r.ksUncertainty < 1.0))
            throw std::runtime_error(where + ": `ks` must be positive and `uncertainty` a relative value in [0, 1).");
        if (r.ksSource.empty()) throw std::runtime_error(where + ": `shearConstant` names no `source`.");
    }
    if (!d->found("laminarPower"))
        throw std::runtime_error(where + ": no `laminarPower { Kp ...; }` block.");
    {
        const DictPtr l = d->subDict("laminarPower");
        onlyKeys(l, { "Kp", "correlation", "KpUncertainty", "ReCritical", "ReMax" }, where + " laminarPower");
        if (!l->found("Kp"))
            throw std::runtime_error(where + ": `laminarPower` states no `Kp` (a value, or the word `correlation`).");
        const bool kpWord = std::holds_alternative<std::string>(l->entryValue("Kp"));
        if (kpWord && l->lookupWord("Kp") != "correlation")
            throw std::runtime_error(where + ": `Kp " + l->lookupWord("Kp") + ";` -- a number, or the word `correlation`.");
        if (kpWord)
        {
            r.correlation = l->lookupWordOrDefault("correlation", "");
            if (r.correlation != "helicalRibbon87")
                throw std::runtime_error(where + ": `correlation " + r.correlation + ";` -- this build carries helicalRibbon87 (Delaplace & Leuliet, eq. 8.7, p. 386).");
        }
        else
        {
            r.hasKpValue = true;
            r.Kp = l->lookupScalar("Kp");
            if (!(r.Kp > 0.0)) throw std::runtime_error(where + ": `Kp` must be positive.");
        }
        r.KpUncertainty = l->lookupScalarOrDefault("KpUncertainty", 0.0);
        if (l->found("ReCritical"))
        {
            const DictPtr c = l->subDict("ReCritical");
            onlyKeys(c, { "a", "b", "source" }, where + " ReCritical");
            r.hasReCritical = true;
            r.ReCritA = c->lookupScalar("a");
            r.ReCritB = c->lookupScalar("b");
            r.ReCritSource = c->lookupWordOrDefault("source", "");
        }
        if (l->found("ReMax")) { r.hasReMax = true; r.ReMax = l->lookupScalar("ReMax"); }
        if (!r.hasReCritical && !r.hasReMax)
            throw std::runtime_error(where + ": `laminarPower` gives no end of the laminar line (`ReCritical { a; b; source; }` or `ReMax`) -- R9:"
                " a laminar relation is never carried past its line, so the record must say where it ends.");
    }
    if (d->found("turbulentPower"))
    {
        const DictPtr t = d->subDict("turbulentPower");
        onlyKeys(t, { "Po", "source" }, where + " turbulentPower");
        r.hasPoTurbulent = true;
        r.PoTurbulent = t->lookupScalar("Po");
        r.PoSource = t->lookupWordOrDefault("source", "");
    }
    return r;
}

scalar laminarKp(const ImpellerRecord& r, std::vector<std::string>* outside)
{
    if (r.hasKpValue) return r.Kp;
    //  eq. 8.7 (Delaplace & Leuliet 2000 as given by Chhabra & Richardson, 2nd ed., p. 386):
    //  Kp = 91 Nr^0.79 [0.5 (D_T/D - 1)]^-0.31 (s/D)^-0.37 (W/D)^0.16 (H/D)
    auto g = [&](const char* k) -> scalar
    {
        const auto it = r.geometry.find(k);
        if (it == r.geometry.end())
            throw std::runtime_error("impeller '" + r.name + "' (" + r.home + "): `geometry { " + k + " }` is missing -- eq. 8.7 needs Nr, clearanceRatio, W_over_D, s_over_D, H_over_D.");
        return it->second;
    };
    const scalar Nr = g("Nr"), cr = g("clearanceRatio"), WD = g("W_over_D"), sD = g("s_over_D"), HD = g("H_over_D");
    const scalar DTD = 1.0 + cr;
    if (outside)
    {
        auto chk = [&](const char* nm, scalar v, scalar lo, scalar hi)
        {
            if (v < lo || v > hi)
            {
                char b[160];
                std::snprintf(b, sizeof b, "%s = %.6g outside the %.6g to %.6g of the 148 configurations eq. 8.7 was fitted to (p. 386)", nm,
                    static_cast<double>(v), static_cast<double>(lo), static_cast<double>(hi));
                outside->push_back(b);
            }
        };
        chk("D_T/D", DTD, 1.012, 1.38); chk("W/D", WD, 0.07, 0.22); chk("s/D", sD, 0.32, 2.16); chk("H/D", HD, 0.88, 1.30);
        if (Nr != 1.0 && Nr != 2.0) outside->push_back("N_r is 1 or 2 in the data of eq. 8.7");
    }
    return 91.0 * std::pow(Nr, 0.79) * std::pow(0.5 * (DTD - 1.0), -0.31) * std::pow(sD, -0.37) * std::pow(WD, 0.16) * HD;
}

} // namespace agitation
} // namespace Choupo
