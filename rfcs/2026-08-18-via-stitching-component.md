# Dedicated Via Stitching Component

Via stitching should be enabled with a dedicated `<viastitching>` component.
The component selects two existing copper pours and owns all options passed to
the via-stitch solver.

## Motivation

Copper pours describe copper geometry and connectivity. Via stitching is a
separate post-processing operation between resolved pours. Making it a separate
component provides an explicit answer to three questions:

1. Which two pours should be stitched?
2. When should the via-stitch solver run?
3. Which solver options apply to that operation?

This is important when a board contains several pours on the same net or when
only one polygon region should be stitched.

## Proposed API

```tsx
const gndRegion = [
  { x: -12, y: -7 },
  { x: -2, y: -7 },
  { x: -2, y: 6 },
  { x: -12, y: 6 },
]

export default () => (
  <board width="30mm" height="20mm">
    <net name="GND" isGroundNet />

    <copperpour
      name="gndTopRegion"
      connectsTo="net.GND"
      layer="top"
      outline={gndRegion}
      clearance="0.3mm"
    />
    <copperpour
      name="gndBottomRegion"
      connectsTo="net.GND"
      layer="bottom"
      outline={gndRegion}
      clearance="0.3mm"
    />

    <viastitching
      name="gndRegionStitching"
      copperPours={[".gndTopRegion", ".gndBottomRegion"]}
      stitchingPattern="grid"
      viaPitch="2mm"
      viaHoleDiameter="0.3mm"
      viaOuterDiameter="0.6mm"
      pourEdgeClearance="0.2mm"
      obstacleClearance="0.2mm"
      minimumViaSeparation="0.8mm"
      isTented
    />
  </board>
)
```

No stitching is performed when `<viastitching>` is absent.

## Props

```ts
interface ViaStitchingProps {
  name?: string
  copperPours: readonly [string, string]
  stitchingPattern?: "grid" | "fence"
  viaPitch?: Distance
  viaHoleDiameter?: Distance
  viaOuterDiameter?: Distance
  pourEdgeClearance?: Distance
  obstacleClearance?: Distance
  minimumViaSeparation?: Distance
  gridOrigin?: Point
  isTented?: boolean
  fenceTraceSelectors?: string[]
  fenceTraceOffset?: Distance
}
```

Defaults match `ViaStitchSolver`.

`copperPours` contains exactly two selectors. They must resolve within the same
subcircuit to pours on the same net and on different layers.

Core converts unit-bearing distances to millimetres and passes the remaining
properties to `ViaStitchSolver`. Net IDs, PCB copper-pour IDs, and PCB trace IDs
are resolved by Core rather than exposed in JSX.

## Render order

The operation runs once using this order:

1. Route PCB traces.
2. Resolve both copper pours into BRep copper.
3. Resolve the `<viastitching>` selectors to those BRep records.
4. Run `ViaStitchSolver` with only the selected pours.
5. Insert the generated `pcb_via` records.

The solver does not create or expand copper. A via is emitted only when its
annulus and requested clearances fit inside both selected pours and it does not
overlap a component, pad, hole, trace via, or another stitching via.

## Circuit JSON changes

Add a PCB-level instruction element containing the resolved solver input:

```ts
interface PcbViaStitching {
  type: "pcb_via_stitching"
  pcb_via_stitching_id: string
  subcircuit_id?: string
  source_net_id: string
  from_layer: LayerRef
  to_layer: LayerRef
  from_pcb_copper_pour_ids: string[]
  to_pcb_copper_pour_ids: string[]
  stitching_pattern: "grid" | "fence"
  via_pitch: number
  via_hole_diameter: number
  via_outer_diameter: number
  pour_edge_clearance: number
  obstacle_clearance: number
  minimum_via_separation: number
  grid_origin: Point
  is_tented: boolean
  fence_pcb_trace_ids?: string[]
  fence_trace_offset?: number
}
```

Arrays are used for the selected pours because one `<copperpour>` may resolve
into multiple disconnected BRep islands.

Generated vias gain an optional provenance field:

```ts
interface PcbVia {
  pcb_via_stitching_id?: string
}
```

This makes imported Circuit JSON reproducible and identifies which operation
created each stitching via.

## Validation

Core should report an error when:

- a copper-pour selector does not resolve;
- the selected pours use different nets or the same layer;
- either selected pour produces no BRep copper;
- a dimension is invalid or the hole diameter is not smaller than the outer
  diameter; or
- a fence trace selector does not resolve to a PCB trace.

Valid configurations may produce zero vias when the selected pours have no
usable overlapping copper.

## Why not props on `<copperpour>`

The alternative API uses `viaStitch` and `viaStitchOptions` on one
`<copperpour>`. It is not selected because:

- the enable flag and configuration can become inconsistent;
- it is unclear which pour owns an operation involving two pours;
- adding the props to both pours can create duplicate or conflicting settings;
- matching only by net and layer can stitch unrelated same-net polygon regions;
  and
- copper-pour geometry becomes coupled to a separate post-processing solver.

The dedicated component keeps the relationship explicit, supports multiple
independent stitched regions on one net, and can be extended without adding
more unrelated props to `<copperpour>`.
