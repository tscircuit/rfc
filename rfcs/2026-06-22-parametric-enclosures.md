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

The enclosure system should preserve the existing division between electrical
and mechanical concerns. Circuit JSON remains the authoritative rendered board
input. `@tscircuit/enclosure` consumes that input plus enclosure-specific TSX and
exports mechanical artifacts. It should not require circuit authors to reproduce
board dimensions in a second design.

## Summary

Enclosure authoring has two complementary root concepts:

1. **Enclosure specification** — assembly-level TSX adjacent to the board TSX.
   It selects the board, construction, manufacturing process, dimensions,
   mounting strategy, design rules, and DRC behavior.
2. **Cutout aperture specification** — part-level TSX beside a part's footprint
   and CAD model. It explicitly declares the size and shape of an enclosure
   opening required to use that part.

```tsx
import { enclosure } from "@tscircuit/enclosure"

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
  <group>
    <board name="B1" width="50mm" height="36mm">
      <UsbC name="J1" pcbX="22mm" pcbY="0mm" />
    </board>

    <enclosure.fdm.box boardRef=".B1" autoCutouts />
  </group>
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
- render-time and exhaustive assembly checks; and
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
enclosureProps.fdm.box
enclosureProps.cutoutaperture
```

Those values validate props; they are not renderable React components. The
renderable lowercase `enclosure` namespace will be exported by
`@tscircuit/enclosure`. The working reference implementation currently
constructs the namespace in `pcb-enclosure/register`.

`<enclosure.fdm.box />` is an assembly-level sibling of `<board />` and selects
its board through the required `boardRef`. It is not owned by or nested inside
the board.

```tsx
import { enclosure } from "@tscircuit/enclosure"

export default () => (
  <group>
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
  </group>
)
```

`<group>` is only the single TSX root containing the board and enclosure
siblings; it is not part of the enclosure model. Code using the programmatic
circuit API can add them as separate root children. The explicit board selector
also leaves room for future multi-board assemblies.

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

### Design-rule and assembly checks

The current implementation uses two complementary checks over the same extracted
component-body boxes:

- analytic checks for collisions or insufficient clearance against walls,
  columns, screw channels, bosses, and the lid lip; and
- mesh checks for seated intersections and the swept board-insertion path.

Top- and bottom-mounted bodies, Z offsets, through-hole leads, clips, and other
far-side projections contribute to the appropriate cavity and standoff
clearances.

Components may intentionally pass through a wall or lid only where an explicit
aperture serves them. A resolved aperture exempts only the intended intersection;
it does not disable unrelated collision checks.

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
4. part-authored interaction metadata supplies local z;
5. the resolver transforms the local interaction into board coordinates;
6. the aperture profile supplies shape, size, and margin; and
7. body/CAD geometry helps validate wall reach and unresolved placement, but
   never synthesizes an aperture.

CAD/body height may suggest a missing z for a declared aperture, but it is not
authoritative because a connector opening need not be centered in its housing.
An unresolved center should surface as an enclosure error or warning.

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

## Development Standards

### Imported dotted namespace

Enclosure development follows a React Strict DOM-like imported namespace:

```tsx
import { enclosure } from "@tscircuit/enclosure"

<enclosure.fdm.box boardRef=".B1" />
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
`enclosure.fdm.box` and `enclosure.cutoutaperture` are valid XML element names.

### Circuit JSON and artifact boundary

Canonical Circuit JSON is a read-only board/electronics input:

```text
canonical circuit.json       imported enclosure.* TSX
          \                            /
           \                          /
              @tscircuit/enclosure
                       |
          internal geometry rendering
             /         |          \
          STEP        GLB       3MF/STL/DXF
```

During this phase:

- no enclosure records are added to canonical Circuit JSON;
- no persisted enclosure sidecar or intermediate representation is required;
- internal TypeScript structures are implementation details;
- JSCAD operation trees are not persisted as interchange; and
- Circuit JSON may optionally reference the rendered enclosure GLB through
  existing CAD model/asset fields for combined viewing.

Whether a persisted enclosure model, richer Circuit JSON relationship, or
bidirectional ECAD/MCAD-style proposal protocol is eventually needed remains
open.

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
long-term implementation and distribution home. Projects opt in by importing
its namespace. Projects that do not import it remain unchanged.

The only planned Circuit JSON integration is an optional reference to a rendered
enclosure GLB. All other durable outputs are standard mechanical artifacts.

### Explicitly deferred decisions

This RFC does not decide:

- whether any dotted namespace components later become global intrinsics;
- whether enclosure data eventually gains a canonical intermediate
  representation;
- whether Circuit JSON later carries more than a rendered GLB reference;
- how bidirectional enclosure-to-PCB change proposals are represented;
- the final taxonomy for every construction and manufacturing process; or
- the final kernel for advanced parametric geometry.

These decisions should follow implementation experience rather than precede it.

## Plan

### 1. Migrate the reference implementation

Move or replicate the working `pcb-enclosure` implementation into
`@tscircuit/enclosure`:

- expose the merged `enclosure.fdm.box` and
  `enclosure.cutoutaperture` contracts;
- preserve current FDM box sizing, supports, hardware, DRC, and exports;
- consume canonical Circuit JSON as read-only board input;
- retain only package-private renderer/host adapters;
- remove the legacy public `<enclosure>` intrinsic surface; and
- preserve explicit-aperture behavior.

This phase is complete when the existing prefab-board reference renders and
exports equivalent enclosure parts from `@tscircuit/enclosure`.

### 2. Integrate enclosure preview rendering

Add an artifact-oriented preview path:

1. core renders the board to canonical Circuit JSON;
2. `@tscircuit/enclosure` consumes that Circuit JSON and the imported
   `enclosure.*` TSX;
3. the enclosure renderer produces a GLB;
4. `circuit-json-to-gltf` continues to produce the PCB/component scene; and
5. RunFrame/PoppyGL presents the PCB and enclosure together.

The integration may use an existing CAD asset/model reference to the generated
GLB, but it must not serialize enclosure topology or CSG operations into Circuit
JSON.

### 3. Consolidate connector aperture placement

Migrate the connector behavior into the explicit interaction-surface model:

- require `enclosure.cutoutaperture`;
- preserve transformed insertion-direction precedence;
- use cable-point inference only for board-plane x/y and mating-side evidence;
- source z from the part's interaction metadata;
- validate enclosure-face reach using component/CAD bounds; and
- report unresolved placement rather than creating a fallback opening.

### 4. Prototype non-connector interaction inference

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

### 5. Expand manufacturing outputs and constructions

After the migration and interaction model are proven:

- add process-specific STEP, 3MF, DXF, and assembly outputs;
- add additional construction families such as sleeves, card guides, modified
  prefab enclosures, sheet assemblies, and machined enclosures;
- grow process-specific design-rule profiles and DRC; and
- revisit the explicitly deferred API and interchange questions using evidence
  from completed designs.
