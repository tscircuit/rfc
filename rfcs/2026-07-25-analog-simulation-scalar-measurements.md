# Analog Simulation Scalar Measurements

## Motivation

The analog simulation RFC defines transient simulation and one-dimensional
parameter sweeps. Each sweep point currently produces a full transient graph.
Datasheet curves such as output regulation or switching frequency versus load
instead need one scalar from each transient run.

This RFC defines TSX usage and Circuit JSON for transient voltage and current
measurements. Compiler, engine, scheduling, rendering, and export APIs are
outside its scope.

## Voltage and current measurements

`<analog.measurevoltage>` reduces one voltage probe over a time window:

```tsx
<voltageprobe name="VOUT" connectsTo="net.VOUT" />

<analog.transientsimulation
  name="load-regulation"
  duration="5ms"
  timePerStep="1us"
>
  <analog.measurevoltage
    name="settled-output"
    voltageProbeRef=".VOUT"
    calculation="mean"
    startTime="4ms"
    endTime="5ms"
  />
</analog.transientsimulation>
```

`<analog.measurecurrent>` has the same shape with `currentProbeRef`:

```tsx
<analog.measurecurrent
  name="peak-inductor-current"
  currentProbeRef=".IL"
  calculation="maximum"
  startTime="4ms"
  endTime="5ms"
/>
```

Both elements support these calculations:

| `calculation` | Result |
| --- | --- |
| `"mean"` | Time-weighted mean |
| `"minimum"` | Minimum sample |
| `"maximum"` | Maximum sample |
| `"peak-to-peak"` | Maximum minus minimum |
| `"rms"` | Time-weighted root mean square |
| `"final"` | Last sample in the window |

`startTime` and `endTime` are optional, but must be provided together. They
default to the full recorded interval. Raw numbers use milliseconds.

## Voltage regulation

`<analog.measurevoltageregulation>` produces the percentage difference between
the mean measured voltage and a nominal voltage:

```tsx
<currentsource name="ILOAD" current="10mA" />
<voltageprobe name="VOUT" connectsTo="net.VOUT" />

<analog.transientsimulation
  name="load-regulation"
  duration="5ms"
  timePerStep="1us"
>
  <analog.sweepparameter
    name="load-current"
    parameterType="current"
    currentSourceRef=".ILOAD"
    values={["10mA", "100mA", "500mA", "1A", "2A"]}
  />
  <analog.measurevoltageregulation
    name="output-regulation"
    voltageProbeRef=".VOUT"
    nominalVoltage="3.3V"
    startTime="4ms"
    endTime="5ms"
  />
</analog.transientsimulation>
```

The result is:

```text
100 * (mean measured voltage - nominal voltage) / nominal voltage
```

`nominalVoltage` must be positive. The time window follows the voltage and
current measurement rules.

## Voltage frequency

`<analog.measurevoltagefrequency>` measures frequency from threshold crossings:

```tsx
<voltageprobe name="SW" connectsTo="net.SW" />

<analog.transientsimulation
  name="switching-frequency"
  duration="5ms"
  timePerStep="10ns"
>
  <analog.measurevoltagefrequency
    name="switching-frequency"
    voltageProbeRef=".SW"
    thresholdVoltage="1.5V"
    edge="rising"
    startTime="4ms"
    endTime="5ms"
  />
</analog.transientsimulation>
```

`edge` is `"rising"` or `"falling"`. Crossing times are linearly interpolated
between samples. The frequency is the number of intervals divided by the time
between the first and last crossing.

`crossingHoldoff` may be used to ignore additional crossings immediately after
an accepted crossing. This permits a burst-frequency measurement to ignore the
switching edges inside each burst:

```tsx
<analog.measurevoltagefrequency
  name="burst-frequency"
  voltageProbeRef=".SW"
  thresholdVoltage="1.5V"
  edge="rising"
  crossingHoldoff="20us"
  startTime="2ms"
  endTime="5ms"
/>
```

Raw `thresholdVoltage` numbers use volts. Raw time numbers use milliseconds.
At least two accepted crossings are required.

## Parameter sweep graphs

When a measurement is inside a simulation with
`<analog.sweepparameter>`, it runs once for every sweep point. Circuit JSON also
contains one graph with the parameter values on the x-axis and the measurement
results on the y-axis.

| Measurement | Graph type | Y-axis field |
| --- | --- | --- |
| `analog.measurevoltage` | `simulation_parameter_sweep_voltage_measurement_graph` | `voltages` |
| `analog.measurecurrent` | `simulation_parameter_sweep_current_measurement_graph` | `currents` |
| `analog.measurevoltageregulation` | `simulation_parameter_sweep_voltage_regulation_graph` | `regulation_percentages` |
| `analog.measurevoltagefrequency` | `simulation_parameter_sweep_voltage_frequency_graph` | `frequencies_hz` |

The load-regulation example produces:

```json
{
  "type": "simulation_parameter_sweep_voltage_regulation_graph",
  "simulation_parameter_sweep_voltage_regulation_graph_id": "simulation_parameter_sweep_voltage_regulation_graph_output",
  "simulation_experiment_id": "simulation_experiment_load_regulation",
  "simulation_parameter_sweep_id": "simulation_parameter_sweep_load_current",
  "simulation_voltage_regulation_measurement_id": "simulation_voltage_regulation_measurement_output",
  "parameter_values": [0.01, 0.1, 0.5, 1, 2],
  "parameter_unit": "A",
  "regulation_percentages": [0.12, 0.08, -0.03, -0.14, -0.31]
}
```

The parameter and measurement arrays have the same length and preserve sweep
order.

## Circuit JSON

Each measurement emits a specific declaration:

| TSX element | Circuit JSON type |
| --- | --- |
| `analog.measurevoltage` | `simulation_voltage_measurement` |
| `analog.measurecurrent` | `simulation_current_measurement` |
| `analog.measurevoltageregulation` | `simulation_voltage_regulation_measurement` |
| `analog.measurevoltagefrequency` | `simulation_voltage_frequency_measurement` |

For example:

```json
{
  "type": "simulation_voltage_regulation_measurement",
  "simulation_voltage_regulation_measurement_id": "simulation_voltage_regulation_measurement_output",
  "simulation_experiment_id": "simulation_experiment_load_regulation",
  "simulation_voltage_probe_id": "simulation_voltage_probe_vout",
  "name": "output-regulation",
  "nominal_voltage": 3.3,
  "start_time_ms": 4,
  "end_time_ms": 5
}
```

Each run emits one specific scalar result:

| Measurement | Result type | Value field |
| --- | --- | --- |
| Voltage | `simulation_voltage_measurement_result` | `voltage` |
| Current | `simulation_current_measurement_result` | `current` |
| Voltage regulation | `simulation_voltage_regulation_measurement_result` | `regulation_percentage` |
| Voltage frequency | `simulation_voltage_frequency_measurement_result` | `frequency_hz` |

A result from a parameter sweep includes
`simulation_parameter_sweep_point_id`. A direct simulation result omits it.
The raw transient voltage and current graphs remain unchanged.

## Scope

This RFC specifies:

- transient voltage and current scalar measurements;
- voltage regulation and voltage frequency measurements; and
- one-dimensional parameter sweep graphs for those measurements.

General measurement expressions, current-source pulse timing, multidimensional
sweeps, threshold searches, engine interfaces, execution scheduling, rendering
behavior, export formats, and package implementation order are intentionally
left to separate proposals.
