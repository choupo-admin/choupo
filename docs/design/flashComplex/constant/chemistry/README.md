# `constant/chemistry/` — one file per reaction

Fifteen records, and only **two** of them are new to this case. The other
thirteen are byte-for-byte mirrors of `data/standards/chemistry/`, exactly as
`bin/choupo-import` would materialise a sealed closure. That ratio is the
point of the layout: a reaction is curated once and referenced by every case
that reaches it.

## Flat, not filed by chemical type

An earlier draft of this case put the calcium ion pairs under
`chemistry/aqueousComplexes/`. That subfolder is gone, and the argument that
killed it is `CaOH-formation.dat`: is calcium hydrolysis an *acid-base*
reaction or a *complexation*? Both readings are defensible, which means any
author filing the record has to guess, and any reader looking for it has to
guess the same way. A reaction has one name and one home; the physics that
groups reactions is a **query**, not a directory.

## What is deliberately NOT here

The **mineral solubility**. `CaCO3.dat` carries its own dissolution inside
`solidPhases { calcite { … } }`, and that is not an exception to the rule
above — it is the rule.

The criterion is *how many families the reaction couples*:

- couples **two** families (`Ca²⁺ + HCO₃⁻ = CaHCO₃⁺`) → it belongs to
  neither component, so it lives here;
- belongs to **one** component (the dissolution of *that component's own
  solid phase*) → it lives on that component, because moving it here would
  separate a phase from the substance whose phase it is.

The same applies to the salt-equilibrium anchor. `data/standards/chemistry/README.md`
states it for the catalogue; it is repeated here because a student reading
only the case would otherwise infer "all reactions live in `chemistry/`" and
then go looking for a calcite record that does not exist.

## Naming

By REACTION, never by the file's contents-of-convenience:
`water-dissociation.dat`, `CO2-dissolution.dat`, `CaHCO3-formation.dat`.

Two `recordType`s appear here:

- `aqueousSpeciation` — a species written as its formation from **masters**
  (`masters ( { ion H; nu 1; } … )`, plus `nuWater` when water participates);
- `gasLiquidEquilibrium` — a gas-liquid transfer, carrying the typed identity
  (`gasSpecies` / `dissolvedSpecies` / `solvent`) and its versioned
  `convention` profile.

## Identity has one home

A derived neutral or complex declares its identity **inline** in its
formation record (`ion "H2CO3"; z 0;`). It gets a file under
`constant/species/` only if it carries independent standard-state data of its
own. That is why nine species files sit beside fifteen reactions: `CO2aq`,
`H2CO3`, `NH3aq`, `HAc`, `H2Saq`, `CaHCO3`, `CaCO3aq` and `CaOH` are all
defined entirely by the reaction that forms them.

## The two new records

| file | why it is not a mirror |
|---|---|
| `H2CO3-formation.dat` | the ladder split — true carbonic acid, a rung the aggregate `CO2*` hides. `authority derivedFromReactions`. |
| `H2S-dissolution.dat` | **case-local override**: the catalogue record fuses the Henry step with the first dissociation, and this case needs them apart. |

`authority` is written on exactly those two, and on nothing else. A record
carrying its own measured `logK25` got that number from a measurement of its
own reaction — there is nothing to declare. The field exists for the case
where the number came from *somewhere else*, and writing it on all fifteen
would be fourteen copies of the same word.
