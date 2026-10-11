/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::ReliefValveSize

Description
    THE PRESSURE-RELIEF VALVE OF A SIZED ITEM (2026-10-11, DEV.md 4c C62).
    Vitor asked for the relief valves of the green-ammonia basic design to be
    sized at that stage, and the engine had no relief model of any kind.  This
    is one, as a SIZING-PASS item: a relief valve is a physical object the
    plant buys, protecting another physical object, and it is sized from the
    converged state the way every other item is.  It changes no stream.

    ONE ENTRY PER PROTECTED ITEM, the 1:N model.  The entry's `unitName` is
    the PROTECTED unit, and the valve is one more item of that unit, tagged
    `psv` (sheet at `design/<unit>/psv`).  A unit realising several items (a
    catalyst bed: shell + catalyst charge) names the one protected with
    `protects <tag>;`; a unit realising one needs no word, because there is
    no other value for it.

    THE SET PRESSURE HAS ONE HOME: the protected item's own `pressureDesign`,
    as ITS sizer published it -- gauge, as `VesselMechanics` reads it -- and
    the valve is set at it (the MAWP is taken as the design pressure; one
    device, set at the MAWP).  Nothing here re-derives it.  The protected item
    must therefore be sized FIRST: its entry comes before this one in
    `sizing { units ( ... ); }`, and the refusal says so.

    THE SCENARIOS ARE DECLARED, because which causes of overpressure are
    CREDIBLE for an item is the designer's judgement and no converged state
    can decide it.  Two are implemented:

      blockedOutlet   the outlet named (`outlet <stream>;`, or the unit's only
                      outlet) closes while everything upstream keeps coming:
                      the device passes that stream's own mass flow -- for a
                      one-outlet unit the unit's whole throughput -- at its own
                      temperature and composition, at the relieving pressure
                      P1 = MAWP x 1.10 (or + 3 psi, whichever is larger)
                      + 1 atm.  Vapour: API 520 gas equation, critical or
                      subcritical against the back pressure.  Liquid: API 520
                      liquid equation, the density the case's package prices
                      at the stream's own state (`phaseDensity`, one home).  A
                      TWO-PHASE stream is refused by name (no two-phase method
                      is implemented; the omega method is named, not built).
      fire            a pool fire under the item: Q = C F A^0.82 (API 521, as
                      the DIERS fire document quotes it), A the WETTED area of
                      the protected vessel -- its own D and H, and the liquid
                      level and liquid its own declared `inventory {}` holds
                      (one home for "how full is it") -- with F and the
                      drainage DECLARED; P1 = MAWP x 1.21 + 1 atm; the liquid
                      boils at its bubble point at P1 on the case's package
                      (`BubblePoint::compute`), the vapour is the incipient
                      vapour y, and the molar latent heat is sum y_i dHvap_i
                      (`Component::Hvap_latent`, the Watson term the package
                      prices every liquid with, the same key the C61 EduTool
                      reads).  A dissolved permanent gas above its critical
                      temperature contributes no latent heat -- the package's
                      own liquid rung -- so the moles of the volatile solvent
                      boiled are exactly Q over ITS latent heat and the
                      dissolved gases leave with them.  A liquid whose main
                      component is at or above its critical point at P1 has no
                      latent heat to divide by: REFUSED by name (a supercritical
                      fire case is a different, transient calculation).

    NAMED AND REFUSED: tubeRupture (the 2/3 versus 10/13 rule is unverified,
    DEV.md 4c C61), controlValveFailure (needs the valve's capacity, which no
    case declares), coolingFailure / refluxFailure, runawayReaction (two-phase
    venting), thermalExpansion.

    THE FLUID PROPERTIES ARE THE CASE'S.  Z is the package's EoS vapour root
    at (T, P1, y); k = Cp_ig/(Cp_ig - R) from the package's ideal-gas heat
    capacity, the same two calls `propertyPoint` makes (src/propertyOps/
    PropertyPoint.cpp) and the EduTool reads; M is the mole-fraction mean of
    the records' MW.  None is typed.  The ideal-gas k is a stated limit: near
    a critical point the real isentropic exponent departs from it.

    THE COEFFICIENTS.  KdVapour 0.975, KdLiquid 0.65, Kb, Kc, Kw and Kv 1, and
    a back pressure of 0 barg are the preliminary-sizing values the `fluids`
    implementation of API 520 carries; each is an ENGINE DEFAULT, announced
    through `designDefault::valueOr` when used and silent when declared.

    THE GOVERNING CASE is the scenario needing the largest area; the sheet
    lists every scenario and marks it.  The API 526 orifice letter is the
    smallest whose area (as `fluids` tabulates API 526) is not below that
    area; larger than the largest letter, no letter is selected and the sheet
    says one valve cannot pass it.

    NOT COSTED.  This engine carries no cost correlation for a relief device
    and none is invented: the item says so in `notCostedBecause`, the costing
    pass lists it apart, and no capital total moves or changes its word.

    designRules:
        protects          word   the protected item's tag (several-item units only)
        scenarios         list   REQUIRED, at least one { scenario <word>; ... }
            blockedOutlet:  outlet <stream>   (required when the unit has several outlets)
            fire:           environmentFactor <->, drainage adequate|inadequate  (both REQUIRED)
        backPressure      Pa     GAUGE, with its unit (`0.5 bar`); else 0, announced
        KdVapour KdLiquid Kb Kc Kw Kv   -   else the announced defaults
\*---------------------------------------------------------------------------*/

#pragma once
#include "EquipmentSize.H"

#include <vector>

namespace Choupo {

class ReliefValveSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "reliefValve";
};

} // namespace Choupo
