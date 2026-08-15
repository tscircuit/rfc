# Proposal: Enclosure Mounting Hardware and the Device Manufacturing BOM

## Status

Proposed. Companion to *Parametric Enclosures*
(`2026-06-22-parametric-enclosures.md`), which deliberately deferred this:

> Mounting hardware and broader product structure need their own design. A
> separate RFC can define `assembly.group`, fasteners that reference mounting
> holes, and any process model without making enclosure geometry depend on those
> unsettled semantics.

This is that RFC. It covers one authoring element (`enclosure.screwboss`), the
hardware catalogue behind it, the geometry it contributes, and — the part with
the largest blast radius — how a device's **manufacturing BOM** is represented
without interfering with the board's electrical BOM.

| Area | State |
| --- | --- |
| `enclosure.screwboss` authoring props | **implemented** (`props`) |
| Vendor-backed fastener catalogue and screw-length derivation | **implemented** (`create-fdm-enclosure/lib/hardware/`) |
| PCB mounting bosses (heat-set / press-fit / self-tapping) | **implemented** |
| Lid screws through a PCB hole, with countersink / counterbore recesses | **implemented** |
| Hardware occurrences in the solver output | **implemented** (`CreateFdmEnclosureOutput.hardware`) |
| Spacers, stocked or cut from stock, and length-based BOM units | **implemented** |
| Hardware DSL like footprinter, and generated geometry for purchased parts | **implemented** |
| Vendor CAD (McMaster) for non-parametric families | proposed; blocked on a licensing answer, not on format support |
| Core reads bosses declared on holes and on the enclosure | **implemented** |
| Durable Circuit JSON records for assembly parts (three, all structural) | **proposed only, deliberately not implemented** |
| Records for authored aperture/boss intent | **argued against** (§1.5.3); one open risk around cached subcircuits |
| `getPcbaBom` / `getEnclosureBom` / `getDeviceMbom` | proposed, blocked on the circuit-json records |
| Core lowering of hardware geometry into CAD | not started |
| Boss-versus-component and boss-versus-aperture collision checks | not started |
| Derived bill of process (Part 5) | designed and prototyped; not built |
| Hardware procurement engine (McMaster / Fastenal adapters) | proposed |
| Cable, label, thermal-pad and packaging items | out of scope |

---

## Motivation

Creating the enclosure box and cutouts was the first step. Mounting hardware is 
required to a assemble a device. It is also where a second, quite different bill
of materials appears — one that goes to a different vendor, is identified differently,
and is consumed by a different assembly step. Getting that representation right will
not necessarily follow the current EBOM implementation.

---

## Part 1 — The device manufacturing BOM

### 1.1 Construction of current EBOM

`circuit-json-to-bom-csv` is the only BOM producer in the ecosystem (runframe's
BOM table and the CLI both call it), and it is very simple:

```js
for (const elm of circuitJson) {
  if (elm.type !== "pcb_component") continue
  const source_component = /* join on source_component_id */
  bom.push({ designator: source_component.name, comment, value, footprint, ... })
}
```

Three consequences, all load-bearing:

1. **EBOM membership is structural based on pcb_component.** A record with no
   `pcb_component` cannot appear in the BOM. The existing BOM is *the PCBA BOM by
   construction*.
2. **Identity is `source_component`'s**: designator, MPN, supplier part numbers,
   display value.
3. **One row per occurrence.** Quantity is implicit; grouping is a downstream
   rendering concern.

Enclosures are abusing (1). Rendering a board with one resistor plus an
`<enclosure.fdm.box name="EN1">` and running the real converter over the output
gives:

```
{ "designator": "R1",  "comment": "10k" }
{ "designator": "EN1", "comment": ""    }   ← the enclosure, as ftype "simple_chip"
```

The enclosure is quoted to the board assembler as a line item, because
`cad_component` requires both `pcb_component_id` and `source_component_id`, so
generated CAD forces a synthetic PCB component into existence to own the enclosure.
This is wrong because the enclosure is not required to assemble the board,
and should not be part of the EBOM sent to the board manufacturer/pick-n-place.

Mounting hardware also does not belong in the EBOM; therefore we propose a hierarchical
BOM where the PCB owns the EBOM as it does today, and the assembly.device owns all
components required to assemble the device: the enclosure parts, and all mounting hardware.

### 1.2 There is no "second BOM per part"

A BOM should belong to an **assembly** and lists what that
assembly consumes; a single part appears in exactly one. This is the ordinary
item-master/structure model, and the reason a screw is absent from the board's
BOM is not that it is "mechanical" -- it is that *the board assembly does not
consume it*:

```
device "controller"                            <- final assembly
|-- PCBA "B1"                    x1            <- subassembly  -> JLCPCB
|   |-- R1  10k 0402             x1               (the EBOM: pcb_components)
|   `-- ...
|-- enclosure "EN1"              x1            <- subassembly  -> print farm
|   |-- base                     x1   MAKE        FDM, PLA, base.stl
|   |-- lid                      x1   MAKE
|   |-- M3 heat-set insert       x8   BUY
|   `-- M3x8 countersunk screw   x8   BUY
`-- ribbon cable, 10-way, 100mm  x1   BUY      <- device-level: belongs to no
                                                  subassembly
```

`MAKE` and `BUY` are shown because the distinction is real and an assembler acts
on it, but note that it is **derived, not stored**: a part carrying a
specification designation is bought, and a part carrying generated geometry and no
designation is made. This RFC keeps choosing derivation over storage — BOM views
are queries (§1.6), the assembly sequence is derived (Part 5), and make/buy is a
read of what the part already carries.

Every component that belongs to a top-level assembly.device tag (board, enclosure,
and more subassemblies later) could have its own BOM; the BOM for PCBA is already
built; we are proposing to build the BOM for the enclosure components, but not
other subcomponents of the device assembly, such as ribbon cables.

Each assembly's BOM goes to the vendor that builds that assembly. That is the
user-visible distinction we want, and it emerges from the structure rather than
being asserted by a field or series of steps.

**Which node owns a part: whatever generates the requirement.** The screws are
worth stating explicitly, because a process/sequence view of the tree would make
them children of the assembly rather than enclosure. Ordered by operation, the
inserts are pressed into the base before anything else -- an enclosure operation --
while the screws are driven only once the board is in the box, which is a final-
assembly operation, so an process-following MBOM would hang the screws off the
*device*. From a declarative perspective, they belong under the enclosure: they
exist because the enclosure has bosses, they are specified by the enclosure design,
they are ordered with the rest of the box hardware, and deleting the enclosure
deletes them. **Structure by what generates the requirement; sequence becomes
emergent.** Part 5 shows that the sequence is *derivable* from what the solver
already computes, which is what makes this a presentation choice rather than a
structural commitment: the tree groups by requirement, a derived process says
when each piece is consumed, and an operation-sequenced MBOM is then a different
expression of the same tree.

### 1.3 Hardware is identified by specification, not by MPN

The second reason this is not simply "the electrical BOM with more rows":

| | Electrical BOM line | Mechanical hardware line |
| --- | --- | --- |
| Primary identity | MPN (`GRM155R71C104KA88D`) | designation (`ISO 4762 M3×8 A2-70`) |
| Substitution | risky, requires review | expected; any conforming part |
| Sourcing | often single-sourced | commodity, fungible |
| Missing MPN | a defect — `source_missing_manufacturer_part_number_warning` exists | normal |
| What the assembler needs | that exact part | the designation, and parts bins |

So a hardware line's identity is a canonical **specification designation**, with
MPN and supplier as an optional *preferred source*. That inverts the priority in
`source_component`, where MPN is primary and no specification exists. It is a
genuinely different identity model, which is what justifies a separate record
rather than a relabelled `source_component`.

### 1.4 The rule

> **An occurrence that is not physically placed on the PCB must not own a
> `pcb_component`.**

The PCBA BOM is then correct by construction: `circuit-json-to-bom-csv` needs no
change and cannot accidentally include hardware, and no future consumer has to
remember to filter. This is opt-**in** where a category flag would be opt-**out**.

### 1.5 Proposed Circuit JSON records — generic, deliberately not implemented

These records are **proposed, not committed**. The implementation described in
Part 3 proceeds without them: hardware currently lives in the solver output only,
and no `circuit-json` change is made until the set below has been adopted.

First, `cad_fdm_enclosure` was originally proposed as the circuit-json element
to store the metadata about the FDM enclosure; however, that would encode a
process taxonomy into the interchange format that the authoring namespace should
not need to commit to. So the process should be a **field**, not a record type:

```ts
/** Product-level root. One per assembly.device. */
interface SourceAssemblyDevice {
  type: "source_assembly_device"
  source_assembly_device_id: string
  name: string
}

