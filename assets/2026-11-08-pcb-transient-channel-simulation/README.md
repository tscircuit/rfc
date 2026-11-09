# Examples: `<simulation.pcbtransientchannelsimulation>` and `<simulation.pcbchannel>`

The `<simulation.pcbtransientchannelsimulation>` block describes the test. Everything else is the board.

| File | Level |
| --- | --- |
| `level1-single-ended-channel.tsx` | 1: one single-ended channel |
| `level1-differential-channel.tsx` | 1: one differential channel (RS-485 with 120 Ω termination) |
| `level2-two-channels.tsx` | 2: two coupled channels |
| `level3-three-channels.tsx` | 3: all switching, and a quiet victim for crosstalk |
| `level4-ddr3-write.tsx` | 4: AM335x → Winbond DDR3 DQ0–DQ7 + DQS/DQS# write illustration; blocked by coupled package support |
| `parts.tsx` | shared inverter and transceiver IBIS declarations |

Every endpoint has a real IBIS model. Ideal rails come from each selected
model; no voltage source is needed. Unlisted Output-only pins drive low.
`quiet="off"` is an error on the non-disableable inverter outputs.

Level 3 preserves PRBS phases across traffic and quiet runs. Quiet victims
report signed noise peaks at each end, with no eye.

Level 4 uses physical BGA ball coordinates and per-leg DQS models at 1.5 V
(`typical`). The half-UI DQS offset centre-aligns transmitted write sampling.
The 10/45 ps setup/hold limits reuse the DDR3-1600 base values from
[Winbond A03, Table 54, p. 158](https://media.digikey.com/pdf/Data%20Sheets/Winbond%20PDFs/W631GG6MB_A03.pdf#page=158),
without slew derating or separate AC/DC checks. This is a write-direction
illustration, not JEDEC compliance or a complete memory-system board.
It currently stops with
`.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`

These are proposed-contract examples, not verified native pipeline runs.
The sibling PRs still need the contract fixes. Extracted PDN, coupled packages,
branched routed graphs and native DDR validation remain unimplemented.
