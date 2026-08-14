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
without corrupting the board's electrical BOM.

| Area | State |
| --- | --- |
| `enclosure.screwboss` authoring props | this RFC; implementation in progress |
| Vendor-backed fastener catalogue and screw-length derivation | this RFC; implementation in progress |
| PCB mounting bosses (heat-set / press-fit / self-tapping) | this RFC |
| Lid screw columns with countersink / counterbore head recesses | this RFC |
| Hardware occurrences in the solver output | this RFC |
| Durable Circuit JSON records for assembly parts | **proposed only, deliberately not implemented** |
| `getPcbaBom` / `getEnclosureBom` / `getDeviceMbom` | proposed, blocked on the records |
| Fastener procurement engine (McMaster / Fastenal adapters) | proposed |
| Cable, label, thermal-pad and packaging items | out of scope |

---

## Motivation

A board in a box is held there by screws. Today tscircuit can generate the box
and the openings in it, and then stops: there is no way to say "this mounting
hole carries an M3 heat-set insert", no boss under the board, no lid screw, and
no record of the eight pieces of hardware someone has to buy before the product
exists.

Mounting hardware is where the enclosure stops being a rendering and becomes a
thing you assemble. It is also where a second, quite different bill of materials
appears — one that goes to a different vendor, is identified differently, and is
consumed by a different assembly step. Getting that representation right matters
more than the geometry, because the geometry is local and the BOM is not.

---

## Part 1 — The device manufacturing BOM

### 1.1 The mistake to avoid, measured

`circuit-json-to-bom-csv` is the only BOM producer in the ecosystem (runframe's
BOM table and the CLI both call it), and it is forty lines:

```js
for (const elm of circuitJson) {
  if (elm.type !== "pcb_component") continue
  const source_component = /* join on source_component_id */
  bom.push({ designator: source_component.name, comment, value, footprint, ... })
}
```

Three consequences, all load-bearing:

1. **BOM membership is already structural, not a flag.** A record with no
   `pcb_component` cannot appear. The existing BOM is *the PCBA BOM by
   construction*.
2. **Identity is `source_component`'s**: designator, MPN, supplier part numbers,
   display value.
3. **One row per occurrence.** Quantity is implicit; grouping is a downstream
   rendering concern.

We are already violating (1). Rendering a board with one resistor plus an
`<enclosure.fdm.box name="EN1">` and running the real converter over the output
gives:

```
{ "designator": "R1",  "comment": "10k" }
{ "designator": "EN1", "comment": ""    }   ← the enclosure, as ftype "simple_chip"
```

The enclosure is quoted to the board assembler as a line item, because
`cad_component` requires both `pcb_component_id` and `source_component_id`, so
generated CAD forces a synthetic PCB owner into existence. The reference
implementation extends the same pattern to hardware — a
`source_component`/`pcb_component`/`cad_component` triple per screw and per
insert — which for its five-mount example would add **ten** rows of parts the
board house cannot place.

Mounting hardware makes this urgent, but note it is not caused by mounting
hardware. It is caused by CAD ownership, and it is fixed separately.

### 1.2 There is no "second BOM per part"

The framing to discard is that a part belongs to several BOMs and needs a
discriminator saying which. A BOM belongs to an **assembly** and lists what that
assembly consumes; a part appears in exactly one. This is the ordinary
item-master/structure model, and the reason a screw is absent from the board's
BOM is not that it is "mechanical" — it is that *the board assembly does not
consume it*:

```
device "controller"                     ← MBOM        → box-build / final assembly
├── PCBA "B1"             ×1            ← one line; its BOM is the EBOM → JLCPCB
├── enclosure base        ×1   MAKE     ← FDM, PLA, base.stl  → print farm
├── enclosure lid         ×1   MAKE
├── M3 heat-set insert    ×4   BUY
└── M3×8 socket cap screw ×4   BUY
```

Each assembly's BOM goes to the vendor that builds that assembly. That is the
user-visible distinction we want, and it falls out of the structure rather than
being asserted by a field.

### 1.3 Hardware is identified by specification, not by MPN

The second reason this is not simply "the electrical BOM with more rows":

| | Electrical BOM line | Mechanical hardware line |
| --- | --- | --- |
| Primary identity | MPN (`GRM155R71C104KA88D`) | designation (`ISO 4762 M3×8 A2-70`) |
| Substitution | risky, requires review | expected; any conforming part |
| Sourcing | often single-sourced | commodity, fungible |
| Missing MPN | a defect — `source_missing_manufacturer_part_number_warning` exists | normal |
| What the assembler needs | that exact part | the spec, and a bag of them |

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

### 1.5 Proposed Circuit JSON records — generic, and deliberately not implemented

