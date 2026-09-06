# Explicitly Unsupported Pin Capabilities

## Motivation

An RP2040 controller board connects GPIO20 to an IMU's I2C SDA line and GPIO21 to
SCL. These are valid hardware I2C0 assignments. Swapping their roles would be
invalid for the hardware I2C peripheral, according to the
[RP2040 pin function table](https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf#page=13).

Today, a board can connect those pins to nets named `I2C_SDA` and `I2C_SCL` without
declaring their peripheral functions. The imported component may contain only
pin labels and power attributes. That gives the checker no capability information
to validate the assignment.

Even when the board declares `activeCapability`, `pinAttributes` can only list
supported functions. It cannot explicitly say that GPIO20 does not support
hardware I2C SCL. Core only writes `true` for listed capabilities, while
[checks PR #266](https://github.com/tscircuit/checks/pull/266) needs explicit `false`
support attributes to report an unsupported assignment.

## Proposal

Add `unsupportedCapabilities` to `pinAttributes`, using the same I2C, SPI, and UART
function names as `capabilities`. Component definitions provide the supported and
unsupported functions; board designs select the active function.

For the RP2040 example, the combined attributes would be:

```tsx
pinAttributes={{
  GPIO20: {
    capabilities: ["i2c_sda"],
    unsupportedCapabilities: ["i2c_scl"],
    activeCapability: "i2c_sda",
  },
  GPIO21: {
    capabilities: ["i2c_scl"],
    unsupportedCapabilities: ["i2c_sda"],
    activeCapability: "i2c_scl",
  },
}}
```

Both assignments pass the peripheral capability check. If GPIO20 is instead
configured with `activeCapability: "i2c_scl"`, core emits these attributes on its
`source_port`:

```json
{
  "supports_i2c_sda": true,
  "supports_i2c_scl": false,
  "is_configured_for_i2c_scl": true
}
```

The checker then reports a `source_component_misconfigured_error`:

```text
U1 pin GPIO20 is configured for unsupported peripheral functions: I2C SCL
```

The error includes the component and pin references. Multiple unsupported active
functions on one pin are grouped into one error.

## Behavior

- `capabilities` writes `true` to the corresponding support attributes.
- `unsupportedCapabilities` writes `false`.
- A function in neither list stays unknown and produces no compatibility error.
  Existing capability lists do not become exhaustive.
- A function in both support lists is invalid metadata and must be rejected.
- `activeCapability` and `activeCapabilities` keep their existing behavior.
  Selecting an unsupported function must reach the checker so it can report the
  circuit error.

The board must declare the active function. Naming a net `I2C_SCL` alone does not
activate this check. Controller pairing, PWM, ADC, and software or PIO emulation
are outside this proposal.

## Implementation

1. Add the optional field and support-list validation to `props`, then release it.
2. Update `core` to consume those props and write explicit `false` support
   attributes. Component wrappers must preserve their capability metadata when
   board attributes select active functions.
3. Release the checker from checks PR #266 and adopt it in core and the tscircuit
   dependencies used by the CLI. Core already runs `runAllPinSpecificationChecks`,
   and `tsci check pin_specification` already calls the aggregate checker.

Circuit JSON already has the optional support booleans and error type. No schema
change or new CLI command is needed.

Test the RP2040 example through a normal TSX render: the valid assignment passes,
GPIO20 configured as SCL produces an error, and missing support information stays
unknown. Also cover all eight existing peripheral functions, conflicting support
lists, and preservation of component attributes when a board selects a function.
