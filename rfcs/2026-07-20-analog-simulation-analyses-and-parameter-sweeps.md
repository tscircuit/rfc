# SPICE Simulation Analyses, Stimulus, and Measurements

## Motivation

tscircuit exposes SPICE transient, DC operating-point, DC sweep, AC sweep, and
one-dimensional parameter sweeps. General SPICE workflows also require
arbitrary source waveforms, more than one parameter sweep, and scalar
calculations.

This RFC adds those capabilities without adding a non-SPICE simulation format.

## Use cases

| Use case | Required addition |
| --- | --- |
| Apply an arbitrary time-domain voltage or current stimulus | Piecewise-linear source waveform |
| Evaluate a circuit across more than one component or source value | Multiple parameter sweeps |
| Calculate efficiency, regulation, frequency, or another scalar | TypeScript measurement |

## Usage at a glance

The `analog` namespace gives each analysis its own element:

```tsx
import { analog } from "tscircuit"

export default () => (
  <board>
    <analog.transientsimulation
      name="startup"
      duration="10ms"
      timePerStep="1us"
    />

    <analog.dcoperatingpointsimulation name="bias-point" />

    <analog.dcsweepsimulation
      name="line-regulation"
      sweepSource=".Vin"
      sweepStart="2.5V"
      sweepStop="5.5V"
      sweepStep="0.1V"
    />

    <analog.acsweepsimulation
      name="frequency-response"
      sweepType="decade"
      samplesPerInterval={20}
      startFrequency="10Hz"
      stopFrequency="1MHz"
    />
  </board>
)
```

The four typed elements reuse the existing `name`, `spiceEngine`, and
`spiceOptions` props. Their analysis-specific props are described below.

## Transient simulation

`<analog.transientsimulation>` records voltage and current over time:

```tsx
<analog.transientsimulation
  name="startup"
  duration="10ms"
  startTime="0ms"
  timePerStep="1us"
  spiceEngine="ngspice"
/>
```

| Prop | Type | Default |
| --- | --- | --- |
| `duration` | `number \| string` | `"10ms"` |
| `startTime` | `number \| string` | `"0ms"` |
| `timePerStep` | `number \| string` | `"0.01ms"` |

Raw numbers use milliseconds. `duration` and `timePerStep` must be positive,
and `startTime` must be between zero and `duration`.

## DC operating point

`<analog.dcoperatingpointsimulation>` records one voltage or current value for
each probe:

```tsx
<analog.dcoperatingpointsimulation
  name="bias-point"
  spiceEngine="ngspice"
/>
```

It has no analysis-specific props.

## Direct DC source sweep

`<analog.dcsweepsimulation>` sweeps one independent voltage or current source
in a single analysis:

```tsx
<analog.dcsweepsimulation
  name="line-regulation"
  spiceEngine="ngspice"
  sweepSource=".Vin"
  sweepStart="2.5V"
  sweepStop="5.5V"
  sweepStep="0.1V"
/>
```

`sweepSource` must resolve to one voltage or current source. `sweepStart`,
`sweepStop`, and the nonzero `sweepStep` use volts for a voltage source and
amperes for a current source. Unit-bearing strings are preferred.

This is a SPICE DC source sweep. It is different from the repeated component
parameter sweep described below.

## AC sweep

The source declares its small-signal magnitude and phase, while
`<analog.acsweepsimulation>` declares the frequency sweep:

```tsx
<voltagesource
  name="Vin"
  voltage="2.5V"
  acMagnitude="1V"
  acPhase="0deg"
/>

<analog.acsweepsimulation
  name="frequency-response"
  spiceEngine="ngspice"
  sweepType="decade"
  samplesPerInterval={20}
  startFrequency="10Hz"
  stopFrequency="1MHz"
/>
```

| Prop | Type | Usage |
| --- | --- | --- |
| `sweepType` | `"linear" \| "decade" \| "octave"` | Frequency spacing |
| `startFrequency` | `number \| string` | First frequency |
| `stopFrequency` | `number \| string` | Last frequency |
| `samplesPerInterval` | `number` | Samples per decade or octave |
| `sampleCount` | `number` | Total samples for a linear sweep |

Raw frequency numbers use hertz. Decade and octave sweeps require
`samplesPerInterval`. Linear sweeps require `sampleCount`. AC results retain
real and imaginary values; magnitude and phase are views of those values.

