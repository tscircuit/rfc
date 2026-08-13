# Proposal: Parametric Enclosures

## Motivation

Almost every PCB is ultimately used inside an enclosure. Conventional enclosure
design repeats board geometry in a separate CAD system and becomes stale whenever
the PCB changes.

tscircuit already owns many of the physical facts needed to avoid that
duplication:

- board outline, center, and thickness;
- mechanical mounting holes;
- component footprints, CAD bodies, side, height, and far-side projection;
- connector mating direction and insertion point; and
- supplier and manufacturer part identity.

Generating the enclosure after board rendering makes changes propagate
automatically. Moving a connector moves its opening; moving or adding a mounting
hole moves or adds its support; changing a component body updates enclosure
clearance checks.

Circuit JSON is the authoritative rendered board and CAD output. Core renders the
electrical board and, in a later render phase, the enclosure declared alongside
it, appending generated CAD records to the same document. Product designers need
not reproduce board dimensions in a second design system.

## Status

The authoring props, staged two-part solver, compatibility Core integration and
3D-viewer appearance control are working and tested. Core currently emits one
ordinary `cad_component` for each base/lid plan, sharing a synthetic PCB owner.
The durable typed Circuit JSON path remains deliberately deferred; its draft
schemas and renderers are architectural follow-ups, not released behavior.
Manufacturing design rules are next. Mounting hardware and broader physical
assembly semantics are intentionally left to a separate RFC.

| Area | State |
| --- | --- |
| `assembly.device`, `enclosure.fdm.box`, `enclosure.cutoutaperture` | implemented with a compatibility assembly container |
| Typed Circuit JSON records (`source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure`) | proposed in circuit-json #649; deferred |
| Component-relative aperture axes and resolved intersections on all six faces | implemented; pending Core #3152 |
| Separate insertion and aperture directions (`cutoutApertureDirection`) | Props released; Core consumption pending #3152 |
| Aperture depth, and its derivation from a part's measured body | implemented |
| Separate CAD record for each base/lid plan | implemented with ordinary `cad_component`; typed `enclosure_part` deferred |
| 3D-viewer rendering and enclosure-wide appearance control | implemented through compatibility detection |
| Typed rendering through `circuit-json-to-gltf` and per-part appearance controls | deferred with the typed records |
| Non-connector part-family inference beyond exact placement | not started |
| Enclosure and assembly DRC | not started |
| STEP / 3MF / DXF outputs for enclosures | not started |
| Non-FDM manufacturing processes | not started |

### Where enclosures plug into tscircuit

tscircuit's existing layers each own one thing, and enclosures use them as they
are:

| Layer | Owns | Enclosure additions |
| --- | --- | --- |
| `@tscircuit/props` | React-independent Zod prop schemas | `assemblyProps.device`, `enclosureProps.fdm.box`, `enclosureProps.cutoutaperture` |
| `circuit-json` | the interchange records everything else reads and writes | proposed durable records: `source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure` (deferred) |
| `core` | the renderer tree: `Renderable` components and their ordered render phases | `AssemblyDevice`, `EnclosureFdmBox`, `EnclosureCutoutAperture` host elements; compatibility CAD emission now and typed records later |
| `@tscircuit/create-fdm-enclosure` | geometry: a pure solver over plain data | the enclosure problem, its resolution, and the JSCAD plans |

An enclosure is generated from the **rendered** board — component bodies,
insertion directions, measured CAD bounds, resolved placements — so the elements
belong in core's render phases, where those facts exist and are ordered. The
compatibility implementation resolves the enclosure only after the relevant CAD
components exist, because an aperture must be able to read the body behind it.
The solver stays outside core for modularity and to support different
manufacturing process outputs based on the same aperture geometry.

## Summary

Enclosure authoring has two complementary root concepts:

1. **Enclosure specification** — assembly-level TSX adjacent to the board TSX.
   It selects the board, construction, manufacturing process, dimensions,
   mounting strategy, design rules, and DRC behavior.
