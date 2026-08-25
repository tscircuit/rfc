# Custom PCB Placement Algorithms

## Motivation

The [simplified AM62L computer](https://tscircuit.com/0hmX/simplified-am62l-computer#files)
has bottom-side decoupling capacitors beneath the AM62L BGA. Their positions
depend on the BGA fanout and other routes, so choosing fixed coordinates before
routing is unreliable.

The application should be able to route the BGA first, then run a custom PCB
placement algorithm for the decoupling capacitors, and finally route those
capacitors.

## Proposed API

This RFC adds two author-facing capabilities to `<group>`:

1. `pcbLayout.algorithmFn` selects a custom PCB placement algorithm.
2. `routingPhaseIndex` schedules the group and supplies the default routing
   phase for its descendant traces.

All other props in the example already exist.

```tsx
import { placeDecouplingCapacitors } from "./placement/place-decoupling-capacitors";

const ROUTING_PHASE = {
  ddr: 1,
  sd: 2,
  control: 3,
  usbPower: 4,
  powerAndGround: 5,
  final: 6,
} as const;

export default () => (
  <board width="90mm" height="75mm" layers={8}>
    {/* Existing routing phases 1 through 5 are unchanged. */}
    <autoroutingphase
      name="final"
      phaseIndex={ROUTING_PHASE.final}
      autorouter={classifiedAutorouter("power", 3)}
    />

    <breakout
      name="SOC_BREAKOUT"
      pcbX={2}
      pcbY={1}
      padding="5mm"
      autorouter={fixedTargetBgaBreakoutAutorouter}
    >
      <AM62L32
        name="U1"
        footprintVariant="fccsp_373_anb"
        pcbX={0}
        pcbY={0}
        pcbRotation={180}
        noSchematicRepresentation
        {...pinMetadata(373, socConnected, socAttributes)}
      />

      <group
        name="U1_DECOUPLING"
        width="12.4mm"
        height="12.4mm"
        routingPhaseIndex={ROUTING_PHASE.final}
        pcbLayout={{ algorithmFn: placeDecouplingCapacitors }}
      >
        {u1DecouplingCapacitors.map(({ name, jlc, net }) => {
          const Part = capacitorParts[jlc];

          return (
            <Fragment key={name}>
              <Part name={name} layer="bottom" />
              <trace
                name={`${name}_${net}`}
                from={`${name}.pin1`}
                to={`net.${net}`}
              />
              <trace name={`${name}_GND`} from={`${name}.pin2`} to="net.GND" />
            </Fragment>
          );
        })}
      </group>
    </breakout>
  </board>
);
```

The U1 capacitor records no longer need `x` or `y`; their existing names, parts,
and nets remain unchanged.

## Behavior

For `U1_DECOUPLING`, routing phases below 6 finish before
`placeDecouplingCapacitors` runs. The function places the unpositioned members
of the group while respecting props such as `layer="bottom"`. Its positions are
bounded by the group's `width` and `height`. The group's traces then route in
phase 6.

Providing `pcbLayout.algorithmFn` selects that function instead of a built-in
placement algorithm for the group.

An explicit `routingPhaseIndex` on a descendant trace overrides the group
default. A nested group with its own `routingPhaseIndex` overrides its parent
for that nested group.

Without `pcbLayout.algorithmFn`, current PCB placement behavior is unchanged.
Without `routingPhaseIndex` on a group, current placement and routing behavior
is unchanged.

If the custom placement algorithm fails or does not place every unpositioned
member, tscircuit reports a PCB placement error for the group. It does not
silently fall back to another placement algorithm or route that group's traces.
