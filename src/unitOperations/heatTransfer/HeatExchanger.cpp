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
#include "materials/MaterialRegistry.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

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

    struct Stream { sVector z; scalar F = 0, T = 0, P = 0, vf = 0; };
    auto readStream = [&](const DictPtr& sd) -> Stream
    {
        Stream s;
        s.F  = sd->lookupScalar("F", Dims::molarFlow);
        s.T  = sd->lookupScalar("T", Dims::temperature);
        s.P  = sd->lookupScalar("P", Dims::pressure);
        s.vf = sd->lookupScalarOrDefault("vf", 0.0);
        s.z.assign(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar sum = 0.0;
        for (const auto& k : cd->keys()) s.z[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : s.z) sum += v;
        if (sum > 0.0) for (auto& v : s.z) v /= sum;
        return s;
    };
    Stream s0 = readStream(ins[0]);
    Stream s1 = readStream(ins[1]);

    // ---- Operation: HARDWARE = area + U (+ optional flow arrangement) ---
    auto oper = dict->subDict("operation");
    const std::string flow = oper->lookupWordOrDefault("flow", "counter");
    const bool counter = (flow != "co" && flow != "cocurrent" && flow != "parallel");

    // ---- Per-stream Cp (sensible; liquid or gas by vapour fraction) -----
    auto streamCp = [&](const Stream& s, scalar Teval) -> scalar
    {
        scalar cp = 0.0;
        if (s.vf < 0.5)                        // liquid
        {
            for (std::size_t i = 0; i < n; ++i)
                if (thermo.comp(i).hasCpLiquid())
                    cp += s.z[i] * thermo.comp(i).cpLiquid().Cp(Teval);
        }
        else                                   // gas
        {
            for (std::size_t i = 0; i < n; ++i)
                if (thermo.comp(i).hasCpIdealGas())
                    cp += s.z[i] * thermo.comp(i).cpIdealGas().Cp(Teval);
        }
        return cp;
    };

    // ---- HARDWARE: U and area --------------------------------------------
    // Default `model epsNTU;` (the U+area spec, BYTE-STABLE): both are read
    // directly.  `model geometry;` instead COMPUTES U and area from the tube
    // bundle geometry + per-side convective correlations (slot between the
    // read and the unchanged eps-NTU loop below).
    const std::string model = dict->lookupWordOrDefault("model", "epsNTU");
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
        // Kern equivalent diameter D_e = C/d_o (p^2 - c*d_o^2):
        //   square:     C = 1.27, c = 0.785 (= pi/4)
        //   triangular: C = 1.10, c = 0.917
        const scalar deC = tri ? 1.10  : 1.27;
        const scalar deK = tri ? 0.917 : 0.785;
        const scalar D_e = deC / tubeOD * (pitch * pitch - deK * tubeOD * tubeOD);
        // Sinnott bundle-diameter constants K1, n1 per (pattern, passes):
        //   D_b = d_o (N / K1)^(1/n1).
        auto bundleK1n1 = [&](int np) -> std::pair<scalar,scalar>
        {
            if (tri) switch (np) {
                case 1:  return {0.319, 2.142};
                case 2:  return {0.249, 2.207};
                case 4:  return {0.175, 2.285};
                case 6:  return {0.0743, 2.499};
                default: return {0.0365, 2.675};   // 8
            } else switch (np) {
                case 1:  return {0.215, 2.207};
                case 2:  return {0.156, 2.291};
                case 4:  return {0.158, 2.263};
                case 6:  return {0.0402, 2.617};
                default: return {0.0331, 2.643};    // 8
            }
        };
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
                    " data/standards/materials/" + mat + ".dat or give `wallK`.");
        }
        else throw std::runtime_error("HeatExchanger(geometry): give `wallK`"
            " or `wallMaterial <name>;` in the geometry block");
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
        //  DESIGN MODE (Aspen-EDR "Sizing" equivalent): the DUTY is given,
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

            // shell ID implied by N tubes (Kern/Sinnott bundle correlation,
            // triangular pitch, 1 pass: D_b = d_o (N/K1)^(1/n1) + clearance).
            // NB: plain scalars, not a structured binding -- C++17 forbids a
            // lambda capturing structured-binding names (clang enforces it).
            const auto k1n1 = bundleK1n1(passes);
            const scalar K1 = k1n1.first, n1 = k1n1.second;
            auto shellFromN = [&](int N) -> scalar
            {
                const scalar clear = 0.012;   // bundle-to-shell clearance [m]
                return tubeOD * std::pow(N / K1, 1.0 / n1) + clear;
            };
            // COMPACT trial: the DELIVERED DUTY for a trial (N, Ds) via the SAME
            // eps-NTU (incl. the 1-2 penalty for multi-pass) used downstream --
            // so the design targets the DUTY (hence the outlet T), not merely
            // U*A.  This is what makes the sized exchanger actually reach the
            // spec temperature even when a 1-shell/2-tube-pass F-correction (F<1)
            // means U*A = Q/LMTD would UNDER-size it.
            const scalar rho_t = streamRho(tubeS), mu_t = streamMu(tubeS),
                         lam_t = streamLambda(tubeS), cp_t = streamMassCp(tubeS, tubeS.T);
            const scalar mdot_t = streamMdot(tubeS);
            const scalar rho_s = streamRho(shellS), mu_s = streamMu(shellS),
                         lam_s = streamLambda(shellS), cp_s = streamMassCp(shellS, shellS.T);
            const scalar mdot_s = streamMdot(shellS);
            const scalar r_i = 0.5 * tubeID, r_o = 0.5 * tubeOD;
            const scalar Cprime = pitch - tubeOD;
            const scalar Cmin = std::min(Ch, Cc), Cmax = std::max(Ch, Cc);
            const scalar CrD = Cmin / Cmax, dTin = Th_in - Tc_in;
            auto trialDuty = [&](int N) -> scalar
            {
                const scalar Ds = shellFromN(N);
                const scalar A_tf = M_PI * 0.25 * tubeID * tubeID
                                  * (N / std::max(passes, 1));
                const scalar u_t = mdot_t / (rho_t * A_tf);
                HeatTransferContext ct; ct.u = u_t; ct.d_h = tubeID;
                ct.lambda = lam_t; ct.mu = mu_t; ct.rho = rho_t; ct.cp = cp_t;
                ct.heating = (tubeS.T < shellS.T);
                const scalar h_i = tubeCorr->evaluate(ct).h;
                const scalar A_s = Ds * Cprime * baffle / pitch;
                const scalar G_s = mdot_s / A_s;
                HeatTransferContext cs; cs.u = G_s / rho_s; cs.d_h = D_e;
                cs.lambda = lam_s; cs.mu = mu_s; cs.rho = rho_s; cs.cp = cp_s;
                cs.heating = (shellS.T < tubeS.T);
                const scalar h_o = shellCorr->evaluate(cs).h;
                const scalar Uv = 1.0 / (r_o / (r_i * h_i)
                                + r_o * std::log(r_o / r_i) / wallK + 1.0 / h_o);
                const scalar NTUv = Uv * (M_PI * tubeOD * tubeL * N) / Cmin;
                scalar epsv;
                if (passes >= 2)
                {
                    const scalar root = std::sqrt(1.0 + CrD * CrD);
                    const scalar E = std::exp(-NTUv * root);
                    epsv = 2.0 / ((1.0 + CrD) + root * (1.0 + E) / (1.0 - E));
                }
                else if (counter)
                {
                    if (std::abs(1.0 - CrD) < 1.0e-9) epsv = NTUv / (1.0 + NTUv);
                    else { const scalar e = std::exp(-NTUv * (1.0 - CrD));
                           epsv = (1.0 - e) / (1.0 - CrD * e); }
                }
                else epsv = (1.0 - std::exp(-NTUv * (1.0 + CrD))) / (1.0 + CrD);
                return epsv * Cmin * dTin;                 // delivered duty [W]
            };
            (void) UA_req;   // kept for the announce; sizing now targets the duty
            // delivered duty grows monotonically with N -> bisect on N for Qreq.
            int Nlo = 1, Nhi = 4;
            while (trialDuty(Nhi) < Qreq && Nhi < 100000) Nhi *= 2;
            while (Nhi - Nlo > 1)
            {
                const int Nm = (Nlo + Nhi) / 2;
                if (trialDuty(Nm) < Qreq) Nlo = Nm; else Nhi = Nm;
            }
            nTubes  = Nhi;                       // round UP: never undersize
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

        // --- TUBE side hydraulics -----------------------------------------
        const scalar rho_t = streamRho(tubeS), mu_t = streamMu(tubeS),
                     lam_t = streamLambda(tubeS), cp_t = streamMassCp(tubeS, tubeS.T);
        const scalar mdot_t = streamMdot(tubeS);   // kg/s
        const scalar A_tube_flow = M_PI * 0.25 * tubeID * tubeID
                                 * (nTubes / std::max(passes, 1)); // tubes per pass
        const scalar u_t = mdot_t / (rho_t * A_tube_flow);
        HeatTransferContext ctx_t;
        ctx_t.u = u_t; ctx_t.d_h = tubeID; ctx_t.lambda = lam_t;
        ctx_t.mu = mu_t; ctx_t.rho = rho_t; ctx_t.cp = cp_t;
        ctx_t.heating = (tubeS.T < shellS.T);
        const HeatTransferResult rt = tubeCorr->evaluate(ctx_t);
        const scalar h_i = rt.h;

        // --- SHELL side hydraulics (Kern method) --------------------------
        // (D_e computed above, per tube pattern.)
        // Crossflow area at the shell centreline: A_s = D_s * C' * B / p,
        // with the clearance C' = p - d_o.
        const scalar Cprime = pitch - tubeOD;
        const scalar A_s = shellID * Cprime * baffle / pitch;
        const scalar mdot_s = streamMdot(shellS);  // kg/s
        const scalar rho_s = streamRho(shellS), mu_s = streamMu(shellS),
                     lam_s = streamLambda(shellS), cp_s = streamMassCp(shellS, shellS.T);
        const scalar G_s = mdot_s / A_s;                  // crossflow mass flux
        const scalar u_s = G_s / rho_s;                   // shell crossflow velocity
        HeatTransferContext ctx_s;
        ctx_s.u = u_s; ctx_s.d_h = D_e; ctx_s.lambda = lam_s;
        ctx_s.mu = mu_s; ctx_s.rho = rho_s; ctx_s.cp = cp_s;
        ctx_s.heating = (shellS.T < tubeS.T);
        const HeatTransferResult rs = shellCorr->evaluate(ctx_s);
        const scalar h_o = rs.h;

        // --- Overall U on the OUTSIDE area, with the cylindrical wall -----
        //   1/U_o = 1/h_o + r_o ln(r_o/r_i)/k_wall + r_o/(r_i h_i)
        const scalar r_i = 0.5 * tubeID, r_o = 0.5 * tubeOD;
        const scalar R_inner = r_o / (r_i * h_i);
        const scalar R_wall  = r_o * std::log(r_o / r_i) / wallK;
        const scalar R_outer = 1.0 / h_o;
        const scalar Rsum    = R_inner + R_wall + R_outer;
        U = 1.0 / Rsum;
        // Total outside heat-transfer area.
        A = M_PI * tubeOD * tubeL * nTubes;

        // controlling resistance (largest of the three).
        if (R_inner >= R_wall && R_inner >= R_outer) controllingResistance = "tube-side";
        else if (R_outer >= R_wall)                  controllingResistance = "shell-side";
        else                                         controllingResistance = "wall";

        // --- PRESSURE DROP (Kern, both sides) -----------------------------
        // Tube side: friction over all passes + the turnaround (return) losses.
        //   f_t (Fanning) = 0.079 Re^-0.25 (turbulent smooth, Blasius-type,
        //   valid Re 4e3-1e5); dP = (4 f L n_p / d_i + 4 n_p)(rho u^2 / 2),
        //   the 4 velocity-heads-per-pass being Kern's return-loss allowance.
        const scalar f_tube = (rt.Re > 0.0) ? 0.079 * std::pow(rt.Re, -0.25) : 0.0;
        const scalar velHead_t = 0.5 * rho_t * u_t * u_t;
        const scalar dP_tube = (4.0 * f_tube * tubeL * passes / tubeID
                              + 4.0 * passes) * velHead_t;              // Pa
        // Shell side (Kern): f_s = exp(0.576 - 0.19 ln Re_s), 400<Re<1e6;
        //   dP = f_s G_s^2 D_s (N_b+1) / (2 rho D_e), viscosity correction
        //   (mu/mu_w)^0.14 = 1 (isothermal-wall v1, consistent with h_o).
        const int    nBaffles = std::max(0,
            static_cast<int>(std::round(tubeL / baffle)) - 1);
        const scalar f_shell = (rs.Re > 0.0)
            ? std::exp(0.576 - 0.19 * std::log(rs.Re)) : 0.0;
        const scalar dP_shell = f_shell * G_s * G_s * shellID
                              * (nBaffles + 1) / (2.0 * rho_s * D_e);   // Pa

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
                      << ",  R_outer = " << R_outer << " (m^2.K/W)\n"
                      << "     controlling resistance: " << controllingResistance << "\n";
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
    // Note: Q_hot = Q_cold here by construction (the eps-NTU split), so
    // the unit conserves energy exactly.  A small residual can still show
    // in the energyBalance report, which uses the elements datum (h_ig −
    // ΔHvap): its implicit liquid Cp (Cp_ig − dΔHvap/dT) differs slightly
    // from cpLiquid when a component's two Cp datasets aren't perfectly
    // mutually consistent.  That is a property-data artefact, not a unit
    // imbalance.
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
        if (tubePasses >= 2)
        {
            // 1 shell pass, 2N tube passes (the U-tube / multi-pass TEMA E-shell):
            //   eps = 2 / { (1+Cr) + sqrt(1+Cr^2) (1+E)/(1-E) },  E = exp(-NTU sqrt(1+Cr^2)).
            // Lower than pure counter-current -- one tube pass runs co-current
            // (the built-in LMTD F-correction, F<1), which is exactly why a
            // multi-pass exchanger needs more area for the same duty.
            const scalar root = std::sqrt(1.0 + Cr * Cr);
            const scalar E = std::exp(-NTU * root);
            eps = 2.0 / ((1.0 + Cr) + root * (1.0 + E) / (1.0 - E));
        }
        else if (counter)
        {
            if (std::abs(1.0 - Cr) < 1.0e-9) eps = NTU / (1.0 + NTU);
            else { const scalar e = std::exp(-NTU * (1.0 - Cr)); eps = (1.0 - e) / (1.0 - Cr * e); }
        }
        else eps = (1.0 - std::exp(-NTU * (1.0 + Cr))) / (1.0 + Cr);
        Q      = eps * Cmin * (Th_in - Tc_in);
        Th_out = Th_in - Q / Ch;
        Tc_out = Tc_in + Q / Cc;
        Tm0 = 0.5 * (s0.T + (zeroHot ? Th_out : Tc_out));   // mean T for next pass
        Tm1 = 0.5 * (s1.T + (zeroHot ? Tc_out : Th_out));
    }

    // Map back to the input streams (outlet order matches input order).
    const scalar T0_out = zeroHot ? Th_out : Tc_out;
    const scalar T1_out = zeroHot ? Tc_out : Th_out;

    // ---- LMTD (a posteriori, for verification / sizing) ----------------
    const scalar dT1 = counter ? (Th_in - Tc_out) : (Th_in - Tc_in);
    const scalar dT2 = counter ? (Th_out - Tc_in) : (Th_out - Tc_out);
    scalar LMTD;
    if (std::abs(dT1 - dT2) < 1.0e-9) LMTD = dT1;
    else if (dT1 > 0.0 && dT2 > 0.0)  LMTD = (dT1 - dT2) / std::log(dT1 / dT2);
    else                              LMTD = 0.0;

    // ---- Outlet streams (sensible only: F, z, P unchanged; T updated) --
    produced_.clear();
    ProcessStream o0; o0.name = "hotOut";
    o0.F = s0.F; o0.T = T0_out; o0.P = s0.P; o0.z = s0.z; o0.vf = s0.vf;
    ProcessStream o1; o1.name = "coldOut";
    o1.F = s1.F; o1.T = T1_out; o1.P = s1.P; o1.z = s1.z; o1.vf = s1.vf;
    // Name them by their real role for the report/streams panel.
    o0.name = zeroHot ? "hotOut" : "coldOut";
    o1.name = zeroHot ? "coldOut" : "hotOut";
    produced_.push_back(o0);
    produced_.push_back(o1);

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
                  << LMTD << " K   (check: U.A.LMTD = " << (U*A*LMTD/1000.0) << " kW)\n"
                  << "  Assumptions: sensible heat only, no phase change, no losses.\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