2. **Cutout aperture specification** — part-level TSX beside a part's footprint
   and CAD model. It explicitly declares the size and shape of an enclosure
   opening required to use that part.

The enclosure and PCB are grouped under the current `assembly.device`
compatibility container. Broader product grouping, fasteners, and assembly
processes are outside this RFC.

```tsx
import { assembly, enclosure } from "tscircuit"

export const UsbC = (props) => (
  <connector {...props}>
    <enclosure.cutoutaperture
      shape="pill"
      width="9.2mm"
      height="3.3mm"
    />
  </connector>
)

export default () => (
  <assembly.device name="controller">
    <board name="B1" width="50mm" height="36mm">
      <UsbC name="J1" pcbX="22mm" pcbY="0mm" />
    </board>

    <enclosure.fdm.box boardRef=".B1" />
  </assembly.device>
)
```

The enclosure specification answers **how the product is enclosed**. The
cutout-aperture specification answers **what opening a particular part
requires**. Aperture placement combines explicit part metadata with
part-specific inference.

### Package layering

Development of all four concerns — assembly, enclosure, apertures, and the
FDM process — starts inside `@tscircuit/create-fdm-enclosure`. Inside it,
the generic layers are kept strictly separate from the process-specific one:

| Directory | Scope | May import |
| --- | --- | --- |
| `lib/assembly/` | assembly-generic: the board/standoff/seam frame every process shares | nothing below it |
| `lib/enclosure/` | enclosure-generic: faces, component-body envelopes, resolved placements | `lib/assembly/` |
| `lib/apertures/` | aperture input validation, dimensions, layout, reference datum | `lib/enclosure/`, `lib/assembly/` |
| `lib/fdm/` | FDM-specific: shells, lips, cutout plans, design rules | all of the above |

The dependency direction is enforced by the modules themselves, not by
convention: `resolve-enclosure-assembly-frame.ts` states that it must not import
from `lib/enclosure/` or `lib/fdm/`, because the assembly frame is what a
sheet-metal or CNC enclosure would also resolve.

Keeping the boundary now means breaking `@tscircuit/assembly` and a generic
enclosure package out later is a move, not a rewrite. Whether that split is worth
making is deferred until a second process exists to justify it.

## Enclosure Specification

The enclosure specification is assembly-level TSX associated with a board by
selector. It owns construction, manufacturing, supports, retention, process
rules, and output selection.

### Authoring model and board relationship

`@tscircuit/props` currently exports React-independent Zod schemas and TypeScript
types at:

```ts
assemblyProps.device
enclosureProps.fdm.box
enclosureProps.cutoutaperture
```

Those values validate props; they are not renderable React components. The
renderable lowercase `assembly` and `enclosure` namespaces are exported by
`tscircuit` (and by `@tscircuit/core` at the lower-level package boundary). The
host elements they resolve to are registered in core; the geometry-only
`@tscircuit/create-fdm-enclosure` package exports the solver, not React elements.

`<assembly.device>` is the product-level root. It gives the physical product an
identity and contains the board, enclosure, and later assembly occurrences,
emitting only `source_assembly_device` — no schematic, PCB, or subcircuit record,
and no electrical group, transform, or layout semantics.

`<enclosure.fdm.box />` is a sibling of `<board />` inside that wrapper and
selects its board through the required `boardRef`. It is not owned by or nested
inside the board.

```tsx
import { assembly, enclosure } from "tscircuit"

export default () => (
  <assembly.device name="controller">
    <board name="B1" width="50mm" height="36mm">
      <hole pcbX={-20} pcbY={-13} diameter="3.2mm" />
      <hole pcbX={20} pcbY={-13} diameter="3.2mm" />
      <hole pcbX={20} pcbY={13} diameter="3.2mm" />
      <hole pcbX={-20} pcbY={13} diameter="3.2mm" />
    </board>

    <enclosure.fdm.box
      name="EN1"
      boardRef=".B1"
      wallThickness="2mm"
    />
  </assembly.device>
)
```

