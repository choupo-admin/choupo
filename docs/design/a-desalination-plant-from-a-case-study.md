# A desalination plant from a manufacturer's case study — and the boron the engine cannot yet show

*2026-11-02, DEV.md 4c C194.  Source: Toray Industries, "Seawater
Desalination Using Toray's RO Membranes to Support a Thriving Agricultural
Economy" (Campo de Dalias Desalination Plant), MC-CS-CAMPODEDALIAS-1910
(2019), two pages.  The case is `tutorials/plant/swro01_campoDalias`, its
gate `bin/curate/check_swro_plant.py`.*

## 1. What was asked, and what was measured first

Vítor asked for the largest desalination plant of the south of Spain, from
its public case study, with the boron modelled ("o boro é para modelar") and
the plot plan carried to the fence ("leva até à vedação").  The commission
named the one unmeasured premise: does `spiralWoundModule` couple the feed's
speciation (the pH) to per-species transport, so that boric acid (neutral,
passes the first pass) and borate (an anion, rejected) cross the active layer
with different permeances, and can the pH between the passes be changed?

**Measured, by reading `SpiralWoundModule.cpp`, the transport laws and the
registries, and by running probes:**

- The speciation solver (`SpeciationSolver`) is reached from the module only by
  the optional `scaling {}` audit (`SpiralWoundModule.cpp`, the block that
  declares `pH`/`pH solve`); no transport law (`solutionDiffusion`, `SDEM`,
  `DSPM-DE`, `constantRejection`) reads a pH or a speciation.  Every solute
  moves by ITS OWN permeance or rejection, keyed by component name.
- No stream carries a pH and no unit moves one: a `mixer` fed a caustic stream
  adds sodium and hydroxide to the component flows and nothing else.
- `data/standards/species/{H3BO3,BOH4}.dat` exist (thermochemistry only); no
  boric-acid/borate equilibrium record exists in `data/standards/chemistry`.
- A module record's rated test CAN carry a `pH` (read, printed, announced,
  not used: "pH 8 is stated and the probe models no pH").

So the two-species route (a) is not available, and the case takes route (b).

## 2. Decisions (rule 00)

1. **Boron is ONE lumped solute, with a constant intrinsic rejection per
   element**, derived by the C189 inversion from the manufacturer's observed
   rejection at the pH of its own test: 91 % at pH 8 (first pass, TM820E-400)
   and 95 % at pH 10 (second pass, TM720C-430), two `boronRef` rated tests in
   two case-local module records.  The pH is a LABEL of each test, not a state.
   The approximation is declared in the input (the `source` of each module's
   `transportParameters`, the header) and announced in the output (the
   `[ratedTest]` lines).  Rejected: a made-up H3BO3/BOH4 equilibrium record
   (no primary was read; "inventing a citation converts unsourced into falsely
   sourced"); a hand-built two-solute split with a pKa typed in the case (it
   would move nothing the transport reads, which is the finding).
2. **The limitation is PINNED by the gate**, not merely described: a copy with
   the second pass's boron test relabelled pH 7 must give the same intrinsic
   rejection.  The day the engine couples the pH, that arm fails and demands
   the header, this record and the gate be rewritten.
3. **The Toray records are case-local** (`constant/assets/`), origin
   `literature` for what the document states, `assumed`/`estimated` for the rest
   (the test conditions, A_w, the geometry), no sponsorship implied (C189).
4. **The salts are one NaCl at the SAME OSMOTIC PRESSURE as Table 2's twelve
   ions** (617.9 mmol/L NaCl = 36.11 g/L against 38.697 g/L of TDS), because the
   rated-test inversion needs a salt.  Said in the header and checked by the
   gate from a transcription of Table 2.
