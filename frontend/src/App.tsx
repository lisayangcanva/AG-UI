import { useState } from "react";
import { useAgentStream } from "./useAgentStream";
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
        </section>

        {(state.text || state.activeToolCall || state.error) && (
          <section className="stream-section">
            <h2>Agent Stream</h2>

            {state.error && <div className="error">{state.error}</div>}

            {state.text && (
              <div className="agent-text">
                {state.text}
                {state.running && <span className="cursor" />}
              </div>
            )}

            {state.activeToolCall && (
              <div className="tool-call">
                <div className="tool-call-header">
                  Calling <strong>{state.activeToolCall.name}</strong>…
                </div>
                <pre className="tool-args">{state.activeToolCall.args || "…"}</pre>
              </div>
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
