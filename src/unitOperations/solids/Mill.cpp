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

#include "unitOperations/solids/Mill.H"
#include "unitOperations/solids/millModel/MillModels.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "streams/PsdOnGrid.H"
#include "core/distribution/SizeGrid.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

using Matrix = std::vector<std::vector<scalar>>;

Matrix multiply(const Matrix& A, const Matrix& B)
{
    const std::size_t n = A.size();
    Matrix C(n, std::vector<scalar>(n, 0.0));
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t k = 0; k < n; ++k)
        {
            const scalar a = A[i][k];
            if (a == 0.0) continue;
            for (std::size_t j = 0; j < n; ++j) C[i][j] += a * B[k][j];
        }
    return C;
}

//  exp(M) by scaling and squaring with a Taylor series.  M has zero column
//  sums (mass conservation), and so has every power of it, so every term
//  of the series and every squaring keeps the column sums of exp(M) at one:
//  the conservation is exact in the algebra, not a tolerance.
Matrix expm(const Matrix& M)
{
    const std::size_t n = M.size();
    scalar norm = 0.0;                     // the 1-norm (max column sum of |M|)
    for (std::size_t j = 0; j < n; ++j)
    {
        scalar c = 0.0;
        for (std::size_t i = 0; i < n; ++i) c += std::abs(M[i][j]);
        norm = std::max(norm, c);
    }
    int s = 0;
    if (norm > 0.5) s = static_cast<int>(std::ceil(std::log2(norm / 0.5)));
    const scalar scale = std::ldexp(1.0, -s);
    Matrix A = M;
    for (auto& row : A) for (auto& v : row) v *= scale;
    Matrix E(n, std::vector<scalar>(n, 0.0)), term(n, std::vector<scalar>(n, 0.0));
    for (std::size_t i = 0; i < n; ++i) { E[i][i] = 1.0; term[i][i] = 1.0; }
    for (int k = 1; k <= 20; ++k)
    {
        term = multiply(term, A);
        for (auto& row : term) for (auto& v : row) v /= static_cast<scalar>(k);
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j) E[i][j] += term[i][j];
    }
    for (int q = 0; q < s; ++q) E = multiply(E, E);
    return E;
}

} // namespace


