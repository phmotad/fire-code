export function validateEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Minimum 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('At least one digit');
  return { valid: errors.length === 0, errors };
}

export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_\-]{3,32}$/.test(username);
}

export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function validateUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function validatePhoneNumber(phone: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s\-().]/g, ''));
}

export function validateCreditCard(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0 && digits.length >= 13;
}

export function validateZipCode(zip: string, country = 'US'): boolean {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    BR: /^\d{5}-?\d{3}$/,
    GB: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
  };
  return (patterns[country] ?? /^\S+$/).test(zip.trim());
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
