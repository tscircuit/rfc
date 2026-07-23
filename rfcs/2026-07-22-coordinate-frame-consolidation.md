# Proposal: Coordinate Frame Consolidation for CAD and 3D Rendering

## Status

Draft research and migration plan.

This RFC documents the coordinate frames currently used by Circuit JSON,
`@tscircuit/3d-viewer`, `circuit-json-to-gltf`, PoppyGL, JSCAD, Manifold, and
the supported CAD asset formats. It also proposes a staged consolidation of
coordinate-frame definitions and transformations.

The immediate motivation is a front/back disagreement discovered while
rendering parametric enclosure cutouts:

- the direct `3d-viewer` path displayed physically correct cutouts after core
  stopped swapping front and back walls;
- the Circuit JSON to GLB to PoppyGL path displayed the same JSCAD enclosure
  with front and back reversed relative to connector CAD models; and
- an attempted JSCAD-only mirror was paused because the exporter contains
  additional position, board, loader, and final-node transformations that must
  be understood as one system.

No new coordinate transform should be merged until the intended global frame
mapping is confirmed and protected by cross-representation tests.

### Initial implementation decision

For `cad_component.model_jscad`, the JSCAD plan loader converts circuit Z-up
geometry into the **intermediate Scene3D Y-up frame**, matching the OBJ loader
(`OBJ_Z_UP_TO_Y_UP`) and preserving X:

```text
Circuit (x, y, z) -> Scene (x, z, y)
```

Crucially, the loader must **not** negate X here. `GLTFBuilder`'s
`convertMeshToGLTFOrientation` already applies the single, canonical X-mirror
(and winding flip) to *every* mesh when exporting Scene3D -> glTF, and
`toGltfTranslation` mirrors each node's `center.x`. An earlier attempt used
`Circuit (x, y, z) -> (-x, z, y)` in the loader; combined with the builder's
mirror this negated the enclosure's X **twice** (net no-flip) while connectors
and the board were mirrored once, so enclosure cutouts landed on the wrong
left/right wall relative to their connectors. Keeping the loader's X un-negated
puts JSCAD enclosure geometry in the same frame as OBJ connector models before
the builder's shared mirror.

The mapping is defined in
`circuit-json-to-gltf/lib/utils/coordinate-transform.ts`
(`CIRCUIT_Z_UP_TO_GLTF_Y_UP`) and applied by the JSCAD plan loader.
Basis-vector, positive-Circuit-Y, existing JSCAD snapshot, prefab enclosure
per-wall PoppyGL, and a geometric connector/cutout wall-alignment regression
(`create-fdm-enclosure/tests/prefab-board-cutout-alignment.test.ts`) cover this
path.

This does not complete the broader consolidation of board, OBJ, STL, STEP,
GLB, camera, and placement conversions described below.

## Summary

tscircuit currently has two principal rendering worlds:

1. `@tscircuit/3d-viewer` renders Circuit JSON in a Three.js scene configured
   to remain in the Circuit JSON Z-up coordinate frame.
2. `circuit-json-to-gltf` converts Circuit JSON into a custom Y-up `Scene3D`
   representation and then emits glTF for PoppyGL and other glTF consumers.

Each CAD source format also has its own source convention:

- JSCAD plans used by tscircuit are authored in Circuit JSON Z-up coordinates;
- GLB/glTF is Y-up and right-handed;
- OBJ and STL do not reliably declare a canonical up axis;
- STEP may contain placement data but is currently given project-specific
  default transforms; and
- footprinter-generated models have their own established transform.

There is already a coordinate-transform utility in
`circuit-json-to-gltf`, but it is used only by some asset loaders. Board
geometry, JSCAD plans, CAD component positions, rotations, cameras, and final
glTF node translations bypass it. `3d-viewer` also contains a separate,
similar transform implementation with different defaults.

The proposed architecture is:

