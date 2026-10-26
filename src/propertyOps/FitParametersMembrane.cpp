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
    fitParameters, residual kind MEMBRANE (DEV.md 4c C149, C152): a membrane
    record's transport parameters estimated from a researcher's measured
    rejections and fluxes.

        {
            name      fit_NF270;
            type      fitParameters;
            parameters
            (
                { path poreModel.poreRadius;     initial 4.5e-10; min 2e-10; max 2e-9; }
                { path poreModel.chargeDensity;  initial -20;     min -2000; max 0; }
            );
            evidence
            (
                { dataset "constant/experimental/nacl.dat";  role fit; }
                { dataset "constant/experimental/mgcl2.dat"; role validation; }
            );
            acceptance { maxAAD 5 percent; origin "..."; }
            residual
            {
                kind       membrane;
                model      DSPM-DE;      // | SDEM | solutionDiffusion | constantRejection
                membrane   NF270_dspmde; // the BASE record: the fixed values
                rejection  intrinsic;    // | observed: which rejection the data are
                weighting  absolute;     // | sigma (the dataset's sigma_ columns)
                transportParameters { ... }        // the law's own block
                k_film 10;  | massTransfer { ... } // the film, as the units read it
                polarisation { ... }
            }
            output { record "constant/assets/NF270_fitted.dat"; }
        }

    A PARAMETER IS A PATH INTO THE BASE RECORD -- `poreModel.poreRadius`,
    `poreModel.chargeDensity`, `poreModel.porosityOverThickness`,
    `poreModel.poreDielectric`, `A_w`, `permeabilities.<solute>` -- or, for a
    law whose numbers live in its own block, into `transportParameters`
    (`transportParameters.rejection.<solute>` for constantRejection).  The
    ones not listed keep the base record's values; nothing is fitted that
    was not declared free.  `initial`/`min`/`max` are in the FIELD's own raw
    convention (m, 1/m, mol/m3 signed, -, m/(s Pa), m/s) and may not carry a
    unit: chargeDensity's mol/m3 is not the engine's canonical kmol/m3, and
    a converted number would be a factor 1000 off without a symptom.
    Positive fields are fitted in ln-space (positive by construction);
    chargeDensity and a rejection in natural space.  A declared bound is a
    BOX for the iteration and a FINDING at the optimum: a parameter that
    ends on it is named, unidentifiable, and refuses the record.

    ONE ROW OF A DATASET IS ONE OPERATING POINT, evaluated exactly as the
    units evaluate the law: the same TransportModel factory, the same
    `transportParameters {}` reader, the same polarisation builder
    (membrane::buildPolarisation, the module's), the record rebuilt from the
    base record's file with the free values set.  A row either IMPOSES the
    permeate flux (`Jv`, m/s -- only DSPM-DE honours an imposed J_v, as on
    the props bench) or the transmembrane pressure (`dP`, the law closes J_w
    = A_w (dP - dpi)).  Dataset grammar (the evidence reader's):
        T        293.15 K;              // or a `T` column
        feed     { NaCl 10 mol/m3; }    // or `c_<component>` columns, mol/m3
        columns  ( { name Jv; unit m/s; } { name R_NaCl; unit -; } ... );
        data     ( ... );
    Measured columns: `R_<x>` -- a rejection of feed component x, or of an
    ion the law reports (DSPM-DE decomposes salts: R_Na, R_SO4) -- and,
    with `dP` rows, `Jv_measured` (m/s).  `sigma_<column>` columns are the
    per-point uncertainty `weighting sigma;` reads.  A column the residual
    does not read REFUSES by name: an ignored column is a measurement the
    author believes was fitted.  Rows are independent and are evaluated in
    SERIES; running them in parallel would need threads the engine does not
    use (each row's law keeps its own warm-started pore, so the series run
    is deterministic).

    THE RESIDUAL.  A rejection enters as R_model - R_measured (absolute, a
    fraction), a flux as (J_model - J_measured)/J_measured; under `weighting
    sigma;` each is divided by its sigma.  THE HELD-OUT STATISTIC the band
    judges is the mean over every held-out term of |R_model - R_measured| x
    100 (rejection PERCENTAGE POINTS) and 100 |dJ|/J (per cent), so
    `acceptance { maxAAD 5 percent; }` reads "within 5 points of rejection"
    -- a relative error of a rejection near zero would be meaningless.

    THE DISCIPLINE is fitParameters': the evidence partition (fit / held-out,
    EvidencePartition), the band declared before the fit, identifiability
    (the condition number of the relative-scaled Jacobian, the parameter
    correlations, each parameter's sensitivity), the standard errors from
    the Gauss-Newton Hessian, and the verdict (CurationDossier::verdictOf).
    A fit with no free parameters is a PREDICTION: every row is evaluated
    and scored and nothing is written.

    THE RECORD (`output { record "constant/assets/<file>.dat"; name ...; }`,
    C152): a `kind` membrane record in the catalogue's own grammar with the
    fitted values ROUNDED TO 6 SIGNIFICANT FIGURES -- the verdict and every
    published model value are re-evaluated AT the rounded values, so the
    record is exactly what was validated -- per-value provenance, the
    uncertainty, the verdict, and the `fit {}` block of fingerprints a
    Process-mode run checks before it uses the record
    (thermo/membrane/FittedRecord.H).  Nothing time-dependent is written, so
    re-running an unchanged case rewrites the same bytes.  Refused under
    data/standards/ (records::refuseStandardsWrite) and anywhere but the
    case's constant/assets/, the one home the membrane registry reads.
\*---------------------------------------------------------------------------*/

#include "FitParameters.H"
#include "FitAlgebra.H"
#include "EvidencePartition.H"
#include "CurationDossier.H"

#include "core/DictCanonical.H"
#include "core/Dimensions.H"
#include "core/Sha256.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/FittedRecord.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "propertyOps/PropsPlan.H"
#include "unitOperations/membrane/massTransfer/MassTransferModel.H"
#include "unitOperations/membrane/massTransfer/Polarisation.H"
#include "unitOperations/membrane/osmotic/OsmoticModel.H"
#include "unitOperations/membrane/transport/TransportModel.H"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

namespace fs = std::filesystem;
const scalar NaN = std::numeric_limits<scalar>::quiet_NaN();

//  A free parameter.
struct MemParam
{
    std::string path;        // as declared
    std::string inner;       // the path inside its home (record or law block)
    bool        inLaw = false;   // true: transportParameters.<inner>
    bool        logScale = true;
    scalar      initial = 0.0, lo = -INFINITY, hi = INFINITY;
    std::string unit;        // the field's raw convention
};

//  One measured quantity of one row.
struct MemMeas
{
    std::string column;      // R_<x> | Jv_measured
    std::string target;      // x (for R_) or "Jv"
    bool        isFlux = false;
    scalar      value = 0.0;
    scalar      sigma = 1.0;
};

//  One operating point.
struct MemRow
{
    std::size_t set = 0;     // index into the dataset list
    bool        heldOut = false;
    scalar      T = NaN;
    std::vector<std::pair<std::string, scalar>> feed;   // component -> kmol/m3
    bool        imposedJv = true;
    scalar      Jv = NaN, dP = NaN;
    std::vector<MemMeas> meas;
};

struct MemSet
{
    EvidenceDataset ds;
    bool heldOut = false;
    std::string sha256;
};

//  The field conventions of the paths a membrane record carries.
bool knownRecordPath(const std::string& p, bool& logScale, std::string& unit)
{
    if (p == "poreModel.poreRadius")            { logScale = true;  unit = "m";      return true; }
    if (p == "poreModel.porosityOverThickness") { logScale = true;  unit = "1/m";    return true; }
    if (p == "poreModel.chargeDensity")         { logScale = false; unit = "mol/m3"; return true; }
    if (p == "poreModel.poreDielectric")        { logScale = true;  unit = "-";      return true; }
    if (p == "A_w")                             { logScale = true;  unit = "m/s/Pa"; return true; }
    if (p.rfind("permeabilities.", 0) == 0 && p.size() > 15)
                                                { logScale = true;  unit = "m/s";    return true; }
    return false;
}

//  Silence std::cout for the law's per-instance announcements after the
//  first evaluation: the same law at other parameter values says nothing new.
struct CoutSilencer
{
    std::streambuf* old = nullptr;
    std::ostringstream sink;
    explicit CoutSilencer(bool on) { if (on) old = std::cout.rdbuf(sink.rdbuf()); }
    ~CoutSilencer() { if (old) std::cout.rdbuf(old); }
};

std::string sig6(scalar v)
{
    std::ostringstream o; o << std::setprecision(6) << v; return o.str();
}
scalar round6(scalar v)
{
    if (!std::isfinite(v) || v == 0.0) return v;
    return std::stod(sig6(v));
}
std::string full(scalar v)
{
    std::ostringstream o; o << std::setprecision(10) << v; return o.str();
}

bool hasComponent(const ThermoPackage& thermo, const std::string& name)
{
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == name) return true;
    return false;
}

} // anonymous namespace

