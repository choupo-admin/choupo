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
-------------------------------------------------------------------------------
Class
    Choupo::PropertySourceLog

Description
    WHERE EACH UNIT TOOK ITS LIQUID PROPERTIES FROM, AND THE NUMBER IT TOOK
    (DEV.md 4c C378, slice 0; docs/design/thermophysical-slice0-plan.md
    sections 3-4).

    A unit or a sizing pass that needs a liquid density, viscosity, surface
    tension or diffusivity either asks the property kernel through the one
    door (thermo/LiquidPropertyDoor.H) or computes it itself -- a record's
    25 C molar volume, a constant 1000 kg/m3, a value the case declares, a
    correlation of its own.  Slice 0 changes none of those numbers; it makes
    each of them SAY, per unit, what it was and where it came from.

    The question the printed table answers is the reader's: "I am looking at
    this unit -- which density did it use, what is the NUMBER, and does the
    same liquid get two different numbers in my flowsheet?"  So each line
    leads with the unit, gives the value with its unit (min .. max and the
    count when the unit took several in the run) and the state it asked at,
    then where the number came from in plain words.  Units of one type that
    share the source AND the value share a line.  When two consumers priced
    the same liquid state (T, P, composition) at different densities, one
    closing line says so.

    Two records are kept:
      * DECLARED -- at assembly, the classes of source each flowsheet unit
        says it may take (unitOperations/PropertySourceDeclarations.cpp);
      * USED     -- at run time, recorded by the code that took the number.
    The log prints the USED table and, only when what ran differs from what
    was declared, a [mismatch] line.  The result block `propertySources`
    carries both, the mismatches and the idle declarations.

    One run per process (or per WASM `run_case`): `clear()` at the top of
    every binary's main.  An outer driver's passes and a time-integrated
    run's instants AGGREGATE (TR-15): the value range covers them all.

    A NUMBER A UNIT USES IS ONE OBJECT WITH ITS DESCRIPTION: `ConstantSource`
    carries the value, the id and the words together, the site computes WITH
    `.value` and records WITH the same object, so the number and its
    description cannot be edited apart.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cstddef>
#include <atomic>
#include <limits>
#include <map>
#include <mutex>
#include <ostream>
#include <set>
#include <string>
#include <tuple>
#include <vector>

