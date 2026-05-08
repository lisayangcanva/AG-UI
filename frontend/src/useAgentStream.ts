import { useState, useCallback, useRef } from "react";
import type { AgUIEvent, Ticket, TicketType } from "./types";

export interface ToolProgress {
  title: string;
  description: string;
  priority: string;
  type: string;
  labels: string[];
}

export interface AgentEvent {
  type: string;
  ts: number;
  detail: string;
}

interface StreamState {
  running: boolean;
  text: string;
  toolProgress: ToolProgress | null;
  tickets: Ticket[];
  status: string;
  events: AgentEvent[];
  error: string | null;
  backgrounded: boolean;
  toastReady: boolean;
  cancelled: boolean;
}

const INITIAL_STATE: StreamState = {
  running: false,
  text: "",
  toolProgress: null,
  tickets: [],
  status: "",
  events: [],
  error: null,
  backgrounded: false,
  toastReady: false,
  cancelled: false,
};

function parsePartialJson(raw: string): Partial<ToolProgress> {
  const result: Partial<ToolProgress> = {};

  const extract = (field: string): string | null => {
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"?`);
    const m = raw.match(re);
    return m ? m[1] : null;
  };

  const title = extract("title");
  if (title) result.title = title;

  const description = extract("description");
  if (description) result.description = description;

  const priority = extract("priority");
  if (priority) result.priority = priority;

  const type = extract("type");
  if (type) result.type = type;

  const labelsMatch = raw.match(/"labels"\s*:\s*\[([^\]]*)/);
  if (labelsMatch) {
    result.labels = labelsMatch[1]
      .split(",")
      .map((s) => s.replace(/"/g, "").trim())
      .filter(Boolean);
  }

  return result;
}

export function useAgentStream() {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const rawArgsRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false, status: "", cancelled: true }));
  }, []);

  const dismissToast = useCallback(() => {
    setState((s) => ({ ...s, toastReady: false }));
  }, []);

  const submit = useCallback(async (ticketType: TicketType, userRequest: string) => {
    setState({ ...INITIAL_STATE, running: true, status: "Starting…" });
    rawArgsRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    let messageCount = 0;

    // After 30s switch to background and request notification permission
    const backgroundTimer = setTimeout(async () => {
      setState((s) => {
        if (!s.running) return s;
        return { ...s, backgrounded: true, status: "Working in background…" };
      });
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    }, 10_000);

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
    let argCharCount = 0;

    function handleEvent(event: AgUIEvent) {
      switch (event.type) {
        case "RUN_STARTED":
          log("RUN_STARTED", `thread=${threadId.slice(0, 8)}…`);
          setState((s) => ({ ...s, status: "Analysing your request…" }));
          break;

        case "TEXT_MESSAGE_START":
          messageCount++;
          tokenCount = 0;
          log("TEXT_MESSAGE_START", messageCount === 1 ? "reasoning · 0 tokens" : "summary · 0 tokens");
          setState((s) => ({
            ...s,
            status: messageCount === 1 ? "Thinking…" : "Writing summary…",
          }));
          break;

        case "TEXT_MESSAGE_CONTENT":
          tokenCount++;
          updateLast(messageCount === 1 ? `reasoning · ${tokenCount} tokens` : `summary · ${tokenCount} tokens`);
          setState((s) => ({ ...s, text: s.text + event.delta }));
          break;

        case "TOOL_CALL_START":
          rawArgsRef.current = "";
          argCharCount = 0;
          log("TOOL_CALL_START", `${event.tool_call_name} · 0 chars`);
          setState((s) => ({
            ...s,
            status: "Building ticket…",
            toolProgress: { title: "", description: "", priority: "", type: "", labels: [] },
          }));
          break;

        case "TOOL_CALL_ARGS":
          rawArgsRef.current += event.delta;
          argCharCount += event.delta.length;
          updateLast(`${event.tool_call_name ?? "create_ticket"} · ${argCharCount} chars`);
          // eslint-disable-next-line no-case-declarations
          const parsed = parsePartialJson(rawArgsRef.current);
          setState((s) => {
            if (!s.toolProgress) return s;
            return {
              ...s,
              toolProgress: {
                title: parsed.title ?? s.toolProgress.title,
                description: parsed.description ?? s.toolProgress.description,
                priority: parsed.priority ?? s.toolProgress.priority,
                type: parsed.type ?? s.toolProgress.type,
                labels: parsed.labels ?? s.toolProgress.labels,
              },
            };
          });
          break;

        case "TOOL_CALL_END":
          log("TOOL_CALL_END", "args complete");
          setState((s) => ({
            ...s,
            status: "Ticket created — generating summary…",
          }));
          break;

        case "STATE_SNAPSHOT":
          log("STATE_SNAPSHOT", `${event.snapshot.tickets.length} ticket(s)`);
          setState((s) => ({ ...s, tickets: event.snapshot.tickets, toolProgress: null }));
          break;

        case "RUN_FINISHED":
          clearTimeout(backgroundTimer);
          log("RUN_FINISHED", "done");
          setState((s) => {
            if (s.backgrounded && "Notification" in window && Notification.permission === "granted") {
              new Notification("Ticket ready", {
                body: "Your ticket has been created. Click to view it.",
                icon: "/favicon.svg",
              });
            }
            return { ...s, running: false, status: "", toastReady: s.backgrounded };
          });
          break;

        case "RUN_ERROR":
          clearTimeout(backgroundTimer);
          log("RUN_ERROR", event.message);
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
        signal: controller.signal,
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
      clearTimeout(backgroundTimer);
      if (err instanceof Error && err.name === "AbortError") return;
      setState((s) => ({
        ...s,
        running: false,
        status: "",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  return { state, submit, abort, dismissToast };
}