/** One authored enclosure request. Process is a field, not a record type. */
interface SourceEnclosure {
  type: "source_enclosure"
  source_enclosure_id: string
  /** Membership: this enclosure is a subassembly of that device. */
  source_assembly_device_id: string
  name: string
  /** How it is produced. Extensible; not a closed taxonomy. */
  manufacturing_process: "fdm" | string
  /** How it comes apart. Extensible. */
  construction: "box" | string
  /**
   * Geometry reference: the board(s) this enclosure is built around.
   *
   * Deliberately NOT the membership edge, which is why it can become a list for
   * a multi-board enclosure without disturbing the assembly tree. A board is a
   * subassembly of the *device*, not of the enclosure — the enclosure is built
   * and shipped without a board in it.
   * Enclosures can mount multiple PCBs in the future because each PCB can have
   * mounting holes and cutout apertures specified for that board's components,
   * although we only use a single boardRef per enclosure today.
   */
  pcb_board_ids: string[]
}

/**
 * One physical member item consumed by an assembly: a printed shell, a screw,
 * an insert, a spacer, a washer, a label, a ribbon cable.
 *
 * One record per physical piece — quantity is grouping, exactly as the PCBA BOM
 * derives quantity from occurrences today.
 */
interface AssemblyPart {
  type: "assembly_part"
  assembly_part_id: string

  /**
   * The assembly that consumes it. Exactly one, and the only edge that decides
   * which BOM the part appears in.
   *
   * Discriminated rather than a bare id because expanding a node is
   * polymorphic — a board expands to its `pcb_component`s, an enclosure to its
   * `assembly_part`s — so a generic walk has to know what kind of node it is
   * standing on. A third kind (a cable harness, a daughterboard module with its
   * own sub-parts) is then a new enum value, not a new field.
   */
  parent_assembly_type: "assembly_device" | "enclosure"
  parent_assembly_id: string

  name: string                       // "EN1.base", "EN1.H1.screw"

  /** Specification identity. Groups BOM lines when no MPN exists. */
  designation?: string               // "ISO 4762 M3x0.5x8 A2-70"
  display_value?: string             // "M3 x 8mm socket head cap screw, A2 stainless"
  manufacturer_part_number?: string
  supplier_part_numbers?: Partial<Record<SupplierName, string[]>>

  /**
   * The element who carries the declaration requiring this part
   * See §1.5.2.
   */
  generated_by?: CircuitJsonElementRef

  /** Placement in the device frame, and the geometry to draw. */
  position: Point3
  rotation?: Point3
  model_jscad?: unknown
  model_stl_url?: string
  model_step_url?: string
  model_unit_to_mm_scale_factor?: number
}
```

### 1.5.1 Two kinds of edge, and only one new record

An assembly tree has two kinds of edge, and they are not expressed the same way:

| Edge | Meaning | Expressed as |
| --- | --- | --- |
| assembly contains **subassembly** | the device contains this enclosure, and this board | a parent pointer on the *node* record: `source_enclosure.source_assembly_device_id`, plus a new `pcb_board.source_assembly_device_id` |
| assembly consumes **item** | this enclosure consumes 8 screws | one `assembly_part` per piece, carrying its parent |

So the structure costs one new relationship on an existing record — `pcb_board`
gains an optional device pointer, since nothing links a board to the device that
contains it today — and the parent on `assembly_part`. The PCBA line in the
device MBOM is then *derived* from the board node being under the device, rather
than being a second record that could drift out of agreement with the board it
names.

This is also the answer to daughterboards, ribbon cables, and anything else that
belongs to the device but not to the enclosure: they are `assembly_part`s whose
parent is the **device**, or — when they have internal structure that requires
expansion, a further node kind with parts beneath them. Nothing about the enclosure
is privileged in the shape; it is simply the first subassembly we have built so far.

`assembly_part` carries its own geometry rather than borrowing `cad_component`,
for the reason the parametric-enclosures RFC already gives: `cad_component`'s
asset-normalization fields (`model_origin_alignment`,
`model_board_normal_direction`, `model_object_fit`, `anchor_alignment`) describe
how to fit *a supplied part file to a footprint*. A generated plan is already
authored in device coordinates, so `position` alone places it, and none of those
fields have a meaning to give. The alternative — relaxing
`cad_component.pcb_component_id` to optional — is a wider change that turns a
`string` into `string | undefined` for every existing consumer, and it would
still leave the footprint-fitting fields meaningless on these records.

### 1.5.3 There is no record for the authored intent, and there should not be

No `source_enclosure_mount`, and — the same argument — an open question over
whether `source_cutout_aperture` earns its place either.

The reason is a principle worth stating outright, because it decides several
later cases too: **Circuit JSON represents the artifact, not the source that
produced it.** It is tempting to read the existing `source_*` records as
"the design intent, persisted", but that is not why they exist. `source_component`
and `source_trace` are there because the *netlist* is a semantic model that the
schematic view, the PCB view, simulation, DRC and the BOM all read
independently — not so that the TSX can be reconstructed. A record earns its
place by having consumers, not by having been authored.

Measured against this RFC's own criteria (§1.5), an aperture fails the fifth
outright: it is *an input to the enclosure solver, consumed during render*, in
exactly the way `wallThickness` and `standoffHeight` are. Nobody proposes
persisting `wallThickness` as a record, and an aperture is the same kind of
thing wearing a more object-like shape.

A screw boss fails for a second and independent reason: **`generated_by` already
carries everything a mount record would.** A mount is not a thing anyone makes or
buys — it is a feature of the base, and the base is already an `assembly_part`.
The things it *does* produce (a screw, an insert, a spacer) are parts, already
have records, and each already points at the `pcb_hole` that caused it. A
`source_enclosure_mount` would restate an association the parts already carry.

**What is given up, stated plainly.** With no aperture record, nothing downstream
can ask "which component is this opening for?" — the opening is anonymous
geometry inside the shell's CSG tree. A checker running over a *saved*
`circuit.json` therefore cannot verify a rule like "every connector that declares
an aperture got an unobstructed one"; that check has to run during the render,
where the resolved apertures still exist. Both are acceptable today, and neither
is recovered by a record that no shipped consumer reads.

The proposal is therefore **three records, all structural** —
`source_assembly_device`, `source_enclosure`, `assembly_part` — each justified by
the assembly and BOM tree rather than by having been typed into a `.tsx`. That is
a considerably easier case to make to circuit-json than five.

**One unresolved risk, which is a mechanism rather than a representation
argument.** Core renders cached subcircuits *in isolation*:
`Subcircuit_doInitialRenderIsolatedSubcircuits` sets `subcircuit.children = []`
and replaces the subtree with an `AnyCircuitElement[]` keyed by a prop hash. Any
declaration that is not representable as a Circuit JSON element cannot survive
that boundary — which would mean an `<enclosure.cutoutaperture>` or
`<enclosure.screwboss>` inside a cached subcircuit silently disappearing. That is
core's own internal boundary mid-render, not a persistence question, so it would
force a record for a reason unrelated to everything above.

It is recorded as a risk rather than a conclusion because **an attempt to
reproduce it failed**: in a fixture with a boss inside a
`_subcircuitCachingEnabled` group, both mounts reached the solver and the
subtree was never cleared, because the isolation pass returns early when the
group has no `getSubcircuitPropHash` (it is defined on `Board` and `Subcircuit`).
So the hazard is real in the source and unproven in practice. It should be
settled by a test that actually engages isolation before either record is
accepted or finally rejected.

### 1.5.2 Provenance is a reference to *any* element, not to a hole

An earlier draft traced a part with `pcb_hole_id` and `source_component_id`. Both
are wrong, and wrong in the same way: they name the kinds of element the
*enclosure* happens to generate parts from, and freeze them into a record meant
to describe every non-board item in a device. A jumper wire is generated by a pin
header, which is neither. An aperture is generated by a footprint. The next case
will be something else again.

The generic form is a reference to any Circuit JSON element:

```ts
/**
 * A reference to any Circuit JSON element: its `type`, and the value of that
 * element's own `<type>_id` field.
 */
