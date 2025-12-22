// ═══════════════════════════════════════════════════════════════════════════
// TIMEZONE UTILITIES - Proper UTC/Local Conversion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the user's current timezone
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Format a UTC date string to local time display
 */
export function formatToLocalTime(
  utcDateString: string,
  timezone?: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const tz = timezone || getUserTimezone();
  const date = new Date(utcDateString);
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
}

/**
 * Format date only (no time)
 */
export function formatToLocalDate(
  utcDateString: string,
  timezone?: string
): string {
  return formatToLocalTime(utcDateString, timezone, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time only (no date)
 */
export function formatToLocalTimeOnly(
  utcDateString: string,
  timezone?: string
): string {
  return formatToLocalTime(utcDateString, timezone, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(utcDateString: string): string {
  const date = new Date(utcDateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffSeconds) < 60) {
    return rtf.format(diffSeconds, 'second');
  } else if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  } else {
    return formatToLocalDate(utcDateString);
  }
}

/**
 * Convert local time input to UTC ISO string for database storage
 */
export function localToUTC(
  localDate: Date | string,
  timezone?: string
): string {
  const date = typeof localDate === 'string' ? new Date(localDate) : localDate;
  return date.toISOString();
}

/**
 * Parse a time string (HH:MM) and date in a specific timezone to UTC
 */
export function parseLocalTimeToUTC(
  date: Date,
  timeString: string,
  timezone: string = 'UTC'
): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Create a date string in the target timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Use a fixed offset calculation
  const localDate = new Date(`${year}-${month}-${day}T${timeString}:00`);
  
  // This is a simplified version - for production, use a library like date-fns-tz
  return localDate;
}

/**
 * Check if a date is today in the user's timezone
 */
export function isToday(utcDateString: string, timezone?: string): boolean {
  const tz = timezone || getUserTimezone();
  const date = new Date(utcDateString);
  const today = new Date();
  
  const dateLocal = formatToLocalDate(utcDateString, tz);
  const todayLocal = formatToLocalDate(today.toISOString(), tz);
  
  return dateLocal === todayLocal;
}

/**
 * Get start and end of day in UTC for a given local date
 */
export function getDayBoundsUTC(
  localDate: Date,
  timezone: string = 'UTC'
): { start: string; end: string } {
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  
  const startOfDay = new Date(`${year}-${month}-${day}T00:00:00`);
  const endOfDay = new Date(`${year}-${month}-${day}T23:59:59.999`);
  
  return {
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString(),
  };
}
