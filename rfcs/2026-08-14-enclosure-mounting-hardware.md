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
    <connector name="J1" footprint="fpc24" />
  </board>

  <assembly.screen name="SCREEN" connectsTo=".B1 .J1" width="2.3in" height="1.8in" />
</assembly.device>
```


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

Mounting hardware has to be *visible*, and specifically visible **inside** a
closed enclosure: the reason to draw a bolt is to see that it reaches its insert
and does not collide with the board.

### Where the geometry comes from

A parametric fastener part has no CAD file, so hardware is **generated from its
specification** rather than downloaded. It follows the split the codebase
already uses for footprints:

| Layer | Owns | Hardware |
|---|---|---|
| `footprinter` / `modelprinter` | string → validated params. No family dimensions. | new `screw` / `insert` / `spacer` model families |
| `jscad-electronics` | "the specific model family parameters" + geometry | new `jscad-assembly-hardware` |

So `modelprinter` learns the grammar, and a new `jscad-assembly-hardware`
package owns the dimension tables (thread, head, insert series) and turns them
into solids. This mirrors `flexscreen`, whose schema lives in `modelprinter`
while `DEFAULT_DIAGONAL` and the mesh live in `jscad-electronics`.

```
screw_m3_l8_buttonhead       heatsetinsert_m3_l4      bolt_m3_l10_socketcap
```

Threads and drive recess are not modelled, only basic shapes of the screw/bolt
body and head are needed at this time. Drive type can be selected by the assembler,
but head shape is required for fitting the enclosure recess, if any (button head,
pan head, flat head, countersunk, socket cap, hex flange, etc)

### How a piece reaches Circuit JSON

The enclosure solver already resolves each mount into pieces carrying a
position and a hardware string.

Each piece is rendered as a `cad_component`, which needs both a
`source_component_id` and a `pcb_component_id` — both required. **The fastener
carries them, not the hole.** A screw or bolt is a real part with a designation
and an MPN, so a `source_component` is what it already deserves for the BOM, and
one element then supplies both ids.

The fastener gets a zero-size `pcb_component` centred on its hole, suppressed
from placement and DRC — the pattern `enclosure.fdm.box` already uses:

```ts
pcb_component.insert({ center: holePosition, width: 0, height: 0,
  source_component_id, obstructs_within_bounds: false,
  do_not_place: true, is_allowed_to_be_off_board: true })
```

The hole cannot supply this itself: `pcb_component.source_component_id` is
required, so giving a hole a `pcb_component` would also make it a
`source_component` — a board feature promoted to a BOM line. A board-level
`<hole />` emits `pcb_component_id: null` today.

This is additive: `<assembly.screw />` currently emits no Circuit JSON at all,
and no schema change is needed. It is also **interim** — the right long-term
record is the `assembly_component` the solver's types already anticipate, which
would carry the piece, its designation and its BOM grouping without borrowing a
board component's frame.

### Section views

- `gltf-slice` cuts the glTF on a plane and closes each cut surface with a
  hatched cap, giving a conventional section view.
- `showHiddenEdges` (already carried from `cad_component` into the renderer)
  draws occluded edges.

A section through the mount axis is the view that answers the question the
hardware exists to raise: engagement, clearance, and whether the bolt bottoms
out.

## New Elements

- `<enclosure.fdm.heatsetinsert />`
- `<assembly.screen />`
- `<assembly.bolt />`
- `<assembly.screw />`
- `<assembly.cable />`

## New Properties

- `<assembly.device />`: `cadModel="..."`, allows specifying the cadModel for a
  device that is not a board
- - `cadModel` can be a footprinter or modelprinter string (e.g. `flexscreen`)

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
