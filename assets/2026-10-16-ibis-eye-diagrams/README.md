# IBIS simulation walkthroughs

These two short videos explain the experimental TSX → IBIS/PCB SPICE → waveform
→ eye workflow. The MP4 files have synthetic narration and burned-in captions.
If GitHub does not show a player, use the video's raw/download link.

They show the earlier **100 ns DQS-only** example, using the then-current
`simulationRef` spelling. The RFC proposes `transientSimulationRef`; this rename
is not implemented in the pinned prototype. The newer DDR DQ0 example uses the
same pipeline with additional data traffic and an alternating DQS strobe.

The analog traces replay a recorded native ngspice run. Logical-state diagrams
are illustrations. Producing these videos did not rerun an electrical solver.
They are educational recordings, not hardware measurements, the newer DQ0
all-eight-histories proof, or a claim of physical validation.

## Recording provenance

- Source project: [0hmX/am3352-ddr-eye at ee29dbe](https://github.com/0hmX/am3352-ddr-eye/tree/ee29dbebdd7e246c1eb7c61bb9a9624177f9f0ec).
- Recorded experiment: `DDR_SI`, 100 ns, 30 receive-eye windows; solver receipt timestamp `2026-10-14T18:46:47.139Z`, macOS arm64, clean source tree, no solver-result cache.
- Source waveform CSV SHA-256: `cab08066a82c116177f216f37fa1cbd00ff5d353d422eae0d493e48749eb9a40`.
- Source receive-eye CSV SHA-256: `83b0b9b18cd73394f271b561e772493e52ba4255154ffc244daa5541e43b38e0`.
- Format: 1280 × 720, H.264, 15 fps, AAC audio; installed macOS Aman synthetic voice.
- The timing video reapplies the shared `foldProbeEye` function to that waveform while varying observation gate/alignment. The reduced selected-channel model and omitted package parasitics still apply.
- These are documentation media. Generated simulation results and custom plot scripts are not added to the runnable example.

## One experiment, stimulus, waveform, and eye

[Watch/download MP4](one-simulation-explained.mp4?raw=true), 75.93 seconds.

Video SHA-256: `03f01bd29c03fa3ea4a97387df7f3ffe85ab1f50d6dcb8be71715718ec913559`.

### Transcript

**1. One experiment, with an input pattern**

There is one electrical simulation. The transient element defines the experiment: simulate one hundred nanoseconds. The digital stimulus provides an input pattern for that experiment. It is not a second simulation.

**2. simulationRef connects the declarations**

Simulation ref points to the experiment's name. In our current schema, it is required. Dot D D R underscore S I selects the experiment named D D R S I. Drives separately selects U one, pin P one.

**3. The stimulus becomes a timed input recipe**

Before the solver starts, the runner expands zero one into a timed pattern. Each bit lasts two point five nanoseconds. Initial state zero sets the state before the pattern. These are logical states, not voltage values.

**4. Assemble everything, then solve once**

The runner combines both transmit patterns, vendor I B I S buffers, the extracted P C B model, and the one point five volt supply. Then N G spice solves this selected circuit once, with all these inputs together.

**5. One run produces the voltage waveform**

During that run, the pattern controls the driver transitions. The circuit determines the actual voltage, including ringing. This is a replay of the recorded differential receive waveform from our board simulation. Nanoseconds are slowed down here.

**6. An eye diagram reuses the recorded waveform**

After the solver finishes, the eye diagram folds sections of the recorded waveform onto one time window. It does not run another circuit simulation. One experiment, input patterns, one solver run, then waveform measurements and eye plots.

## Eye alignment versus observation time

[Watch/download MP4](time-origin-vs-start-time.mp4?raw=true), 73.33 seconds.

Video SHA-256: `9ad63848a6e244bfedb67de13158a5a98f322ca99788fd82e64cadd4c1064085`.

### Transcript

**1. Two settings, two different jobs**

Both settings act on the same recorded waveform. The circuit has already been simulated from zero to one hundred nanoseconds. Time origin controls alignment. Start time chooses which recorded data enters the eye.

**2. timeOrigin anchors the bit-boundary grid**

With time origin zero and a two point five nanosecond unit interval, the reference boundaries are zero, two point five, five, and so on. These are alignment marks. The measured waveform still includes the circuit's propagation delay.

**3. startTime moves the measurement cutoff**

Start time twenty excludes the first twenty nanoseconds from the eye. Moving it to thirty excludes more early data. Watch the cutoff move while the alignment marks stay fixed. The simulation itself still starts at zero.

**4. timeOrigin moves the alignment, not the signal**

Now keep start time at twenty and move time origin from zero to one nanosecond. The alignment grid moves over the unchanged waveform. Because the waveform slices start at different positions, the eye shifts horizontally.

**5. Only complete eye windows are included**

Our eye plots use windows that span two unit intervals: five nanoseconds here. A window crossing the twenty nanosecond cutoff is excluded. With your settings, the first included window starts at twenty one point two five nanoseconds.

**6. Gate versus alignment: the two controls**

Start time chooses which recorded data you use. Time origin chooses how you line that data up. Neither changes the original voltage waveform. They are two controls for processing the output of the same circuit simulation.
