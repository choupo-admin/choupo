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

#include "ElectrodialysisStack.H"
#include "Electrochem.H"

#include "core/Constants.H"
#include "solver/NewtonRaphson.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // findIon, ionCharge

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

namespace fs = std::filesystem;

constexpr scalar MW_WATER_KG = 0.0180153;   // kg/mol (molality closure; matches IonExchanger)

// One channel's ionic state, derived ONCE per pass from a stream.
struct ChannelState
{
    std::vector<std::string> ion;        // species key (Na, Cl, ...)
    std::vector<scalar>      z;          // charge
    std::vector<scalar>      m;          // molality [mol/kg water]
    std::vector<scalar>      gamma;      // Davies activity coefficient
    scalar                   I = 0.0;    // ionic strength [mol/kg]
    scalar                   kappa = 0.0;// specific conductivity [S/m]
    scalar                   c_eq = 0.0; // equivalent concentration [mol/m3] (for i_lim)
};

// One IEM (cation- or anion-exchange) membrane's read-in properties.
struct IEMSpec
{
    std::string name;
    scalar      R_area    = 0.0;   // Ohm.m2
    scalar      t_cu      = 0.0;   // counter-ion transport number
    scalar      thickness = 0.0;   // m
};

// Read a `kind IEM` membrane-pair file (case-local constant/membranes first,
// then data/standards/assets) -- the stack's OWN reader, so the standard
// solution-diffusion Membrane reader is never bent to fit IEMs.
void readIEMPair(const std::string& name, IEMSpec& cem, IEMSpec& aem)
{
    fs::path file;
    // case-local overlay (the standard fractal cascade)
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            const fs::path cand = p / "constant" / "membranes" / (name + ".dat");
            if (fs::exists(cand)) { file = cand; break; }
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
    }
    if (file.empty())
    {
        // ONE resolver (sealing redesign): the mirrored constant/assets/<name>.dat
        // is the case-local tier, else the standards catalogue -- a SEALED case
        // reads its own mirror ONLY (resolveRecord returns empty when sealed +
        // absent, and the loud refusal below fires).
        const fs::path cand = records::resolveRecord("assets/" + name + ".dat");
        if (!cand.empty() && fs::exists(cand)) file = cand;
    }
    if (file.empty())
        throw std::runtime_error("electrodialysisStack: IEM membrane '" + name
            + "' not found in constant/membranes/ or constant/assets/ (case) or "
              "data/standards/assets/");

    auto d = Dictionary::fromFile(file.string());
    if (d->lookupWordOrDefault("kind", "") != "IEM")
        throw std::runtime_error("electrodialysisStack: membrane '" + name
            + "' is not `kind IEM` -- electrodialysis needs an ion-exchange "
              "membrane pair (cem{} + aem{}), not a solution-diffusion membrane");

    auto readLeg = [&](const std::string& leg) -> IEMSpec
    {
        if (!d->found(leg))
            throw std::runtime_error("electrodialysisStack: IEM '" + name
                + "' has no `" + leg + "` sub-dict (need cem{} and aem{})");
        auto sd = d->subDict(leg);
        IEMSpec s;
        s.name      = sd->lookupWordOrDefault("name", leg);
        s.R_area    = sd->lookupScalar("R_area");      // Ohm.m2 (raw SI)
        s.t_cu      = sd->lookupScalar("t_cu");
        s.thickness = sd->lookupScalar("thickness");   // m
        if (s.t_cu <= 0.5 || s.t_cu > 1.0)
            throw std::runtime_error("electrodialysisStack: IEM '" + name + "." + leg
                + "' t_cu must be in (0.5, 1] (counter-ion transport number); got "
                + std::to_string(s.t_cu));
        return s;
    };
    cem = readLeg("cem");
    aem = readLeg("aem");
}

