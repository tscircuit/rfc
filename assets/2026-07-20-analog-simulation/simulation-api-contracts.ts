/**
 * Proposed tscircuit analog-simulation contracts.
 *
 * Status: API specification companion; not a drop-in replacement for the
 * current @tscircuit/props or circuit-json exports.
 *
 * Naming follows tscircuit conventions:
 * - JSX/library props use camelCase.
 * - Circuit JSON fields and enum strings use snake_case.
 * - Physical props accept a number in the documented base unit or a unit string.
 */

export type PhysicalQuantityInput = number | string

export type SpiceAnalysisType =
  | "spice_dc_operating_point"
  | "spice_dc_sweep"
  | "spice_ac_analysis"
  | "spice_transient_analysis"

export interface SpiceOptions {
  method?: "trap" | "gear"
  reltol?: number | string
  abstol?: number | string
  vntol?: number | string
}

interface AnalogSimulationCommonProps {
  /** Stable circuit identity used by selectors and related simulation elements. */
  name?: string
  spiceEngine?: "spicey" | "ngspice" | (string & {})
  spiceOptions?: SpiceOptions
}

/**
 * Omitted simulationType remains the compatibility spelling for transient.
 * Numbers for time props are milliseconds.
 */
export interface TransientAnalysisProps extends AnalogSimulationCommonProps {
  simulationType?: "spice_transient_analysis"
  duration?: PhysicalQuantityInput
  startTime?: PhysicalQuantityInput
  timePerStep?: PhysicalQuantityInput
  graphIndependentAxes?: boolean
}

export interface DcOperatingPointProps extends AnalogSimulationCommonProps {
  simulationType: "spice_dc_operating_point"
}

export interface DcSweepAnalysisProps extends AnalogSimulationCommonProps {
  simulationType: "spice_dc_sweep"
  /** Selector for exactly one <voltagesource /> or <currentsource />. */
  dcSweepSource: string
  /** Numbers use V for a voltage source and A for a current source. */
  dcSweepStart: PhysicalQuantityInput
  dcSweepStop: PhysicalQuantityInput
  dcSweepStep: PhysicalQuantityInput
}

interface AcAnalysisCommonProps extends AnalogSimulationCommonProps {
  simulationType: "spice_ac_analysis"
  /** Numbers are hertz. */
  acStartFrequency: PhysicalQuantityInput
  /** Numbers are hertz. */
  acStopFrequency: PhysicalQuantityInput
}

export interface AcLinearAnalysisProps extends AcAnalysisCommonProps {
  acSweepType: "linear"
  acPointCount: number
  acPointsPerInterval?: never
}

export interface AcLogAnalysisProps extends AcAnalysisCommonProps {
  acSweepType: "decade" | "octave"
  acPointsPerInterval: number
  acPointCount?: never
}

export type AcAnalysisProps = AcLinearAnalysisProps | AcLogAnalysisProps

export type AnalogSimulationProps =
  | TransientAnalysisProps
  | DcOperatingPointProps
  | DcSweepAnalysisProps
  | AcAnalysisProps

export type SimulationSweepTargetProperty =
  | "voltage"
  | "current"
  | "resistance"
  | "capacitance"
  | "inductance"
  | "temperature"

interface SimulationParameterSweepCommonProps {
  name: string
  /** Selector for exactly one <analogsimulation />. */
  simulation: string
  /** Selector for exactly one source component. */
  target: string
  targetProperty: SimulationSweepTargetProperty
  /** Defaults to log for decade/octave sweeps and linear otherwise. */
  xAxisScale?: "linear" | "log"
  /** Unusual opt-in; raw inner results are omitted by default. */
  retainInnerResults?: boolean
  /** Unusual opt-in; the default is to preserve partial results and continue. */
  stopOnError?: boolean
}

export interface SimulationListParameterSweepProps
  extends SimulationParameterSweepCommonProps {
  sweepType?: "list"
  /** Numbers use the base unit implied by targetProperty. */
  sweepPoints: PhysicalQuantityInput[]
  sweepStart?: never
  sweepStop?: never
  sweepStep?: never
  sweepPointCount?: never
}

