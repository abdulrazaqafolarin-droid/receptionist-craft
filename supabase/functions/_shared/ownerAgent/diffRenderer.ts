// ═══════════════════════════════════════════════════════════════════════════
// OWNER AGENT — DIFF RENDERER
// ═══════════════════════════════════════════════════════════════════════════
// Renders config diffs in plain, human language for owner approval.
// Progressive disclosure: Executive → Understanding → Technical → Audit
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ConfigDiff,
  OwnerChangeProposal,
  ExplanationContent,
  ExplanationLevel,
} from "./types.ts";

/** Human-readable field names for config paths */
const FIELD_LABELS: Record<string, string> = {
  // Business
  'business.display_name': 'Business name',
  'business.legal_name': 'Legal name',
  'business.business_type': 'Business type',
  'business.description': 'Description',
  'business.greeting_message': 'Greeting message',
  'business.tone': 'Tone',

  // Contact
  'contact.phone': 'Phone number',
  'contact.email': 'Email',
  'contact.website': 'Website',
  'contact.address': 'Address',

  // Timezone & Hours
  'timezone': 'Timezone',
  'hours': 'Operating hours',
  'operating_hours': 'Operating hours',

  // Workflows
  'workflows.appointment_booking.enabled': 'Appointment booking',
  'workflows.appointment_booking.default_duration_minutes': 'Default appointment duration',
  'workflows.product_ordering.enabled': 'Product ordering',
  'workflows.product_ordering.delivery': 'Delivery',

  // Capabilities
  'capabilities.sells_products': 'Sells products',
  'capabilities.books_appointments': 'Books appointments',
  'capabilities.offers_services': 'Offers services',
  'capabilities.delivers': 'Delivers',
  'capabilities.requires_compliance': 'Requires compliance',
  'capabilities.supports_emergency': 'Supports emergency',
  'capabilities.deposit_required': 'Deposit required',
  'capabilities.deposit_percent': 'Deposit percentage',

  // Policies
  'policies.cancellation_notice_hours': 'Cancellation notice (hours)',
  'policies.same_day_booking': 'Same-day booking',
  'policies.walk_ins': 'Walk-ins allowed',

  // Channels
  'channels.widget': 'Web widget',
  'channels.whatsapp': 'WhatsApp',
  'channels.phone': 'Phone',

  // Knowledge
  'knowledge_base': 'Knowledge base',
};

/** Format a value for display */
function formatValue(path: string, value: unknown): string {
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (path.includes('price') || path.includes('cost') || path.includes('fee')) {
      return `$${value.toLocaleString()}`;
    }
    if (path.includes('percent') || path.includes('percentage')) {
      return `${value}%`;
    }
    if (path.includes('duration') || path.includes('hours') || path.includes('minutes')) {
      return `${value} min`;
    }
    return value.toLocaleString();
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)';
    if (typeof value[0] === 'object') {
      return `${value.length} items`;
    }
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/** Get human label for a config path */
function getFieldLabel(path: string): string {
  // Exact match first
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];

  // Partial match for array paths like "services[2].price"
  const basePath = path.replace(/\[\d+\]/g, '[]');
  if (FIELD_LABELS[basePath]) return FIELD_LABELS[basePath];

  // Fallback: humanize the path
  return path
    .replace(/\[\d+\]/g, '')
    .split('.')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' '))
    .join(' → ');
}

/** Generate plain-language description of a diff */
function describeDiff(diff: ConfigDiff): string {
  const label = getFieldLabel(diff.path);

  switch (diff.change_type) {
    case 'added':
      return `Added ${label}: ${formatValue(diff.path, diff.new_value)}`;
    case 'removed':
      return `Removed ${label} (was: ${formatValue(diff.path, diff.old_value)})`;
    case 'modified':
      return `Changed ${label}: ${formatValue(diff.path, diff.old_value)} → ${formatValue(diff.path, diff.new_value)}`;
    default:
      return `${label}: ${formatValue(diff.path, diff.old_value)} → ${formatValue(diff.path, diff.new_value)}`;
  }
}

