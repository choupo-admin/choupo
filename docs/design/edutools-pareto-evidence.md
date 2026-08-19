# EduTools Pareto — the evidence pass

**Status: EVIDENCE RECORD. Nothing built, nothing authorised, no code changed.**
Written 2026-08-19 on the owner's instruction to go and LOOK at real chemical
engineering curricula, because
[`edutools-curriculum-survey.md`](edutools-curriculum-survey.md) was written by
reading this codebase plus general knowledge and says so in its own §9: *"No
citation was verified against a primary source"*, the book attributions *"are
general knowledge"*, and the packed-column correlations are *"named from memory
and MUST be checked against a primary before a line is implemented"*.

This document does not replace that survey. That survey's engine analysis —
which code writes which column, which blocker sits where — was READ in this tree
and remains the authority on cost. **This document supplies the half it did not
have: what is actually taught, from published course pages, with URLs.** Where
the two disagree, §6 names the item.

---

## 0. WHAT KIND OF EVIDENCE THIS IS — read before using any number below

Three limits, and all three are load-bearing.

**(a) Syllabi are evidence of what is TAUGHT. They are not evidence of what
students find HARD, nor of what they learn BADLY.** Those are different
questions and this document cannot answer them. A construction that appears on
ten syllabi may be one every student already understands; a tool's teaching
value depends on the second question and is not measured here. What recurrence
across independent syllabi *does* measure is curricular WEIGHT — how much of the
discipline's agreed core an item occupies — and that is the only thing claimed.

**(b) I could not fetch a single primary page.** The session's egress policy
permits GitHub and nothing else. Every university catalogue host, and even
Wikipedia, is refused at the proxy:

```
https://www.kth.se            -> CONNECT tunnel failed, 403
https://ocw.mit.edu           -> CONNECT tunnel failed, 403
https://en.wikipedia.org      -> CONNECT tunnel failed, 403
https://sigarra.up.pt         -> CONNECT tunnel failed, 403
https://studiegids.tudelft.nl -> CONNECT tunnel failed, 403
https://fenix.tecnico.ulisboa.pt -> CONNECT tunnel failed, 403
https://github.com            -> 400   (reachable)
```

So `WebFetch` was unusable and **`WebSearch` was the only channel.** What I read
is the search backend's machine-generated SUMMARY of an indexed page, not the
page. That is weaker than a fetched syllabus and stronger than my memory, and
every row below is marked with which it is. **No row anywhere in this document
is a page I opened.**

**(c) Therefore every count is a LOWER BOUND, with a bias I can name.** A
summary is lossy: a course that teaches McCabe-Thiele may not mention it in the
200 words the backend returned. Absence from a summary is NOT absence from a
syllabus. The bias runs toward constructions with distinctive proper names
(Ponchon-Savarit, Weisz-Prater, Ziegler-Nichols survive summarisation;
"the operating line" does not). Counts are comparable to each other only for
similarly-named items, and no count below should be quoted without this sentence.

Evidence marks used throughout:

| Mark | Meaning |
|---|---|
| **[S]** | Search summary of a named COURSE page. URL recorded, page not fetched. |
| **[T]** | Search summary of a teaching-TOOL / software page. |
| **[U]** | URL surfaced by search; existence confirmed, no content retrieved. |
| **[X]** | Could not reach or could not find. |

**Never inventing a citation is this project's most expensive rule.** Nothing
below is a page number, a chapter title or a course code I did not see returned
by a search. Where the natural next claim would have required opening a book,
§7 records the gap instead.

---

## 1. Method — what was searched, what came back, what did not

Searched: institution course catalogues by name and by domain restriction
(`kth.se`, `kurser.dtu.dk`, `sigarra.up.pt`, `handbooks.uwa.edu.au`,
`drps.ed.ac.uk`, `studiegids.tudelft.nl`, `imperial.ac.uk`); then per-CONSTRUCTION
probes (Ponchon-Savarit, Hunter-Nash, Thiele modulus, RTD, Moody, pinch,
Bode/Nyquist/Ziegler-Nichols, residue curve maps, MSMPR, psychrometrics,
HTU/NTU, filtration/thickener); then teaching-software probes.

**Indexed well and productive:** KTH (SE), FEUP/U.Porto (PT), IST Lisboa (PT),
UWA (AU), MIT OpenCourseWare (US), U. Michigan (US), UC Irvine (US), NPTEL /
IIT Kanpur / IIT Bombay / IIT Guwahati / IIT Tirupati / Thapar / U. Pune (IN),
Edinburgh (UK, titles only), RWTH Aachen (DE, one line).

**Reached for, not obtained — coverage gaps, not absences:**

* **TU Delft** — `studiegids.tudelft.nl` returned only the portal root and two
  bare `a101_displayCourse.do?course_id=` URLs with no content [X].
* **Imperial College London** — searches returned research-group and news pages;
  no module descriptor surfaced [X].
* **Cambridge (CEB)** — not reached [X].
* **DTU** — only `28123` (a laboratory unit-operations course) and `28150`
  (process control) surfaced as titles; no content for the separations or
  reaction courses [X].
* **ETH Zurich / RWTH Aachen / Politecnico di Milano** — German- and
  Italian-language catalogues are poorly indexed by this backend. One RWTH
  course description line and one ETH control script URL, nothing more [X].
* **No East Asian, Latin American or African programme was reached at all** [X].

So the geographic spread achieved is **Nordic · Iberian · Anglo-American ·
Australian · Indian**, and it is *missing* the German/Dutch/Swiss tradition
(which is exactly the tradition with the most distinctive separations pedagogy)
and everything outside Europe/US/AU/IN. That is the single largest weakness of
this document.

The evidence set is **~15 programmes / ~30 course pages.** Counts below are out
of that, not out of the world.

---

## 2. The evidence base — course sources

Each row is a course page whose summary I read. Content quoted is what the
summary asserted about that page.

### 2.1 Nordic

