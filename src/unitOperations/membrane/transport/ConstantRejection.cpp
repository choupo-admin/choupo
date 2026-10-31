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

#include "ConstantRejection.H"
#include "SolutionDiffusion.H"

#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {
namespace membrane {

namespace {

std::string fmtR(scalar v)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

} // namespace

// ---------------------------------------------------------------------------
//  transportParameters { rejection { <solute> <R>; ... } source "..."; }
// ---------------------------------------------------------------------------
void ConstantRejection::readParameters(const DictPtr& params)
{
    const std::string ctx = "transport constantRejection: transportParameters";
    if (!params) return;
    for (const auto& k : params->keys())
        if (k != "rejection" && k != "source")
            throw std::runtime_error(ctx + " declares `" + k + "`, which this"
                " law does not read.  constantRejection reads `rejection {"
                " <solute> <R_int>; ... }` and `source \"...\";` and nothing"
                " else.");
    if (!params->found("rejection"))
        throw std::runtime_error(ctx + " declares no `rejection { <solute>"
            " <R_int>; ... }` block -- the law has no rejections without it.");
    if (!params->found("source"))
        throw std::runtime_error(ctx + " declares no `source \"...\";` -- the"
            " intrinsic rejections are declared numbers, and the case must say"
            " where they come from (a measurement against the wall, a paper,"
            " or \"hypothetical teaching value\").");
    source_ = params->lookupWordOrDefault("source", "");

    auto r = params->subDict("rejection");
    for (const auto& k : r->keys())
    {
        //  `<solute> fromRatedTest;` -- the ONE word this block accepts in
        //  place of a number (DEV.md 4c C189): R_int is DERIVED by the unit
        //  from its module record's rated test, never typed.  The list form
        //  `<solute> ( fromRatedTest <id> );` names WHICH of the record's
        //  tests (slice 2).
        if (std::holds_alternative<std::vector<std::string>>(r->entryValue(k)))
        {
            const auto ws = r->lookupWordList(k);
            if (ws.size() != 2 || ws[0] != "fromRatedTest")
                throw std::runtime_error("transport constantRejection: the"
                    " intrinsic rejection of '" + k + "' is a word list -- the"
                    " one list this block accepts is `( fromRatedTest <id> )`,"
                    " naming a rated test of the module record by its id.");
            pendingRated_.push_back(k);
            ratedIds_[k] = ws[1];
            continue;
        }
        if (std::holds_alternative<std::string>(r->entryValue(k)))
        {
            const std::string w = r->lookupWord(k);
            if (w != "fromRatedTest")
                throw std::runtime_error("transport constantRejection: the"
                    " intrinsic rejection of '" + k + "' is the word `" + w
                    + "` -- write a number in [0, 1], or `fromRatedTest` to"
                      " derive it from the module record's rated test.");
            pendingRated_.push_back(k);
            continue;
        }
        const scalar R = r->lookupScalar(k, Dims::dimensionless);
        if (!std::isfinite(R) || R < 0.0 || R > 1.0)
            throw std::runtime_error("transport constantRejection: the"
                " intrinsic rejection of '" + k + "' is " + fmtR(R)
                + " -- it must lie in [0, 1] (0: the solute passes as it is"
                  " at the wall; 1: it is not passed at all).  A NEGATIVE"
                  " intrinsic rejection is a coupling between ions this law"
                  " does not have: `transport SDEM;` derives one from the"
                  " ions' permeances.");
        R_[k] = R;
    }
    if (R_.empty() && pendingRated_.empty())
        throw std::runtime_error(ctx + ": `rejection {}` is empty -- declare"
            " R_int for every solute of the feed.");
    read_ = true;
}

void ConstantRejection::setRatedRejection(const std::string& solute, scalar R_int)
{
    const auto it = std::find(pendingRated_.begin(), pendingRated_.end(), solute);
    if (it == pendingRated_.end())
        throw std::runtime_error("transport constantRejection: '" + solute
            + "' was not declared `fromRatedTest` -- nothing to derive.");
    if (!std::isfinite(R_int) || R_int < 0.0 || R_int > 1.0)
        throw std::runtime_error("transport constantRejection: the R_int"
            " derived for '" + solute + "' is " + fmtR(R_int)
            + ", outside [0, 1].");
    R_[solute] = R_int;
    pendingRated_.erase(it);
    derivedRated_.push_back(solute);
}

void ConstantRejection::resolveOnce(const TransportContext& ctx) const
{
    if (resolved_) return;
    if (!read_)
        throw std::runtime_error("transport constantRejection: no"
            " `transportParameters { rejection { <solute> <R_int>; ... }"
            " source \"...\"; }` in the unit's operation -- the law has no"
            " rejections without it.");
    if (!pendingRated_.empty())
        throw std::runtime_error("transport constantRejection: `rejection { "
            + pendingRated_.front() + " fromRatedTest; }` asks for R_int to be"
              " DERIVED from a module record's rated test, and this unit holds"
              " no module record to derive it from (only a spiralWoundModule"
              " with `module <name>;` does).  Declare the intrinsic rejection"
              " as a number, with its `source`.");

    const ThermoPackage& thermo = ctx.thermo;
    const std::size_t Ns = ctx.soluteIdx.size();
    ratio_.assign(Ns, 0.0);
    z_ = ctx.polarisation.zVector();
    if (z_.size() != Ns) z_.assign(Ns, 0);

    std::string soluteList;
    for (std::size_t s = 0; s < Ns; ++s)
        soluteList += std::string(s ? ", " : "") + thermo.comp(ctx.soluteIdx[s]).name();

    //  Every declared R names a solute of THIS feed -- a word nobody reads
    //  is refused, never ignored.
    for (const auto& kv : R_)
    {
        bool found = false;
        for (std::size_t s = 0; s < Ns; ++s)
            if (thermo.comp(ctx.soluteIdx[s]).name() == kv.first) { found = true; break; }
        if (!found)
            throw std::runtime_error("transport constantRejection: `rejection"
                " { " + kv.first + " ...; }` names no solute of this feed."
                "  The solutes are: " + soluteList + ".");
    }

    std::size_t nIons = 0;
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string nm = thermo.comp(ctx.soluteIdx[s]).name();
        const auto it = R_.find(nm);
        if (it == R_.end())
        {
            if (ctx.c_b[s] > 0.0)
                throw std::runtime_error("transport constantRejection: solute '"
                    + nm + "' is in the feed and has no intrinsic rejection --"
                      " declare it in transportParameters { rejection { " + nm
                    + " <R_int>; } }.  The law assumes none (a default R would"
                      " be a guess).");
            ratio_[s] = 0.0;      // absent from the feed: nothing to pass
        }
        else
            ratio_[s] = 1.0 - it->second;
        if (z_[s] != 0) ++nIons;
    }
    perIon_ = (nIons > 0);

