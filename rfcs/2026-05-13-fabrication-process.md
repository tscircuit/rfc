# RFC: Laser-Based PCB Fabrication Workflow

## Motivation

We need a structured fabrication workflow for producing PCBs from Circuit JSON using a laser-based fabrication process. The workflow must support both top-side and bottom-side fabrication, operator-assisted alignment, automatic offset correction, stage previews, machine execution, verification checkpoints, and complete job logging.

The goal is to make the fabrication process reliable, repeatable, and safe while still allowing manual operator intervention where precision or visual confirmation is required.

## Overview

The proposed workflow begins with a Circuit JSON upload and generation of fabrication-stage LBRN files. The operator previews the generated PCB job, loads the PCB into a laser jig, performs alignment using low-power jog commands, and then runs the top-side fabrication stages.

After completing the top side, the system rotates the PCB 180 degrees for bottom-side fabrication. The system verifies orientation using camera-detected LED markers, captures bottom-side alignment offsets, applies those offsets to bottom-side LBRN files, and runs the bottom-side laser stages.

At the end of the process, the operator performs a final inspection and the system saves all relevant logs, generated files, offsets, timestamps, machine commands, and operator confirmations.

## Goals

- Generate all required fabrication LBRN files from Circuit JSON.
- Support top-side and bottom-side fabrication workflows.
- Provide operator previews before machine execution.
- Allow operator-assisted alignment using live camera feedback.
- Automatically capture and apply alignment offsets.
- Verify PCB orientation using camera-detected markers.
- Rotate the PCB between top-side and bottom-side fabrication.
- Log all relevant fabrication data for debugging and reproducibility.

## Non-Goals

- Fully autonomous alignment without operator input.
- Fully autonomous visual inspection of completed copper results.
- Guaranteeing mechanical rotation accuracy without external validation.
- Replacing the operator’s final accept/reject decision.

## Proposed Workflow

### Stage 1: Create Fabrication Job

The operator uploads or provides the Circuit JSON. The system validates the input and generates all required fabrication-stage LBRN files.

Generated files include:

- Alignment files
- Deoxidation files
- Copper fill/cutting files
- Top-side jobs
- Bottom-side jobs

The system also generates previews and job metadata.

### Stage 2: Preview PCB Job

The operator sees a preview of the generated PCB and fabrication stages before starting the machine workflow.

This confirms that the generated output is correct before any hardware action begins.

### Stage 3: Load PCB Into Laser Jig

The operator physically places the PCB material into the laser jig and secures it in place.

The UI waits for operator confirmation before continuing.

### Stage 4: Rotation Verification — Top Side

The system uses a camera or webcam to verify PCB orientation.

The proposed marker scheme is:

- Top side contains a red LED marker.
- Bottom side contains a blue LED marker.

The camera detects the LED color to determine:

- Whether the board is flipped correctly.
- Whether the correct side is facing upward.

This allows automatic top/bottom orientation detection before fabrication begins.

#### Open Question: How do we guarantee the board rotated exactly 180 degrees?

Possible solutions:

1. **Mechanical jig with hard stops**
   - Simplest and most reliable.
   - Motor rotates until a physical stop is reached.

2. **Stepper motor with calibrated step count**
   - Rotates a fixed number of steps.
   - May drift over time.

3. **Encoder feedback**
   - Motor reports exact rotation angle.
   - More accurate, but adds hardware complexity.

4. **Camera verification after rotation**
   - Verifies alignment markers after rotation.
   - Probably needed even if the motor is precise.

#### Recommended Approach

Use a mechanical jig or hard stop, plus camera verification.

This is likely the safest MVP solution.

### Stage 5: Align Laser To Reference Hole

The operator manually aligns the laser using arrow or jog buttons in the UI.

Important implementation detail: the arrow buttons do not directly move the motor manually.

Instead:

- The system repeatedly sends tiny LBRN move/jog commands.
- Laser power is very low.
- This creates a visible positioning laser for alignment.

The operator adjusts the position until the laser aligns with the reference hole or alignment marker.

The UI includes:

- Live camera feed
- Up/down/left/right jog buttons
- Current alignment position
- Confirm alignment button

### Stage 6: Capture Top Alignment Offset

Once alignment is complete, the system records the offset between:

- Expected PCB position
- Actual PCB position

Captured values include:

- X offset
- Y offset
- Optional small rotation correction

### Stage 7: Apply Top Alignment Offset To All Top LBRN Files

The system automatically applies the captured offset to every top-side LBRN file using a script.

This transformation updates:

- Top deoxidation file
- Top copper fill/cutting file
- Any top alignment/generated stages

This should happen automatically without operator file editing.

Likely implementation location:

