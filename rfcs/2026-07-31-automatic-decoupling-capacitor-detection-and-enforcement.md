# Automatic Decoupling Capacitor Detection and Enforcement

Capacitors are automatically considered decoupling capacitors when connected
between a chip pin that requires power and ground. This behavior can be
overridden for a pin with `shouldHaveDecouplingCapacitor` in `pinAttributes`.

When `shouldHaveDecouplingCapacitor` is not specified, it defaults to the pin's
effective `requiresPower` value, including attributes inferred from common pin
labels such as `VCC`.

## Good case: Automatically detected as decoupling

```tsx
export default () => (
  <board width="20mm" height="20mm">
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        1: "VCC",
        4: "GND",
      }}
    />

    <capacitor
      name="C1"
      capacitance="100nF"
      footprint="0402"
    />

    <trace from=".U1 > .VCC" to=".C1 > .1" />
    <trace from=".C1 > .2" to="net.GND" />
    <trace from=".U1 > .GND" to="net.GND" />
  </board>
)
```

Because C1 is connected between a chip power pin (implicitly `requiresPower`)
and ground, it is automatically treated as a decoupling capacitor.

## Edge case: Explicitly opt out

```tsx
export default () => (
  <board width="20mm" height="20mm">
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        1: "VBAT",
        4: "GND",
      }}
      pinAttributes={{
        VBAT: {
          requiresPower: true,
          shouldHaveDecouplingCapacitor: false,
        },
      }}
    />

    <capacitor
      name="C1"
      capacitance="100uF"
      footprint="1210"
    />

    <trace from=".U1 > .VBAT" to=".C1 > .1" />
    <trace from=".C1 > .2" to="net.GND" />
    <trace from=".U1 > .GND" to="net.GND" />
  </board>
)
```

Here, C1 is a hold-up capacitor for the backup supply rather than a decoupling
capacitor. Although `VBAT` requires power, the user disables automatic
classification for that pin.

## Motivation

Decoupling capacitors are frequently placed too far from the chip power pins
they support. Because they can usually be inferred from circuit connectivity,
tscircuit should automatically classify them and use that information during
PCB placement.

## Enforcement behavior

When PCB placement is automatically generated, a decoupling capacitor should:

1. Be placed close to the chip pin it supports.
2. Prefer the same PCB side as the chip.
3. Minimize the routed distance from the chip pin to the capacitor.
4. Avoid placing unrelated components between the chip and capacitor.
