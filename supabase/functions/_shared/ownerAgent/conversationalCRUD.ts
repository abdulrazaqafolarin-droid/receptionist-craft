// ═══════════════════════════════════════════════════════════════════════════
// OWNER AGENT — CONVERSATIONAL CRUD
// ═══════════════════════════════════════════════════════════════════════════
// Main orchestration: parse intent → clarify → propose via Configurator → apply
// Uses the SAME Configurator identity (via Rutex Gateway) as onboarding.
// ═══════════════════════════════════════════════════════════════════════════

import { generateChangePlan, generateOperatorPlan } from "../config/enhancedConfigurator.ts";
import { parseOwnerMessage, type ParsedOwnerIntent } from "./intentParser.ts";
import { createChangeProposal, formatProposalForChat, type OwnerChangeProposal } from "./diffRenderer.ts";
import { buildBusinessContext } from "../context/businessContext.ts";
import type {
  OwnerIntent,
  OwnerIntentParams,
  ClarificationQuestion,
  ClarificationResponse,
  OwnerChangeProposal,
  OwnerChatMessage,
  OwnerAgentContext,
} from "./types.ts";

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string | number | boolean): {
        order(col: string, opts?: { ascending?: boolean }): {
          limit(n: number): Promise<{ data: unknown; error: unknown }>;
        };
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        single(): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

interface ConversationalCRUDDeps {
  supabase: SupabaseClient;
  receptionistId: string;
  userId: string;
  sessionId: string;
}

/** Build context for the owner agent (services, staff, etc.) */
async function buildOwnerContext(deps: ConversationalCRUDDeps): Promise<OwnerAgentContext> {
  const { supabase, receptionistId, userId } = deps;

  // Get receptionist with full details
  const { data: receptionist } = await supabase
    .from('receptionists')
    .select('*')
    .eq('id', receptionistId)
    .single();

  // Get services for clarification options
  const { data: services } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes, is_product, active')
    .eq('receptionist_id', receptionistId)
    .eq('active', true);

  // Get staff
  const { data: staff } = await supabase
    .from('staff')
    .select('id, name, email, role, active')
    .eq('receptionist_id', receptionistId)
    .eq('active', true);

  // Get latest config
  const { data: latestConfig } = await supabase
    .from('config_versions')
    .select('config_json, version_number')
    .eq('receptionist_id', receptionistId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build live business context
  const businessContext = await buildBusinessContext(supabase, {
    receptionist,
    includeRecentActivity: true,
  });

  return {
    receptionist_id: receptionistId,
    user_id: userId,
    business_name: receptionist?.business_name || receptionist?.name || 'Unknown',
    business_type: receptionist?.business_type || 'General Business',
    capabilities: receptionist?.capabilities || {},
    current_config: (latestConfig?.config_json as Record<string, unknown>) || {},
    config_version: latestConfig?.version_number || 0,
    active_insights: [], // TODO: fetch from insights log
    autonomous_rules: [], // TODO: fetch from autonomous_rules table
    recent_changes: [], // TODO: fetch recent proposals
  };
}

/** Main entry point: process owner message and return response */
export async function processOwnerMessage(
  deps: ConversationalCRUDDeps,
  message: string,
  pendingClarifications?: ClarificationQuestion[],
  clarificationResponses?: ClarificationResponse[]
): Promise<{
  messages: OwnerChatMessage[];
  pending_proposal?: OwnerChangeProposal;
  needs_clarification?: boolean;
}> {
  const { supabase, receptionistId, userId, sessionId } = deps;

  // Build context
  const context = await buildOwnerContext(deps);

  // If we have pending clarifications and new responses, merge them
  let parsed: ParsedOwnerIntent;
  const mergedParams: OwnerIntentParams = {};

  if (pendingClarifications && clarificationResponses && clarificationResponses.length > 0) {
    // Merge clarification responses into params
    for (const resp of clarificationResponses) {
      mergedParams[resp.key] = resp.value;
    }
    // Re-parse with merged params (treat as continuation)
    parsed = {
      intent: pendingClarifications[0]?.key as OwnerIntent || 'unknown',
      confidence: 0.9,
      params: mergedParams,
      raw_message: message,
      clarification_needed: undefined,
    };
  } else {
    // Fresh parse with context for options
    parsed = parseOwnerMessage(message, {
      services: (await supabase.from('services').select('id, name').eq('receptionist_id', receptionistId).eq('active', true)).data || [],
      staff: (await supabase.from('staff').select('id, name').eq('receptionist_id', receptionistId).eq('active', true)).data || [],
    });
  }

  const messages: OwnerChatMessage[] = [];

  // If clarification needed, return questions
  if (parsed.clarification_needed && parsed.clarification_needed.length > 0) {
    const clarificationMsg: OwnerChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'agent',
      content: `I need a bit more info to ${getIntentDescription(parsed.intent)}:`,
      message_type: 'clarification',
      clarifications: parsed.clarification_needed,
      created_at: new Date().toISOString(),
    };
    return {
      messages: [clarificationMsg],
      needs_clarification: true,
    };
  }

  // Handle specific intents that don't need Configurator
  const quickActions = await handleQuickActions(deps, parsed, context);
  if (quickActions) return quickActions;

  // For config changes, generate proposal via Configurator
  if (isConfigChangeIntent(parsed.intent)) {
    return await handleConfigChange(deps, parsed, context);
  }

  // Default: conversational response
  const responseMsg: OwnerChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: 'agent',
    content: generateConversationalResponse(parsed, context),
    message_type: 'text',
    created_at: new Date().toISOString(),
  };
  return { messages: [responseMsg] };
}

