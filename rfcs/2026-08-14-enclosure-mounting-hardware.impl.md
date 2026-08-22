# Implementation: Screw Bosses, Enclosure Mounting Hardware, and the MBOM

Companion to [`2026-08-14-enclosure-mounting-hardware.md`][rfc], which is
normative for the authoring surface. This document is the implementation of
record: measurements, schemas, call sites, catalog, geometry, checks, staging.

[rfc]: ./2026-08-14-enclosure-mounting-hardware.md

| Area | State |
| --- | --- |
| `enclosure.screwboss` authoring props | **implemented** (`props`) |
| Fastener catalogue and screw-length derivation | **implemented** (`create-fdm-enclosure/lib/hardware/`) |
| Bosses: heat-set, press-fit, self-tapping | **implemented** |
| Lid screws, countersink and counterbore recesses | **implemented** |
| Spacers, stocked or cut to length | **implemented** |
| Hardware occurrences in solver output | **implemented** (`CreateFdmEnclosureOutput.hardware`) |
| FDM design rule checks | **implemented** |
| Core reads bosses declared on holes | **implemented** |
| Hardware DSL | **implemented** as `lib/hardware/hardware-dsl.ts`; **to be replaced** by `@tscircuit/modelprinter` (§5) |
| `assembly.device` element | **implemented** as a transparent container that emits nothing (§2.3) |
| `source_component` assembly ftypes and new fields | **proposed** (§3) |
| `assembly.component` element, with placement and aperture props | **proposed** (§2.3) |
| `getSourceComponentBomClass` and the safe `list()` | **proposed** (§4.2) |
| Frames, borrowing, renderer changes | **proposed** (§6) |
| Identity resolution through the parts engine | **proposed**, one engine or two undecided (§7.2) |
| MBOM exporter, and excluding assembly parts from EBOM/PnP | **proposed** (§8) |
| Placement props for children of an enclosure | **out of scope**; §6.4, §14 q7 |
| `assembly.ribboncable` and other model-specific subclasses | out of scope; §2.3 gives the trigger |
| Supplier adapters for hardware | proposed, unbuilt |
| Derived bill of process | designed and prototyped, unbuilt (§13) |
| Cable connectivity | out of scope |
| Overhang checking | a slicer concern, not planned |

---

## 1. Why `source_component` and not a new record

An earlier draft proposed a self-nesting `assembly_component`. It is dropped.

### 1.1 The objection, and why it does not hold

The objection was blast radius: **121 files outside `circuit-json` reference
`source_component`** — 93 in `core`, 9 in `checks`, 8 in `circuit-json-util`, 5
in `circuit-to-svg`, 2 each in `circuit-json-to-gltf` and `circuit-json-to-spice`,
1 each in `cli` and `3d-viewer` (`rg -l source_component <repo>/lib <repo>/src`).

That is the wrong measurement. What matters is how many sites **scan every
`source_component`** rather than **join to one by id**:

```
$ rg -n 'source_component\.list\(' core/lib checks/lib circuit-json-util/lib \
      circuit-to-svg/lib cli/lib circuit-json-to-gltf/lib | wc -l
8
```

Eight. Every other site starts from a `pcb_component`, `schematic_component`,
`source_port` or `cad_component` and looks the source component up by id. An
assembly part has none of those, so those sites structurally cannot see it.

| Site | Needs |
| --- | --- |
| `checks/lib/check-no-power-pin-defined.ts` | electrical only |
| `checks/lib/check-no-ground-pin-defined.ts` | electrical only |
| `checks/lib/check-all-pins-in-component-are-underspecified.ts` | electrical only |
| `circuit-to-svg/lib/assembly/convert-circuit-json-to-assembly-svg.ts` | electrical only (this "assembly drawing" is a board drawing; the name collision is pre-existing) |
| `core/lib/utils/getSubcircuitPcbCalcVariables.ts` | electrical only |
| `core/.../DifferentialPair_doInitialSourceDesignRuleChecks.ts` | electrical only |
| `core/lib/utils/autorouting/getSimpleRouteJsonFromCircuitJson.ts` | electrical only |
| `core/lib/utils/circuit-json/inflate-circuit-json.ts` | **must keep** assembly parts; inflation must round-trip them |

§4.2 makes `list()` return electrical parts by default, so seven need no change
and the eighth calls `listAll()`.

### 1.2 What a new record would have cost

A new record and union in `circuit-json`; a shared purchasable-part property
group; a tree checker in `@tscircuit/checks`; a second geometry path in
`circuit-json-to-gltf` and `3d-viewer` before an enclosure renders at all; and
lowering in `core`. Five repos before anything renders.

`source_component` already carries `manufacturer_part_number`,
`supplier_part_numbers`, `display_value`, `name` and `ftype` with the exact
semantics an MBOM line needs.

### 1.3 The namespaces are ergonomics, not a data model

`enclosure.*` and `assembly.*` are two element namespaces over **one** record
type. Nothing downstream of `core` can tell which namespace an element came
from. A part does not change namespace when it changes level: where it lands in
the tree is `parent_source_component_id`, which follows TSX nesting.

---

## 2. `props` and namespace changes

### 2.1 How a dotted namespace works

`core/lib/namespaced-elements/enclosure.ts` builds a plain object of elements
made by `createNamespacedElement<Props>("enclosure.screwboss")`. Nesting is
nested objects, which is why `enclosure.fdm.box` costs nothing. Adding a
namespace is three steps:

1. prop types + zod schema in `props/lib/<namespace>/`, exported from that
   directory's `index.ts` and from `props/lib/index.ts`;
2. `core/lib/namespaced-elements/<namespace>.ts` with the
   `createNamespacedElement` calls, exported from `core/lib/index.ts`;
3. a component class in `core/lib/components/primitive-components/` registered
   for the dotted tag.

The `fdm` level names the **process**, so `enclosure.cnc.box` lands later
without touching anything else. Do not add a process level to a purchased part.

### 2.2 No hardware elements

There is deliberately **no** `<enclosure.screw>`, `<enclosure.heatsetinsert>` or
`<enclosure.spacer>`. A fastener has no position, cuts no geometry and admits no
validation without a joint; its length is derived from the stack; its insert
series is selected from the bore the boss provides. None of that is knowable
before the enclosure resolves, so an authored equivalent could not be written.

An earlier draft called `enclosure.screwboss` "sugar" over hardware elements.
That was wrong. The boss is the only input, and §4.1 is the only producer of
hardware records.

Loose hardware — a spare screw, a bracket screw — is `<assembly.component>`.

### 2.3 The `assembly.*` namespace

```
props/lib/assembly/device.ts      -> assembly.device      ftype "assembly_device"
props/lib/assembly/component.ts   -> assembly.component   ftype "assembly_part"
```

**`assembly.device` already exists.** `props/lib/assembly/device.ts` declares
`assemblyDeviceProps` (currently `{ name?: string }`) and
`core/lib/components/primitive-components/AssemblyDevice.ts` implements it as a
transparent container with identity transforms and an `AssemblyDeviceContainer`
marker. Its own comment states the remaining work:

> Compatibility stage: this is a transparent product-level container and emits
> no Circuit JSON. The later schema migration adds `source_assembly_device`
> without changing the authoring element or its assembly-container semantics.

So it needs `designation?`, `children?: any`, and the record emission — not a
new element. It stays **optional**: without it the enclosure is the root of the
assembly tree and `parent_source_component_id` is absent on it, so §3 and §8
ship without `assembly.*` and gain a level when it lands.

**`assembly.component` is the genuinely new element.** It carries the common
identity shape, in `props/lib/common/` because both namespaces use it:

```ts
export interface AssemblyPartCommonProps {
  name?: string
  /** Canonical specification identity. */
  designation?: string
  /** modelprinter string. */
  model?: string
  manufacturerPartNumber?: string
  supplierPartNumbers?: SupplierPartNumbers
}
```

plus placement and aperture props of its own:

```ts
export interface AssemblyComponentProps extends AssemblyPartCommonProps {
  /**
   * Which way the part's aperture faces. Read by the enclosure when an
   * <enclosure.cutoutaperture> is declared as a child.
   */
  cutoutApertureDirection?: InsertionDirection
  /** Offsets from the inherited frame (§6.2). Names are provisional. */
  x?: Distance
  y?: Distance
  distanceAboveBoard?: Distance
}
```

