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
\*---------------------------------------------------------------------------*/

#include "TableViscosity.H"

#include "Andrade.H"
#include "thermo/Component.H"
#include "thermo/RecordLaws.H"

#include <cmath>
#include <mutex>
#include <stdexcept>

namespace Choupo {

namespace {
std::mutex& buildMutex()
{
    static std::mutex m;
    return m;
}
} // namespace

scalar TableViscosity::viscosityLiquidPure(const Component& c, scalar T) const
{
    {
        std::lock_guard<std::mutex> lk(buildMutex());
        if (!table_)
        {
            const recordLaws::Block* blk = c.recordLaws("liquidViscosity");
            const recordLaws::Law* law = blk ? blk->find(law_) : nullptr;
            if (!law)
                throw std::runtime_error("table viscosity: component '" + c.name() + "' holds no"
                    " liquidViscosity law `" + law_ + "` (a table law is bound by name).");
            const std::string label = c.name() + "'s liquidViscosity law `" + law_ + "` ("
                + (law->home.empty() ? "record " + c.recordHome() : law->home) + ")";
            table_ = PropertyTable::fromLaw(law->body, "liquidViscosity", label, c.MW());
        }
    }
    return table_->value(T);
}

CorrelationVerify TableViscosity::verify() const
{
    //  ARITHMETIC: a two-point logReciprocal table through an Arrhenius law
    //  reproduces that law EXACTLY between its points (ln mu is linear in
    //  1/T in both).  Checked against Andrade's own kernel at 320 K with the
    //  points at 280 and 360 K.  It checks the interpolation, not any liquid.
    const scalar A = -13.03, B = 1796.1;
    PropertyTable t({ 280.0, 360.0 }, { Andrade::kernel(A, B, 280.0), Andrade::kernel(A, B, 360.0) },
                    PropertyTable::Interpolation::logReciprocal, "verify", "liquid viscosity", false);
    CorrelationVerify v;
    v.value_choupo    = t.value(320.0);
    v.value_published = Andrade::kernel(A, B, 320.0);
    v.dev  = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "arithmetic";
    v.anchor = "a two-point logReciprocal table through an Arrhenius (Andrade) law reproduces it"
               " exactly between its points -- checked against Andrade::kernel at 320 K; this arm"
               " checks the interpolation, not any liquid";
    return v;
}

} // namespace Choupo
