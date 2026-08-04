# Differential Pair Traces Must Be Point-to-Point

A trace selected by `<differentialpair>` must be point-to-point. Its complete
source-connectivity group must have exactly two terminal source ports. Vias and
intermediate route points are allowed; a third terminal is a branch and must
produce an error. This rule applies independently to the positive and negative
connections.

## Bad case

```tsx
<trace name="DP" from=".J1 > .DP" to="net.DP" />
<trace from="net.DP" to=".U1 > .DP" />
<trace from="net.DP" to=".TP1 > .pin1" />
<differentialpair positiveConnection="DP" negativeConnection="DM" />
```

`DP` branches to both U1 and TP1.

Pin selectors should be preferred when identifying differential-pair traces.
Unlike a net reference, a selector such as `.J1 > .DP` identifies a concrete
pin and makes the intended point-to-point connection easier to validate.

## Good case

```tsx
<trace name="DP" from=".J1 > .DP" to=".U1 > .DP" />
<trace name="DM" from=".J1 > .DM" to=".U1 > .DM" />
<differentialpair
  positiveConnection=".J1 > .DP"
  negativeConnection=".J1 > .DM"
/>
```

## Motivation

Differential routing assumes two unambiguous endpoints per conductor. Rejecting
branches early prevents invalid autorouter input and gives users a clear,
actionable diagnostic.

## Checks API

```ts
checkDifferentialPairTracesArePointToPoint(circuitJson, pairs)
  => SourceDifferentialPairNotPointToPointError[]
```

`pairs` contains the resolved positive and negative `source_trace_id` values.
The check returns one error per branched conductor and is called by core after
resolving differential-pair trace names or pin selectors.

## Error message

The diagnostic should identify the pair, ambiguous net, and all terminal pins,
then recommend a pin selector:

```text
Differential pair "USB_DATA" positiveConnection resolves to net.DP, which is
not point-to-point. It connects to 3 pins: .J1 > .DP, .U1 > .DP, and
.TP1 > .pin1. Remove the extra connection and prefer a pin selector such as
positiveConnection=".J1 > .DP".
```
