# IBIS Models, Digital Stimuli, and Eye Diagrams

## Motivation

Signal-integrity simulations need reusable chip buffer models, explicit test
patterns, and measurements of the resulting signals. These declarations should
work for single-ended and differential interfaces, including DDR, without
putting test traffic inside a component's electrical model.

This RFC adds IBIS model attachments, digital stimuli, and eye diagrams to the
existing analog simulation API. A transient experiment owns the electrical
simulation; stimuli provide its inputs, and eyes analyze its recorded output.

## Usage at a glance

For a board where `TX.Y` drives `RX.A`, attach the appropriate IBIS definitions
to those chips and declare the experiment alongside the board's connections
and supplies:

```tsx
<ibismodel componentRef=".TX" {...outputModel} />
<ibismodel componentRef=".RX" {...inputModel} />

<analog.transientsimulation
  name="SI"
  duration="1600ns"
  timePerStep="50ps"
  ibisPinStates={{
    ".TX > .Y": { mode: "output", enabled: true },
    ".RX > .A": { mode: "input" },
  }}
/>
<analog.digitalstimulus
  name="DATA"
  transientSimulationRef=".SI"
  drives=".TX > .Y"
  unitInterval="50ns"
  startTime="0ns"
  initialState={0}
  pattern={{ type: "bits", bits: "00010111", repeat: true }}
/>
<voltageprobe
  name="DATA_RX"
  connectsTo=".RX > .A"
  referenceTo=".RX > .GND"
/>
<analog.eyediagram
  name="RECEIVE_EYE"
  transientSimulationRef=".SI"
  probeRef=".DATA_RX"
  unitInterval="50ns"
  timeOrigin="0ns"
  startTime="200ns"
/>
```

`analog` is imported from `tscircuit`. The model definitions are reusable data;
changing a stimulus or adding an eye does not change the chip definition.
Multiple stimuli and eyes can reference the same transient experiment.

## IBIS model attachment

A chip accepts an `ibisModel` element. For example, using a local TI model file:

```tsx
<chip
  name="U1"
  pinLabels={{ pin5: "GND", pin6: "A", pin7: "B", pin8: "VCC" }}
  footprint="soic8"
  ibisModel={<ibismodel
    source={{ file: "./models/sn65hvd72.ibs" }}
    component="SN65HVD72D"
    pinMap={{ "6": "A", "7": "B", "8": "VCC", "5": "GND" }}
    modelSelections={{ "6": "a_b_p", "7": "a_b_n" }}
    references={{
      "6": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
      "7": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
    }}
    corner="typical"
    packagePolicy="omit"
  />}
/>
```

A standalone `<ibismodel componentRef=".U1" {...definition} />` attaches the same
information to an existing chip, including a chip in an imported routed board.
The attachment does not change placement or routing. `componentRef` must resolve
to exactly one chip in scope; duplicate model attachments are invalid.

| Prop | Meaning |
| --- | --- |
| `source` | Exactly one of `{ url, sha256 }`, `{ file, sha256? }`, or `{ content, sha256? }` |
| `component` | Exact component name inside the IBIS file |
| `pinMap` | Physical IBIS pin → local TSX port label, including supply/reference pins |
| `modelSelections` | Optional physical signal pin → selected vendor model; required when the vendor selector has multiple choices |
| `references` | Optional physical signal pin → local ports for `pullup`, `pulldown`, `powerClamp`, and `groundClamp` |
| `corner` | Required `"typical"`, `"minimum"`, or `"maximum"` |
| `packagePolicy` | Required `"vendor"` or `"omit"` |

URL and file sources may include `archive: { member, memberSha256? }` for a ZIP
member. `source.sha256` hashes the original resource bytes before extraction;
`archive.memberSha256` hashes the extracted IBIS bytes. For inline content, the
hash covers UTF-8 bytes. URL hashes are required. File paths resolve relative
to the board's TSX entrypoint directory.

Reference ports identify the rails used by the driver's high/low branches and
clamp tables. They do not add external pullup or pulldown resistors. Omitted
references may be inferred only when vendor data and mapped rails identify an
unambiguous connection; otherwise an explicit mapping is required.

`packagePolicy="vendor"` preserves supported vendor package parasitics and
rejects unsupported package representations. `"omit"` explicitly excludes
package parasitics while retaining the buffer model. The omission must remain
visible in simulation metadata. Unsupported model features must produce errors
rather than silently changing the requested model.

## Transient buffer states

Extend `<analog.transientsimulation>` with:

```ts
ibisPinStates?: Record<
  string,
  { mode: "input" } | { mode: "output"; enabled: boolean }
>
```

Keys are scoped chip-pin selectors. Every selected IBIS signal requires a
compatible state for the experiment. States remain constant for that run;
changing a bidirectional pin's direction during a run is outside this proposal.
An output's `enabled` flag is explicit, and disabling it requires a vendor model
with that capability. Input states have no `enabled` flag.

Existing transient timing props retain their meaning. `timePerStep` bounds the
solver integration step; it does not promise uniformly spaced output samples.
Use time strings with units. Bare numeric times use milliseconds throughout
this API, matching existing analog declarations and Circuit JSON.

## Digital stimulus

`<analog.digitalstimulus>` controls one IBIS output buffer's logical state.
It belongs to an existing transient experiment and does not create another
simulation or directly force a voltage onto the signal.

