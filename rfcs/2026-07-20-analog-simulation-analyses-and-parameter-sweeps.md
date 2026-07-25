# Analog Simulation Analyses and Datasheet Measurements

## Motivation

tscircuit currently exposes transient, DC operating-point, DC sweep, AC sweep,
and one-dimensional parameter sweeps. Circuit authors also need to reproduce
datasheet curves derived from those results and run analyses used by power,
amplifier, converter, clock, and signal-integrity devices.

This RFC defines the TSX and Circuit JSON for those experiments. Compiler,
engine, scheduling, rendering, and export APIs are outside its scope.

## Datasheet use cases

The API is designed around recurring electrical characterization:

| Use case | Examples | Required capability |
| --- | --- | --- |
| Static curves | regulation, output swing, quiescent current, INL and DNL | DC and parameter sweeps |
| Time domain | switching, startup, line/load steps, settling | Pulse, arbitrary waveform, and transient analysis |
| Frequency domain | gain/phase, PSRR, impedance, and noise | AC, noise, and S-parameter analysis |
| Periodic behavior | distortion, mixing, compression, and phase noise | Harmonic-balance and periodic-noise analysis |
| Scalar curves | efficiency, frequency, delay, SNR, and margins | Unit-checked measurements |
| Boundaries | current capability, mode transitions, and limits | Nested sweeps and boundary extraction |
| Variation | temperature, tolerance, process corners, and yield | Model parameters and Monte Carlo |
| Signal integrity | PRBS response, jitter, eye opening, and masks | PRBS stimulus and eye diagrams |

