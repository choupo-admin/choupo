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
Class
    Choupo::BatchDiafilter

Description
    Implementation.  The model, its closures and everything it does NOT
    claim are documented in BatchDiafilter.H -- read that first.
\*---------------------------------------------------------------------------*/

#include "BatchDiafilter.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "streams/Composition.H"
#include "unitOperations/membrane/BulkConversion.H"
#include "unitOperations/membrane/osmotic/OsmoticModel.H"
#include "unitOperations/membrane/transport/TransportModel.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>

namespace Choupo {

//  Out of line so the unique_ptr destructors see complete model types.
BatchDiafilter::BatchDiafilter()  = default;
BatchDiafilter::~BatchDiafilter() = default;

const std::string& BatchDiafilter::type() const
{
    static const std::string t = "batchDiafilter";
    return t;
}

// ---------------------------------------------------------------------------
//  initialise
// ---------------------------------------------------------------------------
void BatchDiafilter::initialise(const DictPtr&       unitDict,
                                const ThermoPackage& thermo,
                                const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t N = thermo.n();

    compNames_.clear();
    MW_.assign(N, 0.0);
    for (std::size_t i = 0; i < N; ++i)
    {
        compNames_.push_back(thermo.comp(i).name());
        MW_[i] = thermo.comp(i).MW();
    }

    verbosity_ = thermoAnnounceLevel();
    if (unitDict->found("solver"))
        verbosity_ = static_cast<int>(
            unitDict->subDict("solver")->lookupScalarOrDefault("verbosity",
                                                               verbosity_));

    auto op = unitDict->subDict("operation");

    // ---- the membrane, and the models that read it -----------------------
    membraneName_ = op->lookupWord("membrane");
    membrane_     = &MembraneRegistry::byName(membraneName_);

    if (op->found("osmotic"))
    {
        auto os  = op->subDict("osmotic");
        osmotic_ = OsmoticModel::New(
                       os->lookupWordOrDefault("model", "vanHoff"));
        osmotic_->readParameters(os);
    }
    else
        osmotic_ = OsmoticModel::New("vanHoff");

    membrane::TransportModel::registerBuiltins();
    transport_ = membrane::TransportModel::New(
                     op->lookupWordOrDefault("transport", "solutionDiffusion"));
    if (op->found("transport") && op->found("transportParameters"))
        transport_->readParameters(op->subDict("transportParameters"));

    area_   = op->lookupScalar("area", Dims::area);
    P_feed_ = op->lookupScalar("P_feed", Dims::pressure);
    P_perm_ = op->lookupScalarOrDefault("P_permeate", 0.0, Dims::pressure);

    //  THE POLARISATION COEFFICIENT IS DECLARED, NEVER INVENTED.
    //  k_film is a property of the hydrodynamics -- stirrer speed, cell
    //  geometry, crossflow velocity -- and this unit is told none of them.
    //  The steady module can correlate it because it knows its channel; a
    //  stirred cell's correlation depends on a geometry no dictionary here
    //  describes.  So it is required, and the refusal says why rather than
    //  quietly standing in a number.
    if (!op->found("k_film"))
        throw std::runtime_error(
            "batchDiafilter '" + name() + "': `k_film` is REQUIRED and was not"
            " declared.  The concentration-polarisation coefficient is a"
            " property of this rig's hydrodynamics (stirrer speed, cell or"
            " loop geometry), and this unit is told none of them -- there is"
            " no correlation it could apply without inventing the geometry."
            "  Declare `k_film <value> m/s;` in `operation {}`; a large value"
            " (say 1e-3 m/s) is the un-polarised limit and says so out loud.");
    kFilm_ = op->lookupScalar("k_film", Dims::massTransferCoeff);

    //  rho: the dilute-aqueous solution density the whole conversion closes
    //  on (BulkConversion.H).  Announced when it defaults -- the steady
    //  module takes 1000 silently, which is a crutch this unit does not
    //  inherit.
    if (op->found("rho"))
        rho_ = op->lookupScalar("rho", Dims::density);
    else
    {
        rho_ = 1000.0;
        const std::string msg =
            "no `rho` declared -- the solution mass density every"
            " concentration in this vessel is closed on DEFAULTS to 1000"
            " kg/m3 (pure water at 4 C).  For a concentrated retentate this"
            " biases every c_i and therefore every flux; declare `rho`.";
        if (AdvisoryLog::instance().add("model", "warning",
                                        "batchDiafilter '" + name() + "'", msg)
            && verbosity_ >= 1)
            std::cout << "  [advisory] " << msg << "\n";
    }
    rhoDia_ = op->lookupScalarOrDefault("rho_diafiltrate", rho_, Dims::density);

    // ---- fouling: absent unless declared -----------------------------------
    if (op->found("fouling"))
    {
        auto fd = op->subDict("fouling");
        const std::string law = fd->lookupWord("law");
        if (law == "cake")              foulingLaw_ = FoulingLaw::Cake;
        else if (law == "intermediate") foulingLaw_ = FoulingLaw::Intermediate;
        else if (law == "standard" || law == "complete")
            throw std::runtime_error(
                "batchDiafilter '" + name() + "': Hermia's `" + law + "` law"
                " describes a change in pore-INTERNAL geometry, which this"
                " unit's lumped permeance (one A_eff for the whole membrane)"
                " cannot represent honestly.  It is REFUSED rather than"
                " approximated by a neighbouring law that would fit the data"
                " and mean something else.  Declare `cake` (a deposited layer)"
                " or `intermediate` (progressive pore blocking) if either"
                " describes your feed.");
        else
            throw std::runtime_error(
                "batchDiafilter '" + name() + "': unknown fouling law '" + law
                + "'.  Implemented: `cake`, `intermediate` (Hermia 1982);"
                  " `standard` and `complete` refuse by name with the reason.");

        foulingK_ = fd->lookupScalar("k");

        //  A BLOCKING LAW IS A CLAIM ABOUT A MECHANISM.  The engine cannot
        //  know whether a deposited layer or a blocked pore describes this
        //  feed, and picking one silently would put a mechanism in the
        //  reader's mouth.  The author states it, in writing, beside the
        //  number.
        if (!fd->found("reason"))
            throw std::runtime_error(
                "batchDiafilter '" + name() + "': the `fouling {}` block needs"
                " a `reason \"...\";`.  A blocking law is a claim about a"
                " MECHANISM -- `cake` asserts a deposited layer, `intermediate`"
                " asserts pores being covered -- and nothing in this engine can"
                " tell which describes your material.  Say why this law fits"
                " this feed, so a reader of the answer can judge it.");
        foulingReason_ = fd->lookupWordOrDefault("reason", "");
    }

    const std::string mode = op->lookupWordOrDefault("mode", "concentration");
    if (mode == "constantVolume")      constantVolume_ = true;
    else if (mode == "concentration")  constantVolume_ = false;
    else
        throw std::runtime_error(
            "batchDiafilter '" + name() + "': unknown mode '" + mode
            + "'.  Known modes: `concentration` (no diafiltrate; the vessel"
              " shrinks and solutes concentrate) and `constantVolume`"
              " (solvent made up as fast as it permeates; solutes wash out).");

    // ---- solutes and their permeabilities ---------------------------------
    bool haveWater = false;
    for (std::size_t i = 0; i < N; ++i)
        if (compNames_[i] == "water") { iWater_ = i; haveWater = true; break; }
    if (!haveWater)
        throw std::runtime_error(
            "batchDiafilter '" + name() + "': no component named `water`."
            "  The transport laws in this tree assume an aqueous carrier and"
            " price the solvent flux as water; name the carrier `water` or"
            " use a unit that does not make that assumption.");

    soluteIdx_.clear();
    B_s_.clear();
    for (std::size_t i = 0; i < N; ++i)
    {
        if (i == iWater_) continue;
        if (!thermo.comp(i).isNonvolatile()) continue;
        soluteIdx_.push_back(i);
        const scalar Bi = membrane_->B_s(compNames_[i]);
        B_s_.push_back(Bi);
        if (Bi == 0.0 && verbosity_ >= 1)
            std::cout << "  WARNING  membrane '" << membraneName_
                      << "' has no B_s entry for solute '" << compNames_[i]
                      << "' --- assuming perfect rejection (B_s = 0)\n";
    }

    // ---- the initial charge, from 0/internalState -------------------------
    //  choupoBatch re-inserts each vessel's `0/internalState` block as
    //  `initial{}` -- the SINGLE source of truth for a holdup; an inline
    //  block in flowsheetDict is refused by the driver.  Same grammar and
    //  the same `readComposition` helper every other vessel reads, so a
    //  student who can author a batch reactor can author this.
    auto init = unitDict->subDict("initial");
    state_.T  = init->lookupScalar("T");
    state_.P  = init->lookupScalar("P");
    state_.vf = 0.0;                              // a retentate is a liquid
    const scalar nTot = init->lookupScalar("totalMoles");
    const sVector x   =
        readComposition(init, thermo, "batchDiafilter '" + name() + "' init");
    state_.n.assign(N, 0.0);
    for (std::size_t i = 0; i < N; ++i) state_.n[i] = nTot * x[i];

    if (state_.totalMoles() <= 0.0)
        throw std::runtime_error(
            "batchDiafilter '" + name() + "': the initial holdup is empty."
            "  A vessel's initial state lives in `0/internalState`.");

    n0_  = state_.n;
    V0_  = volumeOf(state_.n);
    state_.V = V0_;
    nLastDischarge_ = state_.n;

    //  The initial observed rejection per solute -- the number the classical
    //  washout law would be evaluated at, taken from THIS run rather than
    //  declared, so the comparison it feeds cannot be arranged.
    const Fluxes f0 = evaluate(state_.n);
    R0_s_.assign(soluteIdx_.size(), 0.0);
    for (std::size_t s = 0; s < soluteIdx_.size(); ++s)
        R0_s_[s] = (f0.c_b[s] > 0.0) ? 1.0 - f0.c_p[s] / f0.c_b[s] : 1.0;

    if (verbosity_ >= 2)
    {
        std::cout << "\n=== batchDiafilter '" << name() << "' ===\n"
                  << "  membrane   " << membraneName_
                  << "   transport " << transport_->type()
                  << "   osmotic " << osmotic_->type() << "\n"
                  << "  mode       " << mode
                  << (constantVolume_
                          ? "  (solvent made up at the permeate rate)\n"
                          : "  (no diafiltrate; the vessel shrinks)\n")
                  << "  area       " << area_ << " m2"
                  << "   TMP " << (P_feed_ - P_perm_) / 1.0e5 << " bar"
                  << "   k_film " << kFilm_ << " m/s\n"
                  //  A DECLARED model choice is announced with the reason
                  //  the author gave for it: a blocking law names a
                  //  mechanism, and the reader must be able to weigh it.
                  << (foulingLaw_ == FoulingLaw::None
                        ? std::string("  fouling    NONE declared -- the flux"
                                      " declines only through the physics"
                                      " (osmotic pressure, polarisation)\n")
                        : "  fouling    Hermia "
                          + std::string(foulingLaw_ == FoulingLaw::Cake
                                          ? "CAKE (a deposited layer)"
                                          : "INTERMEDIATE (pore blocking)")
                          + ", k = " + [&]{ std::ostringstream o;
                              o << std::scientific
                                << std::setprecision(3) << foulingK_;
                              return o.str(); }()
                          + "\n             declared because: " + foulingReason_
                          + "\n")
                  << "  V0         " << std::scientific << std::setprecision(4)
                  << V0_ << " m3" << std::defaultfloat
                  << "   J_w(0) " << f0.J_w * 3.6e6 << " LMH\n";
        for (std::size_t s = 0; s < soluteIdx_.size(); ++s)
            std::cout << "  R(0) " << std::left << std::setw(12)
                      << compNames_[soluteIdx_[s]] << std::right
                      << std::fixed << std::setprecision(4) << R0_s_[s]
                      << "   c_b " << std::scientific << std::setprecision(4)
                      << f0.c_b[s] << " kmol/m3\n" << std::defaultfloat;
    }
}

// ---------------------------------------------------------------------------
//  the local problem: one bulk state -> the fluxes leaving it
// ---------------------------------------------------------------------------
scalar BatchDiafilter::volumeOf(const sVector& n) const
{
    scalar mass = 0.0;
    for (std::size_t i = 0; i < n.size(); ++i) mass += n[i] * MW_[i];
    return mass / rho_;
}

//  1/A_eff = 1/A_w + r_f(v),  v = permeated volume per unit area.
//  Applied where the CONTEXT is assembled, so both transport laws are served
//  and neither is touched -- see BatchDiafilter.H.
scalar BatchDiafilter::effectivePermeance(scalar Vperm) const
{
    const scalar Aw = membrane_->A_w();
    if (foulingLaw_ == FoulingLaw::None || area_ <= 0.0) return Aw;

    const scalar v = std::max(Vperm, 0.0) / area_;      // m3/m2 = m
    switch (foulingLaw_)
    {
        case FoulingLaw::Cake:
            //  r_f grows in proportion to what has been filtered.
            return 1.0 / (1.0 / Aw + foulingK_ * v);
        case FoulingLaw::Intermediate:
            //  the resistance grows in proportion to itself.
            return Aw * std::exp(-foulingK_ * v);
        default:
            return Aw;
    }
}

BatchDiafilter::Fluxes BatchDiafilter::evaluate(const sVector& n) const
{
    const std::size_t N  = n.size();
    const std::size_t Ns = soluteIdx_.size();

    Fluxes f;
    scalar total = 0.0;
    for (auto v : n) total += std::max(v, 0.0);

    sVector z(N, 0.0);
    if (total > 0.0)
        for (std::size_t i = 0; i < N; ++i) z[i] = std::max(n[i], 0.0) / total;

    const auto bulk = membrane::toBulk(total, z, MW_, rho_, N);
    f.V = bulk.Q;

    f.c_b.assign(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s) f.c_b[s] = bulk.c[soluteIdx_[s]];

    membrane::TransportContext ctx{ *thermo_, soluteIdx_, B_s_,
                                    effectivePermeance(Vperm_), kFilm_,
                                    P_feed_, P_perm_, state_.T, f.c_b,
                                    *osmotic_, membrane_, nullptr };
    const auto sol = transport_->localFluxes(ctx);

    f.J_w = sol.J_w;
    f.Q_p = sol.J_w * area_;
    f.c_p = sol.c_p;
    f.J_s = sol.J_s;
    f.Q_d = constantVolume_ ? f.Q_p : 0.0;
    return f;
}

// ---------------------------------------------------------------------------
//  the packed ODE:  Y = [ n_0 .. n_{N-1}, diavolumes ]
// ---------------------------------------------------------------------------
sVector BatchDiafilter::odeState() const
{
    sVector y = state_.n;
    y.push_back(Vperm_);
    return y;
}

std::size_t BatchDiafilter::odeNPositive() const
{
    //  Every mole number, and the permeated volume -- all monotone in the
    //  physics and all meaningless below zero.
    return state_.n.size() + 1;
}

void BatchDiafilter::setOdeState(const sVector& y)
{
    const std::size_t N = state_.n.size();
    for (std::size_t i = 0; i < N; ++i) state_.n[i] = y[i];
    Vperm_   = y[N];
    state_.V = volumeOf(state_.n);
}

sVector BatchDiafilter::odeDerivative(const sVector& y) const
{
    const std::size_t N  = state_.n.size();
    const std::size_t Ns = soluteIdx_.size();

    sVector n(y.begin(), y.begin() + static_cast<long>(N));
    const Fluxes f = evaluate(n);

    sVector d(N + 1, 0.0);

    //  Solutes: what the membrane passes leaves; what the diafiltrate
    //  carries arrives.  A pure-solvent diafiltrate carries nothing, which
    //  is the only case this slice supports -- see the refusal below.
    scalar soluteMassOut = 0.0;                    // kg/s
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const scalar out = f.J_s[s] * area_;       // kmol/s
        d[soluteIdx_[s]] = -out;
        soluteMassOut   += out * MW_[soluteIdx_[s]];
    }

