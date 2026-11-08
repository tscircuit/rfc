import { Octal, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Octal name="TX" pcbX={-15} />
    <Octal name="RX" pcbX={15} />
    <Supply />
    <trace from=".TX > .D0" to=".RX > .D0" />
    <trace from=".TX > .D1" to=".RX > .D1" />
    <trace from=".TX > .D2" to=".RX > .D2" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* Run 1: real traffic. Every eye includes crosstalk from both neighbours. */}
    <signalintegrity name="TRAFFIC" bitRate="20Mbps">
      <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
      <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" />
      <signal name="D2" driver=".TX > .D2" receiver=".RX > .D2" />
    </signalintegrity>

    {/* Run 2: D1 held low. Any voltage on D1 is crosstalk only:
        near end (at .TX > .D1) = NEXT, far end (at .RX > .D1) = FEXT. */}
    <signalintegrity name="XTALK_LOW" bitRate="20Mbps">
      <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
      <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" quiet="low" />
      <signal name="D2" driver=".TX > .D2" receiver=".RX > .D2" />
    </signalintegrity>

    {/* Run 3: D1 held high. Noise now pushes a 1 towards a false 0. */}
    <signalintegrity name="XTALK_HIGH" bitRate="20Mbps">
      <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
      <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" quiet="high" />
      <signal name="D2" driver=".TX > .D2" receiver=".RX > .D2" />
    </signalintegrity>
  </board>
)