/** Build executive summary (one sentence) */
function buildExecutiveSummary(diffs: ConfigDiff[]): string {
  if (diffs.length === 0) return 'No changes';
  if (diffs.length === 1) return describeDiff(diffs[0]);

  const added = diffs.filter(d => d.change_type === 'added').length;
  const modified = diffs.filter(d => d.change_type === 'modified').length;
  const removed = diffs.filter(d => d.change_type === 'removed').length;

  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (modified) parts.push(`${modified} changed`);
  if (removed) parts.push(`${removed} removed`);

  return `${parts.join(', ')} across ${new Set(diffs.map(d => d.path.split('.')[0])).size} section${parts.length > 1 ? 's' : ''}`;
}

/** Build understanding-level explanation */
function buildUnderstandingExplanation(diffs: ConfigDiff[], reasoning: string): string {
  const lines = [buildExecutiveSummary(diffs), '', 'Details:'];
  for (const diff of diffs) {
    lines.push(`• ${describeDiff(diff)}`);
  }
  if (reasoning) {
    lines.push('', 'Reasoning:', reasoning);
  }
  return lines.join('\n');
}

/** Build technical explanation */
function buildTechnicalExplanation(diffs: ConfigDiff[]): string {
  const lines = ['Technical diff:', ''];
  for (const diff of diffs) {
    lines.push(`${diff.path}: ${diff.change_type}`);
    lines.push(`  Old: ${JSON.stringify(diff.old_value)}`);
    lines.push(`  New: ${JSON.stringify(diff.new_value)}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Build audit-level explanation */
function buildAuditExplanation(diffs: ConfigDiff[], proposal: OwnerChangeProposal): object {
  return {
    methodology: 'Config diff computed by deep comparison of OperationsConfig objects',
    data_sources: ['config_versions (latest)', 'proposed config from Configurator'],
    assumptions: [
      'Configurator reasoning is accurate',
      'No concurrent changes by other processes',
    ],
    limitations: [
      'Does not simulate customer-facing behavior changes',
      'Impact estimates are heuristic',
    ],
    sql_query: `SELECT config_json FROM config_versions WHERE receptionist_id = '...' ORDER BY version_number DESC LIMIT 1`,
    model_version: 'Configurator via Rutex Gateway',
    diffs: diffs.map(d => ({
      path: d.path,
      field: d.field,
      old: d.old_value,
      new: d.new_value,
      type: d.change_type,
    })),
    proposal_id: proposal.id,
    reasoning: proposal.reasoning,
  };
}

/** Main diff computation between two config objects */
export function computeConfigDiff(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>,
  pathPrefix = ''
): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];
  const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

  for (const key of allKeys) {
    const oldVal = oldConfig[key];
    const newVal = newConfig[key];
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    // Both objects - recurse
    if (oldVal && typeof oldVal === 'object' && !Array.isArray(oldVal) &&
        newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {
      diffs.push(...computeConfigDiff(oldVal as Record<string, unknown>, newVal as Record<string, unknown>, fullPath));
    }
    // Arrays - compare by index (simple approach)
    else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      const maxLen = Math.max(oldVal.length, newVal.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${fullPath}[${i}]`;
        const oldItem = oldVal[i];
        const newItem = newVal[i];

        if (i >= oldVal.length) {
          diffs.push({
            path: itemPath,
            field: getFieldLabel(itemPath),
            old_value: undefined,
            new_value: newItem,
            change_type: 'added',
            description: `Added item ${i + 1} to ${getFieldLabel(fullPath)}`,
          });
        } else if (i >= newVal.length) {
          diffs.push({
            path: itemPath,
            field: getFieldLabel(itemPath),
            old_value: oldItem,
            new_value: undefined,
            change_type: 'removed',
            description: `Removed item ${i + 1} from ${getFieldLabel(fullPath)}`,
          });
        } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
          // Both objects - recurse
          if (oldItem && typeof oldItem === 'object' && newItem && typeof newItem === 'object') {
            diffs.push(...computeConfigDiff(oldItem, newItem, itemPath));
          } else {
            diffs.push({
              path: itemPath,
              field: getFieldLabel(itemPath),
              old_value: oldItem,
              new_value: newItem,
              change_type: 'modified',
              description: `Changed item ${i + 1} in ${getFieldLabel(fullPath)}`,
            });
          }
        }
      }
    }
    // Primitive or different types - direct comparison
    else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      if (oldVal === undefined || oldVal === null) {
        diffs.push({
          path: fullPath,
          field: getFieldLabel(fullPath),
          old_value: oldVal,
          new_value: newVal,
          change_type: 'added',
          description: `Added ${getFieldLabel(fullPath)}: ${formatValue(fullPath, newVal)}`,
        });
      } else if (newVal === undefined || newVal === null) {
        diffs.push({
          path: fullPath,
          field: getFieldLabel(fullPath),
          old_value: oldVal,
          new_value: newVal,
          change_type: 'removed',
          description: `Removed ${getFieldLabel(fullPath)} (was: ${formatValue(fullPath, oldVal)})`,
        });
      } else {
        diffs.push({
          path: fullPath,
          field: getFieldLabel(fullPath),
          old_value: oldVal,
          new_value: newVal,
          change_type: 'modified',
          description: describeDiff({
            path: fullPath,
            field: getFieldLabel(fullPath),
            old_value: oldVal,
            new_value: newVal,
            change_type: 'modified',
            description: '',
          }),
        });
      }
    }
  }

  return diffs;
}