| Course | What the summary says it covers | Assigned literature named | Mark |
|---|---|---|---|
| KTH **KE1020 Reaction and Separation Engineering**, 10.5 cr — <https://www.kth.se/student/kurser/kurs/KE1020?l=en> | Separation fundamentals: heat and mass transfer between two phases, phase equilibria, the **ideal stage principle**; distillation, absorption, extraction. Reaction engineering. | **Fogler**, *Elements of Chemical Reaction Engineering*, 4th ed., Pearson, 2005; **Coulson & Richardson** Vol. 1 (6th, 2000) and Vol. 2 (5th, 2002); plus a departmental *"Diagramsamling"* — **a diagram collection issued as course material** | [S] |
| KTH **KE2020 Advanced Separation Processes**, 9 cr — <https://www.kth.se/student/kurser/kurs/KE2020?l=en> | Fundamentals and design principles for separation processes; phase equilibria, mass and heat transport, **empirical design methods** | Coulson & Richardson; course compendium | [S] |
| KTH **KE1080 Chemical Engineering Principles** — <https://www.kth.se/student/kurser/kurs/KE1080?l=en> | Separation fundamentals, heat/mass transfer between phases, phase equilibria; distillation, absorption, extraction | — | [S] |
| KTH **KE2180 Separation Processes for the Process Industry** — <https://www.kth.se/student/kurser/kurs/KE2180?l=en> | Design of separation processes with emphasis on **energy efficiency** and environment | — | [S] |
| DTU **28150 Introduction to Process Control** — <https://kurser.dtu.dk/course/28150> | title only | — | [U] |
| DTU **28123 Large Scale Exercises in Process Technology and Chemical Unit Operations** — <https://kurser.dtu.dk/course/28123> | Laboratory: distillation (packed column, bubble cap), adsorption in packed columns, extraction, centrifugation, membrane filtration, rotary drum and plate-and-frame filtration, drying, agitation | — | [S] |

### 2.2 Iberian

| Course | What the summary says it covers | Mark |
|---|---|---|
| FEUP **Processos de Separação I** — <https://sigarra.up.pt/feup/pt/ucurr_geral.ficha_uc_view?pv_ocorrencia_id=500445> | Solvent extraction: LL and SL, single equilibrium stage, multistage **cross-flow and countercurrent**. Binary distillation: **design by the McCabe-Thiele method**, overall / stage / point efficiency, **Murphree and vaporisation efficiencies**. Multicomponent: the approximate **Gilliland-Underwood-Fenske-Kirkbride** method, **MESH** equations for design and simulation, and **the open-access simulator COCO**. Evaporators; **boiling point elevation and Dühring diagrams** | [S] |
| FEUP **Processos de Separação II** — <https://sigarra.up.pt/feup/pt/UCURR_GERAL.FICHA_UC_VIEW?pv_ocorrencia_id=559094> | Adsorption: adsorbent classification, equilibrium measurement and prediction, diffusivities, batch adsorber as a dynamic system, **fixed-bed adsorption, concentration-wave propagation via the DeVault equation, equilibrium theory — dispersive and compressive waves, stationary fronts**. Chromatography: **HETP and the Van Deemter equation**. Cyclic: **PSA, SMB, TSA, parametric pumping**. Membranes | [S] |
| FEUP **Engenharia das Reações II** — <https://sigarra.up.pt/feup/pt/ucurr_geral.ficha_uc_view?pv_ocorrencia_id=282213> | Real reactors: hydrodynamics and micromixing — **residence time distribution theory**; age, life expectancy, residence time; distributions of ages and **intensity functions**; **tracer curves (Danckwerts' F and C curves)** and the relation between RTD and these curves **for reactor operation diagnosis**; flow models — **cascaded reactor (tanks-in-series) and axial dispersion**. Texts: **Fogler**, **Levenspiel** | [S] |
| FEUP **Engenharia das Reações III** — <https://sigarra.up.pt/feup/pt/ucurr_geral.ficha_uc_view?pv_ocorrencia_id=282238> | Competition between transport and reaction in heterogeneous catalytic reactors; qualitative approach to reaction-vs-diffusion and **the efficiency (effectiveness) factor of the catalyst**; **pore diffusion + reaction in isothermal catalysts**; pore diffusion with **film diffusion**; pore diffusion with **convection in pores**; **diffusion/conduction and reaction in NON-isothermal catalysts, including the Damköhler equation**; **the Weisz-Prater criterion** for operation in the chemical regime | [S] |
| FEUP **Operações Unitárias** — <https://sigarra.up.pt/feup/pt/ucurr_geral.ficha_uc_view?pv_ocorrencia_id=516946> | Fluid flow in piping systems; solid/solid, solid/liquid and gas/solid separation. Bibliography includes **McCabe, Smith & Harriott, *Unit Operations of Chemical Engineering*, McGraw-Hill, 7th ed., 2005** | [S] |
| IST Lisboa **Processos de Separação** (3rd year, 6 ECTS) — <https://fenix.tecnico.ulisboa.pt/disciplinas/PSepa11/2024-2025/1-semestre/pagina-inicial> | Global overview of separation processes and **guidelines for CHOOSING one**; binary and multicomponent separation; **criteria for analysis, choice and optimisation of operating conditions**; fundamentals of equipment selection and design | [S] |

### 2.3 Anglo-American and Australian

