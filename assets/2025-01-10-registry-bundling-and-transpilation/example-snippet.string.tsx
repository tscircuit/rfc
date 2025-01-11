export default `

import manualEdits from "./manual-edits.json"
import { CustomLed } from "@tsci/seveibar.custom-led"
import { createUseComponent } from "@tscircuit/core"

const pinLabels = ["power"] as const

export const MySnippet = ({ power }: { power: string }) => (
  <subcircuit manualEdits={manualEdits}>
    <CustomLed name="LED1" gnd="net.GND" v5={power} />
  </subcircuit>
)

export const useMySnippet = () => createUseComponent(pinLabels, MySnippet)

`.trim();
