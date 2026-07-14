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

#include "AqueousActivity.H"

#include "thermo/electrolyte/SolventProperties.H"
#include "thermo/electrolyte/PitzerHMW.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

// ---- the Davies builtin -----------------------------------------------------
// A VERBATIM move of SpeciationSolver::daviesA / daviesGamma behind the
// interface.  The math is byte-identical to the inline version it replaces:
//   A(T)        = 0.51 * SolventProperties::debyeHuckelFactor(T)  (0.51 at 25 C)
//   log10 g_i   = -A z_i^2 ( sqrt(I)/(1+sqrt(I)) - 0.3 I )
//   neutral     => g = 1 (z == 0 or I <= 0; no Setchenow b*I term in v1)
// Trustworthy to I ~ 0.5 mol/kg, indicative beyond (the solver announces it).
namespace {

class DaviesActivity : public AqueousActivity
{
public:
    const std::string& modelName() const override
    {
        static const std::string n = "davies";
        return n;
    }

    ActivityResult evaluate(const IonState& st, double T) const override
    {
        // 0.51 at 25 C, scaled in T by the same eps_w(T)/rho_w(T) factor as the
        // Pitzer/eNRTL kernels (byte-identical at 298.15 K).
        const double A = 0.51 * SolventProperties::debyeHuckelFactor(T);
        const double I = st.I;
        ActivityResult r;
        r.A = A;
        // VERBATIM SpeciationSolver::daviesGamma -- same std::pow(10.0, ...)
        // expression (NOT exp(x*ln10), which can differ in the last ULP and
        // would move a golden); byte-for-byte the value the inline call gave.
        r.gamma = [A, I](double z) -> double
        {
            if (z == 0.0 || I <= 0.0) return 1.0;   // neutral: gamma = 1 (no b*I in v1)
            const double s = std::sqrt(I);
            return std::pow(10.0, -A * z * z * (s / (1.0 + s) - 0.3 * I));
        };
        return r;
    }
};

} // namespace

// ---- factory plumbing (the settled explicit pattern) ------------------------

std::map<std::string, AqueousActivity::Factory>& AqueousActivity::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void AqueousActivity::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::vector<std::string> AqueousActivity::availableTypes()
{
    std::vector<std::string> names;
    for (const auto& [name, f] : registry()) { (void)f; names.push_back(name); }
    return names;
}

std::unique_ptr<AqueousActivity> AqueousActivity::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& [n, f] : registry()) { (void)f; avail += " " + n; }
        if (avail.empty()) avail = " (none registered -- call "
                                   "AqueousActivity::registerBuiltins() first)";
        throw std::runtime_error("AqueousActivity::New: unknown aqueous activity "
            "model '" + name + "'.  Available:" + avail);
    }
    return it->second();
}

void AqueousActivity::registerBuiltins()
{
    registerType("davies", []{ return std::make_unique<DaviesActivity>(); });
    // S2: the multi-ion Pitzer (Harvie-Moller-Weare) model.  Binaries only --
    // ternary theta/psi land in S3.
    registerType("pitzerHMW", []{ return std::make_unique<PitzerHMW>(); });
}

} // namespace electrolyte
} // namespace Choupo
