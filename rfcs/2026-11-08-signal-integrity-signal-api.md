# Signal Integrity with `<signalintegrity>` and `<signal>`

## Summary

A signal integrity (SI) test is described by naming the signals to test. The
rest is read from the board.

```tsx
<signalintegrity bitRate="20Mbps">
  <signal name="DATA" driver=".TX > .Y" receiver=".RX > .A" />
</signalintegrity>
```

From one `<signal>`, tscircuit:

- finds the copper the signal travels through and its ground return;
- extracts the trace's coupled R, L, C and G;
- drives the driver's IBIS buffer with a test pattern;
- records the waveform at the receiver;
- folds the waveform into an eye diagram and checks it against the receiver's
  thresholds.

Each added `<signal>` is coupled to the signals already in the block, so
crosstalk is simulated automatically.

This RFC **replaces** the hand-assembled SI API: `pcb_spice` transients with
`ibisPinStates`, `pcbSpiceChannel`, per-pin `<analog.digitalstimulus>`,
`<voltageprobe>` and `<analog.eyediagram>`, plus a separate `modeling`
configuration file. The [Removed API](#removed-api) section maps every old
concept to its replacement.

## Motivation

The current example for a single 20 Mbit/s trace takes about 40 lines of
simulation TSX and a 25-line `modeling` file. That configuration includes the
following:

- a hand-written lane list and channel reference pin;
- a reduction method (`straightened-stages` or `routed-copper`) and a
  section count;
- ten extraction tolerances and filament counts;
- return-path profiles (`centerYMm`, `centerZMm`) that duplicate copper
  already on the board;
- run states for every IBIS pin;
- a stimulus, a probe and an eye per pin, all wired by `simulationRef`;
- for a differential pair, a second lane, a second stimulus and an `inverted`
  flag;
- a `pcb_stackup` record appended by hand to the Circuit JSON.

None of this describes the test. It describes how one solver run is
assembled, and most of it can be derived from the board and the IBIS files.
The user has to know the pipeline's internals to ask a simple question, and
mistakes are silent. For example, under `straightened-stages` the lane order
is taken as physical order, so listing lanes out of order gives wrong
crosstalk with no error.

In a lab, an SI test is described in terms of signals:

> Drive this pin, probe that pin, hold this neighbour quiet, read the eye.

The API should read the same way.

## Learning progression

Each level adds one `<signal>`. A differential pair counts as **one**
signal.

| Level | TSX | What you learn |
| --- | --- | --- |
| 1 | one `<signal>` (single-ended) | delay, overshoot, ringing, eye opening |
| 1 | one `<signal>` with `{ p, n }` endpoints | differential eye, common mode |
| 2 | two `<signal>`s | the signals now couple: each eye includes crosstalk |
| 3 | three `<signal>`s | full coupling; add `quiet` to one to measure crosstalk alone |
| 4 | DDR: `strobe` and `mask` | data sampled on its strobe; setup/hold margins |

Complete boards for each level are in
[`assets/2026-11-08-signal-integrity-signal-api/`](../assets/2026-11-08-signal-integrity-signal-api/).

### Level 1: one single-ended signal

```tsx
<signalintegrity bitRate="20Mbps">
  <signal name="DATA" driver=".TX > .Y" receiver=".RX > .A" />
</signalintegrity>
```

### Level 1: one differential signal

```tsx
<signalintegrity bitRate="250kbps">
  <signal
    name="BUS"
    driver={{ p: ".TX > .A", n: ".TX > .B" }}
    receiver={{ p: ".RX > .A", n: ".RX > .B" }}
  />
</signalintegrity>
```

The 120 Ω resistor between A and B is a normal `<resistor>` on the board. It
is simulated because it is on the signal's copper. No `termination` prop is
needed.

### Level 2: two signals

```tsx
<signalintegrity bitRate="20Mbps">
  <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
  <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" />
</signalintegrity>
```

Both signals are extracted together, so their mutual inductance and
capacitance are included. Each eye shows the crosstalk received from the
other signal.

### Level 3: three signals, and measuring crosstalk

```tsx
{/* All three switching: real traffic */}
<signalintegrity name="TRAFFIC" bitRate="20Mbps">
  <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
  <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" />
  <signal name="D2" driver=".TX > .D2" receiver=".RX > .D2" />
</signalintegrity>

{/* Same copper, D1 held low: the noise on D1 is crosstalk only */}
<signalintegrity name="XTALK" bitRate="20Mbps">
  <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
  <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" quiet="low" />
  <signal name="D2" driver=".TX > .D2" receiver=".RX > .D2" />
</signalintegrity>
```

A quiet signal is still connected and still coupled. Its driver holds a
steady level, so any voltage change on it comes from its neighbours. Its
near-end (driver side) and far-end (receiver side) waveforms are reported as
NEXT and FEXT.

The two blocks are independent runs over the same board.

### Level 4: DDR

```tsx
<signalintegrity name="WRITE" bitRate="1600Mbps">
  <signal
    name="DQS"
    driver={{ p: ".MC > .DQS0_P", n: ".MC > .DQS0_N" }}
    receiver={{ p: ".DRAM > .DQS_P", n: ".DRAM > .DQS_N" }}
    pattern="clock"
  />
  <signal
    name="DQ0"
    driver=".MC > .DQ0"
    receiver={{ pin: ".DRAM > .DQ0", model: "DQ_40_ODT40_1600" }}
    strobe="DQS"
    mask={{ setup: "75ps", hold: "100ps" }}
  />
  {/* DQ1 … DQ7 likewise */}
</signalintegrity>
```

`strobe="DQS"` binds the data signal to the strobe that samples it. The data
eye is folded on the received DQS crossings rather than on a fixed
`1 / bitRate` grid, and setup and hold are measured at each crossing.

A read is a separate block in which the DRAM pins are the drivers.

## `<signalintegrity>`

One block is one SI test: one coupled set of signals and one simulation run.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | optional | Names the test in results. Required only when a board has more than one block. |
| `bitRate` | `string \| number` | required | Default bit rate for signals. A number is in bit/s. |
| `duration` | `string \| number` | see below | Simulated time. A number is in seconds. |
| `corner` | `"typ" \| "min" \| "max"` | `"typ"` | IBIS corner used for every buffer in this test. |
| `unlistedNets` | `"passive"` | `"passive"` | How copper not named by a `<signal>` is treated (below). |
| `unrouted` | `"error" \| "ideal"` | `"error"` | What to do when a signal's path is not fully routed. |
| `pdn` | `"ideal" \| "extracted"` | `"ideal"` | `"ideal"`: chip power and ground pins see perfect rails. `"extracted"` (power and ground copper simulated from geometry) is **not implemented yet** and fails with an error. |
| `supply` | `"board" \| "ibis"` | `"board"` | Supply voltages taken from the board's sources, or from the IBIS `[Voltage Range]`. |

The default `duration` is one full period of the longest pattern in the
block, plus 16 UI of settling time. The eye excludes the settling time.

### Unlisted copper

The block simulates **the whole board**. Signals that are not listed are not
deleted:

- their copper is extracted and couples to the listed signals;
- their IBIS pins are placed in the receive state, or disabled if the model
  has no receive state;
- passives stay where they are placed.

Listing a signal only means it is driven and measured.

### Multiple blocks

Blocks are independent. Each has its own signal set, run and results. They
may name the same pins.

## `<signal>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | required | Unique within its block. |
| `driver` | `Endpoint` | required | The one pin, or `{ p, n }` pair, that drives the signal. |
| `receiver` | `Endpoint \| Endpoint[]` | required | Pin(s) where the signal is measured. An array means several receivers (multi-drop). |
| `bitRate` | `string \| number` | block `bitRate` | Overrides the block bit rate for this signal. |
| `pattern` | `"prbs7" \| "prbs15" \| "prbs31" \| "clock" \| string` | `"prbs7"` | Bits to send. Any other string is a literal bit string such as `"0011010"`, repeated. |
| `seed` | `number` | `hash(signalName)` | PRBS seed. Each signal gets a different, stable default, so neighbours are not correlated. The block name is not used, so the same signal sends the same bits in every block. |
| `offset` | `string \| number` | `"0UI"` | Delay of this signal's first edge. Accepts `UI` or time units. |
| `quiet` | `"low" \| "high" \| "off"` | not quiet | Holds the driver steady instead of sending `pattern` (below). |
| `probe` | `"local" \| "global"` | `"local"` | Ground reference for single-ended probes (below). |
| `mask` | `"ibis" \| Mask` | `"ibis"` | Pass/fail limits for the eye (below). |
| `strobe` | `string` | none | Name of another `<signal>` in the same block that samples this one. |

### Endpoints

```ts
type Pin = string                    // ".U1 > .A"
type Pair = { p: Pin; n: Pin }       // differential
type Endpoint = Pin | Pair | { pin: Pin | Pair; model?: string }
```

- A **string** is a single-ended pin.
- `{ p, n }` is a differential pair. The logical level is the sign of
  `P − N`. An array **never** means a differential pair.
- `{ pin, model }` selects a specific IBIS `[Model]` for this test. Use it
  for a chip whose `[Model Selector]` offers several drive strengths or
  on-die termination settings. Without `model`, the selector's default is
  used.

Every endpoint must be a pin with an IBIS model.

### Topology

A signal is the set of copper connected to its driver:

- the driver's net;
- any net reached through a two-terminal passive (such as a series resistor
  or an AC coupling capacitor) that is not connected to a power or ground
  net;
- all traces, vias, stubs and branches on those nets.

There is exactly one driver per signal. Every other IBIS pin on the topology
is in the receive state. Pins named in `receiver` are probed and get an eye.
A bidirectional bus is tested as two blocks, one per direction.

### `quiet`

`quiet` turns a signal into a crosstalk victim:

| Value | Driver state | Use |
| --- | --- | --- |
| `"low"` | enabled, held at logic 0 | noise pushing a 0 towards a false 1 |
| `"high"` | enabled, held at logic 1 | noise pushing a 1 towards a false 0 |
| `"off"` | disabled (high impedance) | an undriven shared bus or an open-drain line |

The level must be stated, because the results differ. The pull-up and
pull-down transistors have different strengths, and the dangerous direction
of the noise depends on the level. The idle level is part of the protocol:
UART and I²C idle high, while many buses idle low.

A quiet signal is probed at both ends:

- the **near end** is the driver pin, and its waveform is the NEXT result;
- the **far end** is each receiver pin, and its waveform is the FEXT result.

A quiet signal has no eye.

### `probe`

- `"local"` measures each single-ended pin against the ground pin of its own
  chip. This matches a scope probe with a short ground lead.
- `"global"` measures against the block's reference ground.

Differential signals always measure `P − N`.

### `mask`

```ts
type Mask = {
  vih?: string | number
  vil?: string | number
  setup?: string | number
  hold?: string | number
}
```

- `"ibis"` uses the receiver model's `Vinh`/`Vinl` or `[Receiver
  Thresholds]`.
- An object overrides those values.
- `setup` and `hold` apply only with `strobe`. They are not in IBIS and come
  from the receiver's datasheet.

### `strobe`

`strobe` names a differential or single-ended signal in the same block,
usually with `pattern="clock"`. The data signal's receiver is sampled at the
strobe's receiver crossings.

## Board requirements

The test is computed from information that must be on the board:

| Information | Where it comes from |
| --- | --- |
| Buffer behaviour | `<ibismodel>` on each chip with an endpoint |
| Copper geometry | routed traces, vias and pours |
| Dielectric and thickness | `fabricatorPreset` or an explicit stackup |
| Supply voltages | `<voltagesource>` or other sources on the board, or `supply="ibis"` |
| Parts on the path without IBIS | a SPICE model on that component (ESD diodes, ferrites, connectors) |

If any of these is missing, rendering fails with a specific error. It does
not fall back to guessed values.

IBIS models are required, not optional. `<signalintegrity>` only names the
test; the electrical behaviour of every driver and receiver comes from the
chip's `<ibismodel>`. This RFC does not fetch models automatically from
`manufacturerPartNumber`. A model library that does so would be a separate
proposal, and would produce the same `<ibismodel>` records.

The `<ibismodel>` also carries choices the copper cannot show: which
`[Component]` in the file matches the package, and which `[Model]` each pin
uses when the file has a `[Model Selector]` (for example the 3.3 V variant).
A `<signal>` endpoint's `model` overrides that choice for one test.

## Numerical settings are not API

The following are chosen by the implementation and are not props:

- mesh size, filament counts and tolerances;
- the frequency range;
- the number of sections;
- the reduction method;
- the time step.

The implementation derives them from the IBIS edge rates, `bitRate` and the
board geometry, and refines them until the extracted values converge. The
result must not depend on the order in which signals are written.

## Results

Each block produces, per signal:

| Signal kind | Results |
| --- | --- |
| driven | receiver waveform(s), eye diagram, eye height and width, mask margin |
| driven with `strobe` | per-edge setup and hold margin, worst case |
| quiet | near-end and far-end waveforms, peak NEXT and FEXT in volts |

The block also reports the extracted RLGC matrices for the coupled set.

## Circuit JSON

Source records, produced at render:

```ts
interface SimulationSignalIntegrity {
  type: "simulation_signal_integrity"
  simulation_signal_integrity_id: string
  name?: string
  bit_rate_bps: number
  duration_s: number
  corner: "typ" | "min" | "max"
  unlisted_nets: "passive"
  unrouted: "error" | "ideal"
  pdn: "extracted" | "ideal"
  supply: "board" | "ibis"
}

