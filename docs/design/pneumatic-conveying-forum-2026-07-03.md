# Pneumatic-conveying ΔP model — forum-ratified redesign (2026-07-03)

**Status: DESIGN RATIFIED (5/5 unanimous), NOT BUILT.** Forum: gas-solids
conveying expert (Klinzing/Marcus/Rizk school), transport-phenomena academic,
Choupo credo-keeping architect, practising plant engineer, pedagogy professor +
student.  Trigger: Vítor — "que raio de modelo usaste? está pobrezinho".

## The honest diagnosis
Current model = Hinkle-Yang additive DILUTE-phase (particle vel from Hinkle slip
+ Hinkle-1953 solids friction + Rizk saltation).  NOT wrong, but thin.  The
gaps, in severity order: NO BEND LOSSES (the dominant real term), a silent
u_p fallback, the 1953 friction correlation, dilute-only, lumped acceleration.

## The redesign (unanimous unless noted)

### 1. KEEP the additive skeleton, UPGRADE the solids friction
The term-by-term additive ΔP (gas accel + solids accel + gas friction + solids
friction + static, gas & solids separately) is physically clean (each a distinct
momentum sink; they sum because the 1-D momentum eq integrates term-wise) AND
glass-box.  Keep it.  UPGRADE the solids friction **Hinkle-1953 → Yang-1974**
(velocity/voidage-dependent, the right physics; Hinkle scatters +/-100%);
Konno-Saito selectable via the `model` slot.  This re-records the conveyor
golden — announce it.  Do NOT switch to a two-fluid balance (hides the
breakdown, fails Pareto).

### 2. BEND LOSSES (the big fix) — solids RE-ACCELERATION, per bend
`ΔP_bend = mDotS·(u_p − u_p,bend)/A` per bend: the solids are decelerated to
u_p,bend in the bend, then the gas must RE-ACCELERATE them over ~5-40 D
downstream — the same momentum work as the line entry, mid-line.  The
exit-velocity ratio u_p,bend/u_p is a CITED correlation keyed to bend TYPE:
long-radius sweep ~0.6-0.8, blind/dead-leg tee ~0.2-0.3 (higher ΔP, near-zero
erosion — the student SEES the trade).  Add the gas bend loss on top.
  * REJECTED (hides physics): (c) equivalent-length.  Chambers-Marcus loss
    coefficient B(1+loading)½ρ_g u_g² allowed only as a cross-check, not primary.
  * Bends carry **50-70% of real dilute-phase ΔP** — this is what turns a
    straight-pipe toy into a predictor.
  * INPUTS in the case `constant/` GEOMETRY (data doctrine), NOT operation{}
    hardcoded: `bends ( { RoverD 6; type longRadius; orientation H-H; } ... );`
    -- one entry per bend so a real line's mix is honest.  Constants in code.
  * ANNOUNCE per bend in the existing breakdown:
    `bend[1] R/D=6 longRadius: re-accel = 4820 Pa (u_p 12.3 -> 4.1 m/s)`,
    then a `bends TOTAL` line.

### 3. PARTICLE VELOCITY — mechanistic FORCE BALANCE (kills the silent crutch)
Replace Hinkle's slip correlation AND its `u_p = max(0.05 u_g, u_g − u_t)`
fallback (a NO-SILENT-CRUTCH violation) with a steady **force balance**:
drag(u_g − u_p) = solids-wall friction + gravity component -> a scalar root-find
the student can READ.  It closes self-consistently with the same C_d, has no
nonsense regime, no hack.  Keep Hinkle as a CITED comparison curve only.
CONSISTENCY: the force-balance u_p and the friction f_p MUST use the SAME slip
(u_g−u_p) and the SAME C_d, or momentum closure silently breaks.

### 4. SCOPE: DILUTE-PHASE ONLY, enforced LOUD
Compute the loading; if it exceeds the dilute ceiling (~15 kg/kg) OR u_g < u_salt,
WARN HARD that the model is out of range.  NO dense-phase (plug/slug) regime --
there is no honest general ΔP correlation; it is material-specific rig-test
territory.  Faking it would be dishonest.

### 5. SALTATION MARGIN as the HEADLINE safety output
The #1 real failure is UNDER-VELOCITY PLUGGING.  Surface **u_g / u_salt** as the
top-line KPI (red below ~1.3); Rizk-1973 saltation as the WARNING floor (+/-30%
is fine when you design to 1.5-2x anyway).  "A pretty ΔP on a line that will plug"
is the top pitfall -- the velocity floor must be front-and-centre.

### 6. ACCELERATION LENGTH — keep lumped, diagnose
Keep the single entry velocity-head (the closed-form integral of the particle
momentum eq, 0 -> u_p; honest for a developed line).  Print the acceleration
LENGTH L_accel as a diagnostic KPI and WARN when L_accel/L is non-negligible
(short/bendy lines never reach steady u_p).  No integral solver (Pareto).
Do NOT double-count the entry accel and the per-bend re-accel -- budget them
along the line.

### 7. THE TUTORIAL (unanimous ADD)
A straight line vs the SAME length with 6 bends: the bend term wins ~60/40 --
"one plot worth a lecture".  The teachable moment: RE-ACCELERATION at bends --
a fitting, not the pipe length, sets the pressure budget.  Slip explains why
solids friction exists; saltation is the plugging floor.

## Seminal references (Crossref-VERIFIED, HTTP 200; Vítor -> Literature)
* Yang, W.-C. (1974) "Correlations for solid friction factors in vertical and
  horizontal pneumatic conveyings," AIChE Journal 20(3):605.
  **DOI 10.1002/aic.690200327**  -- the solids-friction upgrade.
* Konno, H. & Saito, S. (1969) "Pneumatic conveying of solids through straight
  pipes," J. Chem. Eng. Japan 2(2):211.  **DOI 10.1252/jcej.2.211**
  -- the classic alternative solids-friction correlation.
* Bend re-acceleration + design frame: Klinzing, Marcus, Rizk & Leung,
  "Pneumatic Conveying of Solids" (Springer) -- the textbook treatment
  (Rizk saltation, the re-acceleration bend model).  Book, cite by ISBN/chapter.

## CUT / ADD (net, unanimous)
CUT: the Hinkle u_p slip FALLBACK (silent crutch); dense-phase; equivalent-length
bends.
ADD: mechanistic force-balance u_p; per-bend re-acceleration ΔP line; the
u_g/u_salt headline; the straight-vs-bendy tutorial.

## MUST NOT change
The per-term ΔP breakdown print; constants-in-code / geometry-in-case split;
Rizk saltation as a WARNING; the no-solids hard refusals.

## Build order (when Vítor says avança)
1. force-balance u_p (kills the crutch, biggest transparency win, small);
2. Yang-1974 solids friction (re-record golden);
3. per-bend re-acceleration + the case `constant/` bends geometry;
4. u_g/u_salt headline + L_accel diagnostic + dilute-scope enforcement;
5. the straight-vs-bendy tutorial.
