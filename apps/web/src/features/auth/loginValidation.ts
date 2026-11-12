import { t } from '../../i18n/en';

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/** Client-side checks mirroring API §4.1 validation (email ≤ 254, password 1–128). The server re-validates. */
export function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const e = email.trim();
  if (e.length === 0) errors.email = t.login.emailRequired;
  else if (e.length > 254) errors.email = t.login.tooLong(254);
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.email = t.login.emailInvalid;
  if (password.length === 0) errors.password = t.login.passwordRequired;
  else if (password.length > 128) errors.password = t.login.tooLong(128);
  return errors;
}
