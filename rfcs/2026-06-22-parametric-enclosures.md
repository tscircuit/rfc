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

Basic enclosure and cutout are working with reasonable proposal for props,
circuit-json, and core integration. Renderers are hooked up and tested. Mounting
hardware and design rules are next (these were implemented in the reference
implementation, we need to rewrite them to our validated architecture)

| Area | State |
| --- | --- |
| `assembly.device`, `enclosure.fdm.box`, `enclosure.cutoutaperture` | implemented |
| Typed Circuit JSON records (`source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure`) | implemented |
| Component-relative aperture axes and resolved intersections on all six faces | implemented |
| Separate insertion and aperture directions (`cutoutApertureDirection`) | implemented |
| Aperture depth, and its derivation from a part's measured body | implemented |
| One CAD record per printed part (`enclosure_part`) | implemented |
| Canonical rendering through `circuit-json-to-gltf` and the 3D viewer | implemented |
| Non-connector part-family inference beyond exact placement | implemented |
| Enclosure and assembly DRC | not started |
| STEP / 3MF / DXF outputs for enclosures | not started |
| Non-FDM manufacturing processes | not started |

### Where enclosures plug into tscircuit

tscircuit's existing layers each own one thing, and enclosures use them as they
are:

| Layer | Owns | Enclosure additions |
| --- | --- | --- |
| `@tscircuit/props` | React-independent Zod prop schemas | `assemblyProps.device`, `enclosureProps.fdm.box`, `enclosureProps.cutoutaperture` |
| `circuit-json` | the interchange records everything else reads and writes | `source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure` |
| `core` | the renderer tree: `Renderable` components and their ordered render phases | `AssemblyDevice`, `EnclosureFdmBox`, `EnclosureCutoutAperture` host elements, and the emission of the records above |
| `@tscircuit/create-fdm-enclosure` | geometry: a pure solver over plain data | the enclosure problem, its resolution, and the JSCAD plans |

An enclosure is generated from the **rendered** board — component bodies,
insertion directions, measured CAD bounds, resolved placements — so the elements
belong in core's render phases, where those facts exist and are ordered. Core
runs `EnclosureRender` after `CadModelRender` for exactly this reason: a
`cad_component` must exist before an aperture can read the body behind it.
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

In addition, the multiple components of an enclosure and the PCB itself must
be grouped together by declaring an Assembly, which can later gain elements
which specify and control the assembly process stages.

```tsx
import { assembly, enclosure } from "@tscircuit/create-fdm-enclosure"

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
| `lib/aperture/` | aperture input validation, dimensions, layout, reference datum | `lib/enclosure/` `lib/assembly` |
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
`@tscircuit/create-fdm-enclosure`, and the host elements they resolve to are
registered in `core`.

`<assembly.device>` is the product-level root. It gives the physical product an
identity and contains the board, enclosure, and later assembly occurrences,
emitting only `source_assembly_device` — no schematic, PCB, or subcircuit record,
and no electrical group, transform, or layout semantics.

`<enclosure.fdm.box />` is a sibling of `<board />` inside that wrapper and
selects its board through the required `boardRef`. It is not owned by or nested
inside the board.

```tsx
import { assembly, enclosure } from "@tscircuit/create-fdm-enclosure"

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
| `topHeadroom` | (optional) Enclosure clearance above the board; If not specified, auto-detected from the tallest component. |
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
continuous unit direction in board space. The axis passes through the
component's rotation datum, `pcb_component.center`, so the aperture and CAD body
remain on the same line as the component rotates.

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

The enclosure solver casts the transformed axis from the component datum and
selects the first enclosure wall that ray intersects. The physical face
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
face is the first enclosure wall intersected by that axis from the component's
rotation datum. Rotating or moving a part therefore carries both the axis and
its wall intersection with it.

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
continuous transformed vector for physical placement and reports its quantized
board-space name on `pcb_component.insertion_direction` or
`pcb_component.cutout_aperture_direction`. Deriving the vector and name
separately is how face selection and tool orientation would drift apart on a
rotated or bottom-mounted part.

`from_above` and `from_below` resolve to the lid and the floor rather than a
wall; a layer flip is a 180-degree rotation about the board's Y axis, so a part
authored `from_above` reports `from_below` once mounted on the bottom layer, and
its opening moves from the lid to the floor without anything being re-declared.

### Axis datum and wall intersection

For a directed side aperture, core supplies a point on the axis in **board
coordinates relative to the board center** plus the continuous board-space
direction. The point is `pcb_component.center`, the same stable datum the CAD
body rotates around. The enclosure layer intersects that ray with the first wall
of the resolved enclosure. It must not use `cable_insertion_center` as the
rotation datum: that point is inferred from a quantized side of an axis-aligned
bounding box, so it moves discontinuously when the named direction changes near
a corner.

Without an authored direction there is no physical ray to cast. The
nearest-board-edge fallback supplies a face and interaction point, and the
opening is projected square to that face as before. Lid and floor apertures use
the component position directly and rotate their profile in the board plane.