interface CircuitJsonElementRef {
  element_type: string   // "pcb_hole", "source_port", "pcb_component", ...
  element_id: string
}
```

This is not a new idea in the format — it generalizes a shape circuit-json has
already reached for once. `schematic_element_outside_sheet_warning` carries
exactly this pair, as `schematic_element_type` (a closed three-value enum) plus
`schematic_element_id`. Lifting it into a shared type is the difference between
one record having ad-hoc provenance and any record being able to.

**Why the type is carried rather than inferred from the id.** Ids are prefixed
with their type by convention — `getZodPrefixedIdWithDefault` does it for
generated ones — but a caller may supply any string, so the prefix is a
convention, not a guarantee. Carrying the type also lets a consumer *dispatch*
without resolving: "highlight refs to `pcb_*` elements" needs no lookup, and a
dangling or mistyped reference becomes detectable.

**Resolution needs no new helper.** `@tscircuit/circuit-json-util` already has
`getElementId(element)` — which is exactly ``element[`${element.type}_id`]`` — and
`getElementById(circuitJson, id)`. A ref resolves with what already exists.

**One ref, not a list.** Provenance is really a chain: a screw exists because of a
mount, which exists because of a boss declared on a hole, inside an enclosure. But
the far end of that chain is already `parent_assembly_id`, so the most proximate
element is enough — a PCB-mount screw points at the `pcb_hole` and is parented to
the enclosure, and both facts are present without a list. A lid screw leaves
`generated_by` **absent**, which is honest rather than redundant: it is generated
by the enclosure itself, and that is its parent.

**A limit worth stating**, since it is the example that prompted this: "generated
by a footprint" is *not* expressible, because there is no footprint element. A
footprint is expanded at render into pads and holes owned by a `pcb_component`, so
the truest available reference is that component, or the specific pad or hole.
Making a reference generic does not conjure elements the format does not have, and
a record wanting real footprint provenance would need circuit-json to grow one
first.

### 1.6 Three BOM queries, one walk

With those records a BOM view is a **subtree**, not a filtered list. Proposed for
`@tscircuit/circuit-json-util`:

| Function | Node it is rooted at | Emits | Goes to |
| --- | --- | --- | --- |
| `getPcbaBom(circuitJson, { boardName? })` | a `pcb_board` | its `pcb_component`s — exactly what `circuit-json-to-bom-csv` produces today | the board assembler |
| `getEnclosureBom(circuitJson, { enclosureName? })` | a `source_enclosure` | its fabricated shells and the hardware consumed to mount and close it | the print farm and the fastener supplier |
| `getDeviceMbom(circuitJson)` | the `source_assembly_device` | each child node as **one line**, expandable to that node's own BOM, plus the device-level parts | final assembly |

The three are one recursive walk with a per-node-kind expansion, not three
bespoke queries — which is the practical reason §1.5's parent reference carries
the node kind. `getEnclosureBom` is `getDeviceMbom` rooted lower; adding a fourth
node kind adds an expansion, not a function.

`getDeviceMbom` emitting the PCBA as a single line is what makes it a real
product MBOM: the final-assembly vendor needs the board as one item they receive,
not as 47 lines they cannot place. Whether a consumer wants that line expanded is
its own decision, which is why the walk returns a tree and flattening is left to
the caller — a CSV exporter for one vendor wants the subtree elided, and a costed
roll-up wants it expanded.

Grouping key within a node:

```
spec:<designation>                   the identity — deterministic from the spec alone
mpn:<manufacturer_part_number>       only when no designation describes the part
```

**The specification is the identity and the part number is not**, which is the
inverse of the electrical BOM's rule and follows directly from §1.3: any screw
meeting `ISO 4762 M3x8` will do, so two of them are one line whatever their part
numbers say. An earlier draft had this backwards, keying on the part number when
one was known, which contradicted §1.3 two pages earlier.

The decisive argument is stability rather than taste. A part number is *the
result of a lookup* — against a vendor catalogue, at a moment, possibly over a
network. Keying on it makes the **shape of the BOM depend on that lookup**: the
same unchanged design, resolved on a day when one vendor is out of stock, splits
one line of eight into two of four. That is the same failure this section already
refuses for catalogue keys, wearing a more official-looking name.

So a part number rides on the line as its preferred source, and `designation`,
`display_value`, `manufacturer_part_number` and `supplier_part_numbers` are not
four competing identities on `AssemblyPart`: the designation identifies, the
display value is what a human reads, and the other two are *sourcing* — the
resolved answer cached into the artifact so it can be ordered without re-running
an engine, exactly as `source_component` caches what `partsEngine` resolved.

Where two pieces genuinely must be bought separately — a different material or
finish — that difference belongs in the **specification**. Its absence there is a
missing axis (§2.1 notes material and finish are not axes yet), not a reason to
key a BOM on procurement. Note that grouping
is **per node**: eight identical screws under one enclosure are one line of
quantity 8, and the same screw used by a second enclosure is a separate line
under that enclosure. Rolling those together across the whole device is a
purchasing question, and it is a fold over the tree rather than a property of it.

---

## Part 2 — The fastener catalogue

### 2.1 Specification axes, not preset nicknames

The reference implementation selects hardware by nickname
(`anchor="m3-heat-set"`, keys into a `mountingStacks` table). Nicknames are
invented vocabulary that must be memorised, are plain `string` to the type
system, and conflate four independent axes — so changing head style alone means
forking a whole preset, and the built-in table grows as the product of the axes
rather than their sum.

Hardware is instead specified the way vendors sell it, along orthogonal axes:

| Axis | Values | Determines |
| --- | --- | --- |
| `thread` | `M2` `M2.5` `M3` `M4` `M5` (imperial later) | clearance hole, pilot hole, insert bore, head dimensions |
| `fastening` | `heat_set_insert` `press_fit_insert` `self_tapping` `machine_screw_nut` | how the boss is bored and what hardware is consumed |
| `head` | `socket_cap` `countersunk` `pan` `button` | head Ø/height, and which recess is legal |
| `headRecess` | `none` `countersink` `counterbore` | geometry cut into the part the head bears on |
| `length` | distance, **normally omitted** | derived from the stack; see §2.3 |

Each is a typed enum, so a typo is a compile error rather than a silent
fallback, and the axes compose.

### 2.2 The catalogue is a curated view of a real vendor catalogue

The decisive constraint, and the one that makes this more than a table of
standards:

> **A specification may exist in the catalogue only if a real vendor sells that
> exact combination** of thread, pitch, length, head style, drive, material and
> finish.

Standards tables describe what a conforming part *would* measure. They do not
tell you that an M2.5×14 countersunk A2 screw is stocked anywhere, and a
generated BOM whose lines cannot be bought is worse than no BOM, because the
failure surfaces at purchasing rather than at design time.

So the catalogue is a **curated subset of vendor data**, and its axes are the
vendors' own faceted-search dimensions — that is exactly what the enums above
are. Two layers, mirroring the split tscircuit already uses for electrical parts:

| Layer | Contents | Analogue |
| --- | --- | --- |
| Built-in catalogue (`create-fdm-enclosure/lib/hardware/`) | curated specifications with dimensions and the stocked series per specification | a footprint library |
| Hardware engine (platform config) | resolves a specification to current part numbers, and to the variants a vendor stocks | `partsEngine.findPart` |

```ts
// props/lib/platformConfig.ts — beside the existing partsEngine

