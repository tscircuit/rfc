# Proposal: Enclosure Face Apertures

## Status

**Partially implemented.** The face vocabulary and centered top/bottom apertures
are built; caller-adjustable offsets are deferred.

Implemented:

- `EnclosureFace` covers all six faces, and `ResolvedEnclosureAperturePlacement`
  carries a full 3D `center` already projected onto the face plane, so geometry
  stages never re-derive placement.
- `EnclosureApertureInput` takes `{ face, center: {x, y} }` in board coordinates
  instead of `{ wall, offset }`. The enclosure layer projects that point onto the
  face, which removes core's need to decide which axis is tangent.
- A part whose transformed `insertion_direction` is `from_above` gets a `z_pos`
  aperture when mounted on the board's top layer and a `z_neg` aperture when
  mounted on the bottom layer, centered on the component. No inference is
  involved: `cable_insertion_center` is connector-specific, and a button or LED
  sits exactly at its own placement.
- Cut depth comes from the pierced plate (`lidThickness` / `floorThickness`
  rather than `wallThickness`), the cutting prism is unrotated on a horizontal
  face, containment is validated in 2D against the cavity footprint, and a
  `z_pos` cutout is routed only to the lid and a `z_neg` cutout only to the base.

Deferred:

- `offsetX`/`offsetY`/`offsetZ` caller corrections (below). Apertures are
  currently always centered on the component.
- `face` as an authoring prop; the face is inferred from insertion direction and
  mounting layer.
- Component-local off-center apertures.

The rest of this document remains the proposal for those deferred parts.

This RFC proposes replacing the side-wall-only aperture placement contract with a
face-relative one, so enclosure openings can be cut in the lid and floor as well
as the four side walls, and so non-connector part families (pushbuttons, LEDs,
displays, switches) can drive apertures through the same resolver.