The explicit board selector leaves room for future multi-board assemblies.

The upstream `enclosure.fdm.box` props currently provide `boardRef`, optional
outer `width`, `height`, and `depth`, and `wallThickness`. The reference
implementation additionally exercises:

| Prop | Meaning |
| --- | --- |
| `floorThickness` | Base floor thickness. |
| `lidThickness` | Lid top-plate thickness. |
| `boardClearance` | XY gap from PCB edge to the inner wall. |
| `standoffHeight` | Gap from floor top to PCB bottom, where the board is supported by standoffs. |
| `topHeadroom` | Empty distance from the PCB top surface to the lid interior. Omitted, aperture-owning parts may grow the box; arbitrary tall parts are not inferred. |
| `lidLipDepth` | Depth of the friction-fit lid lip. |
| `disableCutouts` | Disable placement of apertures declared by parts. |

### Enclosure manufacturing processes and design rules

`enclosure.fdm.box` identifies the initial supported manufacturing/construction
combination: an FDM-produced box. The dotted namespace may grow to represent
other constructions and processes, but no universal taxonomy is committed yet.
A clamshell, sleeve, modified prefab enclosure, bent sheet-metal enclosure, and
machined enclosure may require different parts, assembly motion, props, and DRC,
so can be implemented as peer namespace/packages.

Each concrete namespace leaf selects a coherent design-rule profile. Rules must
remain injectable and testable rather than scattered through geometry code.
Examples include:

- FDM wall thickness, clearance, overhang, bridge, and insert rules;
- CNC tool diameter, internal corner radius, stock, and workholding rules;
- laser kerf, sheet thickness, bend allowance, and minimum-web rules; and
- modified-prefab stock dimensions and permitted modification operations.

Construction logic and process rules are related but distinct. Assembly behavior
defines seams, retention, mounting, and insertion motion. Manufacturing rules
constrain whether that assembly can be produced using the selected process.
Different public components may share internal solvers.

## Cutout Aperture Specification

An enclosure opening is an inherent, part-owned mechanical requirement. A part
that requires an opening declares an `<enclosure.cutoutaperture>` beside its
footprint and CAD model.

**Status: implemented**, including component-relative aperture axes and
position-dependent enclosure-face intersection.

### Faces

A face is named by the axis its outward normal points along:

| Face | Normal | Formerly |
| --- | --- | --- |
| `x_pos` | +X | `right` |
| `x_neg` | −X | `left` |
| `y_pos` | +Y | `front` |
| `y_neg` | −Y | `back` |
| `z_pos` | +Z, the lid's outward face | `top` |
| `z_neg` | −Z, the floor's outward face | `bottom` |

Cartesian names replaced the compass names for two reasons, both of which had
already caused defects. `front`/`back` named **opposite axes** in different
renderers and are retired ecosystem-wide. And `top` was overloaded three ways at
once: as an `EnclosureFace` it meant **+Z**, as an insertion direction
(`from_top`) it means **+Y**, and as a PCB layer it means the +Z *side*. Naming
the axis outright removes both ambiguities and matches the published
`InsertionDirectionCartesian` spelling (`from_x_pos`, …), which uses `_pos`/`_neg`
because Circuit JSON enum values must be snake_case. Note that "top" and "bottom"
still refer to the +Y/-Y direction with respect to the 2D orientation of the PCB,
as well as the "top" and "bottom" PCB layer, so the terminology is not completely
distinct.

Core's `BoardWall` uses the same six cartesian names, so converting a board wall
to an enclosure face is an identity rather than a lookup table. That is the point:
core once swapped the +Y and −Y walls in that conversion to compensate for
renderer behavior, but it didn't match the other renderer behavior, causing confusion.

`boardSide` is deliberately **not** renamed. It names the PCB layer a part is
mounted on — a side, not a direction — so it stays `"top"`/`"bottom"`.

