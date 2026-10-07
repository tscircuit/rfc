// Proposed package entry point; the tag API is currently a local prototype.
import {
  SimulationExperiment,
  type ChannelRecipe,
} from "circuit-json-crosstalk-simulation/experiments"
import { CoupledRoutes } from "./parallel-pair"

/** Plain reusable settings; physical material data lives on the board fixture. */
export const parallelChannel: ChannelRecipe = {
  name: "parallel-channel",
  version: 1,
  kind: "crosstalk_s_parameters",
  setup: {
    conductor_model: "pec",
    dielectric_model: "constant_er_and_loss_tangent",
    relative_permeability: 1,
    soldermask: "omitted",
    port_inset_mm: 0.4,
    port_resistance_ohms: 50,
    frequency_hz: [1e9],
    save_fields_at_hz: [1e9],
    air_padding_mm: 1,
    mesh: { near_mm: 0.08, far_mm: 0.6, transition_mm: 0.4 },
    boundary: "first_order_absorbing",
    solver: { order: 1, type: "SuperLU", tolerance: 1e-9, max_iterations: 200 },
    checks: { passivity_tolerance: 1e-4, reciprocity_tolerance: 1e-4 },
  },
}

export const limits = { max_case_runs: 4, max_native_excitations: 16 }

export default function Experiment() {
  return (
    <CoupledRoutes gap={0.3}>
      <SimulationExperiment
        name="parallel-pair"
        recipe={parallelChannel}
        traces={[
          { from: ".U1 > .SIGNAL", to: ".U3 > .SIGNAL" },
          { from: ".U2 > .SIGNAL", to: ".U4 > .SIGNAL" },
        ]}
        reference={{ net_name: "GND", layer: "bottom" }}
        cases={[
          { name: "nominal" },
          {
            name: "fine",
            mesh: { near_mm: 0.06, far_mm: 0.6, transition_mm: 0.4 },
          },
        ]}
        repetitions={2}
      />
    </CoupledRoutes>
  )
}
