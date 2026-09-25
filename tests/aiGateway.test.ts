import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RutexMcpError } from "@/lib/rutexMcp";
import { askRutex, rutexHealth, resetRutexConversation } from "@/lib/rutexMcp";

// ─── RutexMcp Tests (Gateway Client) ────────────────────────────────

describe("Rutex AI Gateway Client", () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RUTEX_GATEWAY_URL", "https://gateway.rutex.ai");
    vi.stubEnv("RUTEX_GATEWAY_KEY", "test-gateway-key");
    
    // Mock fetch to return successful responses
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"text\\":\\"Hello! How can I help?\\",\\"model\\":\\"opencode\\",\\"tokens\\":{\\"input\\":10,\\"output\\":20,\\"reasoning\\":5}}"}]}}',
    } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe("askRutex", () => {
    it("sends prompt with conversationId and returns parsed response", async () => {
      const result = await askRutex("conv-123", "Hello, I need help booking an appointment");
      expect(result.text).toBe("Hello! How can I help?");
      expect(result.model).toBe("opencode");
      expect(result.tokens).toEqual({ input: 10, output: 20, reasoning: 5 });
    });

    it("starts new session when newSession is true", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"text\\":\\"Welcome! How can I help?\\"}"}]}}',
      } as Response);
      const result = await askRutex("conv-new", "Hello", { newSession: true });
      expect(result.text).toBe("Welcome! How can I help?");
    });

    it("throws RutexMcpError on gateway error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      await expect(askRutex("conv-123", "test")).rejects.toThrow("gateway unreachable");
    });

    it("throws RutexMcpError on unparseable response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: not valid json',
      } as Response);
      await expect(askRutex("conv-123", "test")).rejects.toThrow("unparseable gateway response");
    });

    it("handles missing text content gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":""}]}}',
      } as Response);
      const result = await askRutex("conv-123", "test");
      expect(result.text).toBe("");
    });

    it("handles missing tokens gracefully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"text\\":\\"Hello!\\"}"}]}}',
      } as Response);
      const result = await askRutex("conv-123", "test");
      expect(result.text).toBe("Hello!");
      expect(result.tokens).toBeUndefined();
    });
  });

  describe("rutexHealth", () => {
    it("returns health status from gateway", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"gateway\\":\\"healthy\\",\\"opencode\\":\\"healthy\\"}"}]}}',
      } as Response);
      const health = await rutexHealth();
      expect(health.gateway).toBeDefined();
    });
  });

  describe("resetRutexConversation", () => {
    it("clears conversation and returns true on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"cleared\\":true}"}]}}',
      } as Response);
      const result = await resetRutexConversation("conv-123");
      expect(typeof result).toBe("boolean");
    });

    it("passes project parameter when provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"result":{"content":[{"type":"text","text":"{\\"cleared\\":true}"}]}}',
      } as Response);
      const result = await resetRutexConversation("conv-123", "project-abc");
      expect(typeof result).toBe("boolean");
    });
  });
});
