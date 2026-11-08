# IBIS models used by the examples

`<signalintegrity>` cannot run without an IBIS model for every chip that drives
or receives a signal. The IBIS file is what tells the simulator how strongly a
pin drives, how fast its edges are, and how it loads the line.

The vendor files are **not** copied into this repository (vendor licence terms).
Download them and place them in this folder. Check the SHA-256 after download.

| File | Part | Download | `[Component]` | SHA-256 of the `.ibs` |
| --- | --- | --- | --- | --- |
| `sn74lvc1g04.ibs` | TI SN74LVC1G04 (single inverter, SC70-5 `DCK`) | https://www.ti.com/lit/zip/scem216c → `SN74LVC1G04_IBIS/sn74lvc1g04.ibs` | `LVC1G04_DCK` | `03033638d7fe8bf268428be133a5aad63aae0145980113561b20ab92063e2c00` |
| `sn65hvd72.ibs` | TI SN65HVD72 (3.3 V RS-485 transceiver, SOIC-8) | https://www.ti.com/lit/zip/sllm183 → `SN65HVD72_IBIS/sn65hvd72.ibs` | `SN65HVD72D` | `293f71f8d6c8764914a73564ebbb5b9e0e706d9dcc18d87aae91f1def06ca47e` |

Both files and the pin/model names used in the examples were checked against
the real files, and both parts were simulated end to end with the native
solvers during the review of this RFC.

The DDR example (`level4-ddr.tsx`) needs a memory controller IBIS file and a
DRAM IBIS file from those vendors. Its file names and model names are
placeholders; see the comments in that file.
