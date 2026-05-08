import { useState, useCallback } from "react";
import type { AgUIEvent, StepProgressEvent } from "./types";

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
  error: string | null;
}

const INITIAL_STATE: PrintState = {
  running: false,
  steps: [],
  currentStep: 0,
  text: "",
  status: "",
  error: null,
};

export function usePrintAgentStream() {
  const [state, setState] = useState<PrintState>(INITIAL_STATE);

  const submit = useCallback(async (userRequest: string) => {
    setState({ ...INITIAL_STATE, running: true, status: "Connecting to print agent…" });

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    function handleEvent(event: AgUIEvent) {
      switch (event.type) {
        case "RUN_STARTED":
          setState((s) => ({ ...s, status: "Print agent is diagnosing your issue…" }));
          break;

        case "STEP_PROGRESS": {
          const e = event as StepProgressEvent;
          setState((s) => {
            const steps = [...s.steps];
            // mark previous steps as done
            const updated = steps.map((st) =>
              st.step < e.step ? { ...st, done: true } : st
            );
            // add the new step if not already present
            if (!updated.find((st) => st.step === e.step)) {
              updated.push({ step: e.step, total: e.total, message: e.message, done: false });
            }
            return { ...s, steps: updated, currentStep: e.step, status: e.message };
          });
          break;
        }

        case "TEXT_MESSAGE_START":
          setState((s) => ({
            ...s,
            // mark all steps done when analysis starts
            steps: s.steps.map((st) => ({ ...st, done: true })),
            status: "Analysis complete — generating resolution…",
          }));
          break;

        case "TEXT_MESSAGE_CONTENT":
          setState((s) => ({ ...s, text: s.text + event.delta }));
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
