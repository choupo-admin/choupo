# Extending Choupo — writing your own code (and sharing it)

Most of the time you are a **user**: you author cases from plain-text dicts and
run the built-in unit ops and property methods. This guide is for the step
where you become an **author**: you write your OWN unit operation or your OWN
property-estimation method in C++, compiled into the case at run time — the
high point of the course, and the FLOWTRAN-style extension Choupo is built for.

Everything here is **glass-box**: build-time linking, the exact `g++` command is
printed, **no runtime `dlopen`, no macro self-registration**. Your code lives in
the case (`code/`), never in the engine source, until you choose to contribute it.

---

## 1. The mechanism in one picture

```
case/
├── system/{controlDict, flowsheetDict|propsDict}
├── constant/...                       (your thermo, as usual)
└── code/                              (your C++ — this is what makes you an author)
    ├── MyThing.H  MyThing.cpp         derive from a Choupo base class
    ├── registerUserTypes.cpp          register it in the factory
    └── options                        (optional) extra -I / -l / flags
```

- `bin/buildCode <case>` compiles `code/` against the Choupo library into a
  **per-case binary** (`code/.build/choupoCase`). It reads the case's
  `application` to pick the right engine entry (`choupoSolve` or `choupoProps`).
- `runCase <case>` compiles first (if there is a `code/`) then runs — so for the
  user it is still just "run it".
- The new type is registered at start-up by **your** `registerUserTypes()`,
  which the per-case binary links instead of the engine's empty stub.

---

## 2. A custom UNIT OPERATION (flowsheet)

Derive from `UnitOperation`, override `type()`, `solve()`, and (optionally)
`producedStreams()` + `kpis()`. Register it under `choupoSolve`.

```cpp
// code/MyReactor.H
#pragma once
#include "unitOperations/UnitOperation.H"
namespace Choupo {
class MyReactor : public UnitOperation {
public:
    const std::string& type() const override { return type_; }
    int solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
private:
    inline static const std::string type_ = "myReactor";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
};
}
```

```cpp
// code/registerUserTypes.cpp
#include "MyReactor.H"
#include <memory>
void registerUserTypes() {
    Choupo::UnitOperation::registerType(
        "myReactor", []{ return std::make_unique<Choupo::MyReactor>(); });
}
```

`solve()` receives the inlet as `feed { F; T; P; }` + `composition { ... }` and
your unit's `operation { ... }`. Read what you need, fill `produced_` with the
outlet stream(s), set `kpis_`. **Worked examples:**
`tutorials/steady/userops/userOp01_yield_reactor`, `userOp02_component_splitter`, and the
two ops in `tutorials/plant/twoSectorDemo` (a reactor + a column).

Build + run:
```
bin/buildCode tutorials/steady/userops/userOp01_yield_reactor
runCase       tutorials/steady/userops/userOp01_yield_reactor
```

---

## 3. A custom PROPERTY-ESTIMATION method (props bench)

The same mechanism, but derive from `PropertyOperation` and set the case's
`application choupoProps;`. This is how you ship your OWN estimation method —
a group-contribution variant, a corresponding-states correlation, your own fit.

```cpp
// code/MyEstimate.H
#pragma once
#include "propertyOps/PropertyOperation.H"
#include "core/Dictionary.H"
namespace Choupo {
class MyEstimate : public PropertyOperation {
public:
    const std::string& type() const override { return type_; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }
private:
    inline static const std::string type_ = "myEstimate";
    std::map<std::string, scalar> diag_;
};
}
```

`run()` receives the operation's own dict (read `dict->lookupScalar(...)`,
`dict->lookupDictList("groups")`, …); fill `diag_` with the numbers (they come
back as JSON, like a unit's KPIs, so the GUI can show them). Register it with
`PropertyOperation::registerType("myEstimate", …)` in `registerUserTypes.cpp`.

**Worked example:** `tutorials/props/estimate/userEstimate01_linear_tb` — a student's own
linear group-contribution Tb estimator (`Tb = base + Σ count·incr`).

Build + run:
```
bin/buildCode tutorials/props/estimate/userEstimate01_linear_tb
runCase       tutorials/props/estimate/userEstimate01_linear_tb
```

---

## 4. External dependencies (`code/options`)

The engine (`src/`) is dependency-free; only YOUR `code/` may reach outside.
Add include dirs / libraries / flags in `code/options`:

```
INCLUDE = -I/opt/coolprop/include -I/usr/include/eigen3
LIBS    = -L/opt/coolprop/lib -lCoolProp
FLAGS   = -O3
```

`buildCode` injects these into the `g++` command (and prints it).

---

## 5. Self-contained + distributable

A case carries **everything it needs inside the folder** — its components,
binary pairs, reactions, AND its `code/`. Zip the folder and send it to a
collaborator; they `buildCode` + `runCase` it. The compiled `code/.build/` and
logs are NOT needed in the zip (they rebuild). See
`tutorials/plant/twoSectorDemo` for a two-sector case that ships 10 components,
10 NRTL pairs, 5 reactions, and two custom compiled ops.

---

## 6. Sharing it under GPL-3.0-or-later

Your `code/` is **yours** — you keep the copyright. Choupo is GPL-3.0-or-later with
**inbound = outbound**: no CLA, no copyright assignment.

Two paths:
- **Keep it in your case.** Distribute the case (zip). Nothing else needed — it
  is your code, your licence choice (GPL-3.0-or-later recommended, to match Choupo).
- **Contribute it to Choupo.** Add the GPL-3.0-or-later SPDX header with **your own**
  copyright line, add your name to [`AUTHORS`](../../AUTHORS), sign your commits
  (`git commit -s`, the DCO), and submit. The full policy is in
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md). Curated **standard catalogue** data
  (`data/standards/`) is committee-managed and audited — propose it (e.g. promote
  a fit), do not edit it directly.

Good practices for code you intend to share:
- **Glass-box.** No hidden magic, no concealed defaults; if your op needs an
  initial guess or a bound, make it explicit in the dict and announce when it
  binds (the "no silent crutch" rule).
- **Units are mandatory** on dict scalars (`P 1 bar;` not `P 1;`).
- **Pin its numbers.** Add an `expected` file (`bin/runTests --record <case>`) so
  a golden-master test guards your op.
- **Document it.** A header comment saying what it models + its assumptions, and
  a one-line `description` in `controlDict`.
