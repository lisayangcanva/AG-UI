import { useState, useCallback, useEffect, useRef } from "react";
import { useAgentStream } from "./useAgentStream";
import { useSpeechRecognition } from "./useSpeechRecognition";
import type { ToolProgress, AgentEvent } from "./useAgentStream";
import type { TicketType, Ticket } from "./types";
import "./App.css";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

const EVENT_META: Record<string, { color: string; label: string }> = {
  RUN_STARTED:        { color: "#6366f1", label: "Run Started" },
  TEXT_MESSAGE_START: { color: "#22c55e", label: "Message Start" },
  TEXT_MESSAGE_END:   { color: "#22c55e", label: "Message End" },
  TOOL_CALL_START:    { color: "#f97316", label: "Tool Call" },
  TOOL_CALL_ARGS:     { color: "#fb923c", label: "Tool Args" },
  TOOL_CALL_END:      { color: "#f97316", label: "Tool Done" },
  STATE_SNAPSHOT:     { color: "#8b5cf6", label: "State Snapshot" },
  RUN_FINISHED:       { color: "#6366f1", label: "Run Finished" },
  RUN_ERROR:          { color: "#ef4444", label: "Error" },
};

function AgentStateTimeline({ events }: { events: AgentEvent[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<AgentEvent[]>([]);
  const queueRef = useRef<AgentEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const newEvents = events.slice(visible.length + queueRef.current.length);
    if (newEvents.length === 0) return;
    queueRef.current = [...queueRef.current, ...newEvents];
    if (!timerRef.current) drip();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    if (events.length === 0) {
      setVisible([]);
      queueRef.current = [];
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [events]);

  function drip() {
    if (queueRef.current.length === 0) { timerRef.current = null; return; }
    const next = queueRef.current.shift()!;
    setVisible((v) => [...v, next]);
    timerRef.current = setTimeout(drip, 180);
  }

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [visible]);

  if (visible.length === 0 && events.length === 0) return null;
  const startTs = events[0]?.ts ?? Date.now();

  return (
    <div className="state-timeline">
      <div className="timeline-header">
        <span>AG-UI Event Stream</span>
        <span className="timeline-count">{visible.length} / {events.length}</span>
      </div>
      <div className="timeline-body" ref={bodyRef}>
        {visible.map((ev, i) => {
          const meta = EVENT_META[ev.type] ?? { color: "#94a3b8", label: ev.type };
          const elapsed = ((ev.ts - startTs) / 1000).toFixed(2);
          return (
            <div key={i} className="timeline-row">
              <span className="timeline-ts">+{elapsed}s</span>
              <span className="timeline-dot" style={{ background: meta.color }} />
              <span className="timeline-type" style={{ color: meta.color }}>{meta.label}</span>
              {ev.detail && <span className="timeline-detail">{ev.detail}</span>}
            </div>
          );
        })}
        {queueRef.current.length > 0 && (
          <div className="timeline-cursor">▋</div>
        )}
      </div>
    </div>
  );
}

function TicketInProgress({ progress }: { progress: ToolProgress }) {
  return (
    <div className="ticket-in-progress">
      <div className="tip-header">
        <span className="status-spinner" />
        Writing ticket…
      </div>
      {progress.type && (
        <div className="tip-row">
          <span className="tip-label">Type</span>
          <span className="tip-value tip-type">{progress.type}</span>
        </div>
      )}
      {progress.priority && (
        <div className="tip-row">
          <span className="tip-label">Priority</span>
          <span className="tip-value tip-priority" style={{ color: PRIORITY_COLORS[progress.priority] }}>
            {PRIORITY_LABELS[progress.priority] ?? progress.priority}
          </span>
        </div>
      )}
      {progress.title && (
        <div className="tip-row">
          <span className="tip-label">Title</span>
          <span className="tip-value">{progress.title}<span className="cursor" /></span>
        </div>
      )}
      {progress.description && (
        <div className="tip-row tip-row--block">
          <span className="tip-label">Description</span>
          <span className="tip-value tip-description">{progress.description}<span className="cursor" /></span>
        </div>
      )}
      {progress.labels.length > 0 && (
        <div className="tip-row">
          <span className="tip-label">Labels</span>
          <span className="tip-value">
            {progress.labels.map((l) => <span key={l} className="label">{l}</span>)}
          </span>
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="ticket-card">
      <div className="ticket-header">
        <span className="ticket-id">{ticket.id}</span>
        <span className="ticket-type">{ticket.type}</span>
        <span className="ticket-priority" style={{ color: PRIORITY_COLORS[ticket.priority] }}>
          {ticket.priority}
        </span>
      </div>
      <div className="ticket-title">{ticket.title}</div>
      <div className="ticket-description">{ticket.description}</div>
      {ticket.labels.length > 0 && (
        <div className="ticket-labels">
          {ticket.labels.map((l) => <span key={l} className="label">{l}</span>)}
        </div>
      )}
    </div>
  );
}

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="elapsed-timer">
      {m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`}
    </span>
  );
}

export default function App() {
  const [ticketType] = useState<TicketType>("bug");
  const [request, setRequest] = useState("");
  const { state, submit, abort, dismissToast } = useAgentStream();
  const handleTranscript = useCallback((text: string) => setRequest(text), []);
  const speech = useSpeechRecognition(handleTranscript);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || state.running) return;
    if (speech.listening) speech.toggle();
    submit(ticketType, request.trim());
    setRequest("");
  }

  function handleCancel() {
    abort();
    if (speech.listening) speech.toggle();
  }

  return (
    <div className="app">
      <header>
        <h1>AG-UI Ticket Agent</h1>
        <p>Describe your bug and the agent will create a structured ticket.</p>
      </header>

      <main>
        <section className="form-section">
          <form onSubmit={handleSubmit}>
            <div className="textarea-wrapper">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder={speech.listening ? "Listening… speak your issue" : "Describe the bug…"}
                rows={4}
                disabled={state.running}
              />
              {speech.supported && (
                <button
                  type="button"
                  className={`mic-btn ${speech.listening ? "mic-btn--active" : ""}`}
                  onClick={speech.toggle}
                  disabled={state.running}
                  title={speech.listening ? "Stop recording" : "Speak your issue"}
                >
                  <MicIcon active={speech.listening} />
                  {speech.listening && <span className="mic-pulse" />}
                </button>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={state.running || !request.trim()}
              >
                {state.running ? "Agent running…" : "Create Ticket"}
              </button>
              {state.running && (
                <button type="button" className="cancel-btn" onClick={handleCancel}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          {state.cancelled && (
            <div className="notice notice--cancelled">
              Request cancelled.
            </div>
          )}

          {state.running && state.status && (
            <div className="agent-status">
              <span className="status-spinner" />
              {state.backgrounded ? "Working in background — feel free to step away" : state.status}
              <ElapsedTimer running={state.running} />
            </div>
          )}

          {state.events.length > 0 && !state.backgrounded && (
            <AgentStateTimeline events={state.events} />
          )}
        </section>

        {state.toastReady && (
          <div className="toast" role="alert">
            <span className="toast-icon">✓</span>
            <span className="toast-msg">Ticket ready — scroll down to view it.</span>
            <button className="toast-close" onClick={dismissToast} aria-label="Dismiss">×</button>
          </div>
        )}

        {(state.text || state.toolProgress || state.error) && !state.backgrounded && (
          <section className="stream-section">
            {state.error && <div className="error">{state.error}</div>}
            {state.text && (
              <div className="agent-text">
                {state.text}
                {state.running && !state.toolProgress && <span className="cursor" />}
              </div>
            )}
            {state.toolProgress && <TicketInProgress progress={state.toolProgress} />}
          </section>
        )}

        {state.tickets.length > 0 && (
          <section className="tickets-section">
            <h2>Created Tickets</h2>
            <div className="tickets-list">
              {state.tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
