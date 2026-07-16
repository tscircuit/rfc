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

Circuit JSON is the authoritative rendered board and CAD output. Core renders
the electrical board; `@tscircuit/enclosure` consumes that output plus the live
assembly/enclosure TSX and appends generated CAD models using existing Circuit
JSON records. Circuit authors should not reproduce board dimensions in a second
design.

## Summary

Enclosure authoring has two complementary root concepts:

1. **Enclosure specification** — assembly-level TSX adjacent to the board TSX.
   It selects the board, construction, manufacturing process, dimensions,
   mounting strategy, design rules, and DRC behavior.
2. **Cutout aperture specification** — part-level TSX beside a part's footprint
   and CAD model. It explicitly declares the size and shape of an enclosure
   opening required to use that part.

```tsx
import { assembly, enclosure } from "@tscircuit/enclosure"

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

    <enclosure.fdm.box boardRef=".B1" autoCutouts />
  </assembly.device>
)
```

The enclosure specification answers **how the product is enclosed**. The
cutout-aperture specification answers **what opening a particular part
requires**. Aperture placement combines explicit part metadata with
part-family-specific inference.

The working `pcb-enclosure` reference implementation currently demonstrates:

- an FDM-first, two-part box with a base and lid;
- PCB mounting posts or external corner fastening ears;
- automatic placement of explicitly declared connector apertures;
- visible, BoM-able screws and bushings;
- JSCAD-backed preview and STL output.

`@tscircuit/enclosure` will replace that reference package. The public API and
artifact pipeline will be developed there.

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
renderable lowercase `assembly` and `enclosure` namespaces will be exported by
`@tscircuit/enclosure`. The working reference implementation constructs them in
`pcb-enclosure`.

`<assembly.device>` is the product-level root. Its initial implementation is a
no-output host wrapper that gives the physical product an identity and contains
the board, enclosure, and later assembly occurrences without creating
electrical group, subcircuit, transform, or layout semantics.

`<enclosure.fdm.box />` is a sibling of `<board />` inside that wrapper and
selects its board through the required `boardRef`. It is not owned by or nested
inside the board.

```tsx
import { assembly, enclosure } from "@tscircuit/enclosure"

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
      autoCutouts
    />
  </assembly.device>
)
```

`assembly.device` is the single explicit root. It remains an external no-output
tree node so imported assembly and enclosure metadata is available to the
renderer without creating electrical group or subcircuit semantics.

The explicit board selector leaves room for future multi-board assemblies.

The upstream `enclosure.fdm.box` props currently provide `boardRef`, optional
outer `width`, `height`, and `depth`, and `wallThickness`. The reference
implementation additionally exercises:

| Prop | Meaning |
| --- | --- |
| `floorThickness` | Base floor thickness. |
| `lidThickness` | Lid top-plate thickness. |
| `boardClearance` | XY gap from PCB edge to the inner wall. |
| `standoffHeight` | Gap from floor top to PCB bottom. |
| `topHeadroom` | Clearance above the tallest top-side component. |
| `lidLipDepth` | Depth of the friction-fit lid lip. |
| `anchor` | Mounting-stack key or inline mounting specification. |
| `autoCutouts` | Place apertures explicitly declared by parts; never invent an opening from body bounds. |

### Manufacturing processes and design rules

`enclosure.fdm.box` identifies the initial supported manufacturing/construction
combination: an FDM-produced box. The dotted namespace may grow to represent
other constructions and processes, but no universal taxonomy is committed yet.
A clamshell, sleeve, modified prefab enclosure, bent sheet-metal enclosure, and
machined enclosure may require different parts, assembly motion, props, and DRC;
they should not be forced through one interchangeable component when their
semantics differ.

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
Different public components may share internal solvers without implying that
users can safely swap their namespace paths without revisiting the design.

### Mounting and hardware

Board-level, electrically unowned holes become candidate PCB supports. The
current `m3-heat-set` stack derives:

- support-boss dimensions;
- insert bore and melt relief;
- lid retention column;
- countersunk screw seat; and
- screw and insert BoM entries.

The mounting-hardware catalog is data-driven and accepts built-in keys, user
overrides, or inline stacks. Hardware dimensions and BoM identity stay together.

When PCB mounting holes do not cover a corner, the current solver adds an
external fastening ear rather than placing a screw through the board cavity.
Purchased hardware is represented as visible assembly parts with grouped BoM
identity.

### Geometry and output artifacts

The current split-shell construction contains:

- a base tub with floor, walls, and PCB supports;
- a lid plate with a friction lip and retention features; and
- declared apertures routed to the wall, base, or lid forming the selected face.

Feature recipes currently lower to internal `jscad-planner` operations and
`@jscad/modeling` meshes. JSCAD is an implementation backend, not the public
enclosure representation.

`@tscircuit/enclosure` should emit standard mechanical artifacts, including as
appropriate:

- individual and assembly STEP;
- GLB/GLTF preview;
- STL or 3MF for additive manufacturing; and
- DXF or other process-specific files for 2D cutting.