```text
source asset frame
        |
        v
format loader normalizes to canonical Circuit CAD local frame
        |
        v
model origin, scale, layer, and component placement in Circuit world frame
        |
        +-----------------------+
        |                       |
        v                       v
3d-viewer backend        glTF exporter backend
Circuit Z-up identity    one Circuit-to-glTF transform
```

This reduces the current format-by-renderer matrix into:

```text
N source-format to canonical adapters
+ M canonical to renderer/exporter adapters
```

## Terminology

### Coordinate frame

A coordinate frame defines:

- an origin;
- three basis vectors;
- axis names and directions;
- handedness; and
- units.

### Local model frame

The coordinates stored inside a CAD asset before it is placed on a component.

### Circuit CAD local frame

The normalized local frame expected by tscircuit:

- X and Y lie in the PCB plane;
- +Z points out of the component's mounting surface; and
- units are millimeters.

### Circuit world frame

The board-level Circuit JSON frame:

- +X and +Y lie in the PCB plane;
- +Z points out of the PCB top surface;
- the board center is normally near world X/Y zero; and
- units are millimeters.

### Renderer frame

The world coordinate frame used by a renderer or exporter after global
conversion.

## External coordinate conventions

### glTF 2.0

The glTF 2.0 specification defines:

- a right-handed coordinate system;
- +Y as up;
- +Z as forward; and
- -X as right.

Reference:

https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

This differs from the common camera-oriented description in which +X is
screen-right and +Z points toward the viewer. Both conventions can be
right-handed. Flipping both X and Z is a 180-degree rotation around Y, not a
handedness change.

### Three.js

Three.js uses a right-handed coordinate system. Its default object up vector is
+Y, and a default camera looks along its local -Z direction.

`@tscircuit/3d-viewer` does not use the default global frame. It configures the
scene and camera with +Z as up so Circuit JSON and JSCAD geometry can remain in
their native PCB-oriented frame.

### JSCAD and Manifold

JSCAD and Manifold operate on coordinates supplied by the caller. They do not
require one project-wide definition of up, forward, or board normal.

tscircuit currently authors JSCAD enclosure plans in Circuit JSON Z-up
coordinates.

### OBJ

OBJ does not provide a universal project-independent up-axis convention. Model
providers may use Y-up, Z-up, or application-specific orientation.

tscircuit therefore depends on:

- format defaults;
- `model_board_normal_direction`;
- model rotation offsets;
- model origin metadata; and
- part-specific corrections.

### STL

STL stores triangles without a standardized world frame, units, or semantic up
axis. The loader must be given project/model conventions.

### STEP

STEP can represent placements and units, but imported models may still require
normalization to the tscircuit component mounting frame.

## Current project frames

## Circuit JSON

Circuit JSON PCB and CAD placement is treated as right-handed and Z-up:

```text
+X: PCB plane
+Y: PCB plane
+Z: out of PCB top
```

Component PCB rotation is expressed around Circuit +Z.

Relevant definitions:

- `circuit-json/src/pcb/pcb_component.ts`
- `circuit-json/src/cad/cad_component.ts`
- `circuit-json/src/common/point3.ts`
- `circuit-json/src/cad/cad_model_conventions.ts`

## Core CAD emission

Core emits `cad_component.position` and `cad_component.rotation` in Circuit
world coordinates.

Important files:

- `core/lib/components/primitive-components/CadModel.ts`
  - calculates position relative to the PCB surface;
  - applies top/bottom layer behavior;
  - emits model URLs, unit scale, board-normal direction, and origin metadata.
- `core/lib/components/base-components/NormalComponent/NormalComponent.ts`
  - handles CAD model props attached to normal components.
- `core/lib/utils/pcb/transform-footprint-insertion-direction.ts`
  - transforms insertion direction through PCB rotation/layer.
- `core/lib/components/primitive-components/EnclosureCutoutAperture/`
  - resolves enclosure face, tangent offset, and board-relative Z extent.
