# Wiring Diagram

Unlike Schematic diagram, Wiring diagram represent how components and boards interconnected outside of PCB. It can be said it's high-level diagram for complex project that involve many PCB board.

## Example

```jsx
<>
  <board name="driver">
    …
    <wire use="C2[right]" as="pwm1" />
    <wire use="P1" as="vcc" />
    <wire use="P9" as="gnd"
  </board>

  <wire
    from="driver[pwm1]"
    to="servo[ctl_signal]"
  />
  <wire
    from="bmc[lo_out gnd] bmc[hi_out gnd]"
    to="driver[vcc gnd] servo[vcc gnd]" 
  />

  <board name="bmc">
    …
  </board>

  <motor name="servo"
    model="HS-1005SGT"
    torque="200kg"
  />
</>
```