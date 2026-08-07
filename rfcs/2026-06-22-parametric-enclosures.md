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
hardware and assembly design rules are next (these were implemented in the reference
implementation, we need to rewrite them to our validated architecture)

| Area | State |
| --- | --- |
| `assembly.device`, `enclosure.fdm.box`, `enclosure.cutoutaperture` | implemented |
| Typed Circuit JSON records (`source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure`) | implemented |
| Face-relative aperture placement on all six faces | implemented |
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

The solver stays outside core because geometry is where manufacturing processes
differ. It takes plain data and returns plain data, knows nothing about React or
the renderer tree, and is the layer a CNC or sheet-metal sibling is written
against. Its tests need no circuit at all.

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

Development of all three concerns — assembly, enclosure, and the FDM process —
starts inside `@tscircuit/create-fdm-enclosure`, so one package can be iterated
on without a release dance between three. Inside it, the generic layers are kept
strictly separate from the process-specific one:

| Directory | Scope | May import |
| --- | --- | --- |
| `lib/assembly/` | assembly-generic: the board/standoff/seam frame every process shares | nothing below it |
| `lib/enclosure/` | enclosure-generic: faces, aperture inputs, component-body envelopes, resolved placements | `lib/assembly/` |
| `lib/fdm/`, `lib/apertures/` | FDM-specific: shells, lips, cutout plans, design rules | both of the above |

The dependency direction is enforced by the modules themselves, not by
convention: `resolve-enclosure-assembly-frame.ts` states that it must not import
from `lib/enclosure/` or `lib/fdm/`, because the assembly frame is what a
sheet-metal or CNC enclosure would also resolve.

Keeping the boundary now means breaking `@tscircuit/assembly` and a generic
enclosure package out later is a move, not a rewrite. Whether that split is worth
making is deferred until a second process exists to justify it.

## Enclosure Specification

The enclosure specification is assembly-level TSX associated with a board by
selector. It owns construction, manufacturing, supports, retention, clearance
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

**Status: implemented**, including the face-relative placement contract.

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
as well as the "top" and "bottom" PCB layer.

Core's `BoardWall` uses the same six cartesian names, so converting a board wall
to an enclosure face is an identity rather than a lookup table. That is the point:
core once swapped the +Y and −Y walls in that conversion to compensate for
renderer behavior, but it didn't match the other renderer behavior, causing confusion

`boardSide` is deliberately **not** renamed. It names the PCB layer a part is
mounted on — a side, not a direction — so it stays `"top"`/`"bottom"`.

> **Migrating old names is by axis, never by word.** The retired proposal was
> itself the cautionary example: its table defined `front` as −Y while the
> shipped `faces.ts` defined `front` as +Y. Convert each occurrence from the axis
> it denotes *in its own source*. Note especially that old `top`/`bottom` were the
> **Z** faces: reading `top` as +Y moves a lid aperture onto a side wall, and the
> geometry still resolves, so nothing throws.

### Aperture axes are face-relative

The enclosure's own `width`/`height`/`depth` are plain board axes — X, Y, Z. An
aperture's are not, because an opening is measured in the frame of the face it
pierces:

| Face | `width` | `height` | `depth` |
| --- | --- | --- | --- |
| `x_pos`, `x_neg` | Y | Z | X |
| `y_pos`, `y_neg` | X | Z | Y |
| `z_pos`, `z_neg` | X | Y | Z |

So on any side face `height` is the vertical dimension and `width` runs along the
wall, while `depth` points into the box. Width and height are the two
face-tangent axes; depth is the face normal. A circular aperture uses `radius` in
place of width and height.

This is what makes one vocabulary work on all six faces. Every cutting tool is
authored once in a face-local frame — local X is `width`, local Y is `height`,
local Z is `depth` — and turned onto its face exactly once, so no geometry stage
re-derives placement or orientation.

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

The face is not authored on the aperture. It is resolved from a direction
declared on the part's `<footprint />`, transformed for the component's rotation
and mounting layer, so it names the face the part is actually reached from —
rotating a part carries its opening around with it.

Two directions exist because a part can be *installed* one way and *interacted
with* another:

| Footprint prop | Names |
| --- | --- |
| `insertionDirection` | the side a cable or mating part attaches from |
| `cutoutApertureDirection` | the side the part's enclosure opening faces |

In precedence order: `cutoutApertureDirection`, else `insertionDirection`, else
the nearest reachable board edge, which is a guess and the only step that is.

