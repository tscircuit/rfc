# Proposal: Subcircuit Caching Must Be Lossless or Loud

## Status

Proposed, with the general guard landed in core: **isolation is now declined,
loudly, for any subtree holding something the inflators cannot rebuild.** The
remaining proposals below are about making that guard fire less often -- by
making the round trip lossless -- rather than about catching the loss.

Found while deciding whether the enclosure needs durable Circuit JSON records for
authored intent (`2026-08-14-enclosure-mounting-hardware.md`, 1.5.3). It does
not — but only because isolation can be declined. The underlying behaviour is
core's, affects elements with no connection to enclosures, and belongs here.

| Finding | State |
| --- | --- |
| Declarations with no Circuit JSON record are dropped silently | measured; guard landed in core |
| A plain `<hole>` is dropped too | measured; no longer silent -- caching is declined; inflator still **unfixed** |
| An `ftype` with no case in the inflator switch (`<pinheader>`) threw mid-render | caching is declined before it can throw |
| Caching changes the element count by 3.9x | measured; unexplained |
| Measured speedup: 1.00x - 1.33x for 4 - 24 identical modules | measured |
| Proposal: make the round trip lossless, or refuse to take it | proposed |

---

## What isolation is, and what it is for

`Subcircuit_doInitialRenderIsolatedSubcircuits` memoizes subcircuit rendering.
For a subcircuit whose `_subcircuitCachingEnabled` resolves truthy it renders the
children in a separate `IsolatedCircuit`, sets `subcircuit.children = []`, keeps
the result as an `AnyCircuitElement[]` keyed by a hash of the subcircuit's props,
and rebuilds components from those records using the inflators in
`Group/Subcircuit/inflators/`. A second subcircuit with the same prop hash reuses
the cached JSON instead of rendering, and a concurrent one waits rather than
duplicating the work.

The intent is sound: a board with sixteen identical channels should render one.

**How it is switched on matters more than it looks.** The prop is
`z.boolean().optional()` with no default, and on a subcircuit with nothing set it
resolves to `undefined`. But `getInheritedProperty` walks *up* the tree, so
setting it on a `<board>` or an outer `<group>` enables it for everything
beneath; and it then falls back to `root.platform`, through a runtime `in` check
rather than the `platformConfig` schema. **A platform can therefore enable this
globally for code that never mentions it**, and the author has no way to see it.
Nothing in the cloned ecosystem — eval, cli, runframe — does so today.

---

## What it costs

Measured on a board of identical subcircuits (four passives each, same names and
props so the hashes actually match), with the flag off versus on:

| identical subcircuits | off | on | speedup | elements off | elements on |
| --- | --- | --- | --- | --- | --- |
| 4 | 274ms | 272ms | 1.00x | 329 | 461 |
| 12 | 482ms | 422ms | 1.14x | 977 | 2333 |
| 24 | 1272ms | 954ms | 1.33x | 1949 | 7541 |

Two things to take from that table.

The speedup is **modest** — a third, at twenty-four repeats, and nothing at four.
Worth having, not worth much risk.

The **element counts do not match**, by up to 3.9x. Whatever the cause, a cache
whose output differs that much from the uncached path is not a transparent
optimization, and that discrepancy should be explained before the feature is
relied on. It is not obviously benign: it could be duplicated `source_group`
records per instance, or it could be something worse.

---

## Three ways it loses data

The inflators are keyed one per `source_*` record type. Anything that is not a
record, or is a record with no inflator, has nothing to be rebuilt from.

### 1. Declarations with no record of their own — guard landed

`<enclosure.cutoutaperture>` and `<enclosure.screwboss>` emit no Circuit JSON
deliberately: they are inputs to the enclosure solver, consumed during the
render, and the enclosure RFC argues at length that a solver input does not
belong in the interchange format. Isolation destroys them.

Confirmed by A/B on a board with one boss inside a cached subcircuit and one
outside:

| | mounts reaching the solver | `pcb_hole`s emitted |
| --- | --- | --- |
| guard disabled | `["EN1.H2"]` | 1 |
| guard restored | `["EN1.H1", "EN1.H2"]` | 2 |

The enclosure renders cleanly either way. It is simply missing a mount.

**Landed:** `Group/Subcircuit/ephemeral-declarations.ts` marks components that
carry no Circuit JSON, and isolation skips any subtree containing one.
Correctness is not negotiable against a cache worth 1.33x. The marker is general,
so a future ephemeral element is covered by setting one flag.

