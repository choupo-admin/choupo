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
    Choupo::TransportModel

Description
    Selectable membrane-transport law for the spiral-wound module.  Given the
    LOCAL bulk state at one z station (the TransportContext) it returns the
    coupled water flux J_w, the wall/permeate concentrations c_m / c_p and the
    solute flux J_s (the TransportSolution).  The unit op marches this along
    the channel; the transport law is the load-bearing local non-linearity.

    Explicit-factory pattern, parallel to MassTransferModel / OsmoticModel /
    PressureDropModel.  A `transport <name>;` keyword in the unit's operation
    picks the concrete law; without it `solutionDiffusion` (the baseline) is
    used.  Built-ins:

        solutionDiffusion  --  the classical solution-diffusion law with
                               concentration polarisation from the shared
                               Polarisation object and a van't-Hoff /
                               Pitzer osmotic back-pressure.  An inner
                               Newton-1D in J_w resolves the coupled
                               flux–polarisation–osmotic non-linearity.

        DSPM-DE            --  the charged-pore Donnan-steric model with
                               dielectric exclusion (Bowen-Welfoot), ion by
                               ion, for a membrane record carrying a
                               poreModel{} tier.

        constantRejection  --  a CONSTANT INTRINSIC REJECTION R_i per
                               solute, c_p,i = (1 - R_i) c_m,i (Geraldes &
                               Afonso 2007, Eq. 1, R_i an input), declared
                               in `transportParameters { rejection {} }`.

        SDEM               --  solution-diffusion-electromigration
                               (Yaroshchuk): per-ion solution-diffusion
                               coupled by the zero-current electric field,
                               so an ION-declared feed yields an
                               electroneutral permeate with NO parameter
                               beyond the record's per-ion permeances.

    The membrane handle and an activity/speciation hook ride in the context
    for the laws that need them; solution-diffusion reads neither.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "../massTransfer/Polarisation.H"

#include <algorithm>
#include <cstddef>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;
class Membrane;
class OsmoticModel;
namespace electrolyte { class SpeciationSolver; }

// The membrane transport factory lives in a nested namespace: the name
// `TransportModel` is already taken in `Choupo` by the thermo property
// (viscosity) transport model (src/thermo/transport/), an unrelated concept.
namespace membrane {

// ---- The account of a pore that was SOLVED ----------------------------------
//
//  Set only by a law that solved the extended Nernst-Planck equations across
//  the pore (DSPM-DE's solved pore, its default since C141), one per
//  z station, merged by the module over the channel.  A law that solved no
//  pore leaves `TransportSolution::hasPore` false, so a module publishes and
//  prints nothing about a pore nobody solved -- absence keeps meaning "not
//  solved", never "solved trivially".
struct PoreAccount
{
    int    nodes             = 0;   // grid nodes across the pore
    int    solves            = 0;   // pore solves (water-flux passes)
    int    newtonMax         = 0;   // the most Newton iterations of one solve
    long   newtonTotal       = 0;   // Newton iterations, every solve summed
    int    continuations     = 0;   // solves reached by continuation in J_v
    scalar residualMax       = 0.0; // ||F||_2 of the normalised rows
    scalar tolerance         = 0.0; // the Newton's ||F||_2 tolerance in force
    scalar fluxConstancyMax  = 0.0; // |N_k - J_v c_perm| / the terms balanced
    scalar fluxRelativeMax   = 0.0; // |N_k - J_v c_perm| / J_v c_perm
    scalar stiffnessMax      = 0.0; // migration flux / net flux
    scalar currentMax        = 0.0; // |sum z N| / sum |z N|
    scalar electroneutralMax = 0.0; // |sum z c + X_d| / (sum |z| c + |X_d|)
    //  The adaptive grid (C144): whether it ran, the re-solves on a moved
    //  grid, the largest final node movement (in cells) and the stations
    //  whose grid did not settle below the tolerance.
    bool   adaptive          = false;
    int    gridPasses        = 0;
    scalar gridMoveMax       = 0.0;
    int    gridUnsettled     = 0;

