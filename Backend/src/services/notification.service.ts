// Notification Service
// Sends transactional emails (currently just the password reset code) via the Resend API.

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

export const notificationService = {
  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    if (!resendApiKey || !emailFrom) {
      console.error('Password reset email not sent: RESEND_API_KEY or EMAIL_FROM is not configured.');
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailFrom,
        to: email,
        subject: 'Your password reset code',
        text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API request failed (${response.status}): ${body}`);
    }
  }
};
