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
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "FrictionFactorCorrelation.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  THE LAMINAR LAW IS EXACT AND SHARED.  f = 64/Re is not a correlation --
//  it is the analytical solution of fully-developed laminar pipe flow, and
//  the wall roughness plays no part in it.  Three of the four turbulent
//  correlations below therefore delegate to it rather than each carrying a
//  copy: one home, and the one place where the answer is not a fit.
scalar laminar(scalar Re) { return 64.0 / Re; }

//  Below this the flow is laminar; above ~4000 it is fully turbulent.  The
//  band between is the transition, where NONE of the turbulent fits was
//  regressed and where the physics itself is not single-valued.
constexpr scalar Re_LAM = 2300.0;
constexpr scalar Re_TURB = 4000.0;

std::string regimeOf(scalar Re)
{
    if (Re < Re_LAM)  return "laminar";
    if (Re < Re_TURB) return "transition";
    return "turbulent";
}

// -------------------------------------------------------------------------
//  Blasius (1913).   f = 0.316 Re^-0.25
//
//  The smooth-pipe power law every course starts from.  It carries NO
//  roughness term, which is exactly why it is worth shipping beside the
//  others: asked about a rough pipe it answers confidently and is wrong, and
//  the only thing standing between a student and that answer is the window
//  it declares.
// -------------------------------------------------------------------------
class Blasius : public FrictionFactorCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    FrictionResult evaluate(const FrictionContext& c) const override
    {
        FrictionResult r;
        r.regime = regimeOf(c.Re);
        if (c.Re < Re_LAM)
        {
            r.f = laminar(c.Re);
            r.inValidity = false;
            r.validityNote = "Re < 2300: Blasius is a TURBULENT fit and does "
                             "not apply; the exact laminar law f = 64/Re was "
                             "used instead, and this is a substitution, not "
                             "an evaluation of Blasius";
            return r;
        }
        r.f = 0.316 * std::pow(c.Re, -0.25);
        if (c.relRough > 1.0e-6)
        {
            r.inValidity = false;
            r.validityNote = "Blasius carries NO roughness term.  It was "
                             "asked about a pipe with eps/D > 0 and answered "
                             "as though the wall were smooth";
        }
        else if (c.Re > 1.0e5)
        {
            r.inValidity = false;
            r.validityNote = "Re > 1e5 is beyond the range Blasius was fitted "
                             "over (4e3 .. 1e5)";
        }
        return r;
    }

    VerifyResult verify() const override
    {
        //  A CLOSED-FORM anchor: the correlation IS 0.316 Re^-0.25, so the
        //  published number at Re = 1e4 is 0.316 * 1e-1 = 0.0316 exactly.
        //  Anchoring a power law to its own arithmetic checks the code, not
        //  the physics, and this says so rather than implying more.
        VerifyResult v;
        FrictionContext c{1.0e4, 0.0};
        v.f_choupo = evaluate(c).f;
        v.f_published = 0.0316;
        v.dev = std::abs(v.f_choupo - v.f_published) / v.f_published;
        v.anchor = "Re = 1e4, smooth: f = 0.0316 -- the closed form itself "
                   "(Blasius, Forsch. Geb. Ing. 131, 1913).  This arm checks "
                   "the ARITHMETIC, not the physics";
        return v;
    }

private:
    std::string type_ = "Blasius";
    std::string window_ = "smooth pipe only (no roughness term), "
                          "4e3 <= Re <= 1e5";
    std::string cite_ = "Blasius, H. (1913), Forschungsheft des Vereins "
                        "deutscher Ingenieure 131, 1-41";
};

// -------------------------------------------------------------------------
//  Colebrook-White (1939), implicit.
//     1/sqrt(f) = -2 log10[ eps/D / 3.7 + 2.51 / (Re sqrt f) ]
//
//  The classical turbulent reference the Moody chart is drawn from, and what
//  every explicit fit approximates.  Solved by fixed-point iteration seeded
//  from Haaland, which converges in a handful of steps.
// -------------------------------------------------------------------------
scalar haaland_f(scalar Re, scalar relRough)
{
    const scalar t = std::pow(relRough / 3.7, 1.11) + 6.9 / Re;
    const scalar inv_sqrt = -1.8 * std::log10(t);
    return 1.0 / (inv_sqrt * inv_sqrt);
}

