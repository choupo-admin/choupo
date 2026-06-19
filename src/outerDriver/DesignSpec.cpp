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

#include "DesignSpec.H"
#include "ResponseExtractor.H"
#include "core/Dictionary.H"
#include "core/ResultEmitter.H"
#include "solver/NewtonND.H"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {

DesignSpec::DesignSpec(const DictPtr& dict)
{
    auto manip = dict->lookupDictList("manipulate");
    if (manip.empty())
        throw std::runtime_error("DesignSpec: `manipulate` list is empty");
    for (auto& m : manip)
    {
        Manipulate v;
        v.variable = m->lookupWord("variable");
        // initial / min / max are read with the dict's optional unit
        // suffix; the parser converts to canonical SI on the
        // way in.  So  `initial 100 kPa;`  yields 1e5 (Pa) here.
        v.initial  = m->lookupScalar("initial");
        v.lo       = m->lookupScalarOrDefault("min",
                        -std::numeric_limits<scalar>::infinity());
        v.hi       = m->lookupScalarOrDefault("max",
                         std::numeric_limits<scalar>::infinity());
        if (v.lo >= v.hi)
            throw std::runtime_error("DesignSpec: min >= max on variable '"
                + v.variable + "'");
        if (v.initial < v.lo || v.initial > v.hi)
            throw std::runtime_error("DesignSpec: initial outside [min,max]"
                " on variable '" + v.variable + "'");
        vars_.push_back(std::move(v));
    }

    auto tgs = dict->lookupDictList("targets");
    if (tgs.empty())
        throw std::runtime_error("DesignSpec: `targets` list is empty");
    for (auto& t : tgs)
    {
        Target tg;
        // Pick form: equality if `lhs` is present, value otherwise.
        if (t->found("lhs") || t->found("rhs"))
        {
            // `{ lhs <pathA>;  rhs <pathB>;  tol <X>; }` ---
            // enforces resp(A) = resp(B).
            tg.kind = Target::Kind::Equality;
            tg.lhs  = t->lookupWord("lhs");
            tg.rhs  = t->lookupWord("rhs");
        }
        else
        {
            tg.kind  = Target::Kind::Value;
            tg.path  = t->lookupWord("path");
            // `value` carries its own unit suffix (e.g.
            // `value 1125 kg/h;`); parser converts to canonical SI.
            tg.value = t->lookupScalar("value");
        }
        tg.tol = t->lookupScalarOrDefault("tol", 1.0e-6);
        if (tg.tol <= 0.0)
            throw std::runtime_error("DesignSpec: target tol must be > 0");
        targets_.push_back(std::move(tg));
    }

    if (vars_.size() != targets_.size())
        throw std::runtime_error("DesignSpec: dim(manipulate) ("
            + std::to_string(vars_.size()) + ") must equal dim(targets) ("
            + std::to_string(targets_.size()) + ")");

    if (dict->found("options"))
    {
        auto o = dict->subDict("options");
        maxIter_ = static_cast<int>(o->lookupScalarOrDefault("maxIter",  scalar(maxIter_)));
        tolF_    = o->lookupScalarOrDefault("tolF",    tolF_);
        fdStep_  = o->lookupScalarOrDefault("fdStep",  fdStep_);
    }
    if (dict->found("report"))
    {
        auto r = dict->subDict("report");
        reportFile_ = r->lookupWordOrDefault("file", reportFile_);
    }
}

