// Shared parts used by every example.
//
// This file describes the CHIPS, not the test. An <ibismodel> tells tscircuit
// how a chip's pins behave electrically (the IBIS file is published by the
// chip vendor). <signalintegrity> reads these models to know how strongly a
// driver pin pushes and how a receiver pin loads the line. Nothing here says
// which pin drives or what bits are sent; that is decided by each <signal>.
const lvc = {
  ibisModelAsset: { project_relative_path: "models/sn74lvc8t245.ibs", url: "./models/sn74lvc8t245.ibs", mimetype: "text/plain" },
  ibisComponentName: "SN74LVC8T245",
  includePackageParasitics: true,
}

// An 8-bit buffer (SN74LVC8T245). Used as both TX (driver) and RX (receiver)
// for the single-ended examples. Its D0–D2 pins are bidirectional I/O pins, so
// the same chip can drive or receive; the <signal> chooses which.
export const Octal = (props: { name: string; pcbX: number }) => (
  <>
    <chip
      name={props.name}
      pcbX={props.pcbX}
      footprint="tssop24"
      pinLabels={{ pin1: "VCC", pin2: "D0", pin3: "D1", pin4: "D2", pin12: "GND" }}
    />
    <ibismodel
      componentRef={`.${props.name}`}
      {...lvc}
      ibisPinNameToPortLabel={{ "1": "VCC", "2": "D0", "3": "D1", "4": "D2", "12": "GND" }}
      ibisPinNameToModelName={{ "2": "LVC_IO_33", "3": "LVC_IO_33", "4": "LVC_IO_33" }}
    />
  </>
)

// An RS-485 transceiver (THVD1450). Its A and B pins form a differential pair:
// A carries the data and B carries the inverted copy.
export const Rs485 = (props: { name: string; pcbX: number }) => (
  <>
    <chip
      name={props.name}
      pcbX={props.pcbX}
      footprint="soic8"
      pinLabels={{ pin5: "GND", pin6: "A", pin7: "B", pin8: "VCC" }}
    />
    <ibismodel
      componentRef={`.${props.name}`}
      ibisModelAsset={{ project_relative_path: "models/thvd1450.ibs", url: "./models/thvd1450.ibs", mimetype: "text/plain" }}
      ibisComponentName="THVD1450"
      ibisPinNameToPortLabel={{ "5": "GND", "6": "A", "7": "B", "8": "VCC" }}
      ibisPinNameToModelName={{ "6": "THVD1450_BUS", "7": "THVD1450_BUS" }}
    />
  </>
)

// The 3.3 V bench supply. <signalintegrity supply="board"> (the default) takes
// the supply voltage from this source, like powering the board in the lab.
export const Supply = () => (
  <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
)
