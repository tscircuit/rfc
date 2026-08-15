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
| Core reads bosses declared on holes | **implemented** |
| A durable Circuit JSON record for assembly parts (one, self-nesting) | **proposed only, deliberately not implemented** |
| Records for authored aperture/boss intent | not proposed; apertures and bosses are solver inputs, consumed during the render |
| `getPcbaBom` / `getEnclosureBom` / `getDeviceMbom` | proposed, blocked on the circuit-json records |
| Core lowering of hardware geometry | deferred to Stage 2, with `assembly_component` |
| Boss-versus-component and boss-versus-aperture collision checks | not started |
| Derived bill of process (Part 5) | designed and prototyped; not built |
| Hardware procurement engine (McMaster / Fastenal adapters) | proposed |
| Cable, label, thermal-pad and packaging items | out of scope |
| 3D rotation semantics; subcircuit caching fidelity | spun out into their own RFCs, both found here |

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
generated CAD forces a synthetic PCB component into existence to own the
enclosure. Those required ids are not an oversight: **`cad_component` is the CAD
model of a PCB component**, and they are the record saying so. An enclosure part
is not a PCB component, so the fix is not to relax that record but to stop
expressing assembly geometry as one.
This is wrong because the enclosure is not required to assemble the board,
and should not be part of the EBOM sent to the board manufacturer/pick-n-place.

Mounting hardware also does not belong in the EBOM; therefore we propose a hierarchical
BOM where the PCB owns the EBOM as it does today, and the assembly.device owns all
components required to assemble the device: the enclosure parts, and all mounting hardware.

### 1.2 Hierarchy of BOMs

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
|-- enclosure "EN1"              x1            <- subassembly  -> manufacturing
|   |-- base                     x1               FDM, PLA, base.stl
|   |-- lid                      x1
|   |-- M3 heat-set insert       x8
|   `-- M3x8 countersunk screw   x8
`-- ribbon cable, 10-way, 100mm  x1            <- device-level: belongs to no
                                                  subassembly
```

Each assembly's BOM goes to the vendor that builds that assembly, and that falls
out of the structure rather than being asserted by a field. The PCBA's BOM is
already built; this RFC builds the enclosure's. Other device-level subassemblies
-- a ribbon cable, a label -- are representable in the same shape but are not
generated by anything yet.

**A part belongs to the node that generates the requirement.** The screws sit
under the enclosure because the enclosure's bosses are why they exist, even
though a process view would sequence them at final assembly (along with PCB and
ribbon cables). Part 5 shows the sequence is derivable from what the solver already
computes, so process BOM is a projection rather than a second tree.

### 1.3 Enclosure assembly hardware is identified by specification, not by MPN

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

### 1.4 Don't use pcb_component for things that don't go on PCBs

An occurrence that is not physically placed on the PCB must not own a
`pcb_component`.

The PCBA BOM is then correct by construction: `circuit-json-to-bom-csv` needs no
change and cannot accidentally include hardware, and no future consumer has to
remember to filter. This is opt-**in** where a category flag would be opt-**out**.

### 1.5 One proposed Circuit JSON record

Proposed, not committed. The implementation in Part 3 proceeds without it:
hardware lives in the solver output only, and no `circuit-json` change is made
until this has been reviewed on its own merits.

#### 1.5.1 Current PCB Hierarchy

Circuit JSON already has a tree. Rendering a board containing a subcircuit gives:

```
source_group_1  name "b"    is_subcircuit          <- the board
source_group_0  name "sub"  parent source_group_1  <- nested subcircuit
source_component R1  source_group_id source_group_0
source_board.source_group_id  ->  the group tree
pcb_board                     ->  carries source_board_id at runtime, though the
                                  zod schema does not declare it
```

That tree is *functional*: it nests subcircuits, carries `subcircuit_id` and
decides schematic boxes. The assembly tree is *physical*: it nests what is
screwed into what. A board with five nested subcircuits is five functional nodes
and **one physical line item**; an enclosure is a physical node with no functional
position at all. They are separate trees because they are shaped differently in
circuit-json for legitimate reasons.

#### 1.5.2 Proposed Assembly Component Data Model & Hierarchy

A physical assembly tree is a tree of *items*, and a subassembly is an item that
has children. So the single record type nests into itself.

```ts
/**
 * One physical member item of a device: a printed shell, a screw, a spacer, a
 * ribbon cable — or a subassembly holding more of them.
 *
 * One record per physical piece. Quantity is grouping, exactly as the PCBA BOM
 * derives quantity from placed components today.
 */
