# Simulation Experiments and Datasheet Measurements

## Motivation

Datasheet plots are not limited to raw transient waveforms. They include
operating curves, efficiency, stability, noise, distortion, limits,
distributions, spectra, and eye diagrams across voltage, load, temperature,
frequency, and process variation.

This RFC defines the TSX and Circuit JSON needed to describe those experiments.
The same experiment must work with a vendor model or a model authored from
documented behavior. Compiler, engine, scheduling, rendering, and export APIs
are outside its scope.

## Use cases

The API is designed around these recurring datasheet use cases:

| Use case | Examples | Contract |
| --- | --- | --- |
| Static curves | regulation, output swing, quiescent current, INL and DNL | DC/parameter sweeps and measurements |
| Time domain | switching, startup, line/load steps, settling | Arbitrary sources, transient analysis, edge metrics |
| Frequency domain | gain/phase, PSRR, impedance, noise, phase noise | AC, noise, S-parameter, and harmonic analyses |
| Power and distortion | efficiency, THD+N, SNR, SINAD, ENOB, SFDR, IMD | Expressions and spectra |
| Boundaries | current capability, mode transitions, safe limits | Nested sweeps and boundary extraction |
| Variation | temperature, tolerance, process corners, yield | Model parameters, Monte Carlo, histograms |
| Signal integrity | PRBS response, jitter, eye opening, mask compliance | PRBS sources and eye diagrams |
| Missing vendor model | documented or measured behavior | Versioned model assets and explicit assumptions |

