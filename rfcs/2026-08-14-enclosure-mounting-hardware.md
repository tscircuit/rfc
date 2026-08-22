# Screw Bosses, Enclosure Mounting Hardware, and the Enclosure MBOM

## Status

Proposed. This document is the developer experience. Implementation detail is in
[`2026-08-14-enclosure-mounting-hardware.impl.md`][impl].

[impl]: ./2026-08-14-enclosure-mounting-hardware.impl.md

## 1. Summary

### 1.1 Screw bosses

You add a screw boss element to a mounting hole on a PCB. The render then adds a
cylinder support column to the enclosure underneath that mounting hole, and
makes the screws and other parts that the boss needs. The boss can use a short
screw that holds the PCB to the enclosure, or a long screw that holds the lid 
and base of the enclosure together. This long screw can also retain the PCB
with either a retention column connected to the lid, or a retention spacer.
Screws can be specified as self-tapping or heat-set, and the appropriate cutouts
will be made in the screw boss to install the hardware.

### 1.2 Manufacturing BOM (MBOM)

Each new part becomes one `source_component` record in Circuit JSON. A new
function in the BOM package reads those records and makes a manufacturing bill
of materials (MBOM), separate from the electrical BOM (EBOM) of the board. The
two go to different suppliers: the board assembler does not get a line for a
screw, and the enclosure supplier does not get a line for a resistor.

Unlike many electronic components, enclosure parts like screws are commodity and
identified by a specification rather than a MPN. We can adapt part resolution to
accommodate commodity part fungibility.

### 1.3 Assembly Components

Device assembly can require components which are not part of the PCB, therefore
not part of the EBOM sent to the board manufacturer. Examples are separately
manufactured display assemblies, ribbon cables, rubber feet for enclosures,
keyswitches, and so on. These parts may either attach mechanically to the PCB
or to the enclosure during device assembly. These components can be included
in the rendering and the MBOM.

## 2. Make a screw boss

### 2.1 The minimum example

A screw boss is a cylinder in the enclosure base that holds a fastener. The
fastener holds the PCB (not the lid) to the enclosure. Declare the boss in the
mounting hole that needs it.

```tsx
<assembly.device>
  <board name="B1" width="40mm" height="24mm">
    <hole name="H1" pcbX={-15} pcbY={-8} diameter="3.2mm">
      <enclosure.screwboss thread="M3" fastening="heat_set_insert" />
    </hole>
  </board>
  <enclosure.fdm.box name="EN1" boardRef=".B1" />
</assembly.device>
```

The hole gives the boss its center and its drill diameter. tscircuit does not
find mounting holes automatically: a hole with no `<enclosure.screwboss>` gets
no boss.

### 2.2 What you get

A bored boss below the hole in the printed base, plus one M3 heat-set insert and
one M3 screw in the MBOM of `EN1`. You do not give a screw length: tscircuit
calculates it from the stack of materials, then rounds up to the next stocked
length. If no stocked screw fits, the render errors and names both limits.

To repeat a mount, write a component, as for any repeated element. Four
`<MountingHole>`s give four inserts and four screws, and the MBOM shows one line
for each with a total quantity of 4 each.

```tsx
const MountingHole = (props: { name: string; pcbX: number; pcbY: number }) => (
  <hole name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} diameter="3.2mm">
    <enclosure.screwboss thread="M3" fastening="heat_set_insert" />
  </hole>
)
```

### 2.3 Fasten the lid

Set `fastens="lid"`. The screw enters through the lid, crosses the space above
the board, and goes through the same PCB hole into the same boss, so one screw
holds the lid and captures the board. It does not increase the size of the box,
because it uses a hole the board already has.

```tsx
<hole name="H3" pcbX={15} pcbY={8} diameter="3.2mm">
  <enclosure.screwboss thread="M3" fastening="heat_set_insert"
                       fastens="lid" head="countersunk" />
</hole>
```

A countersunk head gets a countersink in the lid by default; a socket cap head
gets a counterbore. Minimum wall thickness rules warn if the lid is not thick
enough. `fastening` selects `heat_set_insert` or `self_tapping`, and the correct
hardware and boss bore are made for that system. `lidColumn` fills the space
between the board and the lid:

| Value | What fills the space | Effect on the MBOM |
| --- | --- | --- |
| `printed` (default) | A hollow column in the lid | No new line |
| `spacer` | A purchased nylon tube | One spacer line |
| `none` | Nothing. The PCB needs its own board mounts. | No new line |

