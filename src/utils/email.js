// Sends mail through Resend's HTTP API. Without RESEND_API_KEY the message is printed to the log
// instead, so password resets can still be tried locally.
const sendEmail = async ({ to, subject, text, html }) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email not sent: RESEND_API_KEY is not set] to ${to}: ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "LevelUp <onboarding@resend.dev>", to, subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
};

module.exports = { sendEmail };