int DesignSpec::run()
{
    if (!simulator_)
        throw std::runtime_error("DesignSpec::run: simulator functor not set");
    if (!flowsheetDict_)
        throw std::runtime_error("DesignSpec::run: flowsheetDict not set");

    const std::size_t n = vars_.size();

    // Validate every manipulated variable exists in the case's variables block.
    if (!flowsheetDict_->found("variables")
        || !flowsheetDict_->varsDict())
    {
        throw std::runtime_error("DesignSpec: the case's flowsheetDict has"
            " no top-level `variables {... }` block, so $references"
            " cannot be manipulated.  Declare the manipulated variables"
            " there, e.g.  variables { A 100; }");
    }
    auto vd = flowsheetDict_->varsDict();
    for (const auto& v : vars_)
        if (!vd->found(v.variable))
            throw std::runtime_error("DesignSpec: manipulated variable '"
                + v.variable + "' is not declared in the case's"
                " `variables {... }` block");

    std::cout << "\n=========================  Design Specification  =====================\n"
              << "  Equations / unknowns: " << n << "\n"
              << "  Manipulate (case-level $variables):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "    [" << i << "]  $" << vars_[i].variable
                  << "  x0 = " << std::scientific << std::setprecision(4)
                  << vars_[i].initial
                  << "   in [" << vars_[i].lo << ", " << vars_[i].hi << "]\n";
    std::cout << "  Targets:\n";
    for (std::size_t j = 0; j < n; ++j)
    {
        const auto& tg = targets_[j];
        std::cout << "    [" << j << "]  ";
        if (tg.kind == Target::Kind::Value)
            std::cout << tg.path << "  ->  "
                      << std::scientific << std::setprecision(6)
                      << tg.value
                      << "   (tol " << tg.tol << ")\n";
        else
            std::cout << tg.lhs << "  ==  " << tg.rhs
                      << "   (tol " << std::scientific
                      << std::setprecision(6) << tg.tol << ")\n";
    }
    std::cout << "  Newton-ND options: maxIter=" << maxIter_
              << "  tolF=" << tolF_ << "  fdStep=" << fdStep_ << "\n"
              << "=======================================================================\n\n";

    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("DesignSpec: cannot open '" + reportFile_
            + "' for writing");
    csv << "iter";
    for (std::size_t i = 0; i < n; ++i) csv << ",$" << vars_[i].variable;
    for (std::size_t j = 0; j < n; ++j) csv << ",F" << j;
    csv << ",normF\n";

    int evalCounter = 0;
    auto residual = [&](const sVector& x) -> sVector
    {
        ++evalCounter;
        auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar xi = std::clamp(x[i], vars_[i].lo, vars_[i].hi);
            // Live-reference: writing to variables.X propagates to every
            // unit op whose dict reads `... $X;` --- no broadcast needed.
            clone->setScalarAtPath("variables." + vars_[i].variable, xi);
        }
        SimulationResult r = simulator_(clone);
        sVector F(n, 0.0);
        for (std::size_t j = 0; j < n; ++j)
        {
            const auto& tg = targets_[j];
            if (tg.kind == Target::Kind::Value)
            {
                const scalar resp = extractResponse(r, tg.path, "DesignSpec");
                F[j] = (resp - tg.value) / tg.tol;
            }
            else
            {
                const scalar a = extractResponse(r, tg.lhs, "DesignSpec");
                const scalar b = extractResponse(r, tg.rhs, "DesignSpec");
                F[j] = (a - b) / tg.tol;
            }
        }
        return F;
    };

    std::cout << "  it   |F|_2          ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "$" << vars_[i].variable
                  << std::string(std::max<size_t>(0, 15 - vars_[i].variable.size() - 1), ' ');
    std::cout << "\n  -----------------------";
    for (std::size_t i = 0; i < n; ++i) std::cout << "----------------";
    std::cout << "\n";

    solver::NDOptions opts;
    opts.tolerance    = tolF_;
    opts.maxIter      = maxIter_;
    opts.fdStep       = fdStep_;
    opts.backtracking = true;
    opts.onIter = [&](const solver::NDTrace& tr)
    {
        std::cout << "  " << std::setw(3) << tr.iteration
                  << "  " << std::scientific << std::setprecision(4)
                  << tr.normF;
        for (std::size_t i = 0; i < tr.x.size(); ++i)
            std::cout << "  " << std::scientific << std::setprecision(6)
                      << std::setw(14) << tr.x[i];
        std::cout << "\n";
        csv << tr.iteration;
        for (std::size_t i = 0; i < tr.x.size(); ++i) csv << "," << tr.x[i];
        for (std::size_t j = 0; j < tr.F.size(); ++j) csv << "," << tr.F[j];
        csv << "," << tr.normF << "\n";
    };

    sVector x0(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) x0[i] = vars_[i].initial;

    auto R = solver::newtonND(residual, x0, opts);

    std::cout << "\n=========================  DesignSpec Result  =========================\n"
              << "  status:        " << (R.converged ? "CONVERGED" : "NOT converged") << "\n"
              << "  iterations:    " << R.iterations
              << "   evaluations: " << evalCounter << "\n"
              << "  ||F||_2:       " << std::scientific << std::setprecision(6)
              << R.residual << "\n"
              << "  solution:\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "    $" << vars_[i].variable << " = "
                  << std::fixed << std::setprecision(6) << R.x[i] << "\n";
    std::cout << "  history:       " << reportFile_
              << "\n=======================================================================\n";

    csv.close();

    std::cout << "\n[replaying simulator at design point]\n";
    auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar xi = std::clamp(R.x[i], vars_[i].lo, vars_[i].hi);
        clone->setScalarAtPath("variables." + vars_[i].variable, xi);
    }
    auto finalResult = simulator_(clone);
    setFinalResult(finalResult);          // expose for the reports{} chain
    emitResultJson(std::cout, finalResult);

    return R.converged ? 0 : 1;
}

} // namespace Choupo