    void merge(const PoreAccount& o)
    {
        adaptive          = adaptive || o.adaptive;
        gridPasses       += o.gridPasses;
        gridMoveMax       = std::max(gridMoveMax, o.gridMoveMax);
        gridUnsettled    += o.gridUnsettled;
        nodes             = std::max(nodes, o.nodes);
        solves           += o.solves;
        newtonMax         = std::max(newtonMax, o.newtonMax);
        newtonTotal      += o.newtonTotal;
        continuations    += o.continuations;
        residualMax       = std::max(residualMax, o.residualMax);
        tolerance         = std::max(tolerance, o.tolerance);
        fluxConstancyMax  = std::max(fluxConstancyMax, o.fluxConstancyMax);
        fluxRelativeMax   = std::max(fluxRelativeMax, o.fluxRelativeMax);
        stiffnessMax      = std::max(stiffnessMax, o.stiffnessMax);
        currentMax        = std::max(currentMax, o.currentMax);
        electroneutralMax = std::max(electroneutralMax, o.electroneutralMax);
    }
};

// ---- The result of the local J_w–c_m–c_p problem at one z station ----------
struct TransportSolution
{
    scalar              J_w;        // water flux at this z [m/s]
    std::vector<scalar> c_m;        // membrane-wall concentration [kmol/m^3]
    std::vector<scalar> c_p;        // permeate-side concentration [kmol/m^3]
    std::vector<scalar> J_s;        // solute flux [kmol/(m^2.s)]
    //  The dimensionless electric potential drop across the active layer
    //  (RT/F units), published by a charge-coupled law (SDEM); `hasPsi`
    //  stays false for a law that computes none, so the module publishes
    //  the column only when a law produced it.
    scalar              psi    = 0.0;
    bool                hasPsi = false;
    //  The electrical potential gradient at the feed-solution/membrane
    //  INTERFACE [V/m] -- the polarisation film's own field (Geraldes &
    //  Afonso 2007), distinct from psi, which is the drop ACROSS the
    //  membrane.  Set by every law when `ionCoupling electroneutral;` is
    //  declared; `hasXi` stays false otherwise.
    scalar              xi     = 0.0;
    bool                hasXi  = false;
    //  The pore solve's own account at this station (see PoreAccount).
    PoreAccount         pore;
    bool                hasPore = false;
    //  Ion by ion, for a law that works in ions (DSPM-DE): the bulk, wall
    //  and permeate concentrations [mol/m^3].  A salt's ion appears once
    //  per salt that carries it (two salts sharing Cl- give two rows), so a
    //  reader that wants the species sums by `name`.  Empty otherwise.
    struct IonState
    {
        std::string name;
        int         z      = 0;
        scalar      c_bulk = 0.0;
        scalar      c_wall = 0.0;
        scalar      c_perm = 0.0;
        //  WHY THE ION WAS REJECTED (DEV.md 4c C165): the factors of its
        //  partition at each face, as the law USED them -- set by DSPM-DE
        //  where the pore was solved (`hasPartition`), absent otherwise.
        //  lambda = r_i/r_p; Kd, Kc the hindrance pair; steric = Phi_S =
        //  (1 - lambda)^2; born = exp(-dW_i/kT) (1 with Born off); at the
        //  FEED face activityFeed = the activity ratio the partition carried
        //  (gamma_wall under wallDavies, gamma_wall/gamma_pore(0) under
        //  bulkOverPoreDavies, 1 under ideal), donnanFeed = exp(-z psi(0))
        //  (psi relative to the feed-side solution at the wall) and
        //  partitionFeed = c_pore(0)/c_wall, the SOLVED pore's own ratio; at
        //  the PERMEATE face activityPerm (gamma_perm/gamma_pore(1) under
        //  bulkOverPoreDavies, else 1), donnanPerm = exp(-z (psi(1) - psi_p))
        //  and partitionPerm = c_pore(1)/c_perm.  The law's equations make
        //  partition = steric x born x activity x donnan at each face; the
        //  partitions are read off the solved state, not formed from the
        //  factors, so the identity is a CHECK (bin/curate/
        //  check_nanofiltran_paper.py).  An ion the pore EXCLUDES
        //  (`excluded`, lambda >= 1) has steric 0 and both partitions 0, and
        //  no hindrance, Donnan or activity factor (no pore unknown).
        //  The pore's own face concentrations [mol/m^3] -- c_pore(0) and
        //  c_pore(1), the two inner steps of bulk -> wall -> pore inlet ->
        //  pore outlet -> permeate -- and the ion's pore Peclet number
        //  Pe_i = K_c J_v / (K_d D_i A_k/dx), convection against hindered
        //  diffusion across the layer (Theory Guide eq:dspmde-transmission).
        bool        hasPartition  = false;
        bool        excluded      = false;
        scalar      lambda        = 0.0;
        scalar      Kd            = 0.0;
        scalar      Kc            = 0.0;
        scalar      steric        = 0.0;
        scalar      born          = 1.0;
        scalar      activityFeed  = 1.0;
        scalar      donnanFeed    = 1.0;
        scalar      partitionFeed = 0.0;
        scalar      activityPerm  = 1.0;
        scalar      donnanPerm    = 1.0;
        scalar      partitionPerm = 0.0;
        scalar      c_poreFeed    = 0.0;
        scalar      c_porePerm    = 0.0;
        scalar      peclet        = 0.0;
    };
    std::vector<IonState> ions;
    //  The SOLVED PORE's own profile at this station (DSPM-DE), for a caller
    //  that draws it -- the props bench, which publishes the potential
    //  difference across the membrane and the concentration and potential
    //  profiles (C145, the NanoFiltran paper's Table 2 and Fig. 4).  `xi`
    //  is the dimensionless pore coordinate x/dx in [0, 1]; `c[node][k]`
    //  the concentration of pore ion k [mol/m^3], the ions named in
    //  `ionNames` in the order the law built them (an ion carried by two
    //  salts appears once per salt -- a reader that wants the species sums
    //  by name); `psi` and `psiPerm` the potential in RT/F units, relative
    //  to the feed-side solution at the membrane wall (psi(0) is the feed
    //  Donnan jump, psiPerm the permeate's potential: the potential
    //  difference across the membrane is psiPerm).  The modules ignore it.
    struct PoreProfile
    {
        std::vector<std::string>         ionNames;
        std::vector<int>                 z;
        std::vector<scalar>              xi;
        std::vector<std::vector<scalar>> c;
        std::vector<scalar>              psi;
        scalar                           psiPerm = 0.0;
    };
    PoreProfile poreProfile;
    bool        hasPoreProfile = false;
};

// ---- The inputs to the local problem at one z station ----------------------
//
//  A single bundle passed to TransportModel::localFluxes, replacing the old
//  positional argument list.  It carries the bulk state and every model
//  handle the local law may consult; a model reads only the fields it needs
//  (solution-diffusion ignores `membrane` and `speciation`, which are
//  forward-looking hooks for a future charged-NP / DSPM-DE model).
//
//  Pressures are in Pa; temperature in K; concentrations in kmol/m^3.
//  `c_b` is the local BULK (feed-side) solute concentration vector; the
//  wall concentration c_m comes from ONE home, `polarisation` (the film's
//  declared policy, each solute's charge and diffusivity, and the k_c,i
//  supplier), evaluated at the station's `hydraulics` (crossflow velocity,
//  hydraulic diameter, mu, rho -- the D slot is filled per solute).  No law
//  raises c_b to the wall itself.
struct TransportContext
{
    const ThermoPackage&            thermo;     // global component package
    const std::vector<std::size_t>& soluteIdx;  // solute slots in thermo
    const std::vector<scalar>&      B_s;        // per-solute permeability
    scalar                          A_w;        // water permeability [m/(s.Pa)]
    const Polarisation&             polarisation; // the wall, one home
    MassTransferContext             hydraulics; // local channel state for k_c,i
    scalar                          P_feed_Pa;  // feed-side pressure [Pa]
    scalar                          P_perm_Pa;  // permeate pressure  [Pa]
    scalar                          T_K;        // temperature [K]
    const std::vector<scalar>&      c_b;        // local bulk solute conc.
    const OsmoticModel&             osm;        // osmotic-pressure model
    const Membrane*                 membrane;   // membrane handle (hook)
    const electrolyte::SpeciationSolver* speciation; // activity hook
    //  A water flux IMPOSED by the caller [m/s] (the props bench, which
    //  reproduces a program that takes J_v as its input): the law skips
    //  its J_w = A_w (dP - dpi) closure and solves the solute transport at
    //  this J_v.  NaN (every unit) means the law closes J_w itself.  Only
    //  DSPM-DE honours it; a caller handing it to another law must refuse.
    scalar imposedJv = std::numeric_limits<scalar>::quiet_NaN();
    //  Whether the caller carries the answer on a SALT-basis stream (every
    //  membrane unit: true).  The props bench publishes ion by ion and has
    //  no stream, so it says false, and a law's warning about what the
    //  STREAM cannot carry (DSPM-DE: a salt's two legs in a mixture) is not
    //  raised there (DEV.md 4c C165).
    bool streamCarriesSalts = true;
};

class TransportModel
{
public:
    using Factory = std::function<std::unique_ptr<TransportModel>()>;