interface AssemblyComponent {
  type: "assembly_component"
  assembly_component_id: string

  /**
   * The assembly that consumes it. Absent on the root, which is therefore the
   * device: a named part with no parent.
   */
  parent_assembly_component_id?: string

  name: string                       // "controller", "EN1", "EN1.base", "EN1.H1.screw"

  /**
   * Set when this line *is* a board, which is how the PCBA appears as a single
   * item whose own BOM is the existing electrical one. It also supplies the
   * device-to-board edge without adding a field to `pcb_board`.
   */
  pcb_board_id?: string

  /**
   * The canonical name of the part, and the BOM grouping key. A standard's
   * designation where one covers it, the manufacturer's where none does.
   */
  designation: string
  display_value?: string
  manufacturer_part_number?: string
  /**
   * Note `SupplierName` is a closed enum of PCB suppliers (jlcpcb, macrofab,
   * pcbway, digikey, mouser, lcsc) and cannot name McMaster-Carr or Fastenal.
   * Mechanical vendors need it opened or a separate identifier before this
   * field is useful here.
   */
  supplier_part_numbers?: Partial<Record<SupplierName, string[]>>

  /** See §3.3.2: `each` for discrete pieces, `mm` for stock consumed by length. */
  quantity: number
  unit: "each" | "mm"

  /** How a *fabricated* part is made. A property of the part, not of the assembly. */
  manufacturing_process?: "fdm" | string

  /**
   * The element whose existence requires this part -- the mounting hole behind a
   * screw, the pin header behind a jumper wire. Generic because the enclosure is
   * only the first thing to generate parts.
   */
  generated_by?: {
    /** The element's `type`, e.g. "pcb_hole". */
    element_type: string
    /** The value of that element's own `<type>_id` field. */
    element_id: string
  }