/** What a mechanical part is, stated the way a vendor's catalogue facets it. */
interface HardwareSpecification {
  /** Part family, which is what scopes a catalogue search: "screw", "insert", ... */
  category: string
  /** Canonical designation, where a standard gives one. */
  designation?: string
  /** The faceted axes and their values: { thread: "M3", head: "socket_cap", length_mm: 8 } */
  attributes: Record<string, string | number>
}

hardwareEngine?: {
  findHardware: (params: { specification: HardwareSpecification }) => Promise<{
    manufacturerPartNumber?: string
    supplierPartNumbers?: SupplierPartNumbers
    /**
     * Neighbouring specifications this vendor stocks. The caller filters them
     * for the axis it is solving along -- lengths, when rounding a screw (§2.3).
     */
    variants?: HardwareSpecification[]
  }>
}
```

**What the built-in catalogue actually carries, as opposed to what this section
first claimed.** It carries dimensions and stocked series, and **no part numbers
at all** — the earlier wording promised "at least one real part number" per
entry, and not one entry has ever had one. That mattered beyond tidiness: the
claim was used to justify leaving spacers out ("no vendor-backed spacer catalogue
exists"), a bar screws and inserts had never cleared either. Spacers are in now,
and the real distinction is narrower and worth stating: **a screw's dimensions
come from a published standard (ISO 4762 and friends) and a spacer's come from a
vendor**, so a spacer entry is dimensionally plausible rather than
standards-derived, and is marked in the source as needing verification. Part
numbers arrive with the engine, from a vendor, or not at all — never invented
here, because a fabricated part number poisons exactly the guarantee this
catalogue exists to give.

**Why `variants` rather than `availableLengthsMm`.** An earlier draft returned a
length series, which silently asserts that the axis a part varies along is
length. That is true of screws and false of nearly everything else a device
consumes: a washer varies in thickness, inner and outer diameter; a spacer in
length *and* thread; an o-ring in section and inner diameter. A variant is just
*another specification the vendor stocks*, and the caller filters it for the axis
it is solving along, so one engine interface serves every part family instead of
growing a return field per family.

Returning whole specifications rather than `{ axis, values }` pairs also handles
axes that are **correlated**: M3 is stocked in different lengths than M4, so a
list of lengths is only meaningful alongside the thread it belongs to.

**On the loose `attributes` map.** This is the one place the RFC accepts
stringly-typed data, and it is deliberate: the authoring surface stays typed
enums (§2.1), and this is the *vendor* boundary, where an adapter deals in facets
its catalogue defines and we do not. Typed at the authoring edge, faceted at the
vendor edge. Note that `category` here is not the `part_category` deleted from
`AssemblyPart` in §1.5: on a stored record it was redundant with the designation,
whereas a *query* has to scope the search before a designation exists.

Vendor adapters (McMaster-Carr, Fastenal, and others) are then the mechanical
analogue of the JLCPCB/EasyEDA adapters: they live outside this package, are
selected by platform config, and are not required for a render to succeed.
Keeping procurement in platform config rather than in props also preserves the
parametric-enclosures RFC's XML-compatibility rule — the TSX says *what the part
is*, never *where to buy it* — while leaving per-boss
`manufacturerPartNumber` / `supplierPartNumbers` attributes as an escape hatch,
matching props chips already accept.

Because every catalogue entry is vendor-backed, the reference implementation's
`generic: true` flag and its `bomMode: "off" | "warn" | "strict"` gate are not
carried over. There is no such thing as a specification with no procurement
identity, so there is nothing to warn about and nothing to disable. The MBOM is
always built.

### 2.3 Screw length is derived, then rounded to a stocked length

An author should not compute screw lengths by hand — the stack is known:
material thicknesses, board thickness, head seat, insert depth. But real screws
come in steps, so the derivation has two stages and a validation:

```
exact  = headSeatDepth + Σ(clamped material) + requiredEngagement
chosen = the smallest stocked length ≥ exact
```

with `requiredEngagement` a property of the fastening method:

| Fastening | Required engagement |
| --- | --- |
| `heat_set_insert`, `press_fit_insert` | the insert's threaded length |
| `self_tapping` (thermoplastic) | 2 × nominal thread Ø — plastic is far weaker than the screw, so the joint fails by stripping the boss |

and one upper bound: **the bore**. Not, as first written, the insert's threaded
length — an insert is a barrel open at both ends, so a screw may continue past
it; what it may not do is reach solid material. The bore in turn is deepened to
fit the screw that was actually *chosen*, since rounding up is what decides how
far the screw reaches:

```
bore = max(insert length + melt relief, screw penetration),  capped by the floor rule
```

Deriving it the other way round — fixing the bore at the insert's length and then
requiring the screw to fit it — rejects every stack whose exact length is not
itself a stocked size, which is most of them. The first implementation did
exactly that and could not resolve a single default enclosure.

The bound is checked **after** rounding, since rounding is what can violate it.
When it fails, no stocked screw fits the stack at all, and that is reported with
both bounds. There is deliberately no "try the next shorter length" fallback: the
lengths are sorted, so the shortest one that engages is the only candidate that
could also be short enough, and anything below it is by definition too short. A
fallback there is unreachable code that reads like a safety net.

The length series is data, from the catalogue entry or from the hardware
engine's `variants` — never a formula, because "which lengths exist" is a fact
about a vendor. `resolveScrewLength` therefore takes the series as a parameter,
defaulting to the built-in catalogue, so plugging an engine in later changes a
call site rather than the rule.

The same reasoning picks the **insert series**: the longest one whose installed
length fits the bore available, so a shallow stack degrades to a short series
rather than failing. The default 4mm standoff over a 2mm floor leaves 5.2mm of
bore, which does not take a 5.7mm M3 insert — the reference implementation hit
this and hardcoded the short insert, which then made every deeper enclosure
weaker than it needed to be.

### 2.3.1 Two clearance series, because two different people drill the hole

ISO 273 gives a fine and a medium series, and which one applies depends on who
owns the hole:

| Hole | Series | Why |
| --- | --- | --- |
| the PCB's mounting hole | **fine** (3.2mm for M3) | we do not drill it, and 3.2mm for an M3 is what practically every layout uses. Requiring the medium 3.4mm would reject almost every real board while the screw passes through perfectly well. |
| the lid's clearance hole | **medium** (3.4mm for M3) | we do drill it, and a printed part wants assembly slop |

This distinction was found by the first end-to-end fixture, which used a 3.2mm
mounting hole — the obvious thing to write — and was rejected by a rule that had
no business applying to it.

### 2.3.2 A head recess is two different depths

| Recess | Depth | For an M3 |
| --- | --- | --- |
| counterbore | the head's height | 3mm |
| countersink | `(headDiameter − clearanceDiameter) / 2` | 1.1mm, because a 90° cone descends 1mm per 1mm of radius |

The countersink is *shallower than the head is tall*, because the lower part of
the head sits inside the clearance hole rather than in the cone. Cutting the cone
to the head's height instead sinks the head below flush and removes twice the
material. Both the geometry and the "is there enough material left" rule read one
function for this, because when they each had their own idea of the depth, one of
them was always wrong.

It follows that a **socket cap head defaults to no recess at all**. A counterbore
is a legal thing to ask for and is right on a thick part, but an M3 cap head is
3mm and a printed lid is 2mm, so defaulting to one would cut a recess straight
through the lid of every box that did not ask for it.

### 2.3.3 Purchased parts get geometry from a DSL, not from a vendor

A spacer, a screw and an insert are all *bought*, so it is tempting to think
their 3D models must be fetched — from McMaster-Carr, say, which publishes STEP,
Parasolid, IGES and SAT for its catalogue. Investigated, that is the wrong tool
for this part of the problem, and the right one is already in the ecosystem.

**What already exists for electronics**, and is worth copying exactly:

| Layer | Package | Job |
| --- | --- | --- |
| DSL | `footprinter` | `"soic8_w5.3mm"` → a 2D footprint |
| Models | `jscad-electronics` | the same string → a parametric 3D model |
| Render | `circuit-json-to-gltf` | reads `cad_component.footprinter_string` and expands it |

A component's 3D model is *generated from an eight-character string*, not
shipped. `hardware-dsl.ts` and `get-hardware-model.ts` are the mechanical twin,
and deliberately reuse footprinter's grammar — segments joined by `_`, each a
name with an optional numeric value — so one grammar covers both vocabularies:

```
screw_m3_l8mm_socketcap   insert_m3_l5.7mm_heatset   spacer_od6mm_id3.2mm_l7.5mm
```

Dimensions carry their unit, as footprinter's do, and both directions reuse
`format-si-unit`: `formatMm` writes them and `parseAndConvertSiUnit` reads them
back. That is not incidental tidiness. `formatMm` already rounds floating-point
dust to three decimals, which is exactly what an identity needs — a gap derived
as `totalHeight - lidThickness - boardTopZ` arrives as 7.500000000000002, and a
string carrying that noise makes two spacers of the same real length into
different parts. And parsing through `parseAndConvertSiUnit` rather than
`Number` means a hand-written `l0.25in` resolves to 6.35mm instead of 0.25 —
the `toMm`-versus-`parseFloat` defect the workspace guide uses as its worked
example, which this DSL walked straight into on the first draft.

**Why generate rather than fetch, for these parts specifically.** A fastener's
shape is *entirely implied by its specification* — that is the premise of §2.1 —
so a vendor model adds a thread helix and exact fillets and nothing else. Against
that it costs a network round trip, a B-rep tessellation, a licence question, and
a runtime dependency on a vendor being reachable. It is also a **downgrade in
robustness** by this RFC's own argument for enclosure parts: a generated plan
survives the worker boundary, cached builds, a saved `circuit.json` and static
rendering, where a URL does not.

There is a second argument that is easy to miss. Part 5's access and path rules
sweep volumes, and the boss and aperture checks need clean solids; a tessellated
vendor mesh is *worse* input for both than the parametric plan. So even with
vendor CAD in hand, the rule would be **spec-derived geometry for reasoning,
vendor model for display** — which leaves the vendor model doing very little.

**Where vendor CAD does earn its keep** is the shapes a specification does not
imply: switches, cable glands, latches, hinges, fans, feet, DIN-rail clips. Those
are a later part family, and the plumbing for them is further along than
expected — `circuit-json-to-gltf` already tessellates STEP through
`occt-import-js` in both browser and Node, already accepts auth headers, and
`cad_component.model_step_url` is already read. What is missing there is not
format support but **a licensing answer**: the EasyEDA integration *mirrors*
vendor models onto `modelcdn.tscircuit.com`, and whether McMaster's terms permit
the same is a question for a human, not an implementation detail.

**The string carries three jobs at once**, which is why it is a string and not
just a typed spec:

| Job | Why the string |
| --- | --- |
| identity | canonical and total, so equal strings are the same part |
| geometry | `getHardwareModel(s)` returns a solid, so nothing has to ship a mesh |
| storage | ~20 bytes against ~250 for its own plan and kilobytes for a mesh, and it stays readable and diffable in a saved build |

Two details worth recording because both are load-bearing:

- **Dimensions are rounded when formatted into a string.** A gap derived as
  `totalHeight - lidThickness - boardTopZ` arrives as 7.500000000000002, and an
  identity that carries that noise makes two spacers of the same real length into
  different parts. Rounded to a micron, which is finer than the domain specifies
  and far coarser than the noise.
- **A cut spacer's geometry string and its BOM designation deliberately differ.**
  The model must know the length it was cut to; the BOM identity must *omit* it so
  every cut draws from one line of stock (§3.3.2).

**Open question.** The hardware string and the `designation` are both canonical
total identities of the same part, which is one identity too many. The string is
the better *key* — it is parseable and extends along new axes (`_a2` for
material) where "ISO 4762 M3x8" has no slot for one — while the designation is
the better *label*. Folding them, with the standard reference kept as display
metadata, is proposed but not done: it changes every BOM group key and deserves
its own decision.

### 2.4 What stays generic, what is FDM-specific

Fasteners are not an FDM concept. A CNC or sheet-metal enclosure uses the same
threads, the same clearance holes, the same BOM identity. The package layering
in the parametric-enclosures RFC therefore gains one directory:

| Directory | Scope |
| --- | --- |
| `lib/hardware/` | thread tables, head geometry, clearance/pilot holes, designations, BOM identity, length derivation |
| `lib/fdm/` | insert boss wall thickness, melt relief, self-tap pilot depth in plastic, minimum floor under a bore, printed lid columns |

`lib/hardware/` is a **leaf**: it imports nothing from `lib/assembly/`,
`lib/enclosure/` or `lib/fdm/`, because a thread designation is not an enclosure
concept and a fastener catalogue should be liftable into its own package the day
something other than an enclosure needs one. The dependency runs the other way --
`lib/enclosure/` names fastener types in its mount input, and `lib/fdm/` decides
what a printed boss does with them.

---

## Part 3 — Authoring and geometry

### 3.1 `enclosure.screwboss`

A screw boss is a cylinder fused into the enclosure base and bored to accept a
fastener. It is declared, like `enclosure.cutoutaperture`, as a child of the
thing that owns the requirement:

```tsx
<board name="B1" width="50mm" height="36mm">
  <hole name="H1" pcbX={-20} pcbY={-13} diameter="3.2mm">
    <enclosure.screwboss thread="M3" fastening="heat_set_insert" />
  </hole>
