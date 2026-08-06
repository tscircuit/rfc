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

## Status

Substantially implemented, in a different package layout than this document
originally proposed.

| Area | State |
| --- | --- |
| `assembly.device`, `enclosure.fdm.box`, `enclosure.cutoutaperture` | implemented |
| Typed Circuit JSON records (`source_assembly_device`, `source_fdm_enclosure`, `source_cutout_aperture`, `cad_fdm_enclosure`) | implemented |
| Face-relative aperture placement on all six faces | implemented |
| Aperture depth, and its derivation from a part's measured body | implemented |
| One CAD record per printed part (`enclosure_part`) | implemented |
| Canonical rendering through `circuit-json-to-gltf` and the 3D viewer | implemented |
| STEP / 3MF / DXF outputs | not started |
| Enclosure and assembly DRC | deferred by design (see below) |
| Non-connector part-family inference beyond exact placement | partial |

**The elements live in `core`, not in an enclosure package.** This document
planned a single `@tscircuit/enclosure` owning both the authoring elements and
the geometry. What shipped splits them: `core` owns the elements and the Circuit
JSON emission, `@tscircuit/props` owns the props, and
`@tscircuit/create-fdm-enclosure` owns the solver — a pure,
process-specific geometry package that knows nothing about React or the renderer
tree, and that a CNC or sheet-metal sibling can be written against.