    //  Solvent: the permeate's mass closed on the SAME solution density the
    //  concentrations were built from (BulkConversion.H).  Taking it from a
    //  pure-water concentration instead adds the solute mass on top of a
    //  full water mass and leaks ~1 % across the vessel.
    const scalar permMass  = f.Q_p * rho_;                       // kg/s
    const scalar waterOut  = (permMass - soluteMassOut) / MW_[iWater_];
    const scalar waterIn   = f.Q_d * rhoDia_ / MW_[iWater_];
    d[iWater_] = -waterOut + waterIn;

    //  The permeated VOLUME.  The diavolume count is derived from it, so
    //  the trajectory and the ledgers cannot disagree about how much has
    //  gone through.
    d[N] = f.Q_p;
    return d;
}

// ---------------------------------------------------------------------------
//  step -- only reached if a driver advances this unit with a fixed dt.
// ---------------------------------------------------------------------------
void BatchDiafilter::step(scalar /*t*/, scalar dt)
{
    const sVector y = odeState();
    const sVector d = odeDerivative(y);
    sVector next(y.size());
    for (std::size_t i = 0; i < y.size(); ++i)
        next[i] = std::max(y[i] + d[i] * dt, 0.0);
    setOdeState(next);
}

// ---------------------------------------------------------------------------
//  the permeate leaves continuously and is a real external outlet
// ---------------------------------------------------------------------------
BatchState BatchDiafilter::takeContinuousDischarge(scalar tNow)
{
    (void) tNow;
    BatchState out;
    out.n.assign(state_.n.size(), 0.0);
    out.T  = state_.T;
    out.P  = P_perm_ / 1.0e5;
    out.vf = 0.0;

    //  SOLUTES: EXACT.  A solute has no inlet in this unit, so whatever
    //  left the inventory since the last collection went through the
    //  membrane.  No flux is re-integrated and no quadrature order enters.
    scalar soluteMassOut = 0.0;
    for (std::size_t s = 0; s < soluteIdx_.size(); ++s)
    {
        const std::size_t i = soluteIdx_[s];
        const scalar prev = (i < nLastDischarge_.size()) ? nLastDischarge_[i]
                                                         : state_.n[i];
        out.n[i] = std::max(prev - state_.n[i], 0.0);
        soluteMassOut += out.n[i] * MW_[i];
    }

    //  SOLVENT: the permeate's mass closed on the SAME solution density the
    //  concentrations were built from, over the VOLUME the integrator
    //  accepted.  With the solute amounts exact and the volume integrated
    //  alongside the inventory, the record reproduces the state's own water
    //  change identically -- see BatchDiafilter.H.
    const scalar dV = std::max(Vperm_ - VpermLastOut_, 0.0);
    out.n[iWater_] = std::max((dV * rho_ - soluteMassOut) / MW_[iWater_], 0.0);

    VpermLastOut_   = Vperm_;
    nLastDischarge_ = state_.n;
    out.V = volumeOf(out.n);
    return out;
}