The offsets are the part of this that will need iteration in practice. The frame
is inherited (§6.2 — centre *and rotation* from the nearest `pcb_component`
ancestor), so these are corrections on top of it, in the same spirit as
modelprinter's own `offset`/`rotation` (§5.2 rule 4). Expect the set to change
once real parts are placed.

**`cutoutApertureDirection` uses `InsertionDirection`**, the six canonical
direction names already in `circuit-json`
(`src/pcb/properties/insertion_direction.ts`). Do not invent a parallel
vocabulary: that file's docstring is the authority on the `top`/`bottom`
layer-vs-direction collision, and `front`/`back` are retired org-wide.

There is no `type` prop and no `identifiedBy` prop. The kind is the first token
of the model string, the way `footprinter_string` carries `soic8`; the identity
model is precedence (§7.1).

**When named parameters argue for a subclass.** A part whose model wants
authored, named geometry inputs — `cableStartX` on a ribbon, say — is the one
case where a generic element genuinely runs out: those names belong to one model
family and cannot live on `assembly.component` without leaking into every other
part. That is the trigger for `assembly.ribboncable`, and it is the same test as
§2.4: a new prop surface, not a new label.

`enclosureFdmBoxProps` gains `children?: any`, as `holeProps` and
`platedHoleProps` already have.

**Board membership.** A `<board>` inside `<assembly.device>` becomes one MBOM
line. It has no `source_component` — it has `source_board` and `pcb_board` — so
§8.2 synthesizes the row from `source_board` rather than inventing a second
identity for something that already has one.

### 2.4 The extension checklist

| Question | If no |
| --- | --- |
| Is it one physical piece? | It is a subassembly; give it children and an assembly-class ftype |
| Does the consuming assembly pick the namespace? | Move it |
| Can the render derive it? | It needs no element at all |
| Does it need props `assembly.component` lacks, or a relationship a child element cannot express? | Use `assembly.component` |
| Does it emit an identity? | Fix that first; the MBOM cannot group it |

A relationship is a child element, a property is a prop, and only a new prop
surface earns an element. A screen needing a lid window does **not** qualify:
`<enclosure.cutoutaperture>` is already a child element.

### 2.5 No refdes prefixes are needed

An earlier draft added entries to `defaultExpectedPrefixesByFtype` in
`NormalComponent_doInitialCheckRefDesConvention.ts` so that generated hardware
would be `SCR1`, `INS1`, `SPC1`. None of that is required.

**The prefix table is a lint on author-supplied names, not a namer.** It reads
`source_component.name`, takes its leading letters, and emits
`source_refdes_convention_warning` when they disagree with the ftype — *"C1 has
ftype="simple_resistor" but should start with R"*. Auto-naming never consults
it:

```ts
// Group.ts:678
getNextAvailableName(elm) {
  this.unnamedElementCounter[elm.lowercaseComponentName] ??= 1
  return `unnamed_${elm.lowercaseComponentName}${this.unnamedElementCounter[...]++}`
}
```

Nobody authors the name of a generated screw, so there is nothing to lint. And
`name` is required on `source_component`, so each piece still gets one — the
existing auto-namer covers it.

**A designator identifies a position; an MBOM line identifies a quantity of
interchangeable parts.** `R1` must go in one specific place, which is why the
EBOM's Designator column is load-bearing. Eight screws come from a bin, so
`SCR1 SCR2 … SCR8` tells a buyer nothing — which is why §8.2's row carries no
names. Per-piece traceability belongs to the assembly plan (§13), which keys on
mounts rather than BOM rows.

Other uses of `name` are all N/A here: `{REF}` substitution
(`PrimitiveComponent.ts:617`) is silkscreen and schematic text, selectors never
target a generated piece, and the EBOM and PnP exclude assembly parts anyway.

---

## 3. `circuit-json` changes

### 3.1 Two new fields on `source_component_base`

```ts
{
  /**
   * The assembly that consumes this part. Absent means the board assembly.
   * The PHYSICAL tree (what is bolted into what), deliberately distinct from
   * source_group_id, which is the FUNCTIONAL tree of subcircuits.
   */
  parent_source_component_id: z.string().optional(),

  /** Canonical specification identity, e.g. "ISO 4762 M3x8". Never a part number. */
  designation: z.string().optional(),
}
```

Both optional, so every existing document stays valid. They sit on the **base**
rather than on the assembly variants so an electrical part can adopt them later
(§7.3).

**There is no `modelprinter_string` on `source_component`.** An earlier draft put
it there and had `core` copy it onto the `cad_component`. It lives on
`cad_component` only (§3.5), exactly as `footprinter_string` does: the
`source_component` says what the part **is**, the `cad_component` says what it
**looks like and where it sits**. One home, no copy, no drift.

**There is no `identified_by`.** An earlier draft proposed one; precedence
replaces it (§7.1). The current shape of `SourceComponentBase` is `type`,
`ftype?`, `source_component_id`, `name`, `manufacturer_part_number?`,
`supplier_part_numbers?`, `display_value?`, `display_name?`,
`are_pins_interchangeable?`, `internally_connected_source_port_ids?`,
`source_group_id?`, `subcircuit_id?`.

**`display_value` is a dead field today** — declared in `circuit-json`, written
nowhere and read nowhere across every cloned repo (every hit is
`schematic_component.symbol_display_value`, a different field). Populate it with
the human phrasing (`"M3 × 8mm socket head cap screw"`) beside the designation
(`"ISO 4762 M3x8"`). Do **not** merge the two: a label that is also a group key
means a well-meaning label change reshapes the BOM.

### 3.2 Three new ftype variants

```
source_assembly_device.ts     "assembly_device"      a device node
source_assembly_enclosure.ts  "assembly_enclosure"   an enclosure node
source_assembly_part.ts       "assembly_part"        every leaf
```

**Three, not eight.** An earlier draft gave each kind its own variant —
`enclosure_screw`, `enclosure_heatsetinsert`, `enclosure_spacer`,
`enclosure_fdm_box_base`, `enclosure_fdm_box_lid`. All five were pure labels,
and each cost a `circuit-json` release: a new file, an export in
`src/source/index.ts`, three edits in `any_source_component.ts`, an entry in
`any_circuit_element.ts`, a README regeneration, and a coordinated bump before
anything could emit one.

**The test: an ftype is needed when a consumer must branch on it from the record
alone.** Ask in order — does a consumer change behaviour, or merely display?
Can an existing field carry it? Is the branch worth a closed-union entry and a
release?

| ftype | Who branches on it |
| --- | --- |
| `assembly_device` | the MBOM walk, finding roots |
| `assembly_enclosure` | 3d-viewer, for enclosure translucency (§6.3); the producer filter fires here, because among assembly parts only the enclosure has a `pcb_component` |
| `assembly_part` | **nothing.** It exists so a leaf has an ftype that classifies as assembly rather than defaulting to `pcba` |

Three is the floor, not a compromise: drop `assembly_part` and every leaf
classifies as `pcba`; merge the two node types and translucency breaks.

What the dropped five were carrying, and where it went instead:

| Was | Now |
| --- | --- |
| screw vs spacer vs insert, for the MBOM Category column | the model string's function token (`screw_m3_l8mm_socketcap` → `screw`) |
| the human label | `display_value` ("M3 × 8mm socket head cap screw", "FDM printed base") |
| made vs bought | `display_value`. Nothing in this proposal branches on it. |
| the refdes prefix | nothing. The prefix table lints author-supplied names, and nobody authors a generated screw's name (§2.5) |
| the process, in `enclosure_fdm_box` | **nothing records it.** The solver used the process to build the geometry; no consumer downstream reads it back. |

That last row is the proliferation trap in miniature, and it caught an earlier
draft twice. Baking the process into the ftype means a second process is a
second ftype forever — but the fix is not to move it into a
`manufacturing_process` field, which was the first correction and was also
wrong. **The same test applies to fields.** `manufacturing_process` had no
reader in the MBOM walk, `groupByIdentity`, the producer filter, the renderers
or the checks, so it does not exist. Add it when per-vendor output splitting
arrives — an STL pack for the print farm, a purchase order for the fastener
supplier — because that is the consumer that would branch on it.

