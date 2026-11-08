// LEVEL 4: DDR memory. It combines all the earlier levels.
//
// In the lab: a memory controller (MC) talks to a DRAM chip over:
//   - DQ0–DQ7: eight single-ended data lines running side by side (Levels 1–3),
//   - DQS: a differential strobe pair (Level 1 differential).
// The strobe travels with the data. It toggles like a clock, and the receiver
// takes a "photo" of every DQ line at each strobe crossing (rising AND falling,
// hence "double data rate"). The scope's DDR software finds each strobe
// crossing and checks that the data was stable for long enough before it
// (setup time) and after it (hold time).
//
// In code:
//   - pattern="clock" makes DQS toggle like a strobe,
//   - strobe="DQS" says which strobe samples each data line. This "binding" is
//     protocol knowledge (DQ0–7 belong to DQS0); the copper cannot tell you,
//   - mask={{ setup, hold }} gives the timing limits from the DRAM datasheet.
//     Results: setup and hold margin at every strobe edge, and the worst case.
//
// PLACEHOLDER MODELS. Unlike Levels 1–3, this example is not tied to real
// vendor files yet. A real board needs:
//   - the memory controller vendor's IBIS file (an FPGA or SoC IBIS),
//   - the DRAM vendor's IBIS file for the exact part and speed grade.
// The file names, [Component] names, pin numbers and [Model] names below
// (DQ_40_ODT40_1600, DQ_34_1600, …) are illustrative. Replace them with the
// names from those files. DRAM IBIS files usually offer one [Model] per drive
// strength and on-die termination (ODT) setting; picking one is the `model`
// choice on each endpoint below.
const dq = [0, 1, 2, 3, 4, 5, 6, 7]

const ddrPins = {
  ...Object.fromEntries(dq.map((i) => [`pin${i + 1}`, `DQ${i}`])),
  pin9: "DQS_P",
  pin10: "DQS_N",
  pin11: "VDDQ",
  pin12: "VSSQ",
}
const ddrIbisPins = Object.fromEntries(Object.entries(ddrPins).map(([pin, label]) => [pin.slice(3), label]))
const refs = { pullup: "VDDQ", pulldown: "VSSQ", powerClamp: "VDDQ", groundClamp: "VSSQ" }
const signalPinNumbers = Object.keys(ddrIbisPins).filter((n) => !["11", "12"].includes(n))

const ddrModel = (file: string, component: string, dqModel: string, dqsModel: string) => ({
  ibisModelAsset: { project_relative_path: `models/${file}`, url: `./models/${file}`, mimetype: "text/plain" },
  ibisComponentName: component,
  ibisPinNameToPortLabel: ddrIbisPins,
  ibisPinNameToModelName: Object.fromEntries(
    signalPinNumbers.map((n) => [n, Number(n) <= 8 ? dqModel : dqsModel]),
  ),
  ibisPinNameToReferencePortLabels: Object.fromEntries(signalPinNumbers.map((n) => [n, refs])),
  includePackageParasitics: true,
})

export default () => (
  <board width="50mm" height="30mm" layers={4} fabricatorPreset="jlcpcb_standard">
    <chip name="MC" footprint="bga96" pcbX={-15} pinLabels={ddrPins} />
    <chip name="DRAM" footprint="bga96" pcbX={15} pinLabels={ddrPins} />
    <ibismodel componentRef=".MC" {...ddrModel("controller.ibs", "CONTROLLER", "MC_DQ_40", "MC_DQS_40")} />
    <ibismodel componentRef=".DRAM" {...ddrModel("dram.ibs", "DRAM_X8", "DQ_34_1600", "DQS_34_1600")} />

    <voltagesource name="VDDQ" voltage="1.5V" connections={{ pos: "net.VDDQ", neg: "net.GND" }} />
    <trace from=".MC > .VDDQ" to="net.VDDQ" />
    <trace from=".DRAM > .VDDQ" to="net.VDDQ" />
    <trace from=".MC > .VSSQ" to="net.GND" />
    <trace from=".DRAM > .VSSQ" to="net.GND" />

    {dq.map((i) => (
      <trace key={i} from={`.MC > .DQ${i}`} to={`.DRAM > .DQ${i}`} />
    ))}
    <trace from=".MC > .DQS_P" to=".DRAM > .DQS_P" />
    <trace from=".MC > .DQS_N" to=".DRAM > .DQS_N" />
    <differentialpair positiveConnection=".MC > .DQS_P" negativeConnection=".MC > .DQS_N" />
    <copperpour connectsTo="net.GND" layer="inner1" />

    <signalintegrity name="WRITE" bitRate="1600Mbps">
      <signal
        name="DQS"
        driver={{ p: ".MC > .DQS_P", n: ".MC > .DQS_N" }}
        receiver={{ p: ".DRAM > .DQS_P", n: ".DRAM > .DQS_N" }}
        pattern="clock"
      />
      {dq.map((i) => (
        <signal
          key={i}
          name={`DQ${i}`}
          driver={`.MC > .DQ${i}`}
          receiver={{ pin: `.DRAM > .DQ${i}`, model: "DQ_40_ODT40_1600" }}
          strobe="DQS"
          mask={{ setup: "75ps", hold: "100ps" }}
        />
      ))}
    </signalintegrity>

    <signalintegrity name="READ" bitRate="1600Mbps">
      <signal
        name="DQS"
        driver={{ p: ".DRAM > .DQS_P", n: ".DRAM > .DQS_N" }}
        receiver={{ p: ".MC > .DQS_P", n: ".MC > .DQS_N" }}
        pattern="clock"
      />
      {dq.map((i) => (
        <signal
          key={i}
          name={`DQ${i}`}
          driver={`.DRAM > .DQ${i}`}
          receiver={`.MC > .DQ${i}`}
          strobe="DQS"
          mask={{ setup: "50ps", hold: "50ps" }}
        />
      ))}
    </signalintegrity>
  </board>
)