</board>
```

The aperture's owner is the nearest ancestor with a `pcb_component`; the boss's
owner is the **hole** it is declared in, which supplies its centre and its drill
diameter. Two consequences worth stating:

- **Nothing is inferred.** A hole without a `<enclosure.screwboss>` gets no boss.
  This is the same rule the parametric-enclosures RFC states for apertures
  ("inference places or validates declared features; it does not invent them"),
  and it retires a confirmed defect in the reference implementation, where
  automatic mounting-hole detection swept up a keyswitch's alignment pegs and
  grew bosses under them.
- **The PCB hole is a constraint to validate, not a value to guess.** The drill
  diameter must clear the screw shank; if it does not, the mount is a design
  error naming both numbers.

### 3.2 Repetition is solved by composition, not by a selector

Four identical bosses is repetitive, but tscircuit already has the answer, and it
is the one every other repeated element uses — write a component:

```tsx
const MountingHole = (props: HoleProps) => (
  <hole {...props} diameter="3.2mm">
    <enclosure.screwboss thread="M3" fastening="heat_set_insert" />
  </hole>
)

<board name="B1" width="50mm" height="36mm">
  <MountingHole name="H1" pcbX={-20} pcbY={-13} />
  <MountingHole name="H2" pcbX={20} pcbY={-13} />
  <MountingHole name="H3" pcbX={20} pcbY={13} />
  <MountingHole name="H4" pcbX={-20} pcbY={13} />