## 3. Enclosure and Assembly Components

### 3.1 Namespaces

You declare some parts in TSX; the render derives the others. Both become
`source_component` records and both appear in the MBOM. Only a declared part
needs a TSX element. We will start with a minimum vocabulary:

| Namespace | Elements you declare | Parts the render derives |
| --- | --- | --- |
| `enclosure.*` | `fdm.box`, `cutoutaperture`, `screwboss` | base, lid, screws, inserts, spacers |
| `assembly.*` | `device`, `component` | nothing |

Screws and inserts are not TSX elements. They are generated from the screw boss
and the enclosure parameters, in the same way the printed base and lid are.

### 3.2 Assembly component type

`<assembly.component>` covers a screen, a ribbon cable, a rubber foot, a battery
holder — anything the device owns, because we can specify a `modelprinter`
parametric model string.

```tsx
<assembly.component name="FT1" model="cylinder_d12.7mm_h3.5mm"
                    manufacturerPartNumber="SJ5302" />
```

**The model string already holds the parametric properties**, so a `screenWidth`
prop would repeat `w40mm` and two copies of one number could disagree. **It also
names the kind:** the first token is the modelprinter function, read the way a
consumer of `footprinter_string` reads `soic8`.

### 3.3 Assembly device hierarchy and placement

The component can be nested under the assembly at the top-level, or inside of the
board. If the component needs a cutout aperture, that may be nested inside of the
component.

```tsx
<assembly.device name="D1">
  <board name="B1" width="40mm" height="24mm">
    <MountingHole pcbX="-19mm" pcbY="-11mm"/>
    ...
    <connector name="J1" footprint="ffc20" pcbX={0} pcbY={-10}>
      <assembly.component name="SCN1" model="flexscreen_w40mm_h22.5mm_foldsabove_distance20mm" cutoutApertureDirection="from_top">
        <enclosure.cutoutaperture shape="rect" width="40mm" height="22.5mm"/>
      </assembly.component>
   </connector>
  </board>
  <enclosure.fdm.box name="EN1" boardRef=".B1">
    <assembly.component name="FOOT1" model="rubberfoot_r5mm_h2mm"/>
    ...
  </enclosure.fdm.box>
</assembly.device>
```

* **where is the component located?** — In order to render the component (and its
aperture) it needs a physical location. The center and rotation of its nearest
ancestor with a `pcb_component`, here `J1`, becomes the center and rotation for
the assembly.component; we can add props for offsetting in each dimension,
such as x/y positioning, distanceAboveBoard, etc. Will probably have to play around
with this until it makes sense. If we want to author named parameters like
cableStartX, that is a reasonable argument for assembly.ribboncable as a child of
assembly.component.
* **where does the aperture get rendered?** - Because we can calculate the position
and bounds for the assembly.component (during render), the enclosure renderer already
knows how to locate the aperture with the same logic as is used for other components
today, and assembly.component will gain cutoutApertureDirection to tell which way
the aperture faces.
* **where is a component parented by enclosure located?** - We have a reference frame
for the enclosure based on the board; placement props for other enclosure features
(screw boss, cutout aperture) are located based on board props. In a future iteration,
we will propose enclosure placement props to locate things like rubber feet. For
now they can be specified as parented by the enclosure, but can't be positioned or
rendered until we have placement props to locate them in reference to the enclosure.
* **which MBOM buys it, device or enclosure?** — the nearest ancestor that is an assembly
node, here `D1` for SCN1, `EN1` for FOOT*. So a screen under a connector is a line in
the device MBOM and not in the board EBOM.

## 4. Identify a part

### 4.1 Two identity models

Every BOM line needs one identity. It groups the lines and tells a buyer what to
get. Which one applies is a property of the part.

**A catalogue part is one specific product** — a screen, a fan, a latch. Another
manufacturer's part is a different part, so identity is the **manufacturer part
number**. **A specification part is anything that conforms** — a screw, an
insert, a spacer. Identity is the **designation**, the canonical name of the
specification; a part number says where to buy one, not what the part is.

| | Catalogue part | Specification part |
| --- | --- | --- |
| Identity | `manufacturerPartNumber` | `designation` |
| Example | `NHD-2.0-12864UMY3` | `ISO 4762 M3x8` |
| Substitution | Needs review | Expected |
| Missing part number | A defect | Normal |

