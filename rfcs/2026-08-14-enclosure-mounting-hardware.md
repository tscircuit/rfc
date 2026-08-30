# Enclosure Mounting Hardware, Assembly Extensions

## Motivation

We want to be able to specify how an enclosure and a PCB fit together, this requires introducing additional
hardware such as heat set inserts, which are fastened with bolts, and screws, which are self-tapping.


## Securing the PCB

### Heat set insert and bolt

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm">
      <enclosure.fdm.heatsetinsert thread="m3" />
    </hole>
  </board>
  <assembly.bolt thread="m3" length="10mm" holeRef=".B1 .H1" fastensLid />
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

Alternative accepted syntax:


```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm" />
  </board>
  <enclosure.fdm.heatsetinsert thread="m3" holeRef=".B1 .H1" />
  <assembly.bolt thread="m3" length="10mm" holeRef=".B1 .H1" fastensLid />
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

### Self-tapping/thread-forming screw

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm">
      <assembly.screw thread="m2.5"/>
    </hole>
  </board>
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

Alternative accepted syntax:

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm" />
  </board>
  <assembly.screw thread="m2.5" holeRef=".B1 .H1" />
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

## `<assembly.screen />` usage

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <connector name="J1" footprint="fpc24" pcbRotation={180} />
  </board>

  <assembly.screen
    name="SCREEN"
    connectsTo=".B1 .J1"
    width="2.3in"
    height="1.8in"
  />
</assembly.device>
```

The dimensions may instead come from an explicit modelprinter model:

```tsx
<assembly.screen
  name="SCREEN"
  connectsTo=".B1 .J1"
  cadModel="flexscreen_w58.42mm_h45.72mm_flex28mm"
/>
```

### Screen properties

| Property | Type | Required | Meaning |
|---|---|---|---|
| `name` | `string` | yes | Assembly identity and the standard name selector, for example `.SCREEN`. |
| `connectsTo` | `string` | yes | Exactly one selector resolving to the PCB connector that receives the screen's flex cable. |
| `width` | distance | conditional | Outer screen-body width, including the bezel and excluding the flex cable. Must be greater than zero and supplied together with `height`. |
| `height` | distance | conditional | Outer screen-body height, including the bezel and excluding the flex cable. Must be greater than zero and supplied together with `width`. |
| `cadModel` | `string` | conditional | An explicit modelprinter model string. It is required when `width` and `height` are omitted and replaces the derived `flexscreen` string. |

The screen must have at least one complete sizing source: either the
`width`/`height` pair or `cadModel`. Supplying `cadModel` together with the
complete dimension pair is also accepted for compatibility and for retaining
nominal assembly dimensions. A single `width` or `height` is always an error,
including when `cadModel` is present, and omitting all three properties is an
error.

Unlike `<assembly.cable />`, a screen has one connector endpoint. An array is
not accepted for `connectsTo`, and resolving zero or more than one component is
an authoring error. Resolution starts at the nearest containing
`<assembly.device />` and crosses nested assembly-device and board/subcircuit
boundaries. The selected element must produce a `pcb_component`; normally it is
a `<connector />`.

`assembly.screen` is an assembly-device subtype in the authoring tree. Code
that tests whether a node is an assembly device must therefore include screens,
and nested-device traversal must descend through one. `.SCREEN` is the
canonical selector for the screen above. The namespaced JSX spelling
`assembly.screen` is not itself a CSS selector (in CSS it would mean an
`assembly` element with class `screen`); a durable Circuit JSON type selector is
deferred with the durable assembly schema described below.

### Screen CAD model

When `cadModel` is absent, Core normalizes the required `width`/`height` pair to
millimetres and derives this modelprinter string:

```text
flexscreen_w<width-mm>mm_h<height-mm>mm
```

For example, `width="2.3in" height="1.8in"` becomes
`flexscreen_w58.42mm_h45.72mm`. The serialization must be stable, must not keep
the source units, and must not add insignificant trailing zeroes. The string is
stored in `cad_component.footprinter_string`; despite that field's legacy name,
renderers inspect the model family and route `flexscreen` through
`modelprinter`.

An explicit `cadModel` is an escape hatch and is copied verbatim instead of the
derived string. This permits the modelprinter string to supply the body
dimensions as well as modifiers such as flex length, folding, conductor count,
and offsets without growing the first `assembly.screen` props surface.

When both `cadModel` and `width`/`height` are supplied, `cadModel` is
authoritative for rendered geometry; the separate dimensions do not resize or
rewrite it. During the compatibility stage Core does not try to prove that an
explicit model string has matching dimensions. Consumers that need dimensions
when the pair is omitted must obtain them from the parsed/generated model.

### Connector-relative placement

The flexscreen model's local origin is the connector-end board datum, its cable
leaves along local `+Y`, and local `+Z` points out of the board face. Core places
that origin only after the target connector's footprint has loaded and its PCB
layout, layer transform, anchor alignment, and rotation are final. Pre-layout
JSX coordinates must not be used.

The placement rules are:

1. XY is the target `pcb_component.cable_insertion_center`, falling back to the
   target `pcb_component.center` only when no insertion center is available.
2. Z is the surface of the target connector's owning board: `+thickness / 2`
   for a top-layer connector and `-thickness / 2` for a bottom-layer connector.
   The owning board is used even when the assembly contains multiple boards.
3. Local `+Z` is transformed to the outward normal of that board face. Thus a
   bottom-layer screen is below the board rather than being left above it.
