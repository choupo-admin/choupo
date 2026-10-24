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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  sinesPtaLesson -- the PROSE of "A negative case: the Sines PTA plant"
  (DEV.md 4c C143): the steps, the risk department's warnings with the
  concept that catches each, the checklist, and the limits.

  ONE RECORD IS THE SOURCE: docs/design/the-sines-pta-plant-a-negative-
  case.md.  Every quotation below is in that record, at the page given, and
  tests/sinesPta.test.ts requires each Portuguese or Spanish original to be
  present there verbatim -- a quotation the record does not carry is one
  nobody read back.

  THE SCOPE IS VITOR'S RULING (2026-10-24): "Deixa a politica de fora".
  Institutions only, no persons, no motives, no political finding.  The test
  carries a small denylist of the obvious words and says what it cannot
  prove.

  QUOTATIONS FROM PORTUGUESE AND SPANISH DOCUMENTS ARE IN THE ORIGINAL WITH
  AN ENGLISH TRANSLATION BESIDE THEM; the translations are this page's.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** A quotation in the language of its document, with its translation. */
export interface Quote {
  original: string;
  english: string;
  source: string;
}

export const SINES_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A negative case, read from the documents",
    body: "From 2008 a world-scale plant for purified "
      + "terephthalic acid (PTA) was built in Sines, Portugal, by Artlant, a "
      + "company of the PET producer La Seda de Barcelona (LSB), financed by "
      + "the public bank Caixa Geral de Depósitos (CGD), which also became a "
      + "shareholder.  It started up in 2012, stopped twice, lost its captive "
      + "customer to insolvency within a year and a half, went through a "
      + "revitalisation process, and its assets were sold in 2017 for "
      + "EUR 28 M.  This page reads that case as a lesson in what the "
      + "economic analysis of a chemical process must contain.  Every fact on "
      + "it comes from a public primary document -- the parliamentary inquiry "
      + "report, the independent audit of the bank, the filings of La Seda de "
      + "Barcelona and of the later owner -- and carries its source and page; "
      + "the research record (docs/design/the-sines-pta-plant-a-negative-"
      + "case.md) lists every one, with what could not be confirmed.  The "
      + "page names institutions, never persons, and it does not discuss "
      + "why any decision was taken: politics is outside its scope by the "
      + "author's ruling.  Its subject is narrower and more useful: the "
      + "warnings were written down at the time, and each of them is a "
      + "concept a process-economics course teaches.",
  },
  {
    n: 2,
    title: "From paraxylene to a bottle, and why the margin is a spread",
    body: "PTA is made from paraxylene (PX), which the inquiry report "
      + "describes as a by-product of fuel refining (CPI-2019 p. 288), and it "
      + "is \"the basic building block for all forms of polyester\": PET "
      + "packaging resin, films and synthetic fibres (EC-2007).  With "
      + "monoethylene glycol (MEG) it makes PET.  About 0.85 t of PTA goes into a "
      + "tonne of PET, and PTA is about 80 % of PET's production cost "
      + "(LSB-2012 p. 36); a US investigation gives 850 g of PTA and 350 g of "
      + "MEG per kilogram of resin, and PTA and MEG together as over 75 % of "
      + "its cost (USITC-4604 p. V-1).  The decisive fact is in the same "
      + "registration document: \"El precio de PTA está indexado al precio del "
      + "paraxileno\" (the price of PTA is indexed to the price of paraxylene; "
      + "LSB-2012 p. 36).  When the product is sold on a formula over the "
      + "feedstock, the producer is not paid a PTA price.  It is paid the "
      + "SPREAD, and keeps what is left of it after its own conversion costs.  "
      + "The producers publish that spread: Indorama Ventures (IVL) reports "
      + "an \"industry spread\" defined as \"Selling price less raw material "
      + "consumption\", per tonne, for Asia and for the West.  So a PTA plant "
      + "is appraised on the spread, its history and its range, and never on "
      + "a product price.",
    formula: String.raw`s = p_\mathrm{PTA} - c_\mathrm{RM}`,
    where: [
      { sym: "s", means: "the industry spread", unit: "US$/t" },
      { sym: "p_\\mathrm{PTA}", means: "the selling price of PTA", unit: "US$/t" },
      { sym: "c_\\mathrm{RM}", means: "the raw materials consumed per tonne of "
        + "PTA, paraxylene first", unit: "US$/t" },
    ],
  },
  {
    n: 3,
    title: "The plant, and a capital cost that changed with every document",
    body: "The plant was designed for 700 000 t/yr with technology licensed "
      + "from Invista (LSB-2012 pp. 29, 37), a capacity the plan expected to "
      + "reach in the second year of production (LSB-2012 p. 44).  Its capital "
      + "cost was stated seven times in the documents, from about EUR 360 M "
      + "in 2007 to EUR 462 M of gross investment in progress in 2012 -- "
      + "+28 % by this page's arithmetic, or about 510 to 660 EUR per tonne "
      + "of annual capacity.  Read the table below with care: its rows do "
      + "not all measure the same thing.  An investment, a project cost, a "
      + "total of uses that includes opex and financing costs, and the "
      + "gross assets under construction are four different perimeters, and "
      + "a capital figure without its perimeter cannot be compared with "
      + "anything.  The inquiry report states the outcome in one line: \"O "
      + "investimento para construção e operação da fábrica foi superior ao "
      + "orçamentado\" (the investment for building and operating the plant "
      + "exceeded the budget; CPI-2019 p. 319).",
  },
  {
    n: 4,
    title: "Who buys the output: the plan, the contract and the need",
    body: "The investment assumed that LSB would buy the WHOLE output of the "
      + "plant for its PET plants (CPI-2019 p. 288).  The contract signed in "
      + "2010 was for UP TO 450 000 t/yr, at variable prices linked to a "
      + "market index, to 2030 (LSB-2012 p. 29), and \"no establece "
      + "explícitamente penalizaciones\" (it does not explicitly set "
      + "penalties) if the buyer takes less (LSB-2014 pp. 122-123).  And "
      + "LSB's four PET plants, 560 000 t/yr nominal, needed 470 000 t of PTA "
      + "a year (LSB-2012 p. 37), which is the 0.85 ratio of step 2 at work: "
      + "0.85 × 560 = 476.  So even with the customer at its contract "
      + "maximum, more than a third of the plant had to be sold to third "
      + "parties, in a market described in step 7: the plant was in part a "
      + "MERCHANT plant from its first day, and the captive two thirds rested "
      + "on a market-indexed price and a volume with no explicit penalty.  "
      + "That is the merchant share, and an appraisal that does not compute "
      + "it has not looked at who the customer is.",
    formula: String.raw`\varphi_\mathrm{m} = 1 - \frac{\min(Q_\mathrm{c},\, P)}{P}`,
    where: [
      { sym: "\\varphi_\\mathrm{m}", means: "the merchant share: the fraction "
        + "of production the captive contract does not take", unit: "–" },
      { sym: "Q_\\mathrm{c}", means: "the volume the captive customer "
        + "contracted to take", unit: "kt/yr" },
      { sym: "P", means: "the production", unit: "kt/yr" },
    ],
    derivation: [
      { step: "At nominal capacity and the contract maximum (this page's "
          + "arithmetic):",
        eq: String.raw`\varphi_\mathrm{m} = 1 - \frac{450}{700} = 0.357` },
      { step: "Against the whole need of the customer's PET plants instead:",
        eq: String.raw`\varphi_\mathrm{m} = 1 - \frac{470}{700} = 0.329` },
    ],
  },
  {
    n: 5,
    title: "The appraisal a student should have made",
    body: "Here is the analysis, simple enough to do by hand and complete "
      + "enough to ask the right questions.  The capital is spent during "
      + "construction; each operating year earns the spread less the "
      + "conversion cost on every tonne, loses a discount on every merchant "
      + "tonne, pays its fixed costs, and is discounted to the decision.  The "
      + "captive customer may stop buying after a year you choose, and then "
      + "its tonnes are merchant tonnes too.  Each input below is marked: "
      + "DOCUMENTED (read in a primary document), PUBLISHED (a market figure "
      + "the producers published), or SYNTHETIC (a teaching value, because "
      + "no document read gives it).  It is NOT a reconstruction of the "
      + "real business plan, which no public document gives: it is the "
      + "shape of the analysis, on numbers you can defend or change.",
    formula: String.raw`\mathrm{NPV} = -\sum_{j=1}^{N_\mathrm{c}}\frac{C/N_\mathrm{c}}{(1+i)^{j}} + \sum_{k=1}^{N}\frac{\mathrm{CF}_k}{(1+i)^{N_\mathrm{c}+D+k}}`,
    where: [
      { sym: "\\mathrm{NPV}", means: "the net present value at the decision, "
        + "before tax", unit: "M EUR" },
      { sym: "N_\\mathrm{c}", means: "the planned construction period", unit: "yr" },
      { sym: "C", means: "the capital cost, spent in equal parts at the end of "
        + "each construction year (a stated policy)", unit: "M EUR" },
      { sym: "i", means: "the discount rate", unit: "–" },
      { sym: "j", means: "the construction year", unit: "–" },
      { sym: "N", means: "the operating life", unit: "yr" },
      { sym: "\\mathrm{CF}_k", means: "the cash flow of operating year k "
        + "(below)", unit: "M EUR" },
      { sym: "D", means: "the delay of the start-up beyond the plan", unit: "yr" },
      { sym: "k", means: "the operating year", unit: "–" },
      { sym: "P_k", means: "the production in operating year k", unit: "kt" },
      { sym: "c_v", means: "the conversion cost beyond the raw materials "
        + "(energy, catalyst, chemicals)", unit: "US$/t" },
      { sym: "V_{\\mathrm{m},k}", means: "the merchant volume of year k: what "
        + "the captive customer does not take", unit: "kt" },
      { sym: "d", means: "the discount on a merchant tonne (freight, price to "
        + "win the sale)", unit: "US$/t" },
      { sym: "X", means: "the exchange rate", unit: "US$/EUR" },
      { sym: "F", means: "the fixed costs", unit: "M EUR/yr" },
    ],
    derivation: [
      { step: "Each operating year: the production P_k (Q u_1 in the first "
          + "year, Q u after), of which V_m,k is merchant; a kilotonne times "
          + "US$ per tonne is 1e-3 M US$, divided by the exchange rate:",
        eq: String.raw`\mathrm{CF}_k = \frac{10^{-3}\left[P_k\,(s - c_v) - V_{\mathrm{m},k}\, d\right]}{X} - F` },
    ],
  },
  {
    n: 6,
    title: "The break-even spread, set beside the spreads that happened",
    body: "Because the NPV is a straight line in the spread, the spread at "
      + "which it is zero is exact: the value of the line at s = 0 divided "
      + "by its slope.  That one number is the most useful output of the "
      + "appraisal, because it can be compared with something outside it -- "
      + "the published spreads of step 7.  A break-even spread near the "
      + "historical average says the project needs an average year every "
      + "year; one above every year in the record says the project needs a "
      + "market that has not happened.  The chart shows the line, the "
      + "break-even and the published figures; the tornado moves one input "
      + "at a time between two ends and ranks them by how far they move the "
      + "NPV.  Try the downside cases the risk department asked for in "
      + "writing: the captive customer stops buying after year 2; the spread "
      + "falls to the Asian level; the start-up comes two years late.",
    formula: String.raw`s^{*} = -\frac{\mathrm{NPV}(s = 0)}{b}, \qquad b = \sum_{k=1}^{N}\frac{10^{-3}\,P_k}{X\,(1+i)^{N_\mathrm{c}+D+k}}`,
    where: [
      { sym: "s^{*}", means: "the break-even spread, at which NPV = 0", unit: "US$/t" },
      { sym: "\\mathrm{NPV}", means: "the net present value of step 5", unit: "M EUR" },
      { sym: "s", means: "the industry spread", unit: "US$/t" },
      { sym: "b", means: "the slope of the NPV in the spread", unit: "M EUR per US$/t" },
      { sym: "N", means: "the operating life", unit: "yr" },
      { sym: "k", means: "the operating year", unit: "–" },
      { sym: "P_k", means: "the production in year k", unit: "kt" },
      { sym: "X", means: "the exchange rate", unit: "US$/EUR" },
      { sym: "i", means: "the discount rate", unit: "–" },
      { sym: "N_\\mathrm{c}", means: "the construction period", unit: "yr" },
      { sym: "D", means: "the delay", unit: "yr" },
    ],
  },
  {
    n: 7,
    title: "What the market did: the spreads, and the capacity behind them",
    body: "The years the plant was built in were the years Asian PTA capacity "
      + "was being added fastest.  IVL's annual reports say so in their own "
      + "words (quoted below, from 2012, 2013 and 2014): supply was added far "
      + "beyond demand after the margins of 2010-2011, and Asian spreads fell "
      + "\"below the cash cost of the large majority of the industry\".  The "
      + "Western spread stayed higher, at more than twice the Asian one in "
      + "every year from 2014 to 2017 -- and IVL states why: Western producers could \"demand "
      + "fixed cost plus margins\" with \"import price parity protection\".  "
      + "That sentence is the whole risk of a European merchant plant.  A "
      + "Western spread exists because importing from Asia costs more; "
      + "anything that cheapens imports -- more Asian capacity, cheaper "
      + "freight, a stronger euro -- pulls it toward the Asian one.  The "
      + "bank's risk department had named exactly this in 2008, with the "
      + "exchange rate in the sentence (step 8, warning 4), and in 2025 the "
      + "plant's later owner listed \"competition from low-cost PTA imports\" "
      + "among its reasons for selling it.  No open year-by-year series of "
      + "Asian PTA capacity was found, so none is drawn.",
  },
  {
    n: 8,
    title: "The risk department's warnings, and the concept that catches each",
    body: "CGD's risk department wrote opinions on the operation from 2008 "
      + "on; the inquiry report and the independent audit document them.  In "
      + "January 2008 its opinion was \"Desfavorável\" (unfavourable); later "
      + "ones were \"Condicionado\" (conditional) and, from 2011 to 2016, "
      + "\"mantendo sempre a opinião desfavorável a aumentos de exposição\" "
      + "(always keeping its unfavourable opinion on increases of exposure; "
      + "CPI-2019 pp. 302-303, 321-322).  The table lists the warnings one by "
      + "one, each in the words of the document, beside the concept of "
      + "process economics that would have caught it in an appraisal.  None "
      + "of them needed hindsight: every one is a question a design report "
      + "is expected to answer before the capital is committed.",
  },
  {
    n: 9,
    title: "What happened",
    body: "The plant started production in December 2011 and PTA in March "
      + "2012, one to two years after the end of construction planned in "
      + "2008.  It stopped for technical problems within weeks; its captive "
      + "customer was declared insolvent in July 2013; it stopped again in "
      + "October 2013 for lack of paraxylene; it held EUR 50 M of "
      + "receivables on that customer \"de PTA vendido e não pago\" (for PTA "
      + "sold and not paid; CPI-2019 p. 321); it entered a revitalisation "
      + "process in 2014; and its assets were sold in November 2017 for "
      + "EUR 28 M.  The buyer booked them at a provisional fair value well "
      + "above the price and recognised a bargain-purchase gain "
      + "(IVL-AR2017): what an asset is worth to an integrated producer with "
      + "its own customers is not what it is worth to a merchant plant "
      + "without them.  The same buyer closed the plant about two years "
      + "before selling the company in April 2025 for EUR 100 000.",
  },
  {
    n: 10,
    title: "How much was lost depends on what you measure",
    body: "The table below gives nine figures from the documents, each with "
      + "its definition.  They OVERLAP and must not be added: the facilities "
      + "of 2010 are inside the exposure of 2014, which was restructured into "
      + "the exposure of 2015, part of which was impaired; the gross "
      + "involvement adds equity and loans to two companies over the whole "
      + "period.  The figure usually quoted is the inquiry commission's: "
      + "\"O envolvimento global da CGD neste projeto, resultou em perdas de "
      + "pelo menos EUR 400M\" (CGD's overall involvement in this project "
      + "resulted in losses of at least EUR 400 M; CPI-2019 p. 323).  It is "
      + "that commission's estimate for the whole involvement, and the page "
      + "gives it as such.  The lesson for a process engineer is the same one "
      + "as for the capital cost in step 3: a number without its definition "
      + "is not a result.",
  },
  {
    n: 11,
    title: "What the analysis should have contained",
    body: "A checklist to take away.  None of it is specific to PTA, and "
      + "none of it needs a simulator -- which is the point: these are the "
      + "questions that decide whether a simulation is worth building.",
  },
];