> **Migrating old names is by axis, never by word.** The retired proposal was
> itself the cautionary example: its table defined `front` as −Y while the
> shipped `faces.ts` defined `front` as +Y. Convert each occurrence from the axis
> it denotes *in its own source*. Note especially that old `top`/`bottom` were the
> **Z** faces: reading `top` as +Y moves a lid aperture onto a side wall, and the
> geometry still resolves, so nothing throws.

### Aperture projection is component-relative; its intersection is face-relative

An aperture does not begin in the frame of an enclosure face. It begins with the
part: `cutoutApertureDirection` (or the `insertionDirection` fallback) defines
the aperture's primary axis in the footprint's local frame. Core applies the
same rotation and layer transform used by the footprint geometry, producing a
continuous unit direction in board space. In board XY the axis passes through
`pcb_component.center`, so it remains on the same line as the component rotates.
For a side opening, its Z datum is the center of the model's measured
above-board extent; that complete three-dimensional datum is defined below.

The named direction emitted on `pcb_component` is the Cartesian quantization of
that same vector. It is useful as an initial face and an exact-corner tie-breaker,
but it is not precise enough to orient or place an oblique opening. In
particular, changing from 44 to 46 degrees must not move the aperture to the
other side of its component merely because the nearest named axis changed at 45
degrees.

The aperture profile is authored in a tool-local frame:

- local **Z** is `depth`, along the transformed component-relative aperture axis;
- on a side opening, local **Y** is `height` along board Z and local **X** is
  `width`, perpendicular to the aperture axis in the board plane; and
- on a lid or floor opening, local **X**/local **Y** are `width`/`height` in the
  footprint plane and rotate with the component.

A circular aperture uses `radius` in place of width and height. When the primary
axis is square to a face, this reduces to the familiar Cartesian table:

| Resolved face | `width` when square | `height` | `depth` when square |
| --- | --- | --- | --- |
| `x_pos`, `x_neg` | Y | Z | X |
| `y_pos`, `y_neg` | X | Z | Y |
| `z_pos`, `z_neg` | transformed footprint X | transformed footprint Y | Z |

The enclosure solver casts the transformed axis from the part datum described
below and selects the first enclosure wall that ray intersects. The physical face
transition therefore occurs where the axis crosses a box corner, which depends
on both component position and rotation; it does not necessarily occur at 45
degrees. The resolved face supplies the material plane and thickness, not the
aperture's original orientation.

The cutting tool is then aligned with the component axis. An oblique cylinder
naturally produces an elliptical wall intersection rather than an enlarged
axis-aligned circle. Its axial span grows by the wall-traversal and finite-profile
corner terms needed to clear both surfaces, while the authored `depth` remains
unchanged along the component axis. Thus the part-relative aperture geometry is
stable and only its projection through the enclosure changes with placement.

### Explicit aperture geometry

```tsx
<connector>
  <enclosure.cutoutaperture
    shape="pill"
    width="9.2mm"
    height="3.3mm"
    margin="0.2mm"
  />
</connector>
```

| Shape | Required geometry |
| --- | --- |
| `pill` | `width`, `height` |
| `rect` | `width`, `height` |
| `circle` | `radius` |

Every branch may carry `margin` (extra clearance on every edge),
`widthDimensionOffset`/`heightDimensionOffset` (below), and `depth` (below).
Numbers use the project default unit; explicit distance strings such as
`"3.66mm"` and `"0.1in"` may be mixed.

### Which face an opening pierces

The face is not authored on the aperture. A direction declared on the part's
`<footprint />` defines a continuous component-relative axis, transformed for
the component's rotation and mounting layer. For a side opening, the resolved
face is the first enclosure wall intersected by that axis from the part's datum:
the component center in board XY and the center of the model's measured
above-board extent in Z. Rotating or moving a part therefore carries both the
axis and its wall intersection with it.

Two directions exist because only connectors support insertionDirection.

| Footprint prop | Names |
| --- | --- |
| `insertionDirection` | the side a cable or mating part attaches from |
| `cutoutApertureDirection` | the side the part's enclosure opening faces |