**Fields.** All three variants are bare
`source_component_base.extend({ ftype })`, following `source_simple_ground`,
which is field-free today — an ftype names a kind a consumer must tell apart,
and fields are one reason, not the only one.

Deliberately **no** `thread`/`length`/`head` on a screw: the model string
`screw_m3_l8mm_socketcap` already carries them, and two copies of one number can
disagree. Add a field when a consumer must read a number without parsing. The
same reasoning removed the proposed `screen` and `ribbon_cable` variants, whose
fields all duplicated `flexscreen_w40mm_h22.5mm_…`.

**ftype values must be snake_case, never dotted.** `circuit-json`'s
`scripts/zod-lint.ts:102` tests every enum value against
`/^[a-z][a-z0-9_]*(?:_[a-z0-9]+)*$/`. `enclosure.fdm.box.lid` fails it, and
would be the only dotted value in the schema. The **element** name is dotted
because namespaces are an authoring convenience; the **ftype** is a flat record
discriminant with a different audience and its own lint gate.

Run `bun run lint:zod` **and** `bun run check-snake-case`; the second is weaker
and passing it does not imply the first passes.

**`interconnect` is a counterexample to the `simple_` convention.**
`source_interconnect.ts` declares `ftype: z.literal("interconnect")` with no
prefix. So the electrical/assembly split cannot be a prefix test — §4.2 uses an
explicit map, and a prefix test would misclassify `interconnect` as an assembly
part.
### 3.3 Augmentation is not an option

Measured, by parsing against the real schemas:

```
1. extra fields survive parse? -> {"type":"source_component","ftype":"simple_resistor",
                                   "source_component_id":"sc1","name":"R1","resistance":10000}
2. new ftype passes union?     -> false
3. base parse output           -> {"type":"source_component","source_component_id":"sc3","name":"X"}
```

- Unknown fields are **silently stripped**, not rejected — the worst failure
  mode, because a record round-tripped through `.parse()` loses `designation`
  with no diagnostic and the MBOM then groups it wrongly.
- A new ftype **fails** `any_source_component`, which is a plain `z.union` with
  no catch-all.

TypeScript declaration merging would give the types, but the zod schema is a
runtime value that cannot be reached into. There is a prototyping window —
`validateInserts` is opt-in, is set nowhere in `core`, and even when set the
parse result is discarded and the original object stored (`cju.ts:137`,
`cju-indexed.ts:462`) — but anything that validates a saved `circuit.json`
rejects the document. **Land §3 for real before the exporter ships.**

### 3.4 `supplier_name`

`supplier_part_numbers` is `z.record(supplier_name, z.array(z.string()))`, and
`supplier_name` is a closed enum of PCB suppliers that cannot express
McMaster-Carr or Fastenal. Preferred fix: extend the enum, so one field keeps one
meaning and the CSV exporters already widen columns. Open question 1 in the RFC;
§7.1 depends on it.

### 3.5 `cad_component`

One new optional field, beside `footprinter_string`:

```ts
modelprinter_string: z.string().optional(),
```

This is the **only** home for a model string. `pcb_component_id` stays
**required**; §6 shows why it does not need relaxing.

Its `.describe("Defines a component on the PCB")` is now inaccurate — a
`cad_component` describes any physical piece with a frame, and the frame may be
borrowed. Worth updating in the same PR.

### 3.6 Invariants

Zod validates records, not documents. These belong in `@tscircuit/checks` as a
`checkAssemblyTree`, run from a core render phase like `runAllPlacementChecks`:

| Invariant | Severity |
| --- | --- |
| every `parent_source_component_id` resolves | error — a dangling parent silently drops a subtree |
| the parent graph is acyclic | error — the MBOM walk hangs |
| a parent passes `isAssemblyNodeFtype` | error — a screw cannot parent an enclosure |
| at most one root assembly node | warning |
| an assembly node has children | warning |

`source_group.parent_source_group_id` has the same exposure today with no such
check, and `inflate-circuit-json.ts` carries its own cycle detection for exactly
this reason.

---

## 4. `core` changes

| Change | File |
| --- | --- |
| `ftype: "assembly_enclosure"`, keep the `pcb_component` | `EnclosureFdmBox.ts` (`ftype: "simple_chip"` today, line 31) |
| Base and lid get their own `source_component`s | `EnclosureFdmBox_doInitialCadModelRender.ts` |
| `cad_component.size` set from `output.dimensions` | same file (§6.3) |
| Hardware records from resolved mounts | `EnclosureScrewBoss/` |
| `assembly.component` lowering | new `AssemblyComponent/` (`AssemblyDevice.ts` already exists) |
| Safe `list()` default | `circuit-json-util` (§4.2) |

### 4.1 Solver output to Circuit JSON

The solver returns `HardwareOccurrence[]` as plain data
(`create-fdm-enclosure/lib/fdm/types.ts:89`). Lowering is mechanical:

| `HardwareOccurrence` | `source_component` |
| --- | --- |
| `role` | — the ftype is always `assembly_part`; the kind survives in the model string's function token |
| `designation` | `designation` |
| `hardwareString` | `cad_component.modelprinter_string` (after §5) |
| `displayValue` | `display_value` |
| `manufacturerPartNumber` | `manufacturer_part_number` |
| `supplierPartNumbers` | `supplier_part_numbers` |
| `id`, `mountId`, `bomGroupKey` | — solver-internal; the group key is derived on read |
| `generatedBy`, `position` | — dropped for now |
| — | `parent_source_component_id` = the enclosure |
| — | `name` = whatever the existing auto-namer produces; nothing reads it (§2.5) |

Case change is not drift: `circuit-json` is snake_case and gates on it, while
the solver is an ordinary TypeScript library.

`generatedBy` (the `pcb_hole` that caused the part) is dropped. Adding a
heterogeneous reference — following `schematic_element_outside_sheet_warning`
with a closed enum — deserves its own review, and no consumer needs it yet.

### 4.2 Enforcing the BOM class

Three mechanisms, in decreasing strength.

**1. A safe default.** `@tscircuit/circuit-json-util`'s indexed collection
gains:

```ts
db.source_component.list()                          // bomClass "pcba" (default)
db.source_component.list({ bomClass: "assembly" })
db.source_component.listAll()
```

This inverts the burden: a consumer must opt in to see assembly parts. Seven of
the eight scan sites in §1.1 need no edit, and a consumer written next year gets
the safe behaviour without knowing the rule exists.

Honest risk: a silent behaviour change to an existing API. It is a no-op the day
it ships, because no document contains an assembly part, and `listAll()` is the
explicit escape.

**2. Exhaustiveness in the type system.**

```ts
export const ASSEMBLY_NODE_FTYPES = ["assembly_device", "assembly_enclosure"] as const

const BOM_CLASS = {
  simple_resistor: "pcba", /* … every electrical ftype … */
  interconnect: "pcba",    // no simple_ prefix; see §3.2
  assembly_device: "assembly",
  assembly_enclosure: "enclosure",
  assembly_part: "assembly",
} satisfies Record<SourceComponentFtype, "pcba" | "assembly" | "enclosure">

export const getSourceComponentBomClass = (sc: { ftype?: string }) =>
  (sc.ftype && BOM_CLASS[sc.ftype]) ?? "pcba"

export const isAssemblyNodeFtype = (ftype?: string) =>
  !!ftype && (ASSEMBLY_NODE_FTYPES as readonly string[]).includes(ftype)
```

An `assembly_part` under an enclosure classifies as `"assembly"`, not
`"enclosure"`. Where a consumer needs "is this part of an enclosure" — 3d-viewer
translucency — it walks `parent_source_component_id` to the node and checks for
`assembly_enclosure`. Encoding that in the leaf's own ftype is what produced the
five redundant variants §3.2 removed.

`satisfies` makes an unclassified new ftype a **compile error inside
`circuit-json`**, so the change cannot leave the repo unclassified. Defaulting to
`"pcba"` keeps an unknown or absent ftype behaving as it does today.

