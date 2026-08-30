# Autorouting Avoidance Regions

Add `regionToAvoid` to `<autoroutingphase>`. It creates a temporary obstacle
for that phase without emitting a Circuit JSON `pcb_keepout`.

This is useful when one routing phase must avoid a sensitive, noisy,
mechanical, or already-reserved PCB area while other phases may still route
through it. Unlike `<keepout>`, the restriction is local to the selected
autorouting phase and does not become a permanent design element.

## Proposed types

```ts
interface AutoroutingRegionBase {
  shape?: "rect"
  layers: LayerRef[]
}

interface CenteredAutoroutingRegion extends AutoroutingRegionBase {
  center: { x: Distance; y: Distance }
  width: Distance
  height: Distance
}

interface BoundedAutoroutingRegion extends AutoroutingRegionBase {
  minX: Distance
  maxX: Distance
  minY: Distance
  maxY: Distance
}

type AutoroutingAvoidanceRegion =
  | CenteredAutoroutingRegion
  | BoundedAutoroutingRegion

interface AutoroutingPhaseProps {
  regionToAvoid?: AutoroutingAvoidanceRegion
}
```

`Distance` accepts numbers, unit strings, and `calc(...)` expressions.

## Bounds-based usage

```tsx
<autoroutingphase
  phaseIndex={1}
  regionToAvoid={{
    minX: "calc(U1.minX - 1mm)",
    maxX: "calc(U1.maxX + 1mm)",
    minY: "calc(U1.minY - 2mm)",
    maxY: "calc(U1.maxY + 2mm)",
    layers: ["top", "inner1"],
  }}
/>
```

## Center-based usage

```tsx
<autoroutingphase
  regionToAvoid={{
    center: { x: 0, y: "calc(board.maxY - 5mm)" },
    width: "10mm",
    height: "4mm",
    layers: ["top"],
  }}
/>
```

## Behavior

The autorouter avoids the region only on the specified layers. Calculations
resolve using existing PCB variables before routing.

Before invoking the autorouter, tscircuit resolves every `Distance` and
normalizes both representations into rectangular bounds. Centered regions use
`center.x ± width / 2` and `center.y ± height / 2`. The resulting rectangle is
added to the phase's Simple Route JSON obstacles for each listed layer.

Invalid dimensions, inverted bounds, unresolved calculations, or unavailable
layers should produce a clear render error. Existing `region`, rerouting,
phase selection, and Circuit JSON behavior remain unchanged, making this
addition backward-compatible.
