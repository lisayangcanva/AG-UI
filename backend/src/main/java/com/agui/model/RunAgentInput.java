package com.agui.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record RunAgentInput(
    @JsonProperty("thread_id") String threadId,
    @JsonProperty("run_id") String runId,
    List<Message> messages
) {}
