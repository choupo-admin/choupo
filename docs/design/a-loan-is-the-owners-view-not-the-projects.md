# A loan is the owners' view, not the project's

**Status: SHIPPED 2026-10-25 on branch `claude/c110-g4-revived`, not merged.**
Commission DEV.md 4c **C110**, wave 1, general **G4** (Vítor, 2026-10-20:
*"Resolve tudo e delego em ti fazeres como achares melhor"*): debt financing
and interest during construction in the economic appraisal, opt-in.

**History of this record.**  It was first written on 2026-10-20 with the
work, as ONE unvalidated WIP commit (`484b52f54` on
`claude/c110-g4-debt-financing`), on a base 368 commits behind `main`, and
was never built.  It was REVIVED on 2026-10-25: the commit was brought onto
the current `main`, built, measured and gated, and every engine claim below
was re-read against the source it names (`file:line` are at the revived
commit).  What changed from the first version: the equity view's taxable
income is now DERIVED from the project's (one vector, §4) rather than a
second copy of the income statement; the witness is a shipped tutorial
(§6), not only the gate's probes; the byte-identity measurement is reported
(§6) rather than promised; the sabotages are recorded (§8).

## 1. What was there

`src/postProcessing/EconomicsPass.cpp` priced a plant with ONE cash flow, the
project's, built in `appraise` (`EconomicsPass.cpp:1429`): fixed capital on the C63 capital schedule, the working capital at
start-up, the land (C82) at the start of construction, operation, the
end-of-life recoveries -- and nobody lending anything.  Every NPV, IRR and
payback it published was UNLEVERED.  The students' pharmaceutical projects
finance part of the investment with a bank loan (say half of it, at a rate
the bank states), compute the interest during construction (*juros
intercalares*) and carry the loan's repayment in the cash flow; this pass
could not.

## 2. The grammar (opt-in, in the postDict's `economics {}` block)

```
financing
{
    debtFraction  0.5;           // share of the financed capital the loan lends, in (0, 1)
    basis         fixedCapital;  // fixedCapital (FCI) | totalCapital (FCI + WC)
    rate          0.06;          // annual interest, a fraction
    graceYears    2;             // operating years paying interest only
    termYears     8;             // repayment years AFTER the grace
    repayment     annuity;       // annuity | linear
    source        "...";         // where the terms come from
    reason        "...";         // why they are this project's
    // equityDiscountRate 0.12;  // optional; absent = discountRate, ANNOUNCED
}
```

Every key but the equity rate is REQUIRED.  The brief's grammar named six
terms; two were added, each because the answer moves with it and a default
would be a policy nobody chose:

* **`basis`** -- "half the total investment" is ambiguous between the fixed
  capital and the fixed plus working capital, and the two differ by the WC
  (15 % of FCI by the fraction rule).  Neither is the obvious reading, so the
  case says which.  The LAND is never financed by this loan: it is not part
  of TCI here (C82), and a land loan is a mortgage with its own terms.
* **`equityDiscountRate`** -- optional, because using the project's rate is
  what most coursework does; but the owners of a levered project carry more
  risk than the project and usually ask more, so the default is ANNOUNCED
  (`[assumed]`, into the caveat block) rather than silent.

Refusals, each by name with the remedy: the block not a block; a missing term
(the list of the eight); an unknown key (with the accepted list); a debt
fraction of 0 (no loan -- delete the block) or of 1 or more (the owners invest
nothing and an equity return on nothing has no meaning); a rate outside
[0, 1) -- the message says *6 % is `rate 0.06;`*, the mistake it exists for;
a fractional or negative year count, or a zero term; `graceYears + termYears`
above `projectLife` (the loan would outlive the plant; a balloon is not
modelled); an unknown `repayment` or `basis` (with the accepted words); an
empty `source` or `reason`; an equity rate at or below -100 %.

## 3. The rule: the project's merit does not depend on how it is financed

The financing adds a SECOND view and replaces nothing.  The project NPV, IRR,
paybacks, `cashFlow.csv`, every economics KPI and every field of the result's
`economics` object are exactly what they are without the block -- measured,
not argued: the gate's probe writes a `cashFlow.csv` byte-identical to the
same case without a loan.  The printed table says it in words: *the PROJECT
figures above are unchanged ... the project's is the merit, the equity's is
the owners' share of it*.