The output layer may provide individual manufacturing parts, a complete
assembly, a mechanical BoM, and a preview GLB.

### Assembly checks are deferred

The reference implementation no longer performs enclosure collision or
insertion-path DRC. Those checks depend on product occurrences, assembly state,
motion, and intentional interfaces, so they will be reintroduced under
`assembly.device` rather than attached to an isolated enclosure model.

Top- and bottom-mounted bodies, Z offsets, through-hole leads, clips, and other
far-side projections still contribute to enclosure sizing and standoff
clearance. Invalid dimensions and unresolved required geometry continue to
surface as rendering errors.

### Current reference coverage

The prefab-board reference example exercises:

- five M3 PCB supports;
- two USB-C receptacles;
- Micro-USB, USB-A, DC barrel, 3.5 mm audio, and SMA connectors;
- concrete supplier footprints, silkscreen outlines, OBJ models, and aperture
  metadata; and
- seven declared apertures automatically placed across four side walls.

## Cutout Aperture Specification

An enclosure opening is an inherent, part-owned mechanical requirement. A part
that requires an opening declares an `<enclosure.cutoutaperture>` beside its
footprint and CAD model.

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

The merged `@tscircuit/props` contract supports:

| Shape | Required geometry |
| --- | --- |
| `pill` | `width`, `height` |
| `rect` | `width`, `height` |
| `circle` | `radius` |

Every branch may carry `margin`. Numbers use the project default unit; explicit
distance strings such as `"3.66mm"` and `"0.1in"` may be mixed.

A cutout is generated only when a part or enclosure author explicitly supplies
an aperture. Components without one do not receive an inferred opening.
`autoCutouts` means automatic placement of declared apertures, not automatic
invention of aperture existence, shape, or size. Body and CAD bounds may help
place or validate a requested feature; they never imply that a component needs
an enclosure opening.

### Reusable defaults and caller replacement

`enclosure.cutoutaperture` is an ordinary imported namespaced React element, not
a global JSX intrinsic. A reusable part wrapper may provide a default child and
allow the circuit author instantiating that wrapper to replace it:

```tsx
export const UsbC = ({ children, ...props }) => (
  <connector {...props}>
    {children ?? (
      <enclosure.cutoutaperture
        shape="pill"
        width="9.2mm"
        height="3.3mm"
      />
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

### Aperture placement and interaction surfaces

The aperture profile defines opening geometry and clearance, but not by itself
the three-dimensional interaction point that the opening serves. Placement
requires a component interaction surface:

- a three-dimensional center in the component-local mounting frame;
- an outward direction; and
- a role such as mating, actuation, viewing, or optical output.

The exact TSX spelling remains experimental. It should stay XML-compatible and
conceptually support a structure such as:

```tsx
<enclosure.interface role="mating" z="1.65mm">
  <enclosure.cutoutaperture
    shape="pill"
    width="9.2mm"
    height="3.3mm"
  />
</enclosure.interface>
```

This is illustrative, not a committed element name. Named attributes or nested
position elements are preferable to an opaque JavaScript object when both can
express the same information.

### Connector placement: current implementation

`@tscircuit/infer-cable-insertion-point` is inherently two-dimensional. It
examines PCB pads, holes, silkscreen, component bounds, and transformed insertion
direction to infer a board-plane x/y cable point and mating side. Those inputs do
not reliably identify the opening's height above the component mounting surface.

For a side-entry connector:

1. the part must explicitly declare `enclosure.cutoutaperture`;
2. transformed `insertionDirection` selects the mating face when available;
3. cable-point inference supplies board-plane x/y and otherwise helps select the
   nearest reachable wall;
4. the current fallback centers side openings on the relevant CAD/body height;
5. the aperture profile supplies shape, size, and margin; and
6. body/CAD geometry helps validate wall reach and unresolved placement, but
   never synthesizes an aperture.

The public aperture element is not extended with placement props. CAD/body
centering is only the current fallback because a connector opening need not be
centered in its housing. Authored placement belongs in the separate interaction
surface vocabulary.

### Non-connector placement: planned design

Other part families should feed the same interaction-surface resolver through
specialized inference strategies. For each center coordinate and direction,
resolution follows:

1. explicit caller value;
2. part-authored interaction metadata;
3. role/part-family inference; then
4. the center of the relevant CAD/body face as a placement fallback.

This precedence applies only after an aperture or interaction is explicitly
declared.

The resolved interaction ray selects and intersects an enclosure face. The two
coordinates tangent to that face center the aperture. Retention and support
features may reference the same interaction and body but remain separate from
the aperture profile.

| Part/interface | Planned centering and enclosure behavior |
| --- | --- |
| PCB-mounted pushbutton | Center on the actuator axis; infer or author actuator-top z and +z direction; cut the lid. Travel may enlarge clearance. |
| Side-actuated switch | Center on the actuator or swept travel envelope; point toward the side; cut a wall slot or opening. |
| PCB-mounted display | Use visible-area center, front-surface z, and viewing normal; cut a lid window and optionally add a riser or bezel. |
| Ribbon-connected display | Treat the display as a separately placed mechanical occurrence; explicit placement drives its window, clips, and supports while the ribbon preserves the electrical relationship. |
| LED | Use the optical axis and emitting-surface position; cut a viewing aperture or generate a lightpipe to the enclosure surface. |

The general resolver belongs in `@tscircuit/enclosure`; the cable-point library
should remain focused on connectors. Specialized inference modules can be added
as experience with each part family grows.

## Assembly Device and Physical Assembly

An enclosure manufactures the case parts; it does not by itself describe how to
assemble the finished device. `assembly.device` initially supplies the
product-level root and identity from `@tscircuit/enclosure`; its process and
manufacturing semantics remain planned:

```tsx
import { assembly, enclosure } from "@tscircuit/enclosure"

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