class Colebrook : public FrictionFactorCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    FrictionResult evaluate(const FrictionContext& c) const override
    {
        FrictionResult r;
        r.regime = regimeOf(c.Re);
        if (c.Re < Re_LAM)
        {
            r.f = laminar(c.Re);
            r.inValidity = false;
            r.validityNote = "Re < 2300: Colebrook-White is a turbulent "
                             "correlation; the exact laminar law was "
                             "substituted";
            return r;
        }
        scalar x = 1.0 / std::sqrt(haaland_f(c.Re, c.relRough));   // seed
        for (int it = 0; it < 50; ++it)
        {
            const scalar x_new =
                -2.0 * std::log10(c.relRough / 3.7 + 2.51 * x / c.Re);
            if (std::abs(x_new - x) < 1.0e-10) { x = x_new; break; }
            x = x_new;
        }
        r.f = 1.0 / (x * x);
        if (c.Re < Re_TURB)
        {
            r.inValidity = false;
            r.validityNote = "2300 < Re < 4000 is the TRANSITION band: no "
                             "turbulent correlation was regressed there and "
                             "the flow itself is not single-valued";
        }
        return r;
    }

    VerifyResult verify() const override
    {
        //  A point read off the Moody chart's own construction: fully rough
        //  turbulent flow, where the Colebrook equation collapses to the
        //  von Karman rough-wall law 1/sqrt(f) = -2 log10(eps/D / 3.7),
        //  independent of Re.  At eps/D = 0.01 that gives f = 0.03803...
        //  Taking the anchor in the LIMIT is deliberate: it is the one place
        //  where the implicit equation has a closed form to be checked
        //  against, so the arm tests the ITERATION rather than restating it.
        VerifyResult v;
        FrictionContext c{1.0e8, 0.01};       // Re high enough to be fully rough
        v.f_choupo = evaluate(c).f;
        const scalar inv = -2.0 * std::log10(0.01 / 3.7);
        v.f_published = 1.0 / (inv * inv);
        v.dev = std::abs(v.f_choupo - v.f_published) / v.f_published;
        v.anchor = "eps/D = 0.01, Re -> inf: the fully-rough von Karman limit "
                   "of the same equation, f = 0.0380.  Checks that the "
                   "fixed-point iteration reaches the closed form it must";
        return v;
    }

private:
    std::string type_ = "Colebrook";
    std::string window_ = "turbulent, Re >= 4000, all eps/D; implicit -- "
                          "solved by fixed point";
    std::string cite_ = "Colebrook, C. F. (1939), J. Inst. Civ. Eng. 11(4), "
                        "133-156";
};

// -------------------------------------------------------------------------
//  Haaland (1983).   1/sqrt(f) = -1.8 log10[ (eps/D / 3.7)^1.11 + 6.9/Re ]
//
//  An EXPLICIT fit to Colebrook, published as being within about 2 % of it
//  over the turbulent range.  Its anchor is therefore Colebrook itself --
//  which is the honest anchor, because agreeing with Colebrook is the whole
//  claim Haaland made.
// -------------------------------------------------------------------------
class Haaland : public FrictionFactorCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    FrictionResult evaluate(const FrictionContext& c) const override
    {
        FrictionResult r;
        r.regime = regimeOf(c.Re);
        if (c.Re < Re_LAM)
        {
            r.f = laminar(c.Re);
            r.inValidity = false;
            r.validityNote = "Re < 2300: Haaland is a turbulent fit; the "
                             "exact laminar law was substituted";
            return r;
        }
        r.f = haaland_f(c.Re, c.relRough);
        if (c.Re < Re_TURB)
        {
            r.inValidity = false;
            r.validityNote = "2300 < Re < 4000 is the transition band, "
                             "outside the fit";
        }
        return r;
    }

    VerifyResult verify() const override
    {
        //  THE ANCHOR IS COLEBROOK, and the tolerance is the 2 % Haaland
        //  himself claimed.  A fit's published claim is "I reproduce that
        //  equation this closely"; checking it against anything else would
        //  be checking a claim nobody made.
        VerifyResult v;
        FrictionContext c{1.0e5, 1.0e-4};
        v.f_choupo = evaluate(c).f;
        Colebrook ref;
        v.f_published = ref.evaluate(c).f;
        v.dev = std::abs(v.f_choupo - v.f_published) / v.f_published;
        v.anchor = "Re = 1e5, eps/D = 1e-4, against COLEBROOK at the same "
                   "point -- Haaland's own published claim is agreement "
                   "within ~2 %, so that equation is the anchor";
        return v;
    }

