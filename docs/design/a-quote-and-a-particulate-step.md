# A quote and a particulate step

*DEV.md 4c C98, 2026-10-19.  Two rulings of Vítor's on the C97 phase A
findings (the apalutamide tablet plant): "P declarado pelo caso" and "Sim,
preço declarado".  Kind: ADR.  Status: shipped on a branch, the witness's
moved golden rows awaiting Vítor's approval.*

## 1. The two absences

* **The labour had no particulate term.**  Turton's operator count is
  `N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5` operators per shift, `P` the
  processing steps handling particulate solids.  `EconomicsPass` computed
  `sqrt(6.29 + 0.23 N_np)`: a plant that dries, blends, compacts, mills,
  tablets and coats was staffed like a fluid plant, and no line said so.
* **An item with no correlation had no capital.**  A tablet press, a coater,
  a GMP building: Choupo has no sizer and no cost correlation for them and
  does not invent one, so they were simply absent -- the apalutamide FCI was
  its solvent section alone.

## 2. The decisions

**P is declared by the case** (`economics { particulateSteps { count;
source; reason; } }`).  Which steps count is a judgement about the plant --
one flowsheet placeholder may be two steps, a unit may be none -- so the
engine does not count them.  Absent, `P = 0`, which keeps every case that
predates the term computing exactly what it did (measured: 20 costing cases,
every number and every report artefact byte-identical; only the console's
operator line gains the P term).  An UNDECLARED zero is announced when the
flowsheet holds a unit whose type handles particulate solids -- there the
zero is the engine's choice, not the author's.  The list of such types is
written once, beside the reading, with the header each was read from.

**A quote is declared per item** (`costing { quotes ( ... ); }`): value,
currency, year (and the index at that year when it is not the costing
year), `basis installed | purchased`, `kind equipment | facility`, source and
reason.  Identity is `unit` (a flowsheet unit with no sized item) or `item`
(something that is not a unit, a building) -- exactly one.  One home:
`src/postProcessing/costing/DeclaredQuote.{H,cpp}`; the costing pass prices
the quotes before it prints, so a malformed declaration refuses the pass
instead of trailing a half-printed table.

## 3. How a quote enters the money -- the convention, chosen and printed

* `C_p = value x CEPCI_run/cepci_quote x rate` (no index for the costing
  year's money, `usdToEur` for a USD quote).
* `C_BM = C_p` for `basis installed` -- the quote IS the installed cost.
  `basis purchased` needs the CASE's own `bareModuleFactor` with its source:
  **no installation factor is supplied by the engine**, because it has no
  correlation for the item to borrow one from.
* `C_TM = 1.18 C_BM`, Turton's contingency and fee, the same factor every
  correlation row carries: a vendor's price carries no project contingency.
* In the FCI ladder (`1.18 SUM C_BM + 0.5 SUM C_BM_base`) the quote's C_BM
  is a module's.  Its base value is published as the factor `C_BM_base`:
  C_BM for `kind equipment` (a machine drives the auxiliary-facilities
  estimate like any module) and **zero for `kind facility`** -- a building
  IS a facility, and estimating further auxiliaries as half of it would
  count buildings twice.

## 4. Rejected alternatives

* **The engine counts P from the unit types.**  A count of units is not a
  count of steps; the apalutamide train is six steps over nine units, two of
  them generic mixers/splitters that a fluid plant also has.  The type list
  is used only to decide whether an undeclared zero is worth saying.
* **A flat `particulateSteps 6;`.**  Refused: the count is an assumption,
  and the block carries its source and reason (the `land {}` precedent).
* **The `declared-unit-price` shape, C_p = C_BM = C_TM.**  The catalyst and
  steel-mass rows print C_TM = C_BM, while the economics ladder applies
  `contingencyFee` to their C_BM anyway -- so their table and their FCI
  disagree on the contingency (a finding, §6).  A quote was not given that
  shape: its C_TM is the one the FCI actually uses.
* **A quote always in the auxiliary-facilities base.**  Right for a machine,
  double counting for a building; the case declares which.
* **Quotes as sized items (`result.sizings`).**  A quote has no size: it
  would write an empty specification sheet and be a footprint candidate on
  the plot plan.  It is a cost record only; the result's `equipment` list
  carries it (`type declaredQuote`) so the golden `equipment` kind pins its
  three costs.

## 5. Gates

`check_cost_provenance` arms (t) and (u); nine by-hand sabotages, each
caught, listed in the gate's docstring.

## 6. Found, not fixed

* The `declared-unit-price` rows (catalyst charge, steel-mass vessels) print
  C_TM = C_BM ("NO 1.18"), and `EconomicsPass` builds the FCI from their
  C_BM with `contingencyFee` and the `siteFactor` base like any module's --
  so the docs' "no 1.18" is true of the costing table and false of the FCI.
  Fixing either side moves goldens; RESERVED.
* The witness's labour: at `P = 6` Turton's formula staffs about 34
  operators a shift on a 50-million-tablet campaign line, and the NPV turns
  deeply negative through `2.73 C_OL`.  The formula was fitted on chemical
  plants; whether it is the right tool for a drug-product line is a
  pedagogical question for Vítor, not a number to tune.
