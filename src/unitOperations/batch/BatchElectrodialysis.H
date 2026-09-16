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
    Choupo::BatchElectrodialysis

Description
    A RECIRCULATING BATCH ELECTRODIALYSIS RIG: two well-mixed tanks -- the
    diluate and the concentrate -- each pumped through the SAME stack the
    steady `electrodialysisStack` runs, for as long as the operator leaves
    the rectifier on.

    WHY IT EXISTS, and why it is where yesterday's slice pays for itself.
    `ed03_stack_record`'s own header ends: *"A bench stack of seven cell
    pairs in ONE pass removes a few per cent of the diluate's sodium, which
    is why a real bench run RECIRCULATES the diluate through a tank.  That
    batch arrangement is not modelled here."*  This is that arrangement.
    But the reason it EARNS a unit is not the plumbing.  The
    `GeraldesAfonso2010` limiting current is a PREDICTION from the ion
    diffusivities and the DILUATE COMPOSITION; in a steady case that
    composition is fixed, so the prediction is evaluated once and is, to a
    student, a better number.  In a batch desalination the diluate DEPLETES,
    so **i_lim falls while the run proceeds**, and a constant-current run
    crosses into the over-limiting regime part way through.  That crossing
    is the whole pedagogy of batch electrodialysis and it cannot be shown at
    all by a model that reads a declared transport number.

    NO NEW ARCHITECTURE.  This is a `BatchUnitOperation` asking
    `edCell::predictiveLimitingCurrent` -- the same assembly of Eqs.
    A13/12/13/15/16 the steady stack asks -- once per instant instead of
    once per pass, plus the same Nernst, ohmic and Faraday relations from
    `Electrochem.H` and `EDCell.H`.  Those moved out of
    `ElectrodialysisStack.cpp`'s anonymous namespace the day this unit
    arrived; nothing in them was rewritten and no steady golden moved.

    TWO TANKS IN ONE VESSEL, and why.  `BatchUnitOperation` carries one
    `BatchState`, and the obvious cheap shape -- diluate as the state,
    concentrate discharged into a `batchAccumulator` -- was rejected: the
    unit would then be unable to SEE the concentrate composition, which is
    exactly what the Nernst membrane potential is a function of, and a
    recirculating tank is not a discharge (nothing leaves the rig).  So this
    unit holds BOTH: `state()` is the DILUATE (the product a student cares
    about), the concentrate is internal state it publishes in full, and
    `materialInventory()` / `cycleState()` are OVERRIDDEN to return the SUM
    so the campaign mass balance sees every mole.  The rig is CLOSED -- no
    boundary flow at all -- so the campaign material closure is exact by
    construction, and the derivative moves the same number out of one tank
    and into the other, which the integrator preserves to round-off.

    THE MODEL.  With N cell pairs at current I, current efficiency xi, and a
    counter-ion pair (cation c of charge z_c, anion a of charge |z_a|):

        i        = I / A_cellpair
        i_lim    = edCell::predictiveLimitingCurrent(stack, diluate, Q, ...)
        xi_eff   = xi                          (overLimiting model `none`)
                 = xi * min(1, i_lim / i)      (model `saltFluxPlateau`)
        dn_c/dt  = -xi_eff I N / (z_c F)   into the concentrate
        dn_a/dt  = -xi_eff I N / (|z_a| F) into the concentrate
        E_mem    = (RT/z_c F) ln(a_c,con/a_c,dil) + (RT/|z_a| F) ln(a_a,con/a_a,dil)
        R_pair   = R_CEM + R_AEM + h/(kappa_dil A) + h/(kappa_con A)
        U        = N (E_mem + I R_pair) + E_electrodes
        dW/dt    = U I

    and the electrical energy is an INTEGRATED STATE ROW, not a quadrature
    taken afterwards -- the diafilter's permeated-volume lesson
    (a ledger built by re-integrating a rate disagrees with the state the
    integrator accepted, at O(dt)).

    TWO WAYS TO DRIVE IT, exactly one of which a case declares:

      `current <I> A;`    constant current.  i is FIXED while i_lim FALLS,
                          so the run crosses into the over-limiting regime.
      `voltage <U> V;`    constant voltage.  I is solved from the stack
                          equation at every instant; as the diluate depletes
                          its conductivity falls and the Nernst back-EMF
                          grows, so I DECAYS -- which is why a real rig run
                          at fixed voltage never crosses i_lim and simply
                          takes longer.

    WHAT IT PUBLISHES, AND WHY THAT.  The hand calculation a student does
    for a batch electrodialysis is Faraday's law at the INITIAL current:

        n_c(t) = n_c(0) - xi I(0) N t / (z_c F)

    -- a straight line, hitting zero at a finite time.  So the unit
    publishes `deminIdeal` from THIS RUN's own initial current, initial
    inventory and declared xi (computed from the run, never declared, so the
    gap cannot have been arranged) beside `deminActual`, and it names the
    reason they part: the constant-voltage run because I decayed, the
    constant-current run because i crossed i_lim and xi_eff fell with it.
    Under `overLimiting { model none; }` at constant current the two agree
    to the integrator's own precision, and THAT is a result rather than a
    disappointment -- the gap you can see is only as large as the physics in
    the model, and this model then contains nothing that could open one.

    THE OVER-LIMITING PLATEAU IS A CLAIM, and it is OPT-IN.  At i = i_lim
    the counter-ion concentration vanishes at the diluate/membrane interface
    and the film can deliver no more of it; a larger current must therefore
    be carried by something else, and what is available is H+ and OH- from
    water dissociation at the depleted interface.  Taking the counter-ion
    transfer as FROZEN at its limiting value -- xi_eff = xi i_lim/i -- is the
    first-order statement of that, it introduces NO new parameter (Vitor,
    2026-09-15: *"nao se pode andar a aumentar o numero de parametros"*), and
    it is what makes the crossing visible in the depletion curve.  It is
    nevertheless a model of a regime, so the DEFAULT is `none`: xi stays
    put, the run WARNS that it is outside the model's validity, and it does
    NOT clamp the current -- the steady stack's own posture.

    NOT MODELLED, said plainly so a green run cannot imply otherwise:

      * MORE THAN ONE CATION OR ONE ANION.  A multi-ionic diluate is
        REFUSED by name.  Splitting the counter-ion current between two
        counter-ions is set by the MEMBRANES' selectivity between them, for
        which this tree carries no data; the limiting transport numbers of
        Eqs. 12/13 describe the FILM at the limiting current and are not
        that selectivity.  Choosing one would be inventing the parameter
        the 2010 model exists to remove.
      * BACK-DIFFUSION of salt from the concentrate to the diluate.  It is
        real and it is what stops a real rig concentrating indefinitely, but
        it needs a membrane salt permeability that no `kind IEM` record
        carries -- a new declared parameter, and no measurement in the tree
        to set it.
      * WATER TRANSPORT, osmotic and electro-osmotic.  Both tanks keep their
        water, so neither volume changes and no concentrate dilution appears.
      * A FALLING CURRENT EFFICIENCY from co-ion leakage as the concentrate
        strengthens: xi is a declared constant (apart from the opt-in
        over-limiting plateau above).
      * ANY TEMPERATURE TRANSIENT.  The rig is ISOTHERMAL at the declared
        tank temperature; the Joule heat that would raise it is not removed
        by any modelled duty (see `energyLedgerGap`).
      * THE PUMPS.  Two recirculation loops, no shaft work anywhere.
      * THE ELECTRODE REACTIONS, lumped into `E_electrodes` exactly as in
        the steady stack: no Butler-Volmer, no electrode-rinse chemistry.

    ENERGY.  The electrical work IS integrated, exactly, as a state row and
    published (`energy_electric_kJ`, `specificEnergy_kWh_per_m3`).  It is
    NOT emitted as an energy-ledger record, and the campaign first law is
    therefore UNAVAILABLE and says so: to CLAIM it the model would need the
    heat removed to hold both tanks isothermal, and setting that equal to
    the electrical work would be a PLUG -- a balance that closes by
    construction and measures nothing.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"
