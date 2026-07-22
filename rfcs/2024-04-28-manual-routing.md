# Manual Routing

## Overview

- Many "tight" or minaturized PCB designs require careful tweaking of a layout and traces, which
  can be cumbersome to do in code
- To support this, tscircuit should allow the adjustment of layout and traces via manual
  dragging and route hint creation
- tscircuit's approach should still allow subcircuits to be modular

## Detailed Solution

- `<group />` and `<board />` elements will support a `manualLayout` prop e.g. `<group manualLayout={...} />`
- `tsci init` will automatically add the following to `lib/MyCircuit.tsx`

```tsx
import manualLayout from "lib/manual-layout.tsx"

export const MyCircuit = () => (
  <group manualLayout={manualLayout}>
    {/* ... */}
  </group>
)
```

- `lib/manual-layout.tsx` is a file automatically edited by the `tsci dev` process. Its content looks like this:

```tsx

/*
 * DO NOT EDIT DIRECTLY: This file is automatically edited by "tsci dev" when you manually route or move components
 *
 * - To move components, go to the PCB view in "tsci dev" and drag components. To connect traces, click a pad, then
 *   click the box to add a trace, or select the trace tool then select a pad.
 * - If you aren't using manual layouts, you can remove this file!
 */

import type { LayoutDef } from "tscircuit"

export default {
  group_placement?: { x: number, y: number, relative_to: string },
  placement_constraints: [],
  route_constraints: []
} as LayoutDef

```