- `circuit-json-to-lbrn`
- `lbrnts` helper utilities

### Stage 8: Preview Adjusted Top LBRN

The operator sees a preview of the adjusted top-side fabrication paths before starting the laser process.

This acts as a final safety verification step.

### Stage 9: Run Top Deoxidation

The system sends the adjusted top deoxidation LBRN file to the laser machine and starts execution.

The UI shows:

- Live camera feed
- Machine state
- Progress
- Emergency stop
- Retry controls

### Stage 10: Verify Top Deoxidation

The operator visually verifies that the deoxidation pass completed successfully before continuing.

### Stage 11: Run Top Copper Fill / Cutting

The system sends the adjusted top copper fill/cutting LBRN file to the laser machine and executes the main top-side fabrication pass.

### Stage 12: Verify Top Copper Result

The operator confirms the top-side copper result is acceptable before rotating the board.

### Stage 13: Rotate PCB 180 Degrees

The system sends a rotation command to the motor through the local hardware agent.

The PCB is rotated for bottom-side fabrication.

Possible future improvements:

- Encoder feedback
- Automatic camera-based angle correction
- Computer vision verification

### Stage 14: Rotation Verification — Bottom Side

The camera verifies that:

- The PCB rotated correctly.
- The blue LED marker is now visible.
- The correct side is facing upward.

This confirms bottom-side orientation before continuing.

### Stage 15: Align Bottom Side To Reference Hole

The operator again uses jog/alignment buttons to align the laser to the bottom-side reference hole.

This follows the same process as top-side alignment:

- Tiny LBRN move commands
- Low laser power positioning
- Live camera feed
- Operator-controlled alignment

### Stage 16: Capture Bottom Alignment Offset

The system stores the bottom-side alignment correction values.

Captured values include:

- X offset
- Y offset
- Optional rotation adjustment

### Stage 17: Apply Bottom Alignment Offset To All Bottom LBRN Files

The system automatically applies the bottom alignment transform to all bottom-side LBRN files through script-based processing.

### Stage 18: Preview Adjusted Bottom LBRN

The operator previews the adjusted bottom-side fabrication paths before starting the laser.

### Stage 19: Run Bottom Deoxidation

The system sends the adjusted bottom deoxidation LBRN file to the laser and starts execution.

### Stage 20: Verify Bottom Deoxidation

The operator confirms the deoxidation stage completed correctly.

### Stage 21: Run Bottom Copper Fill / Cutting

The system sends the adjusted bottom copper fill/cutting LBRN file to the laser and runs the final fabrication stage.

### Stage 22: Final Inspection

The operator checks the completed PCB visually and confirms whether the fabrication succeeded or failed.

### Stage 23: Save Logs And Complete Job

The system stores:

- Alignment offsets
- Generated LBRN versions
- Laser execution logs
- Motor commands
- Timestamps
- Operator confirmations
- Retries/errors

The fabrication job is then marked complete.

## Stage Descriptions

| Stage | Name | Actor | Description |
|---:|---|---|---|
| 1 | Create Fabrication Job | System / Operator | Operator provides Circuit JSON; system validates input and generates fabrication files. |
| 2 | Preview PCB Job | Operator | Operator reviews generated PCB and fabrication-stage previews. |
| 3 | Load PCB Into Laser Jig | Operator | Operator places and secures PCB material in the jig. |
| 4 | Rotation Verification — Top Side | System | Camera verifies that the top side is facing upward. |
| 5 | Align Laser To Reference Hole | Operator / System | Operator jogs the laser using low-power LBRN movement commands. |
| 6 | Capture Top Alignment Offset | System | System records top-side X/Y offset and optional rotation correction. |
| 7 | Apply Top Alignment Offset | System | System applies top-side offset to all top-side LBRN files. |
| 8 | Preview Adjusted Top LBRN | Operator | Operator reviews transformed top-side paths. |
| 9 | Run Top Deoxidation | System | System executes adjusted top deoxidation file. |
| 10 | Verify Top Deoxidation | Operator | Operator confirms top deoxidation completed successfully. |
| 11 | Run Top Copper Fill / Cutting | System | System executes main top-side copper pass. |
| 12 | Verify Top Copper Result | Operator | Operator confirms top-side copper result is acceptable. |
| 13 | Rotate PCB 180 Degrees | System | Motor rotates PCB for bottom-side fabrication. |
| 14 | Rotation Verification — Bottom Side | System | Camera verifies bottom-side orientation. |
| 15 | Align Bottom Side To Reference Hole | Operator / System | Operator aligns laser to bottom-side reference hole. |
| 16 | Capture Bottom Alignment Offset | System | System records bottom-side alignment correction. |
| 17 | Apply Bottom Alignment Offset | System | System applies bottom-side offset to all bottom-side LBRN files. |
| 18 | Preview Adjusted Bottom LBRN | Operator | Operator reviews transformed bottom-side paths. |
| 19 | Run Bottom Deoxidation | System | System executes adjusted bottom deoxidation file. |
| 20 | Verify Bottom Deoxidation | Operator | Operator confirms bottom deoxidation completed successfully. |
| 21 | Run Bottom Copper Fill / Cutting | System | System executes final bottom-side copper pass. |
| 22 | Final Inspection | Operator | Operator visually inspects completed PCB. |
| 23 | Save Logs And Complete Job | System | System stores logs, files, offsets, confirmations, and marks job complete. |

