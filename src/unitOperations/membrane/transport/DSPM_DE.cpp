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
  DSPM-DE -- the equations, glass-box.  See DSPM_DE.H for the references and the
  staged-exclusion rationale.

  Numerical strategy (the §9 K=1-trap lesson made operational):
    * One z station = one binary (or multi-salt) electrolyte pore problem.
    * Ion gammas (Davies, wall) come from the speciation hook ONCE per station.
    * The wall is the shared Polarisation home's (massTransfer/Polarisation.H,
      the ONE home of the wall for all three transport laws): its interface
      balance at the field the station's Newton carries
      (membrane::wallAtField, C142) -- the per-ion film by default, the
      Geraldes & Afonso (2007) coupled interface model when the case declares
      `polarisation { ionCoupling electroneutral; }` -- read ION BY ION,
      which is what the partition (2) takes as its c_bulk.
    * The pore SOLVED (DEV.md 4c C138; the default since C141, the only
      path since C142): the ENP on n nodes graded toward both faces, every
      node at once by Newton on the declared block-tridiagonal structure
      with an ANALYTIC Jacobian -- PoreNernstPlanck.{H,cpp} -- with, by
      default, the wall closed with that pore's own permeate (`wallClosure
      porePermeate`).
    * The closed form (the per-ion transmission K_c/(K_c + (1 - K_c e^-Pe)
      R) between a feed-face and a permeate-face Donnan bisection, the
      default until C141) is RETIRED (C142): it imposed neither
      electroneutrality nor zero current inside the pore, and with the
      corrected K_d it transmitted more than it was fed (K_c > 1 at low
      Peclet number).  `method closedForm;` refuses by name with that reason.
    * The wall and the water flux: since C142 inside the SAME Newton as the
      pore (one per station, warm-started from the previous station) --
      until then a Newton on the wall around the pore and a secant on
      J_w = A_w (dP - dpi) around that.
    * The exclusions are switched on by the membrane record and ANNOUNCED;
      there is no seeding chain between them at run time: the solved pore
      starts from local Donnan equilibrium at every node.
\*---------------------------------------------------------------------------*/

#include "DSPM_DE.H"
#include "thermo/transport/StokesEinstein.H"
#include "PoreNernstPlanck.H"

#include "core/Advisory.H"
#include "core/InfeasibleTrial.H"
#include "solver/NewtonND.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/electrolyte/SolventProperties.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "../osmotic/OsmoticModel.H"

// The ion-transport tier (radius, D0) lives in the THERMO tier -- re-homed
// 2026-07-25 from the electrochem header (that home coupled membrane ->
// electrochem, an inversion).  Charges via electrolyte::ionCharge as before.
#include "thermo/electrolyte/IonTransport.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace membrane {

namespace {

// ---- physical constants for the Born term ---------------------------------
// Faraday and elementary charge from the CODATA Avogadro / Boltzmann already in
// Constants.H (e = F/N_A; F = N_A*e).  Vacuum permittivity is the CODATA value.
constexpr scalar F_const   = 96485.33212;            // [C/mol]  Faraday
constexpr scalar e_charge  = F_const / constant::Na; // [C]      elementary charge
constexpr scalar eps0      = 8.8541878128e-12;       // [F/m]    vacuum permittivity

// ---- The hindrance factors from lambda = r_ion / r_pore ---------------------
// Diffusive hindrance K_d, convective hindrance K_c and the steric partition
// Phi = (1 - lambda)^2.  ONE pair since 2026-10-24 (DEV.md 4c C141): until
// then the default took Dechadilok & Deen's polynomial H itself as K_d -- but
// H = Phi K_d, and Phi is carried separately in the partition (2), so that
// default counted the steric partition TWICE in diffusion (K_d too small by
// (1 - lambda)^2).  The word that selected it, `hindrance legacy`, now
// refuses by name (readParameters).
struct HindranceFactors { scalar Kd; scalar Kc; scalar Phi; };

// ---- Dechadilok & Deen (2006), the cross-section-averaged pair -------------
// Dechadilok & Deen, "Hindrance factors for diffusion and convection in
// pores", Ind. Eng. Chem. Res. 45 (2006) 6953-6959.  Their polynomial fits
// H = Phi K_d (the product with the steric partition), valid to lambda =
// 0.95; above it the lubrication form K_d = 0.984 ((1 - lambda)/lambda)^(5/2)
// takes over (and meets H/Phi at 0.95 to 6e-3 -- which is how one reads
// that the polynomial is H, not K_d).  K_c is their rational fit.  This is
// the pair NanoFiltran evaluates (NANOFILTRAN.F, the hindrance loop); a
// fully excluded ion (lambda >= 1) gets NanoFiltran's floor 1e-8 there.
HindranceFactors dechadilokDeenFactors(scalar lambda)
{
    const scalar l = std::max(lambda, 0.0);
    if (l >= 1.0) return { 1e-8, 1e-8, 1e-15 };
    const scalar Phi = (1.0 - l) * (1.0 - l);
    scalar Kd;
    if (l <= 0.95)
    {
        const scalar l2 = l*l, l3 = l2*l, l4 = l3*l, l5 = l4*l, l6 = l5*l, l7 = l6*l;
        const scalar lnl = (l > 1e-300) ? std::log(l) : 0.0;
        const scalar H = 1.0 + 1.125 * l * lnl - 1.56034 * l + 0.528155 * l2
                       + 1.91521 * l3 - 2.81903 * l4 + 0.270788 * l5
                       + 1.10115 * l6 - 0.435933 * l7;
        Kd = H / Phi;
    }
    else
        Kd = 0.984 * std::pow((1.0 - l) / l, 2.5);
    const scalar Kc = (1.0 + 3.867 * l - 1.907 * l * l - 0.834 * l * l * l)
                    / (1.0 + 1.867 * l - 0.741 * l * l);
    return { Kd, Kc, Phi };
}

// Davies on log10 with A from the solvent's dielectric constant:
// A(eps, T) = 1.82483e6 (eps T)^(-3/2), the Debye-Hueckel constant on the
// concentration scale (mol/L).  At eps = 78.45, T = 298.15 K it is 0.5101,
// SpeciationSolver::daviesA's 0.51.  Used by `activity bulkOverPoreDavies`
// with eps_b on the solution side and eps_p on the pore side.
scalar daviesAofEps(scalar eps, scalar T)
{
    return 1.82483e6 * std::pow(eps * T, -1.5);
}

// Born solvation energy difference dW_i [J] for moving ion i from bulk
// (eps_b) into the pore (eps_p).  Bowen & Welfoot 2002 Eq. 16.
//   dW = z^2 e^2 / (8 pi eps0 r_ion) (1/eps_p - 1/eps_b)
scalar bornEnergy(int z, scalar r_ion, scalar eps_p, scalar eps_b)
{
    if (eps_p <= 0.0 || r_ion <= 0.0) return 0.0;
    return (scalar(z) * scalar(z) * e_charge * e_charge)
         / (8.0 * constant::pi * eps0 * r_ion) * (1.0 / eps_p - 1.0 / eps_b);
}

// A single ion in the DSPM-DE problem.
struct Ion
{
    SpeciesId name;       // TYPED species id (declared FK of its salt)
    int    z = 0;         // signed charge
    scalar r = 0.0;       // ion radius [m]
    scalar D = 0.0;       // free-solution D0 [m^2/s]
    scalar c_bulk = 0.0;  // wall (feed-side) molarity [mol/m^3]
    // derived
    scalar lambda = 0.0, Kd = 0.0, Kc = 0.0, Phi = 0.0, dWkT = 0.0;
    std::size_t salt = 0; // which salt component it belongs to (collapse back)
    int    stoich = 0;    // ions of this kind per formula unit (for the collapse)
};

} // anonymous namespace

// ---------------------------------------------------------------------------
//  `transportParameters { poreSolver { method <word>; nodes <n>;
//  grid <word>; grading <beta>; gridTolerance <cells>; gridPasses <n>;
//  wallClosure <word>; } ... }`.  Absent (the block, or `poreSolver` in it),
//  the pore is SOLVED -- `method finiteDifference; nodes 101; wallClosure
//  porePermeate;`, the stated defaults since 2026-10-24 (DEV.md 4c C141),
//  set in the member initialisers because this reader is called only when
//  the case writes the block, and announced at the first solve.  A key
//  this law does not read, a method word it does not know, and a grid it
//  cannot use each REFUSE by name: a declared word the engine dispatches on
//  must not fall through to a default (CLAUDE.md, 2026-09-07).
void DSPM_DE::readParameters(const DictPtr& params)
{
    const std::string ctx = "transport DSPM-DE: transportParameters";
    if (!params) return;
    for (const auto& k : params->keys())
        if (k != "poreSolver" && k != "hindrance" && k != "activity"
            && k != "bulkDielectric")
            throw std::runtime_error(ctx + " declares `" + k + "`, which this"
                " law does not read.  DSPM-DE reads `poreSolver { method"
                " finiteDifference; nodes <n>; grid uniform | graded |"
                " adaptive; wallClosure porePermeate | solutionDiffusion; }`,"
                " `hindrance`,"
                " `activity` and `bulkDielectric` there.");

    //  The declared model choices (DSPM_DE.H, "DECLARED CHOICES").  Each
    //  word refuses an unknown spelling naming the accepted list.
    if (params->found("hindrance"))
    {
        const std::string w = params->lookupWord("hindrance");
        //  The retired word, refused with its reason (DEV.md 4c C141): a
        //  case that declared it asked for a model this law no longer has,
        //  and falling to the default in silence would change its answer
        //  without a word.
        if (w == "legacy")
            throw std::runtime_error(ctx + " declares `hindrance legacy;`,"
                " which is RETIRED (2026-10-24): it took as K_d the Dechadilok-Deen"
                " polynomial H, which is the PRODUCT Phi K_d, while the steric"
                " partition Phi = (1 - lambda)^2 is carried separately in the"
                " interfacial partition -- so it counted the steric partition"
                " twice in diffusion (K_d too small by (1 - lambda)^2).  Declare"
                " `hindrance DechadilokDeen2006;` (K_d = H/Phi, their K_c; the"
                " default) or drop the key.");
        const std::vector<std::string> acc = { "DechadilokDeen2006" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE hindrance", w, acc, "Accepted"));
        hindranceDeclared_ = true;
    }
    if (params->found("activity"))
    {
        const std::string w = params->lookupWord("activity");
        const std::vector<std::string> acc = { "wallDavies", "ideal",
                                               "bulkOverPoreDavies" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE activity", w, acc, "Accepted"));
        activity_ = (w == "ideal")              ? Activity::Ideal
                  : (w == "bulkOverPoreDavies") ? Activity::BulkOverPoreDavies
                                                : Activity::WallDavies;
    }
    if (params->found("bulkDielectric"))
    {
        const scalar e = params->lookupScalar("bulkDielectric");
        if (!(e >= 1.0) || !std::isfinite(e))
            throw std::runtime_error(ctx + " `bulkDielectric` must be a relative"
                " dielectric constant of at least 1 (it reads "
                + std::to_string(e) + ")");
        bulkDielectric_ = e;
    }

    if (!params->found("poreSolver"))
        return;                   // the solved pore, every stated default
    const auto ps = params->subDict("poreSolver");
    for (const auto& k : ps->keys())
        if (k != "method" && k != "nodes" && k != "grading" && k != "wallClosure"
            && k != "grid" && k != "gridTolerance" && k != "gridPasses")
            throw std::runtime_error(ctx + ".poreSolver declares `" + k
                + "`, which the pore solver does not read (it reads `method`,"
                  " `nodes`, `grid`, `grading`, `gridTolerance`, `gridPasses`"
                  " and `wallClosure`).");
    if (ps->found("method"))
    {
        const std::string method = ps->lookupWord("method");
        //  The retired word, refused with its reason (DEV.md 4c C142): a case
        //  that declared it asked for a model this law no longer has, and
        //  falling to the solved pore in silence would change its answer
        //  without a word.
        if (method == "closedForm")
            throw std::runtime_error(ctx + ".poreSolver declares `method"
                " closedForm;`, which is RETIRED (2026-10-24, DEV.md 4c C142):"
                " it did not solve the pore -- each ion was carried across alone"
                " by the transmission K_c/(K_c + (1 - K_c e^-Pe) R), with neither"
                " electroneutrality nor zero current imposed inside -- and with the"
                " corrected hindrance (K_d = H/Phi, C141) that transmission tends"
                " to K_c > 1 at low Peclet number: a permeate richer than the pore"
                " inlet, -121.5 % rejection of NaCl on membrane11, a bulk exhausted"
                " until membrane20's solute balance refused.  Drop the key, or say"
                " `method finiteDifference;` (the pore solved node by node, the"
                " default).");
        const std::vector<std::string> accepted = { "finiteDifference" };
        if (std::find(accepted.begin(), accepted.end(), method) == accepted.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE pore solver method", method, accepted, "Accepted")
                + "  (`closedForm` was retired on 2026-10-24.)");
        methodDefaulted_ = false;
    }
    if (ps->found("wallClosure"))
    {
        const std::string w = ps->lookupWord("wallClosure");
        const std::vector<std::string> acc = { "solutionDiffusion", "porePermeate" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE pore solver wallClosure", w, acc, "Accepted"));
        wallClosure_ = (w == "porePermeate") ? WallClosure::PorePermeate
                                             : WallClosure::SolutionDiffusion;
        wallClosureDefaulted_ = false;
    }
    if (ps->found("nodes"))
    {
        const scalar n = ps->lookupScalar("nodes");
        if (!(n >= 3.0) || n != std::floor(n) || n > 100000.0)
            throw std::runtime_error(ctx + ".poreSolver `nodes` must be a whole"
                " number of grid nodes across the pore, faces included, of at"
                " least 3 (it reads " + std::to_string(n) + ")");
        poreNodes_      = static_cast<std::size_t>(n);
        nodesDefaulted_ = false;
    }
    // else: the stated default (the member initialiser), announced at the
    // first solve.
    if (ps->found("grading"))
    {
        //  beta of the tanh map toward both faces (PoreNernstPlanck.H, THE
        //  GRID); 0 is the uniform grid of C138.  Beyond ~6 the face cells
        //  shrink as e^{-2 beta} and the middle of the pore is left with
        //  almost none -- refused rather than run on a grid that is not one.
        const scalar g = ps->lookupScalar("grading");
        if (!(g >= 0.0) || !(g <= 6.0))
            throw std::runtime_error(ctx + ".poreSolver `grading` is the beta of"
                " the tanh map toward both faces, between 0 (uniform) and 6 (it"
                " reads " + std::to_string(g) + ")");
        poreGrading_      = g;
        gradingDefaulted_ = false;
    }
    //  THE GRID (DEV.md 4c C144): `uniform`, `graded` (the tanh map of
    //  `grading`) or `adaptive` (equidistributing the monitor of the solved
    //  profile, PoreNernstPlanck.H "THE ADAPTIVE GRID").  A declaration that
    //  contradicts itself refuses by name rather than one key silently
    //  winning: `grading` on a uniform or an adaptive grid, `graded` with
    //  no grading, and the adaptive grid's own keys on a fixed one.
    if (ps->found("grid"))
    {
        const std::string w = ps->lookupWord("grid");
        const std::vector<std::string> acc = { "uniform", "graded", "adaptive" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE pore solver grid", w, acc, "Accepted"));
        gridKind_ = (w == "adaptive") ? GridKind::Adaptive
                  : (w == "graded")   ? GridKind::Graded : GridKind::Uniform;
        gridDefaulted_ = false;
        if (gridKind_ != GridKind::Graded && ps->found("grading"))
            throw std::runtime_error(ctx + ".poreSolver declares `grid " + w
                + ";` and `grading`: a grading is the beta of the tanh map of a"
                  " `graded` grid.  Drop `grading`, or say `grid graded;`.");
        if (gridKind_ == GridKind::Graded && !(poreGrading_ > 0.0))
            throw std::runtime_error(ctx + ".poreSolver declares `grid graded;`"
                " with no `grading` above 0: declare the beta of the tanh map"
                " (`grading <beta>;`, 0 < beta <= 6).");
    }
    else if (ps->found("grading"))
    {
        //  `grading` alone (C142's grammar): a graded grid; `grading 0` is
        //  the uniform one.
        gridKind_      = poreGrading_ > 0.0 ? GridKind::Graded : GridKind::Uniform;
        gridDefaulted_ = false;
    }
    if (ps->found("gridTolerance") || ps->found("gridPasses"))
    {
        if (gridKind_ != GridKind::Adaptive)
            throw std::runtime_error(ctx + ".poreSolver declares `"
                + std::string(ps->found("gridTolerance") ? "gridTolerance" : "gridPasses")
                + "`, which only an adaptive grid reads (`grid adaptive;`).");
        if (ps->found("gridTolerance"))
        {
            const scalar t = ps->lookupScalar("gridTolerance");
            if (!(t > 0.0) || !(t <= 1.0))
                throw std::runtime_error(ctx + ".poreSolver `gridTolerance` is the"
                    " largest node movement accepted as settled, in units of the"
                    " node's own cell, above 0 and at most 1 (it reads "
                    + std::to_string(t) + ")");
            gridTolerance_ = t;
            gridTolDefaulted_ = false;
        }
        if (ps->found("gridPasses"))
        {
            const scalar n = ps->lookupScalar("gridPasses");
            if (!(n >= 1.0) || n != std::floor(n) || n > 100.0)
                throw std::runtime_error(ctx + ".poreSolver `gridPasses` is the"
                    " most re-solves on a moved grid per station, a whole number"
                    " from 1 to 100 (it reads " + std::to_string(n) + ")");
            gridPasses_ = int(n);
            gridPassesDefaulted_ = false;
        }
    }
}

// ---------------------------------------------------------------------------
//  The grid, in the words the banner prints (declared or the stated default).
std::string DSPM_DE::gridWords() const
{
    std::ostringstream w;
    w << std::setprecision(3);
    const char* how = gridDefaulted_ ? "the stated default" : "declared";
    switch (gridKind_)
    {
    case GridKind::Uniform:
        w << "a uniform grid (" << how << ")";
        break;
    case GridKind::Graded:
        w << "a grid graded toward both faces (tanh, beta " << poreGrading_
          << ", " << how << ")";
        break;
    case GridKind::Adaptive:
        w << "a SOLUTION-ADAPTIVE grid (" << how << "; the nodes equidistribute"
             " the monitor |psi''|^(1/3) + its mean -- the curvature of the"
             " solved potential, what the fitted flux leaves out -- re-solved"
             " until no node moves by more than "
          << gridTolerance_ << " of its cell"
          << (gridTolDefaulted_ ? " (stated default; declare `gridTolerance`)" : "")
          << ", at most " << gridPasses_ << " re-solves per station"
          << (gridPassesDefaulted_ ? " (stated default; declare `gridPasses`)" : "")
          << ", the grid carried station to station)";
        break;
    }
    return w.str();
}

scalar DSPM_DE::smallestCell(const std::vector<scalar>& g)
{
    scalar h = 1.0;
    for (std::size_t k = 0; k + 1 < g.size(); ++k) h = std::min(h, g[k + 1] - g[k]);
    return h;
}

// ---------------------------------------------------------------------------
TransportSolution DSPM_DE::localFluxes(const TransportContext& ctx) const
{
    const ThermoPackage& thermo = ctx.thermo;
    const auto&  soluteIdx = ctx.soluteIdx;
    const scalar A_w       = ctx.A_w;
    const Polarisation&        polar = ctx.polarisation;
    const MassTransferContext& hyd   = ctx.hydraulics;
    const scalar dP        = ctx.P_feed_Pa - ctx.P_perm_Pa;
    const scalar T         = ctx.T_K;
    const auto&  c_b       = ctx.c_b;            // bulk salt conc [kmol/m^3]
    const auto&  B_s       = ctx.B_s;
    const Membrane* mem    = ctx.membrane;
    const std::size_t Ns   = soluteIdx.size();

    // ---- Refuse loudly: DSPM-DE needs the membrane pore tier ----------------
    if (!mem || !mem->hasPoreModel())
        throw std::runtime_error("transport DSPM-DE: membrane '"
            + (mem ? mem->name() : std::string("(none)"))
            + "' has no poreModel{} block (poreRadius + porosity/thickness "
              "[+ chargeDensity + poreDielectric]).  DSPM-DE is a charged-pore "
              "model; a solution-diffusion membrane cannot select it.  Use a "
              "membrane with a poreModel{} tier (e.g. NF270_dspmde) or set "
              "`transport solutionDiffusion;`.");

    const scalar r_p   = mem->poreRadius_m();
    const scalar X_d   = mem->hasChargeDensity() ? mem->chargeDensity_molm3() : 0.0;
    const scalar eps_b = (bulkDielectric_ > 0.0) ? bulkDielectric_
                                                 : SolventProperties::epsWater(T);
    const scalar eps_p = mem->hasPoreDielectric() ? mem->poreDielectric() : eps_b;
    const bool   bornOn   = mem->hasPoreDielectric() && eps_p < eps_b;
    const bool   donnanOn = mem->hasChargeDensity() && std::abs(X_d) > 1e-30;

    TransportSolution out;
    out.c_m.assign(Ns, 0.0);
    out.c_p.assign(Ns, 0.0);
    out.J_s.assign(Ns, 0.0);
    out.J_w = 0.0;
    const bool imposed = std::isfinite(ctx.imposedJv);
    if (!imposed && dP <= 0.0) return out;

    // ---- The declared model choices, announced once (DSPM_DE.H) ------------
    if (!choicesSaid_)
    {
        choicesSaid_ = true;
        std::ostringstream c;
        //  The hindrance pair is announced whether declared or not: it is
        //  the one pair this law has, and a reader of an undeclared run must
        //  still see which K_d and K_c priced it.
        c << "  [DSPM-DE] hindrance DechadilokDeen2006 ("
          << (hindranceDeclared_ ? "declared" : "the default") << "): K_d ="
             " H/Phi (Dechadilok & Deen, Ind. Eng. Chem. Res. 45 (2006)"
             " 6953), K_c their rational fit\n";
        if (activity_ == Activity::Ideal)
            c << "  [DSPM-DE] activity ideal (declared): every activity"
                 " coefficient 1, both faces\n";
        else if (activity_ == Activity::BulkOverPoreDavies)
            c << "  [DSPM-DE] activity bulkOverPoreDavies (declared):"
                 " gamma_bulk/gamma_pore at both faces, Davies (log10) with"
                 " A(eps_b) = " << daviesAofEps(eps_b, T) << " and A(eps_p) = "
              << daviesAofEps(eps_p, T) << " (1.82483e6 (eps T)^-3/2); the"
                 " pore gammas converged around the pore solve\n";
        if (bulkDielectric_ > 0.0)
            c << "  [DSPM-DE] bulkDielectric " << bulkDielectric_
              << " (declared; SolventProperties::epsWater(T) would give "
              << SolventProperties::epsWater(T) << ")\n";
        if (wallClosure_ == WallClosure::PorePermeate)
            c << "  [DSPM-DE] wallClosure porePermeate ("
              << (wallClosureDefaulted_ ? "the default" : "declared")
              << "): the wall closed with the solved pore's own permeate\n";
        else
            c << "  [DSPM-DE] wallClosure solutionDiffusion (declared): the wall"
                 " closed with the salts' solution-diffusion B_s, NOT with the"
                 " permeate the solved pore gives -- the film then carries a"
                 " solute flux the pore does not\n";
        if (imposed)
            c << "  [DSPM-DE] J_v IMPOSED by the caller (" << ctx.imposedJv
              << " m/s): no J_w = A_w (dP - dpi) closure\n";
        std::cout << c.str();
    }

    // ---- Stage banner (announced ONCE, no silent fallback) ------------------
    if (!banner_done_)
    {
        banner_done_ = true;
        std::cout << "  [DSPM-DE] charged-pore Nernst-Planck (Bowen-Welfoot 2002)"
                  << "  r_p = " << r_p * 1e9 << " nm,  X_d = " << X_d
                  << " mol/m3\n"
                  << "  [DSPM-DE] exclusions: steric ON"
                  << (donnanOn ? " | Donnan ON" : " | Donnan OFF (X_d=0)")
                  << (bornOn   ? " | Born ON (eps_p<eps_b)" : " | Born OFF")
                  << "\n";
        // The activity treatment belongs to the MODEL, not to the case's
        // `aqueous {}` declaration (that governs units that ASK for
        // activities; this model IS its activity treatment).  Since C138
        // slice 2 the law offers three declared treatments of its own
        // (`transportParameters { activity ...; }`, DSPM_DE.H); the
        // default line below is the one every DSPM-DE run printed before.
        if (activity_ == Activity::WallDavies)
            std::cout << "  [DSPM-DE] activity: Davies A(T) correction"
                         " (model-prescribed, Bowen-Welfoot formulation --"
                         " not a case-selectable gamma model)\n";
    }

    // ---- Decompose each salt solute into its ions --------------------------
    std::vector<Ion> ions;
    //  D(T): every ion's D0 (25 C) corrected to the station's T by
    //  Stokes-Einstein on the package's own liquid viscosity -- ONE home,
    //  thermo/transport/StokesEinstein.H (DEV.md 4c C145/C148); 1 EXACTLY at
    //  298.15 K, and 1 -- announced -- when no liquid-viscosity model is
    //  declared.  It reaches the pore (hindered diffusion and convection) and
    //  the film's per-ion k through the same ic.D / ia.D.
    const stokesEinstein::Factor se = stokesEinstein::factor(thermo, T);
    stokesEinstein::announce(se, "transport DSPM-DE", "ion D0 of the pore and"
                             " the film", 2);
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const auto& comp = thermo.comp(soluteIdx[s]);
        if (!comp.hasElectrolyteSpec())
            throw std::runtime_error("transport DSPM-DE: solute '" + comp.name()
                + "' has no electrolyte{ cation; anion; } block -- DSPM-DE works "
                  "ion-by-ion and needs the salt's ion decomposition.  Add the "
                  "block to its component .dat, or use a salt that carries one "
                  "(NaCl, CaCl2, MgSO4).");
        // Declared FK from the component record (derived from dissociatesTo)
        // -- typed at the point of read, per the loader contract.
        const SpeciesId cat{comp.electrolyteCation()};
        const SpeciesId an {comp.electrolyteAnion()};
        const int zc = electrolyte::ionCharge(cat);     // > 0
        const int za = electrolyte::ionCharge(an);      // < 0
        // electroneutral stoichiometry M_{nu_c} X_{nu_a}: nu_c*zc = nu_a*|za|.
        const int g = std::gcd(zc, -za);
        const int nu_c = (-za) / g;
        const int nu_a =  zc   / g;

        // Wall (feed-side) salt molarity from the film model (closed form, the
        // SolutionDiffusion polarisation -- evaluated at the no-osmotic J_w as a
        // first pass; refined in the J_w loop below).
        const scalar c_salt_bulk = c_b[s] * 1.0e3;      // kmol/m^3 -> mol/m^3

        Ion ic; ic.name = cat; ic.z = zc; ic.salt = s; ic.stoich = nu_c;
        ic.r = electrolyte::ionRadius(cat); ic.D = electrolyte::ionD0(cat) * se.value;
        ic.c_bulk = nu_c * c_salt_bulk;
        Ion ia; ia.name = an;  ia.z = za; ia.salt = s; ia.stoich = nu_a;
        ia.r = electrolyte::ionRadius(an);  ia.D = electrolyte::ionD0(an) * se.value;
        ia.c_bulk = nu_a * c_salt_bulk;
        ions.push_back(ic); ions.push_back(ia);
    }
    const std::size_t Ni = ions.size();

    // Dechadilok-Deen hindrance + Born (in kT units) per ion -- geometry is
    // J_w independent.
    const scalar kT = constant::kB * T;
    for (auto& io : ions)
    {
        io.lambda = io.r / r_p;
        const HindranceFactors h = dechadilokDeenFactors(io.lambda);
        io.Kd = h.Kd; io.Kc = h.Kc; io.Phi = h.Phi;
        io.dWkT = bornOn ? bornEnergy(io.z, io.r, eps_p, eps_b) / kT : 0.0;
    }

    // ---- The activity coefficients the law holds FIXED at the feed face ----
    //  wallDavies (the default): Davies with SpeciationSolver's A(T) on the
    //  BULK ionic strength, frozen per station; ideal: 1.  Under
    //  bulkOverPoreDavies the coefficients at both faces are read on the
    //  answer's own ionic strengths INSIDE the station's Newton
    //  (pore::PoreActivity), so none is held fixed here.
    const scalar A_davies  = electrolyte::SpeciationSolver::daviesA(T);
    const scalar A_bulkEps = daviesAofEps(eps_b, T);
    const scalar A_poreEps = daviesAofEps(eps_p, T);
    std::vector<scalar> gFixed(Ni, 1.0);
    if (activity_ == Activity::WallDavies)
    {
        scalar I = 0.0;
        for (const auto& io : ions) I += 0.5 * io.c_bulk * scalar(io.z) * scalar(io.z);
        for (std::size_t i = 0; i < Ni; ++i)
            gFixed[i] = std::exp(pore::daviesLnGamma(ions[i].z, I / 1000.0, A_davies));
    }

    // ===================================================================
    //  THE STATION, SOLVED AT ONCE (C142, 2026-10-24).  One Newton carries
    //  the pore (the ENP on every node, electroneutrality at every node,
    //  zero current, both partitions), the wall (the film's interface
    //  balance, closed with THIS pore's permeate or with the salts' B_s,
    //  electroneutral at the wall when the film is coupled) and the water
    //  flux J_w = A_w (dP - dpi) -- PoreNernstPlanck.H, "THE STATION".
    //  Until C142 the wall was a Newton around the pore and the water flux
    //  a secant around that, every wall evaluation a full pore solve, every
    //  pore Jacobian a colored finite difference: membrane10 took 10.9 s.
    //  The partition coefficients stay computed HERE (the law's one home
    //  for them); the pore solver holds none.
    // ===================================================================
    const scalar AkdX = mem->porosityOverThickness();
    pore::PoreProblem pb;
    pb.Xd = X_d;
    std::vector<std::size_t> present;      // the ions the FEED carries
    std::vector<std::size_t> excludedIdx;  // ... of which the pore excludes (lambda >= 1)
    for (std::size_t i = 0; i < Ni; ++i)
    {
        //  An ion with no bulk concentration (a salt component of the
        //  flowsheet this unit is not fed) is not a term: the pore and the
        //  wall leave it out, and its permeate stays exactly zero.
        if (!(ions[i].c_bulk > 0.0)) continue;
        //  An ion as large as the pore (lambda >= 1) does not enter it: its
        //  steric partition is zero, its permeate zero, and it stays in the
        //  FILM, where it counts in the wall's electroneutrality and osmotic
        //  pressure (pore::PoreWall::excluded, C145).
        if (ions[i].lambda >= 1.0)
        {
            pore::PoreWall::Excluded e;
            e.z     = ions[i].z;
            e.cBulk = ions[i].c_bulk;
            e.k     = polar.kFilmForD(hyd, ions[i].D);
            e.D     = ions[i].D;
            pb.wall.excluded.push_back(e);
            excludedIdx.push_back(i);
            continue;
        }
        const scalar part = ions[i].Phi * std::exp(-ions[i].dWkT);    // steric x Born
        pore::PoreIon pi;
        pi.z        = ions[i].z;
        pi.P        = ions[i].Kd * ions[i].D * AkdX;
        pi.Kc       = ions[i].Kc;
        pi.feedSide = part * gFixed[i];        // x C_m from the wall (7)
        pi.permSide = part;
        pb.ions.push_back(pi);
        pb.wall.cBulk.push_back(ions[i].c_bulk);
        pb.wall.k.push_back(polar.kFilmForD(hyd, ions[i].D));
        pb.wall.D.push_back(ions[i].D);
        pb.wall.B.push_back(B_s[ions[i].salt]);
        present.push_back(i);
    }
    pb.wall.active            = true;
    pb.wall.suction           = polar.policy().suction;
    pb.wall.coupled           = polar.policy().coupling == IonCoupling::Electroneutral;
    pb.wall.solutionDiffusion = (wallClosure_ == WallClosure::SolutionDiffusion);
    if (activity_ == Activity::BulkOverPoreDavies)
    {
        pb.activity.active    = true;
        pb.activity.Asolution = A_bulkEps;
        pb.activity.Apore     = A_poreEps;
    }
    if (imposed) pb.Jv = ctx.imposedJv;
    else
    {
        pb.closure.active = true;
        pb.closure.Aw     = A_w;
        pb.closure.dP     = dP;
        pb.closure.RT     = constant::R * T;
    }

    pore::PoreSettings settings;
    settings.intervals = poreNodes_ - 1;
    settings.grading   = gridKind_ == GridKind::Graded ? poreGrading_ : 0.0;
    settings.adaptive  = gridKind_ == GridKind::Adaptive;
    settings.gridTolerance = gridTolerance_;
    settings.gridPasses    = gridPasses_;
    //  THE AUDIT (the declared structure and the analytic Jacobian against
    //  a dense finite-difference one) is taken ONCE per unit, on an 11-node
    //  copy of the first station: both are properties of the code, not of
    //  the grid, and the dense audit Jacobian grows as n^2 -- measured
    //  (C138 slice 2) 8.2 GB at 3201 nodes of a four-ion pore, and (C142)
    //  more than the whole solve already at 201.  The real solve is not
    //  audited.  Until C142 the audit ran on the real grid and was SKIPPED
    //  above 4096 unknowns.
    constexpr std::size_t auditNodes = 11;
    const std::size_t nUnknowns = pore::blockSize(pb) * (settings.intervals + 1);
    settings.audit = false;

    //  NO POSITIVE WATER FLUX (C142).  As J_v -> 0+ nothing crosses the
    //  pore, which sits in Donnan equilibrium with both baths: the wall is
    //  the bulk and the permeate is c_p,i = feedSide_i c_b,i / permSide_i
    //  (the activity the law holds fixed is the only asymmetry), so the
    //  osmotic difference at vanishing flux is dpi0 = RT sum (c_b - c_p,0)
    //  EXACTLY.  When the applied dP does not exceed it, no positive flux
    //  satisfies J_v = A_w (dP - dpi) -- the closure's only root is a
    //  NEGATIVE flux (water drawn back across the membrane), outside what
    //  this model describes -- so the station has no flux, and says so.
    //  (Until C142 the damped fixed point crawled toward J_w ~ 1e-25 and
    //  published a rejection of that.)  Measured on membrane11 at 3 bar and
    //  500 mM NaCl.  Under bulkOverPoreDavies the limit is not this simple
    //  sum, and a converged negative flux is caught after the solve instead.
    scalar dpi0 = 0.0;
    for (std::size_t m = 0; m < present.size(); ++m)
        dpi0 += ions[present[m]].c_bulk * (1.0 - gFixed[present[m]]);
    for (const std::size_t i : excludedIdx) dpi0 += ions[i].c_bulk;   // c_p,0 = 0
    dpi0 *= constant::R * T;
    bool noFlux = pb.closure.active && !pb.activity.active && !(dP > dpi0);

    //  The start: the previous STATION's converged state (the channel moves
    //  a little between stations) or, at the first station of a run, a
    //  local-Donnan profile around an unrejected permeate at half the pure-
    //  water flux -- and, when the Newton cannot reach the answer from it,
    //  the continuation from the exact no-flux state (counted, announced).
    pore::PoreSolution sol, audited;
    if (!poreBanner_ && !noFlux)
    {
        pore::PoreSettings sa = settings;
        sa.intervals = auditNodes - 1;
        pore::PoreSeed seed;
        for (std::size_t m = 0; m < present.size(); ++m)
            seed.cPerm.push_back(gFixed[present[m]] * ions[present[m]].c_bulk);
        audited = pore::audit(pb, sa, seed);
    }
    if (noFlux) {}
    else if (haveLastPore_ && lastPore_.x.size() == nUnknowns)
        sol = pore::solve(pb, settings, lastPore_);
    else
    {
        pore::PoreSeed seed;
        for (std::size_t m = 0; m < present.size(); ++m)
            seed.cPerm.push_back(gFixed[present[m]] * ions[present[m]].c_bulk);
        sol = pore::solve(pb, settings, seed);
    }
    if (!noFlux && sol.converged && pb.closure.active && sol.Jv <= 0.0)
        noFlux = true;                  // the negative root (see above)
    if (!noFlux && !sol.converged)
    {
        std::ostringstream m;
        m << "transport DSPM-DE: the station (pore, wall and "
          << (imposed ? "imposed" : "closed") << " water flux) did NOT converge"
             " at dP = " << dP << " Pa, X_d = " << X_d << " mol/m3 on "
          << poreNodes_ << " nodes (||F|| = " << sol.residual << "): "
          << sol.stopReason << ".  Refusing rather than publishing a pore"
             " that does not satisfy its equations.";
        throw std::runtime_error(m.str());
    }
    if (noFlux)
    {
        //  Said once per unit, with the first station's numbers; every
        //  station it applies to publishes J_w = 0.
        if (!noFluxSaid_)
        {
            noFluxSaid_ = true;
            std::ostringstream m;
            m << std::setprecision(4)
              << "no water flux: the osmotic pressure difference at vanishing"
                 " flux, RT sum (c_b - c_p,0) = " << dpi0 << " Pa, is not below"
                 " the applied dP = " << dP << " Pa at the first such station, so"
                 " J_v = A_w (dP - dpi) has no positive root; J_w = 0 at every"
                 " such station, and the permeate composition reported there is"
                 " its J_v -> 0 limit (the pore in Donnan equilibrium with both"
                 " baths)";
            AdvisoryLog::instance().add("model", "warning", "DSPM-DE", m.str());
            std::cout << "  [DSPM-DE] " << m.str() << "\n";
        }
        for (std::size_t i = 0; i < Ni; ++i)
        {
            TransportSolution::IonState st;
            st.name   = ions[i].name.key;
            st.z      = ions[i].z;
            st.c_bulk = ions[i].c_bulk;
            st.c_wall = ions[i].c_bulk;
            st.c_perm = ions[i].lambda >= 1.0 ? 0.0 : gFixed[i] * ions[i].c_bulk;
            out.ions.push_back(st);
        }
        for (std::size_t s = 0; s < Ns; ++s)
        {
            out.c_m[s] = c_b[s];
            for (std::size_t i = 0; i < Ni; ++i)
                if (ions[i].salt == s && ions[i].z > 0)
                    out.c_p[s] = gFixed[i] * c_b[s];
            out.J_s[s] = 0.0;
        }
        out.J_w = 0.0;
        haveLastPore_ = false;          // the next station starts afresh
        return out;
    }
    if (!poreBanner_)
    {
        poreBanner_ = true;
        std::ostringstream b;
        b << std::setprecision(3)
          << "  [DSPM-DE] pore SOLVED (poreSolver finiteDifference"
          << (methodDefaulted_ ? ", the default" : "") << "): the"
             " extended Nernst-Planck equations on " << poreNodes_
          << " nodes across the pore" << (nodesDefaulted_
              ? " (stated default; declare `nodes`)" : "")
          << ", " << gridWords()
          << ", Scharfetter-Gummel fluxes, electroneutrality at every node and"
             " zero current, the wall closed with "
          << (wallClosure_ == WallClosure::PorePermeate ? "this pore's own permeate"
                                                        : "the salts' solution-diffusion B_s")
          << (imposed ? " at the imposed J_v" : " and the water flux J_w = A_w (dP - dpi)")
          << " -- ONE Newton per station on the declared block-tridiagonal"
             " structure (" << poreNodes_ << " blocks of " << pore::blockSize(pb)
          << ") with an ANALYTIC Jacobian; NanoFiltran (Geraldes & Alves,"
             " J. Membr. Sci. 321 (2008) 172-182) is the reference it is"
             " compared with; started from the previous station's answer after"
             " the first\n"
          << "  [DSPM-DE] first station solve: " << sol.iterationsTotal
          << " Newton iterations";
        if (sol.continuationSteps > 0)
            b << " (" << sol.continuationSteps << " solves by continuation)";
        b << ", ||F|| = " << sol.residual
          << "; on an " << auditNodes << "-node copy of this station the"
             " block-tridiagonal structure VERIFIED (max |J| off the bands = "
          << audited.offBandMax << ") and the analytic Jacobian against finite"
             " differences " << audited.jacobianMismatch
          << " (of each row's largest entry); stiffness (migration / net flux) = "
          << sol.stiffnessRatio;
        if (settings.adaptive)
            b << "; the adaptive grid took " << sol.gridPasses << " re-solves"
              << (sol.gridSettled ? " and settled" : " and did NOT settle")
              << " (node movement " << sol.gridMove << " of a cell), smallest"
                 " cell " << smallestCell(sol.grid) << " against the uniform "
              << 1.0 / scalar(poreNodes_ - 1);
        b << "\n";
        std::cout << b.str();
    }
    if (sol.continuationSteps > 0 && !continuationSaid_)
    {
        continuationSaid_ = true;
        const std::string msg = "the station Newton from its start stopped ("
            + sol.directFailure + "); the station was solved by continuation"
            " in J_v from the exact no-flux state ("
            + std::to_string(sol.continuationSteps) + " solves).  Every"
            " continuation is counted in the module's pore summary.";
        if (AdvisoryLog::instance().add("solver", "info", "DSPM-DE pore", msg))
            std::cout << "  [DSPM-DE] " << msg << "\n";
    }

    std::vector<scalar> cwall(Ni, 0.0), c_perm_ion(Ni, 0.0);
    for (std::size_t m = 0; m < present.size(); ++m)
    {
        c_perm_ion[present[m]] = sol.cPerm[m];
        cwall[present[m]]      = sol.cWall[m];
    }
    for (std::size_t e = 0; e < excludedIdx.size(); ++e)
        cwall[excludedIdx[e]] = sol.cWallExcluded[e];      // its permeate stays 0
    if (!excludedIdx.empty() && !excludedSaid_)
    {
        excludedSaid_ = true;
        std::ostringstream m;
        m << std::setprecision(4) << "  [DSPM-DE] ";
        for (std::size_t e = 0; e < excludedIdx.size(); ++e)
        {
            const Ion& io = ions[excludedIdx[e]];
            m << (e ? ", " : "") << io.name.key << " (r_s " << io.r * 1e9
              << " nm, lambda " << io.lambda << ")";
        }
        m << ": as large as the pore (lambda >= 1), so the pore EXCLUDES it --"
             " steric partition 0, permeate 0, no pore unknown; it stays in the"
             " film, its wall concentration the interface balance at zero"
             " permeate, counted in the wall's electroneutrality and osmotic"
             " pressure\n";
        std::cout << m.str();
    }
    out.J_w = std::max(sol.Jv, 0.0);

    PoreAccount acc;
    acc.nodes             = int(poreNodes_);
    acc.solves            = 1;
    acc.newtonMax         = sol.iterationsTotal;
    acc.newtonTotal       = sol.iterationsTotal;
    acc.continuations     = sol.continuationSteps > 0 ? 1 : 0;
    acc.residualMax       = sol.residual;
    acc.tolerance         = settings.tolerance;
    acc.fluxConstancyMax  = sol.fluxConstancyMax;
    acc.fluxRelativeMax   = sol.fluxRelativeMax;
    acc.stiffnessMax      = sol.stiffnessRatio;
    acc.currentMax        = sol.currentMax;
    acc.electroneutralMax = sol.electroneutralMax;
    acc.adaptive          = settings.adaptive;
    acc.gridPasses        = sol.gridPasses;
    acc.gridMoveMax       = settings.adaptive ? sol.gridMove : 0.0;
    acc.gridUnsettled     = (settings.adaptive && !sol.gridSettled) ? 1 : 0;
    if (settings.adaptive && !sol.gridSettled && !gridUnsettledSaid_)
    {
        gridUnsettledSaid_ = true;
        std::ostringstream m;
        m << std::setprecision(3)
          << "the adaptive pore grid did not settle at a station: its nodes"
             " would still move by " << sol.gridMove << " of a cell (tolerance "
          << gridTolerance_ << ") after " << sol.gridPasses << " re-solves"
          << (sol.gridFailure.empty() ? std::string()
                                      : "; " + sol.gridFailure)
          << ".  The answer published there is the last converged one, on its"
             " own grid; every such station is counted in the module's pore"
             " summary.";
        AdvisoryLog::instance().add("solver", "warning", "DSPM-DE pore", m.str());
        std::cout << "  [DSPM-DE] " << m.str() << "\n";
    }

    // ---- Collapse ions back to per-salt wall / permeate / flux -------------
    // Per salt: wall conc = max over its ions of (ion wall conc / stoich); the
    // measurable salt permeate conc = (ion permeate / stoich) -- electroneutral,
    // so cation and anion give the same salt conc to numerical accuracy; we take
    // the cation leg (stoich-normalised) as the salt representative.
    //  The partition factors at each face, as the station USED them, and
    //  the solved pore's own face ratios (IonState): published so a reader
    //  can see WHY each ion was rejected (DEV.md 4c C165).  Nothing here
    //  feeds the solve.
    std::vector<int> poreSlot(Ni, -1);
    for (std::size_t m = 0; m < present.size(); ++m) poreSlot[present[m]] = int(m);
    const std::size_t Nn = sol.psi.size() - 1;
    for (std::size_t i = 0; i < Ni; ++i)
    {
        TransportSolution::IonState st;
        st.name   = ions[i].name.key;
        st.z      = ions[i].z;
        st.c_bulk = ions[i].c_bulk;
        st.c_wall = cwall[i];
        st.c_perm = c_perm_ion[i];
        if (ions[i].c_bulk > 0.0)
        {
            st.hasPartition = true;
            st.lambda = ions[i].lambda;
            st.born   = std::exp(-ions[i].dWkT);
            if (poreSlot[i] < 0)                    // excluded: lambda >= 1
            {
                st.excluded = true;
                st.steric   = 0.0;
            }
            else
            {
                const std::size_t m = std::size_t(poreSlot[i]);
                const scalar z = scalar(ions[i].z);
                st.Kd = ions[i].Kd; st.Kc = ions[i].Kc; st.steric = ions[i].Phi;
                st.activityFeed = sol.lnActivityFeed.empty()
                                ? gFixed[i] : std::exp(sol.lnActivityFeed[m]);
                st.activityPerm = sol.lnActivityPerm.empty()
                                ? 1.0 : std::exp(sol.lnActivityPerm[m]);
                st.donnanFeed    = std::exp(-z * sol.psi.front());
                st.donnanPerm    = std::exp(-z * (sol.psi[Nn] - sol.psiPerm));
                st.partitionFeed = sol.c.front()[m] / sol.cWall[m];
                st.partitionPerm = sol.c[Nn][m] / sol.cPerm[m];
                st.c_poreFeed    = sol.c.front()[m];
                st.c_porePerm    = sol.c[Nn][m];
                st.peclet        = ions[i].Kc * sol.Jv
                                 / (ions[i].Kd * ions[i].D * AkdX);
            }
        }
        out.ions.push_back(st);
    }
    for (std::size_t s = 0; s < Ns; ++s)
    {
        scalar salt_wall = 0.0, salt_perm = 0.0; bool got = false;
        for (std::size_t i = 0; i < Ni; ++i)
            if (ions[i].salt == s && ions[i].z > 0)   // cation leg
            {
                salt_wall = cwall[i] / std::max(ions[i].stoich, 1);
                salt_perm = c_perm_ion[i] / std::max(ions[i].stoich, 1);
                got = true;
            }
        if (!got)   // safety: salt with no cation leg (shouldn't happen)
            for (std::size_t i = 0; i < Ni; ++i)
                if (ions[i].salt == s)
                { salt_wall = cwall[i] / std::max(ions[i].stoich, 1);
                  salt_perm = c_perm_ion[i] / std::max(ions[i].stoich, 1); }
        out.c_m[s] = salt_wall * 1.0e-3;                  // mol/m^3 -> kmol/m^3
        out.c_p[s] = salt_perm * 1.0e-3;
        out.J_s[s] = out.J_w * out.c_p[s];               // kmol/(m^2 s): convective

        //  THE TWO LEGS OF A SALT IN A MIXTURE ARE NOT ONE NUMBER (C148,
        //  measured on membrane22): the pore conserves CHARGE, not salts, so
        //  in a feed of several salts an ion may cross with the counter-ion
        //  of another (Mg2+ with Cl-, while SO4 2- stays behind).  The salt
        //  basis the module marches can carry only one of the two legs, and
        //  the cation leg is the one published; where the anion leg differs
        //  the stream's anion is NOT the pore's, and the run says so (once
        //  per salt per pass) rather than letting the stream table imply it.
        scalar anion_perm = -1.0;
        for (std::size_t i = 0; i < Ni; ++i)
            if (ions[i].salt == s && ions[i].z < 0)
                anion_perm = c_perm_ion[i] / std::max(ions[i].stoich, 1);
        if (ctx.streamCarriesSalts && got && anion_perm >= 0.0
            && std::abs(anion_perm - salt_perm)
                   > 1.0e-6 * std::max(std::abs(salt_perm), std::abs(anion_perm)) + 1.0e-12)
        {
            const std::string nm = ctx.thermo.comp(soluteIdx[s]).name();
            char b[400];
            std::snprintf(b, sizeof(b),
                "salt '%s' in a MIXED feed: its cation leg passes %.4g mol/m3 and"
                " its anion leg %.4g mol/m3 at the first station that differs --"
                " the pore conserves charge, not salts, and the salt basis carries"
                " the CATION leg, so the permeate stream's anion of '%s' is not"
                " the pore's (the ion rows of the props bench `poreTransport`"
                " give each ion's own permeate)",
                nm.c_str(), static_cast<double>(salt_perm),
                static_cast<double>(anion_perm), nm.c_str());
            if (AdvisoryLog::instance().addAnnouncedOnce("dspmde:legs:" + nm,
                    "approximation", "warning", "transport DSPM-DE", b))
                std::cout << "  [DSPM-DE] " << b << "\n";
        }
    }
    if (pb.wall.coupled)
    {
        out.xi    = sol.xiPrime * constant::R * T / constant::F;   // V/m
        out.hasXi = true;
    }
    out.pore = acc; out.hasPore = true;
    //  The solved profile, for a caller that draws it (TransportSolution::
    //  PoreProfile; the props bench).  A copy of what the pore solver
    //  returned, nothing recomputed.
    {
        TransportSolution::PoreProfile& pp = out.poreProfile;
        for (std::size_t m = 0; m < present.size(); ++m)
        {
            pp.ionNames.push_back(ions[present[m]].name.key);
            pp.z.push_back(ions[present[m]].z);
        }
        pp.xi      = sol.grid;
        pp.c       = sol.c;
        pp.psi     = sol.psi;
        pp.psiPerm = sol.psiPerm;
        out.hasPoreProfile = true;
    }
    lastPore_ = std::move(sol); haveLastPore_ = true;
    return out;
}

} // namespace membrane
} // namespace Choupo
