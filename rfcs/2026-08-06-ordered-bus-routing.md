# Ordered Bus Routing

`<bus>` marks ordered, point-to-point traces that should be routed as a bundle
before ordinary autorouting. Users do not select a bus autorouter or assign a
routing phase.

## Good: ordered point-to-point bus

```tsx
<trace name="D0" from=".U1 > .D0" to=".J1 > .D0" />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<trace name="D2" from=".U1 > .D2" to=".J1 > .D2" />

<bus name="DATA" connections={["D0", "D1", "D2"]} />
```

The bus router runs automatically before user-defined and ordinary routing
phases. It uses `top`, creates no vias, preserves endpoint order, and commits
the entire bus atomically. Routed bus traces become obstacles for later phases.

An alternate single layer may be requested:

```tsx
<bus
  name="DATA"
  connections={["D0", "D1", "D2"]}
  pcbAllowedLayers={["bottom"]}
/>
```

Omitting `pcbAllowedLayers` means `["top"]`. Version one accepts exactly one
allowed layer.

## Bad: non-point-to-point member

```tsx
<trace name="D0" path={[".U1 > .D0", ".J1 > .D0", ".TP1 > .pin1"]} />
<trace name="D1" from=".U1 > .D1" to=".J1 > .D1" />
<bus name="DATA" connections={["D0", "D1"]} />
```

Every entry must resolve to exactly one named trace with exactly two terminal
pins. A branch is a source error:

```text
Bus "DATA" connection "D0" is not point-to-point: it has 3 terminal pins.
```

Unknown connections, duplicate entries, membership in multiple buses, or more
than one allowed layer are also source errors. No routing starts while the bus
declaration is invalid.

## Bad: crossing or blocked geometry

If the physical order at the `from` endpoints differs from the order at the
`to` endpoints, the bus would require a crossing. If no shared single-layer
corridor exists, the bus is blocked.

These are routing failures, not source errors. The bus router commits nothing,
reports `BUS_ENDPOINT_ORDER_CROSSES` or `BUS_NO_SHARED_CORRIDOR`, and returns
every member to the ordinary autorouter. Partial bus routing is never retained.

## Success and failure contract

- **Success:** every member is routed, then ordinary autorouting begins.
- **Invalid API:** rendering reports a source error and skips routing.
- **Unsuitable geometry:** the bus is left wholly unrouted for the ordinary
  autorouter, with a diagnostic explaining why.