It is scoped deliberately narrowly: **the placement contract only**. Aperture
shape, margin, and the explicitness rule ("inference places or validates declared
features; it does not invent them") are unchanged from
[`2026-06-22-parametric-enclosures.md`](./2026-06-22-parametric-enclosures.md).

## Why now

Two schema records are currently in flight in circuit-json
[#649](https://github.com/tscircuit/circuit-json/pull/649) as a draft:
`source_cutout_aperture` and `cad_fdm_enclosure`. Circuit JSON is the hardest
layer to change once released — saved documents, cached builds, and third-party
consumers all pin to it. The placement fields are the part of the aperture
contract most likely to need revision, so they should be settled while #649 is
still a draft rather than added and then deprecated.

## The problem

An aperture is currently located by three fields:

```ts
interface CommonEnclosureApertureInput {
  wall: "front" | "right" | "back" | "left"
  offset: number             // signed distance along the wall from its midpoint
  zExtentAboveBoard?: number // aperture center height above the PCB top surface
}
```

This is sufficient for a vertical face and structurally insufficient for a
horizontal one. A vertical face's own normal consumes one axis, leaving one
in-plane coordinate (`offset`) plus a height (`zExtentAboveBoard`). A lid or floor
aperture needs **two** in-plane coordinates and no height, because its height is
fixed by which face it is. There is nowhere to put the second coordinate.

Adding `"top"` and `"bottom"` to the `wall` union therefore does not work on its
own. Sixteen sites in `create-fdm-enclosure` branch on the four-side-wall
assumption, and none of them can express a horizontal face:

| Site | Assumption |
| --- | --- |
| `lib/apertures/create-aperture-cutout-plan.ts` `rotateForWall` | Distinguishes X-normal from Y-normal only; a horizontal face needs no rotation |
| `create-aperture-cutout-plan.ts` `placeOnWall` | 4-case switch; `normalPosition` derived from `width`/`height` |
| `create-aperture-cutout-plan.ts` `cutDepth` | `wallThickness + tolerance * 2`; must be `lidThickness` / `floorThickness` for horizontal faces |
| `lib/fdm/resolve-fdm-enclosure-problem.ts` | Picks a single wall length for a 1D containment check |
| same, three validations | `extends beyond its wall`, `intersects the enclosure floor`, `extends above its wall` are all 1D-plus-Z |
| `lib/fdm/visualize-fdm-enclosure.ts` `WALL_ORDER` | Unrolled elevation strip with a per-wall `offsetSign`; horizontal faces are plan views |
| `core/.../get-nearest-board-wall.ts` | Selects a face by distance to the four board edges |

Related gaps the same contract change should close:

- **Bottom-mounted parts use the wrong datum.** *(Resolved.)* The aperture input
  now carries `boardSide`, and the offset runs outward from that surface, so the
  same authored value is correct on either side. Negative values are accepted;
  the binding constraint is the floor-intersection check.
- **`from_above` has no destination.** *(Resolved.)* Core routed it to a `z_pos`
  or `z_neg` face by mounting layer.
- **Non-connector families have no board-plane resolver.** `cable_insertion_center`
  is connector-specific 2D inference. A pushbutton or LED sits at a known
  `pcb_component.center`; no inference is needed, but no code path uses it either.
- **Apertures are subtracted from every shell.** Harmless for side walls; a top
  aperture should cut only the lid, a bottom one only the base.

## Proposed contract

### Faces

```ts
type EnclosureFace = "x_pos" | "x_neg" | "y_pos" | "y_neg" | "z_pos" | "z_neg"
```

A face is named by the axis its outward normal points along. `z_pos` is the
outward face of the closing part (the lid in an `fdm.box`), `z_neg` the outward
face of the floor.

Naming is Cartesian rather than the earlier `front`/`right`/`back`/`left`/`top`/
`bottom`, for two reasons. First, `front`/`back` are retired ecosystem-wide: they
named opposite axes in different packages. Second, `top` was doubly overloaded —
as an `EnclosureFace` it meant **+Z**, while as a direction (`from_top`) and as a
PCB layer it means **+Y** and **+Z** respectively. Naming the axis outright
removes both ambiguities, and it matches the spelling already published as
`InsertionDirectionCartesian` (`from_x_pos`, …), which uses `_pos`/`_neg` because
Circuit JSON enum values must be snake_case.

Core's `BoardWall` adopts the same six names, so converting a board wall to an
enclosure face is an identity — which is the point: it leaves no table in which a
renderer compensation can hide, per the coordinate-frame RFC.

> **Migrating the old names is by axis, never by word.** This RFC is itself the
> cautionary example: its original table below defined `front` as **−Y**, while
> `create-fdm-enclosure`'s shipped `faces.ts` defines `front` as **+Y**. The same
> word named opposite axes in two of our own documents, which is precisely why
> the word is being retired. Convert each occurrence from the axis it actually
> denotes in its own source, not from a global word-to-word table. Note also that
> old `top`/`bottom` were the **Z** faces, so they become `z_pos`/`z_neg`; reading
> `top` as +Y moves lid apertures onto a side wall, and the geometry still
> resolves, so nothing throws.

### Face-relative placement

> **As built:** the resolved placement carries a full 3D `center` in
> enclosure-local coordinates, already projected onto the face plane, rather than
> the `u`/`v` tangent pair below. That was simpler to implement and equally
> general for geometry, which only needs to translate. The `u`/`v` table remains
> the proposal for the *authoring* layer, where a caller offset has to be
> expressed relative to a face rather than to world axes.

Replace `{offset, zExtentAboveBoard}` in the *resolved solver input* with a
2D center in the face's own tangent frame:

```ts
interface ResolvedEnclosureAperturePlacement {
  aperture: EnclosureApertureInput
  face: EnclosureFace
  /** Center in the face's tangent frame, in mm, origin at the face center. */
  center: { u: number; v: number }
  width: number
  height: number
}
```

with `u`/`v` defined per face by a single documented table, so every consumer
derives orientation from one place instead of a switch:

| Face | Normal | `u` axis | `v` axis |
| --- | --- | --- | --- |
| `x_pos` | +X | +Y | +Z |
| `x_neg` | −X | −Y | +Z |
| `y_pos` | +Y | −X | +Z |
| `y_neg` | −Y | +X | +Z |
| `z_pos` | +Z | +X | +Y |
| `z_neg` | −Z | +X | −Y |

The `u` sign flips on `y_pos` and `x_neg` so that `u` always runs left-to-right
when viewed from **outside** the face. For the four side faces this is exactly
`u = (−n) × (0,0,1)` with `n` the outward normal, so the rows can be re-derived
rather than trusted. That formula degenerates on the horizontal faces, where the
view direction is parallel to +Z and "left-to-right" is undefined; those two take
`u = +X` by convention, with `v = ±Y` chosen so the frame is still read from
outside. That is the same convention the debug visualizer already applies ad hoc
via `offsetSign`, promoted into the contract.

This is a strict generalization: for the four vertical faces, `u` is today's
`offset` and `v` is today's `centerZ` re-based to the face center.

### Authoring props

Part-authored placement stays **absolute and datum-referenced**, because
`enclosure.cutoutaperture` lives inside part definitions written once from a
datasheet and consumed by many boards:

| Prop | Meaning | Who writes it |
| --- | --- | --- |
| `zExtentAboveBoard` | Opening center height above the component's **mounting surface**. Flips with mounting side. | Part author, side-entry parts |
| `face` | Explicit face override when direction cannot be inferred. | Part author or caller |
| `offsetX` / `offsetY` / `offsetZ` | **Corrections** applied to the resolved center, in the board frame. | Caller |

`zExtentAboveBoard` is retained rather than replaced by `offsetZ`. A USB-C opening
1.65 mm above the PCB is a number read off a drawing; re-expressing it as an
offset from an inferred center would make the authored value
`1.65 − detectedCenterZ` — absent from any datasheet, meaningless to review, and
different every time inference changes. Note also that Z is **not** inferred
today (`infer-cable-insertion-point` is explicitly 2D), so an inference-relative
`offsetZ` would require inventing a Z datum first.

The offsets exist for a different job: patching a bad inference. Framed as
corrections rather than as the primary mechanism, an inference *improvement* means
deleting them, not recomputing them.

Deliberately **not** proposed: a component-local, rotation-following X/Y offset
for parts whose aperture is off-center in their own footprint (an asymmetric
display window). That is a real need, but conflating it with board-frame caller
corrections would make one prop mean different things depending on who wrote it.
It should get its own explicitly component-local field later.

### Resolution order

Extends the existing precedence in the parametric-enclosures RFC, unchanged in
spirit:

1. explicit `face` prop, else
2. transformed `pcb_component.insertion_direction` → face
   (`from_above` → `z_pos`, `from_left` → `x_neg`, and mounting on the bottom
   layer flips `from_above` to `z_neg`), else
3. part-family inference, else
4. nearest reachable face by distance from the component body.

Then, for the chosen face's tangent coordinates:

1. connector families: `pcb_component.cable_insertion_center` projected onto the
   face;
2. all other families: `pcb_component.center` projected onto the face — which is
   **exact**, so horizontal-face apertures need no inference at all;
3. `zExtentAboveBoard` supplies `v` for vertical faces when authored;
4. caller `offsetX`/`offsetY`/`offsetZ` are added last.

### Shell routing

An aperture is subtracted only from the parts whose faces it can reach:

- `top` → the lid;
- `bottom` → the base;
- vertical faces → any part spanning that aperture's Z range, which is how an
  aperture crossing the base/lid seam is split today.

## Circuit JSON impact

`source_cutout_aperture` gains, all optional:

```ts
face?: "front" | "right" | "back" | "left" | "top" | "bottom"
offset_x?: Length
offset_y?: Length
offset_z?: Length
```

and `z_extent_above_board` is **redocumented**, not moved: "above the component's
mounting surface" rather than "above the PCB top surface", so it is correct for
bottom-mounted parts.

That is four additive optional fields and one documentation fix. No field is
removed or repurposed, so a saved document written before this change still parses
and still resolves to the same geometry. This is the property worth protecting:
the face/offset vocabulary can be added to #649 now at near-zero cost, whereas
adding it after release means a second migration for every consumer.

`cad_fdm_enclosure` needs no change for this proposal. A `role` discriminator
(`"base" | "lid" | "enclosure_part"`) is likely wanted when per-part emission
lands, but it is not required here and is deliberately left out until the usage is
clear.

## Non-goals

- Riser, bezel, lightpipe, and clip generation. Those are *additive* features
  around an aperture, not placement, and should not be folded into the aperture
  profile.
- Travel envelopes for switches and pushbuttons (an aperture enlarged by actuator
  travel). Needs the part-family inference modules first.
- Component-local off-center aperture offsets, as noted above.
- Clearance DRC between generated features and enclosed components, which remains
  deferred to enclosure/assembly DRC.

## Migration plan

1. **circuit-json** — add the four optional fields and the datum redocumentation
   to #649 while it is still a draft.
2. **props** — add `face`, `offsetX`, `offsetY`, `offsetZ` to
   `enclosureCutoutApertureProps`; keep `zExtentAboveBoard`.
3. **create-fdm-enclosure** — introduce `EnclosureFace` and the `u`/`v` tangent
   table; convert `ResolvedEnclosureAperturePlacement` to face-relative; rewrite
   `placeOnWall`/`rotateForWall`/`cutDepth` against the table; replace the three
   1D validations with 2D face containment; add horizontal-face plan views to the
   visualizer; route cutouts per face.
4. **core** — extend face selection to return `top`/`bottom` from insertion
   direction and mounting side; remove the `from_above` guard; fix the
   mounting-surface datum; apply caller offsets last.
5. **fixtures** — a lid aperture (pushbutton or LED) and a floor aperture added to
   the prefab reference, plus a bottom-mounted side-entry connector to cover the
   datum fix.

Steps 1–2 are cheap and unblock nothing else; step 3 is the bulk of the work and
is entirely within `create-fdm-enclosure`.

## Open questions

1. Should `face` accept `"auto"` explicitly, or is absence sufficient?
2. For a part mounted on the board bottom with `from_above`, is the correct face
   `bottom` (mates through the floor) or an error (mates into the board)?
3. Does an aperture on `top` need a Z datum at all, or is the lid's outer surface
   always the plane? A recessed button pocket would need one.
4. Should the `u`/`v` table live in `circuit-json` as documentation, or only in
   the enclosure package? It is a semantic definition, which argues for the former.
5. Are caller offsets applied before or after face containment validation?
   Applying them before means a nudge can produce an actionable error; after means
   a nudge can silently push an opening off its face.
