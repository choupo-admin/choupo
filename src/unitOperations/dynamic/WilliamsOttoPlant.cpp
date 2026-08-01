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

#include "WilliamsOttoPlant.H"
#include "streams/Composition.H"
#include "thermo/Component.H"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

//  Kinetics, paper eqs. (3.12)-(3.14):  k_i(T) = (a_i/rho) exp(-b_i/T),
//  T in degrees Rankine.  With V = Sum m_i/rho0 and every rho0 equal, rho
//  CANCELS out of every k_i*m_i*m_j/V term -- the model is scale-free in
//  rho.  The constants are kept verbatim anyway (the citation is the
//  spec), and the cancellation is the reader's to verify, not a rewrite.
namespace {
    constexpr scalar kA[3] = { 5.9755e9, 2.5962e12, 9.6283e15 };  // 1/h
    constexpr scalar kB[3] = { 12000.0, 15000.0, 20000.0 };       // degR
    constexpr scalar RHO0  = 50.0;                                // lb/ft3
    constexpr scalar KLB_PER_KMOL = 453.592;                      // the MW convention
}

void WilliamsOttoPlant::initialise(const DictPtr&       unitDict,
                                   const ThermoPackage& thermo,
                                   const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;

    //  Match the paper's species A,B,C,E,P,G to the case's components BY
    //  NAME.  The case may declare them in any order; the physics may not
    //  depend on it.
    static const char* names[6] = { "wo_A", "wo_B", "wo_C",
                                    "wo_E", "wo_P", "wo_G" };
    comp_.clear();
    for (const char* nm : names)
    {
        const std::size_t i = thermo.indexOf(nm);
        if (i >= thermo.n())
            throw std::runtime_error("williamsOttoPlant '" + name_ + "': the"
                " six Williams-Otto species wo_A..wo_G must all be declared"
                " components (missing '" + std::string(nm) + "')");
        //  The 1 kmol == 1 klb convention is what makes every numeral in
        //  the case read as the paper's.  Enforced, not assumed.
        if (std::abs(thermo.comp(i).MW() - KLB_PER_KMOL) > 1.0e-6)
            throw std::runtime_error("williamsOttoPlant '" + name_ + "': '"
                + std::string(nm) + "' must declare MW 453.592 (1 klb per"
                " kmol -- the unit convention that makes the case numerals"
                " the paper's klb values); found "
                + std::to_string(thermo.comp(i).MW()));
        comp_.push_back(i);
    }

    //  Initial holdup: the driver translates 0/internalState into
    //  initial { T; P; V; totalMoles; molarComposition{} }.  Masses come
    //  back out of totalMoles * x  [kmol == klb].
    auto initDict = unitDict->subDict("initial");
    const scalar T_K  = initDict->lookupScalar("T");
    P_bar_ = initDict->lookupScalarOrDefault("P", 1.013);
    const scalar nTot = initDict->lookupScalar("totalMoles");
    const sVector x = readComposition(initDict, thermo,
        "williamsOttoPlant '" + name_ + "' init");
    m_.assign(6, 0.0);
    for (std::size_t s = 0; s < 6; ++s) m_[s] = nTot * x[comp_[s]];

    //  The five controls, paper eq. (3.16).  Declared SI (kmol/h converts
    //  to kmol/s at the parser); internal units are the paper's.
    auto oper = unitDict->subDict("operation");
    FfA_ = oper->lookupScalar("F_fA", Dims::molarFlow) * 3600.0;  // klb/h
    FfB_ = oper->lookupScalar("F_fB", Dims::molarFlow) * 3600.0;
    mu_  = oper->lookupScalar("mu",   Dims::molarFlow) * 3600.0;
    eta_ = oper->lookupScalar("eta");
    if (eta_ < 0.0 || eta_ > 1.0)
        throw std::runtime_error("williamsOttoPlant '" + name_ + "': eta"
            " must be in [0,1]");
    T_R_ = T_K * 1.8;                                             // K -> degR

    std::cout << "  [williamsOttoPlant '" << name_ << "'] Williams-Otto"
                 " plant, eqs. (3.6)-(3.11) of arXiv:2004.07614 VERBATIM"
                 " (klb / h / degR internally; the paper's 'Reaumur' is"
                 " Rankine).\n"
              << "    boundary conventions: 1 kmol == 1 klb (MW 453.592,"
                 " enforced), T in K (x1.8 -> degR), time in s (/3600 -> h)\n"
              << "    controls: F_fA = " << FfA_ << ", F_fB = " << FfB_
              << ", mu = " << mu_ << " klb/h;  T = " << T_R_
              << " degR (" << T_K << " K);  eta = " << eta_ << "\n"
              << "    published anchor: x* = (3.27, 7.47, 1.12, 9.81, 1.69,"
                 " 0.22) klb at u* = (10, 20, 580, 129.5, 0.2)  [eq. 4.8]\n";
}

