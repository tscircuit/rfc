# Multi-sheet Schematic Representations

## Motivation

A complex chip is one physical component, but showing every pin in one
schematic symbol can make a design crowded and difficult to read. Authors should
be able to split that chip's schematic representation across multiple sheets so
functional sections can be read in isolation. A separate interconnect sheet may
also show only the pins connecting two physical chips.

The chip remains one source component, PCB component, footprint, and BOM entry.
Only its schematic representation is split. This RFC initially applies to
`<chip>`.

## Design goals

- Physical `<chip>` declarations do not receive schematic-representation props.
- A schematic reference is a direct child of the `<schematicsheet>` that owns
  it.
- A reference selects existing pins from one physical component.
- Reference names can be used by traces and component `connections`.
- The API avoids extra wrapper elements and does not repeat the chip's
  `pinLabels`.

## Physical components

The physical components remain regular chip declarations:

```tsx
const mcuPinLabels = {
  pin1: "VDD",
  pin2: "GND",
  pin3: "RESET",
  pin4: "SCLK",
  pin5: "MOSI",
  pin6: "MISO",
  pin7: "FLASH_CS",
} as const

const flashPinLabels = {
  pin1: "VCC",
  pin2: "GND",
  pin3: "HOLD",
  pin4: "CLK",
  pin5: "DI",
  pin6: "DO",
  pin7: "CS",
} as const

const PhysicalChips = () => (
  <>
    <chip
      name="U1"
      manufacturerPartNumber="HK988A"
      pinLabels={mcuPinLabels}
    />
    <chip
      name="U2"
      manufacturerPartNumber="W25Q128"
      pinLabels={flashPinLabels}
    />
  </>
)
```

## TSX API

`<schematiccomponentref>` is a schematic-only reference to an existing physical
component. It is a direct child of a sheet, so the hierarchy and selector scope
remain flat.

This example places U1's control pins on an MCU sheet, U2's control pins on a
Flash sheet, and both chips' bus pins on an SPI Interconnect sheet:

```tsx
export default () => (
  <board>
    <PhysicalChips />

    <schematicsheet name="MCU" displayName="MCU">
      <schematiccomponentref
        name="U1A"
        componentRef=".U1"
        pins={["VDD", "GND", "RESET"]}
        schPinArrangement={{
          leftSide: { pins: ["RESET"] },
          rightSide: { pins: ["VDD", "GND"] },
        }}
      />
      <resistor
        name="R_RESET"
        resistance="10k"
        connections={{ pin1: "U1A.RESET", pin2: "net.VCC" }}
      />
    </schematicsheet>

    <schematicsheet name="Flash" displayName="Flash">
      <schematiccomponentref
        name="U2A"
        componentRef=".U2"
        pins={["VCC", "GND", "HOLD"]}
      />
    </schematicsheet>

    <schematicsheet name="SPI" displayName="SPI Interconnect">
      <schematiccomponentref
        name="U1B"
        componentRef=".U1"
        pins={["SCLK", "MOSI", "MISO", "FLASH_CS"]}
      />
      <schematiccomponentref
        name="U2B"
        componentRef=".U2"
        pins={["CLK", "DI", "DO", "CS"]}
      />
      <trace from="U1B.SCLK" to="U2B.CLK" />
      <trace from="U1B.MOSI" to="U2B.DI" />
      <trace from="U1B.MISO" to="U2B.DO" />
      <trace from="U1B.FLASH_CS" to="U2B.CS" />
    </schematicsheet>
  </board>
)
```

### Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Unique schematic selector, such as `U1A`. |
| `componentRef` | `string` | Selector for the physical component, such as `.U1`. |
| `pins` | `readonly string[]` | Pin numbers or labels from the referenced component to show. |
| `schPinArrangement` | `SchematicPortArrangement` | Optional arrangement for the selected pins. |

`pins` replaces the proposed combination of `pinLabels` and `exposedPins`.
Labels already come from the referenced component; the reference only selects
which pins to display.

