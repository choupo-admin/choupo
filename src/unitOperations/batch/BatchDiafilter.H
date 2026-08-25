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
    A stirred RETENTATE vessel behind a membrane: the batch half of the
    pressure-driven separation the tree has only ever solved at steady state.

    WHY IT EXISTS.  Everything a membrane needs was already here -- the
    solution-diffusion and DSPM-DE transport laws, the van't Hoff and Pitzer
    osmotic models, the film polarisation, the membrane records -- and all of
    it served exactly one unit, the steady spiral-wound module.  Diafiltration
    and batch concentration are how membranes are actually run at laboratory
    and pilot scale, and how they are taught; `choupoBatch` had no membrane at
    all.  This unit adds no architecture.  It is a `BatchUnitOperation` that
    asks `TransportModel::localFluxes` the same question the module asks, once
    per instant instead of once per channel node.

    THE MODEL.  The vessel is WELL MIXED, so there is one bulk composition and
    the local flux law is evaluated at it.  With V the retentate volume, A the
    membrane area and Q_d the diafiltrate addition rate:

        V        = sum_i n_i MW_i / rho                (BulkConversion.H)
        c_i      = n_i / V
        J_w,J_s  = transport->localFluxes(c, TMP, T, k_film)
        Q_p      = J_w * A
        dn_i/dt  = -J_s,i * A  +  Q_d * c_d,i          (solutes)
        dn_w/dt  = -(Q_p rho - sum_i J_s,i A MW_i)/MW_w  +  Q_d rho_d/MW_w

    The solvent line is NOT `-c_p,w Q_p`.  It is the permeate's mass closed on
    the same solution density the concentrations were built from, exactly as
    `BulkConversion.H` derives -- so the permeate's reconstructed mass equals
    Q_p*rho and the vessel conserves mass to machine precision.  Taking the
    permeate water from a pure-water concentration instead is the ~1 % mass
    leak that header records.

    TWO MODES, and the difference is one line:

      `concentration`    Q_d = 0.  The vessel shrinks; solutes concentrate.
      `constantVolume`   Q_d = Q_p.  Volume is held by making solvent up as
                         fast as it leaves; solutes wash out.

    WHAT IT PUBLISHES, and why THAT.  The classical result a student derives
    by hand for constant-volume diafiltration is the exponential washout

        c/c_0 = exp( -(1 - R) N ),      N = diavolumes = integral Q_d dt / V_0

    and its derivation assumes the rejection R is a CONSTANT.  It is not.  R
    depends on the wall concentration, which depends on the flux, which
    depends on the osmotic pressure, which depends on the composition that is
    changing -- and with DSPM-DE it depends on the ion mixture as well.  So
    this unit publishes the OBSERVED rejection at every instant
    (`R_obs_<solute>`), the diavolumes, and -- in constant-volume mode -- both
    `washoutActual_<solute>` and `washoutIdeal_<solute>`, the latter evaluated
    from THIS RUN's own initial R and its own total diavolumes.

    That pair is the whole pedagogical point, and it is deliberately not a
    number the case declares: the idealisation is computed from the run, so a
    student cannot be shown a gap that was arranged.  Where the two agree, the
    hand derivation was safe; where they part, the assumption that failed is
    named and visible in the R trajectory beside them.

    ENERGY.  The vessel's enthalpy is priced honestly on the liquid leg, but
    the PUMP WORK that drives the filtration is NOT ledgered -- it is shaft
    work on a recirculation loop this unit does not model, and the batch
    ledger's `shaftWork` kind is reserved and unimplemented.  So
    `energyLedgerGap()` names it rather than letting a campaign claim a first
    law it has not closed.  An unpriced term declared aloud is a gap; the same
    term omitted silently is a wrong answer.

    FOULING, and why it lives HERE and not in a transport law.  Both transport
    models read `ctx.A_w`, so a fouling resistance applied where the CONTEXT is
    assembled serves solution-diffusion and DSPM-DE alike and changes neither.
    Fouling is a property of what the membrane has been ASKED TO DO over time,
    not of the local flux law, and a steady module has no time in which to
    accumulate one -- which is why this is the only unit in the tree that
    carries it.

    The form is resistance in series, on the permeance the unit hands the law:

        1 / A_eff  =  1 / A_w  +  r_f(v),        v = V_permeated / A

    with `r_f` growing by one of HERMIA'S BLOCKING LAWS (Hermia, Trans. IChemE
    60:183-187, 1982), which is how flux decline is classified from data:

        law `cake`          r_f = k v            (a deposited layer)
        law `intermediate`  1/A_eff = e^{k v}/A_w  (progressive pore blocking)

    Two, not four.  `standard` and `complete` describe pore-INTERNAL geometry
    changes that this unit's lumped permeance cannot represent honestly, and
    they refuse by name rather than being approximated by a neighbour.

    **A BLOCKING LAW IS A CLAIM ABOUT A MECHANISM**, not a fitting exponent:
    `cake` asserts a deposited layer, `intermediate` asserts pores being
    covered.  A case cannot know which applies to its feed from the engine, so
    the block REQUIRES a `reason` -- the author states in writing why this law
    fits this material.  Absent the whole `fouling {}` block there is no
    fouling and the run is byte-identical to one built before this existed: an
    absence goes on meaning what it meant.

    NOT MODELLED, said here so the green run cannot imply it: the
    concentration-polarisation coefficient as a function of stirring (the case
    DECLARES k_film and the unit refuses without it rather than inventing a
    correlation for a geometry it was not told), any temperature transient,
    critical-flux behaviour, cleaning or backwash cycles, and any prediction of
    `k` itself -- the fouling constant is EQUIPMENT-AND-FEED data that belongs
    to a rig and a material, so the case declares it and no catalogue record is
    touched.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Membrane;