  /** only leaves carry these — see below. */
  position?: Point3
  hardware_string?: string           // "screw_m3_l8mm_socketcap", see §2.3.3
  model_jscad?: unknown
  model_step_url?: string
}
```

Three properties of the shape are worth stating, because each removes something a
reader might expect:

- **The root is the assembly.device.** A tree of parts needs no separate device record: the
  part with no parent is it, and it has a name.
- **`manufacturing_process` sits on the part being made**, not on the assembly
  containing it. Base and lid are FDM; a metal bracket added to the same enclosure
  is not.
- **A subassembly root carries no geometry, its leaves do.** A renderer given both
  a subassembly's mesh and its children's would draw the enclosure twice, and the
  two drift as soon as a child changes. Geometry lives on leaves; an assembled preview
  is a union of them.

**No rotation field.** For generated geometry the orientation belongs in the plan:
models are built in a canonical frame (+Z along the fastener axis, origin at the
seating face, 2.3.3) and the record only places them, so an oblique screw is
expressed exactly by its plan rather than approximately by three angles. It would
be needed for *referenced* assets, and that is the point at which
`cad_component.rotation`'s missing unit and application order have to be settled
first -- see `2026-08-14-3d-rotation-semantics.md`.

So the whole device is one record type:

```
assembly_component "controller"                       (no parent — the device)
|-- assembly_component "B1"        pcb_board_id set   (its BOM is the electrical one)
|-- assembly_component "EN1"                          (a subassembly, no geometry)
|   |-- assembly_component "EN1.base"   manufacturing_process "fdm", model_jscad
|   |-- assembly_component "EN1.lid"    manufacturing_process "fdm", model_jscad
|   |-- assembly_component "EN1.H1.insert"  hardware_string "insert_m3_l3mm_heatset"
|   `-- assembly_component "EN1.H1.screw"   hardware_string "screw_m3_l14mm_countersunk"
`-- assembly_component "ribbon cable"                 (device-level, not enclosure)
```

### 1.6 Three BOM queries, one walk

With those records a BOM view is a **subtree**, not a filtered list. Proposed for
`@tscircuit/circuit-json-util`:

| Function | Node it is rooted at | Emits | Goes to |
| --- | --- | --- | --- |
| `getPcbaBom(circuitJson, { boardName? })` | a `pcb_board` | its `pcb_component`s — exactly what `circuit-json-to-bom-csv` produces today | the board assembler |
| `getEnclosureBom(circuitJson, { enclosureName? })` | the enclosure's `assembly_component` | its subtree: fabricated shells, and the hardware consumed to mount and close it | the print farm and the fastener supplier |
| `getDeviceMbom(circuitJson)` | the root `assembly_component` | each child as **one line**, expandable to its own subtree, plus the device-level parts | final assembly |

The three are one recursive walk over one record type, not three bespoke queries.
`getEnclosureBom` is `getDeviceMbom` rooted lower, and it needs no argument about
what kind of node it landed on: children are always `assembly_component`s, and the one
special case — a line that *is* a board, whose sub-BOM is the existing electrical
one — is signalled by `pcb_board_id`.

`getDeviceMbom` emitting the PCBA as a single line is what makes it a real
product MBOM: the final-assembly vendor needs the board as one item they receive,
not as 47 lines that have already been assembled. Whether a consumer wants that
line expanded is its own decision, which is why the walk returns a tree and flattening
is left to the caller — a CSV exporter for one vendor wants the subtree elided, and
a costed roll-up wants it expanded.

Grouping key within a node is the designation, and only the designation:

```
spec:<designation>
```

**A designation is the canonical name of the part; a part number says where to
buy one.** For commodity hardware the designation is a standard's
(`ISO 4762 M3x8`), and any conforming part satisfies it -- which is precisely why
substitution is expected and why two such screws are one BOM line whatever their
part numbers say.

A part with no standard still has a designation: it is the *manufacturer's*. A
proprietary latch or a vent membrane is identified by the maker's own designation,
which correctly means it does **not** group with a competitor's lookalike, because
it is not one. So `designation` is required, and there is no part-number fallback
-- a part nobody can name cannot be grouped, and naming it is the manufacturer's
job when no standards body has done it.

That leaves `manufacturer_part_number` and `supplier_part_numbers` doing one job
only: **sourcing**. The same Gore vent bought through two distributors has one
designation and two supplier part numbers. Keeping them out of the key is what
stops the *shape* of the BOM depending on a lookup -- a part number is the result
of one, against a vendor catalogue, at a moment, possibly over a network, so
keying on it would split one line of eight into two of four on a day one vendor is
out of stock.

Where two pieces genuinely must be bought separately -- a different material or
finish -- that difference belongs in the designation; material and finish are not
axes yet (§2.1).

Grouping is **per node**: eight identical screws under one enclosure are one line
of quantity 8, and the same screw under a second enclosure is a separate line.
Rolling those up across the device is a purchasing question, and a fold over the
tree rather than a property of it.

---

## Part 2 — The fastener catalogue

### 2.1 Specification axes

Hardware is specified the way vendors sell it, along orthogonal axes:

| Axis | Values | Determines |
| --- | --- | --- |
| `thread` | `M2` `M2.5` `M3` `M4` `M5` (imperial later) | clearance hole, pilot hole, insert bore, head dimensions |
| `fastening` | `heat_set_insert` `press_fit_insert` `self_tapping` | how the boss is bored and what hardware is consumed |
| `head` | `socket_cap` `countersunk` `pan` `button` | head Ø/height, and which recess is legal |
| `headRecess` | `none` `countersink` `counterbore` | geometry cut into the part the head bears on |
| `length` | distance, **normally omitted** | derived from the stack; see §2.3 |

Each is a typed enum, so a typo is a compile error rather than a silent fallback,
and the axes compose. Whole-stack presets under a nickname would read more
tersely at the cost of a table growing as the product of the axes rather than
their sum, and could not be varied one axis at a time; they can return later as
sugar over these axes.

### 2.2 The catalogue is a curated view of a real vendor catalogue

The decisive constraint, and the one that makes this more than a table of
standards:

> **A specification may exist in the catalogue only if a real vendor stocks it.**

The axes the catalogue represents today are thread, head style and length; drive,
material and finish are fixed per head style by picking one commodity series, and
are not yet expressible. Until they are, a designation names less than a purchase
order needs, and the entries carry no part numbers -- so "vendor-backed" describes
the rule the catalogue is curated under, not a property any consumer can check.

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

**What the built-in catalogue carries today: dimensions and stocked series, and
no part numbers.** A screw's dimensions come from a published standard; a
spacer's come from a vendor, so spacer entries are dimensionally plausible rather
than standards-derived and are marked in the source as needing verification. Part
numbers arrive from the engine, from a vendor, or not at all -- never invented
here, because a fabricated part number poisons the guarantee the catalogue exists
to give.

**`variants` rather than a length series.** A length series would assert that the
axis a part varies along is length: true of screws, false of a washer (thickness,
inner and outer diameter), a spacer (length *and* thread) or an o-ring (section
and inner diameter). A variant is another specification the vendor stocks, and
the caller filters for the axis it is solving along, so one interface serves every
family. Returning whole specifications also handles **correlated** axes -- M3 is
stocked in different lengths than M4, so a bare length list is meaningless without
its thread.

**The loose `attributes` map** is the one place this RFC accepts stringly-typed
data: the authoring surface stays typed enums (§2.1), and this is the *vendor*
boundary, where an adapter deals in facets its catalogue defines and we do not.

Vendor adapters (McMaster-Carr, Fastenal) are the mechanical analogue of the
JLCPCB/EasyEDA adapters: outside this package, selected by platform config, not
required for a render to succeed. Keeping procurement in platform config rather
than props also preserves the parametric-enclosures RFC's XML-compatibility rule
-- the TSX says *what the part is*, never *where to buy it* -- with per-boss
`manufacturerPartNumber` / `supplierPartNumbers` attributes as an escape hatch.

Because entries are vendor-backed there is no "generic hardware with no
procurement identity", so nothing to flag and nothing to disable. The MBOM is
always built.

### 2.3 Screw length is derived, then rounded to a stocked length

An author should not compute screw lengths by hand — the stack is known:
material thicknesses, board thickness, head seat, insert depth. But real screws
come in steps, so the derivation has two stages and a validation:

```
exact  = Σ(clamped material) − headSeatDepth + requiredEngagement
chosen = the smallest stocked length ≥ exact
```

`headSeatDepth` is **subtracted**: a recess buries the head, so the screw enters
the material that much lower and needs that much less length under it.

with `requiredEngagement` a property of the fastening method:

| Fastening | Required engagement |
| --- | --- |
| `heat_set_insert`, `press_fit_insert` | the insert's threaded length |
| `self_tapping` (thermoplastic) | 2 × nominal thread Ø — plastic is far weaker than the screw, so the joint fails by stripping the boss |

and one upper bound: **the bore**. Not the insert's threaded length -- an insert
is a barrel open at both ends, so a screw may continue past it; what it may not do
is reach solid material. The bore is in turn deepened to fit the screw actually
chosen, since rounding up is what decides how far the screw reaches:

```
bore = max(insert length + melt relief, screw penetration),  capped by the floor rule
```

Deriving it the other way round -- fixing the bore at the insert's length, then
requiring the screw to fit it -- rejects every stack whose exact length is not
itself a stocked size, which is most of them.

The bound is checked **after** rounding, because rounding is what can violate it.
When it fails, no stocked screw fits the stack, and both bounds are reported.
There is deliberately no "next shorter length" fallback: the lengths are sorted,
so the shortest one that engages is the only candidate that could also be short
enough.

The length series is data -- from the catalogue entry or the engine's `variants`,
never a formula, because "which lengths exist" is a fact about a vendor.
`resolveScrewLength` takes it as a parameter, defaulting to the built-in
catalogue, so plugging in an engine changes a call site rather than the rule.

The same reasoning picks the **insert series**: the longest one whose installed
length fits the bore available, so a shallow stack degrades to a short series
rather than failing. The default 4mm standoff over a 2mm floor leaves 5.2mm of
bore, which does not take a 5.7mm M3 insert.

### 2.3.1 Clearance holes, and the bore they are not

A screw passes **through** three things and threads **into** a fourth. The three
passages take a clearance diameter; the fourth is sized by the fastening method
and is not a clearance at all.

| Passage the screw goes through | Diameter | Because |
| --- | --- | --- |
| the lid's clearance hole | ISO 273 **medium** (3.4mm for M3) | we generate it, and a printed part wants assembly slop |
| the PCB's mounting hole | validated against ISO 273 **fine** (3.2mm for M3) | the board fab made it to the layout's number, and 3.2mm for an M3 is what practically every layout uses; demanding 3.4mm would reject almost every real board while the screw passes through perfectly well |
| a purchased spacer's internal diameter | validated against ISO 273 **fine** | a spacer is deliberately a close fit, so it stays concentric with the screw |

The rule is not about who made the hole; it is about **whether the dimension is
ours to choose**. We size what we generate at the medium series, and validate what
we inherit against the fine one.

**The boss bore** is the recess the screw threads into, sized from
the fastening method rather than from a clearance series:

| Fastening | Bore | Source |
| --- | --- | --- |
| `self_tapping` | pilot, 2.5mm for M3 | `ThreadSpec.selfTapPilotMm` |
| `heat_set_insert` / `press_fit_insert` | the insert's installation diameter, 4.0mm for M3 | `InsertSpec.installHoleDiameterMm` |

A clearance hole is sized so the screw does **not** touch it. A bore is sized so
it does -- that interference is the joint. They are opposite requirements, which
is why they come from different tables.

### 2.3.2 A head recess is two different depths

| Recess | Depth | For an M3 |
| --- | --- | --- |
| counterbore | the head's height | 3mm |
| countersink | `(headDiameter − clearanceDiameter) / 2` | 1.1mm, because a 45° cone descends 1mm per 1mm of radius |

The countersink is *shallower than the head is tall*, because the lower part of
the head sits inside the clearance hole rather than in the cone. Cutting the cone
to the head's height instead sinks the head below flush and removes twice the
material. Both the geometry and the "is there enough material left" rule read one function
for this depth, so they cannot disagree.

It follows that a **socket cap head defaults to no recess at all**. A counterbore
is a legal thing to ask for and is right on a thick part, but an M3 cap head is
3mm and a printed lid is 2mm, so defaulting to one would cut a recess straight
through the lid of every box that did not ask for it.

### 2.3.3 Purchased parts get geometry from a DSL

A screw, insert and spacer are all bought, but their geometry is *generated*, the
same way a component's 3D model already is. The electronics stack is the model to
copy:

| Layer | Package | Job |
| --- | --- | --- |
| DSL | `footprinter` | `"soic8_w5.3mm"` -> a 2D footprint |
| Models | `jscad-electronics` | the same string -> a parametric 3D model |
| Render | `circuit-json-to-gltf` | reads `cad_component.footprinter_string` and expands it |

`hardware-dsl.ts` and `get-hardware-model.ts` are the mechanical twin, reusing
footprinter's grammar -- segments joined by `_`, each a name with an optional
numeric value -- so one grammar covers both vocabularies:

```
screw_m3_l8mm_socketcap   insert_m3_l5.7mm_heatset   spacer_od6mm_id3.2mm_l7.5mm
```

The string carries three jobs at once, which is why it is a string and not just a
typed spec:

| Job | Why the string |
| --- | --- |
| identity | canonical and total, so equal strings are the same part |
| geometry | `getHardwareModel(s)` returns a solid, so nothing has to ship a mesh |
| storage | ~20 bytes against ~250 for its own plan and kilobytes for a mesh, and it stays readable and diffable in a saved build |

Dimensions carry their unit, as footprinter's do, and both directions reuse
`format-si-unit`: `formatMm` writes them, `parseAndConvertSiUnit` reads them.
`formatMm` rounds floating-point dust to three decimals, which an identity needs
-- a gap derived as `totalHeight - lidThickness - boardTopZ` arrives as
7.500000000000002, and a string carrying that noise makes two spacers of the same
real length into different parts. Parsing through `parseAndConvertSiUnit` rather
than `Number` also means a hand-written `l0.25in` resolves to 6.35mm rather than
0.25.

**A cut spacer's geometry string and its BOM designation deliberately differ.**
The model must know the length it was cut to; the BOM identity must omit it so
every cut draws from one line of stock (§3.3.2).

**Tradeoff: fetching vendor CAD instead.** For a fastener it buys a thread helix
and exact fillets, and costs a network round trip, a B-rep tessellation, a licence
question, and a runtime dependency on a vendor being reachable -- and it is worse
input for the swept-volume reasoning in Part 5 than a clean parametric solid.
Vendor CAD earns its keep for shapes a specification does *not* imply: switches,
cable glands, latches, hinges, fans, feet. The plumbing is largely there already
(`circuit-json-to-gltf` tessellates STEP via `occt-import-js` in browser and Node,
accepts auth headers, and reads `model_step_url`); what is missing is a licensing
answer, since the EasyEDA integration *mirrors* vendor models onto
`modelcdn.tscircuit.com`.

**Open question.** The hardware dsl string and the `designation` are both canonical
total identities of the same part, which is one too many. The dsl string is the better
*key* -- parseable, and extensible along new axes (e.g. `_a2` for material) where
"ISO 4762 M3x8" has no slot -- and the designation is the better *label*. Folding
them changes every BOM group key, so it deserves its own decision.

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

- **Nothing is inferred.** A hole without a `<enclosure.screwboss>` gets no boss
  — the same rule the parametric-enclosures RFC states for apertures: "inference
  places or validates declared features; it does not invent them". Detecting
  mounting holes automatically instead would grow bosses under any hole that
  looks like one, including a keyswitch's alignment pegs.
- **The PCB hole is a constraint to validate, not a value to guess.** The drill
  diameter must clear the screw shank; if it does not, the mount is a design
  error naming both numbers.

### 3.2 Repetition is solved by composition

Four identical bosses is repetitive, and the answer is the one every other
repeated element uses -- write a component:

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

Requires one props change: `holeProps` and `platedHoleProps` gain
`children?: any`, which `commonComponentProps` already provides for normal
components. Nothing is added to `enclosureFdmBoxProps`: the enclosure hosts no
bosses of its own.

### 3.3 One element, two reaches

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
space the board has already cleared by definition, so the box never grows to
accommodate hardware. Every boss is anchored to a hole, and `fastens` says how far
its screw reaches.

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

The one dimension that still acquires a mount-derived minimum is `lidThickness`,
under the existing rule — grow what the author did not state, hold what they did
to the same minimum with an actionable error — because what remains under a head
recess is what holds the screw down.

### 3.3.2 A spacer is cut to length, which is why its length constrains nothing

A spacer has to be exactly as long as the gap it fills, and that gap is exactly
`topHeadroom`. Stocked lengths are discrete, but **spacer stock is sold by the
length and cut during assembly**, so the enclosure never rounds its geometry to a
vendor's inventory. Resolution takes the better of the two:

| | When | Unit |
| --- | --- | --- |
| a stocked piece | the gap equals a stocked length — the default 6mm headroom is one | `each`, quantity 1 |
| cut from stock | any other gap | `mm`, quantity = the cut length |

A stocked piece is preferred where one fits, because cutting is a hand operation
with a hand operation's tolerance: a sawn nylon tube is good to a few tenths and
that error lands directly in the clamp.

**This is the first BOM item not counted in pieces.** `HardwareOccurrence` gains
`quantity` and `unit`, every existing item being `{ quantity: 1, unit: "each" }`,
and grouping *sums quantity* rather than counting occurrences — one rule yielding
a count for discrete parts and a length for stock.

What is bought when a spacer is cut is the **stock**, not the piece, so its
designation omits the length:

```
spec:spacer nylon 6x3.2x6         a stocked 6mm piece
spec:spacer-stock nylon 6x3.2     stock, whatever it was cut to
```

Four mounts needing 7.5mm each are therefore **one line of 30mm of stock**, not
four line items naming a part number nobody sells. That is the length the design
consumes; kerf, trim and how many 300mm rods to order are the assembler's, in the
same way that a BOM asking for eight screws does not ask for nine in case one is
dropped. The cut list is not lost by
that fold: it is the occurrences, which a consumer already holds. Cut stock
overage estimation is recommended but left to be implemented later.

### 3.3.3 Geometry contributions

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
| `selfTapPilotReliefMm` | pilot depth beyond the required engagement |
| `minFloorUnderBoreMm` | material that must remain below a blind bore |
| `headRecessClearanceMm` | diametral clearance in a counterbore |
| `minMaterialUnderHeadRecessMm` | material that must remain under a head recess |

Validations that produce errors rather than geometry. Implemented:

- a PCB hole too small to pass the screw shank;
- a bore that would leave less than `minFloorUnderBoreMm` of floor, which selects
  a shorter insert series before it becomes an error;
- a rounded screw length violating its engagement or protrusion bound (§2.3);
- a head recess deeper than the lid can carry, which grows an unstated
  `lidThickness` before it becomes an error;
- `lidColumn` on a mount that fastens the board.

Not yet: boss against a component body, an aperture, or the board edge.

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
3. Core reads `<enclosure.screwboss>` from the holes and feeds the solver.
   **Done.**
4. The MBOM is asserted in tests against the solver output.

Hardware geometry is **not** lowered in Stage 1. It could be, as `cad_component`s
sharing the enclosure box's existing synthetic owner — that is what the shells do
today — but every one of those is a record asserting that a screw is a PCB
component, and Stage 2 would delete them. The cost of waiting is that a saved
`circuit.json` has the hardware in neither geometry nor BOM until Stage 2; the
cost of not waiting is tripling the number of records built on a claim we intend
to withdraw.

**Stage 2 — after the record is reviewed.** Land `assembly_component`; add
`getPcbaBom`, `getEnclosureBom` and `getDeviceMbom` to `circuit-json-util`; and
emit enclosure parts and hardware as `assembly_component`s rather than as
`cad_component`s with a synthetic PCB owner, which also removes the stray `EN1`
row measured in §1.1.

That last step is not free, and the RFC should not pretend otherwise: assembly
geometry on `assembly_component` is **a second geometry record for renderers to
learn**. `circuit-json-to-gltf` and `3d-viewer` each grow a path that reads it,
and until both do, an enclosure emitted the new way renders as nothing. Stage 2 is
therefore a coordinated change across four repos, not a schema addition.

**Later.** Vendor adapters for the hardware engine; imperial threads; standoffs
and captive nuts; device-level items (labels, thermal pads, packaging) as further
`assembly_component`s.

---

## Part 5 — The bill of process is derived, never stored

A device description is **declarative**; assembly is irreducibly **imperative** --
press the inserts, drop in the board, drive four screws, fit the lid, drive four
more. The bill of process resolves that by being a **projection of the declarative
model**, exactly as the BOM is: nothing imperative is persisted.

The precedent is already here. Nobody stores "go right, then up, then via" -- you
declare a `<trace>` and the router re-derives the path whenever the board changes.
An authored assembly sequence goes stale for precisely the reason a hand-drawn
enclosure does.

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

### 5.2 Two rules generate the plan

Two sweeps, doing different jobs -- conflating them makes the validity half
silently inert:

| Rule | Sweep | Produces |
| --- | --- | --- |
| **Access** | from the head seat **outward**, along the access axis | *ordering*. Anything solid that ray crosses must be installed later — that is the tool needing to reach in. |
| **Path** | from the head seat **inward**, to the end of the shank | *validity*. A part in the way that this fastener does not join, and that has no clearance hole there, is not an ordering problem at all: it is a fastener that cannot be installed. |

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

Topologically sorting, preferring to keep the same tool in hand, gives (measured
on a prototype fixture with more mounts than the example above; the operation
count differs, the derivation does not):

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

A **cycle** in the precedence graph is the general statement of "this cannot be
assembled", but the specific defects -- a fastener with no path, a head with no
tool access -- fire earlier and name the part and the coordinate. The cycle check
is a backstop, not the front line.

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

### 5.4 Scope

Deriving the sequence dissolves §1.2's screw question: once each part's
consumption point is derived, "which node owns the screws" is a presentation
choice rather than a structural commitment, and an operation-sequenced MBOM is a
different fold over the same tree.

Not built now; the trigger is the first consumer that needs an ordering -- work
instructions, an assembly animation, an operation-sequenced MBOM. The enclosure
solver already produces every input it requires, so nothing in Parts 1-4 changes
to allow it.

Three limits worth knowing before it is built. The prototype used z-span proxies
with their holes, which suits a stacked box; arbitrary assemblies need
swept-volume tests and the assembly-by-disassembly formulation, though our
directions are already quantized to six faces. Nothing models gravity, fixturing
or two-handed operations. And joints are derived from mounts, so a device with
hand-declared parts would need joints declared alongside them -- the same open
question as authoring the part.
