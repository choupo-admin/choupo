# The Theory Guide, equation by equation: which ones cite, which derive, which stand alone, and which are sourced to nobody

**Date:** 2026-09-26.  **Kind:** audit record (DEV.md 4c, entry C3; Vítor asked on 2026-09-22).
**Subject:** `docs/theoryGuide.tex` and its `\input` closure.  **Status:** a reading, not a change -- no `.tex`, no gate and no other document was edited.

## 1. Why this record exists

`bin/curate/check_theory_citations.py` is chapter-granular: it asks whether a chapter that carries equations carries at least one `\cite`, and its own blind-spot line says the individual equations are not checked.  A chapter with one citation at its head and thirty equations under it passes the gate, and nothing in the tree says which of the thirty the citation covers.  This record is the per-equation reading that the gate cannot do: every numbered display-math environment in the Theory Guide, one row each, one verdict each, defensible from the `.tex` alone.

The denominator is a tool, not a hand count: `bin/curate/theory_equation_inventory.py` enumerates the environments and prints its domain on its claim line.  The tool is wired into nothing -- it is the measurement this record is built on, and the two totals below are asserted equal by the generator that produced the tables.

## 2. Domain

The tool's claim line, reproduced verbatim from the run that produced this record:

```
TOTAL: 534 numbered display-math environments (equation 508, align 26).
theory_equation_inventory: OK -- 534 numbered equation environments in 81 chapters.  SCANNED: docs/theoryGuide.tex, docs/preamble.tex, docs/version.tex (docs/theoryGuide.tex and its \input/\include closure, comments after an unescaped % dropped, verbatim/lstlisting/comment bodies skipped).  COUNTED: \begin{equation|align|gather|multline|eqnarray|flalign}, one row per environment (an align with several numbered lines is ONE row).  EXCLUDED: the starred forms, \[..\], $$..$$, inline math, inner aligned/split/cases blocks.  NOT SEEN: whether a citation stands beside any row -- that is the reading job in docs/design/theory-guide-equation-citations-2026-09-26.md, and this tool is its denominator.  0 environment(s) render unnumbered through \notag/\nonumber on every line (counted, flagged); 0 environment(s) sit outside any numbered chapter.
```

**534 equations in 81 chapters**, every one of them with exactly one verdict below.  "Chapter" here is the gate's own convention: the Theory Guide has no `\chapter`; its Parts are `\section*` and its numbered `\section{...}\label{ch:...}` are what both the gate and the tool call a chapter, keyed by the label where one exists and by `title:<slug>` where none does.  The subsection column of the inventory is the nearest `\subsection` above the equation.

## 3. Method and conventions

Each equation received exactly one of four verdicts, in the words of the commission:

* **(a) CITED** -- a `\cite` attached to this equation or in the same paragraph, naming the key.  The guide uses `\cite` only; `docs/preamble.tex` defines no citation macro of its own, so nothing else was looked for.
* **(b) DERIVED** -- derived in the text from an equation that is itself (a), naming that equation.
* **(c) IDENTITY** -- a definition, a first-principles balance, or a standard identity, named in the note; no citation expected.
* **(d) UNSOURCED** -- none of the above: a correlation, a fitted constant, a model equation with parameters, or a claim attributed to nobody.

Where a choice between (c) and (d) was uncertain, (d) was chosen, as instructed.  No citation was invented, guessed or supplied from memory: a row is CITED only where a `\cite` key stands in the `.tex`, and the note names the key and its line.

Five conventions were needed to apply the four verdicts consistently, and they are stated here so that the counts can be re-derived by someone who disagrees with any of them:

1. **Every CITED row carries a location token** at the head of its note, so the strict reading of (a) is recoverable from the table.  `[cite: same paragraph]` is (a) in its strict form.  `[cite: subsection intro]` and `[cite: chapter intro]` mark a constituent equation of a named model whose `\cite` stands where the model is introduced (the paragraph that opens the subsection or the chapter), and `[cite: same subsection]` / `[cite: same chapter]` mark a `\cite` for the same named model elsewhere in the same unit.  The reasoning: when a subsection opens with "the UNIQUAC model \cite{Abrams1975}" and then writes its four constituent equations, each of the four is that paper's equation, and calling three of them UNSOURCED would be a false finding.  The strict-(a) count is reported separately in Section 4.
2. **A DERIVED row roots in a CITED one.**  Where an equation is derived in the text from an IDENTITY, the result is itself an IDENTITY and is recorded as such (a rearrangement of a balance is a balance).  Where the text derives an equation from one that is UNSOURCED, the result is UNSOURCED too, with the parent named -- a derivation cannot source what its premise lacks.  A chain (DERIVED from DERIVED from CITED) is allowed and the note names the immediate parent.
3. **The engine's own declarations are IDENTITY.**  A residual the solver iterates, a tolerance the case declares, a criterion the engine applies, a definition of a KPI the engine publishes: these have no author to cite and are marked IDENTITY with the words "the engine's own".  Vítor may prefer another word for them; the note makes them findable.
4. **An author named in prose without a `\cite` is UNSOURCED, and the note records the name.**  Fixing such a row is a move, not a search -- the guide already knows whom it is quoting -- and several of the names already have a key in the bibliography (the note says so where it was checked).  It is still UNSOURCED under the commission's definition, because a name in running text is not a citation a reader can follow.
5. **A bibliography key is checked against what the equation is.**  Two homonym traps were found and are flagged in the notes: `Hansen1991` is the UNIFAC revision (Hansen, Rasmussen, Fredenslund, Schiller, Gmehling), not the solubility-parameter Hansen, and `Wilson` is the 1964 activity model, not the Wilson K-value correlation.  A `\cite` that stands beside an equation but belongs to a different claim in the same paragraph (a K catalogue beside a mass-action law, say) does not make that equation CITED; the note says what the citation is for.

