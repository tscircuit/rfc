# IBIS models used by the examples

`<signalintegrity>` cannot run without an IBIS model for every chip that drives
or receives a signal. The IBIS file is what tells the simulator how strongly a
pin drives, how fast its edges are, and how it loads the line.

The vendor files are **not** copied into this repository (vendor licence terms).
Download them and place them in this folder. Check the SHA-256 after download.

| File | Part | Download | `[Component]` | SHA-256 of the `.ibs` |
| --- | --- | --- | --- | --- |
| `sn74lvc1g04.ibs` | TI SN74LVC1G04DBV (single inverter, SOT-23-5 `DBV`) | https://www.ti.com/lit/zip/scem216c → `SN74LVC1G04_IBIS/sn74lvc1g04.ibs` | `LVC1G04_DBV` | `03033638d7fe8bf268428be133a5aad63aae0145980113561b20ab92063e2c00` |
| `sn65hvd72.ibs` | TI SN65HVD72 (3.3 V RS-485 transceiver, SOIC-8) | https://www.ti.com/lit/zip/sllm183 → `SN65HVD72_IBIS/sn65hvd72.ibs` | `SN65HVD72D` | `293f71f8d6c8764914a73564ebbb5b9e0e706d9dcc18d87aae91f1def06ca47e` |

The examples select these real pins and models:

| Component | Physical pins | Selected models |
| --- | --- | --- |
| `LVC1G04_DBV` (`sot23_5`) | 1=NC, 2=A, 3=GND, 4=Y, 5=VCC | 2=`LVC1G04_IN_33`, 4=`LVC1G04_OUT_33` |
| `SN65HVD72D` (`soic8`) | 1=R, 2=_RE (board label RE), 3=DE, 4=D, 5=GND, 6=A, 7=B, 8=VCC | 1=`rpin`, 2/4=`d_re`, 3=`de`, 6=`a_b_p`, 7=`a_b_n` |

The SN65HVD72 `[Diff_pin]` entry pairs 6 (P) with 7 (N) and gives `vdiff=0.2V`.
Its differential mask is +0.2 V / -0.2 V. The A/B models' 2.0 V / 0.8 V
single-ended thresholds are not differential thresholds. Both files supply
3.3 / 3.0 / 3.6 V rails at typ/min/max for the selected models.

The pin tables, selector membership and file hashes were checked against the
vendor files. This does not validate autorouting or native SI results for
these assets. Level 4 uses the same SN65HVD72 file for a generic strobe test;
there are no placeholder DDR files or claimed DDR device results.
