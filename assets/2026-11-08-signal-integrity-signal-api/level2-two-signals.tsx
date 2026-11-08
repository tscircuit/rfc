// LEVEL 2: two signals.
//
// In the lab: two traces run side by side, like two lines of a data bus. Each
// can be tested alone exactly like Level 1. The new effect is crosstalk: when
// one trace switches, its electric and magnetic fields push a small voltage
// onto its neighbour.
//
// In code: add a second <signal>. Every signal in a block is extracted together,
// so the coupling (mutual inductance and capacitance) between them is included.
//
// The chips are the same SN74LVC1G04 inverters as Level 1, with the same
// <ibismodel>, packaged as <Inverter> in parts.tsx. One driver and one receiver
// per signal.
import { Inverter, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    {/* Drivers on the left, receivers on the right. Each includes its <ibismodel>. */}
    <Inverter name="TX0" pcbX={-15} pcbY={2} />
    <Inverter name="TX1" pcbX={-15} pcbY={-2} />
    <Inverter name="RX0" pcbX={15} pcbY={2} />
    <Inverter name="RX1" pcbX={15} pcbY={-2} />
    <Supply />

    {/* Two parallel traces. The closer they are, the stronger the crosstalk. */}
    <trace from=".TX0 > .Y" to=".RX0 > .A" />
    <trace from=".TX1 > .Y" to=".RX1 > .A" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* Both signals switch at the same time. Each one gets a different PRBS seed (taken from
        its name), so their bits are not identical, like real traffic.
        Results: one eye per signal. Compare with Level 1: any extra eye closure is the
        cost of crosstalk from the neighbour. */}
    <signalintegrity name="SI" bitRate="20Mbps">
      <signal name="D0" driver=".TX0 > .Y" receiver=".RX0 > .A" />
      <signal name="D1" driver=".TX1 > .Y" receiver=".RX1 > .A" />
    </signalintegrity>
  </board>
)