int FitParameters::runMembraneFit(const DictPtr& dict, const ThermoPackage& thermo,
                                  int verbosity)
{
    using namespace membrane;
    diag_.clear(); curation_.clear(); tables_.clear(); paramPaths_.clear();
    memQuantities_.clear(); memSets_.clear(); memSetQuantities_.clear(); memUnits_.clear();
    memSetHeldOut_.clear();
    const std::string opName = dict->lookupWordOrDefault("name", "");
    const std::string site = "fitParameters(membrane) '" + opName + "'";
    if (opName.empty())
        throw std::runtime_error("fitParameters(membrane): the operation needs a `name` -- a"
            " fitted record names the operation that wrote it, and Process mode finds that"
            " operation by name to check the record");
    auto res = dict->subDict("residual");

    // ---- the law and the base record -------------------------------------
    if (!res->found("model"))
        throw std::runtime_error(site + ": declare `residual { model <law>; }` -- DSPM-DE,"
            " SDEM, solutionDiffusion or constantRejection; the law whose parameters are"
            " fitted is the author's choice, never a default");
    const std::string law = res->lookupWord("model");
    membrane::TransportModel::registerBuiltins();
    {
        const auto av = membrane::TransportModel::availableTypes();
        if (std::find(av.begin(), av.end(), law) == av.end()
            || law == "gelPolarisation")
            throw std::runtime_error(site + ": `model " + law + ";` is not a law this fit"
                " evaluates.  Accepted: DSPM-DE, SDEM, solutionDiffusion,"
                " constantRejection.");
    }
    if (res->found("dataset") || res->found("data"))
        throw std::runtime_error(site + ": the data are declared by the operation's"
            " `evidence ( { dataset \"...\"; role fit|validation; } ... )` list (or the"
            " legacy op-level `dataset`), not inside `residual {}` -- the partition is"
            " frozen before the fit runs, and a dataset beside it would be a second"
            " home for the same declaration");
    if (!res->found("membrane"))
        throw std::runtime_error(site + ": declare `residual { membrane <name>; }` -- the"
            " BASE record whose values the free parameters replace and the rest hold"
            " fixed (data/standards/assets/ or the case's constant/assets/)");
    const std::string baseName = res->lookupWord("membrane");
    const Membrane& baseMem = MembraneRegistry::byNameUnverified(baseName);
    const std::string basePath = MembraneRegistry::sourcePath(baseName);
    if (basePath.empty())
        throw std::runtime_error(site + ": the base record '" + baseName + "' has no file"
            " the fit can rebuild it from");
    const DictPtr baseDict = Dictionary::fromFile(basePath);
    if (law == "DSPM-DE" && !baseMem.hasPoreModel())
        throw std::runtime_error(site + ": `model DSPM-DE;` fits a poreModel {} and base"
            " record '" + baseName + "' carries none -- start from a record with one");

    const std::string rejection = res->lookupWordOrDefault("rejection", "");
    if (rejection != "intrinsic" && rejection != "observed")
        throw std::runtime_error(site + ": declare `rejection intrinsic;` (R = 1 - c_p/c_wall:"
            " the data were corrected for concentration polarisation) or `rejection"
            " observed;` (R = 1 - c_p/c_bulk: as measured) -- there is no default, because"
            " fitting one against the other moves every parameter without a symptom");
    const std::string weighting = res->lookupWordOrDefault("weighting", "absolute");
    if (weighting != "absolute" && weighting != "sigma")
        throw std::runtime_error(site + ": `weighting " + weighting + ";` -- Accepted:"
            " absolute (a rejection as a fraction, a flux relative), sigma (the dataset's"
            " sigma_<column> columns)");

    // ---- the free parameters ---------------------------------------------
    std::vector<MemParam> params;
    if (dict->found("parameters"))
        for (const auto& p : dict->lookupDictList("parameters"))
        {
            MemParam mp;
            if (!p->found("path"))
                throw std::runtime_error(site + ": a parameter entry needs `path` -- a field"
                    " of the base record (poreModel.poreRadius, ...) or of"
                    " transportParameters");
            mp.path = p->lookupWord("path");
            for (const char* k : { "initial", "min", "max" })
                if (p->found(k) && p->hasDimensions(k))
                    throw std::runtime_error(site + ": parameter '" + mp.path + "' declares a"
                        " unit on `" + k + "` -- write it in the field's own raw convention"
                        " (poreRadius m, porosityOverThickness 1/m, chargeDensity mol/m3"
                        " signed, poreDielectric -, A_w m/(s Pa), permeabilities m/s): the"
                        " record's mol/m3 is not the engine's canonical kmol/m3, and a"
                        " converted number would be a factor 1000 off without a symptom");
            if (mp.path.rfind("transportParameters.", 0) == 0)
            {
                mp.inLaw = true;
                mp.inner = mp.path.substr(20);
                mp.logScale = false;
                mp.unit = "-";
                if (!res->found("transportParameters"))
                    throw std::runtime_error(site + ": parameter '" + mp.path + "' points into"
                        " transportParameters {}, and the residual declares none");
            }
            else
            {
                mp.inner = mp.path;
                if (!knownRecordPath(mp.path, mp.logScale, mp.unit))
                    throw std::runtime_error(site + ": parameter path '" + mp.path + "' is"
                        " not a fittable field of a membrane record.  Accepted:"
                        " poreModel.poreRadius, poreModel.porosityOverThickness,"
                        " poreModel.chargeDensity, poreModel.poreDielectric, A_w,"
                        " permeabilities.<solute>, transportParameters.<path>");
            }
            if (!p->found("initial"))
                throw std::runtime_error(site + ": parameter '" + mp.path + "' declares no"
                    " `initial` -- a start is the author's, never the engine's");
            mp.initial = p->lookupScalar("initial");
            if (p->found("min")) mp.lo = p->lookupScalar("min");
            if (p->found("max")) mp.hi = p->lookupScalar("max");
            if (!(mp.lo < mp.hi))
                throw std::runtime_error(site + ": parameter '" + mp.path + "' declares"
                    " min >= max");
            if (mp.logScale && !(mp.initial > 0.0))
                throw std::runtime_error(site + ": parameter '" + mp.path + "' is a positive"
                    " field fitted in ln-space -- its `initial` must be > 0");
            if (mp.logScale && mp.lo <= 0.0) mp.lo = -INFINITY;   // ln-space: positivity is structural
            if (mp.initial < mp.lo || mp.initial > mp.hi)
                throw std::runtime_error(site + ": parameter '" + mp.path + "': `initial` "
                    + full(mp.initial) + " lies outside its declared [min, max]");
            for (const auto& q : params)
                if (q.path == mp.path)
                    throw std::runtime_error(site + ": parameter '" + mp.path + "' is"
                        " declared twice");
            params.push_back(mp);
        }
    const std::size_t P = params.size();
    const bool predicting = (P == 0);
    if (law == "DSPM-DE")
        for (const auto& mp : params)
            if (!mp.inLaw && mp.path.rfind("permeabilities.", 0) == 0)
                throw std::runtime_error(site + ": '" + mp.path + "' is a solution-diffusion"
                    " B_s, and DSPM-DE does not read it -- a free parameter the law never"
                    " reads is unidentifiable by construction");
    for (const auto& mp : params) paramPaths_.push_back(mp.path);

    // ---- the evidence ------------------------------------------------------
    const std::string opLabel = "fitParameters(membrane)";
    const EvidencePartition part = EvidencePartition::read(dict, opLabel);
    part.announce(opLabel, verbosity);
    std::vector<MemSet> sets;
    for (const auto& d : part.fit())        sets.push_back({ d, false, "" });
    for (const auto& d : part.validation()) sets.push_back({ d, true,  "" });
    for (auto& s : sets) s.sha256 = membraneFit::fileSha256(s.ds.path, site);

    std::vector<MemRow> rows;
    std::set<std::string> lawIons;   // filled once the law has run
    for (std::size_t si = 0; si < sets.size(); ++si)
    {
        const auto& ds = sets[si].ds;
        const std::string where = site + " dataset '" + ds.path + "'";
        const EvidencePartition::Table t = EvidencePartition::loadTable(ds, opLabel);
        memSets_.push_back(fs::path(ds.path).stem().string());
        memSetHeldOut_.push_back(sets[si].heldOut);
        //  held constants
        scalar Tconst = NaN;
        if (t.file->found("T"))
        {
            if (!t.file->hasDimensions("T"))
                throw std::runtime_error(where + ": the held-constant `T` declares no unit --"
                    " write `T 293.15 K;`");
            Tconst = t.file->lookupScalar("T", Dims::temperature);
        }
        std::vector<std::pair<std::string, scalar>> feedConst;
        if (t.file->found("feed"))
        {
            auto f = t.file->subDict("feed");
            for (const auto& k : f->keys())
            {
                if (!f->hasDimensions(k))
                    throw std::runtime_error(where + ": feed '" + k + "' declares no unit --"
                        " write `" + k + " 10 mol/m3;`");
                feedConst.push_back({ k, f->lookupScalar(k, Dims::concentration) });
            }
        }
        //  columns
        const int cJv = t.column("Jv"), cdP = t.column("dP"), cT = t.column("T");
        if ((cJv >= 0) == (cdP >= 0))
            throw std::runtime_error(where + ": declare exactly ONE of the columns `Jv` (the"
                " imposed permeate flux, m/s) and `dP` (the imposed transmembrane pressure)");
        if (cJv >= 0 && law != "DSPM-DE")
            throw std::runtime_error(where + ": a `Jv` column IMPOSES the permeate flux, and"
                " only DSPM-DE honours an imposed J_v (TransportContext::imposedJv) --"
                " give the transmembrane pressure `dP` (and `Jv_measured`) for " + law);
        if (cT >= 0 && std::isfinite(Tconst))
            throw std::runtime_error(where + ": `T` is declared BOTH as a held constant and"
                " as a column");
        if (cT < 0 && !std::isfinite(Tconst))
            throw std::runtime_error(where + ": declare the temperature -- `T 293.15 K;` or"
                " a `T` column");
        std::vector<std::pair<std::string, int>> feedCols;
        std::vector<std::size_t> measCols;
        std::vector<int> sigmaFor(t.names.size(), -1);
        for (std::size_t j = 0; j < t.names.size(); ++j)
        {
            const std::string& n = t.names[j];
            if ((int)j == cJv || (int)j == cdP || (int)j == cT) continue;
            if (n.rfind("c_", 0) == 0 && n.size() > 2)
            {
                const std::string comp = n.substr(2);
                for (const auto& fc : feedConst)
                    if (fc.first == comp)
                        throw std::runtime_error(where + ": feed '" + comp + "' is declared"
                            " BOTH in `feed {}` and as a column");
                feedCols.push_back({ comp, (int)j });
                continue;
            }
            if ((n.rfind("R_", 0) == 0 && n.size() > 2) || n == "Jv_measured")
            {
                if (n == "Jv_measured" && cdP < 0)
                    throw std::runtime_error(where + ": `Jv_measured` beside an imposed `Jv`"
                        " is the same number twice -- a measured flux is fitted only where"
                        " the pressure is imposed");
                measCols.push_back(j);
                continue;
            }
            if (n.rfind("sigma_", 0) == 0)
            {
                const int k = t.column(n.substr(6));
                if (k < 0)
                    throw std::runtime_error(where + ": column '" + n + "' is the sigma of '"
                        + n.substr(6) + "', which the dataset does not carry");
                sigmaFor[k] = (int)j;
                continue;
            }
            throw std::runtime_error(where + ": column '" + n + "' is not one this residual"
                " reads -- Accepted: Jv | dP, T, c_<component>, R_<component or ion>,"
                " Jv_measured, sigma_<column>.  An ignored column is a measurement the author"
                " believes was fitted.");
        }
        if (measCols.empty())
            throw std::runtime_error(where + ": no measured column (R_<x>, Jv_measured) --"
                " a dataset with nothing measured cannot be fitted or scored");
        if (feedCols.empty() && feedConst.empty())
            throw std::runtime_error(where + ": declare the feed -- `feed { <component> <c>"
                " mol/m3; }` or `c_<component>` columns");
        for (const auto& fc : feedConst)
            if (!hasComponent(thermo, fc.first))
                throw std::runtime_error(where + ": feed component '" + fc.first + "' is not"
                    " a component of this case's thermoPhysPropDict");
        for (const auto& fc : feedCols)
            if (!hasComponent(thermo, fc.first))
                throw std::runtime_error(where + ": feed component '" + fc.first + "' is not"
                    " a component of this case's thermoPhysPropDict");
        if (weighting == "sigma")
            for (std::size_t j : measCols)
                if (sigmaFor[j] < 0)
                    throw std::runtime_error(where + ": `weighting sigma;` and column '"
                        + t.names[j] + "' carries no `sigma_" + t.names[j] + "` column");
        std::vector<std::size_t> qIdx;
        for (std::size_t j : measCols)
        {
            auto it = std::find(memQuantities_.begin(), memQuantities_.end(), t.names[j]);
            if (it == memQuantities_.end()) { memQuantities_.push_back(t.names[j]); it = memQuantities_.end() - 1; }
            qIdx.push_back(std::size_t(it - memQuantities_.begin()));
        }
        memSetQuantities_.push_back(qIdx);
        for (const auto& r : t.rows)
        {
            MemRow row;
            row.set = si;
            row.heldOut = sets[si].heldOut;
            row.T = cT >= 0 ? r[cT] : Tconst;
            row.feed = feedConst;
            for (const auto& fc : feedCols) row.feed.push_back({ fc.first, r[fc.second] });
            row.feed.erase(std::remove_if(row.feed.begin(), row.feed.end(),
                [](const std::pair<std::string, scalar>& f) { return !(f.second > 0.0); }),
                row.feed.end());
            if (row.feed.empty())
                throw std::runtime_error(where + ": a row has no component at a positive"
                    " concentration");
            row.imposedJv = cJv >= 0;
            if (row.imposedJv) row.Jv = r[cJv]; else row.dP = r[cdP];
            if (!((row.imposedJv ? row.Jv : row.dP) > 0.0))
                throw std::runtime_error(where + ": every imposed Jv / dP must be positive");
            for (std::size_t j : measCols)
            {
                MemMeas m;
                m.column = t.names[j];
                m.isFlux = (m.column == "Jv_measured");
                m.target = m.isFlux ? "Jv" : m.column.substr(2);
                m.value  = r[j];
                m.sigma  = (weighting == "sigma") ? r[sigmaFor[j]] : 1.0;
                if (!(m.sigma > 0.0))
                    throw std::runtime_error(where + ": sigma_" + m.column + " must be > 0");
                if (m.isFlux && !(m.value > 0.0))
                    throw std::runtime_error(where + ": Jv_measured must be > 0");
                row.meas.push_back(m);
            }
            rows.push_back(std::move(row));
        }
    }
    std::size_t nFitTerms = 0, nHeldTerms = 0;
    for (const auto& r : rows) (r.heldOut ? nHeldTerms : nFitTerms) += r.meas.size();
    if (!predicting && nFitTerms < P + 1)
        throw std::runtime_error(site + ": " + std::to_string(nFitTerms) + " fitted"
            " measurement(s) cannot determine " + std::to_string(P) + " parameter(s) --"
            " need at least " + std::to_string(P + 1) + ".  A fit on fewer points is a"
            " fabrication; REFUSED by name.");
    if (part.engaged() && !part.validation().empty())
        part.requireNonEmptyValidation(nHeldTerms, opLabel);

    // ---- the film, the osmotic model ---------------------------------------
    std::unique_ptr<MassTransferModel> corr;
    MassTransferContext hyd;
    scalar kConst = 0.0;
    if (res->found("massTransfer"))
    {
        if (res->found("k_film"))
            throw std::runtime_error(site + ": declare `k_film` OR `massTransfer {}`, not both");
        auto mt = res->subDict("massTransfer");
        MassTransferModel::registerBuiltins();
        corr = MassTransferModel::New(mt->lookupWord("model"));
        corr->readParameters(mt);
        if (!mt->found("viscosity") || !mt->found("density"))
            throw std::runtime_error(site + ": massTransfer {} must declare `viscosity`"
                " (Pa.s) and `density` (kg/m3)");
        hyd.mu  = mt->lookupScalar("viscosity");
        hyd.rho = mt->lookupScalar("density");
        hyd.u   = mt->lookupScalarOrDefault("velocity", 0.0);
        hyd.d_h = mt->lookupScalarOrDefault("hydraulicDiameter", 0.0, Dims::length);
    }
    else if (res->found("k_film"))
        kConst = res->lookupScalar("k_film");
    else
        throw std::runtime_error(site + ": declare the film -- `k_film <m/s>;` or"
            " `massTransfer { model ...; }` (intrinsic data with no film: a large k_film,"
            " e.g. 10 m/s, NanoFiltran's \"no polarisation\")");
    const scalar Dneutral = res->lookupScalarOrDefault("diffusivity", NaN, Dims::diffusivity);
    OsmoticModel::registerBuiltins();
    std::unique_ptr<OsmoticModel> osm;
    if (res->found("osmotic"))
    {
        auto os = res->subDict("osmotic");
        osm = OsmoticModel::New(os->lookupWordOrDefault("model", "vanHoff"));
        osm->readParameters(os);
    }
    else
        osm = OsmoticModel::New("vanHoff");
    const DictPtr lawParams0 = res->found("transportParameters")
        ? res->subDict("transportParameters")->deepCopy() : nullptr;
    //  The law reads its declared block ONCE here, on the AUTHORED dict: every
    //  key is validated before any row runs, and the unread-key audit sees the
    //  keys the evaluations below read on copies.
    if (res->found("transportParameters"))
    {
        CoutSilencer quiet(true);
        membrane::TransportModel::New(law)->readParameters(res->subDict("transportParameters"));
    }

    //  One law per row, so each row's pore is warm-started from its OWN
    //  previous solve (a pore of another feed is not a start).
    std::vector<std::unique_ptr<membrane::TransportModel>> rowLaw(rows.size());
    std::vector<std::unique_ptr<Polarisation>>   rowPol(rows.size());
    const bool lawFree = std::any_of(params.begin(), params.end(),
                                     [](const MemParam& m) { return m.inLaw; });
    bool firstEval = true;

    // ---- one evaluation: the model value of every measurement --------------
    struct Eval { std::vector<std::vector<scalar>> model; std::vector<scalar> Jw; bool ok = true; std::string why; };
    auto natural = [&](const sVector& th) -> sVector
    {
        sVector v(P);
        for (std::size_t i = 0; i < P; ++i) v[i] = params[i].logScale ? std::exp(th[i]) : th[i];
        return v;
    };
    auto evaluate = [&](const sVector& vals, bool onlyFit) -> Eval
    {
        Eval E;
        E.model.assign(rows.size(), {});
        E.Jw.assign(rows.size(), NaN);
        try
        {
            DictPtr rec = baseDict->deepCopy();
            DictPtr lp  = lawParams0 ? lawParams0->deepCopy() : nullptr;
            for (std::size_t i = 0; i < P; ++i)
                (params[i].inLaw ? lp : rec)->setScalarAtPath(params[i].inner, vals[i]);
            Membrane mem;
            mem.readFromDict(rec);
            for (std::size_t k = 0; k < rows.size(); ++k)
            {
                const MemRow& row = rows[k];
                if (onlyFit && row.heldOut) continue;
                //  the law's own announcements, once: the first row of the first
                //  evaluation speaks, every other is the same law again
                CoutSilencer quiet(!firstEval || k > 0);
                if (!rowLaw[k] || lawFree)
                {
                    rowLaw[k] = membrane::TransportModel::New(law);
                    if (lp) rowLaw[k]->readParameters(lp);
                }
                std::vector<std::size_t> soluteIdx;
                std::vector<scalar> c_b;
                for (const auto& f : row.feed)
                { soluteIdx.push_back(thermo.indexOf(f.first)); c_b.push_back(f.second); }
                if (!rowPol[k])
                    rowPol[k] = std::make_unique<Polarisation>(buildPolarisation(res, thermo,
                        soluteIdx, corr.get(), kConst, Dneutral, row.T,
                        "membrane fit '" + opName + "'", firstEval ? verbosity : 0,
                        rowLaw[k]->decomposesSaltsIntoIons()));
                std::vector<scalar> B_s(soluteIdx.size(), 0.0);
                for (std::size_t s = 0; s < soluteIdx.size(); ++s)
                    B_s[s] = mem.B_s(row.feed[s].first);
                const scalar Pp = 1.0e5;
                const scalar Pf = row.imposedJv ? 2.0e5 : Pp + row.dP;
                TransportContext ctx{ thermo, soluteIdx, B_s, mem.A_w(), *rowPol[k], hyd,
                                      Pf, Pp, row.T, c_b, *osm, &mem, nullptr };
                if (row.imposedJv) ctx.imposedJv = row.Jv;
                const TransportSolution sol = rowLaw[k]->localFluxes(ctx);
                E.Jw[k] = sol.J_w;
                //  the ion states, summed by species
                std::map<std::string, std::array<scalar, 3>> ion;
                for (const auto& st : sol.ions)
                {
                    auto& a = ion[st.name];
                    a[0] += st.c_bulk; a[1] += st.c_wall; a[2] += st.c_perm;
                    lawIons.insert(st.name);
                }
                for (const auto& m : row.meas)
                {
                    scalar v = NaN;
                    if (m.isFlux) v = sol.J_w;
                    else
                    {
                        bool hit = false;
                        for (std::size_t s = 0; s < soluteIdx.size(); ++s)
                            if (row.feed[s].first == m.target)
                            {
                                const scalar ref = rejection == "intrinsic" ? sol.c_m[s] : c_b[s];
                                v = 1.0 - sol.c_p[s] / ref;
                                hit = true;
                            }
                        if (!hit)
                        {
                            auto it = ion.find(m.target);
                            if (it == ion.end())
                                throw std::runtime_error(site + ": measured column '" + m.column
                                    + "' names '" + m.target + "', which is neither a component"
                                      " of the row's feed nor an ion the " + law + " law"
                                      " reports for it");
                            const scalar ref = rejection == "intrinsic" ? it->second[1] : it->second[0];
                            v = 1.0 - it->second[2] / ref;
                        }
                    }
                    if (!std::isfinite(v))
                        throw std::runtime_error("the law returned a non-finite " + m.column);
                    E.model[k].push_back(v);
                }
            }
        }
        catch (const std::exception& e)
        {
            if (firstEval) throw;   // a refusal at the start is the author's to read
            E.ok = false; E.why = e.what();
        }
        firstEval = false;
        return E;
    };
    auto termOf = [&](const MemMeas& m, scalar model) -> scalar
    {
        return m.isFlux ? (model - m.value) / m.value / (weighting == "sigma" ? m.sigma / m.value : 1.0)
                        : (model - m.value) / m.sigma;
    };
    auto residuals = [&](const Eval& E, sVector& r) -> scalar
    {
        r.clear();
        scalar chi2 = 0.0;
        for (std::size_t k = 0; k < rows.size(); ++k)
        {
            if (rows[k].heldOut) continue;
            for (std::size_t q = 0; q < rows[k].meas.size(); ++q)
            {
                const scalar t = termOf(rows[k].meas[q], E.model[k][q]);
                r.push_back(t); chi2 += t * t;
            }
        }
        return chi2;
    };

    // ---- the banner ------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n==============  FitParameters (MEMBRANE)  ==============\n"
                  << "  Law:        " << law << "   base record " << baseName
                  << " (" << basePath << ")\n"
                  << "  Data:       " << rows.size() << " operating point(s) in "
                  << sets.size() << " dataset(s): " << nFitTerms << " fitted measurement(s), "
                  << nHeldTerms << " held out\n"
                  << "  Rejection:  " << rejection << "   weighting " << weighting
                  << (weighting == "absolute" ? " (a rejection as a fraction, a flux relative;"
                                                " no measurement uncertainty is read)" : "")
                  << "\n  Rows are evaluated in SERIES, each with its own warm-started law.\n";
        if (predicting)
            std::cout << "  NO FREE PARAMETER: a PREDICTION -- every row evaluated at the"
                         " base record's values, nothing fitted, nothing written.\n";
        else
            for (const auto& mp : params)
                std::cout << "  free:       " << std::left << std::setw(36) << mp.path
                          << std::right << " initial " << full(mp.initial) << " " << mp.unit
                          << (mp.logScale ? "   (ln-space)" : "") << "\n";
    }

    // ---- the fit -----------------------------------------------------------
    int maxIter = 60;
    scalar tol = 1.0e-10, fdStep = 1.0e-4, lambda = 1.0e-2;
    if (dict->found("options"))
    {
        auto o = dict->subDict("options");
        if (o->found("maxIter"))   maxIter = static_cast<int>(o->lookupScalar("maxIter"));
        if (o->found("tolerance")) tol     = o->lookupScalar("tolerance");
        if (o->found("fdStep"))    fdStep  = o->lookupScalar("fdStep");
        if (o->found("lambda0"))   lambda  = o->lookupScalar("lambda0");
    }
    sVector th(P);
    for (std::size_t i = 0; i < P; ++i)
        th[i] = params[i].logScale ? std::log(params[i].initial) : params[i].initial;
    auto clip = [&](sVector t) -> sVector
    {
        for (std::size_t i = 0; i < P; ++i)
        {
            const scalar lo = params[i].logScale ? (std::isfinite(params[i].lo) && params[i].lo > 0
                                ? std::log(params[i].lo) : -INFINITY) : params[i].lo;
            const scalar hi = params[i].logScale ? (std::isfinite(params[i].hi) && params[i].hi > 0
                                ? std::log(params[i].hi) : INFINITY) : params[i].hi;
            t[i] = std::min(std::max(t[i], lo), hi);
        }
        return t;
    };
    auto stepOf = [&](std::size_t i, scalar ti) -> scalar
    {
        return params[i].logScale ? fdStep : fdStep * std::max(std::abs(ti), scalar(1.0));
    };
    auto jacobian = [&](const sVector& t, const sVector& r0, std::vector<sVector>& J) -> bool
    {
        J.assign(r0.size(), sVector(P, 0.0));
        for (std::size_t i = 0; i < P; ++i)
        {
            sVector tp = t;
            const scalar h = stepOf(i, t[i]);
            tp[i] += h;
            const Eval E = evaluate(natural(tp), true);
            if (!E.ok) return false;
            sVector rp; residuals(E, rp);
            for (std::size_t k = 0; k < r0.size(); ++k) J[k][i] = (rp[k] - r0[k]) / h;
        }
        return true;
    };

    Eval E0 = evaluate(natural(th), predicting ? false : true);
    sVector r0; scalar chi2 = residuals(E0, r0);
    int iter = 0;
    bool converged = predicting;
    std::string stopWhy = predicting ? "prediction (no free parameter)" : "";
    if (verbosity >= 3 && !predicting)
        std::cout << "  iter   chi2            lambda\n  " << std::setw(4) << 0 << "   "
                  << std::scientific << std::setprecision(6) << chi2 << "\n";
    while (!predicting && iter < maxIter)
    {
        ++iter;
        std::vector<sVector> J;
        if (!jacobian(th, r0, J)) { stopWhy = "the law failed at a Jacobian step"; break; }
        bool accepted = false;
        for (int tries = 0; tries < 12 && !accepted; ++tries)
        {
            sVector dp = fitAlgebra::solveDamped(J, r0, lambda);
            sVector tn = th;
            for (std::size_t i = 0; i < P; ++i) tn[i] += dp[i];
            tn = clip(tn);
            const Eval En = evaluate(natural(tn), true);
            sVector rn;
            const scalar c2 = En.ok ? residuals(En, rn) : INFINITY;
            if (c2 < chi2)
            {
                const scalar rel = (chi2 - c2) / std::max(chi2, scalar(1e-300));
                scalar stepMax = 0.0;
                for (std::size_t i = 0; i < P; ++i) stepMax = std::max(stepMax, std::abs(tn[i] - th[i])
                                                       / (params[i].logScale ? 1.0 : std::max(std::abs(th[i]), scalar(1.0))));
                th = tn; r0 = rn; chi2 = c2; E0 = En;
                lambda = std::max(lambda / 10.0, scalar(1e-12));
                accepted = true;
                if (rel < tol || stepMax < 1e-9) { converged = true; stopWhy = "relative chi2 change below the tolerance"; }
            }
            else lambda *= 10.0;
        }
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << iter << "   " << std::scientific
                      << std::setprecision(6) << chi2 << "   " << std::setprecision(1) << lambda;
            const sVector v = natural(th);
            for (std::size_t i = 0; i < P; ++i) std::cout << "   " << std::setprecision(6) << v[i];
            std::cout << "\n";
        }
        if (!accepted) { converged = true; stopWhy = "no step lowers chi2 (a minimum at the solver's resolution)"; break; }
        if (converged) break;
    }
    if (!converged && stopWhy.empty()) stopWhy = "maxIter reached";

    // ---- round to the record's precision and evaluate EVERY row there -------
    sVector vals = natural(th);
    for (auto& v : vals) v = round6(v);
    sVector thR(P);
    for (std::size_t i = 0; i < P; ++i)
        thR[i] = params[i].logScale ? std::log(vals[i]) : vals[i];
    const Eval EF = evaluate(vals, false);
    if (!EF.ok)
        throw std::runtime_error(site + ": the law failed at the fitted values: " + EF.why);
    sVector rF; chi2 = residuals(EF, rF);

    // ---- statistics ----------------------------------------------------------
    const int dof = static_cast<int>(nFitTerms) - static_cast<int>(P);
    const scalar s2 = dof > 0 ? chi2 / dof : NaN;
    std::vector<sVector> JF;
    bool jOk = predicting ? true : jacobian(thR, rF, JF);
    std::vector<sVector> JtJ(P, sVector(P, 0.0));
    if (jOk)
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = 0; j < P; ++j)
                for (std::size_t k = 0; k < JF.size(); ++k) JtJ[i][j] += JF[k][i] * JF[k][j];
    bool invOk = false; scalar condPivot = 0.0;
    std::vector<sVector> C;
    if (!predicting && jOk) C = fitAlgebra::invertGaussJordan(JtJ, invOk, condPivot);
    //  identifiability on the RELATIVE-scaled Jacobian: the ln columns are
    //  already d r / d ln p; a natural column is scaled by max(|p|, 1)
    scalar condScaled = INFINITY;
    sVector sens(P, 0.0), colScale(P, 1.0);
    for (std::size_t i = 0; i < P; ++i)
        if (!params[i].logScale) colScale[i] = std::max(std::abs(vals[i]), scalar(1.0));
    if (!predicting && jOk)
    {
        std::vector<sVector> G(P, sVector(P, 0.0));
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = 0; j < P; ++j) G[i][j] = JtJ[i][j] * colScale[i] * colScale[j];
        const sVector ev = fitAlgebra::jacobiEig(G, nullptr);
        if (ev.front() > 0.0 && ev.back() > 0.0) condScaled = std::sqrt(ev.back() / ev.front());
        for (std::size_t i = 0; i < P; ++i)
            sens[i] = std::sqrt(G[i][i] / std::max<scalar>(1.0, scalar(JF.size())));
    }
    scalar maxAbsCorr = 0.0;
    std::map<std::string, scalar> corrMap;
    if (invOk)
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = i + 1; j < P; ++j)
            {
                const scalar den = std::sqrt(C[i][i] * C[j][j]);
                const scalar c = den > 0.0 ? std::clamp(C[i][j] / den, scalar(-1), scalar(1)) : 0.0;
                corrMap["corr." + std::to_string(i) + "." + std::to_string(j)] = c;
                maxAbsCorr = std::max(maxAbsCorr, std::abs(c));
            }
    std::vector<std::string> activeBounds;
    for (std::size_t i = 0; i < P; ++i)
    {
        const auto& mp = params[i];
        const scalar rel = 1e-6 * std::max(std::abs(vals[i]), scalar(1e-300));
        if ((std::isfinite(mp.lo) && vals[i] <= mp.lo + rel) || (std::isfinite(mp.hi) && vals[i] >= mp.hi - rel))
            activeBounds.push_back(mp.path);
    }
    const scalar tc = fitAlgebra::tCrit95(dof);
    sVector se(P, NaN);
    if (invOk && dof > 0)
        for (std::size_t i = 0; i < P; ++i)
        {
            const scalar var = s2 * C[i][i];
            const scalar seT = var > 0.0 ? std::sqrt(var) : NaN;
            se[i] = params[i].logScale ? vals[i] * seT : seT;   // delta method
        }
    const bool seFinite = std::all_of(se.begin(), se.end(), [](scalar v) { return std::isfinite(v); });
    const bool identifiable = !predicting && converged && invOk && dof > 0 && seFinite
                              && condScaled < 1.0e8 && maxAbsCorr < 0.999 && activeBounds.empty();

    //  held-out and in-sample scores (rejection points, flux per cent)
    auto score = [&](bool held, std::size_t& n) -> scalar
    {
        scalar s = 0.0; n = 0;
        for (std::size_t k = 0; k < rows.size(); ++k)
        {
            if (rows[k].heldOut != held) continue;
            for (std::size_t q = 0; q < rows[k].meas.size(); ++q)
            {
                const auto& m = rows[k].meas[q];
                const scalar d = EF.model[k][q] - m.value;
                s += m.isFlux ? 100.0 * std::abs(d) / m.value : 100.0 * std::abs(d);
                ++n;
            }
        }
        return n ? s / scalar(n) : NaN;
    };
    std::size_t nH = 0, nF = 0;
    const scalar aadHeld = score(true, nH);
    const scalar aadFit  = score(false, nF);
    const std::string verdict = CurationDossier::verdictOf(part, nH > 0, aadHeld);

    // ---- publish ---------------------------------------------------------------
    diag_["n_points"]       = static_cast<scalar>(rows.size());
    diag_["n_fit"]          = static_cast<scalar>(nFitTerms);
    diag_["n_heldOut"]      = static_cast<scalar>(nHeldTerms);
    diag_["n_params"]       = static_cast<scalar>(P);
    diag_["converged"]      = converged ? 1.0 : 0.0;
    diag_["iter"]           = static_cast<scalar>(iter);
    diag_["chi2"]           = chi2;
    diag_["dof"]            = static_cast<scalar>(dof);
    if (std::isfinite(s2))  diag_["chi2_reduced"] = s2;
    diag_["rms"]            = nFitTerms ? std::sqrt(chi2 / scalar(nFitTerms)) : NaN;
    diag_["identifiable"]   = identifiable ? 1.0 : 0.0;
    diag_["inSample_AAD_pct"] = aadFit;
    if (nH) diag_["heldOut_AAD_pct"] = aadHeld;
    if (!predicting)
    {
        if (std::isfinite(condScaled)) diag_["cond_scaled"] = condScaled;
        diag_["maxAbsCorr"] = maxAbsCorr;
        for (const auto& kv : corrMap) diag_[kv.first] = kv.second;
    }
    for (std::size_t i = 0; i < P; ++i)
    {
        const std::string k = "fit." + std::to_string(i);
        diag_[k + ".value"] = vals[i];
        memUnits_[k] = params[i].unit;
        if (identifiable)
        {
            diag_[k + ".stderr"] = se[i];
            diag_[k + ".ci95"]   = tc * se[i];
        }
        diag_["sensitivity." + std::to_string(i)] = sens[i];
    }
    headline_ = { "heldOut_AAD_pct", "chi2_reduced", "converged", "identifiable" };
    if (!nH) headline_.erase(headline_.begin());

    {
        PublishedTable tab;
        tab.name = "fitPoints";
        tab.description = "one row per measured quantity of each operating point: the"
                          " measurement, the fitted model and the residual (model - measured)";
        tab.columns = { { "point", "-" }, { "Jv_mps", "m/s" }, { "measured", "-" },
                        { "model", "-" }, { "residual", "-" }, { "set", "-" },
                        { "quantity", "-" }, { "heldOut", "-" }, { "dP_Pa", "Pa" } };
        std::size_t pt = 0;
        for (std::size_t k = 0; k < rows.size(); ++k)
            for (std::size_t q = 0; q < rows[k].meas.size(); ++q)
            {
                const auto& m = rows[k].meas[q];
                const auto it = std::find(memQuantities_.begin(), memQuantities_.end(), m.column);
                tab.rows.push_back({ static_cast<scalar>(++pt), EF.Jw[k], m.value, EF.model[k][q],
                    EF.model[k][q] - m.value, static_cast<scalar>(rows[k].set + 1),
                    static_cast<scalar>(it - memQuantities_.begin() + 1),
                    rows[k].heldOut ? 1.0 : 0.0, rows[k].imposedJv ? NaN : rows[k].dP });
            }
        tables_.push_back(std::move(tab));
    }

    //  THE CURATION AXIS (words): always present, as the other fits do.
    curation_["verdict"] = verdict;
    if (part.engaged())
    {
        curation_["partitionFingerprint"] = part.fingerprint();
        if (part.hasAcceptance())
        {
            std::ostringstream b; b << part.acceptanceMaxAADPct();
            curation_["acceptanceMaxAADPct"] = b.str();
            curation_["acceptanceOrigin"]    = part.acceptanceOrigin();
        }
        else
            curation_["acceptanceMaxAADPct"] = "none declared before the fit";
    }
    else
        curation_["evidence"] = "legacy single `dataset` -- every point fitted, no"
                                " validation claimed";
    curation_["heldOutStatistic"] = "mean |R_model - R_measured| x 100 (rejection points);"
                                    " a flux term 100 |dJ|/J";

    // ---- the report -----------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n  RESULT  (" << (converged ? "converged" : "NOT CONVERGED") << ": "
                  << stopWhy << ", " << iter << " iteration(s))\n";
        for (std::size_t i = 0; i < P; ++i)
        {
            std::cout << "    " << std::left << std::setw(36) << params[i].path << std::right
                      << " = " << sig6(vals[i]) << " " << params[i].unit;
            if (identifiable)
                std::cout << "   +/- " << std::setprecision(3) << std::scientific << tc * se[i]
                          << " (95 %)";
            std::cout << std::defaultfloat << "\n";
        }
        if (!predicting)
        {
            std::cout << "    chi2 " << std::scientific << std::setprecision(5) << chi2
                      << " over " << nFitTerms << " fitted measurement(s), dof " << dof
                      << ";  in-sample AAD " << std::fixed << std::setprecision(3) << aadFit
                      << " points  [IN-SAMPLE]\n"
                      << "  IDENTIFIABILITY\n"
                      << "    condition number (relative-scaled Jacobian) "
                      << std::scientific << std::setprecision(3) << condScaled
                      << ";  max |correlation| " << std::fixed << std::setprecision(4)
                      << maxAbsCorr << "\n";
            for (std::size_t i = 0; i < P; ++i)
                std::cout << "    sensitivity of the residual to " << params[i].path << ": "
                          << std::scientific << std::setprecision(3) << sens[i]
                          << (params[i].logScale ? " per unit ln" : " per unit") << "\n";
            for (const auto& kv : corrMap)
            {
                const auto a = std::stoul(kv.first.substr(5, kv.first.find('.', 5) - 5));
                const auto b = std::stoul(kv.first.substr(kv.first.rfind('.') + 1));
                std::cout << "    correlation " << params[a].path << " / " << params[b].path
                          << " = " << std::fixed << std::setprecision(4) << kv.second << "\n";
            }
            for (const auto& b : activeBounds)
                std::cout << "    ACTIVE BOUND: '" << b << "' ended on its declared min/max --"
                             " the data and the declared domain disagree\n";
            std::cout << "    -> " << (identifiable ? "IDENTIFIABLE" : "NOT IDENTIFIABLE")
                      << " (requires: converged, J^T J invertible, cond < 1e8, |corr| < 0.999, no active"
                         " bound)\n";
        }
        std::cout << "  HELD-OUT EVIDENCE\n";
        if (nH)
            std::cout << "    " << nH << " measurement(s); AAD " << std::fixed
                      << std::setprecision(3) << aadHeld << " points of rejection"
                         " (mean |R_model - R_measured| x 100)\n";
        else
            std::cout << "    none\n";
        if (part.hasAcceptance())
            std::cout << "  ACCEPTANCE (declared before the fit): maxAAD "
                      << part.acceptanceMaxAADPct() << "  -- " << part.acceptanceOrigin() << "\n";
        std::cout << "  VERDICT\n    " << verdict << "\n";
    }

    // ---- the record (C152) -------------------------------------------------------
    if (dict->found("output") && dict->subDict("output")->found("record"))
    {
        auto out = dict->subDict("output");
        const std::string recPath = out->lookupWord("record");
        records::refuseStandardsWrite(site, "record", recPath);
        const fs::path rp(recPath);
        if (rp.is_absolute() || rp.parent_path() != fs::path("constant/assets")
            || rp.extension() != ".dat")
            throw std::runtime_error(site + ": `record " + recPath + "` -- a fitted membrane"
                " record is written to the case's constant/assets/<name>.dat, the one home the"
                " membrane registry reads; anywhere else no unit could find it");
        //  The name the record registers under has ONE home, shared with the
        //  order check that matches a by-name read against it (PropsPlan.H).
        const std::string recName = propsPlan::fittedRecordName(out, recPath);
        if (predicting)
            throw std::runtime_error(site + ": `output { record ...; }` on an operation with no"
                " free parameter -- a prediction fits nothing, so there is no fitted record");
        if (lawFree)
            throw std::runtime_error(site + ": `output { record ...; }` with a free parameter in"
                " transportParameters -- " + law + "'s numbers are the law's block, not a"
                " membrane record's; the fit reports them and the case declares them");
        if (!identifiable)
            throw std::runtime_error(site + ": the fit did not EARN a record (" +
                std::string(!converged ? "not converged" : !activeBounds.empty() ?
                "a parameter on its declared bound" : "not identifiable") + ") -- no record is"
                " written; the values above are reported, not promoted");
        if (recName == baseName)
            throw std::runtime_error(site + ": the record's name '" + recName + "' is its own"
                " base record's -- a fit that overwrote its base would change the values it"
                " holds fixed; name the fitted record differently");

        //  the fingerprints, from the ONE home Process mode re-computes them in
        const std::string fitSha = membraneFit::fitBlockSha256("system/propsDict", opName, site);
        const std::string baseSha = membraneFit::fileSha256(basePath, site);
        const std::string caseName = fs::current_path().filename().string();

        DictPtr rec = baseDict->deepCopy();
        for (std::size_t i = 0; i < P; ++i) rec->setScalarAtPath(params[i].inner, vals[i]);
        Membrane fm; fm.readFromDict(rec);
        auto isFree = [&](const std::string& p) -> int
        {
            for (std::size_t i = 0; i < P; ++i) if (params[i].path == p) return int(i);
            return -1;
        };
        auto valueLine = [&](const std::string& key, const std::string& path, scalar v,
                             const std::string& unit) -> std::string
        {
            std::ostringstream o;
            const int i = isFree(path);
            o << key << std::string(key.size() < 22 ? 22 - key.size() : 1, ' ')
              << (i >= 0 ? sig6(v) : full(v)) << ";   // " << unit << ", "
              << (i >= 0 ? "FITTED" : "held at " + baseName + "'s value");
            return o.str();
        };
        std::ostringstream body;
        body << "name           " << recName << ";\n"
             << "kind           " << baseMem.kind() << ";\n"
             << "manufacturer   \"" << (baseMem.manufacturer().empty() ? baseName
                                        : baseMem.manufacturer()) << "\";\n\n"
             << "provenance     fittedToCase;\n"
             << "fittedAgainst  " << caseName << ";\n\n"
             << valueLine("A_w", "A_w", fm.A_w(), "m/(s Pa), raw SI") << "\n";
        if (!fm.allBs().empty())
        {
            body << "\npermeabilities\n{\n";
            for (const auto& kv : fm.allBs())
                body << "    " << valueLine(kv.first, "permeabilities." + kv.first, kv.second, "m/s") << "\n";
            body << "}\n";
        }
        if (fm.hasPoreModel())
        {
            body << "\nporeModel\n{\n"
                 << "    " << valueLine("poreRadius", "poreModel.poreRadius", fm.poreRadius_m(), "m") << "\n"
                 << "    " << valueLine("porosityOverThickness", "poreModel.porosityOverThickness",
                                        fm.porosityOverThickness(), "1/m") << "\n";
            if (fm.hasChargeDensity())
                body << "    " << valueLine("chargeDensity", "poreModel.chargeDensity",
                                            fm.chargeDensity_molm3(), "mol/m3, signed") << "\n";
            if (fm.hasPoreDielectric())
                body << "    " << valueLine("poreDielectric", "poreModel.poreDielectric",
                                            fm.poreDielectric(), "-") << "\n";
            body << "}\n";
        }
        if (fm.P_max_bar() > 0) body << "\nP_max          " << full(fm.P_max_bar()) << ";   // bar, " << baseName << "'s rating\n";
        if (fm.T_max_K()   > 0) body << "T_max          " << full(fm.T_max_K()) << ";   // K\n";
        if (fm.pH_min()    > 0) body << "pH_min         " << full(fm.pH_min()) << ";\n";
        if (fm.pH_max()    > 0) body << "pH_max         " << full(fm.pH_max()) << ";\n";
        if (fm.MWCO_Da()   > 0) body << "MWCO           " << full(fm.MWCO_Da()) << ";   // Da\n";

        std::ostringstream fit;
        fit << "\nfit\n{\n"
            << "    origin            fitted;\n"
            << "    method            \"fitParameters, residual kind membrane, model " << law
            << ": Levenberg-Marquardt on " << rejection << " rejections"
            << (std::any_of(rows.begin(), rows.end(), [](const MemRow& r) {
                    return std::any_of(r.meas.begin(), r.meas.end(), [](const MemMeas& m) { return m.isFlux; }); })
                    ? " and fluxes" : "")
            << ", weighting " << weighting << "\";\n"
            << "    fittedInCase      " << caseName << ";\n"
            << "    operation         " << opName << ";\n"
            << "    propsDict         \"system/propsDict\";\n"
            << "    fitBlockSha256    \"" << fitSha << "\";\n"
            << "    baseRecord        " << baseName << ";\n"
            << "    baseRecordSha256  \"" << baseSha << "\";\n"
            << "    recordSha256      \"" << membraneFit::recordValuesSha256(
                   Dictionary::fromString(body.str(), recPath)) << "\";\n"
            << "    datasets\n    (\n";
        for (const auto& s : sets)
            fit << "        { role " << (s.heldOut ? "validation" : "fit") << "; dataset \""
                << s.ds.path << "\"; sha256 \"" << s.sha256 << "\"; }\n";
        fit << "    );\n"
            << "    verdict           " << verdict << ";\n";
        if (part.hasAcceptance())
        {
            std::ostringstream b; b << part.acceptanceMaxAADPct();
            fit << "    acceptance        { maxAADPoints " << b.str() << "; origin \""
                << part.acceptanceOrigin() << "\"; }\n";
        }
        else
            fit << "    acceptance        none;   // no band was declared before the fit\n";
        fit << "    heldOut           { measurements " << nH << "; AADPoints "
            << (nH ? sig6(aadHeld) : std::string("none")) << "; }\n"
            << "    inSample          { measurements " << nF << "; AADPoints " << sig6(aadFit)
            << "; chi2Reduced " << sig6(s2) << "; }\n"
            << "    identifiability   { conditionNumber " << sig6(condScaled)
            << "; maxAbsCorrelation " << sig6(maxAbsCorr) << "; }\n"
            << "    values            // the 95 % half-width is t(dof) x the standard error\n    {\n";
        //  per-value provenance, nested as the record nests the value
        //  (poreModel { poreRadius { ... } }), so a path reads the same in both
        {
            std::map<std::string, std::vector<std::size_t>> groups;   // "" = top level
            std::vector<std::string> order;
            for (std::size_t i = 0; i < P; ++i)
            {
                const auto dot = params[i].path.find('.');
                const std::string g = dot == std::string::npos ? "" : params[i].path.substr(0, dot);
                if (!groups.count(g)) order.push_back(g);
                groups[g].push_back(i);
            }
            auto entry = [&](std::size_t i, const std::string& in)
            {
                const auto dot = params[i].path.find('.');
                const std::string leaf = dot == std::string::npos ? params[i].path
                                                                  : params[i].path.substr(dot + 1);
                fit << in << leaf << "  { origin fitted; stderr " << sig6(se[i]) << "; ci95 "
                    << sig6(tc * se[i]) << "; unit \"" << params[i].unit << "\"; }\n";
            };
            for (const auto& g : order)
            {
                if (g.empty()) { for (std::size_t i : groups[g]) entry(i, "        "); continue; }
                fit << "        " << g << "\n        {\n";
                for (std::size_t i : groups[g]) entry(i, "            ");
                fit << "        }\n";
            }
        }
        fit << "    }\n"
            << "    correlation\n    (\n";
        for (const auto& kv : corrMap)
        {
            const auto a = std::stoul(kv.first.substr(5, kv.first.find('.', 5) - 5));
            const auto b = std::stoul(kv.first.substr(kv.first.rfind('.') + 1));
            fit << "        { a " << params[a].path << "; b " << params[b].path << "; r "
                << sig6(kv.second) << "; }\n";
        }
        fit << "    );\n}\n";

        std::ofstream f(recPath);
        if (!f) throw std::runtime_error(site + ": cannot write '" + recPath + "'");
        f << "/*--------------------------------*- Choupo -*-----------------------*\\\n"
          << "  Membrane: " << recName << " -- WRITTEN BY A PROPERTIES-MODE FIT, not by hand.\n\n"
          << "  Operation '" << opName << "' of case '" << caseName << "' (fitParameters,\n"
          << "  residual kind membrane, model " << law << ") fitted the values marked FITTED\n"
          << "  below to the datasets named in fit {}; every other value is base record\n"
          << "  " << baseName << "'s.  Fitted values are rounded to 6 significant figures,\n"
          << "  and the verdict was taken at the rounded values.\n\n"
          << "  A Process-mode run checks the fingerprints in fit {} before it uses this\n"
          << "  record and REFUSES it, naming what changed, when a dataset, the fit block\n"
          << "  or the base record has moved since: re-run the case in Properties mode\n"
          << "  (runCase <case> props) to re-fit it.  An edit here is overwritten by the\n"
          << "  next Properties-mode run.\n"
          << "\\*---------------------------------------------------------------------------*/\n\n"
          << body.str() << fit.str();
        f.close();
        MembraneRegistry::registerFile(recPath);
        if (verbosity >= 1)
            std::cout << "  RECORD written: " << recPath << "  (membrane '" << recName
                      << "', verdict " << verdict << "; Process mode reads it and checks its"
                         " fingerprints)\n";
    }
    (void)lawIons;
    return (converged || predicting) ? 0 : 1;
}

} // namespace Choupo
