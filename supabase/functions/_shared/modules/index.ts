/**
 * Growth & Operations Modules — barrel export
 *
 * 20 modules total, each self-contained:
 *   Tier 1 (8): Fully autonomous
 *   Tier 2 (6): Drafts, human sends (need email/SMS connectors)
 *   Tier 3 (6): Connector slots only (on roadmap)
 */

// ── Tier 1: Fully Autonomous ──────────────────────────────────────

export { extractLeads, getLeads } from "./leadGenerator.ts";
export type { Lead, LeadCriteria } from "./leadGenerator.ts";

export { generateContent, generateContentVariants } from "./contentGeneration.ts";
export type { ContentRequest, GeneratedContent } from "./contentGeneration.ts";

export { generateDigest } from "./analyticsDigest.ts";
export type { DigestReport } from "./analyticsDigest.ts";

export { analyzeCompetitorData, getMonitoringReport } from "./competitorMonitoring.ts";
export type { CompetitorAlert, MonitoringConfig } from "./competitorMonitoring.ts";

// ── Tier 2: Need Email/SMS Connectors ─────────────────────────────

export { respondToEmail } from "./emailResponder.ts";
export type { InboundEmail, EmailResponse } from "./emailResponder.ts";

export { executeCampaign } from "./emailSender.ts";
export type { CampaignRequest } from "./emailSender.ts";

export { executeSmsCampaign } from "./smsCampaign.ts";
export type { SmsCampaignRequest } from "./smsCampaign.ts";

export { sendSurvey, getFeedbackAnalytics } from "./customerFeedback.ts";
export type { SurveyConfig, SurveyResponse } from "./customerFeedback.ts";

export { generateReferralCode, trackReferralConversion, getReferralAnalytics } from "./referralProgram.ts";
export type { ReferralConfig, ReferralCode } from "./referralProgram.ts";

export { processPaymentFollowUps } from "./invoiceFollowUp.ts";
export type { FollowUpConfig, PaymentReminder } from "./invoiceFollowUp.ts";

export { generateDocument, generateQuote } from "./documentGeneration.ts";
export type { DocumentRequest, GeneratedDocument } from "./documentGeneration.ts";

// ── Tier 3: Connector Slots Only (on roadmap) ─────────────────────

export { postToSocial } from "./socialMediaPosting.ts";
export type { SocialPost } from "./socialMediaPosting.ts";

export { handleSocialMessage } from "./socialMediaResponder.ts";
export type { SocialMessage } from "./socialMediaResponder.ts";

export { checkReviews, generateReviewReply } from "./reviewManagement.ts";

export { manageInbox } from "./emailManager.ts";

export { createAdCampaign } from "./adCampaignManager.ts";
export type { AdCampaign } from "./adCampaignManager.ts";

export { syncToCalendar, importFromCalendar } from "./calendarSync.ts";

export { postJob, screenCandidate } from "./recruitmentAssistant.ts";
export type { JobPosting } from "./recruitmentAssistant.ts";

// ── Ops: Inside-the-Business (Phase C, internal-only, no connectors) ──

export { getStockAlerts, reorderSuggestions, validateStockUpdate, setStockLevel } from "./stockTracker.ts";
export type { StockAlert, StockAlertKind, StockUpdate } from "./stockTracker.ts";

export { getRoster, saveShifts, findConflicts, uncoveredDays } from "./staffRoster.ts";
export type { Shift, StaffMember, ShiftConflict } from "./staffRoster.ts";

export { getTasks, addTask, completeTask, chaseList } from "./taskChaser.ts";
export type { OpsTask, ChaseList } from "./taskChaser.ts";
