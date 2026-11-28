# C520: case headers whose numbers are no longer the run's (2026-11-25)

Tool: `bin/curate/header_numbers.py`.  Gate: `bin/curate/check_header_numbers.py`
(gate `header-numbers-gate`).  Ratchet: `bin/curate/header_numbers_debt.tsv`.

## What was scanned

684 cases under `tutorials/` (23 have no `expected`).  `data/curation` (1260 fit
cases) was NOT scanned: a fit case carries no prose header to speak of.
"Header" means the `description` and every comment of `system/controlDict`,
plus the comments before the first statement of `system/flowsheetDict` (the
banner box dropped).  Comments lower down a dict are not read.

Counts before the edits below (12 657 header numbers):

| class | numbers | meaning |
|---|---|---|
| MATCH | 3 852 | equals a row of the case's own `expected` to the decimals written (x1, x100, x1e-3, x1e3, x3600, /3600, x1e5, x1e-5, x1e6, x1e-6, +-273.15) |
| INPUT | 1 786 | equals a numeric token of the case's own dicts under the same unit changes |
| PAPER | 423 | in a sentence that cites a source |
| TRIVIAL | 2 505 | a year, an integer 0-9, a ratio |
| SUSPECT | 1 523 in 299 cases | looks like a result (a result unit, or a bare decimal of 3+ significant digits) and ties to no row and no input |
| OTHER | 2 568 | the rest (bare integers, counts) |

After the edits: 25 numbers MARKED, 1 519 suspects in 298 cases (the pinned debt).
A MATCH can be by chance and a SUSPECT can be right (a hand calculation, a
paper's value with no citation word): the classification over-reports on purpose.

## Read: the distillation family, then the demonstration families

Engine numbers below were read from the golden, or from a run of the case in a
scratch copy (a binary of the same day built from the main checkout) when the
golden does not hold the row.

| case | header said | engine now | verdict |
|---|---|---|---|
| column09_tray_hydraulics | feed a saturated liquid; L 0.0278 -> 0.0556, V unchanged 0.0417; F_LV 0.0405 / 0.0812; u_flood 1.545 -> 1.435; u_v 1.044 -> 1.092 m/s; flood approach 63.7 % top to 80.0 % on stage 14; 1.316 m tower | feed 370 K, vf 0.697; L 0.0278 -> 0.0362, V 0.0417 -> 0.0223 kmol/s; F_LV 0.0408 / 0.0994; u_flood 1.529 -> 1.384; u_v 1.223 -> 0.656 m/s; 74.4 % top to 80.0 % on stage 7 (stripping 47-50 %); 1.222 m (stripping 0.969 m); dP 12.59 kPa; backup 199.9 mm | STALE, fixed |
| column15_klemola_ideal_trays | 93.975 / 0.0144 / 0.378 / 97.977 wt %; tops 314.250 / 314.116 K; 349 / 426 iterations; 'n-butane overhead 10x'; 'energy audits 98.42 % vs -256.84 %, 670.7 kW' | 93.831 / 0.0755 / 0.444 / 97.949 wt %; T_top 319.767 / 319.646 K; 597 / 711 iterations; 9x; both energy boundaries close at 0.000 kW | STALE, fixed |
| column13_sour_water_stage_identity | 371.5 K bottom, 354.6 K top; x_B(NH3) 0.0054; 0.30; abs F ~ 8e-10 | 370.9 K, 354.4 K; 0.0055; 0.300; 3e-10 | STALE, fixed |
| column14_klemola_c4_splitter | table row 'reboiler duty 9.767 / 9.761 MW' | 9.762 / 9.756 MW | STALE, fixed (row only) |
| swro01_campoDalias | HP pump 9216, booster 439, pass-2 1606, intake 330 kW, 11 590 kW, 2.82 kWh/m3 | 9120, 443, 1607, 330 kW, 11 500 kW, 2.80 kWh/m3 | STALE, fixed |
| ammonia03_quench_converter | converter exit 17.28 % NH3 @ 777.5 K; mixed 26 645 kmol/h at 386 K; recycle 18 645; purge 577; product 3719.8 | bed3: 17.21 % @ 760.5 K; mixed 27 736 kmol/h at 381.8 K; recycle 19 736; purge 610; product 3676.1 | STALE, NOT fixed: the comparison table (1, 2 and 4 beds, README section 7) needs re-measured loops; a slice of its own |
| column15 `postDict` view note | 'top 314.116 K, reboiler 329.435 K' | 319.646 K, 335.081 K | STALE, NOT fixed (a view note, not a header) |
| column14 | 'reboiler 9.77 MW (-4.6 %)' | 9.762 MW (-4.7 %) | within rounding; left |
| column10_flooding | 98.7 %, 1.10 m, 114.5 %, 268.5 mm, 1.316 m | these appear only in its own correction note, on purpose; 70 % vapour = vf 0.697 read from the run, no golden row | not a result (history) |
| column03_azeotrope_mesh | 354.4248 K, 363 K, 1149.69 kW, 0.894 | 354.4248 = feed T (golden 354.42); the rest are a past defect's numbers and the azeotrope | not a result (history, literature) |
| column06, column18, column21, column11 | latent heats 30.8 / 33.2 kJ/mol; 354.25 K; azeotrope 0.894; Murphree table | literature and hand values; column11's 0.9179 and 0.9510 equal x_D_LK at E_MV 0.70 and 1 | not re-run for the other E_MV points |
| column14 tables | feed composition, molar masses, Underwood/Gilliland hand calculation | inputs and hand arithmetic | not a result |
| ammoniaPEQ02/03, ammoniaPEQ_baseCase | design temperatures and pressures | 0 suspects: every number is a declared input or matches a row | clean |
| flash01 | bubble ~368 K, dew ~374 K | no golden row | not verified |
| cstr01 / pfr01 / batch01 | hand formulas (X = 1 - exp(-1.10)) | hand arithmetic | not a result |

## What was not done

* ammonia03's header and README section 7 (above); column15's view note.
* the other ~290 cases' suspects: their count is pinned, not read.  The
  tool lists them with `header_numbers.py --suspects`.
* flash01's bubble and dew points were not run.
* `data/curation` headers.
