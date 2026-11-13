// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
// Probe for bin/curate/check_psat_continuity.py (DEV.md 4c C245 slice 5a).
//
// Links the REAL vapour-pressure classes (via the library objects of the
// native build) and prints, one `key value...` line per fact, what the gate
// asserts.  It prints numbers and decides nothing, so the SAME probe can be
// run against the classes before the slice and after it (the gate's
// before/after evidence).  It uses only the public API that existed before the
// slice: Component::vp().Psat_Pa, range(), Tc(), saturationPressure().
//
//   usage: probe <repo root> <kind> <name> [<name> ...]
//     kind = file    names are components under data/standards/components
//     kind = wagner  names are built-in Wagner fixtures (see below)
//     kind = water   the IF97 edge test (name ignored)
#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/pureFluid/IF97WaterFluid.H"
#include "thermo/pureFluid/SaturationCurve.H"
#include "thermo/vaporPressure/AmbroseWalton.H"
#include "thermo/vaporPressure/Antoine.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/vaporPressure/Wagner.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>

using namespace Choupo;

namespace {

//  Fixtures for the Wagner form: the catalogue ships ONE Wagner record, so the
//  other two are declared here as dictionaries of the same grammar.  The
//  coefficients are the published Wagner-Pruss water set and the Setzmann-
//  Wagner methane set; this is a fixture for a SHAPE test, not a data record.
struct Fix { const char* name; const char* text; };
const Fix fixtures[] = {
 {"waterWagnerPruss",
  "name waterWP; MW 18.015; Tc 647.096; Pc 220.64; omega 0.344;\n"
  "vaporPressure { model Wagner; reducing { T 647.096; P 22.064e6; }\n"
  " coefficients (-7.85951783 1.84408259 -11.7866497 22.6807411 -15.9618719 1.80122502);\n"
  " exponents (1 1.5 3 3.5 4 7.5); Trange (273.16 647.096); }\n"},
 {"methaneWagner",
  "name methaneW; MW 16.043; Tc 190.564; Pc 45.992; omega 0.011;\n"
  "vaporPressure { model Wagner; reducing { T 190.564; P 4.5992e6; }\n"
  " coefficients (-6.00435 1.1885 -0.834082 -1.22833);\n"
  " exponents (1 1.5 2.5 5); Trange (90.7 190.564); }\n"},
};

//  (c) The models' own formula is protected.  A derived class exposes it with a
//  using-declaration, so the probe can set `Psat_Pa` against `computePsat`
//  without touching the production headers.
struct AntoineX : Antoine
{ using Antoine::Antoine; using Antoine::computePsat; };
struct AmbroseWaltonX : AmbroseWalton
{ using AmbroseWalton::AmbroseWalton; using AmbroseWalton::computePsat; };
struct WagnerX : Wagner
{ using Wagner::Wagner; using Wagner::computePsat; };

template <class M>
void bitwise(const char* label, M& m, double Tc)
{
    m.setCriticalT(Tc);
    const auto win = m.continuationWindow();
    long n = 0, bad = 0;
    const double hi = std::isfinite(win.second) ? win.second : 3.0 * Tc;
    for (int i = 0; i <= 2000; ++i)
    {
        const double T = win.first + (hi - win.first) * i / 2000.0;
        const double a = m.Psat_Pa(T), b = m.computePsat(T);
        ++n;
        if (std::memcmp(&a, &b, sizeof a) != 0) ++bad;
    }
    std::printf("c %s window %g %g checked %ld mismatches %ld\n", label,
                win.first, win.second, n, bad);
}

double lnp(const VaporPressureModel& m, double T) { return std::log(m.Psat_Pa(T)); }

void report(const Component& c)
{
    const VaporPressureModel& m = c.vp();
    const auto w = m.range();
    const double Tc = c.Tc();
    // (a) finite, positive, strictly increasing on [50 K, 1.5 Tc]
    int finite = 1, positive = 1, mono = 1;
    double prev = -1.0, Tbad = 0.0;
    const double T0 = 50.0, T1 = 1.5 * Tc;
    const int N = 4000;
    for (int i = 0; i <= N; ++i)
    {
        const double T = T0 + (T1 - T0) * i / N;
        const double p = m.Psat_Pa(T);
        if (!std::isfinite(p)) { finite = 0; Tbad = T; }
        if (!(p > 0.0)) { positive = 0; Tbad = T; }
        if (i > 0 && !(p > prev)) { if (mono) Tbad = T; mono = 0; }
        prev = p;
    }
    std::printf("comp %s model %s Tmin %g Tmax %g Tc %g\n", c.name().c_str(),
                m.modelName().c_str(), w.first, w.second, Tc);
    std::printf("a %s finite %d positive %d monotone %d firstBadT %g\n",
                c.name().c_str(), finite, positive, mono, Tbad);

    // (b) one-sided slopes of ln Psat at both edges (Tmin, Tc).
    //  A plain finite difference cannot certify 1e-6 at Tc: Ambrose-Walton and
    //  Wagner carry tau^1.5 terms, whose second derivative diverges there, so
    //  the stencil error goes as sqrt(h) (measured: ~1e-4 at h = 0.01 K).  The
    //  slope is therefore taken by RICHARDSON extrapolation of the 2nd-order
    //  one-sided stencil D(h) = D + c1 h^0.5 + c2 h + c3 h^1.5, four step
    //  sizes h0, h0/2, h0/4, h0/8; on a smooth edge the same combination is
    //  exact to its own round-off.
    auto stencil = [&](double T, double h, int dir) {
        const double hh = h * dir;
        return (-3 * lnp(m, T) + 4 * lnp(m, T + hh) - lnp(m, T + 2 * hh)) / (2 * hh); };
    auto slope = [&](double T, int dir) {
        const double h0 = 0.08;
        double A[4][5];
        for (int r = 0; r < 4; ++r)
        {
            const double h = h0 / double(1 << r);
            A[r][0] = 1.0; A[r][1] = std::sqrt(h); A[r][2] = h; A[r][3] = h * std::sqrt(h);
            A[r][4] = stencil(T, h, dir);
        }
        for (int c = 0; c < 4; ++c)              // Gauss, partial pivoting
        {
            int piv = c;
            for (int r = c + 1; r < 4; ++r) if (std::fabs(A[r][c]) > std::fabs(A[piv][c])) piv = r;
            for (int k = 0; k < 5; ++k) std::swap(A[c][k], A[piv][k]);
            for (int r = c + 1; r < 4; ++r)
            {
                const double f = A[r][c] / A[c][c];
                for (int k = c; k < 5; ++k) A[r][k] -= f * A[c][k];
            }
        }
        double x[4];
        for (int r = 3; r >= 0; --r)
        {
            double v = A[r][4];
            for (int k = r + 1; k < 4; ++k) v -= A[r][k] * x[k];
            x[r] = v / A[r][r];
        }
        return x[0];
    };
    auto slopeDown = [&](double T) { return slope(T, -1); };
    auto slopeUp   = [&](double T) { return slope(T, +1); };
    const bool hasWin = w.first > 0.0 && w.second > w.first;
    if (hasWin)
    {
        const double sD = slopeDown(w.first), sU = slopeUp(w.first);
        std::printf("b %s edge Tmin T %g slopeBelow %.10g slopeAbove %.10g rel %.3e\n",
                    c.name().c_str(), w.first, sD, sU, std::fabs(sD - sU) / std::fabs(sU));
    }
    {
        const double sD = slopeDown(Tc), sU = slopeUp(Tc);
        std::printf("b %s edge Tc T %g slopeBelow %.10g slopeAbove %.10g rel %.3e\n",
                    c.name().c_str(), Tc, sD, sU, std::fabs(sD - sU) / std::fabs(sU));
    }
    std::fflush(stdout);
}

} // namespace

