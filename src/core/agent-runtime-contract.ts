/**
 * Provider- and storage-neutral Agent Runtime contracts.
 *
 * This module deliberately contains no executor, persistence adapter, or fake production model.
 * The host coordinator will be added only after its durable transaction boundary is selected.
 */

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AgentRunFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface AgentRun {
  readonly id: string;
  readonly sessionId: string;
  /** Stable idempotency key allocated by the host before durable acceptance. */
  readonly operationId: string;
  readonly status: AgentRunStatus;
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly finishedAt?: number;
  /** Non-secret provider/model identifiers only. */
  readonly providerId?: string;
  readonly modelId?: string;
  readonly failure?: AgentRunFailure;
}

export type AgentRunEventType =
  | "queued"
  | "started"
  | "assistant_delta"
  | "tool_call_proposed"
  | "approval_required"
  | "tool_result"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AgentRunEvent<TPayload = unknown> {
  readonly id: string;
  readonly runId: string;
  /** Monotonic durable sequence assigned by the persistence coordinator. */
  readonly sequence: number;
  readonly occurredAt: number;
  readonly type: AgentRunEventType;
  readonly payload?: TPayload;
}

export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly runId?: string;
  readonly role: AgentMessageRole;
  readonly content: string;
  readonly createdAt: number;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface AgentProviderMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface AgentProviderRequest {
  readonly model?: string;
  readonly messages: readonly AgentProviderMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export type AgentProviderEvent =
  | { readonly type: "text_delta"; readonly text: string }
  | {
      readonly type: "tool_call_proposed";
      readonly toolCallId: string;
      readonly toolName: string;
      /** Raw provider arguments are untrusted and must be validated by the host. */
      readonly argumentsJson: string;
    }
  | {
      readonly type: "usage";
      readonly inputTokens?: number;
      readonly outputTokens?: number;
    }
  | { readonly type: "completed"; readonly finishReason: "stop" | "tool_calls" | "length" };

export interface AgentProviderContext {
  readonly signal: AbortSignal;
}

export interface AgentProvider {
  /** Stable, non-secret identifier for provider selection and audit records. */
  readonly id: string;
  /** Emits model output/proposals only. Providers never execute tools or mutate Workspace data. */
  generate(
    request: AgentProviderRequest,
    context: AgentProviderContext,
  ): AsyncIterable<AgentProviderEvent>;
}

export type AgentRunTransitionDetails = {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly failure?: AgentRunFailure;
};

/**
 * Validates a run-state transition and returns a new immutable record.
 * This is a domain helper only; callers must persist the result before publishing it.
 */
export function transitionAgentRun(
  run: AgentRun,
  nextStatus: AgentRunStatus,
  at: number,
  details: AgentRunTransitionDetails = {},
): AgentRun {
  if (!Number.isFinite(at) || at < run.createdAt) {
    throw new RangeError("Agent run transition time must be finite and not precede creation");
  }
  if (run.status === "running" && (run.startedAt === undefined || !Number.isFinite(run.startedAt))) {
    throw new Error("A running AgentRun must have a valid startedAt timestamp");
  }
  if (run.startedAt !== undefined && at < run.startedAt) {
    throw new RangeError("Agent run transition time cannot precede its start");
  }

  const allowed: Readonly<Record<AgentRunStatus, readonly AgentRunStatus[]>> = {
    queued: ["running", "failed", "cancelled", "interrupted"],
    running: ["completed", "failed", "cancelled", "interrupted"],
    completed: [],
    failed: [],
    cancelled: [],
    interrupted: [],
  };

  if (!allowed[run.status].includes(nextStatus)) {
    throw new Error("Invalid AgentRun transition: " + run.status + " -> " + nextStatus);
  }

  if (nextStatus === "failed" && !details.failure) {
    throw new Error("A failed AgentRun requires structured failure details");
  }
  if (nextStatus !== "failed" && details.failure) {
    throw new Error("Failure details are only valid for a failed AgentRun");
  }

  const startedAt = nextStatus === "running" ? at : run.startedAt;
  const terminal = nextStatus === "completed" || nextStatus === "failed" ||
    nextStatus === "cancelled" || nextStatus === "interrupted";

  return {
    ...run,
    status: nextStatus,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(terminal ? { finishedAt: at } : {}),
    ...(details.providerId === undefined ? {} : { providerId: details.providerId }),
    ...(details.modelId === undefined ? {} : { modelId: details.modelId }),
    ...(details.failure === undefined ? {} : { failure: { ...details.failure } }),
  };
}

/** Startup policy: accepted but unfinished work is not silently replayed. */
export function recoverInterruptedAgentRun(run: AgentRun, at: number): AgentRun {
  if (run.status !== "queued" && run.status !== "running") return { ...run };
  return transitionAgentRun(run, "interrupted", at);
}