| Course | What the summary says it covers | Mark |
|---|---|---|
| MIT **10.32 Separation Processes** — <https://ocw.mit.edu/courses/10-32-separation-processes-spring-2005/pages/syllabus> | Separation by equilibrium and rate processes; **staged cascades**; distillation, absorption, adsorption, membranes; phase equilibria and the role of diffusion. Text: **Seader & Henley, *Separation Process Principles*, Wiley, 1998** | [S] |
| MIT **10.450 Process Dynamics, Operations and Control** — <https://ocw.mit.edu/courses/10-450-process-dynamics-operations-and-control-spring-2006/pages/syllabus/> | Text: **Seborg, Edgar & Mellichamp, *Process Dynamics and Control*, 2nd ed., Wiley, 2003** | [S] |
| U. Michigan **ChE 466 Process Dynamics and Control** — <https://che.engin.umich.edu/undergraduate/requirements/courses-course-profiles/che-466-process-dynamics-and-control/> | **Analysis and tuning of feedback control systems.** Text: **Seborg, Mellichamp, Edgar & Doyle, 4th ed., Wiley, 2016** | [S] |
| U. Michigan **ChE 487 Chemical Process Simulation and Design** — <https://che.engin.umich.edu/undergraduate/requirements/courses-course-profiles/che-487-chemical-process-simulation-and-design/> | Design course using **Towler & Sinnott, *Chemical Engineering Design*** | [S] |
| UC Irvine **CBEMS 135 Chemical Process Control** — <http://plaza.eng.uci.edu/course/cbems/135/outline/2013-2014> | Stability analysis — **Routh criterion, root locus, Bode, Nyquist**; **PID controllers and tuning (Ziegler-Nichols, Cohen & Coon)** | [S] |
| UWA **ENSC3005 / CHPR1005 Mass and Energy Balances** — <https://www.handbooks.uwa.edu.au/unitdetails?code=ENSC3005> | Multi-unit balances with and without reaction, **recycle and purge**; first-law energy balances; **steam tables**. Learning outcome (3): *"design, construct and interpret static process flow diagrams using commercial software and **assess the quality and limitations of simulation outputs**"*; outcome (5): *"estimate system properties when exact values are not available and **determine the limitations of these estimates**"* | [S] |
| UWA **ENSC3018 Process Synthesis and Design** — <https://www.handbooks.uwa.edu.au/unitdetails?code=ENSC3018> | **Heat exchanger design — heat integration and pinch analysis on a process plant**; multicomponent distillation and simulation; membrane separation; PFDs and P&IDs; economic estimation, safety, plant layout. Outcome: *"apply **Pinch Technology** for energy use minimisation"*; *"consider minimum vapour traffic in distillation column sequencing"* | [S] |
| UWA **ENSC3019 Unit Operations and Unit Processes** — <https://www.handbooks.uwa.edu.au/unitdetails?code=ENSC3019> | Heat exchangers; distillation; multi-effect evaporators; LL and GL extraction; solid-liquid separation; refrigeration; dehydration. Outcome: *"**determine the number of transfer units** and operating conditions for unit operations of heat and mass transfer"* | [S] |
| Edinburgh **Separation Processes 2 (CHEE08013)** — <http://www.drps.ed.ac.uk/17-18/dpt/cxchee08013.htm> · **Chemical Reaction Engineering 4 (CHEE10008)** — <http://www.drps.ed.ac.uk/23-24/dpt/cxchee10008.htm> · **ChE Thermodynamics 3 (CHEE09011)** — <https://www.drps.ed.ac.uk/16-17/dpt/cxchee09011.htm> | Existence and titles only; contents not retrieved | [U] |
| Ole Miss **ENGR421 ChE Thermodynamics** — <https://home.olemiss.edu/~cmchengs/CHE421/OUTLINE.htm> | Estimate **fugacity coefficients, activity coefficients and Gibbs energies** of components in multicomponent vapour/liquid mixtures | [S] |
| NJIT **CHE 342 ChE Thermodynamics II** — <https://digitalcommons.njit.edu/cgi/viewcontent.cgi?article=1094&context=cme-syllabi> | **Txy diagrams**; **Gibbs free energy models and Margules equations** | [S] |
| BYU **ChE 374** fluid mechanics syllabus — <https://www.et.byu.edu/~mjm82/che374/Fall2024/Che374_Syllabus_Fall2024.pdf> | Fluid mechanics; surfaced in the Moody-chart probe | [U] |

### 2.4 Indian tradition (the largest single body of indexed syllabi)

| Course | What the summary says it covers | Mark |
|---|---|---|
| NPTEL / IIT Kanpur **Mass Transfer II (103104046)** — <https://nptel.ac.in/courses/103104046> | Distillation: fractionation, **McCabe-Thiele AND Ponchon-Savarit methods** for multistage operation; reflux, **optimum reflux ratio**; reboilers, total and partial condensers; **tray efficiencies**. Absorption: material balance and **operating line**, Henry's and Raoult's law, **minimum liquid flowrate**, **both the NTU and HTU approaches**, hydrodynamic considerations. Extraction: **ternary liquid equilibria**, single-stage and multistage cocurrent. Also adsorption, chromatography, humidification, drying, crystallization | [S] |
| NPTEL **Mass Transfer Operations I (103103035)**, syllabus PDF — <https://archive.nptel.ac.in/content/syllabus_pdf/103103035.pdf> | VLE, flash distillation, differential distillation, continuous rectification for binary systems, **the McCabe-Thiele method**, distillation in packed towers, azeotropic and extractive distillation | [S] |
| NPTEL / IIT Bombay **Chemical Reaction Engineering II** — <https://www.classcentral.com/course/swayam-chemical-reaction-engineering-ii-12900>, lectures 10–12 <https://freevideolectures.com/course/3477/chemical-reaction-engineering-ii/10> | **Thiele modulus, concentration profile, internal effectiveness factor, overall effectiveness factor**, identification of **internal-diffusion- vs reaction-limited regimes**. **RTD**: general characteristics and RTD functions, measurement by **pulse and step tracer input**, mean residence time, RTD in batch/PFR/CSTR, laminar-flow reactor; **models: segregation, tanks-in-series, dispersion** | [S] |
| IIT Guwahati **Mass Transfer Operations I**, lecture 38 — <http://www.infocobuild.com/education/audio-video-courses/chemistry/MassTransferOperations1-IIT-Guwahati/lecture-38.html> | **"Ponchon and Savarit Method and Packed Tower Distillation"** | [S] |
| Thapar **UCH602 Mass Transfer-II** — <https://www.thapar.edu/images/pdf/syllabus/chemical-engineering/be/2017/__UCH602.pdf> | Syllabus including **analysis of binary distillation by the Ponchon-Savarit method** | [S] |
| IIT Tirupati **CH3204** (process control) — <https://files.iittp.ac.in/pdfs/syllabus/CH3204.pdf> | Closed-loop analysis: **root locus, Bode and Nyquist plots, tuning rules**. Text: **Seborg et al., 3rd ed.** | [S] |
| U. Pune **BE Chemical Engineering (2012 course)** — <https://www.unipune.ac.in/Syllabi_PDF/revised-2015/engineering/BE-CHEMICAL-SYLLABUS-FINAL-8-6-15.pdf> | Frequency response: **Bode diagrams, Nyquist stability criterion, Ziegler-Nichols tuning** | [S] |
| IIT Kanpur **CHE Courses of Study** — <https://www.iitk.ac.in/doaa/data/courses-of-study/CHE-CoS.pdf> | Programme-level course list | [U] |

