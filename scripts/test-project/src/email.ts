export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  // Mock email sender
  console.log(`[EMAIL] To: ${opts.to} | Subject: ${opts.subject}`);
}

export function buildPasswordResetEmail(email: string, resetLink: string): EmailOptions {
  return {
    to: email,
    subject: 'Password Reset Request',
    body: `Click the link to reset your password: ${resetLink}\n\nThis link expires in 1 hour.`,
  };
}
