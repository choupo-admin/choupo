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
    Choupo::BatchPlanPass

Description
    THE BATCH PLANT DESIGNED ON A STEADY MATERIAL BALANCE (2026-10-19, DEV.md
    4c C99).  A drug-product plant, a fine-chemicals plant or a food plant
    runs its steps as BATCHES (lots released one by one) and some of its
    continuous machines in CAMPAIGNS.  The steady flowsheet of such a plant is
    still exactly right as its MATERIAL BALANCE PER UNIT OF PRODUCT; what it
    cannot say is how big each vessel must be, how many lots a year, which
    step paces the plant, and how busy each machine is.  This pass answers
    those on the converged balance, by the classical method for a
    SINGLE-PRODUCT batch plant (size factors, the limiting cycle time,
    parallel units in and out of phase, intermediate storage between trains,
    campaigns).  It never re-runs the flowsheet.

    Source.  The method is the one taught under the names "size factor" and
    "limiting cycle time" in the batch-process chapters of design textbooks,
    e.g. Biegler, Grossmann & Westerberg, "Systematic Methods of Chemical
    Process Design" (Prentice Hall, 1997), and Seider, Seader, Lewin &
    Widagdo, "Product and Process Design Principles" (Wiley) -- CITED BY TITLE
    ONLY: neither was read for this pass, so the arithmetic below is stated in
    full and rests on nothing but itself.

    THE DECLARATION (system/postDict; every time, mass and density with its
    unit -- a bare number is refused, because raw SI would read 3 as 3 s):

        batchPlan
        {
            product   <stream>;                // the flowsheet's product
            production { perYear 30000 kg; source "..."; reason "..."; }
            lot
            {
                rule   declared;               // declared | largestEquipment
                stream finalBlend;             // declared: the lot is this
                mass   350 kg;                 //   mass of this stream
                source "...";  reason "...";
            }
            lowUtilisation 0.25;               // optional, see below
            trains
            (
                { train solidDose;  availableTime 3840 h;
                  lotsPerCampaign 6;  changeover 16 h;
                  source "...";  reason "..."; }
            );
            stages                             // in RECIPE order
            (
                { stage blending;  train solidDose;  type batch;
                  units ( blender );  holds intraBlend;
                  bulkDensity 450 kg/m3;  fillFraction 0.6;
                  chargeTime 1 h;  processTime 0.5 h;
                  dischargeTime 0.5 h;  cleanTime 1 h;
                  // feeds <stage> | none;      default: the next stage
                  // inPhase 1;  outOfPhase 1;  default: one unit
                  // maxVolume 2 m3;            largestEquipment only
                  source "...";  reason "..."; }
                { stage compression;  train solidDose;  type semicontinuous;
                  units ( tabletPress );  holds finalBlend;
                  chargeTime 2 h;  operatingTime 4 h;  // | fromFlowsheet
                  dischargeTime 0 h;  cleanTime 1 h;
                  source "...";  reason "..."; }
            );
        }

    THE METHOD.  r_X is the FLOWSHEET's mass rate of stream X (kg/h, read
    from the converged run through `overallMassFlow`, never typed), P the
    product stream, Q the declared production per year, B the lot in kg of
    PRODUCT.

      f_j   = r_holds,j / r_P                kg the stage handles per kg product
      B     = M_lot r_P / r_lotStream        rule declared (M_lot declared)
            = min_j N_ip,j Vmax_j / S_j      rule largestEquipment (batch stages)
      m_j   = f_j B                          kg through stage j per lot
      batch:          S_j = f_j / (rho_j phi_j)          size factor, m3/kg
                      V_j = S_j B,  one vessel V_j / N_ip
      semicontinuous: t_op = declared, or m_j / (N_ip r_holds,j)
                      (`fromFlowsheet`: the stage's RATING unit -- one whose
                      throughput its declared hardware fixes, a spray dryer --
                      runs at its own flowsheet rate)
                      R_j = m_j / t_op,  one machine R_j / N_ip
      t_j   = charge + process + discharge + clean        the stage's cycle
              (`dischargeTime throughFedStage`: the vessel empties through the
              stage it feeds, so it is held for that stage's processing time)
      T_L   = max_j t_j / N_op,j  over the TRAIN          limiting cycle time
      u_j   = t_j / (N_op,j T_L)                          cycle utilisation
      N     = ceil(Q / B)                    lots per year (the plant makes N B)
      campaigns = ceil(N / n_c), n_c the declared lots per campaign
      o_j   the stage's start in a campaign: 0 for the first stage; a stage
            fed by earlier ones starts when their discharge starts (the
            transfer is one event seen from both ends); a stage fed by no
            earlier one (a side feed) is scheduled backwards so that its
            discharge starts when the stage it feeds starts processing
      span(n) = max_j (o_j + t_j) + (n - 1) T_L          makespan of n lots
      required = SUM over campaigns of span(n) + changeover
      busy_j   = N t_j / N_op + campaigns x changeover   per unit, h/yr
      occupancy_j = busy_j / available,  train occupancy = required / available
      H_eq  = Q / r_P,  streamFactor = H_eq / 8760

    The flowsheet's ABSOLUTE rate is a basis, not a capacity -- except for a
    rating unit, whose hardware the flowsheet models: there the flowsheet
    rate IS the machine's capacity.  `H_eq` is the number of hours the
    flowsheet's hourly flows must be multiplied by to make Q; the economics
    reads it with `streamFactor fromBatchPlan;` (EconomicsPass), so the year's
    flows have ONE home, Q.

    TRAINS.  Stages of one train run lot by lot together; two trains are
    decoupled by an INTERMEDIATE STORE (the case says where in its own
    words), so each has its own limiting cycle, campaigns and available
    time.  Every train makes the same N lots.

    REFUSED (the plan cannot run, or is not a plan): a stage whose busy hours
    exceed its train's available time (remedy: an out-of-phase unit, a larger
    lot, more hours -- each named with its number); a train whose campaigns
    do not fit its available time; and every malformed declaration, by name
    -- an unknown stream, unit, train or stage, a unit in two stages, a
    number without its unit, a fill fraction outside (0, 1], a non-integer
    count, a stage feeding an EARLIER one (list stages in recipe order), a
    missing source/reason, `fromFlowsheet` on a stage with no rating unit,
    `maxVolume` under `rule declared` (it would be read by nothing).

    ANNOUNCED (a defendable but poor plan; stderr `[batchPlan]`, the end-of-
    run caveat block under BATCH PLAN, and `batchPlan.findings`): a stage
    that never limits and is busy less than `lowUtilisation` of the cycle
    (oversized, or a step to share); a train busy less than `lowUtilisation`
    of its available time (an idle line); a declared operating time on a
    rated stage whose required rate differs from the machine's own by more
    than 1 % (the plan asks the hardware for a rate it was not modelled at).
    `lowUtilisation` undeclared takes the stated default 0.25, announced.

    SEVERAL PRODUCTS ON THE SAME STAGES (2026-10-20, DEV.md 4c C110 G2).
    A drug-product plant makes several strengths or products in CAMPAIGNS on
    one set of equipment, cleaning between them.  `products ( ... )` in
    place of `production {}` (both together are refused: two homes for the
    year's demand) declares them, and `campaignOrder` the order of their
    campaigns -- the student's decision; the engine never chooses it:

        products
        (
            { product strength60;  perYear 20000 kg;  source "...";  reason "..."; }
            { product strength240; perYear  8000 kg;
              lot { rule declared; stream finalBlend; mass 300 kg;      // optional:
                    source "...";  reason "..."; }                      //  the plan's otherwise
              massPerProduct { coatingSuspension 0.12; }  // optional: kg per kg of
                                                          //  THIS product, where its
                                                          //  balance is not the flowsheet's
              stages                                      // optional: what differs here
              (
                  { stage compression;  operatingTime 3 h;
                    changeoverTo { strength60 10 h; }      // the clean before THAT product
                    source "...";  reason "..."; }
              );
              source "...";  reason "..."; }
        );
        campaignOrder ( strength60 strength240 );
        stages ( { ...  cleanTime 1 h;           // between LOTS of one product
                        productChangeover 6 h;   // between campaigns of DIFFERENT
                   ... } );                      //  products (every stage, 0 h allowed)

    A product changes at a stage only what it declares: chargeTime,
    cleanTime, dischargeTime, and processTime / bulkDensity / fillFraction
    (batch) or operatingTime (semicontinuous); everything else is the
    stage's.  Its balance is the FLOWSHEET's -- the ONE steady balance, read
    as kg per kg of product -- unless `massPerProduct` declares a stream's
    own; it then sizes on it, and is ANNOUNCED (`ownBalance`), because the
    economics' `streamFactor fromBatchPlan;` prices every product's raw
    materials and utilities on the flowsheet's one balance.

    THE MULTIPRODUCT METHOD -- single-product campaigns, the classical
    flow-shop form taught beside the single-product method (same books,
    same caveat: cited by title, not read):

      f_ij  = declared, or r_holds,j / r_P;   S_ij = f_ij / (rho_ij phi_ij)
      B_i   = M_lot,i / f_i(lotStream)  |  min_j N_ip,j Vmax_j / S_ij
      N_i   = ceil(Q_i / B_i);  t_ij, T_L,i = max_j t_ij / N_op,j per train
      V_j   = max_i S_ij B_i / N_ip  (R_j = max_i m_ij / t_op,ij / N_ip):
              the equipment is sized for the product that needs the most,
              and `sizingProduct` names it
      c_i   = ceil(N_i / n_c) campaigns, run back to back on each train in
              the declared order, each spanning o + (n - 1) T_L,i as above
      after each campaign: the train's `changeover` if the product's next
              campaign follows; after its LAST, the clean before the next
              product in the order (the last wraps to the first):
              C_i = max_j c_ij, c_ij = `changeoverTo { <next> }` at stage j
              if the product declares one, else the stage's
              `productChangeover` -- every stage cleaned at once, once the
              campaign has left the train
      required = SUM_i [ SUM spans + (c_i - 1) changeover + C_i ]
      busy_j   = SUM_i [ N_i t_ij / N_op + (c_i - 1) changeover + c_ij ]
      H_eq  = SUM_i Q_i / r_P,  streamFactor = H_eq / 8760

    One product declared in `products` reproduces the single-product plan
    (the gate holds the two to 1e-9).  The ORDER moves the year only
    through `changeoverTo`: with cleans that depend on the stage alone, any
    order costs the same and the order sets only the Gantt -- which is
    the honest statement of the method, and why the clean before a given
    product (`changeoverTo`) is what makes sequencing a decision.  A
    declared `changeoverTo` the current order does not use is kept (the
    student may reorder) and read; `changeoverAfter` in the result says
    which clean each product's last campaign took.

    REFUSED in addition: `production` beside `products`; `campaignOrder`
    missing (two or more products) or not a permutation; a stage without
    `productChangeover` (two or more products), or with one (one product);
    a product override naming no stage, changing nothing, or changing what
    its stage type does not have; `changeoverTo` naming no OTHER product; a
    `massPerProduct` on the product stream, on a stream nothing reads, or
    carrying dimensions; a product with no lot and no plan lot; a plan lot
    every product overrides; and the same impossible year as one product
    (a stage busier than its train's year, a train whose year does not
    fit), with each product's share named.  ANNOUNCED in addition:
    `ownBalance:<product>`; `capacityMismatch:<product>:<stage>`;
    `lowUtilisation:<stage>` is a stage that limits NO product and whose
    largest utilisation is below the threshold.

    WHAT IS NOT DONE, said: the intermediate store is not sized; every lot
    of a product is identical and every campaign repeats its first; the
    campaigns of two products never overlap on a train (the next product
    waits until the whole train is clean: conservative, and the line
    clearance a GMP suite performs, but a flow shop that lets stage 1
    start the next product while stage 5 finishes would need less); one
    rotation a year (each product's campaigns back to back -- splitting a
    product into several rotations, trading changeovers for inventory, is
    not built); mixed-product campaigns; no optimiser of the order; no
    stochastic QC release times; no labour or utility schedule follows the
    plan (the economics takes the year's FLOWS from it, its labour from the
    declared crew).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PostProcessor.H"

#include <string>

namespace Choupo {

class BatchPlanPass : public PostProcessor
{
public:
    explicit BatchPlanPass(const DictPtr& planDict);

    const std::string& type() const override
    {
        static const std::string t = "batchPlan";
        return t;
    }

    int run(SimulationResult& result) override;

private:
    DictPtr planDict_;
};

} // namespace Choupo