// ---------------------------------------------------------------------------
//  the make-up solvent crosses the boundary INTO the vessel
// ---------------------------------------------------------------------------
std::vector<BatchUnitOperation::DatumAmendment>
BatchDiafilter::takeDatumAmendments()
{
    //  Through the ONE boundary hook since 2026-08-30 (debt #15): the
    //  amendment declares its own kind word (`externalIntake` -- a flow,
    //  not a re-declared feed) and asks for the ACCUMULATING record shape
    //  (one ledger record per vessel, extended in place, not one per
    //  step).  The physics is unchanged from the retired
    //  takeContinuousIntake: pure solvent at the diafiltrate's own
    //  density, at the rate the permeate leaves -- which is what
    //  `constantVolume` MEANS and is the same Q_d the derivative
    //  integrates.  Declaring it is not bookkeeping: without it the
    //  campaign balance sees the vessel hold its inventory while
    //  thousands of kilograms leave, and reports a leak it is right to
    //  report (diafilter01's first run: closure 0.998, 4996 kg
    //  unaccounted -- the balance was right and the unit was wrong).
    const scalar dV = Vperm_ - VpermLastIn_;
    VpermLastIn_ = Vperm_;
    if (dV <= 0.0 || !constantVolume_) return {};

    DatumAmendment am;
    am.into       = true;
    am.kind       = "externalIntake";
    am.accumulate = true;
    am.why        = "constant-volume make-up solvent (diafiltrate)";
    am.pkg.n.assign(state_.n.size(), 0.0);
    am.pkg.T  = state_.T;
    am.pkg.P  = state_.P;
    am.pkg.vf = 0.0;
    am.pkg.n[iWater_] = dV * rhoDia_ / MW_[iWater_];
    am.pkg.V = volumeOf(am.pkg.n);
    return { am };
}

