<!--
SPDX-License-Identifier: CC-BY-SA-4.0 (prose) · GPL-3.0-or-later (case files)
Part of Choupo — https://choupo.org · Authors: Vítor Geraldes and Pedro Mendes
Written with an Ivy-League process-design faculty panel; human-curated.
-->

# Process Design Heuristics

*A glass-box guide to choosing and sizing equipment.*

This guide is Choupo's answer to the rules-of-thumb appendices you reach for in Turton, Seider, and Sinnott & Towler — but rebuilt for a simulator whose whole point is that *nothing is hidden*. Where a textbook table hands you a single number ("use ΔT_min = 10 °C", "size liquid lines at 1–3 m/s"), this guide hands you a **range, a *why*, and a runnable hypothesis**. The eight faculty sections that follow cover the full sweep of decisions a student faces when a problem stops being "solve this flash" and becomes "what equipment do I even pick?": process structure, reactor type, separation train, exchanger type and velocity, line sizing and ΔP budgets, membranes, solids handling, and the metal envelope that contains all of it.

**How to read every rule here: a heuristic is a *hypothesis*, not a verdict.** "Pick a PFR for a fast, high-conversion liquid reaction" is a starting bet that buys you 80 % of the answer in 20 % of the effort — it is *not* a substitute for the run. Choupo is glass-box precisely so you can test the bet: build the case, watch the Newton iterations, read the KPIs, and confirm (or refute) the rule for *your* feed, *your* thermodynamics, *your* pressure level. Wherever a rule maps cleanly onto an existing tutorial, the section points you at it — run it, perturb it, and see the range move. A heuristic you have personally falsified once is worth ten you merely memorised.

**Why the sections are ordered the way they are — the design onion.** Process design proceeds from the inside out: the reactor sits at the core, the separation-and-recycle system wraps it, the heat-recovery network wraps that, and the utilities, hydraulics, and mechanical envelope wrap the whole. Each layer's decisions *constrain* the next — the reactor's conversion fixes what the separation train must handle; the separation train's streams fix the heating and cooling duties; those duties fix the pumping power and line sizes; and the worst temperature, pressure, and corrosivity anywhere inside fix the materials of construction on the outside. So we read **outermost framing first** (synthesis), then **inward to the core** (reactors), then **back out through the layers**: the full separation train kept together (distillation → membranes → solids), then heat recovery (heat exchangers), then the connective hydraulics, and finally the material envelope that contains everything. This keeps every decision in the order in which its inputs actually become available.

## Process synthesis & flowsheet structure

Design the flowsheet **inside-out**, following Douglas' onion. Each layer fixes the degrees of freedom (DOF) of the next, so never optimise an inner layer against an outer-layer guess.

| Onion layer | What you DECIDE | Heuristic numbers / ranges | Physical/economic WHY |
|---|---|---|---|
| 1. Reactor | CSTR vs PFR, single-pass conversion X | Push X to **0.6–0.9** for cheap reactant; stop where recycle cost rises faster than reactor cost. Keep **X ≤ 0.95** if selectivity falls (consecutive rxns) | Reactor cost ∝ V ∝ 1/(1−X) for PFR; recycle/separation cost ∝ unconverted feed. The minimum-TAC X sits where ∂(reactor)/∂X = −∂(recycle)/∂X |
| 2. Separation | Recover vs recycle; sequence | Recover species worth **> ~3–5×** its separation cost; aim **99%+** recovery of valuable product | Lost product is pure margin; over-purifying a recycle wastes reboiler duty |
| 3. Recycle/purge | Purge fraction for inerts | Purge so inert mole-frac in loop **≤ 0.10–0.30**; purge loss of reactant **< 1–5%** of feed | Inert build-up raises recycle compressor/pump duty (∝ total recycle flow); too-small purge → runaway loop inventory |
| 4. Heat recovery | HEN, ΔT_min | ΔT_min **10 °C** liquid–liquid, **20–40 °C** with a gas stream, **3–5 °C** cryogenic/refrigerated | Area ∝ 1/ΔT_min (U_gas ~15–60 W/m²K vs U_liq ~300–1000); small ΔT buys energy but explodes area cost |
| 5. Utilities | Hot/cold service, fired vs salt | LP/MP/HP steam below ~250 °C; **Dowtherm A** to ~400 °C; **HiTec salt 142–535 °C**; fired heater only above salt range | Match utility T just above pinch; over-hot utility destroys exergy and over-sizes ΔT |

**Input–output structure first.** Before any unit, draw the I/O box: feeds in, products + purge + by-products out. Set **feed stoichiometric ratio** (slight excess, ~1.05–1.2, of the cheaper/limiting-safety reactant), decide which species **leave vs recycle**, and locate the **purge** (needed whenever a feed impurity or light by-product has no other exit). This fixes overall material balance DOF *before* you size anything.

**Reactor type.** Use a **PFR** when you need high conversion of a single reaction (plug flow → smaller volume for given X) or want a temperature/composition profile; use a **CSTR** for liquid-phase, exothermic, fast, or solids/biological systems needing isothermality and mixing. For series-parallel selectivity, a **CSTR-then-PFR** or staged CSTRs (3–4 stages approach PFR) is common. See `tutorials/steady/reactor` cases; for economics-driven X, `optim05_reactor_npv`.

**Distillation sequencing** (Heaviest-out / direct sequence is the default): (1) remove **most plentiful** component early; (2) take the **lightest** (highest relative volatility, α) split first when α > ~1.5; (3) leave the **hardest split** (α → 1) and the **highest-purity** product for last, alone, to avoid re-contaminating it; (4) favour **near-50/50** splits to balance column loads. Each ordering is a hypothesis — run the Wang-Henke / FUG shortcut cases (`tutorials/steady/distillation`) and compare reboiler+condenser duty.

**Degrees of freedom discipline.** A recycle adds one tear stream; Choupo's Newton-on-tears solver converges it, but **you** still own the design specs (purge fraction, reactor X, reflux). Count them: overall DOF = stream variables − independent balances − fixed specs. If the flowsheet won't close, you've under- or over-specified — the glass-box log tells you which. Sequence the whole sheet **reactor → separation → recycle → HEN → utilities**, re-pinching only after the recycle converges, because recycle flows change the composite curves.

## Reactors & reaction engineering

The reactor is rarely the most expensive vessel, but it sets the composition every downstream unit must clean up — so its selection ripples through the whole flowsheet cost. Pick the **type** from mixing/kinetics, then size from **residence time** and **heat load**.

### Type selection

| Criterion | Batch / semi-batch | CSTR | PFR / tubular | Fixed bed (catalytic) | Fluidised bed |
|---|---|---|---|---|---|
| Throughput | < 500 t/yr, multiproduct | medium, liquid | medium–high | high, gas+solid cat. | high, fast-deactivating cat. |
| Phase | liquid, slurry | liquid, L–L, gas–liq | gas or liquid | gas/liquid + solid | gas + fine solid |
| Kinetics favoured | slow (hrs) | any; needs CSTR robustness | high order, fast | heterogeneous | very exo/endothermic, ΔT-sensitive |
| Conversion per pass | high (time-driven) | **lowest for given V** | high | high | moderate |
| Heat control | jacket/coil, batchwise | excellent (isothermal, well-mixed) | hard (axial profile) | hot-spots; multitube | near-isothermal (solids mix) |
| τ for same X | — | **largest** | smallest | small | small |

The governing trade-off: a CSTR operates at the **outlet** (low-reactant) concentration, so for n>0 kinetics it needs the largest volume — typically **1.5–4×** a PFR for the same conversion (Choupo `cstr01_first_order` vs `pfr01_first_order` shows this head-to-head). You accept that penalty to buy near-perfect temperature control and the ability to run slurries/fouling systems a tube would plug. Use **CSTRs-in-series** (3–5 tanks) to approach plug-flow behaviour while keeping the mixing robustness.

### How far to push conversion

Per-pass conversion is an **optimisation, not a maximisation**. Reactor volume scales roughly as `V ∝ ln[1/(1−X)]` (first order) — the last few percent of conversion cost disproportionate volume and, worse, residence time that breeds side products and erodes selectivity. **Heuristics:**
- Single-pass irreversible, valuable feed: target **X = 0.6–0.9**, then **recycle unconverted reactant** (recovery + recycle is almost always cheaper than the extra reactor volume; see `conversion01_hda` and the recycle flowsheet `process01_reactor_flash`).
- Reversible reactions: stop at **80–95% of equilibrium X**; chasing equilibrium needs infinite τ (`cstr02_reversible_wgs`, `pfr02_reversible_wgs`).
- The economic optimum trades reactor capital vs separation/recycle duty — run a sweep; `optim05_reactor_npv` does exactly this on NPV.

### Temperature, pressure & exotherm policy

Run **as hot as selectivity and catalyst/material limits allow** — rate roughly doubles per **+10 °C** — but watch the Arrhenius gap: if the side reaction has higher Eₐ, hotter means *less* selective. For reversible exothermic reactions use a **declining T profile** (hot inlet for rate, cool outlet for equilibrium).

Heat removal sets the geometry. Estimate **adiabatic ΔT_ad = (−ΔH_rxn)·X·C_feed / (ρ·cp)**; if ΔT_ad exceeds ~**20–50 °C**, an adiabatic vessel is unsafe — go to cooled multitube, CSTR with coil/jacket, or dilute/recycle. Jacket U for stirred liquids ≈ **300–1000 W/m²K**; internal coils **500–1500**. Keep the **adiabatic-temperature-rise / runaway** margin honest: `batch06_adaptive_runaway` demonstrates thermal runaway when cooling can't keep up.

### Sizing rules
- **Liquid CSTR:** τ from kinetics; vessel **H/D ≈ 1–3**, fill to **70–85%**, freeboard for disengagement. Confirm against `batch01_first_order`.
- **Catalytic fixed bed:** superficial gas velocity **0.3–1.5 m/s**; keep **ΔP ≤ 10–20%** of inlet P (Ergun); bed **L/D ≥ 5**, particle **3–6 mm** to balance ΔP vs internal diffusion.
- **Fluidised bed:** operate at **2–7× U_mf**, typically **0.3–0.7 m/s**; tall freeboard to cut entrainment.
- **Space velocity** sanity check: gas catalytic **GHSV 500–10,000 h⁻¹**; liquid **LHSV 0.5–5 h⁻¹**.

## Distillation & separation-train design

Distillation is the workhorse: ~90% of liquid separations, but also the plant's largest single energy sink (reboiler duty). Every heuristic below is a **range to verify** — run the case, read the diameter and reflux the solver reports, and decide.

### Internals selection (trays vs packing)

The *why*: trays handle fouling, solids and wide turndown; structured packing gives low pressure drop and high efficiency per metre but is intolerant of fouling and expensive.

| Service / criterion | Pick | Typical numbers | Why |
|---|---|---|---|
| D > 0.8 m, clean, normal P | Sieve/valve trays | spacing 0.45–0.6 m, ΔP ≈ 0.7 kPa/tray | cheap, robust, wide turndown (valve 4–5:1) |
| D < 0.8 m | Random packing | HETP ≈ column D | trays uneconomic to install in small shells |
| Vacuum (P < 0.3 bar) | Structured packing | ΔP 0.1–0.4 kPa/m vs 0.7 kPa/tray | low ΔP keeps reboiler T (and thermal-degradation) down |
| High purity / many stages | Structured packing | HETP 0.3–0.5 m, a 250–350 m²/m³ | most stages per metre of height |
| Fouling / solids / corrosive | Trays | — | cleanable, replaceable |
| Foaming, low ΔP | Random (Pall/IMTP) | HETP 0.5–0.9 m | open area tolerates surging |