/** The checklist of step 11. */
export const SINES_CHECKLIST: readonly string[] = [
  "Appraise on the spread over the feedstock, with its published history "
    + "and range, never on a product price.",
  "Compute the merchant share: who buys each tonne, under what contract, at "
    + "what price, with what penalty if they do not.",
  "Treat a captive customer as a counterparty: its accounts, its debt, and "
    + "a downside case in which it stops buying and paying.",
  "Secure the feedstock: a supply contract and the working capital to buy "
    + "it, and a case in which it is interrupted.",
  "Read the capacity pipeline and the import parity behind a regional "
    + "spread; put the exchange rate in the sensitivity.",
  "Report the break-even spread and set it beside the spreads that have "
    + "actually occurred.",
  "Run the downside cases and a tornado, and say which inputs are "
    + "documented and which are assumed.",
  "State every capital figure with its perimeter, and track its growth "
    + "from one estimate to the next.",
  "In a project finance, show debt service from contracts with third "
    + "parties, not from a related party's promise.",
  "Do not commit capital before the due diligence of the gate is complete "
    + "(the Front-End Loading page).",
  "Watch concentration: one lender, one customer and one feedstock source "
    + "are three single points of failure.",
];

/** The warnings of step 8, each with the concept that catches it. */
export interface Warning {
  n: number;
  /** The warning in the document's words, and its translation. */
  quotes: readonly Quote[];
  /** What the document records, in plain English, beyond the quotation. */
  context: string;
  concept: string;
}

