# AG-UI Agent

A spike project demonstrating the [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) — a streaming event protocol that connects AI agent backends to a React frontend in real time.

The app hosts two agents:
- **Ticket Agent** — accepts a natural-language description, calls GPT-4.1 to produce a structured ticket via tool use, and streams every step back to the UI as it happens.
- **Print Agent** — diagnoses print issues with a live 5-step progress panel, then streams a practical resolution.

Both agents support **voice input** via the browser's Web Speech API.

## Architecture

```
frontend (React + TypeScript + Vite)
    │
    │  POST /agent          (Ticket Agent — SSE stream)
    │  POST /print-agent    (Print Agent  — SSE stream)
    ▼
backend (Spring Boot + Java 21)
    │
    │  OpenAI Java SDK (streaming)
    ▼
GPT-4.1
```

### AG-UI event flow — Ticket Agent

```
RUN_STARTED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT  ← agent reasoning, streamed token by token
TOOL_CALL_START
TOOL_CALL_ARGS        ← ticket fields streamed JSON fragment by fragment
TOOL_CALL_END
TEXT_MESSAGE_END
STATE_SNAPSHOT        ← full ticket list
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT  ← summary, streamed
TEXT_MESSAGE_END
RUN_FINISHED
```

### AG-UI event flow — Print Agent

```
RUN_STARTED
STEP_PROGRESS × 5     ← one per second, each describing a diagnostic step
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT  ← resolution, streamed token by token
TEXT_MESSAGE_END
RUN_FINISHED
```

## Prerequisites

| Tool | Version |
|------|---------|
| Java | 21+ |
| Maven | 3.9+ |
| Node.js | 18+ |
| OpenAI API key + Org ID | — |

## Quick start

### 1. Backend

Copy `.env.example` to `.dev.properties` and fill in your credentials:

```bash
cp backend/.env.example backend/.dev.properties
```

Edit `backend/.dev.properties`:

```properties
OPENAI_API_KEY=your_key_here
OPENAI_ORG_ID=your_org_id_here
```

Then start the server:

```bash
cd backend
mvn spring-boot:run
```

Starts on **http://localhost:8000**.

> `.dev.properties` is gitignored and will never be committed.

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
│   ├── .env.example                        # template for .dev.properties
│   ├── .dev.properties                     # local credentials (gitignored)
│   ├── pom.xml
│   └── src/main/java/com/agui/
│       ├── Application.java
│       ├── agent/
│       │   ├── TicketAgent.java            # ticket creation via tool use
│       │   └── PrintAgent.java             # print diagnostics with staged progress
│       ├── controller/
│       │   └── AgentController.java        # POST /agent, POST /print-agent, GET /tickets
│       └── model/
│           ├── Message.java
│           ├── RunAgentInput.java
│           └── Ticket.java
└── frontend/
    └── src/
        ├── App.tsx                         # mode switcher, forms, stream panels
        ├── useAgentStream.ts               # ticket agent SSE hook
        ├── usePrintAgentStream.ts          # print agent SSE hook with step tracking
        ├── useSpeechRecognition.ts         # Web Speech API voice input hook
        └── types.ts                        # AG-UI event type union
```

## API

### `POST /agent`

Runs the Ticket Agent. Returns an SSE stream of AG-UI events.

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

### `POST /print-agent`

Runs the Print Agent. Returns an SSE stream with live diagnostic steps followed by a resolution.

**Request body** — same shape as `/agent`.

**Response** — `text/event-stream`:

```
data: {"type":"RUN_STARTED","thread_id":"...","run_id":"..."}
data: {"type":"STEP_PROGRESS","step":1,"total":5,"message":"Connecting to print spooler..."}
data: {"type":"STEP_PROGRESS","step":2,"total":5,"message":"Checking printer status..."}
...
data: {"type":"TEXT_MESSAGE_CONTENT","message_id":"...","delta":"The most likely cause..."}
...
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

## Voice input

Click the microphone icon in the textarea to speak your issue. The transcript populates the text field in real time. Click the mic again (or submit) to stop recording.

- Supported: Chrome, Edge
- Requires permission grant: Safari (enable in settings)
- Not supported: Firefox

## Notes

- The in-memory ticket store (`ConcurrentHashMap` in `TicketAgent`) resets on server restart — intentional for a spike.
- The Print Agent deliberately sleeps 1 second between each of its 5 diagnostic steps to simulate real processing time.
- CORS is configured for `http://localhost:5173` only.
- Frontend type imports use `import type` syntax, required by `verbatimModuleSyntax: true` in `tsconfig.app.json`.
