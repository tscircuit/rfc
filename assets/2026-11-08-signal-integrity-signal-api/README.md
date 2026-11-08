# Examples: `<signalintegrity>` and `<signal>`

The `<signalintegrity>` block describes the test. Everything else is the board.

| File | Level |
| --- | --- |
| `level1-single-ended.tsx` | 1: one single-ended signal |
| `level1-differential.tsx` | 1: one differential signal (RS-485 with 120 Ω termination) |
| `level2-two-signals.tsx` | 2: two coupled signals |
| `level3-three-signals.tsx` | 3: all switching, and a quiet victim for crosstalk |
| `level4-ddr.tsx` | 4: generic strobe setup/hold with real TI buffers; no DDR validation |
| `parts.tsx` | shared inverter and transceiver IBIS declarations |
| `models/README.md` | vendor downloads, package/pin/model choices and SHA-256 |

Every endpoint has an IBIS model. All examples use the real TI files listed
below, including Level 4. They need no `<voltagesource>`: ideal rails come from
each selected model at the test corner. An unlisted Output-only pin such as
an inverter's Y drives steady low; list it as a quiet signal to change that
level. `quiet="off"` is an error on these non-disableable inverter outputs.

Level 3 keeps the same PRBS phases across traffic and quiet runs. Quiet
victims report signed noise peaks at each end, with no eye.

Level 4 uses the SN65HVD72's R output and D input as independent IBIS buffers,
with A/B as the strobe pair. It does not simulate the transceiver's internal
logic. Each data receiver shares a chip with its strobe receiver. The strobe
has a half-UI offset; the 100 ns setup/hold limits are illustrative. The file
name preserves the learning progression, but this is not a DDR device test.
Separate AC/DC thresholds and JEDEC checks remain outside this generic API.

These are proposed-contract examples. Pin/model and source checks do not
establish a working native pipeline. The implementation PRs still need the
review fixes; extracted PDN, coupled package matrices, branched routed graphs
and native DDR device validation are not implemented yet.
