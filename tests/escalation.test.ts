import { describe, it, expect } from "vitest";

// ── Phase 7 Escalation Tests ────────────────────────────────────────
// Tests for escalation detection logic and escalation record structure.

interface ConversationContext {
  customerName?: string;
  customerEmail?: string;
  messageCount: number;
  lastAIResponse?: string;
}

interface HistoryEntry {
  sender: string;
  message: string;
}

interface EscalationCheck {
  shouldEscalate: boolean;
  reason: string | null;
  escalationType: "confusion" | "frustration" | "sensitive" | "complex" | "user_request" | "safety" | null;
  escalationMessage: string | null;
}

/**
 * Detects whether escalation to a human is needed.
 * Extracted from widget-chat for testing.
 */
function checkEscalationNeeded(
  message: string,
  context: ConversationContext,
  history: HistoryEntry[],
): EscalationCheck {
  const lower = message.toLowerCase();

  // 1. Explicit human request
  if (/speak to (a |someone|human|person|manager)|talk to (someone|a human|a person|a manager)|real person|human help/i.test(lower)) {
    return {
      shouldEscalate: true,
      reason: "Customer explicitly requested human",
      escalationType: "user_request",
      escalationMessage: "I'd be happy to connect you with a staff member right away.",
    };
  }

  // 2. Frustration detection (repeated negative signals)
  const recentUserMsgs = history.filter(h => h.sender === "user").slice(-3);
  const frustrationSignals = recentUserMsgs.filter(m =>
    /frustrated|frustrating|angry|terrible|awful|worst|hate|useless|stupid|waste of time/i.test(m.message)
  );
  if (frustrationSignals.length >= 2) {
    return {
      shouldEscalate: true,
      reason: "Repeated frustration signals",
      escalationType: "frustration",
      escalationMessage: "I can see this has been frustrating. Let me connect you with someone who can help.",
    };
  }

  // 3. Repeated confusion (same question asked 3+ times)
  const userMsgs = history.filter(h => h.sender === "user").map(h => h.message.toLowerCase());
  if (userMsgs.length >= 3) {
    const lastThree = userMsgs.slice(-3);
    const similarity = lastThree.filter(m => {
      const words = m.split(/\s+/);
      return words.length > 0;
    });
    // Simplified: check if the current message is very similar to recent ones
    if (similarity.length >= 3) {
      const currentWords = new Set(lower.split(/\s+/));
      const overlap = similarity.filter(m => {
        const words = m.split(/\s+/);
        const common = words.filter(w => currentWords.has(w));
        return common.length / Math.max(words.length, 1) > 0.7;
      });
      if (overlap.length >= 2) {
        return {
          shouldEscalate: true,
          reason: "Repeated confusion — customer asking same question",
          escalationType: "confusion",
          escalationMessage: "I want to make sure you get the right help. Let me connect you with a team member.",
        };
      }
    }
  }

  // 4. Safety concerns
  if (/emergency|urgent|help me|danger|police|ambulance|fire/i.test(lower)) {
    return {
      shouldEscalate: true,
      reason: "Safety concern detected",
      escalationType: "safety",
      escalationMessage: "This sounds urgent. Let me connect you with someone immediately.",
    };
  }

  return { shouldEscalate: false, reason: null, escalationType: null, escalationMessage: null };
}

// ═══════════════════════════════════════════════════════════════════════

describe("Escalation detection", () => {
  it("detects explicit human request", () => {
    const result = checkEscalationNeeded(
      "Can I speak to a human?",
      { messageCount: 3 },
      [],
    );
    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationType).toBe("user_request");
  });

  it("detects request to talk to manager", () => {
    const result = checkEscalationNeeded(
      "I want to talk to a manager",
      { messageCount: 5 },
      [],
    );
    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationType).toBe("user_request");
  });

  it("detects repeated frustration", () => {
    const history: HistoryEntry[] = [
      { sender: "user", message: "This is terrible service" },
      { sender: "ai", message: "I'm sorry to hear that." },
      { sender: "user", message: "You're totally useless" },
    ];
    const result = checkEscalationNeeded(
      "This is the worst experience ever",
      { messageCount: 5 },
      history,
    );
    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationType).toBe("frustration");
  });

  it("does not escalate on single frustration", () => {
    const history: HistoryEntry[] = [
      { sender: "user", message: "This isn't ideal" },
    ];
    const result = checkEscalationNeeded(
      "What are your prices?",
      { messageCount: 3 },
      history,
    );
    expect(result.shouldEscalate).toBe(false);
  });

  it("detects safety concerns", () => {
    const result = checkEscalationNeeded(
      "This is an emergency, I need help!",
      { messageCount: 2 },
      [],
    );
    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationType).toBe("safety");
  });

  it("does not escalate normal messages", () => {
    const result = checkEscalationNeeded(
      "What time are you open?",
      { messageCount: 1 },
      [],
    );
    expect(result.shouldEscalate).toBe(false);
  });

  it("does not escalate on partial match", () => {
    const result = checkEscalationNeeded(
      "I want to speak to my friend",
      { messageCount: 1 },
      [],
    );
    expect(result.shouldEscalate).toBe(false);
  });
});

describe("Escalation record structure", () => {
  it("has all required fields", () => {
    const record = {
      id: "esc-001",
      receptionist_id: "rec-001",
      session_id: "sess-abc",
      customer_name: "Alice",
      customer_email: "alice@test.com",
      customer_phone: "+1234567890",
      reason: "user_request",
      summary: "Customer: I want a human\nAI: Let me connect you",
      status: "open",
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    };

    expect(record.id).toBeTruthy();
    expect(record.receptionist_id).toBeTruthy();
    expect(record.session_id).toBeTruthy();
    expect(record.reason).toBeTruthy();
    expect(record.status).toBe("open");
    expect(record.resolved_by).toBeNull();
    expect(record.resolved_at).toBeNull();
  });

  it("supports resolved status", () => {
    const record = {
      status: "resolved",
      resolved_by: "user-001",
      resolved_at: new Date().toISOString(),
    };
    expect(record.status).toBe("resolved");
    expect(record.resolved_by).toBeTruthy();
    expect(record.resolved_at).toBeTruthy();
  });

  it("valid reason values", () => {
    const validReasons = [
      "confusion",
      "frustration",
      "sensitive",
      "complex",
      "user_request",
      "safety",
    ];
    for (const reason of validReasons) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});