- `core/lib/components/primitive-components/EnclosureFdmBox_doInitialCadModelRender.ts`
  - places generated JSCAD enclosure CAD in Circuit world coordinates.

Core should not contain renderer-specific front/back or axis flips.

## `@tscircuit/3d-viewer`

The direct viewer uses Three.js but configures it as Z-up:

```tsx
scene={{ up: new THREE.Vector3(0, 0, 1) }}
camera={{ up: [0, 0, 1] }}
```

File:

- `3d-viewer/src/CadViewerContainer.tsx`

Board geometry is constructed directly in the Circuit XY plane:

- `3d-viewer/src/BoardGeomBuilder.ts`
- `3d-viewer/src/soup-to-3d/index.ts`
- `3d-viewer/src/utils/manifold/create-manifold-board.ts`
- `3d-viewer/src/utils/manifold/process-cutouts.ts`

JSCAD plans are executed directly:

- `3d-viewer/src/three-components/JscadModel.tsx`

CAD placement and source-model normalization are handled by:

- `3d-viewer/src/AnyCadComponent.tsx`
- `3d-viewer/src/utils/cad-model-transform.ts`
- `3d-viewer/src/utils/cad-model-loader-transform.ts`
- `3d-viewer/src/three-components/MixedStlModel.tsx`
- `3d-viewer/src/three-components/GltfModel.tsx`
- `3d-viewer/src/three-components/StepModel.tsx`

`cad-model-loader-transform.ts` contains:

- a local `CoordinateTransformConfig`;
- point transformation code;
- format defaults; and
- basis-matrix generation.

This is similar to, but not identical with,
`circuit-json-to-gltf/lib/utils/coordinate-transform.ts`.

## `circuit-json-to-gltf`

`circuit-json-to-gltf` uses a custom `Scene3D` intermediate, not a Three.js
scene.

Definitions:

- `circuit-json-to-gltf/lib/types.ts`

### CAD position mapping

`circuit-json-to-gltf/lib/converters/circuit-to-3d.ts` currently maps:

```ts
const center = {
  x: cad.position.x,
  y: cad.position.z,
  z: cad.position.y,
}
```

That is an intermediate mapping:

```text
Circuit (x, y, z) -> Scene3D (x, z, y)
```

The current unit test in
`circuit-json-to-gltf/tests/unit/jscad-plan.test.ts` verifies:

```text
Circuit position (1, 2, 3)
-> Scene3D center (1, 3, 2)
```

### Final glTF node translation

`circuit-json-to-gltf/lib/gltf/gltf-builder.ts` later applies:

```ts
private toGltfTranslation(center): [number, number, number] {
  return [-center.x, center.y, center.z]
}
```

Therefore the current CAD node translation path is:

```text
Circuit (x, y, z)
-> Scene3D (x, z, y)
-> glTF node (-x, z, y)
```

This does not prove that every mesh vertex follows the same mapping.

### Existing coordinate-transform utility

File:

- `circuit-json-to-gltf/lib/utils/coordinate-transform.ts`

It defines:

- `CoordinateTransformConfig`;
- `applyCoordinateTransform`;
- `transformTriangles`; and
- `COORDINATE_TRANSFORMS`.

It is currently used by:

- `lib/loaders/stl.ts`;
- `lib/loaders/obj.ts`;
- `lib/loaders/step.ts`;
- `lib/loaders/glb.ts`;
- `lib/utils/get-default-model-transform.ts`; and
- `lib/utils/cad-mesh-placement.ts`.

It is not currently used by:

- JSCAD plan loading;
- PCB board mesh generation;
- PCB panel mesh generation;
- `cad_component.position`;
- `cad_component.rotation`;
- final glTF node translation;
- camera positions/targets; or
- some model-format-specific placement logic.

### Board mesh conversion

Board geometry uses custom conversion code:

