# Ordered Bus Routing

`<bus>` marks ordered, point-to-point traces that should be routed as a bundle
before ordinary autorouting. Users do not select a bus autorouter or assign a
routing phase.

## Good: ordered point-to-point bus

```tsx
<trace name="D0" from=".U1 > .D0" to=".J1 > .D0" />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<trace name="D2" from=".U1 > .D2" to=".J1 > .D2" />

<bus
  name="DATA"
  connections={["D0", "D1", "D2"]}
  pcbAllowedLayers={["top"]}
/>
```

The bus router runs automatically before user-defined and ordinary routing
phases. It creates no vias, preserves endpoint order, and commits the entire
bus atomically. Routed bus traces become obstacles for later phases.

An alternate single layer may be requested:

```tsx
<bus
  name="DATA"
  connections={["D0", "D1", "D2"]}
  pcbAllowedLayers={["bottom"]}
/>
```

`pcbAllowedLayers` is required and version one accepts exactly one layer. A bus
never guesses its routing layer.

## Bad: non-point-to-point member

```tsx
<trace name="D0" from=".U1 > .D0" to="net.D0" />
<trace from="net.D0" to=".J1 > .D0" />
<trace from="net.D0" to=".TP1 > .pin1" />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<bus
  name="DATA"
  connections={["D0", "D1"]}
  pcbAllowedLayers={["top"]}
/>
```

Every entry must resolve to exactly one named trace with exactly two terminal
pins. A branch is a source error:

```text
Bus "DATA" connection "D0" is not point-to-point: it has 3 terminal pins.
```

Unknown connections, duplicate entries, membership in multiple buses, a
missing `pcbAllowedLayers`, or an allowed-layer count other than one are also
source errors. No routing starts while the bus declaration is invalid.

## Bad: crossing

If the physical order at the `from` endpoints differs from the order at the
`to` endpoints, the bus would require a crossing. This is a source error named
`BUS_ENDPOINT_ORDER_CROSSES`. It must be detected before invoking the bus
router. A crossing bus is invalid because bus members must remain parallel.

## Bad: blocked geometry

If a valid bus has no shared corridor on its selected layer, routing fails with
`BUS_NO_SHARED_CORRIDOR`. No bus traces are committed. Bus members are not sent
to the ordinary autorouter because doing so would discard the bus guarantee.

## Success and failure contract

- **Success:** every member is routed, then ordinary autorouting begins.
- **Invalid API or crossing:** rendering reports a source error before routing.
- **Blocked geometry:** routing fails without retaining a partial bus or
  rerouting its members as ordinary traces.
