import { Rs485, Supply } from "./parts"

export default () => (
  <board width="60mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Rs485 name="TX" pcbX={-25} />
    <Rs485 name="RX" pcbX={20} />
    {/* Termination is a normal part. It is on the signal's copper, so it is simulated. */}
    <resistor name="RTERM" resistance="120" footprint="0603" pcbX={26} />
    <Supply />
    <trace from=".TX > .A" to=".RX > .A" />
    <trace from=".TX > .B" to=".RX > .B" />
    <trace from=".RX > .A" to=".RTERM > .pin1" />
    <trace from=".RX > .B" to=".RTERM > .pin2" />
    <differentialpair positiveConnection=".TX > .A" negativeConnection=".TX > .B" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    <signalintegrity name="SI" bitRate="250kbps">
      <signal
        name="BUS"
        driver={{ p: ".TX > .A", n: ".TX > .B" }}
        receiver={{ p: ".RX > .A", n: ".RX > .B" }}
      />
    </signalintegrity>
  </board>
)
