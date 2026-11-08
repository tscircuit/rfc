# Examples: `<signalintegrity>` and `<signal>`

One file per level of the RFC. The simulation part of each board is only the
`<signalintegrity>` block. Everything else is the normal board.

| File | Level |
| --- | --- |
| `level1-single-ended.tsx` | 1: one single-ended signal |
| `level1-differential.tsx` | 1: one differential signal (RS-485 with 120 Ω termination) |
| `level2-two-signals.tsx` | 2: two coupled signals |
| `level3-three-signals.tsx` | 3: all switching, and a quiet victim for crosstalk |
| `level4-ddr.tsx` | 4: DDR write and read with strobe and setup/hold |
| `parts.tsx` | the inverter chip with its `<ibismodel>`, shared by Levels 2 and 3 |
| `models/README.md` | where to download the IBIS files, and their SHA-256 |

Every chip that drives or receives a signal has an `<ibismodel>`. The test
cannot run without one. Levels 1–3 use real TI IBIS files (SN74LVC1G04 and
SN65HVD72) with pin and model names checked against the files; Level 4 uses
placeholder DDR models.

These use the proposed elements. They will not type-check until the RFC is
implemented.
