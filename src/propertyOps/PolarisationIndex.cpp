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

#include "PolarisationIndex.H"

#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/membrane/massTransfer/MassTransferModel.H"
#include "unitOperations/membrane/massTransfer/Polarisation.H"
#include "unitOperations/membrane/massTransfer/StirredCell.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <stdexcept>

namespace Choupo {

int PolarisationIndex::run(const DictPtr& dict,
                           const ThermoPackage& thermo,
                           int verbosity)
{
    using namespace membrane;
    diag_.clear();
    const std::string opName = dict->name().empty() ? type() : dict->name();
    const std::string site   = "polarisationIndex '" + opName + "'";

    const scalar T = dict->lookupScalar("T", Dims::temperature);

    // ---- the ions: components of the package, charge and D through the
    //      declared bridge (buildPolarisation does the crossing) ------------
    if (!dict->found("ions"))
        throw std::runtime_error(site + ": declare `ions ( ... )`, the"
            " components (each with an aqueous bridge) whose wall"
            " concentrations are asked for");
    const auto ionNames = dict->lookupWordList("ions");
    std::vector<std::size_t> soluteIdx;
    for (const auto& nm : ionNames)
    {
        bool hit = false;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == nm) { soluteIdx.push_back(i); hit = true; break; }
        if (!hit)
            throw std::runtime_error(site + ": ion '" + nm + "' is not a"
                " component of this case's thermoPhysPropDict");
    }
    const std::size_t n = soluteIdx.size();

    // ---- the correlation ---------------------------------------------------
    if (!dict->found("massTransfer"))
        throw std::runtime_error(site + ": declare `massTransfer { model ...; }`"
            " -- the bench needs the per-ion k_c,i, which come from a"
            " correlation (StirredCell for the paper's Amicon cell)");
    auto mt = dict->subDict("massTransfer");
    if (!mt->found("model"))
        throw std::runtime_error(site + ": massTransfer {} declares no `model`;"
            " registered: StirredCell, SchockMiquel");
    MassTransferModel::registerBuiltins();          // idempotent
    std::unique_ptr<MassTransferModel> corr = MassTransferModel::New(mt->lookupWord("model"));
    corr->readParameters(mt);
    if (!mt->found("viscosity") || !mt->found("density"))
        throw std::runtime_error(site + ": massTransfer {} must declare"
            " `viscosity` (Pa.s) and `density` (kg/m3) -- the bench prices"
            " nothing from a package here, so nu = mu/rho is the case's own");
    MassTransferContext hyd;
    hyd.mu  = mt->lookupScalar("viscosity");
    hyd.rho = mt->lookupScalar("density");
    hyd.u   = mt->lookupScalarOrDefault("velocity", 0.0);
    hyd.d_h = mt->lookupScalarOrDefault("hydraulicDiameter", 0.0, Dims::length);

    // ---- the wall: ONE home, the same builder the module uses -------------
    //  The op dict plays the role of the unit's operation block: the
    //  `polarisation {}` policy, and the refusal of the two words inside
    //  massTransfer {}, are read by the same function.
    const Polarisation polar = buildPolarisation(
        dict, thermo, soluteIdx, corr.get(), 0.0,
        std::numeric_limits<scalar>::quiet_NaN(), T, site, verbosity);
    for (std::size_t s = 0; s < n; ++s)
        if (polar.solutes()[s].z == 0)
            throw std::runtime_error(site + ": '" + ionNames[s] + "' resolves to"
                " a neutral or lumped solute (no single-species aqueous bridge,"
                " or charge 0).  This bench is the multi-ionic model; every"
                " entry of `ions` must be an ion declared as a component with"
                " `aqueousMapping ( { species <ion>; nu 1; } )`.");

    // ---- the closing ion ---------------------------------------------------
    int closeIdx = -1;
    if (dict->found("closeBy"))
    {
        const std::string c = dict->lookupWord("closeBy");
        for (std::size_t s = 0; s < n; ++s) if (ionNames[s] == c) closeIdx = int(s);
        if (closeIdx < 0)
            throw std::runtime_error(site + ": closeBy '" + c + "' is not in `ions`");
    }

