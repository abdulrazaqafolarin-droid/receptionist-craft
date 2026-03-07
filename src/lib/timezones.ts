// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE TIMEZONE LIST FOR GLOBAL USE
// Never hardcode a timezone. Always detect or let the user choose.
// ═══════════════════════════════════════════════════════════════════════════

export const TIMEZONE_OPTIONS = [
  // Africa
  { value: "Africa/Abidjan", label: "Abidjan (GMT+0)" },
  { value: "Africa/Accra", label: "Accra (GMT+0)" },
  { value: "Africa/Addis_Ababa", label: "Addis Ababa (GMT+3)" },
  { value: "Africa/Cairo", label: "Cairo (GMT+2)" },
  { value: "Africa/Casablanca", label: "Casablanca (GMT+1)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (GMT+2)" },
  { value: "Africa/Lagos", label: "Lagos (GMT+1)" },
  { value: "Africa/Nairobi", label: "Nairobi (GMT+3)" },
  // Americas
  { value: "America/Anchorage", label: "Anchorage (GMT-9)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (GMT-3)" },
  { value: "America/Bogota", label: "Bogota (GMT-5)" },
  { value: "America/Chicago", label: "Chicago (GMT-6)" },
  { value: "America/Denver", label: "Denver (GMT-7)" },
  { value: "America/Halifax", label: "Halifax (GMT-4)" },
  { value: "America/Lima", label: "Lima (GMT-5)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8)" },
  { value: "America/Mexico_City", label: "Mexico City (GMT-6)" },
  { value: "America/New_York", label: "New York (GMT-5)" },
  { value: "America/Phoenix", label: "Phoenix (GMT-7)" },
  { value: "America/Santiago", label: "Santiago (GMT-4)" },
  { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" },
  { value: "America/Toronto", label: "Toronto (GMT-5)" },
  { value: "America/Vancouver", label: "Vancouver (GMT-8)" },
  // Asia
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Colombo", label: "Colombo (GMT+5:30)" },
  { value: "Asia/Dhaka", label: "Dhaka (GMT+6)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (GMT+7)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Karachi", label: "Karachi (GMT+5)" },
  { value: "Asia/Kolkata", label: "Kolkata (GMT+5:30)" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Asia/Seoul", label: "Seoul (GMT+9)" },
  { value: "Asia/Shanghai", label: "Shanghai (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Taipei", label: "Taipei (GMT+8)" },
  { value: "Asia/Tehran", label: "Tehran (GMT+3:30)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  // Australia & Pacific
  { value: "Australia/Melbourne", label: "Melbourne (GMT+10)" },
  { value: "Australia/Perth", label: "Perth (GMT+8)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10)" },
  { value: "Pacific/Auckland", label: "Auckland (GMT+12)" },
  { value: "Pacific/Fiji", label: "Fiji (GMT+12)" },
  { value: "Pacific/Honolulu", label: "Honolulu (GMT-10)" },
  // Europe
  { value: "Europe/Amsterdam", label: "Amsterdam (GMT+1)" },
  { value: "Europe/Athens", label: "Athens (GMT+2)" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1)" },
  { value: "Europe/Brussels", label: "Brussels (GMT+1)" },
  { value: "Europe/Dublin", label: "Dublin (GMT+0)" },
  { value: "Europe/Istanbul", label: "Istanbul (GMT+3)" },
  { value: "Europe/Lisbon", label: "Lisbon (GMT+0)" },
  { value: "Europe/London", label: "London (GMT+0)" },
  { value: "Europe/Madrid", label: "Madrid (GMT+1)" },
  { value: "Europe/Moscow", label: "Moscow (GMT+3)" },
  { value: "Europe/Paris", label: "Paris (GMT+1)" },
  { value: "Europe/Rome", label: "Rome (GMT+1)" },
  { value: "Europe/Stockholm", label: "Stockholm (GMT+1)" },
  { value: "Europe/Zurich", label: "Zurich (GMT+1)" },
  // UTC
  { value: "UTC", label: "UTC (GMT+0)" },
];

/**
 * Detect the user's browser timezone using JavaScript's Intl API.
 * Never hardcode a timezone - always use this function as default.
 */
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Find the closest matching timezone from our list.
 * Falls back to the exact value if not in list (still valid IANA).
 */
export function findClosestTimezone(tz: string): string {
  const match = TIMEZONE_OPTIONS.find(opt => opt.value === tz);
  return match ? match.value : tz;
}
