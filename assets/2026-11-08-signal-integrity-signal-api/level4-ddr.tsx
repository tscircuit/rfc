// LEVEL 4: DDR memory. It combines all the earlier levels.
//
// In the lab: a memory controller (MC) talks to a DRAM chip over:
//   - DQ0–DQ7: eight single-ended data lines running side by side (Levels 1–3),
//   - DQS: a differential strobe pair (Level 1 differential).
// The strobe travels with the data. It toggles like a clock, and the receiver
// takes a "photo" of every DQ line at each strobe crossing (rising AND falling,
// hence "double data rate"). The scope's DDR software finds each strobe
// crossing and checks that the data was stable for long enough before it
// (setup time) and after it (hold time).
//
// In code:
//   - pattern="clock" makes DQS toggle like a strobe,
//   - strobe="DQS" says which strobe samples each data line. This "binding" is
//     protocol knowledge (DQ0–7 belong to DQS0); the copper cannot tell you,
//   - mask={{ setup, hold }} gives the timing limits from the DRAM datasheet.
//     Results: setup and hold margin at every strobe edge, and the worst case.
//
// The controller and DRAM chips with their <ibismodel>s are defined like
// parts.tsx; they are omitted here to keep the test readable.
// The eight data lines of one byte lane.
const dq = [0, 1, 2, 3, 4, 5, 6, 7]

export const DdrTests = () => (
  <>
    {/* WRITE: the controller drives, the DRAM receives.
        On a write the controller places each strobe edge in the middle of each data bit. */}
    <signalintegrity name="WRITE" bitRate="1600Mbps">
      <signal
        name="DQS"
        driver={{ p: ".MC > .DQS0_P", n: ".MC > .DQS0_N" }}
        receiver={{ p: ".DRAM > .DQS_P", n: ".DRAM > .DQS_N" }}
        pattern="clock"
      />
      {dq.map((i) => (
        <signal key={i}
          name={`DQ${i}`}
          driver={`.MC > .DQ${i}`}
          // model selects the DRAM's 40 Ω on-die termination (ODT): a resistor inside the
          // chip that the controller switches on. The board alone cannot show which
          // setting is active, so it is named here.
          receiver={{ pin: `.DRAM > .DQ${i}`, model: "DQ_40_ODT40_1600" }}
          strobe="DQS"
          mask={{ setup: "75ps", hold: "100ps" }}
        />
      ))}
    </signalintegrity>

    {/* READ: the same copper, but now the DRAM drives and the controller receives.
        Every signal has exactly one driver, so a read is a separate block.
        On a read the DRAM sends each strobe edge lined up with the start of each data bit,
        and the controller delays it internally. Read limits come from the controller's
        datasheet, so they differ from the write limits. */}
    <signalintegrity name="READ" bitRate="1600Mbps">
      <signal
        name="DQS"
        driver={{ p: ".DRAM > .DQS_P", n: ".DRAM > .DQS_N" }}
        receiver={{ p: ".MC > .DQS0_P", n: ".MC > .DQS0_N" }}
        pattern="clock"
      />
      {dq.map((i) => (
        <signal key={i}
          name={`DQ${i}`}
          // The DRAM's 34 Ω output drive strength for this read.
          driver={{ pin: `.DRAM > .DQ${i}`, model: "DQ_34_1600" }}
          receiver={`.MC > .DQ${i}`}
          strobe="DQS"
          mask={{ setup: "50ps", hold: "50ps" }}
        />
      ))}
    </signalintegrity>
  </>
)
