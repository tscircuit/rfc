# Signal Integrity with `<signalintegrity.simulation>` and `<signalintegrity.signal>`

## Summary

A signal integrity (SI) test is described by naming the signals to test. The
rest is read from the board.

```tsx
<signalintegrity.simulation bitRate="20Mbps">
  <signalintegrity.signal name="DATA" driverRef=".TX > .Y" receiverRef=".RX > .A" />
</signalintegrity.simulation>
```

From one `<signalintegrity.signal>`, tscircuit:

- finds the copper the signal travels through and its ground return;
- extracts the trace's coupled R, L, C and G;
- drives the driver's IBIS buffer with a test pattern;
- records the waveform at the receiver;
- folds the waveform into an eye diagram and checks it against the receiver's
  thresholds.

Each added `<signalintegrity.signal>` is coupled to the signals already in the block, so
crosstalk is simulated automatically.

This RFC **replaces** the hand-assembled SI API: `pcb_spice` transients with
`ibisPinStates`, `pcbSpiceChannel`, per-pin `<analog.digitalstimulus>`,
`<voltageprobe>` and `<analog.eyediagram>`, plus a separate `modeling`
configuration file. The [Removed API](#removed-api) section lists the changes.
This is the target contract; the sibling implementation PRs still need the
review fixes. See [Not implemented yet](#not-implemented-yet).

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

Start with one `<signalintegrity.signal>`, then add coupling and strobe measurements.
A differential pair counts as **one** signal.

| Level | TSX | What you learn |
| --- | --- | --- |
| 1 | one `<signalintegrity.signal>` (single-ended) | delay, overshoot, ringing, eye opening |
| 1 | one `<signalintegrity.signal>` with `{ p, n }` endpoints | differential eye, common mode |
| 2 | two `<signalintegrity.signal>`s | the signals now couple: each eye includes crosstalk |
| 3 | three `<signalintegrity.signal>`s | full coupling; add `quiet` to one to measure crosstalk alone |
| 4 | DDR3 write byte lane, `strobeRef` and `mask` | real controller/memory buffers; generic timing, no JEDEC compliance |

Board examples for each level are in
[`assets/2026-11-08-signal-integrity-signal-api/`](../assets/2026-11-08-signal-integrity-signal-api/).

### Level 1: one single-ended signal

```tsx
<signalintegrity.simulation bitRate="20Mbps">
  <signalintegrity.signal name="DATA" driverRef=".TX > .Y" receiverRef=".RX > .A" />
</signalintegrity.simulation>
```

### Level 1: one differential signal

```tsx
<signalintegrity.simulation bitRate="250kbps">
  <signalintegrity.signal
    name="BUS"
    driverRef={{ p: ".TX > .A", n: ".TX > .B" }}
    receiverRef={{ p: ".RX > .A", n: ".RX > .B" }}
  />
</signalintegrity.simulation>
```

The 120 Ω resistor between A and B is a normal `<resistor>` on the board. It
is simulated because it is on the signal's copper. No `termination` prop is
needed.

### Level 2: two signals

```tsx
<signalintegrity.simulation bitRate="20Mbps">
  <signalintegrity.signal name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <signalintegrity.signal name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" />
</signalintegrity.simulation>
```

Both signals are extracted together, so their mutual inductance and
capacitance are included. Each eye shows the crosstalk received from the
other signal.

### Level 3: three signals, and measuring crosstalk

```tsx
{/* All three switching: real traffic */}
<signalintegrity.simulation name="TRAFFIC" bitRate="20Mbps">
  <signalintegrity.signal name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <signalintegrity.signal name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" />
  <signalintegrity.signal name="D2" driverRef=".TX > .D2" receiverRef=".RX > .D2" />
</signalintegrity.simulation>

{/* Same copper, D1 held low: the noise on D1 is crosstalk only */}
<signalintegrity.simulation name="XTALK" bitRate="20Mbps">
  <signalintegrity.signal name="D0" driverRef=".TX > .D0" receiverRef=".RX > .D0" />
  <signalintegrity.signal name="D1" driverRef=".TX > .D1" receiverRef=".RX > .D1" quiet="low" />
  <signalintegrity.signal name="D2" driverRef=".TX > .D2" receiverRef=".RX > .D2" />
</signalintegrity.simulation>
```

A quiet signal is still connected and still coupled. Its driver holds a
steady level, so any voltage change on it comes from its neighbours. Its
near-end (driver side) and far-end (receiver side) waveforms are reported as
NEXT and FEXT.

The two blocks are independent runs over the same board.

### Level 4: DDR3 write byte lane

```tsx
<signalintegrity.simulation name="WRITE" bitRate="800Mbps" corner="typical">
  <signalintegrity.signal
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
  <signalintegrity.signal
    name="DQ0"
    driverRef={{ pin: ".CPU > .DDR_D0", model: "Model_257" }}
    receiverRef={{ pin: ".DRAM > .DQL0", model: "ODT_off" }}
    strobeRef="DQS"
    mask={{ setup: "10ps", hold: "45ps" }}
  />
</signalintegrity.simulation>
```

[`level4-ddr3-write.tsx`](../assets/2026-11-08-signal-integrity-signal-api/level4-ddr3-write.tsx)
connects AM335x `am335x_zcz` to Winbond `W631GG6MB-12`: DQ0–DQ7 and
DQS/DQS#. Both use 1.5 V at `typ`. The half-UI DQS offset centre-aligns the
transmitted write strobe with data. Each data eye folds on its received DQS.

The 10 ps setup / 45 ps hold values are the DDR3-1600 base values in
[Winbond's datasheet, A03, Table 54, p. 158](https://media.digikey.com/pdf/Data%20Sheets/Winbond%20PDFs/W631GG6MB_A03.pdf#page=158).
They are teaching limits here: the generic mask uses one DC threshold pair,
without slew derating or DDR's separate AC setup and DC hold checks.

This is a write-direction illustration, not JEDEC compliance or a complete
memory-system design. It currently stops with the documented error:
`.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`
AM335x's package must be supported before it can run. A read test would need
a separate block and receive-capable controller models.

## `<signalintegrity.simulation>`

One block is one SI test: one coupled set of signals and one simulation run.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | optional | Names the test in results. Required only when a board has more than one block. |
| `bitRate` | `string \| number` | required | Default bit rate for signals. A number is in bit/s. |
| `duration` | `string \| number` | see below | Simulated time. A number is in seconds. |
| `corner` | `"typical" \| "minimum" \| "maximum"` | `"typical"` | IBIS corner used for every buffer in this test. |
| `unlistedNets` | `"passive"` | `"passive"` | How copper not named by a `<signalintegrity.signal>` is treated (below). |
| `unrouted` | `"error" \| "ideal"` | `"error"` | What to do when a signal's path is not fully routed. |
| `pdn` | `"ideal" \| "extracted"` | `"ideal"` | `"ideal"`: chip power and ground pins see perfect rails. `"extracted"` (power and ground copper simulated from geometry) is **not implemented yet** and fails with an error. |

### Recording time

Recording starts at `t = 0`. Bit 0 starts at `offset`; before it, the driver
holds bit 0. An offset is nonnegative and uses that signal's UI. `clock`
repeats `01`, so its period is 2 UI. Quiet levels apply from `t = 0`.

For each switching signal, let `UI_i = 1 / bitRate_i`. The common settling
boundary is `S = max(offset_i + 16 * UI_i)`. Let `T` be the least common
multiple in time of all switching pattern periods, including different bit
rates. PRBS periods are `(2^n - 1) * UI_i`; literal periods are their bit count
times UI. This covers the joint cycle, not just the longest pattern.

Set `a_i = offset_i + ceil((S - offset_i) / UI_i) * UI_i`. The pipeline
computes the automatic minimum `max(a_i + T + UI_i)`. For a fixed-grid eye,
start one 2-UI window at each bit boundary in `[a_i, a_i + T)`: exactly
`T / UI_i` complete windows. A zero-offset clock therefore records 19 UI
and supplies two complete windows.
The eye excludes settling and requires windows for transmitted high and low
bits.

A strobe eye records a full data UI on either side of its sampling instant
(received crossing plus data offset). The pipeline extends automatic duration
for offsets, propagation and complete windows until at least the same window
count fits. Missing crossings or either transmitted bit class are errors.
A quiet-only block automatically records 32 times the largest UI and measures
after `16 * max(UI_i)`. Quiet peaks in mixed blocks use `[S, duration]`.

Absent `duration` leaves source `duration_s` absent. Core never fills in an
automatic value. Present `duration_s` is the user's explicit bound; the pipeline
must not extend it. Insufficient complete-window coverage fails with
`Signal "DATA": explicit duration is too short for complete eye windows after settling.`
The signal name varies. The final recording duration is reported as
`result.blocks[].duration_s`; source records retain the user's choice.

### Unlisted copper

The whole board's copper stays in the extraction and remains coupled.
Passives and their placed models stay connected. Pin states depend on the
selected IBIS model's capabilities:

| Pin role | State |
| --- | --- |
| Listed driver | drives the pattern or the stated quiet level |
| Listed receiver | receives; a model without a receive mode is an error |
| Unlisted pin with a receive mode | receives, with its output disabled |
| Unlisted Output-only pin with no receive or disable mode | **driven steady low** |
| Other unlisted output-capable pin with a disable mode (3-state/I-O) | disabled |

To change an unlisted output's level, list it as a quiet signal. NC pins stay
unconnected; power/ground pins retain their references and package parasitics.
A passive IBIS load retains its model. An unsupported model capability fails;
the pipeline must not invent a receive or disabled mode.

### Multiple blocks

Blocks are independent. Each has its own signal set, run and results. They
may name the same pins.

## `<signalintegrity.signal>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | required | Unique within its block. |
| `driverRef` | `Endpoint` | required | The one pin, or `{ p, n }` pair, that drives the signal. |
| `receiverRef` | `Endpoint \| Endpoint[]` | required | Pin(s) where the signal is measured. An array means several receivers (multi-drop). |
| `bitRate` | `string \| number` | block `bitRate` | Overrides the block bit rate for this signal. |
| `pattern` | `"prbs7" \| "prbs15" \| "prbs31" \| "clock" \| string` | `"prbs7"` | Bits to send. Any other string is a literal bit string such as `"0011010"`, repeated. |
| `seed` | `number` | spaced PRBS phases | Integer `1..2^n-1` for `prbsN`. See below. |
| `offset` | `string \| number` | `"0UI"` | Nonnegative start time of bit 0 from recording time zero. Accepts `UI` or time units. |
| `quiet` | `"low" \| "high" \| "off"` | not quiet | Holds the driver steady instead of sending `pattern` (below). |
| `probe` | `"local" \| "global"` | `"local"` | Ground reference for single-ended probes (below). |
| `mask` | `"ibis" \| Mask` | `"ibis"` | Pass/fail limits for the eye (below). |
| `strobeRef` | `string` | none | Name of another `<signalintegrity.signal>` in the same block that samples this one. |

### PRBS seeds

There is no hashing. For each PRBS order, build a phase plan from the sorted
union of PRBS signal names across the board's blocks (Unicode code point
order). Include quiet signals with that declared PRBS pattern. Each block
uses the same plan, so the same name and PRBS order send the same bits in
every block, including traffic/quiet comparisons.

For `K` names and period `P = 2^n - 1`, name `i` gets phase
`1 + floor(i * P / K)`, for `i = 0..K-1`. These distinct nonzero phases are
spaced as evenly as integer phases allow. Phase 1 is the all-ones state;
advance the PRBS generator by `phase - 1` bits to obtain its seed. More than
`P` names for that order is an error. Explicit seeds override this plan and
may deliberately repeat a phase.

Props, core, Circuit JSON and pipeline must all reject an explicit PRBS seed
unless it is an integer in `1..2^n-1`. Do not truncate, mask or coerce it into
range. A seed is unused for clock, literal and quiet drives; omit it from
non-PRBS source records. Quiet PRBS records retain their planned seed.

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
`<signalintegrity.ibismodel>` pin mapping, then the only model or an unambiguous selector.
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
Every segment to every receiver must be routed under `unrouted="error"`,
including segments after passives. Only `unrouted="ideal"` permits ideal
connections. A bidirectional bus uses two blocks, one per direction.

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

`quiet="off"` requires a disabled state on every driver leg. An Output-only
model without one is an error. Do not synthesize a passive input mode.

Constant literals (`"0"`, `"1"`, `"000"`, `"111"`, etc.) are normalized to
`quiet="low"` or `quiet="high"`. Explicit `quiet` takes precedence over
`pattern`. All quiet signals have near/far crosstalk results and no eye.

### `probe`

- `"local"` measures each single-ended pin against the ground pin of its own
  chip. This matches a scope probe with a short ground lead.
- `"global"` measures against the block's reference ground.

Differential signals always measure `P − N`. With ideal PDN, local and
global ground are the same ideal reference. Extracted PDN must define mask
reference conversion before it can support global-ground threshold checks.

### `mask`

```ts
type Mask = {
  vih?: string | number
  vil?: string | number
  setup?: string | number
  hold?: string | number
}
```

- Single-ended `"ibis"` starts with the selected model's DC `Vinh`/`Vinl`.
  For each field, `[Model Spec]` overrides `[Model]`: select its `typ`, `min`
  or `max` column at that operating corner. A `[Model]` scalar applies at
  all corners. `[Model Spec]` `NA` in min/max means its typical value,
  as specified by [IBIS 7.1, §6.1, pp. 64–65](https://ibis.org/ver7.1/ver7_1.pdf#page=65).
  Missing required typical values are unavailable.
- A usable `[Receiver Thresholds]` DC pair overrides that pair. At **every**
  corner, use `H = Vth_max` and `L = Vth_min`; each missing optional extremum
  uses `Vth`. These are extrema at **typical operating conditions**, not
  operating corners. This chooses the conservative envelope where extrema
  are supplied; it invents no spread where only nominal `Vth` is supplied.
  With signed DC offsets, `vih = H + Δc + Vinh_dc` and
  `vil = L + Δc + Vinl_dc`. AC offsets are not used.

| Operating corner `c` | Reference supply `S(c)` | Correction `Δc` |
| --- | --- | --- |
| `typ` | `typ` value | `0` |
| `min` | `min` value | `Threshold_sensitivity × (S(min) − S(typ))` |
| `max` | `max` value | `Threshold_sensitivity × (S(max) − S(typ))` |

`S` is the keyword named by `Reference_supply`: `Power_clamp_ref`,
`Gnd_clamp_ref`, `Pullup_ref`, `Pulldown_ref` or `Ext_ref` selects the
corresponding `[... Reference]` keyword. If that keyword is omitted, IBIS
defaults Pullup/POWER Clamp to `[Voltage Range]` and Pulldown/GND Clamp to
0 V; External Reference has no default (§6.1, pp. 78–80). An explicit `NA`
supply value is unavailable for this conversion. A scalar supply applies at
all corners. Apply the correction even with `pdn="ideal"`: a static corner rail
can differ from the typical rail. See
[IBIS 7.1, §6.1, `[Receiver Thresholds]`, pp. 71–73](https://ibis.org/ver7.1/ver7_1.pdf#page=71),
especially “Vth at Minimum or Maximum Operating Conditions” on p. 73.

Missing `Vth` or either DC offset makes this conversion unavailable.
At `typ`, omitted sensitivity/reference needs no correction. At `min`/`max`,
require sensitivity, its named reference, and numeric typical/selected supply
values; do not assume zero sensitivity. A sensitivity without its required
reference is unusable at any corner. If conversion is unavailable, use the
complete DC `Vinh`/`Vinl` pair above. If that is unavailable too, require
explicit `mask.vih`/`mask.vil`; never label a guessed pair `"ibis"`.

- Differential `"ibis"` uses `[Diff_pin] vdiff`, overridden by
  `[Receiver Thresholds] Vdiff_dc` when present: `vih = +vdiff`, `vil = -vdiff`.
  SN65HVD72 therefore uses **+0.2 V / -0.2 V**, never its legs' TTL limits.
- Use the test corner for corner-valued fields; a scalar applies to all
  corners. Missing usable thresholds at that corner are an error.
- `mask={{ vih, vil }}` overrides the threshold pair. An object overrides
  supplied values; omitted values follow these rules.
- `setup` and `hold` apply only with `strobeRef`. They are not in IBIS and come
  from the receiver's datasheet.

For Micron `DQFULL_533`, `Vth=0.900`, `L=0.882`, `H=0.918` V,
DC offsets are ±0.125 V, sensitivity is 0.50, and `[Pullup Reference]`
is 1.8/1.7/1.9 V. At `min`, `Δc=0.50×(1.7−1.8)=−0.050 V`, so
`vih=0.993 V`, `vil=0.707 V`. A 0.740 V low fails. The full corner pairs
(`vih`/`vil`, V) are `1.043/0.757`, `0.993/0.707`, `1.093/0.807`.
Winbond `W631GG6MB-12` `ODT_off` has no `[Receiver Thresholds]` and uses
0.9/0.6 V at all corners. AM335x receive `Model_1000` uses `[Model Spec]`:
0.85/0.65, 0.8125/0.6125, 0.8875/0.6875 V. These real-file checks and the
vectors below are executable with the
[contract self-check](../assets/2026-11-08-signal-integrity-signal-api/check-review.py).

### `strobeRef`

`strobeRef` must name a **different** switching signal in the same block.
Self-reference, dependency cycles and quiet strobes are errors. Forward
references are allowed.

For each data receiver, exactly one strobe receiver must be on the **same
receiving chip** (`source_component_id`). Both legs of a differential endpoint
must be on that chip. Missing or ambiguous matches are errors; never fall
back to another chip's sole receiver.

Sample both rising and falling received crossings at `(vih + vil) / 2`
(zero for a symmetric differential mask). Missing crossings are an error.
For strobed data, add its `offset` to the received crossing to get the
sampling instant. Use the transmitted bit and signed interval rules below
for setup/hold; an invalid sample or a negative margin fails.
This is a generic single-threshold measurement, not native DDR validation.

## Board requirements

The test is computed from information that must be on the board:

| Information | Where it comes from |
| --- | --- |
| Buffer behaviour | `<signalintegrity.ibismodel>` on each chip with an endpoint |
| Copper geometry | routed traces, vias and pours |
| Dielectric and thickness | `fabricatorPreset` or an explicit stackup |
| Via barrel copper thickness (when vias are present) | `pcb_stackup.plated_hole_copper_thickness`, emitted by `fabricatorPreset` or set by an explicit stackup |
| Pin rails | selected IBIS model's `[Voltage Range]` and reference keywords at the test corner |
| Parts on the path without IBIS | a SPICE model on that component (ESD diodes, ferrites, connectors) |

If any of these is missing, rendering fails with a specific error. It does
not fall back to guessed values.

IBIS models are required, not optional. `<signalintegrity.simulation>` only names the
test; the electrical behaviour of every driver and receiver comes from the
chip's `<signalintegrity.ibismodel>`. This RFC does not fetch models automatically from
`manufacturerPartNumber`. A model library that does so would be a separate
proposal, and would produce the same `<signalintegrity.ibismodel>` records.

The `<signalintegrity.ibismodel>` also carries choices the copper cannot show: which
`[Component]` in the file matches the package, and which `[Model]` each pin
uses when the file has a `[Model Selector]` (for example the 3.3 V variant).
An endpoint's `model` overrides that choice for one test. `sot23_5` in the
examples matches `SN74LVC1G04DBV` and `LVC1G04_DBV`: pins 2=A, 3=GND, 4=Y,
5=VCC. The SC70 `DCK` component is a different package.

There is no `supply` prop. With `pdn="ideal"`, each selected pin model sets
its rails from `[Voltage Range]` at `typ`, `min` or `max`. Its `[Pullup
Reference]`, `[Pulldown Reference]`, `[POWER Clamp Reference]` and `[GND Clamp
Reference]` override the corresponding reference voltages when present.
Absent low references are 0 V; absent high references use `[Voltage Range]`.
For `LVC1G04_OUT_33`, the rails are 3.3 / 3.0 / 3.6 V at typ/min/max.
Conflicting ideal voltages on a shared reference are an error. Board supply
sources become relevant only with `pdn="extracted"`, which is not implemented.
The ideal-PDN examples need no voltage source.

## Numerical settings are not API

The following are chosen by the implementation and are not props:

- mesh size, filament counts and tolerances;
- the frequency range;
- the number of sections;
- the reduction method;
- the time step.

The implementation derives them from the IBIS edge rates, `bitRate` and the
board geometry, and refines until extraction and every reported observable
converge, including each receiver's signed crosstalk peaks. An aggregate
waveform RMS alone is insufficient. The result must not depend on the order
in which signals are written.

## Results

Each block produces, per signal:

| Signal kind | Results |
| --- | --- |
| driven | receiver waveform(s), eye diagram, eye height and width, mask margin |
| driven with `strobeRef` | per-edge setup and hold margin, worst case |
| quiet (including constant literals) | near/far waveforms and signed positive/negative NEXT/FEXT peaks per pin, in volts |

The block also reports the extracted RLGC matrices for the coupled set.

## Circuit JSON

Source records, produced at render:

```ts
interface SimulationSignalIntegrity {
  type: "simulation_signal_integrity"
  simulation_signal_integrity_id: string
  name?: string
  bit_rate_bps: number
  duration_s?: number
  corner: "typical" | "minimum" | "maximum"
  unlisted_nets: "passive"
  unrouted: "error" | "ideal"
  pdn: "extracted" | "ideal"
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
  quiet?: "low" | "high" | "off"
  probe: "local" | "global"
  mask: "ibis" | { vih_v?: number; vil_v?: number; setup_s?: number; hold_s?: number }
  strobe_simulation_signal_id?: string
}

type SignalEndpoint =
  | { kind: "single"; source_port_id: string; ibis_model_name?: string }
  | {
      kind: "differential"
      p_source_port_id: string
      n_source_port_id: string
      p_ibis_model_name?: string
      n_ibis_model_name?: string
    }
```

PRBS source records carry the resolved seed in the range above. A pair's
string model override expands to both per-leg fields. Strobe IDs must refer
to a different signal in the same block. Constant literals carry their
normalized `quiet` state.

Result records, produced by the simulation. These are the exact shared
interfaces; props, core, Circuit JSON, pipeline and CLI must use one contract.
The pipeline imports Circuit JSON's exported types and validates its output
with the shared schemas, without permissive type-only bypasses.

```ts
interface SimulationSignalWaveform {
  type: "simulation_signal_waveform"
  simulation_signal_waveform_id: string
  simulation_signal_id: string
  end: "near" | "far"
  source_port_id: string
  timestamps_s: number[]
  voltage_levels: number[]
}

interface SimulationSignalEye {
  type: "simulation_signal_eye"
  simulation_signal_eye_id: string
  simulation_signal_id: string
  source_port_id: string
  folded_traces: { timestamps_s: number[]; voltage_levels: number[] }[]
  eye_height_v: number
  eye_width_s: number
  mask_margin_v: number
}

interface SimulationSignalCrosstalk {
  type: "simulation_signal_crosstalk"
  simulation_signal_crosstalk_id: string
  simulation_signal_id: string
  end: "near" | "far"
  source_port_id: string
  idle_voltage_v: number
  peak_positive_v: number
  peak_negative_v: number
}

interface SimulationSignalStrobeMargin {
  type: "simulation_signal_strobe_margin"
  simulation_signal_strobe_margin_id: string
  simulation_signal_id: string
  source_port_id: string
  edges: { time_s: number; setup_margin_s: number; hold_margin_s: number }[]
  worst_setup_margin_s: number
  worst_hold_margin_s: number
}

interface SimulationSignalIntegrityRlgc {
  type: "simulation_signal_integrity_rlgc"
  simulation_signal_integrity_rlgc_id: string
  simulation_signal_integrity_id: string
  conductors: (
    | { simulation_signal_id: string; leg: "p" | "n" | "single" }
    | { source_trace_id: string }
  )[]
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
recording times in seconds and voltages in volts. Each eye has at least one
complete folded trace in the same shape; its times run from 0 to 2 UI.
Every numeric result must be finite. Eye width is nonnegative. Eye height
and mask margin may be negative. Waveforms span `0..result.blocks[].duration_s`.

Eye and strobe measurements use the transmitted bit, never a received-voltage
decision.
For fixed-grid folding, sample the first bit's UI centre (`0.5 UI` in the
2-UI trace). For strobe folding, centre the trace at the received crossing
plus data offset (`1 UI` in the trace). Match received strobe edges in order
to transmitted edges of the same polarity, starting before the settling gate;
classify by the transmitted data bit at that transmitted edge plus data offset.
There is no phase optimization. Use linear interpolation between waveform
samples, including threshold crossings.

| Field | Definition over all complete folded traces at that receiver |
| --- | --- |
| `eye_height_v` | minimum '1' voltage minus maximum '0' voltage at the sampling instant |
| `eye_width_s` | width of the maximal continuous interval containing that instant where every '1' trace stays ≥ `vih` and every '0' trace stays ≤ `vil`; zero if either condition fails at the instant; bounded by the folded domain |
| `mask_margin_v` | minimum of `v - vih` for all '1' samples and `vil - v` for all '0' samples at that instant |

The bit class stays fixed while finding the interval. Both classes must be
present. Differential measurements use P−N for every voltage and threshold.

Emit one far waveform and eye per switching receiver. For a quiet signal,
emit one waveform and crosstalk record **per receiver**, plus one near
waveform and crosstalk record for its driver. `end="near"` means NEXT;
`end="far"` means FEXT. Never collapse receivers into a maximum. For a
differential endpoint, `source_port_id` is its P port and voltage is P−N.

At each measured end, find the undisturbed idle voltage from the same
circuit with aggressors held at their initial levels. Keep the victim's
selected quiet state, including off, and its termination. Over the measurement
gate, `peak_positive_v = max(0, max(V - idle_voltage_v))` and
`peak_negative_v = min(0, min(V - idle_voltage_v))`. Never subtract the
disturbed waveform's mean. A floating off victim without a unique idle
operating point is an error.

Strobe margins are per data receiver. `edges` contains both crossing
polarities in time order; `time_s` is the absolute sampling instant (received
crossing plus data offset), in seconds. For each matched edge, the expected
bit `b` is the transmitted data bit at the **transmitted** edge plus data
offset. Keep `b` fixed even if received timing crosses a bit boundary.

Within the recorded waveform, form maximal continuous intervals valid for
`b`: `V ≥ vih` for '1', `V ≤ vil` for '0'. Differential V is P−N. Associate
the interval `[a,b_end]` containing sample time `t`; if none contains it,
choose the interval nearest to `t` (distance to its nearest boundary), with
the earliest start breaking a tie. Never use the opposite bit's interval.
With nonnegative requested times `s` and `h` (each defaults to zero):

`setup_margin = t − a − s`; `hold_margin = b_end − t − h`.

Thus a late valid interval gives negative setup; an early one gives negative
hold. An invalid sample **always fails**, including `s=h=0`. If no interval
for the expected bit exists anywhere in the recording of duration `D > 0`,
emit finite margins `−D−s`, `−D−h` and fail. Do not discard that edge.
Intervals with no observed crossing at a recording end are clipped to `0`
or `D`; use only observed valid time, never extrapolate an infinite interval.
Worst margins are the minima of the nonempty edge arrays.

These vectors use `t=1 ns`, expected '1', `D=3 ns`, VIH/VIL=0.9/0.6 V.
All times and margins in the table are ns.

| Case | Expected-bit valid interval | `s` / `h` | Setup / hold margin | Result |
| --- | --- | --- | --- | --- |
| Valid | [0.50, 1.50] | .010 / .045 | +.490 / +.455 | pass |
| Late; sample 0.75 V | [1.02, 2.08] | .010 / .045 | −.030 / +1.035 | fail |
| Early | [0.20, 0.98] | .010 / .045 | +.790 / −.065 | fail |
| Wrong bit; stable 0.10 V | none | .010 / .045 | −3.010 / −3.045 | fail |
| Zero requirements; sample 0.75 V | [1.02, 2.08] | 0 / 0 | −.020 / +1.080 | fail |

RLGC has nonempty `conductors` and `matrices` arrays. Each matrix is
`conductors.length` square at its positive `frequency_hz`;
frequencies are unique and increasing. Rows and columns use the same listed
conductor order at every frequency. Entries are total ohms, henries, farads
and siemens, not per metre. A pair contributes distinct P and N entries with
the same logical signal ID. A single-ended signal contributes `single`;
unlisted copper uses its source trace ID. Conductor identities are unique;
internal mesh partitions and junctions must not duplicate a logical leg.

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
| `driverRef` pin has no IBIS model | `Signal "D0" driver .TX > .D0 has no <signalintegrity.ibismodel>.` |
| Ambiguous model selection | `.TX > .Y: choose an IBIS model from LVC1G04_OUT_18, LVC1G04_OUT_25, LVC1G04_OUT_33, LVC1G04_OUT_50.` |
| Model is not valid for the pin or role | `.RX > .A: selected model does not support receiving on this pin.` |
| Invalid PRBS seed | `Signal "D0": prbs7 seed must be an integer in 1..127.` |
| Two signals share copper in one block | `Signals "D0" and "D1" are on the same net; one signal per net.` |
| A second driving pin on the topology | `Signal "BUS" has two drivers: .TX > .A and .U3 > .A. Exactly one pin drives a signal.` |
| `receiverRef` not on the driver's topology | `Receiver .RX > .A is not connected to the copper of signal "DATA".` |
| `{ p, n }` legs swapped relative to IBIS `[Diff_pin]` | `Signal "BUS": .TX > .B is the inverting pin; swap p and n.` |
| Path not routed and `unrouted="error"` | `Signal "DATA" is not routed between .TX > .Y and .RX > .A.` |
| No stackup | `<signalintegrity.simulation> needs a stackup: set fabricatorPreset or define one.` |
| Unmodelled part on the path | `.D5 is on signal "DATA" and has no SPICE or IBIS model.` |
| Placed model cannot be lowered | `.D5: placed SPICE model is unsupported; it cannot be discarded.` |
| Conflicting ideal reference voltages | `.U1: shared reference VCC has incompatible IBIS corner voltages.` |
| Two or more blocks and one has no `name` | `This board has 3 <signalintegrity.simulation> blocks; give each a name.` |
| Bare `quiet` | `quiet needs a level: "low", "high" or "off".` |
| `quiet="off"` without a disabled state | `Signal "DATA": .TX > .Y model LVC1G04_OUT_33 has no disabled state; use quiet="low" or "high".` |
| Off victim has no unique idle voltage | `Signal "BUS": floating quiet victim has no undisturbed idle operating point.` |
| `strobeRef` names an unknown signal | `Signal "DQ0" strobe "DQS" is not a signal in block "WRITE".` |
| Self-strobe or strobe cycle | `Signal "DQ0": strobe must name a different signal without a dependency cycle.` |
| Quiet strobe | `Signal "DQ0": strobe "DQS" must switch.` |
| Missing or ambiguous physical strobe receiver | `Signal "DQ0": expected exactly one DQS receiver on .DRAM.` |
| Missing single-ended DC thresholds at the corner | `.RX > .A has no usable DC thresholds at minimum; specify mask.vih and mask.vil.` |
| Missing differential mask thresholds | `.RX > .A/.B has no usable differential thresholds; specify mask.vih and mask.vil.` |
| Explicit duration too short | `Signal "DATA": explicit duration is too short for complete eye windows after settling.` |
| Incomplete measurement coverage | `Signal "DATA": recording needs complete eye windows and transmitted high and low bits after settling.` |
| No received strobe crossings | `Signal "DQ0": no received DQS crossings after settling.` |
| `setup`/`hold` without `strobeRef` | `mask.setup and mask.hold need a strobeRef.` |
| Extracted PDN | `pdn="extracted" is not implemented yet.` |
| Coupled `[Package Model]` | `.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.` |
| Branched routed graph | `Signal "BUS": branched routed graphs are not implemented yet.` |

## Removed API

The following are removed from the public API. They are not deprecated
aliases.

| Old | New |
| --- | --- |
| `<analog.transientsimulation spiceEngine="pcb_spice">` | `<signalintegrity.simulation>` |
| `ibisPinStates` | capability-based states above; unlisted Output-only pins drive low |
| `pcbSpiceChannel` / `modeling.lanes` | the `<signalintegrity.signal>` list |
| `modeling.channelReference` | derived from the driver's IBIS ground pin |
| `modeling.reduction`, `sections`, `extraction.*` | chosen by the implementation |
| `modeling.profiles`, `straightened_stage_profiles` | the board's copper and stackup |
| `passiveComponentRefs`, `termination` | placed passives on the topology |
| `<analog.digitalstimulus>` (for SI) | `pattern`, `seed`, `offset`, `quiet` |
| `inverted` on the second leg | `{ p, n }` |
| `<voltageprobe>` (for SI) | `receiverRef`, `probe` |
| `driver` / `receiver` / `strobe` | `driverRef` / `receiverRef` / `strobeRef` |
| `corner` `"typ"` / `"min"` / `"max"` | `"typical"` / `"minimum"` / `"maximum"` |
| `<analog.eyediagram>` (for SI) | automatic, using `bitRate` or `strobeRef` |
| `modeling.ddrAssessments` | removed; generic `strobeRef`/`mask` does not replace DDR assessment |
| `supply` | selected IBIS model rails at the test corner |
| hand-appended `pcb_stackup` | `fabricatorPreset` or a board stackup |
| `simulation.config.ts` / `modeling` export | nothing |

The `examples/` directory in `tscircuit/signal-integrity-pipeline` is
rewritten using the levels above.

`<ibismodel>` becomes `<signalintegrity.ibismodel>`, so every signal-integrity element
shares one namespace; core keeps `<ibismodel>` as an alias. It describes the
chip, not the test. Its
`modelValueCorner` prop is removed, because the corner is a test choice: it is
set by `corner` on `<signalintegrity.simulation>`, so the same board can be run at all
three corners.

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

1. **props:** zod schemas for `signalintegrity` and `signal`, with the
   endpoint union and unit parsing. There is no lane cap; default PRBS phases
   have the finite domain defined above.
2. **circuit-json:** the source and result records above. Remove
   `pcb_spice_channel` and the lane caps.
3. **core:** add `signalintegrity` and `signal` to the element catalogue.
   At render they resolve selectors, compute topology, check the
   diagnostics, and emit source records. Omit automatic `duration_s`.
4. **signal-integrity-pipeline:** Circuit JSON is the only electrical input.
   Model bytes and native solver execution are IO dependencies, not a second
   modeling configuration. Group and run blocks independently, preserve placed
   models, compute automatic duration, extract routed copper, and lower stimulus
   and measurements privately.
5. **cli:** load referenced IBIS assets, provide the native solver adapter,
   call the pipeline with an options object, and print results per block.

The shared call boundary is:

```ts
import type { CircuitJson } from "circuit-json"
import type { PipelineResult, RunSolver } from "@tscircuit/signal-integrity-pipeline"

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
validated results. `result.blocks` holds each block's ID, name, final
`duration_s`, results and limitations; `result.files` maps artifact paths to
text. These are exported pipeline types, shared with the CLI.

## Not implemented yet

| Feature | Current boundary |
| --- | --- |
| `pdn="extracted"` | error; default is `"ideal"` with IBIS-derived rails |
| Coupled `[Package Model]` | error; blocks the AM335x DDR3 write example; scalar package R/L/C is supported |
| Branched routed graphs, including routed multi-drop | error until graph extraction supports shared junctions, regardless of source-trace grouping |
| Native DDR device validation | generic strobe timing only; no real DDR/JEDEC validation |

The sibling PRs still need the specified duration provenance, DC thresholds,
fixed-phase eye metrics, RLGC basis, placed-model preservation, pin-state and
CLI boundary fixes. They are updated separately.
The current assets are contract examples, not verified native pipeline runs.
Earlier native prototype runs do not establish that the five PRs work together.

## Alternatives considered

- **Arrays for differential pairs** (`driverRef={[".TX > .A", ".TX > .B"]}`).
  Rejected: an array cannot also mean "several receivers", which multi-drop
  and fly-by buses need.
- **A `termination` prop.** Rejected: a placed resistor is either on the
  copper or not. A prop could only disagree with the board.
- **Boolean `quiet`.** Rejected: low and high give different results, and
  the right level depends on the protocol.
- **Keeping `modeling` as an advanced escape hatch.** Rejected: it keeps two
  sources of truth, and every value in it is either derivable from the board
  or a numerical setting.
- **Top-level `<signalintegrity>` and `<signal>`.** Rejected in review: they
  are field names, not board elements, and `<signal>` is too generic. The
  `signalintegrity.*` namespace follows `<assembly.*>`. `analog.*` was also
  possible; the props would be identical.

## Open questions

1. Should a block accept a list of quiet configurations, so that the
   all-switching and crosstalk runs of Level 3 can be written as one block?
2. Should jitter (random and deterministic) on the driver be a `<signalintegrity.signal>`
   prop in this RFC or in a follow-up?