The return values name **which BOM consumes the part**, not what the part does.
A screen is electronic, but a board assembler does not fit it. "electrical vs
mechanical" was rejected for that case.

**3. A test on the property that matters.** A fixture with a board plus an
enclosure asserts the EBOM row count is unchanged. That fails loudly if any
consumer starts leaking, which no convention can guarantee.

**What cannot be enforced:** a hand-rolled
`circuitJson.filter(e => e.type === "source_component")`. The mitigation is that
the safe list is less work than the filter.

### 4.3 Parenting

`parent_source_component_id` is set from the render tree by one rule:

> The parent is the nearest ancestor whose ftype passes `isAssemblyNodeFtype`.
> If there is none, the field is absent.

| Declared | Parent |
| --- | --- |
| a screw generated by a boss on a `<hole>` | the enclosure that claimed the board |
| `<assembly.component>` in `<assembly.device>` | the device |
| `<assembly.component>` in `<enclosure.fdm.box>` | the enclosure |
| `<enclosure.fdm.box>` in `<assembly.device>` | the device |
| `<enclosure.fdm.box>` with no device | none — it is the root |

The first row needs care. A boss is declared on a `<hole>` inside a `<board>`,
which has **no** assembly ancestor, so the parent is not the hole's nearest
ancestor — it is the enclosure that claimed the board through `boardRef`.
`get-referenced-enclosure-board.ts` already resolves that link in the other
direction, so this is a lookup, not a new traversal.

---

## 5. `modelprinter` changes

`create-fdm-enclosure/lib/hardware/hardware-dsl.ts` implements its own
footprinter-shaped grammar and `get-hardware-model.ts` expands it, duplicating
`@tscircuit/modelprinter`, whose `parse-model-string.ts` is the same grammar.

**Nothing depends on modelprinter today.** No `package.json` references
`@tscircuit/modelprinter`, and no code in `core`, `props`, `circuit-json`,
`3d-viewer` or `circuit-json-to-gltf` mentions it. Its one model, `flexscreen`,
is exactly the model `<assembly.component>` needs for a screen — the `assembly.*`
namespace exists because modelprinter can already describe non-fasteners.

### 5.1 Plan

1. Add model functions to `modelprinter/src`, each with a zod schema beside
   `flex-screen-schema.ts` and a `parse-*-model-string.ts`, registered in
   `modelFunctions`: `screw`, `heatsetinsert`, `spacer`, `ribbon`, `rubberfoot`,
   `cylinder`.
2. Test that the tokens parse under `parseModelStringParams`, which lowercases,
   splits on `_` and matches `^([a-zA-Z]+)([\(\d\.\+\-].*)?$` per token. `m3`,
   `l8mm`, `od6mm`, `p1.27mm`, `c20` and `socketcap` all parse — confirm in a
   test, not by inspection.
3. `create-fdm-enclosure` depends on `@tscircuit/modelprinter` and deletes
   `hardware-dsl.ts`; `get-hardware-model.ts` becomes an adapter from the parsed
   definition to a JSCAD solid.
4. Emit `modelBounds` and `modelOriginPosition` from every model (§6.3).
5. Lengths go through `format-si-unit`: `formatMm` writes,
   `parseAndConvertSiUnit` reads. `formatMm` rounds float dust to three
   decimals, which an identity requires — a spacer length derived as
   `totalHeight - lidThickness - boardTopZ` arrives as `7.500000000000002`, and
   that noise would split one MBOM line into two. Parsing through
   `parseAndConvertSiUnit` rather than `Number` also makes a hand-written
   `l0.25in` resolve to 6.35mm, not 0.25.

**A generic part needs no model function.** `<assembly.component model="…">`
passes its string through unparsed; `modelprinter.string(s).json()` throws
`Unsupported modelprinter function` for an unknown name, so `core` stores the
string without expanding it. The MBOM never parses a model string.

**A cut spacer's model string and its designation deliberately differ.** The
model must know the length it was cut to; the designation names the stock and
the cut length so pieces of one length group into one line (§10.4).

### 5.2 Positioning conventions, read out of `flexscreen`

Every positional property in `flexScreenModelPropsShape` is board-relative. None
is a world coordinate.

| Group | Properties |
| --- | --- |
| Board datum | `boardTopZ`, `boardThickness`, `boardClearance` |
| Attachment | `cableStartX/Y/Z`, `cableLateralOffset` |
| Pose | `foldsAboveBoard`, `foldsBelowBoard`, `sitsFlat`, `distanceAboveBoard`, `foldDistanceFromConnector`, `foldOutset`, `bendRadius` |
| Correction | `offset {x,y,z}`, `rotation [3]` |

Five rules for a new model: no absolute position; take the attachment point from
the part you plug into (`foldDistanceFromConnector` names the connector, so the
connector is the anchor); name orientations against the board, since
`foldedToFaceAboveBoard` cannot be misread as a layer or a direction the way
`top` can; compute the pose rather than authoring it; and report bounds and
origin.

Lengths accept number-or-string and normalize to mm via `@tscircuit/mm`;
rotations accept strings so `"90deg"` works. Both match props' conventions.

---

## 6. Frames, borrowing, and rendering

### 6.1 What a `pcb_component` is

`pcb_component` is the **placement record**: it is the only record that says a
part has a resolved position on a board. The load-bearing fields are
`source_component_id`, `center` (**2D** — `point` is `{x, y}`), `layer`
(`top`/`bottom`), `rotation`, and `width`/`height`.

It carries **no Z** — the board-surface Z comes from the board plus `layer`, and
the model's Z lands in `cad_component.position.z`, which already composes
`zOffsetFromSurface`, `positionOffset.z` and the mounting layer. It carries **no
body extent** — `width`/`height` are footprint extent (measured: an 0402 reads
1.56 × 0.64, a pushbutton reads **0 × 0**).

**Origin, rotation and layer come from the ancestor's `pcb_component`; bounds
come from the model, never from `pcb_component.width/height`.** A `flexscreen`
anchored to a pushbutton-shaped `0 × 0` would otherwise cut a zero-size aperture
and look fine until someone printed it.

### 6.2 The borrowing rule

`cad_component.pcb_component_id` is **required by the schema**, but the
renderers do **not** require the lookup to resolve — every consumer null-guards
it (`pcbComponent?.layer ?? "top"`, `pcbComponent?.width ?? 2`) and position and
rotation come from the `cad_component` itself. That is why a shared owner works
at all.

> **`pcb_component_id` is the frame the part renders in; `source_component_id`
> is the part.**

Every renderable part borrows the `pcb_component_id` of its nearest framed
ancestor:

| Part | Frame | Renders |
| --- | --- | --- |
| base, lid, screws, inserts, spacers | the enclosure's `pcb_component` | yes |
| `<assembly.component>` under a component | that component's `pcb_component` | yes |
| a part with no position | could borrow, nowhere to sit | **no** (§6.4) |

This is already the shape of the code — base and lid share one owner today:

```ts
const cadComponents = output.parts.map((part) =>
  db.cad_component.insert({
    pcb_component_id: component.pcb_component_id!,     // shared frame
    source_component_id: component.source_component_id!,
    model_jscad: part.jscadPlan, ... }))
```

The change is that each part gets **its own `source_component`** while
continuing to share the enclosure's `pcb_component_id`.

**Emit one `cad_component` per rendered piece.** Not one per part *kind*, and
not one shared record — eight screws give eight `source_component`s and eight
`cad_component`s, each with its own `position` and its own
`modelprinter_string`. Membership in the 3D view is then structural in the same
way BOM membership is: a piece renders because it has a `cad_component`, and it
has one because it has a position. No consumer decides what to skip.

One consequence to state: `AnyCadComponent.tsx:77` joins
`cad_component.source_component_id` → `source_component` for the hover label. Per
part records make that label say `SCR1` rather than `EN1` — an improvement, and
the only place that join is used.

