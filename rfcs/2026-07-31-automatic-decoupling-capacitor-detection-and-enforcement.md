# Automatic Decoupling Capacitor Detection and Enforcement

Capacitors are automatically considered decoupling capacitors when connected
between a chip power pin and ground. Incorrect detections can be overridden
with `isNotDecouplingCapacitor`.

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

Because C1 is connected between a chip power pin and ground, it is
automatically treated as a decoupling capacitor.

## Bad detection: Explicitly opt out

```tsx
export default () => (
  <board width="20mm" height="20mm">
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        1: "RESET",
        4: "GND",
      }}
    />

    <capacitor
      name="C1"
      capacitance="1uF"
      footprint="0402"
      isNotDecouplingCapacitor
    />

    <trace from=".U1 > .RESET" to=".C1 > .1" />
    <trace from=".C1 > .2" to="net.GND" />
    <trace from=".U1 > .GND" to="net.GND" />
  </board>
)
```

Here, C1 is a reset-delay capacitor rather than a decoupling capacitor, so the
user disables the automatic classification.

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