`widthDimensionOffset` and `heightDimensionOffset` remain placement corrections.
On a side face they move the resolved wall intersection along the wall and board
Z; on a lid or floor they rotate in-plane with the aperture profile. Both may be
positive or negative. They should not be overloaded to describe an opening that
is intrinsically off-centre in a reusable part's footprint; that requires the
component-local offset field deferred below.

Zero means the aperture lies on the resolved component axis, which is the exact
default for a centred connector or actuator.

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

`source_cutout_aperture` carries the placement vocabulary directly:
`width_dimension_offset`, `height_dimension_offset`, `margin`, `depth`, and the
shape branch (`rect`/`pill` with `width`/`height`, `circle` with `radius`). The
aperture-local meaning of every dimension is documented on the record itself,
since it is a semantic definition rather than a detail of one solver.

`z_extent_above_board`/`centerZ` is **not** part of the contract. It was replaced
before release rather than deprecated after. These design decisions are a matter
of taste and feedback is expected here.

`cad_fdm_enclosure` carries `enclosure_part` (`"base" | "lid"`, extensible to
fasteners and inserts), one record per printed part rather than one per
enclosure. Parts are made and assembled separately, and the first thing
anyone does with an enclosure on screen is make transparent or invisible the lid
to see the board inside — impossible if the two arrive fused into one plan.
3d-viewer and poppygl render enclosures as transparent by default.

Deliberately absent from both records: any indication of how a part should be
*shown*. Translucency was briefly a schema field and is now a viewer setting, per
part and at runtime. It changes no geometry and no export, it is purely a property
of the display of the part, so it doesn't belong as durable data in the artifact
specifying the physical design of the device.

## Mounting Hardware and Assembly

Board holes will be extended with a property similar to cutout aperture which
will select them as a mounting hole, and potentially define their mounting hardware
(this is TBD; mounting hardware may be specified at enclosure and/or assembly level)

Required mounting hardware such as screws, nuts, spacers, and heat-set bushings will
be selected from a catalog and added to the BOM.

### Assembly Device and Physical Assembly

Assembly process (steps, ordering, etc) will be specified or derived by the
assembly module. The assembly solver will implement DRC that performs
insertion-path and clearance checks, and validates that the product is actually
buildable as designed.

An enclosure manufactures the case parts; it does not by itself describe how to
assemble the finished device. `assembly.device` supplies the product-level root
and identity; its process and manufacturing semantics remain planned, and may
look something like this:

```tsx
import { assembly, enclosure } from "@tscircuit/create-fdm-enclosure"

<assembly.device name="controller">
  <board name="B1">...</board>
  <enclosure.fdm.box boardRef=".B1" />
  <assembly.harness name="display-fpc" />
  <assembly.part name="display" />

  <assembly.process>
    <assembly.step id="install-inserts">
      <assembly.install part=".heat-set-inserts" into=".case-base" />
      <assembly.tool type="heat-set-press" temperature="220C" />
    </assembly.step>

    <assembly.step id="connect-display" after="install-inserts">
      <assembly.connect from=".display-fpc" to=".B1 > .J3" />
      <assembly.check type="minimum-bend-radius" value="5mm" />
    </assembly.step>

    <assembly.step id="close-case" after="connect-display">
      <assembly.fastener part=".case-screws" torque="0.4N*m" />
    </assembly.step>
  </assembly.process>
</assembly.device>
```

The process children are illustrative. Like `enclosure`, the assembly API
incubates as an imported lowercase dotted namespace rather than a global
intrinsic. It may move to a dedicated `@tscircuit/assembly` package after its
product and process model stabilizes.

### Product structure and process ownership

The physical assembly combines:

- the main board and any daughterboards;
- generated enclosure parts;
- displays and controls mounted independently of a PCB;
- wiring harnesses, ribbon cables, antennas, and strain relief;
- fasteners, inserts, clips, seals, labels, adhesives, and other purchased or
  consumed items; and
- the connections and final transforms among those occurrences.

It owns the manufacturing view of the complete product:

- an engineering/product structure and manufacturing BoM (MBOM);
- an ordered or dependency-based Bill of Process (BOP);
- allocation of parts and consumables to operations;
- tools, fixtures, torque, temperature, cure time, and other parameters;
- work instructions and intermediate-state checks; and
- final-device assembly artifacts.

The process should be a dependency graph rather than only an array: independent
operations may occur in parallel, while closure or fastening operations depend
on earlier installation and connection steps.

### Assembly checks versus enclosure checks

Enclosure checks are design-for-manufacturing rules for enclosure parts, such as
FDM overhangs, CNC corner radii, laser kerf, and minimum walls.

Physical-assembly checks are design-for-assembly rules over changing assembly
states, including:

- insertion and removal paths;
- tool and hand access;
- fastener reach and torque access;
- connector accessibility at the step when a cable is attached;
- cable routing and minimum bend radius;
- whether an earlier operation blocks a later one;
- whether the lid closes after harness installation; and
- whether every MBOM occurrence is allocated to a process operation.

