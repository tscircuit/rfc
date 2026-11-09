# Examples: `<simulation.pcbtransientchannelsimulation>` and `<simulation.pcbchannel>`

The `<simulation.pcbtransientchannelsimulation>` block describes the test.
It records voltage-vs-time waveforms; everything else is the board.

| File | Level and waveforms |
| --- | --- |
| `level1-single-ended-channel.tsx` | 1: one receiver waveform |
| `level1-differential-channel.tsx` | 1: one P−N receiver waveform (RS-485 with 120 Ω termination) |
| `level2-two-channels.tsx` | 2: two coupled receiver waveforms |
| `level3-three-channels.tsx` | 3: three receiver waveforms; quiet runs also record the victim's near end and idle levels |
| `level4-ddr3-write.tsx` | 4: eight DQ receiver waveforms and one P−N DQS waveform; blocked by coupled package support |
| `parts.tsx` | shared inverter and transceiver IBIS declarations |

Every endpoint has a real IBIS model. Ideal rails come from each selected
model; no voltage source is needed. Unlisted Output-only pins drive low.
`quiet="off"` is an error on the non-disableable inverter outputs.

Level 3 preserves PRBS phases across runs. `TRAFFIC` gives three receiver
waveforms. `XTALK_LOW` and `XTALK_HIGH` also record quiet D1's near-end
waveform, with an undisturbed idle voltage on each of D1's near/far waveforms.

Level 4 uses physical BGA ball coordinates and per-leg DQS models at 1.5 V
(`typical`). The half-UI DQS offset centre-aligns the transmitted write strobe.
This is a DQ0–DQ7 + DQS/DQS# write-direction
illustration, not JEDEC compliance or a complete memory-system board.
It currently stops with
`.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`

These are proposed-contract examples, not verified native pipeline runs.
The sibling PRs still need the contract fixes. Extracted PDN, coupled packages,
branched routed graphs and native DDR validation remain unimplemented.