namespace Choupo {

//  A number a consumer uses instead of the kernel, and what it is.
struct ConstantSource
{
    double      value;      // in the property's SI unit
    const char* id;         // stable word, pinned by the golden row kind `source`
    const char* label;      // the plain words a student reads
};

//  A source that is not a single constant (a record field, the case's value).
struct NamedSource
{
    const char* id;
    const char* label;
};

//  What a consumer took at one call: the number (SI) and, when it knows
//  them, the state it asked at.  `composition` is a key of the mole
//  fractions, used only to recognise the SAME liquid priced twice.
struct Taken
{
    double      value = std::numeric_limits<double>::quiet_NaN();
    double      T     = std::numeric_limits<double>::quiet_NaN();     // K
    double      P     = std::numeric_limits<double>::quiet_NaN();     // Pa
    std::size_t composition = 0;                                      // 0: unknown
};

inline Taken took(double v,
                  double T = std::numeric_limits<double>::quiet_NaN(),
                  double P = std::numeric_limits<double>::quiet_NaN(),
                  std::size_t composition = 0)
{
    Taken t;
    t.value = v; t.T = T; t.P = P; t.composition = composition;
    return t;
}

//  A key of a composition rounded to 12 significant digits (same liquid).
std::size_t compositionKey(const std::vector<double>& x);

namespace liquidSource {
//  THE ONE HOME of each source a unit computes itself (plan, section 1).
inline const ConstantSource diluteCarrierDensity
    { 1000.0, "constant.diluteCarrier",
      "a constant of the unit, 1000 kg/m3: the dilute-carrier density the whole unit is built on" };
inline const ConstantSource rhoFeedDefault
    { 1000.0, "default.rhoFeed1000",
      "a constant of the unit, 1000 kg/m3, used because the case declares no feed density (rho_feed)" };
inline const ConstantSource batchDiafilterRhoDefault
    { 1000.0, "default.rho1000.announced",
      "a constant of the unit, 1000 kg/m3, used because the case declares no solution density (rho); announced" };
inline const ConstantSource dropletDensityFallback
    { 1000.0, "fallback.1000",
      "a constant of the unit, 1000 kg/m3, used because a solvent has no 25 C molar volume" };
inline const ConstantSource pumpHeadDensityFallback
    { 1000.0, "fallback.1000",
      "a constant of the unit, 1000 kg/m3, used for the head because no component has a liquid volume" };
inline const ConstantSource waterViscosityKnob
    { 1.0e-3, "default.water1e-3",
      "a constant of the unit, 1 mPa s (water near 20 C), used because the case declares no viscosity and no viscosity model" };
inline const ConstantSource waterSurfaceTensionFallback
    { 0.072, "fallback.water0.072",
      "a constant of the unit, 72 mN/m (water), used because the kernel could not give one" };
inline const ConstantSource soluteDiffusivityLegacy
    { 1.6e-9, "default.legacy1.6e-9",
      "a constant of the unit, 1.6e-9 m2/s (an approximate value for NaCl in water), used because the case declares no diffusivity and no model" };
inline const NamedSource recordVliqFlat
    { "bypass.recordVliq25C",
      "computed by the unit itself, not by the property kernel: each component's 25 C molar volume, with no temperature or pressure effect" };
inline const NamedSource recordVliqIonsMassKept
    { "bypass.recordVliq25C.ionsNoVolume",
      "computed by the unit itself, not by the property kernel: each component's 25 C molar volume, with no temperature or pressure effect; a dissolved ion keeps its mass and adds no volume" };
inline const NamedSource recordVliqSilentZero
    { "bypass.recordVliq25C.missingIsZero",
      "computed by the unit itself, not by the property kernel: each component's 25 C molar volume, with no temperature or pressure effect; a component without one adds no volume" };
inline const NamedSource solventVliqFlat
    { "bypass.solventVliq25C",
      "computed by the unit itself, not by the property kernel: the solvent's 25 C molar volume alone (the dissolved solids are not counted), with no temperature or pressure effect" };
inline const NamedSource solventsVliqIdealMix
    { "bypass.solventsVliq25C.idealMix",
      "computed by the unit itself, not by the property kernel: the solvents' 25 C molar volumes mixed ideally (the dissolved solids are not counted), with no temperature or pressure effect" };
inline const ConstantSource waterKinematicViscosity
    { 1.0e-6, "constant.waterKinematic1e-6",
      "a constant of the unit, 1e-6 m2/s: the kinematic viscosity of water near 20 C (no viscosity model is declared)" };
inline const NamedSource stokesEinsteinSolvent
    { "kernel.solventViscosity.StokesEinstein",
      "property kernel: the pure solvent's viscosity (the case's model), divided by the unit's 1000 kg/m3 carrier density" };
inline const NamedSource kernelLiquidDiffusivity
    { "kernel.liquidDiffusivity",
      "property kernel: the case's liquid-diffusivity model (solute at infinite dilution in the medium)" };
inline const NamedSource analysisDensity
    { "derived.laboratoryAnalysis",
      "derived from the laboratory analysis the case authorises: water's density at the sample temperature (Kell) plus the dissolved solids" };
inline const NamedSource benchmarkConstantDensity
    { "constant.benchmark.WilliamsOtto",
      "a constant of the published benchmark the unit reproduces: 50 lb/ft3 (800.9 kg/m3), equal for every species" };
inline const NamedSource declaredByCase
    { "declared.case", "the value the case declares for this unit" };
inline const NamedSource ownWilkeChang
    { "own.WilkeChang.mixtureViscosity",
      "computed by the unit itself, not by the property kernel: its own Wilke-Chang, both ways at infinite dilution in the mixture viscosity, combined linearly in mole fraction" };
inline const NamedSource speciesRecordD0
    { "record.speciesD0.StokesEinstein",
      "each ion's diffusivity from its species record, scaled to temperature by Stokes-Einstein" };
} // namespace liquidSource

class PropertySourceLog
{
public:
    static PropertySourceLog& instance()
    {
        static PropertySourceLog inst;
        return inst;
    }

    void clear();

    //  At assembly: unit `unit` of type `type` may take `property` from a
    //  source of `sourceClass` ("kernel", "bypass", "declared", "own",
    //  "record").
    void declare(const std::string& type, const std::string& unit,
                 const std::string& property, const std::string& sourceClass);