This mirrors industrial manufacturing planning: CAD/product structure describes
what the product is, while an MBOM and BOP describe what is consumed and how the
product is assembled.

### Why not `<group>` or the existing `<cadassembly>`?

`<group>` is already an ECAD and layout abstraction. It can emit
`source_group`, `pcb_group`, and `schematic_group` records; establish subcircuit
and selector scope; expose ports and connections; apply schematic/PCB
grid/flex/packing; and control routing rules and autorouters. A root group is
automatically a subcircuit. Wrapping a board and enclosure in it therefore says
they share electrical/layout scope, not merely that they belong to one physical
product.

Overloading `<group>` with assembly-process meaning would also make existing
group behavior harder to reason about and still would not provide MBOM
allocation, ordered operations, tools, harness connections, or intermediate
assembly states.

The existing `<cadassembly>` is narrower in the other direction. It is a
component-local primitive container for composing multiple `<cadmodel>` children
and carries `originalLayer` mirroring semantics. It emits no assembly record and
applies no product-assembly or process-planning algorithms. Reusing its name for
finished-device assembly would conflate CAD representation with real-world
assembly and substantially change existing meaning.

`assembly.device` is therefore the explicit product root. Its implementation is
intentionally small — an identity record and a container — while later product
structure, process, DRC, and export semantics attach to the same wrapper without
overloading ECAD grouping.

## Development Standards

### Imported dotted namespace

Assembly and enclosure development follow React Strict DOM-like imported
namespaces:

```tsx
import { assembly, enclosure } from "@tscircuit/create-fdm-enclosure"

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

A generated enclosure part is a **typed record**: one `cad_fdm_enclosure` per
printed part, carrying the serialized JSCAD plan, its `enclosure_part` role, and
the position that places it. It has no PCB owner, because it is not on the PCB.

`cad_component` is the wrong record for it in two independent ways. It requires
PCB ownership, which forces a zero-size `pcb_component` whose placement and
obstruction semantics then have to be disabled by hand — a record existing only
to satisfy a foreign key, which every consumer must learn to ignore. And its
asset-normalization fields (model origin, board normal, anchor, object fit)
describe how to fit a *supplied part file* to a footprint; a generated plan is
already authored in Circuit world coordinates, so `position` alone places it.

Generated **hardware** — screws, inserts, washers, standoffs — is a different
problem and is not solved by `cad_fdm_enclosure`, since a screw is not an FDM
enclosure and its meaningful relationship is to the mount it occupies. Hardware
therefore keeps the synthetic `source_component` + `pcb_component` +
`cad_component` triple for now, excluded from placement, obstacle, and
electrical-BOM analysis. See [Future proposal: physical hardware occurrence
records](#future-proposal-physical-hardware-occurrence-records).

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

`@tscircuit/create-fdm-enclosure` is the distribution home while the API
incubates, exporting both `assembly` and `enclosure` alongside the FDM solver.
The internal layering described under [Package
layering](#package-layering) is what allows `assembly`, and a
process-generic enclosure layer, to move to their own packages later without
rewriting either.

Projects importing these namespaces append canonical CAD records using existing
Circuit JSON shapes. Projects that do not import them continue producing the
existing electronics records unchanged.

### Future proposal: physical hardware occurrence records

`cad_fdm_enclosure` (circuit-json #649) gives generated enclosure *parts* a typed
CAD record that does not need PCB ownership. Generated *hardware* has no such
record, and cannot reuse that one: a screw, heat-set insert, washer, nut, or
standoff is not an FDM enclosure, and the relationship it needs is to the mount
it occupies, not to the enclosure request.

So the synthetic `source_component` + `pcb_component` + `cad_component` triple
survives for hardware even after enclosure parts stop using it. That is the
larger half of the problem: one enclosure emits two part records, while the
prefab reference emits five M3 supports plus corner ears, i.e. roughly a dozen
mechanical occurrences that currently present as `simple_chip` PCB components and
flow into electrical BOM interpretations.

This is explicitly **not** in scope for the initial core/create-fdm migration. It
is collected here so the enclosure-part work does not accidentally settle it.

A future proposal should cover:

- a physical-occurrence record with identity, parent/child product structure, and
  an assembled transform, independent of any PCB;
- procurement identity (manufacturer, supplier, MPN, generic-hardware flag) and a
  stable BOM grouping key, so mechanical items group without an MPN;
- attachment of CAD geometry to an occurrence rather than to a `pcb_component`;
- the relationship from an occurrence to the mount, seam, or part it is installed
  into, which is what assembly-process planning needs;
- consumed/consumable items that have quantity but no single placement
  (adhesive, thread locker, labels); and
- an explicit statement of which BOM a mechanical occurrence appears in —
  electrical, mechanical, or both.

Until then, hardware keeps the compatibility triple and must remain excluded
from placement, obstacle, and electrical-BOM analysis by the same rules as
enclosure parts: zero size, `do_not_place`, off-board-allowed, non-obstructing.
