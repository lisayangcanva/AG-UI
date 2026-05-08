# Frontend

React 19 + TypeScript + Vite. Connects to the Spring Boot backend via the AG-UI streaming protocol.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
```

## Key files

| File | Purpose |
|------|---------|
| `src/useAgentStream.ts` | Reads the SSE stream from `POST /agent`, dispatches AG-UI events into React state |
| `src/types.ts` | Full AG-UI event type union |
| `src/App.tsx` | Ticket type selector, live agent stream panel, created ticket cards |