    virtual ~TransportModel() = default;

    virtual const std::string& type() const = 0;

    // Read model-specific parameters from the `transport {... }` block, if any.
    virtual void readParameters(const DictPtr& /*transportDict*/) {}

    // Solve the coupled local J_w–c_m–c_p problem at fixed bulk state.
    virtual TransportSolution localFluxes(const TransportContext& ctx) const = 0;

    //  Does this law read the membrane record's `permeabilities {}` (B_s)?
    //  A law that does not (constantRejection) is not warned about a solute
    //  the record gives no B_s -- the warning would describe an input the
    //  run never reads.
    virtual bool readsMembranePermeabilities() const { return true; }

    //  Does this law take a feed of SALTS and work in their IONS itself
    //  (DSPM-DE: `electrolyte { cation; anion; }`)?  Then the film's
    //  `ionCoupling electroneutral;` is the law's to apply ion by ion, and
    //  the polarisation builder does not refuse it for want of charged
    //  SOLUTES (DEV.md 4c C148).
    virtual bool decomposesSaltsIntoIons() const { return false; }

    //  The solutes whose parameter the case asked to DERIVE from the module
    //  record's rated test (`<solute> fromRatedTest;`, DEV.md 4c C189) --
    //  only constantRejection reads that word today.  The unit that holds
    //  the record performs the inversion (membrane/RatedTestInversion.H)
    //  and hands the derived value back through setRatedRejection; a law
    //  that never asks gets nothing handed.
    virtual std::vector<std::string> ratedTestSolutes() const { return {}; }
    //  The id of the rated test the case named for `solute` (`<solute> (
    //  fromRatedTest <id> );`, C189 slice 2); empty when it named none.
    virtual std::string ratedTestId(const std::string& /*solute*/) const { return {}; }
    virtual void setRatedRejection(const std::string& solute, scalar /*R_int*/)
    {
        throw std::runtime_error("transport " + type() + ": no parameter of"
            " this law is derived from a rated test (asked for '" + solute
            + "').");
    }

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<TransportModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace membrane
} // namespace Choupo