DC bias, transient waveform props, and `acMagnitude`/`acPhase` may coexist on
the same source. They apply only to their corresponding analysis.

## Stimulus waveforms

`voltageWaveform` and `currentWaveform` define SPICE piecewise-linear sources.
Each point has a time and a voltage or current. Points are applied in order and
linearly interpolated.

```tsx
<currentsource
  name="ILOAD"
  currentWaveform={[
    { time: "0ms", current: "100mA" },
    { time: "1ms", current: "100mA" },
    { time: "1.001ms", current: "1A" },
    { time: "2ms", current: "1A" },
    { time: "2.001ms", current: "100mA" },
  ]}
/>
```

```tsx
<voltagesource
  name="VIN"
  voltageWaveform={[
    { time: "0ms", voltage: "2.2V" },
    { time: "1ms", voltage: "2.2V" },
    { time: "1.001ms", voltage: "4.2V" },
    { time: "2ms", voltage: "4.2V" },
    { time: "2.001ms", voltage: "2.2V" },
  ]}
/>
```

Raw times use milliseconds, raw voltages use volts, and raw currents use
amperes. Times must be nonnegative and strictly increasing. A source cannot use
a piecewise-linear waveform and a periodic `waveShape` at the same time.

## Component parameter sweeps

A nested `<analog.sweepparameter>` repeats its parent simulation with a
simulation-only component value. This example overlays a transient result for
each load resistance:

```tsx
<resistor name="Rload" resistance="1kΩ" />

<analog.transientsimulation
  name="load-response"
  duration="10ms"
  timePerStep="1us"
>
  <analog.sweepparameter
    name="load-resistance"
    parameterType="resistance"
    resistorRef=".Rload"
    values={["100Ω", "330Ω", "1kΩ", "3.3kΩ", "10kΩ"]}
  />
</analog.transientsimulation>
```

`parameterType` selects a parameter-specific reference prop. It does not use a
polymorphic `target`/`targetProperty` pair.

| `parameterType` | Required target prop | Example |
| --- | --- | --- |
| `"resistance"` | `resistorRef` | `resistorRef=".Rload"` |
| `"capacitance"` | `capacitorRef` | `capacitorRef=".C1"` |
| `"inductance"` | `inductorRef` | `inductorRef=".L1"` |
| `"voltage"` | `net` | `net="VBIAS"` |
| `"current"` | `currentSourceRef` | `currentSourceRef=".Iload"` |

For example, a DC operating-point sweep of a forced net voltage is:

```tsx
<analog.dcoperatingpointsimulation name="bias-sweep">
  <analog.sweepparameter
    parameterType="voltage"
    net="VBIAS"
    values={["0V", "0.5V", "1V", "1.5V", "2V"]}
  />
</analog.dcoperatingpointsimulation>
```

`values` preserves the requested order. A generated linear sweep may instead
use `start`, `stop`, and `step`:

```tsx
<analog.sweepparameter
  parameterType="resistance"
  resistorRef=".Rload"
  start="100Ω"
  stop="1kΩ"
  step="100Ω"
/>
```

## Multiple parameter sweeps

More than one `<analog.sweepparameter>` may be nested in a simulation. The
simulation runs the Cartesian product in child order. This only extends the
existing resistance, capacitance, inductance, voltage, and current variants.

```tsx
<analog.transientsimulation
  name="output-current-capability"
  duration="5ms"
  timePerStep="1us"
>
  <analog.sweepparameter
    name="input-voltage"
    parameterType="voltage"
    net="VIN"
    values={["1.8V", "2.5V", "3.3V", "4.2V", "5.5V"]}
  />
  <analog.sweepparameter
    name="load-current"
    parameterType="current"
    currentSourceRef=".ILOAD"
    start="0A"
    stop="3A"
    step="25mA"
  />
</analog.transientsimulation>
```

Selecting a limit such as the highest load-current coordinate whose settled
output remains in regulation is ordinary result processing, not a separate
simulation element.

## Measurements

`<analog.measurement>` is nested directly in
`<analog.transientsimulation>`. Its TypeScript function runs once for each
parameter-sweep coordinate and returns one scalar:

```tsx
const mean = (samples: readonly number[]) =>
  samples.reduce((sum, sample) => sum + sample, 0) / samples.length

export default () => (
  <analog.transientsimulation duration="10ms" timePerStep="1us">
    <analog.measurement
      name="settled-output-voltage"
      unit="V"
      measureFn={({ select, getVoltage }) => {
        const output = select("net.VOUT")
        if (!output) throw new Error("VOUT was not found")
        return mean(getVoltage(output).values.slice(-1000))
      }}
    />
  </analog.transientsimulation>
)
```