### Diameter from vapour load (flooding)

Size on the controlling (usually top) vapour rate. Use the **C-factor / Souders-Brown** velocity:
u_flood = C_sb·√((ρ_L−ρ_V)/ρ_V), C_sb ≈ 0.07–0.12 m/s at 0.45–0.6 m spacing. **Design at 75–85% of flood** (70% for foaming systems). Equivalently the **F-factor** F = u·√ρ_V should land at **1.2–2.5 (m/s)(kg/m³)^0.5** for trays, up to ~2.5–3 for structured packing. Typical superficial vapour velocities: **0.5–1.5 m/s** at atmospheric, **2–4 m/s** under vacuum (low ρ_V). Then A = V̇/u, D = √(4A/π). Aspect ratio H/D ≈ 8–30; if H/D > 30 split into two shells. Weir loading and downcomer set the lower bound — turndown below ~50% of flood weeps. `column01_benzene_toluene` reports diameter and the flood fraction; halve the feed and watch it shrink.

### Reflux and FUG sizing

Shortcut design (Fenske-Underwood-Gilliland, `shortcut01_benzene_toluene`): Fenske gives N_min at total reflux, Underwood gives R_min, Gilliland interpolates. **Heuristic R = 1.1–1.5·R_min** — the cost optimum, because below 1.1 N (and column height) blows up, above 1.5 reboiler/condenser duty and diameter grow with little stage saving. **N ≈ 2·N_min** at that reflux. Feed near the stage matching its composition. Validate the shortcut against the rigorous MESH run (`column02_simultaneous`).

### Sequencing multicomponent splits

Direct sequence (lights overhead first) dominates. Heuristics, in priority: (1) remove **corrosive/hazardous** components early; (2) do the **most-plentiful** product split early; (3) save the **hardest split** (α < 1.2) and the **highest-purity** split for last, alone; (4) favour **near-50/50** splits; (5) "lightest-first" when relative volatilities are ordered. Each saves reboiler duty by not re-boiling already-separated material.

### Azeotropes

When α → 1 or an azeotrope blocks the split, ordinary distillation cannot cross it. Wang-Henke (bubble-point) goes **unstable near azeotropes — switch to `method simultaneous;`** (rigorous MESH Newton, `column03_azeotrope_mesh`). Options: pressure-swing (if the azeotrope moves ≥5 mol% over the P range), entrainer/extractive, or hybrid with the membrane unit. Set ΔT_min ≥ 10 °C on the reboiler/condenser to keep utility cost sane.

## Absorption, stripping & gas treating

Absorption transfers a gas-phase solute into a liquid solvent; stripping is the reverse. Reach for it instead of distillation when the species is DILUTE in a gas, or when no boil-up is available — you contact, you do not boil. **Hypothesis to run:** if the solute is < ~10 mol% of a gas and a solvent gives a low slope m = y/x, absorption is far cheaper than condensing and distilling the whole stream.

| Situation | Why absorption/stripping wins |
|---|---|
| Dilute solute in a large gas stream | no need to condense/boil the bulk inert |
| Acid-gas removal (CO2, H2S) | selective chemical solvent (amine) near ambient T |
| Solvent / VOC recovery from a vent | recover below its dew point without refrigeration |
| Heat-sensitive solute | ambient contacting, no reboiler |

**The absorption factor and Kremser.** The master group is **A = L/(m·V)** (liquid rate / equilibrium-slope × gas rate); stripping uses **S = 1/A = mV/L**. Design **A ≈ 1.2–2.0**: at A < 1 you can never reach a fixed recovery no matter how tall the tower; at A > 2 you waste solvent and the recovery curve flattens. The **Kremser equation** turns A and the target recovery into ideal stages — ~99% recovery at A = 1.4 needs roughly **6–10 ideal stages**.

**Minimum solvent.** The minimum L/V is where the operating line touches the equilibrium line; design at **L = 1.2–1.5 × L_min** — like reflux, less is infeasible and much more just inflates the downstream stripping duty. Always judge the absorber+stripper PAIR, never the absorber alone.

| Internals | Pick when | Numbers |
|---|---|---|
| Random / structured packing | corrosive, foaming, low ΔP, small diameter (< ~0.6 m) | HETP 0.3–0.6 m (structured), 0.5–1 m (random) |
| Trays | large diameter, high liquid load, side-draws, fouling | 0.3–0.6 m spacing, 60–80% stage efficiency |

Quote packed height as **HTU × NTU** (HTU ~0.3–1 m); run the gas at **60–80% of flooding** (the same F-factor/superficial-velocity idea as distillation). **Gas treating:** for CO2/H2S use a chemical solvent (MEA/MDEA, 15–50 wt%) — the reaction boosts capacity at low partial pressure, but regeneration costs **~1–4 MJ per kg CO2** and dominates the operating cost, so solvent choice is really a regeneration-energy decision. Cold + high-P favours absorption; hot + low-P favours stripping — the same column run in reverse.

## Liquid-liquid extraction

Extraction (LLE) separates by *chemical affinity* to a second liquid phase, not by volatility — so it wins exactly where distillation struggles. **Hypothesis to run:** take a feed and check whether the relative volatility α and the solvent distribution coefficient K point the same way; if α → 1 but K is large, LLE is the cheaper route.

**When LLE beats distillation (the four classic triggers):**

| Trigger | Distillation symptom | Reach for LLE when |
|---|---|---|
| Close-boiling | α < 1.05–1.10 → 80+ trays, high reflux | a solvent gives K ≥ 5–10 with selectivity β > 20 |
| Azeotrope | pinch, can't cross | solute partitions selectively (aromatics/aliphatics, acetic acid/water) |
| Heat-sensitive | thermal degradation > 100–150 °C | ambient-to-40 °C extraction protects the product (antibiotics, vitamins) |
| Dilute aqueous | boil-up energy ∝ whole stream | solute < 5–10 wt% and K·(S/F) ≳ 5 (metals, phenol, caprolactam) |

The catch: LLE almost always needs a downstream distillation to *recover the solvent*, so judge the **combined** train, not the extractor alone.

**Solvent selection** — rank candidates on four numbers:
- **Distribution coefficient K = y/x** (solute in solvent / in raffinate). Want K ≳ 5–10; below ~1 the solvent flow balloons.
- **Selectivity β = K_solute/K_carrier**, the LLE analogue of relative volatility. β > 1 is mandatory; β > 20–50 lets you reach high purity in few stages. β → 1 is the LLE "azeotrope."
- **Recoverability**: a 10–30 °C boiling-point gap (or a density/solubility swing) between solvent and solute so the recovery still is cheap.
- **Density difference Δρ ≥ 50–150 kg/m³** and **moderate interfacial tension γ ≈ 5–30 mN/m** for clean settling — too low γ emulsifies, too high needs intense agitation.

**Number of stages.** Use the Kremser equation with the extraction factor **E = K·(S/F)**. Design for **E ≈ 1.3–2.0**: at E < 1 you can never reach high recovery regardless of stages; at E > 3 you are wasting solvent. For 99% solute recovery at E = 1.5, Kremser gives roughly **8–12 ideal stages**; raising E to 2 cuts it to ~5–7. Stage efficiencies are low (mixer-settler 75–95%, columns 20–40% per "stage"), so HETS dominates real height.

**Solvent-to-feed ratio (S/F).** Set by E and K: **S/F = E/K**. With K = 5 and E = 1.5, S/F ≈ 0.3; with a weak K = 1, the same E forces S/F ≈ 1.5 — and a big solvent-recovery column. Stay in **S/F ≈ 0.2–2**; outside it the economics flip back toward distillation.

**Equipment selection** by throughput and settling tendency:

| Contactor | Throughput | Stages (typ.) | Use when |
|---|---|---|---|
| Mixer-settler | low–very high | 1 per unit, trains of 3–6 | slow-settling, high efficiency, many stages, easy scale-up (footprint large) |
| Sieve-tray / packed column | medium–high | 5–10 | good Δρ & γ, few–moderate stages, low cost |
| RDC / pulsed / Karr (agitated) | medium | 8–15 | low γ, emulsifying systems, tall but compact footprint |
| Centrifugal (Podbielniak) | low–medium | 3–7 | tiny Δρ, short residence (antibiotics), high cost |

**Why:** agitation buys mass transfer but fights settling — the design tension is always *contact intensity vs. phase disengagement*. In Choupo, sweep S/F and stage count on an absorber/extractor case and watch the Kremser recovery curve flatten past E ≈ 2 before committing solvent.

## Membranes & aqueous/advanced separations

Membranes win where the separation is **isothermal and low-grade-energy-only**: aqueous streams, heat-sensitive or non-volatile solutes, and modest concentration ratios. The rule of thumb: **if the relative volatility is favourable and the solvent must be boiled anyway, distillation/evaporation wins; if you only need to *concentrate* an aqueous solution or strip ions/macromolecules at near-ambient T, a pressure-driven membrane is 5-20× cheaper in energy.** RO desalination runs ~3-4 kWh/m³ vs ~10-15 kWh/m³ (with vapour recompression) for thermal — because you pay only to overcome osmotic pressure (~0.78 bar per 1000 mg/L NaCl), not the latent heat of water.

### Selecting the membrane class

| Class | Pore / MWCO | ΔP (bar) | Flux (LMH) | Rejects | Use when |
|---|---|---|---|---|---|
| MF | 0.1-10 µm | 0.5-2 | 50-1000 | suspended solids, bacteria | clarification, cell harvest, RO pretreatment |
| UF | 1-500 kDa | 1-5 | 30-150 | macromolecules, colloids, virus | protein concentration/diafiltration, oily water |
| NF | 200-1000 Da | 5-25 | 15-60 | divalents, sugars, dyes; passes monovalents | softening, sugar/whey, colour removal |
| RO | <200 Da | 15-70 (BWRO 10-25, SWRO 55-70) | 12-30 | nearly all ions | desalination, final dewatering, ZLD |

Driving pressure scales with what you reject: as MWCO falls, osmotic back-pressure and fouling resistance rise, so flux drops and ΔP climbs. NF is the "selective" sweet spot — it passes NaCl (low osmotic penalty) while holding SO₄²⁻/Ca²⁺ (*membrane02_NF_sugar*).

### Recovery vs scaling — the master trade-off

Higher single-pass recovery *r* shrinks capital and brine volume, but concentrates sparingly-soluble salts at the wall by the **concentration factor CF = 1/(1−r)**. At r = 0.75, CF = 4; at r = 0.90, CF = 10. Cap recovery so the **scaling saturation index stays below the threshold**: keep **LSI < 0 (or < +1.8 with antiscalant)** for CaCO₃ and **S&DSI / IAP-Ksp ratio < 0.8** for CaSO₄, BaSO₄, SiO₂ (<120 mg/L). This is exactly the recovery-vs-SI sweep in *optim04_membrane_recovery_scaling* and *membrane07_scaling_si* / *membrane08_softened_scaling* (softening lifts the ceiling). Typical r: **SWRO 35-50% per pass, BWRO 75-85%, NF 80-90%** with antiscalant.

### Crossflow, flux and polarisation

