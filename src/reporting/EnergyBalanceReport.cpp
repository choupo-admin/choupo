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

#include "EnergyBalanceReport.H"
#include "BalanceAlarm.H"
#include "core/Advisory.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "BalanceMath.H"
#include "ModelBoundaryLedger.H"
#include "thermo/EnthalpyDatum.H"
#include "Topology.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

//  THE ENTHALPY DATUM, named once.  Every stream enthalpy this report sums is
//  on the elements/formation datum (dHf(elements, 25 C, 1 bar) inside each
//  species' h), which is WHY no heat-of-reaction term appears in the first law
//  it prints: the reaction heat lives inside the stream enthalpies.  The word
//  goes to the per-unit CSV's `reference` column and onto the result block so
//  the GUI can say it beside the numbers (Vitor, 2026-09-05: students read
//  -20.9 MW "in" and see an absurdity, not a datum).
static const std::string kEnthalpyDatum = "elements";

void EnergyBalanceReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar Tref = dict->lookupScalarOrDefault("Tref", 298.15);
    //  The default instance's soft posture (see the refusal site below) also
    //  governs the per-unit gap line: same fact, same register.
    const bool softGaps =
        dict->lookupWordOrDefault("onMissingDatum", "error") == "unavailable";
    const auto topo = reporting::readTopology(ctx.flowsheetDict, ctx.result);

    const std::filesystem::path dir = ctx.outDir("energyBalance", "balances");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "energyBalance_byUnit.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("energyBalance: cannot open " + path.string());

    // Per unit: the stream enthalpy balance (dH = implied duty), the sum of
    // the unit's DECLARED energy items (the curated heat/work KPIs --- a
    // column's reboiler+condenser, a heater's Q, a compressor's shaft work),
    // and the closure (declared items vs dH).  The `reference` column says
    // which datum dH used (elements carries the reaction heat).
    //
    //  THE LAST FIVE COLUMNS ARE THE MODEL-BOUNDARY ACCOUNTING (2026-08-09).
    //  The first six are UNCHANGED and keep their meaning exactly:
    //  `energy_closure_pct` is still the RAW closure, so nothing that reads
    //  this file loses the number it used to read.  `raw_imbalance_kW` is
    //  that same raw discrepancy in kW; `boundary_step_kW` is the enthalpy
    //  step credited to an identified model transition; `remaining_kW` is
    //  what is still unexplained, and `adjusted_closure_pct` is the VERDICT
    //  column -- the one the conservation alarm is taken on.  Three
    //  quantities, never collapsed: see reporting/ModelBoundaryLedger.H.
    f << "unit,H_in_kW,H_out_kW,dH_kW,energy_items_kW,energy_closure_pct,"
         "reference,raw_imbalance_kW,boundary_step_kW,remaining_kW,"
         "adjusted_closure_pct,boundary\n";

    auto lookup = [&](const std::vector<std::string>& names) {
        std::vector<const ProcessStream*> v;
        for (const auto& s : names)
        {
            auto it = ctx.result.streams.find(s);
            v.push_back(it == ctx.result.streams.end() ? nullptr
                                                     : &it->second);
        }
        return v;
    };

    // Sum of a unit's GENUINE EXTERNAL energy items (curated, signed
    // +supplied/-removed).  EXCLUDES any duty whose heat is delivered through
    // the unit's own utility streams (the evaporator's `duty_kW`): that heat is
    // already counted as the steam/condensate enthalpy drop in `qBoundary`, so
    // summing the KPI too is the old double-count.  A bare Q_kW / reboiler /
    // condenser duty has no stream medium and IS a boundary item.
    //  TWO SUMS, AND THEY ANSWER DIFFERENT QUESTIONS (2026-09-08).
    //
    //  `s`   -- the ALGEBRAIC sum, the NET energy crossing this unit's
    //           boundary.  The closure reconciles dH against this, and that
    //           is right: a column that boils 1279.30 kW and condenses
    //           1281.04 kW nets -1.74 kW, and its dH must equal that.
    //  `mag` -- the sum of MAGNITUDES, the energy this unit EXCHANGES.
    //
    //  The plant-scale denominator wants the second and was given the first.
    //  On column01 the two are 2560.35 kW and -1.74 kW, so a real 631.96 kW
    //  first-law violation was published as 36 346.89 % -- a number that
    //  looks like a reporting bug and is in fact a reporting bug sitting on
    //  top of a genuine one.  The comment at the accumulator SAID
    //  "MAGNITUDES (so a duty in and a duty out do not cancel)" while taking
    //  the absolute value of the SUM, which is the cancellation it claimed
    //  to prevent: a comment describing an arithmetic the code does not do,
    //  written the same morning by the same hand that has spent the day
    //  finding that shape in other people's code.
    auto externalItems = [&](const std::string& unit, int& n,
                             scalar& mag) -> scalar {
        scalar s = 0.0; n = 0; mag = 0.0;
        auto it = ctx.result.kpis.find(unit);
        if (it != ctx.result.kpis.end())
            for (const auto& [k, v] : it->second)
                if (reporting::isEnergyItemKpi(k)
                    && !reporting::isInternalMediumDutyKpi(k))
                { s += v; mag += std::abs(v); ++n; }
        return s;
    };


    const auto units = reporting::resolveUnits(topo, ctx.result);
    int naCount = 0, gapCount = 0;
    //  TWO PASSES, and the reason is the ledger's, not this report's: the
    //  model-boundary verdict is taken on ONE normalization over the whole
    //  residual system (solver/Convergence.H sec.2), so no unit's row can be
    //  written before every unit's residual is known.  Pass 1 measures, pass
    //  2 writes and alarms; the console messages of pass 1 (curation gaps)
    //  keep the order they always had.
    struct UnitRow
    {
        std::string name;
        int         kind = 0;              // 0 normal, 1 curation gap, 2 n/a
        scalar      hIn = 0.0, hOut = 0.0, dH = 0.0, items = 0.0;
        scalar      closure = 0.0;         // the RAW closure, as always
        bool        hasClosure = false;    // false -> the field is written EMPTY
        scalar      sumExternal = 0.0;
        //  The heat GENUINELY supplied across the unit's boundary.  Kept
        //  APART from `items` on purpose: when a unit declares no duty,
        //  `items` is set to dH for the CSV (its implied net duty), and
        //  handing THAT to the ledger would compute a raw imbalance of
        //  exactly zero -- the audit would see nothing on precisely the
        //  units it was extended to cover.
        scalar      supplied = 0.0;
        int         nItems = 0;
        bool        declares = false;
        std::vector<const ProcessStream*> ins, outs;
    };
    std::vector<UnitRow> rows;
    rows.reserve(units.size());
    // Σ of each unit's genuine STREAM-boundary energy (heat/work crossing the
    // boundary INTO that unit's process streams), accumulated with EXACTLY the
    // same exclusions the per-unit closure uses: internal process-to-process
    // exchangers contribute 0 (their duty is internal), and a unit with NO
    // process streams (an electricLoad generator -- a pure energy SINK whose
    // shaft work already left the streams at the turbine) is skipped entirely.
    // This is the global plant boundary's Q_boundary -- see the block below.
    scalar globalQext = 0.0;
    scalar globalExchanged = 0.0;
    for (const auto& u : units)
    {
        // ONE datum (elements): a present species with no elements/formation
        // phase path THROWS naming the component (Vitor's law -- no silent
        // sensible fallback).  For a DISPLAY report we surface that single
        // unit's gap LOUDLY (a `gap:<reason>` row + the named component on
        // stderr) and carry on, so one curation gap does not nuke the whole
        // run's report.  The fix is to CURATE the component's standardThermochemistry,
        // never to re-add the second datum.
        // The unit's genuine external duty KPIs (independent of the enthalpy
        // datum -- it only reads the KPIs), so a unit whose stream-enthalpy
        // datum is MISSING (a gap) still has its real boundary duty counted.
        int nItems = 0;
        scalar       magExternal = 0.0;
        const scalar sumExternal = externalItems(u.name, nItems, magExternal);

        reporting::UnitEnergy e;
        try {
            e = reporting::unitEnergyBalance(lookup(u.ins), lookup(u.outs),
                                             ctx.thermo, Tref);
        } catch (const std::exception& ex) {
            (softGaps ? std::cout : std::cerr)
                      << (softGaps ? "  [report] energyBalance gap: unit '"
                                   : "WARNING: energyBalance: unit '") << u.name
                      << "' has no elements-datum enthalpy -- " << ex.what()
                      << "  (curate the standardThermochemistry block; the per-unit "
                         "closure is reported as a gap, not a sensible "
                         "fallback)\n";
            //  Named-member init: aggregate init leaves the later vector
            //  members unlisted, which -Wmissing-field-initializers flags.
            UnitRow gapRow;
            gapRow.name = u.name;
            gapRow.kind = 1;
            rows.push_back(std::move(gapRow));
            ++gapCount;
            // A GAPPED unit still has process streams (the datum is missing,
            // not the topology), so its real boundary duty crosses the boundary
            // -- keep it in the plant-boundary sum, matching the pre-refactor
            // blind KPI sweep (the old behaviour on curation-gap cases).
            globalQext += sumExternal;
            continue;
        }

        //  A UTILITY CIRCUIT DECLARED ON ONE END ONLY -- ANNOUNCED, NEVER
        //  ACTED ON IN SILENCE (2026-09-09).  `unitEnergyBalance` has already
        //  ignored the tag and counted the medium as material passing through,
        //  which is the only reading whose datum offsets cancel; saying so is
        //  the other half.  It rides `AdvisoryLog` so it reaches the end-of-run
        //  caveat block and the result JSON, not only this line -- the fix is
        //  the CASE's (tag the return too, or declare the pair in
        //  `system/flowsheetDict`'s `utilities {}` block), and the reader has
        //  to be told which units it touched.
        if (!e.utilityTagIgnored.empty())
        {
            std::ostringstream un;
            for (std::size_t i = 0; i < e.utilityTagIgnored.size(); ++i)
                un << (i ? ", " : "") << "'" << e.utilityTagIgnored[i] << "'";
            std::ostringstream msg;
            msg << "unit '" << u.name << "': utility stream(s) " << un.str()
                << " carry a `category` but the circuit is tagged on ONE SIDE "
                   "only, so the medium's formation-datum enthalpy cannot "
                   "cancel between supply and return.  The tag was IGNORED for "
                   "this unit and the stream(s) counted as material passing "
                   "through -- which is what an untagged circuit already gets, "
                   "and it nets its own datum exactly.  To have the medium "
                   "report its DUTY instead, tag both ends of the circuit (or "
                   "declare the pair in system/flowsheetDict's `utilities {}` "
                   "block).";
            if (AdvisoryLog::instance().add(
                    "validity", "warning",
                    "unit '" + u.name + "' half-tagged utility circuit",
                    msg.str()))
                std::cerr << "[utility] " << msg.str() << "\n";
        }

        if (e.ref == reporting::EnergyRef::None)
        {
            // No stream-enthalpy datum, but the unit may still declare a duty.
            // A unit that resolves to NO process streams is a pure energy SINK /
            // conversion node (the electricLoad generator) -- its KPI is energy
            // that already crossed at the upstream unit, so it is NOT added to
            // the plant-boundary sum (it would double-count).
            UnitRow r;
            r.name = u.name;
            r.kind = 2;
            r.nItems      = nItems;
            r.sumExternal = sumExternal;
            rows.push_back(std::move(r));
            ++naCount;
            continue;
        }

        // A process-to-process heat exchanger transfers its declared duty
        // BETWEEN its own two process streams (hot in/out + cold in/out), so
        // the heat is INTERNAL -- the four process streams already net it, and
        // the unit's overall dH is ~0 (adiabatic envelope).  Its duty KPI is
        // therefore not a boundary item (counting it double-counts, the old
        // -3663 % on heatExchanger01).  Detected structurally: >=2 process
        // inlets AND >=2 process outlets, with no utility stream.  A heater /
        // flash (one process side + a boundary Q) is NOT this and keeps its
        // duty as a genuine boundary item.
        const bool internalExchanger =
            (e.nProcIn >= 2 && e.nProcOut >= 2
             && std::abs(e.qBoundary) <= 1.0e-9);

        // Process-stream change vs the heat that crossed the boundary.
        //   dH       = hOut - hIn over the PROCESS streams
        //   supplied = qBoundary (utility-stream drop) + the external duty KPIs
        // A unit declares heat to reconcile against EITHER as a utility medium
        // (qBoundary) OR as a bare external duty KPI (a flash/heater Q_kW),
        // UNLESS that duty is internal to a process-to-process exchanger.
        const scalar dH       = e.hOut - e.hIn;
        const scalar supplied = internalExchanger ? 0.0
                                                  : (e.qBoundary + sumExternal);
        // Plant-boundary accumulator: ONLY the genuine external-duty KPIs
        // (Q_kW / reboiler / condenser / shaft work), never `qBoundary`.  A
        // utility medium's heat (qBoundary) is carried by its steam/condensate
        // streams, which are themselves system feeds/products counted in
        // Σ H(feeds)/Σ H(products) below -- adding qBoundary here would double
        // count it (the old evaporator trap).  Internal process-to-process
        // exchangers (the HRSG) contribute 0; no-process-stream sinks (the
        // electricLoad generator) never reach this branch and are skipped.
        if (!internalExchanger) globalQext += sumExternal;
        //  The ENERGY THE PLANT EXCHANGES -- magnitudes, so a duty in and a
        //  duty out do not cancel.  This is the scale the residual is judged
        //  against (see the denominator below).
        //  MAGNITUDES PER ITEM, which is what the sentence beside it always
        //  claimed: |Q_reboiler| + |Q_condenser|, not |Q_reboiler + Q_condenser|.
        //  `qBoundary` is the utility medium's own enthalpy drop and is a
        //  single signed quantity, so its magnitude is all there is.
        globalExchanged += internalExchanger
                         ? 0.0 : (magExternal + std::abs(e.qBoundary));
        const bool   declares = !internalExchanger
            && ((nItems > 0) || (std::abs(e.qBoundary) > 1.0e-9));

        // When the unit DECLARES boundary heat, closure reconciles the process
        // enthalpy rise against it: 100 % when dH == supplied.
        //
        // WHEN IT DECLARES NONE, THERE IS NO CLOSURE TO REPORT, AND SAYING
        // 100 % WAS THE DEFECT (2026-09-08, found by Vitor on ammonia02).
        // `items` is set to dH there -- the unit's IMPLIED net duty, which is
        // informative -- and the old code then divided dH by itself and
        // published the answer as a verdict.  So the SAME ROW read:
        //
        //   FEHE  dH -21632.4405  items -21632.4405  closure 100.00
        //                                            raw_imbalance -21632.4405
        //
        // A closure of 100 % beside a raw imbalance of -21 632 kW: not an
        // optimistic column, a column asserting the opposite of the one next
        // to it -- and the closure is the one a student reads.
        //
        // A quantity with nothing to reconcile against has no closure.  It is
        // reported as ABSENT (an empty CSV field, the `(not stated)` posture
        // of the 2026-09-05 design-basis rule), never as a number, and
        // `raw_imbalance_kW` carries what is actually known.  `items` keeps
        // the implied duty, which is a fact about the unit rather than a
        // claim about agreement.
        scalar closure, items;
        bool   hasClosure;
        if (declares)
        {
            closure = (std::abs(supplied) > 1.0e-9)
                ? 100.0 * dH / supplied
                : (std::abs(dH) < 1.0e-6 ? 100.0 : 0.0);
            items      = supplied;
            hasClosure = true;
        }
        else
        {
            closure    = 0.0;      // never written -- see hasClosure
            items      = dH;       // the IMPLIED net duty, not a declaration
            hasClosure = false;
        }

        UnitRow r;
        r.name = u.name;
        r.kind = 0;
        r.hIn = e.hIn; r.hOut = e.hOut; r.dH = dH; r.items = items;
        r.supplied = supplied;
        r.closure = closure; r.declares = declares;
        r.hasClosure = hasClosure;
        r.nItems = nItems;  r.sumExternal = sumExternal;
        r.ins  = lookup(u.ins);
        r.outs = lookup(u.outs);
        rows.push_back(std::move(r));
    }

    // ---- PASS 2: the model-boundary ledger, then the rows and the alarms --
    //  THE AUDIT IS INDEPENDENT BY CONSTRUCTION.  It is handed the case's
    //  DICTS and the record Database -- never `Flowsheet::thermoFor`, never a
    //  package the unit built, never a dH the unit computed.  It reads each
    //  unit's declared `thermo {}` out of the flowsheetDict, assembles that
    //  world itself through the public ThermoPackageBuilder, prices the same
    //  streams in both packages at the same (T, P, z), and then checks that
    //  its own step reproduces the raw imbalance measured above.  See
    //  reporting/ModelBoundaryLedger.H sec.3 for why that duplication is
    //  deliberate despite the arity doctrine.
    std::vector<reporting::ClosureInputs> auditIn;
    std::map<std::string, std::size_t>    auditOf;   // unit -> index in ledger
    for (const auto& r : rows)
    {
        //  EVERY unit with a priceable enthalpy goes to the auditor, and the
        //  auditor decides whether a boundary exists -- it owns the DECLARED
        //  test (ModelBoundaryLedger.H sec.4) and returns `boundary=none` for
        //  a unit that declares no world.  Deciding it a second time here is
        //  the arity sin, and it was ALSO wrong.
        //
        //  It used to read `if (r.kind != 0 || !r.declares) continue;`, on the
        //  stated grounds that "a unit that declares none has dH as its net
        //  duty by definition -- there is no residual".  That holds only while
        //  both ends of dH are priced in the SAME world.  Under a declared
        //  `thermo {}` override part of dH is the model STEP, which is not
        //  duty at all -- so an ADIABATIC unit carrying a model boundary had
        //  its step silently reclassified as its own duty and published at a
        //  trivially perfect 100 % closure.  Not hypothetical: acetonePlant's
        //  absorber is the only declared boundary in that plant, it is
        //  adiabatic, and it reported n/a in every ledger column while
        //  carrying -11.2496 kW.  Both witnesses of the 2026-08-09 ruling
        //  (basis01's transporter, flash20's flashNRTL) declare a duty, so the
        //  route was never covered -- the same shape as check_ebullioscopic
        //  and check_true_ions, a guard armed on one of two roads.
        if (r.kind != 0) continue;
        reporting::ClosureInputs ci;
        //  `supplied`, NOT `items`: see UnitRow::supplied.
        ci.unit = r.name; ci.dH_kW = r.dH; ci.items_kW = r.supplied;
        ci.ins = r.ins; ci.outs = r.outs;
        auditOf[r.name] = auditIn.size();
        auditIn.push_back(std::move(ci));
    }

    std::vector<EnergyClosureRecord> ledger;
    if (!auditIn.empty())
    {
        try
        {
            reporting::ModelBoundaryLedger audit(
                ctx.flowsheetDict, ctx.thermo, ctx.packageDict, ctx.db,
                ctx.chemistry, ctx.solverDict, ctx.verbosity);
            ledger = audit.audit(auditIn);
        }
        catch (const std::exception& ex)
        {
            //  The auditor itself failed.  Every audited unit keeps its RAW
            //  imbalance and its alarm; nothing is credited on a broken
            //  audit, and the reason is named.
            ledger.clear();
            for (const auto& ci : auditIn)
            {
                EnergyClosureRecord e;
                e.unit   = ci.unit;
                e.status = "unavailable";
                e.reason = std::string("the model-boundary audit could not"
                                       " run -- ") + ex.what();
                e.raw_kW = ci.dH_kW - ci.items_kW;
                e.remaining_kW = e.raw_kW;
                e.rule   = "UNAVAILABLE -- no independent evaluation possible";
                ledger.push_back(std::move(e));
            }
            std::cerr << "WARNING: energyBalance: model-boundary audit"
                         " unavailable -- " << ex.what() << "\n";
        }
    }

    //  What the phase pass below found, per unit: ONE home for the verdict,
    //  written where every unit is seen and read where the banner prints.
    std::map<std::string, std::string> impossibleOf;

    for (const auto& r : rows)
    {
        if (r.kind == 1) { f << r.name << ",n/a,n/a,n/a,n/a,n/a,gap,"
                                "n/a,n/a,n/a,n/a,n/a\n"; continue; }
        if (r.kind == 2)
        {
            f << r.name << ",n/a,n/a,n/a,";
            if (r.nItems > 0)
                f << std::fixed << std::setprecision(4) << r.sumExternal;
            f << ",n/a,n/a,n/a,n/a,n/a,n/a,n/a\n";
            continue;
        }


        //  THE LABEL A STREAM CARRIES IS A FACT ABOUT THE STREAM, NOT ABOUT
        //  WHETHER ITS CONSUMER DECLARES A DUTY (2026-09-08).
        //
        //  This test used to live inside `if (r.declares && closure out of
        //  band)`, which disarms it in exactly the two places it is needed,
        //  and ammonia02 is both of them at once:
        //
        //    * the converter is ADIABATIC, so it declares no energy item and
        //      the branch never ran on it;
        //    * the feed-effluent exchanger's closure reads a perfect 100 %
        //      because its own declared duty was computed FROM the same
        //      enthalpy the test would have condemned -- circular, so the
        //      alarm that would have exposed it was silenced by it.
        //
        //  Measured cost of that silence: the converter outlet, at 842.9 K
        //  and 200 bar, resolves to V/F = 0.2589 -- 74 % liquid in a mixture
        //  whose every component is hundreds of kelvin above its critical
        //  temperature, because two Henry pairs are being read ~500 K past
        //  their declared windows.  22 376 kW misattributed, at exit 0, with
        //  this check installed and unable to fire.
        //
        //  So the pass runs for EVERY unit and rides `AdvisoryLog`, which is
        //  the durable surface: the caveat block, the result JSON, the GUI.
        //  The out-of-band banner then QUOTES what this pass found rather
        //  than recomputing it -- one home for the verdict.
        //
        //  NOT widened beyond that, said rather than implied: it is still the
        //  incipient test in the REPORT's world, so a unit computing in its
        //  own `thermo {}` may legitimately hold the same stream to be a
        //  different phase, and a package that cannot answer still declines.
        {
            std::string found;
            for (const ProcessStream* sp : r.ins)
            {
                if (!sp || sp->z.empty()) continue;
                if (sp->vf > 1.0e-9 && sp->vf < 1.0 - 1.0e-9) continue; // two-phase: nothing claimed
                //  The incipient test is a VAPOUR-LIQUID one, so it has nothing
                //  to say about a package that declares no vapour phase (the SLE
                //  shape: one liquid + one crystallising solid).  Asking anyway
                //  is how this pass found that `Kvec` dereferenced a null EoS
                //  handle instead of refusing -- fixed there too, and asked
                //  properly here rather than left to a throw in a hot loop.
                if (!ctx.thermo.hasEos()) continue;
                //  NO DEW POINT ABOVE EVERY CRITICAL TEMPERATURE, so no
                //  statement about being below one (2026-09-08, Vitor:
                //  ammonia02's converter outlet at 839.6 K was accused of
                //  being below its dew point in a mixture whose highest pure
                //  Tc is ammonia's 405.5 K -- 434 K below).  The g(V=1) that
                //  produced the accusation is built from a Psat extrapolated
                //  far above Tc, where the saturation curve does not exist:
                //  the K-values are meaningless there, not the stream's
                //  label.  A gate that accuses the innocent teaches the
                //  reader to ignore it, and the innocent here was a correctly
                //  labelled supercritical vapour.  ONE home for the
                //  criterion, shared with the resolver that discards the
                //  matching impossible two-phase root.
                if (flashState::aboveEveryCriticalT(sp->T, sp->z, ctx.thermo))
                    continue;
                try {
                    const sVector K = ctx.thermo.Kvec(sp->T, sp->P, sp->z, sp->z);
                    if (K.size() != sp->z.size()) continue;
                    scalar g = 0.0;
                    const bool asLiquid = (sp->vf <= 1.0e-9);
                    for (std::size_t i = 0; i < K.size(); ++i)
                    {
                        if (!(K[i] > 0.0) || !std::isfinite(K[i])) { g = 0.0; break; }
                        g += asLiquid ? sp->z[i] * (K[i] - 1.0)
                                      : sp->z[i] * (1.0 - 1.0 / K[i]);
                    }
                    //  THE BAND IS A CHOICE, AND IT IS STATED (2026-09-08).
                    //
                    //  A stream that LEAVES an equilibrium flash sits ON its dew
                    //  or bubble point by construction, so its g is the solver's
                    //  own round-off -- ammonia02's `unreactedGas` and `recycle`
                    //  measure -2.07e-06, and at the old absolute 1e-6 this pass
                    //  accused both of them the moment it was allowed to run on
                    //  every unit.  A gate that accuses the innocent teaches the
                    //  reader to ignore it (2026-09-04), so the band has to
                    //  separate round-off from a real mislabelling.
                    //
                    //  1e-3 is where it is set, and the reason is the sentence
                    //  the message itself makes: the consequence claimed is a
                    //  residual of LATENT-HEAT size, which needs an incipient
                    //  phase of some size to carry it.  Below 1e-3 there is
                    //  effectively no phase to change, and above it there is --
                    //  the two real findings here measure 0.24 and 0.49, two to
                    //  five hundred times the band.  It is NOT a tolerance
                    //  derived from anything, and a stream sitting genuinely
                    //  between 1e-6 and 1e-3 off its saturation point now goes
                    //  unreported -- the price of not crying wolf at every
                    //  converged flash outlet.  MEASURED before it was chosen,
                    //  rather than assumed: across `bin/runTests --fast` (one
                    //  case per tutorial family, 58 cases) NO inlet anywhere
                    //  falls in that window, so widening the band silenced
                    //  nothing that was being reported.  That is a statement
                    //  about those 58 cases, not about the whole corpus.
                    const scalar incipientBand = 1.0e-3;
                    const bool bad = asLiquid ? (g >  incipientBand)
                                              : (g < -incipientBand);
                    if (bad)
                    {
                        std::ostringstream o;
                        o << "  IMPOSSIBLE INLET PHASE, found by this report rather than guessed: stream '"
                          << sp->name << "' is priced as "
                          << (asLiquid ? "LIQUID (vf = 0)" : "VAPOUR (vf = 1)")
                          << " at T = " << sp->T << " K, P = " << (sp->P * 1.0e-5)
                          << " bar, but its own Rachford-Rice residual there is g("
                          << (asLiquid ? "V=0" : "V=1") << ") = " << g
                          << ", i.e. the fluid is "
                          << (asLiquid ? "ABOVE its bubble point" : "BELOW its dew point")
                          << " and cannot hold that label.  The enthalpy this report "
                             "charged for it is missing (or inventing) that phase change, "
                             "which is a residual of latent-heat size.  Fix the STREAM "
                             "(declare its real `vaporFraction`/`phase` in 0/, or feed it "
                             "at a state where the label is true), not this unit.\n";
                        found += o.str();

                        //  ON `AdvisoryLog`, unconditionally.  See the block
                        //  comment above this pass for why.
                        std::ostringstream one;
                        one << "is priced as "
                            << (asLiquid ? "LIQUID (vf = 0)" : "VAPOUR (vf = 1)")
                            << " at T = " << sp->T << " K, P = "
                            << (sp->P * 1.0e-5) << " bar, but its own"
                               " Rachford-Rice residual there is g("
                            << (asLiquid ? "V=0" : "V=1") << ") = " << g
                            << ", i.e. it is "
                            << (asLiquid ? "ABOVE its bubble point"
                                         : "BELOW its dew point")
                            << " and cannot hold that label; the enthalpy priced"
                               " for it is missing (or inventing) that phase change";
                        if (AdvisoryLog::instance().add(
                                "validity", "warning",
                                "stream '" + sp->name + "'", one.str()))
                            std::cerr << "[phase] stream '" << sp->name << "' "
                                      << one.str() << ".\n";
                    }
                } catch (const std::exception&) { /* package cannot answer here */ }
            }

            impossibleOf[r.name] = found;
        }

        const EnergyClosureRecord* le = nullptr;
        auto ai = auditOf.find(r.name);
        if (ai != auditOf.end() && ai->second < ledger.size())
            le = &ledger[ai->second];

        //  The step is credited ONLY when the audit reproduced it.  Any
        //  other status leaves the adjusted closure equal to the raw one --
        //  and therefore leaves the alarm exactly where it was.
        const bool credited = le && le->status == "accounted";
        const scalar step   = credited ? le->step_kW : 0.0;
        const scalar adjDH  = r.dH - step;
        scalar adjClosure   = r.closure;
        if (r.declares)
            adjClosure = (std::abs(r.items) > 1.0e-9)
                ? 100.0 * adjDH / r.items
                : (std::abs(adjDH) < 1.0e-6 ? 100.0 : 0.0);

        //  An ABSENT closure is an EMPTY field, never a number.  Same for the
        //  adjusted one: an adjustment to a closure that does not exist is
        //  also nothing.  Every reader that parses this column as a float
        //  must therefore tolerate an empty cell -- which is the point: a
        //  reader that cannot is a reader that was being told 100 %.
        f << r.name << "," << std::fixed << std::setprecision(4)
          << r.hIn << "," << r.hOut << "," << r.dH << ","
          << r.items << ",";
        if (r.hasClosure) f << std::setprecision(2) << r.closure;
        f << "," << kEnthalpyDatum << ",";
        if (le)
            f << std::fixed << std::setprecision(4)
              << le->raw_kW << "," << le->step_kW << ","
              << le->remaining_kW << ",";
        if (le && r.hasClosure) f << std::setprecision(2) << adjClosure;
        if (le) f << "," << le->status << "\n";
        else
            f << "n/a,n/a,n/a,n/a,n/a\n";

        // pass-12 (student): a ~1% first-law gap sat silently in the CSV while
        // every default announces aloud -- the ledger now SPEAKS when a unit's
        // closure leaves 100 +- 0.5%.
        //  RED, on stderr, like the other two laws (Vítor 2026-08-09).  This
        //  used to whisper to stdout -- the same event class that the mass
        //  balance warned about and the element balance did not mention at
        //  all: three registers for three conservation laws, which is not a
        //  convention a reader can learn.
        //  THE VERDICT IS NOW TAKEN ON THE *REMAINING* RESIDUAL -- what is
        //  left once an identified, independently reproduced model-boundary
        //  step is accounted for.  A unit with no such boundary has step 0,
        //  so its verdict, its band and its message are byte-identical to
        //  what they were before this existed.
        if (r.declares && std::abs(adjClosure - 100.0) > reporting::energyBandPct)
        {
            //  The commonest cause deserves its name (2026-08-23 LLM
            //  benchmark: two correctly-authored cases drew this banner, and
            //  both times the residual was the latent heat of a stream
            //  priced in the wrong phase -- an unpinned all-vapour inlet
            //  priced vf = 0, and a unit stamping its outlet's phase).  The
            //  hint names the CHECK, not a verdict: the reader compares the
            //  residual against a latent-heat magnitude and reads the vf
            //  column, which is evidence this report cannot weigh for them.
            //  A CHECK THAT CAN RUN MUST NOT STAY A GUESS (2026-08-24,
            //  the glass-box reading benchmark).  The paragraph below used
            //  to ADVISE the reader to compare the residual against a
            //  latent heat and read the vf column -- while this report
            //  holds the thermo package and can do exactly that itself.
            //  It found the wrong culprit on esterification2sector, where
            //  the 808 kW is an INLET whose declared phase is impossible
            //  at its own (T, P, z): Rachford-Rice's own g(V) says so, and
            //  the flash prints it three lines later.
            //
            //  The test is the incipient one, no iteration: for a stream
            //  labelled LIQUID, g(0) = SUM z_i (K_i - 1) > 0 means it is
            //  already above its bubble point; for one labelled VAPOUR,
            //  g(1) = SUM z_i (1 - 1/K_i) < 0 means it is below its dew
            //  point.  Either way the label the report priced is one the
            //  fluid cannot hold.  A package that cannot answer (a
            //  reactive or electrolyte surface at a trial state) simply
            //  declines -- the guess-free remedy still prints.
            const std::string& impossible = impossibleOf[r.name];

            std::string remedy =
                impossible.empty()
                ? std::string(
                "A first-law residual this report cannot attribute.  Every "
                "inlet's declared phase was CHECKED against equilibrium IN "
                "THIS REPORT'S OWN WORLD and each one is possible there -- "
                "which rules the commonest cause out of THAT world only.  A "
                "unit that computes in its own (a per-unit `thermo {}` "
                "override) can hold the same stream to be a different phase, "
                "and the latent heat of that disagreement is exactly a "
                "residual of this size: read the model-boundary row below "
                "before concluding anything, and note whether the auditor "
                "could READ this unit's world at all.  Ledger: ")
                : (impossible + "Ledger: ");
            remedy += "reports/balances/energyBalance_byUnit.csv";
            if (le && le->status != "none")
                remedy = "The model-boundary audit did NOT account for this "
                         "residual (" + le->status + "): " + le->reason
                       + ".  Nothing was credited.  Ledger: "
                         "reports/balances/energyBalance_byUnit.csv";
            reporting::balanceAlarm(
                "ENERGY", "unit '" + r.name + "'",
                "dH = " + std::to_string(r.dH) + " kW vs declared items "
                + std::to_string(r.items) + " kW  ("
                + std::to_string(adjClosure) + " % closure)",
                remedy);
        }
        else if (credited && ctx.verbosity >= 2)
            std::cout << "  [report] energyBalance: unit '" << r.name
                      << "' -- raw imbalance " << std::fixed
                      << std::setprecision(4) << le->raw_kW
                      << " kW EXPLAINED by a model-boundary step of "
                      << le->step_kW << " kW ("
                      << le->upstreamWorld << "  ->  " << le->downstreamWorld
                      << "); remaining " << le->remaining_kW << " kW, "
                      << le->criterion << "\n";
    }

    //  The ledger itself, with everything a reader needs to check the claim:
    //  BOTH sides of the boundary by their declared model names, the rule
    //  that authorises the transition, and the step's sign, units and
    //  magnitude -- beside the three quantities, kept apart.
    if (!ledger.empty())
    {
        f << "\n# model-boundary ledger (H is the conserved truth; T is the "
             "model-dependent readout)\n"
             "unit,status,upstream_world,downstream_world,rule,sign,units,"
             "magnitude,raw_imbalance_kW,boundary_step_kW,remaining_kW,"
             "norm_residual,criterion,per_stream_step_kW,reason\n";
        auto clean = [](std::string s)
        {
            std::replace(s.begin(), s.end(), ',', ';');
            std::replace(s.begin(), s.end(), '\n', ' ');
            return s;
        };
        for (const auto& e : ledger)
            f << e.unit << "," << e.status << "," << clean(e.upstreamWorld)
              << "," << clean(e.downstreamWorld) << "," << clean(e.rule)
              << "," << e.sign << "," << e.units << ","
              << std::fixed << std::setprecision(4) << e.magnitude << ","
              << e.raw_kW << "," << e.step_kW << "," << e.remaining_kW << ","
              << std::scientific << std::setprecision(6) << e.normResidual
              << "," << clean(e.criterion) << "," << clean(e.detail)
              << "," << clean(e.reason) << "\n";
        f << std::fixed;
    }
    //  Same three quantities into the result JSON, through the existing
    //  emitter path (result/ResultEmitter.cpp reads `energyClosures`).
    ctx.result.energyClosures = ledger;

    // Breakdown: each unit's individual declared energy items.
    f << "\n# declared energy items (kW)\nunit,item,value\n";
    for (const auto& u : units)
    {
        auto it = ctx.result.kpis.find(u.name);
        if (it == ctx.result.kpis.end()) continue;
        for (const auto& [k, v] : it->second)
            if (reporting::isEnergyItemKpi(k))
                f << u.name << "," << k << "," << std::fixed
                  << std::setprecision(4) << v << "\n";
    }
    f.close();

    // ---- GLOBAL plant boundary (the first law over the whole flowsheet) ----
    //   Σ H_elements(feeds) + Σ Q_boundary  =  Σ H_elements(products)
    // On the ONE datum (elements, 25 C) every INTERNAL stream cancels (it is
    // one unit's outlet and another's inlet), so only the true system feeds,
    // products, and boundary heat/work survive.  Q_boundary is `globalQext` --
    // the Σ of each unit's per-unit `supplied` accumulated above, NOT a blind
    // KPI sweep.  That distinction is what makes a combined-cycle close:
    //   * an internal process-to-process exchanger (the HRSG) is EXCLUDED -- its
    //     duty moves heat between two internal streams, never across the boundary;
    //   * a turbine's shaft work (its negative `W_shaft_kW`) IS counted -- that
    //     energy leaves the fluid and the boundary;
    //   * the electricLoad generator that converts that SAME work to electricity
    //     carries NO process stream, so it is skipped (it would double-count);
    //   * the evaporator's utility-medium `duty_kW` stays excluded (its chest
    //     steam is already a feed in Σ H(feeds)), exactly as it is per-unit.
    // This is the single number the GUI shows green (read off the result's
    // `globalEnergyBoundary` block since 2026-09-05 -- it used to re-derive Q
    // from the utility allocation and disagree) and the `boundary` golden
    // rows pin.
    {
        scalar Hfeeds = 0.0, Hprods = 0.0;
        const scalar Qext = globalQext;
        int    nFeed = 0, nProd = 0, nGap = 0;
        // No-silent-crutch: a boundary stream that genuinely CARRIES a species
        // with no elements-datum enthalpy (z_i > 0 but no standardThermochemistry / no
        // aqueous-ion reference) cannot be placed on the datum.  Dropping it
        // and still printing a closure % is the silent hole this report used to
        // have -- so we collect the offenders and REFUSE the global number
        // below (the energy balance only; the mass balance needs no enthalpy).
        // A composition-absent species (z_i = 0) is NOT a gap and stays silent.
        std::vector<std::string> gapStreams;
        std::set<std::string>    gapComponents;
        std::vector<std::string> gapOther;     // datum present but a Cp leg gone
        auto sumStream = [&](const std::string& name, scalar& acc, int& cnt)
        {
            auto it = ctx.result.streams.find(name);
            if (it == ctx.result.streams.end()) return;
            const auto miss = missingEnthalpyData(
                it->second.z, it->second.s, ctx.thermo);
            if (!miss.empty())
            {
                gapStreams.push_back(name);
                for (const auto& m : miss) gapComponents.insert(m);
                ++nGap;
                return;
            }
            try { acc += reporting::streamH_elements(it->second, ctx.thermo);
                  ++cnt; }
            catch (const std::exception& ex)
            {
                // The formation datum exists but a downstream leg (a Cp block)
                // is absent -- still a real gap, named from the kernel message.
                gapStreams.push_back(name);
                gapOther.emplace_back(ex.what());
                ++nGap;
            }
        };
        // `balanceFeeds`: an observed feed (bubbleT's, consumed only by a
        // unit with no material outputs) carries no enthalpy ACROSS the
        // boundary -- counting it read as a 100 % energy hole on a correct
        // saturation case.  Same one-home classification as mass/elements.
        for (const auto& s : topo.balanceFeeds) sumStream(s, Hfeeds, nFeed);
        for (const auto& s : topo.products)     sumStream(s, Hprods, nProd);

        // ---- REFUSAL --------------------------------------------------------
        // One or more boundary streams could not be placed on the elements
        // datum because a PRESENT component has no enthalpy datum.  Present a
        // NO number (no misleading residual_pct); name the culprits loudly.
        if (nGap > 0)
        {
            auto join = [](const auto& cont, const std::string& sep)
            {
                std::string out; bool first = true;
                for (const auto& v : cont)
                { if (!first) out += sep; out += v; first = false; }
                return out;
            };
            std::ostringstream msg;
            msg << "energy balance cannot close: ";
            if (!gapComponents.empty())
                msg << "component(s) '" << join(gapComponents, "', '")
                    << "' have no enthalpy datum (no standardThermochemistry, no "
                       "aqueous-ion reference)";
            else
                msg << join(gapOther, "; ");
            msg << " -- present in boundary stream(s) '"
                << join(gapStreams, "', '") << "'.  ";
            //  The generic remedy belongs ONLY to the generic diagnosis.
            //  When the gap came from a thrown reason (gapOther), that
            //  exception carries its OWN remedy, and stapling this sentence
            //  after it CONTRADICTED it: flash14 refused because CaCO3's
            //  datum is not on the ideal-gas rung and was then told to "add
            //  standardThermochemistry{}" -- a block CaCO3 already has -- with
            //  a key named `phase` that has never existed (it is
            //  `referenceState`).  Two wrong instructions in one sentence,
            //  both invisible because the sentence was unconditional.
            if (!gapComponents.empty())
                msg << "Add standardThermochemistry{ dHf_298; s_298; "
                       "referenceState; } to the component .dat, or configure "
                       "it as an electrolyte (electrolyte{ cation; anion; } + "
                       "ions in the catalogue).  ";
            msg << "The ENERGY balance is REFUSED; the mass balance is "
                   "unaffected (it needs no enthalpy datum).";

            //  Refusal POSTURE follows provenance (2026-08-02, the
            //  default-on wave).  A DECLARED energyBalance keeps the hard
            //  ERROR: the author asked for a verdict and cannot have one.
            //  The DEFAULT instance (main.cpp passes `onMissingDatum
            //  unavailable;`) reports the SAME facts as UNAVAILABLE --
            //  absence of curated data is not an error of a case that never
            //  claimed an energy closure, and a default diagnostic must be
            //  honest without being accusatory (the elementBalance
            //  precedent).  Both write the same REFUSED artefact; only the
            //  console register differs.
            const bool asUnavailable = softGaps;
            if (asUnavailable)
                std::cout << "  [report] energyBalance UNAVAILABLE -- "
                          << msg.str()
                          << "  (default diagnostic; declare `reports {"
                             " energyBalance {} }` for the hard refusal)\n";
            else
                std::cerr << "ERROR: energyBalance: " << msg.str() << "\n";

            const std::filesystem::path gpath = dir / "globalEnergyBoundary.csv";
            std::ofstream g(gpath);
            if (g.is_open())
            {
                // A REFUSED record -- deliberately NO residual_pct.  A reader
                // (the GUI, the regression) sees status=REFUSED, never a
                // closure number computed from a partial sum.
                std::string reason = msg.str();
                std::replace(reason.begin(), reason.end(), ',', ';');
                std::replace(reason.begin(), reason.end(), '\n', ' ');
                g << "quantity,value\n"
                  << "status,REFUSED\n"
                  << "reason," << reason << "\n"
                  << "n_gap," << nGap << "\n"
                  << "gap_components," << join(gapComponents, " ") << "\n"
                  << "gap_streams," << join(gapStreams, " ") << "\n";
                g.close();
            }
            if (ctx.verbosity >= 1 && !asUnavailable)
                std::cout << "  [report] globalEnergyBoundary -> REFUSED ("
                          << nGap << " boundary stream(s) with no enthalpy "
                             "datum)\n";
            return;
        }

        const scalar residual = Hfeeds + Qext - Hprods;
        // Normalise the residual by the LARGEST energy magnitude in play, not by
        // |Hfeeds| alone: a CLOSED LOOP (a recycle Rankine, rankine02) has no
        // boundary feeds (Hfeeds == 0), so |Hfeeds| would collapse the denom to
        // 1e-9 and turn a ~0 residual into a phantom 21 % -- a silent fake hole
        // next to the headline closure.  Using max(|feeds|,|products|,|Qext|)
        // gives an honest small percentage when the loop balances, and leaves
        // every open plant (|Hfeeds| dominates) unchanged.
        //  THE RESIDUAL IS JUDGED AGAINST THE ENERGY THE PLANT EXCHANGES, NOT
        //  AGAINST THE ENTHALPY THAT FLOWS THROUGH IT (2026-09-08, Vitor).
        //
        //  A stream's H is an ABSOLUTE enthalpy on the formation datum, so
        //  |Hfeeds| is set by whatever has the most moles crossing the
        //  boundary.  On ammonia02 that is COOLING WATER: the denominator was
        //  39 777 909 kW, the 9190.64 kW residual read 0.0231 %, and HALVING
        //  THE WATER FLOW WOULD HAVE DOUBLED THE PERCENTAGE with nothing
        //  changed in the process.  A number that moves when an inert carrier
        //  moves is not measuring the process.
        //
        //  What the first law is actually about here is the energy the plant
        //  EXCHANGES -- the compression work, the reboiler and condenser
        //  duties, the reaction heat.  `globalExchanged` sums their
        //  MAGNITUDES (so a duty in and a duty out do not cancel) and |Qext|
        //  covers boundary heat carried by no declared item.  Same case:
        //  57 873 kW, and the residual reads 15.88 % -- which is what it is.
        //
        //  The old max(|feeds|,|products|,|Qext|) guard against a CLOSED loop
        //  (rankine02: no boundary feeds, so |Hfeeds| would collapse to the
        //  floor and invent a 21 % hole) is not needed on this basis and is
        //  better served by it: a closed Rankine loop exchanges a great deal
        //  of energy -- boiler, condenser, turbine -- so its denominator is
        //  large and honest.  The vacuous case (nothing crosses AND nothing
        //  is exchanged) still reports 0 %, below.
        //  THE FLOOR IS NOT A SCALE (2026-09-08, found by ASTRA's audit in
        //  the triple-effect evaporator, and it is a defect of the basis
        //  change above rather than of the plant).  evaporator02 receives its
        //  energy as MATERIAL steam and condensate: it declares no duty, so
        //  `globalExchanged` is 0, and it carries no boundary heat, so Qext is
        //  0 -- while it has feeds and products, so `noBoundary` below is
        //  false.  The old code then divided a real -6162.5 kW residual by the
        //  1e-9 kW floor and published -6.16e14 %.
        //
        //  A percentage of nothing is not a large percentage; it is not a
        //  percentage.  So the SCALE is a separate question from the residual:
        //  when there is none, the residual is still published in kW (it is
        //  the physical fact) and the ratio is marked UNAVAILABLE for every
        //  reader, which is the same rule the by-unit closure column follows.
        //  The floor stays only to keep the division defined.
        const scalar scale    = std::max(globalExchanged, std::abs(Qext));
        const bool   hasScale = (scale > 1.0e-6);       // kW; below this it is noise
        const scalar denom    = std::max(scale, 1.0e-9);
        // A fully CLOSED loop (no boundary feeds AND no products -- rankine02's
        // recycle) has nothing crossing the boundary: feeds, products and Qext
        // are all ~0 and the first law is vacuous.  Report 0 % rather than
        // dividing a floating-point-noise residual by the 1e-9 floor (the
        // phantom 21 %).  Any OPEN plant has a real denom and is unaffected.
        const bool   noBoundary = (nFeed == 0 && nProd == 0 && denom <= 1.0e-6);
        //  THE BASIS STRING DESCRIBES THE ARITHMETIC THAT RAN, not a
        //  neighbouring one.  It used to say "sum of |duties| + |Q boundary|"
        //  where the code takes a MAX of the two -- named in the same audit,
        //  and exactly the class of quiet falsehood the 2026-09-05 rule
        //  exists to stop: a reader who reproduces the stated formula gets a
        //  different denominator.
        const std::string residualBasis =
            hasScale
            ? "energy exchanged (the larger of: sum of |declared duties and "
              "work|, and |Q boundary|)"
            : "UNAVAILABLE -- this plant declares no duty and carries no "
              "boundary heat, so there is no exchanged-energy scale to "
              "express the residual as a fraction of; read residual_kW";
        const scalar relPct   = (noBoundary || !hasScale)
                              ? 0.0 : 100.0 * residual / denom;

        //  The ledger travels on the result, so the GUI draws THIS and never a
        //  sum of its own (2026-09-05 -- see SimulationResult.H).
        {
            auto& gb = ctx.result.globalEnergyBoundary;
            gb.present       = true;
            gb.H_feeds_kW    = Hfeeds;
            gb.Q_boundary_kW = Qext;
            gb.H_products_kW = Hprods;
            gb.residual_kW   = residual;
            gb.residual_pct  = relPct;
            gb.residual_pct_available = hasScale && !noBoundary;
            gb.residual_denom_kW = denom;
            gb.residual_basis    = residualBasis;
            gb.n_feeds       = nFeed;
            gb.n_products    = nProd;
            gb.n_gap         = nGap;
            gb.noBoundary    = noBoundary;
            gb.datum         = kEnthalpyDatum;
        }

        const std::filesystem::path gpath = dir / "globalEnergyBoundary.csv";
        std::ofstream g(gpath);
        if (g.is_open())
        {
            g << "quantity,value_kW\n" << std::fixed << std::setprecision(6)
              << "H_feeds,"        << Hfeeds   << "\n"
              << "Q_boundary,"     << Qext     << "\n"
              << "H_products,"     << Hprods   << "\n"
              << "inputs,"         << (Hfeeds + Qext) << "\n"
              << "outputs,"        << Hprods   << "\n"
              << "residual,"       << residual << "\n"
              << "residual_pct,";
            //  EMPTY, never a number, when there is no scale.  A reader that
            //  parses this column as a float must tolerate an empty cell --
            //  which is the point: a reader that cannot was being handed
            //  -6.16e14.
            if (hasScale && !noBoundary) g << std::setprecision(4) << relPct;
            g << "\n"
              << "residual_denom_kW,";
            if (hasScale) g << std::setprecision(4) << denom;
            g << "\n"
              << "residual_basis," << residualBasis << "\n"
              << "n_feeds,"        << nFeed    << "\n"
              << "n_products,"     << nProd    << "\n"
              << "n_gap,"          << nGap     << "\n";
            g.close();
            if (ctx.verbosity >= 2)
            {
                std::cout << "  [report] globalEnergyBoundary -> " << gpath.string();
                if (hasScale && !noBoundary)
                    std::cout << "  (|in-out|/in = " << std::setprecision(3)
                              << std::abs(relPct) << " %)";
                else
                    std::cout << "  (residual " << std::setprecision(4)
                              << residual << " kW; NO EXCHANGED-ENERGY SCALE"
                                 " -- percentage unavailable)";
                std::cout << "\n";
            }
        }
    }

    if (ctx.verbosity >= 2)
    {
        std::cout << "  [report] energyBalance_byUnit -> " << path.string()
                  << "  (" << units.size() << " units";
        if (naCount > 0)  std::cout << ", " << naCount << " n/a";
        if (gapCount > 0) std::cout << ", " << gapCount << " curation-gap";
        std::cout << ")\n";
    }
}

} // namespace Choupo
