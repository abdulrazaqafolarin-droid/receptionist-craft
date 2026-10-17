export interface NotificationTarget {
  callerUserId: string;
  requestedUserId?: string | null;
  receptionistOwnerId?: string | null;
  hasReceptionistTarget: boolean;
}

/** Notifications may only target the authenticated caller and their operators. */
export function canCreateNotification(input: NotificationTarget): boolean {
  if (!input.callerUserId) return false;
  if (input.requestedUserId && input.requestedUserId !== input.callerUserId) return false;
  if (input.hasReceptionistTarget) {
    return !!input.receptionistOwnerId && input.receptionistOwnerId === input.callerUserId;
  }
  return true;
}