Concentration polarisation multiplies wall concentration by **CP = exp(Jw/k)**; keep it **< 1.3-1.5**. Push the mass-transfer coefficient *k* up with crossflow: spiral-wound feed-channel **superficial velocity 0.1-0.4 m/s** (Re 100-1000, spacer-filled), tubular/UF **2-6 m/s**. Design flux conservatively below the **critical/limiting flux**: **SWRO 12-17 LMH, BWRO 18-27, NF 15-40, UF 30-100**. Over-fluxing collapses *k* and locks in irreversible fouling. *membrane03_concentration_polarization* and *membrane04_spacer_schock_miquel* let you watch CP rise as velocity drops.

### Staging, trains, pretreatment

Spiral-wound elements are 8″×40″, ~37 m² each, 6-8 per pressure vessel. To hold velocity as permeate is removed, taper the **array (e.g. 2:1 → 6 then 3 vessels)**; add a **second pass** on permeate when you need <500 mg/L product. Run a tapered train in *membrane05_train*. Budget **per-vessel ΔP 1-3 bar** (replace at 15% rise). Always pretreat: MF/UF or coagulation to **SDI₁₅ < 3**, antiscalant, and cartridge filtration — fouling, not membrane area, sets RO lifetime.

## Solids processing & particle technology

Solids units are governed by the **particle**, not the molecule: crystal habit, size distribution and mechanical strength dictate every downstream choice. Always carry a target median size (d50) and span as design specs.

### Crystallisation route — pick by the solubility curve

The route follows how solubility varies with the achievable handle. Generate supersaturation (S = c/c*) gently: hold the **metastable zone width**, typically **Δc/c* ≈ 0.01–0.05** (S ≈ 1.01–1.05), so growth dominates nucleation and you get coarse, filterable crystals. Push S past ~1.1 and you nucleate a fine, hard-to-filter slurry.

| Route | Use when | Driving handle | Typical yield knob | Watch |
|---|---|---|---|---|
| Cooling | dc*/dT steep (>1 wt%/10 °C, e.g. KNO₃, KCl) | ΔT, 0.1–1 °C/min ramp | ΔT over solubility curve | wall encrustation; keep ΔT_wall<5–10 °C |
| Evaporative | flat solubility (NaCl, ~0.07 wt%/°C) | solvent boil-off | evaporation rate | scaling, foaming; vacuum to cut T |
| Antisolvent | high solubility, T-insensitive; heat-sensitive API | miscible non-solvent addition | solvent:antisolvent ratio | local high-S → fines; add slowly, well-mixed |
| Reactive/precip. | sparingly soluble product | reagent feed rate | stoichiometric excess | very fast nucleation → nanoparticles |

MSMPR sizing: mean residence **τ = 1–4 h**; the population balance gives d43 ∝ Gτ, so longer τ ⇒ bigger crystals at fixed growth rate G (~10⁻⁸–10⁻⁷ m/s). See `crystalliser02_msmpr` (population balance), `crystalliser06_nacl_antisolvent` and `crystalliser07_nacl_antisolvent_cooled` for combined routes.

### Solid–liquid separation — filtration vs centrifugation

Pick by particle size and solids fraction. Vacuum/pressure filtration suits **d50 > 10–20 µm**; below ~5 µm cake resistance explodes (specific cake resistance α rises) and you switch to centrifugation or add filter aid. Sedimenting centrifuges handle **Δρ > 50 kg/m³** and feeds too fine or too compressible to filter; decanters take 5–40 wt% solids, disc-stacks <5 wt%. Rule: filter when cake washing/dryness matters and particles are coarse; centrifuge when fines, fragile crystals, or fast throughput dominate.

### Dryer selection — by feed state and particle size

| Dryer | Feed | Product d50 | Residence | Notes |
|---|---|---|---|---|
| Spray | pumpable slurry/solution (<40% solids) | 10–200 µm | 5–30 s | hollow spheres; high T_gas but short → heat-sensitive OK. `sprayDryer01_sugar` |
| Fluid-bed | free-flowing granules | 50 µm–5 mm | 10–60 min | narrow size range; needs U above U_mf |
| Drum | viscous paste/slurry | flakes | 5–30 s | conductive, no carrier gas |
| Tray/batch | small lots, fragile | any | 2–24 h | cheap, labour-heavy |

`solidDryer01_sugar` shows a through-circulation solid dryer; `sprayDryer02_residence_sweep` sweeps τ vs moisture.

### Gas–solid separation & fluidisation velocities

Cyclones are the workhorse for **d > 5–10 µm**; below that, efficiency falls and you add a bag filter (`bagFilter01_dust`). Design the **inlet velocity to 15–25 m/s** (>30 m/s re-entrains/erodes; <10 m/s drops cut size); body-to-inlet ΔP ≈ 0.5–2 kPa, 4–8 inlet velocity heads. See `cyclone01_dust_removal`, `cyclone02_leith_licht`.

Superficial-velocity targets: **fluid-bed operate at 2–4×U_mf** (above minimum fluidisation, below terminal U_t to avoid carryover); **pneumatic conveying dilute-phase 15–25 m/s**; settling-chamber gas <3 m/s. Always check the actual U_mf and U_t from particle d and Δρ rather than trusting the ratio blindly — that is the glass-box hypothesis to run.

## Evaporation & multiple-effect

Evaporation concentrates a solution by boiling off solvent (usually water). The whole game is **steam economy** — kg water evaporated per kg live steam — and the way to raise it is to reuse each effect's vapour as the next effect's heating steam. **Hypothesis to run:** sweep the number of effects on Choupo's triple-effect case and watch economy climb while area and capital grow.

| Effects | Steam economy | Pick when |
|---|---|---|
| 1 | 0.8–0.95 | small duty, cheap steam, scaling/fouling service |
| 2–3 | 1.7–2.6 | medium duty — the common industrial choice |
| 4–6 | 3.5–5.0 | large water removal, expensive steam (sugar, paper, desal) |

Each added effect adds roughly **+0.8 kg evaporated per kg steam**. WHY it saturates: the available ΔT (steam T minus the vacuum/condenser T) is **split** across the effects, so each has a smaller driving force and needs more area. Capital ∝ effects while the economy gain shrinks — the optimum is usually **2–5 effects**.

| Feed arrangement | Direction | Use when |
|---|---|---|
| Forward | feed with steam | feed near boiling; simplest, no inter-effect pumps |
| Backward | feed counter to steam | cold or viscous feed (the hottest effect handles the thickest, lowest-viscosity liquor) |
| Mixed | hybrid | balance viscosity and economy |

