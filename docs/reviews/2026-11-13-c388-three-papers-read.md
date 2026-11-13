# Three papers read for the page "Equilibrium stages or rate-based?" (C388), 2026-11-13

**What this is.**  A reading note, not a review of the engine.  Three papers
were read for one purpose: every place where their AUTHORS say that an
equilibrium-stage model (with or without efficiencies) is enough, is not
enough, or what a rate-based (nonequilibrium) model costs or requires.
Each row is a PARAPHRASE with the section and the page it rests on; nothing
is quoted beyond a few words, nothing is inferred, and a hedge of the
authors is kept as a hedge.

**Who read it.**  A reading general of the coordinating session, from the
text layer of the three files (no page image was needed).  The architect
then checked these statements against the text himself: the two equation
counts and the "minor drawback" remark of the 1985 paper (p. 454), its
"unequal and unbounded" (p. 450); in the 2000 review the unequal component
efficiencies above one and below zero (p. 5205), the preliminary-design /
final-design sentence, the dynamics sentence, the cost remark and the
missing-data remark (p. 5220); in the 2014 chapter the 20 % of the tray
flow model (p. 126-127), the film model of no practical value (p. 124)
and the binary transfer units (p. 134-135).  They stand as written below
(the page numbers are the reading general's).  The other rows were not
re-read.

**Limits.**  The 1985 file holds Part I only (its last page is the first
page of Part II, cut mid-sentence).  The 2000 review and the 2014 chapter
were read in full only where section 6 says so; elsewhere they were
searched by keyword.  A magazine article of 2003 by three of these authors
was looked for and is not held.

Private note. Only what the authors say; paraphrases are mine; no inference. Printed page = PDF page + 448 (Krishnamurthy), + 96 (Taylor and Kooijman), + 5182 (Taylor and Krishna). All rows come from the text layer (pdftotext) unless stated; no page image was needed. In the 2000 review the text layer has ligature noise ("e$ciency" = efficiency) but the words are readable.

## 1. Confirmed identities (from each PDF's own first page)

1. Taylor, R.; Kooijman, H.A. (2014). "Mass Transfer in Distillation", Chapter 3 of *Distillation: Fundamentals and Principles*, Elsevier, pp. 97-143. doi:10.1016/B978-0-12-386547-2.00003-X (printed on page 97). 47 PDF pages. CONFIRMED.
2. Taylor, R.; Krishna, R. (2000). "Modelling reactive distillation" (Review), Chem. Eng. Sci. 55, 5183-5229. PII S0009-2509(00)00120-2 printed; the folder already held it. taylor2000.pdf is byte-identical (same sha256 88a20d51...) to Articles/Distillation/taylor2000-modelling-reactive-distillation-review.pdf. CONFIRMED.
3. Krishnamurthy, R.; Taylor, R. (1985). "A Nonequilibrium Stage Model of Multicomponent Separation Processes. Part I: Model Description and Method of Solution", AIChE J. 31(3), 449-456 (March 1985, Vol. 31 No. 3, page headers 449-455 plus references). CONFIRMED, except that NO DOI is printed on the pages: 10.1002/aic.690310312 is the stated one, not read from the paper. The file is 8 PDF pages: pdf 1 starts with the tail of the preceding article's references; pdf 8 (printed 456) is the first page of Part II (title, abstract, start of SCOPE), cut off mid-sentence.

## 3. Krishnamurthy and Taylor 1985 (Part I)

Sections are unnumbered; headings are named. Page: printed / pdf.

| # | situation | verdict | paraphrase | section | page | confidence |
|---|---|---|---|---|---|---|
| K1 | Real stages in distillation or absorption | not enough (as pure equilibrium) | Stages rarely if ever reach equilibrium, so the usual remedy is to put a stage efficiency into the equilibrium relations, and that is where trouble begins. | SCOPE | 449 / 1 | text layer read |
| K2 | Choosing an efficiency definition | not enough / costs | Several definitions exist with no consensus; the most rigorous one is very hard to compute, the most used one is the least well founded but easy to combine with the equilibrium equations. | SCOPE | 449 / 1 | text layer read |
| K3 | Thermal efficiencies | enough (as practice) | They are nearly always taken as one, with a possible exception when inert species are present. | SCOPE | 449 / 1 | text layer read |
| K4 | Any efficiency must be obtained somehow | requires | It must be specified in advance or computed from the separation that the phase balances would give relative to a reference separation. | SCOPE | 449 / 1 | text layer read |
| K5 | Multicomponent mixtures, equal component efficiencies | not enough | With c components there are c-1 independent component efficiencies, usually set equal for lack of anything better, yet they are rarely equal because species transfer at different rates. | SCOPE | 449-450 / 1-2 | text layer read |
| K6 | Multicomponent mass-transfer interaction | not enough | Coupling between gradients (reverse and osmotic diffusion) can put individual point efficiencies anywhere from minus to plus infinity; the authors cite measurements confirming unequal, unbounded values. | SCOPE | 450 / 2 | text layer read |
| K7 | Binary or multicomponent trays, other causes | not enough (hedged: "for other reasons") | Tray efficiencies may exceed one for reasons such as weeping or entrainment. | SCOPE | 450 / 2 | text layer read |
| K8 | Combining multicomponent efficiency models with a column calculation | costs / requires | Efficiency models were tested on little data and, apart from one early work, not combined with a multistage method; care would be needed not to violate material balances. | SCOPE | 450 / 2 | text layer read |
| K9 | Authors' overall position | not enough (their stated belief) | They contend that the arbitrary, ambiguous multicomponent efficiency adds needless complexity and that a sequence of nonequilibrium stages solving the phase balances directly is more effective. | SCOPE | 450 / 2 | text layer read |
| K10 | What the nonequilibrium model avoids | requires | Efficiency and number of transfer units are avoided entirely; instead rate equations with transfer coefficients and interface equilibrium are used. | CONCLUSIONS AND SIGNIFICANCE | 450 / 2 | text layer read |
| K11 | What the nonequilibrium model needs | requires | Resistances in both phases come from separate rate equations, with transfer coefficients and physical and thermodynamic properties supplied by other methods; interfacial effects are ignored here. | CONCLUSIONS (items 2-4); Interface Model | 450 / 2; 452 / 4 | text layer read |
| K12 | Dividing each phase into several regions | costs | Doing so greatly increases the number of equations and the cost of the solution. | Conservation relations (rate equations) | 452 / 4 | text layer read |
| K13 | Unknowns and equations of one nonequilibrium stage | costs | 6c+5 unknowns and as many independent equations per stage, reducible by elimination to 5c+1 variables per stage. | Variables and Functions for a Single Nonequilibrium Stage | 452 / 4; 453 / 5 | text layer read |
| K14 | Derivatives of properties | costs | Finite-difference derivatives of properties greatly raise the cost (many more property evaluations); neglecting them can add iterations or cause failure. | Solving the MERQ equations | 453 / 5 | text layer read |
| K15 | Equations are badly scaled | costs | In SI units terms span about ten orders of magnitude, a problem for quasi-Newton methods. | Solving the MERQ equations | 453 / 5 | text layer read |
| K16 | Hybrid Newton/quasi-Newton versus Newton | costs | Newton needed about 5 iterations and the hybrid about 10, but the hybrid typically took about half the time (sometimes much less, never much more). | A Hybrid Method | 453 / 5 | text layer read |
| K17 | Size of the problem, absorber example | costs | Equation counts are much larger than for the equilibrium model, which the authors call a considerable difference but only a minor drawback given sparse matrix handling. | Applications; A Multistage Process | 454 / 6 | text layer read |
| K18 | Vapor-phase-controlled distillation | requires / costs (hedged: "if we assume") | If the liquid-phase resistance is negligible the liquid interface composition equals the bulk and the problem shrinks (4c+2 variables per stage; the sign is garbled in the text layer, so unsure of "+2"). | Single Phase Control | 455 / 7 | text layer read; the +2 unsure |
| K19 | Total reflux, vapor-phase control | costs | Only 3c+2 equations and variables per nonequilibrium stage. | Vapor-Phase-Controlled Distillation at Total Reflux | 455 / 7 | text layer read |
| K20 | Simple flow-averaging for tray and wetted-wall columns | enough (authors' own simulations) | Arithmetic-average vapor composition with outlet liquid composition for trays, arithmetic average for both phases in wetted-wall columns, gave good agreement with data, better than some more complex models. | Interface Model / rate equations | 452 / 4 | text layer read |
| K21 | Part II, first page: equilibrium stage with one common efficiency | not enough (stated motivation) | The motivation was an observation that the common-efficiency equilibrium model cannot predict profiles well in multicomponent separations; the sentence is cut off by the page end. | Part II SCOPE | 456 / 8 | text layer read; sentence incomplete in the file |

Equation or cost comparison (page): K17, p454 / pdf 6: ten-stage ternary column, 70 equations (equilibrium) against 160 (nonequilibrium); 50-stage five-component, 550 against "no less than 1,300"; variables per stage 2c+1 (Naphtali-Sandholm form) against 5c+1 (p453 / pdf 5, p454 / pdf 6). Also: hybrid method about half the time of Newton (p453). No table classifying when to use which model.

## 4. Taylor and Krishna 2000 (review)

Sections as numbered in the paper. Page: printed / pdf.

| # | situation | verdict | paraphrase | section | page | confidence |
|---|---|---|---|---|---|---|
| R1 | Reactive distillation overall | costs (complexity) | Design and operation are far more complex than for either a reactor or a conventional column because vapor-liquid equilibrium, mass transfer, intra-catalyst diffusion and kinetics interact. | 1.3 (abstract too) | 5188 / 6 | text layer read |
| R2 | Scope of the review | (frame) | The review covers thermodynamics, then equilibrium-stage modelling, a short note on efficiencies, mass transfer, nonequilibrium modelling and design methods. | 1 | 5185 / 3 | text layer read |
| R3 | Efficiencies in multicomponent distillation (three or more species) | not enough | Component efficiencies are almost always unequal and can exceed one or fall below zero (citing their book). | 3.7 | 5205 / 23 | text layer read |
| R4 | HETP in multicomponent packed columns | not enough (hedged: "closely related") | HETP behaves much like stage efficiency in multicomponent mixtures. | 3.7 | 5205 / 23 | text layer read |
| R5 | Efficiencies or HETP in reactive distillation | not enough (hedged: "to the best of our knowledge") | No fundamentally sound method exists to estimate either; a prior author used a binary efficiency method for lack of anything better. | 3.7 | 5205 / 23 | text layer read |
| R6 | Effect of reaction on component efficiencies (ethylene oxide hydration example) | not enough | Without reaction the efficiencies lay close together (about 0.5 to 0.65); with reaction they varied greatly, so reaction changes them in a complex, unpredictable way. These values came from the nonequilibrium model and are unpublished results of the authors. | 3.7; Fig. 22 | 5205-5206 / 23-24 | text layer read |
| R7 | Mass transfer with reaction, film model | requires | Most general approach is to solve the Maxwell-Stefan and continuity equations together for homogeneous reactions, since the regime may vary stage to stage; for most reactive distillations the Hatta number is below one and film profiles are nearly linear. | 4 | 5206 / 24 | text layer read |
| R8 | Thermal effects on mass transfer with reaction | costs / requires | One cited study found thermal effects can change transfer rates by as much as a factor of 30. | 4 | 5206 / 24 | text layer read |
| R9 | Effective-diffusivity models with enhancement factors | enough (hedged: "with some success") | Used with some success for amine-based gas treating; but no universal enhancement-factor expression exists. | 4 | 5206-5207 / 24-25 | text layer read |
| R10 | Rigorous heterogeneous (catalyst) transport | requires | A rigorous treatment needs transport to and diffusion/reaction in the catalyst particle; film-and-catalyst equations are then needed. | 4 | 5207 / 25 | text layer read |
| R11 | Nonequilibrium model needs | requires | Hardware design data (to get transfer coefficients, areas, hold-ups), thermodynamic properties also for driving forces and reaction, and physical properties such as diffusion coefficients, viscosity, surface tension. | 5.1 / 5.3 | 5209 / 27 | text layer read |
| R12 | Building the nonequilibrium model for reactive systems | costs | It is not as straightforward as adding a reaction term to the equilibrium-stage model. | 5.2 | 5209 / 27 | text layer read |
| R13 | Solution of the rate-based equations | costs | Usually Newton's method or homotopy-continuation. | 5.3 | 5209 / 27 | text layer read |
| R14 | Equilibrium versus nonequilibrium, case studies by others | not enough (hedged: "can be") | One group found significant differences between the two and judged the extra effort of the nonequilibrium model justified, with little difference between full Maxwell-Stefan and effective diffusivity. | 5.3 | 5210 / 28 | text layer read |
| R15 | Methyl-tert-butyl ether column, low-conversion steady state | not enough | Adding mass-transfer resistance raised conversion above what the equilibrium model predicted. | 5.3 | 5210 / 28 | text layer read |
| R16 | Equilibrium model plus tray efficiency versus nonequilibrium (tray column, reactive) | enough if efficiency is right (hedged) | Close agreement was found only when the tray efficiency could be predicted correctly for the equilibrium model. | 5.3 | 5210 / 28 | text layer read |
| R17 | Murphree efficiencies in a dynamic nonequilibrium simulation | not enough | Murphree efficiencies computed from an ethyl acetate simulation were not constant with time. | 5.3 | 5210 / 28 | text layer read |
| R18 | Methyl-tert-butyl ether and its amyl analogue, lab columns | enough in one case, not in the other | A detailed nonequilibrium model was needed for the amyl process, while both the nonequilibrium and an equilibrium model with efficiency 0.8 represented the butyl process adequately (catalyst effectiveness still needed). | 5.3 | 5210-5211 / 28-29 | text layer read |
| R19 | Ethylene glycol column, multiple steady states | not enough | Both models gave three steady states, but in the 1.7 m column only the high-conversion one is realisable because the others flood, which the equilibrium model cannot show; at 3 m only the lowest-conversion one can be realised. | 5.3 | 5212 / 30 | text layer read |
| R20 | Flow patterns and maldistribution | not enough (of conventional nonequilibrium) | Most nonequilibrium models do not address vapor and liquid flow patterns on trays or maldistribution; a cell model with several contacting cells was built to do so. | 5.4 | 5212-5213 / 30-31 | text layer read |
| R21 | Tray hardware and reaction selectivity | not enough | Assuming equilibrium (no mass-transfer resistance) gave the best conversion and selectivity in the example, yet hardware changes (weir height, passes) shift by-product formation; usual conventional-column rules may not carry over. | 5.4 | 5213 / 31 | text layer read |
| R22 | Catalyst (fast reactions) | not enough | Pseudo-homogeneous treatment may be inadequate for fast reactions; intra-particle diffusion must be modelled. | 7 | 5220 / 38 | text layer read |
| R23 | Dynamic nonequilibrium models | requires | Dynamic models like the cited ones neglect vapor hold-up; the batch nonequilibrium model extends earlier dynamic ones. | 5.6 | 5214-5215 / 32-33 | text layer read |
| R24 | Reactive absorption | requires / enough (hedged: "more or less unchanged in principle") | Nonequilibrium models apply essentially unchanged to reactive absorption, differing only in kinetics and property sub-models; composition changes in the film matter for reactive absorption. | 5.5; 4 | 5215 / 33; 5206 / 24 | text layer read |
| R25 | Design by conceptual methods | enough (stated) | Most conceptual design models are based on the equilibrium-stage model; some developments open the use of nonequilibrium models for design. | 6 | 5216 / 34 | text layer read |
| R26 | Fixed-point method | enough (under stated assumptions) | Uses assumptions incl. phase equilibrium on every stage, adiabatic column, negligible mixing/sensible heat and constant vaporisation heat. | 6.1 | 5216 / 34 | text layer read |
| R27 | From equilibrium design to actual column | requires | Until recently no procedure existed; one cited procedure converts equilibrium stages with a catalytic-packing HETP, and its authors recommend nonequilibrium models for the simulation step. | 6.4 | 5218-5219 / 36-37 | text layer read |
| R28 | Hybrid modelling frameworks | enough either way | Either equilibrium or nonequilibrium stage models could be used in that framework. | 6.3/6.4 | 5218 / 36 | text layer read |
| R29 | Industrial design practice | (fact) | A rate-based simulator was reported to predict commercial reactive-distillation plants, validated for some ether units. | 6.5 | 5219 / 37 | text layer read |
| R30 | Screening, preliminary and final design | enough / not enough | Residue-curve maps for screening, equilibrium models for preliminary design; nonequilibrium studies have exposed limits of equilibrium models for final design and control. | 7 | 5220 / 38 | text layer read |
| R31 | Column dynamics | requires | For proper description of dynamics the authors say it is essential to use the nonequilibrium model. | 7 | 5220 / 38 | text layer read |
| R32 | Computational cost | costs (hedged) | The authors say that, with computers, computational cost has largely been made a moot issue. | 7 | 5220 / 38 | text layer read |
| R33 | Needed data | requires | Hydrodynamic and mass-transfer parameters for reactive-column hardware are woefully lacking, and measurements should be taken along the column height, not only at feed and products. | 7 | 5220 / 38 | text layer read |

Equation or cost comparison: none with numbers (R32 is the only cost statement, qualitative). Table classifying when to use which model: none (Table 1, p5219 / pdf 37, is a stepwise reactive-column design procedure, not a classification).

## 5. Taylor and Kooijman 2014 (chapter)

The chapter is about mass-transfer theory and correlations for distillation and absorption, not a comparison of models; it has few verdict statements. Page: printed / pdf.

| # | situation | verdict | paraphrase | section | page | confidence |
|---|---|---|---|---|---|---|
| C1 | What sets column size | requires | Size depends on the quantity processed and on the rate of transfer between phases; the same equations serve trays and packing. | 3.1 | 98 / 2 | text layer read |
| C2 | Fluxes in the material balances | requires | The molar fluxes (not just diffusion fluxes) appear in the balances; one additional relation (the bootstrap problem) is needed to get them. | 3.2; 3.5.3 | 100 / 4; 112 / 16 | text layer read |
| C3 | Multicomponent mass transfer (ideal gas, exact) | costs | Computing fluxes needs an iterative procedure. | 3.7.1 | 124 / 28 | text layer read |
| C4 | Exact solution for nonideal multicomponent film model | costs | Exact solutions are of no practical value because of far too much computing effort, and any practical advantage over less rigorous methods is not shown; an approximate solution is preferred. | 3.7.2 | 124 / 28 | text layer read |
| C5 | Tray flow model | requires | The equations depend crucially on the assumed liquid and vapor flow patterns; fully mixed gives the lowest rates, plug flow the highest; plug-flow liquid can raise overall rates by up to about 20%; the authors stress the importance of proper flow modelling. | 3.8 | 126-127 / 30-31 | text layer read |
| C6 | Liquid dispersion on a tray | requires | Many correlations (more than ten) exist for the dispersion coefficient. | 3.8 | 127-128 / 31-32 | text layer read |
| C7 | Mechanistic tray models | requires | Contributions of each froth region must be summed; an extension to multicomponent exists (cited). | 3.8.4 | 133-134 / 37-38 | text layer read |
| C8 | Multicomponent tray and packing | costs (low) | Matrices of transfer units come from binary numbers of transfer units; the authors say this needs nothing more complicated than binary values and one relation. | 3.8.5 | 134-135 / 38-39 | text layer read |
| C9 | Packed column, multicomponent | costs | Each integration step requires estimating the overall transfer-unit matrix. | 3.9.3 | 138-139 / 42-43 | text layer read |
| C10 | Packed columns: HETP and the equilibrium-stage model | enough as a bridge (hedged: "if the equilibrium line may be assumed straight") | HETP is the packed height per equilibrium stage and, for a straight equilibrium line, is tied to the transfer-unit height by a formula with the stripping factor. | 3.9.1 | 138 / 42 | text layer read |
| C11 | Experimental tests of the multicomponent transfer-unit models | (pointer) | The authors refer the reader to their book for the experimental studies. | 3.9.3; 3.10 | 139 / 43 | text layer read |

Equation or cost comparison: none; no table classifying when to use which model.

## 6. What was read

- Krishnamurthy 1985: all 8 PDF pages read in full (pdf 8 only the Part II first page).
- Taylor and Kooijman 2014: read in full: pdf 2 (3.1), 4 (3.2 start), 16 (3.5.3), 28 (3.7.1-3.7.2), 30-31 (3.8 intro and tray flow), 37-38 (3.8.4-3.8.5), 41-43 (3.9, 3.10). Searched only (keywords "equilibrium", "stage", "efficienc", "nonequilibrium", "rate-based", "HETP", "rigorous", "simplif"; contexts read around hits): the rest, i.e. 3.2-3.6 (diffusion theory and coefficient estimation), 3.7.3-3.7.4, 3.8.1-3.8.3, references.
- Taylor and Krishna 2000: read in full: pdf 23-31 (3.7 to 5.5), 33-34, 36-38 (end of 5.5, 6, 7), and pdf 6 (1.3). Partly read: pdf 3 (intro), 14-15 (3.1-3.2), 16-20 (3.2-3.4: contexts around every "efficiency" and EQ/NEQ hit), 35 (6.2 context). Searched only: pdf 1-2 (contents), 4-5, 7-13 (thermodynamics, hardware, catalyst), 21-22, 32 (apart from 5.6), 39-47 (notation, references).

## 7. Looked for and NOT found

- A figure for "how many times more unknowns" for the rate-based model than the equilibrium model, in any form beyond K17 (70 vs 160 and 550 vs 1,300 equations, a ratio the authors do not state): not in the 2000 review or the 2014 chapter.
- A statement that efficiencies are adequate for binary distillation: not found as a statement (K3 on thermal efficiency, R16 and R18 are the nearest). K5/K6/R3 state failure for multicomponent mixtures (3+ species) in general terms, so that statement WAS found; it is hedged only in R4.
- Anything on trace components, ppm specifications or high-purity products as a trigger for the rate-based model: none in the three papers (the only hits for "purity" are references to a methyl acetate paper title and a stability remark in the 2000 review).
- A general statement on reactive or chemical absorption beyond R24, R9 and the amine gas-treating remark: no verdict about when equilibrium suffices for it.
- A table classifying when to use equilibrium or rate-based models: none in any of the three papers.
- A statement on the computational cost ratio or timing of the two models: only K16 (solution method, not model) and R32 (qualitative).
- Any statement about packed-column HETP being sufficient or insufficient for non-reactive multicomponent absorption in the 2014 chapter: only the definition and relation (C10).
