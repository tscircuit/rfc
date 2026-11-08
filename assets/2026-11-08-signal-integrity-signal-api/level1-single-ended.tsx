import { Octal, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Octal name="TX" pcbX={-15} />
    <Octal name="RX" pcbX={15} />
    <Supply />
    <trace from=".TX > .D0" to=".RX > .D0" />
    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    <signalintegrity name="SI" bitRate="20Mbps">
      <signal name="DATA" driver=".TX > .D0" receiver=".RX > .D0" />
    </signalintegrity>
  </board>
)
