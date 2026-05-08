import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMachineContext, buildStateMachinePrompt, getRedirectMessage } from "../stateMachine.ts";
import { detectUnifiedIntent, extractUnifiedEntities, updateUnifiedState, checkUnifiedRequirements, createEmptyUnifiedState } from "./unifiedCore.ts";

Deno.test("U1: collecting_contact redirect is answer-first then resume", () => {
  const prompt = getRedirectMessage("collecting_contact", "booking");
  assertMatch(prompt, /I can help with that|Absolutely/i);
  assertMatch(prompt, /By the way/i);
  assertMatch(prompt, /name/i);

  const ctx = createMachineContext();
  ctx.state = "collecting_contact";
  ctx.flow = "booking";
  const statePrompt = buildStateMachinePrompt(ctx);
  assertMatch(statePrompt, /Acknowledge and answer the user's actual message first/);
  assert(!/You MUST stay focused on the current state's objective/.test(statePrompt));
});

Deno.test("U2: accepts all volunteered booking slots and asks only missing", () => {
  const services = [{ id: "svc1", name: "Deep Tissue Massage" }];
  const products: Array<{ id: string; name: string }> = [];
  const msg = "I'm James, Tuesday at 3pm for deep tissue massage, my number is 07700 900123";

  const intent = detectUnifiedIntent(msg, true, "booking");
  const entities = extractUnifiedEntities(msg, services, products);
  const state = createEmptyUnifiedState();
  state.task = {
    type: "booking",
    step: "selecting_service",
    started_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    entities: {
      service: { id: null, name: null },
      appointment: { date: null, time: null, timezone: null },
      product_cart: [],
      customer: { name: null, phone: null, email: null },
      delivery_address: null,
    },
    memory: { pending_info: [], last_confirmed_data: {}, corrections: [] },
    flow_flags: { asked_for_name: false, asked_for_contact: false, confirmation_shown: false, user_hesitated: false },
  } as any;

  const updated = updateUnifiedState(state, intent, entities);
  const req = checkUnifiedRequirements(updated.task);

  assertEquals(updated.task?.entities.service.name, "Deep Tissue Massage");
  assertEquals(updated.task?.entities.appointment.date?.toLowerCase(), "tuesday");
  assertEquals(updated.task?.entities.appointment.time?.toLowerCase(), "3pm");
  assertEquals(updated.task?.entities.customer.name, "James");
  assert(updated.task?.entities.customer.phone?.includes("900123"));
  assertEquals(req.nextRequired, null);
  assert(!req.missingFields.includes("service"));
});
