# relief01_ammonia_loop_gas — the loop gas at its relieving pressure

```
runCase tutorials/props/safety/relief01_ammonia_loop_gas
```

The gas side of a **blocked-outlet** relief valve on the green-ammonia
synthesis loop: the converter's outlet is shut while the recycle compressor
goes on delivering the converter feed, so the valve on the feed side must pass
that whole flow at the relieving pressure.

Two `propertyPoint` operations, one per loop pressure of the two C57
feasibility cases ([`greenAmmonia02_feasibility150bar`](../../../plant/greenAmmonia02_feasibility150bar)
at 150 bar and [`greenAmmonia02_feasibility50bar`](../../../plant/greenAmmonia02_feasibility50bar)):

* the **composition** is each plant's converged converter feed
  (`PreheatedFeed`), copied as component flows in kmol/h — `propertyPoint`
  normalises it, and the EduTool reads the same numbers back as the relieving
  rate;
* the **temperature** is that stream's;
* the **pressure** is the relieving pressure of a single device set at a MAWP
  given by the Design Guide's rule of thumb, max(1.1 × operating,
  operating + 1.7 bar), plus the 10 % accumulation — worked out in the
  propsDict header.

What the run gives the relief equation is **Z** (SRK vapour root, kij = 0,
announced) and **k = Cp/Cv** (the ideal-gas ratio). The sizing itself is the
EduTool's arithmetic: *Designing for overpressure* (DEV.md 4c C61), where the
50 bar loop turns out to need a relief valve about four and a half times
larger than the 150 bar one.

Nothing here is a design pressure or a relief load for a real loop.