The callback uses the existing public selector types from `@tscircuit/props`:

```tsx
import type {
  CustomDrcSelect,
  SelectionResultComponent,
  SelectionResultNet,
  SelectionResultPort,
} from "@tscircuit/props"

interface TransientMeasurementSeries {
  timestampsMs: readonly number[]
  values: readonly number[]
}

interface AnalogTransientMeasurementContext {
  select: CustomDrcSelect
  getVoltage: (
    target: SelectionResultNet | SelectionResultPort,
  ) => TransientMeasurementSeries
  getCurrent: (
    target: SelectionResultComponent | SelectionResultPort,
  ) => TransientMeasurementSeries
}

interface AnalogMeasurementProps {
  name: string
  unit: string
  measureFn: (context: AnalogTransientMeasurementContext) => number
}
```

`select` has the same behavior as `CustomDrcSelect` and resolves within the
parent simulation's group or subcircuit. It returns public selection wrappers
and never returns Circuit JSON. `getVoltage` and `getCurrent` read the current
sweep coordinate's transient result for the selected target. They throw when
the selected target cannot provide the requested quantity. Both arrays have
the same length.

The measurement function returns a finite number in the declared `unit`. Its
TypeScript source is not serialized into Circuit JSON. Frequency, efficiency,
and regulation calculations therefore use normal TypeScript instead of a new
expression language.

## Circuit JSON

Each TSX simulation emits a `simulation_experiment`. The existing
`experiment_type` values remain:

| TSX element | `experiment_type` |
| --- | --- |
| `analog.transientsimulation` | `spice_transient_analysis` |
| `analog.dcoperatingpointsimulation` | `spice_dc_operating_point` |
| `analog.dcsweepsimulation` | `spice_dc_sweep` |
| `analog.acsweepsimulation` | `spice_ac_analysis` |

