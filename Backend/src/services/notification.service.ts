// Notification Service
// Placeholder delivery channel: no SMTP/email provider is configured for this project, so
// outbound notifications are logged to the server console instead of actually being emailed.
// Swap the body of these functions for a real provider (SMTP, SendGrid, SES, etc.) when one
// is available; callers do not need to change.

export const notificationService = {
  sendPasswordResetCode(email: string, code: string): void {
    console.log(`[DEV EMAIL] Password reset code for ${email}: ${code} (expires in 15 minutes)`);
  }
};
