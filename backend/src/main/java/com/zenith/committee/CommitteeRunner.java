package com.zenith.committee;

import java.util.Optional;
import java.util.function.Consumer;

/** What CommitteeGate needs from the committee: run it live, or fetch the last saved decision. */
public interface CommitteeRunner {

    CommitteeResult run(String ticker, boolean withRebuttals, Consumer<CommitteeEvent> emit);

    Optional<CommitteeResult> lastSavedRun(String ticker);
}