### 2.5 Continental Europe (thin — see §1)

| Course | Content | Mark |
|---|---|---|
| RWTH Aachen **Thermal Separation Processes / Thermische Trennverfahren** — <https://www.avt.rwth-aachen.de/cms/avt/studium/bachelor/alle-angebote/~jazg/thermische-trennverfahren-m-sc-/> | *"the most important thermal unit operations that are relevant to industry"*, building on Thermodynamics of Mixtures and Unit Operations | [S] |
| ETH Zurich **Chemical Process Control** lecture script — <https://ethz.ch/content/dam/ethz/special-interest/chab/icb/fmlab-dam/Education/ChemicalProcessControl/RT-Skript2025.pdf> | Existence of a full control course script | [U] |
| MSE Switzerland **TSM-PROCINT Process integration and pinch analysis** — <https://www.msengineering.ch/theory-modules/2020-2021-tsm-procint> | **Composite curves, heat recovery pinch, golden rules of pinch analysis, energy targets, grand composite curves, heat exchanger network design**. Recommended text: **Robin Smith, *Chemical Process Design and Integration*** | [S] |

---

## 3. Textbooks — what the reading lists ACTUALLY name

This matters because the earlier survey's §2 frame was asserted from memory.
Only these were seen in a retrieved reading list:

| Text | Named by | Mark |
|---|---|---|
| **Coulson & Richardson**, *Chemical Engineering* Vols 1 & 2 | KTH KE1020 (Vol 1 6th 2000, Vol 2 5th 2002), KTH KE2020 | [S] |
| **Fogler**, *Elements of Chemical Reaction Engineering* | KTH KE1020 (4th ed., 2005), FEUP ER-II | [S] |
| **Levenspiel**, *Chemical Reaction Engineering* | FEUP ER-II | [S] |
| **McCabe, Smith & Harriott**, *Unit Operations of Chemical Engineering*, 7th ed., 2005 | FEUP Operações Unitárias | [S] |
| **Seader & Henley**, *Separation Process Principles*, Wiley 1998 | MIT 10.32 | [S] |
| **Seborg (et al.)**, *Process Dynamics and Control* | MIT 10.450 (2nd, 2003), Michigan ChE 466 (4th, 2016), IIT Tirupati (3rd) | [S] |
| **Towler & Sinnott**, *Chemical Engineering Design* | Michigan ChE 487 | [S] |
| **Robin Smith**, *Chemical Process Design and Integration* | MSE TSM-PROCINT | [S] |
| **Felder & Rousseau**, *Elementary Principles of Chemical Processes* | LearnChemE organises whole screencast sets by its 3rd and 4th editions; UWA ENSC3005's description matches it but does not name it | [T] |
| **Wankat**, *Separation Process Engineering* | LearnChemE organises modules by it; MIT textbook-search page lists it against 10.32 | [T] |
| **Rhodes**, *Introduction to Particle Technology* | particle-technology course sources | [S] |

**Named in the earlier survey's frame but NOT seen in ANY reading list I
retrieved: Treybal, Geankoplis, Bird/Stewart/Lightfoot, Perry, Green & Southard,
Doherty & Malone, Randolph & Larson, Mullin, Kunii & Levenspiel, Incropera.**
That is NOT evidence they are unused — my evidence set is 15 programmes and most
rows returned no reading list at all. It IS evidence that the survey's frame was
asserted rather than checked, and that **two texts the survey never mentions
(Seborg, Felder & Rousseau) are the ones my evidence actually pins to named
courses** — both in curriculum areas the survey under-weights.

I did **not** open a single textbook. So my brief's question *"which
constructions do those texts build a chapter around"* is **unanswered** — see §7.

---

## 4. What existing teaching software already covers well

Stated neutrally and factually; these are free/open resources, not competitors
to disparage, and knowing what they serve is how Choupo avoids spending effort
where a student is already served.

| Resource | What it covers | Mark |
|---|---|---|
| **LearnChemE** (CU Boulder) — <https://learncheme.com/> | **110+ self-study modules and 290+ interactive simulations**, each module typically introduction + ConcepTests + screencasts + interactive simulation + quiz-yourself simulation. **Many run in Wolfram Player** (a download, proprietary runtime); some run natively in-browser | [T] |
| LearnChemE **McCabe-Thiele module** — <https://learncheme.com/quiz-yourself/interactive-self-study-modules/mccabe-thiele-diagrams/mccabe-thiele-diagrams-simulations/> | Full module: q-line derivation, methanol-water interactive simulation, screencasts, quizzes | [T] |
| LearnChemE **Hunter-Nash module** — <https://learncheme.com/quiz-yourself/interactive-self-study-modules/hunter-nash-method-for-liquid-liquid-extraction/hunter-nash-method-for-lle-introduction/> | *"intended for a separations course"*; interpret ternary phase diagrams, **graphically locate the mixing point and operating point**, determine extract composition, count equilibrium stages | [T] |
| LearnChemE **ternary phase diagrams** — <https://learncheme.com/quiz-yourself/interactive-self-study-modules/ternary-phase-diagrams/ternary-phase-diagrams-interactive-simulations/> | Right-triangle and equilateral diagrams, **phase envelopes** | [T] |
| **Wolfram Demonstrations** — <https://demonstrations.wolfram.com/HunterNashMethodForLiquidLiquidExtractionLLE/> and <https://demonstrations.wolfram.com/LiquidLiquidExtractionLLEOnARightTriangleTernaryPhaseDiagram/> | Two independent Hunter-Nash / ternary LLE interactives | [T] |
| **University of Manchester** interactive teaching apps — <https://www.training.itservices.manchester.ac.uk/public/gced/fluids.html> and <https://www.training.itservices.manchester.ac.uk/public/gced/llternary/index.html> | An interactive **Moody chart** and an interactive **LL ternary** application | [T] |
| **Iowa State open textbook**, *Chemical Engineering Separations: A Handbook for Students* — <https://iastate.pressbooks.pub/chemicalengineeringseparations/chapter/liquid-liquid-extraction-2/> | Open-licensed LLE chapter | [T] |
| **DWSIM** — <https://dwsim.org/>, FOSSEE/IIT Bombay <https://dwsim.fossee.org/home> | Open-source CAPE-OPEN flowsheet simulator, full unit-operation suite and thermodynamic packages, cross-platform; **IIT Bombay has run adoption workshops**; used in process-engineering training in Mexican higher-education institutions | [T] |
| **COCO** | Free flowsheet simulator; **named ON the FEUP Processos de Separação I syllabus itself** as the tool the multicomponent-distillation material uses | [S] |
| **Commercial flowsheet simulators** | UWA ENSC3018 teaches multicomponent distillation "using HYSYS"; UWA ENSC3005 requires PFD construction "using commercial software" | [S] |