/** Quick actions that don't need Configurator proposal */
async function handleQuickActions(
  deps: ConversationalCRUDDeps,
  parsed: ParsedOwnerIntent,
  context: OwnerAgentContext
): Promise<{ messages: OwnerChatMessage[] } | null> {
  const { supabase, receptionistId, sessionId } = deps;

  switch (parsed.intent) {
    case 'list_services': {
      const { data: services } = await supabase
        .from('services')
        .select('id, name, price, duration_minutes, is_product, active')
        .eq('receptionist_id', receptionistId)
        .eq('active', true)
        .order('name');

      const msg: OwnerChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'agent',
        content: formatServicesList(services || []),
        message_type: 'text',
        created_at: new Date().toISOString(),
      };
      return { messages: [msg] };
    }

    case 'show_config': {
      const msg: OwnerChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'agent',
        content: formatConfigSummary(context.current_config),
        message_type: 'text',
        created_at: new Date().toISOString(),
      };
      return { messages: [msg] };
    }

    case 'explain_setting': {
      const explanation = await explainSetting(deps, parsed.params.target || '');
      const msg: OwnerChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'agent',
        content: explanation,
        message_type: 'text',
        created_at: new Date().toISOString(),
      };
      return { messages: [msg] };
    }

    case 'rollback': {
      return await handleRollback(deps, parsed, context);
    }

    default:
      return null;
  }
}