Most parts need only the first fallback: a cable arrives through the opening it
needs, so the two directions coincide for every connector. They come apart on a
part that is not entered at all — a side-actuated switch is pressed into the
board from above and actuated sideways, so its opening pierces a wall while
nothing is ever inserted into it. Overloading `insertionDirection` for that would
have been a false statement, not just an imprecise one: it is defined as the side
exposing the receptacle a mating part attaches to, and is read as such by
connector checks.

Both share one vocabulary, one frame, and one transform. They are properties of
the part, authored in its unrotated frame, and reported in board coordinates on
`pcb_component.insertion_direction` and
`pcb_component.cutout_aperture_direction`. Deriving them separately is how the
two would drift apart on a rotated or bottom-mounted part.

`from_above` and `from_below` resolve to the lid and the floor rather than a
wall; a layer flip is a 180-degree rotation about the board's Y axis, so a part
authored `from_above` reports `from_below` once mounted on the bottom layer, and
its opening moves from the lid to the floor without anything being re-declared.

### Placement across the face

An aperture supplies `face` plus `center`, an interaction point in **board
coordinates relative to the board center**. The enclosure layer projects that
point onto the face: the two coordinates tangent to the face position the
opening, and the coordinate along the face normal is discarded. Callers never
decide which axis matters.

`widthDimensionOffset` and `heightDimensionOffset` then move the opening's centre
across the face that the aperture cuts relative to the detected part's rotation,
along the same two axes its `width` and `height` of the aperture are measured in
for the part. Both may be positive or negative to offset on the cartesian axis.

Zero means *wherever the part puts it*, which is usually right or close to right,
requiring only a small amount of manual nudging in coordinate directions that
should make sense to a human or an agent.

### Depth: the third aperture dimension

`depth` is the opening's size along the face normal — how deep the part is, in
the direction it pokes through. The cut is projected that far inboard, so nothing
behind the face (the lid lip today, mounting bosses and other internal structures
later) is left obstructing a part that reaches past the wall.

When `depth` is not authored, we measure the extents of `componentBody`: the
part's authored body `size` in its own frame, the `rotation` it is placed at, the
board-frame `footprint` it occupies, and `aboveBoardHeight`, how far it reaches
above the board. This package projects that envelope onto the face normal and
uses the result, taking the footprint as a floor. This prevents collision of the
part's cutout aperture with internal structures of the enclosure, such as the lip,
if depth is not authored. This `componentBody` data will also be used in the future
for collision checking.

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
face-relative meaning of every dimension is documented on the record itself,
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

### Non-connector placement: planned design

Other part families feed the same resolver through specialized inference
strategies. Horizontal-face placement is exact today (a button or LED sits at its
own `pcb_component.center`); what remains per family is the *travel* and *optical*
behaviour around the opening.

| Part/interface | Planned centering and enclosure behavior |
| --- | --- |
| PCB-mounted pushbutton | Centre on the actuator axis; cut the lid. Travel may enlarge clearance. |
| Side-actuated switch | Centre on the actuator or swept travel envelope; cut a wall slot. |
| PCB-mounted display | Use visible-area centre, front-surface z, and viewing normal; cut a lid window and optionally add a riser or bezel. |
| Ribbon-connected display | Treat the display as a separately placed mechanical occurrence; explicit placement drives its window, clips, and supports while the ribbon preserves the electrical relationship. |
| LED | Use the optical axis and emitting-surface position; cut a viewing aperture or generate a lightpipe. |

The general resolver belongs in the enclosure layer; the cable-point library
should remain focused on connectors.

### Deferred aperture work

- **An explicit `face` prop.** The case that motivated one — a part whose
  opening does not face the way the part is entered — is served by
  `cutoutApertureDirection` instead, and better: a direction is authored in the
  part's own frame and rotates with it, while a face is an enclosure-frame
  absolute that a part cannot know. What remains unserved is a *caller* override
  for one board, which no shipped part has needed.
- **Component-local off-centre apertures.** A part whose opening is off-centre in
  its own footprint (an asymmetric display window) needs an offset that follows
  the part's rotation *and* is authored by the part, not the caller. The current
  offsets are face-relative but centred on the resolved interaction point; a
  component-local field should be added explicitly rather than by overloading
  these.
- **Riser, bezel, lightpipe and clip generation.** Additive features *around* an
  aperture, not placement; they should not be folded into the aperture profile.
- **Travel envelopes** for switches and pushbuttons, which need the part-family
  inference modules first.
- **Full body-envelope clearance** — subtracting a part's whole body from the
  shell — as distinct from the one-scalar depth projection described above.
- **Clearance DRC** between generated features and enclosed components, which
  remains deferred to enclosure/assembly DRC.

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
and identity; its process and manufacturing semantics remain planned:

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

### Explicitly deferred decisions

This RFC does not decide:

- whether any dotted namespace components later become global intrinsics;
- how bidirectional enclosure-to-PCB change proposals are represented;
- the final taxonomy for every construction and manufacturing process; or
- the final kernel for advanced parametric geometry.

These decisions should follow implementation experience rather than precede it.

## Plan

### 1. Establish `assembly.device`

Add the React-independent `assemblyProps.device` contract to
`@tscircuit/props`, register the `AssemblyDevice` host element in `core`, and
export the imported `assembly.device` namespace from
`@tscircuit/create-fdm-enclosure`:

- accept an optional product-level `name`;
- contain boards, enclosure specifications, and later assembly occurrences;
- retain children in the renderer tree;
- emit `source_assembly_device` and nothing else — no schematic, PCB, CAD, or
  subcircuit record; and
- avoid implicit electrical-group semantics.

### 2. Consolidate connector aperture placement

Migrate connector behavior into the explicit aperture-placement model:

- require `enclosure.cutoutaperture`;
- preserve transformed insertion-direction precedence;
- use cable-point inference only for board-plane x/y and mating-side evidence;
- position the opening across its face from `widthDimensionOffset` /
  `heightDimensionOffset`, defaulting to the part's measured body;
- validate enclosure-face reach using component/CAD bounds; and
- report unresolved placement rather than creating a fallback opening.

Keep `enclosure.cutoutaperture` exactly aligned with its upstream props schema.

### 3. Separate the generic layers from the FDM process

Inside `@tscircuit/create-fdm-enclosure`:

- keep `lib/assembly/` free of any enclosure or process concept, so the frame it
  resolves is the one a sheet-metal or CNC enclosure would also resolve;
- keep `lib/enclosure/` free of FDM specifics: faces, aperture inputs,
  component-body envelopes, and resolved placements are process-independent, and
  a process consumes them rather than redefining them;
- confine shells, lips, cutout plans, and design rules to `lib/fdm/`; and
- express the direction of dependency in the modules themselves, so a violation
  is visible at the import rather than at review time.

This phase is complete when a second process could be added by writing a sibling
of `lib/fdm/` alone.

### 4. Integrate canonical enclosure rendering

1. core renders the board and applies registered Circuit JSON postprocessors;
2. the enclosure render phase consumes those records plus the imported
   `assembly.*`/`enclosure.*` TSX, and calls the solver;
3. the enclosure renderer appends **typed** `cad_fdm_enclosure` records, one per
   printed part, carrying `model_jscad`;
4. `circuit-json-to-gltf` executes the serialized plans and composes the
   PCB/component/enclosure scene; and
5. RunFrame, CLI workers, saved builds, and static viewers consume the same
   canonical Circuit JSON without an out-of-band artifact channel.

Step 3 emits typed records with no synthetic PCB owner, for the reasons given
under [Circuit JSON product model](#circuit-json-product-model).

### 5. Prototype non-connector interaction inference

Design the XML-compatible interaction vocabulary and implement focused
prototypes for:

1. vertically actuated PCB pushbuttons;
2. side-actuated switches and travel envelopes;
3. PCB-mounted displays with windows and risers/bezels;
4. ribbon-connected displays with explicit enclosure placement and clips; and
5. LEDs with direct apertures or generated lightpipes.

Each prototype should resolve the same center/direction/role abstraction and
demonstrate explicit override, part metadata, specialized inference, and
placement fallback independently.

### 6. Expand `assembly.device`

Expand the imported, lowercase dotted `assembly` namespace incubating in
`@tscircuit/create-fdm-enclosure`, keeping it in `lib/assembly/` so it stays
separable:

- model device-level occurrences including boards, daughterboards, enclosure
  parts, displays, harnesses, ribbon cables, hardware, and consumables;
- distinguish product structure/eBOM, MBOM, BOP, and tools/resources;
- allocate occurrences to dependency-ordered assembly operations;
- represent install, connect, fasten, route, and check operations;
- validate intermediate assembly states, tool access, insertion paths, cable
  bend radius, and operation completeness; and
- emit assembly-process artifacts and work instructions without overloading
  `<group>` or the existing component-local `<cadassembly>`.

The first prototype should assemble the reference PCB, generated enclosure,
hardware, and at least one cable- or display-like external occurrence.

### 7. Expand manufacturing outputs and constructions

After the migration and interaction model are proven:

- add process-specific STEP, 3MF, DXF, and assembly outputs;
- add additional construction families such as sleeves, card guides, modified
  prefab enclosures, sheet assemblies, and machined enclosures;
- grow process-specific design-rule profiles and DRC; and
- revisit the explicitly deferred API and interchange questions using evidence
  from completed designs.