    //  The banner: the law, what it was handed, and which way the
    //  electroneutrality question falls -- announced once, never silently.
    std::cout << "  [constantRejection] constant INTRINSIC rejection per"
                 " solute (Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20,"
                 " Eq. 1, R_i an input): c_p,i = (1 - R_i) c_m,i at the wall,"
                 " N_i = J_v c_p,i, J_v = A_w (dP - dpi); the record's A_w,"
                 " its permeabilities not read\n"
              << "  [constantRejection] R_int:";
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string nm = thermo.comp(ctx.soluteIdx[s]).name();
        std::cout << "  " << nm << " " << fmtR(1.0 - ratio_[s]);
        if (std::find(derivedRated_.begin(), derivedRated_.end(), nm)
            != derivedRated_.end())
            std::cout << " (derived from the rated test)";
    }
    std::cout << "   (source: " << source_ << ")\n";
    if (perIon_)
        std::cout << "  [constantRejection] " << nIons << " charged solute(s):"
                     " the declared R's are PER ION, which couples nothing --"
                     " the permeate's charge is checked at every station and a"
                     " charged permeate (relative charge > "
                  << fmtR(chargeTolerance) << ") is refused\n";
    else
        std::cout << "  [constantRejection] no charged solute: the R's are per"
                     " NEUTRAL solute (a salt is neutral), so the permeate is"
                     " electroneutral by construction\n";
    resolved_ = true;
}