interface SimulationSignal {
  type: "simulation_signal"
  simulation_signal_id: string
  simulation_signal_integrity_id: string
  name: string
  driver: SignalEndpoint
  receivers: SignalEndpoint[]
  bit_rate_bps: number
  pattern: string
  seed: number
  offset_s: number
  quiet?: "low" | "high" | "off"
  probe: "local" | "global"
  mask: "ibis" | { vih_v?: number; vil_v?: number; setup_s?: number; hold_s?: number }
  strobe_simulation_signal_id?: string
}

type SignalEndpoint =
  | { kind: "single"; source_port_id: string; ibis_model_name?: string }
  | { kind: "differential"; p_source_port_id: string; n_source_port_id: string; ibis_model_name?: string }
```

Result records, produced by the simulation:

- `simulation_signal_waveform` with `simulation_signal_id`, the end
  (`"near"` or `"far"`), `source_port_id`, and time/voltage samples;
- `simulation_signal_eye` with `simulation_signal_id`, the folded traces,
  eye height and width, and mask margin;
- `simulation_signal_crosstalk` with `simulation_signal_id`, peak NEXT and
  peak FEXT;
- `simulation_signal_strobe_margin` with per-edge and worst setup and hold
  margins;
- `simulation_signal_integrity_rlgc` with the coupled matrices and the
  signal order they use.

None of the old channel, lane, profile or extraction records appear in
Circuit JSON.

## Diagnostics

| Condition | Error |
| --- | --- |
| `driver` pin has no IBIS model | `Signal "D0" driver .TX > .D0 has no <ibismodel>.` |
| Two signals share copper in one block | `Signals "D0" and "D1" are on the same net; one signal per net.` |
| A second driving pin on the topology | `Signal "BUS" has two drivers: .TX > .A and .U3 > .A. Exactly one pin drives a signal.` |
| `receiver` not on the driver's topology | `Receiver .RX > .A is not connected to the copper of signal "DATA".` |
| `{ p, n }` legs swapped relative to IBIS `[Diff_pin]` | `Signal "BUS": .TX > .B is the inverting pin; swap p and n.` |
| Path not routed and `unrouted="error"` | `Signal "DATA" is not routed between .TX > .Y and .RX > .A.` |
| No stackup | `<signalintegrity> needs a stackup: set fabricatorPreset or define one.` |
| Unmodelled part on the path | `.D5 is on signal "DATA" and has no SPICE or IBIS model.` |
| Two or more blocks and one has no `name` | `This board has 3 <signalintegrity> blocks; give each a name.` |
| Bare `quiet` | `quiet needs a level: "low", "high" or "off".` |
| `strobe` names an unknown signal | `Signal "DQ0" strobe "DQS" is not a signal in block "WRITE".` |
| `setup`/`hold` without `strobe` | `mask.setup and mask.hold need a strobe.` |

## Removed API

The following are removed from the public API. They are not deprecated
aliases.

| Old | New |
| --- | --- |
| `<analog.transientsimulation spiceEngine="pcb_spice">` | `<signalintegrity>` |
| `ibisPinStates` | derived: the driver drives, every other IBIS pin receives |
| `pcbSpiceChannel` / `modeling.lanes` | the `<signal>` list |
| `modeling.channelReference` | derived from the driver's IBIS ground pin |
| `modeling.reduction`, `sections`, `extraction.*` | chosen by the implementation |
| `modeling.profiles`, `straightened_stage_profiles` | the board's copper and stackup |
| `passiveComponentRefs`, `termination` | placed passives on the topology |
| `<analog.digitalstimulus>` (for SI) | `pattern`, `seed`, `offset`, `quiet` |
| `inverted` on the second leg | `{ p, n }` |
| `<voltageprobe>` (for SI) | `receiver`, `probe` |
| `<analog.eyediagram>` (for SI) | automatic, using `bitRate` or `strobe` |
| `modeling.ddrAssessments` | `strobe` and `mask` |
| hand-appended `pcb_stackup` | `fabricatorPreset` or a board stackup |
| `simulation.config.ts` / `modeling` export | nothing |

The `examples/` directory in `tscircuit/signal-integrity-pipeline` is
rewritten using the levels above.

`<ibismodel>` stays. It describes the chip, not the test. Its
`modelValueCorner` prop is removed, because the corner is a test choice: it is
set by `corner` on `<signalintegrity>`, so the same board can be run at all
three corners.

Its `includePackageParasitics` prop is also removed. The package R, L and C
from the IBIS `[Package]`, `[Pin]` and package model sections are always
simulated, because a real pin always has its package between the die and the
board. The implementation supports every IBIS package form, including R/L/C
on power and ground pins and coupled package matrices. If a separate package
model is supplied, the IBIS package values are not added a second time.

This RFC replaces the SI-specific parts of the open RFCs on IBIS stimuli and
eye diagrams (#25) and on PCB channel experiments (#23) with one element
pair. General transient simulation with `<voltageprobe>` is unchanged.

## Implementation

1. **props:** zod schemas for `signalintegrity` and `signal`, with the
   endpoint union and unit parsing. There is no cap on the number of signals.
2. **circuit-json:** the source and result records above. Remove
   `pcb_spice_channel` and the lane caps.
3. **core:** add `signalintegrity` and `signal` to the element catalogue.
   At render they resolve selectors, compute topology, check the
   diagnostics, and emit source records.
4. **signal-integrity-pipeline:** take only Circuit JSON as input.
   - Group by `simulation_signal_integrity_id` and run each group
     independently.
   - Extract the whole topology from routed copper, with real ground return.
   - Choose numerical settings automatically, and remove the lane cap.
   - Lower patterns, quiet states, probes, eyes and strobe assessments
     internally.
5. **cli:** `tsci simulate` runs every `<signalintegrity>` block in a file
   and prints the results per block.

A prototype is a user-land `<SignalIntegrity>`/`<Signal>` component that
expands to the current primitives. It ran end to end with the native solvers
(FastHenry, FasterCap, ngspice) for:

- one single-ended signal;
- one differential pair with termination;
- two and three single-ended signals;
- three signals with a quiet victim, probed at both ends;
- a differential pair with a single-ended neighbour.

With the existing lane checks widened, four coupled conductors also ran. The
coupled extraction is not limited to three lanes.

## Alternatives considered

- **Arrays for differential pairs** (`driver={[".TX > .A", ".TX > .B"]}`).
  Rejected: an array cannot also mean "several receivers", which multi-drop
  and fly-by buses need.
- **A `termination` prop.** Rejected: a placed resistor is either on the
  copper or not. A prop could only disagree with the board.
- **Boolean `quiet`.** Rejected: low and high give different results, and
  the right level depends on the protocol.
- **Keeping `modeling` as an advanced escape hatch.** Rejected: it keeps two
  sources of truth, and every value in it is either derivable from the board
  or a numerical setting.
- **`analog.signalintegrity` / `analog.signal`.** Possible, if `<signal>` is
  too generic as a top-level name. The props would be identical.

## Open questions

1. Should the element names be `<signalintegrity>` and `<signal>`, or live in
   the `analog` namespace?
2. Should a block accept a list of quiet configurations, so that the
   all-switching and crosstalk runs of Level 3 can be written as one block?
3. Should jitter (random and deterministic) on the driver be a `<signal>`
   prop in this RFC or in a follow-up?