export interface SimulationLinearParameterSweepProps
  extends SimulationParameterSweepCommonProps {
  sweepType: "linear"
  sweepStart: PhysicalQuantityInput
  sweepStop: PhysicalQuantityInput
  sweepStep: PhysicalQuantityInput
  sweepPoints?: never
  sweepPointCount?: never
}

export interface SimulationLogParameterSweepProps
  extends SimulationParameterSweepCommonProps {
  sweepType: "decade" | "octave"
  sweepStart: PhysicalQuantityInput
  sweepStop: PhysicalQuantityInput
  sweepPointCount: number
  sweepPoints?: never
  sweepStep?: never
}

export type SimulationParameterSweepProps =
  | SimulationListParameterSweepProps
  | SimulationLinearParameterSweepProps
  | SimulationLogParameterSweepProps

export type ProbeReducerOperation =
  | "mean"
  | "rms"
  | "minimum"
  | "maximum"
  | "peak_to_peak"
  | "integral"
  | "final"
  | "frequency"
  | "period"
  | "duty_cycle"
  | "threshold_crossing"

export type ThresholdEdge = "rising" | "falling" | "either"

export type ComplexProjection =
  | "magnitude"
  | "magnitude_db"
  | "phase_degrees"
  | "real"
  | "imaginary"

interface SimulationMeasurementCommonProps {
  name: string
  /** Selector for exactly one <analogsimulation />. */
  simulation: string
}

interface TransientMeasurementWindowProps {
  /** Numbers are milliseconds. Must be supplied with windowEndTime. */
  windowStartTime?: PhysicalQuantityInput
  /** Numbers are milliseconds. Must be supplied with windowStartTime. */
  windowEndTime?: PhysicalQuantityInput
  /** Mutually exclusive with the absolute window fields. */
  steadyStateCycles?: number
}

export interface ProbeReducerMeasurementProps
  extends SimulationMeasurementCommonProps,
    TransientMeasurementWindowProps {
  measurementType: "probe_reducer"
  /** Selector for one voltage or current probe. */
  probe: string
  operation: ProbeReducerOperation
  /** Required when the selected analysis result is complex. */
  complexProjection?: ComplexProjection
  /** Required for frequency, period, duty-cycle, and crossing operations. */
  threshold?: PhysicalQuantityInput
  thresholdEdge?: ThresholdEdge
}

export interface AveragePowerMeasurementProps
  extends SimulationMeasurementCommonProps,
    TransientMeasurementWindowProps {
  measurementType: "average_power"
  voltageProbe: string
  currentProbe: string
}

export interface ExpressionMeasurementProps
  extends SimulationMeasurementCommonProps {
  measurementType: "expression"
  /**
   * Restricted arithmetic expression. References use measurement("name").
   * JavaScript evaluation is forbidden.
   */
  expression: string
  outputQuantity: SimulationOutputQuantity
  outputUnit: string
}

export type SimulationMeasurementProps =
  | ProbeReducerMeasurementProps
  | AveragePowerMeasurementProps
  | ExpressionMeasurementProps

/** Additive source props. DC bias, transient waveform, and AC excitation coexist. */
export interface VoltageSourceSimulationProps {
  /** DC bias in volts when a number is supplied. */
  voltage?: PhysicalQuantityInput
  /** Small-signal AC magnitude in volts when a number is supplied. */
  acMagnitude?: PhysicalQuantityInput
  /** Small-signal AC phase in degrees when a number is supplied. */
  acPhase?: PhysicalQuantityInput
  frequency?: PhysicalQuantityInput
  peakToPeakVoltage?: PhysicalQuantityInput
  waveShape?: "sinewave" | "square" | "triangle" | "sawtooth"
  phase?: PhysicalQuantityInput
  dutyCycle?: number | string
  pulseDelay?: PhysicalQuantityInput
  riseTime?: PhysicalQuantityInput
  fallTime?: PhysicalQuantityInput
  pulseWidth?: PhysicalQuantityInput
  period?: PhysicalQuantityInput
}

