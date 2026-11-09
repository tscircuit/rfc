# Examples: `<simulation.pcbtransientchannelsimulation>` and `<simulation.pcbchannel>`

Each level keeps its board source, PCB snapshot and simulation CSV together.

| Source | Level and waveforms |
| --- | --- |
| [level1-single-ended.tsx](level1-single-ended/level1-single-ended.tsx) | 1: one receiver waveform |
| [level1-differential.tsx](level1-differential/level1-differential.tsx) | 1: one P−N receiver waveform (RS-485 with 120 Ω termination) |
| [level2-two-channels.tsx](level2-two-channels/level2-two-channels.tsx) | 2: two coupled receiver waveforms |
| [level3-three-channels.tsx](level3-three-channels/level3-three-channels.tsx) | 3: three receiver waveforms; quiet runs also record the victim's near end and idle levels |
| [level4-ddr3-write.tsx](level4-ddr3-write/level4-ddr3-write.tsx) | 4: eight DQ receiver waveforms and one P−N DQS waveform; requires coupled package support |
| [parts.tsx](parts.tsx) | shared inverter and transceiver IBIS declarations |

PCB snapshots (`<level>/<level>.png`) and simulation CSVs
(`<level>/simoutput.csv`) will be generated alongside the TSX in a later step.
IBIS assets resolve from each run's project root under `models/`.

Every endpoint has a real IBIS model. Ideal die rails come from each selected
model; package parasitics remain between the die and PCB pins. Unlisted
Output-only pins drive low. `quiet="off"` is an error on the inverter outputs.
Level 3 preserves PRBS phases across traffic and quiet runs.

Level 4 uses physical BGA ball coordinates and per-leg DQS models at 1.5 V
(`typical`), with a half-UI DQS offset. It currently requires coupled package
support: `.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`
