# Analog Simulation Analyses and Parameter Sweeps

tscircuit currently exposes analog simulation as a transient-only feature in
most public contracts, even though Circuit JSON already names DC, AC, and
transient experiment types and the ngspice layer can return real and complex
results. This RFC specifies one consistent API for DC operating point, direct DC
source sweep, AC small-signal analysis, transient analysis, outer parameter
sweeps, and derived measurements.

> The complete reference TypeScript contract is available in
> [`simulation-api-contracts.ts`](../assets/2026-07-20-analog-simulation/simulation-api-contracts.ts).

## Motivation

The current forward path can reach ngspice, but its props, core component,
compiler representation, engine adapter, and rendered results assume a
transient time axis. As a result, adding another analysis currently requires
graph-specific exceptions at several package boundaries.

Power-converter characteristic curves also need a distinction between a SPICE
analysis and an outer parameter sweep. A single `.dc`, `.ac`, or `.tran` run
returns a complete vector. An efficiency-versus-load curve instead runs one
inner analysis at every load coordinate, then reduces each waveform to a scalar
measurement. Modeling these as the same operation would produce incorrect run
counts and an API that cannot preserve partial failures.

The goal is to establish the public props, Circuit JSON elements, compiler and
engine contracts, execution semantics, and migration behavior before individual
packages implement their portions independently.

## 1. Decision summary

tscircuit should expose four direct SPICE analyses through
`<analogsimulation />`:

- `spice_dc_operating_point`
- `spice_dc_sweep`
- `spice_ac_analysis`
- `spice_transient_analysis`

An outer parameter sweep and measurements should be separate intrinsic
elements:

- `<simulationparametersweep />`
- `<simulationmeasurement />`

This design makes the following decisions:

1. JSX props are flat and camelCase. `simulationType` is the direct-analysis
   discriminant.
2. Circuit JSON elements are flat, use snake_case, and link through stable IDs.
3. Raw analysis vectors, scalar measurement results, and parameter-sweep series
   are separate Circuit JSON element types. A generic `result_kind` field is not
   used.
4. One direct DC, AC, or transient analysis is one engine invocation. The engine
   returns every native axis sample from that invocation.
5. An `N`-coordinate outer sweep is `N` inner engine invocations. MVP execution
   is sequential on one initialized engine instance.
6. AC samples are stored as real and imaginary components. Magnitude, dB, and
   phase are derived views.
7. DC bias, transient waveform configuration, and AC small-signal excitation
   are independent source fields and may coexist.
8. Existing transient JSX and legacy transient graph elements remain valid
   during migration.

## 2. Conventions applied

The contract follows the tscircuit handbook and current repository guidance:

- Prefer flat objects and avoid gratuitous nesting.
- Use truthy booleans only to opt into unusual behavior.
- Use camelCase in TypeScript APIs, snake_case in Circuit JSON, and snake_case
  for every enum string.
- Use one named-argument object for functions that otherwise need more than two
  parameters.
- Use `name` as stable circuit identity.
- Use `number | string` with unit-aware parsing for physical quantities.
- Preserve concrete domain names and stable IDs across package boundaries.
- Use booleans for flow control and `display_status` only for human display.

`spiceOptions` remains a nested object because it is an existing, cohesive,
stable group. New analysis, sweep, axis, series, and measurement fields remain
flat.

## 3. Terminology

- **Direct analysis:** one `.op`, `.dc`, `.ac`, or `.tran` statement executed by
  the SPICE engine.
- **Inner analysis:** the direct analysis executed at one outer-sweep coordinate.
- **Outer parameter sweep:** tscircuit orchestration that applies a
  simulation-only component-property override and executes one inner analysis
  at each coordinate.
- **Probe reducer:** a deterministic operation over one canonical output vector,
  such as mean, RMS, or peak-to-peak.
- **Measurement:** a scalar derived from one direct or inner analysis.
- **Canonical result:** a flat Circuit JSON result element described in section
  8.

An analysis is not a chart. A chart is one rendering of analysis or measurement
results.

## 4. Public JSX API

