# Analog Simulation Analyses and Parameter Sweeps

## Motivation

tscircuit currently exposes transient simulation through
`<analogsimulation />`. Circuit authors also need DC operating point, direct
DC sweep, AC sweep, and repeated simulations across component values.

This RFC defines how those simulations are written in TSX and the Circuit JSON
they produce. Compiler, engine, scheduling, rendering, and export APIs are
outside its scope.

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

All four elements accept `name`, `spiceEngine`, and `spiceOptions`. Their
analysis-specific props are described below.

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

Exactly one sweep parameter is allowed per simulation in this RFC. Each value
produces the same result type as the parent simulation, linked to its sweep
point. Scalar reductions and multidimensional sweeps are separate proposals.

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

Each coordinate emits one point:

```json
{
  "type": "simulation_parameter_sweep_point",
  "simulation_parameter_sweep_point_id": "simulation_parameter_sweep_point_2",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
  "sweep_index": 1,
  "parameter_value": 330,
  "parameter_unit": "Ω"
}
```

The analysis-specific result for that run includes
`simulation_parameter_sweep_point_id`. A transient resistance sweep therefore
produces transient graph elements, while an AC resistance sweep produces AC
sweep graph elements. The two are not forced into one generic result shape.

## Compatibility

Existing transient usage remains valid:

```tsx
<analogsimulation duration="10ms" timePerStep="1us" />
```

It continues to mean transient analysis and emits the existing
`simulation_transient_voltage_graph` and
`simulation_transient_current_graph` elements.

New code should use `<analog.transientsimulation>`. The other
`<analog.*simulation>` elements have no legacy spelling.

## Scope

This RFC specifies:

- TSX usage for transient, DC operating point, direct DC sweep, and AC sweep;
- TSX usage for a one-dimensional component parameter sweep; and
- the Circuit JSON experiments, sweep relationships, and analysis-specific
  results produced by that usage.

Measurement expressions, scalar reductions, multidimensional sweeps, engine
interfaces, execution scheduling, rendering behavior, export formats, and
package implementation order are intentionally left to separate proposals.