### 2. A plain `<hole>` — no longer silent, still uninflatable

This one has nothing to do with enclosures. With no enclosure code present, a
`<hole>` and a `<resistor>` inside a cached subcircuit yield:

```
pcb_holes: 1 (expected 2)
source_components: ["R1"]
```

The resistor survives; the hole does not. A `pcb_hole` *does* have a record — it
is `inflateStandalonePcbPrimitives` that does not bring a standalone one back.

That is still true, and still a defect to fix. What has changed is that it no
longer costs a wrong board: a subcircuit containing a `<hole>` is not cached, and
says why. "Do not cache" is not a fix for the missing inflator — proposal 1
below stands — but it is the difference between a slow board and a wrong one.

### 3. Anything else nobody has checked — now declined by default

Those two were found by looking. The architecture — one inflator per record type,
silent omission for everything else — means the set of things that survive is
whatever inflators happen to exist, and no test compares the two paths in
general.

**Landed:** `Group/Subcircuit/isolation-round-trip.ts` inverts the default. It
holds an allowlist keyed by `componentName`, whose *value* names the inflator
that rebuilds each entry, so the pairing with `inflate-circuit-json.ts` can be
checked by reading. A subtree is isolated only when every declaration in it is
on that list; anything else renders normally and warns once per circuit, naming
the offending components and why each cannot come back:

```
⚠️ subcircuit caching disabled for <group#14 name=".module" />: it contains 1
   declaration(s) that cannot be rebuilt from Circuit JSON, and caching would
   silently drop them:
  - <hole#0(.module>.H1) /> has no inflator, so nothing rebuilds it from its
    Circuit JSON record
  This subcircuit rendered normally instead (correct output, no cache).
```

The walk stops at components the inflators rebuild whole — a chip's footprint,
pads and ports come back with the chip, so they are not separate declarations to
vet — but it keeps descending for ephemeral declarations, which have nowhere to
come back from at any depth.

The cost of being wrong is now asymmetric in the safe direction. A missing entry
means a cache miss; an entry that should not be there means a wrong board. So
the list is short and grows only with evidence — proposal 3 is what that
evidence should look like.

---

## Proposal

**1. Fix the standalone-primitive inflation.** A `<hole>`, and by extension every
standalone PCB primitive declared directly in a subcircuit, must come back. Until
then the guard declines to cache those subcircuits, which is a slowdown standing
in for a defect, not a fix for it.

**2. Explain or fix the element-count divergence.** A transparent cache produces
the same document. Until the 3.9x is understood, it is not one.

**3. Make the round trip verifiable rather than assumed.** The general defect is
that nothing compares the cached and uncached outputs. A test mode that renders a
fixture both ways and diffs the Circuit JSON would have caught all three findings
here, and is the only thing that will catch the fourth. Differences that are
legitimate (ids, ordering) need normalizing once; everything else is a bug.

**4. Keep the guard regardless.** Even with lossless inflation, a declaration
with no record cannot survive a round trip through records. That is not a bug to
fix but a property to respect, and the guard is how it is respected. The same
applies to the general form: a cache that opts in only to what it can prove it
rebuilds stays correct as elements are added to core by people who have never
heard of it.

**5. Consider whether the platform fallback should be able to reach this flag.**
An optimization that can be enabled globally, invisibly to the author, and that
silently changes what the render contains, is a bad combination. At minimum it
should be a declared `platformConfig` key rather than an undeclared runtime
lookup.

---

## A note on diagnosing this

Three of my own probes here proved nothing before one proved something, and all
three failed the same way: they inspected the component tree by guessing at
identity, got an empty result, and the empty result read exactly like a negative
finding.

- `<group subcircuit>` is not `<subcircuit>`; the isolation methods live on the
  `Subcircuit` class and a plain `Group` returns early.
- `<subcircuit>` reports `componentName: "Group"` — it is a `Subcircuit` instance
  that never overrides its config — so searching a tree for
  `componentName === "Subcircuit"` finds nothing and looks like "isolation did
  not run".
- A grep for a default value targeted two paths that do not exist, and returned
  nothing.

The habit that fixed it: print the whole tree before filtering it, and A/B the
change rather than reasoning about the code. The `componentName` mismatch is
worth fixing on its own — a class whose instances report a different name than
the class is a trap laid for the next person.
