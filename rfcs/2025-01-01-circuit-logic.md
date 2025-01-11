# Circuit Logic

Chips have complex functions that can be emulated in software but there are not good tools for simulating
chip logic that are built into the schematic capture/pcb design process. The tscircuit logic rendering pipeline
enables engineers to understand the function of chips and simulate their interaction.

## Motivation

Engineers faced with complex chip interaction always do one of the following:

1. Follow reference designs extremely closely
2. Prototype using breadboards and protoboard until they have a reference
3. Think very hard about the design, draw digital signal diagrams, then YOLO the circuit
4. Use a sophisticated purpose-built simulation tool (e.g. Simulink)

These should not be necessary. Logic simulation can enable safe experimentation and deeper
understanding of the chips on a board, and should be a builtin of common chips and designs.

### Examples of Chips that would benefit from logic simulation

- LED Driver and Keyscan Chip: https://cdn-shop.adafruit.com/datasheets/ht16K33v110.pdf

## Input Types

| Input Type | Description |
| ---------- | ----------- |
| `power`    | Power input, e.g. 3v or 5v input |
| `ground`   | Ground |
| `high_or_low` | Digital high or low, enable pins or fixed logic levels |
| `spi_data` | SPI Data, MOSI or MISO |
| `clock`    | Square wave clock usable with SPI or I2C |
| `i2c_data` | I2C data, I2C_SDA |

## Logic Props

The logic prop allows a chip to define it's output based on the inputs it's receiving. It is an
event-based state machine. Users can use different state machine frameworks to management chip logic,
but it can also be used directly as shown below:

```tsx

const chipLogic = {
  pinConfig: {
    V5: "power",
    GND: "ground",
    D0: "input_spi_data",
    D1: "input_clock",
    EN: "input_high_or_low",
    D2: "output_high_or_low"
  },
  onEvent(event, chipState, emit) => {
     // captures every event
  },
  onInit: (event, chipState, emit) => {},
  onHighOrLowSignal: (event, chipState, emit) => {},
  onDataSignal: (event, chipState, emit) => {}
}

<chip
  // ...
  logic={chipLogic}
/>
```

## Event Types

When an event is received, new events can be emitted to trigger other state machines.

The state of a chip cannot be directly manipulating by modifying the `chipState`, the event
handler must `emit` events to manipulate it. This allows us to analyze dependencies and
ensure other state machines receive the change.

| Event | Description |
| ----- | -------- |
| CHIP_STARTUP | Usually ignored, this can be used to  | 
| CHIP_NORMAL_OPERATION_START | The first "normal operation" event emitted to chips. This is used to initialize output pins if nothing was done in CHIP_STARTUP  |
| SIGNAL_CHANGE | Called on any rising or falling edge for pin logic |
| BITS_TRANSMISSION_START | Called before the rising edge where data is about to be submitted |
| BITS_TRANSMISSION_END | Called after all data is transmitted |

### Event Payloads

Every event has the following parameters:

```tsx
{
  tNs: number // time since start in nanoseconds
  tick: number // (unsigned bigint) number of cycle/step since start, mainly to synchronize with other simulator
}
```

## Chip State (`state`)

The chip state handler (the `state` object) can be defined as follows:

```tsx
interface ChipStateHandler {
  currentPinValues: Record<PinName, 0 | 1>,
  pinHistory: Record<PinName, {
    getLogicLevelAtTime: (t: number) => 0 | 1,
    getLastBitsSent: () => Array<0 | 1>
    // ... TODO
  }>
}
```


## Waveform View

Understand the function of chips can be difficult, the waveform view allows testing.

Ref: Sigrok, GTkwave

## Interaction with Render Pipeline

Logic can be disabled or enabled at a platform level. Logic executes until events are complete
or until the real time extends past the context `maxLogicTime` or the data exceeds `maxLogicEvents`

Every state machine is executed until it is stable (no events emitted) or a stopping constraint is met.
Dependencies are considered when executing chip logic. Where there are ambiguous dependencies, we throw
an error for now.

Some ambiguous order scenarios are automatically resolved (TODO, data dependency resolution logic?)