</board>
```

This is preferred over the two alternatives considered. A selector form
(`<enclosure.screwboss for=".H*">`) introduces a second grammar for expressing
*which* elements a declaration applies to, and the reference implementation's
version of it was one of the harder parts of that code to reason about. Enclosure-level
defaults put a per-hole fact on the box, where it cannot be overridden per hole
without adding the selector form anyway. Composition needs no new concept, is
typed, and the resulting component is reusable across boards.

Requires one props change: `holeProps` and `platedHoleProps` gain
`children?: any`, which `commonComponentProps` already provides for normal
components. Nothing is added to `enclosureFdmBoxProps`: the enclosure hosts no
bosses of its own.

### 3.3 One element, two reaches — and never a boss without a hole

The same element serves both fastening jobs, because both stand on the same boss
under the same PCB hole. What differs is only how far the screw reaches past it:

| `fastens` | Boss | Screw enters | Head bears on |
| --- | --- | --- | --- |
| `board` (default) | floor → board underside | from above, through the PCB hole | the PCB top surface |
| `lid` | **the same boss** | from above, through the lid, across the headroom, through the same PCB hole | the lid outer surface |

```tsx
<hole name="H3" pcbX={20} pcbY={13} diameter="3.2mm">
  <enclosure.screwboss thread="M3" fastening="heat_set_insert"
                       fastens="lid" head="countersunk" />