/** Additive source props. DC bias, transient waveform, and AC excitation coexist. */
export interface CurrentSourceSimulationProps {
  /** DC bias in amperes when a number is supplied. */
  current?: PhysicalQuantityInput
  /** Small-signal AC magnitude in amperes when a number is supplied. */
  acMagnitude?: PhysicalQuantityInput
  /** Small-signal AC phase in degrees when a number is supplied. */
  acPhase?: PhysicalQuantityInput
  frequency?: PhysicalQuantityInput
  peakToPeakCurrent?: PhysicalQuantityInput
  waveShape?: "sinewave" | "square" | "triangle" | "sawtooth"
  phase?: PhysicalQuantityInput
  dutyCycle?: number | string
}

// ---------------------------------------------------------------------------
// Circuit JSON contracts
// ---------------------------------------------------------------------------

interface CanonicalSimulationSourceEndpoints {
  source_component_id?: string
  positive_source_port_id?: string
  negative_source_port_id?: string
  positive_source_net_id?: string
  negative_source_net_id?: string
}

export interface SimulationVoltageSource
  extends CanonicalSimulationSourceEndpoints {
  type: "simulation_voltage_source"
  simulation_voltage_source_id: string
  /** DC bias in volts. */
  voltage?: number
  ac_magnitude?: number
  ac_phase_degrees?: number
  frequency?: number
  peak_to_peak_voltage?: number
  wave_shape?: "sinewave" | "square" | "triangle" | "sawtooth"
  transient_phase_degrees?: number
  duty_cycle?: number
  pulse_delay_ms?: number
  rise_time_ms?: number
  fall_time_ms?: number
  pulse_width_ms?: number
  period_ms?: number
}

export interface SimulationCurrentSource
  extends CanonicalSimulationSourceEndpoints {
  type: "simulation_current_source"
  simulation_current_source_id: string
  /** DC bias in amperes. */
  current?: number
  ac_magnitude?: number
  ac_phase_degrees?: number
  frequency?: number
  peak_to_peak_current?: number
  wave_shape?: "sinewave" | "square" | "triangle" | "sawtooth"
  transient_phase_degrees?: number
  duty_cycle?: number
}

interface SimulationExperimentBase {
  type: "simulation_experiment"
  simulation_experiment_id: string
  name: string
  experiment_type: SpiceAnalysisType
  spice_options?: SpiceOptions
}

export interface SimulationTransientExperiment
  extends SimulationExperimentBase {
  experiment_type: "spice_transient_analysis"
  time_per_step: number
  start_time_ms?: number
  end_time_ms: number
}

export interface SimulationDcOperatingPointExperiment
  extends SimulationExperimentBase {
  experiment_type: "spice_dc_operating_point"
}

export interface SimulationVoltageSourceDcSweepExperiment
  extends SimulationExperimentBase {
  experiment_type: "spice_dc_sweep"
  dc_sweep_source_type: "voltage_source"
  simulation_voltage_source_id: string
  dc_sweep_start: number
  dc_sweep_stop: number
  dc_sweep_step: number
  dc_sweep_unit: "V"
}

export interface SimulationCurrentSourceDcSweepExperiment
  extends SimulationExperimentBase {
  experiment_type: "spice_dc_sweep"
  dc_sweep_source_type: "current_source"
  simulation_current_source_id: string
  dc_sweep_start: number
  dc_sweep_stop: number
  dc_sweep_step: number
  dc_sweep_unit: "A"
}

export interface SimulationLinearAcExperiment extends SimulationExperimentBase {
  experiment_type: "spice_ac_analysis"
  ac_sweep_type: "linear"
  ac_point_count: number
  ac_start_frequency_hz: number
  ac_stop_frequency_hz: number
}

export interface SimulationLogAcExperiment extends SimulationExperimentBase {
  experiment_type: "spice_ac_analysis"
  ac_sweep_type: "decade" | "octave"
  ac_points_per_interval: number
  ac_start_frequency_hz: number
  ac_stop_frequency_hz: number
}