**Boiling-point elevation (BPE):** dissolved solids raise the boiling point above pure water — a few °C when dilute, **15–25 °C** for strong NaOH or brine — eating into the ΔT and capping the last effect (Choupo's NaOH and sugar `evaporator` cases account for it). **Type selection:** falling-film for low-ΔT, heat-sensitive, low-viscosity service (high U); **forced-circulation** (pumped 2–3 m/s) for viscous, scaling, or crystallising liquors; agitated/wiped-film for very viscous. **Vapour recompression** (electric MVR, or TVR with a steam ejector) recycles the vapour's latent heat into the same effect — one MVR effect can match a 4–6-effect train when electricity is cheap relative to steam.

## Gas-liquid separators & process drums

Every flash, every reflux accumulator, every compressor suction line needs a vessel that lets vapour and liquid part ways. The physics is a settling race: a liquid droplet falls under gravity while the rising vapour drags it up. Size the vessel so the vapour goes slow enough that droplets above a cut size (~150 µm bare, ~10 µm with a mesh pad) rain out instead of carrying over.

**The Souders-Brown anchor.** The maximum allowable vapour velocity is `v_max = K·sqrt((ρ_L − ρ_V)/ρ_V)`. The square-root group is just the terminal-settling balance (gravity vs. drag); `K` (m/s) bundles droplet size, drag coefficient and a safety margin. The cross-section follows from `A = Q_V/v_max`, so K sets the diameter directly — get it wrong and you either spray liquid downstream or buy steel you didn't need.

| K-factor (m/s) | Service / condition | Why |
|---|---|---|
| 0.03–0.06 | No demister, bare gravity drum | Only ~150 µm+ drops settle; derate hard |
| 0.06–0.07 | Vacuum / low P (< 1 bar) | Low ρ_V makes the group large; cap velocity |
| 0.08–0.11 | Mesh demister pad, clean service | Pad coalesces 5–10 µm drops; run faster |
| ×0.7–0.8 | Foaming / fouling / glycol-amine | Foam re-entrains; cut K by 20–30 % |
| ×0.9 per | 0.5–1.0 m of disengagement below pad | Short disengaging height steals settling time |

Use the **vapour density at operating T,P**, not standard — a compressor suction drum at 5 bar has ~5× the ρ_V of atmospheric, shrinking `v_max` by ~2.2× and demanding more area than newcomers expect.

**Vertical vs. horizontal.** Choose by vapour-to-liquid loading and footprint.

| Pick | When | Why |
|---|---|---|
| Vertical | High vapour / low liquid; compressor **suction & K.O. drums**; tight plot | Settling distance = height is cheap to add; small liquid hold |
| Horizontal | High liquid load, large surge/holdup, **reflux accumulators**, slug catchers, 2 liquid phases | Big interfacial area per volume; long L for L-L decant; lower vessel |

For horizontal drums the disengagement area is `L·(D minus liquid level)`, so set the vapour space to ~40–50 % of the cross-section and check `v_max` against that reduced area.

**Geometry and holdup.** Aim for **L/D ≈ 3–5** (below 2 the heads dominate cost; above 6 it gets whippy and hard to support). Liquid **residence time 5–15 min** of working volume sets the length/level: ~5 min for a clean reflux drum feeding a good level controller, 10–15 min where downstream is a fired heater or compressor you must never starve or slug. Allow **vapour disengagement height ≈ 0.3·D or 0.45 m (whichever larger)** between the high liquid level and the inlet/demister, plus ~0.15 m mesh pad. Inlet nozzle momentum `ρ·v²` should stay **< 2250 kg/m·s²** (< ~1000 if no inlet device) or the jet shatters liquid faster than the pad can catch it.

**Glass-box hypotheses to run.** In Choupo a flash drum is just an `IsothermalFlash` at (T,P); the vapour and liquid rates it returns are your `Q_V` and holdup feed. Try `tutorials/steady/flash/flash01_benzene_toluene`: take the V and L rates, pick K = 0.08 (pad) vs. 0.04 (bare), and watch the required diameter roughly double when you drop the demister and halve K. Then re-flash at 5 bar and confirm the higher ρ_V forces a smaller `v_max` and a fatter drum — the Souders-Brown sqrt made visible.

## Heat exchangers — type selection & sizing

Pick the *type* first — it sets cost, U, and ΔP before you ever size area. The driving question is the **overall coefficient U**: a gas film (h ≈ 30–300 W/m²K) starves U, so the cheap-per-m² geometry wins; a clean liquid–liquid duty (h ≈ 1000–5000) lets you chase compactness and low ΔT_min.

### Type-selection table

| Type | Best service | U (W/m²K) | ΔP budget | T/P limit | Why |
|---|---|---|---|---|---|
| Shell-and-tube (TEMA) | Any phase, high P/T, fouling | 300–1200 (liq-liq), 30–300 (gas) | 0.3–0.7 bar | <40 bar, <600 °C | Rugged, mechanically cleanable, ASME default |
| Plate-and-frame (gasketed) | Clean liquid–liquid, close approach | 2000–7000 | 0.3–1 bar | <25 bar, <180 °C | Huge area/volume, ΔT_min ≈ 1–5 °C; gaskets limit T |
| Air-cooled (fin-fan) | Hot streams, no cooling water | 15–60 (bare-tube basis) | gas side ~0.005 bar | tube-side any | Saves water; approach to ambient ≥ 10–15 °C |
| Double-pipe | Small duty (<20 m²), high P, dirty | 300–1000 | flexible | very high P | Cheap, true counter-current (F=1) |
| Spiral | Slurries, fouling, viscous | 700–2500 | self-scouring | <20 bar | Single channel resists plugging |
| Printed-circuit (PCHE) | Very high P, compact (LNG, H₂) | 1000–5000 | tight | <600 bar | Diffusion-bonded; near-zero fouling tolerance |

### Gas-phase service

Shell-and-tube *still* makes sense for gas — but put the **gas on the shell side** with the gas film controlling, accept U ≈ 30–300, and expect large area. For sensible gas cooling against ambient, **air-cooled** usually beats shell-and-tube + cooling-water tower on TAC once duty > ~0.5 MW. For gas–gas (e.g. feed/effluent), a plate-fin or PCHE recovers heat that a shell-and-tube cannot economically reach.

### Allocation & velocities

Put on the **tube side**: the dirtier, higher-pressure, more-corrosive, or lower-flow stream (easier to clean, cheaper to alloy small tubes).
- Tube-side liquid: **1–2.5 m/s** (>1 m/s suppresses fouling; <3 to limit erosion; <1.5 for SS to avoid erosion-corrosion).
- Shell-side liquid (cross-flow): **0.3–1 m/s**.
- Gas, tube or shell: **10–30 m/s** (process gas), up to 30 m/s for low-density vapour; chase the gas film, watch ΔP.
- Condensing vapour: keep below ~50% of erosion velocity; flooding governs.

### Phase-change service

- **Condensers**: prefer shell-side condensation (vapour on shell, coolant in tubes); U ≈ 800–1500 for organics, 1500–4000 with steam. Total condenser → ΔT driven; allow vapour velocity de-rating.
- **Reboilers**: kettle (U ≈ 800–1200) for wide turndown and dirty bottoms; thermosiphon (U ≈ 1000–1500) cheaper but needs ΔT > a few °C and stable circulation. Cap heat flux below the **critical ~30–40 kW/m²** to dodge film boiling. See Choupo `tutorials/steady/distillation` (condenser/reboiler duties) and `tutorials/steady/heatTransfer`.

### ΔT_min, LMTD correction, fouling

- **ΔT_min**: 10–20 °C for hot utility/gas, 5–10 °C liquid–liquid, 3–5 °C refrigeration (energy vs area trade-off — verify via Choupo pinch composite curves).
- **LMTD correction F**: keep **F > 0.8**; F < 0.75 means add shell passes (2-4, 4-8) or go pure counter-current.
- **Fouling**: add R_f ≈ 0.0002 (clean liquid) to 0.0005–0.001 m²K/W (cooling water, fouling organics); this can dominate 1/U and is why a glass-box run should report the clean-vs-fouled area split.

## Heat integration & pinch analysis

Heat-exchanger SELECTION sizes one match; pinch analysis decides which streams should match AT ALL and sets the energy target before any network is drawn. It is the highest-leverage utility-saving tool — typically **20–30% off the energy bill** versus a naive design. **Hypothesis to run:** build the composite curves in Choupo's Pinch view and read the targets before placing a single exchanger.

**Composite curves and the pinch.** Combine all hot streams into one composite (T vs ΣCp·ΔT) and all cold streams into another; slide them together until the closest vertical approach equals **ΔT_min**. That point is the **PINCH**; the overshoots are the minimum hot and cold utilities (the **MER targets**), fixed before design.

| Service | ΔT_min | Why |
|---|---|---|
| Liquid–liquid | 10 °C | default; balanced area vs energy |
| Process with a gas stream | 20–40 °C | low U → area explodes at small ΔT |
| Refrigerated / cryogenic | 3–5 °C | cold is expensive; pay area to save it |
| Near a furnace / high-grade heat | 20–60 °C | high-grade heat is cheap relative to area |

Supertargeting plots total cost vs ΔT_min and picks the flat minimum (often **8–15 °C** for fluids).

**The three golden rules** — break any and you spend MORE than the target:
1. **No heat across the pinch** — a cross-pinch exchanger adds the same amount to BOTH utility bills.
2. **No hot utility below the pinch** — below it there is a heat surplus; adding heat just needs more cooling.
3. **No cold utility above the pinch** — above it there is a deficit; cooling there just needs more heating.

**The grand composite curve (GCC)** plots surplus/deficit vs shifted T: read it to place utilities at the RIGHT level — pick the cheapest steam/refrigerant the pockets allow, spot an intermediate utility (cheaper MP steam, or raising steam from recovered heat), and see where a fired heater or molten salt is GENUINELY needed versus where recovered heat suffices.

## Fired heaters & furnaces

Reach for a fired heater when the duty is large (>3 MW) or the process temperature is above what your hottest utility can deliver. HP steam tops out near 250 C and 40 bar; HiTec molten salt reaches ~535 C; Dowtherm A ~400 C. Above that — crude-unit charge heaters (350-400 C), reformer feed, vacuum-tower heaters, reboilers on high-boiling bottoms — you must burn fuel directly, because the WHY is simple: a flame radiates at 1500-1900 C, so it can drive heat across a tube wall that no recirculated fluid can. Below ~535 C and a few MW, molten salt or fired-salt loops usually win on safety and turndown; don't fire directly if a utility reaches the target.

**Two heat-transfer zones, by mechanism.** The RADIANT section (firebox) absorbs 60-75% of the duty by flame radiation; tube-wall view factor and flame emissivity dominate, so the design knob is *flux*, not area. The CONVECTION section above it scavenges 25-40% of the duty from 700-900 C flue gas by convection over finned/studded tubes, dropping stack gas to 150-250 C. The split exists because radiant flux is capped: push too hard and you coke the film.

| Heater type | Duty range (MW) | Typical use | Radiant flux (kW/m2) | Why pick it |
|---|---|---|---|---|
| Vertical-cylindrical | 0.5-20 | Small/medium, plot-limited | 25-35 | Cheapest, smallest footprint, uniform firing |
| Box (cabin), horizontal tubes | 10-100 | Crude/vacuum charge, reboil | 30-40 | Big duty, even flux, many burners |
| Box, two-fired cell | 50-300+ | Reformers, ethylene cracking | 35-50 (cracking, short residence) | Highest duty, double-fired uniformity |
| Cylindrical helical-coil | 0.5-10 | Hot-oil / salt heaters | 20-30 | Compact, low-fouling clean service |

**Radiant flux — the master rule.** Design average radiant flux 30-40 kW/m2 (some references 25-45). Go higher and the *peak* local flux — typically 1.5-2x the average — drives the tube-wall film over its coking threshold (~430 C for crude oil, lower for residue), laying down coke that insulates, raises tube metal temperature, and shortens runlength. Average flux is therefore a runlength decision, not just an area decision: halving flux can double time-between-decokes.

**Efficiency, excess air, draft.** Thermal efficiency 75-82% bare; 85-92% with an air preheater recovering stack heat. Each 20 C of stack-gas drop is worth ~1% efficiency, and 1% excess-air reduction another ~0.5%. Run 10-15% excess air on gas, 15-25% on oil — enough to complete combustion, not so much you heat nitrogen up the stack. Draft: natural (buoyant stack, simplest, cheap) for small heaters; forced or balanced draft once you add an air preheater (the preheater's pressure drop demands a fan). Keep a slight negative draft (-2 to -5 mm H2O) at the arch so flue gas leaks in, not flame out.

**Tube metallurgy sets the limit.** Specify tubes by metal temperature = process T + flux-driven ΔT (50-100 C) + fouling margin: carbon steel to ~400 C, 1.25Cr-0.5Mo to ~550 C, 9Cr-1Mo to ~650 C, HK/HP cast austenitics to 1000 C+ for reformers. NOx scales with flame temperature — low-NOx burners (staged air/fuel, flue-gas recirculation) cut it to 30-50 ppm but lengthen the flame, so check flame-to-tube clearance. Hypothesis to run in Choupo: model the heater as a W-equivalent duty against a fired-fuel stream, then sweep excess air and stack temperature to watch efficiency and fuel firing rate move — confirm each 20 C stack drop buys ~1%.

**Why the tubes do not melt at a 1900 °C flame.** Students reasonably ask how steel survives a flame far above its melting point. The answer: **the tube never sees the flame temperature.** The process fluid races through the inside and carries the heat away continuously, so the tube wall sits at roughly **process-T plus a small film rise** — typically **400–600 °C metal**, not 1900 °C. The radiant flux (30–40 kW/m²) is balanced by the inside film: the film rise = flux / h_inside is only **30–120 °C** for a fast liquid (h ≈ 1000–3000 W/m²K). The flame's heat is real, but it is removed as fast as it arrives.

XFIGFURNACEX

Two lessons: (1) the metallurgy is specified for the **tube-metal temperature**, not the flame (carbon steel ~400 °C, 9Cr-1Mo ~650 °C, cast HK/HP austenitics to ~1000 °C); the firebox walls are protected by **refractory** lining, not bare metal. (2) If the process flow STOPS or drops (pump trip, coking), the heat is no longer removed and the tube temperature runs away in **seconds** — the tube ruptures. That is why a fired heater carries a **low-flow trip** and the flux is capped: a hot tube with no flow is the classic furnace failure.

## Compressors, expanders & pressure change

Gas pressure change is governed by *volumetric flow at suction* and *required pressure ratio* `r = P_out/P_in` — not mass flow. Because gas density falls as you compress, machine choice tracks **actual inlet m³/h** and `r`, then degrades to the next type as flow rises or `r` falls. Treat every heuristic below as a hypothesis: run the case in Choupo, read `W_shaft` and discharge T, and check you stayed inside the box.

### TYPE SELECTION

| Type | Inlet flow (actual m³/h) | r per body | Typical η_poly | Why / physics |
|---|---|---|---|---|
| Fan / blower | 10³–10⁶ | <1.1 (fan), <2 (blower) | 0.55–0.75 | Low Δp; cheap; r limited before it becomes a "compressor" |
| Centrifugal | 1,700–340,000 | 1.5–3 per wheel, ~10 multi-stage | 0.75–0.85 | Dynamic; smooth, oil-free, high flow; surge limits turndown |
| Axial | >65,000 | 1.2–1.5 per stage | 0.80–0.88 | Highest flow, best η; narrow operating window |
| Reciprocating | <16,000 | up to 5–10 per stage | 0.75–0.90 | Positive-displacement; best for high r, low flow, high P (>200 bar) |
| Rotary screw | <5,000 | 3–4 (up to ~8 oil-flooded) | 0.70–0.78 | Robust, dirty/wet gas, modest r; oil carryover |

### Stages, ratio per stage & intercooling

Split `r` across N stages with **equal ratio per stage** `r_stage = r^(1/N)`, kept to **~2–4** (cap ~4 for recips, ~3 for centrifugals). Equal ratios minimise total shaft work and equalise per-stage discharge T. The driver of staging is the **discharge-temperature limit**: keep `T_out ≲ 150–175 °C` (lube-oil coking, gasket and rod-packing life; ~200 °C absolute ceiling). Adiabatic `T_out = T_in·r_stage^((γ−1)/(γη))`, so a single jump from 1→16 bar on a γ≈1.3 gas blows past 250 °C — unacceptable. **Intercool back to ~40 °C** between stages: this cuts the next stage's volumetric work (you compress colder, denser gas) and typically saves 10–20 % total power for `r > ~5`. Pair an intercooler with a knock-out drum — cooling condenses water/heavy ends that would erode the next stage. In Choupo, model each stage as a `compressor` (W_shaft + η) feeding a cooler + flash; cooling-water or chilled-water utilities by T-level supply the intercooler duty.

### Efficiency, surge & turndown

Quote **polytropic** efficiency (0.75–0.85 centrifugal, up to 0.88 axial) for design — it is path-independent and additive across stages, whereas isentropic η drifts with `r`. Multiply by ~0.95 mechanical to get brake power. Dynamic machines **surge** at ~60–70 % of design flow (flow reversal, violent oscillation), so usable **turndown is only to ~70 %** without recycle/anti-surge; recips turn down to ~25 % via clearance pockets or speed. Size with ~10 % flow margin above the surge line.

### When an expander pays back

If a hot, high-P stream must be let down (≥3–4 bar drop, ≥a few hundred kW recoverable), replace the throttle valve with a **turbo-expander** (model as `turbine`, W_shaft + η≈0.80–0.85). Recovered shaft work directly drives a generator or a companion compressor (common in refrigeration, FCC flue-gas, cryogenic N₂). The trade-off: expansion chills the stream (Joule–Thomson + work extraction), so verify you don't cross a dew/freeze point — a glass-box run shows the outlet T before you commit hardware.

## Drivers: electric motors, steam & gas turbines

A pump or compressor is only as available as the machine that turns it. The *driver* is a separate selection from the hydraulic/thermodynamic duty: pick it by shaft power, by what HP steam or fuel gas the plant already has, and by what must keep running when the grid trips. In Choupo the rotating unit carries `W_shaft + eta`; the driver question is *where that shaft power comes from* and at what reliability.

**Rule — electric motor is the default below ~0.5–1 MW.** Standard TEFC induction motors are cheap, compact, ~93–97% efficient, and need no auxiliaries. WHY the ceiling: above ~1 MW you move to medium-voltage (4.16 kV+) switchgear and the incremental $/kW of motor + variable-frequency drive (VFD) climbs, while a steam turbine that *also* lets HP steam down to a useful level starts to win on combined steam-balance economics. Hypothesis to run: size the motor at ~110–125% of `W_shaft/eta_pump` (service factor + driver-train losses), then check the plant power bill at ~$0.06–0.10/kWh.

**Rule — steam turbine when HP steam exists, for very large duty, or as a trip-proof spare.** A back-pressure turbine taking HP→MP/LP steam "pays" for shaft work by letting steam down a pressure level you needed anyway — marginal cost is only the lost power-generation credit, so isentropic efficiency of 65–80% (small) to ~85% (large) is acceptable. A condensing turbine (exhaust to ~0.1 bar) maximises work but dumps ~2 MJ/kWh of latent heat to cooling water. Critically, a steam turbine keeps spinning on a grid blackout, so the boiler-feedwater pump and reactor-quench pump are classically *steam-turbine-driven spares* on a motor-driven main (or vice-versa).

**Rule — gas turbine only for very large power + heat (combined heat-and-power).** Below ~5 MW the heat-rate and capital rarely justify it; above ~10–15 MW a gas turbine with a heat-recovery steam generator delivers shaft power *and* the HP steam header — the cogeneration case Choupo models with steam utilities by T-level.

| Driver | Sweet-spot power | Efficiency | Pick it WHEN | Watch-out |
|---|---|---|---|---|
| Electric motor (fixed-speed) | < 0.5 MW | 93–97% | small/medium duty, throttled or constant flow | dumps control margin across a valve |
| Electric motor + VFD | 0.1–5 MW | 90–95% (incl. drive) | flow varies > ±20% | drive cost, harmonics, ~3–5% drive loss |
| Back-pressure steam turbine | 0.5–15 MW | 65–85% isentropic | HP steam available, want MP/LP let-down | power tied to steam demand |
| Condensing steam turbine | 1–30 MW | 70–85% isentropic | large duty, run-on-trip spare | condenser + cooling-water latent load |
| Gas turbine (CHP) | > 10 MW | 30–40% (≈80% w/ HRSG) | huge power + process steam | fuel-gas spec, NOx, hot-day derate |

**Rule — variable speed beats throttling when flow turndown exceeds ~±20%.** Power scales ~speed³ on a centrifugal machine, so trimming flow by slowing the driver saves far more than burning the surplus head across a control valve. WHY not always: a VFD adds ~3–5% standing loss and capital, so for near-constant flow a fixed-speed motor + control valve is cheaper and simpler.

**Rule — spare to n+1 on critical service.** Install one extra parallel machine (e.g. 3×50% pumps, run 2) so a single failure or maintenance outage does not stop the plant; mix drivers (one motor, one turbine) so a *common-mode* loss — grid or steam — still leaves one runner. Verify by toggling a unit offline and re-running the flowsheet: does the remaining capacity still meet duty?

## Fluid transport, line sizing & hydraulics

Moving fluid costs capital (pipe + driver) and power (friction). Every rule below trades a *bigger pipe / lower velocity* (more steel, less ΔP, less erosion) against a *smaller pipe / higher velocity* (cheap, but pumping power and noise climb as ~v²·⁸). Pick the driver by **pressure-ratio first, then flow**.

### Driver selection by pressure ratio

| Service | Δp / ratio | Pick | Why (glass-box) |
|---|---|---|---|
| Incompressible liquid | any head | **Pump** (centrifugal <~3500 m, recip/PD for low-flow high-head, viscous, or metering) | ρ≈const → head, not ratio, is the variable |
| Gas, ΔP < 0.03 bar | ratio ≈1.0–1.03 | **Fan** | ρ change negligible, treat as incompressible |
| Gas, 0.03–3 bar | ratio ~1.03–1.3 | **Blower** (one stage) | mild heating, no intercool |
| Gas, ratio > ~1.3 | up to ~3–4/stage | **Compressor** (centrifugal; recip for very high ratio/low flow) | T_out rises with ratio^((γ−1)/γ) → **stage + intercool if total ratio > ~4** |

Multi-stage rule: keep per-stage ratio ≈ (total ratio)^(1/N) so each stage does equal work and discharge T stays below ~150–200 °C (lubricant/material limit). See `tutorials/steady/rotating/compressor01_air` and the multi-stage logic behind `compressorTurbine01_turbo_booster`; pumps in `pump01_water` / `pump02_pressure_spec`.

### Recommended superficial velocities

| Line / service | v (m/s) | Note |
|---|---|---|
| Pump **suction** (liquid) | 0.5–1.5 | low to protect NPSH; ΔP_suction is precious |
| Pump **discharge** / process liquid | 1.5–3 (up to ~4.5) | economic optimum; >4 erosion-corrosion risk |
| Liquid, viscous/slurry | 0.5–1.5 | keep below settling; above abrasion limit |
| Gas / vapour, atmospheric–low P | 15–30 | density-limited |
| Gas, high pressure | 10–20 | ρ high → same ρv² at lower v |
| Steam (sat./superheat) | 20–40 (to 60) | erosion + wet-steam wire-drawing |
| Two-phase / flashing | 10–25 | avoid slug/annular; check ρv² < ~6000 kg/m·s² |

The economic optimum tracks **constant ρv²** (kinetic head), which is why dense fluids run slower. A quick screen: **v_econ ≈ 2 m/s liquid, 20 m/s gas**, then verify ΔP in `tutorials/steady/hydraulics/pipe01_water_line`.

### Economic pipe diameter & ΔP budget

- Rough optimum: **D_econ ≈ 0.26·ṁ^0.5·ρ^−0.37** (m, SI) for turbulent steel — the balance of pipe capital vs pumping power.
- **ΔP budget:** liquid lines **0.2–0.5 bar per 100 m** (≈0.5 kPa/m); gas lines **0.1–0.2 kPa/m**; long pipelines push lower (0.05). Total pump head = static lift + friction + equipment + **control-valve allowance**.
- **Control-valve ΔP:** allocate the *larger* of **20–33 % of dynamic (friction) ΔP** or **~0.7 bar (10 psi)**, so the valve keeps authority at high flow. Too little → loop goes open-loop; too much → wasted head.

### NPSH (the pump killer)

Require **NPSH_available − NPSH_required ≥ 0.5–1 m** margin. NPSH_a = (P_suction − P_vap)/ρg + static head − suction friction. Levers: raise the suction vessel, fatten/shorten suction line (low v, see table), subcool, or cut speed. Hot/near-boiling liquids (reboiler bottoms, deaerator) are the classic cavitation traps — design suction generously.

**Always run it:** these are *hypotheses* — size the line, then let Choupo print the actual ΔP, T_out and head so the chosen velocity and driver prove themselves.

## Control valves, pressure letdown & choking

A control valve is a deliberate, adjustable restriction — you spend pressure to gain control. Two questions fix the hardware: which valve body and trim, and whether the drop is so large it CHOKES.

| Valve | Rangeability | Use when |
|---|---|---|
| Globe (single / multi-stage trim) | 20–50:1 | throttling — the default; high ΔP; anti-cavitation / low-noise trim available |
| Ball / segmented | 100–300:1 | high rangeability, slurries, on-off-to-throttle |
| Butterfly | 20–50:1 | large lines, low ΔP, cheap |

Pick the **inherent characteristic** to linearise the loop: **equal-percentage** when most of the system ΔP is elsewhere (the common default — valve gain rises with flow to offset its falling ΔP); **linear** when valve ΔP dominates; **quick-opening** for on-off. Liquid sizing (non-flashing): Q = Cv·sqrt(ΔP/SG); size for ~80% open at max flow and ~20% at min, so the plug never sits on the seat (no control) or wide open (no margin).

**Choking — the answer to "is a big letdown done in one stage?"**

XFIGCHOKINGX

For a GAS, flow does NOT keep rising as you drop the downstream pressure. Once the pressure ratio falls below the **critical ratio** — r_c = [2/(γ+1)] raised to [γ/(γ−1)], ≈ **0.5 for most gases** (0.53 for air) — the velocity at the vena contracta reaches the speed of sound and the valve **CHOKES**: mass flow saturates and the surplus ΔP is dumped as **noise (often > 110 dB), vibration and erosion**. Discharging 50 bar → 1 atm is a ratio of 0.02, i.e. deeply choked.

So a single standard valve CAN pass the flow, but across a deeply choked drop it screams, erodes its trim and shakes the pipe — which is why a large letdown is usually **staged**:

| Letdown situation | Do this |
|---|---|
| Small gas ΔP, sub-critical | one globe valve |
| Large gas ΔP, choked | multi-stage / labyrinth trim, or valves in series, + a downstream silencer (each stage takes a sub-critical drop) |
| Liquid, P₂ > Pvap | standard trim |
| Liquid, P₂ < Pvap (flashing) | the liquid flashes/cavitates and imploding bubbles pit the trim — use anti-cavitation (multi-step) trim, harden it, or flash on purpose into a drum |

Rule of thumb: stage it when the predicted noise exceeds ~85–90 dBA or the trim-exit velocity is high. The glass-box check: drop the pressure across a `valve` in Choupo and read the outlet T and phase — a flashing liquid shows up as a vapour fraction at the outlet before you ever buy the trim.

## Refrigeration & vacuum systems

Cold and vacuum are *bought power*. Both reject heat or pull gas against the ambient, so the design instinct is the same: **climb only as far down the ladder as the duty forces you, because every rung multiplies the shaft work.**

### Refrigeration — pick the warmest level that works

Cooling water (CW) leaves a tower at ~30 C and can chill a process stream to ~35-40 C (10 C approach). The moment you need a process temperature **below ~40 C you have left the free zone** and pay for a compressor. The reason is the reverse-Carnot ceiling: ideal COP = T_cold/(T_hot−T_cold). Reject to 40 C cooling water and the COP collapses as the cold level drops — so shaft work per unit of cooling *rises* the colder you go.

| Cold level needed | Medium | Refrig. T (C) | Ideal COP (reject ~40 C) | Real shaft kW per kW cooling |
|---|---|---|---|---|
| > 40 C | Cooling water | n/a | — | ~0 (pump only) |
| 5-15 C | Chilled water | ~5 | ~6 | 0.15-0.25 (4-7 kW/kW) |
| −40 to 0 C | Ammonia / propane | −35 | ~2.5-3 | 0.30-0.45 (2-3 kW/kW) |
| −70 to −40 C | Propylene | −45 | ~2 | 0.45-0.55 |
| −100 to −70 C | Ethylene (cascade) | −90 | ~1.3 | 0.6-0.9 (~1.3 kW/kW) |
| < −100 C | Ethylene/methane cascade | −150 | < 1 | > 1 |

**Rule of thumb:** budget **~1 kW shaft per 3-5 kW of cooling** at the −40 to 0 C levels, climbing past ~1 kW/kW below −100 C. A single-stage cycle is fine for a ~40-50 C lift; beyond that, **cascade** (ethylene rejecting into propylene rejecting into CW) because one compressor over a 5:1+ pressure ratio runs hot and inefficient. In Choupo the refrigeration compressor is just a `compressor` (W_shaft + eta) feeding the cold side of an exchanger; the warm reject side is `coolingWater`, so the power penalty appears explicitly in the work ledger — model it, don't assume it.

**When to refrigerate (not before):** a low-temperature condenser to recover a light product (C3/C2 overhead), a cold separator to hit a vapour-loss spec, or a reactor that must run cold for selectivity. Always ask first whether **higher pressure** buys the same condensation at a CW level — compressing the overhead is often cheaper than chilling it.

### Vacuum — match the pump to the absolute pressure

Vacuum distillation earns its keep when the bottoms would **thermally crack or polymerise** at the atmospheric boiling point (heat-sensitive: glycols, fatty acids, monomers, vacuum gas oil). Dropping to **0.05-0.1 bar (40-75 mmHg)** can cut boiling points by 80-150 C, keeping the reboiler below the degradation limit and off the high-T utilities (Dowtherm A / fired heaters). Below ~0.1 bar the **column diameter balloons** (vapour density falls, so allowable mass velocity drops); use low-pressure-drop structured packing, not trays.

| Absolute pressure | Technology | Notes / WHY |
|---|---|---|
| 1-0.1 bar | Liquid-ring pump | Rugged, tolerates condensables; service water sets the floor (~30-50 mmHg) |
| 0.1-0.01 bar | Single-stage steam ejector | No moving parts, uses MP/HP steam; cheap but steam-hungry |
| < 0.01 bar (to ~1 mmHg) | 2-3 stage ejectors w/ intercondensers | Stages compound the ratio; condensers cut steam load |
| Clean, deep, dry | Dry screw pump | Electric, no steam/water effluent; higher capex, watch for fouling |

Size ejector **motive steam by the air/leakage load**, not the process vapour — a few kg/h of inleak through flanges sets the bill, so a tight column beats a big ejector.

## Storage & intermediate tanks

Storage is inventory bought with steel: too little and a late truck or a tripped upstream unit starves the plant; too much and you pay for tankage, land, and a larger fire/spill exposure. Size by **days of stock** tied to the *logistics* of each stream, then pick a roof that matches the volatility. Run the hypothesis in Choupo by feeding the tank's design flow into a flash drum at storage T,P and watching the vapour fraction — if `vf > 0` you have a breathing/venting problem a cone roof cannot hold.

**Sizing by days of stock (the WHY = decoupling time-scale):**
- **Raw materials:** ~**7-30 days**. The driver is delivery reliability and shipment size — rail/marine (large parcels, long lead) push to 20-30 days; reliable pipeline or daily truck supply drops to 3-7. Hold enough that a missed delivery does not stop the reactor.
- **Products:** ~**7-30 days**, set by shipping cadence and demand swing. A monthly tanker means ~30 days plus working heel; spot-truck sales need only a few days.
- **Intermediate / surge:** **hours to ~2 days**. Purpose is to *decouple* two units so a transient in one does not propagate. Rule of thumb: **5-15 min** of holdup for pump-suction/control surge, **0.5-2 days** between batch and continuous sections (e.g. a reactor feeding a continuous still). More surge = looser control coupling but slower composition response and more off-spec inventory if upstream drifts.

Tank **working volume** = days × daily throughput, then divide by the **fill fraction**: never design to the brim. **Fill ~85-90%**, leaving **10-15% ullage** for thermal expansion (a 30 °C swing on a hydrocarbon adds ~3-4 vol%), foam, and high-level-alarm margin. Overfill is a top cause of major releases (Buncefield), so the ullage is a safety budget, not slack.

**Type selection (volatility & pressure drive the roof):**

| Tank type | Best for | Pressure / vapour-pressure range | Typical size | Why |
|---|---|---|---|---|
| **Cone (fixed) roof** | Non-volatile liquids: water, heavy oils, glycols, most products with RVP < ~10 kPa | Atmospheric, near-zero gauge | up to ~10,000 m³ | Cheapest; vapour space breathes in/out — fine when there's little vapour to lose |
| **External floating roof** | Volatile liquids: gasoline, naphtha, light solvents (RVP ~10-80 kPa) | Atmospheric | ~1,000-100,000 m³ | Roof rides on the liquid → **no vapour space**, cuts breathing/standing losses by ~95% vs cone roof; emissions + fire-risk reduction |
| **Internal floating roof** | Volatiles needing weather/rain protection | Atmospheric | medium | Floating deck under a fixed roof — losses control plus debris exclusion |
| **Sphere (Hortonsphere)** | LPG, propane, butane, light ends | ~2-18 barg (vapour pressure > atm) | ~1,000-10,000 m³ | Sphere carries pressure with minimum steel/area; even stress distribution |
| **Bullet (horizontal cylinder)** | Smaller pressurised stock: LPG, NH₃, light ends | ~5-25 barg | < ~500 m³ | Cheaper than a sphere below ~200-500 m³; easy to transport and mound |

**The crossover rule:** if the stored fluid's true vapour pressure exceeds atmospheric at the *hottest* expected ambient (summer-skin ~45 °C), it **cannot** sit in an atmospheric tank — it must go pressurised (sphere/bullet). Between non-volatile and pressurised lives the floating-roof band, chosen to cut working+breathing losses you would otherwise vent or send to a flare/recovery unit. Always state the range and let throughput, RVP, and emissions cost decide — there is no single right tank.

## Process control & instrumentation heuristics

A flowsheet that balances on paper still must hold steady against disturbances. The Pareto question is not tuning — it is **what to pair with what**. Choupo's `choupoCtrl` + PID lets you test a pairing on a dynamic case before you trust it. **Hypothesis to run:** step a disturbance in `ctrl01` and watch whether your loop rejects it or fights another.

**Inventory first.** Control every inventory (level, pressure) before any quality — an unbounded inventory shuts the plant down.

| Controlled variable | Manipulate | Why |
|---|---|---|
| Level (drum, sump, tank) | the OUTflow | self-regulating; never control level by an inflow that sets production |
| Pressure (vapour) | vent / vapour outflow / condenser duty | fast; pins the vapour inventory |
| Feed flow / throughput | the feed valve directly | the master production handle |
| Reactor / column temperature | coolant or steam duty | the quality proxy |
| Column composition | a sensitive tray TEMPERATURE | direct composition is slow/expensive; tray T tracks it |

**Tuning starting points.** Process PID is **mostly PI** — derivative amplifies noise, so add D only on slow, lag-dominated (temperature) loops. Flow loops: fast and tight. Level loops: loose/averaging (the tank is a buffer). Use the open-loop step (gain, dead time θ, time constant τ) with an IMC/λ rule rather than trial and error.

**Structure beyond single loops.**
- **Cascade** when a fast inner disturbance exists (jacket-T inside reactor-T rejects coolant upsets early).
- **Feedforward** when a disturbance is MEASURED (feed rate/composition) — act before the error appears, trim with feedback.
- **Ratio** to hold two streams in proportion (stoichiometry, reflux, fuel/air).
- **Override / constraint** to ride a limit (max T, min level) safely.

**Pairing discipline:** pair each manipulated variable with the controlled variable it affects most directly and with least interaction (a near-1 relative gain). Two loops that fight oscillate — the glass-box dynamic run shows it at once. Keep DOF honest: one independent manipulated variable per controlled variable, no more.

**Equipment-specific schemes.** Beyond single loops, each unit has a conventional strategy.

XFIGCOLCTRLX

*Distillation* is the hard one: a column has **five** handles (condenser duty, distillate D, reflux L, boilup V, bottoms B) and **five** things to hold (pressure, reflux-drum level, sump level, a top and a bottom composition). Pressure is fixed first (condenser duty or a vent). Each level MUST then be held by an OUTFLOW — and the rule is **control a level with the LARGER stream leaving that drum**: if the reflux ratio R = L/D is high, reflux is the big stream, so hold reflux-drum level with reflux and set D for composition (the "LV" vs "DV" choice). Composition is inferred from a **sensitive tray TEMPERATURE** (fast, cheap) instead of a slow analyser. **Single-end** control (hold one composition, let the other float) is the robust default; **dual-composition** control saves energy but the two loops interact strongly (high relative gain) and usually need decoupling — which is exactly why students find column control hard. *Reactor:* temperature by coolant/steam duty, usually **cascade** (jacket-T inner, reactor-T outer). *Compressor:* an **anti-surge** recycle loop keeps flow above the surge line. *Fired heater:* outlet T trims the fuel, with an air/fuel **ratio** loop and a **low-flow trip** to protect the tubes.

## Pressure relief, flare & safety basics

This is a Pareto orientation, not a safety course. The governing standards are **API STD 520/521/526** (sizing, scenarios, devices) and **API STD 537/NFPA 30**; treat the numbers below as where-to-start hypotheses, then run the controlling case.

**When a device is mandatory.** *Every* closed volume that can be isolated and over-pressured needs an independent overpressure-protection device — no exceptions for "small" vessels. The trigger is the credible-cause inventory, not size. A relief device is the last line of defence: it must work with zero operator action and zero instrument power, which is why a spring-loaded PSV (or rupture disc) is preferred over an instrumented trip for the primary case.

**Set vs design pressure (the WHY).** Design pressure is set ABOVE the maximum operating pressure so the PSV does not weep on normal swings. Heuristic: **design P = max(1.1 × operating P, operating P + 1.7 bar)**; for vessels under ~7 barg the +1.7 bar floor dominates, above it the +10% rule does. The **PSV set pressure = design pressure (MAWP)**. Code allows accumulation above set — typically **+10%** for a single non-fire device, **+16%** for multiple devices, and **+21%** for the fire case — because momentary overshoot during full relief is tolerable but permanent yield is not.

**Sizing scenarios — size for the worst credible single cause (API 521).**

| Scenario | Typical controlling load | Why / note |
|---|---|---|
| External fire | Wetted-area heat input ≈ **43–70 kW/m²** (q = 43.2·F·A^0.82, SI) | Often controls vessels with large liquid inventory; sets a large orifice |
| Blocked outlet | Full pump/compressor/feed flow at shut-in | Common control case for pumped/compressed systems |
| Thermal expansion | Liquid trapped between two valves, heated | Tiny relief (¾"×1") — but mandatory; cheap to forget |
| Tube rupture (HX) | High-P side leaks to low-P side; full ΔP flow | The "2/3 rule": if low-side design P < 2/3 high-side, must relieve |
| Control-valve failure / loss of cooling | Failed-open bypass, reflux/condenser loss | Check fail-safe action of each valve |

Size each, then **the largest required orifice wins**; pick the next standard API-526 letter orifice (D through T).

**PSV vs rupture disc.**

| Device | Use when | Trade-off |
|---|---|---|
| Spring PSV | Reclosing wanted; clean service | Reseals, testable; can weep, can plug/foul |
| Rupture disc | Fast/large relief, fouling/corrosive, polymerising | Non-reclosing (full loss of inventory); cheap |
| Disc + PSV in series | Corrosive service needing reseal | Disc isolates/protects the PSV; best of both |

**Disposal — flare vs vent.** Vent to atmosphere only if the relieved fluid is **non-toxic, non-flammable** at grade and the discharge disperses safely (e.g. steam, air, inert). Flammable/toxic streams route to a **closed flare header → knockout drum → flare**, sized so flare-tip exit velocity stays below ~**0.5 Mach** and grade-level radiation stays under **~6.3 kW/m²** at the fence (API 521). Choupo models the relieved stream as a flash to header pressure; the **PSV-vent enthalpy and flare duty appear in the first-law ledger**, so the energy of blowdown is visible, not hidden.

**Spacing/segregation (Pareto).** Fired heaters and flares are ignition sources — keep **~15 m** from process units handling flammables; locate control rooms and the flare upwind/away. These setbacks are an insurance-grade default (IRI/GAP, API 521 §5), refined later by a dispersion/QRA study.

**Governing standards — go to the source; lives depend on it.** This section is an orientation only; the binding requirements live in, among others: pressure relief — **API STD 520 & 521**, tank venting — **API STD 2000**, overpressure protection — **ASME BPVC Section VIII** (UG-125+) and **Section I** (boilers); relief-device specs — **API STD 526**; flares — **API STD 521 & 537**; process-safety management — **OSHA 29 CFR 1910.119** and the **AIChE/CCPS** guideline series; functional safety / SIS — **IEC 61508 & 61511**; hazard-study method — **IEC 61882 (HAZOP)**; flammable liquids — **NFPA 30**; electrical area classification — **NFPA 70 / IEC 60079**; facility siting — **API RP 752/753**. Size and select to the standard, then have it independently reviewed. See the Disclaimer & scope at the front of this guide.

## Effluent treatment — liquid & gaseous

Every flowsheet has a back door: the streams you do NOT sell. Design them with the same care as the product train — environmental limits are *legal* limits, and an untreated vent or outfall can shut a plant down. **Hypothesis to run:** before sizing any treatment, MINIMISE the load at source (recycle, substitution, leak reduction) — the cheapest effluent is the one never made.

### Liquid effluent (wastewater)

A train of increasing cost and specificity; stop when you meet the discharge limit (typically COD, BOD, suspended solids, pH, oil & grease, specific toxics):

| Stage | Removes | Typical numbers | Use when |
|---|---|---|---|
| Equalisation + neutralisation | surges, pH | discharge pH 6–9; hours of buffer | always first |
| API separator / DAF | free oil, solids | oil to < 10–50 mg/L | oily / heavy-solids water |
| Biological (activated sludge) | BOD / COD | 85–98% BOD removal; F/M 0.2–0.5 | biodegradable organics |
| Adsorption (GAC) / advanced oxidation | refractory toxics | polishing to ppb | non-biodegradable, colour |
| Membrane (UF/RO) / evaporation | dissolved salts | water reuse, zero-liquid-discharge | reuse or brine concentrate |

WHY a train: each stage is cheap *only* for what it targets — biology cannot take free oil, carbon is wasted on bulk BOD. Match the stage to the contaminant.

### Gaseous effluent (air emissions)

| Pollutant | Control | Typical numbers |
|---|---|---|
| Particulates | cyclone → bag filter / ESP | baghouse to < 10 mg/m³; cyclone only > 5–10 µm |
| Acid gases (SOx, HCl) | wet / dry scrubber | 90–99% removal; L/G 5–15 L/m³ |
| VOC, dilute & high-flow | thermal / regenerative oxidiser | 95–99% destruction at 760–820 °C; RTO recovers ~95% heat |
| VOC, concentrated / valuable | condensation / carbon / absorption | recover the solvent if it pays |
| NOx | low-NOx burner + SCR | SCR 80–90% at 300–400 °C with ammonia |

The master rule: **dilute-and-high-flow favours destruction (oxidiser); concentrated-and-valuable favours recovery (condense/absorb)** — the same see-then-decide trade-off as everywhere else. Choupo's cyclone, absorber, and combustion duties size the front end; the discharge limit is the spec and the local regulation is the law (see *Standards & further reading*).

## Cost estimation & profitability

Costing in Choupo is a *post-processing pass* (`CostingPass`, Guthrie/Turton models) feeding `EconomicsPass` (see `optim05_reactor_npv`). The numbers below are heuristics to be *run and checked*, never final verdicts — accuracy depends entirely on the AACE estimate class.

**Capital (CAPEX).** Two routes, increasing in effort:

- *Lang factor* — fixed capital = Lang factor × Σ(delivered equipment cost). Hypothesis to verify: a fluids plant lands near 4.7×; solids-handling near 3.1×; mixed 3.6×. The factor absorbs piping, instrumentation, civil, and indirects, so it is crude (±30-40%) but fast.
- *Bare-module (Guthrie/Turton)* — per-unit: $C_{BM}=C_p^0\,F_{BM}$, with $F_{BM}=(B_1+B_2 F_M F_P)$. Pressure ($F_P$) and material ($F_M$) multipliers are *itemised*, so this is the glass-box default. Verify: a SS316 vessel at 30 bar shows $F_{BM}\approx 5-7$ vs ~3 for carbon steel at 1 bar.

| Item | Typical range | Why |
|---|---|---|
| Lang factor (fluids) | 4.5-5.0 | Indirects dominate fluid plants |
| Lang factor (solids) | 3.0-3.6 | Less piping/instrumentation |
| Bare-module $F_{BM}$ (CS, low-P) | 2.5-4.0 | Base installation overhead |
| Six-tenths exponent $n$ | 0.5-0.7 (≈0.6) | Economy of scale on area/volume |
| CEPCI escalation | index ratio | ~600 (2019)→~800 (2023) |
| Site/auxiliary uplift | +10-25% | Grassroots vs battery-limit |

*Six-tenths rule:* $C_2=C_1(S_2/S_1)^{0.6}$. Doubling capacity raises cost only ~52% (2^0.6) — verify before sizing a redundant train. *CEPCI:* $C_{now}=C_{base}\,(I_{now}/I_{base})$; skipping a 4-year escalation understates CAPEX ~25%.

**Operating cost (COM).** Rule of thumb (Turton): $COM \approx 0.18\,FCI + 2.73\,C_{OL} + 1.23(C_{UT}+C_{WT}+C_{RM})$. Verify the dominant term:

| COM component | Typical share | Why |
|---|---|---|
| Raw materials | 40-80% | Usually dominant; selectivity is king |
| Utilities | 10-30% | Steam/cooling/power — pinch can cut 20-30% |
| Labour + supervision | 5-15% | Headcount × shift factor 4.5 |
| Maintenance | 3-6% of FCI | Wear-driven |

Because raw materials dominate, a 1% yield gain often beats any utility optimisation — test it against a pinch retrofit in the same case.

**Profitability.** Three lenses, never one:

- *Payback period* (FCI / annual after-tax cash flow): attractive <3 yr, marginal 3-5 yr, suspect >5-6 yr. Ignores time value, so it is a screen only.
- *NPV* at a hurdle rate (10-15% typical): positive ⇒ value-adding; verify sensitivity to discount rate and a 10-year horizon.
- *IRR/DCFROR*: the rate where NPV=0; want it 5-10 points above WACC. Below the hurdle even a short payback fails.

**Estimate class governs everything.** Report the band, not a point:

| AACE class | Maturity | Accuracy | Method |
|---|---|---|---|
| Class 5 | 0-2% | −30/+50% | Capacity-factored, six-tenths |
| Class 4 | 1-15% | −20/+30% | Equipment-factored (Lang) |
| Class 3 | 10-40% | −15/+20% | Bare-module / budget |
| Class 2 | 30-70% | −10/+15% | Detailed, semi-quantitative |
| Class 1 | 50-100% | −5/+10% | Definitive, quote-based |

Quoting an NPV to four significant figures off a Class-5 estimate is the classic glass-box failure: the ±50% CAPEX band swamps the answer. Always run the case at both error bounds.

## Materials of construction & mechanical design

Material choice is a *climb-the-ladder* decision: start with the cheapest metal that survives the duty, and step up only when corrosion rate, chlorides, temperature, or hydrogen force you. Each rung is roughly 1.5–4× the cost of the one below, so an unjustified jump from carbon steel to SS316 can double a vessel's bare cost (see Choupo's Guthrie/Turton material-factor `f_M` in the costing pass; carbonSteel/SS304/SS316/aluminium are the reference `data/materials/*.dat`).

**The selection ladder.** The governing rule of thumb is a target corrosion rate **< 0.1 mm/yr** (≈ 5 mil/yr) for a 20-year life; 0.1–0.5 mm/yr is tolerable with a fat allowance; above 0.5 mm/yr step up.

| Service / limit | Pick | Why (the WHY) |
|---|---|---|
| Dry hydrocarbons, steam, mild T < 400 °C | Carbon steel | Cheapest; ~0.1 mm/yr in benign duty |
| Dilute acids, oxidising, T < 60 °C, **chloride-free** | SS304 | Cr₂O₃ passive film; loses it to Cl⁻ |
| Chlorides, dilute H₂SO₄, food/pharma | SS316 (2–3% Mo) | Mo resists pitting; PREN ≈ 24 vs 18 |
| Hot chloride + tensile stress | Duplex 2205 / Ni alloy | **Austenitic SCC** kills 304/316 |
| Strong HCl, wet Cl₂, HF | Hastelloy C-276 / lined | General attack defeats stainless |
| High-purity water, weight-critical | Aluminium | Cheap, light, but soft & low-T only |

**Chlorides & stress-corrosion (the silent killer).** Austenitic 304/316 suffer chloride **SCC** above ≈ **60 °C** with tensile stress and even ppm-level Cl⁻ — failures look like brittle cracking with no wall loss, so a corrosion allowance does *not* protect you. Below 60 °C or for hot chlorides, jump to duplex (ferritic-austenitic, immune) or nickel alloys. Pitting resistance scales with **PREN = %Cr + 3.3·%Mo + 16·%N** (304 ≈ 18, 316 ≈ 24, 2205 ≈ 35).

**High-T creep & hydrogen.** Carbon steel is creep-limited to ≈ **425 °C**; above this design stress collapses, so 1¼Cr–½Mo, 9Cr, or austenitics take over (relevant for fired-heater tubes and HiTec-salt service to 535 °C). In H₂ at pressure, consult **Nelson curves** (API 941): below the curve carbon steel is safe; above it, hydrogen attacks carbides → decarburisation and fissuring, demanding Cr-Mo steels.

**Corrosion allowance.** Add **3.0 mm** standard (1.5 mm benign, up to 6 mm aggressive). It is sacrificial metal, *not* an SCC or hydrogen fix.

**Wall thickness vs pressure.** Thin-wall (ASME VIII Div. 1): **t = P·R/(S·E − 0.6·P) + CA**, with weld efficiency E = 0.85–1.0 and S the allowable stress (≈ 138 MPa for SS316 at moderate T). Design pressure margin: **max(operating + 10%, +1.7 bar)**; design temperature: operating **+ 25 °C**. A minimum shell of ~6–8 mm is set by handling, not pressure.

**Aspect ratios.** Vertical process vessels and knockout drums: **L/D ≈ 3** (range 2–5) — minimises wall metal at fixed volume while giving disengaging height. Distillation columns run **L/D up to 20–30**, capped by wind/seismic moment. Atmospheric storage tanks favour **L/D ≈ 0.5–1** (squat, cheap floor). Horizontal drums sit at **L/D ≈ 3–4**.

Glass-box check: re-run the Choupo sizing/costing pass swapping `material carbonSteel;` → `SS316;` and watch `f_M` and shell mass move; that is the cost of one rung.

**Corrosion allowance — how many millimetres?** Wall thickness = the pressure-stress thickness (from ASME) **plus a sacrificial corrosion allowance**: CA = corrosion rate × design life. Carbon steel corroding at ~0.1–0.25 mm/yr over a 20–25 year life gives the familiar **3 mm** (1/8 in) allowance; severe service runs to **6 mm**, clean/inert service to **0–1.5 mm**, and a corrosion-resistant alloy needs **none** (it is chosen so the rate is ~0).

| Corrosion rate | Verdict |
|---|---|
| < 0.1 mm/yr | excellent — carbon steel, 1.5–3 mm allowance |
| 0.1–0.5 mm/yr | acceptable with allowance + inspection |
| > 0.5 mm/yr | do NOT just thicken the steel — upgrade the alloy or line it |

The rule: a corrosion allowance buys time, not safety — above ~0.5 mm/yr the economics flip to a better material.

**Gaskets — the small part that floods the floor.** A gasket seals a flange by being squeezed between the faces; it must survive the **pressure, the temperature, AND every fluid the joint ever sees — including cleaning.** Select by P–T–fluid:

| Gasket | P–T window | Use when |
|---|---|---|
| Compressed fibre / PTFE sheet | to ~20 bar, ~200 °C | low duty; PTFE for chemical resistance |
| Spiral-wound (metal + graphite/PTFE filler) | to ~100+ bar, ~450 °C+ | the workhorse for process flanges |
| Ring-joint (RTJ, solid metal) | very high P (> 100 bar) | high-pressure gas, wellheads |

The wetted material — the winding and the filler — must resist the worst fluid, and the worst fluid is often **not** the product but the **CLEANING** step. A gasket chosen only for cold wine will corrode through during a **40 °C acid CIP wash**, and then the wine runs out of the joint on the next batch — a real and classic failure. **Specify the gasket (and the bolt load) for the most aggressive condition the joint ever sees, cleaning included**, never for normal operation alone.

## Standards & further reading

This guide distils the classic references below. For any real design go to the primary source — and for anything safety- or environment-critical, the governing standard is the authority, not this guide (see *Disclaimer & scope*).

**General process design & heuristics**
- Turton, Shaeiwitz, Bhattacharyya & Whiting, *Analysis, Synthesis, and Design of Chemical Processes*, Prentice Hall.
- Seider, Seader, Lewin & Widagdo, *Product and Process Design Principles*, Wiley.
- Sinnott & Towler, *Chemical Engineering Design* (Coulson & Richardson, Vol. 6), Butterworth-Heinemann.
- Green & Perry, *Perry's Chemical Engineers' Handbook*, McGraw-Hill.
- Douglas, *Conceptual Design of Chemical Processes*, McGraw-Hill.
- Branan, *Rules of Thumb for Chemical Engineers*; Walas, *Chemical Process Equipment*.

**By topic**
- Heat integration / pinch — Smith, *Chemical Process Design and Integration*, Wiley; Kemp, *Pinch Analysis and Process Integration*.
- Distillation — Kister, *Distillation Design* & *Distillation Operation*, McGraw-Hill.
- Heat transfer — Kern, *Process Heat Transfer*; **TEMA** standards.
- Reactors — Fogler, *Elements of Chemical Reaction Engineering*; Levenspiel, *Chemical Reaction Engineering*.
- Membranes — Baker, *Membrane Technology and Applications*, Wiley.
- Materials / corrosion — **NACE/AMPP** standards; **API RP 571** (damage mechanisms).
- Effluent — Metcalf & Eddy, *Wastewater Engineering*; **US EPA** and **EU Industrial Emissions Directive (BAT / BREF)** guidance.

**Safety & environmental standards — binding, not optional**
- Pressure relief & venting — **API STD 520 / 521 / 526 / 2000**; **ASME BPVC Sec. VIII & I**.
- Flares — **API STD 521 / 537**.
- Process-safety management — **OSHA 29 CFR 1910.119**; **AIChE CCPS** guideline series.
- Functional safety / SIS — **IEC 61508 / 61511**; HAZOP — **IEC 61882**.
- Flammables — **NFPA 30**; electrical area classification — **NFPA 70 / IEC 60079**.
- Emissions & discharge — the local regulator's limits (e.g. **US EPA**, **EU IED / BAT-BREF**).

## Equipment selection at a glance

## Equipment selection at a glance

This one-page table is the *index of bets* — each row is a duty you will face, the default pick, the one-line reason, and the range to start from. Treat every "typical number" as a hypothesis to verify by running the linked Choupo case. When two picks compete, the table gives the **default**; the section explains the crossover.

| Duty / situation | Pick this | Because | Typical numbers |
|---|---|---|---|
| Overall flowsheet structure | Reactor → separation → recycle, with a purge on any loop that accumulates inerts | The "onion": fix conversion + recycle before heat/utilities; purge bleeds what recycle would otherwise trap | Purge loses 1–5 % of recycle; target recycle so single-pass conversion ≠ overall conversion |
| Equilibrium-limited reaction | Push reactor to ~90–95 % of equilibrium, recycle the rest | Last few % of approach costs disproportionate volume; recycle is cheaper than oversizing | Single-pass X = 0.6–0.9; overall X > 0.99 via recycle |
| Fast liquid-phase reaction, high conversion | PFR (or CSTR-in-series) | Plug flow needs least volume for a given conversion; back-mixing penalises high X | PFR vol ≈ 1/3–1/2 of one CSTR at X = 0.9 |
| Autocatalytic, biological, solids-laden, or strong heat-removal duty | CSTR (or CSTR train) | Back-mixing dilutes feed, eases T control and solids handling | 3–4 CSTRs in series ≈ PFR; τ set by k and target X |
| Gas-phase catalytic reaction | Packed-bed (PFR model) | Heterogeneous catalyst + plug flow; watch ΔP across bed | Superficial gas 0.3–1 m/s; bed ΔP a few % of P |
| Separate close-boiling liquids | Distillation | Cheapest workhorse whenever relative volatility allows | Viable for α > ~1.05; easy for α > 1.5 |
| Distillation column operating point | Reflux R = 1.1–1.3 × R_min | Optimum trades reflux (energy) vs trays (capital); flat-bottomed cost curve | R/R_min ≈ 1.1–1.3; N ≈ 2–2.5 × N_min |
| Heat-sensitive / high-boiling bottoms | Vacuum distillation | Lowers boiling T below decomposition; protects product | Run at 0.05–0.3 bar when T_bottom > ~150–200 °C at 1 atm |
| Column vapour loading | Size to F-factor / fraction of flooding | Avoids flooding (carry-over) and weeping | F = u·√ρ_v ≈ 1–2.5; design at 70–85 % of flood |
| Dilute aqueous dewatering / desalination | Reverse osmosis (spiral-wound) | Pressure-driven, no phase change; rejects monovalent salts | ΔP 15–70 bar (seawater); flux 15–30 LMH |
| Recover solvent / reject divalent ions, pass monovalent | Nanofiltration | Looser membrane, lower pressure than RO, partial-rejection selectivity | ΔP 5–20 bar; rejects multivalent > 90 %, monovalent 20–70 % |
| Remove particles from a gas | Cyclone (coarse) → bag filter (fine) | Cyclone is cheap above ~5–10 µm; fabric filter takes sub-micron | Cyclone η high > 5–10 µm; bag filter to < 1 µm |
| Produce a crystalline solid | MSMPR cooling crystalliser (or evaporative if solubility flat with T) | Cooling exploits steep solubility-T slope; evaporative when it is flat | Supersaturation low (metastable); residence min–hours |
| Clean liquid–liquid heat transfer | Shell-and-tube (or gasketed plate if T,P moderate) | Robust, costed, high U; plates beat it on area/cost when clean & < ~25 bar | U ≈ 250–750 W/m²K; ΔT_min ≈ 10 °C |
| Heat transfer with a gas on one/both sides | Extended/compact surface — **not** a bare shell-and-tube | Gas-side h is the bottleneck; gas–gas shell-and-tube needs huge area | U_gas–gas ≈ 10–50 W/m²K; ΔT_min ≈ 20 °C |
| Condense overhead / reboil bottoms | Kettle/thermosiphon reboiler; shell-side condenser | Phase change gives very high h; match utility to T-level | U_cond ≈ 1000–3000 W/m²K; ΔT_min ≈ 5–10 °C |
| Process duty above ~400 °C | Fired heater (very high T) or molten-salt loop (250–535 °C) | Steam tops out ~250 °C; salt covers the gap, fired heater above | HiTec salt 142–535 °C; Dowtherm A to ~400 °C |
| Size a pumped liquid line | Velocity 1–3 m/s (suction lower) | Balances pumping ΔP vs pipe capital; avoids settling/erosion | Discharge 1–3 m/s; suction 0.5–1.5 m/s; ΔP ~0.5 bar/100 m |
| Size a gas/vapour line | Velocity 15–30 m/s, capped by ρu² | Low-density fluid → high velocity OK; erosion-corrosion limits ρu² | 15–30 m/s; steam 30–60 m/s; ρu² < ~10000 kg/m·s² |
| Default material of construction | Carbon steel | Cheapest; specify up only when corrosion/T demands it | Use to ~425 °C, non-corrosive, no chlorides |
| Chloride or aqueous-corrosive service | SS316 (not SS304) | Mo content resists chloride pitting that defeats 304 | 316 for chlorides/acids; 304 for mild aqueous/atmospheric |

---

**Use this guide as a map, not a destination.** Every range here is a place to *start* a Choupo case, not a number to copy onto a P&ID. The discipline the guide is teaching is the loop itself: form the heuristic bet, build the smallest case that tests it, run it, read what the solver actually does, and let the KPIs confirm or move the range for your system. The rules that survive that loop become judgment; the ones that fail teach you where your problem lives outside the textbook's assumptions. That is the whole point of a glass-box simulator — and the reason a heuristic you have personally falsified once is worth ten you merely memorised. Read the sections in the onion order, keep the at-a-glance table beside the keyboard, and verify everything by running it.