#include "core/Dictionary.H"
#include "core/Types.H"
#include "unitOperations/electrochem/EDCell.H"

#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class EDStack;
namespace electrolyte { class AqueousActivity; }

class BatchElectrodialysis : public BatchUnitOperation
{
public:
    BatchElectrodialysis();
    ~BatchElectrodialysis() override;   // out of line: the activity model is
                                        // an incomplete type in this header

    const std::string& type() const override;

    void initialise(const DictPtr&       unitDict,
                    const ThermoPackage& thermo,
                    const DictPtr&       reactionsDict) override;

    void step(scalar t, scalar dt) override;

    //  A clean autonomous ODE on [n_diluate..., n_concentrate..., W_elec].
    bool        hasOdeForm()   const override { return true; }
    sVector     odeState()     const override;
    void        setOdeState(const sVector& y) override;
    sVector     odeDerivative(const sVector& y) const override;
    std::size_t odeNPositive() const override;

    //- The DILUATE is the vessel's state: it is the product.
    const BatchState& state() const override { return state_; }

    //- BOTH tanks.  The rig is closed, so this is constant for the whole
    //  campaign and the material balance closes by construction; a sum that
    //  forgot the concentrate would read as a vessel destroying salt.
    sVector materialInventory() const override;
    sVector cycleState() const override;

protected:
    BatchState& mutableState() override { return state_; }

public:
    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;
    std::vector<SimulationResult::TimelineEvent> statusEvents() const override;

