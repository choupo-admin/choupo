# ed05 — an industrial stack beside the bench one

`ed03_stack_record` runs a **bench** stack: seven cell pairs, 0.140 m² of
cell-pair area, 175 L/h, and it removes 2.7 % of the diluate's sodium in one
pass.  This is the same machine grown up — a 100-cell-pair, 50 m² industrial
Eurodia unit that **Vítor Geraldes has operated**, at 3000 L/h, taking 50 % of
the sodium out.

```
operation
{
    stack             EurodiaED-100P-50;
    membrane          CMX_AMX;        // the CASE names the pair -- see (1)
    targetDemin       0.5;            // and Choupo solves for the current
    xi                0.9;
    E_electrodes      2.0;
}
```

## The record's facts are a recollection, and it says so

`data/standards/assets/EurodiaED-100P-50.dat` is not a data sheet.  Its
numbers — 100 cell pairs, 50 m², a channel height of *"aprox"* 0.7 mm, a
zig-zag spacer, two hydraulic passes, a design flow of 3000 L/h — are what
their owner remembers of a unit he ran, and each carries `origin measured;
reviewStatus unverified;` with a note saying how to verify it.  They are
announced on every run.

## Three things to read off the log

### (1) The case names the membrane pair, and the record does not

He did not say which membranes the unit carried, so the record leaves the
field **out**.  A stack *frame* takes any ion-exchange pair, exactly as the
SEPA CF laboratory cell takes any coupon.  Omit `membrane` here and the run
refuses by name; declare one beside `stack EUR2C-7P18;` in ed03, whose record
*does* name its pair, and **that** refuses instead.  The record decides which
way the refusal points.  Neither side guesses a pair on the owner's behalf.

### (2) The channel length is DERIVED, and says so

Nobody stated the channel width or its length.  Exactly **one** of the two is
stored, and it is the estimate:

```
channelWidth    0.298 m;     // ESTIMATE: back-calculated from u = 0.080 m/s at 3000 L/h
```

The length then follows, and is printed as what it is:

```
      channel length           1.677852 m   (DERIVED: activeArea / (cellPairs x channelWidth) -- the source states none)
      flow path length         3.3557 m   = channelLength x passes
```

Storing a back-calculated length *beside* a back-calculated width would be two
homes for one guess, and the second would read like a declaration.  (ed03's
record **does** declare its length, because its paper states the width, the
length *and* the effective area as three separate facts — and the engine
cross-checks them.)

### (3) Two hydraulic passes

```
      channels in parallel     50.0000   = 100 cell pairs / 2 hydraulic passes
      Q_diluate                8.33333e-04 m3/s   (3000.00 L/h)
      u = Q/(n W h)            0.079898 m/s  SUPERFICIAL (empty channel section 1.04300e-02 m2)
```

100 cell pairs over 2 passes is 50 channels side by side, so the same 3000 L/h
gives twice the velocity a single pass would, and a parcel of diluate travels
1.68 m twice.  The pass belongs to the **equipment** (Vítor's ruling), so it
is on the record; a case that declares it is refused.

## Why the bench stack's mass-transfer correlation may be used here

`Sh = 0.29 Re⁰·⁵ Sc⁰·³³` was fitted on the EUR2C-7P18 bench stack over
**Re 50–86**.  Over the same 0.066–0.110 m/s superficial band that stack was
run at, on pure water at 20 °C:

| | channel height | Re band |
|---|---|---|
| this stack | 0.70 mm | 46 → 77 |
| EUR2C-7P18 | 0.77 mm | 51 → 84 |

The two bands very nearly coincide, **because Re is built on the channel
height and the two spacer thicknesses very nearly coincide**.  So the fit is
being *applied inside its own band*, not extrapolated beyond it.  The record
declares that band (`validity { Re ( 50 86 ); }`) and the engine **announces**
any run that leaves it; this case sits at Re 62.9.

The permission is about the **Reynolds number only**.  This spacer is
zig-zag and the bench stack's was a mesh; no correlation in this tree selects
on the spacer type, and the record says so in its own header.

## No `limits {}` block, deliberately

The only number in that family anyone stated is the **design** diluate flow,
and a design point is not a ceiling.  Filing 3000 L/h as `flow_max` would
promote it to one silently — and it did: the comparison landed a
floating-point hair above and the run accused the stack of exceeding its
rating while doing exactly what it was designed to do.  A limit this record
does not declare is absent and is not checked.