In precedence order: `cutoutApertureDirection`, else `insertionDirection`, else
the nearest reachable board edge.

Most parts need only the first fallback: a cable arrives through the opening it
needs, so the two directions coincide for every connector. For other elements
such as switches or displays which do not have an insertion, insertionDirection
would have been incorrect and confusing, so cutoutApertureDirection was added.

Both share one vocabulary, one footprint-local frame, and one transform. They
are properties of the part, authored in its unrotated frame. Core retains the
continuous transformed aperture vector internally for physical placement. The
compatibility representation continues emitting only the existing
`pcb_component.insertion_direction`; a durable
`pcb_component.cutout_aperture_direction` remains deferred with the typed
Circuit JSON work. Deriving the physical vector from the same transform as the
footprint geometry prevents face selection and tool orientation from drifting
apart on a rotated or bottom-mounted part.

`from_above` and `from_below` resolve to the lid and the floor rather than a
wall; a layer flip is a 180-degree rotation about the board's Y axis, so a part
authored `from_above` reports `from_below` once mounted on the bottom layer, and
its opening moves from the lid to the floor without anything being re-declared.

### Aperture datum, offsets, and wall intersection

The unoffset datum for a side aperture is the **above-board center of the
model**:

- in board XY, `pcb_component.center`, the stable point the component rotates
  around; and
- in Z, halfway through the model's measured extent above its mounting surface.

This is why Core needs the CAD model extents. `modelBounds`,
`modelOriginPosition`, the model's board-normal direction, and its emitted Z
position reveal how much of the model is actually above the board. A size alone
cannot place the body relative to the mounting surface and may include pins or a
shell below the board. If measured bounds are unavailable, the fallback puts
the aperture half its own height above the mounting surface so its lower edge
rests on the board.

For a directed side aperture, Core supplies that datum in board-centred
coordinates plus the continuous board-space direction. The enclosure layer
casts the ray from it and uses the point where it first intersects a wall as the
zero-offset opening center. It must not use `cable_insertion_center`: that point
is inferred from a quantized side of an axis-aligned bounding box and moves
discontinuously when the named direction changes near a corner.

`widthDimensionOffset` and `heightDimensionOffset` are signed corrections from
that zero-offset center, not offsets from the board origin or enclosure center:

- on a side wall, `widthDimensionOffset` moves along the wall in the aperture's
  width direction, while `heightDimensionOffset` moves along board Z, outward
  from the part's mounting surface; and
- on the lid or floor, the unoffset XY datum is the component position and both
  offsets rotate in-plane with the aperture profile.

For example, these measured bounds place the model from the board surface to
6 mm above it, so the unoffset opening center is 3 mm above the board.
`heightDimensionOffset="-1mm"` lowers that center to 2 mm, while
`widthDimensionOffset="2mm"` moves it 2 mm along the wall:

```tsx
<connector
  footprint={<footprint cutoutApertureDirection="from_top" />}
  cadModel={{
    size: { x: 8, y: 4, z: 6 },
    modelOriginPosition: { x: 0, y: 0, z: -3 },
    modelBounds: {
      min: { x: -4, y: -2, z: -3 },
      max: { x: 4, y: 2, z: 3 },
    },
  }}
>
  <enclosure.cutoutaperture
    shape="rect"
    width="6mm"
    height="3mm"
    widthDimensionOffset="2mm"
    heightDimensionOffset="-1mm"
  />
</connector>
```

Without an authored direction there is no physical ray to cast. The
nearest-board-edge fallback supplies a face and interaction point, and the
opening is projected square to that face. Zero offsets preserve the datum above,
which is the expected default for a centred connector or actuator.

### Depth: the third aperture dimension

`depth` is the opening's size along the component-relative aperture axis — how
far the cutting tool continues inboard in the direction the part occupies. It is
not increased merely because the tool meets a wall obliquely. Wall thickness and
the extra span required to clear both surfaces are construction geometry added
around it; the authored front-to-back requirement remains unchanged along the
tool axis.