// Build the ionic state of a channel from a feed stream (mole fractions),
// freezing the Davies gammas ONCE.  Reuses the electrolyte stack (AqueousActivity
// "davies") -- NO parallel gamma implementation.
ChannelState buildChannel(const ThermoPackage& thermo, const sVector& z,
                          std::size_t iWater, scalar T,
                          const electrolyte::AqueousActivity& act)
{
    const scalar z_water = z[iWater];
    if (z_water <= 0.0)
        throw std::runtime_error("electrodialysisStack: a channel feed has no "
            "water -- electrodialysis needs an aqueous carrier (water component)");
    const scalar molesWaterPerKg = 1.0 / MW_WATER_KG;

    ChannelState ch;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        if (i == iWater) continue;
        if (z[i] <= 0.0) continue;
        const std::string nm = thermo.comp(i).name();
        if (!electrolyte::findIon(nm))
            throw std::runtime_error("electrodialysisStack: component '" + nm
                + "' has no row in ions.dat -- electrodialysis needs an IONIC "
                  "water analysis (Na, Cl, ... + water)");
        ch.ion.push_back(nm);
        ch.z.push_back(static_cast<scalar>(electrolyte::ionCharge(nm)));
        ch.m.push_back((z[i] / z_water) * molesWaterPerKg);   // mol/kg water
    }
    if (ch.ion.empty())
        throw std::runtime_error("electrodialysisStack: a channel carries no "
            "ions -- nothing to transport");

    // ionic strength I = 0.5 sum m_i z_i^2
    scalar I = 0.0;
    for (std::size_t k = 0; k < ch.m.size(); ++k) I += ch.m[k] * ch.z[k] * ch.z[k];
    ch.I = 0.5 * I;

    // Davies gammas, frozen for the pass (the reused electrolyte interface).
    electrolyte::IonState st;
    st.name = ch.ion; st.molality = ch.m; st.charge = ch.z; st.I = ch.I; st.T = T;
    auto res = act.evaluate(st, T);
    ch.gamma.resize(ch.m.size());
    for (std::size_t k = 0; k < ch.m.size(); ++k) ch.gamma[k] = res.gamma(ch.z[k]);

    // Specific conductivity kappa [S/m] from the ION D0 tier via Nernst-Einstein:
    //   lambda_i = z_i^2 F^2 D0_i / (R T)   [S m2/mol]   (equivalent conductance)
    //   kappa    = sum c_i lambda_i,  c_i [mol/m3] ~ m_i * rho_water
    // (dilute approximation rho ~ 1000 kg/m3; the unit ANNOUNCES it).
    const scalar rho_w = 1000.0;                 // kg/m3 (dilute carrier approx)
    scalar kappa = 0.0, c_eq = 0.0;
    for (std::size_t k = 0; k < ch.m.size(); ++k)
    {
        const scalar D0 = electrochem::ionD0(ch.ion[k]);            // m2/s
        const scalar lam = ch.z[k] * ch.z[k] * electrochem::Faraday
                         * electrochem::Faraday * D0 / (constant::R * T);  // S m2/mol
        const scalar c_i = ch.m[k] * rho_w;                        // mol/m3
        kappa += c_i * lam;
        c_eq  += c_i * std::abs(ch.z[k]);                          // eq/m3
    }
    ch.kappa = kappa;
    ch.c_eq  = 0.5 * c_eq;   // equivalent concentration of the salt (cation eq = anion eq)
    return ch;
}

} // namespace

