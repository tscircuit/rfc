# Explicitly Unsupported Pin Capabilities

Add `unsupportedCapabilities` to `pinAttributes` so a component can explicitly
declare that a pin does not support an I2C, SPI, or UART function. Configuring that
pin for the unsupported function must produce a pin specification error. Omitted
capability information continues to mean unknown.

This is a proposed API. The examples require changes to `props` and `core` and a
released version of the checker proposed in [checks PR #266](https://github.com/tscircuit/checks/pull/266).

## Bad case: Configuring an unsupported function

```tsx
export default () => (
  <board width="20mm" height="20mm">
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{ pin1: "GPIO0" }}
      pinAttributes={{
        GPIO0: {
          unsupportedCapabilities: ["i2c_scl"],
          activeCapability: "i2c_scl",
        },
      }}
    />
  </board>
)
```

The relevant attributes on GPIO0's `source_port` must be:

```json
{
  "supports_i2c_scl": false,
  "is_configured_for_i2c_scl": true
}
```

The pin specification checker must emit one `source_component_misconfigured_error`
for this pin, with its source component and source port references. Its message
identifies the unsupported active function:

```text
U1 pin GPIO0 is configured for unsupported peripheral functions: I2C SCL
```

If multiple active functions on one pin are explicitly unsupported, list them in
one error. Other pin specification warnings may also be emitted for this minimal
example.

## Good case: Configuring a supported function

```tsx
pinAttributes={{
  GPIO0: {
    capabilities: ["uart_tx"],
    unsupportedCapabilities: ["i2c_scl"],
    activeCapability: "uart_tx",
  },
}}
```

This emits `supports_uart_tx: true`, `supports_i2c_scl: false`, and
`is_configured_for_uart_tx: true`. The unused unsupported function produces no
peripheral compatibility error.

## Unknown case: Incomplete capability information

```tsx
pinAttributes={{
  GPIO0: {
    capabilities: ["uart_tx"],
    activeCapability: "i2c_scl",
  },
}}
```

`supports_i2c_scl` remains absent. This produces no peripheral compatibility
error, but does not establish that the assignment is supported. An omitted
function in `capabilities` is not an explicit declaration of non-support.

## Motivation

The current [props definition](https://github.com/tscircuit/props/blob/main/lib/common/pinAttributeMap.ts)
can declare supported and active functions, but cannot declare unsupported ones.
The [core conversion](https://github.com/tscircuit/core/blob/main/lib/components/primitive-components/Port/apply-pin-attributes-to-source-port.ts)
only writes `true` for listed capabilities. Consequently, a checker that requires
explicit `false` support attributes can validate annotated Circuit JSON while
missing the same mistake in a normal TSX design.

Component definitions, including those in `common`, should supply capabilities
verified against the component's documentation. The board design declares the
function actually used with `activeCapability` or `activeCapabilities`. Selecting
a function must not overwrite an explicit unsupported declaration or imply that
the hardware supports it. A component wrapper must preserve its capability
metadata when combining it with the board's active-function attributes.

## Proposed API and semantics

Add `unsupportedCapabilities?: Array<PinCapability>` to `PinAttributeMap` and an
optional array of the existing `pinCapability` enum to its Zod schema. Reuse all
eight existing functions: `i2c_sda`, `i2c_scl`, `spi_cs`, `spi_sck`, `spi_mosi`,
`spi_miso`, `uart_tx`, and `uart_rx`.

For each function, core preserves three distinct support states:

| Declaration | Circuit JSON support attribute |
| --- | --- |
| Listed only in `capabilities` | `true` |
| Listed only in `unsupportedCapabilities` | `false` |
| Listed in neither list | Absent (unknown) |
| Listed in both lists | Invalid capability declaration |

An omitted or empty list declares nothing. Duplicate entries within a list have
no additional effect. Props validation must reject a function appearing in both
support lists, identifying the conflicting function; core must not silently
choose whichever declaration was applied last. Apply this rule to the effective
attributes after component defaults and user attributes have been combined.

An unsupported function appearing in an active list is intentionally accepted by
props: it is a circuit configuration error for the checker to report, rather than
contradictory capability metadata.

Keep the existing union of `activeCapability` and `activeCapabilities`, setting
the corresponding `is_configured_for_*` attributes to `true`. The checker reports
an error only when configuration is explicitly `true` and support is explicitly
`false` on the same source port.

## Implementation and release order

1. **Props:** Add the optional field to the interface and schema, validate
   contradictory support lists, test parsing and type compatibility, then release.
2. **Checks:** Merge and release the checker in checks PR #266. It was open when
   this RFC was written; passing CI does not make it available in released packages.
   This work can proceed independently of the props change.
3. **Core:** Adopt the released props and checks versions. Extend the existing
   typed capability conversion to write explicit `false` attributes and preserve
   absent support. Add a TSX test through `renderUntilSettled()` that verifies both
   source-port attributes and emitted diagnostics. Reuse the existing
   `runAllPinSpecificationChecks` call in
   [Board.ts](https://github.com/tscircuit/core/blob/main/lib/components/normal-components/Board.ts).
4. **Component definitions / common:** Add verified capability metadata where it
   is known, and preserve it when board designs supply active functions. Test a
   component wrapper with an unsupported active function. Do not guess capability
   information or require a complete component-library migration for the release.
5. **Tscircuit / CLI:** Adopt released packages through their existing dependency
   paths and verify the resolved core, props, and checks versions. Exercise the
   same TSX through `tsci check pin_specification`. The existing
   [CLI command](https://github.com/tscircuit/cli/blob/main/cli/check/pin-specification/register.ts)
   already calls the aggregate checker; no new command is required.

No Circuit JSON schema change is required: the optional support and configuration
booleans already exist in
[SourcePinAttributes](https://github.com/tscircuit/circuit-json/blob/main/src/source/properties/source_pin_attributes.ts),
and the diagnostic uses the existing
[source_component_misconfigured_error](https://github.com/tscircuit/circuit-json/blob/main/src/source/source_component_misconfigured_error.ts).
Consumers must use released versions containing these contracts.

## Acceptance tests

- Props accepts omitted, empty, and valid unsupported lists; rejects unknown
  functions and overlapping support lists; and still accepts an unsupported
  function selected as active.
- Core verifies `true`, `false`, and absent support for all eight functions.
  Existing positive-only declarations retain their output.
- A normal TSX render of the bad case emits exactly one peripheral compatibility
  error with the correct component and port references. Supported active,
  unknown active, and unsupported inactive cases emit none of these errors.
- Both active-function properties work together, duplicate entries do not
  duplicate errors, and multiple unsupported active functions are grouped per pin.
- Component wrappers preserve explicit unsupported metadata when adding active
  functions, and reject contradictory support metadata after composition.
- The CLI reports the unsupported assignment from TSX using released dependencies,
  without manually editing Circuit JSON.

## Alternatives and scope

Treating `capabilities` as exhaustive would reinterpret incomplete existing
metadata and create errors for unknown functions. A boolean capability map could
represent all three states, but would introduce a second shape for the existing
positive capability API. An optional negative list extends that API directly.

This proposal does not infer peripheral functions from pin or net names, assign
pins automatically, validate controller pairing or multiplexing constraints, or
model software-emulated protocols.

The examples and diagnostic-oriented structure follow the existing
[differential-pair RFC](./2026-08-05-differential-pairs-must-not-branch.md) and
[decoupling-capacitor RFC](./2026-07-31-automatic-decoupling-capacitor-detection-and-enforcement.md).
