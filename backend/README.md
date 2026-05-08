# Backend – AG-UI Ticket Agent (Spring Boot)

FastAPI replaced with Spring Boot + WebFlux, implementing the AG-UI streaming protocol over SSE.

## Requirements

- Java 21+
- Maven 3.9+

## Setup

```bash
export ANTHROPIC_API_KEY=your_key_here
```

## Run

```bash
mvn spring-boot:run
```

Server starts on port **8000**.

## Endpoints

| Method | Path      | Description                            |
|--------|-----------|----------------------------------------|
| POST   | `/agent`  | AG-UI streaming endpoint (SSE)         |
| GET    | `/tickets`| List all created tickets               |

## Request format (`POST /agent`)

```json
{
  "threadId": "uuid",
  "runId": "uuid",
  "messages": [{ "role": "user", "content": "Login button is broken on Safari" }]
}
```
