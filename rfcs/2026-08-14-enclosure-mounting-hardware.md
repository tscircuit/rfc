# Screw Bosses, Enclosure Mounting Hardware, and the Enclosure MBOM

## Motivation

We want to be able to specify how an enclosure and a PCB fit together, this requires introducing additional
hardware such as heat set inserts and bolts.


## Example Usage: Heat set inserts

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm">
      <enclosure.fdm.heatsetinsert thread="m3" />
    </hole>
  </board>
  <assembly.bolt thread="m3" length="10mm" holeRef=".B1 .H1" fastensLid />
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

Alternative accepted syntax:


```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm" />
  </board>
  <enclosure.fdm.heatsetinsert thread="m3" holeRef=".B1 .H1" />
  <assembly.bolt thread="m3" length="10mm" holeRef=".B1 .H1" fastensLid />
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

## `<assembly.screen />` usage


```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <connector name="J1" footprint="fpc24" />
  </board>

  <assembly.screen name="SCREEN" connectsTo=".B1 .J1" width="2.3in" height="1.8in" />
</assembly.device>
```


## `<assembly.cable />` usage

Assembly cables can be inferred from `assembly.screen` or other elements.

```tsx
<assembly.device>
  <board name="B1">
    {/* ... */}
    <connector name="J1" standard="rj45" />
  </board>
  <assembly.cable connectsTo=".B1 .J1" length="200mm" color="black"  />
</assembly.device>
```

- `connectsTo` can be an array with at most two selectors
- Cable models can be inferred from connectors or specified


## New Elements

- `<enclosure.fdm.heatsetinsert />`
- `<assembly.screen />`
- `<assembly.bolt />`
- `<assembly.cable />`

## New Properties

- `<hole />`: `selfTapping`
- `<assembly.device />`: `cadModel="..."`, allows specifying the cadModel for a
  device that is not a board
- - `cadModel` can be a footprinter or modelprinter string (e.g. `flexscreen`)

## Changes to `assembly.device`

- `<assembly.device />` can have nested `<assembly.device />`
- `assembly.screen` is a subset of an `assembly.device` (for e.g. selector
   purposes)

## Bill of Materials Changes

- Bill of Materials can be generated for a specific device or board. When
  generating a bill of materials a selector can often be provided to limit
  the BOM to only those elements
- Limiting the BOM to a single board is often desirable for placing JLCPCB
  orders. When applicable, the UI should ask the user for a full BOM or to
  select from appropriate selectors (e.g. BOM for a specific device or BOM for
  a particular board, BOM for a panel etc.)
