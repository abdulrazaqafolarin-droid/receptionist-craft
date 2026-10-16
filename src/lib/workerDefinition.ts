export interface StarterWorkerDefinition {
  schema_version: 1;
  purpose: string;
  responsibilities: string[];
  inputs: Array<{ key: string; label: string; type: "text"; required: boolean }>;
  outputs: Array<{ key: string; label: string; type: "text"; required: boolean }>;
  capability_keys: string[];
  allowed_actions: string[];
  approval_required_for: string[];
  autonomy_mode: "supervised";
  execution: { max_steps: number; timeout_seconds: number; max_retries: number };
  verification: { success_criteria: string[]; require_evidence: true };
  workspace: { layout: "task_board"; panels: string[] };
}

export const CONSEQUENTIAL_WORKER_ACTIONS = [
  "external_write",
  "send_message",
  "publish",
  "purchase",
  "payment",
  "delete",
  "permission_change",
  "data_export",
];

export function starterWorkerDefinition(purpose: string): StarterWorkerDefinition {
  const normalizedPurpose = purpose.trim();
  return {
    schema_version: 1,
    purpose: normalizedPurpose,
    responsibilities: [normalizedPurpose],
    inputs: [{ key: "request", label: "Task request", type: "text", required: true }],
    outputs: [{ key: "result", label: "Result", type: "text", required: true }],
    capability_keys: [],
    allowed_actions: ["research", "internal_read", "draft"],
    approval_required_for: [...CONSEQUENTIAL_WORKER_ACTIONS],
    autonomy_mode: "supervised",
    execution: { max_steps: 12, timeout_seconds: 120, max_retries: 1 },
    verification: {
      success_criteria: ["Return a result that addresses the request and include evidence for factual claims."],
      require_evidence: true,
    },
    workspace: { layout: "task_board", panels: ["tasks", "outputs", "activity"] },
  };
}
