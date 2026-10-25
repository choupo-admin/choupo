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
  sinesPtaLesson -- the PROSE of "Economic appraisal and project risk:
  lessons from the Sines PTA plant" (DEV.md 4c C143): the steps, the risks
  the documents record with the conditions recommended and what the
  documents say followed, the checklist, and the limits.

  ONE RECORD IS THE SOURCE: docs/design/the-sines-pta-plant-appraisal-and-
  project-risk.md.  Every quotation below is in that record, at the page
  given, and tests/sinesPta.test.ts requires each original to be present
  there verbatim -- a quotation the record does not carry is one nobody read
  back.

  THE READING DISCIPLINE, which the page states and this file follows: a
  RISK IDENTIFIED, a CONDITION RECOMMENDED, a DECISION TAKEN and a LATER
  OUTCOME are four different facts, each with its own date and document.
  The page shows each one where a document records it and never presumes a
  link between them that no document states.

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

export const SINES_TITLE = "Economic appraisal and project risk: lessons from "
  + "the Sines PTA plant";

/** The purpose of the page, in one sentence. */
export const SINES_PURPOSE = "This case illustrates the importance of economic "
  + "appraisal, contractual robustness and downside analysis, drawing on risks "
  + "and outcomes recorded in public documents.";

/** The scope, stated once and soberly. */
export const SINES_SCOPE = "An economic and pedagogical analysis, without "
  + "determination of individual responsibilities.  Statements about "
  + "institutions are sourced and attributed like any other.";

/** The institutional note. */
export const SINES_INSTITUTIONAL_NOTE = "This educational material is published "
  + "within the independent Choupo project.  The analysis and interpretations "
  + "are the author's and do not represent an official position of Instituto "
  + "Superior Técnico or Universidade de Lisboa.";