**The two conclusions that bear on the Pareto:**

1. **The classical STAGED-SEPARATION pictures are the best-served corner of the
   whole curriculum.** McCabe-Thiele, ternary LLE and Hunter-Nash each have a
   free, polished, quizzed interactive from at least one and usually two
   independent providers. A Choupo tool that only draws the picture adds
   nothing there. What none of them has is **a rigorous engine underneath the
   picture** — the graphical answer laid against a real stagewise cascade's
   answer. That, and not the drawing, is the differentiator, and it is exactly
   what the existing survey's A2 already proposes.
2. **My searches surfaced NO Thiele-modulus / effectiveness-factor module in
   LearnChemE**, while surfacing several for McCabe-Thiele and Hunter-Nash.
   Stated at its true strength: that is one negative search against a large
   corpus, and **absence in a search summary is not absence in the corpus**
   (§0c). It is a hint, not a finding.

**Also worth recording, because it is curricular warrant for the thing Choupo
is unusual for:** UWA ENSC3005's learning outcomes require students to *"assess
the quality and limitations of simulation outputs"* and to *"determine the
limitations of these estimates"* [S]. A syllabus asking in writing for critique
of a simulator's own honesty is the closest thing in this evidence set to a
curricular demand for advisory surfaces, declared approximations and problem
divergence.

---

## 5. Recurrence table — the counts, and exactly what they count

**Counting rule:** one point per DISTINCT course/programme source in §2 whose
retrieved summary NAMES the construction (or an unambiguous equivalent). Teaching
tools (§4) are counted separately and never mixed in. "Corroborating" = a source
that surfaced in the probe and supports the item but whose content I did not read
([U]), listed but not scored.

Denominator: **~15 programmes / ~30 course pages.** Read §0(c) before comparing
two rows.