### 4.1 Common `<analogsimulation />` props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | analysis type | Stable identity for selectors and results |
| `simulationType` | `SpiceAnalysisType` | `spice_transient_analysis` | Direct-analysis discriminant |
| `spiceEngine` | `"spicey" \| "ngspice" \| string` | platform default | Requested engine |
| `spiceOptions` | `SpiceOptions` | engine defaults | Solver options |

An explicitly requested or platform-default engine must declare support for the
analysis. Core must fail early on a capability mismatch. It must not silently
switch engines.

### 4.2 Transient analysis

```tsx
<analogsimulation
  name="startup"
  simulationType="spice_transient_analysis"
  duration="10ms"
  startTime="0ms"
  timePerStep="1us"
  spiceEngine="ngspice"
/>
```

Transient-only props:

| Prop | Type | Default | Constraint |
| --- | --- | --- | --- |
| `duration` | `number \| string` | `10ms` | Greater than zero |
| `startTime` | `number \| string` | `0ms` | At least zero and less than `duration` |
| `timePerStep` | `number \| string` | `0.01ms` | Greater than zero and no greater than `duration` |
| `graphIndependentAxes` | `boolean` | `false` | Legacy transient display behavior only |

Raw numbers are milliseconds. Omitting `simulationType` is the compatibility
spelling for transient analysis.

### 4.3 DC operating point

```tsx
<analogsimulation
  name="bias-point"
  simulationType="spice_dc_operating_point"
  spiceEngine="ngspice"
/>
```

No analysis-specific props are accepted. The result contains one scalar sample
for each selected voltage/current output vector and has no X axis.

### 4.4 Direct DC source sweep

```tsx
<analogsimulation
  name="line-regulation"
  simulationType="spice_dc_sweep"
  spiceEngine="ngspice"
  dcSweepSource=".Vin"
  dcSweepStart="2.5V"
  dcSweepStop="5.5V"
  dcSweepStep="0.1V"
/>
```

| Prop | Type | Constraint |
| --- | --- | --- |
| `dcSweepSource` | `string` | Resolves to exactly one voltage or current source |
| `dcSweepStart` | `number \| string` | Finite |
| `dcSweepStop` | `number \| string` | Finite and reachable using the step direction |
| `dcSweepStep` | `number \| string` | Finite and nonzero |

For a voltage source, numeric sweep coordinates are volts. For a current source,
they are amperes. A unit-bearing string is recommended at user call sites.

This API describes ngspice `.dc`; it is not the outer parameter sweep. The
entire direct source sweep is one engine invocation.

### 4.5 AC small-signal analysis

```tsx
<voltagesource
  name="Vin"
  voltage="2.5V"
  acMagnitude="1V"
  acPhase="0deg"
/>

<analogsimulation
  name="frequency-response"
  simulationType="spice_ac_analysis"
  spiceEngine="ngspice"
  acSweepType="decade"
  acPointsPerInterval={20}
  acStartFrequency="10Hz"
  acStopFrequency="1MHz"
/>
```

Common AC props:

| Prop | Type | Constraint |
| --- | --- | --- |
| `acSweepType` | `"linear" \| "decade" \| "octave"` | Required |
| `acStartFrequency` | `number \| string` | Greater than zero |
| `acStopFrequency` | `number \| string` | Greater than start |

Mode-specific props:

- `linear` requires integer `acPointCount >= 2` and rejects
  `acPointsPerInterval`.
- `decade` and `octave` require integer `acPointsPerInterval >= 1` and reject
  `acPointCount`.

Raw frequency numbers are hertz. At least one independent source must have a
nonzero `acMagnitude` unless the circuit model provides another AC excitation.

### 4.6 Outer parameter sweep

```tsx
<analogsimulation
  name="load-transient"
  simulationType="spice_transient_analysis"
  spiceEngine="ngspice"
  duration="10ms"
  timePerStep="1us"
/>

<simulationparametersweep
  name="load-sweep"
  simulation=".load-transient"
  target=".Iload"
  targetProperty="current"
  sweepPoints={["1mA", "10mA", "100mA", "500mA", "1A"]}
  xAxisScale="log"
/>
```

