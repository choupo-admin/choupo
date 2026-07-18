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
    Choupo::PCSAFT

Description
    Perturbed-Chain SAFT equation of state -- the NON-ASSOCIATING core
    (hard-sphere + hard-chain + dispersion), exactly the formulation of

        J. Gross & G. Sadowski, "Perturbed-Chain SAFT: An Equation of State
        Based on a Perturbation Theory for Chain Molecules",
        Ind. Eng. Chem. Res. 40 (2001) 1244-1260.

    A molecule is a chain of `m` tangent hard spheres of temperature-INDEPENDENT
    diameter sigma and segment dispersion energy epsilon/k.  The residual
    (molar) Helmholtz energy is

        a_res / RT = a_hc + a_disp                                         (GS 2)

    with the hard-chain reference

        a_hc = m_bar * a_hs - Σ_i x_i (m_i - 1) ln g_hs_ii                 (GS 3)

    the Boublik-Mansoori-Carnahan-Starling-Leland hard-sphere term

        a_hs = (1/ζ0)[ 3 ζ1 ζ2 /(1-ζ3)
                     + ζ2^3 /(ζ3 (1-ζ3)^2)
                     + (ζ2^3/ζ3^2 - ζ0) ln(1-ζ3) ]                         (GS 9)

        ζ_n = (π/6) ρ Σ_i x_i m_i d_i^n ,  n = 0..3                        (GS 8)

    the T-DEPENDENT effective segment diameter (the only T-dependence of d)

        d_i = σ_i [ 1 - 0.12 exp(-3 ε_i/(kT)) ]                            (GS 4)

    the hard-sphere radial distribution at contact

        g_hs_ij = 1/(1-ζ3)
                + (d_i d_j/(d_i+d_j)) 3 ζ2/(1-ζ3)^2
                + (d_i d_j/(d_i+d_j))^2 2 ζ2^2/(1-ζ3)^3                    (GS 10)

    and the two-term dispersion perturbation

        a_disp = -2 π ρ I1(η,m_bar) * m2es3
                 - π ρ m_bar C1(η,m_bar) I2(η,m_bar) * m2e2s3             (GS 16)

        m2es3  = Σ_i Σ_j x_i x_j m_i m_j (ε_ij/kT)   σ_ij^3               (GS 12)
        m2e2s3 = Σ_i Σ_j x_i x_j m_i m_j (ε_ij/kT)^2 σ_ij^3               (GS 13)

        σ_ij = ½(σ_i+σ_j) ,  ε_ij = √(ε_i ε_j)(1 - k_ij)                  (GS 24,25)

        I1 = Σ_{n=0}^6 a_n(m_bar) η^n ,  I2 = Σ_{n=0}^6 b_n(m_bar) η^n    (GS 17,18)
        a_n = a0n + (m_bar-1)/m_bar a1n
                  + (m_bar-1)/m_bar (m_bar-2)/m_bar a2n                    (GS 18)
        (b_n likewise; the universal a0..a2, b0..b2 are GS Table 1)

        C1 = [ 1 + m_bar (8η-2η²)/(1-η)^4
                 + (1-m_bar)(20η-27η²+12η³-2η⁴)/((1-η)(2-η))² ]^{-1}       (GS 13)

        m_bar = Σ_i x_i m_i ,  η = ζ3  (packing fraction)

    The compressibility factor Z = 1 + Z_hc + Z_disp is the density derivative
    Z = ρ (∂(a_res/RT)/∂ρ)_{T,x} + 1; the pressure closes P = Z ρ k T (ρ in
    molecules / m³).  The density at a given (T,P,x) is bracketed and Newton-
    solved WITHIN the physical packing domain (η < ~0.74, the closest-packing
    geometric limit); vapour and liquid roots are the low-η and high-η brackets,
    classified by Gibbs energy, and a requested root that does not exist is
    REFUSED (never a silent clamp -- the no-silent-crutch credo).

    ln φ_i = μ_res_i/RT − ln Z is computed as a CENTRAL NUMERIC mole-number
    derivative of the ANALYTIC a_res at fixed (T, V) -- a deliberate, declared
    choice (the analytic GS Appendix A.3-A.11 derivative is a staged follow-up):
    the physics lives ONCE in a_res, and the derivative cannot disagree with it
    by a transcription error.  The step is h_rel = 1e-6 on each mole number;
    verify() MEASURES the step convergence at construction (lnφ recomputed at
    h/10 and 10h must agree -- the central-difference plateau, observed
    1e-8..4e-8 across the curated alkane mixes) alongside the ideal-gas limit and the
    Σx·lnφ = g_res/RT (Gibbs-Duhem integral) identity, and the constructor
    REFUSES a parameter set that fails any of the three.

    Per-component parameters live in the component's OWN record, one home:

        pcsaft
        {
            m        1.6069;      // segment number [-]          (this example:
            sigma    3.5206;      // segment diameter [Angstrom]  ETHANE, GS
            epsilonK 191.42;      // segment energy eps/k [K]     2001 Table 1)
            source   "Gross & Sadowski, Ind. Eng. Chem. Res. 40 (2001) 1244, Table 1";
        }

    Binary k_ij (optional, default 0 -- announced as `assumedZero`) lives in
    data/standards/parameters/PCSAFT/<i>-<j>.dat, resolved by the same declared
    channel the cubic kij uses.

    STILL OUT (staged, per the ratified plan): association (2B sites), polar and
    quadrupolar terms, electrolyte PC-SAFT, and any COSMO->kij coupling.  This
    file is the non-associating first gate only.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/Component.H"

