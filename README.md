# AG-UI Ticket Agent

A spike project demonstrating the [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) — a streaming event protocol that connects an AI agent backend to a React frontend in real time.

The agent accepts a natural-language description, calls Claude to produce a structured ticket via tool use, and streams every step of that process back to the UI as it happens.

## Architecture

```
frontend (React + TypeScript + Vite)
    │
    │  POST /agent   (SSE stream)
    ▼
backend (Spring Boot + Java 21)
    │
    │  Anthropic SDK (streaming)
    ▼
Claude claude-sonnet-4-6
```

### AG-UI event flow

```
RUN_STARTED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT  ← streamed token by token
TOOL_CALL_START
TOOL_CALL_ARGS        ← streamed JSON fragment by fragment
TOOL_CALL_END
TEXT_MESSAGE_END
STATE_SNAPSHOT        ← full ticket list
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT  ← summary, streamed
TEXT_MESSAGE_END
RUN_FINISHED
```

## Prerequisites

| Tool | Version |
|------|---------|
| Java | 21+ |
| Maven | 3.9+ |
| Node.js | 18+ |
| Anthropic API key | — |

## Quick start

### 1. Backend

```bash
cd backend
export ANTHROPIC_API_KEY=your_key_here
mvn spring-boot:run
```

Starts on **http://localhost:8000**.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on **http://localhost:5173**.

## Project structure

```
AG-UI/
├── backend/
│   ├── pom.xml
│   └── src/main/java/com/agui/
│       ├── Application.java
│       ├── agent/
│       │   └── TicketAgent.java        # streaming agent + tool execution
│       ├── controller/
│       │   └── AgentController.java    # POST /agent, GET /tickets
│       └── model/
│           ├── Message.java
│           ├── RunAgentInput.java
│           └── Ticket.java
└── frontend/
    └── src/
        ├── App.tsx                     # ticket type selector, stream panel, ticket cards
        ├── useAgentStream.ts           # SSE reader, AG-UI event dispatcher
        └── types.ts                    # AG-UI event type union
```

## API

### `POST /agent`

Runs the agent. Returns an SSE stream of AG-UI events.

**Request body**

```json
{
  "thread_id": "uuid",
  "run_id": "uuid",
  "messages": [
    { "role": "user", "content": "Login button breaks on Safari when 2FA is enabled" }
  ]
}
```

**Response** — `text/event-stream`, one JSON object per `data:` line:

```
data: {"type":"RUN_STARTED","thread_id":"...","run_id":"..."}
data: {"type":"TEXT_MESSAGE_START","message_id":"...","role":"assistant"}
data: {"type":"TEXT_MESSAGE_CONTENT","message_id":"...","delta":"I'll create"}
...
data: {"type":"TOOL_CALL_START","tool_call_id":"...","tool_call_name":"create_ticket","parent_message_id":"..."}
data: {"type":"TOOL_CALL_ARGS","tool_call_id":"...","delta":"{\"type\":\"bug\""}
...
data: {"type":"STATE_SNAPSHOT","snapshot":{"tickets":[...]}}
data: {"type":"RUN_FINISHED","thread_id":"...","run_id":"..."}
```

### `GET /tickets`

Returns all tickets created in the current server session.

```json
[
  {
    "id": "TKT-3F2A1B4C",
    "type": "bug",
    "title": "Login button unresponsive on Safari with 2FA",
    "description": "...",
    "priority": "high",
    "labels": ["auth", "safari", "frontend"]
  }
]
```

## Ticket types

| Type | When to use |
|------|------------|
| `bug` | Something is broken; agent focuses on reproduction steps and expected vs actual behaviour |
| `feature` | New functionality; agent focuses on user value and acceptance criteria |
| `task` | Work item; agent focuses on definition of done and dependencies |

## Notes

- The in-memory ticket store (`ConcurrentHashMap` in `TicketAgent`) resets on server restart — intentional for a spike.
- The backend makes two Claude calls per request: one streaming call to generate text and invoke the tool, then a second non-streaming call to obtain a structured `Message` object for the follow-up turn.
- CORS is configured for `http://localhost:5173` only.