**Catalogue is the default**, so every electrical part keeps its behaviour and a
new element gets the safe model. Screws, inserts, spacers and printed parts are
specification parts; `<assembly.component>` is a catalogue part. Specify on a
per-component basis by setting either `designation` or `manufacturerPartNumber` -
if both are set, `manufacturerPartNumber` takes precedence as it is more specific.

```tsx
<assembly.component name="W1" designation="ribbon cable 1.27mm 20-way 150mm" />
<assembly.component name="W2" manufacturerPartNumber="FFC-20-1.0-150" />
```

### 4.2 How this relates to the EBOM

The EBOM does not identify a part from what you write either — it resolves it.
`partsEngine` turns `<resistor resistance="10k" footprint="0402" />` into an
LCSC part number during the render, and the assembler builds from that number.
A BOM is therefore a **specification that a lookup resolves to a catalogue
part**, and the two models above are the two ends of one pipeline. The MBOM uses
the same engine: `findPart` gains a `modelprinterString` parameter beside its
`footprinterString` one (or we implement a parallel findPartByModelSpec with
modelprinterString).

### 4.3 Designations are currently incomplete

Our designations are incomplete today: `ISO 4762 M3x8` does not name the material
or finish, so a black oxide screw and an A2 stainless screw share a designation.
We will leave this open so the user can fulfill the MBOM with compatible if not
identical parts. It is not necessary at this stage to drive more specificity
than mechanical compatibility.

## 5. What the render puts in Circuit JSON

### 5.1 Existing type with new ftypes and field

Assembly parts use the records tscircuit already uses. There is no new record
type. **One physical piece is one `source_component`** — eight screws give eight
records, and the MBOM counts them, the same rule the EBOM uses today. A piece
that renders **also** gets one `cad_component`, which holds its geometry.

```jsonc
// what you buy
{ "type": "source_component", "ftype": "assembly_part", "name": "SCR1",
  "source_component_id": "sc_scr1",
  "designation": "ISO 4762 M3x8",
  "display_value": "M3 × 8mm socket head cap screw",
  "parent_source_component_id": "sc_en1" }

// what you draw
{ "type": "cad_component", "source_component_id": "sc_scr1",
  "pcb_component_id": "pcb_en1",                  // the frame, borrowed
  "position": { "x": -15, "y": -8, "z": 1.6 },
  "modelprinter_string": "screw_m3_l8mm_socketcap" }
```

A screen under `J1` is the same pair, borrowing `pcb_j1` instead, with a
`manufacturer_part_number` and no `designation` — so it groups by part number,
like a PCB part.

The model string lives on the `cad_component` and nowhere else, exactly as
`footprinter_string` does. The `source_component` says what the part **is**; the
`cad_component` says what it **looks like and where it sits**.

Three fields keep the two kinds of part apart:

| Field | Says |
| --- | --- |
| `ftype` | What the part is. Electrical values keep the `simple_` prefix. There are **three** assembly values: `assembly_device` and `assembly_enclosure` are nodes that can have children; `assembly_part` is every leaf — a base, a lid, a screw, an insert, a spacer, a screen, a foot. |
| `designation` | The specification identity, when the part has one. The identity used for grouping is `manufacturer_part_number` if set, otherwise `designation`; a part with neither is an error. |
| `parent_source_component_id` | Which assembly consumes it. Absent means the board assembly. The physical tree — what is bolted into what — not `source_group_id`, the functional tree of subcircuits. |

**A part is in exactly one BOM.** A record joins the EBOM of a board when it has
a `pcb_component`, and the MBOM of an assembly when its parent is that assembly.

**A consumer that lists parts gets electrical parts only**, so anything that has
never heard of assembly parts keeps working. `db.source_component.list()`
returns electrical parts, `list({ bomClass: "assembly" })` returns assembly
parts, `list({ bomClass: "enclosure"})` returns enclosure parts, and `listAll()`
returns both. To classify one record, call `getSourceComponentBomClass(sc)` rather
than comparing ftype strings.

### 5.2 Model geometry with modelprinter

A rendered piece carries a model string on its `cad_component`: a parametric CAD
model in one line of text, parsed by [`@tscircuit/modelprinter`][modelprinter].
The grammar is footprinter's — tokens joined by `_`, each a name and an optional
value with a unit.

```
screw_m3_l8mm_socketcap        spacer_od6mm_id3.2mm_l6mm
flexscreen_w40mm_h22.5mm_flex60mm_foldsabove_distance20mm
```

