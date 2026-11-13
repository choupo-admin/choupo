# Review by measurement: the prices of the green-ammonia cases (C389)

Date: 2026-11-13.  Asked by the coordinator (board, R3).  Reviewed on
main at d783c6c236: `tutorials/plant/greenAmmoniaPEQ_baseCase/constant/
economics` (three provenance blocks), its three byte-identical copies,
the four READMEs and the generated stage comparison.  Findings:
`findings.tsv` (PR-01 .. PR-14).  `sources_fetched.txt` lists every URL
fetched, the date and the sha256 of each document; no document was
copied into the repository.  "Read by the reviewer" below means the
reviewer opened the document itself and quoted the page.

## 1. Verdict

**The three numbers are right at their sources.**  Every value, unit,
year, page and arithmetic step of the three blocks was reproduced.  What
is wrong is around them: the ends of two ranges are a different kind of
number from the base they bracket (PR-04, PR-05); one sibling README
still teaches the prices this work replaced (PR-03); the two declared
readings never reach the run's output (PR-07); and the third source's
reuse notice needs a ruling (PR-01).

## 2. The three blocks

| price | claimed | read at source | match |
|---|---|---|---|
| ammonia 0.530 EUR/kg | EU import unit value 2025: 1 427 171 639 EUR / 2 693 549 425 kg = 0.52985 | the database's API returned those two totals; 0.529848 | yes |
| its range | 0.439 (450 USD per short ton, at 1.12998 USD/EUR) and 0.726 (January to September 2026) | 450 / 907.18474 / 1.1299831 = 0.43898; 1 261 936 766 / 1 738 648 743 = 0.72581 | yes (PR-04, PR-08 on what they are) |
| hydrogen 8.0 EUR/kg | the regulators' 2025 report, pdf p. 40 paragraph 78 and p. 5; low 4.95 (p. 26), high 10.0 | p. 40 quote verbatim as in the block; p. 5 "At around 8 EUR/kgH2, the average cost ..."; p. 26: 4.95 | yes (PR-05, PR-06) |
| nitrogen 0.0175 EUR/kg | the paper's Table 2, highest of six "Present" values, 18.98 USD/t at 1.08238 USD/EUR (2024) | Table 2 as claimed; 18.98 / 1000 / 1.08238047 = 0.0175354 | yes (PR-01) |

The reviewing session recomputed the four quotients itself.  The
paper was read from a repository copy with one extra cover page (the
institute's own URL answered 403): its "pdf p. 25" is p. 26 there.

## 3. The rows a student is affected by

| id | where | observed | should be |
|---|---|---|---|
| PR-03 | `tutorials/steady/reactors/ammoniaRoutes01_screening/README.md:153-155, 227-229` | "1.00 / 4.50 / 0.05 EUR/kg ... PEQ base data, `greenAmmoniaPEQ_baseCase/constant/economics` (itself author-set there)"; a gross margin of 56.08 M EUR/yr | that file holds 0.530 / 8.0 / 0.0175 with sources; the golden's `grossMargin_RM` is -360.33 M EUR/yr |
| PR-04 | `constant/economics:64`; the feasibility case's postDict and README | low 0.439 (US FOB, estimated), base 0.530 (EU CIF 2025), high 0.726 (EU CIF, nine months of 2026) presented as one range | one series: the 2025 monthly EU values span 0.380 (June: 86 337 832 EUR / 227 498 011 kg) to 0.692 (November: 97 952 040 / 141 512 757); or say the three are different quantities |
| PR-05 | `constant/economics:77` | low end 4.95 described as what ammonia producers "reported they would pay" | the report: "Average offtake prices calculated by sector", "Based on the information submitted among all the bids" of a subsidised auction; the base is a modelled cost |
| PR-07 | `EconomicsPass.cpp:3394-3395` | the run prints `0.5300 EUR/kg` and `8.0000 EUR/kg`; the result's economics block has no provenance | the origin the engine already reads, printed beside the price and published |

## 4. The reuse notice (PR-01, PR-02): a ruling, not a verdict

The paper's page 2, read by the reviewer and by the reviewing session:
"This publication may be reproduced in part for educational or non-profit
purposes without special permission ... No use of this publication may be
made for resale or for any other commercial purpose whatsoever without
prior permission in writing".

The licence policy excludes NonCommercial sources as a value's origin;
its named examples are databases and compilations.  The project's
practice everywhere else is to cite single values from primary papers
that reserve all rights.  Here one cell of one table of a primary study
is taken, with its citation.  Which rule this falls under is the
owner's to say; the reviewing session's reading is that it is the
primary-paper practice, not the compilation exclusion, and that the
sentence deciding it belongs in the policy.  Either way no gate looks:
`check_source_licence` seeks three names in case-local files and judges
no price's origin (PR-02).

The other sources: the trade-statistics body allows commercial reuse
with acknowledgement (PR-12 on one listed exception); the regulators'
report "Reproduction is authorised provided the source is
acknowledged"; the government commodity summary is a public-domain
publication whose price is attributed to a commercial price service
(PR-08).

## 5. The judgement itself

**Hydrogen, a cost read as a fence price.**  Declared in the economics
file, three READMEs and the postDict; not on the run.  At 8.0 the
appraisal is pushed toward loss (hydrogen is about 99 % of the
raw-material bill); between 8.0 and 4.95 the 150 bar case's net present
value moves by 1588 M EUR and stays negative at both; the break-even is
1.785.  The same report gives a market index at about 8.2 EUR/kg, which
supports the base as a price.  **The reviewer would have ruled the same
base**, citing that index, naming the four countries and the firm-supply
premium, and calling 4.95 what it is.

**Ammonia, an import unit value read as the selling price.**  Declared
in the economics file and the base README.  A CIF import value is
roughly the price a domestic seller competes with; using the
conventional product's value for a renewable product understates revenue
by whatever premium exists, and the case declares none and points to its
break-even (1.929), which is the honest treatment.  **The reviewer would
have ruled the same base**, and would not have put a US FOB estimate
beside EU CIF values as a range end.

The reviewing session agrees with both.

## 6. Every sentence checked

The four READMEs' prices, margins, net present values, tornado rows and
break-evens were each compared with the goldens: all match except the
rows above and PR-09 (a cost of renewable ammonia quoted with no
provenance; 720 USD/t is the low end of its report's 720 to 1400) and
PR-10 (a net present value of about -4076 M EUR that is hand arithmetic
and pinned by nothing).  The stage comparison in the basic-design README
is generated by `bin/curate/gen_ammonia_stage_comparison.py`, which the
suite holds with `--check`; its numbers come from the three runs.  No
guide carries these prices.

## 7. Gates

`check_cost_provenance`, `check_economic_sensitivity` and
`check_source_licence` each exit 0 on a build of main.  None holds a
provenance block's number against its source, and the sensitivity gate's
own claim line says it does not judge whether an end is sensible.

## 8. What was NOT reviewed

- The base case's own run (the 150 bar feasibility case was run).
- The utility-cost breakdown rows.
- How the engine treats a 2025 price in a 2026 appraisal.
- One observatory figure (6.17 EUR/kg) and one reuse-terms page were
  read through a fetch summary, not as the page's own text.
