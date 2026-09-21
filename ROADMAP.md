# Rutex Platform - Master Roadmap

**Vision:** Rutex as Universal Revenue Intelligence Platform
**Tagline:** We don't sell AI. We sell money systems powered by AI.

---

## Phase 1: Bulletproof Core (Weeks 1-3)
**Goal:** Zero-defect production-ready foundation

### 1.1 Edge Cases & Error Handling
- [ ] Comprehensive error boundary coverage
- [ ] Retry logic with exponential backoff for all edge functions
- [ ] Circuit breaker pattern for external APIs (Gemini, Supabase, Resend, etc.)
- [ ] Graceful degradation when AI fails (fallback responses)

### 1.2 Comprehensive Testing
- [ ] Unit tests for all edge functions (>80% coverage)
- [ ] Integration tests for booking/order flows
- [ ] E2E tests for widget-chat (Playwright)
- [ ] Load testing for edge functions

### 1.3 Observability
- [ ] Structured logging (JSON format)
- [ ] Distributed tracing (correlation IDs)
- [ ] Health check endpoints for all services
- [ ] Alerting for critical failures

---

## Phase 2: Voice + Text Fusion (Weeks 4-6)
**Goal:** Complete multimodal AI receptionist

### 2.1 Voice Pipeline
- [ ] STT: AssemblyAI integration (streaming)
- [ ] TTS: ElevenLabs integration (streaming)
- [ ] Voice activity detection (VAD)
- [ ] Interrupt handling (barge-in)

### 2.2 Unified Conversation State
- [ ] Single conversation state for voice + text
- [ ] Seamless modality switching
- [ ] Context preservation across modalities

---

## Phase 3: Money Mode 2.0 (Weeks 7-9)
**Goal:** Predictive revenue intelligence

### 3.1 Intent Scoring Engine
- [ ] Real-time buyer intent scoring (1-10)
- [ ] Auto-activate Money Mode at threshold (configurable)
- [ ] Objection detection & handling

### 3.2 Dynamic Pricing & Offers
- [ ] Dynamic deposit/upsell logic
- [ ] Time-limited offers
- [ ] Abandoned cart recovery

---

## Phase 4: MEO Analytics Dashboard (Weeks 10-12)
**Goal:** Money Engine Optimization - real-time revenue optimization

### 4.1 Revenue Intelligence
- [ ] Revenue leaked this week (missed leads, abandoned flows)
- [ ] AI intelligence feed (loss alerts + fix suggestions)
- [ ] Conversation-to-cash scoring (Cold/Warm/Hot)

### 4.2 Funnel Visualization
- [ ] Funnel drop-off visualization
- [ ] Revenue attribution per channel
- [ ] Cohort analysis

---

## Milestone 2: Fix Widget-Chat (IMMEDIATE)
- [ ] Verify widget-chat edge function end-to-end
- [ ] Test with real receptionist ID
- [ ] Confirm AI responds via Gemini
- [ ] Fix any remaining edge cases

---

## Success Criteria per Phase
| Phase | KPI | Target |
|-------|-----|--------|
| Phase 1 | TypeScript errors | 0 |
| Phase 1 | Test coverage | >80% |
| Phase 1 | Build time | <3 min |
| Phase 2 | Voice latency | <500ms |
| Phase 3 | Conversion lift | +20% |
| Phase 4 | Revenue leak detection | <5% |

---

## Dependencies
- Phase 1 must complete before Phase 2
- Phase 2 & 3 can run in parallel after Phase 1
- Phase 4 requires Phase 3 data

---

## Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Edge function cold starts | High | Medium | Pre-warm / keep-alive |
| Gemini rate limits | Medium | High | Caching + fallback |
| Supabase rate limits | Medium | Medium | Connection pooling |
| Voice latency | Medium | High | Streaming + VAD |

---

*Generated: 2026-09-20 | Owner: Rutex Team*
