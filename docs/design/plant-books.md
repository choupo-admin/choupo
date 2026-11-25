# The plant's books: income statement, balance sheet, cash-flow statement

*2026-11-25.  Slice record, C524.  Code: `src/postProcessing/PlantBooks.cpp`.  Gate: `check_plant_books`.*

## What it is

The appraisal already computes, year by year, everything an accountant keeps in three
statements; it just never lays it out as them.  `PlantBooks` reads the appraisal's own
yearly rows (`CashFlowYear`, `LoanYear`, the working-capital lines) and writes the three
statements, tied together.  It adds no input and moves no number: NPV, IRR, paybacks,
break-evens and every golden row are untouched (the books are an addition, computed
AFTER the appraisal).  Years are the appraisal's: t = 1-Nc .. N, year 0 the end of
construction.  Every statement shows years across, accounts down.

## The accounts (one line each; a student reads the sheet)

**Income statement** (operating years; what the plant earned)
- Revenue: price x production sold (`R_t = p_t R`).
- Variable cost: what scales with production: raw materials, utilities, waste, with
  Turton's 1.23 factor.  = COM_d,t minus the fixed part.
- Gross margin = revenue - variable cost.
- Fixed operating cost: 0.180 FCI + 2.73 C_OL, paid whatever is produced.
- Royalty, start-up cost: as the case declares them (zero otherwise).
- EBITDA = gross margin - fixed - royalty - start-up (earnings before interest, tax,
  depreciation, amortisation).
- Depreciation: the plant's cost spread over `depreciableLife` (plus the capitalised
  loan interest, if a loan is declared).  A cost with no cash leaving.
- EBIT = EBITDA - depreciation; equals the appraisal's taxable income (checked).
- Interest: paid on the loan (zero with no `financing`).
- Profit before tax = EBIT - interest.  Tax: `taxRate` x profit, by the case's
  `taxOnLoss` rule (`credit`: a loss earns a credit; `none`: no tax and no credit).
  Profit after tax.
- Last year only: result on disposal (sale price - book value) and the tax the
  appraisal charges on the sale (tau x sale price, see below); net profit.

**Balance sheet** (end of each year; what the plant owns and owes)
- Assets: fixed assets at cost (capital spent so far, with capitalised interest);
  accumulated depreciation (negative); land (at cost, not depreciated);
  inventories (raw-material stock, process inventory, product stock), receivables,
  operating cash reserve (the working capital's minimum cash) -- or one undivided
  working-capital line when the case uses the fraction-of-FCI rule; cash.
- Liabilities: payables (owed to suppliers); loan balance.
- Equity: share capital (what the owners paid in); retained earnings (profits kept).

**Cash-flow statement** (where the cash came from and went)
- Operating: profit after tax + depreciation.
- Investing: capital spent, land, working capital invested (year 0); at the end of life
  working capital released, land sold at cost, plant sold at its salvage value less the
  tax on it.
- Financing: share capital paid in, loan drawn, loan repaid, dividends.
- Net change, opening cash, closing cash.

## The identities (held every year to 1e-9 relative, and by gate `check_plant_books`)

1. Assets = liabilities + equity, every year.
2. The statement's flows (operating + investing + loan) = the appraisal's own cash flow of
   the year (the project's, or the equity cash flow when a loan is declared).
3. Closing cash of the cash-flow statement = the balance sheet's cash (one number, two
   statements).
4. Retained earnings(t) = retained earnings(t-1) + net profit(t) - dividends(t).
5. EBIT(t) = the appraisal's taxable income(t) (before interest).
6. Owners: sum over all years of the owners' cash flow (the appraisal's) = closing cash
   + dividends - share capital paid in.

A failing identity means an account is missing from the appraisal, not a rounding to
plug: the run says which identity and which year, and the gate fails.

## Accounting choices (each with its reason) and what is an assumption

- **Dividends: none.**  Cash accumulates.  The appraisal prices the plant, not a payout
  policy; a distribution would only move cash into dividends.
- **The initial equity covers the construction.**  Each construction year the owners pay
  in what the capital spent, the land and the working capital cost, less the loan drawn:
  cash is zero at start-up.  Share capital is the sum.
- **Working capital = inventories + receivables + the cash reserve - payables**, of the
  method the NPV uses, invested at year 0, held constant, released at the end of life
  (that is what the appraisal does; a working capital that followed the ramp-up would be
  a different appraisal).  The operating cash reserve is shown as an asset; the
  `cash` line is only the cash the plant accumulates.
- **Tax is paid in the year it arises** (no tax payable, no deferred tax), as the DCF does.
- **Loss years follow `taxOnLoss`** exactly as the appraisal: the books show the tax credit
  as a negative tax.  No loss carry-forward (the appraisal has none).
- **Interest during construction is capitalised** into the fixed assets (no cash moves)
  and depreciated with the plant; the loan balance grows by it.  One convention of
  several; it is the appraisal's, and is the one IAS 23 requires for a qualifying asset.
- **End of life = wind-up.**  The last year's balance sheet is after the plant, land and
  working capital are turned into cash: fixed assets 0, cash = what is left.  The plant is
  sold for `salvageFraction` x FCI.  The appraisal taxes the whole sale price (tau x sale
  price, as if the book value were nil); the books follow it and show the difference to the
  true book value as the result on disposal.  When `depreciableLife` <= `projectLife` the
  book value is zero and the two readings agree.
- **Negative cash** (an overdraft) is shown as it comes, and flagged: it means the project
  does not fund itself in that year.  It is not hidden by an invented credit line.
- **A loan not repaid by the end of life** stays a liability in the last balance sheet.
- Terms follow the common international usage (EBITDA, EBIT, retained earnings); no
  country's chart of accounts is imposed, no number is taken from an accounting book.

## Outputs

`reports/economics/{incomeStatement,balanceSheet,cashFlowStatement}.csv` (accounts down,
years across), three sheets added to `reports/economics/cashFlow.ods`, a `books` block in
the result JSON (rows with a plain-language `help`, the six identities, the worst error),
`kpis.books.*` (assets, liabilities, equity each year; the worst error), and one log line
with the worst error.  The GUI's Economic appraisal report draws the three tables.