- `circuit-json-to-gltf/lib/utils/pcb-board-geometry.ts`
- `circuit-json-to-gltf/lib/utils/triangles-from-loops.ts`
- `circuit-json-to-gltf/lib/utils/cut-board-mesh-outside-board-boundary.ts`
- `circuit-json-to-gltf/lib/utils/pcb-panel-geometry.ts`

`triangles-from-loops.ts` currently defines:

```ts
const toScenePoint = ({ x, y, z }) => ({
  x,
  y: z,
  z: -y,
})
```

This mapping differs from the intermediate CAD position mapping.

Some board-outline preparation also negates Y before `toScenePoint`, so the
effective transform depends on the path used to construct the board.

### JSCAD plan conversion

File:

- `circuit-json-to-gltf/lib/loaders/jscad-plan.ts`

Current behavior:

```ts
const yUpGeometry = rotateX(-Math.PI / 2, zUpGeometry)
```

This is equivalent to:

```text
(x, y, z) -> (x, z, -y)
```

This matches the board mesh helper's basic rotation but differs from CAD node
placement and some asset-loader mappings.

### Asset-loader conversion

Relevant files:

- `circuit-json-to-gltf/lib/loaders/obj.ts`
- `circuit-json-to-gltf/lib/loaders/stl.ts`
- `circuit-json-to-gltf/lib/loaders/step.ts`
- `circuit-json-to-gltf/lib/loaders/glb.ts`
- `circuit-json-to-gltf/lib/loaders/gltf.ts`
- `circuit-json-to-gltf/lib/loaders/footprinter.ts`
- `circuit-json-to-gltf/lib/utils/get-default-model-transform.ts`

Observed defaults include mappings equivalent to:

```text
Z_UP_TO_Y_UP:          (x, y, z) -> (x, -z, y)
Z_OUT_OF_TOP:          (x, y, z) -> (x, z, -y)
STEP_INVERTED:         format-specific mapping
OBJ_Z_UP_TO_Y_UP:      (x, y, z) -> (x, z, y)
FOOTPRINTER_MODEL:     mapping plus flips/rotations
```

These mappings combine:

- source-format frame normalization;
- board-normal correction;
- renderer-frame conversion; and
- historical part/model fixes.

Those are distinct responsibilities and should be separated.

## `jscad-to-gltf`

`jscad-to-gltf` is used by direct solver/debug tooling and provides its own
`axisTransform` option.

Example:

```ts
axisTransform: "jscad_y+ -> gltf_z+"
```

Its matrix (column-major, verified in `dist/index.js`) applies a single +90deg
rotation about X, i.e. `(x, y, z) -> (x, z, -y)`. This is a **proper rotation**
(determinant +1), Y-up, X preserved.