Common props:

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | none | Stable sweep identity |
| `simulation` | `string` | none | Selector resolving to one analog simulation |
| `target` | `string` | none | Selector resolving to one source component |
| `targetProperty` | target-property enum | none | Property overridden only for simulation |
| `sweepType` | `list \| linear \| decade \| octave` | `list` | Coordinate generator |
| `xAxisScale` | `linear \| log` | mode-dependent | Preferred chart/export X scale |
| `retainInnerResults` | `boolean` | `false` | Opt in to storing raw inner vectors |
| `stopOnError` | `boolean` | `false` | Opt in to stopping after the first failed point |

Supported target properties in the contract are `voltage`, `current`,
`resistance`, `capacitance`, `inductance`, and `temperature`. An engine/compiler
may support a strict subset, but it must reject unsupported bindings before the
first inner run.

Sweep mode rules:

- `list`: `sweepPoints` is required and preserves input order and duplicates.
- `linear`: `sweepStart`, `sweepStop`, and nonzero `sweepStep` are required.
- `decade`/`octave`: positive `sweepStart`, `sweepStop`, and integer
  `sweepPointCount >= 2` are required. The expanded coordinates include both
  endpoints.

`xAxisScale` defaults to `log` for decade/octave coordinate generators and
`linear` for list/linear generators. It may be overridden for list sweeps.

Exactly one outer sweep may reference an experiment in MVP. Multi-dimensional
or nested sweeps are a future extension.

If there is no linked measurement, `retainInnerResults` must be true. Otherwise
the sweep would intentionally retain no output.

### 4.7 Measurements

#### Probe reducer

```tsx
<simulationmeasurement
  name="vout-average"
  simulation=".load-transient"
  measurementType="probe_reducer"
  probe=".Vout"
  operation="mean"
  windowStartTime="8ms"
  windowEndTime="10ms"
/>
```

Supported operations:

- `mean`
- `rms`
- `minimum`
- `maximum`
- `peak_to_peak`
- `integral`
- `final`
- `frequency`
- `period`
- `duty_cycle`
- `threshold_crossing`

`frequency`, `period`, `duty_cycle`, and `threshold_crossing` require `threshold`.
`thresholdEdge` is `rising`, `falling`, or `either` and defaults to `rising`.

When a probe produces complex AC samples, `complexProjection` is required and
is one of `magnitude`, `magnitude_db`, `phase_degrees`, `real`, or `imaginary`.
The projection is applied before the reducer; the canonical raw complex samples
are never replaced.

#### Average power

```tsx
<simulationmeasurement
  name="input-power"
  simulation=".load-transient"
  measurementType="average_power"
  voltageProbe=".VinProbe"
  currentProbe=".IinProbe"
  steadyStateCycles={5}
/>
```

The implementation interpolates the voltage and current vectors onto a common
time grid, multiplies the synchronized samples, and computes the arithmetic
mean over the selected window.

Positive current flows from a current probe's positive endpoint to its negative
endpoint. Positive average power means absorbed power under the passive sign
convention.

#### Expression

```tsx
<simulationmeasurement
  name="efficiency"
  simulation=".load-transient"
  measurementType="expression"
  expression={'100 * abs(measurement("output-power")) / abs(measurement("input-power"))'}
  outputQuantity="efficiency"
  outputUnit="%"
/>
```

The expression grammar is deliberately small:

```text
expression      := additive
additive        := multiplicative (("+" | "-") multiplicative)*
multiplicative  := unary (("*" | "/") unary)*
unary           := ("+" | "-") unary | primary
primary         := number
                 | "(" expression ")"
                 | "abs(" expression ")"
                 | "min(" expression "," expression ")"
                 | "max(" expression "," expression ")"
                 | "measurement(" quoted_measurement_name ")"
```

JavaScript `eval`, property access, arbitrary function calls, and global names
are forbidden. Core resolves referenced measurement names to stable IDs, rejects
missing references, and rejects dependency cycles before execution.
`outputQuantity` and `outputUnit` are required because the expression evaluator
does not attempt dimensional inference.

#### Window selection

Probe reducer and average-power measurements may use either:

- both `windowStartTime` and `windowEndTime`; or
- `steadyStateCycles`.

The two forms are mutually exclusive. A missing window means the complete
analysis domain. `steadyStateCycles` is valid only when a stable period can be
measured; inability to find the requested cycles is a measurement error.

## 5. Source excitation model

The source API is additive:

```tsx
<voltagesource
  name="Vin"
  voltage="5V"
  acMagnitude="1V"
  acPhase="0deg"
  waveShape="sinewave"
  frequency="10kHz"
  peakToPeakVoltage="200mV"
/>
```

`voltage`/`current` is the DC bias. `waveShape` and its waveform props describe
transient excitation. `acMagnitude` and `acPhase` describe small-signal AC
excitation. None is a substitute for another.

SPICE serialization may therefore produce a source containing all applicable
terms, such as:

```spice
VVin in 0 DC 5 AC 1 0 SIN(5 0.1 10k)
```

The canonical Circuit JSON source is also additive and uses one endpoint naming
scheme:

```json
{
  "type": "simulation_voltage_source",
  "simulation_voltage_source_id": "simulation_voltage_source_vin",
  "source_component_id": "source_component_vin",
  "positive_source_port_id": "source_port_vin_pos",
  "negative_source_port_id": "source_port_vin_neg",
  "voltage": 5,
  "ac_magnitude": 1,
  "ac_phase_degrees": 0,
  "frequency": 10000,
  "peak_to_peak_voltage": 0.2,
  "wave_shape": "sinewave",
  "transient_phase_degrees": 0
}
```

Current sources use the same endpoint fields with `current` and
`peak_to_peak_current`. `voltage`, `current`, and `ac_magnitude` use V or A
according to the source type; frequency is Hz and phase is degrees.

A canonical source has either a complete positive/negative port pair or a
complete positive/negative net pair, never both. It must explicitly define at
least one DC, transient, or AC excitation field; the simulator must not invent
an electrical source magnitude.

The current `is_dc_source` Circuit JSON union becomes a compatibility input, not
the canonical model. During migration, parsers accept the legacy shapes and
normalize them to the additive source fields. The user-facing `phase` prop
continues to mean transient waveform phase; `acPhase` is independent.

## 6. Prop validation and normalization

Validation occurs before Circuit JSON insertion and before engine invocation.

| Invalid combination | Required behavior |
| --- | --- |
| Transient timing prop on non-transient analysis | Reject |
| DC sweep prop on another analysis | Reject |
| AC prop on another analysis | Reject |
| AC linear count mixed with log count | Reject |
| Selector resolves to zero or multiple elements | Reject with selector and expected type |
| DC sweep source is not a voltage/current source | Reject |
| Sweep target property cannot bind to target component | Reject before first run |
| Log X scale contains a nonpositive coordinate | Reject |
| Both absolute window and steady-state cycles | Reject |
| Only one absolute-window endpoint | Reject |
| Time window or steady-state cycles on non-transient analysis | Reject |
| Threshold operation without threshold | Reject |
| Complex result without `complexProjection` | Reject |
| Frequency, period, or duty-cycle operation on a non-transient result | Reject |
| Integral on a non-transient or complex result | Reject |
| Expression reference missing or cyclic | Reject |
| Expression lacks output quantity or unit | Reject |
| Unsupported engine analysis/capability | Reject before netlist compilation |

Canonical numeric units are:

| Quantity | Base unit |
| --- | --- |
| Time/duration | ms |
| Frequency | Hz |
| Voltage | V |
| Current | A |
| Resistance | Ω |
| Capacitance | F |
| Inductance | H |
| Phase/angle | deg |
| Temperature | degC |

## 7. Circuit JSON experiment definitions

`simulation_experiment` becomes a flat discriminated union.

### 7.1 Transient

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_1",
  "name": "startup",
  "experiment_type": "spice_transient_analysis",
  "time_per_step": 0.001,
  "start_time_ms": 0,
  "end_time_ms": 10
}
```

### 7.2 DC operating point

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_2",
  "name": "bias-point",
  "experiment_type": "spice_dc_operating_point"
}
```

