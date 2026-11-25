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
    _columnDiagnosisProbe  (a curation probe, not a shipped binary)

    Drives columnDiagnosis::diagnose on SYNTHETIC systems whose cause is known
    by construction, so each of (A)-(D) and "could not tell" is held without a
    column that happens to fail the right way.  Compiled by
    bin/curate/check_column_diagnosis.py against ColumnDiagnosis.cpp alone.
    Prints `key value` lines.
\*---------------------------------------------------------------------------*/

#include "unitOperations/distillation/ColumnDiagnosis.H"

#include <cmath>
#include <iostream>
#include <limits>

using namespace Choupo;
using namespace Choupo::columnDiagnosis;

namespace {

Layout twoStage()
{
    Layout L;
    L.kind = Layout::Kind::simultaneous;
    L.N = 2; L.n = 2; L.block = 2;
    L.comp = {"benzene", "toluene"};
    L.feedStage = 0;
    return L;
}

Facts baseFacts()
{
    Facts f;
    f.unit = "probe";  f.model = "simultaneous";
    f.totalFeed = 1.0;  f.distillate = 0.5;  f.reflux = 2.0;
    f.feedComponent = {0.5, 0.5};
    f.iterations = 40;  f.residual = 1.0e-3;
    return f;
}

void show(const char* key, const Verdict& v)
{
    std::cout << key << "Letter " << letter(v.cause) << "\n";
    std::cout << key << "Text ";
    std::string t = render(v, "probe");
    for (char& c : t) if (c == '\n') c = '|';
    std::cout << t << "\n";
}

} // namespace

int main()
{
    const Layout L = twoStage();
    const sVector x0 = {0.4, 350.0, 0.6, 360.0};
    //  a well-posed linear residual: F = (x - 1) scaled, its Jacobian the identity
    const ResidualFn wellPosed = [](const sVector& x) {
        sVector g(x.size());
        for (std::size_t i = 0; i < x.size(); ++i) g[i] = x[i] - 1.0;
        return g;
    };

    //  (A) the rates leave no bottoms
    { Facts f = baseFacts(); f.distillate = 1.2; show("A1", diagnose(f, L, wellPosed, x0)); }
    //  (A) the best iterate asks the bottoms for more toluene than is fed
    {
        Facts f = baseFacts();
        sVector x = {0.1, 350.0, 0.05, 360.0};          // reboiler: x_benzene 0.05 -> toluene 0.95
        f.distillate = 0.1;                              // B = 0.9: 0.855 toluene vs 0.5 fed
        show("A2", diagnose(f, L, wellPosed, x));
    }
    //  (B) the stage pricing refused a trial
    {
        Facts f = baseFacts();
        f.trialRefusal = "toluene: no liquid enthalpy datum at T = 75 K";
        show("B1", diagnose(f, L, wellPosed, x0));
    }
    //  extrapolation notices alone are NOT a cause
    {
        Facts f = baseFacts();
        f.advisories = {{"thermo", "component 'benzene': vapour pressure evaluated at T = 365 K, OUTSIDE its declared Trange (287 354) -- extrapolated"}};
        show("B2", diagnose(f, L, wellPosed, x0));
    }
    //  (C) two identical stage equations: a singular Jacobian
    {
        const ResidualFn singular = [](const sVector& x) {
            sVector g(4);
            g[0] = x[0] + 0.5 * x[1] / 350.0;
            g[1] = x[0] + 0.5 * x[1] / 350.0;          // the same equation again
            g[2] = x[2] - 0.6;
            g[3] = x[3] - 360.0;
            return g;
        };
        show("C1", diagnose(baseFacts(), L, singular, x0));
    }
    //  (C) two stage equations that differ by 1e-13: ill-conditioned, not singular,
    //  with a component all but absent from the top stage
    {
        const ResidualFn nearly = [](const sVector& x) {
            sVector g(4);
            g[0] = x[0] + 0.5 * x[1] / 350.0;
            g[1] = x[0] + 0.5 * x[1] / 350.0 + 1.0e-13 * x[1] / 350.0;
            g[2] = x[2] - 0.6;
            g[3] = x[3] - 360.0;
            return g;
        };
        const sVector xt = {1.0e-9, 350.0, 0.6, 360.0};
        show("C2", diagnose(baseFacts(), L, nearly, xt));
    }
    //  (D) a residual that is not a number
    {
        const ResidualFn nan = [](const sVector& x) {
            sVector g(x.size());
            for (std::size_t i = 0; i < x.size(); ++i) g[i] = x[i] - 1.0;
            g[1] = std::numeric_limits<double>::quiet_NaN();
            return g;
        };
        show("D1", diagnose(baseFacts(), L, nan, x0));
    }
    //  (D) an equation that contains no unknown
    {
        const ResidualFn empty = [](const sVector& x) {
            sVector g(x.size());
            for (std::size_t i = 0; i < x.size(); ++i) g[i] = x[i] - 1.0;
            g[3] = 0.25;                                  // a constant row
            return g;
        };
        show("D2", diagnose(baseFacts(), L, empty, x0));
    }
    //  could not tell: well conditioned, specification fine, nothing refused
    show("U1", diagnose(baseFacts(), L, wellPosed, x0));

    //  names are words, never rows
    {
        Layout F;
        F.kind = Layout::Kind::fullMESH;  F.N = 5;  F.n = 3;  F.block = 5;  F.feedStage = 2;
        F.comp = {"methanol", "dimethylEther", "water"};
        std::cout << "nameEq " << equationName(F, 2 * 5 + 4) << "\n";
        std::cout << "nameEq " << equationName(F, 0 * 5 + 3) << "\n";
        std::cout << "nameUnk " << unknownName(F, 4 * 5 + 2) << "\n";
        std::cout << "nameUnk " << unknownName(F, 1 * 5 + 1) << "\n";
    }
    std::cout << "probeDone 1\n";
    return 0;
}
