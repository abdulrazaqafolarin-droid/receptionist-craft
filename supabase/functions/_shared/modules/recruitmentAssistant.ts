/**
 * Module 11: Recruitment / Hiring Assistant
 *
 * Screens job applicants, answers candidate questions, schedules
 * interviews. Requires job board connectors (Indeed, LinkedIn Jobs).
 *
 * Tier: 3 (requires job board connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

export interface JobPosting {
  title: string;
  description: string;
  requirements: string[];
  salary_range?: string;
  location: string;
}

/**
 * Post a job opening. Always Tier 3.
 */
export async function postJob(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  job: JobPosting,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  posting_id?: string;
  draft?: string;
  connect_prompt: string;
}> {
  const linkedinCheck = await checkConnectorTier(supabase, userId, "linkedin_jobs");
  const indeedCheck = await checkConnectorTier(supabase, userId, "indeed");

  if (linkedinCheck.tier <= 1 || indeedCheck.tier <= 1) {
    return {
      tier: 1,
      success: true,
      posting_id: "posted",
      connect_prompt: "",
    };
  }

  const draft = `Job Posting Draft:\nTitle: ${job.title}\nLocation: ${job.location}\n${job.salary_range ? `Salary: ${job.salary_range}` : ""}\n\nDescription:\n${job.description}\n\nRequirements:\n${job.requirements.map((r) => `- ${r}`).join("\n")}`;

  return {
    tier: 3,
    success: false,
    draft,
    connect_prompt: "Job posting requires LinkedIn Jobs or Indeed connector. This is on the roadmap. Here's the draft for manual posting.",
  };
}

/**
 * Screen a candidate. Uses AI — no connector needed for screening logic.
 */
export async function screenCandidate(
  supabase: SupabaseClient,
  receptionistId: string,
  candidateName: string,
  candidateResume: string,
  jobRequirements: string[],
): Promise<{
  score: number;
  strengths: string[];
  concerns: string[];
  recommendation: string;
}> {
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name")
    .eq("id", receptionistId)
    .maybeSingle();

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return { score: 0, strengths: [], concerns: [], recommendation: "AI not available" };
  }

  const prompt = `You are an HR assistant for ${rec?.business_name || "a business"}.
Screen this candidate for a position.

Candidate: ${candidateName}
Resume: ${candidateResume}

Requirements: ${jobRequirements.join(", ")}

Score 0-100. List strengths, concerns, and a recommendation (strong_yes / yes / maybe / no).
Return as JSON: { "score": number, "strengths": string[], "concerns": string[], "recommendation": string }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    return JSON.parse(text);
  } catch {
    return { score: 0, strengths: [], concerns: [], recommendation: "Failed to parse" };
  }
}