private:
    std::string type_ = "Haaland";
    std::string window_ = "turbulent, Re >= 4000; explicit fit to Colebrook, "
                          "claimed within ~2 %";
    std::string cite_ = "Haaland, S. E. (1983), J. Fluids Eng. 105(1), 89-90";
};

// -------------------------------------------------------------------------
//  Churchill (1977).  One expression for ALL Re and all eps/D:
//     f = 8 [ (8/Re)^12 + 1/(A+B)^1.5 ]^(1/12)
//     A = { -2.457 ln[ (7/Re)^0.9 + 0.27 eps/D ] }^16,  B = (37530/Re)^16
//
//  The only one of the four that answers below Re = 2300 without a
//  substitution -- it CONTAINS the laminar law as its own limit, which is
//  the property worth showing a student.
// -------------------------------------------------------------------------
class Churchill : public FrictionFactorCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    FrictionResult evaluate(const FrictionContext& c) const override
    {
        FrictionResult r;
        r.regime = regimeOf(c.Re);
        const scalar a_inner = std::pow(7.0 / c.Re, 0.9) + 0.27 * c.relRough;
        const scalar A = std::pow(-2.457 * std::log(a_inner), 16.0);
        const scalar B = std::pow(37530.0 / c.Re, 16.0);
        const scalar term = std::pow(8.0 / c.Re, 12.0)
                          + 1.0 / std::pow(A + B, 1.5);
        r.f = 8.0 * std::pow(term, 1.0 / 12.0);
        //  No validity note: the window IS all Re.  Saying nothing here is
        //  the correct report, and it is why this correlation is the default.
        return r;
    }

    VerifyResult verify() const override
    {
        //  THE ANCHOR IS THE LAMINAR LAW, which Churchill's expression must
        //  reproduce as its own low-Re limit.  That is a strong check: the
        //  formula was constructed to do it, and nothing about the code
        //  guarantees it -- a mis-typed exponent breaks this arm and leaves
        //  the turbulent branch looking fine.
        VerifyResult v;
        FrictionContext c{100.0, 0.0};
        v.f_choupo = evaluate(c).f;
        v.f_published = laminar(100.0);          // 0.64, exact
        v.dev = std::abs(v.f_choupo - v.f_published) / v.f_published;
        v.anchor = "Re = 100: must reproduce the EXACT laminar law f = 64/Re "
                   "= 0.64, which Churchill's expression contains as its own "
                   "limit.  A mis-typed exponent fails here while the "
                   "turbulent branch still looks plausible";
        return v;
    }

private:
    std::string type_ = "Churchill";
    std::string window_ = "ALL Re (laminar, transition and turbulent) and all "
                          "eps/D -- the only built-in with no gap";
    std::string cite_ = "Churchill, S. W. (1977), Chem. Eng. 84(24), 91-92";
};

} // anonymous namespace

std::map<std::string, FrictionFactorCorrelation::Factory>&
FrictionFactorCorrelation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void FrictionFactorCorrelation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<FrictionFactorCorrelation>
FrictionFactorCorrelation::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::ostringstream os;
        os << "FrictionFactorCorrelation: unknown model '" << name
           << "'.  Available:";
        for (const auto& kv : registry()) os << " " << kv.first;
        os << ".  (Registered explicitly in registerBuiltins() -- there is no"
              " auto-registration, so a model that is not in that function is"
              " not in the engine.)";
        throw std::runtime_error(os.str());
    }
    return it->second();
}

std::vector<std::string> FrictionFactorCorrelation::availableTypes()
{
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

void FrictionFactorCorrelation::registerBuiltins()
{
    registerType("Blasius",   []{ return std::make_unique<Blasius>(); });
    registerType("Colebrook", []{ return std::make_unique<Colebrook>(); });
    registerType("Haaland",   []{ return std::make_unique<Haaland>(); });
    registerType("Churchill", []{ return std::make_unique<Churchill>(); });
}

} // namespace Choupo
