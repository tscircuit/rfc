Stage 1: Create Fabrication Job

The operator uploads/provides the Circuit JSON. The system validates the input and generates all required fabrication-stage LBRN files:

* alignment files
* deoxidation files
* copper fill/cutting files
* top-side and bottom-side jobs

The system also generates previews and job metadata.

Stage 2: Preview PCB Job

The operator sees a preview of the generated PCB and fabrication stages before starting the machine workflow. This confirms the generated output is correct.

Stage 3: Load PCB Into Laser Jig

The operator physically places the PCB material into the laser jig and secures it in place. The UI waits for operator confirmation before continuing.

Stage 4: Rotation Verification (Top Side)

The system uses a camera/webcam to verify the PCB orientation.

Plan:

* Top side contains a RED LED marker
* Bottom side contains a BLUE LED marker

The camera detects the LED color to determine:

* whether the board is flipped correctly
* whether the correct side is facing upward

This allows automatic top/bottom orientation detection before fabrication begins.

Open Question:
How do we guarantee the board rotated exactly 180 degrees?

Possible solutions:

1. Mechanical jig with hard stops

   * simplest and most reliable
   * motor rotates until physical stop is reached

2. Stepper motor with calibrated step count

   * rotate fixed number of steps
   * may drift over time

3. Encoder feedback

   * motor reports exact rotation angle
   * more accurate but more hardware complexity

4. Camera verification after rotation

   * verify alignment markers after rotation
   * probably needed anyway even if motor is precise

Recommended approach:
Use:

* mechanical jig/hard stop
* plus camera verification
  This is probably the safest MVP solution.

Stage 5: Align Laser To Reference Hole

The operator manually aligns the laser using arrow/jog buttons in the UI.

Important detail:
The arrow buttons do not directly move the motor manually.

Instead:

* the system repeatedly sends tiny LBRN move/jog commands
* laser power is very low
* this creates a visible positioning laser for alignment

The operator adjusts position until the laser aligns with the reference hole or alignment marker.

UI includes:

* live camera feed
* up/down/left/right jog buttons
* current alignment position
* confirm alignment button

Stage 6: Capture Top Alignment Offset

Once alignment is complete, the system records the offset between:

* expected PCB position
* actual PCB position

Captured values:

* X offset
* Y offset
* optional small rotation correction

Stage 7: Apply Top Alignment Offset To All Top LBRN Files

The system automatically applies the captured offset to every top-side LBRN file using a script.

This transformation updates:

* top deoxidation file
* top copper fill/cutting file
* any top alignment/generated stages

This should happen automatically without operator file editing.

Likely implemented inside:

* circuit-json-to-lbrn
  or
* lbrnts helper utilities

Stage 8: Preview Adjusted Top LBRN

The operator sees a preview of the adjusted top-side fabrication paths before starting the laser process.

This acts as a final safety verification step.

Stage 9: Run Top Deoxidation

The system sends the adjusted top deoxidation LBRN file to the laser machine and starts execution.

The UI shows:

* live camera feed
* machine state
* progress
* emergency stop
* retry controls

Stage 10: Verify Top Deoxidation

The operator visually verifies that the deoxidation pass completed successfully before continuing.

Stage 11: Run Top Copper Fill / Cutting

The system sends the adjusted top copper fill/cutting LBRN file to the laser machine and executes the main top-side fabrication pass.

Stage 12: Verify Top Copper Result

The operator confirms the top-side copper result is acceptable before rotating the board.

Stage 13: Rotate PCB 180 Degrees

The system sends a rotation command to the motor through the local hardware agent.

The PCB is rotated for bottom-side fabrication.

Possible future improvements:

* encoder feedback
* automatic camera-based angle correction
* computer vision verification

Stage 14: Rotation Verification (Bottom Side)

The camera verifies that:

* the PCB rotated correctly
* the BLUE LED marker is now visible
* the correct side is facing upward

This confirms bottom-side orientation before continuing.

Stage 15: Align Bottom Side To Reference Hole

The operator again uses jog/alignment buttons to align the laser to the bottom-side reference hole.

Same process as top-side alignment:

* tiny LBRN move commands
* low laser power positioning
* live camera feed
* operator-controlled alignment

Stage 16: Capture Bottom Alignment Offset

The system stores the bottom-side alignment correction values:

* X offset
* Y offset
* optional rotation adjustment

Stage 17: Apply Bottom Alignment Offset To All Bottom LBRN Files

The system automatically applies the bottom alignment transform to all bottom-side LBRN files through script-based processing.

Stage 18: Preview Adjusted Bottom LBRN

The operator previews the adjusted bottom-side fabrication paths before starting the laser.

Stage 19: Run Bottom Deoxidation

The system sends the adjusted bottom deoxidation LBRN file to the laser and starts execution.

Stage 20: Verify Bottom Deoxidation

The operator confirms the deoxidation stage completed correctly.

Stage 21: Run Bottom Copper Fill / Cutting

The system sends the adjusted bottom copper fill/cutting LBRN file to the laser and runs the final fabrication stage.

Stage 22: Final Inspection

The operator checks the completed PCB visually and confirms whether the fabrication succeeded or failed.

Stage 23: Save Logs And Complete Job

The system stores:

* alignment offsets
* generated LBRN versions
* laser execution logs
* motor commands
* timestamps
* operator confirmations
* retries/errors

The fabrication job is then marked complete.