    // ---- the dataset -------------------------------------------------------
    if (!dict->found("dataset"))
        throw std::runtime_error(site + ": declare `dataset \"<path>\";` (the"
            " experiments grammar: columns C_b_<ion>, C_p_<ion> in mol/m3 for"
            " every measured ion, J_v in m/s)");
    std::string dsPath = dict->lookupWord("dataset");
    if (dsPath.size() < 4 || dsPath.substr(dsPath.size() - 4) != ".dat") dsPath += ".dat";
    DictPtr ds = Dictionary::fromFile(dsPath);
    const auto colDicts = ds->lookupDictList("columns");
    const auto flat     = ds->lookupList("data");
    const std::size_t nc = colDicts.size();
    if (nc == 0 || flat.empty() || flat.size() % nc != 0)
        throw std::runtime_error(site + ": dataset '" + dsPath + "' -- "
            + std::to_string(flat.size()) + " values do not fill rows of "
            + std::to_string(nc) + " columns");
    const std::size_t nRows = flat.size() / nc;
    std::vector<std::string> colName(nc), colUnit(nc);
    for (std::size_t c = 0; c < nc; ++c)
    {
        colName[c] = colDicts[c]->lookupWord("name");
        colUnit[c] = colDicts[c]->lookupWordOrDefault("unit", "");
    }
    auto column = [&](const std::string& nm, const std::string& unit) -> int
    {
        for (std::size_t c = 0; c < nc; ++c)
            if (colName[c] == nm)
            {
                if (colUnit[c] != unit)
                    throw std::runtime_error(site + ": dataset column '" + nm
                        + "' declares unit '" + colUnit[c] + "'; this bench"
                          " reads it as " + unit + " and converts nothing --"
                          " declare the data in that unit");
                return int(c);
            }
        return -1;
    };
    const int jCol = column("J_v", "m/s");
    if (jCol < 0)
        throw std::runtime_error(site + ": dataset has no `J_v` column (m/s)");
    std::vector<int> cbCol(n, -1), cpCol(n, -1);
    for (std::size_t s = 0; s < n; ++s)
    {
        cbCol[s] = column("C_b_" + ionNames[s], "mol/m3");
        cpCol[s] = column("C_p_" + ionNames[s], "mol/m3");
        const bool closing = (int(s) == closeIdx);
        if (!closing && (cbCol[s] < 0 || cpCol[s] < 0))
            throw std::runtime_error(site + ": dataset has no C_b_" + ionNames[s]
                + " / C_p_" + ionNames[s] + " columns and '" + ionNames[s]
                + "' is not the `closeBy` ion");
        if (closing && (cbCol[s] >= 0 || cpCol[s] >= 0))
            throw std::runtime_error(site + ": '" + ionNames[s] + "' is the"
                " closeBy ion AND has columns in the dataset -- an ion is"
                " measured or derived, never both");
    }
    if (closeIdx < 0)
        for (std::size_t s = 0; s < n; ++s)
            if (cbCol[s] < 0)
                throw std::runtime_error(site + ": every ion needs columns"
                    " unless one is named by `closeBy`");

    // ---- announce what is what -------------------------------------------
    const auto& sol = polar.solutes();
    std::vector<scalar> k = polar.kVector(hyd);
    scalar Re = 0.0;
    if (auto sc = dynamic_cast<const StirredCell*>(corr.get())) Re = sc->reynolds(hyd);
    std::cout << "\n========  Polarisation-index bench  ========\n"
              << "  Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20-27, Eqs. (2)-(8):"
                 " per-ion mass transfer,\n  suction-corrected (" << word(polar.policy().suction)
              << "), ions coupled by electroneutrality at the interface ("
              << word(polar.policy().coupling) << ").\n"
              << "  T = " << std::fixed << std::setprecision(2) << T << " K   nu = "
              << std::scientific << std::setprecision(3) << hyd.mu / hyd.rho << " m2/s";
    if (Re > 0.0) std::cout << "   Re = omega r^2/nu = " << std::fixed
                            << std::setprecision(0) << Re;
    std::cout << "\n  correlation: " << corr->type() << "\n\n"
              << "  ion       z      D [m2/s]      k_c,i [m/s]     (D from the species record;"
                 " k from the correlation on Sc_i = nu/D_i)\n";
    for (std::size_t s = 0; s < n; ++s)
    {
        char b[160];
        std::snprintf(b, sizeof(b), "  %-8s %+2d   %10.3e   %12.4e\n",
                      sol[s].name.c_str(), sol[s].z,
                      static_cast<double>(sol[s].D), static_cast<double>(k[s]));
        std::cout << b;
        diag_["k_" + sol[s].name] = k[s];
        diag_["D_" + sol[s].name] = sol[s].D;
    }
    if (closeIdx >= 0)
        std::cout << "  " << ionNames[closeIdx] << ": bulk and permeate DERIVED from"
                     " electroneutrality of the other ions (closeBy), as the"
                     " source table did.\n";
    if (Re > 0.0) diag_["Re"] = Re;