An `align` environment with several numbered lines is one row (the tool's rule, matched here); where its lines would earn different verdicts the note says so and the row takes the weaker one.

## 4. Totals

| Verdict | Count |
|---|---:|
| (a) CITED | 142 |
| (b) DERIVED | 28 |
| (c) IDENTITY | 314 |
| (d) UNSOURCED | 50 |
| **Total** | **534** |

The CITED count by location token (convention 1):

| Token | Count |
|---|---:|
| `[cite: same paragraph]` | 79 |
| `[cite: subsection intro]` | 26 |
| `[cite: chapter intro]` | 27 |
| `[cite: same subsection]` | 8 |
| `[cite: same chapter]` | 2 |
| **CITED, all tokens** | **142** |

So the strict reading of (a) -- a `\cite` in the equation's own paragraph -- holds for **79** equations; the remaining 63 CITED rows lean on a citation at the model's introduction in the same subsection or chapter.  A reader who rejects convention 1 should add those 63 to the UNSOURCED list; the tokens make that arithmetic possible without re-reading.

## 5. What this audit did NOT check

* **Whether a cited source contains the equation.**  No source was opened.  CITED means a key stands in the `.tex` beside the equation; it does not mean the paper says what the guide says it says.  That is a second audit, with the sources in hand, and it is not this one.
* **Whether an IDENTITY is correct**, or whether an equation the guide calls a balance is in fact one.  The verdict says what kind of statement the equation is, not whether it is true.
* **The hypotheses under which an equation holds** (constant molar overflow, ideal gas, dilute solution).  A first-principles balance under a stated assumption is IDENTITY here; whether the assumption is stated where it should be was not read for.
* **The other guides.**  Only `docs/theoryGuide.tex` and its `\input` closure (`docs/preamble.tex`, `docs/version.tex`, neither of which carries an equation) were read.  The Developer, Tutorials, EduTools and other guides are outside the domain.
* **Inline mathematics, `\[ ... \]` displays and starred environments.**  The tool excludes them and so does this record; a correlation written in running text is invisible here.
* **Figures and their captions**, `tikzpicture` bodies and code listings.  The reading view omitted them.
* **Whether the engine implements the equation as written.**  The `file:line` citations into the engine that some chapters carry were not followed.

## 6. The UNSOURCED list, in full

50 equations.  Each row is (d) under the commission's definition; the note records the author or standard the guide names in prose, where it names one, and the bibliography key where one already exists for that name.

| Id | Chapter | Note |
|---|---|---|
| `docs/theoryGuide.tex:1593` `eq:aw-master` | `ch:vap` | Ambrose-Walton master expansion; prose names "Ambrose and Walton (1989)", no \cite and no \bibitem for it |
| `docs/theoryGuide.tex:1608` `eq:aw-shape` | `ch:vap` | Ambrose-Walton shape functions with fitted constants; prose names "Ambrose and Walton (1989)", no \cite |
| `docs/theoryGuide.tex:2031` `eq:rackett-raw` | `ch:rackett` | Rackett equation; prose names "Rackett (1970)", no \cite and no \bibitem |
| `docs/theoryGuide.tex:2058` `eq:zra-yamada` | `ch:rackett` | Yamada-Gunn correlation for Z_RA with fitted constants; prose names "Yamada and Gunn (1973)" and "Spencer and Danner (1972)", no \cite |
| `docs/theoryGuide.tex:2067` `eq:rackett-code` | `ch:rackett` | operational Rackett/Yamada-Gunn formula, combination of eq:rackett-raw and eq:zra-yamada, both unsourced |
| `docs/theoryGuide.tex:2196` | `ch:heat` | polynomial Cp parametrization, a model form with fitted coefficients; no source named for the form |
| `docs/theoryGuide.tex:3070` `eq:integral-watson` | `ch:integrals` | Watson correlation (0.38 exponent) with no \cite in this paragraph; the same equation IS cited \cite{Watson} at line 1463 in ch:vap -- a cross-reference or a repeated \cite would close it |
| `docs/theoryGuide.tex:5415` | `ch:enrtl` | multi-salt eNRTL charge-fraction mixing rules; prose names "Song & Chen 2009, DOI 10.1021/ie9004578" with no \cite and no \bibitem (a move, not a search); Bollas, Chen & Barton 2008 likewise named without a \cite |
| `docs/theoryGuide.tex:5501` `eq:regular-solution` | `ch:solubility-parameter` | regular-solution excess enthalpy V phi1 phi2 (delta1 - delta2)^2, a model equation attributed to "regular-solution theory" with no author and no \cite |
| `docs/theoryGuide.tex:5537` `eq:hansen-sum` | `ch:solubility-parameter` | Hansen three-parameter split; prose names Hansen, no \cite; NOTE the bibliography key Hansen1991 is the UNIFAC Hansen et al. paper, a different work, not a source for this |
| `docs/theoryGuide.tex:6009` | `ch:edwards` | Davies equation with its 0.3 I term; prose names "The Davies equation", no \cite in this chapter (the key Davies1962 exists in the bibliography and is cited elsewhere in the guide) |
| `docs/theoryGuide.tex:6745` `eq:dh-limiting` | `ch:speciation` | Debye-Huckel limiting law; prose names "Debye-Huckel theory (1923)" and sketches the derivation (linearized Poisson-Boltzmann) but no \cite; a classical result Vitor may prefer to mark as identity |
| `docs/theoryGuide.tex:7462` `eq:henry-K-highP` | `ch:fugacity` | full unsymmetric Henry fugacity equality with Poynting (Krichevsky-Kasarnovsky 1935) and Margules gamma* (Krichevsky-Ilinskaya 1945); prose names "Prausnitz, Molecular Thermodynamics, Ch. 10" and both papers, none with a \cite and none in the bibliography |
| `docs/theoryGuide.tex:7686` `eq:srk-amix` | `ch:cubic-eos` | van der Waals one-fluid mixing rules with k_ij; called "classical" with no author and no \cite in this subsection |
| `docs/theoryGuide.tex:7699` `eq:srk-damixdT` | `ch:cubic-eos` | da_mix/dT, the derivative of eq:srk-amix, whose one-fluid mixing rule is itself unsourced |
| `docs/theoryGuide.tex:8404` `eq:wilson-K` | `ch:rr` | Wilson K-value initialization correlation with the constant 5.373; "Wilson's correlation" named, no \cite; NOTE the bibliography key Wilson is the 1964 activity-coefficient paper, a different work |
| `docs/theoryGuide.tex:11683` | `ch:rk4` | classical fourth-order Runge-Kutta stages and weights, stated without derivation or \cite ("canonical"); a textbook scheme Vitor may prefer to mark as identity |
| `docs/theoryGuide.tex:12008` `eq:sutherland` | `ch:viscosity` | Sutherland viscosity formula and the air constants (mu0, T0, S = 110.4 K); Sutherland named, no \cite; the section itself says it is NOT implemented |
| `docs/theoryGuide.tex:12391` `eq:vignes` | `ch:diffusivity` | Vignes logarithmic interpolation; "Vignes" named, no \cite and no \bibitem |
| `docs/theoryGuide.tex:17527` | `ch:crystalliser` | growth and nucleation power laws G = k_g (S-1)^g, B0 = k_b (S-1)^b M_T^j, called "the standard data-anchored forms" with no \cite in this paragraph (\cite{RandolphLarson} is attached to the PBE two subsections up, not to these kinetic forms) |
| `docs/theoryGuide.tex:17534` | `ch:crystalliser` | closure of mu_3 in S, derived in text from eq:moments and the kinetic power laws of line 17527, which are themselves unsourced |
| `docs/theoryGuide.tex:17677` | `ch:crystalliser` | size-dependent growth law G = G0 (1 + alpha L), a declared model form with a case parameter; no author, no \cite |
| `docs/theoryGuide.tex:19866` `eq:ext-langmuir` | `ch:adsorption` | extended (competitive) Langmuir mixing rule, "the workhorse teaching model", no \cite (\cite{Langmuir1918} two paragraphs up covers the pure isotherm only) |
| `docs/theoryGuide.tex:19892` `eq:ldf` | `ch:adsorption` | linear driving force rate model; "Glueckauf's classic estimate" named in prose, no \cite and no \bibitem |
| `docs/theoryGuide.tex:20416` | `ch:hydraulics-pressure` | homogeneous two-phase density and viscosity (McAdams named for the viscosity, no \cite anywhere in the subsection for it) |
| `docs/theoryGuide.tex:20434` | `ch:hydraulics-pressure` | Chisholm two-phase multiplier with C = 20/12/10/5 (Chisholm named, no \cite; \cite{LockhartMartinelli1949} at line 20479 is for the chart, not this algebraic form) |
| `docs/theoryGuide.tex:20569` | `sec:pneumatic-conveying` | saltation margin u_g/u_salt >= 1.5-2 (Rizk 1973 named in prose, no \cite; the margin band is attributed to nobody) |
| `docs/theoryGuide.tex:20692` | `ch:solids-sep` | Lapple d50 cut size (Lapple 1951 named in the list at line 20714, no \cite) |
| `docs/theoryGuide.tex:20699` | `ch:solids-sep` | Lapple grade-efficiency curve 1/(1+(d50/d)^2) (Lapple named, no \cite) |
| `docs/theoryGuide.tex:20779` | `ch:solids-sep` | bag-filter grade efficiency 1 - P0 exp(-d/d_c), model form with parameters attributed to nobody |
| `docs/theoryGuide.tex:20785` | `ch:solids-sep` | cake pressure drop mu V (K1 + K2 W), a Darcy-form model with two fitted constants, no \cite |
| `docs/theoryGuide.tex:20940` | `ch:drying-overview` | GAB isotherm (Guggenheim-Anderson-de Boer, named only as "GAB", no \cite) |
| `docs/theoryGuide.tex:21010` | `ch:hx-entu` | NTU definition beside the counter-current epsilon-NTU closed form (the closed form is a model result; no \cite anywhere in ch:hx-entu) |
| `docs/theoryGuide.tex:21193` `eq:merkel` | `ch:coolingTower` | Merkel integral (Merkel 1925 named in the section title and prose, no \cite anywhere in ch:coolingTower) |
| `docs/theoryGuide.tex:21718` `eq:molokanov` | `ch:fug` | Molokanov closed form with the constants 54.4, 11, 117.2 (Molokanov named in prose, no \cite; \cite{Gilliland1940} is the 1940 chart, not this fit) |
| `docs/theoryGuide.tex:22522` `eq:murphree` | `ch:hydraulics` | Murphree vapor efficiency (Murphree named in prose, no \cite anywhere in ch:hydraulics for it) |
| `docs/theoryGuide.tex:23273` `eq:asme-thickness` | `ch:size-vessel` | ASME Section VIII Div. 1 thin-shell thickness with the 0.6 P term (the standard is named in prose, no \cite; S = sigma_y/4 is the engine's own) |
| `docs/theoryGuide.tex:23464` | `ch:cost-guthrie` | the 1.18 contingency-and-fee factor for the total-module cost is attributed to nobody in its paragraph (\cite{Turton} at 23443 is attached to the K coefficients) |
| `docs/theoryGuide.tex:24593` `eq:rk4-packed` | `ch:rk4-packed` | classical fourth-order Runge-Kutta stages and weights, stated without derivation or \cite (the same scheme as line 11683, same verdict for consistency) |
| `docs/theoryGuide.tex:24951` `eq:rectifier-fenske` | `ch:rayleigh` | Fenske total-reflux relation restated in ch:rayleigh with no \cite (\cite{Fenske1932} stands in ch:fug at line 21655, a different chapter) |
| `docs/theoryGuide.tex:25768` `eq:rc-twopoint` | `sec:reactioncurve` | two-point construction with the constants 0.67, 1.3, 0.29 (Sundaresan & Krishnaswamy 1978 named in prose, no \cite) |
| `docs/theoryGuide.tex:26550` `eq:ros23` | `ch:stiff-ode` | Rosenbrock23 / ode23s two-stage scheme with constants "fixed by the order conditions"; Hairer & Wanner and Sandu et al. are named in the closing prose (line 26685) without a \cite, and the scheme's own authors are named nowhere |
| `docs/theoryGuide.tex:26713` `eq:arrhenius` | `ch:gas-kinetics` | Arrhenius law with A and E_a (Arrhenius named in prose, no \cite; Vitor may prefer to mark it identity) |
| `docs/theoryGuide.tex:26721` `eq:mod-arrhenius` | `ch:gas-kinetics` | modified Arrhenius form with the exponent b (attributed to "collision theory and transition-state theory", no \cite) |
| `docs/theoryGuide.tex:26749` `eq:falloff` | `ch:gas-kinetics` | Lindemann fall-off blend with the Troe broadening factor F (Lindemann and Troe named in prose, no \cite) |
| `docs/theoryGuide.tex:26842` `eq:carothers` | `ch:polymers` | Carothers equation (Carothers named in prose, the "counting argument" not shown, no \cite) |
| `docs/theoryGuide.tex:26862` `eq:flory-mole` | `ch:polymers` | Flory-Schulz most-probable distribution (named in prose, no \cite) |
| `docs/theoryGuide.tex:26868` `eq:flory-weight` | `ch:polymers` | weight-fraction form of eq:flory-mole, not derived in text and resting on an unsourced distribution |
| `docs/theoryGuide.tex:26874` `eq:Mw` | `ch:polymers` | weight-average degree of polymerization, not derived in text and resting on eq:flory-mole (unsourced) |
| `docs/theoryGuide.tex:26881` `eq:pdi` | `ch:polymers` | PDI = 1 + p, not derived in text and resting on eq:flory-mole (unsourced) |

## 7. Per-chapter tables

Chapters in document order.  The id is `file:line` of the `\begin` plus the `\label` where the equation has one.  Counts per chapter are (a)/(b)/(c)/(d).

### `ch:three-pillars` -- What a process simulator predicts, and how

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:628` | `ch:three-pillars` | (c) IDENTITY | component mole balance and steady-state energy balance, written from first principles |

### `title:notation-units-and-basis` -- Notation, units, and basis

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:911` `eq:beta-def` | `title:notation-units-and-basis` | (c) IDENTITY | definition of the vapor fraction beta = V/F |

### `ch:criticals` -- Critical properties and corresponding states

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:1043` | `ch:criticals` | (c) IDENTITY | definition of reduced coordinates T_r, P_r, V_r (prose names van der Waals 1873, no cite) |
| `docs/theoryGuide.tex:1086` `eq:criticals-omega` | `ch:criticals` | (c) IDENTITY | definition of the acentric factor omega (prose names Pitzer 1955, no cite) |
| `docs/theoryGuide.tex:1130` | `ch:criticals` | (c) IDENTITY | definition of the compressibility factor Z |

### `ch:vap` -- Vapour pressure: from Clausius-Clapeyron to Antoine

8 equations: CITED 2, DERIVED 0, IDENTITY 4, UNSOURCED 2.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:1248` `eq:cc-exact` | `ch:vap` | (c) IDENTITY | Clapeyron equation, derived in the text from equal chemical potentials along the coexistence curve |
| `docs/theoryGuide.tex:1281` | `ch:vap` | (c) IDENTITY | Clausius-Clapeyron under the two stated approximations (ideal-gas vapor, negligible liquid volume), from eq:cc-exact |
| `docs/theoryGuide.tex:1286` `eq:cc-simple` | `ch:vap` | (c) IDENTITY | simple Clausius-Clapeyron, eq. 1281 divided by Psat |
| `docs/theoryGuide.tex:1301` `eq:cc-rigid` | `ch:vap` | (c) IDENTITY | integration of eq:cc-simple with constant Hvap (rigid form) |
| `docs/theoryGuide.tex:1331` `eq:antoine` | `ch:vap` | (a) CITED | [cite: same subsection] \cite{RPP} in the paragraph that follows the equation (Poling, Prausnitz, O'Connell ch. 6); Antoine 1888 named and deliberately not cited |
| `docs/theoryGuide.tex:1456` | `ch:vap` | (a) CITED | [cite: same paragraph] \cite{Watson} in the same paragraph |
| `docs/theoryGuide.tex:1593` `eq:aw-master` | `ch:vap` | (d) UNSOURCED | Ambrose-Walton master expansion; prose names "Ambrose and Walton (1989)", no \cite and no \bibitem for it |
| `docs/theoryGuide.tex:1608` `eq:aw-shape` | `ch:vap` | (d) UNSOURCED | Ambrose-Walton shape functions with fitted constants; prose names "Ambrose and Walton (1989)", no \cite |

### `ch:sublimation` -- Sublimation: the solid-vapor curve and the triple point

6 equations: CITED 0, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:1788` `eq:clap-sub-exact` | `ch:sublimation` | (c) IDENTITY | Clapeyron equation for the solid-vapor boundary, same derivation as eq:cc-exact |
| `docs/theoryGuide.tex:1802` `eq:cc-sub-simple` | `ch:sublimation` | (c) IDENTITY | simple Clausius-Clapeyron for sublimation, same two approximations |
| `docs/theoryGuide.tex:1813` `eq:psub` | `ch:sublimation` | (c) IDENTITY | integration of eq:cc-sub-simple with constant Hsub anchored at the triple point (the engine's own algorithm) |
| `docs/theoryGuide.tex:1837` `eq:hsub-sum` | `ch:sublimation` | (c) IDENTITY | Hsub = Hfus + Hvap at the triple point (enthalpy is a state function) |
| `docs/theoryGuide.tex:1858` `eq:clap-fus` | `ch:sublimation` | (c) IDENTITY | Clapeyron equation for melting |
| `docs/theoryGuide.tex:1867` `eq:tfus` | `ch:sublimation` | (c) IDENTITY | linearization of eq:clap-fus at the triple point (the engine's own algorithm) |

### `ch:rackett` -- Saturated-liquid molar volume: the Rackett equation

5 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 3.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:2021` | `ch:rackett` | (c) IDENTITY | definition of the critical compressibility Z_c |
| `docs/theoryGuide.tex:2031` `eq:rackett-raw` | `ch:rackett` | (d) UNSOURCED | Rackett equation; prose names "Rackett (1970)", no \cite and no \bibitem |
| `docs/theoryGuide.tex:2058` `eq:zra-yamada` | `ch:rackett` | (d) UNSOURCED | Yamada-Gunn correlation for Z_RA with fitted constants; prose names "Yamada and Gunn (1973)" and "Spencer and Danner (1972)", no \cite |
| `docs/theoryGuide.tex:2067` `eq:rackett-code` | `ch:rackett` | (d) UNSOURCED | operational Rackett/Yamada-Gunn formula, combination of eq:rackett-raw and eq:zra-yamada, both unsourced |
| `docs/theoryGuide.tex:2095` `eq:rackett-mix` | `ch:rackett` | (c) IDENTITY | mole-weighted molar volume under the stated ideal-mixture (V^E = 0, Amagat) assumption |

### `ch:heat` -- Heat capacity

2 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:2196` | `ch:heat` | (d) UNSOURCED | polynomial Cp parametrization, a model form with fitted coefficients; no source named for the form |
| `docs/theoryGuide.tex:2205` | `ch:heat` | (c) IDENTITY | h(T) - h(Tref) = integral of Cp (definition of Cp) |

### `ch:integrals` -- From component data to integral properties

19 equations: CITED 0, DERIVED 0, IDENTITY 18, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:2384` `eq:integral-href` | `ch:integrals` | (c) IDENTITY | reference-state convention h_liq(Tref) = 0 (a definition) |
| `docs/theoryGuide.tex:2391` | `ch:integrals` | (c) IDENTITY | liquid enthalpy as the integral of Cp_liq from Tref |
| `docs/theoryGuide.tex:2401` `eq:integral-hvap` | `ch:integrals` | (c) IDENTITY | h_vap = h_liq + latent heat (definition of the two-rung datum) |
| `docs/theoryGuide.tex:2450` | `ch:integrals` | (c) IDENTITY | heat of reaction as the stoichiometric sum of formation enthalpies (Hess's law) |
| `docs/theoryGuide.tex:2559` | `ch:integrals` | (c) IDENTITY | ideal-gas enthalpy on the elements datum: formation enthalpy plus sensible integral |
| `docs/theoryGuide.tex:2565` | `ch:integrals` | (c) IDENTITY | elements-datum liquid enthalpy = h_ig - Hvap |
| `docs/theoryGuide.tex:2923` `eq:third-law-entropy` | `ch:integrals` | (c) IDENTITY | third-law absolute entropy (definition) |
| `docs/theoryGuide.tex:2942` `eq:gibbs-h-of-T` | `ch:integrals` | (c) IDENTITY | h(T), s(T) by Cp integration and g = h - Ts (definitions) |
| `docs/theoryGuide.tex:3012` | `ch:integrals` | (c) IDENTITY | identification of the NASA-7 standard-state H0/S0 at 298.15 K with Hf and s298 (datum convention; TM-4513 named in a footnote, not a \cite) |
| `docs/theoryGuide.tex:3070` `eq:integral-watson` | `ch:integrals` | (d) UNSOURCED | Watson correlation (0.38 exponent) with no \cite in this paragraph; the same equation IS cited \cite{Watson} at line 1463 in ch:vap -- a cross-reference or a repeated \cite would close it |
| `docs/theoryGuide.tex:3115` `eq:integral-sT` | `ch:integrals` | (c) IDENTITY | entropy transported from the third-law anchor by the Cp/T integral |
| `docs/theoryGuide.tex:3128` | `ch:integrals` | (c) IDENTITY | Delta s = Delta h / T at phase equilibrium (Delta g = 0) |
| `docs/theoryGuide.tex:3141` `eq:integral-svap298` | `ch:integrals` | (c) IDENTITY | Delta s = (Delta h - Delta g)/T with the ideal-gas Delta g = -RT ln(Psat/P0) |
| `docs/theoryGuide.tex:3165` `eq:integral-gT` | `ch:integrals` | (c) IDENTITY | definition g = h - Ts |
| `docs/theoryGuide.tex:3201` `eq:integral-hmix` | `ch:integrals` | (c) IDENTITY | ideal-mixing enthalpy weighted by phase fraction (h^E neglected, stated) |
| `docs/theoryGuide.tex:3218` `eq:integral-Gmix` | `ch:integrals` | (c) IDENTITY | Gibbs energy of mixing and the definition of G^E |
| `docs/theoryGuide.tex:3239` `eq:integral-gd` | `ch:integrals` | (c) IDENTITY | Gibbs-Duhem |
| `docs/theoryGuide.tex:3255` `eq:integral-gd-area` | `ch:integrals` | (c) IDENTITY | binary area consistency test, follows from Gibbs-Duhem (prose names Redlich-Kister, no \cite) |
| `docs/theoryGuide.tex:3290` | `ch:integrals` | (c) IDENTITY | heater energy balance of the worked example |

### `ch:ideal-mixing` -- Ideal mixing

12 equations: CITED 0, DERIVED 0, IDENTITY 12, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:3430` | `ch:ideal-mixing` | (c) IDENTITY | number of lattice arrangements (binomial coefficient) |
| `docs/theoryGuide.tex:3436` `eq:ideal-smix` | `ch:ideal-mixing` | (c) IDENTITY | ideal entropy of mixing from S = k ln W and Stirling |
| `docs/theoryGuide.tex:3465` `eq:ideal-gmix` | `ch:ideal-mixing` | (c) IDENTITY | ideal Gibbs energy of mixing, g = h - Ts with h_mix = 0 |
| `docs/theoryGuide.tex:3475` | `ch:ideal-mixing` | (c) IDENTITY | ideal-mixture molar Gibbs energy |
| `docs/theoryGuide.tex:3483` `eq:ideal-mu` | `ch:ideal-mixing` | (c) IDENTITY | ideal-mixture chemical potential (partial derivative of eq. 3475) |
| `docs/theoryGuide.tex:3513` | `ch:ideal-mixing` | (c) IDENTITY | ideal-gas pure-component chemical potential |
| `docs/theoryGuide.tex:3519` | `ch:ideal-mixing` | (c) IDENTITY | ideal-gas mixture chemical potential at the partial pressure |
| `docs/theoryGuide.tex:3527` | `ch:ideal-mixing` | (c) IDENTITY | Dalton's law, derived from eq. 3519 |
| `docs/theoryGuide.tex:3540` | `ch:ideal-mixing` | (c) IDENTITY | pure-liquid chemical potential at saturation, ideal-gas vapor |
| `docs/theoryGuide.tex:3548` `eq:raoult` | `ch:ideal-mixing` | (c) IDENTITY | Raoult's law, derived from equal chemical potentials |
| `docs/theoryGuide.tex:3568` | `ch:ideal-mixing` | (c) IDENTITY | binary specialization of eq:ideal-gmix |
| `docs/theoryGuide.tex:3643` | `ch:ideal-mixing` | (c) IDENTITY | definition of the activity coefficient as the correction to mu_id |

### `ch:activity` -- Activity coefficients

24 equations: CITED 16, DERIVED 6, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:3664` | `ch:activity` | (c) IDENTITY | definition of the excess Gibbs energy |
| `docs/theoryGuide.tex:3668` `eq:gamma-from-GE` | `ch:activity` | (c) IDENTITY | definition of ln gamma_i as the partial molar excess Gibbs energy |
| `docs/theoryGuide.tex:3756` `eq:nrtl-local` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Renon} in the same paragraph ("Renon and Prausnitz's \cite{Renon} starting point") |
| `docs/theoryGuide.tex:3814` `eq:nrtl-tauG` | `ch:activity` | (b) DERIVED | NRTL grouped parameters tau_ij, G_ij: the model's own definitions, from the local-composition postulate eq:nrtl-local (\cite{Renon}) |
| `docs/theoryGuide.tex:3840` `eq:nrtl-GE` | `ch:activity` | (b) DERIVED | NRTL excess Gibbs energy, from eq:nrtl-local (\cite{Renon}) by the stated substitution |
| `docs/theoryGuide.tex:3857` `eq:nrtl-gamma` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Renon} and \cite{RPP} (Eq. 8-10) in the same paragraph, as the hand-derivation check |
| `docs/theoryGuide.tex:3945` `eq:wilson-local` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Wilson} in the same paragraph |
| `docs/theoryGuide.tex:3958` `eq:wilson-GE` | `ch:activity` | (b) DERIVED | Wilson excess Gibbs energy, from the local-composition postulate eq:wilson-local (\cite{Wilson}) |
| `docs/theoryGuide.tex:3966` `eq:wilson-Lambda` | `ch:activity` | (b) DERIVED | definition of the Wilson parameter Lambda_ij, part of the model of eq:wilson-local (\cite{Wilson}) |
| `docs/theoryGuide.tex:3988` `eq:wilson-gamma` | `ch:activity` | (b) DERIVED | Wilson ln gamma_i, from eq:wilson-GE through eq:gamma-from-GE (derivation sketched in the text) |
| `docs/theoryGuide.tex:4007` | `ch:activity` | (b) DERIVED | infinite-dilution limit of eq:wilson-gamma |
| `docs/theoryGuide.tex:4199` `eq:uniquac-split` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Abrams1975} in the same paragraph |
| `docs/theoryGuide.tex:4219` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{RPP} (Table 8E) and \cite{Abrams1975} in the same paragraph; Bondi 1968 named in prose without a \cite |
| `docs/theoryGuide.tex:4233` `eq:uniquac-fractions` | `ch:activity` | (a) CITED | [cite: same paragraph] same paragraph as eq. 4219 (\cite{RPP}, \cite{Abrams1975}) |
| `docs/theoryGuide.tex:4245` `eq:uniquac-comb` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIQUAC combinatorial term; \cite{Abrams1975} attached to the model's introduction in this subsection (eq:uniquac-split), not to this paragraph; Staverman-Guggenheim named in prose without a \cite |
| `docs/theoryGuide.tex:4266` `eq:uniquac-tau` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIQUAC residual Boltzmann factor; \cite{Abrams1975} at the subsection's model introduction |
| `docs/theoryGuide.tex:4282` `eq:uniquac-res` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIQUAC residual term; \cite{Abrams1975} at the subsection's model introduction |
| `docs/theoryGuide.tex:4493` `eq:unifac-split` | `ch:activity` | (a) CITED | [cite: subsection intro] \cite{Fredenslund1975, RPP} in the subsection's model-introducing paragraph |
| `docs/theoryGuide.tex:4503` `eq:unifac-rq` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Hansen1991} in the same paragraph |
| `docs/theoryGuide.tex:4516` `eq:unifac-comb` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIFAC combinatorial term; \cite{Fredenslund1975, RPP} at the subsection's model introduction |
| `docs/theoryGuide.tex:4524` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIFAC fractions and l_i; \cite{Fredenslund1975, RPP} at the subsection's model introduction |
| `docs/theoryGuide.tex:4539` `eq:unifac-res` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIFAC residual term; \cite{Fredenslund1975, RPP} at the subsection's model introduction |
| `docs/theoryGuide.tex:4552` `eq:unifac-Gamma` | `ch:activity` | (a) CITED | [cite: subsection intro] UNIFAC group residual activity; \cite{Fredenslund1975, RPP} at the subsection's model introduction |
| `docs/theoryGuide.tex:4561` `eq:unifac-theta-psi` | `ch:activity` | (a) CITED | [cite: same paragraph] \cite{Hansen1991} in the same paragraph |