| Prop | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Stimulus name |
| `transientSimulationRef` | `string` | Required selector for one transient experiment in the same scope |
| `drives` | `string` | Required selector for one compatible IBIS output pin |
| `unitInterval` | `number \| string` | Positive duration of each bit |
| `startTime` | `number \| string` | Required nonnegative pattern start, before the experiment ends |
| `initialState` | `0 \| 1` | Logical state before the pattern starts |
| `inverted` | `boolean?` | Complement the initial state and pattern; defaults to false |
| `pattern` | `{ type: "bits"; bits: string; repeat: boolean }` | Explicit binary sequence and repetition policy |

`bits` must be a nonempty string containing only `0` and `1`. A nonrepeating
sequence must cover the remaining experiment duration. Vendor polarity is
applied separately from `inverted`. Multiple stimuli may drive different pins
in one experiment; conflicting stimuli on the same pin are invalid.

For differential output, declare a stimulus for each leg and invert one when
appropriate for the selected models. DQS can therefore use repeating `01`
while a DDR DQ pin uses a separate data pattern. No DDR-specific pattern or eye
syntax is required. PRBS generation is outside the initial pattern API.

## Voltage probes and eye diagrams

The existing voltage probe records `V(connectsTo) - V(referenceTo)`. Use a
ground reference for single-ended signals or another signal for differential
measurements:

```tsx
<voltageprobe name="DIFF_RX" connectsTo=".RX > .A" referenceTo=".RX > .B" />
<analog.eyediagram
  name="DIFF_EYE"
  transientSimulationRef=".SI"
  probeRef=".DIFF_RX"
  unitInterval="50ns"
  timeOrigin="0ns"
  startTime="200ns"
  endTime="1600ns"
/>
```

| Prop | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Eye name |
| `transientSimulationRef` | `string` | Required selector for one transient experiment in the same scope |
| `probeRef` | `string` | Required selector for one voltage probe in the same scope |
| `unitInterval` | `number \| string` | Positive interval used to fold the waveform |
| `timeOrigin` | `number \| string` | Required finite timing origin for the folding grid |
| `startTime` | `number \| string` | Optional observation start; defaults to recorded waveform start |
| `endTime` | `number \| string` | Optional observation end; defaults to recorded waveform end |

Eye folding uses boundaries `b_k = timeOrigin + k * unitInterval` and complete
two-UI windows `[b_k - UI/2, b_k + 3*UI/2]` inside the observation interval.
Values are interpolated from the recorded timestamps. An interval containing
no complete window is invalid.

`timeOrigin` controls alignment; `startTime` and `endTime` select recorded data.
Changing eye settings does not change the stimulus or rerun the electrical
simulation. Multiple eyes can analyze the same probe with different timing.
Clock recovery, statistical eyes, and protocol compliance are outside this RFC.

## Circuit JSON

Model attachments emit `simulation_ibis_model` records bound to source
components and mapped source ports. Buffer states emit
`simulation_ibis_pin_state`; stimuli emit `simulation_digital_stimulus`; both
reference the owning `simulation_experiment`.

Eyes emit `simulation_eye_diagram` records referencing the experiment and
`simulation_voltage_probe`. They are derived measurements, not additional
experiments. Transient results retain the existing
`simulation_transient_voltage_graph` type, its experiment/probe association,
and actual timestamps. Serialized times use milliseconds.

Rendering registers declarations and resolves selectors; native execution is
an explicit simulation action. Missing, ambiguous, cross-scope, wrong-analysis,
or incompatible references must fail before execution. This RFC does not
standardize PCB extraction settings, solver installation, or a plot viewer.

## Compatibility

This extends [SPICE Simulation Analyses, Stimulus, and Measurements](2026-07-20-analog-simulation-analyses-and-parameter-sweeps.md).
Existing analog circuits and source-waveform declarations remain valid.

The public spelling proposed here is `transientSimulationRef`. The prototype
currently uses `simulationRef`; its props, selector binding, examples, and tests
must migrate together. Serialized relationships continue using
`simulation_experiment_id`. Other solver choices are not introduced here.

## Reference implementation

The experimental implementation is [0hmX/am3352-ddr-eye at 95c5990][implementation].
Its tscircuit dependencies are locally patched packages, not upstream releases.
The linked examples use the prototype's current `simulationRef` spelling:

- [DDR DQ0 with DQS strobe and real TI/Winbond models][ddr-dq].
- [RS-485 differential data with a TI model][rs485].
- [Single-ended CMOS data with a TI model][cmos].
- [Prop schemas][props], [core bindings][core], and [Circuit JSON schemas][circuit-json].

These examples demonstrate the API with reduced channel models; they do not
establish hardware correlation or protocol compliance. Detailed execution and
modeling assumptions remain in the implementation repository.

[implementation]: https://github.com/0hmX/am3352-ddr-eye/tree/95c59905435ed2abe9b3ef89b98f7a8504dc3294
[ddr-dq]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/examples/ddr-dq/index.circuit.tsx
[rs485]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/examples/differential-data/index.circuit.tsx
[cmos]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/examples/single-ended/index.circuit.tsx
[props]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/.packages/native-patches/props.patch
[core]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/.packages/native-patches/core.patch
[circuit-json]: https://github.com/0hmX/am3352-ddr-eye/blob/95c59905435ed2abe9b3ef89b98f7a8504dc3294/.packages/native-patches/circuit-json.patch