**The enclosure keeps its `pcb_component`.** It is not a fiction: `center` comes
from `pcbBoard.center` and the extent from `output.dimensions`. Moving it to
`<assembly.device>` was considered and rejected — the device has no geometry of
its own, the element is optional so ownership would be conditional, and whoever
owns it still needs excluding from the EBOM. Giving `<board>` a `pcb_component`
was also rejected: it would need the same three suppression flags, forcing a
`source_component` for every board and converting an enclosure-only phantom into
a universal one.

### 6.3 Renderer changes

Two renderers consume `cad_component`. Neither reads `ftype` today
(`rg -n "ftype" 3d-viewer/src circuit-json-to-gltf/lib` → empty). They iterate
`cad_component.list()` and dispatch on which geometry field is set.

**A. Fix the frame join.** The two disagree on how a `cad_component` finds its
`pcb_component`:

```ts
// circuit-json-to-gltf/lib/converters/circuit-to-3d.ts:368 — correct
const pcbComponent = db.pcb_component.get(cad.pcb_component_id)

// 3d-viewer/src/AnyCadComponent.tsx:115 — wrong under borrowing
const pcbComponent = circuitJson.find(
  (elm) => elm.type === "pcb_component" &&
           elm.source_component_id === cad_component.source_component_id)
```

Under borrowing, each part carries its own `source_component_id` with a shared
`pcb_component_id`, so 3d-viewer's join resolves nothing and silently falls back
to `layer = "top"`. **3d-viewer must join on `pcb_component_id`.** Stranger
still, the same file uses both keys — `isLegacyFdmEnclosure` is called four
lines later and joins on `pcb_component_id`.

**B. Retire `isLegacyFdmEnclosure`.** It identifies the enclosure by sniffing
the phantom's suppression flags:

```ts
return Boolean(pcbComponent && pcbComponent.do_not_place &&
  pcbComponent.is_allowed_to_be_off_board &&
  pcbComponent.obstructs_within_bounds === false)
```

It gates translucency (`visibility.enclosure === "translucent"`). Once parts
share one frame this misfires: a modelprinter part emitting `model_jscad` with
`model_origin_alignment: "bottom_center_of_component"` and borrowing that frame
is **rendered translucent as if it were the enclosure**. Replace the sniff with
a `source_component_id` → `ftype` lookup — a declared fact. Its own docstring
says it exists only because there was no declared field, and it is named
*legacy*. **This must land with the borrowing change, not after.**

**C. Set `cad_component.size` explicitly** from `output.dimensions` on enclosure
parts. Today the enclosure's `cad_component.insert` sets no `size`, so
`circuit-to-3d.ts:376` falls back to `pcbComponent?.width/height` — meaning the
phantom's stamped dimensions are quietly feeding the renderer. Setting `size` is
honest and removes the hidden dependency.

**D. Teach the dispatch modelprinter.** Additive, ~4 files:

| Repo | Change |
| --- | --- |
| `circuit-json-to-gltf` | `lib/loaders/modelprinter.ts`, mirroring `loaders/footprinter.ts` (cache + generate), and one `else if` in `circuit-to-3d.ts` |
| `3d-viewer` | one line in `get-cad-model-type.ts`, one branch in `AnyCadComponent.tsx` beside `FootprinterModel` |

`getCadModelType` returns `"unknown"` for a field it does not recognise and
`AnyCadComponent`'s chain is a plain `else if`, so **an unrecognised model
renders as nothing, not as something wrong.** Each renderer can adopt
independently.

The string lives on `cad_component` and nowhere else, exactly as
`footprinter_string` does. There is no copy from `source_component` to maintain,
and a part with no `cad_component` simply has no model string (§6.4).

### 6.4 Parts with no position, for the record

**A part with no position gets no `cad_component`, and therefore does not
render.** That is structural rather than a policy a renderer enforces.
Placement props for children of an enclosure are out of scope. Until they land,
a rubber foot is an MBOM line and nothing in the 3D view.

It also carries **no model string**, because the only field that holds one is on
the geometry record it does not have. The authored `model="rubberfoot_r5mm_h2mm"`
is therefore not persisted. That is acceptable: the part's identity is its
designation or part number, which is what the MBOM needs, and the geometry is
unplaceable by definition. When placement props land the piece gains a
`cad_component` and the string lands with it.

The gate is the frame, not the foreign key — such a part could borrow the
enclosure's `pcb_component_id` as easily as the base does, and all four feet
would render stacked at the origin. What is missing is a placement input, and
when it arrives the frame is already there: **the enclosure's `pcb_component` is
a reference to the center of the board.**

### 6.5 Bounds need no schema change

`getComponentBody` already reads bounds off the live component and prefers a
record when one exists:

```ts
const cadModelProp = owner?._parsedProps?.cadModel
const size   = cadComponent?.size ?? authoredModel?.size
const bounds = cadComponent?.model_bounds ?? authoredModel?.modelBounds
```

`modelBounds` is a prop (`props/lib/common/cadModel.ts:75`); `cad_component` has
no `model_bounds` field yet and the code casts to reach the eventual one.
`getModelReachAboveOrigin` turns bounds + `model_origin_position` +
`model_board_normal_direction` into reach above the board surface.

So a modelprinter part supplies bounds into the same slot — **no `circuit-json`
change, no coupling to the staged `model_bounds` migration.** A folded
flexscreen is not a special case: it is a part whose bounds reach 20mm above its
origin, like a tall capacitor reaching 5mm above its own.

Measured gap: on a board of six ordinary parts, **zero** `cad_component` records
carried `size` and **zero** carried bounds. The plumbing is complete and empty.
Parametric models are exempt, because they compute their own bounds.

---

## 7. Identity resolution

### 7.1 Precedence, not a flag

`identity = manufacturer_part_number ?? designation`, and an error when neither.

An earlier draft added `identified_by`. It is redundant. The objection to
keying on an MPN was that a supplier being out of stock would split one line of
8 into two of 4 — but that conflates the key's *value* changing with the *row
count* changing. A split needs two different MPNs for one specification **inside
one document**, which happens only when the author pins an MPN on some pieces
and not others (in which case splitting is correct — they asked for a specific
part there) or when the engine is non-deterministic for identical cache keys (a
bug). Eight identical screws hit one `_getPartsEngineCacheKey` and get one MPN.

Precedence also fixes the incompleteness in §10.2 for free: `ISO 4762 M3x8`
cannot distinguish black oxide from A2, and pinning an MPN on that boss splits
it out correctly.

### 7.2 One engine or two

The RFC leaves this open: `findPart` gains a `modelprinterString` parameter, *or*
a parallel `findPartByModelSpec` takes one. Both are workable; the difference is
who decides which to call.

**Option A — one method, one more parameter.**

```ts
export type PartsEngine = {
  findPart: (params: {
    sourceComponent: AnySourceComponent
    footprinterString?: string
    modelprinterString?: string   // new
  }) => Promise<SupplierPartNumbers> | SupplierPartNumbers
}
```

| Why it fits | |
| --- | --- |
| `sourceComponent: AnySourceComponent` widens for free once the assembly ftypes join the union, and already carries `ftype` and `designation` | no separate `HardwareSpecification` object |
| The model string holds the axes: `screw_m3_l8mm_socketcap` parses to thread/length/head as an adapter parses `soic8_w5.3mm` | the `attributes` map an earlier draft proposed re-encoded a string the record already has |
| `SupplierPartNumbers` is `{ [k in SupplierName]?: string[] }` | a hardware supplier is one more supplier name (§3.4) |
| An engine that does not know a part returns nothing | identical to the existing no-engine behaviour |

The caller never chooses: it passes whichever string the record has, and an
adapter that only knows LCSC returns nothing for a screw.

**Option B — a parallel `findPartByModelSpec`.** Honest advantages: an adapter
author implements only the half they serve, the two return paths can diverge
later without a breaking change to `findPart`, and a hardware adapter never has
to pattern-match on `footprinterString` being absent.

Its cost is the one §4.2 exists to prevent: **somebody has to choose which
method to call**, and the only available basis is
`getSourceComponentBomClass(sourceComponent)` at the call site. That is a
consumer branching on the assembly/pcba split — exactly the obligation the safe
`list()` default was designed to remove. It also duplicates the caching, the
async effect queue, and the disable switches, or forces them to be factored out
first.