class OsmoticModel;
namespace membrane { class TransportModel; }

class BatchDiafilter : public BatchUnitOperation
{
public:
    BatchDiafilter();
    ~BatchDiafilter() override;   // out of line: the model unique_ptrs hold
                                  // incomplete types in this header

    const std::string& type() const override;

    void initialise(const DictPtr&       unitDict,
                    const ThermoPackage& thermo,
                    const DictPtr&       reactionsDict) override;

    void step(scalar t, scalar dt) override;

    //  A clean autonomous ODE on [n..., Vpermeated]: the adaptive driver
    //  owns the integration, as it does for the batch reactor.
    bool        hasOdeForm()   const override { return true; }
    sVector     odeState()     const override;
    void        setOdeState(const sVector& y) override;
    sVector     odeDerivative(const sVector& y) const override;
    std::size_t odeNPositive() const override;

    const BatchState& state() const override { return state_; }

protected:
    BatchState& mutableState() override { return state_; }

public:

    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;

    //  The permeate is a real external outlet and leaves continuously;
    //  the make-up solvent is a real external inlet and arrives the
    //  same way.  BOTH are declared -- a vessel that drank without
    //  saying so reads to the campaign balance as one fabricating mass.
    BatchState takeContinuousDischarge(scalar tNow) override;
    BatchState takeContinuousIntake(scalar tNow) override;

    //  vesselEnthalpy is NOT overridden.  A retentate is a plain liquid
    //  inventory and the base already prices exactly that through
    //  `packageEnthalpy_`; an override here would be a second copy of the
    //  base's own arithmetic, which is the defect, not the diligence.
    std::string energyLedgerGap() const override;

private:
    struct Fluxes
    {
        scalar              J_w   = 0.0;   // m/s
        scalar              Q_p   = 0.0;   // m^3/s
        scalar              Q_d   = 0.0;   // m^3/s
        scalar              V     = 0.0;   // m^3
        std::vector<scalar> c_b;           // kmol/m^3, per SOLUTE
        std::vector<scalar> c_p;           // kmol/m^3, per SOLUTE
        std::vector<scalar> J_s;           // kmol/(m^2.s), per SOLUTE
    };

    Fluxes evaluate(const sVector& n) const;
    scalar volumeOf(const sVector& n) const;

    const ThermoPackage* thermo_ = nullptr;
    BatchState           state_;
    std::vector<std::string> compNames_;
    sVector              MW_;

    std::unique_ptr<membrane::TransportModel> transport_;
    std::unique_ptr<OsmoticModel>             osmotic_;
    const Membrane*      membrane_ = nullptr;
    std::string          membraneName_;

    std::vector<std::size_t> soluteIdx_;
    std::vector<scalar>      B_s_;
    std::size_t              iWater_ = 0;

    scalar area_      = 0.0;   // m^2
    scalar P_feed_    = 0.0;   // Pa
    scalar P_perm_    = 0.0;   // Pa
    scalar kFilm_     = 0.0;   // m/s

    //  Fouling: absent by default, so a case that declares nothing runs
    //  exactly as it did before this existed.
    enum class FoulingLaw { None, Cake, Intermediate };
    FoulingLaw foulingLaw_ = FoulingLaw::None;
    scalar     foulingK_   = 0.0;
    std::string foulingReason_;
    scalar     effectivePermeance(scalar Vperm) const;
    scalar rho_       = 0.0;   // kg/m^3
    scalar rhoDia_    = 0.0;   // kg/m^3, the diafiltrate
    bool   constantVolume_ = false;

    scalar V0_        = 0.0;   // m^3, the reference volume for diavolumes
    sVector n0_;               // the initial charge, for the washout KPIs
    std::vector<scalar> R0_s_; // initial observed rejection per solute
    //  THE PERMEATED VOLUME IS THE STATE; the diavolume count is DERIVED
    //  from it.  Two integrated quantities that must agree are two homes
    //  for one fact, and the ledgers below need the volume anyway: reading
    //  the permeate off an INTEGRATED volume makes the material records
    //  exact against the state the integrator accepted, instead of a
    //  first-order re-quadrature of the flux that disagrees with it at
    //  O(dt) -- which is what the first version did, while its own comment
    //  claimed otherwise.
    scalar Vperm_      = 0.0;   // m^3 permeated since t = 0
    scalar diavolumes() const
    { return (constantVolume_ && V0_ > 0.0) ? Vperm_ / V0_ : 0.0; }

    //  The inventory and permeated volume at the last boundary collection:
    //  every ledger record below is a DIFFERENCE against these, never a
    //  re-integration.
    sVector nLastDischarge_;
    scalar  VpermLastOut_ = 0.0;
    scalar  VpermLastIn_  = 0.0;

    int verbosity_ = 3;
};

} // namespace Choupo