export type SimulationExperiment =
  | SimulationTransientExperiment
  | SimulationDcOperatingPointExperiment
  | SimulationVoltageSourceDcSweepExperiment
  | SimulationCurrentSourceDcSweepExperiment
  | SimulationLinearAcExperiment
  | SimulationLogAcExperiment

export type SimulationSweepTargetUnit = "V" | "A" | "Ω" | "F" | "H" | "degC"

export interface SimulationParameterSweep {
  type: "simulation_parameter_sweep"
  simulation_parameter_sweep_id: string
  simulation_experiment_id: string
  name: string
  target_source_component_id: string
  target_property: SimulationSweepTargetProperty
  sweep_type: "list" | "linear" | "decade" | "octave"
  sweep_unit: SimulationSweepTargetUnit
  x_axis_scale: "linear" | "log"
  /** Canonical, fully expanded coordinates in execution order. */
  sweep_coordinates: number[]
  retain_inner_results: boolean
  stop_on_error: boolean
}

export interface SimulationProbeReducerMeasurement {
  type: "simulation_measurement"
  simulation_measurement_id: string
  simulation_experiment_id: string
  name: string
  measurement_type: "probe_reducer"
  operation: ProbeReducerOperation
  simulation_voltage_probe_id?: string
  simulation_current_probe_id?: string
  window_start_ms?: number
  window_end_ms?: number
  steady_state_cycles?: number
  complex_projection?: ComplexProjection
  threshold?: number
  threshold_edge?: ThresholdEdge
}

export interface SimulationAveragePowerMeasurement {
  type: "simulation_measurement"
  simulation_measurement_id: string
  simulation_experiment_id: string
  name: string
  measurement_type: "average_power"
  simulation_voltage_probe_id: string
  simulation_current_probe_id: string
  window_start_ms?: number
  window_end_ms?: number
  steady_state_cycles?: number
}

export interface SimulationExpressionMeasurement {
  type: "simulation_measurement"
  simulation_measurement_id: string
  simulation_experiment_id: string
  name: string
  measurement_type: "expression"
  expression: string
  referenced_simulation_measurement_ids: string[]
  output_quantity: SimulationOutputQuantity
  output_unit: string
}

export type SimulationMeasurement =
  | SimulationProbeReducerMeasurement
  | SimulationAveragePowerMeasurement
  | SimulationExpressionMeasurement

export type SimulationDisplayStatus =
  | "pending"
  | "running"
  | "complete"
  | "error"
  | "canceled"

export interface SimulationSweepPoint {
  type: "simulation_sweep_point"
  simulation_sweep_point_id: string
  simulation_parameter_sweep_id: string
  simulation_experiment_id: string
  sweep_index: number
  sweep_coordinate: number
  sweep_unit: SimulationSweepTargetUnit
  is_complete: boolean
  has_error: boolean
  is_canceled: boolean
  /** Human-facing only. Consumers branch on the booleans above. */
  display_status: SimulationDisplayStatus
}

export type SimulationAxisQuantity =
  | "time"
  | "frequency"
  | "voltage"
  | "current"
  | "resistance"
  | "capacitance"
  | "inductance"
  | "temperature"

export type SimulationOutputQuantity =
  | "voltage"
  | "current"
  | "power"
  | "energy"
  | "charge"
  | "voltage_time"
  | "time"
  | "frequency"
  | "duty_cycle"
  | "efficiency"
  | "resistance"
  | "capacitance"
  | "inductance"
  | "temperature"
  | "dimensionless"