Contrast with `circuit-json-to-gltf`, whose net Circuit->glTF mapping is
`(-x, z, y)` (loader `(x, z, y)` then GLTFBuilder's canonical X-mirror). Both
are valid right-handed Z-up->Y-up mappings; they differ **only** by negating
both X and Z, which is a **180deg rotation about the vertical (Y) axis** (see
"Vertical-axis orientation" below). The naming and assumptions of the
`axisTransform` option must be reconciled with tscircuit's actual JSCAD usage,
which is currently Circuit Z-up.

Relevant package:

- `jscad-to-gltf`

## Vertical-axis orientation (front-facing convention)

The two JSCAD->glTF paths agree on **up** (Circuit +Z -> glTF +Y) but disagree
on the horizontal plane by a 180deg spin about vertical:

| Path | Net Circuit -> glTF | Circuit front (-Y) lands at |
|---|---|---|
| `jscad-to-gltf` (`jscad_y+ -> gltf_z+`) | `(x, z, -y)` | glTF **+Z** |
| `circuit-json-to-gltf` (production) | `(-x, z, y)` | glTF **-Z** |

This is not an alignment bug (a 180deg rotation preserves chirality and keeps
every connector aligned with its cutout). It is a **presentation** difference,
and it matters because most glTF viewers place their default camera on **+Z**
looking toward the origin:

- `<model-viewer>` default `camera-orbit` starts near +Z.
- A viewer that assumes "+Z is the front" will, under the production
  `(-x, z, y)` mapping, **load facing the back** of the model.

### Rule

Any tool that renders a standalone model and expects its default camera to show
the **front** must ensure Circuit front (-Y) maps to glTF **+Z**.

- **Combined board + connectors + enclosure renders** go through
  `circuit-json-to-gltf` directly and share one frame `(-x, z, y)`. Do **not**
  rotate individual meshes here - the connectors and enclosure must stay in the
  same frame, and the whole scene's default facing is a viewer/camera concern,
  not a per-mesh one.
- **Standalone enclosure previews** (the Cosmos `<model-viewer>` debugger and
  the solver PNG snapshots) render the enclosure alone, so they apply a
  180deg-about-vertical rotation to present the front to the default camera.
  This is done via `cad_component.rotation.z = 180` fed through the production
  pipeline, which composes to the `jscad-to-gltf` orientation `(x, z, -y)`:

  ```text
  loadJscadPlan (x, z, y)
    -> rotate 180deg about scene-Y (-x, z, -y)
    -> GLTFBuilder X-mirror (x, z, -y)   == jscad-to-gltf front-facing frame
  ```

  Implemented in
  `create-fdm-enclosure/site/create-enclosure-preview-glb.ts`
  (`renderEnclosureJscadGlb`). Poppygl snapshot cameras that target the cutout
  wall must therefore view from glTF **+Z** (positive-Z `camPos`), not -Z.

### Invariant to protect

Keep a test asserting that a known front feature renders toward glTF +Z in any
front-facing preview, so no tool silently reverts to showing the back when it
intends to show the front. This is currently guarded by
`create-fdm-enclosure/tests/fdm-enclosure-debugger-preview.test.ts`: it renders
the standalone enclosure preview from a **+Z** camera and snapshots the cutout
wall, so removing the front-facing rotation (or reverting to a back-facing
frame) makes the +Z camera see a blank wall and fails the snapshot.

## PoppyGL

PoppyGL consumes glTF/GLB scene coordinates. It does not understand Circuit
JSON enclosure faces or PCB coordinate semantics.

Important files:

- `poppygl/lib/gltf/`
- `poppygl/lib/render/`
- `poppygl/cli/renderGLTFToPNGBuffer.ts`

Tests live in:

- `poppygl/tests/`

Feature-specific visual regressions should usually remain in the feature
package and use PoppyGL as the renderer. For example:

- `create-fdm-enclosure/tests/prefab-board-poppygl.test.ts`

## Observed enclosure failure

The enclosure investigation exposed two separate compensations.

### Core wall-name compensation

Core previously swapped:

```text
front <-> back
```

before constructing the FDM solver input.

That changed the semantic JSCAD plan itself and made the direct `3d-viewer`
path incorrect. Core now preserves physical wall names.

File:

- `core/lib/components/primitive-components/EnclosureCutoutAperture/get-solver-wall.ts`

### Proposed JSCAD-loader compensation

A later experiment mirrored JSCAD Y before the existing X rotation in
`circuit-json-to-gltf`.

That experiment was reverted pending this coordinate-frame analysis because it
modified only one mesh path and did not account for:

- board geometry;
- OBJ connectors;
- CAD node positions;
- final node translations;
- rotations; or
- cameras.

## Problem statement

There is no single authoritative transformation from:

```text
Circuit CAD local frame
-> Circuit world frame
-> renderer/exporter frame
```

Instead:

- source-format normalization is duplicated;
- global renderer transforms are mixed into asset defaults;
- board meshes use separate conversion logic;
- JSCAD uses a hardcoded rotation;
- positions and rotations use hand-written mappings;
- the glTF builder applies a late X translation flip; and
- `3d-viewer` and `circuit-json-to-gltf` maintain separate transform tables.

This makes local fixes fragile. A correction for one renderer or asset type can
silently reverse another.

## Required design decisions

### 1. Canonical Circuit CAD frame

Confirm and document:

```text
+X meaning
+Y meaning
+Z meaning
handedness
units
component-local origin
top/bottom mounting behavior
```

Proposed:

```text
frame id: circuit_cad_z_up
+X/+Y: PCB plane
+Z: out of top mounting surface
right-handed
millimeters
```

### 2. Canonical Circuit world to glTF transform

The intended mapping must be confirmed with maintainers.

One candidate, based on the glTF semantic axes and current node translation,
is:

```text
Circuit (x, y, z) -> glTF (-x, z, y)
```

This is a proper right-handed rotation, not a reflection.

An alternative mapping currently used by board/JSCAD mesh code is:

```text
Circuit (x, y, z) -> Scene3D (x, z, -y)
```

These differ by a 180-degree Y rotation. The project must select one semantic
mapping and apply it everywhere.

### 3. Intermediate `Scene3D` frame

Decide whether `Scene3D`:

- is already in final glTF world coordinates;
- is a renderer-neutral Y-up frame; or
- is a legacy intermediate with another conversion in `GLTFBuilder`.

The selected contract must remove hidden transformations such as
`toGltfTranslation()` unless they are part of the documented frame.

### 4. Source-format default frames

Define explicit defaults for:

- OBJ;
- STL;
- STEP;
- GLB/glTF;
- JSCAD;
- footprinter models; and
- generated PCB geometry.

Format defaults are fallbacks. Explicit metadata such as
`model_board_normal_direction` must take precedence.

### 5. Reflection policy

Coordinate mappings with determinant -1 require:

- triangle winding correction;
- normal correction;
- tangent handedness correction; and
- careful treatment of rotations.

The shared transform API must distinguish rotations from reflections instead
of representing both as arbitrary sign changes without validation.

### 6. Default-camera / front-facing orientation

Independent of the canonical transform chosen in decision 2, the project must
define which glTF axis is "front" for standalone-model previews so viewers do
not load facing the back. See "Vertical-axis orientation (front-facing
convention)".