| Construction | Named-by count | Which sources | Corroborating [U] | Tools |
|---|---|---|---|---|
| **Frequency response + PID tuning** (Bode / Nyquist / root locus / Ziegler-Nichols) | **3 explicit + 3** | UC Irvine CBEMS 135; IIT Tirupati CH3204; U. Pune BE — all three name Bode AND Nyquist AND tuning. Plus MIT 10.450 and Michigan ChE 466 (assign Seborg / "analysis and tuning of feedback control") and the ETH control script | Edinburgh, DTU 28150 | — |
| **McCabe-Thiele** | **3** | FEUP PS-I ("design … using the McCabe-Thiele method"); NPTEL/IIT Kanpur MT-II; NPTEL MTO-I | KTH KE1020/KE1080, UWA ENSC3019 (teach distillation, method not named) | LearnChemE (full module) |
| **RTD — E/F curves, tanks-in-series, dispersion** | **2 explicit** | FEUP ER-II (Danckwerts' F and C curves, cascade + axial dispersion, *"for reactor operation diagnosis"*); IIT Bombay CRE-II (pulse/step, tanks-in-series, dispersion, segregation) | Kerala Univ "NON-IDEAL REACTORS" unit; MIT 10.37 | — |
| **Thiele modulus / effectiveness factor** | **2 explicit** | FEUP ER-III (efficiency factor + **Weisz-Prater** + non-isothermal + Damköhler); IIT Bombay CRE-II (Thiele modulus, internal & overall effectiveness factor) | MIT 10.37 lecture notes; Kerala Univ | none found (see §4.2) |
| **Ternary LLE / stagewise extraction** | **3** | FEUP PS-I (single stage, multistage cross-flow and countercurrent); NPTEL/IIT Kanpur MT-II (ternary liquid equilibria, single and multistage); UWA ENSC3019 (LL and GL extraction) | Edinburgh | LearnChemE, Wolfram ×2, Manchester, Iowa State |
| **Pinch / composite curves** | **2 explicit** | UWA ENSC3018 ("apply Pinch Technology"); MSE TSM-PROCINT (composite curves, grand composite, HEN design) | Michigan ChE 487 (Towler & Sinnott) | — |
| **Ponchon-Savarit** | **3** | NPTEL/IIT Kanpur MT-II; IIT Guwahati MTO-I lec. 38; Thapar UCH602 | one UK "Separation Processes" course handout | — |
| **Moody chart / friction factor** | **2 explicit** | NPTEL Fluid Mechanics outline; a Split (unist.hr) fluid mechanics syllabus | SJSU ME111, BYU ChE374 | Manchester interactive Moody chart |
| **HTU / NTU** | **2** | NPTEL/IIT Kanpur MT-II ("both the NTU and HTU approaches"); UWA ENSC3019 ("determine the number of transfer units") | — | — |
| **Psychrometrics / drying rate curve** | **2** | NPTEL/IIT Kanpur MT-II (humidification, drying); FEUP PS-I (drying) | UBC CHBE241 module 5.10; UWA ENSC3019 (dehydration) | — |
| **Adsorption breakthrough / fixed-bed waves** | **2** | FEUP PS-II (DeVault equation, dispersive/compressive waves, stationary fronts, PSA/SMB/TSA); NPTEL MT-II | DTU 28123 (lab) | — |
| **Filtration / sedimentation / thickener** | **1–2** | particle-technology course content (constant-pressure and constant-volume filtration, classifiers and thickeners); DTU 28123 (lab: rotary drum, plate-and-frame) | — | — |
| **Multicomponent shortcut (FUG + Kirkbride) and MESH** | **2** | FEUP PS-I (explicitly both, plus COCO); UWA ENSC3018 (multicomponent distillation) | — | — |
| **Efficiency constructions (Murphree / point / overall)** | **2** | FEUP PS-I; NPTEL MT-II (tray efficiencies) | — | — |
| **Fugacity / activity / Gibbs-energy models** | **2** | Ole Miss ENGR421; NJIT CHE 342 (Txy, Gibbs free energy models, Margules) | Edinburgh CHEE09011 | — |
| **Residue curve maps** | **0** | — searches returned only research/industrial and reference material; the backend itself reported the results *"focus on technical and industrial applications rather than specific course syllabi"* | NPTEL MTO-I lists "azeotropic and extractive distillation" without RCM | — |
| **MSMPR / population-balance CSD** | **0** | — two independent probes returned NO undergraduate syllabus; hits were RSC/Wiley/Cambridge handbooks, a UCL graduate notebook, and research papers | NPTEL MT-II lists "crystallization" without method | — |
| **Compressibility chart (Z vs P)** | **0** | — not named in any retrieved syllabus (fugacity and Txy were) | — | — |
| **Levenspiel plot (1/−r vs X)** | **0 by name** | — Levenspiel is named as a TEXTBOOK (FEUP ER-II), never the plot | — | — |
| **Cyclone grade efficiency / d50** | **0–1** | cyclone separators appear in particle-technology content; the grade-efficiency CURVE is not named | — | — |
| **Ponchon/Fair/GPDC packed-column flooding** | **0–1** | GPDC, packing factor and flow parameter appear in DESIGN-PRACTICE sources, not in any retrieved syllabus; NPTEL MT-II mentions absorption "hydrodynamic considerations" | — | — |

---

## 6. Where the evidence CONTRADICTS the existing survey

This is the section the brief asked to be given first weight. Six items.

### C1. Frequency-response control is the HIGHEST-recurrence construction in this evidence set, and the survey files it under "Recommended OUT"

`edutools-curriculum-survey.md` §8 lists *"Bode / Nyquist / root locus"* under
**Recommended OUT** — with, in fairness, a "REFRAME rather than reject" rider.
Its §3 row 24 marks the whole item bucket **C**, with the note *"control texts,
none named in the brief"*.

The evidence says this is the single most-recurring named construction I found:
**three syllabi name Bode AND Nyquist AND a tuning method explicitly** (UC Irvine
CBEMS 135, IIT Tirupati CH3204, U. Pune BE), and **three more sources** attach to
the same block (MIT 10.450 and Michigan ChE 466 both assigning Seborg; the ETH
course script). **Seborg is the most-recurring TEXTBOOK in my entire evidence
set** — three named courses across two continents — and the survey does not
mention it.

**The survey's reasoning is not wrong; its scope is.** "The engine has no
transfer function, and linearising one in the browser would be a second
implementation in TypeScript" is an ENGINE argument and I do not dispute a word
of it. But it was presented in a section that decides curricular worth, and the
two got welded. They should come apart:

* **Curricular weight: highest in this document.** Control is also the only
  major block of the core sequence with **zero** representation among the 13
  live EduTools.
* **The proposed reframe is EVIDENCE-BACKED, which the survey could not know.**
  Ziegler-Nichols is named explicitly by U. Pune and UC Irvine, and "tuning
  rules" by IIT Tirupati — so the open-loop reaction curve with the tuning
  construction laid over a real `choupoCtrl` trajectory is not a consolation
  prize, it is a thing three of my syllabi ask for by name.

**Recommendation: move it out of §8 "Recommended OUT" entirely and into the
ranked shortlist.** Keep the refusal to draw a Bode plot; state it as *"the
highest-recurrence construction in the curriculum that Choupo structurally
cannot draw the classical way, and here is the honest half it CAN draw"*. That
is a much stronger sentence than "OUT", and it is true.

### C2. MSMPR semilog CSD is over-ranked — recurrence 0 in this evidence set

The survey places **A3 (MSMPR semilog CSD)** first among the items "close behind"
the top five, calling it a "canonical construction" with zero engine work and an
existing witness. Cost and witness: confirmed, not disputed.

**Recurrence: two independent probes returned no undergraduate syllabus teaching
MSMPR or population-balance CSD.** Everything returned was graduate or research
— an RSC handbook chapter, a Wiley pharmaceutical-engineering chapter, a
Cambridge *Industrial Crystallization* chapter, a UCL graduate notebook, journal
papers. Meanwhile the particle-technology core that DOES appear on syllabi is
filtration (constant-pressure and constant-volume), sedimentation, classifiers,
thickeners and centrifuges — which the survey ranks LOWER, at **B9/B10**, with
the note that they should be built as units first.

**Caveat, stated because it cuts the other way:** this is an argument from
absence, my weakest instrument (§0c), and "MSMPR" is a distinctive enough acronym
that I would expect it to survive summarisation if present. And crystallisation
is a genuine Choupo differentiator — the engine has a real MSMPR population
balance, which almost nothing else at this price does.

**Recommendation: keep A3, but re-justify it.** Its case is **differentiation**
(§brief item: "don't reproduce what breadth-first tools do better"), not
curricular recurrence. Saying so keeps it honest; calling it canonical does not
survive contact with the evidence.

### C3. Ponchon-Savarit is under-ranked — but only in one tradition, and the survey's blind spot is geographic

Survey **B4**: *"the pedagogical payoff is narrower than McCabe-Thiele, which is
already built."*

Evidence: Ponchon-Savarit is named on **three** Indian-tradition mass-transfer
syllabi (IIT Kanpur MT-II, IIT Guwahati MTO-I lecture 38, Thapar UCH602) — the
same count as McCabe-Thiele in my set — and appears on **zero** of the European
or Australian pages I read.

So the survey's judgement is right for the Euro/Anglo tradition and wrong for the
Indian one, and it had no way to know because it never looked. Given that NPTEL
is one of the largest openly-published chemical-engineering teaching corpora in
the world, "narrower payoff" is a claim that should be geographically qualified
rather than stated flat. This does not promote B4 into the top five — its cost is
real (four profile columns plus an h-x-y scan) — but the STATED REASON must change.

### C4. RTD should rank above its current position

Survey puts **B6 (RTD)** in the "close behind" list, below A3/A4/A5.

Evidence: RTD is the most explicitly-detailed reaction-engineering construction in
my whole set. FEUP ER-II devotes named content to it — ages, life expectancy,
intensity functions, **Danckwerts' F and C curves**, cascade and axial-dispersion
models — and states its purpose as *"reactor operation diagnosis"*. IIT Bombay
CRE-II covers pulse and step tracer input, mean residence time, RTD in each ideal
reactor, and the segregation, tanks-in-series and dispersion models. Both name
Levenspiel and/or Fogler.

And the survey's own reading found the engine has **nothing** — one grep hit, and
that hit is `PSA.cpp` listing dispersion among things it does NOT model. So this
is a high-recurrence construction with a total engine silence and an existing
solver stack (ODE + dynamic CSTR) that could produce a real E(t) from a real
vessel. **Recommendation: promote into the shortlist proper.**

### C5. The owner's candidate #1 (Thiele) is CONFIRMED, and so is the survey's rank-1 move — which has since shipped

This is agreement, recorded because confirmation is as useful as contradiction.

FEUP ER-III teaches **the effectiveness factor AND the Weisz-Prater criterion**
— which is precisely the pair the survey nominated as rank 1 (*"the η = 1
announcement + Weisz-Prater"*) — plus the non-isothermal pellet and the Damköhler
equation. IIT Bombay CRE-II teaches Thiele modulus with internal and overall
effectiveness factors and the diffusion- vs reaction-limited regimes.

Per `CLAUDE.md` §6, **the announcement half shipped on 2026-08-18** ("THE PELLET
IS A POINT, AND NOW THE ENGINE SAYS SO"), with the pellet record, the D_eff arity
ruling and the rate multiplier explicitly NOT built. So survey rank 1 is done and
**survey rank 4 (B1: the catalyst asset, the BVP on `NewtonND`+`LU`, η as a
result, the η-φ and intraparticle-field tool) is now the live item.** The evidence
supports promoting it: highest-value combination in the document of
**high recurrence + changes answers rather than illustrating them + no free
interactive found elsewhere (§4.2, weak) + a closed-form oracle for the gate**.

The one refinement the evidence offers: FEUP teaches the **non-isothermal**
pellet explicitly (Damköhler, diffusion/conduction). The survey's decision to
keep it OUT of a first slice is still right for the three reasons it gives
(multiplicity needs continuation, not iteration; Van Heerden already carries the
multiplicity lesson; no oracle) — but the tool's disclaimer should say *"the
non-isothermal pellet is on the syllabus and is not modelled here"*, not merely
that it is not modelled.

### C6. A1 and A2 are ALREADY WELL SERVED by free software, and the survey's justification for them does not account for that

Survey rank 2 is **A1 (g_mix common tangent)** — already banked as an Explore
lens per its own amendment — and rank 3 is **A2 (ternary tie-triangle +
Hunter-Nash)**, justified as *"core Treybal construction"*.

The recurrence evidence supports stagewise ternary extraction (3 syllabi). But
**Treybal is named by none of my sources**, and the Hunter-Nash construction is
already served by a full LearnChemE self-study module with interactive
simulations and quizzes, two Wolfram Demonstrations, an interactive Manchester
app, and an open Iowa State textbook chapter (§4).

This does not argue for dropping A2 — **it is already shipped** (see §8: mounted
at `MethodsWorkspace.tsx:185-186,345`, `status: "live"` at `registry.ts:168`,
all *read*), so its remaining cost is zero and the question is moot. Under a
Pareto rule it was the right thing to build.

**What must change is the JUSTIFICATION.** "Core construction" is true and is
not a differentiator, because the construction is free elsewhere. The
differentiator is the one the survey itself identified and then under-sold: the
rigorous LL cascade to judge the graphical answer against, with the Hunter-Nash
colinearity holding on the engine's own stages to 1.2e-4. Nobody else has an
engine under the triangle. **Lead with that.**

---

## 7. Coverage gaps — what I could not reach or could not establish

Listed plainly; a survey that hides its gaps is worse than a shorter one, and the
document I am correcting failed exactly here.

1. **I fetched nothing.** Every source is a search-backend summary of a page I
   could not open (§0b). No syllabus was read in full; no reading list was read
   in full; no learning-outcome list was verified against the page.
2. **I opened no textbook.** The brief asked which constructions the assigned
   texts "build a chapter around". **Unanswered.** I can say which texts are
   assigned to which named course; I cannot say what is in their chapters
   without inventing it, and the earlier survey's §9 already flags this as the
   place where invention is tempting.
3. **The German/Dutch/Swiss tradition is missing.** TU Delft, ETH, RWTH (beyond
   one line), Politecnico di Milano: not obtained. This is the tradition with the
   most distinctive separations pedagogy and its absence probably biases the
   recurrence table toward Anglo/Indian norms.
4. **Nothing from East Asia, Latin America or Africa.** Zero sources.
5. **Imperial, Cambridge and TU Delft were specifically attempted and failed** —
   these are not "not searched", they are "searched and not obtained", which is
   the weaker of the two negatives to draw conclusions from.
6. **Edinburgh yielded titles only.** Four course codes confirmed to exist; no
   content. They are listed [U] and score nothing.
7. **Recurrence counts are lower bounds with a naming bias** (§0c). A count of 0
   in §5 means "not named in any summary I read", never "not taught". The four
   zeros (residue curve maps, MSMPR, compressibility chart, Levenspiel plot by
   name) should each be read that way, and the MSMPR zero is the one I would
   most want a second pass on.
8. **No syllabus in my set names a graphical construction as an ASSESSED
   outcome** except by implication. I cannot distinguish "mentioned in a topic
   list" from "students are examined on drawing it", and that distinction is
   what actually determines teaching weight.
9. **The packed-column correlations the earlier survey flagged (Robbins;
   Kister & Gill) are STILL unverified against a primary.** I saw the
   Generalized Pressure Drop Correlation, packing factor, flow parameter and the
   70–80 %-of-flooding design rule in engineering-practice sources, but I opened
   no paper and no handbook. **§6.2 of the earlier survey remains blocked on
   exactly the citation check it named**, and this document does not unblock it.
10. **Whether existing tools cover the Thiele modulus is one negative search**
    (§4.2), not an audit of LearnChemE's 290+ simulations.

---

## 8. The ranking

Ordered by **curricular recurrence × value not already served, divided by cost**,
with the Pareto rule applied explicitly: *a high-recurrence item that is cheap
outranks a high-recurrence item that is expensive.* Cost comes from the earlier
survey's code reading, which I did not redo and do not dispute.

| Rank | Item | Recurrence | Choupo status | Cost | Why here |
|---|---|---|---|---|---|
| **1** | **Ziegler-Nichols / open-loop reaction curve** (the control reframe) | **highest: 3 explicit + 3** | nothing; **0 of 13 tools are control** | bucket A over existing `choupoCtrl` witnesses | Highest-recurrence block in the evidence set, and the only core-sequence block with zero EduTools representation. Cheap because the trajectory is already engine-computed. The classical Bode/Nyquist half stays refused for the survey's own good reason — say so, and draw the half that is honest. **Survey has this under "Recommended OUT" (C1).** |
| **2** | **B1 Thiele: catalyst record + BVP + η-φ + intraparticle field** | 2 explicit + 2 | announcement **shipped 2026-08-18**; physics not built | medium: asset record mirroring `Adsorbent`, a D_eff arity ruling, FD BVP on `NewtonND`+`LU`, one rate hook ×4 reactors | The owner's #1, confirmed by evidence (C5). Alone in this table in **changing answers rather than illustrating them** — η multiplies the rate. Has a closed-form oracle. No free interactive found (weakly). Expensive relative to rank 1, which is why it is second. |
| **3** | **B6 RTD — E/F curves, tanks-in-series, dispersion** | 2 explicit + 2, richly detailed | **nothing in the engine** | medium: tracer species, pulse injection, outlet history over the existing ODE + dynamic-CSTR stack | Levenspiel's and Fogler's core diagnostic; FEUP names Danckwerts' F and C curves and calls it *"reactor operation diagnosis"*. Total engine silence today. **Survey ranks this below A3/A4/A5 (C4).** |
| **4** | **A5 Moody chart** | 2 explicit + 2 | engine computes it all | **zero engine work**; one grid-sweep witness | Every friction model, Reynolds number and regime is already published by `Pipe`; §1.1 of the survey established the grid sweep IS the chart. Cheap, universal, and the only free interactive I found is a static-lookup app. |
| **5** | **A4 cyclone grade efficiency across its five models** | 0–1 (weak) | engine computes it all | zero engine work; a word-override in the tool layer | Ranked on **differentiation, not recurrence** — five selectable correlations on one dust makes "d50 is a model output, not a property of the cyclone" visible, which no free interactive I found does. Listed here so the reason is on the record. |

**A2 Hunter-Nash is NOT in this table because it is DONE.** I expected to rank it
first — a built-but-unmounted tool against a 3-syllabus construction is the
cheapest Pareto win imaginable — and checked before writing it down. It is
mounted and live: `MethodsWorkspace.tsx:185-186` lazily imports `TieTriangleTool`
and line 345 dispatches `tool === "hunter-nash"`, with `registry.ts:168` marked
`status: "live"` (all *read*). **The claim in the earlier survey's A2 amendment
that it is "registered `planned` and NOT mounted", and the standing comment at
`registry.ts:149-166` headed "BUILT BUT NOT MOUNTED", together with the `fedBy`
string that still reads "BUILT, not mounted", are all THREE stale.** That is a
live incorrectness in a comment whose entire purpose is to stop someone flipping
a status and publishing a page captioned Hunter-Nash that draws a breakthrough
curve — worth a cleanup commit on its own, and not something this document may
fix (writes were limited to this file).

**Then, in order:** A7 Langmuir linearisation · A6 Arrhenius plot · **A3 MSMPR** — *retained on
differentiation, not recurrence (C2)* · B3 Fair capacity chart (two profile
columns; the buildable half of the owner's packed-column request) · B4
Ponchon-Savarit — *recurrence 3, but concentrated in one tradition (C3)* ·
B11 residue curve maps (recurrence 0 in undergraduate evidence — consistent with
the survey's low placement).

**Unchanged from the survey and confirmed:** B5 (HTU/NTU) has real recurrence —
2 syllabi, one of them an explicit UWA learning outcome — but the survey's cost
reading is decisive: no unit op reads a transport coefficient and column
efficiency is 100 % per stage, so it is a mass-transfer-coefficient programme,
not a tool slice. **High recurrence must not promote an item past its cost**;
that is the Pareto rule running in the direction that hurts, and it should.

**Recommended OUT, now with evidence rather than assertion:** Heisler /
Gurney-Lurie (recurrence 0; belongs to a heat-transfer course) · Wilson plot
(recurrence 0) · cost nomographs (recurrence 0) · Geldart chart (recurrence 0;
a map of published boundaries, not a computation). The survey's judgement on all
four is upheld — and now for a stated reason rather than a felt one.

---

## 9. One thing the evidence says that the survey never asked

UWA ENSC3005 requires students to **"assess the quality and limitations of
simulation outputs"** and to **"determine the limitations of these estimates"**
[S]; IST Lisboa's separations course is built around **"guidelines for choosing"**
a process and **"criteria for analysis, choice and optimisation"** [S]; FEUP PS-I
puts an **open-access simulator (COCO) on the syllabus itself** [S].

Read together, these say the curriculum already asks for the thing Choupo is
structurally unusual for — a simulator whose limitations are legible — and that
open-source simulators are already inside the teaching loop rather than knocking
on it. That is not an EduTool candidate and it is not a ranking, so it belongs
nowhere in §8. It is recorded here because it is the strongest curricular
warrant in this document for the project's *existing* honesty machinery
(advisories, problem divergence, refusals with remedies), and nobody was looking
for it.

---

*Written 2026-08-19. No gate, test or build was run — the brief forbade `make`,
`bin/runTests` and the `check_*` scripts, and the only file written is this one.
Engine and cost claims are inherited from
[`edutools-curriculum-survey.md`](edutools-curriculum-survey.md) and from
`gui/src/ui/methods/registry.ts` (read); curriculum claims are this document's,
at the evidence strength marked on each line. Every URL here was returned by a
search and NONE was fetched (§0b).*