    void noteTimeAdvanced(scalar t) override;

    std::string energyLedgerGap() const override;

private:
    //  Everything the rig is doing at one instant, from the two inventories.
    struct Instant
    {
        edCell::ChannelState   chD, chC;
        edCell::LimitingCurrent lc;
        scalar I = 0.0, U = 0.0, i_dens = 0.0, iOverLim = 0.0, xiEff = 0.0;
        scalar E_mem_pair = 0.0, E_cem = 0.0, E_aem = 0.0;
        scalar R_pair = 0.0, R_dil = 0.0, R_conc = 0.0;
        scalar rCation = 0.0, rAnion = 0.0;   // kmol/s leaving the diluate
        bool   capped = false;
    };
    Instant evaluate(const sVector& nD, const sVector& nC) const;
    sVector fractions(const sVector& n) const;
    scalar  waterVolume(const sVector& n) const;

    enum class OverLimiting { None, SaltFluxPlateau };
    enum class Drive        { Current, Voltage };

    const ThermoPackage* thermo_ = nullptr;
    BatchState           state_;            // the DILUATE tank
    sVector              nConc_;            // the CONCENTRATE tank [kmol]
    scalar               W_elec_kJ_ = 0.0;  // integrated electrical work

    std::vector<std::string> compNames_;
    sVector              MW_;
    std::size_t          iWater_ = 0;

    const EDStack*       stack_ = nullptr;
    edCell::IEMSpec      cem_, aem_;
    std::string          membraneName_;
    std::unique_ptr<electrolyte::AqueousActivity> act_;

    int     N_ = 0;
    scalar  area_ = 0.0, hCh_ = 0.0;
    scalar  xi_ = 0.9, E_electrodes_ = 0.0;
    scalar  Qdil_ = 0.0;                    // m3/s, the declared recirculation rate
    scalar  nu_ = 1.0e-6, seFactor_ = 1.0;  // the solvent, resolved once (isothermal)
    bool    muPriced_ = false;
    Drive        drive_   = Drive::Current;
    scalar       IDeclared_ = 0.0, UDeclared_ = 0.0;
    OverLimiting overLimit_ = OverLimiting::None;
    bool         overLimitDeclared_ = false;

    //  The counter-ion pair, resolved once: exactly one of each sign.
    std::size_t  iCation_ = 0, iAnion_ = 0;
    scalar       zCation_ = 0.0, zAnion_ = 0.0;
    std::string  cationName_, anionName_;

    sVector n0D_, n0C_;
    scalar  I0_ = 0.0, iLim0_ = 0.0, V0dil_ = 0.0;
    scalar  tNow_ = 0.0;

    //  The crossing: recorded once, at the first ACCEPTED state where
    //  i >= i_lim.  < 0 means it never happened.
    scalar tCross_ = -1.0;
    bool   announcedCross_ = false;
    bool   announcedCap_   = false;

    int verbosity_ = 3;
};

} // namespace Choupo