## Circuit JSON

No new Circuit JSON element is required. Every `<schematiccomponentref>` emits
a `schematic_component` with the physical component's `source_component_id` and
the containing sheet's `schematic_sheet_id`:

```json
[
  {
    "type": "source_component",
    "source_component_id": "source_component_u1",
    "name": "U1"
  },
  {
    "type": "source_component",
    "source_component_id": "source_component_u2",
    "name": "U2"
  },
  {
    "type": "schematic_sheet",
    "schematic_sheet_id": "schematic_sheet_mcu",
    "name": "MCU",
    "sheet_index": 0
  },
  {
    "type": "schematic_sheet",
    "schematic_sheet_id": "schematic_sheet_flash",
    "name": "Flash",
    "sheet_index": 1
  },
  {
    "type": "schematic_sheet",
    "schematic_sheet_id": "schematic_sheet_spi",
    "name": "SPI",
    "sheet_index": 2
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u1a",
    "source_component_id": "source_component_u1",
    "schematic_sheet_id": "schematic_sheet_mcu",
    "center": { "x": 0, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": {
      "pin1": "VDD",
      "pin2": "GND",
      "pin3": "RESET"
    },
    "is_box_with_pins": true
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u2a",
    "source_component_id": "source_component_u2",
    "schematic_sheet_id": "schematic_sheet_flash",
    "center": { "x": 0, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": {
      "pin1": "VCC",
      "pin2": "GND",
      "pin3": "HOLD"
    },
    "is_box_with_pins": true
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u1b",
    "source_component_id": "source_component_u1",
    "schematic_sheet_id": "schematic_sheet_spi",
    "center": { "x": -2, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": {
      "pin4": "SCLK",
      "pin5": "MOSI",
      "pin6": "MISO",
      "pin7": "FLASH_CS"
    },
    "is_box_with_pins": true
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u2b",
    "source_component_id": "source_component_u2",
    "schematic_sheet_id": "schematic_sheet_spi",
    "center": { "x": 2, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": {
      "pin4": "CLK",
      "pin5": "DI",
      "pin6": "DO",
      "pin7": "CS"
    },
    "is_box_with_pins": true
  }
]
```

Each reference emits `schematic_port` records only for its selected `pins`.
Those records retain the original `source_port_id`. Traces connected through
reference selectors therefore connect the original physical component ports.

## Behavior and validation

- If at least one reference targets a chip, its default single schematic symbol
  is suppressed.
- Reference names must not collide with another component or reference selector
  in their subcircuit.
- `componentRef` must resolve to one physical component.
- `pins` must exist on the referenced component and may appear in only one
  reference.
- Components nested directly in a sheet inherit that sheet.
- Without any references, chips retain their existing single-symbol behavior.

## Rejected alternatives

- `<schematicchipreference>` is overly long and chip-specific. The proposed
  element should be usable for other physical component types.
- `<schematicview>` and `<componentview>` emphasize presentation but do not make
  it clear that the element references an existing physical component.
- `<componentrepresentation>` is verbose and also does not communicate the
  reference relationship.
- `<componentref>` is too generic outside the immediate sheet context;
  `<schematiccomponentref>` remains explicit when selected or discussed alone.
- `<chipview>` and `<chipsymbol>` are chip-specific. `symbol` can also be
  confused with the graphic asset or the existing `symbol` prop.
- `<schematicunit>` does not explain what a "unit" represents. The earlier
  `<schematicunits><schematicunit /></schematicunits>` design also added an
  unnecessary wrapper beneath `<chip>`. That deeper child hierarchy would
  complicate selector scope and make direct selectors such as `U1A.RESET`
  ambiguous or dependent on parent paths. Keeping `<schematiccomponentref>` as
  a direct child of `<schematicsheet>` keeps selectors flat and avoids nesting
  children unless it carries necessary ownership semantics.
