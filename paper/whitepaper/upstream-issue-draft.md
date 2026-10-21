# DRAFT upstream issue -- for Vitor to post (DEV.md 4c C126)

**Not posted.  Nothing in this file has been sent anywhere.**  It is the text
of an issue to be offered to the maintainers of the open-source simulator
compared in the white paper (`paper/whitepaper/whitepaper.tex`, section 6),
BEFORE that section is made public -- the practice Vitor took with his
ruling of 2026-10-21 (DEV.md 4c C126).  Target: the project's GitHub issue
tracker (https://github.com/DanWBR/dwsim/issues).  Search the tracker for an
existing report first.

Source of every number below: the benchmark READMEs on branch
`claude/c123-benchmarks-bc` at commit `33e277ca2`
(`benchmarks/dwsim/distillation01_methanol_acetone_pressure_swing/README.md`
and `benchmarks/dwsim/extraction01_water_acetone_mibk/README.md`), which read
the stored state of each sample with `benchmarks/dwsim/read_sample.py`.
Nothing was re-measured for this draft; re-run `read_sample.py` on the
current sample files before posting, and drop any point the current release
no longer shows.  No parameter value of the samples is quoted here (the
benchmarks never read them).

---

**Title:** Stored solved state of two bundled samples does not close
("Extractive Distillation", "Liquid-Liquid Extraction")

Hello, and thank you for DWSIM.  We have been using two of the bundled
samples as reference cases for a comparison with another open-source
simulator (Choupo, GPL-3.0-or-later, https://github.com/choupo-admin/choupo),
and while reading the solved state stored in the sample files we found a few
points that may be worth a look.  All of them are read from the numbers
stored in the files themselves; we did not re-run the flowsheets in DWSIM, so
some of them may be artefacts of how the samples were last saved rather than
of the program.  We are happy to be corrected.

**Files** (repository commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766`):

* `PlatformFiles/Common/samples/Extractive Distillation.dwxmz`
  (BuildVersion 8.8.0.0, SavedOn 2024-07-09T11:06:09-03:00)
* `PlatformFiles/Common/samples/Liquid-Liquid Extraction.dwxmz`
  (BuildVersion 8.8.0.0, SavedOn 2024-07-09T11:06:56-03:00)

**How we read them:** each `.dwxmz` is unzipped and its XML read for the
stored stream states, unit specifications and recycle-block records.  The
small reader we used is at
`benchmarks/dwsim/read_sample.py` in the repository above (branch
`claude/c123-benchmarks-bc`); it reads facts only and copies no parameter.

### "Extractive Distillation" (a pressure-swing pair: 1 atm and 6 atm columns)

1. **The two bottoms specifications admit no steady state.**  The feed is
   0.998602 mol/s (declared by mass), 0.499301 mol/s of each component.  The
   two columns each fix a bottoms flow of 0.5 mol/s, so the products total
   1.000000 mol/s (+0.140 % over the feed), and the stored methanol product
   carries 0.500033 mol/s of methanol against 0.499301 mol/s fed.
2. **The recycled stream differs from the stream it copies.**  "Recycled HP
   Azeotrope" stores 1.889121 mol/s; its source "HP Azeotrope" stores
   1.861749 mol/s, at the same composition and the same mass flow
   (0.093265 kg/s, which at that composition corresponds to about
   1.8616 mol/s).  The recycle block reports convergence after one iteration,
   with stored errors equal to the full values (T 388.27 K, mass
   0.0933 kg/s) against its tolerances (1 K, 0.01 kg/s).
3. **The LP distillate is stored 1.98 K below its own condenser stage** at
   the same composition (326.584 K against 328.564 K).
4. On the stored enthalpy flows, the plant's first law closes to +1.466 kW
   (of roughly 4640 kW exchanged) -- small, noted only for completeness.
5. The property package lists the acetone-methanol NRTL interaction twice,
   once in each component order, with different values.  We did not
   determine which entry the program reads.

### "Liquid-Liquid Extraction" (water/acetone/MIBK, 4 stages)

6. The absorber in "Extractor" mode stores two specifications (a stream
   ratio of 5 and a product flow of 29.38 mol/s) whose stored calculated
   values (0.858 and 6.04 mol/s) do not match them.  If the specifications
   are not used in that mode, it may help to hide or flag them in the file.

(We also noticed that this column is adiabatic and its stages cool from
298.15 K to 284.70 K; its stored first law closes to -0.54 kW, so this looks
consistent within its own model -- mentioned only because it matters for
anyone comparing it with an isothermal extractor.)

If any of these is expected behaviour, a one-line explanation would help us
describe the comparison fairly.  Thank you.

---

## Notes for Vitor (not part of the issue)

* Point 3 and point 5 are the weakest: 3 could be a display/rounding
  artefact of how the distillate is reported, and 5 depends on which entry is
  read.  Consider dropping 5 if you prefer to report only what affects a
  result.
* Points 1 and 2 are the ones the white paper relies on (section 6).
* Choupo's own findings on the same benchmarks (a multi-feed column's
  stage-1 feed; the total-condenser semantics; the LL flash; the extractor
  at exit 0) are ours to fix and do not belong in their tracker.