5. **The plot plan reaches the fence** (Vítor's decision) and is Choupo's
   design, not the site's; the intake, the brine outfall and the product cross
   the fence at published labelled points, and what lies beyond is named
   `(not drawn)`.

## 3. What the document's numbers do when run together

- **"Feed pressure 5.52 MPa" / "1.03 MPa" are the TEST pressures** (800 psi is
  the standard SWRO test; the figures sit beside the elements' flow and
  rejection, which are test figures).  They cannot be the plant's: a 47.2 %
  recovery of this feed concentrates it to 63.5 g/L NaCl-equivalent
  (~53 bar), which 55.2 bar cannot push past.  The plant's pressures are
  SOLVED: 58.59 bar in the first pass for 47.2 %, 10.74 bar in the second for
  87 % (the document's 84–90 %); at 10.3 bar the second pass recovers 94.8 %.
- The document's product, 98 664 m3/day, and 6 skids × 16 442 = 98 652 differ
  by 12 m3/day; the case uses 98 664.
- The document dates the build 2014 and the commissioning 2016; neither is used.
- The brackish element's rated flux (34.7 LMH) and the run's second-pass flux
  (33.99 LMH on 120 960 m2) agree, which is a consistency check on the skid
  design (54:18, 7 elements), not a finding about the plant.
- The first-pass flux is 13.05 LMH on 362 082 m2, a typical SWRO figure.
- The plant's shaft power is 11 552 kW for 4111 m3/h, 2.81 kWh/m3, pumps only.

## 4. Findings about the engine

1. **The boron limitation above** — the real content of the follow-up.  What
   would show the second pass's purpose: a transport law with boric acid and
   borate as two solutes (their own permeances), a stream pH with its
   speciation, an equilibrium record curated from a primary, and a dosing unit.
2. **The boron probe is not the manufacturer's test**: water plus 5 ppm boron at
   the test's pressure has no osmotic pressure to oppose it, so it runs at 19 %
   recovery against the test's 8–15 %.  The derived intrinsic rejection is that
   of the probe, and the run prints both.
3. **A recycle loop through a pressure exchanger is a knife-edge and has a
   spurious fixed point** (all water circulating, 0.1 % recovery) that a cold
   start from a rough guess falls into; the case's `0/` is therefore a
   converged state, and restarts in two iterations.  Wegstein with
   `recycleWegsteinQmin -5` converged where -1.5 and -100 did not.  A
   follow-up: a recycle solver that refuses the trivial fixed point by name.
4. **`membrane::Polarisation`'s Newton refused a converged wall**: its
   convergence test is an absolute 1e-13 on a residual scaled by the largest
   bulk concentration, and a wall carrying a 5 ppm solute beside a 0.6 kmol/m3
   salt can sit at 1.0–1.8e-13 with no step that lowers it ("stalled at
   residual 1.5e-13") during a recycle's early iterates.  A stall below 1e-10
   is now returned as converged, not refused.  Reach: only runs that
   previously refused; no existing answer moves (the membrane cases were run).
5. **A stream whose first unit has no sizer has no fence crossing**: the router
   crosses the fence only where a sized item or a junction piped to one is
   reached, so the intake is routed through a one-inlet `mixer` (the intake
   chamber) to the intake pump, and the four pumps are sized as `compressor`
   items by their shaft power (the engine has no pump sizer).  The sheet says
   `compressor` and its basis says pass-through: a stand-in.  Follow-ups: a pump
   sizer, and a sizer for a spiral-wound vessel bank that publishes a
   footprint (then the RO halls stop being boxes the router cannot reach).

## 5. What the layout shows and what it announces

22 footprints (6 sized items, 4 pumps, 12 declared boxes), five roads, a
north gate with its fence opening, a pipe rack, 13 routed pipes and 11 listed
as not routed with their reasons; plot area 78 069 m2, the footprints 34 %.  The
run announces six findings and they are left: five water tanks with no bund
(civil, not declared) and one entrance.  Every position is an author-set
assumption and says so.

## 6. Not done

The caustic dosing and the pH between the passes, remineralisation and
disinfection chemistry (declared placeholder contact tanks), fouling and the
elements' ageing, a temperature correction of A_w (the module has none; the
case runs at 25 °C, 2 K above the document's feed range), the filters'
particulate removal and pressure drop, costs, the real device's piston
hydraulics, a sizer for the membrane vessel banks, and any comparison with the
real plant: the document is a manufacturer's claim.
