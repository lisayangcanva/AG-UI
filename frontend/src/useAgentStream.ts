import { useState, useCallback } from "react";
import type { AgUIEvent, Ticket, TicketType } from "./types";

interface StreamState {
  running: boolean;
  text: string;
  activeToolCall: { id: string; name: string; args: string } | null;
  tickets: Ticket[];
  status: string;
  error: string | null;
}

const INITIAL_STATE: StreamState = {
  running: false,
  text: "",
  activeToolCall: null,
  tickets: [],
  status: "",
  error: null,
};

export function useAgentStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);

  const submit = useCallback(async (ticketType: TicketType, userRequest: string) => {
    setState({ ...INITIAL_STATE, running: true, status: "Starting…" });

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    let messageCount = 0;

    function handleEvent(event: AgUIEvent) {
      switch (event.type) {
        case "RUN_STARTED":
          setState((s) => ({ ...s, status: "Analysing your request…" }));
          break;

        case "TEXT_MESSAGE_START":
          messageCount++;
          setState((s) => ({
            ...s,
            status: messageCount === 1 ? "Thinking…" : "Writing summary…",
          }));
          break;

        case "TEXT_MESSAGE_CONTENT":
          setState((s) => ({ ...s, text: s.text + event.delta }));
          break;

        case "TOOL_CALL_START":
          setState((s) => ({
            ...s,
            status: `Calling tool: ${event.tool_call_name}…`,
            activeToolCall: { id: event.tool_call_id, name: event.tool_call_name, args: "" },
          }));
          break;

        case "TOOL_CALL_ARGS":
          setState((s) =>
            s.activeToolCall
              ? {
                  ...s,
                  activeToolCall: {
                    ...s.activeToolCall,
                    args: s.activeToolCall.args + event.delta,
                  },
                }
              : s
          );
          break;

        case "TOOL_CALL_END":
          setState((s) => ({
            ...s,
            status: "Ticket created, generating summary…",
            activeToolCall: null,
          }));
          break;

        case "STATE_SNAPSHOT":
          setState((s) => ({ ...s, tickets: event.snapshot.tickets }));
          break;

        case "RUN_FINISHED":
          setState((s) => ({ ...s, running: false, status: "" }));
          break;

        case "RUN_ERROR":
          setState((s) => ({ ...s, running: false, status: "", error: event.message }));
          break;
      }
    }

    try {
      const res = await fetch("http://localhost:8000/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          run_id: runId,
          messages: [
            {
              role: "user",
              content: `Create a ${ticketType} ticket for: ${userRequest}`,
            },
          ],
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const chunk of lines) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;

          const json = dataLine.slice(5).trim();
          if (!json) continue;

          const event = JSON.parse(json) as AgUIEvent;
          handleEvent(event);
        }
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        status: "",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  return { state, submit };
}