#include <array>
#include <string>
#include <vector>

namespace Choupo {

class PCSAFT : public EquationOfState
{
public:
    PCSAFT(const DictPtr& dict, const std::vector<Component>& comps);

    std::size_t n() const override { return n_; }

    sVector phi       (scalar T_K, scalar P_Pa, const sVector& y) const override;
    sVector phiLiquid (scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const override;
    bool    hasLiquidRoot() const override { return true; }
    scalar  molarVolumeLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  Z         (scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  H_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  S_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;

    const std::string& modelName() const override { return name_; }
    std::vector<std::string> requiredComponentProperties() const override
    {
        return {"pcsaft.m", "pcsaft.sigma", "pcsaft.epsilonK"};
    }

    // Self-consistency verification (glass-box, run once at construction, echoed
    // at verbosity >= 3): (1) a_res -> 0 as rho -> 0; (2) analytic ln phi vs a
    // central numeric derivative of a_res; (3) Gibbs-Duhem Sum x_i dlnphi_i = 0.
    // Returns the max relative deviation across the checks.
    scalar verify(int verbosity = 0) const;

private:
    // ---- pure-component parameters (from each component's pcsaft{} block) ----
    std::size_t         n_;
    std::string         name_ = "PCSAFT";
    std::vector<scalar> m_;          // segment number
    std::vector<scalar> sigma_;      // segment diameter [m]
    std::vector<scalar> epsK_;       // epsilon/k [K]
    std::vector<scalar> kij_;        // n*n, symmetric, default 0

    // ---- GS Table 1 universal dispersion constants (a0..a2, b0..b2) ----------
    static const std::array<scalar, 7> a0_, a1_, a2_, b0_, b1_, b2_;

    // Reduced residual Helmholtz a_res/(RT) and its density derivative, at a
    // number density rho [molecules/m^3].  These are the ONE source of the
    // physics; Z, P, phi and the departures all differ this function.
    scalar aRes    (scalar T, scalar rho, const sVector& x) const;
    scalar daRes_dRho(scalar T, scalar rho, const sVector& x) const;

    // Solve rho at (T,P,x) starting from a packing-fraction seed (vapour: low
    // eta; liquid: high eta).  Refuses (throws) outside the physical domain.
    scalar solveDensity(scalar T, scalar P, const sVector& x, bool liquidRoot) const;

    // ln phi_i at a resolved density: central numeric d(n*aRes)/dn_i at fixed
    // (T,V).  hRel is the relative mole-number step (default the production
    // 1e-6; verify() sweeps it to measure the convergence plateau).
    sVector lnPhiAt(scalar T, scalar P, scalar rho, const sVector& x,
                    scalar hRel = 1.0e-6) const;
};

} // namespace Choupo
