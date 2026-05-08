import { useState } from "react";
import { useAgentStream } from "./useAgentStream";
import type { ToolProgress } from "./useAgentStream";
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
          <span
            className="tip-value tip-priority"
            style={{ color: PRIORITY_COLORS[progress.priority] }}
          >
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
            {progress.labels.map((l) => (
              <span key={l} className="label">{l}</span>
            ))}
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
        <span
          className="ticket-priority"
          style={{ color: PRIORITY_COLORS[ticket.priority] }}
        >
          {ticket.priority}
        </span>
      </div>
      <div className="ticket-title">{ticket.title}</div>
      <div className="ticket-description">{ticket.description}</div>
      {ticket.labels.length > 0 && (
        <div className="ticket-labels">
          {ticket.labels.map((l) => (
            <span key={l} className="label">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [ticketType, setTicketType] = useState<TicketType>("bug");
  const [request, setRequest] = useState("");
  const { state, submit } = useAgentStream();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || state.running) return;
    submit(ticketType, request.trim());
    setRequest("");
  }

  return (
    <div className="app">
      <header>
        <h1>AG-UI Ticket Agent</h1>
        <p>Describe your issue and the agent will create a structured ticket.</p>
      </header>

      <main>
        <section className="form-section">
          <form onSubmit={handleSubmit}>
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

            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={`Describe the ${ticketType}...`}
              rows={4}
              disabled={state.running}
            />

            <button
              type="submit"
              className="submit-btn"
              disabled={state.running || !request.trim()}
            >
              {state.running ? "Agent running…" : "Create Ticket"}
            </button>
          </form>

          {state.status && (
            <div className="agent-status">
              <span className="status-spinner" />
              {state.status}
            </div>
          )}
        </section>

        {(state.text || state.toolProgress || state.error) && (
          <section className="stream-section">
            <h2>Agent Stream</h2>

            {state.error && <div className="error">{state.error}</div>}

            {state.text && (
              <div className="agent-text">
                {state.text}
                {state.running && !state.toolProgress && <span className="cursor" />}
              </div>
            )}

            {state.toolProgress && (
              <TicketInProgress progress={state.toolProgress} />
            )}
          </section>
        )}

        {state.tickets.length > 0 && (
          <section className="tickets-section">
            <h2>Created Tickets</h2>
            <div className="tickets-list">
              {state.tickets.map((t) => (
                <TicketCard key={t.id} ticket={t} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