// ---------------------------------------------------------------------------
//  The Williams-Otto equations, paper (3.6)-(3.11), m in klb, rates klb/h:
//
//    dm_A/dt = F_fA + ((1-eta)mu - mu) m_A/m - k1 m_A m_B / V
//    dm_B/dt = F_fB + ((1-eta)mu - mu) m_B/m - k1 m_A m_B / V - k2 m_B m_C / V
//    dm_C/dt =        ((1-eta)mu - mu) m_C/m + 2 k1 m_A m_B / V
//                                            - 2 k2 m_B m_C / V - k3 m_C m_P / V
//    dm_E/dt =        ((1-eta)mu - mu) m_E/m + 2 k2 m_B m_C / V
//    dm_P/dt = 0.1(1-eta)mu m_E/m - mu m_P/m + k2 m_B m_C / V - 0.5 k3 m_C m_P / V
//    dm_G/dt =                    - mu m_G/m + 1.5 k3 m_C m_P / V
//
//  with m = Sum m_i and V = Sum m_i/rho0 (all rho0 = 50 lb/ft3).  The
//  recycle (1-eta)mu, the decanter (all G removed: no G returns), and the
//  column retention (the 0.1 m_E/m term returning bottoms P) are all
//  inside these terms -- the flowsheet IS the equation set.
// ---------------------------------------------------------------------------
sVector WilliamsOttoPlant::rates_(const sVector& m) const
{
    const scalar mA = m[0], mB = m[1], mC = m[2],
                 mE = m[3], mP = m[4], mG = m[5];
    scalar mt = 0.0;
    for (auto v : m) mt += std::max<scalar>(v, 0.0);
    if (mt <= 0.0) return sVector(6, 0.0);
    const scalar V = mt / RHO0;                       // Sum m_i/rho0, equal rho0

    const scalar k1 = kA[0] / RHO0 * std::exp(-kB[0] / T_R_);
    const scalar k2 = kA[1] / RHO0 * std::exp(-kB[1] / T_R_);
    const scalar k3 = kA[2] / RHO0 * std::exp(-kB[2] / T_R_);

    const scalar r1 = k1 * mA * mB / V;               // klb/h
    const scalar r2 = k2 * mB * mC / V;
    const scalar r3 = k3 * mC * mP / V;

    const scalar out = ((1.0 - eta_) * mu_ - mu_);    // the net -eta*mu draw

    sVector d(6, 0.0);
    d[0] = FfA_ + out * mA / mt - r1;
    d[1] = FfB_ + out * mB / mt - r1 - r2;
    d[2] =        out * mC / mt + 2.0 * r1 - 2.0 * r2 - r3;
    d[3] =        out * mE / mt + 2.0 * r2;
    d[4] = 0.1 * (1.0 - eta_) * mu_ * mE / mt - mu_ * mP / mt
                                 + r2 - 0.5 * r3;
    d[5] =                      - mu_ * mG / mt + 1.5 * r3;
    return d;
}

sVector WilliamsOttoPlant::odeDerivative(const sVector& y) const
{
    //  The driver's clock is SI seconds; the model's rates are per hour.
    sVector d = rates_(y);
    for (auto& v : d) v /= 3600.0;
    return d;
}