`assembly.device` is therefore the explicit product root. Its initial no-output
implementation is intentionally small, while later product structure, process,
DRC, and export semantics can attach to the same wrapper without overloading
ECAD grouping.

## Development Standards

### Imported dotted namespace

Assembly and enclosure development follow React Strict DOM-like imported
namespaces:

```tsx
import { assembly, enclosure } from "@tscircuit/enclosure"

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
                    @tscircuit/enclosure
                             |
                  canonical product Circuit JSON
                    /                    \
       cad_component.model_jscad     manufacturing exports
                    |                 STEP / STL / 3MF / DXF
          circuit-json-to-gltf
                    |
              GLB / PoppyGL
```

No Circuit JSON schema change is required. Each generated case part or hardware
occurrence uses the existing record trio:

- a synthetic `source_component` for identity and display name;
- a zero-size, non-obstructing, `do_not_place` synthetic `pcb_component`; and
- a `cad_component` whose existing `model_jscad` field contains the serializable
  JSCAD operation tree.

The synthetic source/PCB records are compatibility scaffolding required by the
current `cad_component` ownership contract. They are not semantically PCB
components and must remain excluded from placement, obstacle, and manufacturing
analysis. A future generic CAD-owner relationship may remove this compromise,
but this RFC does not require a Circuit JSON library change.

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

`@tscircuit/enclosure` replaces the `pcb-enclosure` reference package as the
long-term implementation and distribution home. During incubation it exports
both `assembly` and `enclosure`; `assembly` may later move to a dedicated
package. Projects that do not import these namespaces remain unchanged.

Projects importing these namespaces append canonical CAD records using existing
Circuit JSON shapes. Projects that do not import them continue producing the
existing electronics records unchanged.

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
`@tscircuit/props` and export the imported `assembly.device` component from
`pcb-enclosure`, later `@tscircuit/enclosure`:

- accept an optional product-level `name`;
- contain boards, enclosure specifications, and later assembly occurrences;
- retain children in the renderer tree;
- emit no source, schematic, PCB, CAD, or subcircuit record; and
- avoid implicit electrical-group semantics.

### 2. Consolidate connector aperture placement

Migrate connector behavior into the explicit interaction-surface model:

- require `enclosure.cutoutaperture`;
- preserve transformed insertion-direction precedence;
- use cable-point inference only for board-plane x/y and mating-side evidence;
- source z from the part's interaction metadata;
- validate enclosure-face reach using component/CAD bounds; and
- report unresolved placement rather than creating a fallback opening.

Keep `enclosure.cutoutaperture` exactly aligned with its upstream props schema.
Define the XML-compatible interaction vocabulary separately before exposing
authored interaction-position overrides.

### 3. Migrate the reference implementation

Move or replicate the working `pcb-enclosure` implementation into
`@tscircuit/enclosure`:

- expose the merged `enclosure.fdm.box` and
  `enclosure.cutoutaperture` contracts plus `assembly.device`;
- preserve current FDM box sizing, supports, hardware, and exports;
- consume the rendered board records and append existing source/PCB/CAD records
  carrying `model_jscad`;
- retain only package-private renderer/host adapters;
- remove the legacy public `<enclosure>` intrinsic surface; and
- preserve explicit-aperture behavior.

This phase is complete when the existing prefab-board reference renders and
exports equivalent enclosure parts from `@tscircuit/enclosure`.

### 4. Integrate canonical enclosure rendering

1. core renders the board and applies registered Circuit JSON postprocessors;
2. `@tscircuit/enclosure` consumes the board records and imported
   `assembly.*`/`enclosure.*` TSX;
3. the enclosure renderer appends synthetic source/PCB owners and
   `cad_component.model_jscad` records using the existing schema;
4. `circuit-json-to-gltf` executes the serialized plans and composes the
   PCB/component/enclosure scene; and
5. RunFrame, CLI workers, saved builds, and static viewers consume the same
   canonical Circuit JSON without an out-of-band artifact channel.

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
`@tscircuit/enclosure`:

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