### `ch:electrolytes` -- Electrolyte solutions: ionic strength, the osmotic

9 equations: CITED 2, DERIVED 0, IDENTITY 7, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:4729` `eq:osmotic-mu` | `ch:electrolytes` | (c) IDENTITY | equality of the solvent chemical potential across a semipermeable membrane (first principles) |
| `docs/theoryGuide.tex:4741` `eq:osmotic-exact` | `ch:electrolytes` | (c) IDENTITY | exact osmotic pressure pi = -(RT/Vw) ln a_w, derived from eq:osmotic-mu |
| `docs/theoryGuide.tex:4757` `eq:phi-def` | `ch:electrolytes` | (c) IDENTITY | definition of the osmotic coefficient phi |
| `docs/theoryGuide.tex:4771` `eq:osmotic-phi` | `ch:electrolytes` | (c) IDENTITY | pi = phi nu R T c, substitution of eq:phi-def into eq:osmotic-exact |
| `docs/theoryGuide.tex:4794` `eq:vant-hoff` | `ch:electrolytes` | (c) IDENTITY | van't Hoff law as the phi = 1 limit of eq:osmotic-phi (prose names van't Hoff 1887, no cite) |
| `docs/theoryGuide.tex:4819` `eq:ionic-strength` | `ch:electrolytes` | (c) IDENTITY | definition of ionic strength |
| `docs/theoryGuide.tex:4827` | `ch:electrolytes` | (c) IDENTITY | ionic strength of a 1:1 salt |
| `docs/theoryGuide.tex:4888` `eq:pitzer-phi` | `ch:electrolytes` | (a) CITED | [cite: chapter intro] Pitzer 1:1 osmotic coefficient; \cite{Pitzer1973} sits in this chapter's opening subsection (line 4676), not beside the equation; the NaCl parameter set (beta0, beta1, Cphi) printed below and the universal b = 1.2, alpha = 2.0 name no source of their own |
| `docs/theoryGuide.tex:4899` `eq:pitzer-B` | `ch:electrolytes` | (a) CITED | [cite: chapter intro] Pitzer second virial coefficient B^phi; \cite{Pitzer1973} at line 4676, two subsections up |

### `ch:enrtl` -- Electrolyte-NRTL: the activity coefficient of the

9 equations: CITED 5, DERIVED 1, IDENTITY 2, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:5108` `eq:enrtl-gibbs` | `ch:enrtl` | (a) CITED | [cite: chapter intro] eNRTL three-layer split; \cite{ChenSongEvans1982,ChenEvans1986} in the chapter's opening box (line 5018) |
| `docs/theoryGuide.tex:5145` `eq:enrtl-pdh` | `ch:enrtl` | (a) CITED | [cite: chapter intro] Pitzer-Debye-Huckel term of eNRTL; \cite{ChenSongEvans1982,ChenEvans1986} at line 5018 |
| `docs/theoryGuide.tex:5161` `eq:enrtl-ADH` | `ch:enrtl` | (a) CITED | [cite: chapter intro] mole-fraction Debye-Huckel slope A_DH; part of the PDH term, \cite{ChenSongEvans1982,ChenEvans1986} at line 5018 |
| `docs/theoryGuide.tex:5202` `eq:enrtl-lc` | `ch:enrtl` | (a) CITED | [cite: chapter intro] eNRTL local-composition term; \cite{ChenSongEvans1982,ChenEvans1986} at line 5018; prose also names "IDAES Eqns. 26-27" without a \cite |
| `docs/theoryGuide.tex:5221` `eq:enrtl-mean` | `ch:enrtl` | (c) IDENTITY | mean ionic activity coefficient from stoichiometry and the mole-fraction to molality scale conversion (definitions) |
| `docs/theoryGuide.tex:5246` | `ch:enrtl` | (c) IDENTITY | the engine's own declared T-anchoring convention tau = tau_ref T_ref/T (a = 0, b = tau_ref T_ref), stated as an uncalibrated choice; not a literature result |
| `docs/theoryGuide.tex:5255` | `ch:enrtl` | (b) DERIVED | temperature scaling of A_DH, follows from the rho_w and eps_w T dependence of eq:enrtl-ADH; Malmberg-Maryott and Kell named in prose here without a \cite (both keys exist in the bibliography) |
| `docs/theoryGuide.tex:5298` `eq:enrtl-born` | `ch:enrtl` | (a) CITED | [cite: chapter intro] Born transfer term; \cite{ChenSongEvans1982,ChenEvans1986} at line 5018; the Born radius "calibrated to KCl in water+ethanol" names no source |
| `docs/theoryGuide.tex:5415` | `ch:enrtl` | (d) UNSOURCED | multi-salt eNRTL charge-fraction mixing rules; prose names "Song & Chen 2009, DOI 10.1021/ie9004578" with no \cite and no \bibitem (a move, not a search); Bollas, Chen & Barton 2008 likewise named without a \cite |

### `ch:solubility-parameter` -- Cohesive energy density and the solubility parameter

4 equations: CITED 1, DERIVED 0, IDENTITY 1, UNSOURCED 2.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:5489` `eq:hildebrand-delta` | `ch:solubility-parameter` | (c) IDENTITY | definition of the Hildebrand solubility parameter (prose names Hildebrand, no cite) |
| `docs/theoryGuide.tex:5501` `eq:regular-solution` | `ch:solubility-parameter` | (d) UNSOURCED | regular-solution excess enthalpy V phi1 phi2 (delta1 - delta2)^2, a model equation attributed to "regular-solution theory" with no author and no \cite |
| `docs/theoryGuide.tex:5537` `eq:hansen-sum` | `ch:solubility-parameter` | (d) UNSOURCED | Hansen three-parameter split; prose names Hansen, no \cite; NOTE the bibliography key Hansen1991 is the UNIFAC Hansen et al. paper, a different work, not a source for this |
| `docs/theoryGuide.tex:5549` `eq:teas` | `ch:solubility-parameter` | (a) CITED | [cite: same paragraph] \cite{Teas1968} |

### `ch:pitzer-hmw` -- Multi-ion Pitzer: the Harvie--Moller--Weare

12 equations: CITED 10, DERIVED 0, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:5688` `eq:hmw-cation` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] \cite{HMW1984} in the sentence that introduces the equations (line 5686); "Pitzer 1991, ch. 3" named without a \cite |
| `docs/theoryGuide.tex:5698` `eq:hmw-anion` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] \cite{HMW1984} at line 5686 |
| `docs/theoryGuide.tex:5710` `eq:hmw-F` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] the long-range function F of the HMW equations, \cite{HMW1984} at line 5686 |
| `docs/theoryGuide.tex:5720` `eq:hmw-Z` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] the charge-weighted molality Z of the HMW equations, \cite{HMW1984} at line 5686 |
| `docs/theoryGuide.tex:5756` `eq:hmw-neutral` | `ch:pitzer-hmw` | (a) CITED | [cite: subsection intro] HMW neutral-solute salting-out terms; \cite{HMW1984} at the subsection's opening (line 5686) |
| `docs/theoryGuide.tex:5778` `eq:etheta` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] \cite{Pitzer1975} |
| `docs/theoryGuide.tex:5785` `eq:etheta-prime` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] \cite{Pitzer1975} |
| `docs/theoryGuide.tex:5795` `eq:Jfunc` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] J(x) closed-form approximation, \cite{Pitzer1975} in the same paragraph; "USGS PHRQPITZ / Plummer et al. 1988" named without a \cite |
| `docs/theoryGuide.tex:5847` `eq:hmw-osmotic` | `ch:pitzer-hmw` | (a) CITED | [cite: same paragraph] \cite{Pitzer1973} at line 5845; "Pitzer 1991 ch. 3; HMW 1984" named in plain text beside it (the HMW1984 key exists) |
| `docs/theoryGuide.tex:5870` `eq:phi-osmotic-mixing` | `ch:pitzer-hmw` | (a) CITED | [cite: subsection intro] osmotic form of the like-sign mixing term; \cite{Pitzer1973} at line 5845, the paragraph that introduces eq:hmw-osmotic |
| `docs/theoryGuide.tex:5882` `eq:hmw-aw` | `ch:pitzer-hmw` | (c) IDENTITY | ln a_w from the definition of the osmotic coefficient |
| `docs/theoryGuide.tex:5915` | `ch:pitzer-hmw` | (c) IDENTITY | mean ionic activity coefficient from the per-ion values (definition) |

### `ch:edwards` -- Molecular solutes in a Pitzer expansion: the Edwards

5 equations: CITED 4, DERIVED 0, IDENTITY 0, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:6009` | `ch:edwards` | (d) UNSOURCED | Davies equation with its 0.3 I term; prose names "The Davies equation", no \cite in this chapter (the key Davies1962 exists in the bibliography and is cited elsewhere in the guide) |
| `docs/theoryGuide.tex:6033` `eq:edwards8` | `ch:edwards` | (a) CITED | [cite: chapter intro] Edwards Eq. 8 truncation; \cite{Edwards1978} in the chapter's opening box (line 5999) |
| `docs/theoryGuide.tex:6051` `eq:edwards10` | `ch:edwards` | (a) CITED | [cite: chapter intro] Edwards Eq. 10 water activity; \cite{Edwards1978} at line 5999 |
| `docs/theoryGuide.tex:6088` | `ch:edwards` | (a) CITED | [cite: chapter intro] Edwards measured beta0(T) = E + F/T; \cite{Edwards1978} at line 5999 |
| `docs/theoryGuide.tex:6096` `eq:edwards24` | `ch:edwards` | (a) CITED | [cite: chapter intro] Edwards estimation rules (Eqs 21-24 of the paper); \cite{Edwards1978} at line 5999; Bromley named in prose without a \cite |

### `ch:speciation` -- Aqueous speciation: mass action, charge balance, and the

16 equations: CITED 3, DERIVED 0, IDENTITY 12, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:6198` `eq:spec-massaction` | `ch:speciation` | (c) IDENTITY | law of mass action for a formation reaction (Delta G_rxn = 0); \cite{Parkhurst2013} in the same paragraph is for the K catalogue, not the law |
| `docs/theoryGuide.tex:6231` `eq:spec-molebalance` | `ch:speciation` | (c) IDENTITY | master-ion mole balance |
| `docs/theoryGuide.tex:6289` `eq:ph-given` | `ch:speciation` | (c) IDENTITY | definition of pH |
| `docs/theoryGuide.tex:6303` `eq:electroneutrality` | `ch:speciation` | (c) IDENTITY | electroneutrality |
| `docs/theoryGuide.tex:6329` `eq:spec-molebalance-solid` | `ch:speciation` | (c) IDENTITY | mole balance with a precipitating solid sink |
| `docs/theoryGuide.tex:6373` `eq:percent-error` | `ch:speciation` | (a) CITED | [cite: same paragraph] \cite{Parkhurst2013} (PHREEQC charge-balance percent error) |
| `docs/theoryGuide.tex:6413` `eq:bjerrum-ratio` | `ch:speciation` | (c) IDENTITY | monoprotic mass action rearranged (Henderson-Hasselbalch form), from eq:spec-massaction |
| `docs/theoryGuide.tex:6491` `eq:bjerrum-titrant` | `ch:speciation` | (c) IDENTITY | definition of the net-charge fraction q of a converged answer |
| `docs/theoryGuide.tex:6634` `eq:spec-logvar` | `ch:speciation` | (c) IDENTITY | log-molality substitution (definition) |
| `docs/theoryGuide.tex:6642` `eq:spec-logmassaction` | `ch:speciation` | (c) IDENTITY | mass-action law in log form, from eq:spec-massaction |
| `docs/theoryGuide.tex:6745` `eq:dh-limiting` | `ch:speciation` | (d) UNSOURCED | Debye-Huckel limiting law; prose names "Debye-Huckel theory (1923)" and sketches the derivation (linearized Poisson-Boltzmann) but no \cite; a classical result Vitor may prefer to mark as identity |
| `docs/theoryGuide.tex:6759` `eq:davies` | `ch:speciation` | (a) CITED | [cite: subsection intro] Davies equation; \cite{Davies1962} in the paragraph that opens this subsection (line 6735) |
| `docs/theoryGuide.tex:6782` `eq:davies-AT` | `ch:speciation` | (a) CITED | [cite: same paragraph] \cite{MalmbergMaryott1956} and \cite{Kell1975} for the two solvent correlations; the T^-3/2 eps^-3/2 form is the Debye-Huckel charging-integral scaling |
| `docs/theoryGuide.tex:6866` `eq:spec-aw` | `ch:speciation` | (c) IDENTITY | ln a_w from the definition of the osmotic coefficient (eq:phi-def) |
| `docs/theoryGuide.tex:6912` `eq:gaspin` | `ch:speciation` | (c) IDENTITY | Henry's law as an activity pin (definition of K_H) |
| `docs/theoryGuide.tex:7007` `eq:spec-SI` | `ch:speciation` | (c) IDENTITY | definition of the saturation index and the ion activity product |

### `ch:fugacity` -- Fugacity and the vapor phase

15 equations: CITED 0, DERIVED 0, IDENTITY 14, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:7090` `eq:fugacity-def` | `ch:fugacity` | (c) IDENTITY | definition of fugacity (prose names G. N. Lewis 1901, no cite) |
| `docs/theoryGuide.tex:7100` | `ch:fugacity` | (c) IDENTITY | definition of the fugacity coefficient |
| `docs/theoryGuide.tex:7123` | `ch:fugacity` | (c) IDENTITY | equal fugacities of a pure substance at saturation |
| `docs/theoryGuide.tex:7134` `eq:fugacity-pure-liq` | `ch:fugacity` | (c) IDENTITY | pure-liquid fugacity with the Poynting factor dropped (stated approximation) |
| `docs/theoryGuide.tex:7146` `eq:fugacity-vap-mix` | `ch:fugacity` | (c) IDENTITY | definition of the partial fugacity coefficient in a vapor mixture |
| `docs/theoryGuide.tex:7160` `eq:fugacity-liq-mix` | `ch:fugacity` | (c) IDENTITY | liquid partial fugacity through the activity coefficient (definition) |
| `docs/theoryGuide.tex:7179` `eq:fugacity-equilibrium` | `ch:fugacity` | (c) IDENTITY | phase-equilibrium criterion in fugacity form |
| `docs/theoryGuide.tex:7191` `eq:gamma-phi-here` | `ch:fugacity` | (c) IDENTITY | gamma-phi formulation, substitution of eqs 7146 and 7160 into 7179 |
| `docs/theoryGuide.tex:7204` `eq:modified-raoult` | `ch:fugacity` | (c) IDENTITY | modified Raoult's law, the ideal-vapor limit of eq:gamma-phi-here |
| `docs/theoryGuide.tex:7322` | `ch:fugacity` | (c) IDENTITY | K-value from modified Raoult's law (definition of K_i) |
| `docs/theoryGuide.tex:7355` `eq:henry-def` | `ch:fugacity` | (c) IDENTITY | Henry's law / definition of the Henry constant (prose names Henry 1803, no cite) |
| `docs/theoryGuide.tex:7369` `eq:henry-gamma-inf` | `ch:fugacity` | (c) IDENTITY | H_i = gamma_inf Psat, the x -> 0 limit of modified Raoult's law |
| `docs/theoryGuide.tex:7382` `eq:henry-K` | `ch:fugacity` | (c) IDENTITY | Henry K-value from Dalton's law and eq:henry-def |
| `docs/theoryGuide.tex:7411` `eq:henry-vanthoff` | `ch:fugacity` | (c) IDENTITY | van't Hoff integration of ln H with constant dissolution enthalpy (derived in the text) |
| `docs/theoryGuide.tex:7462` `eq:henry-K-highP` | `ch:fugacity` | (d) UNSOURCED | full unsymmetric Henry fugacity equality with Poynting (Krichevsky-Kasarnovsky 1935) and Margules gamma* (Krichevsky-Ilinskaya 1945); prose names "Prausnitz, Molecular Thermodynamics, Ch. 10" and both papers, none with a \cite and none in the bibliography |

### `ch:cubic-eos` -- The SRK cubic equation of state

11 equations: CITED 4, DERIVED 4, IDENTITY 1, UNSOURCED 2.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:7627` `eq:srk-pv` | `ch:cubic-eos` | (a) CITED | [cite: same paragraph] \cite{Soave1972} in the paragraph introducing the SRK equation (line 7621); van der Waals 1873 and Redlich-Kwong 1949 named without a \cite |
| `docs/theoryGuide.tex:7642` `eq:srk-ac` | `ch:cubic-eos` | (b) DERIVED | SRK a_c and b (Omega_a, Omega_b) from the critical-point conditions applied to eq:srk-pv (\cite{Soave1972}); the derivation is stated, not written out |
| `docs/theoryGuide.tex:7651` `eq:srk-alpha` | `ch:cubic-eos` | (a) CITED | [cite: same paragraph] Soave alpha(T); \cite{Soave1972} at line 7658 |
| `docs/theoryGuide.tex:7659` `eq:srk-m` | `ch:cubic-eos` | (a) CITED | [cite: same paragraph] Soave slope m(omega); \cite{Soave1972} at line 7658 |
| `docs/theoryGuide.tex:7674` `eq:srk-dadT` | `ch:cubic-eos` | (b) DERIVED | da/dT by the chain rule on eq:srk-alpha |
| `docs/theoryGuide.tex:7686` `eq:srk-amix` | `ch:cubic-eos` | (d) UNSOURCED | van der Waals one-fluid mixing rules with k_ij; called "classical" with no author and no \cite in this subsection |
| `docs/theoryGuide.tex:7699` `eq:srk-damixdT` | `ch:cubic-eos` | (d) UNSOURCED | da_mix/dT, the derivative of eq:srk-amix, whose one-fluid mixing rule is itself unsourced |
| `docs/theoryGuide.tex:7710` `eq:srk-AB` | `ch:cubic-eos` | (c) IDENTITY | definitions of the dimensionless groups A and B |
| `docs/theoryGuide.tex:7717` `eq:srk-cubic` | `ch:cubic-eos` | (b) DERIVED | the cubic in Z, a rearrangement of eq:srk-pv (\cite{Soave1972}) |
| `docs/theoryGuide.tex:7790` `eq:srk-lnphi` | `ch:cubic-eos` | (b) DERIVED | SRK ln phi_i, the fugacity recipe of ch:fugacity applied to eq:srk-pv; the paragraph carries no \cite |
| `docs/theoryGuide.tex:7815` `eq:srk-HR` | `ch:cubic-eos` | (a) CITED | [cite: same paragraph] \cite{Sandler} for the departure functions |

