import { useState, useCallback } from "react";
import type { AgUIEvent, StepProgressEvent } from "./types";
import type { AgentEvent } from "./useAgentStream";

export interface PrintStep {
  step: number;
  total: number;
  message: string;
  done: boolean;
}

interface PrintState {
  running: boolean;
  steps: PrintStep[];
  currentStep: number;
  text: string;
  status: string;
  events: AgentEvent[];
  error: string | null;
}

const INITIAL_STATE: PrintState = {
  running: false,
  steps: [],
  currentStep: 0,
  text: "",
  status: "",
  events: [],
  error: null,
};

export function usePrintAgentStream() {
  const [state, setState] = useState<PrintState>(INITIAL_STATE);

  const submit = useCallback(async (userRequest: string) => {
    setState({ ...INITIAL_STATE, running: true, status: "Connecting to print agent…" });

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    function log(type: string, detail: string) {
      setState((s) => ({
        ...s,
        events: [...s.events, { type, ts: Date.now(), detail }],
      }));
    }

    function updateLast(detail: string) {
      setState((s) => {
        if (s.events.length === 0) return s;
        const events = [...s.events];
        events[events.length - 1] = { ...events[events.length - 1], detail };
        return { ...s, events };
      });
    }

    let tokenCount = 0;

    function handleEvent(event: AgUIEvent) {
      switch (event.type) {
        case "RUN_STARTED":
          log("RUN_STARTED", "print agent started");
          setState((s) => ({ ...s, status: "Print agent is diagnosing your issue…" }));
          break;

        case "STEP_PROGRESS": {
          const e = event as StepProgressEvent;
          log("STEP_PROGRESS", `step ${e.step}/${e.total} · ${e.message}`);
          setState((s) => {
            const steps = [...s.steps];
            const updated = steps.map((st) =>
              st.step < e.step ? { ...st, done: true } : st
            );
            if (!updated.find((st) => st.step === e.step)) {
              updated.push({ step: e.step, total: e.total, message: e.message, done: false });
            }
            return { ...s, steps: updated, currentStep: e.step, status: e.message };
          });
          break;
        }

        case "TEXT_MESSAGE_START":
          tokenCount = 0;
          log("TEXT_MESSAGE_START", "resolution · 0 tokens");
          setState((s) => ({
            ...s,
            steps: s.steps.map((st) => ({ ...st, done: true })),
            status: "Analysis complete — generating resolution…",
          }));
          break;

        case "TEXT_MESSAGE_CONTENT":
          tokenCount++;
          updateLast(`resolution · ${tokenCount} tokens`);
          setState((s) => ({ ...s, text: s.text + event.delta }));
          break;

        case "RUN_FINISHED":
          log("RUN_FINISHED", "done");
          setState((s) => ({ ...s, running: false, status: "" }));
          break;

        case "RUN_ERROR":
          log("RUN_ERROR", event.message);
          setState((s) => ({ ...s, running: false, status: "", error: event.message }));
          break;
      }
    }

    try {
      const res = await fetch("http://localhost:8000/print-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          run_id: runId,
          messages: [{ role: "user", content: userRequest }],
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
          handleEvent(JSON.parse(json) as AgUIEvent);
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
