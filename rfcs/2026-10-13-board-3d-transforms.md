# 3D Placement of Boards

## User story

As a user designing a compact multi-board device, I want to position and rotate
real `<board>` elements inside `<assembly.device>`, so I can inspect my PCBs,
copper, components and connectors together in 3D without exporting a custom
CAD model for each board.

## Proposed API

```tsx
<assembly.device name="DEVICE">
  <board name="B1" width={20} height={12}>
    <resistor name="R1" resistance="1k" footprint="0402" />
  </board>
  <board
    name="B2"
    width={12}
    height={8}
    cadPosition={{ x: 12, y: 0, z: 6 }}
    cadRotation={{ x: 0, y: 90, z: 0 }}
  >
    <resistor name="R2" resistance="1k" footprint="0402" />
  </board>
</assembly.device>
```

- `cadPosition?: { x: number; y: number; z: number }`: board-center position
  in the containing assembly's coordinates, in millimeters.
- `cadRotation?: { x: number; y: number; z: number }`: right-handed intrinsic
  XYZ Euler angles in degrees, rotating about the board center before translation.
- The board center is the center of its bounding box at the laminate midplane.
  Local +X points right, +Y points up the PCB and +Z points above its top face.
- The pose applies to the whole board: substrate, copper, holes, components,
  component CAD and connector attachment points. Each board keeps its own identity.
- These props affect assembly placement only; PCB layout, routing and fabrication
  coordinates stay board-local. Omitting both preserves current rendering.
- Combining an explicit pose with `mountedTo` reports an error.
