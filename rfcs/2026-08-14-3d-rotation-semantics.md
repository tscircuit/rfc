# Proposal: 3D Rotation Semantics

## Status

Proposed. Nothing here is implemented.

Found while specifying `assembly_component` for
`2026-08-14-enclosure-mounting-hardware.md`, which had to decide whether to carry
`position` + `rotation` the way `cad_component` does. It does not — its geometry
is generated, so orientation lives in the plan — but the question surfaced a
defect in `cad_component.rotation` that outlives the enclosure work and is not
the enclosure RFC's to fix.

| Area | State |
| --- | --- |
| `cad_component.rotation` has no declared unit | measured |
| `cad_component.rotation` has no declared application order | measured |
| The two shipped consumers apply **different orders** | measured |
| Fix: adopt the existing `rotation` unit type, specify XYZ, correct the outlier | proposed |
| Whether the format should move to quaternions or matrices | proposed answer: no, with reasons |

---

## The defect

`cad_component.rotation` is the only rotation in Circuit JSON with neither a unit
nor an application order.

**No unit.** Circuit JSON has a `rotation` unit type in `src/units` that accepts
`90`, `"90deg"` or `"1.5rad"` and normalizes to degrees. Every scalar rotation
field uses it: `pcb_courtyard_rect`, `pcb_silkscreen_oval`, `schematic_arc`,
`simulation_voltage_source` and others. `cad_component.rotation` is declared
`point3.optional()` — three bare numbers — so it accepts none of those spellings,
and its degrees-ness exists only in the consumers that divide by 180/pi.

**No order.** Three Euler angles do not describe an orientation until you say in
what sequence they apply. The schema does not say, the field has no docstring,
and the two shipped consumers have each supplied their own answer:

| Consumer | Order applied | Space |
| --- | --- | --- |
| `3d-viewer` | three.js `Euler` default, **XYZ** (`utils/cad-model-transform.ts`; one call site names `"XYZ"` explicitly) | circuit space |
| `circuit-json-to-gltf` | hand-rolled **Y, then X, then Z** (`gltf/geometry.ts`, `transformMesh`) | scene space, after remapping `{x: rot.x, y: rot.z, z: rot.y}` — so **Z, X, Y** in circuit space |

They agree whenever at most one axis is non-zero. Components are rotated about Z
essentially always, so that is every case anyone has had reason to test, and the
disagreement shows up only on compound rotations.

This is the same shape as the `front`/`back` defect the ecosystem already
retired: two defensible readings of an underspecified name, no test that
distinguishes them, and each consumer correct by its own lights.

`transformMesh` carries its own admission:

```ts
// Apply rotation (simplified - proper rotation would use quaternions)
```

It applies three axis rotations to every vertex in sequence and then rotates
normals in a second pass. Worth noting that glTF's node type in that same package
already declares `rotation?: [number, number, number, number]` — the spec's unit
quaternion — and the builder never sets it, baking orientation into vertex
positions instead.

---

## Proposal

### 1. Give the field a unit

Declare 3D rotation as a triple of the existing `rotation` unit type rather than
`point3`. It costs nothing, it makes `"90deg"` legal where every other rotation
field already accepts it, and it removes "degrees or radians?" from the reader's
mind. `point3` is a *position* type; using it for angles was the original slip.

### 2. Specify the order as XYZ, where the field is defined

XYZ because it is three.js's default and what `3d-viewer` already does, so the
specification ratifies the majority behaviour instead of inventing a third one.

The rule belongs in a **docstring in `circuit-json`** — not a README, not an
`AGENTS.md`. The precedent is explicit: the workspace guide names the docstring
in `src/pcb/properties/insertion_direction.ts` as *the authoritative reasoning*
for the direction vocabulary, and that docstring is twenty lines of reasoning
attached to the type it governs. A docstring travels into every TypeScript
consumer on hover, which is where the ambiguity actually bites, and `circuit-json`
has no `AGENTS.md` for it to compete with.

`src/cad/cad_model_conventions.ts` already exists and already holds per-format
axis conventions (`cadModelDefaultDirectionMap`), which makes it the natural
home. A `src/cad/properties/cad_rotation.ts` would match the `src/pcb/properties/`
pattern equally well.

### 3. Fix the outlier, with a quaternion *in the implementation*

`circuit-json-to-gltf`'s `transformMesh` becomes wrong the moment the order is
specified, and it is worth replacing independently: hand-rolled sequential trig
is how the order got lost in the first place. Either compose a quaternion, or
stop baking orientation into vertices and emit glTF's `node.rotation`, which the
package has typed and ignores.

---

## Why not move the format to quaternions or matrices

Both are order-free, which is the property we want, so this deserves a straight
answer rather than a dismissal.

**A quaternion removes one of the two orders, and it is the one we have a bug
in.** An orientation expressed as a quaternion has no axis sequence to specify.
But composition order survives untouched — `q1*q2 != q2*q1` — so chaining board to
component to model asset still has to be specified, and that is the order the
workspace guide already warns about: "`compose(a, b)` applies **b** first, and
rotations and reflections do not commute".

Against that:

- **Legibility.** `{x: 0, y: 0, z: 0.7071, w: 0.7071}` against `{x: 0, y: 0, z: 90}`,
  in the artifact people read and diff most often.
- **Two new validity concerns.** A quaternion must be unit-length — an
  unnormalized one is nonsense, or a hidden scale — and it double-covers, so `q`
  and `-q` are the same orientation and two records can differ literally while
  meaning identically.
- **Migration** of every existing `cad_component.rotation` and every consumer, to
  fix a case no shipped design exercises.

A 4x4 matrix has the same order-free property with worse legibility, admits scale
and shear the field should not permit, and would be a new type: the workspace's
existing `transformation-matrix` helper is **2D**.

**The bug is that two consumers disagree, not that Euler angles are
inexpressive.** Specification closes the disagreement at near-zero cost; a
quaternion or matrix field closes it by making disagreement unrepresentable, at
the cost of a format migration. Use quaternions *inside* the renderers, where
"proper rotation would use quaternions" was always true, and leave the
interchange representation legible.

If the format should ever become order-free, that is a deliberate format-wide
decision covering every rotation field at once, not a patch to whichever one a
feature happened to touch.

---

## Also worth fixing while here

- **The workspace guide points at documentation that does not exist.**
  `~/src/tscircuit/AGENTS.md` says the renderer frames live "in each repo's
  `AGENTS.md`" for `3d-viewer` and `circuit-json-to-gltf`. `3d-viewer` has no
  `AGENTS.md` at all, and `circuit-json-to-gltf`'s does not mention coordinates
  or rotation. That domain law currently lives nowhere, which is plausibly how
  two renderers came to disagree unnoticed.
- **A test that can actually fail.** Any fixture with rotation on a single axis
  passes under every order. A regression test here must use a compound rotation —
  two non-zero axes, at angles that are not multiples of 90 degrees — and assert
  a transformed point rather than restating the transform.
