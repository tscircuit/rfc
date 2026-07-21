# Multi-sheet Schematic Representations

## Motivation

A complex chip is one physical component, but showing every pin in one
schematic symbol can make a design crowded and difficult to read. Authors should
be able to split that chip's schematic representation across multiple sheets so
functional sections, such as power and flash, can be read in isolation.

The chip remains one source component, PCB component, footprint, and BOM entry.
Only its schematic representation is split into units. This RFC initially
applies to `<chip>`.

## TSX API

```tsx
const allPinLabels = {
  pin1: "VDD",
  pin2: "GND",
  pin3: "CLK",
  pin4: "D0",
} as const

const powerPinLabels = { pin1: "VDD", pin2: "GND" } as const
const flashPinLabels = { pin3: "CLK", pin4: "D0" } as const

export default () => (
  <board>
    <schematicsheet name="RK3326-Power" displayName="Power" />
    <schematicsheet name="RK3326-Flash" displayName="Flash" />

    <chip
      name="U1"
      pinLabels={allPinLabels}
      schematicUnits={
        <schematicunits>
          <schematicunit
            name="U1A"
            schSheetName="RK3326-Power"
            pinLabels={powerPinLabels}
          />
          <schematicunit
            name="U1B"
            schSheetName="RK3326-Flash"
            pinLabels={flashPinLabels}
          />
        </schematicunits>
      }
    />

    {/* Inferred onto RK3326-Power from its connection to U1A. */}
    <resistor
      name="R1"
      resistance={1000}
      connections={{ pin1: "U1A.1" }}
    />
  </board>
)
```

`schSheetName="RK3326-Power"` may be set on `R1` to place it explicitly.

## Props

| Element | Prop | Type | Meaning |
| --- | --- | --- | --- |
| `chip` | `schematicUnits` | `ReactElement<SchematicUnitsProps>` | Splits the chip's schematic representation into units. |
| `schematicunits` | `children` | `ReactElement<SchematicUnitProps> \| ReactElement<SchematicUnitProps>[]` | Schematic views of the parent chip. |
| `schematicunit` | `name` | `string` | Unique selector name, such as `U1A`. |
| `schematicunit` | `schSheetName` | `string` | Name of the target `<schematicsheet>`. |
| `schematicunit` | `pinLabels` | `PinLabelsProp` | Subset of the parent chip's `pinLabels`. |

Unit `pinLabels` form a non-overlapping partition of the parent chip's
`pinLabels`. A unit is schematic-only: it does not create another source
component, PCB component, footprint, or BOM entry.

Connections may address a unit (`U1A.1` or `U1A.VDD`). Both resolve to the
original `U1` source port; existing `U1.1` and `U1.VDD` selectors keep working.
If a component has no `schSheetName` and its unit connections all resolve to one
sheet, it inherits that sheet. An explicit `schSheetName` wins; ambiguous
inference requires an explicit value.

## Circuit JSON

No `schematic_unit` Circuit JSON element is added. Each unit emits a separate
`schematic_component` view with the same `source_component_id` and its own
`schematic_sheet_id`. Sharing the source ID preserves the fact that the views
represent one physical chip. The relevant records for the example are:

```json
[
  {
    "type": "source_component",
    "source_component_id": "source_component_u1",
    "name": "U1"
  },
  {
    "type": "schematic_sheet",
    "schematic_sheet_id": "schematic_sheet_power",
    "name": "RK3326-Power",
    "sheet_index": 0
  },
  {
    "type": "schematic_sheet",
    "schematic_sheet_id": "schematic_sheet_flash",
    "name": "RK3326-Flash",
    "sheet_index": 1
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u1a",
    "source_component_id": "source_component_u1",
    "schematic_sheet_id": "schematic_sheet_power",
    "center": { "x": 0, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": { "pin1": "VDD", "pin2": "GND" },
    "is_box_with_pins": true
  },
  {
    "type": "schematic_component",
    "schematic_component_id": "schematic_component_u1b",
    "source_component_id": "source_component_u1",
    "schematic_sheet_id": "schematic_sheet_flash",
    "center": { "x": 0, "y": 0 },
    "size": { "width": 2, "height": 1 },
    "port_labels": { "pin3": "CLK", "pin4": "D0" },
    "is_box_with_pins": true
  }
]
```

Each unit emits `schematic_port` records only for its `pinLabels`. Those records
retain the original `source_port_id`, attach to the unit's
`schematic_component_id`, and use the same `schematic_sheet_id`. The unit name
is used for TSX selection and its displayed schematic label.

## Validation

- Unit names must not collide with another component or unit selector in their
  subcircuit.
- `schSheetName` must match a declared sheet.
- Unit `pinLabels` must cover the parent chip's pins exactly once with matching
  labels.
- `chip.schSheetName` cannot be combined with `schematicUnits`.
- Without `schematicUnits`, chips retain their existing single-symbol behavior.