Representative TI examples include
[TPS63802](https://www.ti.com/lit/ds/symlink/tps63802.pdf) Figures 10-2 through
10-31, [OPA191](https://www.ti.com/lit/ds/symlink/opa191.pdf) Figures 6-14
through 6-47, [ADC3561](https://www.ti.com/lit/gpn/adc3561) Figures 6-1 through
6-13, and
[HD3SS3212-Q1](https://www.ti.com/lit/ds/symlink/hd3ss3212-q1.pdf) Figures 9
through 12.

## Analyses

The `analog` namespace gives each analysis its own element:

| TSX element | Use |
| --- | --- |
| `analog.dcoperatingpointsimulation` | One DC value per probe |
| `analog.dcsweepsimulation` | Direct sweep of one independent source |
| `analog.transientsimulation` | Voltage, current, and digital values over time |
| `analog.acsweepsimulation` | Complex small-signal response |
| `analog.noisesimulation` | Input- and output-referred noise density |
| `analog.sparametersimulation` | Complex multiport S-parameters |
| `analog.harmonicbalancesimulation` | Periodic steady state and mixing products |

All analysis elements accept `name` and `simulationEngine`. `spiceEngine`
remains the compatibility spelling for SPICE-backed analyses.

The existing transient, DC operating-point, direct DC sweep, and AC sweep props
remain unchanged. Raw time numbers use milliseconds and raw frequency numbers
use hertz. Decade and octave sweeps use `samplesPerInterval`; linear sweeps use
`sampleCount`.

A noise analysis names the measured output and optional input source:

```tsx
<analog.noisesimulation
  name="input-noise"
  outputVoltageProbeRef=".VOUT"
  inputSourceRef=".VIN"
  sweepType="decade"
  samplesPerInterval={20}
  startFrequency="0.1Hz"
  stopFrequency="10MHz"
/>
```

An S-parameter analysis uses the AC sweep props. Its `<analog.port>` children
declare `positiveNet`, `negativeNet`, and `referenceImpedance`.

`<analog.harmonicbalancesimulation>` accepts `fundamentals` and
`harmonicCount`. Multiple fundamentals cover mixers and intermodulation.

## Stimulus waveforms

Voltage and current sources have matching pulse timing props:
`pulseDelay`, `riseTime`, `fallTime`, `pulseWidth`, and `period`.

Piecewise-linear points describe arbitrary ramps, steps, sequences, and
measured stimuli:

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
are applied in order and linearly interpolated. A repeated waveform must end no
later than `repeatPeriod`.

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
  randomSeed={7}
/>
```

PRBS sources may add bounded random and deterministic jitter. A fixed
`randomSeed` makes the generated waveform reproducible.

Voltage and current sources may also add seeded white, flicker, or bounded
noise. `<analog.modelparameterwaveform>` applies piecewise-linear or stepped
values to a model parameter such as temperature, light, pressure, or magnetic
field.

## Parameter variation

`<analog.sweepparameter>` repeats its parent simulation. It keeps
parameter-specific target props:

| `parameterType` | Required target |
| --- | --- |
| `"resistance"` | `resistorRef` |
| `"capacitance"` | `capacitorRef` |
| `"inductance"` | `inductorRef` |
| `"voltage"` | `net` |
| `"current"` | `currentSourceRef` |
| `"temperature"` | No target |

`values` gives explicit coordinates. `start`, `stop`, and `step` generate a
linear range. More than one sweep is allowed; the simulation runs the Cartesian
product in child order.

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

`<analog.sweepsourceparameter>` varies `amplitude`, `frequency`, `phase`,
`dutyCycle`, pulse timing, PRBS bit rate, or jitter on one voltage or current
source. `<analog.sweepmodelparameter>` varies a parameter declared by a
component model. The source form requires `voltageSourceRef` or
`currentSourceRef`; the model form requires `componentRef`. Both accept
`parameter`, `unit`, and the same coordinate props. This covers source
conditions, gain settings, process corners, environmental quantities, and
device-specific parameters without a polymorphic target.

`<analog.montecarlo>` accepts `sampleCount` and `randomSeed`. Its
`<analog.varyresistance>`, `<analog.varycapacitance>`, and
`<analog.varymodelparameter>` children declare uniform, normal, or explicit
distributions. Monte Carlo samples may be nested inside deterministic sweeps.

## Measurements

`<analog.measure>` produces one unit-checked scalar from raw results:

```tsx
<analog.measure
  name="output-regulation"
  expression='100 * (mean(V(".VOUT"), from=4ms, to=5ms) - 3.3V) / 3.3V'
  outputUnit="%"
/>

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

The expression language is not JavaScript. It contains:

- `V(selector)`, `I(selector)`, and `D(selector)` for voltage, current, and
  digital-bus samples;
- `M(name)` for another scalar measurement;
- unit-bearing literals, arithmetic, comparisons, conditionals, and
  dimension-checked unit conversion;
- windowing, interpolation, differentiation, integration, correlation, and
  convolution;
- scalar reducers such as mean, minimum, maximum, peak-to-peak, RMS, integral,
  and final value;
- edge metrics such as frequency, period, duty cycle, delay, rise/fall time,
  settling time, overshoot, and undershoot; and
- spectral metrics such as bandwidth, gain/phase margin, THD, THD+N, SNR,
  SINAD, ENOB, SFDR, IMD, integrated noise, and jitter.

Vector operations include FFT, inverse FFT, and histogram bins. Expressions
must be deterministic and cannot access files, the network, or runtime state.

`<analog.findboundary>` reduces one sweep dimension by selecting the minimum or
maximum coordinate where its condition is true. `interpolate` enables linear
interpolation between adjacent coordinates. Remaining sweep dimensions become
graph axes or series.

## Datasheet projections

Raw analysis results stay analysis-specific. These children request
datasheet-specific projections without replacing the raw results:

```tsx
<analog.spectrum
  name="adc-fft"
  digitalProbeRef=".ADC_CODE"
  startTime="1ms"
  endTime="2ms"
  window="blackman-harris"
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
  clockRecovery="first-order-pll"
  mask="./usb-eye-mask.json"
/>
```

`<analog.spectrum>` accepts exactly one of `voltageProbeRef`,
`currentProbeRef`, or `digitalProbeRef`. It produces complex bins and derived
metrics. `<analog.histogram>` accepts a measurement or digital probe.
`<analog.eyediagram>` preserves folded samples, eye height, eye width, crossing
percentage, jitter, and mask violations.

A `<digitalprobe>` records one pin or an ordered bus. It emits digital samples
without discarding the underlying analog voltage probes used to validate input
and output levels.

## Simulation models

Experiments are independent of model origin. A component may use a SPICE,
PSpice, TINA, Verilog-A, IBIS, or Touchstone model:

```tsx
<chip
  name="U1"
  simulationModel={
    <simulationmodel
      format="spice"
      source="./models/U1.lib"
      pinMapping={{ VIN: "1", GND: "2", VOUT: "3" }}
      provenance="vendor"
      modeledEffects={["switching", "protection", "quiescent-current"]}
      omittedEffects={["self-heating"]}
    />
  }
/>
```

`format` is a versioned model-format identifier. The names above are standard;
other formats use a reverse-domain identifier and produce an explicit
unsupported-format error when no engine can run them.

`provenance` is `"vendor"`, `"measured"`, or `"derived"`. A derived model must
list its assumptions. All models may declare valid conditions, modeled
effects, omitted effects, and reference curves.

When no vendor model exists, a circuit author may provide a SPICE or Verilog-A
behavioral model derived from available measurements and documentation. The
model asset is immutable during an experiment; parameter sweeps use declared
model parameters rather than editing model text.

This contract makes missing and approximate behavior visible. It does not
claim that undocumented silicon behavior can be inferred without evidence.

## Circuit JSON

Each analysis emits a `simulation_experiment` with one of these
`experiment_type` values:

| Analysis | `experiment_type` |
| --- | --- |
| DC operating point | `spice_dc_operating_point` |
| Direct DC sweep | `spice_dc_sweep` |
| Transient | `spice_transient_analysis` |
| AC sweep | `spice_ac_analysis` |
| Noise | `spice_noise_analysis` |
| S-parameters | `s_parameter_analysis` |
| Harmonic balance | `harmonic_balance_analysis` |

Model declarations emit `simulation_model` with `model_format`,
`source_asset_id`, `source_sha256`, pin mapping, provenance, valid conditions,
modeled effects, omitted effects, assumptions, and reference curves. Arbitrary
waveforms remain source-specific: `simulation_voltage_source` stores
`voltage` points, `simulation_current_source` stores `current` points, and
`simulation_model_parameter_source` stores environmental or model-input
points.

Each deterministic sweep emits `simulation_parameter_sweep`,
`simulation_source_parameter_sweep`, or
`simulation_model_parameter_sweep` according to its TSX element.
Results replace the singular `simulation_parameter_sweep_coordinate` with the
ordered `simulation_parameter_sweep_coordinates` array:

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

A scalar declaration stores the expression, expected unit, and dependencies:

```json
{
  "type": "simulation_measurement",
  "simulation_measurement_id": "simulation_measurement_efficiency",
  "simulation_experiment_id": "simulation_experiment_efficiency",
  "name": "efficiency",
  "expression": "100 * abs(mean(V(\".VOUT\") * I(\".IOUT\"))) / abs(mean(V(\".VIN\") * I(\".IIN\")))",
  "output_unit": "%",
  "simulation_voltage_probe_ids": [
    "simulation_voltage_probe_vout",
    "simulation_voltage_probe_vin"
  ],
  "simulation_current_probe_ids": [
    "simulation_current_probe_iout",
    "simulation_current_probe_iin"
  ]
}
```

Circuit JSON keeps result types specific to their semantics:

| Result | Circuit JSON type |
| --- | --- |
| Transient voltage | `simulation_transient_voltage_graph` |
| Transient current | `simulation_transient_current_graph` |
| Transient digital | `simulation_transient_digital_graph` |
| DC operating-point voltage | `simulation_dc_operating_point_voltage` |
| DC operating-point current | `simulation_dc_operating_point_current` |
| DC sweep voltage | `simulation_dc_sweep_voltage_graph` |
| DC sweep current | `simulation_dc_sweep_current_graph` |
| AC voltage | `simulation_ac_sweep_voltage_graph` |
| AC current | `simulation_ac_sweep_current_graph` |
| Input/output voltage noise | `simulation_noise_voltage_graph` |
| Input/output current noise | `simulation_noise_current_graph` |
| S-parameters | `simulation_s_parameter_graph` |
| Harmonic-balance voltage | `simulation_harmonic_voltage_spectrum` |
| Harmonic-balance current | `simulation_harmonic_current_spectrum` |
| Scalar measurement | `simulation_measurement_result` |
| One-dimensional measurement sweep | `simulation_measurement_sweep_graph` |
| Two-dimensional measurement sweep | `simulation_measurement_surface` |
| Boundary across a sweep | `simulation_sweep_boundary_graph` |
| Spectrum | `simulation_voltage_spectrum`, `simulation_current_spectrum`, or `simulation_digital_spectrum` |
| Histogram | `simulation_measurement_histogram` or `simulation_digital_histogram` |
| Eye diagram | `simulation_eye_diagram` |
| Monte Carlo sample | `simulation_monte_carlo_sample` |

`simulation_measurement_result` stores one value with its quantity and unit.
Raw transient, AC, noise, S-parameter, and harmonic results are never replaced
by a generic graph. Measurement sweep graphs only contain scalar measurement
values against parameter coordinates. Higher sweep dimensions become separate
series or surfaces at fixed coordinate combinations.

Every result references its experiment, exact model assets, deterministic
sweep coordinates, and optional Monte Carlo sample. Partial or unsupported
model behavior emits a `simulation_model_limitation_warning`.

## Compatibility

Existing transient usage remains valid:

```tsx
<analogsimulation duration="10ms" timePerStep="1us" />
```

It continues to mean transient analysis. Existing `spiceModel`,
one-dimensional sweep coordinates, and analysis-specific result elements
remain readable. New code uses `simulationModel` and coordinate arrays.

## Scope

This RFC specifies:

- model declarations and model-fidelity metadata;
- deterministic, arbitrary, and PRBS stimuli;
- DC, transient, AC, noise, S-parameter, and harmonic analyses;
- nested deterministic and Monte Carlo parameter variation;
- composable scalar measurements and boundary extraction; and
- Circuit JSON for raw results, scalar curves, surfaces, spectra, histograms,
  and eye diagrams.

Engine interfaces, execution scheduling, rendering behavior, export formats,
and package implementation order are intentionally outside this RFC.