## UI Requirements

To be filled in.

Potential areas to define:

- Fabrication job creation screen
- PCB preview screen
- Stage-by-stage workflow UI
- Live camera view
- Jog/alignment controls
- Machine status display
- Emergency stop behavior
- Retry controls
- Operator confirmation prompts
- Final inspection UI

## Hardware Requirements

To be filled in.

Potential areas to define:

- Laser machine interface
- Camera/webcam requirements
- PCB rotation motor
- Mechanical jig
- Hard stops
- LED orientation markers
- Local hardware agent
- Emergency stop wiring

## Software Requirements

To be filled in.

Potential areas to define:

- Circuit JSON validation
- LBRN generation
- LBRN transform utilities
- Preview generation
- Camera marker detection
- Motor control API
- Laser control API
- Job state machine
- Log persistence
- Retry/error handling

## Alignment Model

To be filled in.

Potential areas to define:

- Reference hole selection
- Expected versus actual coordinate system
- X/Y offset calculation
- Optional rotation correction
- Transform format
- Application of transforms to LBRN files
- Verification after transform application

## Rotation Model

To be filled in.

Potential areas to define:

- Motor command format
- 180-degree rotation assumptions
- Mechanical hard stop behavior
- Camera verification after rotation
- Encoder support
- Failure modes
- Recovery behavior

## File Generation

To be filled in.

Potential generated files:

- Top alignment LBRN
- Top deoxidation LBRN
- Top copper fill/cutting LBRN
- Bottom alignment LBRN
- Bottom deoxidation LBRN
- Bottom copper fill/cutting LBRN
- Preview images
- Job metadata
- Offset-adjusted LBRN files

## Logging Requirements

The system should persist enough information to debug and reproduce a fabrication job.

Required logs:

- Uploaded Circuit JSON
- Generated LBRN files
- Offset-adjusted LBRN files
- Alignment offsets
- Optional rotation corrections
- Laser execution logs
- Motor commands
- Camera verification results
- Operator confirmations
- Retry attempts
- Error states
- Timestamps for every stage

## Failure Modes

To be filled in.

Potential failure cases:

- Invalid Circuit JSON
- LBRN generation failure
- Camera unavailable
- LED marker not detected
- Incorrect side detected
- Alignment confirmation timeout
- Laser execution failure
- Motor rotation failure
- Operator rejects verification result
- Emergency stop triggered
- Log persistence failure

## Open Questions

### Rotation Accuracy

How do we guarantee that the board rotated exactly 180 degrees?

Current recommendation:

- Use a mechanical jig or hard stop.
- Add camera verification after rotation.

### Marker Scheme

Are red and blue LED markers sufficient for reliable top/bottom detection?

Questions to resolve:

- Should markers be LEDs, colored fiducials, or both?
- How does ambient lighting affect detection?
- Should the system require marker detection before every machine stage?

### Alignment Reference

What should the operator align against?

Options:

- Reference hole
- Fiducial marker
- Edge of PCB
- Dedicated alignment target

### Offset Transform Ownership

Where should LBRN offset transforms be implemented?

Options:

- `circuit-json-to-lbrn`
- `lbrnts`
- A separate fabrication job processor
- Local hardware agent

## Future Work

Potential improvements:

- Fully automatic alignment using computer vision
- Encoder-based rotation feedback
- Automatic camera-based angle correction
- Automated visual inspection after each laser pass
- More robust marker detection
- Operator replay/debug tooling
- Simulation mode for testing fabrication jobs without hardware

## Acceptance Criteria

To be filled in.

Possible criteria:

- Operator can create a fabrication job from Circuit JSON.
- System generates top and bottom LBRN files.
- Operator can preview generated and adjusted LBRN files.
- Operator can align top and bottom sides using jog controls.
- System captures and applies alignment offsets.
- System verifies top/bottom orientation using markers.
- System can run top and bottom deoxidation stages.
- System can run top and bottom copper fill/cutting stages.
- System stores all required logs and marks the job complete.