4. Local cable `+Y` is aligned to the connector's final cable insertion axis.
   Prefer the continuous footprint insertion vector after the connector's final
   rotation and layer mirroring; the quantized
   `pcb_component.insertion_direction` alone is insufficient for arbitrary
   angles. If the footprint supplies no such vector, use the direction from the
   component center to `cable_insertion_center`, then fall back to the
   connector's final PCB rotation.

Consequently, rotating, packing, or moving the connector moves the screen, and
flipping it to the bottom layer flips the complete screen/flex assembly. Core
must write `model_origin_position: { x: 0, y: 0, z: 0 }` on the compatibility
`cad_component`; otherwise a renderer may infer a bounding-box center and
detach the flex origin from the connector.


## `<assembly.cable />` usage

Assembly cables can be inferred from `assembly.screen` or other elements.

```tsx
<assembly.device>
  <board name="B1">
    {/* ... */}
    <connector name="J1" standard="rj45" />
  </board>
  <assembly.cable connectsTo=".B1 .J1" length="200mm" color="black"  />
</assembly.device>
```

- `connectsTo` can be an array with at most two selectors
- Cable models can be inferred from connectors or specified

## Rendering the enclosure mounting hardware

Hardware must be visible **inside** a closed enclosure — the reason to draw a
bolt is to see it reach its insert and clear the board.

### Where the geometry comes from

A parametric fastener has no CAD file, so it is **generated from its
specification**, following the split already used for footprints:

| Layer | Owns | Hardware |
|---|---|---|
| `footprinter` / `modelprinter` | string → validated params. No family dimensions. | new `screw` / `insert` / `spacer` model families |
| `jscad-electronics` | model family parameters + geometry | new `jscad-assembly-hardware` |

`modelprinter` learns the grammar; `jscad-assembly-hardware` owns the dimension
tables (thread, head, insert series) and the solids. Same split as `flexscreen`:
schema in `modelprinter`, `DEFAULT_DIAGONAL` and the mesh in `jscad-electronics`.

```
screw_m3_l8_buttonhead       heatsetinsert_m3_l4      bolt_m3_l10_socketcap
```

Threads and drive recess are not modelled, only basic shapes of the screw/bolt
body and head are needed at this time. Drive type can be selected by the assembler,
but head shape is required for fitting the enclosure recess, if any (button head,
pan head, flat head, countersunk, socket cap, hex flange, etc).

### How mounting hardware reaches Circuit JSON

A mount resolves into one *piece* per part: a screw alone, or an heat set insert
**and** a bolt. **Each piece** is a BOM line and gets its own `source_component`,
zero-size `pcb_component` and `cad_component` — same XY (the mount axis), different Z.
These pcb_components are suppressed from placement and DRC, as `enclosure.fdm.box`
already does.

### Assembly screen Circuit JSON compatibility stage

The initial `assembly.screen` rollout does not require a new Circuit JSON
element. Each screen emits the same compatibility ownership chain used by
generated enclosure parts:

- one `source_component` with the screen's name (temporarily represented as a
  `simple_chip`) so the screen is addressable and is one BOM line;
- one zero-size `pcb_component`, linked to that source component, with
  `do_not_place: true`, `obstructs_within_bounds: false`, and
  `is_allowed_to_be_off_board: true`; and
- one `cad_component`, linked to both compatibility owners, with the placement
  above, `model_unit_to_mm_scale_factor: 1`, explicit zero model origin, and the
  derived or authored model string in `footprinter_string`.

The `simple_chip` ftype is only a compatibility carrier; it does not make a
screen an electrical chip. The synthetic PCB component does not participate in
placement or clearance checks and is updated from the connector's final PCB
transform before CAD is emitted.

A later Circuit JSON migration may add `source_assembly_device`, an explicit
screen/device kind, parent assembly IDs, and durable selector/BOM scope. That
migration is deliberately deferred: consumers must not infer assembly nesting
from the temporary source/PCB/CAD IDs, and Core's authoring-tree relationship
remains the source of truth until the durable records exist.

### Section views

- `gltf-slice` cuts the glTF on a plane and closes each cut surface with a
  hatched cap, giving a conventional section view.
- `showHiddenEdges` (already carried from `cad_component` into the renderer)
  draws occluded edges.

## New Elements

- `<enclosure.fdm.heatsetinsert />`
- `<assembly.screen />`
- `<assembly.bolt />`
- `<assembly.screw />`
- `<assembly.cable />`

## New Properties

- `<assembly.device />`: `cadModel="..."`, allows specifying the cadModel for a
  device that is not a board
  - `cadModel` can be a footprinter or modelprinter string (e.g. `flexscreen`)
- `<assembly.screen />`: required `name`, single-selector `connectsTo`, and
  either a positive `width`/`height` pair or a non-empty `cadModel` modelprinter
  string; the complete pair may also accompany `cadModel`

## Changes to `assembly.device`

- `<assembly.device />` can have nested `<assembly.device />`
- `assembly.screen` is a subset of an `assembly.device` (for e.g. selector
   purposes)

## Bill of Materials Changes

- Bill of Materials can be generated for a specific device or board. When
  generating a bill of materials a selector can often be provided to limit
  the BOM to only those elements
- Limiting the BOM to a single board is often desirable for placing JLCPCB
  orders. When applicable, the UI should ask the user for a full BOM or to
  select from appropriate selectors (e.g. BOM for a specific device or BOM for
  a particular board, BOM for a panel etc.)
