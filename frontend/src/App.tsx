import { useState, useCallback, useEffect, useRef } from "react";
import { useAgentStream } from "./useAgentStream";
import { usePrintAgentStream } from "./usePrintAgentStream";
import { useSpeechRecognition } from "./useSpeechRecognition";
import type { ToolProgress, AgentEvent } from "./useAgentStream";
import type { PrintStep } from "./usePrintAgentStream";
import type { TicketType, Ticket } from "./types";
import "./App.css";

const TICKET_TYPES: { value: TicketType; label: string; icon: string }[] = [
  { value: "bug", label: "Bug", icon: "🐛" },
  { value: "feature", label: "Feature", icon: "✨" },
  { value: "task", label: "Task", icon: "📋" },
];

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

function PrinterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function PrintProgressPanel({ steps, status, running }: {
  steps: PrintStep[];
  status: string;
  running: boolean;
}) {
  const progressPct = steps.length === 0
    ? 0
    : Math.round((steps.filter((s) => s.done).length / (steps[0]?.total ?? 5)) * 100);

  return (
    <div className="print-panel">
      <div className="print-panel-header">
        <PrinterIcon />
        <span>Print Agent is diagnosing your issue</span>
        {running && <span className="status-spinner" style={{ marginLeft: "auto" }} />}
      </div>

      {steps.length > 0 && (
        <>
          <div className="print-progress-bar">
            <div className="print-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <ul className="print-steps">
            {steps.map((s) => (
              <li key={s.step} className={`print-step ${s.done ? "print-step--done" : "print-step--active"}`}>
                <span className="print-step-icon">
                  {s.done ? "✓" : <span className="status-spinner print-step-spinner" />}
                </span>
                {s.message}
              </li>
            ))}
            {running && steps.length > 0 && !steps[steps.length - 1].done && status !== steps[steps.length - 1].message && (
              <li className="print-step print-step--waiting">
                <span className="print-step-icon">·</span>
                {status}
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

const EVENT_META: Record<string, { color: string; label: string }> = {
  RUN_STARTED:        { color: "#6366f1", label: "Run Started" },
  TEXT_MESSAGE_START: { color: "#22c55e", label: "Message Start" },
  TEXT_MESSAGE_END:   { color: "#22c55e", label: "Message End" },
  TOOL_CALL_START:    { color: "#f97316", label: "Tool Call" },
  TOOL_CALL_END:      { color: "#f97316", label: "Tool Done" },
  STATE_SNAPSHOT:     { color: "#8b5cf6", label: "State Snapshot" },
  STEP_PROGRESS:      { color: "#06b6d4", label: "Step Progress" },
  RUN_FINISHED:       { color: "#6366f1", label: "Run Finished" },
  RUN_ERROR:          { color: "#ef4444", label: "Error" },
};

function AgentStateTimeline({ events }: { events: AgentEvent[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events]);

  if (events.length === 0) return null;
  const startTs = events[0].ts;
  return (
    <div className="state-timeline">
      <div className="timeline-header">
        <span>AG-UI Event Stream</span>
        <span className="timeline-count">{events.length} events</span>
      </div>
      <div className="timeline-body" ref={bodyRef}>
        {events.map((ev, i) => {
          const meta = EVENT_META[ev.type] ?? { color: "#94a3b8", label: ev.type };
          const elapsed = ((ev.ts - startTs) / 1000).toFixed(2);
          return (
            <div
              key={i}
              className="timeline-row"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="timeline-ts">+{elapsed}s</span>
              <span className="timeline-dot" style={{ background: meta.color }} />
              <span className="timeline-type" style={{ color: meta.color }}>{meta.label}</span>
              {ev.detail && <span className="timeline-detail">{ev.detail}</span>}
            </div>
          );
        })}
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

type Mode = "ticket" | "print";

export default function App() {
  const [mode, setMode] = useState<Mode>("ticket");
  const [ticketType, setTicketType] = useState<TicketType>("bug");
  const [request, setRequest] = useState("");

  const { state: ticketState, submit: submitTicket } = useAgentStream();
  const { state: printState, submit: submitPrint } = usePrintAgentStream();

  const activeRunning = mode === "ticket" ? ticketState.running : printState.running;

  const handleTranscript = useCallback((text: string) => setRequest(text), []);
  const speech = useSpeechRecognition(handleTranscript);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || activeRunning) return;
    if (speech.listening) speech.toggle();
    if (mode === "ticket") {
      submitTicket(ticketType, request.trim());
    } else {
      submitPrint(request.trim());
    }
    setRequest("");
  }

  return (
    <div className="app">
      <header>
        <h1>AG-UI Agent</h1>
        <p>Describe your issue and the agent will handle it.</p>
      </header>

      <main>
        <section className="form-section">
          {/* Mode switcher */}
          <div className="mode-selector">
            <button
              type="button"
              className={`mode-btn ${mode === "ticket" ? "active" : ""}`}
              onClick={() => setMode("ticket")}
            >
              Ticket Agent
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === "print" ? "active" : ""}`}
              onClick={() => setMode("print")}
            >
              <PrinterIcon /> Print Agent
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === "ticket" && (
              <div className="type-selector">
                {TICKET_TYPES.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={`type-btn ${ticketType === value ? "active" : ""}`}
                    onClick={() => setTicketType(value)}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            )}

            <div className="textarea-wrapper">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder={
                  speech.listening
                    ? "Listening… speak your issue"
                    : mode === "print"
                    ? "Describe your print issue…"
                    : `Describe the ${ticketType}…`
                }
                rows={4}
                disabled={activeRunning}
              />
              {speech.supported && (
                <button
                  type="button"
                  className={`mic-btn ${speech.listening ? "mic-btn--active" : ""}`}
                  onClick={speech.toggle}
                  disabled={activeRunning}
                  title={speech.listening ? "Stop recording" : "Speak your issue"}
                >
                  <MicIcon active={speech.listening} />
                  {speech.listening && <span className="mic-pulse" />}
                </button>
              )}
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={activeRunning || !request.trim()}
            >
              {activeRunning
                ? mode === "print" ? "Print agent running…" : "Agent running…"
                : mode === "print" ? "Diagnose Print Issue" : "Create Ticket"}
            </button>
          </form>

          {mode === "ticket" && ticketState.status && (
            <div className="agent-status">
              <span className="status-spinner" />
              {ticketState.status}
            </div>
          )}

          {mode === "ticket" && ticketState.events.length > 0 && (
            <AgentStateTimeline events={ticketState.events} />
          )}
          {mode === "print" && printState.events.length > 0 && (
            <AgentStateTimeline events={printState.events} />
          )}
        </section>

        {/* Print agent output */}
        {mode === "print" && (printState.running || printState.steps.length > 0 || printState.error) && (
          <section className="stream-section">
            {printState.error && <div className="error">{printState.error}</div>}
            {(printState.running || printState.steps.length > 0) && (
              <PrintProgressPanel
                steps={printState.steps}
                status={printState.status}
                running={printState.running}
              />
            )}
            {printState.text && (
              <div className="agent-text">
                {printState.text}
                {printState.running && <span className="cursor" />}
              </div>
            )}
          </section>
        )}

        {/* Ticket agent output */}
        {mode === "ticket" && (ticketState.text || ticketState.toolProgress || ticketState.error) && (
          <section className="stream-section">
            {ticketState.error && <div className="error">{ticketState.error}</div>}
            {ticketState.text && (
              <div className="agent-text">
                {ticketState.text}
                {ticketState.running && !ticketState.toolProgress && <span className="cursor" />}
              </div>
            )}
            {ticketState.toolProgress && <TicketInProgress progress={ticketState.toolProgress} />}
          </section>
        )}

        {mode === "ticket" && ticketState.tickets.length > 0 && (
          <section className="tickets-section">
            <h2>Created Tickets</h2>
            <div className="tickets-list">
              {ticketState.tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
