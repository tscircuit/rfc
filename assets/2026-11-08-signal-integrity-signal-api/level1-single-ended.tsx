// LEVEL 1: one single-ended signal.
//
// In the lab: one driver chip sends bits down one copper trace to a receiver
// chip. You put a scope probe on the receiver pin and look at the waveform and
// the eye diagram.
//
// In code: the board below is a normal tscircuit board. The ONLY simulation
// code is the <signalintegrity> block at the bottom: one <signal> line.
import { Octal, Supply } from "./parts"

export default () => (
  <board width="40mm" height="20mm" layers={2} fabricatorPreset="jlcpcb_standard">
    {/* Driver chip on the left, receiver chip on the right. */}
    <Octal name="TX" pcbX={-15} />
    <Octal name="RX" pcbX={15} />
    <Supply />
    {/* The trace under test. */}
    <trace from=".TX > .D0" to=".RX > .D0" />
    <trace from=".TX > .VCC" to="net.VCC" />
    <trace from=".RX > .VCC" to="net.VCC" />
    {/* Ground plane on the bottom layer: this is the return path for the signal current.
        It is extracted from the real copper, so no return-path settings are needed. */}
    <copperpour connectsTo="net.GND" layer="bottom" />

    {/* The test. bitRate="20Mbps" means each bit lasts 50 ns (1 UI).
        By default the driver sends a PRBS7 pseudo-random pattern, the receiver pin is
        probed against its own chip's ground, and the eye is checked against the
        receiver's IBIS thresholds. Results: receiver waveform, eye, eye height/width. */}
    <signalintegrity name="SI" bitRate="20Mbps">
      {/* driver = the pin that sends; receiver = the pin we "put the scope probe" on. */}
      <signal name="DATA" driver=".TX > .D0" receiver=".RX > .D0" />
    </signalintegrity>
  </board>
)
