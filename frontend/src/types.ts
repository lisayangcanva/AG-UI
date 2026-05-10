export type TicketType = "bug" | "feature" | "task";
export type Priority = "low" | "medium" | "high" | "critical";

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  priority: Priority;
  labels: string[];
}

// AG-UI event types
export type EventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "STATE_SNAPSHOT"
  | "STEP_PROGRESS";

export interface BaseEvent {
  type: EventType;
}

export interface TextMessageStartEvent extends BaseEvent {
  type: "TEXT_MESSAGE_START";
  message_id: string;
  role: string;
}

export interface TextMessageContentEvent extends BaseEvent {
  type: "TEXT_MESSAGE_CONTENT";
  message_id: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: "TEXT_MESSAGE_END";
  message_id: string;
}

export interface ToolCallStartEvent extends BaseEvent {
  type: "TOOL_CALL_START";
  tool_call_id: string;
  tool_call_name: string;
  parent_message_id: string;
}

export interface ToolCallArgsEvent extends BaseEvent {
  type: "TOOL_CALL_ARGS";
  tool_call_id: string;
  delta: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: "TOOL_CALL_END";
  tool_call_id: string;
  duration_ms?: number;
}

export interface StateSnapshotEvent extends BaseEvent {
  type: "STATE_SNAPSHOT";
  snapshot: { tickets: Ticket[] };
}

export interface RunFinishedEvent extends BaseEvent {
  type: "RUN_FINISHED";
  thread_id: string;
  run_id: string;
}

export interface RunErrorEvent extends BaseEvent {
  type: "RUN_ERROR";
  message: string;
}

export interface StepProgressEvent extends BaseEvent {
  type: "STEP_PROGRESS";
  step: number;
  total: number;
  message: string;
}

export type AgUIEvent =
  | BaseEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepProgressEvent;
