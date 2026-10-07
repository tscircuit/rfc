# PCB Channel Simulation Experiments and Reusable Recipes

**Status: Draft proposal.**

A PCB channel analysis needs more than a stackup: it needs selected copper,
ports, excitation, loading, a mesh, boundaries and solver settings. Users should
be able to reuse those settings, see the exact workload before starting, and
keep a reproducible record of what ran.

This RFC proposes an imported `<SimulationExperiment>` tag, a plain reusable
recipe and an explicit planner/runner. The initial recipe extracts a four-port
complex S-parameter channel from two supported traces. It does not configure an
eye simulation or qualify signal integrity. Rendering a board with the tag does
not launch a solver.

## Usage at a glance

Place the imported tag inside a board that already defines its geometry and
physical stackup:

```tsx
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
```

Two cases and two repetitions produce **four case runs**. At one frequency with
four independently excited ports, the native workload is **16 excitations**.
Frequency samples are work inside each case, not additional case declarations.
Identical repetitions are reruns, not convergence evidence.

The [complete sample](../assets/2026-10-07-simulation-experiment-recipes/experiment.tsx)
includes the recipe and a [synthetic two-trace board](../assets/2026-10-07-simulation-experiment-recipes/parallel-pair.tsx).
It uses explicit assumed material data, real endpoint pads and an actual bottom
copper pour. Its toy material constants are not manufacturer FR4 data.

Planning and execution are separate calls:

```tsx
import { createElement } from "react"
import { renderExperiments, runExperiments }
  from "circuit-json-crosstalk-simulation/experiments"
import Experiment, { limits } from "../assets/2026-10-07-simulation-experiment-recipes/experiment"

const plan = await renderExperiments(createElement(Experiment), { limits })

const result = await runExperiments(JSON.parse(JSON.stringify(plan)), {
  mode: "export",
  output_directory: "output/parallel-pair-export",
})
// Four input exports, zero native runs; numerical qualification not evaluated.
```

The import path is a proposed package entry point, not a currently published
package API. The complete sample can be checked against the local prototype.

## Reusable recipes

A recipe is a named, versioned, JSON-compatible object:

```ts
interface ChannelRecipe {
  name: string
  version: 1
  kind: "crosstalk_s_parameters"
  setup: Omit<AnalysisSetup,
    "trace_ids" | "reference_copper_id" | "reference_net_id">
}
```

`AnalysisSetup` supplies explicit port inset/resistance, frequencies, saved
fields, mesh, air padding, material-model choices, boundary conditions, solver
settings and raw matrix-check tolerances. Reuse a recipe by importing the plain
object; use a different recipe identity when its settings change. Factories,
callbacks, React children and nonfinite values are not recipe data. A host
progress callback may remain outside the serialized configuration.

The channel testbench uses four independent unit-incident-power excitations.
Other ports are matched to the case's explicit `port_resistance_ohms`. These
settings are consumed by the channel runner. Generic driver waveforms, seeds,
receiver loads and eye stimuli are unsupported rather than accepted and ignored.

Circuit JSON continues to own geometry, units and physical stackup quantities.
Simulation settings are separate. `stackup_fill`, when supplied, fills unknown
facts only; it cannot override known board data. Assumed fills remain marked
assumed, and the original owning Circuit JSON is retained.

## Geometry and port bindings

Each `traces` entry is either an exact `pcb_trace_id` or a `{from,to}` pair of
source-port selectors. After rendering, each selector must resolve uniquely to
an actual source port, the pair to one source trace, and that source trace to one
PCB trace. Missing or ambiguous matches fail before output or native work.

`reference` accepts either exact `{copper_id,net_id}` values or a uniquely matched
`{net_name,layer:"bottom"}` pour. A copper layer in the stackup is not a continuous
plane. The exporter must consume the real pour geometry and reject unsupported
holes, slots or other geometry instead of synthesizing a reference conductor.

For the initial straight-trace adapter, source endpoints are ordered by increasing
X:

| Palace port | Binding |
| --- | --- |
| P1 | First selected trace, left endpoint |
| P2 | First selected trace, right endpoint |
| P3 | Second selected trace, left endpoint |
| P4 | Second selected trace, right endpoint |

The manifest and human summary retain source-port/trace IDs, actual inset tap
coordinates and reference identities. Tuple order does not designate victim or
aggressor. Existing separate eye postprocessing drives victim P3 and opposing
aggressor P2 and observes P4; a future eye recipe must bind these roles explicitly
and supply driver/loading models that its runner actually consumes.

## Controlled cases and repetitions

Each case has a unique name and may override only `mesh`, `airPaddingMm`,
`frequencyHz` and `saveFieldsAtHz`. Omitting cases selects one `nominal` case;
omitting repetitions selects one run. The planner preserves declared case order,
then repetition order. It does not create implicit Cartesian products, retries,
adaptive cases or extra runs for quiet/switching waveform controls.

Every expanded case and the aggregate workload across all experiment tags must
preflight before any output or native work. Empty or duplicate cases, duplicate
experiment names, recipe-identity collisions, missing geometry and invalid
settings fail the whole plan, including errors in its final case.

