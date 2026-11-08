// Chips and their IBIS models. This describes the parts, not the test.
const lvc = {
  ibisModelAsset: { project_relative_path: "models/sn74lvc8t245.ibs", url: "./models/sn74lvc8t245.ibs", mimetype: "text/plain" },
  ibisComponentName: "SN74LVC8T245",
  includePackageParasitics: true,
}

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

export const Supply = () => (
  <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
)
