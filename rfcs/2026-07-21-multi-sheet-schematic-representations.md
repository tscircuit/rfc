# Multi-sheet Schematic Representations

## Motivation

A complex chip is one physical component, but showing every pin in one
schematic symbol can make a design crowded and difficult to read. Authors should
be able to split that chip's schematic representation across multiple sheets so
functional sections can be read in isolation. A separate interconnect sheet may
also show only the pins connecting two physical chips.

The chip remains one source component, PCB component, footprint, and BOM entry.
Only its schematic representation is split into views. This RFC initially
applies to `<chip>`.

## Design goals

- Physical `<chip>` declarations do not receive schematic-view props.
- A view is declared inside the `<schematicsheet>` that owns it.
- A view references an existing physical component and selects existing pins.
- View names can be used by traces and component `connections`.
- The API does not require repeating the chip's `pinLabels`.

## Shared physical circuit

All five API alternatives below represent the same two physical chips:

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

Each example places U1's control pins on an MCU sheet, U2's control pins on a
Flash sheet, and both chips' bus pins on an SPI Interconnect sheet.

## API 1: `<schematicview>` (recommended)

`view` accurately describes a non-physical projection and remains applicable
to component types other than chips.

```tsx
export const SchematicViewApi = () => (
  <board>
    <PhysicalChips />

    <schematicsheet name="MCU" displayName="MCU">
      <schematicview
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
      <schematicview
        name="U2A"
        componentRef=".U2"
        pins={["VCC", "GND", "HOLD"]}
      />
    </schematicsheet>

    <schematicsheet name="SPI" displayName="SPI Interconnect">
      <schematicview
        name="U1B"
        componentRef=".U1"
        pins={["SCLK", "MOSI", "MISO", "FLASH_CS"]}
      />
      <schematicview
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

Recommended props:

| Prop | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Unique schematic selector, such as `U1A`. |
| `componentRef` | `string` | Selector for the physical component, such as `.U1`. |
| `pins` | `readonly string[]` | Pin numbers or labels from the referenced component to show in this view. |
| `schPinArrangement` | `SchematicPortArrangement` | Optional arrangement for this view's selected pins. |

`pins` replaces the proposed combination of `pinLabels` and `exposedPins`.
Labels already come from the referenced chip; the view only selects which pins
to display.

## API 2: `<componentview>`

This is equally generic, but relies on its `<schematicsheet>` parent to explain
which kind of view it is.

```tsx
export const ComponentViewApi = () => (
  <board>
    <PhysicalChips />
    <schematicsheet name="MCU" displayName="MCU">
      <componentview
        name="U1A"
        componentRef=".U1"
        pins={["VDD", "GND", "RESET"]}
      />
    </schematicsheet>
    <schematicsheet name="Flash" displayName="Flash">
      <componentview
        name="U2A"
        componentRef=".U2"
        pins={["VCC", "GND", "HOLD"]}
      />
    </schematicsheet>
    <schematicsheet name="SPI" displayName="SPI Interconnect">
      <componentview
        name="U1B"
        componentRef=".U1"
        pins={["SCLK", "MOSI", "MISO", "FLASH_CS"]}
      />
      <componentview
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

## API 3: `<schematicrepresentation>`

This most closely matches the domain language, but is verbose in larger
circuits.

```tsx
export const SchematicRepresentationApi = () => (
  <board>
    <PhysicalChips />
    <schematicsheet name="MCU" displayName="MCU">
      <schematicrepresentation
        name="U1A"
        componentRef=".U1"
        pins={["VDD", "GND", "RESET"]}
      />
    </schematicsheet>
    <schematicsheet name="Flash" displayName="Flash">
      <schematicrepresentation
        name="U2A"
        componentRef=".U2"
        pins={["VCC", "GND", "HOLD"]}
      />
    </schematicsheet>
    <schematicsheet name="SPI" displayName="SPI Interconnect">
      <schematicrepresentation
        name="U1B"
        componentRef=".U1"
        pins={["SCLK", "MOSI", "MISO", "FLASH_CS"]}
      />
      <schematicrepresentation
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

## API 4: `<schematiccomponentref>`

This is a generic version of `<schematicchipreference>`. It makes the reference
behavior explicit, but describes the implementation more than the author's
intent.

```tsx
export const SchematicComponentRefApi = () => (
  <board>
    <PhysicalChips />
    <schematicsheet name="MCU" displayName="MCU">
      <schematiccomponentref
        name="U1A"
        componentRef=".U1"
        pins={["VDD", "GND", "RESET"]}
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

## API 5: `<chipschematic>`

This is concise and chip-specific, but cannot naturally extend to connectors,
modules, or other component types.

```tsx
export const ChipSchematicApi = () => (
  <board>
    <PhysicalChips />
    <schematicsheet name="MCU" displayName="MCU">
      <chipschematic
        name="U1A"
        chipRef=".U1"
        pins={["VDD", "GND", "RESET"]}
      />
    </schematicsheet>
    <schematicsheet name="Flash" displayName="Flash">
      <chipschematic
        name="U2A"
        chipRef=".U2"
        pins={["VCC", "GND", "HOLD"]}
      />
    </schematicsheet>
    <schematicsheet name="SPI" displayName="SPI Interconnect">
      <chipschematic
        name="U1B"
        chipRef=".U1"
        pins={["SCLK", "MOSI", "MISO", "FLASH_CS"]}
      />
      <chipschematic
        name="U2B"
        chipRef=".U2"
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

## Circuit JSON

No new Circuit JSON element is required. Every schematic view emits a
`schematic_component` with the referenced physical component's
`source_component_id` and the containing sheet's `schematic_sheet_id`:

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

Each view emits `schematic_port` records only for its selected `pins`. Those
records retain the original `source_port_id`. Traces connected through view
selectors therefore connect the original physical component ports.

## Behavior and validation

- If at least one view references a chip, its default single schematic symbol
  is suppressed.
- View names must not collide with another component or view selector in their
  subcircuit.
- `componentRef` must resolve to one physical component.
- `pins` must exist on the referenced component and may appear in only one view.
- Components nested directly in a sheet inherit that sheet.
- Without any views, chips retain their existing single-symbol behavior.
