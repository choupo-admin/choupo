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
    Choupo::membrane::Polarisation

Description
    THE ONE HOME OF THE WALL CONCENTRATION in the membrane units.  Every
    transport law (solutionDiffusion, DSPM-DE, SDEM) that needs the
    concentration of a solute at the feed-solution/membrane interface asks
    this object; none computes a film of its own.  Before 2026-09-15 three
    laws carried three copies of `c_m = c_p + (c_b - c_p) exp(J_v/k)`, all
    on ONE film coefficient priced with ONE diffusivity, so a feed declared
    ion by ion had every ion polarising as if it were alone and at the same
    rate -- and the SDEM law said so in its banner every run.

    THE MODEL: Geraldes & Afonso, "Prediction of the concentration
    polarization in the nanofiltration/reverse osmosis of dilute multi-ionic
    solutions", J. Membr. Sci. 300 (2007) 20-27,
    doi:10.1016/j.memsci.2007.04.025.  Equation numbers below are the
    paper's.  At the interface the total flux of ion i is the sum of its
    back-diffusion, its convection and its migration in the electrical
    potential gradient xi [V/m] that the different ion mobilities set up:

        N_i  =  J_v C_{i,p}                                            (1)
        N_i  =  J_{i,m} + J_v C_{i,m} - z_i C_{i,m} D_i (F/(R T)) xi   (2)
        J_{i,m} = -k*_{c,i} (C_{i,m} - C_{i,b})                        (3)
        k*_{c,i} = k_{c,i} Xi_i                                        (4)
        sum_i z_i C_{i,m} = 0                                          (8)

    Unknowns: the n wall concentrations C_{i,m} and xi.  There is NO film
    thickness anywhere -- that is the paper's point: the model dispenses
    with the arbitrary film layer of the extended Nernst-Planck approach and
    uses the conventional mass-transfer correlation of the module,
    Sh_i = a Re^b Sc_i^c, evaluated per ion on the ion's OWN diffusivity
    (Sc_i = nu/D_i), corrected for the suction effect of the permeation:

        Xi_i = phi_i + (1 + 0.26 phi_i^1.4)^(-1.7),  phi_i = J_v/k_{c,i}  (5)
               Geraldes & Afonso, AIChE J. 52(10) (2006) 3353-3362,
               doi:10.1002/aic.10968; independent of the flow regime and
               the module geometry, valid for phi_i < 20 (announced beyond)
        Xi_i = phi_i + phi_i / (exp(phi_i) - 1)                        (6)
               the film-theory correction, which the paper reports usable
               for low permeation fluxes (phi_i <= 1)

    SOLVING IT.  For a given xi' = (F/(R T)) xi every wall concentration is
    explicit,

        C_{i,m} = (k*_i C_{i,b} - J_v C_{i,p}) / (k*_i - J_v + z_i D_i xi'),

    where k*_i - J_v = k_i (Xi_i - phi_i) > 0 for both correction forms.
    Electroneutrality (8) is then ONE scalar equation g(xi') = 0.  On the
    interval of xi' where every denominator keeps its sign g is monotone
    and runs from +inf to -inf, so it is bracketed, bisected and polished
    by Newton.  If no bracket with every C_{i,m} > 0 exists the wall is
    REFUSED by name (never clamped): a wall concentration BELOW the bulk is
    legitimate (the paper's Table 1 has Cl- with negative observed
    rejection and negative Gamma), a NEGATIVE one is not.

    THE REDUCTION THAT KEEPS EVERY GOLDEN.  With (6) and z_i = 0 (or xi =
    0) the interface equation gives EXACTLY the film model
    c_m = c_p + (c_b - c_p) exp(J_v/k): k* - J_v = J_v/(e^phi - 1) and
    k* C_b - J_v C_p = J_v (e^phi C_b/(e^phi - 1) - C_p).  So the defaults
    `suctionCorrection filmTheory; ionCoupling none;` ARE the film model
    the corpus was recorded on, to round-off (check_polarisation_coupling
    arm (c) holds it).

    THE SINGLE-SALT IDENTITY.  For one salt A+B- the coupled solution
    collapses to the paper's Eq. (20),
        Gamma = R / (eta Xi_1/phi_1 + (1 - eta) Xi_2/phi_2 - R),
        eta = 1/(1 + (z_1/|z_2|)(D_1/D_2))                        (19)
    with phi_1, phi_2 related to the salt's phi by Eqs. (23)-(24); gate arm
    (b) recomputes it in Python.

    WHAT THE PAPER ASSUMES, carried here: dilute solutions (friction between
    solutes negligible, each ion interacts with the solvent alone); the
    mass-transfer coefficient of each ion independent of the others (the
    main assumption, validated by the paper against the exact single-salt
    solution: deviations below 10 % for 0.16 < D_1/D_2 < 5.5 and phi < 3,
    magnified at high fluxes); unhindered flow on the permeate side (1);
    the permeate electroneutral (footnote 2, so no current flows).  What it
    does NOT contain: any film thickness, any diffusion potential INSIDE a
    film (the interface is a plane between the electrical double layer and
    the bulk), concentration-dependent diffusivities.

    THE POLICY is declared in the unit's operation block, ONE home whichever
    way k arrives (a `massTransfer {}` correlation or a bare `k_film`):

        polarisation
        {
            suctionCorrection  GeraldesAfonso2006 | filmTheory | none;
            ionCoupling        electroneutral | none;
        }

    `none` for the correction is the impermeable-wall coefficient
    uncorrected (Xi = 1) -- a real choice, what the correlation gives before
    any correction.  An unknown word refuses through registryRefusal with
    the accepted list; the two words inside `massTransfer {}` refuse naming
    this block.  DEFAULTS, when absent, are `filmTheory` and `none` --
    today's behaviour -- and a default that is USED is ANNOUNCED once per
    run: on an ion-declared feed (two or more charged solutes) the
    announcement says the film is per ion and field-free and names
    `ionCoupling electroneutral;` as the remedy.

    PER-ION k.  With a correlation, k_{c,i} is evaluated per solute on that
    solute's own D_i: an ion's D_i is the species record's `D0` reached
    through the solute's DECLARED aqueous bridge (never by name), a neutral
    or lumped solute keeps the unit's single declared / priced / legacy
    diffusivity.  An ion with no `D0` refuses by name with the curation
    remedy -- but only when D_i is needed (a correlation, or coupling on);
    a constant `k_film` with `ionCoupling none;` reads no D at all, so a
    case that never asked for one is not refused.

    Published per solute: the polarisation index Gamma_i = (C_{i,m} -
    C_{i,b})/C_{i,b} (the paper's quantity) and, when coupled, xi in V/m.

SourceFiles
    Polarisation.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "MassTransferModel.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <limits>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace membrane {

enum class SuctionCorrection { GeraldesAfonso2006, FilmTheory, None };
enum class IonCoupling       { Electroneutral, None };

//- The declared policy of the film, and whether each word was declared
//  (a used default is announced; a declared value announces nothing).
struct PolarisationPolicy
{
    SuctionCorrection suction  = SuctionCorrection::FilmTheory;
    IonCoupling       coupling = IonCoupling::None;
    bool suctionDeclared  = false;
    bool couplingDeclared = false;
};

//- The accepted words, ONE home for the enumeration the reader sees.
const std::vector<std::string>& suctionCorrectionWords();
const std::vector<std::string>& ionCouplingWords();
const std::string& word(SuctionCorrection s);
const std::string& word(IonCoupling c);

//- Read `polarisation {}` from the unit's operation block.  Refuses an
//  unknown word (registryRefusal, accepted list) and either word placed
//  inside `massTransfer {}` (naming the block it belongs to).
PolarisationPolicy readPolarisationPolicy(const DictPtr& operation);

//- Xi_i for the declared correction at phi = J_v/k  (Eq. 5, Eq. 6, or 1).
scalar suctionFactor(SuctionCorrection s, scalar phi);

//- The wall at one station: what the kernel returns.
struct WallSolution
{
    std::vector<scalar> c_m;     // wall concentration, the units of c_b
    std::vector<scalar> k;       // k_{c,i}  [m/s]
    std::vector<scalar> phi;     // J_v / k_{c,i}
    std::vector<scalar> Xi;      // the suction correction applied
    std::vector<scalar> Gamma;   // (c_m - c_b)/c_b
    scalar xiPrime  = 0.0;       // (F/(R T)) xi  [1/m]; 0 when uncoupled
    scalar xi       = 0.0;       // xi  [V/m]; 0 when uncoupled
    bool   coupled  = false;
    scalar chargeResidual = 0.0; // |sum z c_m| / sum |z| c_m (coupled)
    int    iterations = 0;
    //  A wall the interface balance cannot satisfy with every C_{i,m} > 0.
    //  The kernel does not throw: a transport law's Newton may ask about a
    //  TRIAL permeate and must be free to back away from it.  The accepted
    //  answer is checked by the caller (`requireOk`), which refuses by name.
    bool        ok = true;
    std::string reason;
};

//- THE KERNEL, Eqs. (2)-(8): the wall for given per-solute k_i, D_i, z_i,
//  bulk c_b, permeate c_p, flux J_v and temperature.  Concentration units
//  cancel (the system is homogeneous in C), so kmol/m3 and mol/m3 both
//  serve.  `names` label a refusal.  D_i is read only for a charged solute
//  under coupling; pass NaN where it is unknown and unneeded.
WallSolution wallConcentrations(const PolarisationPolicy&       policy,
                                scalar                          J_v,
                                const std::vector<scalar>&      k,
                                const std::vector<scalar>&      D,
                                const std::vector<int>&         z,
                                const std::vector<scalar>&      c_b,
                                const std::vector<scalar>&      c_p,
                                scalar                          T_K,
                                const std::vector<std::string>& names);

//- The wall solved JOINTLY with the solution-diffusion permeate closure
//  c_{p,i} = B_i c_{m,i} / (J_v + B_i): the local problem of the
//  solutionDiffusion law and the seed of the two charge-aware laws.  ONE
//  path: uncoupled it is affine in c_p and the Newton lands on the closed
//  form in one step; coupled it is a small Newton on c_p.  `c_p` is
//  returned through the last argument.
WallSolution wallWithSolutionDiffusion(const PolarisationPolicy&       policy,
                                       scalar                          J_v,
                                       const std::vector<scalar>&      k,
                                       const std::vector<scalar>&      D,
                                       const std::vector<int>&         z,
                                       const std::vector<scalar>&      c_b,
                                       const std::vector<scalar>&      B,
                                       scalar                          T_K,
                                       const std::vector<std::string>& names,
                                       std::vector<scalar>&            c_p);

//- Refuse, by name, a wall the kernel could not satisfy.  `site` names the
//  law or op asking.
void requireOk(const WallSolution& w, const std::string& site);

//- The object a unit builds ONCE per run and hands to its transport law
//  through the TransportContext.  It holds the policy, the per-solute
//  identity (z_i, D_i) and the k supplier: a correlation evaluated per
//  solute on the local hydraulics, or a constant.
class Polarisation
{
public:
    struct Solute
    {
        std::string name;
        int         z    = 0;                                   // 0: neutral / lumped
        scalar      D    = std::numeric_limits<scalar>::quiet_NaN();
        std::string dOrigin;                                    // how D was obtained
    };

    Polarisation(PolarisationPolicy      policy,
                 std::vector<Solute>     solutes,
                 const MassTransferModel* correlation,    // may be nullptr
                 scalar                  kConstant,       // used when no correlation
                 scalar                  T_K);

    const PolarisationPolicy&  policy()  const { return policy_; }
    const std::vector<Solute>& solutes() const { return solutes_; }
    scalar                     T_K()     const { return T_; }
    std::size_t                nIons()   const;
    bool                       coupled() const
    { return policy_.coupling == IonCoupling::Electroneutral; }
    bool                       hasCorrelation() const { return corr_ != nullptr; }

    //- k_{c,i} for solute s at the local hydraulics (the D slot of `hyd` is
    //  overwritten with the solute's own D).
    scalar kFilm(const MassTransferContext& hyd, std::size_t s) const;
    //- k for an arbitrary diffusivity at the local hydraulics (the ion list
    //  of DSPM-DE, which decomposes salts the unit knows only as solutes).
    scalar kFilmForD(const MassTransferContext& hyd, scalar D) const;
    //- True when the correlation prices a DIFFERENT k per solute (their D
    //  differ); then the module publishes k_film_<solute> columns.
    bool perSoluteK() const;

    //- The wall for a given permeate (the SDEM inner problem).
    WallSolution wall(const MassTransferContext& hyd, scalar J_v,
                      const std::vector<scalar>& c_b,
                      const std::vector<scalar>& c_p) const;
    //- The wall with the solution-diffusion closure (the solutionDiffusion
    //  law; the SDEM seed).
    WallSolution wallWithSolutionDiffusion(const MassTransferContext& hyd,
                                           scalar J_v,
                                           const std::vector<scalar>& c_b,
                                           const std::vector<scalar>& B,
                                           std::vector<scalar>& c_p) const;

    std::vector<scalar>      kVector(const MassTransferContext& hyd) const;
    std::vector<scalar>      DVector() const;
    std::vector<int>         zVector() const;
    std::vector<std::string> nameVector() const;

private:
    PolarisationPolicy       policy_;
    std::vector<Solute>      solutes_;
    const MassTransferModel* corr_;
    scalar                   kConst_;
    scalar                   T_;
};

//- Build the object from a unit's operation block: reads the policy,
//  resolves each solute's charge through its DECLARED aqueous bridge (a
//  solute with none, or with a multi-species one, is neutral / lumped),
//  resolves an ion's D from its species record's `D0` when the policy or
//  the correlation needs it (refusing by name otherwise), hands a neutral
//  solute `D_neutral` (the unit's declared / priced / legacy value), and
//  ANNOUNCES every default that is used.  `unitLabel` is the advisory
//  locus ("membrane 'NF270'").
Polarisation buildPolarisation(const DictPtr&                  operation,
                               const ThermoPackage&            thermo,
                               const std::vector<std::size_t>& soluteIdx,
                               const MassTransferModel*        correlation,
                               scalar                          kConstant,
                               scalar                          D_neutral,
                               scalar                          T_K,
                               const std::string&              unitLabel,
                               int                             verbosity);

} // namespace membrane
} // namespace Choupo