/** Create a full change proposal from diffs */
export function createChangeProposal(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>,
  reasoning: string,
  ownerRequest: string
): OwnerChangeProposal {
  const diffs = computeConfigDiff(oldConfig, newConfig);
  const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    summary: buildExecutiveSummary(diffs),
    diffs,
    reasoning,
    warnings: [], // Could be populated by Configurator
    estimated_impact: estimateImpact(diffs),
    requires_approval: true,
    created_at: new Date().toISOString(),
  };
}

/** Heuristic impact estimation */
function estimateImpact(diffs: ConfigDiff[]): string | undefined {
  const impacts: string[] = [];

  for (const diff of diffs) {
    const path = diff.path;

    if (path.includes('price') && diff.change_type === 'modified') {
      const pct = ((Number(diff.new_value) - Number(diff.old_value)) / Number(diff.old_value)) * 100;
      if (pct > 10) impacts.push(`Price increase ~${Math.round(pct)}% may reduce conversion`);
      else if (pct < -10) impacts.push(`Price decrease ~${Math.round(-pct)}% may increase volume`);
    }
    if (path.includes('deposit_percent') && diff.change_type === 'modified') {
      if (Number(diff.new_value) > Number(diff.old_value)) {
        impacts.push('Higher deposit may reduce no-shows but could deter bookings');
      }
    }
    if (path.includes('cancellation_notice_hours') && diff.change_type === 'modified') {
      if (Number(diff.new_value) > Number(diff.old_value)) {
        impacts.push('Longer cancellation window may reduce last-minute openings');
      }
    }
    if (path.includes('money_mode') || path.includes('ai_mode')) {
      impacts.push('Money Mode change affects conversion behavior');
    }
  }

  return impacts.length > 0 ? impacts.join('; ') : undefined;
}

/** Render diffs for a specific explanation level */
export function renderDiffForLevel(
  proposal: OwnerChangeProposal,
  level: ExplanationLevel
): ExplanationContent {
  const { diffs, reasoning } = proposal;

  return {
    executive: buildExecutiveSummary(diffs),
    understanding: buildUnderstandingExplanation(diffs, reasoning),
    technical: buildTechnicalExplanation(diffs),
    audit: buildAuditExplanation(diffs, proposal),
  };
}

/** Get the explanation text for a single level */
export function getExplanationText(
  proposal: OwnerChangeProposal,
  level: ExplanationLevel
): string {
  const content = renderDiffForLevel(proposal, level);
  return content[level];
}

/** Format proposal for display in chat */
export function formatProposalForChat(proposal: OwnerChangeProposal, level: ExplanationLevel = 'executive'): string {
  const lines = [
    `**${proposal.summary}**`,
    '',
    getExplanationText(proposal, level),
  ];

  if (proposal.warnings && proposal.warnings.length > 0) {
    lines.push('', '⚠️ **Notes:**', ...proposal.warnings.map(w => `• ${w}`));
  }

  if (proposal.estimated_impact) {
    lines.push('', '📈 **Estimated impact:**', proposal.estimated_impact);
  }

  lines.push('', '✅ **Approve** or 💬 **Tweak** or ❌ **Cancel**');

  return lines.join('\n');
}