# AG-UI Agent

[![Interactive Demo](https://img.shields.io/badge/🌐%20Interactive%20Demo-View%20Site-6366f1?style=for-the-badge)](https://lisayangcanva.github.io/AG-UI/)

> **[👉 Click here to view the full interactive demo site](https://lisayangcanva.github.io/AG-UI/)**

A spike project demonstrating the [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) — a streaming event protocol that connects AI agent backends to a React frontend in real time.

The app hosts one agent:
- **Ticket Agent** — accepts a natural-language description, calls GPT-4.1 to produce a structured ticket via tool use, and streams every step back to the UI as it happens.

The agent supports **voice input** via the browser's Web Speech API, a **cancel button** to abort at any time, and a **background mode** for slow requests (see UX features below).

---

## Why this is an AG-UI project

AG-UI is a wire protocol — it defines a standard set of event types, event shapes, and a transport (SSE over HTTP) that any agent backend can emit and any frontend can consume. This project implements that contract end-to-end.

### What AG-UI specifies

AG-UI defines three things:

1. **Standard event type names** — what events an agent must emit
2. **Standard event shapes** — what fields each event carries
3. **Standard transport** — Server-Sent Events (SSE) over HTTP POST, one JSON object per `data:` line

### What SSE is

SSE (Server-Sent Events) is a browser technology that lets the server push data to the client over a single long-lived HTTP connection — without the client polling.

```
Normal HTTP:   client asks → server replies → connection closes (repeat)
SSE:           client asks → server streams chunks → connection stays open until done
```

Each chunk is a line starting with `data:`:

```
data: {"type":"RUN_STARTED","thread_id":"..."}
data: {"type":"TEXT_MESSAGE_CONTENT","delta":"I'll"}
data: {"type":"TEXT_MESSAGE_CONTENT","delta":" create"}
data: {"type":"RUN_FINISHED"}
```

SSE is ideal for AI agents because tokens only flow one way — from the model to the browser.

### The full AG-UI event type standard

#### Lifecycle events
| Event | When | Required fields |
|---|---|---|
| `RUN_STARTED` | Agent begins processing | `thread_id`, `run_id` |
| `RUN_FINISHED` | Agent completed successfully | `thread_id`, `run_id` |
| `RUN_ERROR` | Agent failed | `message` |

#### Text message events
Used when the agent streams natural language text. Always appear as a group: `START` → many `CONTENT` → `END`.

| Event | When | Required fields |
|---|---|---|
| `TEXT_MESSAGE_START` | New assistant message begins | `message_id`, `role` |
| `TEXT_MESSAGE_CONTENT` | One token of streamed text | `message_id`, `delta` |
| `TEXT_MESSAGE_END` | Message complete | `message_id` |

#### Tool call events
Used when the agent invokes a tool (function calling). Arguments stream in character by character.

| Event | When | Required fields |
|---|---|---|
| `TOOL_CALL_START` | Agent starts invoking a tool | `tool_call_id`, `tool_call_name`, `parent_message_id` |
| `TOOL_CALL_ARGS` | One JSON fragment of tool arguments | `tool_call_id`, `delta` |
| `TOOL_CALL_END` | Tool arguments complete | `tool_call_id` |

#### State events
| Event | When | Required fields |
|---|---|---|
| `STATE_SNAPSHOT` | Full current state pushed to client | `snapshot` |
| `STATE_DELTA` | Partial state update (JSON patch) | `delta` |
| `MESSAGES_SNAPSHOT` | Full message history | `messages` |

#### Step events (standard)
| Event | When | Required fields |
|---|---|---|
| `STEP_STARTED` | A named agent step begins | `step_name` |
| `STEP_FINISHED` | A named agent step ends | `step_name` |

### What this project implements

| Event | Status | Where |
|---|---|---|
| `RUN_STARTED` | ✅ Implemented | Ticket Agent |
| `RUN_FINISHED` | ✅ Implemented | Ticket Agent |
| `RUN_ERROR` | ✅ Implemented | Ticket Agent |
| `TEXT_MESSAGE_START` | ✅ Implemented | Ticket Agent |
| `TEXT_MESSAGE_CONTENT` | ✅ Implemented | Ticket Agent |
| `TEXT_MESSAGE_END` | ✅ Implemented | Ticket Agent |
| `TOOL_CALL_START` | ✅ Implemented | Ticket Agent |
| `TOOL_CALL_ARGS` | ✅ Implemented | Ticket Agent |
| `TOOL_CALL_END` | ✅ Implemented | Ticket Agent |
| `STATE_SNAPSHOT` | ✅ Implemented | Ticket Agent |
| `STATE_DELTA` | ❌ Not implemented | — |
| `MESSAGES_SNAPSHOT` | ❌ Not implemented | — |
| `STEP_STARTED/FINISHED` | ❌ Not implemented | — |

### Where the protocol lives in the code

| File | Role |
|---|---|
| `frontend/src/types.ts` | TypeScript definitions of every AG-UI event type and shape |
| `backend/.../TicketAgent.java` | Emits AG-UI events over SSE as the agent runs |
| `backend/.../AgentController.java` | Exposes the `text/event-stream` HTTP endpoint |
| `frontend/src/useAgentStream.ts` | Reads the SSE stream and dispatches by `event.type` |
| `frontend/src/App.tsx` | Renders state driven entirely by AG-UI events |

The key point: the backend can use any AI model and the frontend can be any framework — as long as the backend emits the right event types in the right shapes over SSE, they interoperate. That is what AG-UI gives you.

---

## Architecture

```
frontend (React + TypeScript + Vite)
    │
    │  POST /agent    (Ticket Agent — SSE stream)
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

---

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
│       │   └── TicketAgent.java            # ticket creation via tool use + slow-request simulation
│       ├── controller/
│       │   └── AgentController.java        # POST /agent, GET /tickets
│       └── model/
│           ├── Message.java
│           ├── RunAgentInput.java
│           └── Ticket.java
└── frontend/
    └── src/
        ├── App.tsx                         # form, stream panel, background mode, toast
        ├── useAgentStream.ts               # SSE hook with background mode + browser notifications
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

## UX features for long-running requests

| Feature | Behaviour |
|---|---|
| **Streaming** | Reasoning text, tool args, and summary all stream token by token from the first response |
| **Elapsed timer** | Live `0s … 1:02` counter in the status bar proves the connection is alive |
| **Background mode** | If a run is still going at **10 seconds**, the stream panel hides and the status bar reads "Working in background — feel free to step away". The user can navigate away or start a new request |
| **Toast notification** | When a background run completes, a green toast banner appears: "Ticket ready — scroll down to view it." Dismissible with × |
| **Browser push notification** | At the 10s mark the browser requests notification permission. When the ticket is ready a system notification fires — visible even if the tab is in the background or the browser is minimised |
| **Cancel button** | Appears as soon as the agent starts. Aborts the SSE connection immediately and shows a "Request cancelled." notice |

### Slow-request simulation

The backend detects the word **"print"** in the user's message and deliberately sleeps 12 seconds before processing, triggering the full background-mode flow. All other requests complete in normal time.

## Notes

- The in-memory ticket store (`ConcurrentHashMap` in `TicketAgent`) resets on server restart — intentional for a spike.
- `TicketAgent` runs on `Schedulers.boundedElastic()` so blocking OpenAI calls don't prevent Spring from flushing SSE events immediately.
- CORS is configured for `http://localhost:5173` only.
- Frontend type imports use `import type` syntax, required by `verbatimModuleSyntax: true` in `tsconfig.app.json`.
- Browser push notifications require both browser-level and macOS-level permission to be granted. If notifications don't appear, check **System Settings → Notifications** and ensure your browser is allowed.