Representative TI examples include
[TPS63802](https://www.ti.com/lit/ds/symlink/tps63802.pdf) Figures 10-2 through
10-31, [OPA191](https://www.ti.com/lit/ds/symlink/opa191.pdf) Figures 6-14
through 6-47, [ADC3561](https://www.ti.com/lit/gpn/adc3561) Figures 6-1 through
6-13, and
[HD3SS3212-Q1](https://www.ti.com/lit/ds/symlink/hd3ss3212-q1.pdf) Figures 9
through 12.

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

All analysis elements accept `name`. SPICE-backed analyses accept the existing
`spiceEngine` and `spiceOptions` props.

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

## Additional analyses

| TSX element | Required usage |
| --- | --- |
| `analog.noisesimulation` | AC sweep props, an output voltage/current probe, and optional input source |
| `analog.sparametersimulation` | AC sweep props and `analog.port` children with positive/negative nets and reference impedance |
| `analog.harmonicbalancesimulation` | One or more `fundamentals` and `harmonicCount` |
| `analog.periodicnoisesimulation` | A fundamental, output probe, and offset-frequency sweep |

Multiple harmonic-balance fundamentals cover mixers and intermodulation.

## Stimulus waveforms

Voltage and current sources have matching pulse timing props:
`pulseDelay`, `riseTime`, `fallTime`, `pulseWidth`, and `period`.

Piecewise-linear points describe ramps, steps, sequences, and measured
stimulus:

```tsx
<currentsource
  name="ILOAD"
  currentWaveform={[
    { time: "0ms", current: "100mA" },
    { time: "1ms", current: "100mA" },
    { time: "1.01ms", current: "1A" },
    { time: "2ms", current: "1A" },
    { time: "2.01ms", current: "100mA" },
  ]}
  repeatPeriod="3ms"
/>
```

Voltage sources use `voltageWaveform` with `{ time, voltage }` points. Points
are applied in order and linearly interpolated.

PRBS stimulus avoids expanding millions of piecewise-linear points:

```tsx
<voltagesource
  name="DATA"
  waveShape="prbs"
  pattern="prbs31"
  bitRate="10Gbps"
  lowVoltage="-400mV"
  highVoltage="400mV"
  riseTime="35ps"
  fallTime="35ps"
  randomJitterRms="1ps"
  sinusoidalJitterFrequency="10MHz"
  sinusoidalJitterAmplitude="2ps"
  randomSeed={7}
/>
```

`randomSeed` makes the PRBS and random jitter reproducible.

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

## Multidimensional and additional parameter sweeps

More than one `<analog.sweepparameter>` is allowed. The simulation runs their
Cartesian product in child order. The same element adds these variants:

| `parameterType` | Required target |
| --- | --- |
| `"temperature"` | No target |
| `"source"` | `sourceParameter` and exactly one of `voltageSourceRef` or `currentSourceRef` |
| `"model"` | `componentRef` and `modelParameter` |

The `"source"` variant changes `frequency`, `phase`, `duty_cycle`, pulse
timing, PRBS bit rate, or jitter. The `"model"` variant changes a parameter
declared by the selected component model. All variants use the existing
`values` or `start`/`stop`/`step` coordinates.

This experiment finds output-current capability versus input voltage:

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
  <analog.measure
    name="settled-output"
    expression='mean(V(".VOUT"), from=4ms, to=5ms)'
    outputUnit="V"
  />
  <analog.findboundary
    name="maximum-load"
    sweepRef=".load-current"
    where='M(".settled-output") >= 3.234V'
    choose="maximum"
  />
</analog.transientsimulation>
```

`<analog.findboundary>` selects the minimum or maximum coordinate where its
condition is true. Other sweep coordinates remain attached to the result.

## Monte Carlo

`<analog.montecarlo>` accepts `sampleCount` and `randomSeed`.
`<analog.montecarloparameter>` children use the same `parameterType` and target
props as `<analog.sweepparameter>`, but replace coordinates with a uniform,
normal, or explicit distribution. Monte Carlo may be nested inside
deterministic sweeps.

```tsx
<analog.montecarlo sampleCount={1000} randomSeed={7}>
  <analog.montecarloparameter
    parameterType="resistance"
    resistorRef=".R1"
    distribution="normal"
    mean="10kΩ"
    standardDeviation="100Ω"
  />
</analog.montecarlo>
```

## Measurements

`<analog.measure>` produces one unit-checked scalar from raw results:

```tsx
<analog.measure
  name="efficiency"
  expression='100 * abs(mean(V(".VOUT") * I(".IOUT"))) / abs(mean(V(".VIN") * I(".IIN")))'
  outputUnit="%"
/>

<analog.measure
  name="burst-frequency"
  expression='frequency(V(".SW"), threshold=1.5V, edge="rising", holdoff=20us)'
  outputUnit="Hz"
/>
```

The expression language is not JavaScript. `V(selector)`, `I(selector)`, and
`D(selector)` select real, complex, or digital probe samples; `M(name)` selects
another measurement. Unit-bearing literals, arithmetic, comparisons, windows,
sweep coordinates, `mean`, `min`, `max`, `rms`, `integral`, `crossings`, and
`fft` are composable. Expressions are deterministic and unit checked. Named
metrics such as frequency, settling time, THD, and SNR are functions in the
versioned expression language; adding one does not add a TSX element or Circuit
JSON result type.

## Datasheet projections

Raw results remain analysis-specific. These children request structured
post-processing:

```tsx
<analog.spectrum
  name="adc-fft"
  digitalProbeRef=".ADC_CODE"
  startTime="1ms"
  endTime="2ms"
  window="blackman_harris"
/>

<analog.histogram
  name="offset-distribution"
  measurementRef=".input-offset"
  binCount={50}
/>

<analog.eyediagram
  name="output-eye"
  voltageProbeRef=".DATA_OUT"
  bitRate="10Gbps"
  clockRecovery="first_order_pll"
  clockRecoveryBandwidth="5MHz"
  mask={usbEyeMask}
/>
```

`<analog.spectrum>` accepts exactly one voltage, current, or digital probe.
`<analog.histogram>` accepts a measurement or digital probe.
`<analog.eyediagram>` preserves folded samples, eye metrics, jitter, and mask
violations. A `<digitalprobe>` records one pin or an ordered bus.

These projections have specific Circuit JSON results because their stored
samples and downstream behavior differ. A line, surface, or table made from
the same scalar measurement points does not get a new result type.

## Simulation models

`simulationModel` accepts a format-specific model element:

| Model element | Use |
| --- | --- |
| `spicemodel` | SPICE, PSpice, or TINA-TI subcircuit |
| `verilogamodel` | Verilog-A behavioral model |
| `ibismodel` | IBIS digital I/O model |
| `ibisamimodel` | IBIS-AMI SerDes model |
| `touchstonemodel` | Touchstone multiport network |

Each element owns the mapping appropriate to its format. For example,
`spicemodel` uses `spicePinMapping`, while `touchstonemodel` uses
`portMapping`. A SPICE model may declare its `dialect` as `"spice"`,
`"pspice"`, or `"tina_ti"`.

```tsx
<chip
  name="U1"
  simulationModel={
    <spicemodel
      source={u1ModelSource}
      spicePinMapping={{ VIN: "1", GND: "2", VOUT: "3" }}
      dialect="pspice"
      provenance="vendor"
      modeledEffects={["switching", "protection", "quiescent_current"]}
      omittedEffects={["self_heating"]}
    />
  }
/>
```

`provenance` is `"vendor"`, `"measured"`, or `"derived"`. A derived model must
list its assumptions. Model elements may declare valid conditions, modeled
effects, omitted effects, and adjustable parameters.

When no vendor model exists, a circuit author may provide a SPICE or Verilog-A
model derived from available measurements and documentation. Model source is
immutable during an experiment; sweeps use declared model parameters rather
than editing source text. This does not claim undocumented behavior can be
inferred without evidence. A model format still requires an engine that
implements that format.

## Circuit JSON

Each TSX simulation emits a `simulation_experiment`:

| TSX element | `experiment_type` |
| --- | --- |
| `analog.transientsimulation` | `spice_transient_analysis` |
| `analog.dcoperatingpointsimulation` | `spice_dc_operating_point` |
| `analog.dcsweepsimulation` | `spice_dc_sweep` |
| `analog.acsweepsimulation` | `spice_ac_analysis` |
| `analog.noisesimulation` | `spice_noise_analysis` |
| `analog.sparametersimulation` | `s_parameter_analysis` |
| `analog.harmonicbalancesimulation` | `harmonic_balance_analysis` |
| `analog.periodicnoisesimulation` | `periodic_noise_analysis` |

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

Noise fields name the output probe, optional input source, and frequency sweep.
Each `<analog.port>` emits a `simulation_port` referenced by an S-parameter
experiment. Harmonic-balance experiments store their fundamentals and harmonic
count. Periodic-noise experiments store their fundamental, output probe, and
offset-frequency sweep.

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

### Additional results

| Result | Circuit JSON type |
| --- | --- |
| Transient digital | `simulation_transient_digital_graph` |
| Voltage/current noise | `simulation_noise_voltage_graph` or `simulation_noise_current_graph` |
| S-parameters | `simulation_s_parameter_graph` |
| Harmonic voltage/current | `simulation_harmonic_voltage_spectrum` or `simulation_harmonic_current_spectrum` |
| Periodic voltage/current noise | `simulation_periodic_noise_voltage_graph` or `simulation_periodic_noise_current_graph` |
| Phase noise | `simulation_phase_noise_graph` |
| Scalar measurement | `simulation_measurement_result` |
| Voltage/current/digital spectrum | `simulation_voltage_spectrum`, `simulation_current_spectrum`, or `simulation_digital_spectrum` |
| Measurement/digital histogram | `simulation_measurement_histogram` or `simulation_digital_histogram` |
| Eye diagram | `simulation_eye_diagram_graph` |

These types remain specific because their axes, samples, units, probe
references, and downstream behavior differ.

Noise graphs store frequency and voltage or current noise density. S-parameter
graphs store frequency and a complex matrix indexed by port. Harmonic results
store harmonic frequencies and complex voltage or current. Phase-noise graphs
store offset frequency and dBc/Hz.

`<digitalprobe>` emits `simulation_digital_probe`; transient digital graphs
store timestamps and logic levels. `<analog.spectrum>`,
`<analog.histogram>`, and `<analog.eyediagram>` emit `simulation_spectrum`,
`simulation_histogram`, and `simulation_eye_diagram` requests. Their result
types store complex bins, bins and counts, or folded eye samples and mask
violations respectively.

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

### Multidimensional sweep relationships

Every deterministic `<analog.sweepparameter>` emits the existing
`simulation_parameter_sweep`. Its `parameter_type` selects the corresponding
target fields. Multidimensional results replace the singular
`simulation_parameter_sweep_coordinate` with an ordered
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

The new `parameter_type` values are `"temperature"`, `"source"`, and
`"model"`. Source sweeps store `source_parameter` and exactly one simulation
voltage- or current-source ID. Model sweeps store `source_component_id` and
`model_parameter`.

`<analog.measure>` emits `simulation_measurement` with
`measurement_type: "expression"`, the expression,
`expression_language: "tscircuit_measurement_v1"`, expected unit, and probe
dependencies. `<analog.findboundary>` emits the same type with
`measurement_type: "sweep_boundary"`, its sweep ID, condition, and
minimum/maximum selection.

`simulation_measurement_result` stores `measurement`, `measurement_unit`, and
its sweep coordinates. Repeating it at different
coordinates represents curves, surfaces, higher-dimensional sweeps, and
boundaries without presentation-specific Circuit JSON types.

`simulation_monte_carlo` stores the sample count and seed.
`simulation_monte_carlo_parameter` stores each distribution.
`simulation_monte_carlo_sample` stores one sample index and its realized
parameter values. Results reference the sample; the sample is not itself a
result. Normal distributions store `mean` and `standard_deviation`; uniform
distributions store `minimum` and `maximum`; explicit distributions store
their weighted coordinates.

Model declarations remain format-specific:

| TSX model | Circuit JSON type | Source |
| --- | --- | --- |
| `spicemodel` | `simulation_spice_subcircuit` | `subcircuit_source` |
| `verilogamodel` | `simulation_verilog_a_model` | `verilog_a_source` |
| `ibismodel` | `simulation_ibis_model` | `ibis_source` |
| `ibisamimodel` | `simulation_ibis_ami_model` | IBIS and AMI sources plus algorithm-model assets |
| `touchstonemodel` | `simulation_touchstone_model` | `touchstone_source` |

The existing SPICE source and pin-map fields stay unchanged. Every model type
adds `provenance`, `valid_conditions`, `assumptions`, `modeled_effects`,
`omitted_effects`, and `adjustable_parameters`. Voltage and current waveform
points remain on `simulation_voltage_source` and
`simulation_current_source`.

## Compatibility

Existing transient usage remains valid:

```tsx
<analogsimulation duration="10ms" timePerStep="1us" />
```

It continues to mean transient analysis and emits the existing
`simulation_transient_voltage_graph` and
`simulation_transient_current_graph` elements.

New code should use `<analog.transientsimulation>`. The other
`<analog.*simulation>` elements have no legacy spelling. Existing `spiceModel`
continues to accept `spicemodel`; `simulationModel` accepts every model
element. Existing one-dimensional sweep coordinates remain readable.

## Scope

This RFC specifies:

- TSX and Circuit JSON for the listed analyses;
- deterministic, arbitrary, and PRBS stimulus;
- nested deterministic and Monte Carlo variation;
- composable measurements and boundary extraction;
- format-specific simulation models; and
- specific raw, spectrum, histogram, and eye-diagram results.

Engine interfaces, execution scheduling, rendering behavior, export formats,
and package implementation order are outside this RFC.