TransportSolution ConstantRejection::localFluxes(const TransportContext& ctx) const
{
    resolveOnce(ctx);

    const Polarisation&        polar = ctx.polarisation;
    const MassTransferContext& hyd   = ctx.hydraulics;
    const std::vector<scalar>& c_b   = ctx.c_b;

    WallSolution lastWall;
    TransportSolution sol = detail::waterFluxNewton(ctx,
        [&](scalar Jw, std::vector<scalar>& cp)
        {
            return polar.wallWithPermeateRatio(hyd, Jw, c_b, ratio_,
                                               "constant-rejection closure", cp);
        },
        "transport constantRejection", lastWall);
    if (!(ctx.P_feed_Pa - ctx.P_perm_Pa > 0.0)) return sol;

    const std::size_t Ns = ctx.soluteIdx.size();
    for (std::size_t s = 0; s < Ns; ++s)
        sol.J_s[s] = sol.J_w * sol.c_p[s];          // Eq. (1): N_i = J_v c_p,i
    if (lastWall.coupled) { sol.xi = lastWall.xi; sol.hasXi = true; }

    //  THE PERMEATE CHARGE of an ion-declared feed (see the header).
    if (perIon_)
    {
        scalar q = 0.0, qa = 0.0, qm = 0.0, qma = 0.0;
        for (std::size_t s = 0; s < Ns; ++s)
        {
            q   += z_[s] * sol.c_p[s];
            qa  += std::abs(z_[s]) * sol.c_p[s];
            qm  += z_[s] * sol.c_m[s];
            qma += std::abs(z_[s]) * sol.c_m[s];
        }
        const scalar rel  = (qa  > 0.0) ? std::abs(q)  / qa  : 0.0;
        const scalar relm = (qma > 0.0) ? std::abs(qm) / qma : 0.0;
        if (rel > chargeTolerance)
        {
            std::string R;
            for (std::size_t s = 0; s < Ns; ++s)
                R += " " + ctx.thermo.comp(ctx.soluteIdx[s]).name() + " "
                   + fmtR(1.0 - ratio_[s]) + ";";
            throw std::runtime_error(
                "transport constantRejection: the declared per-ION rejections"
                " {" + R + " } give a CHARGED permeate at this station: sum z"
                " c_p = " + fmtR(q * 1.0e3) + " mol/m3 against sum |z| c_p = "
                + fmtR(qa * 1.0e3) + " mol/m3 (relative " + fmtR(rel)
                + " > " + fmtR(chargeTolerance) + "); the wall's own relative"
                  " charge is " + fmtR(relm) + ".  A constant rejection is a"
                  " property of each ion SEPARATELY, and nothing in this law"
                  " couples the ions, so an electroneutral permeate is reached"
                  " only by R's that are equal or tuned to ONE wall composition"
                  " -- and the wall composition moves along the channel.  A"
                  " charged permeate would be a current through a membrane with"
                  " no electrodes.  Remedies: declare the feed by SALTS"
                  " (components with `dissociatesTo`) and one R per salt, which"
                  " is electroneutral by construction; or select `transport"
                  " SDEM;`, which derives the split of the ions from their"
                  " permeances under zero current"
                + std::string(relm > chargeTolerance
                    ? "; and the WALL itself is charged -- declare"
                      " `polarisation { ionCoupling electroneutral; }`"
                    : "")
                + ".");
        }
    }
    return sol;
}

} // namespace membrane
} // namespace Choupo