// ---------------------------------------------------------------------------
//  what the run publishes
// ---------------------------------------------------------------------------
std::vector<std::pair<std::string, scalar>>
BatchDiafilter::trajectoryExtras() const
{
    const Fluxes f = evaluate(state_.n);
    std::vector<std::pair<std::string, scalar>> x;
    x.emplace_back("V_m3",        f.V);
    x.emplace_back("J_w_LMH",     f.J_w * 3.6e6);   // m/s -> L/(m2.h)
    x.emplace_back("Q_p_m3s",     f.Q_p);
    x.emplace_back("diavolumes",  diavolumes());
    x.emplace_back("V_perm_m3",   Vperm_);
    if (foulingLaw_ != FoulingLaw::None)
        x.emplace_back("A_eff_over_A_w",
                       effectivePermeance(Vperm_) / membrane_->A_w());
    x.emplace_back("TMP_bar",     (P_feed_ - P_perm_) / 1.0e5);
    for (std::size_t s = 0; s < soluteIdx_.size(); ++s)
    {
        const std::string nm = compNames_[soluteIdx_[s]];
        x.emplace_back("c_b_" + nm, f.c_b[s]);
        x.emplace_back("c_p_" + nm, f.c_p[s]);
        //  THE OBSERVED REJECTION, which the classical washout law assumes
        //  is a constant and which this column exists to show is not.
        x.emplace_back("R_obs_" + nm,
                       (f.c_b[s] > 0.0) ? 1.0 - f.c_p[s] / f.c_b[s] : 1.0);
    }
    return x;
}

