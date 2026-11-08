// LEVEL 1: one single-ended signal.
//
// In the lab: one driver chip sends bits down one copper trace to a receiver
// chip. You put a scope probe on the receiver pin and look at the waveform and
// the eye diagram.
//
// In code: the board below is a normal tscircuit board. Two things matter for
// the test:
//   1. the <ibismodel> on each chip: REQUIRED. It is the electrical model of the
//      chip's pins. Without it there is nothing to simulate.
//   2. the <signalintegrity> block at the bottom: the test itself, one line.
//
// Model file: TI sn74lvc1g04.ibs, see models/README.md.

const ibisFile = {
  project_relative_path: "models/sn74lvc1g04.ibs",
  url: "./models/sn74lvc1g04.ibs",
  mimetype: "text/plain",
}
// Pin 4 (Y) is an output, pin 2 (A) is an input. The "_33" models are the 3.3 V
// variants from the IBIS [Model Selector].
const lvc1g04 = {
  ibisModelAsset: ibisFile,
  ibisComponentName: "LVC1G04_DCK",
  ibisPinNameToPortLabel: { "2": "A", "3": "GND", "4": "Y", "5": "VCC" },
  ibisPinNameToModelName: { "2": "LVC1G04_IN_33", "4": "LVC1G04_OUT_33" },
  ibisPinNameToReferencePortLabels: {
    "2": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
    "4": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
  },
  includePackageParasitics: true,
}
const pins = { pin1: "NC", pin2: "A", pin3: "GND", pin4: "Y", pin5: "VCC" }

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    {/* Driver chip on the left, receiver chip on the right: two SN74LVC1G04 inverters. */}
    <chip name="TX" manufacturerPartNumber="SN74LVC1G04DCK" footprint="sot23_5" pcbX={-15} pinLabels={pins} />
    <chip name="RX" manufacturerPartNumber="SN74LVC1G04DCK" footprint="sot23_5" pcbX={15} pinLabels={pins} />

    {/* The IBIS model of each chip. This is what makes the simulation possible. */}
    <ibismodel componentRef=".TX" {...lvc1g04} />
    <ibismodel componentRef=".RX" {...lvc1g04} />

    {/* 3.3 V supply and the power/ground wiring of both chips. */}
    <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    <trace from=".TX > .GND" to="net.GND" />
    <trace from=".RX > .GND" to="net.GND" />

    {/* The trace under test: TX output Y to RX input A. */}
    <trace from=".TX > .Y" to=".RX > .A" />

    {/* Ground plane on the bottom layer: this is the return path for the signal current.
        It is extracted from the real copper, so no return-path settings are needed. */}
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* The test. bitRate="20Mbps" means each bit lasts 50 ns (1 UI).
        By default the driver sends a PRBS7 pseudo-random pattern, the receiver pin is
        probed against its own chip's ground, and the eye is checked against the
        receiver's IBIS thresholds. Results: receiver waveform, eye, eye height/width. */}
    <signalintegrity name="SI" bitRate="20Mbps">
      {/* driver = the pin that sends; receiver = the pin we "put the scope probe" on. */}
      <signal name="DATA" driver=".TX > .Y" receiver=".RX > .A" />
    </signalintegrity>
  </board>
)