int Mill::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- Feed -----------------------------------------------------------
    auto feed = dict->subDict("feed");
    const scalar F  = feed->lookupScalar("F", Dims::molarFlow);
    const scalar T  = feed->lookupScalar("T", Dims::temperature);
    const scalar P  = feed->lookupScalar("P", Dims::pressure);
    const scalar vf = feed->lookupScalarOrDefault("vf", 0.0);
    sVector z(n, 0.0);
    if (dict->found("composition"))
    {
        auto comp = dict->subDict("composition");
        for (const auto& k : comp->keys()) z[thermo.indexOf(k)] = comp->lookupScalar(k);
    }
    if (!dict->found("solids"))
        throw std::runtime_error("mill: the feed carries no solids -- a mill "
            "grinds particles.");
    auto sol = dict->subDict("solids");
    sVector s(n, 0.0);
    {
        auto sf = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) s[thermo.indexOf(k)] = sf->lookupScalar(k);
    }
    scalar mDot = 0.0;                                       // solids kg/s
    for (std::size_t i = 0; i < n; ++i) if (s[i] > 0.0) mDot += s[i] * thermo.comp(i).MW();
    if (!(mDot > 0.0))
        throw std::runtime_error("mill: the feed's solid flow is zero.");

    // ---- The one size axis ----------------------------------------------
    if (!sol->found("sizeEdges"))
        throw std::runtime_error("mill: the feed's size distribution is not on "
            "the case's size grid.  A breakage population balance is written "
            "class by class, so the classes must be the case's: declare "
            "`sizeGrid { xMax; ratio; nClasses; }` in system/flowsheetDict and "
            "give the feed a `particleSizeDistribution` "
            "(docs/design/c361-solids-processing.md).");
    const std::vector<scalar> edges = sol->lookupList("sizeEdges");
    const std::vector<scalar> xRep  = sol->lookupList("diameters");
    std::vector<scalar> f           = sol->lookupList("massFractions");
    const std::size_t   nc          = f.size();
    if (edges.size() != nc + 1 || xRep.size() != nc)
        throw std::runtime_error("mill: the feed's size distribution is "
            "malformed (edges, sizes and fractions disagree in length).");
    {
        scalar sf = 0.0; for (auto v : f) sf += v;
        if (!(sf > 0.0)) throw std::runtime_error("mill: the feed's size "
            "fractions sum to zero.");
        for (auto& v : f) v /= sf;
    }

    // ---- Models ---------------------------------------------------------
    if (!dict->found("model"))
    {
        std::string avail;
        for (const auto& m : SelectionFunction::availableTypes()) avail += " " + m;
        throw std::runtime_error("mill: no `model` -- the selection function "
            "is the case's choice, not the engine's.  Registered:" + avail);
    }
    const std::string selName = dict->lookupWord("model");
    auto oper = dict->subDict("operation");
    auto sel  = SelectionFunction::New(selName);
    if (!oper->found("selection"))
        throw std::runtime_error("mill: `operation { selection { ... } }` is "
            "missing -- the parameters of the '" + selName + "' law.");
    sel->readParameters(oper->subDict("selection"));
    if (!oper->found("breakage"))
        throw std::runtime_error("mill: `operation { breakage { model ...; } }` "
            "is missing -- where the fragments of each class land.");
    auto bdict = oper->subDict("breakage");
    if (!bdict->found("model"))
    {
        std::string avail;
        for (const auto& m : BreakageFunction::availableTypes()) avail += " " + m;
        throw std::runtime_error("mill: `breakage { model ...; }` is missing.  "
            "Registered:" + avail);
    }
    auto brk = BreakageFunction::New(bdict->lookupWord("model"));
    brk->readParameters(bdict);

    // ---- Residence ------------------------------------------------------
    const bool hasRes = oper->found("residence");
    const std::string residence = hasRes ? oper->lookupWord("residence") : "plugFlow";
    if (residence != "plugFlow" && residence != "perfectlyMixed")
        throw std::runtime_error("mill: `residence` is `plugFlow` or "
            "`perfectlyMixed` (Austin 1971 eqs. 49 and 44a); got '" + residence + "'.");

    // ---- Energy: exactly one of W_shaft / specificEnergy -----------------
    const bool hasW = oper->found("W_shaft"), hasE = oper->found("specificEnergy");
    if (hasW == hasE)
        throw std::runtime_error("mill: declare EXACTLY ONE of `W_shaft` (the "
            "net shaft power) and `specificEnergy` (per kg of solids); the "
            "other follows from the solids flow.");
    const scalar W = hasW ? oper->lookupScalar("W_shaft", Dims::power)
                          : oper->lookupScalar("specificEnergy", Dims::specificEnergy) * mDot;
    if (W < 0.0) throw std::runtime_error("mill: the shaft power cannot be negative.");
    const scalar E = W / mDot;                               // J/kg

    MillContext ctx;
    ctx.E = E;
    const bool hasTau = oper->found("residenceTime"), hasH = oper->found("holdup");
    if (sel->basis() == "time")
    {
        if (hasTau == hasH)
            throw std::runtime_error("mill: the '" + selName + "' selection "
                "function is a RATE (1/time), so the mill needs EXACTLY ONE of "
                "`residenceTime` and `holdup` (the solids mass in the mill; "
                "tau = holdup / solids flow, Austin 1971 eq. 46).");
        ctx.tau = hasTau ? oper->lookupScalar("residenceTime", Dims::time)
                         : oper->lookupScalar("holdup", Dims::mass) / mDot;
    }
    else if (hasTau || hasH)
        throw std::runtime_error("mill: the '" + selName + "' selection function "
            "is ENERGY-specific -- the extent is S^E E and needs no residence "
            "time (Herbst & Fuerstenau 1980 eq. 10).  Remove `residenceTime` / "
            "`holdup`; the specific energy decides.");

    // ---- Extents and the breakage matrix --------------------------------
    std::vector<scalar> kappa = sel->extent(xRep, ctx);
    if (edges[0] <= 0.0) kappa[0] = 0.0;                     // the pan does not break
    //  b[i][j], i < j: the share of class j's fragments landing in class i.
    //  The parent's size is its LOWER edge (King eq. 5.79: breakage is out
    //  of the class), so b_{j-1,j} = 1 - B(e_{j-1}/e_j) and the pan takes
    //  B(e_1/e_j).  The column sums telescope to B(1) - B(0) = 1.
    Matrix b(nc, std::vector<scalar>(nc, 0.0));
    for (std::size_t j = 1; j < nc; ++j)
    {
        const scalar y = edges[j];
        for (std::size_t i = 0; i < j; ++i)
        {
            const scalar up = brk->B(edges[i + 1] / y);
            const scalar lo = (edges[i] > 0.0) ? brk->B(edges[i] / y) : 0.0;
            b[i][j] = up - lo;
        }
    }

    // ---- Solve ----------------------------------------------------------
    std::vector<scalar> p(nc, 0.0);
    if (residence == "plugFlow")
    {
        Matrix M(nc, std::vector<scalar>(nc, 0.0));
        for (std::size_t j = 0; j < nc; ++j)
        {
            M[j][j] = -kappa[j];
            for (std::size_t i = 0; i < j; ++i) M[i][j] = b[i][j] * kappa[j];
        }
        const Matrix X = expm(M);
        for (std::size_t i = 0; i < nc; ++i)
            for (std::size_t j = 0; j < nc; ++j) p[i] += X[i][j] * f[j];
    }
    else
    {
        for (std::size_t ii = nc; ii-- > 0;)
        {
            scalar src = f[ii];
            for (std::size_t j = ii + 1; j < nc; ++j) src += b[ii][j] * kappa[j] * p[j];
            p[ii] = src / (1.0 + kappa[ii]);
        }
    }
    scalar sumF = 0.0, sumP = 0.0;
    for (std::size_t i = 0; i < nc; ++i) { sumF += f[i]; sumP += p[i]; }
    const scalar closure = sumP - sumF;

    ParticleSizeDistribution feedPsd, prodPsd;
    feedPsd.edges = edges; feedPsd.diameter = xRep; feedPsd.massFrac = f;
    prodPsd.edges = edges; prodPsd.diameter = xRep; prodPsd.massFrac = p;
    const PsdMoments mf = psdMoments(edges, xRep, f);
    const PsdMoments mp = psdMoments(edges, xRep, p);

    // ---- Energy: adiabatic, T_out from H(out) = H(in) + W ---------------
    auto H = [&](scalar Tx)
    {
        scalar h = flashState::priceSolids(s, Tx, thermo);   // kW
        if (F > 0.0)
            h += flashState::priceState(Tx, P, z, F, false, vf, thermo,
                                        "mill outlet", nullptr);
        return h;
    };
    scalar Hin = 0.0;
    try { Hin = H(T); }
    catch (const std::exception& ex)
    {
        throw std::runtime_error(std::string("mill: the feed cannot be priced "
            "on the elements datum, so the temperature rise from the shaft work "
            "cannot be computed: ") + ex.what());
    }
    const scalar target = Hin + W / 1000.0;                 // kW
    scalar lo = T, hi = T + 50.0;
    for (int k = 0; k < 40 && H(hi) < target; ++k) hi += 50.0;
    for (int k = 0; k < 200 && (hi - lo) > 1e-10; ++k)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (H(mid) < target) lo = mid; else hi = mid;
    }
    const scalar Tout = (W > 0.0) ? 0.5 * (lo + hi) : T;

    // ---- Bond, beside it ------------------------------------------------
    bool   haveBond = false;
    scalar Wi = 0.0, WBond = 0.0;
    if (oper->found("bond"))
    {
        auto bd = oper->subDict("bond");
        if (!bd->found("workIndex"))
            throw std::runtime_error("mill: `bond { workIndex ...; }` is missing "
                "its work index.");
        Wi = bd->lookupScalar("workIndex", Dims::specificEnergy);
        WBond = BondEnergy::specificEnergy(Wi, mf.d80, mp.d80);
        haveBond = true;
    }

    // ---- Outlet ---------------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "product";
    out.F = F; out.T = Tout; out.P = P; out.z = z; out.vf = vf;
    out.s = s;
    out.psd = prodPsd;
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["W_shaft_kW"]          = W / 1000.0;
    kpis_["specificEnergy_kWh_t"] = E / 3600.0;
    kpis_["solidsMassFlow_kg_s"] = mDot;
    if (ctx.tau > 0.0) kpis_["residenceTime_s"] = ctx.tau;
    kpis_["T_out"]               = Tout;
    kpis_["dT_K"]                = Tout - T;
    kpis_["sizeMassClosure"]     = closure;
    publishPsdKpis(kpis_, "feed_", feedPsd);
    publishPsdKpis(kpis_, "product_", prodPsd);
    if (mp.d80 > 0.0) kpis_["reductionRatio80"] = mf.d80 / mp.d80;
    kpis_["topClassRemaining"]   = (f.back() > 0.0) ? p.back() / f.back() : 0.0;
    if (haveBond)
    {
        kpis_["bond_workIndex_kWh_t"]      = Wi / 3600.0;
        kpis_["bond_specificEnergy_kWh_t"] = WBond / 3600.0;
        if (WBond > 0.0)
        {
            kpis_["bond_ratio"]                 = E / WBond;
            kpis_["bond_operatingWorkIndex_kWh_t"] = Wi * E / WBond / 3600.0;
        }
    }
    const MillAnchor aS = sel->verify();
    const MillAnchor aB = brk->verify();
    const MillAnchor aW = BondEnergy::verify();
    kpis_["anchor_selection_dev"] = aS.dev;
    kpis_["anchor_breakage_dev"]  = aB.dev;
    kpis_["anchor_bond_dev"]      = aW.dev;

    // ---- Profile: the classes, feed and product -------------------------
    UnitProfile prof;
    prof.xAxis = "x_um";
    std::vector<scalar> xc, fc, pc, kc, Fc, Pc;
    scalar Uf = 0.0, Up = 0.0;
    for (std::size_t i = 0; i < nc; ++i)
    {
        Uf += f[i]; Up += p[i];
        xc.push_back(edges[i + 1] * 1e6);                      // the class's upper edge
        fc.push_back(f[i]); pc.push_back(p[i]); kc.push_back(kappa[i]);
        Fc.push_back(Uf);   Pc.push_back(Up);
    }
    prof.columns["x_um"]             = xc;
    prof.columns["feed_massFrac"]    = fc;
    prof.columns["product_massFrac"] = pc;
    prof.columns["extent"]           = kc;
    prof.columns["feed_passing"]     = Fc;
    prof.columns["product_passing"]  = Pc;
    profile_ = prof;

    // ---- Report ---------------------------------------------------------
    if (verbosity >= 1)
    {
        std::cout << "\n=========================  Mill Result  ==========================\n"
                  << "  Selection:    " << selName << "   " << sel->describe() << "\n"
                  << "                " << sel->citation() << "\n"
                  << "  Breakage:     " << brk->type() << "   " << brk->describe() << "\n"
                  << "  Residence:    " << residence
                  << (hasRes ? "" : "   (default: no `residence` declared)") << "\n";
        if (ctx.tau > 0.0)
            std::cout << "  tau:          " << std::fixed << std::setprecision(3)
                      << ctx.tau << " s   (" << ctx.tau / 60.0 << " min)\n";
        std::cout << std::setprecision(4)
                  << "  Solids:       " << mDot * 3600.0 / 1000.0 << " t/h on "
                  << nc << " classes\n"
                  << "  Shaft power:  " << W / 1000.0 << " kW  ->  E = "
                  << E / 3600.0 << " kWh/t  (" << (hasW ? "W_shaft declared" : "specificEnergy declared") << ")\n";
        if (sel->basis() == "time")
            std::cout << "                the '" << selName << "' rates do not read E: "
                         "the shaft power is PRICED (heat), it does not grind here\n";
        std::cout << "  T_out:        " << Tout << " K   (adiabatic: all the shaft work "
                     "becomes heat, H(out) = H(in) + W)\n"
                  << "  F80 -> P80:   " << mf.d80 * 1e6 << " -> " << mp.d80 * 1e6
                  << " um;  d50 " << mf.d50 * 1e6 << " -> " << mp.d50 * 1e6
                  << " um;  Sauter " << mf.d32 * 1e6 << " -> " << mp.d32 * 1e6 << " um\n"
                  << std::scientific << std::setprecision(3)
                  << "  Size classes: SUM p - SUM f = " << closure
                  << "  (mass closure of the population balance)\n" << std::fixed
                  << std::setprecision(4);
        if (haveBond)
        {
            std::cout << "  Bond (cross-check, NOT the mill's answer): Wi = "
                      << Wi / 3600.0 / 1.10231131 << " kWh/short ton;  W_Bond(F80->P80) = "
                      << WBond / 3600.0 << " kWh/t  vs  E = " << E / 3600.0 << " kWh/t";
            if (WBond > 0.0)
                std::cout << "  (ratio " << E / WBond << ";  operating Wio = "
                          << Wi * E / WBond / 3600.0 / 1.10231131 << " kWh/short ton)";
            std::cout << "\n                " << BondEnergy::citation() << "\n";
        }
        auto line = [](const char* what, const MillAnchor& a)
        {
            std::cout << "  [anchor] " << what << ": " << std::setprecision(5)
                      << a.choupo << " vs " << a.published << "  (dev "
                      << std::setprecision(3) << 100.0 * a.dev << " %, " << a.kind
                      << ")  " << a.where << "\n";
        };
        line(sel->type().c_str(), aS);
        line(("breakage " + brk->type()).c_str(), aB);
        line("bond", aW);
        if (verbosity >= 2)
        {
            std::cout << "  class   upper edge [um]   feed      extent     product\n";
            for (std::size_t i = nc; i-- > 0;)
                std::cout << "  " << std::setw(4) << i << "   " << std::setw(12)
                          << edges[i + 1] * 1e6 << "   " << std::setw(8) << f[i]
                          << "  " << std::setw(9) << kappa[i] << "  "
                          << std::setw(8) << p[i] << "\n";
        }
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
