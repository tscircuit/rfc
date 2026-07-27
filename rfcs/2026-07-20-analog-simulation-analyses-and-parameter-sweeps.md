# SPICE Simulation Analyses, Stimulus, and Measurements

## Motivation

tscircuit exposes SPICE transient, DC operating-point, DC sweep, AC sweep, and
one-dimensional parameter sweeps. Reproducing the TPS63802 application curves
also requires arbitrary source waveforms, more than one parameter sweep, and a
scalar calculated from each simulation result.

TI also publishes complete PSpice test benches, and SPICE engines support
analyses beyond the typed tscircuit elements. This RFC adds a complete-netlist
escape hatch so tscircuit does not block any SPICE deck supported by the
selected engine. It does not add a non-SPICE simulation format.

## SPICE use cases

The typed additions map directly to
[TPS63802 application curves](https://www.ti.com/lit/ds/symlink/tps63802.pdf):

| Figures | Graph | Required addition |
| --- | --- | --- |
| 10-2 | Output current capability versus input voltage | Multiple parameter sweeps |
| 10-3 and 10-4 | Switching frequency | TypeScript measurement |
| 10-5 through 10-10 | Efficiency | Multiple parameter sweeps and TypeScript measurement |
| 10-11 through 10-14 | Line and load regulation | Parameter sweep and TypeScript measurement |
| 10-15 through 10-20 | Switching waveforms | Existing transient analysis |
| 10-21 through 10-26 | Load transient | Current-source waveform |
| 10-27 through 10-29 | Line transient | Voltage-source waveform |
| 10-30 and 10-31 | Rising enable | Existing voltage-source pulse |

Existing transient support already reproduces
[Figures 10-15](https://github.com/tscircuit/ti/blob/de6f200/lib/simulations/TPS63802-Figure-10-15-switching-waveforms-pfm-boost-operation.circuit.tsx),
[10-16](https://github.com/tscircuit/ti/blob/de6f200/lib/simulations/TPS63802-Figure-10-16-switching-waveforms-pfm-buck-boost-operation.circuit.tsx),
and
[10-17](https://github.com/tscircuit/ti/blob/de6f200/lib/simulations/TPS63802-Figure-10-17-switching-waveforms-pfm-buck-operation.circuit.tsx).

For analyses without a typed tscircuit element, `<analog.spicesimulation>`
runs a complete netlist. This covers the analyses and output statements
documented by the
[ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf) and
vendor decks from
[PSpice for TI](https://www.ti.com/tool/PSPICE-FOR-TI), when the selected
engine supports their syntax and models.

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

The four typed elements accept `name`, `spiceEngine`, and `spiceOptions`.
Their analysis-specific props are described below.

## Complete SPICE netlists

`<analog.spicesimulation>` runs a complete SPICE netlist without requiring a
typed TSX element for every engine analysis:

```tsx
export default () => (
  <analog.spicesimulation
    name="tps63802-vendor-testbench"
    spiceEngine="pspice"
    source={vendorTestbenchSource}
    includes={{ "TPS63802_TRANS.lib": vendorModelSource }}
  />
)
```

`source` contains the complete netlist, including its analysis and output
statements. `includes` maps relative `.include` paths to their source text.
Paths are matched exactly and cannot be absolute or contain `..`.

The selected engine determines the accepted SPICE dialect. The element stores
the source and model parameters unchanged; any compatibility translation is
explicit behavior of the selected engine adapter. A PSpice deck therefore
requires a PSpice-compatible engine. Selecting ngspice does not imply PSpice
compatibility.

A new backend-supported SPICE statement does not require another TSX element.
A first-class tscircuit feature for its result still requires an
analysis-specific Circuit JSON type.

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

Figure 10-2 can select the highest load-current coordinate whose settled output
remains in regulation. That selection is ordinary result processing, not a
separate simulation element.

## Measurements

`<analog.measurement>` runs a TypeScript function after each simulation and
produces one scalar:

```tsx
const mean = (samples: number[]) =>
  samples.reduce((sum, sample) => sum + sample, 0) / samples.length

export default () => (
  <analog.measurement
    name="settled-output-voltage"
    unit="V"
    measureFn={({ selectOne }) => {
      const output = selectOne(".VOUT")
      if (output.type !== "simulation_transient_voltage_graph") {
        throw new Error("VOUT must resolve to a transient voltage graph")
      }
      return mean(output.voltage_levels.slice(-1000))
    }}
  />
)
```

`selectOne` accepts a tscircuit selector and returns one analysis-specific
Circuit JSON result. The function returns a finite number in the declared
`unit`. It runs once per parameter-sweep coordinate after the raw results for
that coordinate are available.

The function is TypeScript source and is not serialized into Circuit JSON.
Only its result is emitted. Frequency, efficiency, and regulation calculations
therefore use normal TypeScript instead of a new expression language.

## Circuit JSON

Each TSX simulation emits a `simulation_experiment`. The existing
`experiment_type` values remain:

| TSX element | `experiment_type` |
| --- | --- |
| `analog.transientsimulation` | `spice_transient_analysis` |
| `analog.dcoperatingpointsimulation` | `spice_dc_operating_point` |
| `analog.dcsweepsimulation` | `spice_dc_sweep` |
| `analog.acsweepsimulation` | `spice_ac_analysis` |
| `analog.spicesimulation` | `spice_netlist` |

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

The complete-netlist form stores the source without interpreting its analysis
statements:

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_vendor_testbench",
  "name": "tps63802-vendor-testbench",
  "experiment_type": "spice_netlist",
  "spice_source": "TPS63802 vendor testbench\n.include TPS63802_TRANS.lib\n.tran 1us 5ms\n.end",
  "spice_include_sources": {
    "TPS63802_TRANS.lib": "TPS63802 vendor model source"
  }
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

### Complete-netlist results

An engine adapter emits an analysis-specific Circuit JSON result when one
exists. Other complete-netlist output is preserved as SPICE plots containing
real or complex vectors:

```json
[
  {
    "type": "simulation_spice_plot",
    "simulation_spice_plot_id": "simulation_spice_plot_ac1",
    "simulation_experiment_id": "simulation_experiment_vendor_testbench",
    "name": "AC Analysis"
  },
  {
    "type": "simulation_spice_real_vector",
    "simulation_spice_real_vector_id": "simulation_spice_real_vector_frequency",
    "simulation_spice_plot_id": "simulation_spice_plot_ac1",
    "name": "frequency",
    "vector_unit": "Hz",
    "real_values": [10, 100, 1000],
    "is_scale": true
  },
  {
    "type": "simulation_spice_complex_vector",
    "simulation_spice_complex_vector_id": "simulation_spice_complex_vector_vout",
    "simulation_spice_plot_id": "simulation_spice_plot_ac1",
    "name": "v(out)",
    "vector_unit": "V",
    "complex_values": [
      { "re": 0.99, "im": -0.01 },
      { "re": 0.95, "im": -0.08 },
      { "re": 0.71, "im": -0.71 }
    ]
  }
]
```

Each plot has at most one vector with `is_scale: true`. Native `.measure`
scalars use `simulation_measurement_result`.

These elements preserve backend output; they are not generic graph elements.
Typed transient, DC, AC, noise, or other results remain separate whenever
tscircuit needs analysis-specific behavior.

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

`<analog.measurement>` emits one `simulation_measurement_result` for each
coordinate:

```json
{
  "type": "simulation_measurement_result",
  "simulation_measurement_result_id": "simulation_measurement_result_vout_2",
  "simulation_experiment_id": "simulation_experiment_load_response",
  "name": "settled-output-voltage",
  "measurement": 3.298,
  "measurement_unit": "V",
  "simulation_parameter_sweep_coordinates": [
    {
      "simulation_parameter_sweep_id": "simulation_parameter_sweep_load",
      "sweep_index": 1,
      "parameter_value": 330,
      "parameter_unit": "Ω"
    }
  ]
}
```

The result contains no serialized function.

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

- complete SPICE netlists and their include sources;
- raw SPICE plot, real-vector, and complex-vector results;
- piecewise-linear voltage and current sources;
- multiple existing parameter sweeps on one SPICE simulation;
- TypeScript scalar measurements; and
- the corresponding Circuit JSON fields and measurement results.

Engine interfaces, execution scheduling, rendering behavior, export formats,
new typed analysis elements, non-SPICE model formats, and package implementation
order are outside this RFC. A selected engine may support additional SPICE
analyses, model syntax, Monte Carlo, or worst-case commands through the
complete-netlist form.