std::map<std::string, scalar> BatchDiafilter::kpis() const
{
    const Fluxes f = evaluate(state_.n);
    std::map<std::string, scalar> k;
    k["V_final_m3"]          = f.V;
    k["V_initial_m3"]        = V0_;
    k["concentrationFactor"] = (f.V > 0.0) ? V0_ / f.V : 0.0;
    k["diavolumes"]          = diavolumes();
    k["V_permeated_m3"]      = Vperm_;
    if (foulingLaw_ != FoulingLaw::None)
        k["A_eff_over_A_w_final"] =
            effectivePermeance(Vperm_) / membrane_->A_w();
    k["J_w_final_LMH"]       = f.J_w * 3.6e6;

    for (std::size_t s = 0; s < soluteIdx_.size(); ++s)
    {
        const std::size_t i  = soluteIdx_[s];
        const std::string nm = compNames_[i];
        const scalar R = (f.c_b[s] > 0.0) ? 1.0 - f.c_p[s] / f.c_b[s] : 1.0;
        k["R_initial_" + nm] = R0_s_[s];
        k["R_final_"   + nm] = R;
        k["recovery_"  + nm] = (n0_[i] > 0.0) ? state_.n[i] / n0_[i] : 0.0;

        //  THE LESSON, and it is published only where the law it quotes
        //  applies.  Constant-volume diafiltration is the case a student
        //  derives by hand:  c/c_0 = exp(-(1 - R) N).  In concentration
        //  mode the governing law is a different one and quoting this
        //  comparison there would be a category error, so it is absent.
        if (constantVolume_)
        {
            k["washoutActual_" + nm] =
                (n0_[i] > 0.0) ? state_.n[i] / n0_[i] : 0.0;
            k["washoutIdeal_" + nm] =
                std::exp(-(1.0 - R0_s_[s]) * diavolumes());
        }
    }
    return k;
}

// ---------------------------------------------------------------------------
//  energy: priced where it can be, refused by name where it cannot
// ---------------------------------------------------------------------------
std::string BatchDiafilter::energyLedgerGap() const
{
    //  NOT a placeholder.  The filtration is driven by a pump against the
    //  transmembrane pressure, and that shaft work is done on a
    //  recirculation loop this unit does not model -- it is told a TMP, not
    //  a pump, a flow or an efficiency.  The batch ledger's `shaftWork` kind
    //  is reserved and unimplemented.  A campaign containing this unit
    //  therefore CANNOT claim a first law, and says so, rather than closing
    //  a balance with a term quietly set to zero.
    return "batchDiafilter '" + name() + "': the pump work driving the"
           " filtration is NOT ledgered.  This unit is declared a"
           " transmembrane pressure, not a pump -- no flow, no efficiency, no"
           " recirculation loop -- so the shaft work has no honest value here"
           " and the `shaftWork` ledger kind is reserved and unimplemented."
           "  The material and the vessel enthalpy ARE priced; the campaign"
           " energy balance is UNAVAILABLE until a pump is modelled.";
}

} // namespace Choupo