    // ---- the rows ----------------------------------------------------------
    std::cout << "\n  row   J_v [m/s]   ion        C_b        C_p      phi_i     Xi_i"
                 "        C_m     Gamma_i\n";
    scalar maxResidual = 0.0;
    for (std::size_t r = 0; r < nRows; ++r)
    {
        const scalar Jv = flat[r * nc + jCol];
        std::vector<scalar> c_b(n, 0.0), c_p(n, 0.0);
        for (std::size_t s = 0; s < n; ++s)
            if (int(s) != closeIdx)
            {
                c_b[s] = flat[r * nc + cbCol[s]];
                c_p[s] = flat[r * nc + cpCol[s]];
            }
        if (closeIdx >= 0)
        {
            scalar qb = 0.0, qp = 0.0;
            for (std::size_t s = 0; s < n; ++s)
                if (int(s) != closeIdx)
                {
                    qb += sol[s].z * c_b[s];
                    qp += sol[s].z * c_p[s];
                }
            c_b[closeIdx] = -qb / sol[closeIdx].z;
            c_p[closeIdx] = -qp / sol[closeIdx].z;
            if (c_b[closeIdx] <= 0.0 || c_p[closeIdx] < 0.0)
                throw std::runtime_error(site + ": row " + std::to_string(r + 1)
                    + " -- the closeBy ion comes out non-positive from"
                      " electroneutrality (bulk " + std::to_string(c_b[closeIdx])
                    + ", permeate " + std::to_string(c_p[closeIdx]) + " mol/m3)");
        }
        const WallSolution w = polar.wall(hyd, Jv, c_b, c_p);
        requireOk(w, site + " row " + std::to_string(r + 1));

        scalar q = 0.0, qa = 0.0;
        for (std::size_t s = 0; s < n; ++s)
        {
            q  += sol[s].z * w.c_m[s];
            qa += std::abs(scalar(sol[s].z)) * w.c_m[s];
        }
        const scalar residual = (qa > 0.0) ? std::abs(q) / qa : 0.0;
        maxResidual = std::max(maxResidual, residual);

        for (std::size_t s = 0; s < n; ++s)
        {
            char b[200];
            std::snprintf(b, sizeof(b),
                "  %3zu   %9.3e   %-8s %9.4f  %9.4f  %8.4f  %8.4f  %9.4f  %+8.4f\n",
                r + 1, static_cast<double>(Jv), sol[s].name.c_str(),
                static_cast<double>(c_b[s]), static_cast<double>(c_p[s]),
                static_cast<double>(w.phi[s]), static_cast<double>(w.Xi[s]),
                static_cast<double>(w.c_m[s]), static_cast<double>(w.Gamma[s]));
            std::cout << b;
            diag_["Gamma_" + sol[s].name + "_r" + std::to_string(r + 1)] = w.Gamma[s];
        }
        {
            char b[200];
            std::snprintf(b, sizeof(b),
                "        xi = %+.4e V/m    sum z_i C_m,i / sum |z_i| C_m,i = %.2e\n",
                static_cast<double>(w.xi), static_cast<double>(residual));
            std::cout << b;
        }
        diag_["xi_r" + std::to_string(r + 1)] = w.xi;
    }
    diag_["n_rows"] = static_cast<scalar>(nRows);
    diag_["chargeResidual_max"] = maxResidual;
    std::cout << "\n  " << nRows << " row(s); largest wall-electroneutrality residual "
              << std::scientific << std::setprecision(2) << maxResidual
              << ".  Gamma_i are PREDICTIONS from the case's k correlation and"
                 " the ions' D;\n  nothing was fitted.  The measured inputs are"
                 " the C_b, C_p and J_v of the dataset.\n"
              << "=============================================\n";
    (void)verbosity;
    return 0;
}

} // namespace Choupo
