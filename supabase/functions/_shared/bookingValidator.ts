// ═══════════════════════════════════════════════════════════════════════════
// BOOKING VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// 
// Phase 3: Booking Robustness
// - Conflict detection with detailed overlap analysis
// - Buffer time enforcement (before/after appointments)
// - Service-specific scheduling rules
// - Business hours validation
// - Rate limiting protection
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BookingRequest {
  receptionistId: string;
  serviceId: string;
  startTime: string; // ISO string
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  userId?: string;
  bookingSource?: string;
  metadata?: Record<string, any>;
}

export interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price?: number;
}

export interface SchedulingRules {
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_advance_booking_hours: number;
  max_advance_booking_days: number;
  max_daily_bookings: number | null;
  prep_time_minutes: number;
  cleanup_time_minutes: number;
}

export interface ConflictInfo {
  id: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  service?: string;
  overlap_minutes: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  conflicts?: ConflictInfo[];
  suggestions?: SlotSuggestion[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface SlotSuggestion {
  start: string;
  end: string;
  display: string;
  score: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT SCHEDULING RULES
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_SCHEDULING_RULES: SchedulingRules = {
  buffer_before_minutes: 5,
  buffer_after_minutes: 5,
  min_advance_booking_hours: 1, // Must book at least 1 hour ahead
  max_advance_booking_days: 60, // Can book up to 60 days ahead
  max_daily_bookings: null, // No limit by default
  prep_time_minutes: 0,
  cleanup_time_minutes: 0,
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class BookingValidator {
  private supabase: SupabaseClient;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // MAIN VALIDATION ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────────
  
  async validateBooking(request: BookingRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let conflicts: ConflictInfo[] = [];
    let suggestions: SlotSuggestion[] = [];
    
    // 1. Basic field validation
    const fieldErrors = this.validateFields(request);
    errors.push(...fieldErrors);
    
    if (fieldErrors.length > 0) {
      return { valid: false, errors, warnings };
    }
    
    // 2. Load service and scheduling rules
    const service = await this.loadService(request.serviceId);
    if (!service) {
      errors.push({ code: 'SERVICE_NOT_FOUND', message: 'Service not found', field: 'serviceId' });
      return { valid: false, errors, warnings };
    }
    
    const rules = await this.loadSchedulingRules(request.serviceId, service);
    
    // 3. Time validation
    const timeErrors = this.validateTime(request.startTime, rules);
    errors.push(...timeErrors);
    
    // 4. Conflict detection
    const conflictResult = await this.checkConflicts(request, service, rules);
    conflicts = conflictResult.conflicts;
    
    if (conflictResult.hasConflict) {
      errors.push({ 
        code: 'TIME_CONFLICT', 
        message: 'Selected time slot conflicts with an existing appointment',
        field: 'startTime'
      });
      
      // Generate alternative suggestions
      suggestions = await this.generateSuggestions(request, service, rules);
    }
    
    // 5. Daily booking limit check
    const limitResult = await this.checkDailyLimit(request, rules);
    if (!limitResult.allowed) {
      errors.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `Maximum daily bookings (${rules.max_daily_bookings}) reached for this date`,
        field: 'startTime'
      });
    }
    
    // 6. Business hours validation
    const hoursResult = await this.checkBusinessHours(request);
    if (!hoursResult.valid) {
      warnings.push({
        code: 'OUTSIDE_BUSINESS_HOURS',
        message: hoursResult.message || 'Selected time may be outside normal business hours'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // FIELD VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  
  private validateFields(request: BookingRequest): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (!request.receptionistId) {
      errors.push({ code: 'MISSING_FIELD', message: 'Receptionist ID is required', field: 'receptionistId' });
    }
    if (!request.serviceId) {
      errors.push({ code: 'MISSING_FIELD', message: 'Service ID is required', field: 'serviceId' });
    }
    if (!request.startTime) {
      errors.push({ code: 'MISSING_FIELD', message: 'Start time is required', field: 'startTime' });
    }
    if (!request.customerName || request.customerName.trim().length < 2) {
      errors.push({ code: 'INVALID_NAME', message: 'Customer name must be at least 2 characters', field: 'customerName' });
    }
    if (!request.customerEmail && !request.customerPhone) {
      errors.push({ code: 'MISSING_CONTACT', message: 'Phone or email is required', field: 'contact' });
    }
    
    // Email format
    if (request.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customerEmail)) {
      errors.push({ code: 'INVALID_EMAIL', message: 'Invalid email format', field: 'customerEmail' });
    }
    
    // Phone format (basic)
    if (request.customerPhone && !/^[\d\s\-+()]{7,20}$/.test(request.customerPhone)) {
      errors.push({ code: 'INVALID_PHONE', message: 'Invalid phone format', field: 'customerPhone' });
    }
    
    // Valid ISO date
    if (request.startTime) {
      const date = new Date(request.startTime);
      if (isNaN(date.getTime())) {
        errors.push({ code: 'INVALID_DATE', message: 'Invalid date format', field: 'startTime' });
      }
    }
    
    return errors;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TIME VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  
  private validateTime(startTime: string, rules: SchedulingRules): ValidationError[] {
    const errors: ValidationError[] = [];
    const requestedTime = new Date(startTime);
    const now = new Date();
    
    // Past time check
    if (requestedTime < now) {
      errors.push({ 
        code: 'TIME_IN_PAST', 
        message: 'Cannot book appointments in the past', 
        field: 'startTime' 
      });
      return errors;
    }
    
    // Minimum advance booking
    const minAdvanceMs = rules.min_advance_booking_hours * 60 * 60 * 1000;
    if (requestedTime.getTime() - now.getTime() < minAdvanceMs) {
      errors.push({
        code: 'TOO_SOON',
        message: `Appointments must be booked at least ${rules.min_advance_booking_hours} hour(s) in advance`,
        field: 'startTime'
      });
    }
    
    // Maximum advance booking
    const maxAdvanceMs = rules.max_advance_booking_days * 24 * 60 * 60 * 1000;
    if (requestedTime.getTime() - now.getTime() > maxAdvanceMs) {
      errors.push({
        code: 'TOO_FAR_AHEAD',
        message: `Appointments can only be booked up to ${rules.max_advance_booking_days} days in advance`,
        field: 'startTime'
      });
    }
    
    return errors;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONFLICT DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  
  async checkConflicts(
    request: BookingRequest, 
    service: Service, 
    rules: SchedulingRules
  ): Promise<{ hasConflict: boolean; conflicts: ConflictInfo[] }> {
    const start = new Date(request.startTime);
    const duration = service.duration_minutes + rules.prep_time_minutes + rules.cleanup_time_minutes;
    const end = new Date(start.getTime() + duration * 60000);
    
    // Apply buffers
    const startWithBuffer = new Date(start.getTime() - rules.buffer_before_minutes * 60000);
    const endWithBuffer = new Date(end.getTime() + rules.buffer_after_minutes * 60000);
    
    // Query for potential conflicts
    const { data: appointments, error } = await this.supabase
      .from('appointments')
      .select('id, start_time, end_time, customer_name, service, status')
      .eq('receptionist_id', request.receptionistId)
      .neq('status', 'cancelled')
      .lt('start_time', endWithBuffer.toISOString())
      .gt('end_time', startWithBuffer.toISOString());
    
    if (error) {
      console.error('[BookingValidator] Conflict check error:', error);
      throw error;
    }
    
    // Precise overlap detection
    const conflicts: ConflictInfo[] = [];
    
    for (const appt of appointments || []) {
      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(appt.end_time);
      
      // Check if there's actual overlap
      if (!(endWithBuffer <= apptStart || startWithBuffer >= apptEnd)) {
        // Calculate overlap duration
        const overlapStart = Math.max(startWithBuffer.getTime(), apptStart.getTime());
        const overlapEnd = Math.min(endWithBuffer.getTime(), apptEnd.getTime());
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);
        
        conflicts.push({
          id: appt.id,
          start_time: appt.start_time,
          end_time: appt.end_time,
          customer_name: appt.customer_name,
          service: appt.service,
          overlap_minutes: overlapMinutes,
        });
      }
    }
    
    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DAILY LIMIT CHECK
  // ─────────────────────────────────────────────────────────────────────────
  
  async checkDailyLimit(
    request: BookingRequest, 
    rules: SchedulingRules
  ): Promise<{ allowed: boolean; currentCount: number }> {
    if (!rules.max_daily_bookings) {
      return { allowed: true, currentCount: 0 };
    }
    
    const requestedDate = new Date(request.startTime);
    const dayStart = new Date(requestedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(requestedDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    const { count, error } = await this.supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('receptionist_id', request.receptionistId)
      .neq('status', 'cancelled')
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString());
    
    if (error) {
      console.error('[BookingValidator] Daily limit check error:', error);
      return { allowed: true, currentCount: 0 }; // Fail open
    }
    
    return {
      allowed: (count || 0) < rules.max_daily_bookings,
      currentCount: count || 0,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // BUSINESS HOURS CHECK
  // ─────────────────────────────────────────────────────────────────────────
  
  async checkBusinessHours(request: BookingRequest): Promise<{ valid: boolean; message?: string }> {
    const requestedTime = new Date(request.startTime);
    const dayOfWeek = requestedTime.getDay();
    
    const { data: rules } = await this.supabase
      .from('availability_rules')
      .select('start_time, end_time')
      .eq('receptionist_id', request.receptionistId)
      .eq('day_of_week', dayOfWeek);
    
    if (!rules || rules.length === 0) {
      return { valid: true }; // No rules = assume open
    }
    
    const requestedHour = requestedTime.getHours();
    const requestedMinute = requestedTime.getMinutes();
    const requestedTimeNum = requestedHour * 60 + requestedMinute;
    
    for (const rule of rules) {
      const [startH, startM] = rule.start_time.split(':').map(Number);
      const [endH, endM] = rule.end_time.split(':').map(Number);
      const startNum = startH * 60 + startM;
      const endNum = endH * 60 + endM;
      
      if (requestedTimeNum >= startNum && requestedTimeNum <= endNum) {
        return { valid: true };
      }
    }
    
    return { 
      valid: false, 
      message: 'Selected time is outside business hours for this day' 
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // ALTERNATIVE SUGGESTIONS
  // ─────────────────────────────────────────────────────────────────────────
  
  async generateSuggestions(
    request: BookingRequest, 
    service: Service, 
    rules: SchedulingRules
  ): Promise<SlotSuggestion[]> {
    const requestedTime = new Date(request.startTime);
    const duration = service.duration_minutes;
    
    // Search window: same day + next 2 days
    const searchStart = new Date(requestedTime);
    searchStart.setHours(0, 0, 0, 0);
    const searchEnd = new Date(searchStart.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    // Fetch availability rules
    const { data: availRules } = await this.supabase
      .from('availability_rules')
      .select('*')
      .eq('receptionist_id', request.receptionistId);
    
    // Fetch existing appointments
    const { data: appointments } = await this.supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('receptionist_id', request.receptionistId)
      .neq('status', 'cancelled')
      .gte('start_time', searchStart.toISOString())
      .lt('end_time', searchEnd.toISOString());
    
    const suggestions: SlotSuggestion[] = [];
    const now = new Date();
    let currentDay = new Date(searchStart);
    
    while (currentDay < searchEnd && suggestions.length < 5) {
      const dayOfWeek = currentDay.getDay();
      const dayRules = (availRules || []).filter((r: any) => Number(r.day_of_week) === dayOfWeek);
      
      for (const rule of dayRules) {
        const [startH, startM] = (rule.start_time || '09:00').split(':').map(Number);
        const [endH, endM] = (rule.end_time || '17:00').split(':').map(Number);
        
        let slotStart = new Date(currentDay);
        slotStart.setHours(startH, startM, 0, 0);
        
        const dayEnd = new Date(currentDay);
        dayEnd.setHours(endH, endM, 0, 0);
        
        while (slotStart < dayEnd && suggestions.length < 5) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);
          
          if (slotEnd > dayEnd || slotStart < now) {
            slotStart = new Date(slotStart.getTime() + 15 * 60000);
            continue;
          }
          
          // Check for conflicts
          const slotStartWithBuffer = new Date(slotStart.getTime() - rules.buffer_before_minutes * 60000);
          const slotEndWithBuffer = new Date(slotEnd.getTime() + rules.buffer_after_minutes * 60000);
          
          const hasConflict = (appointments || []).some((appt: any) => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            return !(slotEndWithBuffer <= apptStart || slotStartWithBuffer >= apptEnd);
          });
          
          if (!hasConflict) {
            const timeDiff = Math.abs(slotStart.getTime() - requestedTime.getTime());
            const hoursDiff = timeDiff / (1000 * 60 * 60);
            const score = Math.max(0, 1 - (hoursDiff / 48)); // Closer = higher score
            
            suggestions.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              display: slotStart.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
              score,
            });
          }
          
          slotStart = new Date(slotStart.getTime() + 15 * 60000);
        }
      }
      
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return suggestions.sort((a, b) => b.score - a.score);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // HELPER: LOAD SERVICE
  // ─────────────────────────────────────────────────────────────────────────
  
  private async loadService(serviceId: string): Promise<Service | null> {
    const { data, error } = await this.supabase
      .from('services')
      .select('id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price')
      .eq('id', serviceId)
      .maybeSingle();
    
    if (error || !data) return null;
    
    return {
      id: data.id,
      name: data.name,
      duration_minutes: data.duration_minutes || 30,
      buffer_before_minutes: data.buffer_before_minutes || 5,
      buffer_after_minutes: data.buffer_after_minutes || 5,
      price: data.price,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // HELPER: LOAD SCHEDULING RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  private async loadSchedulingRules(serviceId: string, service: Service): Promise<SchedulingRules> {
    const { data } = await this.supabase
      .from('service_scheduling_rules')
      .select('*')
      .eq('service_id', serviceId)
      .maybeSingle();
    
    if (!data) {
      // Use service buffers + defaults
      return {
        ...DEFAULT_SCHEDULING_RULES,
        buffer_before_minutes: service.buffer_before_minutes,
        buffer_after_minutes: service.buffer_after_minutes,
      };
    }
    
    return {
      buffer_before_minutes: data.buffer_before_minutes ?? service.buffer_before_minutes,
      buffer_after_minutes: data.buffer_after_minutes ?? service.buffer_after_minutes,
      min_advance_booking_hours: data.min_advance_booking_hours ?? DEFAULT_SCHEDULING_RULES.min_advance_booking_hours,
      max_advance_booking_days: data.max_advance_booking_days ?? DEFAULT_SCHEDULING_RULES.max_advance_booking_days,
      max_daily_bookings: data.max_daily_bookings,
      prep_time_minutes: data.prep_time_minutes ?? 0,
      cleanup_time_minutes: data.cleanup_time_minutes ?? 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function createBookingValidator(supabase: SupabaseClient): BookingValidator {
  return new BookingValidator(supabase);
}

export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) return '';
  
  return result.errors.map(e => `• ${e.message}`).join('\n');
}

export function formatConflictMessage(conflicts: ConflictInfo[]): string {
  if (!conflicts || conflicts.length === 0) return '';
  
  return `There's already an appointment at that time:\n` +
    conflicts.map(c => `• ${c.customer_name} - ${c.service || 'Appointment'}`).join('\n');
}

export function formatSuggestions(suggestions: SlotSuggestion[]): string {
  if (!suggestions || suggestions.length === 0) return '';
  
  return `Here are some available times:\n` +
    suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s.display}`).join('\n');
}