</hole>
```

**A lid screw costs no floor area**: it reuses a hole the board already has, in
space the board has already cleared by definition. That is the whole reason for
preferring it to the obvious alternative — a free-standing column in a corner of
the enclosure, which an earlier draft of this RFC specified and which was
removed. A corner column stands tangent to two inside walls and reaches
diagonally into exactly the space the board wants, so a box sized to hug its
board has to **grow** to accommodate one: measured, an M3 column took a 46 × 30
box to 57.7 × 41.7, nearly 12mm on each dimension. A whole XY dimension-inference
rule existed to pay for that, and deleting the corner column deleted the rule with
it. The box now never grows for hardware.

The cost of the change is that context no longer selects the mount kind. While a
boss declared in a hole meant exactly one thing, the *placement* could choose;
now both kinds are declared in a hole and `fastens` has to say. In exchange,
there is no boss that is not anchored to a hole, so a boss can never want floor
area the board has not already cleared.

Head recesses matter on a lid mount and only there: the lid is ours to cut, the
PCB is not.

| `head` | default `headRecess` | Geometry cut into the lid |
| --- | --- | --- |
| `countersunk` | `countersink` | 90° cone to the head's sharp diameter |
| `socket_cap`, `pan`, `button` | `none` | clearance hole only |

`headRecess="none"` with `head="countersunk"` is a design error: a conical head
on a flat surface neither seats nor clamps. A `counterbore` is legal and is right
on a thick lid, but it is not a default — see §2.3.2.

### 3.3.1 The board-to-lid column belongs to the lid

A lid screw crosses the headroom between the board and the lid. Three things can
fill that gap, and the choice is `lidColumn`:

| | What it is | Consequence |
| --- | --- | --- |
| `printed` (default) | a hollow column moulded into the **lid**, landing on the board | clamps the board as well as the lid; stiffens the lid; costs nothing to buy |
| `spacer` | a bought nylon tube | one BOM line; see §3.3.2 for why its length is not a constraint on the enclosure |
| `none` | nothing — the screw crosses open air | the lid seats on the walls as it always did, and the board is held by whatever `board` mounts it has |

**The column cannot belong to the base**, and this is the constraint that decides
the whole feature. A column standing up from the floor would occupy the very hole
the board has to be lowered over, so the board could never be installed. Printing
it on the lid is what makes a one-screw board-and-lid stack assemblable at all —
and it makes the lid the first part in this package to be *added to* rather than
only cut.

Note also what the column does **not** change: the screw. It fills a span the
screw had to cross either way, so `printed` and `none` resolve to the same length
and differ only in what is clamped.

The one dimension that still acquires a mount-derived minimum is `lidThickness`,
under the existing rule — grow what the author did not state, hold what they did
to the same minimum with an actionable error — because what remains under a head
recess is what holds the screw down.

### 3.3.2 A spacer is cut to length, which is why its length constrains nothing

A spacer has to be exactly as long as the gap it fills, and that gap is exactly
the enclosure's `topHeadroom` — the lid's underside sits one lid thickness below
the outside top, and the board's top surface is the headroom below that. Stocked
spacer lengths are discrete, so a naive reading says the enclosure must round its
own headroom to a vendor's inventory.

It does not, because **spacer stock is sold by the length and cut during
assembly**. So resolution takes the better of the two:

| | When | Unit |
| --- | --- | --- |
| a stocked piece | the gap equals a stocked length — the default 6mm headroom is one | `each`, quantity 1 |
| cut from stock | any other gap | `mm`, quantity = the cut length |

A stocked piece is preferred where one fits, because cutting is a hand operation
with a hand operation's tolerance: a sawn nylon tube is good to a few tenths and
that error lands directly in the clamp.

**This is the first item in the BOM that is not counted in pieces**, and it
forces a small, overdue generalization. `HardwareOccurrence` gains `quantity` and
`unit`, where every existing item is `{ quantity: 1, unit: "each" }`. Grouping
then *sums quantity* rather than counting occurrences, which yields a count for
discrete parts and a length for stock from one rule.

The identity follows the same logic. What is bought when a spacer is cut is the
**stock**, not the piece, so the designation deliberately omits the length:

```
spec:spacer nylon 6x3.2x6         a stocked 6mm piece
spec:spacer-stock nylon 6x3.2     stock, whatever it was cut to
```

Four mounts needing 7.5mm each are therefore **one line of 15mm of stock**, not
four line items naming a part number nobody sells. The cut list is not lost by
that fold: it is the occurrences, which a consumer already holds.

### 3.3.2 Geometry contributions

Every feature contributes an ordered set of operations to named parts, rather
than being inlined into a shell builder — the pattern the existing aperture
cutouts already follow:

| Feature | Part | Adds | Subtracts |
| --- | --- | --- | --- |
| every mount | base | boss cylinder, floor → board underside | insert bore or self-tap pilot; melt relief |
| `fastens="lid"` | lid | the board-to-lid column, when `printed` | one clearance hole for the whole run through lid-side material — plate and column together — plus the head recess |
| `lidColumn="spacer"` | — | nothing: a bought tube already has a bore | — |
| both | — | — | nothing below the minimum floor thickness under a bore |

and each mount contributes hardware occurrences (§1.5) for its screw and, where
applicable, its insert, positioned so a viewer can draw them and an assembler can
find them.

Composition applies every part's adds before its subtracts. That ordering is the
whole reason contributions are kept as two lists rather than being inlined: a
boss unioned *after* its own bore would fill the bore back in, and making it a
property of composition means no future feature builder has to remember it.

Apertures are subtracted after the bosses are fused, so an opening that overlaps
a boss removes the material in its way rather than being covered by it. That is
the right outcome -- the part has to fit -- but it silently weakens the boss, and
a boss/aperture collision check belongs with the other placement rules once they
exist.

### 3.4 Design rules

New FDM rules, all injectable like the existing profile:

| Rule | Meaning |
| --- | --- |
| `minInsertWallMm` | printed wall around an insert bore; sets boss OD when not given |
| `insertMeltReliefMm` | extra bore depth below an insert for displaced plastic |
| `selfTapPilotDepthMm` | pilot depth beyond the required engagement |
| `minFloorUnderBoreMm` | material that must remain below a blind bore |
| `headRecessClearanceMm` | diametral clearance in a counterbore |

Validations that produce errors rather than geometry:

- PCB hole diameter smaller than the screw's clearance diameter;
- boss colliding with a component body, an aperture, or the board edge;
- bore leaving less than `minFloorUnderBoreMm` of floor;
- boss outer diameter not fitting inside the cavity;
- a rounded screw length violating its engagement or protrusion bound (§2.3).

---

## Part 4 — Staging

**Stage 1 — now.** `props`, `core` and `create-fdm-enclosure` only, no
`circuit-json` change.

1. `create-fdm-enclosure` gains `lib/hardware/` (catalogue, designations, length
   derivation) and mount resolution and geometry in `lib/fdm/`. **Done.**
2. The solver output gains `mounts: ResolvedFdmMount[]` and
   `hardware: HardwareOccurrence[]` — the occurrence data of §1.5 as plain data,
   minus the record type and ids. Designing this now is what makes Stage 2 a
   lowering rather than a redesign. **Done.**
3. Core reads `<enclosure.screwboss>` from the holes and from the enclosure and
   feeds the solver. **Done.**
4. Core lowers hardware **geometry only**, as `cad_component`s reusing the
   enclosure box's *existing* synthetic owner. Several `cad_component`s may
   already share one PCB owner — base and lid do exactly that today — so N screws
   add **zero** BOM rows. *Next.*
5. The MBOM is asserted in tests against the solver output.

The honest cost: a saved `circuit.json` renders the screws but cannot say what
they are. That is one phase's gap, and it is precisely what Stage 2 closes.

**Stage 2 — after the records are reviewed.** Land `source_assembly_device`,
`source_enclosure` and `assembly_part`; add `getPcbaBom`, `getEnclosureBom` and
`getDeviceMbom` to `circuit-json-util`; move enclosure shells off `pcb_component`
ownership, which also removes the stray `EN1` row measured in §1.1.

**Later.** Vendor adapters for the hardware engine; imperial threads; standoffs,
spacers and captive nuts; device-level items (labels, thermal pads, packaging)
as further `assembly_part` categories.

---

## Part 5 — The bill of process is derived, never stored

§1.2 left a tension unresolved: the screws are structurally owned by the
enclosure, but *sequenced* by final assembly, and the two disagree. That is a
symptom of a larger question. A device description should be **declarative** — it
says what the thing is — while assembly is irreducibly **imperative**: press the
inserts, drop in the board, drive four screws, fit the lid, drive four more.

The resolution is that the bill of process is a **projection of the declarative
model**, exactly as the BOM is. Nothing imperative is persisted. There is already
precedent for this in the codebase, and it is the strongest argument available:
nobody stores "go right, then up, then via" — they declare a `<trace>` and the
router derives the path, again, whenever the board changes. **An authored
assembly sequence goes stale for precisely the reason a hand-drawn enclosure goes
stale**, which is the thesis this whole feature rests on.

### 5.1 Declare joints, derive orderings

The reason an aperture survives its connector being moved or rotated is that the
aperture is declared **local** to the connector — it is a child of the part whose
requirement it is, and it holds no global fact. The equivalent for assembly is
the **joint**: *this screw fastens the lid to the base, seated on the lid's outer
face, entered along −Z.* That is local to one mount, and it is already fully
determined by `ResolvedFdmMount`, which computes the head seat, the boss span,
the parts clamped and the axis. No new authoring, and no new solver input.

> **The rule, stated generally: only local facts are declared. Every global
> ordering is derived.** "Step 3: fit the lid" is a global statement and breaks
> the moment anything moves. "This screw joins these two parts along this axis"
> survives any rearrangement, because it is a property of the joint and not of
> the plan.

### 5.2 Two rules generate the plan, and they are not the same rule

An early version of this section claimed a single tool-access ray produced
essentially all the precedence. Prototyped against real solver output, that
turned out to be two rules doing different jobs, and conflating them made the
validity check silently inert:

| Rule | Sweep | Produces |
| --- | --- | --- |
| **Access** | from the head seat **outward**, along the access axis | *ordering*. Anything solid that ray crosses must be installed later — that is the tool needing to reach in. |
| **Path** | from the head seat **inward**, to the end of the shank | *validity*. A part in the way that this fastener does not join, and that is not drilled through there, is not an ordering problem at all: it is a fastener that cannot be installed. |

Run over the worked example — four mounting holes, two fastening the board and
two carrying on through the lid, the same fixture as
`core/tests/enclosure/enclosure-screw-boss-3d.test.tsx` — the access rule
derives:

```
EN1.H1.screw before place:lid          EN1.H2.screw before place:lid
```

Nobody wrote "the lid goes on after the board is screwed down". It falls out of
the ray from each board screw's head hitting solid lid. The screws that fasten
the *lid* are correctly **not** ordered against it, because their ray passes
through the clearance hole their own mount cut — a distinction that only appears
if the test respects the holes rather than a bounding box.

The prototype predates the removal of the corner column, so its measured figures
below describe a fixture with four board mounts and four free-standing lid
columns. The derivation is unchanged by that; only the count of operations is.

Topologically sorting that, preferring to keep the same tool in hand, gives:

```
place base | press 8 inserts | place PCBA | drive 4 board screws
           | place lid | drive 4 lid screws