- Canonical rule: Circuit front (-Y) should map to glTF **+Z** for any preview
  whose default camera is expected to show the front (glTF viewers, incl.
  `<model-viewer>`, default to a +Z camera).
- If decision 2 keeps the production net mapping `(-x, z, y)` (front at -Z),
  standalone previews must apply a documented 180deg-about-vertical rotation
  (front-facing), while combined board+connectors scenes keep the shared frame
  and treat facing as a camera concern only.
- Protect with an invariant test that a known front feature renders toward
  glTF +Z in front-facing previews.

## Proposed shared architecture

## Shared frame definitions

Create a shared package or low-level package module, for example:

```text
@tscircuit/cad-geometry
@tscircuit/cad-coordinate-frames
@tscircuit/cad-loader
```

It should define:

```ts
type CoordinateFrameId =
  | "circuit_cad_z_up"
  | "circuit_world_z_up"
  | "three_viewer_z_up"
  | "gltf_y_up"
  | "obj_default"
  | "stl_default"
  | "step_default"

interface CoordinateFrame {
  id: CoordinateFrameId
  basisX: Vec3
  basisY: Vec3
  basisZ: Vec3
  handedness: "right" | "left"
  unitScaleToMm: number
}
```

The implementation should use matrices as the source of truth:

```ts
getFrameTransform(sourceFrame, targetFrame): Mat4
transformPoint(point, transform): Point3
transformDirection(direction, transform): Vec3
transformNormal(normal, transform): Vec3
transformRotation(rotation, transform): Quaternion
transformMesh(mesh, transform): CanonicalCadMesh
```

### Canonical loaded asset

Every asset loader should return a backend-neutral canonical representation:

```ts
interface CanonicalCadAsset {
  mesh: CanonicalCadMesh
  materials: CadMaterial[]
  bounds: Bounds3
  frame: "circuit_cad_z_up"
}
```

### Source loaders

```ts
loadObjAsset(options): Promise<CanonicalCadAsset>
loadStlAsset(options): Promise<CanonicalCadAsset>
loadStepAsset(options): Promise<CanonicalCadAsset>
loadGltfAsset(options): Promise<CanonicalCadAsset>
loadJscadAsset(options): Promise<CanonicalCadAsset>
loadPcbBoardAsset(options): Promise<CanonicalCadAsset>
```

Each loader accepts or resolves a source frame but always returns the canonical
Circuit CAD frame.

### Placement

Model origin correction and component placement occur after source
normalization:

```text
source frame normalization
-> unit scaling
-> model origin correction
-> board-normal orientation
-> top/bottom layer transform
-> component rotation
-> component translation
```

### Backend conversion

`3d-viewer`:

```text
canonical Circuit world -> identity Z-up Three scene
```

`circuit-json-to-gltf`:

```text
canonical Circuit world -> one documented Circuit-to-glTF matrix
```

No individual source loader should contain a PoppyGL-, Storybook-, camera-, or
enclosure-specific correction.

## Staged migration plan

### Phase 0: Freeze behavior with coordinate invariants

Add small asymmetric fixtures that make axis direction unambiguous:

- colored/labelled +X, +Y, and +Z markers;
- one feature translated only in +X;
- one feature translated only in +Y;
- one feature translated only in +Z;
- an asymmetric connector/cutout pair; and
- a non-centered board.

Add the same expected-world tests to:

- `3d-viewer`;
- `circuit-json-to-gltf`;
- PoppyGL visual snapshots; and
- direct JSCAD/Manifold geometry tests.

Required invariant:

```text
a local model translation and equivalent cad_component.position
must produce the same world location
```

### Phase 1: Confirm and encode frame definitions

- Confirm the intended Circuit-to-glTF mapping with maintainers.
- Add named frame definitions.
- Add basis-vector and handedness tests.
- Add determinant/reflection checks.
- Document the selected mapping in Circuit JSON and exporter documentation.

### Phase 2: Consolidate transform utilities

- Extract `CoordinateTransformConfig` and matrix helpers.
- Replace the separate transform implementations in:
  - `3d-viewer/src/utils/cad-model-loader-transform.ts`; and
  - `circuit-json-to-gltf/lib/utils/coordinate-transform.ts`.
- Keep compatibility wrappers while call sites migrate.

### Phase 3: Normalize source loaders

Migrate:

- OBJ;
- STL;
- STEP;
- GLB/glTF;
- JSCAD; and
- footprinter models.

Each loader returns canonical Circuit CAD geometry.

Remove renderer-frame conversion from loader defaults.

### Phase 4: Consolidate placement

Share:

- model origin handling;
- unit scale;
- board-normal direction;
- component position;
- component rotation;
- layer flipping; and
- fit-to-bounds behavior.

Replace the duplicated behavior in:

- `3d-viewer/src/utils/cad-model-transform.ts`; and
- `circuit-json-to-gltf/lib/utils/cad-mesh-placement.ts`.

### Phase 5: Migrate generated PCB geometry

Use the shared frame transform for:

- board mesh;
- panel mesh;
- plated holes;
- non-plated holes;
- PCB cutouts;
- board textures; and
- copper geometry.

Remove custom `toScenePoint()` and one-off `rotateX()` conversions where
possible.

### Phase 6: Make `Scene3D` explicit

- Declare the frame of every `Scene3D` point, mesh, camera, and light.
- Remove any undocumented final transform in `GLTFBuilder`.
- Apply the one Circuit-to-glTF matrix exactly once.

### Phase 7: Cross-renderer parity

For each representative fixture:

- render in `3d-viewer`;
- export through `circuit-json-to-gltf`;
- render the GLB with PoppyGL; and
- compare labelled axis/placement expectations.

