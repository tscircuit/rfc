// LEVEL 4: real TI buffers illustrate generic strobe timing, not DDR validation.
import { sn65hvd72, transceiverPins } from "./parts"

export default () => (
  <board width="60mm" height="30mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <chip name="TX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={-25} pinLabels={transceiverPins} />
    <chip name="RX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={20} pinLabels={transceiverPins} />
    <ibismodel componentRef=".TX" {...sn65hvd72} />
    <ibismodel componentRef=".RX" {...sn65hvd72} />

    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    <trace from=".TX > .GND" to="net.GND" />
    <trace from=".RX > .GND" to="net.GND" />
    <trace from=".TX > .R" to=".RX > .D" />
    <trace from=".RX > .R" to=".TX > .D" />
    <trace from=".TX > .A" to=".RX > .A" />
    <trace from=".TX > .B" to=".RX > .B" />
    <differentialpair positiveConnection=".TX > .A" negativeConnection=".TX > .B" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    <signalintegrity name="FORWARD" bitRate="250kbps">
      <signal
        name="STROBE"
        driver={{ p: ".TX > .A", n: ".TX > .B" }}
        receiver={{ p: ".RX > .A", n: ".RX > .B" }}
        pattern="clock"
        offset="0.5UI"
      />
      <signal
        name="DATA"
        driver=".TX > .R"
        receiver=".RX > .D"
        strobe="STROBE"
        mask={{ setup: "100ns", hold: "100ns" }}
      />
    </signalintegrity>

    <signalintegrity name="REVERSE" bitRate="250kbps">
      <signal
        name="STROBE"
        driver={{ p: ".RX > .A", n: ".RX > .B" }}
        receiver={{ p: ".TX > .A", n: ".TX > .B" }}
        pattern="clock"
        offset="0.5UI"
      />
      <signal
        name="DATA"
        driver=".RX > .R"
        receiver=".TX > .D"
        strobe="STROBE"
        mask={{ setup: "100ns", hold: "100ns" }}
      />
    </signalintegrity>
  </board>
)