reorientations: 0    tool changes: 5
```

And the path rule has teeth, which was checked by removing one lid clearance
hole:

```
✗ EN1.x_neg_y_neg: the screw cannot reach its boss -- it passes through the lid
  at (-23.3, -15.3) and there is no clearance hole there
```

Worth noting what that demonstrates about failure modes: a **cycle** in the
precedence graph is the general statement of "this cannot be assembled", but it
is rarely the *first* thing to fire, and it is a poor error when it does. The
specific defects — a fastener with no path, a head with no tool access — are
caught earlier and name the part and the coordinate. The cycle check is a
backstop, not the front line.

### 5.3 The artifact is a partial order; a sequence is a rendering

`getAssemblyPlan` should return the **DAG**, not a numbered list, for the same
reason `getDeviceMbom` returns a tree rather than a CSV (§1.6). The eight inserts
are mutually unordered; an assembler with two operators will exploit that and one
with a fixture that presses four at once will exploit it differently. Flattening
to a numbered list throws that away, and it is the caller's decision, not ours.

Optimality is only meaningful against a stated objective, and the honest position
is that we can compute *valid* cheaply and *optimal* only where the objective is
measurable from geometry:

| Objective | Computable now | Note |
| --- | --- | --- |
| fewest workpiece reorientations | **yes** — distinct access axes over the sequence | the expensive human operation; measured 0 for the design above, and 1 when a single screw was flipped to enter through the floor |
| fewest tool changes | **yes** — runs of equal tool | measured 5 |
| shortest time | no | needs per-operation time data nobody has supplied |
| most robust to gravity | no | needs a fixturing and stability model |

Reorientations moving 0 → 1 in response to one screw changing direction is the
property that answers "optimal no matter the arrangement": the metric is derived
from the same declarations, so it tracks the design rather than describing a
sequence somebody wrote down once.

This is a solver, and it belongs with the others — `BaseSolver`, a
`GenericSolverDebugger` view of the precedence DAG — not a pass buried in the
enclosure builder.

### 5.4 What this resolves, and what it is not

It dissolves §1.2's screw question. Once the consumption point of each part is
*derived*, "which node owns the screws" stops being a structural commitment and
becomes a presentation choice: the structure groups by what generates the
requirement, the process says when each piece is consumed, and both come from one
model. An operation-sequenced MBOM is then a different fold over the same tree,
not a different tree.

Deliberately not claimed:

- **The general case is harder than the enclosure.** The prototype used z-span
  proxies with their holes, which suits a stacked box. Arbitrary assemblies need
  swept-volume tests against real geometry, and the standard formulation is
  assembly-by-disassembly — a part is installable iff it is removable from the
  finished state along some free direction. Our directions are already quantized
  to the six faces by `EnclosureFace` and `insertion_direction`, so that search
  is small here, and it will not be elsewhere.
- **Nothing models gravity, fixturing, or two-handed operations.**
- **No authoring surface is proposed.** Joints are derived from mounts; a device
  with hand-declared parts (§1.5.1's ribbon cable) would need joints declared
  alongside them, and that is the same open question as authoring the part.

Not built now. The trigger to build it is the first consumer that needs an
ordering — work instructions, an assembly animation, or an operation-sequenced
MBOM — and the point of writing it down here is that the enclosure solver is
already producing every input it requires, so nothing in Parts 1–4 needs to change
to allow it.

---

## Rejected alternatives

**A category flag on `source_component`** (`bom_category: "electrical" |
"mechanical"`). Encodes a structural fact as a part property — the same M3 screw
is a board-mounted standoff in one design and enclosure hardware in another — and
is opt-out, so every consumer that has not learned the flag silently includes
hardware. It also still forces a synthetic `pcb_component` for something that is
not on the PCB.

**A sidecar BOM document.** Breaks the single-artifact principle; does not
survive the worker/cache/saved-build boundary as one unit; duplicates identity in
a second place that then drifts.

**A record per manufacturing process** (`cad_fdm_enclosure`,
`cad_cnc_enclosure`, …). Encodes a process taxonomy into the interchange format
that the authoring namespace has explicitly declined to commit to. What matters
about the record is that it is a non-board member item of an assembly device; the
process is a field.

**A full `bom_item` + `bom_line` item master.** The correct end state, and
`assembly_part` is a strict subset of it — an occurrence is a BOM line whose
parent is an assembly node and whose item is inline. But it duplicates identity
that already lives on `source_component`, and migrating existing electrical parts
into it is the actual work, which is not enclosure work. Deferred, not foreclosed.

**Preset nicknames for hardware** (`anchor="m3-heat-set"`). Untyped invented
vocabulary that conflates four orthogonal axes and grows as their product. Can be
re-added later as pure sugar over the axes, in which case the presets are a
convenience rather than the model.
