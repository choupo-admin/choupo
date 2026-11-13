# `tabletPress01_dwell_and_force`: a tablet press checked on dwell time and on compaction force

One rotary tablet press makes placebo tablets of microcrystalline cellulose
(MCC) for a plant that runs in lots (DEV.md 4c C270).  The case asks the two
questions a press catalogue does not answer:

1. **How fast can this press really turn for this powder?**  The catalogue
   gives a turret speed.  The powder needs a minimum time under the
   compression roll, the **dwell time**, and that time sets the speed.
2. **How hard must the press push to make a tablet that is strong enough?**
   The answer comes from the two compaction curves the compaction bench
   **fitted** to open measurements of MCC, run backwards.

```bash
source etc/bashrc
runCase tutorials/batch/plant/tabletPress01_dwell_and_force
```

The case is sealed: everything it reads is in its own `constant/`.

## 1. What the case is made of

- **The flowsheet** (`system/flowsheetDict`) is one `splitter`: 100 kg/h of
  final blend in, 99 % tablet cores and 1 % rejects out.  It is a mass
  balance and nothing else: the splitter knows nothing about punches,
  speeds or forces.
- **The batch plan** (`system/postDict`, `batchPlan`) gives the press a lot
  of 200 kg of blend (500 000 tablets of 0.40 g) and 7 hours to press it.
- **The sizing pass** (`system/postDict`, `sizing`, `type ratedMachine`,
  `kind tabletPress`) checks the press.  This is where all the arithmetic
  below happens, and the run prints every step of it.

Every number that no source gave is an **author-set assumption**, and the
dictionary says so beside it: the press (36 stations, 75 rpm, an 8 mm punch
flat, a 0.30 m pitch circle, an 80 kN maximum force), the year, the lot and
the effectiveness factors.  Replace them with your press's data sheet and
your own plan.

## 2. The catalogue speed and the real speed

The punch head has a flat.  While the flat passes under the roll, the punch
stays at its lowest point and the powder is held at full compression.  At a
turret speed of `n` revolutions per second, a point on the pitch circle of
diameter `D` moves at `pi D n`, so the flat of length `L` stays under the
roll for

    t_dwell = L / (pi D n) = 8 mm / (pi x 0.30 m x 75/60 s^-1) = 6.8 ms

The case declares that this formulation needs at least 10 ms.  The fastest
speed that gives 10 ms is

    n_max = L / (pi D t_min) = 50.9 rpm

so the press makes 36 x 50.9 x 60 = **110 008 tablets/h**, not the
catalogue's 36 x 75 x 60 = 162 000.  The run announces that the dwell limit
**binds**, and the utilisation it reports uses the lower number.  With the
declared overall equipment effectiveness (availability 0.90 x performance
0.95 x quality 1.0 = 0.855) the press makes 94 057 tablets/h against a load
of 71 429: a utilisation of **0.76**.  On the catalogue speed alone the same
press would have looked to be **44 %** busy.

Where the 10 ms comes from: it is an author-set assumption, read against an
open study of compaction speed (Wünsch et al., *Pharmaceutics* 12 (2020)
310, CC BY 4.0), which found that pure MCC tablets came out equally strong at
dwell times between 10 and 130 ms.  So 10 ms is the shortest dwell that
study shows for MCC, not a measured minimum.  The same study found a starch
whose tablets were weaker at the shorter dwell times of a production press:
the minimum dwell is a property of the **formulation**, and it is measured
(for example on a compaction simulator), not read off the press.

Why quality is 1 here: the flowsheet already rejects 1 % of the tablets.  An
effectiveness with a quality below 1 would remove them a second time; the
run announces it if you try (`effectiveness { quality 0.99; }`).

## 3. From the bench's curves to the punch force

The compaction bench case `tutorials/props/powder/compaction01_mcc`
(operation `mcc_inDie`) fits two curves to open measurements of MCC (van der
Haven et al., *Sci. Data* 13 (2026) 1468, CC BY 4.0):

- **Ryshkewitch-Duckworth**, the tablet's tensile strength against its
  porosity: `sigma_t = sigma_0 exp(-k_b eps)`, with sigma_0 = 34.17 MPa and
  k_b = 7.173;
- **Heckel**, the compact's relative density against the pressure:
  `ln(1/(1 - D)) = K P + A`, with K = 0.009061 1/MPa and A = 0.6576, on the
  pressure window 30-170 MPa.

The press's `compaction {}` block copies those four numbers from the bench's
own results (the gate `check_tablet_machines` holds them to the bench's
golden, so the two cannot drift apart) and runs both curves backwards:

1. The target strength is **2 MPa** (Mohylyuk et al., *Pharmaceutics* 16
   (2024) 362, CC BY 4.0, write that 2 MPa is widely considered the minimum
   acceptable tensile strength of tablets).  The porosity that gives it:
   `eps = ln(sigma_0 / sigma_t) / k_b = ln(34.17 / 2) / 7.173 = 0.3957`.
2. The solid fraction is `D = 1 - eps = 0.6043`, and the pressure the Heckel
   line needs to reach it: `P = (ln(1/(1 - D)) - A) / K = 29.7 MPa`.
3. The force on one punch is `P x A_tip = 29.7 MPa x 99.93 mm2 = 2.97 kN`
   (the 11.28 mm round flat-faced punch the bench's tablets were made with),
   **3.7 %** of the press's 80 kN.
4. With the true density the bench declares (1.6374 g/cm3), the flat-faced
   0.40 g tablet is `m / (rho_true D A_tip) = 4.05 mm` thick.

**Two warnings the run gives, and why they are right:**

- **The pressure is just outside the Heckel window** (29.7 against a lower
  end of 30 MPa).  The line is extrapolated there.  It is a small step, and
  the run says so instead of hiding it.
- **The two curves are on different bases.**  The Heckel line was fitted to
  densities measured *in the die, under load*; the strength curve to
  porosities of tablets measured *after ejection*, when the tablet has
  recovered elastically and is a little less dense.  So the pressure found
  here is the pressure at which the compact reaches, under load, the
  porosity the ejected tablet has: the tablet actually needs somewhat more.
  To remove the warning, fit both curves on the same basis (the bench can:
  give it out-of-die densities for the Heckel plot).

## 4. What this case does not do

- **One material.**  The curves are those of MCC alone, and the tablet here
  is MCC alone.  For a real blend there is **no mixture rule** in Choupo: a
  measured curve of the blend, or of the excipient that dominates it, stands
  in for it, and every run that uses the block says so.
- **No model of the press.**  The dwell time is kinematics; nothing here
  predicts the minimum dwell a powder needs, capping, lamination, or the
  hardness of a tablet beyond the fitted strength curve.
- **The batch plan is not re-timed.**  The press's 7-hour operating time is
  the case's declaration; the sizer checks whether the press, at its real
  capacity, fits inside it, and refuses by name if it does not.

## 5. Things to try

- Lower `minimumDwellTime` to 6 ms: the dwell limit stops binding and the
  press is rated on its catalogue speed again.
- Raise `targetTensileStrength` to 3 MPa: the pressure rises into the
  Heckel window and the extrapolation warning goes away.
- Set `targetTensileStrength` to 35 MPa: above sigma_0, no porosity can give
  it, and the run refuses by name.
- Set `quality 0.99;` in `effectiveness`: the run tells you the rejects are
  counted twice.
