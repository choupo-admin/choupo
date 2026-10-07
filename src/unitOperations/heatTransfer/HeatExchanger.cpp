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

#include "HeatExchanger.H"

#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "unitOperations/heatTransfer/htc/ShellTubeDesign.H"
#include "materials/MaterialRegistry.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoAnnounce.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "unitOperations/flash/PureSaturationPlateau.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include <limits>

#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

int HeatExchanger::solve(const DictPtr& dict,
                         const ThermoPackage& thermo,
                         int verbosity)
{
    // ---- Two inputs: hot + cold ----------------------------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("HeatExchanger: expected exactly 2 input"
            " streams (hot + cold); got " + std::to_string(ins.size())
            + ".  Declare in flowsheetDict as  inputs (hotName coldName );");
    const std::size_t n = thermo.n();

    //  `qPinned`: the quality a PURE two-phase inlet DECLARES (pinned,
    //  0 < vf < 1, one component), or -1.  On its saturation curve (T, P) do
    //  not fix the split; `resolvedInletVaporFraction` returns the pin as the
    //  inlet's vf (the one home, DEV.md C37 item 1), and this unit keeps it
    //  besides to PRICE the inlet at it (`inletH` below, C36 item 3).
    struct Stream
    { std::string name; sVector z; scalar F = 0, T = 0, P = 0, vf = 0;
      scalar qPinned = -1.0; };
    auto readStream = [&](const DictPtr& sd) -> Stream
    {
        Stream s;
        s.name = sd->name();
        s.F  = sd->lookupScalar("F", Dims::molarFlow);
        s.T  = sd->lookupScalar("T", Dims::temperature);
        s.P  = sd->lookupScalar("P", Dims::pressure);
        s.z.assign(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar sum = 0.0;
        for (const auto& k : cd->keys()) s.z[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : s.z) sum += v;
        if (sum > 0.0) for (auto& v : s.z) v /= sum;
        //  An UNPINNED inlet means its own equilibrium (R-E2), single phase
        //  included: the Cp rung and the transport properties below pick the
        //  phase from this, and the carried default 0 read an all-vapour
        //  inlet as a liquid (DEV.md C33).  This unit's own thermo world.
        s.vf = flashState::resolvedInletVaporFraction(
            sd, s.T, s.P, s.z, thermo,
            "heatExchanger inlet '" + s.name + "'");
        if (const auto q = flashState::pinnedPureQuality(sd, s.z))
            s.qPinned = *q;
        return s;
    };
    Stream s0 = readStream(ins[0]);
    Stream s1 = readStream(ins[1]);

    // ---- Operation: HARDWARE = area + U (+ optional flow arrangement) ---
    auto oper = dict->subDict("operation");
    //  THE ARRANGEMENT IS A CLOSED SET, AND AN UNRECOGNISED WORD REFUSES.
    //
    //  This used to read `flow != "co" && != "cocurrent" && != "parallel"`,
    //  which makes the DEFAULT the destination of every word the engine does
    //  not know.  `flow crossflow;` -- a real arrangement, not implemented
    //  here -- ran counter-current and said nothing; so did `flow Co;`, and so
    //  did a typo.  Counter-current is the OPTIMISTIC arrangement (the largest
    //  possible LMTD for the same terminal temperatures), so the silent
    //  fallback always errs towards a smaller exchanger than the declaration
    //  asked for.  A wrong answer at exit 0 is the failure this project
    //  refuses; the accepted words are listed so the remedy is in the message.
    const std::string flow = oper->lookupWordOrDefault("flow", "counter");
    const bool counter =
        (flow == "counter" || flow == "countercurrent");
    const bool cocurrent =
        (flow == "co" || flow == "cocurrent" || flow == "parallel");
    if (!counter && !cocurrent)
        throw std::runtime_error("HeatExchanger: operation { flow " + flow
            + "; } is not an arrangement this unit implements.  Accepted:"
              " `counter` (= `countercurrent`, the default) or `co`"
              " (= `cocurrent` = `parallel`).  Crossflow and multi-pass"
              " shell-side arrangements are NOT implemented -- for 1 shell"
              " pass and 2 tube passes declare `passes 2;` instead (in"
              " `operation`, or in `operation.geometry` under"
              " `model geometry;`), which selects the corresponding"
              " eps-NTU relation.");

    // ---- Per-stream Cp (sensible; liquid or gas by vapour fraction) -----
    //  A COMPONENT WITH NO Cp ON THIS RUNG CONTRIBUTES ZERO, WHICH IS A
    //  NUMBER.  The loop below used to skip such a component silently and the
    //  only guard downstream was `Cp <= 0`, which fires solely when EVERY
    //  component is missing.  A binary stream half of whose moles carry no
    //  liquid Cp therefore reported an mCp roughly half the truth: the duty
    //  came out low, eps-NTU converged, exit 0, and nothing anywhere said that
    //  half the stream had been priced at zero heat capacity.  That is the
    //  shape this project refuses -- a plausible number, not an error.
    //
    //  The refusal is on the moles actually PRESENT (z > 0): a component the
    //  case declares but this stream does not carry cannot make the mixture's
    //  Cp wrong, and refusing on it would make the global component list, not
    //  the stream, decide whether an exchanger runs.
    auto streamCp = [&](const Stream& s, scalar Teval) -> scalar
    {
        const bool liquid = (s.vf < 0.5);
        scalar cp = 0.0, missing = 0.0;
        std::string names;
        for (std::size_t i = 0; i < n; ++i)
        {
            const bool has = liquid ? thermo.comp(i).hasCpLiquid()
                                    : thermo.comp(i).hasCpIdealGas();
            if (has)
                cp += s.z[i] * (liquid ? thermo.comp(i).cpLiquid().Cp(Teval)
                                       : thermo.comp(i).cpIdealGas().Cp(Teval));
            else if (s.z[i] > 0.0)
            {
                missing += s.z[i];
                if (!names.empty()) names += ", ";
                names += thermo.comp(i).name();
            }
        }
        if (missing > 0.0)
            throw std::runtime_error("HeatExchanger: stream '" + s.name
                + "' carries " + std::to_string(100.0 * missing) + " % of its"
                  " moles in component(s) with no "
                + std::string(liquid ? "liquid" : "ideal-gas")
                + " heat capacity: " + names + ".  Those moles would be priced"
                  " at Cp = 0 and the duty reported LOW without any other"
                  " symptom, so the exchanger refuses instead.  Remedy: give"
                  " each named component a "
                + std::string(liquid ? "`liquidHeatCapacity`"
                                     : "`idealGasHeatCapacity`")
                + " block, or declare the stream on the other rung if its"
                  " vapour fraction (vf = " + std::to_string(s.vf)
                + ") is wrong.");
        return cp;
    };

    // ---- HARDWARE: U and area --------------------------------------------
    // Default `model epsNTU;` (the U+area spec, BYTE-STABLE): both are read
    // directly.  `model geometry;` instead COMPUTES U and area from the tube
    // bundle geometry + per-side convective correlations (slot between the
    // read and the unchanged eps-NTU loop below).
    //  A chain that dispatches on a declared word must refuse a word it does
    //  not know (2026-09-07 rule, CLAUDE.md §6).  Before 2026-09-27 this chain
    //  had a catch-all else: `model geometri;` was dispatched to the U + area
    //  eps-NTU spec -- which, on a case declaring only its tube bundle, died
    //  asking for an `area` the author never meant to write, and on a case
    //  that also carries U and area ran the wrong model to exit 0 (measured:
    //  heatExchanger01 with `model geometri;` inserted, parent build).
    const std::string model = dict->lookupWordOrDefault("model", "epsNTU");
    if (model != "epsNTU" && model != "geometry" && model != "design")
        throw std::runtime_error("HeatExchanger: "
            + registryRefusal::message("heat exchanger model", model,
                  {"epsNTU", "geometry", "design"}, "Accepted"));
    scalar A = 0.0, U = 0.0;
    int    tubePasses = 1;   // 1 = counter/co; >=2 -> 1-shell/2-tube-pass eps-NTU
    std::string controllingResistance = "n/a";
    // Geometry-mode KPIs are stashed here and merged AFTER the eps-NTU KPI
    // block (which clears kpis_); empty in the epsNTU default path.
    std::map<std::string, scalar> geomKpis;
    if (model == "geometry" || model == "design")
    {
        // mass-specific cp [J/(kg.K)] of a stream at T: molar Cp / MW_avg.
        auto streamMassCp = [&](const Stream& s, scalar Teval) -> scalar
        {
            scalar Mbar = 0.0;             // kg/kmol
            for (std::size_t i = 0; i < n; ++i)
                if (s.z[i] > 0.0) Mbar += s.z[i] * thermo.comp(i).MW();
            if (Mbar <= 0.0)
                throw std::runtime_error("HeatExchanger(geometry): empty"
                    " composition for a stream");
            // streamCp is J/(mol.K); MW is kg/kmol = g/mol, so /1000 -> kg/mol.
            return streamCp(s, Teval) / (Mbar / 1000.0);
        };
        // mass-density-route helper: a stream's phase from its vapour fraction.
        auto streamRho = [&](const Stream& s) -> scalar
        {
            const DensityPhase ph =
                (s.vf < 0.5) ? DensityPhase::Liquid : DensityPhase::Vapour;
            return thermo.density(s.T, s.P, s.z, ph);
        };
        auto streamMu = [&](const Stream& s) -> scalar
        {
            return (s.vf < 0.5) ? thermo.viscosityLiquid(s.T, s.z)
                                : thermo.viscosityGas(s.T, s.z);
        };
        auto streamLambda = [&](const Stream& s) -> scalar
        {
            return (s.vf < 0.5) ? thermo.thermalConductivityLiquid(s.T, s.z)
                                : thermo.thermalConductivityGas(s.T, s.z);
        };
        // Mass flow [kg/s] = F[kmol/s] * MW_avg[kg/kmol].
        auto streamMdot = [&](const Stream& s) -> scalar
        {
            scalar Mbar = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (s.z[i] > 0.0) Mbar += s.z[i] * thermo.comp(i).MW();
            return s.F * Mbar;
        };

        // --- tubeStream (MANDATORY): which named inlet is in the tubes -----
        const std::string tubeName = oper->lookupWord("tubeStream");
        const std::string n0 = ins[0]->name(), n1 = ins[1]->name();
        bool tubeIsS0;
        if      (tubeName == n0) tubeIsS0 = true;
        else if (tubeName == n1) tubeIsS0 = false;
        else throw std::runtime_error("HeatExchanger(geometry): `tubeStream "
            + tubeName + ";` does not match either inlet ('" + n0 + "', '"
            + n1 + "')");
        const Stream& tubeS  = tubeIsS0 ? s0 : s1;
        const Stream& shellS = tubeIsS0 ? s1 : s0;

        // --- geometry block -----------------------------------------------
        auto g = oper->subDict("geometry");
        const scalar tubeID  = g->lookupScalar("tubeID",  Dims::length);
        const scalar tubeOD  = g->lookupScalar("tubeOD",  Dims::length);
        const scalar tubeL   = g->lookupScalar("tubeLength", Dims::length);
        const bool   isDesign = (model == "design");
        int          nTubes  = isDesign ? 0
                             : static_cast<int>(g->lookupScalar("nTubes"));
        const int    passes  = static_cast<int>(g->lookupScalarOrDefault("passes", 1.0));
        tubePasses = passes;
        scalar       shellID = isDesign ? 0.0
                             : g->lookupScalar("shellID", Dims::length);
        const scalar baffle  = g->lookupScalar("baffleSpacing", Dims::length);
        const scalar pitch   = g->lookupScalar("tubePitch", Dims::length);
        // TUBE ARRANGEMENT (Vitor 2026-07-03: this must be specified, not
        // hardcoded).  `tubePattern triangular;` (default, most common:
        // compact, higher h_o) or `square;` (cleanable lanes, lower dP).  It
        // drives BOTH the shell equivalent diameter D_e (Kern) AND the bundle
        // diameter constants (Sinnott) -- keeping them consistent (the earlier
        // code mixed a square D_e with triangular bundle constants).
        const std::string pattern =
            g->lookupWordOrDefault("tubePattern", "triangular");
        if (pattern != "triangular" && pattern != "square")
            throw std::runtime_error("HeatExchanger(geometry): tubePattern must"
                " be 'triangular' or 'square' (got '" + pattern + "')");
        const bool tri = (pattern == "triangular");
        //  THE KERN ARITHMETIC LIVES IN ONE HOME (2026-10-07, DEV.md 4c C48):
        //  `htc/ShellTubeDesign`, shared with the sizing pass's `design {}`
        //  route, so a plant's specification sheet and this unit cannot
        //  disagree about the equivalent diameter, the Sinnott bundle table,
        //  the films, the wall, the eps-NTU relation or the pressure drops.
        //  Moved verbatim; every witness of this unit is byte-identical.
        //  (The wall conductivity joins the bundle below, once it is read.)
        shellTubeDesign::TubeBundle bundle;
        bundle.tubeID = tubeID;  bundle.tubeOD = tubeOD;
        bundle.tubeLength = tubeL;  bundle.pitch = pitch;
        bundle.passes = passes;  bundle.triangular = tri;
        // Kern equivalent diameter D_e = C/d_o (p^2 - c*d_o^2) (the kernel).
        const scalar D_e = shellTubeDesign::equivalentDiameter(bundle);
        // Wall conductivity: explicit `wallK` or `wallMaterial <name>;`.
        scalar wallK = 0.0;
        if (g->found("wallK")) wallK = g->lookupScalar("wallK");
        else if (g->found("wallMaterial"))
        {
            const std::string mat = g->lookupWord("wallMaterial");
            wallK = MaterialRegistry::byName(mat).thermalConductivity;
            if (wallK <= 0.0)
                throw std::runtime_error("HeatExchanger(geometry): material '"
                    + mat + "' carries no thermalConductivity (k) -- add it to"
                    " data/standards/assets/" + mat + ".dat or give `wallK`.");
        }
        else throw std::runtime_error("HeatExchanger(geometry): give `wallK`"
            " or `wallMaterial <name>;` in the geometry block");
        bundle.wallK = wallK;
        //  FOULING, OPTIONAL (2026-10-07, DEV.md 4c C48).  A TEMA fouling
        //  factor per side, on that side's own area, in m2.K/W.  ABSENT means
        //  a CLEAN bundle -- what this unit has always rated and designed,
        //  and the kernel's zero default keeps that arithmetic bit for bit;
        //  so a case that declares none runs exactly as before and nothing
        //  new is printed or published for it.  Declared, it enters U in both
        //  the design search and the rating, and U_clean is published beside.
        const bool   fouled   = g->found("foulingTubeSide")
                             || g->found("foulingShellSide");
        const scalar foulTube = g->found("foulingTubeSide")
            ? g->lookupScalar("foulingTubeSide", Dims::thermalResistance) : 0.0;
        const scalar foulShell = g->found("foulingShellSide")
            ? g->lookupScalar("foulingShellSide", Dims::thermalResistance) : 0.0;
        if (foulTube < 0.0 || foulShell < 0.0)
            throw std::runtime_error("HeatExchanger(geometry): a fouling"
                " resistance must be >= 0 (m2.K/W)");
        if (tubeID <= 0 || tubeOD <= tubeID || tubeL <= 0
            || baffle <= 0 || pitch <= tubeOD
            || (!isDesign && (nTubes <= 0 || shellID <= 0)))
            throw std::runtime_error("HeatExchanger(geometry): inconsistent"
                " geometry (need 0<tubeID<tubeOD, tubeLength>0, nTubes>0,"
                " shellID>0, baffleSpacing>0, tubePitch>tubeOD)");

        // --- correlations (defaults: Gnielinski tube, Kern shell) ---------
        auto pickCorr = [&](const char* blk, const char* def)
        {
            std::string mname = def;
            if (oper->found(blk))
                mname = oper->subDict(blk)->lookupWordOrDefault("model", def);
            auto c = HeatTransferCorrelation::New(mname);
            if (oper->found(blk)) c->readParameters(oper->subDict(blk));
            return c;
        };
        auto tubeCorr  = pickCorr("tubeSide",  "Gnielinski");
        auto shellCorr = pickCorr("shellSide", "Kern");

        // ================================================================
        //  DESIGN MODE (the "sizing" question, as against rating): the DUTY
        //  is given,
        //  the GEOMETRY is the unknown.  Glass-box Kern procedure -- fix the
        //  tube choices (OD/ID/length/pitch/passes/material, above), then
        //  SOLVE for the number of tubes (and the shell diameter it implies)
        //  so the exchanger delivers the required U*A = Q_req / LMTD, and
        //  check the pressure-drop budget.  This is the piece that matches
        //  the real workflow: converge the balance with a duty target, THEN
        //  design the exchanger.  (v1: single-phase, F_correction = 1.)
        // ================================================================
        if (isDesign)
        {
            // hot/cold + the design target (an outlet T for one named stream)
            const bool zeroHotD = (s0.T >= s1.T);
            const Stream& hotS = zeroHotD ? s0 : s1;
            const Stream& colS = zeroHotD ? s1 : s0;
            const scalar Ch = streamMdot(hotS) * streamMassCp(hotS, hotS.T);
            const scalar Cc = streamMdot(colS) * streamMassCp(colS, colS.T);
            auto d = oper->subDict("design");
            auto sp = d->subDict("spec");
            const std::string tgtName = sp->lookupWord("stream");
            const scalar tgtT = sp->lookupScalar("T", Dims::temperature);
            scalar Th_in = hotS.T, Tc_in = colS.T, Th_out, Tc_out, Qreq;
            if (tgtName == (zeroHotD ? ins[0]->name() : ins[1]->name()))
            {   // target is the HOT outlet
                Th_out = tgtT;  Qreq = Ch * (Th_in - Th_out);  Tc_out = Tc_in + Qreq / Cc;
            }
            else
            {   // target is the COLD outlet
                Tc_out = tgtT;  Qreq = Cc * (Tc_out - Tc_in);  Th_out = Th_in - Qreq / Ch;
            }
            if (Qreq <= 0.0)
                throw std::runtime_error("HeatExchanger(design): the spec gives"
                    " zero or negative duty -- check the target outlet T is on"
                    " the right side of the inlets.");
            const scalar dT1 = counter ? (Th_in - Tc_out) : (Th_in - Tc_in);
            const scalar dT2 = counter ? (Th_out - Tc_in) : (Th_out - Tc_out);
            const scalar LMTDd = (std::abs(dT1 - dT2) < 1e-9) ? dT1
                : ((dT1 > 0 && dT2 > 0) ? (dT1 - dT2) / std::log(dT1 / dT2) : 0.0);
            if (LMTDd <= 0.0)
                throw std::runtime_error("HeatExchanger(design): non-positive"
                    " LMTD (temperature cross) -- the spec is infeasible"
                    " counter/co-current.");
            const scalar UA_req = Qreq / LMTDd;                 // W/K

            // shell ID implied by N tubes (Kern/Sinnott bundle correlation:
            // D_b = d_o (N/K1)^(1/n1) + clearance) -- the kernel's.
            auto shellFromN = [&](int N) -> scalar
            {
                return shellTubeDesign::shellFromTubes(bundle, N);
            };
            // COMPACT trial: the DELIVERED DUTY for a trial (N, Ds) via the SAME
            // eps-NTU (incl. the 1-2 penalty for multi-pass) used downstream --
            // so the design targets the DUTY (hence the outlet T), not merely
            // U*A.  This is what makes the sized exchanger actually reach the
            // spec temperature even when a 1-shell/2-tube-pass F-correction (F<1)
            // means U*A = Q/LMTD would UNDER-size it.
            shellTubeDesign::SideFluid ft, fs;
            ft.rho = streamRho(tubeS);  ft.mu = streamMu(tubeS);
            ft.lambda = streamLambda(tubeS);  ft.cp = streamMassCp(tubeS, tubeS.T);
            ft.mdot = streamMdot(tubeS);  ft.heating = (tubeS.T < shellS.T);
            fs.rho = streamRho(shellS);  fs.mu = streamMu(shellS);
            fs.lambda = streamLambda(shellS);  fs.cp = streamMassCp(shellS, shellS.T);
            fs.mdot = streamMdot(shellS);  fs.heating = (shellS.T < tubeS.T);
            const scalar Cmin = std::min(Ch, Cc), Cmax = std::max(Ch, Cc);
            const scalar CrD = Cmin / Cmax, dTin = Th_in - Tc_in;
            auto trialDuty = [&](int N) -> scalar
            {
                const scalar Ds = shellFromN(N);
                const scalar h_i = shellTubeDesign::tubeSide(
                    bundle, N, ft, *tubeCorr).film.h;
                const scalar h_o = shellTubeDesign::shellSide(
                    bundle, Ds, baffle, fs, *shellCorr).film.h;
                const scalar Uv = shellTubeDesign::overall(bundle, h_i, h_o,
                                    foulTube, foulShell).U;
                const scalar NTUv = Uv * shellTubeDesign::outsideArea(bundle, N)
                                  / Cmin;
                const scalar epsv = shellTubeDesign::effectiveness(
                    NTUv, CrD, passes, counter);
                return epsv * Cmin * dTin;                 // delivered duty [W]
            };
            (void) UA_req;   // kept for the announce; sizing now targets the duty
            // delivered duty grows monotonically with N -> the kernel's search
            // (doubling, then bisection, rounding UP: never undersize).
            nTubes  = shellTubeDesign::smallestCount(trialDuty, Qreq);
            shellID = shellFromN(nTubes);
            if (verbosity >= 1)
                std::cout << "  [design] duty target " << std::fixed
                          << std::setprecision(1) << Qreq / 1000.0 << " kW, LMTD "
                          << std::setprecision(1) << LMTDd << " K -> U*A_req "
                          << std::setprecision(0) << UA_req << " W/K.  SIZED: "
                          << nTubes << " tubes, shell ID "
                          << std::setprecision(3) << shellID << " m (Kern bundle, "
                          << pattern << " pitch, " << passes << "-pass"
                          << (passes >= 2 ? ", 1-2 eps-NTU" : "")
                          << "; check dP below, then rate).\n";
        }

        // --- TUBE side hydraulics (the kernel) ----------------------------
        shellTubeDesign::SideFluid ftr, fsr;
        ftr.rho = streamRho(tubeS);  ftr.mu = streamMu(tubeS);
        ftr.lambda = streamLambda(tubeS);  ftr.cp = streamMassCp(tubeS, tubeS.T);
        ftr.mdot = streamMdot(tubeS);  ftr.heating = (tubeS.T < shellS.T);
        const shellTubeDesign::TubeSideState tside =
            shellTubeDesign::tubeSide(bundle, nTubes, ftr, *tubeCorr);
        const scalar u_t = tside.u;
        const HeatTransferResult rt = tside.film;
        const scalar h_i = rt.h;

        // --- SHELL side hydraulics (Kern method, the kernel) --------------
        // Crossflow area at the shell centreline: A_s = D_s * C' * B / p,
        // with the clearance C' = p - d_o.
        fsr.mdot = streamMdot(shellS);  // kg/s
        fsr.rho = streamRho(shellS);  fsr.mu = streamMu(shellS);
        fsr.lambda = streamLambda(shellS);  fsr.cp = streamMassCp(shellS, shellS.T);
        fsr.heating = (shellS.T < tubeS.T);
        const shellTubeDesign::ShellSideState sside =
            shellTubeDesign::shellSide(bundle, shellID, baffle, fsr, *shellCorr);
        const scalar G_s = sside.G;                       // crossflow mass flux
        const scalar u_s = sside.u;                       // shell crossflow velocity
        const HeatTransferResult rs = sside.film;
        const scalar h_o = rs.h;

        // --- Overall U on the OUTSIDE area, with the cylindrical wall -----
        //   1/U_o = 1/h_o + r_o ln(r_o/r_i)/k_wall + r_o/(r_i h_i)
        //            (+ R_f,o + R_f,i r_o/r_i when fouling is declared)
        //  With no fouling declared the kernel's terms are zero and this is
        //  the clean coefficient, bit for bit what this unit always computed.
        const shellTubeDesign::Resistances res =
            shellTubeDesign::overall(bundle, h_i, h_o, foulTube, foulShell);
        const scalar R_inner = res.R_inner;
        const scalar R_wall  = res.R_wall;
        const scalar R_outer = res.R_outer;
        U = res.U;
        // Total outside heat-transfer area.
        A = shellTubeDesign::outsideArea(bundle, nTubes);

        // controlling resistance (largest of the three).
        controllingResistance = res.controlling;

        // --- PRESSURE DROP (Kern, both sides; the kernel) -----------------
        // Tube side: friction over all passes + the turnaround (return) losses.
        //   f_t (Fanning) = 0.079 Re^-0.25 (turbulent smooth, Blasius-type,
        //   valid Re 4e3-1e5); dP = (4 f L n_p / d_i + 4 n_p)(rho u^2 / 2),
        //   the 4 velocity-heads-per-pass being Kern's return-loss allowance.
        const shellTubeDesign::TubePressureDrop tdp =
            shellTubeDesign::tubePressureDrop(bundle, ftr.rho, u_t, rt.Re);
        const scalar f_tube  = tdp.f;
        const scalar dP_tube = tdp.dP;                                  // Pa
        // Shell side (Kern): f_s = exp(0.576 - 0.19 ln Re_s), 400<Re<1e6;
        //   dP = f_s G_s^2 D_s (N_b+1) / (2 rho D_e), viscosity correction
        //   (mu/mu_w)^0.14 = 1 (isothermal-wall v1, consistent with h_o).
        const shellTubeDesign::ShellPressureDrop sdp =
            shellTubeDesign::shellPressureDrop(bundle, shellID, baffle,
                                               fsr.rho, G_s, D_e, rs.Re);
        const int    nBaffles = sdp.nBaffles;
        const scalar f_shell  = sdp.f;
        const scalar dP_shell = sdp.dP;                                 // Pa

        //  THE PRESSURE DROP IS COMPUTED, PUBLISHED -- AND NOT APPLIED.
        //
        //  Both outlet streams leave at their inlet pressure (see the stream
        //  block at the end of solve()).  So a reader sees `dP_shell_kPa` on
        //  the KPI table and the SAME pressure at both ends of the stream in
        //  the stream table, and the two surfaces disagree with no word
        //  between them.  Downstream units then size a pump or a compressor
        //  against a pressure this exchanger has already said it destroys.
        //
        //  This ANNOUNCES rather than applying: carrying dP into the outlets
        //  moves the answer of every geometry-mode case in the corpus, and
        //  whether a shell-side Kern correlation is trustworthy enough to
        //  drive a flowsheet's pressure profile is a modelling decision, not
        //  a defect to fix in passing.  The posture is the pellet's -- state
        //  the gap where the reader is, judge nothing.
        {
            const std::string locus = "unit "
                + (dict->name().empty() ? std::string("heatExchanger")
                                        : dict->name());
            const std::string message =
                "the geometry model computes a tube-side and a shell-side"
                " pressure drop and publishes both as KPIs, but NEITHER is"
                " applied to the outlet streams: both leave at their inlet"
                " pressure.  A downstream unit therefore sees a pressure this"
                " exchanger has already reported as lost.  Read dP_tube_kPa"
                " and dP_shell_kPa as a rating of the bundle, never as the"
                " flowsheet's pressure profile.";
            if (AdvisoryLog::instance().add("model", "info", locus, message)
                && verbosity >= 2)
                std::cout << "  [dP] " << locus << ": " << message << "\n";
        }

        // --- KPIs (geometry-mode) -----------------------------------------
        geomKpis["dP_tube_kPa"]  = dP_tube  / 1000.0;
        geomKpis["dP_shell_kPa"] = dP_shell / 1000.0;
        geomKpis["f_tube"]       = f_tube;
        geomKpis["f_shell"]      = f_shell;
        geomKpis["nBaffles"]     = static_cast<scalar>(nBaffles);
        geomKpis["Re_tube"]   = rt.Re;  geomKpis["Pr_tube"] = rt.Pr;
        geomKpis["Nu_tube"]   = rt.Nu;  geomKpis["h_inner"] = h_i;
        geomKpis["Re_shell"]  = rs.Re;  geomKpis["Pr_shell"] = rs.Pr;
        geomKpis["Nu_shell"]  = rs.Nu;  geomKpis["h_outer"] = h_o;
        geomKpis["R_wall"]    = R_wall;
        geomKpis["R_inner"]   = R_inner;
        geomKpis["R_outer"]   = R_outer;
        //  Published ONLY when fouling was declared, so a clean case's KPI
        //  table (and every golden that pins it) is what it always was.
        if (fouled)
        {
            geomKpis["R_foul_inner"] = res.R_foulInner;   // referred to the outside
            geomKpis["R_foul_outer"] = res.R_foulOuter;
            geomKpis["U_clean"]      = res.U_clean;
        }
        // controllingResistance as a numeric code (the word is in the SEE):
        //   0 = tube-side, 1 = shell-side, 2 = wall.
        geomKpis["controllingResistanceCode"] =
            (controllingResistance == "tube-side")  ? 0.0
          : (controllingResistance == "shell-side") ? 1.0 : 2.0;

        // --- SEE (the mandatory deliverable) ------------------------------
        if (verbosity >= 2)
        {
            std::cout << "\n===============  Heat Exchanger (geometry -> U)  ==============\n";
            std::cout << std::fixed;
            std::cout << "  TUBE side (" << tubeName << ", "
                      << tubeCorr->type() << "):\n"
                      << "     v = " << std::setprecision(3) << u_t << " m/s,  d_h = "
                      << std::setprecision(4) << tubeID << " m\n"
                      << "     Re = " << std::setprecision(0) << rt.Re
                      << ",  Pr = " << std::setprecision(2) << rt.Pr
                      << ",  Nu = " << std::setprecision(1) << rt.Nu
                      << "   [" << tubeCorr->validityWindow()
                      << (rt.inValidity ? " : ok]" : " : WARN]") << "\n";
            if (!rt.inValidity) std::cout << "     WARN: " << rt.validityNote << "\n";
            std::cout << "     h_i = " << std::setprecision(1) << h_i << " W/(m^2.K)\n";
            std::cout << "  SHELL side (" << shellCorr->type() << ", Kern method, "
                      << pattern << " pitch):\n"
                      << "     v = " << std::setprecision(3) << u_s
                      << " m/s,  d_e = " << std::setprecision(4) << D_e
                      << " m,  G_s = " << std::setprecision(1) << G_s << " kg/(m^2.s)\n"
                      << "     Re_s = " << std::setprecision(0) << rs.Re
                      << ",  Pr = " << std::setprecision(2) << rs.Pr
                      << ",  Nu = " << std::setprecision(1) << rs.Nu
                      << "   [" << shellCorr->validityWindow()
                      << (rs.inValidity ? " : ok]" : " : WARN]") << "\n";
            if (!rs.inValidity) std::cout << "     WARN: " << rs.validityNote << "\n";
            std::cout << "     h_o = " << std::setprecision(1) << h_o
                      << " W/(m^2.K)   ((mu/mu_w)^0.14 = 1, isothermal-wall v1)\n";
            std::cout << "  Resistances (on outside area):\n"
                      << "     R_inner = " << std::scientific << std::setprecision(3)
                      << R_inner << ",  R_wall = " << R_wall
                      << ",  R_outer = " << R_outer << " (m^2.K/W)\n";
            if (fouled)
                std::cout << "     fouling (declared): R_f,i r_o/r_i = "
                          << res.R_foulInner << ",  R_f,o = " << res.R_foulOuter
                          << " (m^2.K/W);  U_clean = " << std::fixed
                          << std::setprecision(1) << res.U_clean
                          << std::scientific << "\n";
            std::cout << "     controlling resistance: "
                      << controllingResistance << "\n";
            std::cout << std::fixed
                      << "  U  = " << std::setprecision(1) << U
                      << " W/(m^2.K)  (RESULT),   area = " << std::setprecision(2)
                      << A << " m^2 (RESULT)\n";
            std::cout << "  Pressure drop (Kern):\n"
                      << "     tube side : f = " << std::setprecision(4) << f_tube
                      << ",  dP = " << std::setprecision(1) << dP_tube / 1000.0
                      << " kPa  (" << passes << " pass"
                      << (passes == 1 ? "" : "es") << ", friction + returns)\n"
                      << "     shell side: f = " << std::setprecision(4) << f_shell
                      << ",  " << nBaffles << " baffles,  dP = "
                      << std::setprecision(1) << dP_shell / 1000.0 << " kPa\n"
                      << "     (RESULTS; the duty-vs-pumping-cost trade-off lives here)\n"
                      << "===============================================================\n";
        }
    }
    else
    {
        A = oper->lookupScalar("area", Dims::area);
        U = oper->lookupScalar("U", Dims::heatTransfer_h);
        tubePasses = static_cast<int>(oper->lookupScalarOrDefault("passes", 1.0));
    }
    if (A <= 0.0) throw std::runtime_error("HeatExchanger: `area` must be > 0");
    if (U <= 0.0) throw std::runtime_error("HeatExchanger: `U` must be > 0");

    // Identify hot/cold by inlet temperature (Q flows hot -> cold).
    const bool   zeroHot = (s0.T >= s1.T);
    const scalar Th_in = zeroHot ? s0.T : s1.T;
    const scalar Tc_in = zeroHot ? s1.T : s0.T;

    // eps-NTU, with each Cp re-evaluated at its stream's MEAN temperature
    // (2 passes) --- matters when Cp(T) varies appreciably over the duty.
    //  THIS MODEL CONSERVES Q.  IT DOES NOT CONSERVE H, AND H IS WHAT EVERY
    //  BALANCE IN CHOUPO USES (corrected 2026-09-08).
    //
    //  What stood here used to say the unit "conserves energy exactly" and
    //  put any report residual down to a liquid-Cp / dHvap data artefact.
    //  The first half is true of Q and false of H; the second half describes
    //  a DIFFERENT mechanism, on the LIQUID leg, and was being used to
    //  explain away a residual that is neither liquid nor a data artefact.
    //  A comment that names the wrong cause sends the next reader away from
    //  the defect, which is what happened: ammonia02's -9190 kW was chased
    //  through the reactor and the report before anyone read this loop.
    //
    //  The mechanism, measured on ammonia02 (200 bar, SRK):
    //    * `streamCp` returns cpIdealGas for any stream with vf >= 0.5 -- no
    //      pressure, no departure function.  eps-NTU forms C = n*Cp_ig, takes
    //      Q = eps*Cmin*dT_max, and WRITES T_out = T_in -+ Q/C.
    //    * the TEMPERATURE is what lands on the stream; its ENTHALPY is then
    //      priced by the package, which is SRK.  H(T_out) - H(T_in) is not Q,
    //      because a different Cp produced T_out.
    //    * waterCooler hot side, 479 -> 298 K: Cp_model 29.908 vs Cp from the
    //      published enthalpy 32.309 J/mol/K, 8.03 % apart, Q 57 091 kW vs
    //      dH -61 673 kW -- a 4582 kW gap.  FEHE hot side, 843 -> 479 K:
    //      31.336 vs 32.083, 2.39 %, 2872 kW.  The deviation is LARGER in the
    //      cooler though both sit at 200 bar, because the cooler works low
    //      where the gas is dense: the signature of a real-gas departure, not
    //      of arithmetic.
    //
    //  AND A THIRD ONE THE Cp STORY DOES NOT COVER: the outlet below copies
    //  the inlet's `vf` unchanged, so an exchanger may drive a stream ACROSS
    //  its dew point and still label it all-vapour, charging exactly zero
    //  latent heat.  ammonia02's chilledEffluent leaves at 298 K / 200 bar
    //  labelled vf = 1 where its own equilibrium is V/F = 0.9722.  A "real"
    //  Cp would not fix that; only closing on H would.
    //
    //  NOT FIXED HERE, and it is a decision with a large blast radius (every
    //  exchanger golden moves): the honest form is to invert the ENTHALPY --
    //  having Q, solve T_out from H(T_out, P, z) = H(T_in, P, z) -+ Q/n with
    //  the package's own H, a 1-D Newton per side -- which closes by
    //  construction under any equation of state AND across a phase boundary.
    //  Until that is taken, the unit MEASURES its own gap and says so.
    scalar hGapKW = 0.0;      // published as `H_closure_gap_kW`; see below
    scalar Q = 0, Th_out = Th_in, Tc_out = Tc_in;
    scalar NTU = 0, eps = 0, Cr = 0, Ch = 0, Cc = 0;
    scalar Tm0 = s0.T, Tm1 = s1.T;
    for (int pass = 0; pass < 2; ++pass)
    {
        const scalar Cp0 = streamCp(s0, Tm0), Cp1 = streamCp(s1, Tm1);
        if (Cp0 <= 0.0 || Cp1 <= 0.0)
            throw std::runtime_error("HeatExchanger: a stream has no usable Cp"
                " (no liquid/ideal-gas heat-capacity data for its phase).");
        const scalar C0 = s0.F * 1000.0 * Cp0;     // F kmol/s -> mol/s = *1000
        const scalar C1 = s1.F * 1000.0 * Cp1;
        Ch = zeroHot ? C0 : C1;
        Cc = zeroHot ? C1 : C0;
        const scalar Cmin = std::min(Ch, Cc), Cmax = std::max(Ch, Cc);
        Cr  = Cmin / Cmax;
        NTU = U * A / Cmin;
        //  1 shell / 2N tube passes, counter- or co-current: the ONE home of
        //  the relation (`htc/ShellTubeDesign`), shared with the design
        //  search above and with the sizing pass.  A multi-pass exchanger's
        //  eps is lower than pure counter-current -- one tube pass runs
        //  co-current (the built-in LMTD F-correction, F<1), which is
        //  exactly why it needs more area for the same duty.
        eps = shellTubeDesign::effectiveness(NTU, Cr, tubePasses, counter);
        Q      = eps * Cmin * (Th_in - Tc_in);
        Th_out = Th_in - Q / Ch;
        Tc_out = Tc_in + Q / Cc;
        Tm0 = 0.5 * (s0.T + (zeroHot ? Th_out : Tc_out));   // mean T for next pass
        Tm1 = 0.5 * (s1.T + (zeroHot ? Tc_out : Th_out));
    }

    //  ---- THE OUTLET STATE IS INVERTED FROM THE ENTHALPY ----------------
    //
    //  The eps-NTU above decides Q -- that is the TRANSFER model and it stays.
    //  What must NOT be taken from it is the outlet TEMPERATURE.  `T = T_in -+
    //  Q/C` is exact only if C is the derivative of the enthalpy the rest of
    //  Choupo uses, and `streamCp` returns `cpIdealGas` for any vapour: no
    //  pressure, no departure function, no latent term at all.  So the model
    //  conserved Q and not H, and H is what every balance here reads.
    //
    //  Now: having Q, solve the outlet STATE from
    //      H(state_out) = H(state_in) -+ Q/n
    //  with the package's OWN enthalpy -- `flashState::equilibriumAt` resolves
    //  the state at each trial (T, P, z) and `hOfState` prices it, the same
    //  pair `Heater` has used since 2026-08-09 and the same pair the energy
    //  report reads.  Two consequences, and the second is why a "real Cp"
    //  would not have been enough:
    //
    //    * it closes by construction under ANY equation of state -- the SRK
    //      departure is inside H, so it cannot be left out of the balance;
    //    * it crosses a PHASE BOUNDARY correctly.  The outlet used to copy the
    //      inlet's `vf` whatever temperature it reached, so an exchanger could
    //      drive a stream past its dew point and charge zero latent heat --
    //      ammonia02's `chilledEffluent` left at 298 K/200 bar labelled all
    //      vapour where its own equilibrium is V/F = 0.9722, and the separator
    //      downstream then re-equilibrated it and disagreed by 4415.74 kW.
    //      `vf` is a RESULT of this inversion now, read back at the answer.
    //
    //  H(T) is monotone increasing (Cp > 0), so a bracket plus bisection is
    //  unconditionally convergent and needs no derivative across the latent
    //  jump -- the place a Newton on this function is least trustworthy.  The
    //  eps-NTU temperature is the initial guess, which is a good one.
    std::string resolveRefusal;
    auto Hmol = [&](const Stream& s, scalar T, scalar* vfOut) -> scalar
    {
      //  THE WHOLE READING, not only its fall-back, is guarded: `hOfState`
      //  reaches the formation datum too, so a package that lacks one threw
      //  from INSIDE the resolved branch and killed a case that used to run.
      try
      {
        auto fs = flashState::equilibriumAt(T, s.P, s.z, false, s.vf, thermo,
                                            "heatExchanger (Q -> outlet state)",
                                            "duty", &resolveRefusal);
        if (fs)
        {
            if (vfOut)
                *vfOut = (fs->V_over_F <= 1.0e-9)       ? 0.0
                       : (fs->V_over_F >= 1.0 - 1.0e-9) ? 1.0
                                                        : fs->V_over_F;
            return flashState::hOfState(*fs, T, s.P, s.z, thermo);
        }
        if (vfOut) *vfOut = s.vf;
        //  A PACKAGE THAT CANNOT PRICE THIS STATE MUST NOT KILL A CASE THAT
        //  USED TO RUN.  The eps-NTU path needed only a heat capacity;
        //  `H_stream_formation` needs the formation datum, and a molten-salt
        //  heat-transfer fluid legitimately has none (`utility02_hitec_csp
        //  _heater` aborted at exit 2 the moment this inversion was
        //  installed).  NaN here means "no enthalpy surface", and `invert`
        //  falls back to the eps-NTU temperature ALOUD -- the old behaviour,
        //  said rather than silently restored.
        return thermo.H_stream_formation(T, s.P, s.vf, s.z);
      }
      catch (const std::exception&)
      {
        if (vfOut) *vfOut = s.vf;
        return std::numeric_limits<scalar>::quiet_NaN();
      }
    };

    //  The enthalpy of an INLET at its own state.  A pure two-phase inlet's
    //  declared quality IS its state (see `Stream::qPinned`): priced on the
    //  same blend the energy report prices it with, never re-resolved.
    auto Hinlet = [&](const Stream& s) -> scalar
    {
        if (s.qPinned > 0.0)
        {
            try { return thermo.H_stream_formation(s.T, s.P, s.qPinned, s.z); }
            catch (const std::exception&)
            { return std::numeric_limits<scalar>::quiet_NaN(); }
        }
        return Hmol(s, s.T, nullptr);
    };

    //  Returns the outlet T for a side that must absorb `dH_per_mol`, and
    //  writes back the resolved vapour fraction.  Falls back to the eps-NTU
    //  temperature -- ANNOUNCED, never silently -- if the package cannot be
    //  bracketed, so a world this inversion cannot serve degrades to exactly
    //  the previous behaviour instead of refusing a case that used to run.
    //
    //  `pinnedOut`: set when the answer is a PURE stream on its saturation
    //  plateau (C36 item 3, 2026-10-05).  For one component H(T) JUMPS by the
    //  whole latent heat at Tsat(P), so a target inside the jump has no root
    //  in T: the bisection closes onto Tsat with its two bracket ends a latent
    //  heat apart, and used to publish the nearer single phase -- short of
    //  the duty by the unboiled (or uncondensed) fraction's latent heat, at
    //  exit 0 (`utility02_hitec_csp_heater` at 40 bar: 3.06 kW, 1.5 %).  The
    //  state there is T = Tsat and q = (H - h_L)/(h_V - h_L), and (T, P) do
    //  not fix q, so the outlet carries it as a PIN (CLAUDE.md §3, the
    //  pure-component exception) -- one home for the arithmetic,
    //  `flash/PureSaturationPlateau.H`.
    auto invert = [&](const Stream& s, scalar dH_per_mol, scalar Tguess,
                      scalar& vfOut, bool& pinnedOut) -> scalar
    {
        pinnedOut = false;
        const scalar Hin = Hinlet(s);
        if (!std::isfinite(Hin))
        {
            if (announceOnce("hxNoDatum:" + s.name))
                std::cerr << "[hx] " << s.name << ": this package cannot price"
                             " the stream on the elements datum (a component"
                             " has no standardThermochemistry block), so the"
                             " outlet temperature comes from the eps-NTU heat"
                             " capacity as before.  This side closes in Q, not"
                             " in H.\n";
            Hmol(s, Tguess, &vfOut);
            return Tguess;
        }
        const scalar Htarget = Hin + dH_per_mol;
        auto f = [&](scalar T) { return Hmol(s, T, nullptr) - Htarget; };

        scalar lo = Tguess, hi = Tguess, flo = f(lo), fhi = flo;
        const scalar span = std::max<scalar>(1.0, 0.05 * std::abs(Tguess - s.T));
        for (int k = 0; k < 60 && flo * fhi > 0.0; ++k)
        {
            lo = std::max<scalar>(50.0, lo - span * (1 << std::min(k, 12)));
            hi = hi + span * (1 << std::min(k, 12));
            flo = f(lo); fhi = f(hi);
        }
        if (!(flo * fhi <= 0.0) || !std::isfinite(flo) || !std::isfinite(fhi))
        {
            if (announceOnce("hxInvert:" + s.name))
                std::cerr << "[hx] " << s.name << ": could not bracket the"
                             " outlet enthalpy; falling back to the eps-NTU"
                             " temperature (" << Tguess << " K).  This side's"
                             " energy balance closes in Q, not in H.\n";
            Hmol(s, Tguess, &vfOut);
            return Tguess;
        }
        const flashState::BracketedRoot root =
            flashState::bisectIncreasing(f, lo, flo, hi, fhi);
        const scalar Tans = root.T;
        if (const auto q = flashState::qualityAtJump(root, Htarget, s.P, s.z,
                                                     thermo))
        {
            vfOut     = *q;          // the state ON the plateau, pinned
            pinnedOut = true;
            return Tans;
        }
        Hmol(s, Tans, &vfOut);      // the vf AT the answer, never at a trial
        return Tans;
    };

    //  The enthalpy of an OUTLET as published: a pinned plateau state is
    //  priced at its pin, anything else through the same resolution the
    //  inversion used.
    auto Houtlet = [&](const Stream& s, scalar T, bool pinned,
                       scalar q) -> scalar
    {
        if (pinned) return thermo.H_stream_formation(T, s.P, q, s.z);
        return Hmol(s, T, nullptr);
    };

    scalar vfHotOut = 0.0, vfColdOut = 0.0;
    bool   pinHotOut = false, pinColdOut = false;
    const Stream& sHot  = zeroHot ? s0 : s1;
    const Stream& sCold = zeroHot ? s1 : s0;
    //  Q [W] over n [mol/s]; F is kmol/s.
    Th_out = invert(sHot,  -Q / (sHot.F  * 1000.0), Th_out, vfHotOut,  pinHotOut);
    Tc_out = invert(sCold, +Q / (sCold.F * 1000.0), Tc_out, vfColdOut, pinColdOut);

    // Map back to the input streams (outlet order matches input order).
    const scalar T0_out = zeroHot ? Th_out : Tc_out;
    const scalar T1_out = zeroHot ? Tc_out : Th_out;
    const scalar vf0_out = zeroHot ? vfHotOut : vfColdOut;
    const scalar vf1_out = zeroHot ? vfColdOut : vfHotOut;
    const bool   pin0_out = zeroHot ? pinHotOut : pinColdOut;
    const bool   pin1_out = zeroHot ? pinColdOut : pinHotOut;

    // ---- LMTD (a posteriori, for verification / sizing) ----------------
    const scalar dT1 = counter ? (Th_in - Tc_out) : (Th_in - Tc_in);
    const scalar dT2 = counter ? (Th_out - Tc_in) : (Th_out - Tc_out);
    scalar LMTD;
    if (std::abs(dT1 - dT2) < 1.0e-9) LMTD = dT1;
    else if (dT1 > 0.0 && dT2 > 0.0)  LMTD = (dT1 - dT2) / std::log(dT1 / dT2);
    else                              LMTD = 0.0;

    // ---- Outlet streams: F, z, P unchanged; T AND vf are the answer ----
    produced_.clear();
    ProcessStream o0; o0.name = "hotOut";
    o0.F = s0.F; o0.T = T0_out; o0.P = s0.P; o0.z = s0.z; o0.vf = vf0_out;
    o0.phasePinned = pin0_out;      // a pure stream ON its plateau (above)
    ProcessStream o1; o1.name = "coldOut";
    o1.F = s1.F; o1.T = T1_out; o1.P = s1.P; o1.z = s1.z; o1.vf = vf1_out;
    o1.phasePinned = pin1_out;
    // Name them by their real role for the report/streams panel.
    o0.name = zeroHot ? "hotOut" : "coldOut";
    o1.name = zeroHot ? "coldOut" : "hotOut";
    produced_.push_back(o0);
    produced_.push_back(o1);

    //  ---- THE GAP THIS MODEL LEAVES, MEASURED AND ANNOUNCED -------------
    //  The unit owes the statement, not the report: it holds both numbers.
    //  `H_stream_formation` is the SAME entry the stream stamping and the
    //  energy balance read, so this is the package's own H, not a third
    //  convention.  Announced once per unit per run, never fatal -- eps-NTU
    //  with an ideal-gas Cp is a legitimate teaching model, and I4 makes the
    //  approximation the student's to own.  Silence would make it mine.
    try
    {
        //  THROUGH THE SAME DOOR THE INVERSION USED.  This measured the
        //  outlet with the INLET's `vf` for one commit, which made it read
        //  20 759 kW on a side that closes to 1e-6 -- the outlet's phase is a
        //  RESULT now, and a gap measured against the wrong phase is exactly
        //  the latent heat this slice exists to stop dropping.
        //  And through the same PIN: a plateau outlet re-resolved here would
        //  read one side of the curve and report the latent heat this unit
        //  just priced as its own gap.
        const scalar dHhot  = s0.F * (Houtlet(s0, T0_out, pin0_out, vf0_out)
                                    - Hinlet(s0));
        const scalar dHcold = s1.F * (Houtlet(s1, T1_out, pin1_out, vf1_out)
                                    - Hinlet(s1));
        const scalar gap    = dHhot + dHcold;              // kW; zero if H closes
        const scalar Q_kW   = Q / 1000.0;
        //  PUBLISHED whatever its size, so a reader can see a ZERO as a fact
        //  rather than as an absence, and so the converged value is machine
        //  readable: KPIs are overwritten every recycle pass, so what the
        //  result carries is the answer, never an iterate.
        hGapKW = gap;
        //  Relative to the duty the model transferred: a 1 kW gap on a 1 kW
        //  exchanger matters and on a 100 MW one does not.
        if (std::abs(Q_kW) > 1.0e-9
            && std::abs(gap) > 0.005 * std::abs(Q_kW)
            && std::abs(gap) > 1.0)
        {
            std::ostringstream m;
            m << "closes in Q but not in H: the eps-NTU split transferred "
              << Q_kW << " kW by construction, while the enthalpy the package"
                 " prices for the two outlet temperatures it wrote differs by "
              << gap << " kW (" << (100.0 * gap / Q_kW) << " % of the duty)."
                 "  The duty was formed from a heat capacity (ideal-gas above"
                 " vf = 0.5, liquid below) that is not the derivative of the"
                 " enthalpy the balances then use -- a real-gas departure at"
                 " pressure, a phase change this model cannot carry, or both."
                 "  Every balance in Choupo reads H, so this gap IS the"
                 " unit's contribution to the first-law residual";
            //  ONCE PER EXCHANGER, not once per distinct message: under a
            //  recycle the numbers drift a little each pass, so a message
            //  latch prints the iterate history (six lines on ammonia02).
            //  What this costs, said rather than implied: the line quotes
            //  the FIRST pass that exceeded the band, not the converged one.
            //  The KPI `H_closure_gap_kW` beside it IS the converged value --
            //  read it, not the sentence, when the case has a recycle.
            //  The key is held by the LOG (`addAnnouncedOnce`,
            //  core/Advisory.H): the entry is recorded once per simulator
            //  pass, so an outer driver's last pass carries its own, and the
            //  console line is still printed once per process.
            if (AdvisoryLog::instance().addAnnouncedOnce(
                    "hxHgap:" + s0.name + "+" + s1.name,
                    "balance", "warning",
                    "heatExchanger on ('" + s0.name + "' + '" + s1.name + "')",
                    m.str()))
                std::cerr << "[hx] (" << s0.name << " + " << s1.name
                          << ") " << m.str() << ".\n";
        }
    }
    catch (const std::exception&)
    {
        //  A package that cannot price these states declines, exactly as the
        //  report's own checks do.  Never a crash, never a silent number.
    }

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["area"]          = A;
    kpis_["U"]             = U;
    kpis_["UA"]            = U * A;
    kpis_["Q"]             = Q;                 // W (SI)
    kpis_["Q_kW"]          = Q / 1000.0;
    kpis_["LMTD"]          = LMTD;
    kpis_["NTU"]           = NTU;
    kpis_["effectiveness"] = eps;
    kpis_["C_r"]           = Cr;
    kpis_["T_hot_in"]      = Th_in;
    kpis_["T_hot_out"]     = Th_out;
    kpis_["T_cold_in"]     = Tc_in;
    kpis_["T_cold_out"]    = Tc_out;
    kpis_["C_hot"]         = Ch;
    //  What this model does NOT conserve.  Q is closed by construction; this
    //  is the enthalpy the package prices for the outlet temperatures the
    //  eps-NTU wrote, minus the enthalpy of the inlets -- the unit's own
    //  contribution to the first-law residual, in the same units as the duty.
    kpis_["H_closure_gap_kW"] = hGapKW;
    kpis_["C_cold"]        = Cc;
    // Geometry-mode KPIs (Re/Pr/Nu/h per side, the resistance split, the
    // controlling-resistance code).  Empty in the epsNTU default path, so the
    // U-spec KPI set is unchanged (heatExchanger01 byte-stable).
    for (const auto& kv : geomKpis) kpis_[kv.first] = kv.second;

    // ---- Profile: T_hot and T_cold along the area ----------------------
    //  Integrate the two stream balances along the area (RK4).  Counter-
    //  current: known T_hot,in and (from eps-NTU) T_cold,out at the same
    //  end, so it integrates as an initial-value problem.  Shows the two
    //  temperature curves approaching --- the pinch.
    const int    M  = 21;
    const scalar dx = 1.0 / (M - 1);
    auto dGas = [&](scalar Th, scalar Tc, scalar& dTh, scalar& dTc)
    {
        const scalar q = U * A * (Th - Tc);    // local W per unit-x slope
        dTh = -q / Ch;                         // hot cools along +x
        dTc = counter ? (-q / Cc) : (+q / Cc); // counter: cold also "down"
    };
    UnitProfile prof;
    prof.xAxis = "position";
    std::vector<scalar> xs(M), Thp(M), Tcp(M);
    scalar Th = Th_in, Tc = (counter ? Tc_out : Tc_in);
    for (int k = 0; k < M; ++k)
    {
        xs[k] = k * dx; Thp[k] = Th; Tcp[k] = Tc;
        scalar k1h, k1c, k2h, k2c, k3h, k3c, k4h, k4c;
        dGas(Th, Tc, k1h, k1c);
        dGas(Th + 0.5*dx*k1h, Tc + 0.5*dx*k1c, k2h, k2c);
        dGas(Th + 0.5*dx*k2h, Tc + 0.5*dx*k2c, k3h, k3c);
        dGas(Th + dx*k3h,     Tc + dx*k3c,     k4h, k4c);
        Th += (dx/6.0)*(k1h + 2*k2h + 2*k3h + k4h);
        Tc += (dx/6.0)*(k1c + 2*k2c + 2*k3c + k4c);
    }
    prof.columns["position"] = xs;
    prof.columns["T_hot"]    = Thp;
    prof.columns["T_cold"]   = Tcp;
    profile_ = prof;

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=====================  Heat Exchanger (eps-NTU)  =================\n"
                  << "  Hardware:  area = " << std::fixed << std::setprecision(2) << A
                  << " m^2,  U = " << std::setprecision(1) << U << " W/(m^2.K),  "
                  << (counter ? "counter-current" : "co-current") << "\n"
                  << "  Hot: " << std::setprecision(2) << Th_in << " -> " << Th_out
                  << " K   (C = " << std::setprecision(1) << Ch << " W/K)\n"
                  << "  Cold : " << std::setprecision(2) << Tc_in << " -> " << Tc_out
                  << " K   (C = " << std::setprecision(1) << Cc << " W/K)\n"
                  << "  NTU = " << std::setprecision(3) << NTU
                  << ",  C_r = " << Cr << ",  effectiveness = " << eps << "\n"
                  << "  Q = " << std::setprecision(2) << (Q/1000.0) << " kW,  LMTD = "
                  << LMTD << " K   (check: U.A.LMTD = " << (U*A*LMTD/1000.0) << " kW)\n";
        //  The outlet STATE is the enthalpy inversion's, not the eps-NTU's: a
        //  pure stream whose target lies inside its latent jump leaves AT
        //  Tsat with a pinned quality, and says so here.
        for (const auto* side : { &o0, &o1 })
            if (side->phasePinned)
                std::cout << "  " << side->name << ": PURE fluid on its"
                             " saturation plateau -- T = Tsat(P) = "
                          << std::setprecision(4) << side->T << " K, vf = "
                          << std::setprecision(6) << side->vf
                          << " (pinned: (T, P) do not fix the split of one"
                             " component)\n";
        std::cout
                  << "  Assumptions: the DUTY comes from a sensible eps-NTU (no"
                     " phase change in the transfer model), no losses; the"
                     " outlet states are inverted from the enthalpy.\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
