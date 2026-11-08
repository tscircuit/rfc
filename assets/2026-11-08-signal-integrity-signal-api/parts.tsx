// Shared parts used by the Level 2 and Level 3 examples.
// (The Level 1 examples write the same parts out in full so you can see them.)
//
// This file describes the CHIPS, not the test. <signalintegrity> cannot work
// without it: every pin named as a driver or receiver must have an IBIS model.
// The IBIS file (published by the chip vendor, see models/README.md) tells the
// simulator how strongly a pin drives, how fast its edges are, and how it loads
// the line.

// TI SN74LVC1G04 single inverter in the SC70-5 (DCK) package.
//   pin 2 = A   (input)   -> used as a receiver
//   pin 4 = Y   (output)  -> used as a driver
// The IBIS file has one model per supply voltage (a [Model Selector]). The board
// runs at 3.3 V, so we pick the "_33" models. This choice is not in the copper,
// which is why it is written here.
export const Inverter = (props: { name: string; pcbX: number; pcbY?: number }) => (
  <>
    <chip
      name={props.name}
      manufacturerPartNumber="SN74LVC1G04DCK"
      footprint="sot23_5"
      pcbX={props.pcbX}
      pcbY={props.pcbY ?? 0}
      pinLabels={{ pin1: "NC", pin2: "A", pin3: "GND", pin4: "Y", pin5: "VCC" }}
    />
    <ibismodel
      componentRef={`.${props.name}`}
      ibisModelAsset={{
        project_relative_path: "models/sn74lvc1g04.ibs",
        url: "./models/sn74lvc1g04.ibs",
        mimetype: "text/plain",
      }}
      ibisComponentName="LVC1G04_DCK"
      // IBIS [Pin] number -> this chip's port label.
      ibisPinNameToPortLabel={{ "2": "A", "3": "GND", "4": "Y", "5": "VCC" }}
      // Which IBIS [Model] each signal pin uses (3.3 V variants).
      ibisPinNameToModelName={{ "2": "LVC1G04_IN_33", "4": "LVC1G04_OUT_33" }}
      // Which chip pins the buffer's transistors and clamp diodes connect to.
      ibisPinNameToReferencePortLabels={{
        "2": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
        "4": { pullup: "VCC", pulldown: "GND", powerClamp: "VCC", groundClamp: "GND" },
      }}
      // Include the package's pin R, L and C from the IBIS [Pin] table.
      includePackageParasitics
    />
    {/* Every chip is powered from the 3.3 V rail and grounded. */}
    <trace from={`.${props.name} > .VCC`} to="net.VCC" />
    <trace from={`.${props.name} > .GND`} to="net.GND" />
  </>
)

// The 3.3 V bench supply. <signalintegrity supply="board"> (the default) takes
// the supply voltage from this source, like powering the board in the lab.
export const Supply = () => (
  <voltagesource name="V3V3" voltage="3.3V" connections={{ pos: "net.VCC", neg: "net.GND" }} />
)