You do not write the string for a fastener; the screw boss makes it. You write
it for a part the hardware catalog does not specify. The string is the
**geometry**, so a viewer needs no mesh file, and it stays readable in a saved
`circuit.json`.

**A model string is not an identity.** Two screws with the same shape and
different materials share one string and are two parts.

[modelprinter]: https://github.com/tscircuit/modelprinter

### 5.3 Where a part gets its frame

`cad_component` requires a `pcb_component_id`, so a piece needs one to render.
**`pcb_component_id` is the frame the piece renders in; `source_component_id` is
the piece itself.** Every renderable piece borrows the frame of its nearest
framed ancestor:

| Part | Frame it borrows | `cad_component`? |
| --- | --- | --- |
| base, lid, screws, inserts, spacers | the enclosure's `pcb_component`, at the board origin | yes |
| `<assembly.component>` under a component | that component's `pcb_component` | yes |
| a part with no position, such as a rubber foot | none available | **no** |

The enclosure keeps the `pcb_component` it emits today. It is not a fiction: it
has a real center, taken from the board, and a real extent, taken from the
solver. Everything below it borrows that frame, which is already how the base
and lid share one owner.

**Rendering is structural, like BOM membership.** A piece renders because it has
a `cad_component`, and it has one because it has a position. Nothing decides
what to skip.

**For the record: a part with no position gets no `cad_component`.** Placement
props for children of an enclosure come later. Until then such a part is a BOM
line only — correct in the MBOM, absent from the 3D view, and rendering no model
string, since there is no geometry record to hold one. The frame is waiting
whenever the props land, because the enclosure's `pcb_component` is a reference
to the center of the board.

### 5.4 The enclosure leaves the EBOM

The enclosure keeps its `pcb_component`, so the EBOM and the pick-and-place file
must exclude it explicitly. Both iterate `pcb_component` and neither respects
`do_not_place`, so today an enclosure appears in `bom.csv` **and** `pnp.csv`.
One line in each producer fixes both:

```js
if (getSourceComponentBomClass(source_component) !== "pcba") continue
```

This is the one place membership is not purely structural, confined to the two
files whose whole job is deciding what the board assembler receives.

### 5.5 Get the MBOM

```ts
import {
  convertCircuitJsonToBomRows,   // exists: the EBOM
  convertBomRowsToCsv,           // exists
  convertCircuitJsonToMbomRows,  // new
  convertMbomRowsToCsv,          // new
} from "circuit-json-to-bom-csv"

const rows = await convertCircuitJsonToMbomRows({ circuitJson })
```

Each row is one group of identical pieces: the assembly, the quantity, the
identity and which column it came from, the description and the category, plus
any part numbers. **Category** is the model string's function token —
`screw_m3_l8mm_socketcap` is a `screw`, `flexscreen_w40mm_…` is a `flexscreen`
— falling back to the ftype for a node or a board, which has no model. The `D1`
rows are what a final assembler receives; the `EN1` rows are what the enclosure
supplier makes and buys. Pass `assemblyName` to get one level. A board has no
`source_component`, so its line comes from `source_board`.

There is no designator column. A designator identifies a **position**, which is
why the EBOM needs one; an MBOM line identifies a **quantity of interchangeable
parts**, and naming eight screws individually tells a buyer nothing.

```csv
Assembly,Qty,Identity,Identified By,Description,Category
D1,1,B1,designation,Assembled board B1,board
D1,1,EN1,designation,FDM enclosure,assembly_enclosure
D1,1,NHD-2.0-12864UMY3,manufacturer_part_number,2.0in display,flexscreen
EN1,1,EN1 base,designation,FDM printed base,fdm
EN1,2,ISO 4762 M3x8,designation,M3 x 8mm socket head cap screw,screw
```

`tsci export mbom` writes `mbom.csv`, the export bundles add it beside
`bom.csv`, and the web viewer gets a second cell in the BOM tab. The EBOM is
otherwise unchanged.

## 6. Not in this proposal

**Rendering parts with no position.** Placement props for children of an
enclosure come later. Until then a rubber foot is an MBOM line and nothing in
the 3D view (section 5.3).

**Cable connectivity.** A cable that carries nets is a wire, we already suggested
that cables might want custom-named props for placement, maybe also for electrical
behavior.

**A supplier adapter for hardware.** `findPart` gains the parameter, but no
adapter answers one yet. Until it does, the catalog gives designations and no
part numbers, which is valid for a specification part.