Analysis props are stored directly on the experiment. For example:

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_frequency_response",
  "name": "frequency-response",
  "experiment_type": "spice_ac_analysis",
  "ac_sweep_type": "decade",
  "ac_samples_per_interval": 20,
  "ac_start_frequency_hz": 10,
  "ac_stop_frequency_hz": 1000000
}
```

### Analysis-specific results

Circuit JSON uses result types specific to the analysis and measured quantity.
There is no generic `simulation_analysis_result`.

| Analysis | Voltage result | Current result |
| --- | --- | --- |
| Transient | `simulation_transient_voltage_graph` | `simulation_transient_current_graph` |
| DC operating point | `simulation_dc_operating_point_voltage` | `simulation_dc_operating_point_current` |
| DC sweep | `simulation_dc_sweep_voltage_graph` | `simulation_dc_sweep_current_graph` |
| AC sweep | `simulation_ac_sweep_voltage_graph` | `simulation_ac_sweep_current_graph` |

The existing transient graph elements stay unchanged. They remain suitable for
time-domain behavior such as current-flow animation.

A DC operating-point voltage is a scalar:

```json
{
  "type": "simulation_dc_operating_point_voltage",
  "simulation_dc_operating_point_voltage_id": "simulation_dc_operating_point_voltage_vout",
  "simulation_experiment_id": "simulation_experiment_bias_point",
  "simulation_voltage_probe_id": "simulation_voltage_probe_vout",
  "voltage": 3.3
}
```

An AC voltage graph stores complex voltage samples against frequency:

```json
{
  "type": "simulation_ac_sweep_voltage_graph",
  "simulation_ac_sweep_voltage_graph_id": "simulation_ac_sweep_voltage_graph_vout",
  "simulation_experiment_id": "simulation_experiment_frequency_response",
  "simulation_voltage_probe_id": "simulation_voltage_probe_vout",
  "frequencies_hz": [10, 12.589, 15.849],
  "complex_voltages": [
    { "re": 0.99, "im": -0.01 },
    { "re": 0.98, "im": -0.02 },
    { "re": 0.96, "im": -0.04 }
  ]
}
```

The current form uses `complex_currents` with the same `{ "re", "im" }`
shape. The frequency and complex-value arrays always have the same length. DC
sweep graphs use `sweep_values`, `sweep_unit`, and either `voltage_levels` or
`current_levels`.

### Source waveforms

Waveform points remain on the existing source elements:

```json
{
  "type": "simulation_current_source",
  "simulation_current_source_id": "simulation_current_source_iload",
  "current_waveform": [
    { "time_ms": 0, "current": 0.1 },
    { "time_ms": 1, "current": 0.1 },
    { "time_ms": 1.001, "current": 1 }
  ]
}
```

`simulation_voltage_source` uses `voltage_waveform` with `time_ms` and
`voltage`.

### Parameter sweep relationships

`<analog.sweepparameter>` emits a `simulation_parameter_sweep`. Its target ID
is specific to `parameter_type`; this resistance example uses
`resistor_source_component_id`:

```json
{
  "type": "simulation_parameter_sweep",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
  "simulation_experiment_id": "simulation_experiment_load_response",
  "name": "load-resistance",
  "parameter_type": "resistance",
  "resistor_source_component_id": "source_component_rload",
  "parameter_values": [100, 330, 1000, 3300, 10000],
  "parameter_unit": "Ω"
}
```

Each analysis result currently carries one
`simulation_parameter_sweep_coordinate`:

```json
{
  "simulation_parameter_sweep_coordinate": {
    "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
    "sweep_index": 1,
    "parameter_value": 330,
    "parameter_unit": "Ω"
  }
}
```

A transient resistance sweep produces transient graph elements, while an AC
resistance sweep produces AC sweep graph elements. The two are not forced into
one generic result shape.

### Multidimensional sweep relationships

Every `<analog.sweepparameter>` emits the existing
`simulation_parameter_sweep`. Results from multiple sweeps use an ordered
`simulation_parameter_sweep_coordinates` array:

```json
{
  "simulation_parameter_sweep_coordinates": [
    {
      "simulation_parameter_sweep_id": "simulation_parameter_sweep_vin",
      "sweep_index": 2,
      "parameter_value": 3.3,
      "parameter_unit": "V"
    },
    {
      "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
      "sweep_index": 40,
      "parameter_value": 1,
      "parameter_unit": "A"
    }
  ]
}
```

One-dimensional results keep the singular field for compatibility.

### Measurement results

`<analog.measurement>` emits one `simulation_measurement_result`. Its value
array follows the Cartesian-product order defined by the sweep children:

```json
{
  "type": "simulation_measurement_result",
  "simulation_measurement_result_id": "simulation_measurement_result_vout",
  "simulation_experiment_id": "simulation_experiment_load_response",
  "name": "settled-output-voltage",
  "measurement_values": [3.301, 3.299, 3.298],
  "measurement_unit": "V",
  "simulation_parameter_sweep_coordinate_sets": [
    [
      {
        "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
        "sweep_index": 0,
        "parameter_value": 100,
        "parameter_unit": "Ω"
      }
    ],
    [
      {
        "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
        "sweep_index": 1,
        "parameter_value": 330,
        "parameter_unit": "Ω"
      }
    ],
    [
      {
        "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
        "sweep_index": 2,
        "parameter_value": 1000,
        "parameter_unit": "Ω"
      }
    ]
  ]
}
```

`measurement_values` and `simulation_parameter_sweep_coordinate_sets` have the
same length. Each coordinate set contains one coordinate per sweep, in child
order. With no parameter sweep, `measurement_values` contains one value and
the coordinate sets are omitted. The result contains no serialized function.

## Compatibility

Existing transient usage remains valid:

```tsx
<analogsimulation duration="10ms" timePerStep="1us" />
```

It continues to mean transient analysis and emits the existing
`simulation_transient_voltage_graph` and
`simulation_transient_current_graph` elements.

New code should use `<analog.transientsimulation>`. The other
`<analog.*simulation>` elements have no legacy spelling. Existing
one-dimensional sweep coordinates remain readable.

## Scope

This RFC specifies:

- TSX usage for transient, DC operating point, direct DC sweep, and AC sweep;
- piecewise-linear voltage and current sources;
- one or more existing parameter sweeps on one SPICE simulation;
- TypeScript scalar measurements for transient simulations; and
- the corresponding Circuit JSON experiments, relationships, and results.

Engine interfaces, execution scheduling, rendering behavior, export formats,
new typed analysis elements, non-SPICE model formats, and package implementation
order are outside this RFC. Raw SPICE source is not accepted; tscircuit
continues to derive SPICE from TSX and Circuit JSON.
