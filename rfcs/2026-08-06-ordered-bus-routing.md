# Ordered Bus Routing

`<bus>` marks ordered, point-to-point traces that must be routed as one parallel
bundle before ordinary autorouting. Users do not select a bus autorouter or
assign a routing phase.

## Motivation

Global autorouting becomes harder when simple ordered bundles compete with
arbitrary traces. Buses are usually direct, with corresponding terminals facing
each other. Routing these easy segments together first breaks one large routing
problem into smaller stages and leaves the general autorouter only the irregular
remaining connections.

## Required contract

- `preferredLayer` is required. It names the preferred shared trunk layer but
  does not forbid the router from selecting a better valid trunk layer.
- Every `connections` entry resolves to exactly one named, point-to-point trace.
- All `from` terminals are on one common layer.
- All `to` terminals are on one common layer. The common `from` and `to` layers
  may differ.
- Physical endpoint order must match; a valid bus never crosses.
- Every member uses the same trunk layer. A member may enter and leave that
  layer, but may contain at most two vias.

Invalid declarations, endpoint layers, or endpoint order are source errors
detected before bus routing. The two-via limit is enforced while routing.

## Good: valid bus

```tsx
<trace name="D0" from=".U1 > .D0" to=".J1 > .D0" />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<trace name="D2" from=".U1 > .D2" to=".J1 > .D2" />

<bus
  name="DATA"
  connections={["D0", "D1", "D2"]}
  preferredLayer="inner1"
/>
```

The router first attempts a parallel trunk on `inner1`. It may select another
shared trunk layer when that produces a better valid fit. It commits the entire
bus atomically, then ordinary autorouting handles non-bus traces. Completed bus
traces become obstacles for later routing.

## Bad: missing preferred layer

```tsx
<bus name="DATA" connections={["D0", "D1", "D2"]} />
```

This produces a source error. The router must not guess the user's preference.

## Bad: non-point-to-point member

```tsx
<trace name="D0" from=".U1 > .D0" to="net.D0" />
<trace from="net.D0" to=".J1 > .D0" />
<trace from="net.D0" to=".TP1 > .pin1" />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<bus name="DATA" connections={["D0", "D1"]} preferredLayer="top" />
```

`D0` has three terminal pins, so the declaration produces a source error.
Unknown connections, duplicate entries, or membership in multiple buses are
also source errors.

## Bad: inconsistent endpoint layers

If some `from` terminals are on `top` and others are on `bottom`, the bus
produces `BUS_FROM_LAYER_MISMATCH`. The equivalent `to` condition produces
`BUS_TO_LAYER_MISMATCH`. The common `from` layer may differ from the common
`to` layer.

## Bad: crossing

If the physical order at the `from` terminals differs from the order at the
`to` terminals, rendering produces `BUS_ENDPOINT_ORDER_CROSSES`. This is a
source error and the bus router is never invoked.

## Bad: no valid route

If no parallel shared-layer route exists within the two-via-per-member limit,
routing fails with `BUS_NO_SHARED_CORRIDOR` or `BUS_VIA_LIMIT_EXCEEDED`. No bus
traces are committed, and bus members are not passed to ordinary autorouting.

## Result contract

- **Success:** the complete parallel bus is committed before ordinary routing.
- **Invalid contract:** rendering reports a source error before bus routing.
- **No valid route:** routing fails without retaining a partial bus.
