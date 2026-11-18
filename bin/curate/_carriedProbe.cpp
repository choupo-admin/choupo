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
Description
    _carriedProbe -- a curation probe (not a shipped binary) for the C427
    spike, criterion S2's reactor leg.  Linked against the library.

    A polymer's zeroth and second moments (two carried quantities of kind
    chainMoment) go through the KINDS' OWN laws -- mix of two inlets, divide
    by a splitter fraction -- and then through ONE reactor with a closed-form
    answer.  The reactor is the probe's own (no shipped unit solves a moment
    balance, and the spike builds no polymer kinetics): step-growth coupling
    at a CONSTANT event rate r [kmol/s], mean-field, announced:

        each event joins two chains, so   d mu0/dtau = -r
        and (i+j)^2 - i^2 - j^2 = 2ij, so d mu2/dtau = 2 r (mu1/mu0)^2
        (mu1 = total repeat segments, derived from the segments, constant)

    Plug flow, tau = V/Q:  mu0(tau) = mu0_in - r tau  and
        mu2(tau) = mu2_in + 2 mu1^2 (1/mu0(tau) - 1/mu0_in)       (closed form)
    The probe integrates the two ODEs by RK4 and prints both, with the
    segment-mass closure (mu1 unchanged) and the chain-count balance.
\*---------------------------------------------------------------------------*/

#include "streams/Carried.H"

#include <cmath>
#include <iomanip>
#include <iostream>

using namespace Choupo;

static CarriedQuantity moment(const std::string& name, int order, scalar v)
{
    CarriedQuantity q;
    q.kind = "chainMoment"; q.name = name; q.carrier = "PS"; q.order = order;
    q.values = { v }; q.unit = "kmol/s";
    return q;
}

int main()
{
    CarriedKind::registerBuiltins();
    CarriedMixContext ctx;

    //  Two inlets (the numbers of bin/curate/carried_spike/mixsplit/0/feedA, feedB).
    const std::vector<CarriedQuantity> a = { moment("PS_mu0", 0, 0.002), moment("PS_mu2", 2, 8.5) };
    const std::vector<CarriedQuantity> b = { moment("PS_mu0", 0, 0.005), moment("PS_mu2", 2, 31.0) };
    auto mixed  = mixCarried({ { "feedA", a }, { "feedB", b } }, ctx);
    auto branch = divideCarried(mixed, 0.3);

    const scalar mu0_in = branch[0].values[0];
    const scalar mu2_in = branch[1].values[0];
    //  mu1 of the branch: derived from the segment flows (here a stated 0.35
    //  kmol/s of repeat segments in the mixed stream, split 0.3).
    const scalar mu1 = 0.35 * 0.3;
    const scalar r   = 0.25 * mu0_in;            // 25 % of the chains coupled
    const scalar tau = 1.0;

    //  RK4 on (mu0, mu2)
    scalar m0 = mu0_in, m2 = mu2_in;
    const int N = 2000; const scalar h = tau / N;
    auto f0 = [&](scalar)        { return -r; };
    auto f2 = [&](scalar x0)     { return 2.0 * r * (mu1 / x0) * (mu1 / x0); };
    for (int i = 0; i < N; ++i)
    {
        const scalar k10 = f0(m0), k12 = f2(m0);
        const scalar k20 = f0(m0 + 0.5*h*k10), k22 = f2(m0 + 0.5*h*k10);
        const scalar k30 = f0(m0 + 0.5*h*k20), k32 = f2(m0 + 0.5*h*k20);
        const scalar k40 = f0(m0 + h*k30),     k42 = f2(m0 + h*k30);
        m0 += h * (k10 + 2*k20 + 2*k30 + k40) / 6.0;
        m2 += h * (k12 + 2*k22 + 2*k32 + k42) / 6.0;
    }
    //  THE TRANSFORMATION, through the kind: the reactor solved the balances
    //  with ITS rate (the production term chainMoment allows) and hands the
    //  solved values to the kind, which accepts them.
    auto k = CarriedKind::New("chainMoment");
    const CarriedQuantity q0 = k->transform(branch[0], { m0 }, "probeReactor");
    const CarriedQuantity q2 = k->transform(branch[1], { m2 }, "probeReactor");
    m0 = q0.values[0]; m2 = q2.values[0];
    //  The same reactor handed a MATERIAL: it has no rate for it, so a change
    //  is refused by name; an unchanged value is accepted.
    CarriedQuantity flour;
    flour.kind = "materialMass"; flour.name = "flour"; flour.carrier = "wheatFlour";
    flour.values = { 1.0 };
    int refused = 0; std::string refusal;
    try { CarriedKind::New("materialMass")->transform(flour, { 0.9 }, "probeReactor"); }
    catch (const std::exception& e) { refused = 1; refusal = e.what(); }
    const bool unchangedOk =
        CarriedKind::New("materialMass")->transform(flour, { 1.0 }, "probeReactor").values[0] == 1.0;
    const scalar m0_exact = mu0_in - r * tau;
    const scalar m2_exact = mu2_in + 2.0 * mu1 * mu1 * (1.0 / m0_exact - 1.0 / mu0_in);

    std::cout << std::setprecision(17)
              << "{\n"
              << "  \"mixed_mu0\": "  << mixed[0].values[0] << ",\n"
              << "  \"mixed_mu2\": "  << mixed[1].values[0] << ",\n"
              << "  \"branch_mu0\": " << mu0_in << ",\n"
              << "  \"branch_mu2\": " << mu2_in << ",\n"
              << "  \"mu1\": " << mu1 << ",\n"
              << "  \"r\": " << r << ",\n"
              << "  \"mu0_out_rk4\": " << m0 << ",\n"
              << "  \"mu0_out_closed\": " << m0_exact << ",\n"
              << "  \"mu2_out_rk4\": " << m2 << ",\n"
              << "  \"mu2_out_closed\": " << m2_exact << ",\n"
              << "  \"chains_in\": " << mu0_in << ",\n"
              << "  \"chains_out_plus_events\": " << (m0_exact + r * tau) << ",\n"
              << "  \"mu1_in\": " << mu1 << ",\n"
              << "  \"mu1_out\": " << mu1 << ",\n"
              << "  \"material_change_refused\": " << refused << ",\n"
              << "  \"material_unchanged_accepted\": " << (unchangedOk ? 1 : 0) << ",\n"
              << "  \"material_refusal_names_kind\": "
              << ((refusal.find("materialMass") != std::string::npos
                   && refusal.find("probeReactor") != std::string::npos) ? 1 : 0) << "\n"
              << "}\n";
    return 0;
}