// ---------------------------------------------------------------------------
int ElectrodialysisStack::solve(const DictPtr& dict,
                                const ThermoPackage& thermo,
                                int verbosity)
{
    products_.clear();
    kpis_.clear();
    const std::size_t Ncomp = thermo.n();

    // ---- Two inputs: diluate feed + concentrate feed -----------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("electrodialysisStack: expected exactly 2 input "
            "streams (diluate-feed concentrate-feed); got "
            + std::to_string(ins.size())
            + ".  Declare  inputs ( diluateFeed concentrateFeed );");

    struct Feed { sVector z; scalar F = 0, T = 0, P = 0, vf = 0; };
    auto readFeed = [&](const DictPtr& sd) -> Feed
    {
        Feed f;
        f.F  = sd->lookupScalar("F", Dims::molarFlow);
        f.T  = sd->lookupScalar("T", Dims::temperature);
        f.P  = sd->lookupScalar("P", Dims::pressure);
        f.vf = sd->lookupScalarOrDefault("vf", 0.0);
        f.z.assign(Ncomp, 0.0);
        auto cd = sd->subDict("composition");
        scalar sum = 0.0;
        for (const auto& kk : cd->keys()) f.z[thermo.indexOf(kk)] = cd->lookupScalar(kk);
        for (auto v : f.z) sum += v;
        if (sum > 0.0) for (auto& v : f.z) v /= sum;
        return f;
    };
    Feed dil = readFeed(ins[0]);
    Feed con = readFeed(ins[1]);
    const scalar T = dil.T;     // isothermal stack (announced)

    const std::size_t iWater = thermo.indexOf("water");   // loud if absent

    // ---- operation{} hardware ---------------------------------------------
    auto op = dict->subDict("operation");
    const int N = static_cast<int>(op->lookupScalar("N_cellpairs"));
    if (N <= 0)
        throw std::runtime_error("electrodialysisStack: N_cellpairs must be > 0");

    const scalar xi = op->lookupScalarOrDefault("xi", 0.9);
    if (xi <= 0.0 || xi > 1.0)
        throw std::runtime_error("electrodialysisStack: xi (current efficiency) "
            "must be in (0, 1]; got " + std::to_string(xi));

    const scalar area = op->lookupScalar("membraneArea", Dims::area);          // m2
    const scalar h_ch = op->lookupScalar("channelThickness", Dims::length);    // m
    const scalar vel  = op->lookupScalarOrDefault("linearVelocity", 0.05, Dims::velocity); // m/s
    const scalar E_el = op->lookupScalarOrDefault("E_electrodes", 0.0);        // V (lumped)
    const std::string memName = op->lookupWordOrDefault("membrane", "CMX_AMX");

    const bool haveI      = op->found("current");
    const bool haveTarget = op->found("targetDemin");
    if (haveI == haveTarget)
        throw std::runtime_error("electrodialysisStack: give EITHER `current "
            "<I> A;` (the applied current) OR `targetDemin <fraction>;` (solve I "
            "for that diluate demineralisation) -- exactly one.");

    // ---- IEM membrane pair (the stack's own reader) ------------------------
    IEMSpec cem, aem;
    readIEMPair(memName, cem, aem);

    // ---- Frozen Davies activity model (reused electrolyte stack) -----------
    auto act = electrolyte::AqueousActivity::New("davies");

    // Build channel states ONCE per pass (NOT inside any inner I loop).
    ChannelState chD = buildChannel(thermo, dil.z, iWater, T, *act);
    ChannelState chC = buildChannel(thermo, con.z, iWater, T, *act);

    // mol/s of each transferable ion entering the diluate channel (the cap on
    // what current can remove).  Per ion: F_dil [kmol/s] * 1000 * z_frac.
    // We track removal per ION via the molality fraction of the diluate feed.

    // ---- Cowan-Brown limiting current density (INLINE; one model in v1) -----
    // i_lim = z F k c_dil / (t_cu - t_co),  t_co = 1 - t_cu (CEM convention).
    // Mass-transfer coefficient k from a simple Leveque-type Sherwood estimate
    // for the thin spacer channel (the honest "simple correlation over theory"
    // rung -- ANNOUNCED):
    //     Sh = 1.85 (Re Sc d_h / L)^(1/3),   k = Sh D / d_h
    // with d_h ~ 2 h_channel (slit), Re = v d_h / nu, Sc = nu / D.  The cross-
    // flow velocity `linearVelocity` therefore SETS k -- the student sees the
    // limiting current rise with flow.  nu = water kinematic viscosity (~1e-6
    // m2/s at 25 C, dilute-carrier approximation, announced).  L ~ membraneArea
    // / channel-width is unknown here; we use a representative L = 0.5 m and
    // announce it (an explicit operation key can override later).
    scalar D_mean = 0.0;
    for (const auto& nm : chD.ion) D_mean += electrochem::ionD0(nm);
    D_mean /= static_cast<scalar>(chD.ion.size());
    const scalar d_h   = 2.0 * h_ch;                     // slit hydraulic diameter [m]
    const scalar nu    = 1.0e-6;                         // m2/s (water, 25 C, announced)
    const scalar L_ch  = op->lookupScalarOrDefault("channelLength", 0.5, Dims::length); // m
    const scalar Re    = vel * d_h / nu;
    const scalar Sc    = nu / D_mean;
    const scalar Sh    = 1.85 * std::cbrt(std::max(Re * Sc * d_h / L_ch, 1.0e-12));
    const scalar k_mt  = Sh * D_mean / d_h;              // m/s
    const scalar t_cu = cem.t_cu;                        // CEM counter-ion (cation) tn
    const scalar t_co = 1.0 - t_cu;
    const scalar z_lim = 1.0;                            // monovalent salt basis (NaCl)
    // i_lim uses the DILUATE bulk equivalent concentration (the depleting side).
    const scalar i_lim = z_lim * electrochem::Faraday * k_mt * chD.c_eq
                       / (t_cu - t_co);                  // A/m2

    // ---- Stack voltage as a function of current I --------------------------
    // E_mem (per cell pair): CEM passes cations, AEM passes anions; each sees
    // the (concentrate/diluate) activity ratio of its counter-ion.  We take the
    // mean cation and mean anion activity ratio across the channels.
    auto meanActRatio = [&](scalar sign) -> scalar
    {
        // sign > 0: cations; sign < 0: anions.  Geometric mean of a_conc/a_dil.
        scalar lr = 0.0; int n = 0;
        for (std::size_t kc = 0; kc < chC.ion.size(); ++kc)
        {
            if ((chC.z[kc] > 0) != (sign > 0)) continue;
            // matching ion in the diluate
            for (std::size_t kd = 0; kd < chD.ion.size(); ++kd)
                if (chD.ion[kd] == chC.ion[kc])
                {
                    const scalar aC = chC.gamma[kc] * chC.m[kc];
                    const scalar aD = chD.gamma[kd] * chD.m[kd];
                    if (aC > 0 && aD > 0) { lr += std::log(aC / aD); ++n; }
                }
        }
        return (n > 0) ? std::exp(lr / n) : 1.0;
    };
    const scalar rCat = meanActRatio(+1.0);
    const scalar rAn  = meanActRatio(-1.0);
    // Nernst potential of each membrane (counter-ion charge magnitude 1 for NaCl).
    const scalar E_cem = electrochem::nernst(+1.0, rCat, T);   // cation across CEM
    const scalar E_aem = electrochem::nernst(-1.0, 1.0 / rAn, T); // anion across AEM (a_conc/a_dil w/ z<0)
    const scalar E_mem_pair = E_cem + E_aem;                   // V per cell pair

    // Solution resistances per cell pair (one diluate + one concentrate channel):
    //   R_sol = thickness / (kappa * area)   [Ohm]   per channel
    auto R_solution = [&](const ChannelState& ch) -> scalar
    {
        if (ch.kappa <= 0.0) return 0.0;
        return h_ch / (ch.kappa * area);
    };
    const scalar R_dil  = R_solution(chD);
    const scalar R_conc = R_solution(chC);
    const scalar R_cem  = cem.R_area / area;     // Ohm
    const scalar R_aem  = aem.R_area / area;     // Ohm
    const scalar R_pair = R_cem + R_aem + R_dil + R_conc;   // Ohm per cell pair

    // U(I) = N (E_mem_pair + I * R_pair) + E_electrodes
    auto stackVoltage = [&](scalar I) -> scalar
    {
        return static_cast<scalar>(N) * (E_mem_pair + I * R_pair) + E_el;
    };

    // ---- Determine the current I -------------------------------------------
    // demineralisation per ion is set by Faraday: the diluate loses, per ion,
    //   dn_i = xi * I / (z_i F) * N   [mol/s]   (counter-ions; here the salt)
    // demin ratio = dn_salt / n_salt_in_diluate.
    // The diluate salt INFLOW [mol/s of equivalents removed basis]:
    //   n_in_i = F_dil[kmol/s]*1000 * (z_frac_i)   -- per ion mole flow.
    auto diluateIonInflow = [&](const std::string& nm) -> scalar
    {
        const std::size_t i = thermo.indexOf(nm);
        return dil.F * 1000.0 * dil.z[i];   // mol/s
    };

    scalar I = 0.0;
    bool   solvedI = false;
    if (haveI)
    {
        I = op->lookupScalar("current");   // A (raw)
    }
    else
    {
        const scalar target = op->lookupScalar("targetDemin");
        if (target <= 0.0 || target >= 1.0)
            throw std::runtime_error("electrodialysisStack: targetDemin must be "
                "in (0, 1); got " + std::to_string(target));
        // Use the FIRST cation as the reference counter-ion for the demin target.
        std::string refIon;
        for (std::size_t k = 0; k < chD.ion.size(); ++k)
            if (chD.z[k] > 0) { refIon = chD.ion[k]; break; }
        if (refIon.empty()) refIon = chD.ion.front();
        const scalar z_ref = static_cast<scalar>(electrolyte::ionCharge(refIon));
        const scalar n_in  = diluateIonInflow(refIon);   // mol/s
        // demin(I) = (xi I N)/(|z| F) / n_in - target = 0  (linear -> direct, but
        // solved via Newton-1D to KEEP the glass-box solver visible).
        auto f  = [&](scalar Icur) {
            const scalar removed = electrochem::faradayMolarRate(Icur, std::abs(z_ref), xi)
                                 * static_cast<scalar>(N);
            return removed / n_in - target;
        };
        auto df = [&](scalar Icur) { const scalar d = 1e-3; return (f(Icur+d)-f(Icur-d))/(2*d); };
        solver::NROptions nro;
        nro.tolerance = 1e-8; nro.maxIter = 50;
        nro.lower = 0.0; nro.upper = 1e7; nro.bracket = true;
        nro.monotoneIncreasing = true;
        const scalar I0 = std::abs(z_ref) * electrochem::Faraday * n_in * target
                        / (xi * std::max(1, N));
        auto r = solver::newton1D(f, df, std::max(I0, 1e-3), nro);
        I = r.x; solvedI = true;
        recordResidual(std::abs(r.residual));
        if (verbosity >= 3)
            std::cout << "  [solve I] targetDemin " << target << " on ion " << refIon
                      << "  ->  I = " << I << " A  (Newton, " << r.iterations
                      << " it, residual " << std::scientific << r.residual
                      << std::fixed << ")\n";
    }
    if (I < 0.0)
        throw std::runtime_error("electrodialysisStack: current I must be >= 0");

    const scalar i_dens = I / area;        // A/m2 (current density)

    // ---- Faraday transfer: move ions diluate -> concentrate ----------------
    products_.resize(2);
    ProcessStream& outD = products_[0];
    ProcessStream& outC = products_[1];
    outD.name = "diluate"; outC.name = "concentrate";
    outD.T = dil.T; outD.P = dil.P; outD.vf = dil.vf; outD.F = dil.F;
    outC.T = con.T; outC.P = con.P; outC.vf = con.vf; outC.F = con.F;
    sVector FzD(Ncomp, 0.0), FzC(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        FzD[i] = dil.F * dil.z[i];     // kmol/s per component (diluate)
        FzC[i] = con.F * con.z[i];     // kmol/s per component (concentrate)
    }

    // Per counter-ion molar transfer (Faraday), capped at the diluate inflow
    // (cannot remove more than is present -- announce if it binds).
    bool capBound = false;
    scalar removedRef = 0.0, refInflow = 0.0;
    std::string refIonName;
    for (std::size_t k = 0; k < chD.ion.size(); ++k)
    {
        const std::string nm = chD.ion[k];
        const std::size_t i  = thermo.indexOf(nm);
        const scalar zmag    = std::abs(chD.z[k]);
        scalar dn = electrochem::faradayMolarRate(I, zmag, xi)
                  * static_cast<scalar>(N);            // mol/s for THIS ion
        const scalar avail = FzD[i] * 1000.0;          // mol/s present in diluate
        if (dn > avail) { dn = avail; capBound = true; }
        const scalar dn_kmol = dn / 1000.0;            // kmol/s
        FzD[i] -= dn_kmol;
        FzC[i] += dn_kmol;
        if (refIonName.empty() && chD.z[k] > 0)
        { refIonName = nm; removedRef = dn; refInflow = avail; }
    }

    // Re-mole-fraction the two product streams (water unchanged; F constant --
    // ion transfer is mole-for-mole charge-balanced, water carrier dominates).
    auto finalise = [&](ProcessStream& s, const sVector& Fz)
    {
        scalar Ftot = 0.0; for (auto v : Fz) Ftot += v;
        s.F = Ftot;
        s.z.assign(Ncomp, 0.0);
        if (Ftot > 0.0) for (std::size_t i = 0; i < Ncomp; ++i) s.z[i] = Fz[i] / Ftot;
    };
    finalise(outD, FzD);
    finalise(outC, FzC);

    // ---- Stack voltage, power, efficiencies --------------------------------
    const scalar U = stackVoltage(I);
    const scalar W_electric = U * I;        // W
    const scalar overLimit  = (i_lim > 0.0) ? i_dens / i_lim : 0.0;

    // demin ratio (reference cation)
    const scalar demin = (refInflow > 0.0) ? removedRef / refInflow : 0.0;

    // current efficiency actually realised (counter-ion equivalents moved / charge)
    // ~ xi by construction unless capped; report the capped value.
    const scalar curEff = (I > 0.0)
        ? (removedRef * std::abs(static_cast<scalar>(electrolyte::ionCharge(
              refIonName.empty() ? chD.ion.front() : refIonName)))
           * electrochem::Faraday) / (I * static_cast<scalar>(N))
        : 0.0;

    // specific energy [kWh / m3 of diluate product].  Diluate volumetric flow ~
    // water molar flow * MW_water / rho.
    const scalar Fwater_kmol_s = outD.F * outD.z[iWater];      // kmol/s water in diluate
    const scalar Q_dil_m3_s = Fwater_kmol_s * 1000.0 * MW_WATER_KG / 1000.0; // m3/s
    const scalar specEnergy = (Q_dil_m3_s > 0.0)
        ? (W_electric / 1000.0) / (Q_dil_m3_s * 3600.0)        // kW / (m3/h) = kWh/m3
        : 0.0;

    // ---- Glass-box report --------------------------------------------------
    if (verbosity >= 3)
    {
        std::cout << "\n=====================  Electrodialysis Stack  ====================\n";
        std::cout << std::fixed;
        std::cout << "  Membrane pair:   " << memName << "  (CEM " << cem.name
                  << ", AEM " << aem.name << ")\n";
        std::cout << "  N cell pairs:    " << N << "\n";
        std::cout << "  Active area:     " << std::setprecision(4) << area
                  << " m2 / membrane\n";
        std::cout << "  Current eff. xi: " << std::setprecision(3) << xi
                  << "   (ANNOUNCED default 0.9 unless set)\n";
        std::cout << "  Mass-transfer k: " << std::scientific << std::setprecision(3)
                  << k_mt << " m/s  (Sh=" << std::fixed << Sh
                  << ", D_mean=" << std::scientific << D_mean
                  << ", d_h=" << d_h << ")\n" << std::fixed;
        std::cout << "  Davies I (dil):  " << std::setprecision(4) << chD.I
                  << " mol/kg   kappa_dil = " << std::setprecision(4) << chD.kappa
                  << " S/m\n";
        std::cout << "  Davies I (con):  " << std::setprecision(4) << chC.I
                  << " mol/kg   kappa_con = " << std::setprecision(4) << chC.kappa
                  << " S/m\n";
        std::cout << "  --- potentials (per cell pair) ---\n";
        std::cout << "  E_mem  = " << std::setprecision(5) << E_mem_pair
                  << " V   (CEM " << E_cem << " + AEM " << E_aem
                  << ", from REAL Davies activities)\n";
        std::cout << "  R_pair = " << std::setprecision(5) << R_pair
                  << " Ohm   (CEM " << R_cem << " + AEM " << R_aem
                  << " + dil " << R_dil << " + conc " << R_conc << ")\n";
        std::cout << "  E_ohmic= " << std::setprecision(5) << (I * R_pair)
                  << " V  at I = " << std::setprecision(3) << I << " A\n";
        std::cout << "  E_electrodes (lumped, ANNOUNCED): " << std::setprecision(4)
                  << E_el << " V  (no Butler-Volmer in v1)\n";
        std::cout << "  --- current ---\n";
        std::cout << "  I        = " << std::setprecision(3) << I << " A"
                  << (solvedI ? "  (solved for targetDemin)" : "  (specified)") << "\n";
        std::cout << "  i (dens) = " << std::setprecision(2) << i_dens << " A/m2\n";
        std::cout << "  i_lim    = " << std::setprecision(2) << i_lim
                  << " A/m2  (Cowan-Brown; t_cu=" << std::setprecision(3) << t_cu
                  << ", t_co=" << t_co << ")\n";
        std::cout << "  i/i_lim  = " << std::setprecision(3) << overLimit << "\n";
        std::cout << "  --- stack ---\n";
        std::cout << "  U        = " << std::setprecision(3) << U << " V\n";
        std::cout << "  P=U*I    = " << std::setprecision(3) << (W_electric/1000.0)
                  << " kW  (W_electric, on the energy wire)\n";
        std::cout << "  demin    = " << std::setprecision(4) << (100.0*demin)
                  << " %  (ion " << (refIonName.empty()?chD.ion.front():refIonName)
                  << ")\n";
        std::cout << "  spec.E   = " << std::setprecision(4) << specEnergy
                  << " kWh/m3 diluate\n";
        std::cout << "==================================================================\n";
    }

    // ---- LOUD warnings (no silent crutch / no silent clamp) ----------------
    if (overLimit > 1.0)
    {
        std::cerr << "[WARNING] electrodialysisStack: OVER-LIMITING CURRENT -- "
                  << "i = " << std::fixed << std::setprecision(2) << i_dens
                  << " A/m2 EXCEEDS i_lim = " << i_lim << " A/m2 (i/i_lim = "
                  << std::setprecision(3) << overLimit << ").  The diluate-side "
                     "boundary layer is ion-depleted: water splitting / pH swings "
                     "set in, current efficiency collapses and the membranes are "
                     "stressed.  Choupo does NOT clamp the current -- the result is "
                     "the unclamped Faraday transfer; reduce I (or raise the flow / "
                     "concentration) to run below the limiting current.\n";
    }
    if (capBound)
        std::cerr << "[WARNING] electrodialysisStack: the requested Faraday "
                     "transfer would remove MORE of an ion than the diluate feed "
                     "carries -- transfer was capped at the available inflow "
                     "(the diluate is fully demineralised for that ion).  Reduce "
                     "the current or N_cellpairs.\n";

    // ---- KPIs --------------------------------------------------------------
    kpis_["U"]                        = U;
    kpis_["I"]                        = I;
    kpis_["i_density"]                = i_dens;
    kpis_["i_lim"]                    = i_lim;
    kpis_["i_over_ilim"]              = overLimit;
    kpis_["current_efficiency"]       = curEff;
    kpis_["specific_energy_kWh_per_m3"] = specEnergy;
    kpis_["demin_ratio"]              = demin;
    kpis_["N_cellpairs"]              = static_cast<scalar>(N);
    kpis_["W_electric"]               = W_electric;
    kpis_["W_electric_kW"]            = W_electric / 1000.0;
    kpis_["E_mem_pair"]               = E_mem_pair;
    kpis_["R_pair"]                   = R_pair;

    return 0;
}

} // namespace Choupo