These records are **proposed, not committed**. The implementation described in
Part 3 proceeds without them: hardware lives in the solver output only, and no
`circuit-json` change is made until the set below has been reviewed on its own
merits.

The design principle is that what matters about a printed enclosure part is that
it is **a member item of an assembly device that is not on the board** — not
that it was made by FDM. A record per manufacturing process (`cad_fdm_enclosure`,
and a `cad_cnc_enclosure` behind it, and a `cad_sheet_metal_enclosure` behind
that) would encode a process taxonomy into the interchange format that the
authoring namespace is explicitly not yet willing to commit to. So the process
becomes a **field**, not a record type:

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
  source_assembly_device_id: string
  name: string
  /** How it is produced. Extensible; not a closed taxonomy. */
  manufacturing_process: "fdm" | string
  /** How it comes apart. Extensible. */
  construction: "box" | string
  /** The board it encloses. */
  pcb_board_id?: string
}

/**
 * One physical member item of an assembly device that is not on the board:
 * a printed shell, a screw, an insert, a washer, a label, a cable.
 *
 * One record per physical piece — quantity is grouping, exactly as the PCBA BOM
 * derives quantity from occurrences today.
 */
interface AssemblyPart {
  type: "assembly_part"
  assembly_part_id: string
  source_assembly_device_id: string
  /** Which subassembly consumes it; what getEnclosureBom filters on. */
  source_enclosure_id?: string

  name: string                       // "EN1.base", "EN1.H1.screw"
  /** The make/buy axis every MBOM has. */
  supply_method: "fabricated" | "purchased"
  part_category: "enclosure_shell" | "screw" | "insert" | "washer" | "nut" | "spacer" | string

  /** Specification identity. Groups BOM lines when no MPN exists. */
  designation?: string               // "ISO 4762 M3x0.5x8 A2-70"
  display_value?: string             // "M3 x 8mm socket head cap screw, A2 stainless"
  manufacturer_part_number?: string
  supplier_part_numbers?: Partial<Record<SupplierName, string[]>>

  /** Traceability back to the board feature that generated it. */
  pcb_hole_id?: string
  source_component_id?: string

  /** Placement in the device frame, and the geometry to draw. */
  position: Point3
  rotation?: Point3
  model_jscad?: unknown
  model_stl_url?: string
  model_step_url?: string
  model_unit_to_mm_scale_factor?: number
}
```

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

The proposal deliberately does **not** add a record for the authored screw-boss
intent yet. Part-owned intent records (`source_cutout_aperture` and a
hypothetical `source_enclosure_mount`) are a separate question that the
parametric-enclosures RFC already owns; nothing here is blocked on it.

### 1.6 Three BOM queries

With those records, BOM views are queries over the structure rather than
separate documents. Proposed for `@tscircuit/circuit-json-util`:

| Function | Emits | Goes to |
| --- | --- | --- |
| `getPcbaBom(circuitJson)` | board components only — exactly what `circuit-json-to-bom-csv` produces today | the board assembler |
| `getEnclosureBom(circuitJson, { enclosureName? })` | one enclosure's tree: its fabricated shells and the hardware consumed to mount and close it | the print farm + the fastener supplier |
| `getDeviceMbom(circuitJson)` | the whole product: the PCBA as **one subassembly line**, plus every enclosure tree, plus device-level items | the final-assembly vendor |

`getDeviceMbom` emitting the PCBA as a single line is what makes it a real
product MBOM: the box-build vendor needs the board as a line item they receive,
not as 47 lines they cannot place. Grouping key, in order of preference:

```
mpn:<manufacturer_part_number>       when a real part is known
spec:<designation>                   otherwise — deterministic from the spec alone
```

Never a catalogue key. Two catalogues may name the same screw differently, and
renaming an entry must not silently split or merge BOM lines.

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
| Built-in catalogue (`create-fdm-enclosure/lib/hardware/`) | curated specifications, each with dimensions and at least one real part number, plus the *available length series* per specification | a footprint library |
| Fastener engine (platform config) | resolves a specification to current MPN / supplier part numbers / availability | `partsEngine.findPart` |

```ts
// props/lib/platformConfig.ts — beside the existing partsEngine
fastenerEngine?: {
  findFastener: (params: { fastener: ResolvedFastenerSpec }) => Promise<{
    manufacturerPartNumber?: string
    supplierPartNumbers?: SupplierPartNumbers
    /** Lengths this vendor actually stocks, for length rounding (§2.3). */
    availableLengthsMm?: number[]
  }>
}
```

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

| Fastening | Required engagement | Upper bound |
| --- | --- | --- |
| `heat_set_insert` | the insert's threaded length | must not bottom out in the insert |
| `press_fit_insert` | the insert's threaded length | as above |
| `self_tapping` (thermoplastic) | 2 × nominal thread Ø | must not break through the outer surface |
| `machine_screw_nut` | full nut height + 1–2 thread protrusion | — |

Both bounds are checked **after** rounding, since rounding is what can violate
them. If the chosen length exceeds the upper bound, the next shorter stocked
length is tried; if that falls below `exact`, the mount is reported as a design
error naming the stack, the bound and the two candidate lengths, rather than
silently emitting a screw that bottoms out.

The length series is data, from the catalogue entry or the fastener engine —
never a formula, because "which lengths exist" is a fact about a vendor.

### 2.4 What stays generic, what is FDM-specific

Fasteners are not an FDM concept. A CNC or sheet-metal enclosure uses the same
threads, the same clearance holes, the same BOM identity. The package layering
in the parametric-enclosures RFC therefore gains one directory:

| Directory | Scope |
| --- | --- |
| `lib/hardware/` | thread tables, head geometry, clearance/pilot holes, designations, BOM identity, length derivation |
| `lib/fdm/` | insert boss wall thickness, melt relief, self-tap pilot depth in plastic, minimum floor under a bore, printed lid columns |

`lib/hardware/` may import `lib/enclosure/` and `lib/assembly/`, never `lib/fdm/`
— the same rule the existing directories follow, enforced by the modules
themselves.

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
components.

### 3.3 Two mounts, one element

The same element serves both fastening jobs, because both are a bored cylinder
rising from the floor. Its placement context selects which:

| Declared in | Mount | Screw enters | Head bears on |
| --- | --- | --- | --- |
| `<hole>` / `<platedhole>` | PCB mount: boss rises from the floor to the board underside | from above, through the PCB hole | the PCB top surface |
| `<enclosure.fdm.box>` | lid mount: column rises from the floor to the lid underside | from above, through the lid | the lid outer surface |

```tsx
<enclosure.fdm.box boardRef=".B1">
  <enclosure.screwboss thread="M3" fastening="heat_set_insert"
                       head="countersunk" corner="all" />