Why this is the rule and not a presentation choice: the project cash flow
answers "does this plant earn more than its capital costs?", and borrowing
cannot change that answer -- a loan at a rate below the plant's return makes
the owners' return higher on a smaller stake, and the same loan makes a
value-destroying plant look attractive to its owners.  A pass that reported
only the levered figures would let the financing decide whether the plant is
any good.  (The tax shield of the interest IS real value, which is why the
equity NPV at the project's rate is not simply the project NPV; the equity
view shows it, the project view does not need it.)

## 4. The arithmetic, and the stated defaults

All of it is inside `appraise`, the one cash-flow home (C68), derived FROM the
project's cash-flow vector so the two views can differ only by the loan.

**Draws.**  The loan lends `debtFraction` of each financed outlay at the
instant the C63 timeline spends it: the FCI fraction of construction year k at
the END of that year (t = k - Nc), and with `basis totalCapital` the working
capital at t = 0.

**Interest during construction, capitalised.**  In each construction year the
interest r B on the balance already drawn is ADDED to the balance; no cash
moves.  So the loan at start-up is the draws compounded to t = 0:
P = sum_k D_k (1 + r)^(-t_k).  A ONE-year construction spends its whole
capital at its END (t = 0) and so accrues NONE -- the timeline's own
end-of-year convention, said on the printed line when it happens.  A
mid-year draw convention would give a one-year plant some interest; it was
rejected because it would place the loan's draws on different dates from the
capital they finance.

**Operation.**  Interest I_t = r B_(t-1) on the opening balance is PAID and
DEDUCTED from the taxable income (a loss offsets other income -- the pass's
standing convention: the tax is `taxRate * taxableIncome` with no floor,
`EconomicsPass.cpp:1847`).  The grace years repay nothing.  Then `termYears`
repayments: `annuity`, a level payment A = P r / (1 - (1 + r)^-n), principal
A - I_t; `linear`, a constant principal P/n with the interest falling with
the balance.  The last repayment is the remaining balance, so the loan clears
exactly.

**The capitalised interest is depreciated with the plant**, straight line over
`depreciableLife` from operating year 1, in the equity view only.  Read as a
CONVENTION, not a citation of a value: IAS 23 *Borrowing Costs* capitalises
the borrowing costs directly attributable to a qualifying asset into its cost
(the Portuguese standard of the same name is NCRF 10), so they reach the
income statement as depreciation.  A country's TAX law may treat them
otherwise; that is said on the line and here.  Rejected: expensing the IDC in
year 1 (it would put a construction cost in the first operating year's tax
return) and ignoring its tax effect (the owners would lose a shield the
accounts give them).

**The equity cash flow**, per year:

    t <= 0 :  CF_e = CF_project + draw
    t >= 1 :  taxable_e = taxable_project - I_t - d_IDC
              CF_e = taxable_e (1 - tau) + d + d_IDC - principal_t
                     (+ the project's end-of-life recoveries: WC, salvage, land)

which the code writes in its equivalent delta form
CF_e = CF_project - (I_t + d_IDC)(1 - tau) + d_IDC - principal_t, so the
project's recoveries are inherited rather than restated.  The equity view's
taxable income is the PROJECT's taxable income, kept in one vector
(`projectTaxable`, `EconomicsPass.cpp:1536`) as the project's own cash flow
is built from it, less I_t and d_IDC -- the first version re-evaluated the
income statement a second time inside the loan block, a second home for the
project's taxable income that would have gone quietly wrong the day the
income statement moved.  The loan block is `EconomicsPass.cpp:1551`; the
NPV / IRR / payback written once for any cash-flow vector are `npvOf`,
`irrOf`, `discPaybackOf` (`:1636`, `:1678`, `:1769`), applied to the equity
flow at `:1882`.  The equity NPV is
discounted at `equityDiscountRate` with the same year-0-at-start-up
convention; the IRR, its multiple-root guard and the discounted payback are
the SAME code the project's use -- they were turned into functions of a cash
flow vector inside `appraise` for that purpose, the project's arithmetic
unchanged operation for operation (every economics case byte-identical, §6).

## 5. Where it is published

* the console: a *Financing: the EQUITY view* section closing the appraisal
  table -- the terms with their source and reason, drawn / IDC / loan at
  start-up / interest paid / equity invested, the loan schedule year by year
  with the equity cash flow, and the equity NPV, IRR, discounted payback;
* `kpis.economics.debt_drawn`, `debt_IDC`, `debt_atStartup`,
  `debt_interestPaid`, `equity_invested`, `equity_NPV`, `equity_IRR`,
  `equity_paybackYears` -- pinned by the golden `kpi` kind like every
  economics KPI (published implies pinned; the gate holds the JSON's every
  scalar to its KPI);
* the result's `economics.financing` object, with the year-by-year
  `schedule`;
* `reports/economics/financing.csv`, and a second sheet *Financing (equity)*
  of `cashFlow.ods`; `cashFlow.csv` stays the project's;
* the sensitivity (C68): `financing.rate` and `financing.debtFraction` are
  inputs (relative or absolute); every row of a financed case's tornado gains
  the EQUITY NPV at its two ends (`sens_<input>_equityNPV_low/_high`, two CSV
  columns, two JSON fields), and the two financing rows show a PROJECT NPV
  swing of exactly zero -- the rule of §3, visible on the chart.

## 6. Measured, not argued

**Byte identity without the block (2026-10-25).**  Every corpus case whose
`system/postDict` mentions `economics` (17 cases; 13 of them run the pass
and write `reports/economics/`) was run in place with a build of `main` at
`22dc303d4` and then with a build of this slice, from the same directory:
stdout (which carries the result JSON), stderr, the exit code and every file
under `reports/economics/` (the .ods included) were compared with `cmp`.
All 17 are byte-identical, the run banner's commit line included (both
builds were of a tree whose HEAD was `22dc303d4`).  A measurement, not a
gate: it is retaken whenever `EconomicsPass.cpp` moves.

