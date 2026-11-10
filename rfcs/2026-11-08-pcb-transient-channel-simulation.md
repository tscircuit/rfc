# PCB transient channel simulation: `<simulation.pcbtransientchannelsimulation>` and `<simulation.pcbchannel>`

## Summary

A signal integrity (SI) test is described by naming the signals to test. The
rest is read from the board. The output is voltage-vs-time waveforms, like a
scope capture at each receiver.

```tsx
import { simulation } from "@tscircuit/core"

<simulation.pcbtransientchannelsimulation bitRate="20Mbps">
  <simulation.pcbchannel name="DATA" driverRef=".TX > .Y" receiverRef=".RX > .A" />
</simulation.pcbtransientchannelsimulation>
```

From one `<simulation.pcbchannel>`, tscircuit:

- finds the copper the signal travels through and its ground return;
- extracts the trace's coupled R, L, C and G;
- drives the driver's IBIS buffer with a test pattern;
- records the waveform at each receiver.

Each added `<simulation.pcbchannel>` is coupled to the signals already in the block, so
crosstalk is simulated automatically.

This is a **transient channel simulation**: one time-domain run per block,
from IBIS driver through PCB copper to IBIS receiver. A channel is one
driver-to-receiver path; a differential pair is one channel.

This RFC **replaces** the hand-assembled SI configuration: `pcb_spice` transients
with `ibisPinStates`, `pcbSpiceChannel`, per-pin stimulus and probes, plus a
separate `modeling` file. The [Removed API](#removed-api) section lists the changes.
This is the target contract; the sibling implementation PRs still need the
review fixes. See [Not implemented yet](#not-implemented-yet).

Options follow tscircuit's no-enum convention: booleans or open strings.
IBIS values always use the typical corner; die rails are ideal, package
parasitics remain, and single-ended probes always use local chip ground.

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

> Drive this pin, probe that pin, hold this neighbour quiet, record the waveforms.

The API should read the same way.

## Learning progression

Start with one `<simulation.pcbchannel>`, then add coupled signals.
A differential pair counts as **one** signal.

| Level | TSX | Waveforms |
| --- | --- | --- |
| 1 | one `<simulation.pcbchannel>` (single-ended) | one receiver waveform |
| 1 | one `<simulation.pcbchannel>` with `{ p, n }` endpoints | one P−N receiver waveform |
| 2 | two `<simulation.pcbchannel>`s | two receiver waveforms, including coupling |
| 3 | three `<simulation.pcbchannel>`s | three receiver waveforms; quiet runs also record the victim's near end and idle levels |
| 4 | DDR3 DQ0–7 + DQS write stimulus | eight DQ receiver waveforms and one P−N DQS waveform once coupled packages are supported |

Board examples for each level are in
[`assets/2026-11-08-pcb-transient-channel-simulation/`](../assets/2026-11-08-pcb-transient-channel-simulation/).

### Level 1: one single-ended signal

```tsx
import { simulation } from "@tscircuit/core"

<simulation.pcbtransientchannelsimulation bitRate="20Mbps">
  <simulation.pcbchannel name="DATA" driverRef=".TX > .Y" receiverRef=".RX > .A" />
</simulation.pcbtransientchannelsimulation>
```

This records one voltage-vs-time waveform at `.RX > .A`.

### Level 1: one differential signal

```tsx
import { simulation } from "@tscircuit/core"

<simulation.pcbtransientchannelsimulation bitRate="250kbps">
  <simulation.pcbchannel
    name="BUS"
    driverRef={{ p: ".TX > .A", n: ".TX > .B" }}
    receiverRef={{ p: ".RX > .A", n: ".RX > .B" }}
  />
</simulation.pcbtransientchannelsimulation>
```

The 120 Ω resistor between A and B is a normal `<resistor>` on the board. It
is simulated because it is on the signal's copper. No `termination` prop is
needed. The result is one P−N waveform at the receiver; separate P and N
waveforms are not emitted.

### Level 2: two signals

```tsx
import { simulation } from "@tscircuit/core"

<simulation.pcbtransientchannelsimulation bitRate="20Mbps">
  <simulation.pcbchannel name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <simulation.pcbchannel name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" />
</simulation.pcbtransientchannelsimulation>
```

Both signals are extracted together, so their mutual inductance and
capacitance are included. Each receiver waveform includes the crosstalk
received from the other signal.

### Level 3: three signals, and a quiet victim

```tsx
import { simulation } from "@tscircuit/core"

{/* All three switching: real traffic */}
<simulation.pcbtransientchannelsimulation name="TRAFFIC" bitRate="20Mbps">
  <simulation.pcbchannel name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <simulation.pcbchannel name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" />
  <simulation.pcbchannel name="D2" driverRef=".TX > .D2" receiverRef=".RX > .D2" />
</simulation.pcbtransientchannelsimulation>

{/* Same copper, D1 held low: the noise on D1 is crosstalk only */}
<simulation.pcbtransientchannelsimulation name="XTALK_LOW" bitRate="20Mbps">
  <simulation.pcbchannel name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <simulation.pcbchannel name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" pattern="0" />
  <simulation.pcbchannel name="D2" driverRef=".TX > .D2" receiverRef=".RX > .D2" />
</simulation.pcbtransientchannelsimulation>

{/* Same copper, D1 held high */}
<simulation.pcbtransientchannelsimulation name="XTALK_HIGH" bitRate="20Mbps">
  <simulation.pcbchannel name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <simulation.pcbchannel name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" pattern="1" />
  <simulation.pcbchannel name="D2" driverRef=".TX > .D2" receiverRef=".RX > .D2" />
</simulation.pcbtransientchannelsimulation>
```

A quiet signal is still connected and still coupled. Its driver holds a
steady level, so any voltage change on it comes from its neighbours.

`TRAFFIC` gives three receiver waveforms. `XTALK_LOW` and `XTALK_HIGH` each
give the D0 and D2 receiver waveforms, plus quiet D1's near-end (driver) and
far-end (receiver) waveforms, each with its undisturbed idle voltage. The
three blocks are independent runs over the same board.

### Level 4: DDR3 write byte lane

```tsx
import { simulation } from "@tscircuit/core"

<simulation.pcbtransientchannelsimulation name="WRITE" bitRate="800Mbps">
  <simulation.pcbchannel
    name="DQS"
    driverRef={{
      pin: { p: ".CPU > .DDR_DQS0", n: ".CPU > .DDR_DQSN0" },
      model: { p: "Model_579", n: "Model_771" },
    }}
    receiverRef={{
      pin: { p: ".DRAM > .DQSL", n: ".DRAM > .DQSL_N" },
      model: { p: "ODT_off", n: "ODT_off" },
    }}
    pattern="clock"
    offset="0.5UI"
  />
  <simulation.pcbchannel
    name="DQ0"
    driverRef={{ pin: ".CPU > .DDR_D0", model: "Model_257" }}
    receiverRef={{ pin: ".DRAM > .DQL0", model: "ODT_off" }}
  />
</simulation.pcbtransientchannelsimulation>
```

[`level4-ddr3-write.tsx`](../assets/2026-11-08-pcb-transient-channel-simulation/level4-ddr3-write/level4-ddr3-write.tsx)
connects AM335x `am335x_zcz` to Winbond `W631GG6MB-12`: DQ0–DQ7 and
DQS/DQS#. Both use 1.5 V at `typ`. The half-UI DQS offset centre-aligns the
transmitted write strobe with data. The intended output is eight DQ receiver
waveforms and one P−N DQS receiver waveform.

This write test covers the byte lane; JEDEC compliance and a complete
memory-system design are outside its scope. It currently stops with:
`.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`
AM335x's package must be supported before it can run. A read test would need
a separate block and receive-capable controller models.

## `<simulation.pcbtransientchannelsimulation>`

One block is one SI test: one coupled set of signals and one simulation run.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | optional | Names the test in results. Required only when a board has more than one block. |
| `bitRate` | `string \| number` | required | Default bit rate for signals. A number is in bit/s. |
| `duration` | `string \| number` | see below | Simulated time. A number is in seconds. |
| `allowUnroutedTraces` | `boolean` | `false` | Allows ideal connections for unrouted path segments. Otherwise every segment must be routed. |

### Recording time

Recording starts at `t = 0`. Bit 0 starts at `offset`; before it, the driver
holds bit 0. Offsets are nonnegative; UI strings use that channel's bit rate. `clock`
repeats `01`, so its period is 2 UI. Constant patterns and disabled drivers
apply from `t = 0`.

For switching channels, let `UI_i = 1 / bitRate_i` and
`S = max(offset_i + 16 * UI_i)`. Automatic duration is
`S + 128 * max(UI_i)`. This is a startup allowance followed by a finite
capture, not a guarantee of electrical settling or a complete pattern cycle.
Quiet-only blocks record `32 * max(UI_i)`. Recording starts at zero.
Use explicit `duration` for a longer capture.

Absent `duration` leaves source `duration_s` absent. Core never fills in an
automatic value. Present `duration_s` is a finite, positive explicit bound;
the pipeline must never extend it. The final recording duration is reported as
`result.blocks[].duration_s`; source records retain the user's choice.

### Unlisted copper

Unlisted nets are always passive: their copper stays in the extraction and
remains coupled, and passives and their placed models stay connected.
Unlisted pins follow the selected IBIS model's capabilities:

| Pin role | State |
| --- | --- |
| Listed driver | drives `pattern`, or is disabled by `driverDisabled` |
| Listed receiver | receives; a model without a receive mode is an error |
| Unlisted pin with a receive mode | receives, with its output disabled |
| Unlisted Output-only pin with no receive or disable mode | **driven steady low** |
| Other unlisted output-capable pin with a disable mode (3-state/I-O) | disabled |

To hold an unlisted output low or high, list it with `pattern="0"` or `"1"`;
to disable it, use `driverDisabled`. NC pins stay unconnected; power/ground
pins retain their references and package parasitics.
A passive IBIS load retains its model. An unsupported model capability fails;
the pipeline must not invent a receive or disabled mode.

### Multiple blocks

Blocks are independent. Each has its own signal set, run and results. They
may name the same pins.

## `<simulation.pcbchannel>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | required | Unique within its block. |
| `driverRef` | `Endpoint` | required | The one pin, or `{ p, n }` pair, that drives the signal. |
| `receiverRef` | `Endpoint \| Endpoint[]` | required | Pin(s) where waveforms are recorded. An array means several receivers (multi-drop). |
| `bitRate` | `string \| number` | block `bitRate` | Overrides the block bit rate for this signal. |
| `pattern` | `string` | `"prbs7"` | Open string: `prbs7`, `prbs15`, `prbs31`, `clock`, or a literal bit string such as `"0011010"`, repeated. Constant literals such as `"0"` and `"1"` are quiet. |
| `seed` | `number` | spaced PRBS phases | Integer `1..2^n-1` for `prbsN`. See below. |
| `offset` | `string \| number` | `"0UI"` | Nonnegative start time of bit 0. Numbers are seconds; strings accept time units or UI at this channel's bit rate. |
| `driverDisabled` | `boolean` | `false` | When true, holds the driver disabled (high impedance), taking precedence over `pattern`. Counts as quiet. |

### PRBS seeds

There is no hashing. For each PRBS order, build a phase plan from the sorted
union of PRBS signal names across the board's blocks (Unicode code point
order). Include disabled drivers with that declared PRBS pattern. Each
block uses the same plan, so the same name and PRBS order send the same bits
in every block, including traffic/quiet comparisons.

For `K` names and period `P = 2^n - 1`, name `i` gets phase
`1 + floor(i * P / K)`, for `i = 0..K-1`. These distinct nonzero phases are
spaced as evenly as integer phases allow. Phase 1 is the all-ones state;
advance the PRBS generator by `phase - 1` bits to obtain its seed. More than
`P` names for that order is an error. Explicit seeds override this plan and
may deliberately repeat a phase.

Props, core, Circuit JSON and pipeline must all reject an explicit PRBS seed
unless it is an integer in `1..2^n-1`. Do not truncate, mask or coerce it into
range. A seed is unused for clock, literal and disabled drives; omit it from
non-PRBS source records. Disabled PRBS records retain their planned seed.

All repos use the same generator: output the state's most significant bit,
then shift left within `n` bits and append the XOR of bits `(n, tap)`, numbered
from 1 at the least significant bit. Taps are `(7, 6)`, `(15, 14)` and
`(31, 28)`.

### Endpoints

```ts
type Pin = string                    // ".U1 > .A"
type Pair = { p: Pin; n: Pin }       // differential
type Endpoint =
  | Pin | Pair
  | { pin: Pin; model?: string }
  | { pin: Pair; model?: string | { p: string; n: string } }
```

- A **string** is a single-ended pin.
- `{ p, n }` is a differential pair. The logical level is the sign of
  `P − N`. An array **never** means a differential pair.
- `{ pin, model }` selects an IBIS `[Model]` for this test. For a pair, a
  string selects the same model for both legs; `{ p: "...", n: "..." }`
  selects each leg independently.

Resolve each physical pin in this order: endpoint `model` override,
`<simulation.ibismodel>` pin mapping, then the only model or an unambiguous selector.
Otherwise error and list the choices. A selected model must belong to that
pin and support its role. Every endpoint must have an IBIS model.

### Topology

A signal is the set of copper connected to its driver:

- the driver's net;
- any net reached through a two-terminal passive (such as a series resistor
  or an AC coupling capacitor) that is not connected to a power or ground
  net;
- all traces, vias, stubs and branches on those nets.

Build an electrical graph from routed segments, vias, physical junctions
and component terminals. Source-trace record grouping does not define its
shape. One three-terminal trace and equivalent split traces have the same
topology. Multi-drop and branches are allowed by the contract, including
shared driver nodes; branched routed graphs are not implemented yet.

Use the placed SPICE model of any part on the path, including a passive with
an explicit model. Preserve its terminals and subcircuit during lowering;
do not discard it or replace it with a built-in R/C/L model. An unsupported
model fails explicitly. Power/ground boundaries come from IBIS references
and declared rail sources, not net names alone. Loads tied to those rails
stay attached, but traversal stops at the rail.

There is one listed driver per signal. Other pins follow the capability
rules above; a second enabled output on the same topology is an error.
Every segment to every receiver must be routed by default, including those
after passives. `allowUnroutedTraces={true}` permits ideal connections for
unrouted segments. A bidirectional bus uses two blocks, one per direction.

### Quiet signals

A constant literal pattern (`"0"`, `"1"`, `"000"`, `"111"`, etc.) holds a
quiet crosstalk victim at logic 0 or 1. Keep the literal in `pattern`.
`driverDisabled={true}` holds it disabled (high impedance), overriding
`pattern`; it requires a disable state on every driver leg. An Output-only
model without one is an error. Do not synthesize a passive input mode.

All quiet signals record the driver (near end) and each receiver (far end),
each with its undisturbed idle voltage so noise can be derived by subtraction.

### Probe reference

Single-ended probes always measure each driver or receiver pin against its
own chip's PCB ground pin. This matches a scope probe with a short ground
lead. Differential waveforms record `P − N`.

## Board requirements

The test is computed from information that must be on the board:

| Information | Where it comes from |
| --- | --- |
| Buffer behaviour | `<simulation.ibismodel>` on each chip with an endpoint |
| Copper geometry | routed traces, vias and pours |
| Dielectric and thickness | `fabricatorPreset` or an explicit stackup |
| Via barrel copper thickness (when vias are present) | `pcb_stackup.plated_hole_copper_thickness`, emitted by `fabricatorPreset` or set by an explicit stackup |
| Pin rails | selected IBIS model's `[Voltage Range]` and reference keywords at the typical corner |
| Parts on the path without IBIS | a SPICE model on that component (ESD diodes, ferrites, connectors) |

If any of these is missing, rendering fails with a specific error. It does
not fall back to guessed values.

IBIS models are required, not optional. `<simulation.pcbtransientchannelsimulation>` only names the
test; the electrical behaviour of every driver and receiver comes from the
chip's `<simulation.ibismodel>`. This RFC does not fetch models automatically from
`manufacturerPartNumber`. A model library that does so would be a separate
proposal, and would produce the same `<simulation.ibismodel>` records.

The `<simulation.ibismodel>` also carries choices the copper cannot show: which
`[Component]` in the file matches the package, and which `[Model]` each pin
uses when the file has a `[Model Selector]` (for example the 3.3 V variant).
An endpoint's `model` overrides that choice for one test. `sot23_5` in the
examples matches `SN74LVC1G04DBV` and `LVC1G04_DBV`: pins 2=A, 3=GND, 4=Y,
5=VCC. The SC70 `DCK` component is a different package.

Die supply and ground reference nodes are always ideal; package parasitics
remain between die nodes and PCB pins. There is no `supply` prop. Each
selected pin model sets its rails from `[Voltage Range]` at `typ`. Its `[Pullup
Reference]`, `[Pulldown Reference]`, `[POWER Clamp Reference]` and `[GND Clamp
Reference]` override the corresponding reference voltages when present.
Absent low references are 0 V; absent high references use `[Voltage Range]`.
For `LVC1G04_OUT_33`, the typical supply is 3.3 V. Conflicting ideal voltages
on a shared reference are an error. The examples need no voltage source.

## Numerical settings are not API

The following are chosen by the implementation and are not props:

- mesh size, filament counts and tolerances;
- the frequency range;
- the number of sections;
- the reduction method;
- the time step.

The implementation derives them from the IBIS edge rates, `bitRate` and the
board geometry, and refines until extraction and every recorded waveform
converge, including small disturbances on quiet channels. An aggregate
waveform RMS alone is insufficient. The result must not depend on the order
in which signals are written.

## Results

Each block produces voltage-vs-time waveforms:

| Signal | Waveforms |
| --- | --- |
| switching | one far-end waveform at each receiver |
| quiet (constant literal pattern or disabled driver) | one near-end waveform at the driver and one far-end waveform at each receiver, each with its undisturbed idle voltage |

Differential endpoints emit P−N only; separate P and N waveforms are not
kept. Extracted RLGC records are retained as solver output, not measurements.
The block also reports its final recording duration.

Downstream tools can derive measurements from these waveform records or
exported CSV; this API adds no measurement elements.

## Circuit JSON

Source records, produced at render:

```ts
interface SimulationSignalIntegrity {
  type: "simulation_signal_integrity"
  simulation_signal_integrity_id: string
  name?: string
  bit_rate_bps: number
  duration_s?: number
  allow_unrouted_traces: boolean
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
  seed?: number
  offset_s: number
  driver_disabled?: boolean
}

type SignalEndpoint =
  | { source_port_id: string; ibis_model_name?: string }
  | {
      p_source_port_id: string
      n_source_port_id: string
      p_ibis_model_name?: string
      n_ibis_model_name?: string
    }
```

Endpoints are strict objects matching exactly one shape; mixed or unknown
fields are rejected. Differential P/N ports must be distinct, and every
receiver must have the same shape as its driver.

PRBS source records carry the resolved seed in the range above. A pair's
string model override expands to both per-leg fields. Constant patterns
retain their literal string; disabled drivers set `driver_disabled: true`.

Result records, produced by the simulation. These are the exact shared
interfaces; props, core, Circuit JSON, pipeline and CLI must use one contract.
The pipeline imports Circuit JSON's exported types and validates its output
with the shared schemas, without permissive type-only bypasses.

```ts
interface SimulationSignalWaveform {
  type: "simulation_signal_waveform"
  simulation_signal_waveform_id: string
  simulation_signal_id: string
  source_port_id: string
  timestamps_s: number[]
  voltage_levels: number[]
  idle_voltage_v?: number
}

interface SimulationSignalIntegrityRlgc {
  type: "simulation_signal_integrity_rlgc"
  simulation_signal_integrity_rlgc_id: string
  simulation_signal_integrity_id: string
  conductors: { simulation_signal_id: string; source_port_id: string }[]
  matrices: {
    frequency_hz: number
    r_ohm: number[][]
    l_h: number[][]
    c_f: number[][]
    g_s: number[][]
  }[]
}
```

Waveforms use parallel, nonempty arrays of equal length: strictly increasing
recording times in seconds and voltages in volts. Every numeric result must
be finite. Waveforms span `0..result.blocks[].duration_s`.
CSV exports preserve signal and port identities, time and voltage samples,
and quiet idle voltages.

Emit one far waveform per receiver for every signal. For a quiet signal,
also emit one near waveform for its driver. Derive near/far from
`source_port_id`: the driver port is near, a receiver port is far. Never
collapse receivers into a maximum. For a differential endpoint, use its P
port and P−N voltage; separate P and N waveforms are not emitted.

`idle_voltage_v` is required on every quiet waveform and absent on switching
waveforms. At each quiet endpoint, find the undisturbed idle voltage from
the same circuit with aggressors held at their initial levels. Keep the
victim's constant pattern or disabled state, its termination and its local
reference; for a differential endpoint the idle voltage is P−N. Never use
the disturbed waveform's mean. A floating disabled victim without a unique
idle operating point is an error.

RLGC has nonempty `conductors` and `matrices` arrays. Each matrix is
`conductors.length` square at its positive `frequency_hz`;
frequencies are unique and increasing. Rows and columns use the same listed
conductor order at every frequency. Entries are total ohms, henries, farads
and siemens, not per metre. Each signal has exactly one conductor for a
single-ended driver, or exactly two with distinct P/N driver ports for a
differential driver. The port identifies the leg; duplicate
`(simulation_signal_id, source_port_id)` pairs are forbidden. Public matrices
select only listed conductors; unlisted copper remains in the private model.

R and L are loop matrices, one loop per conductor against the eliminated
return: `R = Aᵀ R_primitive A`, `L = Aᵀ L_primitive A`, with `A = [I; -ones]`.
The finite return is the extraction section's physical reference copper,
grouped as the last primitive conductor: ground pours and their connections
for routed copper, or the joined return bars for a straightened section.
It is not infinity or an additional public row.

C and G are **ground-referenced**, the convention of multiconductor
transmission-line models and PCB field solvers. The return conductor (every
GND pour and GND-connected conductor) is held at 0 V relative to infinity.
With `s` indexing the signal conductors in the primitive Maxwell matrix
`Cprim`:

`C = Cprim[s,s]`.

Only signal excitations are used; the return's own excitation is not needed.
The signal block must pass the reciprocity check
`max|C − Cᵀ| / max|C| ≤ 2.5%`, otherwise extraction fails. A block that passes
is then symmetrized as `(C + Cᵀ)/2`; a failing block is never averaged into
acceptance. G uses the same rule: `G = Gprim[s,s]`. Lossless G is zero.

This models the return as a solid reference. It does not model a floating
board's common-mode potential; that is out of scope.

C and G retain Maxwell (nodal) signs:
diagonal = total capacitance/conductance to all others, including the return;
off-diagonal = negative mutual value. Thus `ΔV = (R + jωL) I` and
`I_shunt = (G + jωC) V`, with V relative to the return.

At each frequency, align each spatial section to the public conductor order
and sum its total R, L, C and G entries. An absent conductor contributes zero.
Sum shunt halves once; do not divide by length or multiply already-total
solver matrices by length. This aggregate reports extraction totals; the
transient model retains the spatial sections and their junctions.

None of the old channel, lane, profile or extraction records appear in
public Circuit JSON.

## Diagnostics

| Condition | Error |
| --- | --- |
| `driverRef` pin has no IBIS model | `Signal "D0" driver .TX > .D0 has no <simulation.ibismodel>.` |
| Ambiguous model selection | `.TX > .Y: choose an IBIS model from LVC1G04_OUT_18, LVC1G04_OUT_25, LVC1G04_OUT_33, LVC1G04_OUT_50.` |
| Model is not valid for the pin or role | `.RX > .A: selected model does not support receiving on this pin.` |
| Invalid PRBS seed | `Signal "D0": prbs7 seed must be an integer in 1..127.` |
| Two signals share copper in one block | `Signals "D0" and "D1" are on the same net; one signal per net.` |
| A second driving pin on the topology | `Signal "BUS" has two drivers: .TX > .A and .U3 > .A. Exactly one pin drives a signal.` |
| `receiverRef` not on the driver's topology | `Receiver .RX > .A is not connected to the copper of signal "DATA".` |
| `{ p, n }` legs swapped relative to IBIS `[Diff_pin]` | `Signal "BUS": .TX > .B is the inverting pin; swap p and n.` |
| Path not routed and `allowUnroutedTraces` is false | `Signal "DATA" is not routed between .TX > .Y and .RX > .A.` |
| No stackup | `<simulation.pcbtransientchannelsimulation> needs a stackup: set fabricatorPreset or define one.` |
| Unmodelled part on the path | `.D5 is on signal "DATA" and has no SPICE or IBIS model.` |
| Placed model cannot be lowered | `.D5: placed SPICE model is unsupported; it cannot be discarded.` |
| Conflicting ideal reference voltages | `.U1: shared reference VCC has incompatible typical IBIS voltages.` |
| Two or more blocks and one has no `name` | `This board has 3 <simulation.pcbtransientchannelsimulation> blocks; give each a name.` |
| `driverDisabled` without a disable state on every driver leg | `Signal "DATA": .TX > .Y model LVC1G04_OUT_33 has no disabled state.` |
| Disabled victim has no unique idle voltage | `Signal "BUS": floating disabled victim has no undisturbed idle operating point.` |
| Invalid explicit duration | `duration must be finite and greater than zero.` |
| Coupled `[Package Model]` | `.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.` |
| Branched routed graph | `Signal "BUS": branched routed graphs are not implemented yet.` |

## Removed API

The hand-assembled SI configuration is replaced as follows. Removed names
are not deprecated aliases.

| Old | New |
| --- | --- |
| `<analog.transientsimulation spiceEngine="pcb_spice">` | `<simulation.pcbtransientchannelsimulation>` |
| `ibisPinStates` | capability-based states above; unlisted Output-only pins drive low |
| `pcbSpiceChannel` / `modeling.lanes` | the `<simulation.pcbchannel>` list |
| `modeling.channelReference` | derived from the driver's IBIS ground pin |
| `modeling.reduction`, `sections`, `extraction.*` | chosen by the implementation |
| `modeling.profiles`, `straightened_stage_profiles` | the board's copper and stackup |
| `passiveComponentRefs`, `termination` | placed passives on the topology |
| `<analog.digitalstimulus>` (for SI) | `pattern`, `seed`, `offset`, `driverDisabled` |
| `inverted` on the second leg | `{ p, n }` |
| `<ibismodel>` | `<simulation.ibismodel>` |
| `<voltageprobe>` (for SI) | `receiverRef` with local chip ground |
| `driver` / `receiver` | `driverRef` / `receiverRef` |
| `<analog.eyediagram>` (for SI) | not needed; derive from waveforms |
| `modeling.ddrAssessments` | removed; DDR assessment is outside this RFC |
| `supply` | selected IBIS model rails at the typical corner |
| hand-appended `pcb_stackup` | `fabricatorPreset` or a board stackup |
| `simulation.config.ts` / `modeling` export | nothing |

The `examples/` directory in `tscircuit/signal-integrity-pipeline` is
rewritten using the levels above.

`<ibismodel>` becomes `<simulation.ibismodel>`, beside the other simulation
elements. The old `<ibismodel>` name and its `modelValueCorner` prop are
removed; IBIS values always use the typical corner.

Its `includePackageParasitics` prop is also removed. The package R, L and C
from the IBIS `[Package]`, `[Pin]` and package model sections are always
simulated, because a real pin always has its package between the die and the
board. Scalar package values on signal, power and ground pins are included.
Coupled package matrices are not implemented yet and must fail explicitly;
never silently substitute scalar values. If a separate supported package
model is supplied, the IBIS package values are not added a second time.

This RFC replaces the SI-specific parts of the open RFCs on IBIS stimuli and
eye diagrams (#25) and on PCB channel experiments (#23) with one element
pair. General transient simulation with `<voltageprobe>` is unchanged.

## Implementation

1. **props:** zod schemas for `pcbtransientchannelsimulation` and `pcbchannel`, with the
   endpoint union and unit parsing. There is no lane cap; default PRBS phases
   have the finite domain defined above.
2. **circuit-json:** the source and result records above. Remove
   `pcb_spice_channel` and the lane caps.
3. **core:** add `simulation.pcbtransientchannelsimulation`,
   `simulation.pcbchannel` and `simulation.ibismodel` to the `simulation`
   namespace (`core/lib/namespaced-elements/simulation.ts`).
   At render they resolve selectors, compute topology, check the
   diagnostics, and emit source records. Omit automatic `duration_s`.
4. **signal-integrity-pipeline:** Circuit JSON is the only electrical input.
   Model bytes and native solver execution are IO dependencies, not a second
   modeling configuration. Group and run blocks independently, preserve placed
   models, compute automatic duration, extract routed copper, and lower stimulus
   and waveform recording privately.
5. **cli:** load referenced IBIS assets, provide the native solver adapter,
   call the pipeline with an options object, and print results per block.

The shared call boundary is:

```ts
import type {
  CircuitJson,
  SimulationSignalWaveform,
  SimulationSignalIntegrityRlgc,
} from "circuit-json"
import type { PipelineResult, RunSolver } from "@tscircuit/signal-integrity-pipeline"

interface PipelineBlockResult {
  simulation_signal_integrity_id: string
  name?: string
  duration_s: number
  results: (SimulationSignalWaveform | SimulationSignalIntegrityRlgc)[]
  limitations: string[]
}

interface PipelineOptions {
  circuitJson: CircuitJson
  ibisSources: Record<string, Uint8Array | string>
  runSolver: RunSolver
  onProgress?: (message: string) => void
}
declare function runPipeline(options: PipelineOptions): Promise<PipelineResult>
```

`ibisSources` maps each referenced asset's `project_relative_path` to its
bytes or text. `RunSolver` accepts `{ solver, files, args, outputFiles }` and
returns `Promise<{ stdout, stderr, files, exitCode? }>`. The solver is
`"fasthenry" | "fastercap" | "ngspice"`; files are maps of relative paths to
text, args and outputFiles are string arrays, and exitCode is a number.

The CLI calls `runPipeline({ circuitJson, ibisSources, runSolver })` and reads
`result.simulationResultCircuitJson`, **not** the result object as an array.
That array retains input records and replaces prior SI result records with
validated results. `result.blocks` is `PipelineBlockResult[]`, holding each
block's ID, name, final `duration_s`, waveform/RLGC results and limitations.
`result.files` maps artifact paths to text. These are exported pipeline types,
shared with the CLI.

## Not implemented yet

| Feature | Current boundary |
| --- | --- |
| Coupled `[Package Model]` | error; blocks the AM335x DDR3 write example; scalar package R/L/C is supported |
| Branched routed graphs, including routed multi-drop | error until graph extraction supports shared junctions, regardless of source-trace grouping |
| Native DDR device validation | outside this waveform-only API; no DDR/JEDEC validation |

The sibling PRs still need the waveform-only output, duration provenance,
RLGC basis, placed-model preservation, pin-state and CLI boundary fixes.
They are updated separately.

## Alternatives considered

- **Built-in eye/crosstalk/timing measurements.** Rejected: they are derivable
  from waveforms; keeping them outside the simulation keeps it small.
- **Arrays for differential pairs** (`driverRef={[".TX > .A", ".TX > .B"]}`).
  Rejected: an array cannot also mean "several receivers", which multi-drop
  and fly-by buses need.
- **A `termination` prop.** Rejected: a placed resistor is either on the
  copper or not. A prop could only disagree with the board.
- **Keeping `modeling` as an advanced escape hatch.** Rejected: it keeps two
  sources of truth, and every value in it is either derivable from the board
  or a numerical setting.
- **Top-level `<signalintegrity>` and `<signal>`.** Rejected in review: they
  are field names, not board elements, and `<signal>` is too generic.
- **A `signalintegrity.*` namespace.** Replaced by the existing `simulation.*`
  namespace, which already holds `<simulation.pcbreturncurrentsimulation>`
  and its `<simulation.pcbreturncurrentexcitation>` children; this RFC uses
  the same container-plus-children shape.
- **`pcbchannelsimulation` with an `analysis` or `type` prop.** Rejected:
  "channel simulation" covers several analyses (transient, statistical eye,
  TDR, S-parameters) with different props and outputs. This RFC is the
  transient one, so the name says so.
- **Extending `<pcbreturncurrentsimulation>`.** Rejected: it applies a fixed
  current and solves the return-current field; this applies IBIS buffers and
  a bit pattern in the time domain. Almost no prop or output is shared, so
  they share selector-resolution code, not the element.

## Open questions

1. Should a block accept a list of quiet configurations, so that the
   all-switching and crosstalk runs of Level 3 can be written as one block?
2. Should jitter (random and deterministic) on the driver be a `<simulation.pcbchannel>`
   prop in this RFC or in a follow-up?
