# Examples: `<signalintegrity.simulation>` and `<signalintegrity.signal>`

The `<signalintegrity.simulation>` block describes the test. Everything else is the board.

| File | Level |
| --- | --- |
| `level1-single-ended.tsx` | 1: one single-ended signal |
| `level1-differential.tsx` | 1: one differential signal (RS-485 with 120 Ω termination) |
| `level2-two-signals.tsx` | 2: two coupled signals |
| `level3-three-signals.tsx` | 3: all switching, and a quiet victim for crosstalk |
| `level4-ddr3-write.tsx` | 4: AM335x → Winbond DDR3 DQ0–DQ7 + DQS/DQS# write illustration; blocked by coupled package support |
| `parts.tsx` | shared inverter and transceiver IBIS declarations |
| `models/README.md` | vendor downloads, package/pin/model choices and SHA-256 |

Every endpoint has a real IBIS model. Ideal rails come from each selected
model; no voltage source is needed. Unlisted Output-only pins drive low.
`quiet="off"` is an error on the non-disableable inverter outputs.

Level 3 preserves PRBS phases across traffic and quiet runs. Quiet victims
report signed noise peaks at each end, with no eye.

Level 4 uses physical BGA ball coordinates and per-leg DQS models at 1.5 V
(`typ`). The half-UI DQS offset centre-aligns transmitted write sampling.
The 10/45 ps setup/hold limits reuse the DDR3-1600 base values from
[Winbond A03, Table 54, p. 158](https://media.digikey.com/pdf/Data%20Sheets/Winbond%20PDFs/W631GG6MB_A03.pdf#page=158),
without slew derating or separate AC/DC checks. This is a write-direction
illustration, not JEDEC compliance or a complete memory-system board.
It currently stops with
`.CPU: coupled [Package Model] not implemented yet; scalar fallback is forbidden.`

These are proposed-contract examples, not verified native pipeline runs.
The sibling PRs still need the contract fixes. Extracted PDN, coupled packages,
branched routed graphs and native DDR validation remain unimplemented.

Run the review's threshold, strobe and finite-return contract vectors with:

```sh
python3 assets/2026-11-08-signal-integrity-signal-api/check-review.py /path/to/ibis-corpus
```

The script reads the external Micron `gh/gh_micron_u48b.ibs`, Winbond
`w631gg6mb_ibis.zip/W631GG6MB-12.ibs` and TI `sprm552/sprm552c.ibs` under
`ibis-corpus/x/`. It executes no corpus content. These are mathematical
contract checks, not updated pipeline or native solver results.
