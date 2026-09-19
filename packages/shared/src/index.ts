export const APP_TIMEZONE = 'America/Sao_Paulo';

export const USER_ROLE_ADMIN = 'ADMIN';

export type UserRole = typeof USER_ROLE_ADMIN;

export {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from './business-date';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
