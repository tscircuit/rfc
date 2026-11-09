# IBIS models used by the examples

`<simulation.pcbtransientchannelsimulation>` cannot run without an IBIS model for every chip that drives
or receives a signal. The IBIS file is what tells the simulator how strongly a
pin drives, how fast its edges are, and how it loads the line.

The vendor files are **not** copied into this repository (vendor licence terms).
Download them and place them in this folder. Check the SHA-256 after download.

| File | Part | Download | `[Component]` | SHA-256 of the `.ibs` |
| --- | --- | --- | --- | --- |
| `sn74lvc1g04.ibs` | TI SN74LVC1G04DBV (single inverter, SOT-23-5 `DBV`) | https://www.ti.com/lit/zip/scem216c → `SN74LVC1G04_IBIS/sn74lvc1g04.ibs` | `LVC1G04_DBV` | `03033638d7fe8bf268428be133a5aad63aae0145980113561b20ab92063e2c00` |
| `sn65hvd72.ibs` | TI SN65HVD72 (3.3 V RS-485 transceiver, SOIC-8) | https://www.ti.com/lit/zip/sllm183 → `SN65HVD72_IBIS/sn65hvd72.ibs` | `SN65HVD72D` | `293f71f8d6c8764914a73564ebbb5b9e0e706d9dcc18d87aae91f1def06ca47e` |
| `sprm552c.ibs` | TI AM335x ZCZ controller | https://www.ti.com/lit/zip/sprm552 → `sprm552c.ibs` | `am335x_zcz` | `23011a68eb8ff35562615b5b108edcb9f017c5e61f4f68e32f35c5fb88f163be` |
| `W631GG6MB-12.ibs` | Winbond W631GG6MB-12 DDR3 | https://www.winbond.com/resource-files/w631gg6mb_ibis.zip → `W631GG6MB-12.ibs` | `W631GG6MB-12` | `f2c0f36e24be68fd95a05f34ca4ab875ac5145f1956c5696e9a60b0d8a03e859` |

The examples select these real pins and models:

| Component | Physical pins | Selected models |
| --- | --- | --- |
| `LVC1G04_DBV` (`sot23_5`) | 1=NC, 2=A, 3=GND, 4=Y, 5=VCC | 2=`LVC1G04_IN_33`, 4=`LVC1G04_OUT_33` |
| `SN65HVD72D` (`soic8`) | 1=R, 2=_RE (board label RE), 3=DE, 4=D, 5=GND, 6=A, 7=B, 8=VCC | 1=`rpin`, 2/4=`d_re`, 3=`de`, 6=`a_b_p`, 7=`a_b_n` |

The SN65HVD72 `[Diff_pin]` entry pairs 6 (P) with 7 (N) and gives `vdiff=0.2V`.
Its differential mask is +0.2 V / -0.2 V. The A/B models' 2.0 V / 0.8 V
single-ended thresholds are not differential thresholds. Both files supply
3.3 / 3.0 / 3.6 V rails at typ/min/max for the selected models.

Level 4 uses these write-direction pins. All DQ controller balls use
`Selector_11` / `Model_257` (3-state). All memory balls use `DQ` / `ODT_off`
(Input). Controller DQS P/N use `Selector_1` / `Model_579` and `Selector_6` /
`Model_771` (3-state), selected per leg on the endpoint.

| Signal | AM335x ball | Winbond ball |
| --- | --- | --- |
| DQ0 | M3 | E3 |
| DQ1 | M4 | F7 |
| DQ2 | N1 | F2 |
| DQ3 | N2 | F8 |
| DQ4 | N3 | H3 |
| DQ5 | N4 | H8 |
| DQ6 | P3 | G2 |
| DQ7 | P4 | H7 |
| DQS (P) | P1 | F3 |
| DQS# (N) | P2 | G3 |

Both pairs occur in `[Diff_pin]`. `DQSL_N` is the board alias for `DQSL#`.
Representative rail balls are CPU E5=`VDDS_DDR`, A1=`VSS`; memory A1=`VDDQ`,
B1=`VSSQ`. All selected buffers use 1.5 V at `typ`. Min/max rails differ
(AM335x 1.35/1.65 V, Winbond 1.425/1.575 V); shared references must reject
those conflicting corners.

Footprinter's `pinnumbering(ballcoords)` preserves JEDEC ball names. The CPU
uses the 18×18, 0.8 mm-pitch ZCZ layout
([TI ZCZ0324A drawing](https://www.ti.com/lit/ds/symlink/am3352.pdf#page=260)).
The memory uses the 16×9 window layout, columns 4–6 absent, at 0.8 mm pitch
([Winbond A03, §11](https://media.digikey.com/pdf/Data%20Sheets/Winbond%20PDFs/W631GG6MB_A03.pdf#page=160)).
Both use 0.4 mm pads. Only the illustrated lane and representative rails
have signal aliases; all other balls retain their physical coordinates.

The pin tables, selector membership and file hashes were checked against the
vendor files. No files are redistributed. Level 4 currently stops at AM335x's
coupled `[Package Model]` error; these checks establish neither autorouting
nor native SI or JEDEC compliance.