int main(int argc, char** argv)
{
    if (argc < 3) return 2;
    const std::string root = argv[1], kind = argv[2];
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    try
    {
        if (kind == "file" || kind == "wagner")
        {
            for (int i = 3; i < argc; ++i)
            {
                DictPtr d;
                if (kind == "file")
                    d = Dictionary::fromFile(root + "/data/standards/components/"
                                             + argv[i] + ".dat");
                else
                {
                    for (const auto& f : fixtures)
                        if (std::string(f.name) == argv[i])
                            d = Dictionary::fromString(f.text, f.name);
                    if (!d) { std::printf("missing fixture %s\n", argv[i]); return 3; }
                }
                Component c;
                c.readFromDict(d);
                report(c);
            }
        }
        else if (kind == "bitwise")
        {
            //  The window the model derives, then the model's own formula
            //  compared bit for bit with the entry point across it.
            auto d1 = Dictionary::fromString(
                "model Antoine; coefficients (4.01814 1203.835 -53.226);"
                " Trange (287.7 354.07);", "antoine");
            AntoineX a(d1);       bitwise("Antoine", a, 562.05);
            auto d2 = Dictionary::fromString(
                "model AmbroseWalton; Tc 809; Pc 35.3; omega 1.05065;",
                "aw");
            AmbroseWaltonX w(d2); bitwise("AmbroseWalton", w, 809.0);
            auto d3 = Dictionary::fromString(fixtures[0].text, "wagner");
            auto d3v = d3->subDict("vaporPressure");
            WagnerX g(d3v);       bitwise("Wagner", g, 647.096);
        }
        else if (kind == "water")
        {
            DictPtr d = Dictionary::fromFile(root + "/data/standards/components/water.dat");
            Component c;
            c.readFromDict(d);
            IF97WaterFluid pf(18.01528);
            const auto w = pf.saturationWindow();
            const double e = 1e-9;   // K; the true change over 2e-9 K is ~1.5e-10 relative
            for (double edge : {w.first, w.second})
            {
                const double at = saturationPressure(c, &pf, edge);
                const double in = saturationPressure(c, &pf, edge == w.first ? edge + e : edge - e);
                const double out = saturationPressure(c, &pf, edge == w.first ? edge - e : edge + e);
                const double ref = pf.p_sat(edge);
                const double step = std::max(std::fabs(out - at), std::fabs(at - in)) / ref;
                std::printf("d edge %.3f at %.12g if97 %.12g inside %.12g outside %.12g"
                            " relStep %.3e\n", edge, at, ref, in, out, step);
            }
            // monotone across both edges
            int mono = 1; double prev = 0.0;
            for (double T = 200.0; T <= 900.0; T += 0.05)
            {
                const double p = saturationPressure(c, &pf, T);
                if (!(p > prev) || !std::isfinite(p)) mono = 0;
                prev = p;
            }
            std::printf("d monotone200to900 %d\n", mono);
        }
        else if (kind == "announce")
        {
            //  (e) a fresh model, three evaluations above Tc and three below
            //  Tmin: the advisory log must hold ONE entry per side, naming it.
            DictPtr d = Dictionary::fromFile(root + "/data/standards/components/"
                                             + argv[3] + ".dat");
            Component c;
            c.readFromDict(d);
            const auto w = c.vp().range();
            AdvisoryLog::instance().clear();
            for (int k = 0; k < 3; ++k) c.vp().Psat_Pa(1.2 * c.Tc());
            for (int k = 0; k < 3; ++k) c.vp().Psat_Pa(0.9 * w.first);
            int above = 0, below = 0;
            for (const auto& a : AdvisoryLog::instance().entries())
            {
                const bool mine = a.message.find("continu") != std::string::npos
                               && a.locus.find(c.name()) != std::string::npos;
                if (!mine) continue;
                if (a.message.find("ABOVE") != std::string::npos) ++above;
                if (a.message.find("BELOW") != std::string::npos) ++below;
            }
            std::printf("e entriesAbove %d entriesBelow %d\n", above, below);
        }
    }
    catch (const std::exception& ex)
    {
        std::printf("EXCEPTION %s\n", ex.what());
        return 1;
    }
    std::printf("probeDone 1\n");
    return 0;
}