### 7.3 DC voltage-source sweep

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_3",
  "name": "line-regulation",
  "experiment_type": "spice_dc_sweep",
  "dc_sweep_source_type": "voltage_source",
  "simulation_voltage_source_id": "simulation_voltage_source_vin",
  "dc_sweep_start": 2.5,
  "dc_sweep_stop": 5.5,
  "dc_sweep_step": 0.1,
  "dc_sweep_unit": "V"
}
```

A current-source sweep uses `dc_sweep_source_type: "current_source"`,
`simulation_current_source_id`, and `dc_sweep_unit: "A"`.

### 7.4 AC

```json
{
  "type": "simulation_experiment",
  "simulation_experiment_id": "simulation_experiment_4",
  "name": "frequency-response",
  "experiment_type": "spice_ac_analysis",
  "ac_sweep_type": "decade",
  "ac_points_per_interval": 20,
  "ac_start_frequency_hz": 10,
  "ac_stop_frequency_hz": 1000000
}
```

Linear AC uses `ac_point_count` instead of `ac_points_per_interval`.

## 8. Circuit JSON relationship and result model

```text
simulation_experiment
  ├── simulation_analysis_result (one per raw output vector)
  ├── simulation_measurement
  │     └── simulation_measurement_result (one scalar per run)
  └── simulation_parameter_sweep
        ├── simulation_sweep_point (one per coordinate)
        └── simulation_parameter_sweep_result (one per measurement)