export const SINES_WARNINGS: readonly Warning[] = [
  {
    n: 1,
    quotes: [
      { original: "contrato (não assegurado) de off take (compra de 100% da produção)",
        english: "an offtake contract (not secured) for the purchase of 100 % of the output",
        source: "CPI-2019 p. 312" },
      { original: "Existência de contratos firmes de off take, a preços fixos",
        english: "firm offtake contracts at fixed prices (a condition)",
        source: "CPI-2019 p. 313" },
    ],
    context: "The contract signed was for up to 450 kt/yr at market-indexed "
      + "prices with no explicit penalty (step 4).",
    concept: "Offtake security and customer concentration: appraise on the "
      + "volume contracted, and price the rest as a merchant share.",
  },
  {
    n: 2,
    quotes: [
      { original: "Risco de incumprimento da LSB",
        english: "risk of default by LSB", source: "CPI-2019 p. 312" },
      { original: "O desconhecimento da \u201csituação real de risco e de mercado\u201d da LSB",
        english: "lack of knowledge of LSB's \"real risk and market situation\"",
        source: "CPI-2019 p. 312" },
    ],
    context: "In January 2008 the opinion also recorded LSB's incomplete "
      + "consolidated accounts, a net profit of EUR 2.9 M on EUR 645 M of "
      + "sales and EUR 605 M of financial debt (CPI-2019 pp. 302-303).  The "
      + "customer was declared insolvent in July 2013.",
    concept: "Single-customer credit risk: the customer's balance sheet is an "
      + "input of the appraisal, with a case in which it stops buying and "
      + "paying.",
  },
  {
    n: 3,
    quotes: [
      { original: "o paraxileno, matéria prima do PTA, era uma commodity (produto não diferenciável) transacionada no mercado, com uma volatilidade elevada do preço",
        english: "paraxylene, the raw material of PTA, was a commodity traded on "
          + "the market, with high price volatility",
        source: "CPI-2019 p. 312" },
    ],
    context: "Production stopped on 9 October 2013 \"por falta de "
      + "matéria-prima\" (for lack of raw material; CPI-2019 p. 321).",
    concept: "Feedstock security: a supply contract, the working capital to "
      + "buy it, and an interruption case; and the margin analysed as a "
      + "spread, not as either price.",
  },
  {
    n: 4,
    quotes: [
      { original: "Previa-se concorrência futura dos mercados asiáticos",
        english: "future competition from Asian markets was foreseen (January 2008)",
        source: "CPI-2019 p. 303" },
      { original: "aumento da concorrência extra-europeia [...] onde uma taxa de câmbio desfavorável ao euro facilita a entrada de concorrentes asiáticos",
        english: "increasing non-European competition, where an exchange rate "
          + "unfavourable to the euro eases the entry of Asian competitors "
          + "(November 2008)",
        source: "CPI-2019 p. 312" },
    ],
    context: "The Asian spread fell to 87 US$/t in 2014 (IVL-AR2015), and the "
      + "Western one is held up by import parity (step 7).",
    concept: "Market capacity additions and import parity: the capacity "
      + "pipeline and the exchange rate are inputs of the appraisal.",
  },
  {
    n: 5,
    quotes: [
      { original: "volatilidade do preço das matérias primas",
        english: "volatility of raw-material prices", source: "CPI-2019 p. 303" },
      { original: "Apresentação de garantia bancária que cobrisse o diferencial entre o EBITDA real e o EBITDA mínimo para o serviço da dívida",
        english: "a bank guarantee covering the difference between the actual "
          + "EBITDA and the minimum EBITDA for debt service (a condition)",
        source: "CPI-2019 p. 313" },
    ],
    context: "The project-finance terms themselves asked for a pessimistic "
      + "scenario with debt service supported only by sales to LSB "
      + "(CPI-2019 p. 311).",
    concept: "Volatility and downside cases: the break-even spread beside the "
      + "observed spreads, and a pessimistic case stated in advance.",
  },
  {
    n: 6,
    quotes: [
      { original: "(ausência de contratos com entidades externas ao Grupo que permitissem assegurar a estabilidade de cash flows para suportar o serviço da dívida) não se enquadram com uma estrutura de project finance",
        english: "(the absence of contracts with entities outside the group "
          + "able to secure stable cash flows for debt service) does not fit "
          + "a project-finance structure",
        source: "EY-final p. 154" },
      { original: "O projeto de produção assentava essencialmente no escoamento da produção para o principal acionista",
        english: "the production project rested essentially on selling the "
          + "output to the main shareholder",
        source: "EY-final p. 154" },
    ],
    context: "Project finance repays its debt from the project's own cash "
      + "flows; here the cash flows rested on the sponsor.",
    concept: "Project finance needs contracts with third parties: a related "
      + "party's promise is the sponsor's risk again, not a separate one.",
  },
  {
    n: 7,
    quotes: [
      { original: "devendo ficar com o máximo de 1/3 do valor financiado após sindicação",
        english: "to keep at most one third of the amount financed after syndication",
        source: "CPI-2019 p. 313" },
      { original: "viu-se forçada a deter a totalidade do projeto, sendo, no fim, o seu único financiador",
        english: "found itself forced to hold the whole project, being, in the "
          + "end, its sole financier",
        source: "CPI-2019 p. 323" },
      { original: "a CGD foi considerada um credor subordinado",
        english: "CGD was considered a subordinated creditor",
        source: "EY-final p. 189" },
    ],
    context: "The syndicate never formed (CPI-2019 p. 309).  The bank kept "
      + "and raised a shareholding in LSB while lending to it, and its venture "
      + "fund took 19 % of the plant company in 2010 (CPI-2019 p. 318).",
    concept: "Concentration of the lender's exposure, and a lender that "
      + "becomes a shareholder: its claim ranks behind other creditors when "
      + "the borrower fails.",
  },
  {
    n: 8,
    quotes: [
      { original: "permitiu-se o avanço da construção da fábrica enquanto decorriam as due diligences necessárias",
        english: "the construction of the plant was allowed to advance while "
          + "the necessary due diligences were running",
        source: "CPI-2019 p. 322" },
      { original: "tendo o valor da mesma sido alvo de uma desvalorização, devido a problemas ambientais",
        english: "its value [the mortgage on the surface right] having been "
          + "written down, owing to environmental problems",
        source: "EY-final p. 154" },
    ],
    context: "Five bridge loans financed construction before the project "
      + "finance was contracted in 2010; the due diligence found soil "
      + "contamination (CPI-2019 p. 314).",
    concept: "Stage gates: capital is committed after the due diligence of "
      + "the gate, not while it runs.",
  },
];

