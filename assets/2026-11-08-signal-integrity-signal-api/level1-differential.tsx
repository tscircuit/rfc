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
    <chip name="TX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={-25} pinLabels={pins} />
    <chip name="RX" manufacturerPartNumber="SN65HVD72D" footprint="soic8" pcbX={20} pinLabels={pins} />
    <ibismodel componentRef=".TX" {...sn65hvd72} />
    <ibismodel componentRef=".RX" {...sn65hvd72} />

    <resistor name="RTERM" resistance="120" footprint="0603" pcbX={26} />

    <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    <trace from=".TX > .GND" to="net.GND" />
    <trace from=".RX > .GND" to="net.GND" />

    <trace from=".TX > .A" to=".RX > .A" />
    <trace from=".TX > .B" to=".RX > .B" />
    <trace from=".RX > .A" to=".RTERM > .pin1" />
    <trace from=".RX > .B" to=".RTERM > .pin2" />
    <differentialpair positiveConnection=".TX > .A" negativeConnection=".TX > .B" />
    <copperpour connectsTo="net.GND" layer="bottom" />

    <signalintegrity bitRate="250kbps">
      <signal
        name="BUS"
        driver={{ p: ".TX > .A", n: ".TX > .B" }}
        receiver={{ p: ".RX > .A", n: ".RX > .B" }}
      />
    </signalintegrity>
  </board>
)