**Recommendation: Option A**, on that one argument. If Option B is chosen,
dispatch must live in `core` in exactly one place, not at each call site.

Either way, reuse `doInitialPartsEngineRender`'s machinery: the
`if (source_component.supplier_part_numbers) return` guard is exactly "author
value wins", plus `localCacheEngine` caching, the async effect queue, and the
`bomDisabled` / `partsEngineDisabled` / `doNotPlace` switches.

**Two required changes, under either option.** `_getPartsEngineCacheKey`
(`NormalComponent.ts:1997`) hashes `ftype`, `name`, `manufacturer_part_number`,
`standard`, `pin_count`, `footprinterString` — it **must** also include
`modelprinterString` and `designation`, or two different screws collide in the
cache. And `doInitialPartsEngineRender` lives on `NormalComponent`, so derived
hardware records need the render phase extended to cover them.

**What belongs in neither:** the stocked-length series used by §10.3's rounding.
That runs in the solver during `resolveScrewLength`, **before** a
`source_component` exists, so neither method's key exists yet. It is a catalogue
question, and `resolveScrewLength` already takes the series as a parameter.

### 7.3 What the EBOM does today, measured

`<resistor resistance="10k" footprint="0402" />` → `doInitialPartsEngineRender`
→ `partsEngine.findPart` → `supplier_part_numbers` → the `JLCPCB Part #` column.
The assembler builds from that column and ignores Comment/Value.

| Fact | Where it stops |
| --- | --- |
| Tolerance, power rating, package | not in `source_simple_resistor`, which holds `resistance` and `display_resistance` |
| Dielectric (X7R vs Y5V) | not in `source_simple_capacitor`, which holds `capacitance` and `max_voltage_rating` |
| Manufacturer part number | in `BomRow.manufacturer_mpn_pairs`, but `convertBomRowsToCsv` never writes it |
| Footprint | only from the optional `resolvePart` callback; `cli/lib/shared/export-snippet.ts` passes none, so the column is empty |

(`extra_columns` and a joined `supplier_part_numbers` are computed in
`convertBomRowsToCsv` and never used — dead locals.)

So the EBOM identifies an **occurrence**, and identity arrives by resolution.
That is sound because it never groups. The MBOM must group, so it must state a
key. An EBOM that groups would use these fields unchanged, once a passive can
carry the axes that complete its designation and the CSV writes an identity.
Neither is in scope.

---

## 8. Producers: MBOM, EBOM, pick-and-place

### 8.1 Excluding assembly parts

Neither producer respects `do_not_place`:

```
=== does the EBOM respect do_not_place? ===   (empty = no)
=== does pick-n-place? ===                     (empty = no)
```

Both iterate `pcb_component`, so today the enclosure appears in **`bom.csv` and
`pnp.csv`** — handed to the board assembler as a line item *and* as a placement
coordinate. One line in each producer fixes both:

```js
if (getSourceComponentBomClass(source_component) !== "pcba") continue
```

This is the one place membership is not purely structural. The §1.1 argument was
about consumers that touch `source_component` *incidentally*; these two files
exist to decide what the board assembler receives, so consulting the BOM class
is their definition, not a leak. Two files, not 121.

### 8.2 The MBOM walk

`circuit-json-to-bom-csv` — the only BOM producer in the ecosystem, called by
runframe's BOM table and `cli`'s `export-snippet.ts`, and 40 lines long.

```ts
export const convertCircuitJsonToMbomRows = async ({
  circuitJson, assemblyName,
}: { circuitJson: AnyCircuitElement[]; assemblyName?: string }) => {
  const sourceComponents = circuitJson.filter(e => e.type === "source_component")
  const nodes = sourceComponents.filter(sc => isAssemblyNodeFtype(sc.ftype))

  const rows: MbomRow[] = []
  for (const node of nodes) {
    if (assemblyName && node.name !== assemblyName) continue
    const children = sourceComponents.filter(
      sc => sc.parent_source_component_id === node.source_component_id)
    // A child that is itself an assembly node contributes ONE line and is not
    // expanded here; it gets its own group of rows above.
    rows.push(...groupByIdentity(node, children))
    rows.push(...boardRowsFor(node, circuitJson))   // from source_board
  }
  return rows
}
```

Properties worth asserting in tests:

1. **A device MBOM never expands a subassembly.** `EN1` is one line under `D1`
   and eight lines of its own under `EN1`.
2. **It works with no `<assembly.device>`.** The enclosure is then the only
   node, and the output matches the pre-`assembly.*` output exactly.
3. **It works with several devices.** Multiple roots are a warning, not an
   error, and the `Assembly` column disambiguates.

Note that BOM nesting uses `parent_source_component_id` only. **It never touches
`pcb_component`,** which is why one shared frame supports any number of BOM
levels.

### 8.3 `groupByIdentity`

The key is `manufacturer_part_number ?? designation`. Never the model string,
and never a supplier part number.

Two diagnostics:

- **No identity at all** — an error. Two unnamed parts are not evidence that
  they are the same part.
- **A group whose members give different manufacturer part numbers** — a
  warning naming both. This proves the designation is incomplete (§10.2), costs
  nothing, needs no catalogue, and is the only automatic check on designation
  completeness available.

The natural home for the second is a warning record in `circuit-json`, sibling
to `source_missing_manufacturer_part_number_warning`.

### 8.4 Symmetry, and consumers

| | EBOM | MBOM |
| --- | --- | --- |
| Iterates | `pcb_component` | `source_component` where `isAssemblyNodeFtype` |
| Joins by | `source_component_id` | `parent_source_component_id` |
| Emits | one row per occurrence | one row per identity, with a quantity |

The one asymmetry, grouping, is why the MBOM writes its identity into the CSV: a
list that groups must show what it grouped on.

`cli`'s `export-snippet.ts` adds `mbom.csv` beside `bom.csv` when non-empty,
plus a `tsci export mbom` target; runframe gets a second cell in the BOM tab.
Both additive.

---

## 9. The fastener catalogue (implemented, retained)

### 9.1 Specification axes

| Axis | Values | Determines |
| --- | --- | --- |
| `thread` | `M2` `M2.5` `M3` `M4` `M5` | clearance hole, pilot hole, insert bore, head dimensions |
| `fastening` | `heat_set_insert` `press_fit_insert` `self_tapping` | how the boss is bored and what hardware is consumed |
| `head` | `socket_cap` `countersunk` `pan` `button` | head Ø/height, and which recess is legal |
| `headRecess` | `none` `countersink` `counterbore` | geometry cut into the part the head bears on |
| `length` | distance, **normally omitted** | derived from the stack (§9.3) |

Each is a typed enum, so a typo is a compile error. Whole-stack presets under a
nickname would read more tersely at the cost of a table growing as the product of
the axes rather than their sum, and could not be varied one axis at a time.

### 9.2 A curated view of a real vendor catalogue

> **A specification may exist in the catalogue only if a real vendor stocks it.**

Standards tables describe what a conforming part *would* measure. They do not say
an M2.5×14 countersunk A2 screw is stocked anywhere, and a BOM whose lines cannot
be bought is worse than no BOM, because the failure surfaces at purchasing rather
than at design time.

The axes represented today are thread, head style and length. Drive, material and
finish are fixed per head style by picking one commodity series and are not
expressible — so "vendor-backed" describes the curation rule, not a property a
consumer can check, and a designation is incomplete in exactly the way §10.2
describes. Adding a finish axis is a prerequisite for stocking a second finish.

### 9.3 Screw length is derived, then rounded

```
exact  = Σ(clamped material) − headSeatDepth + requiredEngagement
chosen = the smallest stocked length ≥ exact
```

`headSeatDepth` is **subtracted**: a recess buries the head, so the screw enters
that much lower and needs that much less length under it.

| Fastening | Required engagement |
| --- | --- |
| heat-set / press-fit insert | the insert's threaded length |
| self-tapping in thermoplastic | 2 × nominal thread Ø — plastic is far weaker than the screw, so the joint fails by stripping the boss |

One upper bound: **the bore**. Not the insert's threaded length — an insert is a
barrel open at both ends, so a screw may pass through it; what it may not do is
reach solid material. The bore is deepened to fit the screw actually chosen:

```
bore = max(insert length + melt relief, screw penetration),  capped by the floor rule
```

Deriving it the other way round — fixing the bore at the insert's length, then
requiring the screw to fit — rejects every stack whose exact length is not itself
a stocked size, which is most of them.

The bound is checked **after** rounding, because rounding is what can violate it.
There is deliberately no "next shorter length" fallback: lengths are sorted, so
the shortest one that engages is the only candidate that could also be short
enough.

The length series is data, never a formula, because "which lengths exist" is a
fact about a vendor. The same reasoning picks the insert series: the longest one
whose installed length fits the available bore, so a shallow stack degrades to a
short series rather than failing. The default 4mm standoff over a 2mm floor
leaves 5.2mm of bore, which does not take a 5.7mm M3 insert.

### 9.4 Clearance holes, and the bore they are not

| Passage | Diameter | Because |
| --- | --- | --- |
| the lid's clearance hole | ISO 273 **medium** (3.4mm for M3) | we generate it, and a printed part wants assembly slop |
| the PCB's mounting hole | validated against ISO 273 **fine** (3.2mm) | the fab made it to the layout's number, and 3.2mm for an M3 is what practically every layout uses |
| a purchased spacer's ID | validated against ISO 273 **fine** | a spacer is deliberately a close fit, so it stays concentric |

The rule is not who made the hole; it is **whether the dimension is ours to
choose.** We size what we generate at the medium series and validate what we
inherit against the fine one.

The **boss bore** comes from the fastening method, not a clearance series:
`selfTapPilotMm` (2.5mm for M3) or `installHoleDiameterMm` (4.0mm for M3). A
clearance hole is sized so the screw does **not** touch it; a bore is sized so it
does. Opposite requirements, different tables.

### 9.5 A head recess is two different depths

| Recess | Depth | For an M3 |
| --- | --- | --- |
| counterbore | the head's height | 3mm |
| countersink | `(headDiameter − clearanceDiameter) / 2` | 1.1mm, since a 45° cone descends 1mm per 1mm of radius |

The countersink is *shallower than the head is tall*, because the lower part of
the head sits inside the clearance hole rather than in the cone. Cutting the cone
to the head's height sinks the head below flush and removes twice the material.
Both the geometry and the "is there enough material left" rule read one function
for this depth, so they cannot disagree.

---

## 10. Geometry

### 10.1 Contributions, not inlined construction

| Feature | Part | Adds | Subtracts |
| --- | --- | --- | --- |
| every mount | base | boss cylinder, floor → board underside | insert bore or self-tap pilot; melt relief |
| `fastens="lid"` | lid | the board-to-lid column, when `printed` | one clearance hole for the whole lid-side run, plus the head recess |
| `lidColumn="spacer"` | — | nothing: a bought tube already has a bore | — |
| both | — | — | nothing below the minimum floor under a bore |

Composition applies every part's adds before its subtracts. That ordering is why
contributions are two lists rather than inlined code: a boss unioned *after* its
own bore would fill the bore back in.

### 10.2 Apertures cut bosses, and the solver says so

Apertures are subtracted after bosses are fused, so an opening overlapping a boss
removes the material in its way rather than being covered by it. That is correct
— the part has to fit — but it silently weakens the boss, so `collisions` on the
output names the mount, which column was cut, the aperture, and how deep.

The limit is not a new number: a boss is `bore + 2 * minInsertWallMm`, so the
check applies the identical rule to the boss as built rather than as designed.
Breaking through to the bore is an error, not a warning. It measures against the
aperture solver's **own** tool depths rather than a second derivation, and tests
the boss circle against the opening rather than their bounding boxes.

A floor boss spans the inside floor to the board underside while a side-wall
opening sits above the board, so they never share a Z band. The case that does
collide is a **lid column**, which occupies exactly the band a side connector
does.

### 10.3 The board-to-lid column belongs to the lid

| `lidColumn` | Consequence |
| --- | --- |
| `printed` (default) | a hollow column moulded into the lid, landing on the board; clamps the board, stiffens the lid, costs nothing to buy |
| `spacer` | a bought nylon tube; one MBOM line |
| `none` | the lid seats on the walls; the board is held by its `board` mounts |

A column can only be part of the lid: one standing up from the floor would occupy
the hole the board must be lowered over. `lidThickness` acquires a mount-derived
minimum under the existing rule — grow what the author did not state, hold what
they did to the same minimum with an actionable error.

### 10.4 A spacer is cut to length

A spacer must be exactly as long as `topHeadroom`. Stocked lengths are discrete,
but **spacer stock is sold by the length and cut during assembly**, so the
enclosure never rounds its geometry to a vendor's inventory.

| | When | Designation |
| --- | --- | --- |
| a stocked piece | the gap equals a stocked length | `spacer nylon 6mm x 3.2mm x 6mm` |
| cut from stock | any other gap | `spacer-stock nylon 6mm x 3.2mm cut 7.5mm` |

A stocked piece is preferred where one fits: cutting is a hand operation with a
hand operation's tolerance, and a sawn nylon tube is good to a few tenths, which
lands directly in the clamp.

**A cut spacer is still counted in pieces.** Sixteen 8.2mm pieces and twelve
9.1mm pieces are two lines with quantities. How many 300mm rods that takes, and
what kerf it costs, is the assembler's arithmetic — as a BOM asking for eight
screws does not ask for nine in case one is dropped.

An earlier version made the cut length a *quantity of stock*, so four 7.5mm
pieces became one line of 30mm. That needed `quantity` and `unit` fields on every
record to distinguish a count from a length, and gave the assembler a number to
divide back into pieces. Counting pieces needs neither field.

---

## 11. Design rules and FDM checks

### 11.1 Rules geometry is built from

Injectable like the existing profile: `minInsertWallMm` (printed wall around an
insert bore; sets boss OD when not given), `insertMeltReliefMm`,
`selfTapPilotReliefMm`, `minFloorUnderBoreMm`, `headRecessClearanceMm`,
`minMaterialUnderHeadRecessMm`.

Validations that produce errors rather than geometry, all implemented: a PCB hole
too small for the screw shank; a bore leaving less than `minFloorUnderBoreMm` of
floor, which selects a shorter insert series before it becomes an error; a
rounded screw length violating its engagement or protrusion bound; a head recess
deeper than the lid can carry, which grows an unstated `lidThickness` first; and
`lidColumn` on a board mount.

### 11.2 Checks on the finished solid

| Rule | Error when |
| --- | --- |
| `wall_below_minimum_thickness` | side wall, floor, lid or lip thinner than one extrusion |
| `insert_not_encircled` | the bore is broken into |
| `unsupported_bridge` | never — bridging degrades, it does not fail |
| `component_clearance` | a boss or lid column interferes with a part; the board cannot seat |
| `board_edge_clearance` | the mount is off the board entirely |
| `component_bounds_unknown` | never; it reports that a rule could not decide |

Which features can foul which parts falls out of the geometry: a floor boss
stands between the inside floor and the board underside, so it can only reach a
bottom-side part; a lid column runs from the board's top face to the lid, so it
can only reach a top-side one. A part is measured against the rectangle it
actually occupies, not the box that rectangle spans in board axes; for a long
thin part turned 90° the difference decides the answer.

`board_edge_clearance` measures against the **board outline**, not the cavity,
because it is about the board being supported. A boss running past the board edge
into the wall is fine and often deliberate; a board resting on half a boss is
not, because tightening the screw tips it instead of clamping it flat.

`component_bounds_unknown` exists because a missing height used to default to
zero: every part read as too short, and the check passed every board while
appearing to work. It now reports, and only where the height would have decided
the answer. See §6.5 for the measurement.

**Not checked: unsupported overhangs.** They need the composed solid and the
print orientation of each part, and a slicer already decides both.

---

## 12. Staging

**Stage 0 — done.** `lib/hardware/`, mount resolution and geometry in `lib/fdm/`,
`mounts` and `hardware` on the solver output, core reading
`<enclosure.screwboss>` from holes, MBOM asserted in tests against solver output.

**Stage 1 — modelprinter.** §5. Independently shippable: no `circuit-json`
change, no consumer change.

