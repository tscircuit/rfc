# Proposal: Parametric Enclosures

## Summary

Author manufacturable enclosures alongside boards in tscircuit. An enclosure is
generated from rendered Circuit JSON, so board outline, mounting holes,
component bodies, connector apertures, and enclosure geometry remain one
coherent design.

The working `pcb-enclosure` reference implementation currently provides an
FDM-first, two-part split shell:

- a base and lid sized from one selected PCB;
- PCB mounting posts or external corner fastening ears;
- automatic connector openings from part-authored aperture metadata;
- visible, BoM-able screws and bushings;
- render-time and exhaustive assembly checks;
- serializable JSCAD plans rendered in the existing 3D viewer and exported as
  STL.

This RFC documents that implementation as the current baseline. Additional
construction methods and a child-element vocabulary remain future extensions,
not implemented API.

## Motivation

Almost every PCB is ultimately used inside an enclosure. Conventional enclosure
design repeats board geometry in a separate CAD system and becomes stale whenever
the PCB changes.

tscircuit already owns the physical facts needed to avoid that duplication:

- board outline, center, and thickness;
- mechanical mounting holes;
- component footprints, CAD bodies, side, height, and far-side projection;
- connector mating direction and insertion point;
- supplier and manufacturer part identity.

Generating the enclosure after board rendering makes changes propagate
automatically: move a connector and its opening follows; move or add a mounting
hole and its support follows; change a model body and enclosure clearance follows.

## Current component model

`<enclosure />` is an assembly-level intrinsic component and a sibling of
`<board />`:

```tsx
import "pcb-enclosure/register"

export default () => (
  <group>
    <board name="B1" width="50mm" height="36mm">
      <hole pcbX={-20} pcbY={-13} diameter="3.2mm" />
      <hole pcbX={20} pcbY={-13} diameter="3.2mm" />
      <hole pcbX={20} pcbY={13} diameter="3.2mm" />
      <hole pcbX={-20} pcbY={13} diameter="3.2mm" />
    </board>

    <enclosure name="EN1" boardRef=".B1" autoCutouts />
  </group>
)
```

It runs during `CadModelRender`, after the board exists in `root.db`. It selects
the requested board, extracts physical features, solves fastener placement,
builds geometry, runs analytic DRC, and emits enclosure and hardware
`cad_component`s.

The current element is deliberately small:

| Prop | Meaning |
| --- | --- |
| `boardRef` | Board selector, such as `.B1`. |
| `wallThickness` | Side-wall thickness. |
| `floorThickness` | Base floor thickness. |
| `lidThickness` | Lid top-plate thickness. |
| `boardClearance` | XY gap between PCB and inner wall. |
| `standoffHeight` | Gap from floor top to PCB bottom. |
| `topHeadroom` | Clearance above the tallest top-side component. |
| `lidLipDepth` | Depth of the friction-fit lid lip. |
| `anchor` | Mounting-hardware stack key or inline stack. |
| `autoCutouts` | Opt into connector opening detection. |

There is no released `<enclosurecutout>`, `<standoff>`, `<screwboss>`,
`<cardguide>`, `construction`, `enclosureSx`, or per-part manufacturing JSX API.
The pure geometry library has explicit-cutout operands, but the current intrinsic
does not expose child elements.

## Part-authored apertures

An opening is an intrinsic mechanical property of a concrete part, not of an
MPN lookup table owned by the enclosure package. Components therefore compose a
`<cutoutaperture>` child beside their footprint and CAD model:

```tsx
<connector>
  <cutoutaperture
    shape="rounded_rect"
    widthMm={9.2}
    heightMm={3.3}
    cornerRadiusMm={1.65}
    zCenterAboveBoardMm={1.65}
  />
</connector>
```

Core's child primitive lowers its parsed props into the parent as
`source_component.cutout_aperture`. Supported shapes are `rect`,
`rounded_rect`, `circle`, and `d_shape`, with optional diameter, corner radius,
flat offset, vertical center, and margin. Keeping this as an element allows part
profiles and caller overrides to be broken into ergonomic reusable TSX.

The reference implementation contains no aperture catalog. If metadata is
present, it defines the opening. Otherwise the enclosure uses a rectangular
body-bounds fallback.

Part definitions also own their footprint, insertion direction, CAD alignment,
and CAD size. Instance code only places the part with `pcbX`, `pcbY`, and
`pcbRotation`.

## Automatic cutout detection

Automatic detection is opt-in and currently considers edge-mount connector
ftypes. For each eligible component it:

1. resolves the global mating face from transformed footprint
   `insertion_direction`;
2. otherwise uses the inferred cable insertion point, then the nearest wall;
3. accepts top-entry components immediately;
4. for wall openings, checks whether the cable insertion point or nearest
   model/footprint body edge can reach the wall within the manufacturing rule;
5. sizes and positions the opening from `cutout_aperture`, or uses the rectangular
   fallback.

Explicit insertion direction is authoritative. Geometry inference is used only
when the part does not declare a direction.

`cadModel.size` survives on `cad_component.size`, allowing a connector body to
reach the wall even when its PCB pins and component center sit farther inboard.

## Mounting and hardware

Board-level, electrically unowned holes become PCB supports. The default
`m3-heat-set` stack derives:

- support boss dimensions;
- insert bore and melt relief;
- lid retention column;
- countersunk screw seat;
- screw and insert BoM entries.

The mounting hardware catalog is data-driven and accepts built-in keys, user
overrides, or inline stacks. Hardware dimensions and BoM identity are kept
together.

When PCB mounting holes do not cover a corner, the placement solver adds an
external fastening ear rather than placing a screw through the board cavity.

Purchased hardware is emitted as visible CAD with exploded-view offsets and
grouped BoM source components. Enclosure base and lid are also separate named,
exportable CAD parts.

## Geometry and outputs

The current construction is `split_shell`:

- a base tub containing the floor, walls, and PCB supports;
- a lid plate with a friction lip and retention features;
- cutouts routed to the wall, base, or lid that forms the selected face.

Feature recipes lower to either:

- serializable `jscad-planner` operation trees for Circuit JSON and the viewer;
- `@jscad/modeling` meshes for exhaustive checks and STL generation.

The implementation intentionally injects the geometry backend so the pure
analysis layer does not require the browser evaluator to load the full modeling
stack.

RunFrame can list enclosure parts under File → Export and download individual
binary STL files or a zip of all parts. The 3D viewer can independently show,
fade, hide, or explode enclosure parts and hardware.

## Assembly checks

Two complementary paths share the same extracted component-body boxes:

- render-time analytic checks detect component/PCB collisions with walls,
  columns, screw channels, bosses, and the lid lip, and report tight clearances;
- build-time mesh checks perform seated boolean intersections and swept board
  insertion checks.

Components with resolved openings may intentionally pass through their wall or
lid aperture without being reported as enclosure collisions.

Top- and bottom-mounted bodies, Z offsets, through-hole leads, clips, and other
far-side projections contribute to the correct cavity and standoff clearances.

## Distribution and compatibility

`pcb-enclosure` remains an optional package. Importing `pcb-enclosure/register`
registers the intrinsic through core's public catalogue extension API. Projects
without the package continue to work normally.

The coordinated upstream additions are all optional and general:

- `@tscircuit/props`: typed `<cutoutaperture>` child props;
- Circuit JSON: optional `source_component.cutout_aperture`;
- core: register/lower the aperture child and serialize `cadModel.size`;
- cable-insertion inference: honor explicit insertion direction;
- core catalogue export for third-party intrinsics;
- eval/runframe `.cjs` handling and embedded-worker correctness;
- viewer/runframe per-part appearance and enclosure export.

## Current reference example

The prefab-board gallery example exercises:

- five M3 PCB supports;
- two USB-C receptacles;
- Micro-USB, USB-A, DC barrel, 3.5 mm audio, and SMA connectors;
- concrete supplier footprints, silkscreen outlines, OBJ models, and embedded
  aperture metadata;
- seven automatically resolved openings on four side walls.

## Future work

- A typed enclosure child vocabulary for explicit cutouts and mounting features.
- Additional constructions such as sleeve-and-cap and card-guide enclosures.
- Per-part process/material/finish and manufacturing capability checks.
- STEP, DXF, bent sheet-metal, extrusion, and machining outputs.
- Vents, light pipes, button caps, hinges, and gasket grooves.
- Multi-board enclosure selection and board-placement constraints driven by
  enclosure requirements.
- Mechanical Circuit JSON ftypes or a first-class mechanical assembly model.

## Open questions

1. Should multi-board projects use one enclosure with multiple `boardRef`s or one
   mechanical assembly containing several enclosure components?
2. Should enclosure and purchased hardware continue to use synthetic
   source/PCB components, or should Circuit JSON gain first-class mechanical
   parts?
3. Which explicit enclosure feature should become the first child intrinsic
   without duplicating information already owned by part and board metadata?