That split fell out of a constraint this document did not anticipate: an
enclosure needs the *rendered* board (component bodies, insertion directions,
measured CAD bounds), so the elements must participate in core's render passes
rather than post-process its output. Keeping the solver separate preserves what
the enclosure package was for — one place to add a manufacturing process — while
letting the elements sit where the facts are.

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

    <enclosure.fdm.box boardRef=".B1" />
  </assembly.device>
)
```

The enclosure specification answers **how the product is enclosed**. The
cutout-aperture specification answers **what opening a particular part
requires**. Aperture placement combines explicit part metadata with
part-family-specific inference.

The working `pcb-enclosure` reference implementation currently demonstrates:

- an FDM-first, two-part box with a base and lid, emitted as one CAD record per
  printed part;
- PCB mounting posts or external corner fastening ears;
- automatic placement of explicitly declared apertures on any of the six faces,
  for connectors and non-connector parts alike;
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
| `disableCutouts` | Disable placement of apertures explicitly declared by parts. Declared apertures are placed by default; openings are never invented from body bounds. |

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

Until that DRC exists, generated enclosure features are **not** checked against
anything inside the enclosure. Known consequences of the current geometry-only
implementation:

- the friction-fit lid lip is clamped only to the base cavity, so a
  `lidLipDepth` greater than the available `topHeadroom` will intersect the PCB
  and any component near the board edge without an error or warning;
- printed features are not checked against component bodies, only against the
  shell they belong to; and
- an aperture is validated against its own wall, not against the part that is
  supposed to reach it.

These are clearance rules, not geometry bugs. They belong to the deferred
enclosure/assembly DRC pass and must not be patched piecemeal into individual
geometry stages: checking the lip against the PCB alone would still miss
components, connectors, and hardware.

### Current reference coverage

The prefab-board reference example exercises:

- five M3 PCB supports;
- two USB-C receptacles;
- Micro-USB, USB-A, DC barrel, 3.5 mm audio, and SMA connectors;
- tactile switches with 15 mm plungers, which exit through the lid;
- concrete supplier footprints, silkscreen outlines, OBJ models, and aperture
  metadata; and
- twelve declared apertures automatically placed across **all six faces**,
  including lid and floor.

Each wall and face is additionally snapshotted straight on, so a cutout that
drifts off its connector is visible rather than merely unasserted.

## Cutout Aperture Specification

An enclosure opening is an inherent, part-owned mechanical requirement. A part
that requires an opening declares an `<enclosure.cutoutaperture>` beside its
footprint and CAD model.

**Status: implemented**, including the face-relative placement contract that was
previously carried as a separate proposal
(`2026-07-24-enclosure-face-apertures.md`, now folded into this section). What
remains open is listed under [Deferred](#deferred-aperture-work).

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
packages and are retired ecosystem-wide. And `top` was overloaded three ways at
once: as an `EnclosureFace` it meant **+Z**, as an insertion direction
(`from_top`) it means **+Y**, and as a PCB layer it means the +Z *side*. Naming
the axis outright removes both ambiguities and matches the published
`InsertionDirectionCartesian` spelling (`from_x_pos`, …), which uses `_pos`/`_neg`
because Circuit JSON enum values must be snake_case.

Core's `BoardWall` uses the same six names, so converting a board wall to an
enclosure face is an identity rather than a lookup table. That is the point:
core once swapped the +Y and −Y walls in that conversion to compensate for a
renderer bug, and an identity leaves nowhere for such a flip to hide.

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

A cutout is generated only when a part or enclosure author explicitly supplies an
aperture. Components without one do not receive an inferred opening. Declared
apertures are placed automatically unless `disableCutouts` is set. Automatic
placement never invents aperture existence, shape, or size. Body and CAD bounds
may help place or validate a requested feature; they never imply that a component
needs an enclosure opening.

### Placement across the face

An aperture supplies `face` plus `center`, an interaction point in **board
coordinates relative to the board centre**. The enclosure layer projects that
point onto the face: the two coordinates tangent to the face position the
opening, and the coordinate along the face normal is discarded. Callers never
decide which axis matters.

`widthDimensionOffset` and `heightDimensionOffset` then move the opening's centre
across that face, along the same two axes its `width` and `height` are measured
in. Both may be negative.

**These replaced `zExtentAboveBoard`**, which only made sense on the four walls:
on the lid and the floor an opening does not move in Z at all, so a "Z extent" had
no meaning there. Sharing a frame with the dimensions is the point — on a side
face `heightDimensionOffset` runs the way `height` does, and on a horizontal face
both follow the part's own rotation, exactly as the opening itself does. There is
no separate Z quantity left to reason about.

Zero means *wherever the part puts it*, which is usually right:

- **Side faces** centre the opening on the part's body above the board, taken
  from `componentBody.aboveBoardHeight` — the model's measured bounds. An opening
  lines up with the connector it serves without anyone computing a height. A part
  with no measured bounds falls back to half the opening's own margin-inflated
  height, resting its lower edge on the mounting surface.
- **Horizontal faces** centre on the part's own position, and both offsets turn
  with the part.

`heightDimensionOffset` runs **outward from the mounting surface** on a side face:
up from the board top for a top-mounted part, down from the board bottom for a
bottom-mounted one (`boardSide`, default `"top"`). Like the default it shifts, it
describes the part rather than where the part was placed, so the same authored
number is correct on either side of the board. A negative value pulls the opening
back toward and past the board — needed when a cable jacket is fatter than the
connector it plugs into. The binding constraint is that the opening must not cut
into the enclosure floor.

This is why the offsets are expressed as *dimension* offsets rather than as
caller corrections in the board frame, which an earlier draft proposed: a
correction framed in world axes has to be recomputed whenever inference changes,
while an offset in the face's own frame describes the part and stays valid.

### Depth: the third aperture dimension

`depth` is the opening's size along the face normal — how deep the part is, in
the direction it pokes through. The cut is projected that far inboard, so nothing
behind the face (the lid lip today, mounting bosses later) is left obstructing a
part that reaches past the wall.

Because it is the face-normal dimension, what it cuts is whatever material lies
along that normal, which is generally **not** the face it entered. A large `z_pos`
opening in a corner is bounded in X and Y by `width` and `height`, and its depth
relieves the side walls it overlaps — otherwise the lid would open above a part
while the wall stayed intact beside it.

**An authored depth is rendered as authored, on every face.** Nothing is capped to
the cavity: a deep enough opening reaches the shell on the far side and cuts it
too. That is deliberate. Capping was tried and removed, because it was applied
inconsistently — the four side faces were never capped, so the same authored
number meant "as drawn" on a wall and "as much as fits" on the lid — and because
silently cutting a shallower hole than requested is its own defect: the part fouls
the shell and the model gives no sign why.

When `depth` is not authored, an adapter may instead supply `componentBody`: the
part's authored body `size` in its own frame, the `rotation` it is placed at, the
board-frame `footprint` it occupies, and `aboveBoardHeight`, how far it reaches
above the board. This package projects that envelope onto the face normal and
uses the result, taking the footprint as a floor since pad fans and courtyards can
reach further inboard than the body itself.

**A derived depth is converted into the face's own datum first, and this is
load-bearing.** `aboveBoardHeight` is measured from the *board*; a depth on a
horizontal face is measured from the *plate's outer surface*, a whole cavity
away. Using the reach raw produced a 15 mm cut measured down from the lid on a
19.35 mm box, ending 0.15 mm inside the floor — a circular pocket in the bottom of
every box carrying a tall pushbutton. Stated as one span in one frame, the cut
runs from the plane the part is mounted on up to whichever is higher, the top of
the part or the outer face of the plate; only the part of that span inside the
shell removes anything, so the derived depth is `|plateOuter − mountZ|`. Both ends
matter: the upper bound is why a 1 mm part still gets a hole clean through the
plate, and the lower bound is why a 400 mm part cannot reach the plate at the far
end.

The projection is one scalar: it sets how deep the opening travels, **not** how
wide or tall it is. Those still come from the aperture's own
`width`/`height`/`radius`, so a body wider than its aperture is not relieved. Full
body-envelope clearance — subtracting the whole part from the shell so nothing
fouls it — is a separate and still unimplemented concern.

For through-hole and side-entry components, `componentBody.size.z` is taller than
the part's reach above the board, because it spans the pins and shell hanging
below it. `aboveBoardHeight` is the honest number and is preferred wherever
present; `size.z` remains a poor fallback for parts whose model was never
measured. Measure the model, or authorise `depth` explicitly.

### Shell routing

An aperture is subtracted only from the parts whose faces it can reach: `z_pos`
to the lid, `z_neg` to the base, and side faces to both, so an opening straddling
the base/lid seam is split between them. A `z_pos` or `z_neg` aperture takes its
extent along the normal from the plate it pierces, so a lid cutout is bounded by
`lidThickness` and a floor cutout by `floorThickness`.

The lid is additionally raised, when `topHeadroom` was not authored, so that it
and its lip clear every side-face aperture: half a hole cut in the base and half
in a lid that slides on afterwards is not a hole, it is a notch in two pieces
that no part can pass through.

### Resolution order

Face selection, in precedence order:

1. transformed `pcb_component.insertion_direction` → face (`from_above` → `z_pos`
   on a top-mounted part, `z_neg` on a bottom-mounted one), else
2. part-family inference, else
3. nearest reachable face by distance from the component body.

An explicit `face` prop is **not** implemented and deliberately sits below the
inferred value in priority when it is: a part's insertion direction is a fact
about the part, while a face override is a statement about one board. The
override is wanted for parts whose direction cannot be expressed — an aperture
serving something that is not a connector at all — and until such a case is in
hand there is nothing to design against.

Then, within the chosen face:

1. connector families: `pcb_component.cable_insertion_center` projected onto the
   face;
2. all other families: `pcb_component.center` projected onto the face — which is
   **exact**, so horizontal-face apertures need no inference at all;
3. `componentBody` supplies the default centre along `height` on a side face;
4. `widthDimensionOffset`/`heightDimensionOffset` are applied last.

`@tscircuit/infer-cable-insertion-point` is inherently two-dimensional: it
examines pads, holes, silkscreen, bounds and insertion direction to infer a
board-plane point and mating side, and cannot identify an opening's height. That
is precisely the gap `componentBody.aboveBoardHeight` fills, which is why the
height default is measured from the model rather than inferred.

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

`z_extent_above_board` is **not** part of the contract. It was replaced before
release rather than deprecated after — the whole reason the placement fields were
settled while the schema was still a draft.

`cad_fdm_enclosure` carries `enclosure_part` (`"base" | "lid"`, extensible to
fasteners and inserts), one record per printed part rather than one per
enclosure. Parts are made, handled and inspected separately, and the first thing
anyone does with an enclosure on screen is hide the lid to see the board inside —
impossible if the two arrive fused into one plan.

Deliberately absent from both records: any indication of how a part should be
*shown*. Translucency was briefly a schema field and is now a viewer setting, per
part and at runtime. It changes no geometry and no export, so it never belonged in
the artifact manufacturing reads.

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

- **An explicit `face` prop**, for openings whose direction cannot be inferred
  from the part. Everything shipped so far resolves from insertion direction and
  mounting layer, which is why this has not been needed.
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

### Open questions

1. For a part mounted on the board bottom with `from_above`, is the correct face
   `z_neg` (mates through the floor) or an error (mates into the board)?
2. Should a horizontal aperture support a recessed pocket — a Z datum below the
   plate's outer surface — or is "through the plate" always sufficient?
3. Are dimension offsets applied before or after face-containment validation?
   Before means a nudge can produce an actionable error; after means a nudge can
   silently push an opening off its face.

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
`@tscircuit/props` and export the imported `assembly.device` component from
`pcb-enclosure`, later `@tscircuit/enclosure`:

- accept an optional product-level `name`;
- contain boards, enclosure specifications, and later assembly occurrences;
- retain children in the renderer tree;
- emit no source, schematic, PCB, CAD, or subcircuit record; and
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
3. the enclosure renderer appends **typed** `cad_fdm_enclosure` records, one per
   printed part, carrying `model_jscad`;
4. `circuit-json-to-gltf` executes the serialized plans and composes the
   PCB/component/enclosure scene; and
5. RunFrame, CLI workers, saved builds, and static viewers consume the same
   canonical Circuit JSON without an out-of-band artifact channel.

Step 3 deliberately does **not** append synthetic source/PCB owners, as an
earlier draft of this plan proposed. `cad_component` requires PCB ownership,
which forced a zero-size `pcb_component` whose placement and obstruction
semantics then had to be disabled by hand — a record that existed only to satisfy
a foreign key, and that every consumer had to learn to ignore. A generated
enclosure part has no PCB owner because it is not on the PCB; a typed record says
so directly. The plan is authored in Circuit world coordinates, so none of
`cad_component`'s asset-normalization fields (model origin, board normal, anchor,
object fit) apply either — `position` alone places it.

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