void WilliamsOttoPlant::step(scalar /*t*/, scalar dt)
{
    //  Classic RK4 on the six masses, dt in seconds -> hours inside.
    const scalar h = dt / 3600.0;
    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };
    const sVector k1 = rates_(m_);
    const sVector k2 = rates_(axpy(m_, h / 2, k1));
    const sVector k3 = rates_(axpy(m_, h / 2, k2));
    const sVector k4 = rates_(axpy(m_, h, k3));
    for (std::size_t i = 0; i < 6; ++i)
        m_[i] = std::max<scalar>(0.0,
            m_[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

// ---- Derived boundary streams [klb/h], eqs. (3.4), (3.5), (3.19) ----------
scalar WilliamsOttoPlant::FtP_() const
{
    scalar mt = 0.0; for (auto v : m_) mt += v;
    return mt > 0.0 ? mu_ * m_[4] / mt : 0.0;
}
scalar WilliamsOttoPlant::FtE_() const
{
    scalar mt = 0.0; for (auto v : m_) mt += v;
    return mt > 0.0 ? mu_ * m_[3] / mt : 0.0;
}
scalar WilliamsOttoPlant::FpP_() const { return FtP_() - 0.1 * FtE_(); }
scalar WilliamsOttoPlant::FwG_() const
{
    scalar mt = 0.0; for (auto v : m_) mt += v;
    return mt > 0.0 ? mu_ * m_[5] / mt : 0.0;
}

sVector WilliamsOttoPlant::stateVector() const
{
    sVector v(m_);
    v.push_back(T_R_ / 1.8);      // K, so the trajectory stays SI-readable
    //  The two benchmark responses, as first-class trajectory columns --
    //  in the paper's klb/h, SAID SO in the label, because these are the
    //  quantities its figures plot and its anchors quote.
    v.push_back(FpP_());
    v.push_back(FwG_());
    return v;
}

std::vector<std::string> WilliamsOttoPlant::stateLabels() const
{
    return { "wo_A", "wo_B", "wo_C", "wo_E", "wo_P", "wo_G", "T",
             "F_pP_klbh", "F_wG_klbh" };
}

ContinuousStream WilliamsOttoPlant::outletStream() const
{
    //  The reactor outlet F_t: total mu at the tank composition.
    ContinuousStream s;
    scalar mt = 0.0; for (auto v : m_) mt += v;
    s.F = mu_ / 3600.0;                     // klb/h == kmol/h -> kmol/s
    s.T = T_R_ / 1.8;
    s.P = P_bar_;
    s.z.assign(thermo_->n(), 0.0);
    if (mt > 0.0)
        for (std::size_t sIdx = 0; sIdx < 6; ++sIdx)
            s.z[comp_[sIdx]] = m_[sIdx] / mt;
    return s;
}

BalanceSnapshot WilliamsOttoPlant::balanceSnapshot() const
{
    BalanceSnapshot bs;
    const std::size_t N = thermo_->n();
    bs.componentNames.reserve(N);
    for (std::size_t i = 0; i < N; ++i)
        bs.componentNames.push_back(thermo_->comp(i).name());

    bs.inventory.assign(N, 0.0);
    for (std::size_t s = 0; s < 6; ++s) bs.inventory[comp_[s]] = m_[s];

    scalar mt = 0.0; for (auto v : m_) mt += v;
    auto face = [&](const std::string& id, BalanceFace::Direction dir)
    {
        BalanceFace f;
        f.id = name_ + "." + id;
        f.direction = dir;
        f.role = BalanceFace::Role::boundary;
        f.molarFlows.assign(N, 0.0);
        return f;
    };

    //  IN: the two fresh feeds (pure A, pure B).
    BalanceFace fa = face("feedA", BalanceFace::Direction::in);
    fa.molarFlows[comp_[0]] = FfA_ / 3600.0;
    BalanceFace fb = face("feedB", BalanceFace::Direction::in);
    fb.molarFlows[comp_[1]] = FfB_ / 3600.0;

    //  OUT: decanter waste (all G), column overhead (pure P), and the
    //  purge -- eta of the bottoms, which hold everything except G and
    //  the overhead P (0.1 F_tE of P stays in the bottoms, eq. 3.5).
    BalanceFace fw = face("waste", BalanceFace::Direction::out);
    fw.molarFlows[comp_[5]] = FwG_() / 3600.0;
    BalanceFace fp = face("product", BalanceFace::Direction::out);
    fp.molarFlows[comp_[4]] = std::max<scalar>(0.0, FpP_()) / 3600.0;
    BalanceFace fd = face("purge", BalanceFace::Direction::out);
    if (mt > 0.0)
    {
        const scalar Ft = mu_;
        auto ti = [&](std::size_t s) { return Ft * m_[s] / mt; };  // klb/h
        fd.molarFlows[comp_[0]] = eta_ * ti(0) / 3600.0;           // A
        fd.molarFlows[comp_[1]] = eta_ * ti(1) / 3600.0;           // B
        fd.molarFlows[comp_[2]] = eta_ * ti(2) / 3600.0;           // C
        fd.molarFlows[comp_[3]] = eta_ * ti(3) / 3600.0;           // E
        fd.molarFlows[comp_[4]] = eta_ * (0.1 * ti(3)) / 3600.0;   // bottoms P
    }
    bs.faces.push_back(std::move(fa));
    bs.faces.push_back(std::move(fb));
    bs.faces.push_back(std::move(fw));
    bs.faces.push_back(std::move(fp));
    bs.faces.push_back(std::move(fd));

    bs.materialAvailable = true;
    bs.materialReason.clear();

    //  Fictitious species: no elements datum exists or could honestly be
    //  invented, so the physical energy claim refuses BY NAME -- the same
    //  posture as compA/compB, and the correct one.
    bs.functional = BalanceSnapshot::EnergyFunctional::none;
    bs.physicalEnergyAvailable = false;
    bs.energyReason = "the Williams-Otto species are fictitious (no"
        " standardThermochemistry can honestly exist), so no stored"
        " energy functional is representable";
    return bs;
}

void WilliamsOttoPlant::setMV(const std::string& key, scalar value)
{
    if (key == "T")    { T_R_ = value * 1.8;    return; }   // K -> degR
    if (key == "F_fA") { FfA_ = value * 3600.0; return; }   // kmol/s -> klb/h
    if (key == "F_fB") { FfB_ = value * 3600.0; return; }
    if (key == "mu")   { mu_  = value * 3600.0; return; }
    if (key == "eta")
    {
        if (value < 0.0 || value > 1.0)
            throw std::runtime_error("williamsOttoPlant '" + name_ + "':"
                " eta must stay in [0,1]");
        eta_ = value;  return;
    }
    DynamicUnitOperation::setMV(key, value);
}

scalar WilliamsOttoPlant::getCV(const std::string& key) const
{
    scalar mt = 0.0; for (auto v : m_) mt += v;
    if (key == "T")       return T_R_ / 1.8;
    if (key == "m_total") return mt;
    if (key == "F_tP")    return FtP_() / 3600.0;
    if (key == "F_pP")    return FpP_() / 3600.0;
    if (key == "F_wG")    return FwG_() / 3600.0;
    static const char* nm[6] = { "wo_A","wo_B","wo_C","wo_E","wo_P","wo_G" };
    for (std::size_t s = 0; s < 6; ++s)
        if (key == std::string("m_") + nm[s]) return m_[s];
    return DynamicUnitOperation::getCV(key);
}

std::vector<std::string> WilliamsOttoPlant::availableMVs() const
{
    return { "T", "F_fA", "F_fB", "mu", "eta" };
}

std::vector<std::string> WilliamsOttoPlant::availableCVs() const
{
    return { "T", "m_total", "F_tP", "F_pP", "F_wG",
             "m_wo_A", "m_wo_B", "m_wo_C", "m_wo_E", "m_wo_P", "m_wo_G" };
}

} // namespace Choupo