**The witness is a shipped tutorial**:
`tutorials/steady/economics/economics04_debt_financing` is
`economics03_startup_years`'s plant, costing and three-year construction
with an annuity loan (0.5 x FCI at 6 %, two grace years, eight repayments,
equity at 12 %) and a sensitivity on `financing.rate` and
`financing.debtFraction`; its postDict checks the loan by hand.  Its golden
is economics03's golden COPIED -- all 287 rows, every one still passing, so
the golden itself says the project view did not move -- plus 28 rows
appended with `--record-append` (the eight `debt_*` / `equity_*` KPIs and
twenty `sens_financing_*` KPIs, the equity NPV at each end among them).
**The gate's probes** add what one case cannot: `bin/curate/check_debt_financing.py` builds loans on copies of
`economics03_startup_years` (three construction years, a ramp-up, a start-up
cost -- so capitalisation, grace and the ramped tax interact) and
`economics01_esterification_dcf` (one construction year).  Its loan helper is
first held to a schedule written out by hand in the gate (1000 at 10 % over
three years, both repayments, and a two-draw capitalisation); then every row
the engine publishes is recomputed from the PROJECT's published cash flow by
the income-statement form above, not by the engine's delta form.

## 7. Not done, said plainly

* The GUI does not draw the equity view (the result carries it); one
  tutorial declares a loan (`economics04_debt_financing`).
* A balloon payment, a loan longer than the plant, several loans, a drawdown
  schedule that differs from the capital schedule, fees, a variable rate.
* A cost of equity derived from leverage (Modigliani-Miller, a CAPM beta): the
  equity rate is declared or the project's, and the announcement says which.
* The tax law of capitalised interest in a given country; tax-loss
  carry-forward (the standing convention lets a loss offset other income).

## 8. Gate

`bin/curate/check_debt_financing.py`, wired in `bin/runTests` after the
economic-sensitivity gate; arms (a)-(l) listed in its docstring, arm (k)
holding the shipped witness (its run against the terms its postDict
declares, its project KPIs equal to economics03's, its golden pinning every
financing KPI it publishes) and arm (l) the .ods equity sheet and the
printed schedule.  Fifteen by-hand sabotages, recorded in the docstring:
fourteen caught.  Two of the fourteen SURVIVED the first version of the
gate -- an .ods equity sheet with no rows and a console schedule printing
the wrong column, because no arm read either surface -- and arm (l) was
written for them.  ONE STILL SURVIVES: an equity multiple-IRR guard that
never fires agrees with every probe, because no probe's cumulative equity
flow changes sign more than once (a guard whose only cases satisfy it is a
guard nothing tests); said as NOT COVERED rather than implied.