/** One canonical raw output vector from one direct/inner analysis. */
export interface SimulationAnalysisResult {
  type: "simulation_analysis_result"
  simulation_analysis_result_id: string
  simulation_experiment_id: string
  simulation_sweep_point_id?: string
  analysis_type: SpiceAnalysisType
  name: string
  simulation_voltage_probe_id?: string
  simulation_current_probe_id?: string
  source_component_id?: string
  x_axis_quantity?: SimulationAxisQuantity
  x_axis_unit?: string
  x_axis_scale?: "linear" | "log"
  /** Omitted for an operating-point scalar. */
  x_coordinates?: number[]
  output_quantity: SimulationOutputQuantity
  output_unit: string
  sample_type: "real" | "complex"
  real_samples: number[]
  /** Present if and only if sample_type is complex. */
  imaginary_samples?: number[]
}

/** One scalar produced by one measurement for one direct run or sweep point. */
export interface SimulationMeasurementResult {
  type: "simulation_measurement_result"
  simulation_measurement_result_id: string
  simulation_experiment_id: string
  simulation_measurement_id: string
  simulation_sweep_point_id?: string
  measurement_quantity: SimulationOutputQuantity
  measurement_unit: string
  measurement_scalar: number
}

/** Compact chart-ready series assembled from successful measurement results. */
export interface SimulationParameterSweepResult {
  type: "simulation_parameter_sweep_result"
  simulation_parameter_sweep_result_id: string
  simulation_experiment_id: string
  simulation_parameter_sweep_id: string
  simulation_measurement_id: string
  name: string
  x_axis_quantity: SimulationAxisQuantity
  x_axis_unit: string
  x_axis_scale: "linear" | "log"
  sweep_coordinates: number[]
  output_quantity: SimulationOutputQuantity
  output_unit: string
  measurement_samples: Array<number | null>
  simulation_sweep_point_ids: string[]
}

export interface SimulationExecutionError {
  type: "simulation_execution_error"
  simulation_execution_error_id: string
  error_type: "simulation_execution_error"
  message: string
  is_fatal?: boolean
  simulation_experiment_id: string
  simulation_sweep_point_id?: string
  engine_name?: string
}

export interface SimulationMeasurementError {
  type: "simulation_measurement_error"
  simulation_measurement_error_id: string
  error_type: "simulation_measurement_error"
  message: string
  is_fatal?: boolean
  simulation_experiment_id: string
  simulation_measurement_id: string
  simulation_sweep_point_id?: string
}

// ---------------------------------------------------------------------------
// Compiler and engine contracts
// ---------------------------------------------------------------------------

export interface SpiceOutputVectorBinding {
  spiceVector: string
  quantity: "voltage" | "current"
  simulationVoltageProbeId?: string
  simulationCurrentProbeId?: string
  sourceComponentId?: string
}

export interface SpiceSweepTargetBinding {
  sourceComponentId: string
  targetProperty: SimulationSweepTargetProperty
  spiceSourceName: string
}

export interface CompiledSpiceExperiment {
  simulationExperimentId: string
  analysisType: SpiceAnalysisType
  spiceNetlist: string
  outputVectorBindings: SpiceOutputVectorBinding[]
  sweepTargetBindings: SpiceSweepTargetBinding[]
}

export interface SpiceEngineCapabilities {
  supportedAnalysisTypes: SpiceAnalysisType[]
  supportsComplexResults: boolean
  supportsAbortSignal: boolean
  reusesSimulationSession: boolean
}

export interface SpiceSimulationRequest {
  compiledExperiment: CompiledSpiceExperiment
  spiceOptions?: SpiceOptions
  abortSignal?: AbortSignal
}

export interface SpiceEngineDiagnostic {
  severity: "warning" | "error"
  diagnosticCode: string
  message: string
}

export interface SpiceEngineAnalysisResult {
  engineName: string
  engineVersionString?: string
  simulationResultCircuitJson: unknown[]
  diagnostics: SpiceEngineDiagnostic[]
}

export interface LegacySpiceEngineSimulationResult {
  engineVersionString?: string
  simulationResultCircuitJson: unknown[]
}

export interface SpiceEngine {
  capabilities?: SpiceEngineCapabilities
  simulate(spiceString: string): Promise<LegacySpiceEngineSimulationResult>
  simulateAnalysis?(
    request: SpiceSimulationRequest,
  ): Promise<SpiceEngineAnalysisResult>
}