When `depth` is not authored, the current fallback measures the extents of
`componentBody`: the part's authored body `size` in its own frame, the `rotation`
it is placed at, the board-frame `footprint` it occupies, and
`aboveBoardHeight`, how far it reaches above the board. The enclosure package
projects that envelope against the resolved face to derive enough inward
clearance for structures such as the lid lip. This remains a scalar clearance
fallback, not full subtraction of the component body; full body-envelope
clearance is deferred below.

### Reusable defaults and caller replacement

`enclosure.cutoutaperture` is an ordinary imported namespaced React element, not a
global JSX intrinsic. A reusable part wrapper may provide a default child and
allow the circuit author instantiating that wrapper to replace it:

```tsx
export const UsbC = ({ children, ...props }) => (
  <connector {...props}>
    {children ?? (
      <enclosure.cutoutaperture shape="pill" width="9.2mm" height="3.3mm" />
    )}
  </connector>
)

<UsbC name="J1">
  <enclosure.cutoutaperture
    shape="pill"
    width="10mm"
    height="3.6mm"
    margin="0.4mm"
  />
</UsbC>
```

This is ordinary React composition. The resulting structure remains
XML-compatible: a part supplies one complete default child, and the caller may
supply another complete child without callback or render-function props.

### Circuit JSON impact

The durable records in this section describe the target interchange contract;
they are still deferred. The shipped compatibility path intentionally uses
existing `cad_component` records instead.

`source_cutout_aperture` carries the placement vocabulary directly:
`width_dimension_offset`, `height_dimension_offset`, `margin`, `depth`, and the
shape branch (`rect`/`pill` with `width`/`height`, `circle` with `radius`). The
aperture-local meaning of every dimension is documented on the record itself,
since it is a semantic definition rather than a detail of one solver.

`z_extent_above_board`/`centerZ` is **not** part of the contract. It was replaced
before release rather than deprecated after. These design decisions are a matter
of taste and feedback is expected here.

The proposed `cad_fdm_enclosure` carries `enclosure_part` (`"base" | "lid"`,
extensible to additional enclosure parts), one record per printed part rather than
one per enclosure. Parts are made and assembled separately, and a durable role
will eventually let a viewer hide the lid without losing the base.

Until that record lands, Core emits separate base and lid `cad_component`
records sharing one synthetic owner. The 3D viewer recognizes the owner and
provides one enclosure-wide runtime setting that affects both parts together.
Independent base/lid controls remain deferred with `enclosure_part`.

Deliberately absent from both the proposed records and the compatibility records:
any indication of how a part should be *shown*. Translucency is viewer state at
runtime. It changes no geometry and no export, so it does not belong as durable
data in the artifact specifying the physical design of the device.

## Assembly scope

This RFC uses `assembly.device` only as the current product-level container for
the board and enclosure. It does not propose assembly steps, process XML, an
MBOM/BOP model, tools, work instructions, or assembly-state DRC.

Mounting hardware and broader product structure need their own design. A
separate RFC can define `assembly.group`, fasteners that reference mounting
holes, and any process model without making enclosure geometry depend on those
unsettled semantics.

## Development Standards

### Imported dotted namespace

Assembly and enclosure development follow React Strict DOM-like imported
namespaces:

```tsx
import { assembly, enclosure } from "tscircuit"

<assembly.device>
  <board name="B1" />
  <enclosure.fdm.box boardRef=".B1" />
</assembly.device>
```

The dots are ordinary JavaScript property access, not class inheritance.
Built-in namespace keys are lowercase, following the host-element convention
used by HTML and JSX. User-defined React components remain UpperCamelCase.

No global enclosure intrinsic or core catalogue entry is planned during this
phase. The lowercase dotted namespace may grow or be reorganized as needed to
implement real functionality while maintaining a coherent hierarchy. Whether
any part should later become a global intrinsic is explicitly deferred.

### XML-compatible TSX