export const SINES_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A case read from public documents",
    body: "From 2008 a world-scale plant for purified terephthalic acid (PTA) "
      + "was built in Sines, Portugal, by Artlant, a company of the PET "
      + "producer La Seda de Barcelona (LSB), financed by the public bank Caixa "
      + "Geral de Depósitos (CGD), which also became a shareholder.  It started "
      + "PTA production in 2012; its main customer, LSB, filed for insolvency "
      + "in 2013; the plant company went through a revitalisation process in "
      + "2014-2015, and its assets were sold in 2017.  The full business plan "
      + "is not public, and the documents show that analyses were made: a "
      + "viability assessment of the project was available at the initial "
      + "concession (EY-final p. 154), the bank's risk department issued "
      + "written opinions, and the project-finance terms asked for a "
      + "pessimistic scenario (CPI-2019 p. 311).  What the documents allow is "
      + "narrower and still useful: to see which risks were recorded, which "
      + "conditions were recommended, what the documents say was decided, and "
      + "what happened later -- four different facts, each dated and sourced, "
      + "with no link between them presumed where no document states one.  "
      + "The sources are of different reach: a parliamentary inquiry report, "
      + "an audit of management acts, a company's filings and accounts, and a "
      + "later owner's reports; the list at the end says what each one is and "
      + "where to read it.",
  },
  {
    n: 2,
    title: "From paraxylene to a bottle: price, feedstock and spread",
    body: "PTA is made from paraxylene (PX), which the inquiry report "
      + "describes as a by-product of fuel refining (CPI-2019 p. 288), and it "
      + "is \"the basic building block for all forms of polyester\": PET "
      + "packaging resin, films and synthetic fibres (EC-2007).  With "
      + "monoethylene glycol (MEG) it makes PET.  About 0.85 t of PTA goes into a "
      + "tonne of PET, and PTA is about 80 % of PET's production cost "
      + "(LSB-2012 p. 36); a US investigation gives 850 g of PTA and 350 g of "
      + "MEG per kilogram of resin, and PTA and MEG together as over 75 % of "
      + "its cost (USITC-4604 p. V-1).  The same registration document adds: "
      + "\"El precio de PTA está indexado al precio del paraxileno\" (the price "
      + "of PTA is indexed to the price of paraxylene; LSB-2012 p. 36).  A PTA "
      + "producer earns its revenue by selling PTA; when that price moves with "
      + "the feedstock, the product price, the feedstock cost and the "
      + "conversion cost have to be analysed together, and the SPREAD between "
      + "the first two is the central measure of the margin.  Producers "
      + "publish it: Indorama Ventures (IVL) reports an \"industry spread\" "
      + "defined as \"Selling price less raw material consumption\", per "
      + "tonne, for Asia and for the West (IVL-AR2015 PDF p. 98).  What the "
      + "plant keeps is the spread less its own conversion costs.",
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
    title: "The plant, and a capital cost stated with different perimeters",
    body: "The plant was designed for 700 000 t/yr with technology licensed "
      + "from Invista (LSB-2012 pp. 29, 37), a capacity LSB expected, in 2012, "
      + "to reach in the second year of production (LSB-2012 p. 44).  Its "
      + "capital cost was stated seven times in the documents read, from "
      + "about EUR 360 M in 2007 to EUR 462.056 M of gross investments in "
      + "progress in 2012.  Those figures have different perimeters -- an "
      + "approximate total cost in a state-aid press release, a budget, the "
      + "investment of a financing offer, a total of uses that includes opex "
      + "and financing costs, an estimated total project cost, and gross "
      + "assets under construction -- so the table keeps each value with its "
      + "perimeter and this page draws no ratio between them.  The conclusion "
      + "that the investment exceeded the budget is the inquiry report's: \"O "
      + "investimento para construção e operação da fábrica foi superior ao "
      + "orçamentado\" (the investment for building and operating the plant "
      + "exceeded the budget; CPI-2019 p. 319).",
  },
  {
    n: 4,
    title: "Who buys the output: the plan, the contract and its limits",
    body: "The investment assumed contracts for the purchase of the WHOLE "
      + "output by LSB for its PET plants (CPI-2019 p. 288).  The "
      + "project-finance terms of November 2008 included a purchase contract "
      + "by LSB at a price allowing a minimum EBITDA (CPI-2019 p. 311).  The "
      + "contract signed in 2010 obliges LSB to buy, and the plant company to "
      + "sell, an annual quantity of PTA negotiated by written offer, which "
      + "\"puede ascender hasta 450.000 toneladas anuales\" (may reach up to "
      + "450 000 tonnes a year) while LSB is a shareholder, at variable prices "
      + "linked to a market index, to 2030 (LSB-2012 pp. 29, 183; LSB-2014 "
      + "pp. 122-123).  The figure is a MAXIMUM, not a guaranteed purchase.  The "
      + "same accounts say the contract \"no establece explícitamente "
      + "penalizaciones\" (does not explicitly set penalties) if LSB buys "
      + "less than the annual offer, and that it is subject to Portuguese "
      + "commercial law; LSB nevertheless booked a provision of EUR 43.061 M "
      + "in 2013 against a claim by the plant company under it (LSB-2014 "
      + "pp. 122-123).  So the absence of an explicit penalty does not mean an "
      + "absence of obligations or legal consequences.  At nominal capacity, "
      + "35.7 % of the output was outside the contract's maximum even with "
      + "LSB buying all of it -- and that share is not the whole commercial "
      + "risk: the volume inside the maximum was set year by year, at a "
      + "market-indexed price, by a customer whose own credit was a risk "
      + "(step 8).  LSB's four PET plants, 560 000 t/yr nominal, needed "
      + "470 000 t of PTA a year (LSB-2012 p. 37), which is the 0.85 ratio of "
      + "step 2 at work: 0.85 × 560 = 476.",
    formula: String.raw`\varphi_\mathrm{m} = 1 - \frac{\min(Q_\mathrm{c},\, P)}{P}`,
    where: [
      { sym: "\\varphi_\\mathrm{m}", means: "the merchant share: the fraction "
        + "of production the captive volume does not take", unit: "–" },
      { sym: "Q_\\mathrm{c}", means: "the volume the captive customer takes",
        unit: "kt/yr" },
      { sym: "P", means: "the production", unit: "kt/yr" },
    ],
    derivation: [
      { step: "At nominal capacity and the contract's maximum (this page's "
          + "calculation):",
        eq: String.raw`\varphi_\mathrm{m} = 1 - \frac{450}{700} = 0.357` },
      { step: "Against the whole need of the customer's PET plants instead:",
        eq: String.raw`\varphi_\mathrm{m} = 1 - \frac{470}{700} = 0.329` },
      { step: "In the calculator below, production in year 2 is 90 % of "
          + "capacity, 630 kt, so the same 450 kt leave a smaller share "
          + "(an assumption of the model, not a documented figure):",
        eq: String.raw`\varphi_\mathrm{m} = 1 - \frac{450}{630} = 0.286` },
    ],
  },
  {
    n: 5,
    title: "A simplified appraisal for teaching",
    body: "A simplified, PRE-TAX, UNFINANCED appraisal, simple enough to do by "
      + "hand: the capital is spent during construction; each operating year "
      + "earns the spread less the conversion cost on every tonne, loses a "
      + "discount on every merchant tonne, pays its fixed costs, and is "
      + "discounted to the decision.  The captive customer may stop buying "
      + "after a year you choose, and then its tonnes are merchant tonnes too.  "
      + "Two inputs are DOCUMENTED (the capacity, and the capital of the "
      + "November 2008 proposal); every other one is an ASSUMPTION, labelled "
      + "as such.  The calculator is not a reconstruction of the business "
      + "plan, which is not public, and not an estimate of the historical "
      + "project's value: being unfinanced, it cannot say whether the project "
      + "could service its debt.  It is the shape of an analysis, on numbers "
      + "you can defend or change.",
    formula: String.raw`\mathrm{NPV} = -\sum_{j=1}^{N_\mathrm{c}}\frac{C/N_\mathrm{c}}{(1+i)^{j}} + \sum_{k=1}^{N}\frac{\mathrm{CF}_k}{(1+i)^{N_\mathrm{c}+D+k}}`,
    where: [
      { sym: "\\mathrm{NPV}", means: "the net present value at the decision, "
        + "before tax and without financing", unit: "M EUR" },
      { sym: "N_\\mathrm{c}", means: "the planned construction period", unit: "yr" },
      { sym: "C", means: "the capital cost, spent in equal parts at the end of "
        + "each construction year (a stated policy)", unit: "M EUR" },
      { sym: "i", means: "the discount rate", unit: "–" },
      { sym: "j", means: "the construction year", unit: "–" },
      { sym: "N", means: "the operating life", unit: "yr" },
      { sym: "\\mathrm{CF}_k", means: "the cash flow of operating year k "
        + "(below)", unit: "M EUR" },
      { sym: "D", means: "the delay of the start-up beyond the plan; it only "
        + "shifts the operating years", unit: "yr" },
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
    title: "The break-even spread, and what it does and does not say",
    body: "Because the NPV is a straight line in the spread, the constant "
      + "spread at which it is zero is exact: the value of the line at s = 0 "
      + "divided by its slope.  It can be set beside spreads observed "
      + "elsewhere, which is what makes it useful -- with two cautions.  "
      + "First, a break-even close to a historical average does not mean the "
      + "average is needed every year: the spread varies, and with a varying "
      + "spread what decides the NPV is the time sequence of the cash flows, "
      + "discounted (a bad first year weighs more than a bad last year).  "
      + "Second, the published spreads in the chart are later information, "
      + "of other regions: none of them was available at the 2007-2008 "
      + "decision, and none is the Sines plant's own realised spread.  The "
      + "tornado moves one input at a time between two ends and ranks them by "
      + "how far they move the NPV.  Try downside cases of the kind the "
      + "documents discuss: the project-finance terms asked for a pessimistic "
      + "scenario with debt service supported only by sales to LSB (CPI-2019 "
      + "p. 311); try also the customer stopping after year 2, a spread at the "
      + "2014 Asian figure, and a start-up two years late.",
    formula: String.raw`s^{*} = -\frac{\mathrm{NPV}(s = 0)}{b}, \qquad b = \sum_{k=1}^{N}\frac{10^{-3}\,P_k}{X\,(1+i)^{N_\mathrm{c}+D+k}}`,
    where: [
      { sym: "s^{*}", means: "the constant break-even spread, at which NPV = 0",
        unit: "US$/t" },
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
    title: "The market: what was recorded at the decision, and what came later",
    body: "AT THE DECISION, the documents record the risk in general terms.  "
      + "In January 2008 the bank's risk department wrote that \"Previa-se "
      + "concorrência futura dos mercados asiáticos\" (future competition from "
      + "Asian markets was foreseen; CPI-2019 p. 303), and in November 2008 it "
      + "cited an increase of non-European competition, eased by an exchange "
      + "rate unfavourable to the euro, \"conforme referido pelo consultor do "
      + "projecto\" (as the project's consultant had stated; CPI-2019 p. 312).  "
      + "LATER, IVL's annual reports describe what happened: supply added far "
      + "beyond demand after the margins of 2010-2011, Asian spreads falling "
      + "\"below the cash cost of the large majority of the industry\" "
      + "(IVL-AR2013 p. 14), and Western spreads staying higher because "
      + "producers there could \"demand fixed cost plus margins\" with "
      + "\"import price parity protection\" (IVL-AR2014 PDF p. 21).  IVL's "
      + "published West spread was more than twice the Asian one in every "
      + "year from 2014 to 2017 -- but it is a 50:50 North America : Europe "
      + "index, not the Sines plant's realised spread, and it was published "
      + "from 2015 on.  How a regional premium can narrow is worth stating "
      + "precisely: more Asian capacity may press down the prices at which "
      + "exports are offered; freight and the exchange rate change what an "
      + "import costs; each is a separate input of a scenario.  In 2025 the "
      + "plant's later owner listed \"competition from low-cost PTA imports\" "
      + "among its reasons for selling it (IVL-SET-2025).  No open "
      + "year-by-year series of Asian PTA capacity was found, so none is drawn.",
  },
  {
    n: 8,
    title: "Risks identified, conditions recommended, and what the documents record",
    body: "CGD's risk department wrote opinions on the operation from 2008 "
      + "on; the inquiry report and the audit document them.  In January 2008 "
      + "its opinion on a first bridge loan was \"Desfavorável\" "
      + "(unfavourable); later ones were \"Condicionado\" (conditional) and, "
      + "on some approvals from 2011 to 2016, \"mantendo sempre a opinião "
      + "desfavorável a aumentos de exposição\" (always keeping its "
      + "unfavourable opinion on increases of exposure; CPI-2019 pp. 302-303, "
      + "321-322).  Each card below separates four things: the risk as a "
      + "document records it, with its date; the condition recommended, if "
      + "one is recorded; what the documents record about the decision or "
      + "response; and what happened later.  Where a document records a "
      + "response, it is quoted -- the inquiry report states, for instance, "
      + "that the structured-finance department \"incorporou o espírito das "
      + "sugestões da DGR\" (incorporated the spirit of the risk department's "
      + "suggestions; CPI-2019 p. 313).  A risk documented at the time shows "
      + "that it was identified; it does not show that the size of the later "
      + "losses or the later course of the market was foreseeable, and the "
      + "cards do not suggest it.  The last line of each card names the "
      + "corresponding appraisal concept.",
  },
  {
    n: 9,
    title: "What happened",
    body: "Production activities began in December 2011 and PTA production in "
      + "March 2012; the November 2008 proposal had planned the end of "
      + "construction for 2010 (CPI-2019 pp. 310, 320).  The plant stopped for "
      + "technical problems within weeks; its customer LSB was declared "
      + "insolvent in July 2013; it stopped again in October 2013 for lack of "
      + "paraxylene; it held EUR 50 M of receivables on LSB \"de PTA vendido e "
      + "não pago\" (for PTA sold and not paid; CPI-2019 p. 321); it entered a "
      + "revitalisation process in 2014 whose refinancing agreement the court "
      + "approved in 2015 (LSB-2014 p. 13); and its assets were sold in "
      + "November 2017.  Four different prices and values follow, and they "
      + "are not interchangeable.  The ASSET PRICE: EUR 28 M for the plant "
      + "company's assets (CPI-2019 p. 322), EUR 42.5 M in the buyer's "
      + "accounts with the adjacent utility's assets (IVL-AR2017 PDF p. 224).  "
      + "The buyer's ACCOUNTING VALUE: a provisional fair value of the net "
      + "assets acquired of THB 4 503.5 M against a consideration of THB "
      + "1 640.6 M, and so a gain on bargain purchase of THB 2 862.9 M, with "
      + "the independent appraiser's report not yet completed (IVL-AR2017 PDF "
      + "pp. 112, 224).  That gain is an accounting result of a provisional "
      + "valuation; by itself it does not show where the difference came "
      + "from.  One possible reading is that the assets were worth more to a "
      + "buyer with its own PTA and PET business -- the buyer wrote that it "
      + "expected the purchase to enhance its PTA leadership in Europe and "
      + "secure the plant's energy supply (IVL-AR2017 PDF p. 224) -- and the "
      + "documents read do not decide it.  The IMPAIRMENT: the buyer impaired "
      + "the assets in 2024.  The SHARE PRICE: in April 2025 it sold 100 % of "
      + "the quotas of its own Portuguese subsidiary, which operated the "
      + "plant, for EUR 100 000, the purchaser assuming its future "
      + "obligations; the plant had ceased operation about two years before "
      + "(IVL-SET-2025).",
  },
  {
    n: 10,
    title: "How much was lost depends on what you measure",
    body: "The table below gives ten figures from the documents, each with "
      + "what it measures and its status.  They OVERLAP and must not be added: "
      + "the facilities of 2010 are inside the exposure of 2014, which was "
      + "restructured into the exposure of 2015, part of which was impaired; "
      + "the gross involvement adds equity and loans to two companies over the "
      + "whole period; an impairment is an accounting recognition, a realised "
      + "loss is a different number, and a price is neither.  The figure "
      + "usually quoted is the parliamentary inquiry commission's own "
      + "estimate: \"O envolvimento global da CGD neste projeto, resultou em "
      + "perdas de pelo menos EUR 400M\" (CGD's overall involvement in this "
      + "project resulted in losses of at least EUR 400 M; CPI-2019 p. 323).  "
      + "It is attributed to that commission and given here as its estimate, "
      + "not as this page's.  The lesson for a process engineer is the one of "
      + "the capital cost in step 3: a number without its definition is not a "
      + "result.",
  },
  {
    n: 11,
    title: "What an appraisal of a project like this should contain",
    body: "A checklist to take away.  None of it is specific to PTA, and "
      + "none of it needs a simulator -- which is the point: these are the "
      + "questions that decide whether a simulation is worth building.",
  },
];

/** The checklist of step 11. */
export const SINES_CHECKLIST: readonly string[] = [
  "Analyse the product price, the feedstock cost and the conversion cost "
    + "together; the spread over the feedstock, with its history and range, "
    + "is the central measure of the margin.",
  "Compute the merchant share: who buys each tonne, under what contract, at "
    + "what price, with what obligations if they buy less -- and treat a "
    + "contractual maximum as a maximum.",
  "Treat a captive customer as a counterparty: its accounts, its debt, and "
    + "a downside case in which it stops buying and paying.",
  "Secure the feedstock: a supply arrangement and the working capital to buy "
    + "it, and a case in which it is interrupted.",
  "Read the capacity pipeline, the exchange rate and the cost of imports "
    + "behind a regional spread, and put each in the scenarios.",
  "Report the break-even spread beside the spreads that have occurred, and "
    + "test a varying spread as well as a constant one: the timing of the "
    + "cash flows matters.",
  "Run the downside cases and a tornado, and say which inputs are "
    + "documented, which are assumed, and which were available at the "
    + "decision.",
  "State every capital figure with its perimeter, and compare like with like.",
  "In a project finance, assess the robustness of the cash flows, the "
    + "counterparties, the contracts and the guarantees; where the main "
    + "contracts are with related parties, look for concentration and for "
    + "risks that move together.",
  "Commit capital after the due diligence of the gate, not while it runs "
    + "(the Front-End Loading page).",
  "Watch concentration: one lender, one customer and one feedstock source "
    + "are three single points of failure.",
];

/** A recorded statement: what a document says, quoted where it can be, with
 *  the date of the statement and a plain-English note beside it. */
export interface Recorded {
  when: string;
  quotes: readonly Quote[];
  note: string;
}

/** One risk, read as four separate facts. */
export interface RiskCard {
  n: number;
  title: string;
  /** The risk, as a document records it. */
  identified: Recorded;
  /** The condition recommended, where one is recorded; null when the
   *  passages read record none. */
  condition: Recorded | null;
  /** What the documents record about the decision or response. */
  decision: Recorded;
  /** What happened later; dated, and later information. */
  later: string;
  /** The corresponding appraisal concept. */
  concept: string;
}

export const SINES_RISKS: readonly RiskCard[] = [
  {
    n: 1,
    title: "Offtake",
    identified: {
      when: "November 2008, the risk department's opinion",
      quotes: [
        { original: "contrato (não assegurado) de off take (compra de 100% da produção)",
          english: "an offtake contract (not secured) for the purchase of 100 % of the output",
          source: "CPI-2019 p. 312" },
      ],
      note: "Sales, as planned, depended on LSB honouring that contract.",
    },
    condition: {
      when: "November 2008, the same opinion",
      quotes: [
        { original: "Existência de contratos firmes de off take, a preços fixos",
          english: "firm offtake contracts at fixed prices",
          source: "CPI-2019 p. 313" },
      ],
      note: "One of the conditions on which the opinion made the bank's "
        + "participation depend.",
    },
    decision: {
      when: "November 2008",
      quotes: [
        { original: "As condições foram aprovadas pela DSF, que incorporou o espírito das sugestões da DGR, apesar dos diversos riscos mencionados",
          english: "the conditions were approved by the structured-finance "
            + "department, which incorporated the spirit of the risk "
            + "department's suggestions, despite the various risks mentioned",
          source: "CPI-2019 p. 313" },
      ],
      note: "The approved project-finance terms included a purchase contract "
        + "by LSB at a price allowing a minimum EBITDA (CPI-2019 p. 311).",
    },
    later: "The contract signed in 2010 set an annual quantity by written "
      + "offer, up to 450 kt/yr, at market-indexed prices (LSB-2012 pp. 29, "
      + "183; LSB-2014 pp. 122-123).",
    concept: "Offtake security and customer concentration: appraise on the "
      + "volume contracted and on what the contract obliges; treat the rest as "
      + "a merchant share priced at the market.",
  },
  {
    n: 2,
    title: "The customer's credit",
    identified: {
      when: "January and November 2008, the risk department's opinions",
      quotes: [
        { original: "Risco de incumprimento da LSB",
          english: "risk of default by LSB", source: "CPI-2019 p. 312" },
        { original: "O desconhecimento da \u201csituação real de risco e de mercado\u201d da LSB",
          english: "lack of knowledge of LSB's \"real risk and market situation\"",
          source: "CPI-2019 p. 312" },
      ],
      note: "In January 2008 the opinion recorded that LSB had grown by "
        + "acquisitions whose consolidation was not complete, so that its "
        + "consolidated position was hard to assess; a net profit of EUR "
        + "2.9 M on EUR 645 M of sales in 2006; and EUR 605 M of financial "
        + "debt (CPI-2019 pp. 302-303).  In November 2008 the lack of "
        + "knowledge was because audit reports on the group's half-year "
        + "accounts were not available; the same opinion noted, as a possible "
        + "mitigant, a merger then under negotiation between LSB and Indorama "
        + "Ventures, which could bring synergies (CPI-2019 p. 312).",
    },
    condition: {
      when: "January and November 2008",
      quotes: [],
      note: "In January 2008: involvement only after effective knowledge of "
        + "the group's certified financial position, preferably as a project "
        + "finance (CPI-2019 p. 303).  In November 2008: a cross default with "
        + "LSB's debt, and the entry of a new partner in LSB (Indorama "
        + "Ventures, with at least one third of the capital) (CPI-2019 p. 313).",
    },
    decision: {
      when: "November 2008",
      quotes: [
        { original: "Não ficou estabelecida a condição de entrada do parceiro INDORAMA",
          english: "the condition of the entry of the partner INDORAMA was not established",
          source: "CPI-2019 p. 313" },
      ],
      note: "The inquiry report also notes that the plant company's financing "
        + "depended on covenants of LSB's own financings (CPI-2019 p. 287).",
    },
    later: "LSB filed for insolvency in June 2013 (LSB-2014 p. 8); in 2014 "
      + "the plant company held EUR 50 M of receivables on it for PTA sold and "
      + "not paid (CPI-2019 p. 321).",
    concept: "Counterparty credit risk: the customer's balance sheet is an "
      + "input of the appraisal, with a case in which it stops buying and "
      + "paying; where customer and sponsor are the same group, their risks "
      + "move together.",
  },
  {
    n: 3,
    title: "Feedstock",
    identified: {
      when: "November 2008, the risk department's opinion",
      quotes: [
        { original: "o paraxileno, matéria prima do PTA, era uma commodity (produto não diferenciável) transacionada no mercado, com uma volatilidade elevada do preço",
          english: "paraxylene, the raw material of PTA, was a commodity traded on "
            + "the market, with high price volatility",
          source: "CPI-2019 p. 312" },
      ],
      note: "Listed as the raw-material supply risk.",
    },
    condition: null,
    decision: {
      when: "—",
      quotes: [],
      note: "In 2012 the LSB registration document counted a strategic "
        + "connection with a paraxylene producer in Portugal among the "
        + "plant's strengths (LSB-2012 p. 37).  No condition on the feedstock "
        + "is recorded in the passages read.",
    },
    later: "Before start-up an additional credit line of up to EUR 50 M was "
      + "requested to guarantee payment for paraxylene purchases (CPI-2019 "
      + "p. 320); production stopped on 9 October 2013 \"por falta de "
      + "matéria-prima\" (for lack of raw material; CPI-2019 p. 321).",
    concept: "Feedstock security and working capital: a supply arrangement, "
      + "the working capital to buy the feedstock, and an interruption case.",
  },
  {
    n: 4,
    title: "Competition and the exchange rate",
    identified: {
      when: "January and November 2008, the risk department's opinions",
      quotes: [
        { original: "Previa-se concorrência futura dos mercados asiáticos",
          english: "future competition from Asian markets was foreseen (January 2008)",
          source: "CPI-2019 p. 303" },
        { original: "aumento da concorrência extra-europeia [...] onde uma taxa de câmbio desfavorável ao euro facilita a entrada de concorrentes asiáticos, conforme referido pelo consultor do projecto",
          english: "increasing non-European competition, where an exchange rate "
            + "unfavourable to the euro eases the entry of Asian competitors, as "
            + "the project's consultant had stated (November 2008)",
          source: "CPI-2019 p. 312" },
      ],
      note: "The November 2008 passage attributes the point to the project's "
        + "own consultant: a market study was part of the file.",
    },
    condition: null,
    decision: {
      when: "—",
      quotes: [],
      note: "No condition specific to this risk is recorded in the passages read.",
    },
    later: "The Asian spread was 87 US$/t in 2014 (IVL-AR2015); IVL attributed "
      + "the higher Western spreads to import price parity (IVL-AR2014 PDF "
      + "p. 21) -- step 7.",
    concept: "Market capacity and import costs: the capacity pipeline, the "
      + "cost of imports and the exchange rate are inputs of the scenarios.",
  },
  {
    n: 5,
    title: "Volatility and a minimum EBITDA",
    identified: {
      when: "January 2008, the risk department's opinion",
      quotes: [
        { original: "volatilidade do preço das matérias primas",
          english: "volatility of raw-material prices", source: "CPI-2019 p. 303" },
      ],
      note: "Together with consolidation in the sector favouring larger operators.",
    },
    condition: {
      when: "November 2008",
      quotes: [
        { original: "Apresentação de garantia bancária que cobrisse o diferencial entre o EBITDA real e o EBITDA mínimo para o serviço da dívida",
          english: "a bank guarantee covering the difference between the actual "
            + "EBITDA and the minimum EBITDA for debt service",
          source: "CPI-2019 p. 313" },
      ],
      note: "A condition of the November 2008 opinion.",
    },
    decision: {
      when: "November 2008",
      quotes: [
        { original: "Cenário pessimista que assegurasse o serviço da dívida suportado apenas em vendas à LSB",
          english: "a pessimistic scenario ensuring debt service supported only "
            + "by sales to LSB",
          source: "CPI-2019 p. 311" },
      ],
      note: "One of the project-finance terms the proposal set out; the "
        + "documents read do not give the scenario itself.",
    },
    later: "IVL reported Asian oversupply weakening spreads in 2012 "
      + "(IVL-AR2012 PDF p. 83), and spreads below the cash cost of most of "
      + "the industry in 2013 (IVL-AR2013 p. 14).",
    concept: "Volatility and downside cases: the break-even spread beside the "
      + "observed spreads, a varying spread, and a pessimistic case stated in "
      + "advance.",
  },
  {
    n: 6,
    title: "The project-finance structure",
    identified: {
      when: "an unfavourable opinion of the risk department, recorded by the "
        + "auditor under the restructuring of the operation; the passage does "
        + "not date it",
      quotes: [
        { original: "(ausência de contratos com entidades externas ao Grupo que permitissem assegurar a estabilidade de cash flows para suportar o serviço da dívida) não se enquadram com uma estrutura de project finance",
          english: "(the absence of contracts with entities outside the group "
            + "able to secure stable cash flows for debt service) does not fit "
            + "a project-finance structure",
          source: "EY-final p. 154" },
      ],
      note: "The same passage records the department's view that the risk had "
        + "worsened against its previous assessment, with a larger investment, "
        + "a larger financing, a larger firm underwriting by the bank and a "
        + "worse view of the overall risk of the involvement with the "
        + "shareholder.",
    },
    condition: null,
    decision: {
      when: "the auditor's summary",
      quotes: [],
      note: "For the initial concession the auditor marks that the risk "
        + "department's conditions were not shown to have been accommodated, "
        + "writing that no information was made available that would allow "
        + "it to verify that they were (EY-final pp. 115, 154).  The inquiry "
        + "report, on the November 2008 opinion, records that the "
        + "structured-finance department incorporated the spirit of the "
        + "suggestions (CPI-2019 p. 313).  The two documents are quoted as "
        + "they stand.",
    },
    later: "The auditor's own observation: \"O projeto de produção assentava "
      + "essencialmente no escoamento da produção para o principal acionista. "
      + "Tal não se veio a verificar por diversas vicissitudes não só "
      + "relacionadas com questões técnicas do projeto, mas do próprio "
      + "acionista que declarou insolvência em 2013\" (the production project "
      + "rested essentially on selling the output to the main shareholder; "
      + "that did not happen, for various reasons related not only to "
      + "technical questions of the project but to the shareholder itself, "
      + "which declared insolvency in 2013; EY-final p. 154).",
    concept: "Project finance repays its debt from the project's own cash "
      + "flows, so the appraisal assesses their robustness, the "
      + "counterparties, the contracts and the guarantees; contracts with "
      + "related parties call for attention to concentration and to "
      + "correlated risks.",
  },
  {
    n: 7,
    title: "The lender's concentration",
    identified: {
      when: "January and November 2008",
      quotes: [],
      note: "The project-finance offer of January 2008 had the bank "
        + "underwrite one third of the financing (CPI-2019 p. 301); the "
        + "November 2008 proposal, 100 % pending a syndicate (CPI-2019 p. 309).",
    },
    condition: {
      when: "November 2008, the risk department's opinion",
      quotes: [
        { original: "devendo ficar com o máximo de 1/3 do valor financiado após sindicação",
          english: "to keep at most one third of the amount financed after syndication",
          source: "CPI-2019 p. 313" },
      ],
      note: "",
    },
    decision: {
      when: "November 2008 to 2010",
      quotes: [],
      note: "Banks were approached for a syndicate, and \"o sindicato bancário "
        + "não se veio a materializar\" (the bank syndicate did not "
        + "materialise; CPI-2019 p. 309).  In 2010 the bank's venture fund "
        + "took 19 % of the plant company (CPI-2019 p. 318).",
    },
    later: "The inquiry report's conclusion: the bank \"viu-se forçada a "
      + "deter a totalidade do projeto, sendo, no fim, o seu único "
      + "financiador\" (found itself forced to hold the whole project, being, "
      + "in the end, its sole financier; CPI-2019 p. 323).  The auditor's "
      + "statement, about the bank's shareholding in LSB: by keeping and "
      + "raising it while lending to LSB and to a subsidiary, \"a CGD foi "
      + "considerada um credor subordinado\" (CGD was considered a "
      + "subordinated creditor; EY-final p. 189).  The audit does not say by "
      + "whom or for which claims, and this page does not generalise it.",
    concept: "Concentration of the lender's exposure, and the position of a "
      + "lender that is also a shareholder of the borrower's group: in this "
      + "case, the auditor records, it affected how the bank's claims were "
      + "classified.",
  },
  {
    n: 8,
    title: "Stage gates",
    identified: {
      when: "January 2008",
      quotes: [],
      note: "The project-finance offer was conditional on technical, legal and "
        + "audit due diligence (CPI-2019 p. 301), and the risk department "
        + "asked that the bridge financing imply no firm underwriting "
        + "commitment while the project was still in due diligence (CPI-2019 "
        + "p. 304).",
    },
    condition: null,
    decision: {
      when: "2008-2010",
      quotes: [],
      note: "Five bridge loans financed construction until the project "
        + "finance was contracted in 2010 (CPI-2019 p. 322).",
    },
    later: "During the due diligence, soil contamination was detected "
      + "(CPI-2019 p. 314).  The inquiry report's conclusion: \"permitiu-se o "
      + "avanço da construção da fábrica enquanto decorriam as due diligences "
      + "necessárias\" (the construction of the plant was allowed to advance "
      + "while the necessary due diligences were running; CPI-2019 p. 322).  "
      + "The auditor records the mortgage on the surface right as not "
      + "executed, \"tendo o valor da mesma sido alvo de uma desvalorização, "
      + "devido a problemas ambientais\" (its value having been written down, "
      + "owing to environmental problems; EY-final p. 154).",
    concept: "Stage gates: capital is committed after the due diligence of "
      + "the gate, not while it runs.",
  },
];

/** IVL's words about the cycle (step 7), all of them later information. */
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
    title: "Not the business plan, not a historical valuation",
    body: "The business plan is not public; no document read gives its "
      + "conversion cost, fixed costs, assumed spread, discount rate or cash "
      + "flows.  The calculator is an illustrative teaching scenario on two "
      + "documented inputs and labelled assumptions; its NPV and break-even "
      + "are not statements about the real project." },
  { id: "pre-tax",
    title: "Pre-tax and unfinanced",
    body: "Taxes and depreciation, financing and debt service, working "
      + "capital (the feedstock bought before the product is paid for) and "
      + "receivables are not modelled, so the appraisal cannot conclude on "
      + "the project's capacity to service its debt -- the question a project "
      + "finance turns on.  How taxes and working capital would move the "
      + "break-even depends on the tax treatment, on timing and on whether "
      + "the working capital is recovered at the end; the page does not "
      + "presume the direction." },
  { id: "delay",
    title: "A delay only shifts revenue here",
    body: "In this model a later start-up moves the operating years later and "
      + "changes nothing else; the costs a real delay brings (interest during "
      + "construction, a longer team on site, prices that move meanwhile) are "
      + "not included unless you add them." },
  { id: "one-spread",
    title: "One spread for the whole life",
    body: "The spread is constant over the life; the published series shows "
      + "it is not.  The tornado moves it between two published figures of "
      + "2014, which are retrospective scenarios; a cycle is not drawn." },
  { id: "periods",
    title: "What was known when",
    body: "The capital of November 2008 and the risk opinions of 2008 were "
      + "available at the decision.  The supply contract (2010), LSB's "
      + "registration document (2012), IVL's spreads and market statements "
      + "(2013-2018) and everything after start-up were not.  The page "
      + "labels later information as later; a retrospective scenario is not "
      + "a judgement on what could have been known." },
  { id: "no-capacity-series",
    title: "No capacity series",
    body: "No open year-by-year series of Asian PTA capacity for 2008-2016 "
      + "was found, and a third party's chart inside a producer's report is "
      + "not reproduced.  The capacity argument is carried by the producer's "
      + "own words." },
  { id: "scope",
    title: "Scope",
    body: SINES_SCOPE + "  The documents cited discuss more than economics; "
      + "this page uses what bears on the economic analysis, and reports the "
      + "conditions, responses and conclusions found next to each passage it "
      + "selects." },
  { id: "unconfirmed",
    title: "What could not be confirmed",
    body: "How the EUR 520 M exposure of 2014 became EUR 351 M in 2015 is not "
      + "broken down in the documents read; no insolvency declaration of the "
      + "plant company in 2017 was found in them; and the date of the "
      + "risk-department opinion the auditor records under the restructuring "
      + "(card 6) is not given.  None of these is stated here as a fact." },
];