/** Handle config changes via Configurator */
async function handleConfigChange(
  deps: ConversationalCRUDDeps,
  parsed: ParsedOwnerIntent,
  context: OwnerAgentContext
): Promise<{ messages: OwnerChatMessage[]; pending_proposal?: OwnerChangeProposal }> {
  const { supabase, receptionistId, userId, sessionId } = deps;

  // Build owner's change request in natural language
  const changeRequest = buildChangeRequest(parsed);

  // Get reasoning history for continuity
  const { data: reasoningHistory } = await supabase
    .from('config_reasoning_history')
    .select('*')
    .eq('receptionist_id', receptionistId)
    .order('version_number', { ascending: false })
    .limit(10);

  // Call Configurator via gateway
  const result = await generateChangePlan(
    context.current_config,
    changeRequest,
    reasoningHistory || []
  );

  // Create proposal with diffs
  const proposal = createChangeProposal(
    context.current_config,
    result.config,
    result.reasoning_notes,
    parsed.raw_message
  );

  // Store proposal for approval
  await supabase.from('owner_proposals').insert({
    id: proposal.id,
    receptionist_id: receptionistId,
    user_id: userId,
    session_id: sessionId,
    proposal_json: proposal,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  // Format for chat
  const proposalMsg: OwnerChatMessage = {
    id: `msg_${Date.now()}`,
    role: 'agent',
    content: formatProposalForChat(proposal, 'executive'),
    message_type: 'proposal',
    proposal,
    created_at: new Date().toISOString(),
  };

  return {
    messages: [proposalMsg],
    pending_proposal: proposal,
  };
}

/** Handle rollback request */
async function handleRollback(
  deps: ConversationalCRUDDeps,
  parsed: ParsedOwnerIntent,
  context: OwnerAgentContext
): Promise<{ messages: OwnerChatMessage[] }> {
  const { supabase, receptionistId, userId, sessionId } = deps;

  const targetVersion = parsed.params.version_number;
  let rollbackVersion: number;

  if (targetVersion === 'last' || !targetVersion) {
    rollbackVersion = context.config_version - 1;
  } else if (targetVersion === 'previous') {
    rollbackVersion = context.config_version - 1;
  } else if (typeof targetVersion === 'number') {
    rollbackVersion = targetVersion;
  } else {
    // Ask for specific version
    const msg: OwnerChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'agent',
      content: 'Which version would you like to rollback to? (Current version: ' + context.config_version + ')',
      message_type: 'clarification',
      clarifications: [{
        id: 'clarify_rollback_version',
        key: 'version_number',
        label: 'Rollback to version:',
        type: 'number',
        required: true,
        placeholder: 'e.g., 3',
        validation: { min: 1, max: context.config_version },
      }],
      created_at: new Date().toISOString(),
    };
  return { messages: [msg], needs_clarification: true };
  }

  // Get the target config
  const { data: targetConfig } = await supabase
    .from('config_versions')
    .select('config_json')
    .eq('receptionist_id', receptionistId)
    .eq('version_number', rollbackVersion)
    .maybeSingle();

  if (!targetConfig) {
    const msg: OwnerChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'agent',
      content: `Version ${rollbackVersion} not found. Current version is ${context.config_version}.`,
      message_type: 'text',
      created_at: new Date().toISOString(),
    };
    return { messages: [msg] };
  }

  // Create rollback proposal
  const proposal = createChangeProposal(
    context.current_config,
    targetConfig.config_json as Record<string, unknown>,
    `Rollback to version ${rollbackVersion} requested by owner`,
    `Rollback to version ${rollbackVersion}`
  );

  await supabase.from('owner_proposals').insert({
    id: proposal.id,
    receptionist_id: receptionistId,
    user_id: userId,
    session_id: sessionId,
    proposal_json: proposal,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  const msg: OwnerChatMessage = {
    id: `msg_${Date.now()}`,
    role: 'agent',
    content: formatProposalForChat(proposal, 'executive'),
    message_type: 'proposal',
    proposal,
    created_at: new Date().toISOString(),
  };

  return { messages: [msg] };
}

/** Apply approved proposal */
export async function applyProposal(
  deps: ConversationalCRUDDeps,
  proposalId: string
): Promise<{ success: boolean; error?: string }> {
  const { supabase, receptionistId, userId } = deps;

  // Get proposal
  const { data: proposal } = await supabase
    .from('owner_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('receptionist_id', receptionistId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!proposal) {
    return { success: false, error: 'Proposal not found or already processed' };
  }

  const proposalData = proposal.proposal_json as OwnerChangeProposal;

  // Create new config version
  const { data: latestConfig } = await supabase
    .from('config_versions')
    .select('version_number')
    .eq('receptionist_id', receptionistId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const newVersion = (latestConfig?.version_number || 0) + 1;

  // Insert new config version
  const { error: configError } = await supabase
    .from('config_versions')
    .insert({
      receptionist_id: receptionistId,
      config_json: proposalData.diffs.reduce((acc, diff) => {
        // Apply diff to build new config (simplified - in reality would use lodash.set or similar)
        return setNestedValue(acc, diff.path, diff.new_value);
      }, JSON.parse(JSON.stringify(proposal.current_config || {}))),
      version_number: newVersion,
      change_source: 'owner_approved',
      owner_input: proposal.summary,
      reasoning_notes: proposal.reasoning,
      created_by: userId,
    });

  if (configError) {
    return { success: false, error: configError.message };
  }

  // Update receptionist row with new capabilities/tone/etc from config
  const newConfig = proposalData.diffs.reduce((acc, diff) => setNestedValue(acc, diff.path, diff.new_value), {});
  await supabase
    .from('receptionists')
    .update({
      capabilities: newConfig.capabilities || {},
      ai_mode: newConfig.ai_mode,
      tone: newConfig.business?.tone,
      knowledge_base: newConfig.knowledge_base,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receptionistId);

  // Mark proposal as approved
  await supabase
    .from('owner_proposals')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', proposalId);

  // Log to config_reasoning_history
  await supabase
    .from('config_reasoning_history')
    .insert({
      receptionist_id: receptionistId,
      version_number: newVersion,
      change_source: 'owner_approved',
      owner_input: proposalData.summary,
      reasoning_notes: proposalData.reasoning,
      plan_text: proposalData.summary,
      config_snapshot: proposalData.diffs,
    });

  return { success: true };
}

/** Helper: set nested value in object */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(obj));
  const keys = path.split('.');
  let current: Record<string, unknown> = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const isArrayIndex = /^\d+$/.test(nextKey);

    if (!current[key]) {
      current[key] = isArrayIndex ? [] : {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (/^\d+$/.test(lastKey)) {
    current[parseInt(lastKey)] = value;
  } else {
    current[lastKey] = value;
  }

  return result;
}

/** Get human description of intent */
function getIntentDescription(intent: OwnerIntent): string {
  const descriptions: Record<OwnerIntent, string> = {
    add_service: 'add a new service',
    update_service: 'update a service',
    remove_service: 'remove a service',
    set_service_price: 'update a service price',
    set_service_duration: 'update a service duration',
    toggle_service_active: 'enable/disable a service',
    list_services: 'list your services',
    set_hours: 'set your hours',
    block_time: 'block time',
    unblock_time: 'unblock time',
    set_staff_availability: 'set staff availability',
    block_staff: 'block a staff member',
    unblock_staff: 'unblock a staff member',
    set_break: 'set break time',
    connect_channel: 'connect a channel',
    disconnect_channel: 'disconnect a channel',
    configure_channel: 'configure a channel',
    add_staff: 'add a staff member',
    update_staff: 'update a staff member',
    remove_staff: 'remove a staff member',
    assign_staff_to_service: 'assign staff to service',
    set_cancellation_policy: 'set cancellation policy',
    set_deposit_policy: 'set deposit policy',
    set_refund_policy: 'set refund policy',
    set_late_policy: 'set late/no-show policy',
    toggle_money_mode: 'toggle Money Mode',
    set_money_mode_threshold: 'set Money Mode threshold',
    configure_growth_module: 'configure a growth module',
    add_faq: 'add an FAQ',
    update_faq: 'update an FAQ',
    remove_faq: 'remove an FAQ',
    update_knowledge_base: 'update knowledge base',
    show_config: 'show your configuration',
    explain_setting: 'explain a setting',
    rollback: 'rollback a change',
    unknown: 'help you',
  };
  return descriptions[intent] || 'help you';
}

/** Check if intent requires Configurator proposal */
function isConfigChangeIntent(intent: OwnerIntent): boolean {
  const configIntents: OwnerIntent[] = [
    'add_service', 'update_service', 'remove_service', 'set_service_price',
    'set_service_duration', 'toggle_service_active',
    'set_hours', 'block_time', 'unblock_time', 'set_staff_availability',
    'block_staff', 'unblock_staff', 'set_break',
    'connect_channel', 'disconnect_channel', 'configure_channel',
    'add_staff', 'update_staff', 'remove_staff', 'assign_staff_to_service',
    'set_cancellation_policy', 'set_deposit_policy', 'set_refund_policy', 'set_late_policy',
    'toggle_money_mode', 'set_money_mode_threshold',
    'configure_growth_module',
    'add_faq', 'update_faq', 'remove_faq', 'update_knowledge_base',
  ];
  return configIntents.includes(intent);
}

/** Build natural language change request for Configurator */
function buildChangeRequest(parsed: ParsedOwnerIntent): string {
  const { intent, params } = parsed;

  const templates: Record<OwnerIntent, string> = {
    add_service: `Add a new service: ${params.service_name || '[name]'} at $${params.price || '[price]'} for ${params.duration_minutes || '[duration]'} minutes. ${params.description ? `Description: ${params.description}` : ''}`,
    update_service: `Update service ${params.service_id || params.service_name || '[service]'} with changes: ${Object.entries(params).filter(([k]) => !['service_id', 'service_name'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    remove_service: `Remove service ${params.service_id || params.service_name || '[service]'}`,
    set_service_price: `Change price of ${params.service_id || params.service_name || '[service]'} to $${params.price}`,
    set_service_duration: `Change duration of ${params.service_id || params.service_name || '[service]'} to ${params.duration_minutes} minutes`,
    toggle_service_active: `${params.active ? 'Enable' : 'Disable'} service ${params.service_id || params.service_name || '[service]'}`,
    set_hours: `Set operating hours: ${params.day_of_week ? `days: ${Array.isArray(params.day_of_week) ? params.day_of_week.join(',') : params.day_of_week}` : 'all weekdays'} ${params.start_time ? `from ${params.start_time}` : ''} ${params.end_time ? `to ${params.end_time}` : ''}${params.break_start ? ` with break ${params.break_start}-${params.break_end}` : ''}`,
    block_time: `Block ${params.date ? `date ${params.date}` : 'time'}${params.start_time ? ` from ${params.start_time}` : ''}${params.end_time ? ` to ${params.end_time}` : ''}`,
    unblock_time: `Unblock ${params.date ? `date ${params.date}` : 'time'}`,
    block_staff: `Block staff ${params.staff_id || params.staff_name || '[staff]'} on ${params.date || '[dates]'}`,
    unblock_staff: `Unblock staff ${params.staff_id || params.staff_name || '[staff]'} on ${params.date || '[dates]'}`,
    connect_channel: `Connect ${params.channel_type || '[channel]'} channel${params.channel_config ? ` with config: ${JSON.stringify(params.channel_config)}` : ''}`,
    disconnect_channel: `Disconnect ${params.channel_type || '[channel]'} channel`,
    add_staff: `Add staff member ${params.staff_name || '[name]'} as ${params.staff_role || 'provider'}`,
    update_staff: `Update staff ${params.staff_id || params.staff_name || '[staff]'}`,
    remove_staff: `Remove staff ${params.staff_id || params.staff_name || '[staff]'}`,
    assign_staff_to_service: `Assign staff ${params.staff_id || params.staff_name || '[staff]'} to service ${params.service_id || params.service_name || '[service]'}`,
    set_cancellation_policy: `Set cancellation policy: ${params.cancellation_hours} hours notice${params.same_day_booking !== undefined ? `, same-day booking: ${params.same_day_booking}` : ''}${params.walk_ins !== undefined ? `, walk-ins: ${params.walk_ins}` : ''}`,
    set_deposit_policy: `Set deposit policy: ${params.deposit_percent}% deposit${params.deposit_required !== undefined ? `, required: ${params.deposit_required}` : ''}`,
    set_refund_policy: `Set refund policy: ${params.refund_policy}`,
    set_late_policy: `Set late/no-show fee: $${params.late_fee || 0}`,
    toggle_money_mode: `Turn Money Mode ${params.money_mode_enabled ? 'ON' : 'OFF'}`,
    set_money_mode_threshold: `Set Money Mode threshold to ${params.money_mode_threshold}/10`,
    configure_growth_module: `${params.module_key ? `Configure ${params.module_key}` : 'Configure growth module'} at Tier ${params.module_tier || 1}`,
    add_faq: `Add FAQ: Q: ${params.question} A: ${params.answer} (Category: ${params.category || 'general'})`,
    update_faq: `Update FAQ`,
    remove_faq: `Remove FAQ`,
    update_knowledge_base: `Update knowledge base: ${params.question || params.target || '[content]'}`,
  };

  return templates[intent] || parsed.raw_message;
}

/** Format services list for display */
function formatServicesList(services: Array<{id: string; name: string; price: number | null; duration_minutes: number | null; is_product: boolean; active: boolean}>): string {
  if (!services.length) return 'No services configured yet. Say "Add a service called..." to create one!';

  const groups = {
    services: services.filter(s => !s.is_product),
    products: services.filter(s => s.is_product),
  };

  let output = '📋 **Your Services & Products:**\n\n';

  if (groups.services.length) {
    output += '**Services:**\n';
    for (const s of groups.services) {
      output += `• **${s.name}** — $${s.price ?? 'not set'} • ${s.duration_minutes ?? '?'} min\n`;
    }
    output += '\n';
  }

  if (groups.products.length) {
    output += '**Products:**\n';
    for (const p of groups.products) {
      output += `• **${p.name}** — $${p.price ?? 'not set'}\n`;
    }
  }

  output += '\nSay things like:\n• "Add a service called Teeth Whitening for $299, 60 minutes"\n• "Change price of Teeth Whitening to $349"\n• "Disable the Dental Implant service"';
  return output;
}

/** Format config summary */
function formatConfigSummary(config: Record<string, unknown>): string {
  if (!config || Object.keys(config).length === 0) {
    return 'No configuration found. Run the onboarding first!';
  }

  let output = '⚙️ **Current Configuration:**\n\n';

  if (config.business) {
    const b = config.business as Record<string, unknown>;
    output += `**Business:** ${b.display_name || b.name || 'Unnamed'} (${b.business_type || 'Unknown'})\n`;
    output += `**Tone:** ${b.tone || 'friendly'}\n`;
    output += `**Greeting:** ${b.greeting_message?.slice(0, 80) || 'Default'}\n\n`;
  }

  if (config.workflows) {
    const w = config.workflows as Record<string, unknown>;
    output += `**Workflows:**\n`;
    if (w.appointment_booking?.enabled) output += `• Appointment booking ✓ (default ${w.appointment_booking.default_duration_minutes} min)\n`;
    if (w.product_ordering?.enabled) output += `• Product ordering ✓ (delivery: ${w.product_ordering.delivery ? 'yes' : 'no'})\n`;
    output += '\n';
  }

  if (config.capabilities) {
    const c = config.capabilities as Record<string, unknown>;
    output += `**Capabilities:**\n`;
    Object.entries(c).forEach(([k, v]) => {
      if (v) output += `• ${k.replace(/_/g, ' ')} ✓\n`;
    });
    output += '\n';
  }

  if (config.channels) {
    const ch = config.channels as Record<string, unknown>;
    output += `**Channels:**\n`;
    Object.entries(ch).forEach(([k, v]) => {
      if (v) output += `• ${k.charAt(0).toUpperCase() + k.slice(1)} ✓\n`;
    });
    output += '\n';
  }

  output += `**Config Version:** ${config.version || 'Unknown'}\n`;
  output += '\nAsk me to change anything: "Set cancellation to 48 hours", "Enable WhatsApp", etc.';

  return output;
}

/** Explain a setting using reasoning history */
async function explainSetting(deps: ConversationalCRUDDeps, target: string): Promise<string> {
  const { supabase, receptionistId } = deps;

  // Get reasoning history
  const { data: history } = await supabase
    .from('config_reasoning_history')
    .select('*')
    .eq('receptionist_id', receptionistId)
    .order('version_number', { ascending: false })
    .limit(20);

  if (!history || history.length === 0) {
    return `I don't have reasoning history for "${target}" yet. This setting was likely configured during onboarding. Want me to check the current value?`;
  }

  // Find relevant entries
  const relevant = history.filter(h =>
    h.owner_input?.toLowerCase().includes(target.toLowerCase()) ||
    h.reasoning_notes?.toLowerCase().includes(target.toLowerCase()) ||
    h.plan_text?.toLowerCase().includes(target.toLowerCase())
  );

  if (relevant.length === 0) {
    return `I don't see a specific reason recorded for "${target}" in the history. It may have been set during onboarding or as a default. Want me to show you the current value?`;
  }

  const latest = relevant[0];
  return `**Why "${target}" is this way:**\n\n${latest.reasoning_notes || latest.owner_input ? `You asked: "${latest.owner_input}"` : ''}\n\nMy reasoning: ${latest.reasoning_notes || 'See plan summary: ' + latest.plan_text?.slice(0, 300)}`;
}

/** Generate conversational response for non-action intents */
function generateConversationalResponse(parsed: ParsedOwnerIntent, context: OwnerAgentContext): string {
  const responses = [
    `Got it! I'm here to help you manage ${context.business_name}. What would you like to do?`,
    `I'm ready. You can ask me to add services, change hours, connect WhatsApp, set policies, or anything else.`,
    `Sure thing! Just tell me what you need — "Add a service", "Block Dr. Smith next week", "Turn on Money Mode", etc.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}