The public TSX surface must have a lossless XML representation using named
elements, attributes, and child elements. JavaScript expressions remain a TSX
convenience, but functions, callbacks, component-valued props, or opaque object
graphs must not be required to express an enclosure.

Complex structures should prefer nested elements and ordinary
distance/enum/string attributes. Dotted built-in names such as
`assembly.device`, `enclosure.fdm.box`, and `enclosure.cutoutaperture` are valid
XML element names.

### Circuit JSON product model

Canonical Circuit JSON carries the rendered electronics and generated preview
CAD. Assembly and interface authoring intent remains in imported TSX:

```text
board/component Circuit JSON       imported assembly/enclosure TSX
                \                           /
                 \                         /
             core enclosure render phase
                             |
                  canonical product Circuit JSON
                    /                    \
    cad_fdm_enclosure.model_jscad    manufacturing exports
                    |                 STEP / STL / 3MF / DXF
          circuit-json-to-gltf
                    |
              GLB / PoppyGL
```

In the target durable schema, a generated enclosure part is a **typed record**:
one `cad_fdm_enclosure` per printed part, carrying the serialized JSCAD plan,
its `enclosure_part` role, and the position that places it. It has no PCB owner,
because it is not on the PCB. The current compatibility representation remains
separate base/lid `cad_component` records sharing one synthetic PCB owner.

`cad_component` is the wrong record for it in two independent ways. It requires
PCB ownership, which forces a synthetic `pcb_component` whose placement and
obstruction semantics have to be disabled by hand. The compatibility owner now
carries resolved enclosure dimensions so viewers can identify the assembly, but
it still exists to satisfy a foreign key rather than to represent a board part.
And `cad_component`'s asset-normalization fields (model origin, board normal,
anchor, object fit)
describe how to fit a *supplied part file* to a footprint; a generated plan is
already authored in Circuit world coordinates, so `position` alone places it.

Serialized JSCAD operation trees are an allowed Circuit JSON CAD
representation. They are rendered by `circuit-json-to-gltf` and survive worker
boundaries, cached build output, saved `circuit.json`, and static rendering.
They are not the editable enclosure-authoring API: the assembly/enclosure TSX
and design rules remain the source of intent.

No separate preview-artifact protocol or enclosure sidecar is required.
Individual manufacturing outputs remain ordinary referenced/exported files.

### Geometry backend and shape style

JSCAD primitives and operations are the current internal geometry backend.
Backend boundaries should permit adapters to kernels such as Manifold and to
future exact parametric kernels.

Boxes, cylinders, hulls, sweeps, polygons, and booleans are a minimum rather
than a closed taxonomy. A future backend may support analytic curves, splines,
NURBS curves and surfaces, lofts, trimmed surfaces, and exact B-rep operations.
Public domain vocabulary and internal interfaces must not assume that all future
geometry reduces to today's JSCAD primitives.

Shared planar shapes should reuse common `pill`, `rect`, and `circle` concepts
where applicable and remain extensible. Rotation is independent of shape; new
APIs must not repeat the `rotated_rect`/`rotated_pill` discriminant pattern.

### Explicitness and units

- Aperture existence, shape, and size are explicit.
- Inference places or validates declared features; it does not invent them.
- Distance-valued props use naked project-standard distances: numbers use the
  default unit, and strings provide explicit units.
- Unknown or unresolved mechanical inputs surface as errors or warnings rather
  than success-shaped geometry defaults.

### Distribution

`@tscircuit/create-fdm-enclosure` is the distribution home for the geometry
solver while the API incubates. Renderable `assembly` and `enclosure` namespaces
are exported by `tscircuit`/core, where host elements and render phases live. The
internal layering described under [Package layering](#package-layering) is what
allows assembly-generic and process-generic enclosure geometry to move to their
own packages later without rewriting either.

Projects importing these namespaces append canonical CAD records using existing
Circuit JSON shapes. Projects that do not import them continue producing the
existing electronics records unchanged.
