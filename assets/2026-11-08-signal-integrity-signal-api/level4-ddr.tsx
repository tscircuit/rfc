// One DDR byte lane: DQ0–DQ7 are sampled by the DQS0 strobe pair.
// The controller (MC) and DRAM chips with their <ibismodel>s are defined like
// parts.tsx; they are omitted here to keep the test readable.
const dq = [0, 1, 2, 3, 4, 5, 6, 7]

export const DdrTests = () => (
  <>
    {/* Write: the controller drives, the DRAM receives with 40 Ω on-die termination. */}
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
          receiver={{ pin: `.DRAM > .DQ${i}`, model: "DQ_40_ODT40_1600" }}
          strobe="DQS"
          mask={{ setup: "75ps", hold: "100ps" }}
        />
      ))}
    </signalintegrity>

    {/* Read: the same copper, but the DRAM drives. One driver per signal, so it is a separate block. */}
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
          driver={{ pin: `.DRAM > .DQ${i}`, model: "DQ_34_1600" }}
          receiver={`.MC > .DQ${i}`}
          strobe="DQS"
          mask={{ setup: "50ps", hold: "50ps" }}
        />
      ))}
    </signalintegrity>
  </>
)