The prototype requires explicit `max_case_runs` and `max_native_excitations`.
Its initial hard limits are 16 total case runs, 2048 frequency-by-port excitations,
eight cases per tag, four repetitions and 64 frequencies per case. These limits
are proposed defaults to discuss, not numerical adequacy criteria.

## Serialized plan and explicit runner

The imported functional tag returns null during ordinary Circuit rendering. An
explicit Bun/Node-host `renderExperiments` collects declarations during normal
core rendering, disables analog simulation for that compilation, then resolves
bindings and produces real Circuit JSON plus a package-local sidecar.

The sidecar is versioned JSON. It retains recipe identity, original selectors,
resolved IDs, exact rendered Circuit JSON/hash, original/effective stackup and
model assumptions, exact case setup, port mapping, repetition index and expected
frequency-by-port workload. Saved plans are revalidated before execution. No new
Circuit JSON `simulation_experiment` variant is proposed here.

`runExperiments` requires explicit `mode:"export"` or `mode:"native"`. Export
writes inputs only. Native execution requires explicit installed runtime paths,
an aggregate wall budget and bounded memory/disk settings. It reuses the existing
`prepare`/`run` and solver supervisor, executes cases serially, preserves shared
compute ownership and stops remaining cases after failure or cancellation.
Cancellation reaches the native supervisor and its child process group.

The prototype uses at most one MPI rank/thread, 600 seconds total/case wall time,
6 GiB memory and 8 GiB aggregate output disk. Each case receives the remaining
batch budget. Exclusive batch directories and generated run IDs prevent names
from escaping paths or overwriting earlier results.

Completion and qualification remain separate:

| Outcome | Native status | Numerical qualification |
| --- | --- | --- |
| Input export completed | Never run | Not evaluated |
| Native case and raw matrix checks completed | Passed | Not evaluated without separate adequacy evidence |
| Existing mesh/domain assessment failed | May still be passed | Failed |
| Cancellation or failure | Preserve actual attempted-case status | Preserve failed/unknown checks |

Raw complex matrices, frequencies, source inputs, logs and receipts remain saved.
A successful solve or repeated identical result cannot turn a failed or unknown
qualification into a pass.

## Compatibility and implementation status

The existing [SPICE analyses RFC](2026-07-20-analog-simulation-analyses-and-parameter-sweeps.md)
uses `analog.*simulation`, `analog.sweepparameter` and SPICE Circuit JSON records.
This proposal adds a package-local channel workflow without changing those tags,
core's intrinsic-element catalogue or the SPICE experiment schema.

Public prior work includes the [merged Gmsh/Palace channel and eye pipeline](https://github.com/tscircuit/circuit-json-crosstalk-simulation/pull/3)
and the [draft physical stackup schema](https://github.com/tscircuit/circuit-json/pull/871).
The new tag/planner/runner prototype remains local and unpublished. Locally, 25
unit/export tests, type checks and a four-case export passed. One separate real
integration case at 1 GHz completed four independent excitations. This verifies
the API-to-solver path, not SI accuracy or general-board support.

The prototype supports only a single two-layer board with two straight top-layer
traces, covered rectangular endpoint pads and one actual rectangular bottom
reference pour. Its sample uses
assumed constant Er/loss tangent, explicit PEC copper, omitted soldermask and
matched ports. Unsupported geometry fails; an arbitrary multilayer board is not
flattened into this fixture.

The public broadband eye study still has **failed full-complex-channel mesh
qualification**, despite native completion and provisional eye plots. The new
single-frequency integration smoke has **not evaluated** mesh/domain convergence.
Further controlled refinement solves remain unrun. This RFC provides no qualified
board eye, DDR margin, BER or routing-improvement claim. A defensible eye also
requires an adequate broadband channel plus driver, receiver/package, loading,
termination, interface-rate and stimulus assumptions.

## Alternatives and open questions

1. **Plain API without a TSX tag.** This is simpler for generated Circuit JSON,
   but separates the experiment declaration from the board authoring location.
   Should both forms be supported?
2. **Core intrinsic tag or a new Circuit JSON record.** Either could make discovery
   easier, but needs a shared non-SPICE contract. Start with the package-local
   sidecar, or standardize that contract first?
3. **Reuse `analog.sweepparameter`.** Its component/source sweeps and Cartesian
   products differ from named channel mesh/domain cases. Should a future common
   planner share bounded scheduling while preserving analysis-specific data?
4. **Names and units.** Keep the imported `SimulationExperiment` name and camelCase
   authoring overrides alongside reused snake_case setup fields, or introduce a
   typed channel-specific tag/unit-bearing authoring layer?
5. **Recipe identity and limits.** Is name plus version sufficient, and which
   workload/runtime limits should be configurable by a host?
6. **Numerical and eye extensions.** What explicit assessment links should associate
   mesh/domain comparisons with a channel, and what consumed model/port bindings
   must an eye recipe require? Identical repetitions alone remain insufficient.
