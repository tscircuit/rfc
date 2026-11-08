// LEVEL 1 (differential): one differential signal. Still ONE signal.
//
// In the lab: an RS-485 bus uses two wires, A and B, carrying opposite copies
// of the same data. The receiver only looks at the difference A − B, so noise
// that hits both wires equally cancels out. You measure it with a
// differential probe across A and B.
//
// In code: one <signal> whose endpoints are { p, n } pairs instead of single
// pins. tscircuit drives the two legs with complementary bits and measures
// P − N at the receiver.
import { Rs485, Supply } from "./parts"

export default () => (
  <board width="60mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    <Rs485 name="TX" pcbX={-25} />
    <Rs485 name="RX" pcbX={20} />
    {/* The 120 Ω termination resistor across A and B at the receiver end. It stops the
        signal reflecting back from the end of the line. It is a normal part on the
        signal's copper, so it is simulated automatically: no termination prop. */}
    <resistor name="RTERM" resistance="120" footprint="0603" pcbX={26} />
    <Supply />
    <trace from=".TX > .A" to=".RX > .A" />
    <trace from=".TX > .B" to=".RX > .B" />
    <trace from=".RX > .A" to=".RTERM > .pin1" />
    <trace from=".RX > .B" to=".RTERM > .pin2" />
    {/* Tells the router that A and B are routed together as a pair. */}
    <differentialpair positiveConnection=".TX > .A" negativeConnection=".TX > .B" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* 250 kbit/s: each bit lasts 4 µs. Results: the differential (A − B) waveform and eye
        at the receiver. */}
    <signalintegrity name="SI" bitRate="250kbps">
      <signal
        name="BUS"
        // p = the positive (true) leg, n = the negative (inverted) leg.
        driver={{ p: ".TX > .A", n: ".TX > .B" }}
        receiver={{ p: ".RX > .A", n: ".RX > .B" }}
      />
    </signalintegrity>
  </board>
)