</enclosure.fdm.box>
```

`corner="all"` is a declaration of four bosses, not an inference of them; the
individual corners (`x_neg_y_neg`, …) and explicit enclosure-local `x`/`y` are
also accepted. Head recesses matter here and only here: the lid is ours to cut.

| `head` | default `headRecess` | Geometry cut into the lid |
| --- | --- | --- |
| `countersunk` | `countersink` | 90° cone to the head's sharp diameter |
| `socket_cap` | `counterbore` | cylinder, head Ø + fit, head height deep |
| `pan`, `button` | `none` | clearance hole only |

`headRecess="none"` with `head="countersunk"` is a design error: a conical head
on a flat surface neither seats nor clamps.

### 3.3.1 Geometry contributions

Every feature contributes an ordered set of operations to named parts, rather
than being inlined into a shell builder — the pattern the existing aperture
cutouts already follow:

| Feature | Adds | Subtracts |
| --- | --- | --- |
| PCB mount | boss cylinder, floor → board underside | insert bore or self-tap pilot; melt relief |
| Lid mount | column, floor → lid underside | insert bore or pilot; clearance hole through the lid; head recess in the lid |
| Both | — | nothing below the minimum floor thickness under a bore |

and each mount contributes hardware occurrences (§1.5) for its screw and, where
applicable, its insert, positioned so a viewer can draw them and an assembler can
find them.

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
   derivation) and mount resolution and geometry in `lib/fdm/`.
2. The solver output gains `mounts: ResolvedMount[]` and
   `hardware: HardwareOccurrence[]` — the occurrence data of §1.5 as plain data,
   minus the record type and ids. Designing this now is what makes Stage 2 a
   lowering rather than a redesign.
3. Core lowers hardware **geometry only**, as `cad_component`s reusing the
   enclosure box's *existing* synthetic owner. Several `cad_component`s may
   already share one PCB owner — base and lid do exactly that today — so N screws
   add **zero** BOM rows.
4. The MBOM is asserted in tests against the solver output.

The honest cost: a saved `circuit.json` renders the screws but cannot say what
they are. That is one phase's gap, and it is precisely what Stage 2 closes.

**Stage 2 — after the records are reviewed.** Land `source_assembly_device`,
`source_enclosure` and `assembly_part`; add `getPcbaBom`, `getEnclosureBom` and
`getDeviceMbom` to `circuit-json-util`; move enclosure shells off `pcb_component`
ownership, which also removes the stray `EN1` row measured in §1.1.

**Later.** Vendor adapters for the fastener engine; imperial threads; standoffs,
spacers and captive nuts; device-level items (labels, thermal pads, packaging)
as further `assembly_part` categories.

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