### `ch:cosmosac` -- COSMO-SAC: an activity coefficient from a charge surface

3 equations: CITED 3, DERIVED 0, IDENTITY 0, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:7970` `eq:cosmo-dw` | `ch:cosmosac` | (a) CITED | [cite: chapter intro] COSMO-SAC segment exchange energy; \cite{LinSandler2002} in the chapter's first paragraph (line 7952) |
| `docs/theoryGuide.tex:7988` `eq:cosmo-gamma` | `ch:cosmosac` | (a) CITED | [cite: chapter intro] COSMO-SAC segment activity fixed point; \cite{LinSandler2002} at line 7952 |
| `docs/theoryGuide.tex:8002` `eq:cosmo-res` | `ch:cosmosac` | (a) CITED | [cite: chapter intro] COSMO-SAC residual ln gamma; \cite{LinSandler2002} at line 7952; Staverman-Guggenheim named without a \cite |

### `ch:pcsaft` -- PC-SAFT: a molecular equation of state

3 equations: CITED 3, DERIVED 0, IDENTITY 0, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:8046` | `ch:pcsaft` | (a) CITED | [cite: same paragraph] \cite{GrossSadowski2001} and \cite{GrossSadowski2002} in the same paragraph |
| `docs/theoryGuide.tex:8086` `eq:assoc-closure` | `ch:pcsaft` | (a) CITED | [cite: chapter intro] Wertheim association closure; \cite{GrossSadowski2002} at line 8056 (the chapter's opening paragraph); Wertheim, Huang-Radosz and Wolbach-Sandler named without a \cite |
| `docs/theoryGuide.tex:8096` | `ch:pcsaft` | (a) CITED | [cite: chapter intro] association Helmholtz contribution; \cite{GrossSadowski2002} at line 8056 |

### `ch:rr` -- K-values and Rachford-Rice

6 equations: CITED 0, DERIVED 0, IDENTITY 5, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:8228` `eq:K-def` | `ch:rr` | (c) IDENTITY | definition of the K-value |
| `docs/theoryGuide.tex:8233` `eq:K-modified-raoult` | `ch:rr` | (c) IDENTITY | K_i from modified Raoult's law (eq:modified-raoult) |
| `docs/theoryGuide.tex:8247` | `ch:rr` | (c) IDENTITY | single-stage component balance |
| `docs/theoryGuide.tex:8255` `eq:xy-from-K` | `ch:rr` | (c) IDENTITY | x_i, y_i from the balance and y = Kx |
| `docs/theoryGuide.tex:8263` `eq:RR` | `ch:rr` | (c) IDENTITY | Rachford-Rice equation, derived in the text from the balance and the summation closure (Rachford-Rice named, no cite) |
| `docs/theoryGuide.tex:8404` `eq:wilson-K` | `ch:rr` | (d) UNSOURCED | Wilson K-value initialization correlation with the constant 5.373; "Wilson's correlation" named, no \cite; NOTE the bibliography key Wilson is the 1964 activity-coefficient paper, a different work |

### `ch:gentle` -- Numerical methods, gently

4 equations: CITED 0, DERIVED 0, IDENTITY 4, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:8531` `eq:gentle-bubble` | `ch:gentle` | (c) IDENTITY | Raoult bubble-point condition |
| `docs/theoryGuide.tex:8547` | `ch:gentle` | (c) IDENTITY | definition of the residual f(T) of the worked problem |
| `docs/theoryGuide.tex:8631` `eq:secant` | `ch:gentle` | (c) IDENTITY | secant step, derived geometrically in the text (textbook method, no cite) |
| `docs/theoryGuide.tex:8674` | `ch:gentle` | (c) IDENTITY | Newton-Raphson step (derived from Taylor's theorem in the next chapter) |

### `ch:nr1d` -- Newton-Raphson, one dimension

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:8870` `eq:newton-1d` | `ch:nr1d` | (c) IDENTITY | Newton iteration, derived from the Taylor expansion written above it |
| `docs/theoryGuide.tex:8939` | `ch:nr1d` | (c) IDENTITY | quadratic error recursion of Newton, derived in the text |
| `docs/theoryGuide.tex:8950` | `ch:nr1d` | (c) IDENTITY | damped Newton step (definition) |

### `ch:nrND` -- Newton-Raphson, n dimensions

5 equations: CITED 0, DERIVED 0, IDENTITY 5, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:9037` `eq:newton-nd-system` | `ch:nrND` | (c) IDENTITY | statement of the n-dimensional root problem |
| `docs/theoryGuide.tex:9045` `eq:newton-nd-taylor` | `ch:nrND` | (c) IDENTITY | first-order vector Taylor expansion |
| `docs/theoryGuide.tex:9053` `eq:newton-nd-jacobian` | `ch:nrND` | (c) IDENTITY | definition of the Jacobian matrix |
| `docs/theoryGuide.tex:9072` `eq:newton-nd` | `ch:nrND` | (c) IDENTITY | damped Newton step in n dimensions, from eq:newton-nd-taylor |
| `docs/theoryGuide.tex:9160` `eq:newton-nd-fd` | `ch:nrND` | (c) IDENTITY | central finite-difference Jacobian column (definition of the approximation) |

### `ch:lm` -- Parameter estimation: Levenberg-Marquardt

15 equations: CITED 2, DERIVED 0, IDENTITY 13, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:9464` | `ch:lm` | (c) IDENTITY | definition of the forward model T_pred(p) |
| `docs/theoryGuide.tex:9469` | `ch:lm` | (c) IDENTITY | definition of the residual r_i |
| `docs/theoryGuide.tex:9473` `eq:chi2` | `ch:lm` | (c) IDENTITY | definition of the least-squares objective chi^2 |
| `docs/theoryGuide.tex:9511` | `ch:lm` | (c) IDENTITY | gradient of chi^2 by the chain rule |
| `docs/theoryGuide.tex:9519` | `ch:lm` | (c) IDENTITY | definition of the residual Jacobian |
| `docs/theoryGuide.tex:9526` | `ch:lm` | (c) IDENTITY | gradient identity grad chi^2 = J^T r, from eqs 9511 and 9519 |
| `docs/theoryGuide.tex:9542` | `ch:lm` | (c) IDENTITY | second derivative of chi^2, differentiated in the text |
| `docs/theoryGuide.tex:9550` `eq:hessian-split` | `ch:lm` | (c) IDENTITY | Hessian split into first- and second-derivative terms (matrix form of eq. 9542) |
| `docs/theoryGuide.tex:9565` | `ch:lm` | (c) IDENTITY | Gauss-Newton approximation (drop the second-derivative term), stated as such |
| `docs/theoryGuide.tex:9584` `eq:normal-eq` | `ch:lm` | (c) IDENTITY | Gauss-Newton normal equations, derived in the text |
| `docs/theoryGuide.tex:9624` `eq:levenberg` | `ch:lm` | (a) CITED | [cite: same paragraph] \cite{Levenberg44} |
| `docs/theoryGuide.tex:9667` `eq:marquardt` | `ch:lm` | (a) CITED | [cite: same paragraph] \cite{Marquardt63} |
| `docs/theoryGuide.tex:9739` | `ch:lm` | (c) IDENTITY | central finite-difference Jacobian in the parameters |
| `docs/theoryGuide.tex:9745` | `ch:lm` | (c) IDENTITY | the engine's own relative step-size convention (declared) |
| `docs/theoryGuide.tex:9771` | `ch:lm` | (c) IDENTITY | the engine's own relative-improvement stopping criterion (declared) |

### `ch:wegstein` -- Wegstein acceleration

8 equations: CITED 1, DERIVED 0, IDENTITY 7, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:9945` `eq:fixed-point` | `ch:wegstein` | (c) IDENTITY | definition of a fixed-point problem |
| `docs/theoryGuide.tex:9961` `eq:direct-sub` | `ch:wegstein` | (c) IDENTITY | direct substitution (definition) |
| `docs/theoryGuide.tex:9974` | `ch:wegstein` | (c) IDENTITY | linear error recursion of direct substitution, derived in the text |
| `docs/theoryGuide.tex:10005` `eq:wegstein-slope` | `ch:wegstein` | (c) IDENTITY | secant slope through two iterates (definition) |
| `docs/theoryGuide.tex:10025` `eq:wegstein-raw` | `ch:wegstein` | (c) IDENTITY | fixed point of the secant-line model, solved in the text |
| `docs/theoryGuide.tex:10034` `eq:wegstein-q` | `ch:wegstein` | (c) IDENTITY | definition of the Wegstein coefficient q_k |
| `docs/theoryGuide.tex:10050` `eq:wegstein` | `ch:wegstein` | (a) CITED | [cite: subsection intro] Wegstein step; \cite{Wegstein} in the paragraph that opens the subsection (line 9996), and the formula is also derived in the text from the secant model |
| `docs/theoryGuide.tex:10221` `eq:wegstein-clip` | `ch:wegstein` | (c) IDENTITY | the engine's own q-clip convention (declared defaults) |

### `ch:newton-tears` -- Closing a recycle: Newton on the tear stream

6 equations: CITED 0, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:10362` | `ch:newton-tears` | (c) IDENTITY | definition of the sweep map G |
| `docs/theoryGuide.tex:10367` `eq:tear-residual` | `ch:newton-tears` | (c) IDENTITY | definition of the tear residual; \cite{Wegstein} in the same paragraph is for the fixed-point alternative |
| `docs/theoryGuide.tex:10462` `eq:tear-vars` | `ch:newton-tears` | (c) IDENTITY | definition of the tear variables |
| `docs/theoryGuide.tex:10478` | `ch:newton-tears` | (c) IDENTITY | Jacobian of the tear residual (identity) |
| `docs/theoryGuide.tex:10492` | `ch:newton-tears` | (c) IDENTITY | Newton linear system for the tear step |
| `docs/theoryGuide.tex:10527` `eq:tear-relative` | `ch:newton-tears` | (c) IDENTITY | the engine's own relative residual scaling (declared) |

### `ch:sqp` -- Constrained optimisation: line-search SQP

16 equations: CITED 10, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:11010` `eq:sqp-nlp` | `ch:sqp` | (c) IDENTITY | statement of the nonlinear program |
| `docs/theoryGuide.tex:11025` `eq:sqp-lagrangian` | `ch:sqp` | (c) IDENTITY | definition of the Lagrangian |
| `docs/theoryGuide.tex:11034` `eq:kkt-stat` | `ch:sqp` | (a) CITED | [cite: chapter intro] KKT conditions; \cite{NocedalWright,Powell1978} in the chapter's opening paragraph (line 11000) |
| `docs/theoryGuide.tex:11113` `eq:sensitivity` | `ch:sqp` | (c) IDENTITY | shadow-price sensitivity, argued in the text from stationarity (envelope theorem) |
| `docs/theoryGuide.tex:11208` `eq:sqp-qp` | `ch:sqp` | (a) CITED | [cite: chapter intro] SQP quadratic subproblem; \cite{NocedalWright,Powell1978} at line 11000 |
| `docs/theoryGuide.tex:11291` | `ch:sqp` | (c) IDENTITY | forward finite-difference gradient (definition of the approximation) |
| `docs/theoryGuide.tex:11312` `eq:bfgs-sy` | `ch:sqp` | (c) IDENTITY | definition of the BFGS curvature pair (s, y) |
| `docs/theoryGuide.tex:11330` `eq:powell-theta` | `ch:sqp` | (a) CITED | [cite: same paragraph] Powell's damped-BFGS theta; \cite{Powell1978} at line 11328 |
| `docs/theoryGuide.tex:11345` `eq:bfgs-update` | `ch:sqp` | (a) CITED | [cite: same paragraph] BFGS rank-two update with Powell's r; \cite{Powell1978} at line 11328 |
| `docs/theoryGuide.tex:11369` `eq:l1-merit` | `ch:sqp` | (a) CITED | [cite: same paragraph] \cite{NocedalWright} for the exact l1 merit function |
| `docs/theoryGuide.tex:11381` `eq:mu-rule` | `ch:sqp` | (a) CITED | [cite: same paragraph] penalty-parameter rule, continuation of the paragraph citing \cite{NocedalWright}; the safety factor 1.1 is the engine's own |
| `docs/theoryGuide.tex:11392` `eq:merit-deriv` | `ch:sqp` | (a) CITED | [cite: subsection intro] directional derivative of the l1 merit; \cite{NocedalWright} in the subsection's opening paragraph (line 11368) |
| `docs/theoryGuide.tex:11403` `eq:armijo` | `ch:sqp` | (a) CITED | [cite: subsection intro] Armijo sufficient-decrease condition; \cite{NocedalWright} at line 11368; Armijo named without a \cite; c1 = 1e-4 is the engine's own |
| `docs/theoryGuide.tex:11478` | `ch:sqp` | (c) IDENTITY | the engine's own five KKT residuals and tolerances (declared) |
| `docs/theoryGuide.tex:11510` `eq:eqqp-kkt` | `ch:sqp` | (a) CITED | [cite: same paragraph] \cite[Alg. 16.3]{NocedalWright} |
| `docs/theoryGuide.tex:11615` | `ch:sqp` | (a) CITED | [cite: same paragraph] HS35 test problem, \cite{HockSchittkowski} |

### `ch:rk4` -- Runge-Kutta 4 for the PFR

2 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:11674` | `ch:rk4` | (c) IDENTITY | steady PFR component balance as an ODE in reactor volume |
| `docs/theoryGuide.tex:11683` | `ch:rk4` | (d) UNSOURCED | classical fourth-order Runge-Kutta stages and weights, stated without derivation or \cite ("canonical"); a textbook scheme Vitor may prefer to mark as identity |

### `ch:viscosity` -- Viscosity

6 equations: CITED 5, DERIVED 0, IDENTITY 0, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:11969` `eq:andrade` | `ch:viscosity` | (a) CITED | [cite: same paragraph] \cite{Andrade1930} |
| `docs/theoryGuide.tex:11980` | `ch:viscosity` | (a) CITED | [cite: same paragraph] extended four-parameter Andrade / DIPPR form; \cite{ChemSep} at line 11985 (the form Choupo reads); "Reid recommends" without a \cite |
| `docs/theoryGuide.tex:12008` `eq:sutherland` | `ch:viscosity` | (d) UNSOURCED | Sutherland viscosity formula and the air constants (mu0, T0, S = 110.4 K); Sutherland named, no \cite; the section itself says it is NOT implemented |
| `docs/theoryGuide.tex:12035` `eq:chapman-enskog` | `ch:viscosity` | (a) CITED | [cite: same paragraph] Chapman-Enskog viscosity; \cite{RPP} (Table 9-2) and \cite{Neufeld1972} in the same paragraph, \cite{Svehla1962} in the next |
| `docs/theoryGuide.tex:12045` | `ch:viscosity` | (a) CITED | [cite: same paragraph] \cite{Neufeld1972} |
| `docs/theoryGuide.tex:12109` `eq:chung-viscosity` | `ch:viscosity` | (a) CITED | [cite: same paragraph] \cite{Chung1988} |

### `ch:thermal-cond` -- Thermal conductivity

4 equations: CITED 4, DERIVED 0, IDENTITY 0, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:12196` `eq:sato-riedel` | `ch:thermal-cond` | (a) CITED | [cite: same paragraph] Sato-Riedel; \cite{RPP} at line 12208 ("calibrated once across the Reid-Prausnitz-Poling reference set") |
| `docs/theoryGuide.tex:12226` `eq:chemsep-cond16` | `ch:thermal-cond` | (a) CITED | [cite: same paragraph] \cite{ChemSep} (chemsepEq16) |
| `docs/theoryGuide.tex:12267` `eq:eucken` | `ch:thermal-cond` | (a) CITED | [cite: same paragraph] \cite{Eucken1913} |
| `docs/theoryGuide.tex:12282` `eq:modified-eucken` | `ch:thermal-cond` | (a) CITED | [cite: same paragraph] modified Eucken in Svehla's form, \cite{Svehla1962}; \cite{ChapmanCowling1939} for the monatomic limit |

### `ch:diffusivity` -- Diffusivity

3 equations: CITED 2, DERIVED 0, IDENTITY 0, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:12344` `eq:fuller` | `ch:diffusivity` | (a) CITED | [cite: chapter intro] Fuller-Schettler-Giddings; \cite{Fuller1966} in the chapter's opening box (line 12336); the atomic diffusion volumes are attributed to "Reid 11-1" without a \cite |
| `docs/theoryGuide.tex:12363` `eq:wilke-chang` | `ch:diffusivity` | (a) CITED | [cite: chapter intro] Wilke-Chang; \cite{RPP} at line 12337 |
| `docs/theoryGuide.tex:12391` `eq:vignes` | `ch:diffusivity` | (d) UNSOURCED | Vignes logarithmic interpolation; "Vignes" named, no \cite and no \bibitem |

### `ch:mixture-rules` -- Mixture rules

4 equations: CITED 4, DERIVED 0, IDENTITY 0, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:12441` `eq:wilke-rule` | `ch:mixture-rules` | (a) CITED | [cite: same paragraph] Wilke mixing rule; \cite{Wilke1950} at line 12451 and \cite{RPP} in the chapter's opening box |
| `docs/theoryGuide.tex:12458` `eq:liq-visc-mix` | `ch:mixture-rules` | (a) CITED | [cite: chapter intro] log-mole-fraction liquid viscosity average; \cite{RPP} at line 12432 names this rule explicitly; Arrhenius rule / Grunberg-Nissan named without a \cite |
| `docs/theoryGuide.tex:12472` `eq:liq-kappa-mix` | `ch:mixture-rules` | (a) CITED | [cite: chapter intro] mass-fraction liquid conductivity average; \cite{RPP} at line 12432 names this rule explicitly; Filippov named without a \cite |
| `docs/theoryGuide.tex:12486` | `ch:mixture-rules` | (a) CITED | [cite: same paragraph] \cite{Wassiljewa1904,MasonSaxena1958} |

### `ch:balances` -- Balances: mass, elements, energy

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:13028` | `ch:balances` | (c) IDENTITY | plant-boundary element balance (atom conservation) |

### `ch:phase-changer` -- Phase changer: the dome-crossing boiler / condenser

7 equations: CITED 0, DERIVED 0, IDENTITY 7, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:13528` `eq:pc-tsat` | `ch:phase-changer` | (c) IDENTITY | saturation temperature as the inversion of the dominant component's Psat (definition) |
| `docs/theoryGuide.tex:13551` `eq:pc-Hstream` | `ch:phase-changer` | (c) IDENTITY | lever-rule enthalpy of a two-phase stream |
| `docs/theoryGuide.tex:13565` `eq:pc-hfhg` | `ch:phase-changer` | (c) IDENTITY | the engine's own epsilon-step linear extrapolation to h_f, h_g (algebra) |
| `docs/theoryGuide.tex:13577` `eq:pc-Htarget` | `ch:phase-changer` | (c) IDENTITY | target outlet enthalpy from the energy balance |
| `docs/theoryGuide.tex:13585` `eq:pc-lever` | `ch:phase-changer` | (c) IDENTITY | lever rule for the outlet vapor fraction |
| `docs/theoryGuide.tex:13600` `eq:pc-duty` | `ch:phase-changer` | (c) IDENTITY | duty from the energy balance |
| `docs/theoryGuide.tex:13610` `eq:pc-latent` | `ch:phase-changer` | (c) IDENTITY | definition of the latent/sensible split of the duty |

### `ch:cstr` -- Continuous stirred-tank reactor (CSTR)

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:13683` | `ch:cstr` | (c) IDENTITY | steady CSTR component balance with a single reaction |
| `docs/theoryGuide.tex:13691` `eq:cstr` | `ch:cstr` | (c) IDENTITY | CSTR residual in the extent xi, derived from eq. 13683 |
| `docs/theoryGuide.tex:13744` | `ch:cstr` | (c) IDENTITY | analytic first-order CSTR conversion X = Da/(1 + Da), from the balance |

### `ch:lhhw` -- The rate law: from mass action to

3 equations: CITED 2, DERIVED 1, IDENTITY 0, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:13800` `eq:langmuir-coverage` | `ch:lhhw` | (a) CITED | [cite: same subsection] Langmuir site coverages, derived in the text from adsorption equilibrium; \cite{Langmuir1918,Hinshelwood1940,HougenWatson1943} is attached to eq:lhhw-canonical two paragraphs below |
| `docs/theoryGuide.tex:13811` `eq:lhhw-canonical` | `ch:lhhw` | (a) CITED | [cite: same paragraph] LHHW canonical form; \cite{Langmuir1918,Hinshelwood1940,HougenWatson1943} in the sentence that names the equation (line 13823) |
| `docs/theoryGuide.tex:13840` `eq:ratelaw` | `ch:lhhw` | (b) DERIVED | the engine's one generalized rate law; its settings recover eq:lhhw-canonical (cited) and mass action, as the text shows |

### `ch:pfr` -- Plug-flow reactor (PFR)

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:13955` `eq:pfr-balance` | `ch:pfr` | (c) IDENTITY | PFR differential component balance (shell balance) |
| `docs/theoryGuide.tex:13997` | `ch:pfr` | (c) IDENTITY | first-order PFR ODE for the limiting reactant |
| `docs/theoryGuide.tex:14001` `eq:pfr-X-firstorder` | `ch:pfr` | (c) IDENTITY | first-order PFR conversion X = 1 - exp(-k tau), integration of eq. 13997 |

### `ch:thiele` -- The catalyst pellet: the Thiele modulus and the effectiveness

10 equations: CITED 3, DERIVED 2, IDENTITY 5, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:14112` `eq:pellet-balance` | `ch:thiele` | (c) IDENTITY | first-order reaction-diffusion shell balance in a pellet |
| `docs/theoryGuide.tex:14143` `eq:pellet-dimensionless` | `ch:thiele` | (c) IDENTITY | non-dimensionalized pellet equation, from eq:pellet-balance |
| `docs/theoryGuide.tex:14155` `eq:thiele-char` | `ch:thiele` | (a) CITED | [cite: same paragraph] Thiele modulus, \cite{Thiele1939} at line 14160 |
| `docs/theoryGuide.tex:14183` `eq:eta-definition` | `ch:thiele` | (c) IDENTITY | definition of the effectiveness factor |
| `docs/theoryGuide.tex:14194` `eq:eta-slab` | `ch:thiele` | (b) DERIVED | closed-form solutions of the linear pellet equation for slab, cylinder and sphere; the equation they solve is the Thiele problem (\cite{Thiele1939}, eq:thiele-char) |
| `docs/theoryGuide.tex:14218` `eq:eta-flux` | `ch:thiele` | (c) IDENTITY | flux form of the effectiveness factor (surface gradient), an identity for a solution of eq:pellet-dimensionless |
| `docs/theoryGuide.tex:14234` `eq:thiele-generalised` | `ch:thiele` | (a) CITED | [cite: same paragraph] generalized modulus on the volume-to-surface length, \cite{Aris1957} |
| `docs/theoryGuide.tex:14270` `eq:eta-asymptotes` | `ch:thiele` | (b) DERIVED | small- and large-modulus asymptotes of eq:eta-sphere |
| `docs/theoryGuide.tex:14306` `eq:eta-multiplies` | `ch:thiele` | (c) IDENTITY | definition of the observed rate r_obs = eta r |
| `docs/theoryGuide.tex:14327` `eq:weisz-prater` | `ch:thiele` | (a) CITED | [cite: same paragraph] \cite{WeiszPrater1954} |

### `ch:evap-mode2` -- Single-effect evaporator: the credo case study

4 equations: CITED 0, DERIVED 0, IDENTITY 4, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:14512` `eq:evap-Q-chest` | `ch:evap-mode2` | (c) IDENTITY | chest duty as the latent heat of the condensing steam (energy balance) |
| `docs/theoryGuide.tex:14520` `eq:evap-dT` | `ch:evap-mode2` | (c) IDENTITY | Q = U A dT and T_boil = T_steam - dT (definition of the overall coefficient U) |
| `docs/theoryGuide.tex:14533` `eq:evap-energy` | `ch:evap-mode2` | (c) IDENTITY | process-side energy balance of the evaporator |
| `docs/theoryGuide.tex:14595` `eq:evap-Tboil-BPE` | `ch:evap-mode2` | (c) IDENTITY | boiling-point elevation dT_b = K_b m (dilute-solution colligative relation; K_b is a record datum) |

### `ch:lle-gibbs` -- Liquid-liquid equilibrium by Gibbs minimization

9 equations: CITED 5, DERIVED 0, IDENTITY 4, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:14869` `eq:tpd-def` | `ch:lle-gibbs` | (a) CITED | [cite: subsection intro] tangent-plane distance; \cite{Michelsen} in the subsection's opening box (line 14852); Baker-Pierce-Luks named without a \cite |
| `docs/theoryGuide.tex:14959` `eq:tpd-stationary` | `ch:lle-gibbs` | (a) CITED | [cite: subsection intro] stationarity condition of tpd; \cite{Michelsen} at line 14852 |
| `docs/theoryGuide.tex:14971` `eq:tpd-fixedpoint` | `ch:lle-gibbs` | (a) CITED | [cite: subsection intro] Michelsen's unnormalized-Y fixed point; \cite{Michelsen} at line 14852 |
| `docs/theoryGuide.tex:14979` `eq:tpd-ss` | `ch:lle-gibbs` | (a) CITED | [cite: subsection intro] Michelsen's successive-substitution probe; \cite{Michelsen} at line 14852 |
| `docs/theoryGuide.tex:14990` `eq:tpd-tm` | `ch:lle-gibbs` | (a) CITED | [cite: subsection intro] tm at a stationary point ("Michelsen shows"); \cite{Michelsen} at line 14852 |
| `docs/theoryGuide.tex:15001` `eq:tpd-decision` | `ch:lle-gibbs` | (c) IDENTITY | the engine's own instability threshold tm_tol (declared default) |
| `docs/theoryGuide.tex:15491` `eq:hn-mixing` | `ch:lle-gibbs` | (c) IDENTITY | lever rule / mixing balance on the ternary diagram |
| `docs/theoryGuide.tex:15507` `eq:hn-overall` | `ch:lle-gibbs` | (c) IDENTITY | overall material balance of the extraction column |
| `docs/theoryGuide.tex:15523` `eq:hn-delta` | `ch:lle-gibbs` | (c) IDENTITY | difference-point (net-flow) material balance; the construction is attributed to "Hunter and Nash" in prose with no \cite |

### `ch:extractor` -- Counter-current liquid--liquid extraction

6 equations: CITED 0, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:15692` `eq:extractor-inlet` | `ch:extractor` | (c) IDENTITY | stage inlet balance of the counter-current cascade |
| `docs/theoryGuide.tex:15712` `eq:extractor-stage` | `ch:extractor` | (c) IDENTITY | stage equilibrium as one Gibbs-minimization flash (definition) |
| `docs/theoryGuide.tex:15726` | `ch:extractor` | (c) IDENTITY | extract/raffinate labelling rule (definition) |
| `docs/theoryGuide.tex:15758` | `ch:extractor` | (c) IDENTITY | the engine's own under-relaxed Gauss-Seidel update |
| `docs/theoryGuide.tex:15781` `eq:extractor-closure` | `ch:extractor` | (c) IDENTITY | the engine's own column-closure convergence metric (definition) |
| `docs/theoryGuide.tex:15804` | `ch:extractor` | (c) IDENTITY | definitions of the products, the recovery and the distribution ratio |

### `ch:conversion-reactor` -- Stoichiometric conversion reactor

5 equations: CITED 0, DERIVED 0, IDENTITY 5, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:15907` `eq:conv-def` | `ch:conversion-reactor` | (c) IDENTITY | definition of conversion |
| `docs/theoryGuide.tex:15917` `eq:conv-extent` | `ch:conversion-reactor` | (c) IDENTITY | extent from conversion (stoichiometry) |
| `docs/theoryGuide.tex:15933` `eq:conv-outlet` | `ch:conversion-reactor` | (c) IDENTITY | stoichiometric outlet balance |
| `docs/theoryGuide.tex:15990` `eq:conv-dhrxn` | `ch:conversion-reactor` | (c) IDENTITY | heat of reaction on the formation datum |
| `docs/theoryGuide.tex:15997` `eq:conv-duty` | `ch:conversion-reactor` | (c) IDENTITY | isothermal duty Q = xi dH_rxn (energy balance) |

### `ch:gibbs-reactor` -- Gibbs reactor: equilibrium by free-energy minimization

11 equations: CITED 0, DERIVED 0, IDENTITY 11, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:16198` `eq:gibbs-problem` | `ch:gibbs-reactor` | (c) IDENTITY | constrained Gibbs minimization problem (statement) |
| `docs/theoryGuide.tex:16264` `eq:gibbs-mu` | `ch:gibbs-reactor` | (c) IDENTITY | ideal-gas chemical potential (from ch:fugacity) |
| `docs/theoryGuide.tex:16282` | `ch:gibbs-reactor` | (c) IDENTITY | Lagrangian of the element-constrained minimization |
| `docs/theoryGuide.tex:16290` `eq:gibbs-stationarity` | `ch:gibbs-reactor` | (c) IDENTITY | stationarity condition |
| `docs/theoryGuide.tex:16297` | `ch:gibbs-reactor` | (c) IDENTITY | stationarity divided by RT, definition of the element potentials pi_j |
| `docs/theoryGuide.tex:16305` `eq:gibbs-ni` | `ch:gibbs-reactor` | (c) IDENTITY | mole numbers from the element potentials, derived from eq. 16297 |
| `docs/theoryGuide.tex:16331` | `ch:gibbs-reactor` | (c) IDENTITY | definition of the iteration variables |
| `docs/theoryGuide.tex:16337` `eq:gibbs-fj` | `ch:gibbs-reactor` | (c) IDENTITY | element-balance and total-mole residuals |
| `docs/theoryGuide.tex:16367` | `ch:gibbs-reactor` | (c) IDENTITY | the engine's own least-squares seed system for pi |
| `docs/theoryGuide.tex:16374` | `ch:gibbs-reactor` | (c) IDENTITY | normal equations of the seed system |
| `docs/theoryGuide.tex:16440` | `ch:gibbs-reactor` | (c) IDENTITY | definition of the equilibrium constant from the converged mole fractions (worked example); "Smith-Van Ness-Abbott Table 13.2" named without a \cite for the tabulated comparison value |

### `ch:distillation` -- Distillation column, Wang-Henke bubble-point

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:16654` | `ch:distillation` | (c) IDENTITY | constant-molar-overflow internal flows (the CMO assumption, stated) |

### `ch:absorber` -- Gas absorption and stripping: the coupled stage

3 equations: CITED 1, DERIVED 0, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:16914` `eq:abs-factor` | `ch:absorber` | (a) CITED | [cite: chapter intro] absorption factor A = L/(KV); \cite{HenleySeader} in the chapter's opening box (line 16842) |
| `docs/theoryGuide.tex:16994` | `ch:absorber` | (c) IDENTITY | a qualitative feedback chain (absorb -> heat -> T -> K -> A) set in an equation environment; no numerical claim |
| `docs/theoryGuide.tex:17028` | `ch:absorber` | (c) IDENTITY | definition of the stripping factor S = 1/A |

### `ch:crystalliser` -- Crystallisation: the population balance and the method of

27 equations: CITED 3, DERIVED 5, IDENTITY 16, UNSOURCED 3.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:17069` | `ch:crystalliser` | (c) IDENTITY | definition of supersaturation |
| `docs/theoryGuide.tex:17081` `eq:cryst-equilibrium` | `ch:crystalliser` | (c) IDENTITY | equilibrium (S = 1) solute balance |
| `docs/theoryGuide.tex:17111` `eq:ksp` | `ch:crystalliser` | (c) IDENTITY | definition of the solubility product as the solid-liquid equilibrium condition |
| `docs/theoryGuide.tex:17137` | `ch:crystalliser` | (c) IDENTITY | the engine's own anchoring of K_sp to one measured solubility (declared rule) |
| `docs/theoryGuide.tex:17144` `eq:msat-solve` | `ch:crystalliser` | (c) IDENTITY | saturation molality from the K_sp condition (eq:ksp rearranged) |
| `docs/theoryGuide.tex:17182` `eq:ksp-vanthoff` | `ch:crystalliser` | (c) IDENTITY | van't Hoff on K_sp |
| `docs/theoryGuide.tex:17210` `eq:dHdiff` | `ch:crystalliser` | (c) IDENTITY | differential heat of solution as the partial-molar relative enthalpy (thermodynamic identity) |
| `docs/theoryGuide.tex:17245` `eq:lphi-gh` | `ch:crystalliser` | (c) IDENTITY | Gibbs-Helmholtz for the relative apparent molar enthalpy |
| `docs/theoryGuide.tex:17264` `eq:silvester-slots` | `ch:crystalliser` | (a) CITED | [cite: same paragraph] \cite{SilvesterPitzer1977} |
| `docs/theoryGuide.tex:17361` `eq:pbe` | `ch:crystalliser` | (a) CITED | [cite: same paragraph] population balance equation, \cite{RandolphLarson} |
| `docs/theoryGuide.tex:17394` `eq:msmpr-n` | `ch:crystalliser` | (b) DERIVED | MSMPR exponential, from eq:pbe (\cite{RandolphLarson}) under the stated MSMPR assumptions |
| `docs/theoryGuide.tex:17465` | `ch:crystalliser` | (c) IDENTITY | definition of the moments of n(L) |
| `docs/theoryGuide.tex:17470` `eq:moments` | `ch:crystalliser` | (a) CITED | [cite: same paragraph] MSMPR moments, \cite{HulburtKatz} |
| `docs/theoryGuide.tex:17491` | `ch:crystalliser` | (b) DERIVED | mean sizes L10, L43, Ld from the MSMPR moments (eq:moments) |
| `docs/theoryGuide.tex:17499` `eq:magma` | `ch:crystalliser` | (c) IDENTITY | definition of the magma density from the third moment |
| `docs/theoryGuide.tex:17507` `eq:cv` | `ch:crystalliser` | (b) DERIVED | coefficient of variation from the MSMPR moments (eq:moments) |
| `docs/theoryGuide.tex:17527` | `ch:crystalliser` | (d) UNSOURCED | growth and nucleation power laws G = k_g (S-1)^g, B0 = k_b (S-1)^b M_T^j, called "the standard data-anchored forms" with no \cite in this paragraph (\cite{RandolphLarson} is attached to the PBE two subsections up, not to these kinetic forms) |
| `docs/theoryGuide.tex:17534` | `ch:crystalliser` | (d) UNSOURCED | closure of mu_3 in S, derived in text from eq:moments and the kinetic power laws of line 17527, which are themselves unsourced |
| `docs/theoryGuide.tex:17541` `eq:cryst-closure` | `ch:crystalliser` | (c) IDENTITY | steady solute mass balance closing S |
| `docs/theoryGuide.tex:17592` `eq:moment-odes` | `ch:crystalliser` | (b) DERIVED | moment ODEs of the batch crystallizer, from eq:pbe (\cite{RandolphLarson}) |
| `docs/theoryGuide.tex:17602` | `ch:crystalliser` | (c) IDENTITY | solute balance coupled to the third moment |
| `docs/theoryGuide.tex:17677` | `ch:crystalliser` | (d) UNSOURCED | size-dependent growth law G = G0 (1 + alpha L), a declared model form with a case parameter; no author, no \cite |
| `docs/theoryGuide.tex:17685` | `ch:crystalliser` | (b) DERIVED | moment equation under size-dependent growth, from eq:pbe |
| `docs/theoryGuide.tex:17695` | `ch:crystalliser` | (c) IDENTITY | size-grid definition of the finite-volume scheme |
| `docs/theoryGuide.tex:17702` | `ch:crystalliser` | (c) IDENTITY | steady MSMPR population balance for arbitrary G(L), from eq:pbe |
| `docs/theoryGuide.tex:17707` | `ch:crystalliser` | (c) IDENTITY | the engine's own first-order upwind recurrence |
| `docs/theoryGuide.tex:17713` | `ch:crystalliser` | (c) IDENTITY | moments by quadrature on the grid |

### `ch:membrane` -- Spiral-wound membrane: solution-diffusion and concentration

16 equations: CITED 6, DERIVED 3, IDENTITY 7, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:17792` `eq:sd-water` | `ch:membrane` | (a) CITED | [cite: same paragraph] solution-diffusion water flux, \cite{WijmansBaker} at line 17787 |
| `docs/theoryGuide.tex:17799` `eq:sd-solute` | `ch:membrane` | (a) CITED | [cite: same paragraph] solution-diffusion solute flux, \cite{WijmansBaker} at line 17787 |
| `docs/theoryGuide.tex:17813` `eq:cp` | `ch:membrane` | (b) DERIVED | permeate concentration from eq:sd-solute and c_p = J_s/J_w |
| `docs/theoryGuide.tex:17836` | `ch:membrane` | (a) CITED | [cite: same paragraph] A_w in terms of D, K, c, V, l; \cite{WijmansBaker} at line 17827 |
| `docs/theoryGuide.tex:17923` `eq:film` | `ch:membrane` | (c) IDENTITY | film-theory balance integrated across the film (convection = back-diffusion + permeation), derived in text; no author named or cited |
| `docs/theoryGuide.tex:17934` `eq:cm-closed` | `ch:membrane` | (b) DERIVED | algebraic elimination of c_p between eq:cp (from \cite{WijmansBaker}) and eq:film |
| `docs/theoryGuide.tex:17962` `eq:polar-interface` | `ch:membrane` | (a) CITED | [cite: subsection intro] Geraldes & Afonso 2007 interface flux ("Eq. 1 of the paper"), \cite{GeraldesAfonso2007} at line 17953 |
| `docs/theoryGuide.tex:17970` `eq:polar-electroneutral` | `ch:membrane` | (c) IDENTITY | electroneutrality at the wall (also the paper's Eq. 8) |
| `docs/theoryGuide.tex:17978` `eq:polar-xi-2006` | `ch:membrane` | (a) CITED | [cite: same paragraph] suction correction, \cite{GeraldesAfonso2006} at line 17986; the second line is the film theory's own factor |
| `docs/theoryGuide.tex:17996` `eq:polar-explicit` | `ch:membrane` | (b) DERIVED | rearrangement of eq:polar-interface for C_i,m at fixed xi' |
| `docs/theoryGuide.tex:18027` `eq:polar-single-salt` | `ch:membrane` | (a) CITED | [cite: same subsection] single-salt closed form ("the paper's Eq. 20"), \cite{GeraldesAfonso2007} at line 17953 |
| `docs/theoryGuide.tex:18117` | `ch:membrane` | (c) IDENTITY | definition of the osmotic pressure difference across the two faces (the osmotic model itself is selected elsewhere) |
| `docs/theoryGuide.tex:18123` | `ch:membrane` | (c) IDENTITY | the engine's own Newton residual, a rearrangement of eq:sd-water |
| `docs/theoryGuide.tex:18150` | `ch:membrane` | (c) IDENTITY | definitions of recovery and observed rejection |
| `docs/theoryGuide.tex:18217` `eq:module-faces` | `ch:membrane` | (c) IDENTITY | channel geometry of a spiral leaf (two faces) and a flat cell (one face) |
| `docs/theoryGuide.tex:18302` | `ch:membrane` | (c) IDENTITY | solution of the constant-volume solute balance under constant R (the assumption is named in text); no author cited |

### `ch:dspmde` -- Nanofiltration with charge: the Donnan-Steric Pore Model with

8 equations: CITED 5, DERIVED 1, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:18403` `eq:dspmde-partition` | `ch:dspmde` | (a) CITED | [cite: chapter intro] DSPM-DE partition (Bowen & Welfoot Eq. 7 named in text), \cite{BowenMohammadHilal1997,BowenWelfoot2002} at line 18380 |
| `docs/theoryGuide.tex:18417` `eq:dspmde-steric` | `ch:dspmde` | (a) CITED | [cite: chapter intro] steric partition (1-lambda)^2, same chapter citation at line 18380 |
| `docs/theoryGuide.tex:18429` `eq:dspmde-electroneutral` | `ch:dspmde` | (c) IDENTITY | pore electroneutrality with the fixed charge |
| `docs/theoryGuide.tex:18449` `eq:dspmde-born` | `ch:dspmde` | (a) CITED | [cite: chapter intro] Born solvation energy (Bowen & Welfoot Eq. 16 named in text), same chapter citation at line 18380 |
| `docs/theoryGuide.tex:18467` `eq:dspmde-enp` | `ch:dspmde` | (a) CITED | [cite: chapter intro] extended Nernst-Planck in the pore (Bowen & Welfoot Eq. 5 named in text), same chapter citation at line 18380 |
| `docs/theoryGuide.tex:18478` `eq:dspmde-Kd` | `ch:dspmde` | (a) CITED | [cite: same paragraph] hindrance factors, Deen's forms \cite{Deen1987} "as fitted by Bowen & Welfoot (Eqs. 14-15)" |
| `docs/theoryGuide.tex:18491` `eq:dspmde-current` | `ch:dspmde` | (c) IDENTITY | zero net current in the pore |
| `docs/theoryGuide.tex:18499` `eq:dspmde-transmission` | `ch:dspmde` | (b) DERIVED | transmission integrated from eq:dspmde-enp (CITED, chapter intro) with the zero-current condition |

### `ch:sdem` -- Nanofiltration without a fixed charge: solution-diffusion with

6 equations: CITED 1, DERIVED 4, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:18652` `eq:sdem-np` | `ch:sdem` | (a) CITED | [cite: same paragraph] Nernst-Planck on virtual concentrations, \cite{Yaroshchuk2013} at line 18650 |
| `docs/theoryGuide.tex:18658` `eq:sdem-constraints` | `ch:sdem` | (c) IDENTITY | virtual-solution electroneutrality and zero current (constraints) |
| `docs/theoryGuide.tex:18664` `eq:sdem-field` | `ch:sdem` | (b) DERIVED | the field, from eq:sdem-np and eq:sdem-constraints (derived in the text) |
| `docs/theoryGuide.tex:18706` `eq:sdem-ambipolar` | `ch:sdem` | (b) DERIVED | ambipolar single-salt permeance, derived in the text from eq:sdem-field and eq:sdem-np |
| `docs/theoryGuide.tex:18714` `eq:sdem-single` | `ch:sdem` | (b) DERIVED | single-salt permeate concentration and rejection, from eq:sdem-ambipolar |
| `docs/theoryGuide.tex:18723` `eq:sdem-psi` | `ch:sdem` | (b) DERIVED | single-salt potential drop, integration of eq:sdem-field over the linear profile |

### `ch:electrodialysis` -- Electrodialysis: Faraday transfer, the Nernst stack, and the

18 equations: CITED 12, DERIVED 1, IDENTITY 5, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:18959` `eq:ed-faraday` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] Faraday's law with current efficiency; \cite{BardFaulkner2001} in the same paragraph (for Faraday's constant) |
| `docs/theoryGuide.tex:19005` `eq:ed-nernst` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] Nernst membrane potential, \cite{Strathmann2004} |
| `docs/theoryGuide.tex:19017` `eq:ed-davies` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] Davies equation, \cite{Davies1962} at line 19026 |
| `docs/theoryGuide.tex:19032` `eq:ed-emem` | `ch:electrodialysis` | (c) IDENTITY | sum of the two membrane potentials of a cell pair |
| `docs/theoryGuide.tex:19052` `eq:ed-kappa` | `ch:electrodialysis` | (c) IDENTITY | solution resistance, conductivity as a sum of ionic conductances, Nernst-Einstein relation for lambda_i (definitions and a standard relation); \cite{Nightingale1959} in the same paragraph is for the D0 data |
| `docs/theoryGuide.tex:19068` `eq:ed-rpair` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] series resistance of a cell pair, \cite{Strathmann2004} at line 19066 |
| `docs/theoryGuide.tex:19082` `eq:ed-voltage` | `ch:electrodialysis` | (c) IDENTITY | stack voltage as the sum over cell pairs plus electrodes, and P = UI |
| `docs/theoryGuide.tex:19124` `eq:ed-ilim` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] classical single-salt limiting current; \cite{CowanBrown1959} in the key-idea box the equation continues from (line 19109) |
| `docs/theoryGuide.tex:19152` `eq:ga-film` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] film thickness delta = D/k; \cite{GeraldesAfonso2010} in the subsection's opening box (line 19144) |
| `docs/theoryGuide.tex:19162` `eq:ga-np` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] Nernst-Planck in the film with electroneutrality; \cite{GeraldesAfonso2010} at line 19144 |
| `docs/theoryGuide.tex:19183` `eq:ga-tcem` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] limiting transport numbers (paper's Eqs 12/13); \cite{GeraldesAfonso2010} at line 19144 |
| `docs/theoryGuide.tex:19196` `eq:ga-ilim` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] multi-ionic limiting current (paper's Eq. 15); \cite{GeraldesAfonso2010} at line 19144 |
| `docs/theoryGuide.tex:19225` `eq:ga-deff` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] effective diffusivity (paper's Appendix A); \cite{GeraldesAfonso2010} at line 19144; Nernst-Hartley named without a \cite |
| `docs/theoryGuide.tex:19247` `eq:ga-eq16` | `ch:electrodialysis` | (a) CITED | [cite: subsection intro] single-salt reduction (paper's Eq. 16); \cite{GeraldesAfonso2010} at line 19144 |
| `docs/theoryGuide.tex:19280` `eq:ga-sh` | `ch:electrodialysis` | (a) CITED | [cite: same paragraph] Sherwood correlation form and the shipped 0.29 Re^0.5 Sc^0.33 fit, \cite{GeraldesAfonso2010} at line 19294 |
| `docs/theoryGuide.tex:19396` `eq:ed-ilim-proportional` | `ch:electrodialysis` | (b) DERIVED | i_lim proportional to c(t) for a single salt, from eq:ga-ilim with constant k and D_eff |
| `docs/theoryGuide.tex:19410` `eq:ed-batch-linear` | `ch:electrodialysis` | (c) IDENTITY | Faraday's law integrated at constant current (from eq:ed-faraday) |
| `docs/theoryGuide.tex:19420` `eq:ed-plateau` | `ch:electrodialysis` | (c) IDENTITY | the engine's own opt-in over-limiting regime model xi_eff = xi min(1, i_lim/i), declared as a model of a regime with no parameter |

### `ch:ion-exchange` -- Ion-exchange softening: Gaines--Thomas mass

8 equations: CITED 2, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:19579` `eq:ix-massaction` | `ch:ion-exchange` | (c) IDENTITY | ion-exchange mass action (definition of the selectivity constant); \cite{Parkhurst2013} in the same paragraph is for the network catalogue |
| `docs/theoryGuide.tex:19596` `eq:ix-logk` | `ch:ion-exchange` | (a) CITED | [cite: same paragraph] representative log K values of the catalogue, \cite{Parkhurst2013} (PHREEQC EXCHANGE_SPECIES) |
| `docs/theoryGuide.tex:19618` `eq:gt-beta` | `ch:ion-exchange` | (a) CITED | [cite: same paragraph] Gaines-Thomas equivalent-fraction convention, \cite{GainesThomas1953} |
| `docs/theoryGuide.tex:19628` `eq:cec-def` | `ch:ion-exchange` | (c) IDENTITY | definition of the cation-exchange capacity |
| `docs/theoryGuide.tex:19665` `eq:ix-cec-residual` | `ch:ion-exchange` | (c) IDENTITY | CEC capacity residual |
| `docs/theoryGuide.tex:19673` `eq:ix-lnm` | `ch:ion-exchange` | (c) IDENTITY | log form of the exchange mass action with the CEC constant folded |
| `docs/theoryGuide.tex:19705` `eq:hardness` | `ch:ion-exchange` | (c) IDENTITY | definition of hardness as CaCO3 (convention) |
| `docs/theoryGuide.tex:19720` `eq:salt-penalty` | `ch:ion-exchange` | (c) IDENTITY | salt penalty from charge conservation |

### `ch:adsorption` -- Adsorption: isotherms, LDF uptake, and the fixed

9 equations: CITED 1, DERIVED 0, IDENTITY 6, UNSOURCED 2.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:19821` `eq:ads-henry` | `ch:adsorption` | (c) IDENTITY | Henry limit of an isotherm (definition) |
| `docs/theoryGuide.tex:19829` `eq:langmuir` | `ch:adsorption` | (a) CITED | [cite: same paragraph] Langmuir isotherm, \cite{Langmuir1918} |
| `docs/theoryGuide.tex:19839` `eq:vant-hoff-b` | `ch:adsorption` | (c) IDENTITY | van't Hoff temperature dependence of the Langmuir affinity |
| `docs/theoryGuide.tex:19866` `eq:ext-langmuir` | `ch:adsorption` | (d) UNSOURCED | extended (competitive) Langmuir mixing rule, "the workhorse teaching model", no \cite (\cite{Langmuir1918} two paragraphs up covers the pure isotherm only) |
| `docs/theoryGuide.tex:19892` `eq:ldf` | `ch:adsorption` | (d) UNSOURCED | linear driving force rate model; "Glueckauf's classic estimate" named in prose, no \cite and no \bibitem |
| `docs/theoryGuide.tex:19907` `eq:ldf-linear` | `ch:adsorption` | (c) IDENTITY | analytic solution of the linear LDF + Henry closed-vessel system (mathematics of eq:ldf) |
| `docs/theoryGuide.tex:19923` `eq:bed-fv` | `ch:adsorption` | (c) IDENTITY | conservative finite-volume species balance of the bed; "Danckwerts" boundary conditions named without a \cite |
| `docs/theoryGuide.tex:19967` `eq:t-stoich` | `ch:adsorption` | (c) IDENTITY | stoichiometric time from the overall bed mass balance |
| `docs/theoryGuide.tex:19984` `eq:integral-anchor` | `ch:adsorption` | (c) IDENTITY | integral identity of the conservative scheme (telescoped eq:bed-fv) |

### `ch:rotating` -- Rotating equipment: compressors, turbines, pumps

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:20070` | `ch:rotating` | (c) IDENTITY | definition of isentropic efficiency for compressor and turbine |
| `docs/theoryGuide.tex:20090` | `ch:rotating` | (c) IDENTITY | residual of the outer Newton on P_out (definition) |
| `docs/theoryGuide.tex:20117` | `ch:rotating` | (c) IDENTITY | incompressible pump work relation dP = eta W/(n v) |

### `ch:hydraulics-pressure` -- Pipe pressure drop: Darcy--Weisbach and the friction

13 equations: CITED 4, DERIVED 0, IDENTITY 7, UNSOURCED 2.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:20186` | `ch:hydraulics-pressure` | (c) IDENTITY | steady mechanical-energy (engineering Bernoulli) balance |
| `docs/theoryGuide.tex:20195` `eq:pipe-mech` | `ch:hydraulics-pressure` | (c) IDENTITY | pressure drop as dissipation plus static head, from eq. 20186 |
| `docs/theoryGuide.tex:20228` `eq:darcy` | `ch:hydraulics-pressure` | (a) CITED | [cite: same paragraph] Darcy-Weisbach, \cite{Weisbach1845} at line 20234 |
| `docs/theoryGuide.tex:20236` | `ch:hydraulics-pressure` | (c) IDENTITY | definitions of area, velocity, volumetric flow and Reynolds number |
| `docs/theoryGuide.tex:20254` `eq:lam` | `ch:hydraulics-pressure` | (c) IDENTITY | laminar friction factor 64/Re (Hagen-Poiseuille, exact; named in prose without a \cite) |
| `docs/theoryGuide.tex:20265` `eq:colebrook` | `ch:hydraulics-pressure` | (a) CITED | [cite: same paragraph] Colebrook-White, \cite{Colebrook1939}; Nikuradse named without a \cite |
| `docs/theoryGuide.tex:20275` | `ch:hydraulics-pressure` | (c) IDENTITY | fixed-point rearrangement of eq:colebrook (the engine's own iteration) |
| `docs/theoryGuide.tex:20286` `eq:haaland` | `ch:hydraulics-pressure` | (a) CITED | [cite: same paragraph] Haaland, \cite{Haaland1983} |
| `docs/theoryGuide.tex:20302` `eq:churchill` | `ch:hydraulics-pressure` | (a) CITED | [cite: same paragraph] Churchill, \cite{Churchill1977} |
| `docs/theoryGuide.tex:20327` `eq:pipe-total` | `ch:hydraulics-pressure` | (c) IDENTITY | assembled pressure drop from eq:darcy plus minor-loss coefficients (definition of K) |
| `docs/theoryGuide.tex:20416` | `ch:hydraulics-pressure` | (d) UNSOURCED | homogeneous two-phase density and viscosity (McAdams named for the viscosity, no \cite anywhere in the subsection for it) |
| `docs/theoryGuide.tex:20429` | `ch:hydraulics-pressure` | (c) IDENTITY | definition of the Martinelli parameter X |
| `docs/theoryGuide.tex:20434` | `ch:hydraulics-pressure` | (d) UNSOURCED | Chisholm two-phase multiplier with C = 20/12/10/5 (Chisholm named, no \cite; \cite{LockhartMartinelli1949} at line 20479 is for the chart, not this algebraic form) |

### `sec:pneumatic-conveying` -- Pneumatic conveying: carrying solids in a

5 equations: CITED 1, DERIVED 0, IDENTITY 3, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:20514` | `sec:pneumatic-conveying` | (c) IDENTITY | additive pressure-drop budget of pneumatic conveying (gas acceleration + solids acceleration + friction + static), a balance |
| `docs/theoryGuide.tex:20533` | `sec:pneumatic-conveying` | (c) IDENTITY | force balance on a particle (drag = weight), terminal velocity definition |
| `docs/theoryGuide.tex:20552` | `sec:pneumatic-conveying` | (a) CITED | [cite: same paragraph] Yang solids-friction correlation, \cite{Yang1974} at line 20548 |
| `docs/theoryGuide.tex:20569` | `sec:pneumatic-conveying` | (d) UNSOURCED | saltation margin u_g/u_salt >= 1.5-2 (Rizk 1973 named in prose, no \cite; the margin band is attributed to nobody) |
| `docs/theoryGuide.tex:20582` | `sec:pneumatic-conveying` | (c) IDENTITY | momentum balance for bend re-acceleration of the solids |

### `ch:solids-sep` -- Gas-solid separation: cyclone, bag filter, ideal

6 equations: CITED 2, DERIVED 0, IDENTITY 0, UNSOURCED 4.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:20692` | `ch:solids-sep` | (d) UNSOURCED | Lapple d50 cut size (Lapple 1951 named in the list at line 20714, no \cite) |
| `docs/theoryGuide.tex:20699` | `ch:solids-sep` | (d) UNSOURCED | Lapple grade-efficiency curve 1/(1+(d50/d)^2) (Lapple named, no \cite) |
| `docs/theoryGuide.tex:20747` `eq:iozia-d50` | `ch:solids-sep` | (a) CITED | [cite: same subsection] Iozia-Leith d50, \cite{IoziaLeith1989} at line 20725 |
| `docs/theoryGuide.tex:20754` | `ch:solids-sep` | (a) CITED | [cite: same subsection] Iozia-Leith regressions for V_t,max and d_c, \cite{IoziaLeith1989} at line 20725; the 0.61 prefactor note is the guide's own |
| `docs/theoryGuide.tex:20779` | `ch:solids-sep` | (d) UNSOURCED | bag-filter grade efficiency 1 - P0 exp(-d/d_c), model form with parameters attributed to nobody |
| `docs/theoryGuide.tex:20785` | `ch:solids-sep` | (d) UNSOURCED | cake pressure drop mu V (K1 + K2 W), a Darcy-form model with two fitted constants, no \cite |

### `ch:drying-overview` -- Drying: spray dryer and solid dryer

2 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:20913` | `ch:drying-overview` | (c) IDENTITY | droplet-to-particle shrinkage from the solids mass balance (volume identity) |
| `docs/theoryGuide.tex:20940` | `ch:drying-overview` | (d) UNSOURCED | GAB isotherm (Guggenheim-Anderson-de Boer, named only as "GAB", no \cite) |

### `ch:hx-entu` -- Two-stream heat exchanger: the varepsilon-NTU rating

2 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21010` | `ch:hx-entu` | (d) UNSOURCED | NTU definition beside the counter-current epsilon-NTU closed form (the closed form is a model result; no \cite anywhere in ch:hx-entu) |
| `docs/theoryGuide.tex:21018` | `ch:hx-entu` | (c) IDENTITY | definition of effectiveness, Q = eps C_min (T_h,in - T_c,in) |

### `sec:hx-design` -- Heat exchanger DESIGN: geometry, pressure drop, and the sizing

5 equations: CITED 4, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21060` | `sec:hx-design` | (c) IDENTITY | series resistances 1/U_o (definition of the overall coefficient) |
| `docs/theoryGuide.tex:21070` | `sec:hx-design` | (a) CITED | [cite: same paragraph] Gnielinski correlation, \cite{Gnielinski1976,IncroperaDeWitt} at line 21074 |
| `docs/theoryGuide.tex:21082` | `sec:hx-design` | (a) CITED | [cite: same paragraph] Kern shell-side Nu = 0.36 Re^0.55 Pr^1/3, \cite{Kern1950} at line 21079 |
| `docs/theoryGuide.tex:21097` | `sec:hx-design` | (a) CITED | [cite: same paragraph] tube-side pressure drop with the Blasius f, \cite{Blasius1913} at line 21099 (the 4 n_p return-loss term is attributed to nobody) |
| `docs/theoryGuide.tex:21102` | `sec:hx-design` | (a) CITED | [cite: same subsection] Kern shell-side pressure drop and f_s fit, \cite{Kern1950} at line 21079 |

### `ch:coolingTower` -- The water cooling tower: Merkel's enthalpy driving force

3 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21179` | `ch:coolingTower` | (c) IDENTITY | humid-air enthalpy definition |
| `docs/theoryGuide.tex:21188` | `ch:coolingTower` | (c) IDENTITY | operating line from the water/air energy balance |
| `docs/theoryGuide.tex:21193` `eq:merkel` | `ch:coolingTower` | (d) UNSOURCED | Merkel integral (Merkel 1925 named in the section title and prose, no \cite anywhere in ch:coolingTower) |

### `ch:pinch` -- Pinch analysis: the target before the network

7 equations: CITED 0, DERIVED 0, IDENTITY 7, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21272` `eq:pinch-cp` | `ch:pinch` | (c) IDENTITY | definition of the heat-capacity flowrate CP |
| `docs/theoryGuide.tex:21317` `eq:pinch-shift` | `ch:pinch` | (c) IDENTITY | definition of the shifted temperatures (half-shift convention); the problem-table method's authors are named nowhere and cited nowhere in ch:pinch |
| `docs/theoryGuide.tex:21345` `eq:pinch-interval` | `ch:pinch` | (c) IDENTITY | interval energy balance (net surplus per shifted interval) |
| `docs/theoryGuide.tex:21356` `eq:pinch-cascade` | `ch:pinch` | (c) IDENTITY | cumulative sum of the interval surpluses (cascade) |
| `docs/theoryGuide.tex:21366` `eq:pinch-targets` | `ch:pinch` | (c) IDENTITY | minimum utilities read off the cascade eq:pinch-cascade (an identity) by lifting the worst deficit to zero; no \cite anywhere in ch:pinch |
| `docs/theoryGuide.tex:21467` `eq:pinch-qmax` | `ch:pinch` | (c) IDENTITY | maximum match duty as the minimum of three bounds (definition) |
| `docs/theoryGuide.tex:21511` `eq:pinch-violation-identity` | `ch:pinch` | (c) IDENTITY | identity between cross-pinch violations and the utility excess (an accounting identity) |

### `ch:fug` -- Shortcut distillation: Fenske--Underwood--Gilliland

3 equations: CITED 1, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21709` `eq:gilliland-coords` | `ch:fug` | (a) CITED | [cite: same chapter] Gilliland coordinates X, Y, \cite{Gilliland1940} at line 21664 |
| `docs/theoryGuide.tex:21718` `eq:molokanov` | `ch:fug` | (d) UNSOURCED | Molokanov closed form with the constants 54.4, 11, 117.2 (Molokanov named in prose, no \cite; \cite{Gilliland1940} is the 1940 chart, not this fit) |
| `docs/theoryGuide.tex:21726` `eq:gilliland-N` | `ch:fug` | (c) IDENTITY | inversion of the Y definition in eq:gilliland-coords for N |

### `ch:mesh` -- Rigorous distillation by simultaneous MESH

2 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:21987` `eq:fullmesh-energy` | `ch:mesh` | (c) IDENTITY | stage energy balance of the full MESH (a first-principles balance); Naphtali & Sandholm 1971 named in prose without a \cite (bib key NS exists) |
| `docs/theoryGuide.tex:22130` `eq:stagek-incipient` | `ch:mesh` | (c) IDENTITY | definition of the incipient K-value over a speciated liquid (the engine's own generalization of gamma P_sat / P) |

### `ch:ponchon` -- The enthalpy-concentration diagram: putting energy inside the

5 equations: CITED 0, DERIVED 0, IDENTITY 5, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:22325` `eq:ponchon-total` | `ch:ponchon` | (c) IDENTITY | Ponchon-Savarit total, component and enthalpy balances over the rectifying envelope |
| `docs/theoryGuide.tex:22333` `eq:ponchon-delta` | `ch:ponchon` | (c) IDENTITY | definition of the difference point Delta_D |
| `docs/theoryGuide.tex:22344` `eq:ponchon-triple` | `ch:ponchon` | (c) IDENTITY | the three balances of eq:ponchon-total written as one vector identity |
| `docs/theoryGuide.tex:22359` `eq:ponchon-lever` | `ch:ponchon` | (c) IDENTITY | lever rule on the h-x diagram (a consequence of eq:ponchon-triple, stated as the standard graphical identity) |
| `docs/theoryGuide.tex:22394` `eq:ponchon-cmo` | `ch:ponchon` | (c) IDENTITY | constant molar overflow stated as parallel straight enthalpy lines (a declared assumption, not a sourced result) |

### `ch:hydraulics` -- Tray hydraulics: can the column be built?

10 equations: CITED 6, DERIVED 0, IDENTITY 3, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:22522` `eq:murphree` | `ch:hydraulics` | (d) UNSOURCED | Murphree vapor efficiency (Murphree named in prose, no \cite anywhere in ch:hydraulics for it) |
| `docs/theoryGuide.tex:22553` `eq:keff` | `ch:hydraulics` | (c) IDENTITY | the engine's own effective-K fold of eq:murphree into the MESH equilibrium line |
| `docs/theoryGuide.tex:22576` `eq:souders-brown` | `ch:hydraulics` | (a) CITED | [cite: same paragraph] Souders-Brown flooding velocity, \cite{SoudersBrown1934} at line 22573 |
| `docs/theoryGuide.tex:22592` `eq:flowparam` | `ch:hydraulics` | (c) IDENTITY | definition of the flow parameter F_LV |
| `docs/theoryGuide.tex:22604` `eq:lygeros` | `ch:hydraulics` | (a) CITED | [cite: same paragraph] Lygeros-Magoulas fit of the Fair chart, \cite{LygerosMagoulas1986} at line 22602 (\cite{Fair1961} at 22599 for the chart itself) |
| `docs/theoryGuide.tex:22633` `eq:hd` | `ch:hydraulics` | (a) CITED | [cite: same paragraph] dry-tray, weir-crest and residual heads, \cite{Sinnott} at line 22631 |
| `docs/theoryGuide.tex:22660` `eq:hdc` | `ch:hydraulics` | (a) CITED | [cite: same subsection] downcomer apron head, \cite{Sinnott} at line 22631 (\cite{Liebson1957} at 22651 is for the orifice coefficient) |
| `docs/theoryGuide.tex:22668` `eq:hb` | `ch:hydraulics` | (c) IDENTITY | downcomer backup as a sum of heads (an additive definition) |
| `docs/theoryGuide.tex:22679` `eq:hbmax` | `ch:hydraulics` | (a) CITED | [cite: same subsection] downcomer flooding criterion, \cite{Sinnott} at line 22631 |
| `docs/theoryGuide.tex:22690` `eq:weep` | `ch:hydraulics` | (a) CITED | [cite: same paragraph] weep-point velocity with K2, \cite{Sinnott} at line 22688 |

### `ch:mheatx` -- Multi-stream heat exchanger (MHeatX): a checker, not a

6 equations: CITED 0, DERIVED 0, IDENTITY 6, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:22773` `eq:mheatx-Qk` | `ch:mheatx` | (c) IDENTITY | definition of a leg duty as an enthalpy difference on the package surface |
| `docs/theoryGuide.tex:22786` | `ch:mheatx` | (c) IDENTITY | definitions of the hot and cold duty sums |
| `docs/theoryGuide.tex:22794` `eq:mheatx-imbalance` | `ch:mheatx` | (c) IDENTITY | definition of the imbalance as the signed sum of leg duties |
| `docs/theoryGuide.tex:22801` | `ch:mheatx` | (c) IDENTITY | the engine's own PASS criterion (declared tolerance) |
| `docs/theoryGuide.tex:22820` | `ch:mheatx` | (c) IDENTITY | the engine's own linear pool-duty allocation between two temperatures |
| `docs/theoryGuide.tex:22833` `eq:mheatx-dtmin` | `ch:mheatx` | (c) IDENTITY | definition of the minimum approach over the composite curves |

### `ch:size-vessel` -- Vessel sizing: the stirred tank

3 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:23261` | `ch:size-vessel` | (c) IDENTITY | cylinder geometry at a declared L/D |
| `docs/theoryGuide.tex:23273` `eq:asme-thickness` | `ch:size-vessel` | (d) UNSOURCED | ASME Section VIII Div. 1 thin-shell thickness with the 0.6 P term (the standard is named in prose, no \cite; S = sigma_y/4 is the engine's own) |
| `docs/theoryGuide.tex:23292` | `ch:size-vessel` | (c) IDENTITY | shell metal mass with the engine's own declared 1.2 end-closure factor |

### `title:heat-exchanger-sizing-shell-and-tube` -- Heat-exchanger sizing: shell-and-tube

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:23366` | `title:heat-exchanger-sizing-shell-and-tube` | (c) IDENTITY | definition of the exchanger area from Q = U A LMTD |

### `ch:economics` -- Discounted cash flow: from a cost to a decision

2 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:23386` `eq:dcf-cf` | `ch:economics` | (c) IDENTITY | after-tax cash-flow accounting identity |
| `docs/theoryGuide.tex:23393` `eq:npv` | `ch:economics` | (c) IDENTITY | definition of the net present value |

### `ch:cost-guthrie` -- Guthrie / Turton bare-module costing

4 equations: CITED 2, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:23437` | `ch:cost-guthrie` | (a) CITED | [cite: same paragraph] Turton purchased-cost polynomial, \cite{Turton} at line 23443 |
| `docs/theoryGuide.tex:23451` `eq:bare-module` | `ch:cost-guthrie` | (a) CITED | [cite: same chapter] bare-module factor with Turton's B1, B2, F_M, F_P; \cite{Turton} at line 23443, Turton named again in the paragraph without a \cite |
| `docs/theoryGuide.tex:23464` | `ch:cost-guthrie` | (d) UNSOURCED | the 1.18 contingency-and-fee factor for the total-module cost is attributed to nobody in its paragraph (\cite{Turton} at 23443 is attached to the K coefficients) |
| `docs/theoryGuide.tex:23473` | `ch:cost-guthrie` | (c) IDENTITY | CEPCI escalation and currency conversion (a definition of the scaling) |

### `ch:rk4-packed` -- Time-stepping with a packed state vector

2 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:24579` `eq:batch-mass-iso` | `ch:rk4-packed` | (c) IDENTITY | batch species balance under R reactions (first-principles) |
| `docs/theoryGuide.tex:24593` `eq:rk4-packed` | `ch:rk4-packed` | (d) UNSOURCED | classical fourth-order Runge-Kutta stages and weights, stated without derivation or \cite (the same scheme as line 11683, same verdict for consistency) |

### `ch:batch-adiabatic` -- Adiabatic batch reactor: coupled mass + energy balance

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:24679` `eq:batch-energy` | `ch:batch-adiabatic` | (c) IDENTITY | adiabatic batch energy balance (first-principles); the heat of reaction is the elements-datum sum of Section sec:elements-reference |

### `ch:rayleigh` -- Rayleigh batch distillation

9 equations: CITED 0, DERIVED 0, IDENTITY 8, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:24826` `eq:rayleigh` | `ch:rayleigh` | (c) IDENTITY | Rayleigh pot mass balance (first-principles); "the classical Rayleigh distillation" is attributed to nobody |
| `docs/theoryGuide.tex:24916` `eq:rectifier-ode` | `ch:rayleigh` | (c) IDENTITY | pot balance of the batch rectifier (product only leaves) |
| `docs/theoryGuide.tex:24921` `eq:rectifier-cascade` | `ch:rayleigh` | (c) IDENTITY | quasi-steady stage balances, stage equilibrium and total-condenser closure (first-principles) |
| `docs/theoryGuide.tex:24951` `eq:rectifier-fenske` | `ch:rayleigh` | (d) UNSOURCED | Fenske total-reflux relation restated in ch:rayleigh with no \cite (\cite{Fenske1932} stands in ch:fug at line 21655, a different chapter) |
| `docs/theoryGuide.tex:25015` `eq:ledger-enthalpy` | `ch:rayleigh` | (c) IDENTITY | definition of the ledger's transported enthalpy (the engine's own) |
| `docs/theoryGuide.tex:25055` `eq:ledger-duty` | `ch:rayleigh` | (c) IDENTITY | first law over a closed constant-pressure segment with Hess's law on the elements datum |
| `docs/theoryGuide.tex:25070` `eq:charge-h-equality` | `ch:rayleigh` | (c) IDENTITY | enthalpy equality for an adiabatic charge (first-principles) |
| `docs/theoryGuide.tex:25115` `eq:still-duties` | `ch:rayleigh` | (c) IDENTITY | first law on the pot and on the condenser packages |
| `docs/theoryGuide.tex:25175` `eq:campaign-mass` | `ch:rayleigh` | (c) IDENTITY | campaign mass balance (first-principles) |

### `ch:dyn-cstr` -- Continuous dynamic CSTR with finite hold-up

1 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:25271` `eq:dynCSTR-mass` | `ch:dyn-cstr` | (c) IDENTITY | dynamic CSTR mass and energy balances (first-principles); the jacket term U A (T_j - T) is a definition |

### `ch:pid` -- Feedback control: the ideal PID, derivative-on-PV, anti-windup

2 equations: CITED 0, DERIVED 0, IDENTITY 2, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:25408` `eq:pid-ideal` | `ch:pid` | (c) IDENTITY | definition of the ideal-form PID law with derivative on PV (the engine's own object) |
| `docs/theoryGuide.tex:25535` `eq:antiwindup` | `ch:pid` | (c) IDENTITY | the engine's own clamping anti-windup rule |

### `sec:reactioncurve` -- The process reaction curve: identifying an FOPDT model, and

7 equations: CITED 0, DERIVED 0, IDENTITY 6, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:25691` `eq:rc-gain` | `sec:reactioncurve` | (c) IDENTITY | definition of the steady-state gain |
| `docs/theoryGuide.tex:25705` `eq:fopdt-tf` | `sec:reactioncurve` | (c) IDENTITY | definition of the FOPDT transfer function (a model form, no parameters given values) |
| `docs/theoryGuide.tex:25711` `eq:fopdt-step` | `sec:reactioncurve` | (c) IDENTITY | step response of eq:fopdt-tf (inverse Laplace of a definition) |
| `docs/theoryGuide.tex:25755` `eq:rc-RL` | `sec:reactioncurve` | (c) IDENTITY | tangent construction derived in text from the FOPDT step response; Ziegler & Nichols 1942 named in prose without a \cite |
| `docs/theoryGuide.tex:25768` `eq:rc-twopoint` | `sec:reactioncurve` | (d) UNSOURCED | two-point construction with the constants 0.67, 1.3, 0.29 (Sundaresan & Krishnaswamy 1978 named in prose, no \cite) |
| `docs/theoryGuide.tex:25783` `eq:rc-lsq` | `sec:reactioncurve` | (c) IDENTITY | the engine's own least-squares objective for the FOPDT fit |
| `docs/theoryGuide.tex:25795` `eq:rc-amp` | `sec:reactioncurve` | (c) IDENTITY | closed-form linear least-squares amplitude for fixed (tau, theta) |

### `sec:column-control` -- Choosing a column control structure, and where the instruments

3 equations: CITED 0, DERIVED 0, IDENTITY 3, UNSOURCED 0.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:26086` | `sec:column-control` | (c) IDENTITY | bubble-point / composition one-to-one correspondence for a binary at fixed P |
| `docs/theoryGuide.tex:26101` `eq:slope-criterion` | `sec:column-control` | (c) IDENTITY | the engine's own slope criterion (a definition) |
| `docs/theoryGuide.tex:26120` `eq:sensitivity-criterion` | `sec:column-control` | (c) IDENTITY | the engine's own sensitivity criterion (a finite difference over two solves) |

### `ch:stiff-ode` -- Numerical integration of stiff systems

5 equations: CITED 0, DERIVED 0, IDENTITY 4, UNSOURCED 1.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:26358` `eq:ivp` | `ch:stiff-ode` | (c) IDENTITY | statement of the initial-value problem |
| `docs/theoryGuide.tex:26376` `eq:explicit-step` | `ch:stiff-ode` | (c) IDENTITY | forward-Euler stability bound derived in text from \|1 + h lambda\| <= 1 |
| `docs/theoryGuide.tex:26433` `eq:stiffness-ratio` | `ch:stiff-ode` | (c) IDENTITY | definition of the stiffness ratio |
| `docs/theoryGuide.tex:26474` `eq:euler-si` | `ch:stiff-ode` | (c) IDENTITY | semi-implicit (linearized backward) Euler step, derived in text |
| `docs/theoryGuide.tex:26550` `eq:ros23` | `ch:stiff-ode` | (d) UNSOURCED | Rosenbrock23 / ode23s two-stage scheme with constants "fixed by the order conditions"; Hairer & Wanner and Sandu et al. are named in the closing prose (line 26685) without a \cite, and the scheme's own authors are named nowhere |

### `ch:gas-kinetics` -- Chemical kinetics in the gas phase

8 equations: CITED 0, DERIVED 0, IDENTITY 5, UNSOURCED 3.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:26708` `eq:mass-action` | `ch:gas-kinetics` | (c) IDENTITY | law of mass action for an elementary reaction (standard, named) |
| `docs/theoryGuide.tex:26713` `eq:arrhenius` | `ch:gas-kinetics` | (d) UNSOURCED | Arrhenius law with A and E_a (Arrhenius named in prose, no \cite; Vitor may prefer to mark it identity) |
| `docs/theoryGuide.tex:26721` `eq:mod-arrhenius` | `ch:gas-kinetics` | (d) UNSOURCED | modified Arrhenius form with the exponent b (attributed to "collision theory and transition-state theory", no \cite) |
| `docs/theoryGuide.tex:26738` `eq:third-body` | `ch:gas-kinetics` | (c) IDENTITY | definition of the effective third-body concentration with collision efficiencies |
| `docs/theoryGuide.tex:26749` `eq:falloff` | `ch:gas-kinetics` | (d) UNSOURCED | Lindemann fall-off blend with the Troe broadening factor F (Lindemann and Troe named in prose, no \cite) |
| `docs/theoryGuide.tex:26764` `eq:k-rev` | `ch:gas-kinetics` | (c) IDENTITY | detailed balance k_r = k_f / K_c (a thermodynamic identity) |
| `docs/theoryGuide.tex:26772` `eq:Kp` | `ch:gas-kinetics` | (c) IDENTITY | K_p from the standard-state Gibbs energy of reaction (a thermodynamic identity) |
| `docs/theoryGuide.tex:26781` `eq:Kc` | `ch:gas-kinetics` | (c) IDENTITY | ideal-gas conversion from the pressure to the concentration basis, derived in text |

### `ch:polymers` -- Polymerisation: chain statistics from conversion

6 equations: CITED 0, DERIVED 0, IDENTITY 1, UNSOURCED 5.

| Id | Chapter | Verdict | Note |
|---|---|---|---|
| `docs/theoryGuide.tex:26842` `eq:carothers` | `ch:polymers` | (d) UNSOURCED | Carothers equation (Carothers named in prose, the "counting argument" not shown, no \cite) |
| `docs/theoryGuide.tex:26851` `eq:Mn` | `ch:polymers` | (c) IDENTITY | M_n = M_0 X_n, a definition given eq:carothers |
| `docs/theoryGuide.tex:26862` `eq:flory-mole` | `ch:polymers` | (d) UNSOURCED | Flory-Schulz most-probable distribution (named in prose, no \cite) |
| `docs/theoryGuide.tex:26868` `eq:flory-weight` | `ch:polymers` | (d) UNSOURCED | weight-fraction form of eq:flory-mole, not derived in text and resting on an unsourced distribution |
| `docs/theoryGuide.tex:26874` `eq:Mw` | `ch:polymers` | (d) UNSOURCED | weight-average degree of polymerization, not derived in text and resting on eq:flory-mole (unsourced) |
| `docs/theoryGuide.tex:26881` `eq:pdi` | `ch:polymers` | (d) UNSOURCED | PDI = 1 + p, not derived in text and resting on eq:flory-mole (unsourced) |

## 8. Per-chapter counts

| Chapter | Equations | (a) CITED | (b) DERIVED | (c) IDENTITY | (d) UNSOURCED |
|---|---:|---:|---:|---:|---:|
| `ch:three-pillars` | 1 | 0 | 0 | 1 | 0 |
| `title:notation-units-and-basis` | 1 | 0 | 0 | 1 | 0 |
| `ch:criticals` | 3 | 0 | 0 | 3 | 0 |
| `ch:vap` | 8 | 2 | 0 | 4 | 2 |
| `ch:sublimation` | 6 | 0 | 0 | 6 | 0 |
| `ch:rackett` | 5 | 0 | 0 | 2 | 3 |
| `ch:heat` | 2 | 0 | 0 | 1 | 1 |
| `ch:integrals` | 19 | 0 | 0 | 18 | 1 |
| `ch:ideal-mixing` | 12 | 0 | 0 | 12 | 0 |
| `ch:activity` | 24 | 16 | 6 | 2 | 0 |
| `ch:electrolytes` | 9 | 2 | 0 | 7 | 0 |
| `ch:enrtl` | 9 | 5 | 1 | 2 | 1 |
| `ch:solubility-parameter` | 4 | 1 | 0 | 1 | 2 |
| `ch:pitzer-hmw` | 12 | 10 | 0 | 2 | 0 |
| `ch:edwards` | 5 | 4 | 0 | 0 | 1 |
| `ch:speciation` | 16 | 3 | 0 | 12 | 1 |
| `ch:fugacity` | 15 | 0 | 0 | 14 | 1 |
| `ch:cubic-eos` | 11 | 4 | 4 | 1 | 2 |
| `ch:cosmosac` | 3 | 3 | 0 | 0 | 0 |
| `ch:pcsaft` | 3 | 3 | 0 | 0 | 0 |
| `ch:rr` | 6 | 0 | 0 | 5 | 1 |
| `ch:gentle` | 4 | 0 | 0 | 4 | 0 |
| `ch:nr1d` | 3 | 0 | 0 | 3 | 0 |
| `ch:nrND` | 5 | 0 | 0 | 5 | 0 |
| `ch:lm` | 15 | 2 | 0 | 13 | 0 |
| `ch:wegstein` | 8 | 1 | 0 | 7 | 0 |
| `ch:newton-tears` | 6 | 0 | 0 | 6 | 0 |
| `ch:sqp` | 16 | 10 | 0 | 6 | 0 |
| `ch:rk4` | 2 | 0 | 0 | 1 | 1 |
| `ch:viscosity` | 6 | 5 | 0 | 0 | 1 |
| `ch:thermal-cond` | 4 | 4 | 0 | 0 | 0 |
| `ch:diffusivity` | 3 | 2 | 0 | 0 | 1 |
| `ch:mixture-rules` | 4 | 4 | 0 | 0 | 0 |
| `ch:balances` | 1 | 0 | 0 | 1 | 0 |
| `ch:phase-changer` | 7 | 0 | 0 | 7 | 0 |
| `ch:cstr` | 3 | 0 | 0 | 3 | 0 |
| `ch:lhhw` | 3 | 2 | 1 | 0 | 0 |
| `ch:pfr` | 3 | 0 | 0 | 3 | 0 |
| `ch:thiele` | 10 | 3 | 2 | 5 | 0 |
| `ch:evap-mode2` | 4 | 0 | 0 | 4 | 0 |
| `ch:lle-gibbs` | 9 | 5 | 0 | 4 | 0 |
| `ch:extractor` | 6 | 0 | 0 | 6 | 0 |
| `ch:conversion-reactor` | 5 | 0 | 0 | 5 | 0 |
| `ch:gibbs-reactor` | 11 | 0 | 0 | 11 | 0 |
| `ch:distillation` | 1 | 0 | 0 | 1 | 0 |
| `ch:absorber` | 3 | 1 | 0 | 2 | 0 |
| `ch:crystalliser` | 27 | 3 | 5 | 16 | 3 |
| `ch:membrane` | 16 | 6 | 3 | 7 | 0 |
| `ch:dspmde` | 8 | 5 | 1 | 2 | 0 |
| `ch:sdem` | 6 | 1 | 4 | 1 | 0 |
| `ch:electrodialysis` | 18 | 12 | 1 | 5 | 0 |
| `ch:ion-exchange` | 8 | 2 | 0 | 6 | 0 |
| `ch:adsorption` | 9 | 1 | 0 | 6 | 2 |
| `ch:rotating` | 3 | 0 | 0 | 3 | 0 |
| `ch:hydraulics-pressure` | 13 | 4 | 0 | 7 | 2 |
| `sec:pneumatic-conveying` | 5 | 1 | 0 | 3 | 1 |
| `ch:solids-sep` | 6 | 2 | 0 | 0 | 4 |
| `ch:drying-overview` | 2 | 0 | 0 | 1 | 1 |
| `ch:hx-entu` | 2 | 0 | 0 | 1 | 1 |
| `sec:hx-design` | 5 | 4 | 0 | 1 | 0 |
| `ch:coolingTower` | 3 | 0 | 0 | 2 | 1 |
| `ch:pinch` | 7 | 0 | 0 | 7 | 0 |
| `ch:fug` | 3 | 1 | 0 | 1 | 1 |
| `ch:mesh` | 2 | 0 | 0 | 2 | 0 |
| `ch:ponchon` | 5 | 0 | 0 | 5 | 0 |
| `ch:hydraulics` | 10 | 6 | 0 | 3 | 1 |
| `ch:mheatx` | 6 | 0 | 0 | 6 | 0 |
| `ch:size-vessel` | 3 | 0 | 0 | 2 | 1 |
| `title:heat-exchanger-sizing-shell-and-tube` | 1 | 0 | 0 | 1 | 0 |
| `ch:economics` | 2 | 0 | 0 | 2 | 0 |
| `ch:cost-guthrie` | 4 | 2 | 0 | 1 | 1 |
| `ch:rk4-packed` | 2 | 0 | 0 | 1 | 1 |
| `ch:batch-adiabatic` | 1 | 0 | 0 | 1 | 0 |
| `ch:rayleigh` | 9 | 0 | 0 | 8 | 1 |
| `ch:dyn-cstr` | 1 | 0 | 0 | 1 | 0 |
| `ch:pid` | 2 | 0 | 0 | 2 | 0 |
| `sec:reactioncurve` | 7 | 0 | 0 | 6 | 1 |
| `sec:column-control` | 3 | 0 | 0 | 3 | 0 |
| `ch:stiff-ode` | 5 | 0 | 0 | 4 | 1 |
| `ch:gas-kinetics` | 8 | 0 | 0 | 5 | 3 |
| `ch:polymers` | 6 | 0 | 0 | 1 | 5 |
| **Total** | **534** | **142** | **28** | **314** | **50** |

## 9. Shapes worth naming

Nothing the tool enumerated was unclassifiable, and every environment it found is one of `equation` or `align` (no `gather`, `multline`, `eqnarray` or `flalign` occurs in the guide).  Three shapes are worth a sentence because a reader scanning the tables may stop at them:

* An `equation` environment whose body is prose or a chain of arrows rather than mathematics (for example `docs/theoryGuide.tex:16994`).  It is numbered, so it is counted and given a verdict like any other row.
* An `equation` environment that holds only catalogue numbers (for example `docs/theoryGuide.tex:19596`).  Counted; the verdict is on what the numbers are, not on the arithmetic.
* `align` environments whose lines carry `\notag` on all but the last (the RK4 and Rosenbrock stencils).  One row each, per the tool's rule; no environment renders unnumbered on every line.

## 10. What Vítor decides

The 50 rows of Section 6 are his.  For each, the choices are the ones the commission named: source it (add the `\cite`, which for the rows whose note records a name and a bibliography key is a move of a few characters), mark it as an identity (and say in the guide why no source is owed), or delete it.  This record proposes none of the three for any row, and it proposes no change to the gate: whether `check_theory_citations` should ever become per-equation, and what a per-equation gate would accept as a citation, is a decision this reading was not asked to take.

Two of the five conventions above are also his to keep or reverse, and the tables are built so that reversing either is arithmetic rather than re-reading: convention 1 (a model's introductory citation covers its constituent equations) moves rows between CITED and UNSOURCED by their token; convention 3 (the engine's own declarations are identities) moves rows whose note begins "the engine's own".
