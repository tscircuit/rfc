import { Octal, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Octal name="TX" pcbX={-15} />
    <Octal name="RX" pcbX={15} />
    <Supply />
    <trace from=".TX > .D0" to=".RX > .D0" />
    <trace from=".TX > .D1" to=".RX > .D1" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* Both signals are extracted together: each eye includes crosstalk from the other. */}
    <signalintegrity name="SI" bitRate="20Mbps">
      <signal name="D0" driver=".TX > .D0" receiver=".RX > .D0" />
      <signal name="D1" driver=".TX > .D1" receiver=".RX > .D1" />
    </signalintegrity>
  </board>
)