    //  At run time.  `sourceClass` "kernel": the number came through the door.
    //  `pressureNote`: "applied", "not applied", "not applied (saturated
    //  liquid)" or "" (no pressure involved).  `leftOut`: components left
    //  out of the call, comma-separated, "" when none.
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const std::string& sourceId,
             const std::string& label, const std::string& sourceClass,
             const std::string& pressureNote, const std::string& leftOut,
             const Taken& taken);
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const ConstantSource& s,
             const std::string& sourceClass = "bypass")
    {
        Taken t;
        t.value = s.value;
        use(type, unit, property, s.id, s.label, sourceClass, "", "", t);
    }
    void use(const std::string& type, const std::string& unit,
             const std::string& property, const NamedSource& s,
             const std::string& sourceClass, const Taken& taken,
             const std::string& pressureNote = "")
    { use(type, unit, property, s.id, s.label, sourceClass, pressureNote, "", taken); }

    //  The same, for the consumer being solved (Scope below); nothing is
    //  recorded when none is.
    void useHere(const std::string& property, const NamedSource& s,
                 const std::string& sourceClass, const Taken& taken,
                 const std::string& pressureNote = "");
    void useHere(const std::string& property, const ConstantSource& s,
                 const std::string& sourceClass = "bypass");
    //  ... with the words completed by a fact only the site knows (the
    //  crystalliser's zeroed components); the start is still the tag's.
    void useHere(const std::string& property, const NamedSource& s,
                 const std::string& addendum, const std::string& sourceClass,
                 const Taken& taken, const std::string& pressureNote);

    //  A THERMODYNAMIC MODEL THAT READS A COMPONENT'S 25 C LIQUID VOLUME AS A
    //  PARAMETER (Poynting, Wilson, Wilke-Chang, the mixed-solvent activity
    //  model, the solubility parameters): not a liquid property of a unit,
    //  but the same datum, so the table names it once per run.  `seen` is a
    //  site-local counter: the site records once per run at the cost of one
    //  relaxed load (the Poynting term sits on the K-value hot path).
    void useOnce(std::atomic<unsigned>& seen, const std::string& type, const std::string& unit,
                 const std::string& property, const NamedSource& s,
                 const std::string& sourceClass, const Taken& taken)
    {
        const unsigned g = generation_.load(std::memory_order_relaxed);
        if (seen.load(std::memory_order_relaxed) == g) return;
        seen.store(g, std::memory_order_relaxed);
        use(type, unit, property, s, sourceClass, taken);
    }
    void parameterOnce(std::atomic<unsigned>& seen, const char* model, const char* what)
    {
        const unsigned g = generation_.load(std::memory_order_relaxed);
        if (seen.load(std::memory_order_relaxed) == g) return;
        seen.store(g, std::memory_order_relaxed);
        std::lock_guard<std::mutex> lk(mutex_);
        parameters_[model] = what;
    }

    //  THE CONSUMER BEING SOLVED.  The flowsheet sets it around each unit's
    //  solve, so the door records a use without every helper (tray
    //  hydraulics, a slurry core) passing a name through.  A plain
    //  process-wide value, not thread-local: a unit that prices on a worker
    //  pool is still the unit being solved.
    class Scope
    {
    public:
        Scope(const std::string& type, const std::string& unit);
        ~Scope();
        Scope(const Scope&) = delete;
        Scope& operator=(const Scope&) = delete;
    private:
        std::string prevType_, prevUnit_;
    };
    //  False when no consumer is being solved (a props bench, a probe).
    bool current(std::string& type, std::string& unit) const;

    bool empty() const { return used_.empty() && declared_.empty() && parameters_.empty(); }

    //  The table the log prints, with the mismatches; nothing when empty.
    void printUsed(std::ostream& os) const;
    //  The result block (a leading ",\n" like the other optional blocks), or
    //  "" when nothing was declared or used.
    std::string json() const;

    struct Used
    {
        std::string type, unit, property, sourceId, label, sourceClass, pressureNote;
        std::set<std::string> leftOut;
        double vMin = 0, vMax = 0, TMin = 0, TMax = 0, PMin = 0, PMax = 0;
        long   count = 0, nValued = 0, nT = 0, nP = 0;
        //  (T, P, composition) -> value: the liquid states this consumer
        //  priced (density only; capped), to find one priced twice
        std::map<std::tuple<double, double, std::size_t>, double> states;
    };

private:
    PropertySourceLog() = default;
    mutable std::mutex mutex_;
    std::string currentType_, currentUnit_;
    std::atomic<unsigned> generation_{1};
    std::map<std::string, std::string> parameters_;   // model -> what it reads
    //  (unit, property, source id) -> what the unit took from it
    std::map<std::tuple<std::string, std::string, std::string>, Used> used_;
    //  (type, unit, property) -> declared source classes
    std::map<std::tuple<std::string, std::string, std::string>,
             std::set<std::string>> declared_;

    std::vector<std::string> mismatches() const;
    std::vector<std::string> idle() const;
    std::vector<std::string> pricedTwice() const;
    std::vector<std::string> constantBesideComputed() const;
};

} // namespace Choupo
