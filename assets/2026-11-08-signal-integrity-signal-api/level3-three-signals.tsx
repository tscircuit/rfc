// LEVEL 3: three signals, and measuring crosstalk on its own.
//
// In the lab: with three traces side by side, the middle one is hit from both
// sides. Engineers run two kinds of test:
//   1. all lines switching (real traffic): does every eye still open?
//   2. the classic crosstalk test: switch the outer lines ("aggressors") and
//      hold the middle line ("victim") at a steady level. The victim should be
//      flat, so every spike on it is crosstalk. Probe it at both ends:
//        - near end (next to the driver) shows NEXT, near-end crosstalk
//        - far end (at the receiver) shows FEXT, far-end crosstalk
//
// In code: same board, three <signalintegrity> blocks. Each block is an
// independent run. The only difference between them is the quiet prop on D1.
//
// Chips: the SN74LVC1G04 inverters from parts.tsx, each with its <ibismodel>.
// Their Y pin uses an Output IBIS model. Output models can be held low or high,
// but have no disabled state, so quiet="off" would be an error on these chips.
import { Inverter, Supply } from "./parts"

export default () => (
  <board width="40mm" height="24mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Inverter name="TX0" pcbX={-15} pcbY={4} />
    <Inverter name="TX1" pcbX={-15} pcbY={0} />
    <Inverter name="TX2" pcbX={-15} pcbY={-4} />
    <Inverter name="RX0" pcbX={15} pcbY={4} />
    <Inverter name="RX1" pcbX={15} pcbY={0} />
    <Inverter name="RX2" pcbX={15} pcbY={-4} />
    <Supply />

    {/* Three parallel traces. D1 is in the middle, between D0 and D2. */}
    <trace from=".TX0 > .Y" to=".RX0 > .A" />
    <trace from=".TX1 > .Y" to=".RX1 > .A" />
    <trace from=".TX2 > .Y" to=".RX2 > .A" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* Run 1: real traffic. All three send data. Result: three eyes, each including
        crosstalk from its neighbours. D1, in the middle, is usually the worst. */}
    <signalintegrity name="TRAFFIC" bitRate="20Mbps">
      <signal name="D0" driver=".TX0 > .Y" receiver=".RX0 > .A" />
      <signal name="D1" driver=".TX1 > .Y" receiver=".RX1 > .A" />
      <signal name="D2" driver=".TX2 > .Y" receiver=".RX2 > .A" />
    </signalintegrity>

    {/* Run 2: D1 is the victim, held at logic 0. D1 is NOT removed: it is still on the board
        and still coupled. Its driver just holds it steady, so any voltage that appears on it
        comes from D0 and D2. The danger at 0 is a spike pushing it up to a false 1.
        Results for D1: near-end waveform (at .TX1 > .Y) = NEXT, far-end waveform
        (at .RX1 > .A) = FEXT, and their peak values in volts. D1 has no eye. */}
    <signalintegrity name="XTALK_LOW" bitRate="20Mbps">
      <signal name="D0" driver=".TX0 > .Y" receiver=".RX0 > .A" />
      <signal name="D1" driver=".TX1 > .Y" receiver=".RX1 > .A" quiet="low" />
      <signal name="D2" driver=".TX2 > .Y" receiver=".RX2 > .A" />
    </signalintegrity>

    {/* Run 3: the same test with D1 held at logic 1. The driver's pull-up transistor holds
        the line now, and the danger is a dip pulling it down to a false 0. The results
        differ from run 2, which is why quiet must say "low" or "high". */}
    <signalintegrity name="XTALK_HIGH" bitRate="20Mbps">
      <signal name="D0" driver=".TX0 > .Y" receiver=".RX0 > .A" />
      <signal name="D1" driver=".TX1 > .Y" receiver=".RX1 > .A" quiet="high" />
      <signal name="D2" driver=".TX2 > .Y" receiver=".RX2 > .A" />
    </signalintegrity>
  </board>
)