Required fixtures:

- prefab board with enclosure cutouts and connector CAD;
- top and bottom components;
- asymmetric board outline;
- rotated OBJ connector;
- STEP component with origin metadata;
- STL component;
- footprinter model; and
- JSCAD enclosure.

### Phase 8: Remove compatibility transforms

After parity:

- remove historical USB/model-specific flips that are superseded by explicit
  frame metadata;
- remove duplicated transform tables;
- remove JSCAD-only renderer compensation;
- remove final node sign corrections not present in the documented frame; and
- document migration behavior for saved Circuit JSON.

## Testing strategy

### Basis tests

For every frame transform:

```ts
expect(transform(+X)).toEqual(expectedX)
expect(transform(+Y)).toEqual(expectedY)
expect(transform(+Z)).toEqual(expectedZ)
```

Verify:

- basis orthogonality;
- determinant;
- handedness;
- inverse transform; and
- round-trip tolerance.

### Mesh tests

- Asymmetric mesh bounding boxes.
- Triangle winding.
- Outward normal direction.
- Material assignment after mesh splitting.
- Model origin after transform.

### Placement tests

- Local +Y translation equals component world +Y placement.
- Component rotation matches rotated local geometry.
- Bottom-layer placement mirrors only the intended mounting axis.
- Board center offsets apply equally to board and CAD models.

### Visual tests

Use:

- 3d-viewer Storybook fixtures;
- `circuit-json-to-gltf` snapshot tests; and
- PoppyGL PNG snapshots.

Feature-specific snapshots remain in their owning package. For example:

- `create-fdm-enclosure/tests/prefab-board-poppygl.test.ts`

## Compatibility and versioning

Coordinate-frame behavior affects:

- saved Circuit JSON rendering;
- GLB/GLTF output;
- screenshots;
- camera presets;
- STEP/OBJ/STL placement;
- cached model assets; and
- visual regression snapshots.

The migration should therefore:

- use additive metadata where possible;
- gate intentional compatibility changes behind package-version updates;
- publish loader/renderer changes in dependency order;
- regenerate affected visual snapshots deliberately; and
- document any models that require explicit source-frame metadata.

## Dependency and release order

If a shared package is introduced:

```text
shared coordinate-frame package
        |
        +--> 3d-viewer
        |
        +--> circuit-json-to-gltf
        |
        +--> downstream CLI/runframe/PoppyGL snapshots
```

Cross-repository local development should rebuild bottom-up using the tscircuit
workspace tooling.

## Open questions

1. Is the intended Circuit-to-glTF mapping `(-x, z, y)`?
2. Is `Scene3D` intended to be final glTF coordinates or another intermediate?
3. Should glTF semantic +Z "forward" align with Circuit +Y?
4. Which default frame should OBJ use when no metadata is present?
5. Which STEP placement information can be trusted directly?
6. Should JSCAD plans be required to use Circuit CAD local coordinates?
7. Should source-frame metadata become a typed Circuit JSON field?
8. How should reflections be represented and validated?
9. Should camera presets be defined in Circuit world and transformed per
   backend?
10. Which historical model corrections can be removed after normalization?

## Acceptance criteria

This proposal is complete when:

1. Circuit, canonical CAD, Three viewer, Scene3D, and glTF frames are explicitly
   documented.
2. A shared transform implementation is used by both `3d-viewer` and
   `circuit-json-to-gltf`.
3. Every supported source format normalizes to the canonical Circuit CAD frame.
4. Component placement is implemented once and reused.
5. Board and JSCAD geometry use the same global transform as component CAD.
6. The prefab enclosure connectors and cutouts align in both 3d-viewer and
   PoppyGL without renderer-specific wall swaps.
7. Basis, mesh, placement, and cross-renderer visual tests pass.
8. No enclosure-specific coordinate compensation remains in core or the FDM
   solver.
