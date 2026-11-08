// LEVEL 2: two signals.
//
// In the lab: two traces run side by side, like two lines of a data bus. Each
// can be tested alone exactly like Level 1. The new effect is crosstalk: when
// one trace switches, its electric and magnetic fields push a small voltage
// onto its neighbour.
//
// In code: add a second <signal>. Every signal in a block is extracted together,
// so the coupling (mutual inductance and capacitance) between them is included.
import { Octal, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Octal name="TX" pcbX={-15} />
    <Octal name="RX" pcbX={15} />
    <Supply />
    {/* Two parallel traces. The closer they are, the stronger the crosstalk. */}
    <trace from=".TX > .D0" to=".RX > .D0" />
    <trace from=".TX > .D1" to=".RX > .D1" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* Both signals switch at the same time. Each one gets a different PRBS seed (taken from
        its name), so their bits are not identical, like real traffic.
        Results: one eye per signal. Compare with Level 1: any extra eye closure is the
        cost of crosstalk from the neighbour. */}
    <signalintegrity name="SI" bitRate="20Mbps">
      <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
      <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" />
    </signalintegrity>
  </board>
)