/** IVL's words about the cycle (step 7), persons not named. */
export const SINES_MARKET_QUOTES: readonly Quote[] = [
  { original: "Continuing oversupply of PTA in Asia, which is weakening spreads "
      + "across the value chain in the region and is marginally impacting the "
      + "western markets, in particular the South European markets for PET",
    english: "", source: "IVL-AR2012 PDF p. 83" },
  { original: "massive over-compensation of supply following the terrific spike "
      + "that occurred when cotton prices went through the roof in 2010-2011",
    english: "", source: "IVL-AR2013 p. 14" },
  { original: "we saw PTA spreads fall to below the cash cost of the large "
      + "majority of the industry",
    english: "", source: "IVL-AR2013 p. 14" },
  { original: "in Europe and North America spreads remained at an acceptable "
      + "level due to their ability to demand fixed cost plus margins and with "
      + "import price parity protection",
    english: "", source: "IVL-AR2014 PDF p. 21" },
];

export const SINES_LIMITS: readonly LessonLimit[] = [
  { id: "not-the-plan",
    title: "The appraisal is not the business plan",
    body: "No public document read gives the plan's conversion cost, fixed "
      + "costs, assumed spread, discount rate or cash flows.  The calculator "
      + "is the shape of the analysis on documented and synthetic inputs, "
      + "each labelled; its NPV is not a statement about the real project." },
  { id: "pre-tax",
    title: "Pre-tax, no financing, no working capital",
    body: "Taxes and depreciation, debt service and its covenants, working "
      + "capital (the feedstock bought before the product is paid for) and "
      + "receivables are not modelled.  Taxes, working capital and unpaid "
      + "receivables would each raise the break-even spread; debt service is "
      + "a financing question this unlevered appraisal does not ask, and it "
      + "is the one the project finance turned on." },
  { id: "one-spread",
    title: "One spread for the whole life",
    body: "The spread is constant over the life; the published series shows "
      + "it is not.  The tornado moves it between two published years; a "
      + "cycle is not drawn." },
  { id: "no-capacity-series",
    title: "No capacity series",
    body: "No open year-by-year series of Asian PTA capacity for 2008-2016 "
      + "was found, and a third party's chart inside a producer's report is "
      + "not reproduced.  The capacity argument is carried by the producer's "
      + "own words." },
  { id: "scope",
    title: "No politics, no persons, no motives",
    body: "By the author's ruling the page names institutions only and does "
      + "not discuss why any decision was taken.  The documents it cites "
      + "discuss more than this; what they say beyond the economic analysis "
      + "is outside this page." },
  { id: "unconfirmed",
    title: "What could not be confirmed",
    body: "How the EUR 520 M exposure of 2014 became EUR 351 M in 2015 is not "
      + "broken down in the documents read, and no insolvency declaration of "
      + "the plant company in 2017 was found in them; neither is stated here." },
];