```

Every repeatable entity is a separate flat element connected by IDs. Nested
axis, series, measurement, sweep-point, or diagnostic objects are forbidden.

### 8.1 Raw analysis result

One `simulation_analysis_result` represents one output vector:

```json
{
  "type": "simulation_analysis_result",
  "simulation_analysis_result_id": "simulation_analysis_result_1",
  "simulation_experiment_id": "simulation_experiment_4",
  "analysis_type": "spice_ac_analysis",
  "name": "V(out)",
  "simulation_voltage_probe_id": "simulation_voltage_probe_out",
  "x_axis_quantity": "frequency",
  "x_axis_unit": "Hz",
  "x_axis_scale": "log",
  "x_coordinates": [10, 12.589, 15.849],
  "output_quantity": "voltage",
  "output_unit": "V",
  "sample_type": "complex",
  "real_samples": [0.99, 0.98, 0.96],
  "imaginary_samples": [-0.01, -0.02, -0.04]
}
```

Rules:

- `x_coordinates`, `x_axis_quantity`, `x_axis_unit`, and `x_axis_scale` are
  omitted only for an operating-point scalar.
- `real_samples.length` equals `x_coordinates.length`, or equals `1` for an
  operating-point scalar.
- `imaginary_samples` is present if and only if `sample_type` is `complex`, and
  its length equals `real_samples.length`.
- DC and transient outputs are normally real. AC outputs preserve real and
  imaginary components even if one component is zero.
- A raw result from an outer-sweep coordinate also has
  `simulation_sweep_point_id` and is stored only when `retain_inner_results` is
  true.
- Probe and source-component IDs are authoritative. Generated SPICE vector names
  are not public identity.

### 8.2 Parameter-sweep definition

Core resolves and fully expands the public sweep before execution:

```json
{
  "type": "simulation_parameter_sweep",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_1",
  "simulation_experiment_id": "simulation_experiment_1",
  "name": "load-sweep",
  "target_source_component_id": "source_component_iload",
  "target_property": "current",
  "sweep_type": "list",
  "sweep_unit": "A",
  "x_axis_scale": "log",
  "sweep_coordinates": [0.001, 0.01, 0.1, 0.5, 1],
  "retain_inner_results": false,
  "stop_on_error": false
}
```

### 8.3 Measurement definitions

A probe reducer links exactly one voltage or current probe:

```json
{
  "type": "simulation_measurement",
  "simulation_measurement_id": "simulation_measurement_vout_average",
  "simulation_experiment_id": "simulation_experiment_1",
  "name": "vout-average",
  "measurement_type": "probe_reducer",
  "operation": "mean",
  "simulation_voltage_probe_id": "simulation_voltage_probe_vout",
  "window_start_ms": 8,
  "window_end_ms": 10
}
```

Average-power measurements use `measurement_type: "average_power"` and require
both `simulation_voltage_probe_id` and `simulation_current_probe_id`.
Expression measurements use `measurement_type: "expression"`, the restricted
`expression`, resolved `referenced_simulation_measurement_ids`,
`output_quantity`, and `output_unit`.

Reducer output metadata is deterministic:

- mean, RMS, minimum, maximum, peak-to-peak, and final preserve the probe's
  quantity and unit for real/real-projected samples;
- magnitude in dB and phase projections produce dB and deg respectively;
- current integral is charge in C;
- voltage integral is `voltage_time` in V·s;
- frequency is Hz;
- period is time in ms;
- threshold crossing returns the X-axis quantity and unit; and
- duty cycle is percent.

### 8.4 Sweep-point state

```json
{
  "type": "simulation_sweep_point",
  "simulation_sweep_point_id": "simulation_sweep_point_3",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_1",
  "simulation_experiment_id": "simulation_experiment_1",
  "sweep_index": 2,
  "sweep_coordinate": 0.1,
  "sweep_unit": "A",
  "is_complete": true,
  "has_error": false,
  "is_canceled": false,
  "display_status": "complete"
}
```

Consumers branch on `is_complete`, `has_error`, and `is_canceled`.
`display_status` is human-facing and may gain new enum strings without changing
control flow.

| Point state | `is_complete` | `has_error` | `is_canceled` |
| --- | ---: | ---: | ---: |
| pending/running | `false` | `false` | `false` |
| successful terminal | `true` | `false` | `false` |
| failed terminal | `true` | `true` | `false` |
| canceled terminal | `true` | `false` | `true` |

### 8.5 Measurement result

```json
{
  "type": "simulation_measurement_result",
  "simulation_measurement_result_id": "simulation_measurement_result_3",
  "simulation_experiment_id": "simulation_experiment_1",
  "simulation_measurement_id": "simulation_measurement_efficiency",
  "simulation_sweep_point_id": "simulation_sweep_point_3",
  "measurement_quantity": "efficiency",
  "measurement_unit": "%",
  "measurement_scalar": 91.7
}
```

### 8.6 Parameter-sweep result

One `simulation_parameter_sweep_result` is the compact, chart-ready series for
one measurement:

```json
{
  "type": "simulation_parameter_sweep_result",
  "simulation_parameter_sweep_result_id": "simulation_parameter_sweep_result_1",
  "simulation_experiment_id": "simulation_experiment_1",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_1",
  "simulation_measurement_id": "simulation_measurement_efficiency",
  "name": "efficiency",
  "x_axis_quantity": "current",
  "x_axis_unit": "A",
  "x_axis_scale": "log",
  "sweep_coordinates": [0.001, 0.01, 0.1, 0.5, 1],
  "output_quantity": "efficiency",
  "output_unit": "%",
  "measurement_samples": [82.1, 89.4, null, 93.2, 92.8],
  "simulation_sweep_point_ids": [
    "simulation_sweep_point_1",
    "simulation_sweep_point_2",
    "simulation_sweep_point_3",
    "simulation_sweep_point_4",
    "simulation_sweep_point_5"
  ]
}
```

All parallel arrays have identical length and preserve requested coordinate
order. A failed or canceled point remains in the arrays as `null`; it is never
removed or shifted.

### 8.7 Errors

Runtime failures use Circuit JSON error elements extending
`BaseCircuitJsonError`:

- `simulation_execution_error` links an experiment and optional sweep point.
- `simulation_measurement_error` links an experiment, measurement, and optional
  sweep point.

Each has matching `type`, `<type>_id`, and `error_type`, plus `message` and
optional `is_fatal`. Engine diagnostics may be attached to the execution error,
but the engine's raw log must not become the stable public error code.

## 9. Compiler contract

`circuit-json-to-spice` compiles exactly one experiment at a time:

```ts
interface CompiledSpiceExperiment {
  simulationExperimentId: string
  analysisType: SpiceAnalysisType
  spiceNetlist: string
  outputVectorBindings: SpiceOutputVectorBinding[]
  sweepTargetBindings: SpiceSweepTargetBinding[]
}
```

This is an internal TypeScript object, so its keys are camelCase. The compiler
must:

1. Emit exactly one direct-analysis statement: `.op`, `.dc`, `.ac`, or `.tran`.
2. Replace the transient-specific `tranCommand` representation with one generic
   analysis-statement field.
3. Emit `.SAVE`/`.PRINT` selections for every analysis type.
4. Return output-vector bindings directly instead of encoding identity in
   comments and reparsing it in the engine adapter.
5. Resolve DC and outer-sweep targets from stable Circuit JSON IDs to generated
   SPICE names.
6. Serialize `DC`, transient waveform, and `AC` source terms independently.

Expected analysis statements include:

```spice
.op
.dc VVin 2.5 5.5 0.1
.ac dec 20 10 1Meg
.tran 1u 10m 0 UIC
```

Native ngspice axis grids must be preserved. Resampling is an explicit
display/export operation, not an unconditional compiler or adapter mutation.

## 10. Engine contract

The existing string API remains for compatibility:

```ts
interface SpiceEngine {
  capabilities?: SpiceEngineCapabilities
  simulate(spiceString: string): Promise<LegacySpiceEngineSimulationResult>
  simulateAnalysis?(
    request: SpiceSimulationRequest,
  ): Promise<SpiceEngineAnalysisResult>
}
```

The structured request contains the compiled experiment, optional solver
options, and optional `AbortSignal`. Capabilities declare:

- supported analysis types;
- complex-result support;
- abort-signal support; and
- whether the engine reuses a simulation session.

Core uses `simulateAnalysis` when present. `simulate` is a transient-only
compatibility fallback unless an engine explicitly documents a broader legacy
contract.

The ngspice adapter must serialize access to one cached mutable simulation
instance. Parallelism is valid only through a bounded pool of independent
instances; a worker pool is not part of MVP.

## 11. Execution semantics

### 11.1 Direct analyses

Core must compile and run each `simulation_experiment` independently and attach
results to that experiment's ID. It must never associate all engine responses
with `simulation_experiment.list()[0]`.

Expected invocation counts:

| Request | Engine calls |
| --- | ---: |
| One operating point | 1 |
| One 101-coordinate direct DC sweep | 1 |
| One 200-frequency AC analysis | 1 |
| One transient waveform with thousands of samples | 1 |

### 11.2 Outer sweep

For each expanded coordinate, core:

1. Creates a `simulation_sweep_point` with pending booleans.
2. Applies a simulation-only override to the resolved source component.
3. Compiles exactly one inner experiment.
4. Executes exactly one engine call.
5. Converts raw vectors to canonical results in memory.
6. Executes linked measurements in dependency order.
7. Stores scalar measurement results and, if requested, raw inner results.
8. Updates the point booleans and human-facing display status.

The original source component and board Circuit JSON are never mutated by the
simulation-only override.

With default `stopOnError={false}`, a failed coordinate records an error and the
runner continues. With `stopOnError`, later points become canceled. Cancellation
via `AbortSignal` marks the active and remaining points canceled and returns all
completed partial results.

Expected invocation counts:

| Request | Engine calls |
| --- | ---: |
| 20-point outer sweep around transient | 20 |
| 20-point outer sweep around 200-frequency AC | 20 |

### 11.3 Determinism and provenance

Results used for comparison or datasheet validation must retain:

- experiment definition;
- expanded sweep coordinates;
- measurement definition and window;
- solver options;
- engine name and version;
- source/model revision when available; and
- failed-point errors.

Given the same inputs and engine version, sweep order and output ordering are
deterministic.

## 12. Rendering and export

Viewers consume canonical results by `simulation_experiment_id`.

- Operating point: table of output labels, quantities, units, and scalars.
- Direct DC: linear Cartesian chart by default.
- AC: logarithmic frequency axis with magnitude/phase panels. Magnitude may be
  displayed linearly or in dB without changing canonical samples.
- Transient: time-domain chart; the existing oscilloscope renderer may continue
  handling legacy elements.
- Parameter sweep: Cartesian chart using sweep coordinates and measurement
  samples, including explicit error gaps.

CLI export should support canonical JSON and CSV. Complex CSV export contains
separate real and imaginary columns, with optional derived magnitude/dB/phase
columns selected at export time.

## 13. Compatibility and migration

1. Existing `<analogsimulation duration="10ms" timePerStep="1us" />` remains a
   transient analysis.
2. Existing `simulation_transient_voltage_graph` and
   `simulation_transient_current_graph` remain parseable.
3. During migration, the ngspice adapter emits canonical transient results and
   legacy transient graph projections.
4. Existing transient display behavior, including `graphIndependentAxes`, is
   unchanged.
5. Existing source schemas with `is_dc_source` remain accepted as compatibility
   inputs and normalize to the additive source model.
6. The legacy `SpiceEngine.simulate(spiceString)` method remains available while
   consumers migrate to `simulateAnalysis`.
7. New consumers prefer canonical elements and fall back to legacy transient
   graphs.
8. Legacy emission is removed only after core, viewers, runframe, CLI, and the
   aggregate package all consume canonical results.

## 14. Package implementation order

1. **`circuit-json`**: experiment union, source excitation additions, sweep,
   measurement, result, point, and error schemas plus fixtures.
2. **`@tscircuit/props`**: discriminated props, source AC props, intrinsic
   element props, engine capabilities, and structured engine method.
3. **`circuit-json-to-spice`**: four analysis statements and structured output/
   sweep bindings.
4. **`@tscircuit/eecircuit-engine`**: explicit analysis/scale metadata,
   diagnostics, reset behavior, and cancellation behavior.
5. **`@tscircuit/ngspice-spice-engine`**: generic real/complex conversion and
   serialized engine access.
6. **`@tscircuit/core`**: per-experiment execution, target resolution,
   measurement runner, sequential outer sweep, progress, and partial failures.
7. **Viewers/runframe/CLI**: generic charting, terminal-state detection,
   progress, and export.
8. **Aggregate package and docs**: compatible version set and examples.

Each package must publish contract fixtures so independently released versions
can be checked in a compatibility matrix.

## 15. Required tests

- `.op`: resistor divider scalar matches its closed-form value.
- `.dc`: divider input sweep returns every expected coordinate and output slope.
- `.ac`: RC low-pass retains complex samples and is approximately -3 dB and
  -45 degrees at cutoff.
- `.tran`: RC step matches its time constant and existing snapshots.
- source serialization: one source can contain `DC 5 AC 1 0` plus a transient
  waveform.
- multi-experiment: every result links to the correct experiment.
- direct-analysis call counts match section 11.1.
- outer-sweep call counts match section 11.2.
- partial sweep: a failed point remains as a `null` measurement sample with a
  linked error.
- cancellation: completed points remain and pending points become canceled.
- expression validation: missing names and cycles fail before execution.
- power: interpolation and passive-sign convention are covered.
- compatibility: legacy transient JSX produces unchanged legacy graph data and
  a matching canonical result.
- rendering snapshots: operating-point table, linear DC, log Bode, transient,
  multi-series, and partial-sweep error gap.

## 16. Acceptance criteria

- All four direct analyses compile from typed JSX props to valid SPICE.
- Each direct analysis returns all native axis samples in one engine call.
- AC real and imaginary components survive every adapter and export boundary.
- Multiple experiments execute and associate independently.
- An outer sweep is deterministic, cancellable, progress-reporting, and
  preserves partial failures without array shifts.
- Measurements reduce inner analyses to scalar characteristic-curve samples.
- DC bias, transient excitation, and AC excitation coexist on one source.
- Viewers support arbitrary physical axes and logarithmic frequency.
- Existing transient API and visuals remain compatible.
- No public relationship depends on generated SPICE names.

## 17. Explicit non-goals for MVP

- Multi-dimensional/nested outer sweeps
- Native ngspice control-script batching
- Multiple raw plots from one engine invocation
- Parallel calls through one mutable simulation instance
- Dual-Y-axis and heat-map rendering
- JavaScript expressions or arbitrary user code in measurements
- Automatic engine switching
- Guaranteeing that a vendor model converges or supports every analysis

## 18. References

- [tscircuit handbook: API design](https://github.com/tscircuit/handbook/blob/main/guides/api-design.md)
- [tscircuit handbook: code conventions](https://github.com/tscircuit/handbook/blob/main/guides/code.md)
- [`@tscircuit/props` repository guidance](https://github.com/tscircuit/props/blob/main/AGENTS.md)
- [Current `AnalogSimulationProps`](https://github.com/tscircuit/props/blob/main/lib/components/analogsimulation.ts)
- [Current Circuit JSON `SimulationExperiment`](https://github.com/tscircuit/circuit-json/blob/main/src/simulation/simulation_experiment.ts)
- [Circuit JSON specification and base units](https://github.com/tscircuit/circuit-json)
- [Current core `AnalogSimulation`](https://github.com/tscircuit/core/blob/main/lib/components/primitive-components/AnalogSimulation.ts)
- [ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)
