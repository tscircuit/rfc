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
//
// Model file: TI sn65hvd72.ibs, see models/README.md. The IBIS file itself
// declares A and B as a pair ([Diff_pin] 6 / 7, 0.2 V receiver threshold), so
// tscircuit can check that p and n are not swapped.

const sn65hvd72 = {
  ibisModelAsset: {
    project_relative_path: "models/sn65hvd72.ibs",
    url: "./models/sn65hvd72.ibs",
    mimetype: "text/plain",
  },
  ibisComponentName: "SN65HVD72D",
  ibisPinNameToPortLabel: { "5": "GND", "6": "A", "7": "B", "8": "VCC" },
  // a_b_p / a_b_n are the bus pins' I/O models: the same pin can drive or receive.
  // The logic pins (D, DE, RE, R) are not mapped: the test drives the A/B bus buffer
  // directly, the way a pattern generator would.
  ibisPinNameToModelName: { "6": "a_b_p", "7": "a_b_n" },
  ibisPinNameToReferencePortLabels: {
    "6": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
    "7": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
  },
  includePackageParasitics: true,
}
const pins = { pin1: "R", pin2: "RE", pin3: "DE", pin4: "D", pin5: "GND", pin6: "A", pin7: "B", pin8: "VCC" }

export default () => (
  <board width="60mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    {/* Two RS-485 transceivers. The same chip is used at both ends; the <signal>
        decides which one drives. */}
    <chip name="TX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={-25} pinLabels={pins} />
    <chip name="RX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={20} pinLabels={pins} />
    <ibismodel componentRef=".TX" {...sn65hvd72} />
    <ibismodel componentRef=".RX" {...sn65hvd72} />

    {/* The 120 Ω termination resistor across A and B at the receiver end. It stops the
        signal reflecting back from the end of the line. It is a normal part on the
        signal's copper, so it is simulated automatically: no termination prop. */}
    <resistor name="RTERM" resistance="120" footprint="0603" pcbX={26} />

    <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    <trace from=".TX > .GND" to="net.GND" />
    <trace from=".RX > .GND" to="net.GND" />

    {/* The pair under test, and the termination at the far end. */}
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
