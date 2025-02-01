# Wiring Diagram

Unlike Schematic diagram, Wiring diagram represent how components and boards interconnected outside of PCB. It can be said it's high-level diagram for complex project that involve many PCB boards.

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
> The syntax doesn't follow `<trace>` syntax because it's too verbose to write. I'm not proposing new syntax. It's just me being lazy 😄.

## Rendering
Each board and component rendered as 2d svg. The board itself could be rendered using `@tscircuit/3d-view` where all wire-able section (usually `<via>`) have distinct html/svg `id=` attribute or using [image `<map>`][][^board_map].

[image map]: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/map

[^board_map]: [PICSimLab Board map](https://lcgamboa.github.io/picsimlab_docs/stable/Picturemap.html)

## Cable

Other than describing the connection, sometimes you want to know what kind of cable should be used (e.g HDMI, LAN, RS-232, …). This can be explicit via `<wire cable="…"` or automatically inferred from the component it connect.

## Simulation

When in this mode, it will switch to high-level simulation. This mean the Circuit Logic[^circuit_logic] for simulating the board will be disabled in favor of Board Logic[^board_logic]. It will fallback to Circuit Logic if the Board Logic is missing or the `<board>` has low complexity.

[^circuit_logic]: https://github.com/tscircuit/rfc/pull/2
[^board_logic]: Board Logic is a custom program for simulating the board. The simulation logic can use other simulator like avr8js or similar for simulating development board like Arduino.

## Route & Layout

We can use the same route & layout engine of Schematic diagram. (e.g elkjs?)