**Stage 2 — the records.** §3. Ship the schema before any producer so consumers
can adopt the class helper against a stable definition.

**Stage 3 — the safe `list()`.** §4.2. Ship before any producer emits an assembly
part, so it is provably a no-op.

**Stage 4 — renderer hygiene.** §6.3 A, B and C: fix 3d-viewer's frame join,
retire `isLegacyFdmEnclosure` in favour of the ftype, set `cad_component.size`.
**Must precede Stage 5**, or the first borrowed frame renders a screen as a
translucent enclosure.

**Stage 5 — core lowering.** §4.1 and §6.2. Each part gets its own
`source_component` and borrows the enclosure's `pcb_component_id`.

**Stage 6 — producers.** §8. The MBOM functions, plus the one-line exclusion in
the EBOM and PnP producers. First stage a user can see.

**Stage 7 — the `assembly.*` namespace.** §2.3. `assembly.device` already
exists as a transparent container and needs `designation`, `children` and its
record; `assembly.component` is new, including `cutoutApertureDirection` and the
placement offsets. Additive by construction, since §8.2 walks assembly nodes
rather than enclosures. Deliberately after the exporter, so the walk is proven
on one level before a second exists.

**Stage 8 — the modelprinter dispatch.** §6.3 D, per renderer, independently.

**Stage 9 — identity resolution.** §7.2, once §3.4 decides supplier names —
that decision also settles whether one engine or two (§14, question 1).

**Later.** Placement props for children of an enclosure (§14, question 7);
supplier adapters; imperial threads; standoffs and captive nuts;
`assembly.ribboncable` if named model parameters are wanted (§2.3); cable
connectivity.

### 12.1 CI gates

| Repo | Gates beyond `bun test` / `bunx tsc --noEmit` |
| --- | --- |
| `circuit-json` | `bun run lint:zod`, `bun run check-snake-case` |
| `props` | `bun run format:check` |
| `checks` | `bun run format:check`, npm build, dependency-check |
| `circuit-json-util` | `bun run format:check`, `bun-typecheck` |
| `core` | `bun-typecheck`, formatbot, dependency-check, `smoke-test-dist` |

This change spans `props`, `circuit-json`, `core`, `create-fdm-enclosure`,
`modelprinter`, `circuit-json-to-bom-csv`, `circuit-json-to-pnp-csv`,
`circuit-json-to-gltf` and `3d-viewer`. Build bottom-up;
`./tsc-dev rebuild --from circuit-json --dry-run` prints the chain.

---

## 13. The bill of process (designed, prototyped, unbuilt)

A device description is declarative; assembly is irreducibly imperative. The bill
of process resolves that by being a **projection of the declarative model**,
exactly as the BOM is — the same reason nobody stores "go right, then up, then
via" for a `<trace>`.

### 13.1 Declare joints, derive orderings

> **Only local facts are declared. Every global ordering is derived.** "Step 3:
> fit the lid" breaks the moment anything moves. "This screw joins these two
> parts along this axis" survives any rearrangement.

The joint is already fully determined by `ResolvedFdmMount`, which computes the
head seat, the boss span, the parts clamped and the axis. No new authoring and no
new solver input.

### 13.2 Two rules generate the plan

| Rule | Sweep | Produces |
| --- | --- | --- |
| **Access** | from the head seat outward, along the access axis | *ordering*. Anything solid the ray crosses must be installed later. |
| **Path** | from the head seat inward, to the end of the shank | *validity*. A part in the way that this fastener does not join, with no clearance hole, cannot be installed. |

Conflating them makes the validity half silently inert.

Over `core/tests/enclosure/enclosure-screw-boss-3d.test.tsx` the access rule
derives `EN1.H1.screw before place:lid` and the same for H2. Nobody wrote "the
lid goes on after the board is screwed down". The lid screws are correctly *not*
ordered against the lid, because their ray passes through the clearance hole
their own mount cut — a distinction that only appears if the test respects holes
rather than bounding boxes.

Topologically sorting, preferring to keep one tool in hand (measured on a
prototype fixture with more mounts than the test above):

```
place base | press 8 inserts | place PCBA | drive 4 board screws
           | place lid | drive 4 lid screws
reorientations: 0    tool changes: 5
```

The path rule has teeth, checked by removing one lid clearance hole:

```
✗ EN1.x_neg_y_neg: the screw cannot reach its boss -- it passes through the lid
  at (-23.3, -15.3) and there is no clearance hole there
```

A cycle in the precedence graph is the general statement of "this cannot be
assembled", but the specific defects fire earlier and name the part and the
coordinate. The cycle check is a backstop.

### 13.3 The artifact is a partial order

`getAssemblyPlan` returns the DAG, not a numbered list. The eight inserts are
mutually unordered; an assembler with two operators exploits that, and one with a
fixture that presses four at once exploits it differently.

| Objective | Computable | Note |
| --- | --- | --- |
| fewest reorientations | yes — distinct access axes | the expensive human operation; measured 0 above, and 1 when one screw was flipped to enter through the floor |
| fewest tool changes | yes — runs of equal tool | measured 5 |
| shortest time | no | needs per-operation time data |
| robustness to gravity | no | needs a fixturing model |

This is a solver and belongs with the others — `BaseSolver`, a
`GenericSolverDebugger` view of the precedence DAG — not a pass buried in the
enclosure builder.

### 13.4 Limits

The prototype used z-span proxies with their holes, which suits a stacked box;
arbitrary assemblies need swept-volume tests and the assembly-by-disassembly
formulation, though our directions are already quantized to six faces. Nothing
models gravity, fixturing or two-handed operations. Joints are derived from
mounts, so hand-declared parts would need joints declared alongside them.

The trigger to build it is the first consumer that needs an ordering: work
instructions, an assembly animation, or an operation-sequenced MBOM. The solver
already produces every input it requires.

---

## 14. Open questions

These were carried in the RFC while the design was moving. They are decisions
for whoever implements, not for whoever reviews the developer experience, so
they live here.

**1. Supplier names, and whether that forces a second engine.**
`supplier_part_numbers` is keyed by `supplier_name`, a closed enum of PCB
suppliers that cannot express McMaster-Carr or Fastenal (§3.4). Extending the
enum keeps one field with one meaning. Refusing to extend it is the strongest
argument for §7.2's Option B, since a hardware result would then need a
different return type. **Decide §3.4 before §7.2.**

**2. A part with neither identity is an error.** §8.3 rejects an
`<assembly.component>` carrying no `manufacturerPartNumber` and no
`designation`, because two unnamed parts are not evidence they are the same
part. That is right for a BOM and possibly harsh for a sketch — someone
blocking out an enclosure with four unnamed feet gets four errors. A warning
that degrades to per-piece rows is the alternative.

**3. Whether a designation should ever beat a part number.** Precedence says the
part number is more specific, which is what makes pinning one on a boss split it
correctly out of a commodity line (§7.1). The reverse case — an author who wants
"any conforming part" *despite* having recorded a part number for reference —
has no expression today. It may not need one.

**4. Overriding one of two derived pieces.** A boss makes a screw *and* an
insert, and `enclosureScrewBossProps` has a single `manufacturerPartNumber` that
cannot say which. Nested `screw={{ }}` / `insert={{ }}` objects, or flat
`screwManufacturerPartNumber` names, both work. Unresolved.

**5. A board reference on `<assembly.device>`.** It nests the board by TSX
position today, while `<enclosure.fdm.box>` uses a `boardRef` selector. Two
mechanisms for "which board" is one too many, but they are not equivalent: a
device may hold several boards, an enclosure references exactly one.

**6. Changing the default of `list()`.** §4.2 makes
`db.source_component.list()` return electrical parts only. It is provably a
no-op the day it ships, since no document contains an assembly part, but it is
still a silent behaviour change to an existing API, and `listAll()` is the only
signal a reader gets that the default is now narrow.

**7. Placement props for children of an enclosure.** Out of scope in the RFC and
the thing that unblocks rubber feet (§6.4). The frame exists; what is missing is
how an author says *where on the enclosure*. Whatever is chosen should read like
`<enclosure.screwboss>`'s relationship to its hole rather than like raw
coordinates.
