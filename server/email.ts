import type { Env } from "./env";

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send mail through the configured provider:
 *  - graph:  Microsoft 365 via Microsoft Graph (app registration with Mail.Send,
 *            restricted to the sending mailbox). Mail comes from your own tenant.
 *  - resend: Resend API (verified sending domain).
 *  - log:    print to the Functions log (development).
 */
export async function sendMail(env: Env, mail: Mail): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? "log").toLowerCase();
  if (provider === "graph") return sendGraph(env, mail);
  if (provider === "resend") return sendResend(env, mail);
  console.log(`[mail:${provider}] to=${mail.to.join(",")} subject=${mail.subject}\n${mail.text}`);
}

let graphToken: { value: string; expires: number } | null = null;

async function sendGraph(env: Env, mail: Mail) {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, EMAIL_FROM } = env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !EMAIL_FROM) {
    throw new Error("Graph mail requires MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and EMAIL_FROM.");
  }
  if (!graphToken || graphToken.expires < Date.now() + 60_000) {
    const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) throw new Error(`Graph token request failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    graphToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(EMAIL_FROM)}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${graphToken.value}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: mail.html ? { contentType: "HTML", content: mail.html } : { contentType: "Text", content: mail.text },
        toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
}

async function sendResend(env: Env, mail: Mail) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Resend requires RESEND_API_KEY and EMAIL_FROM.");
  const from = env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function codeEmail(code: string, title: string, from: string): Mail & { to: [] } {
  const text = `Your verification code for "${title}" is ${code}.\n\nIt expires in 10 minutes. If you did not request it, you can ignore this email.\n\n- ${from}`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#0B2B4A;max-width:480px">
<p>Your verification code for <strong>${esc(title)}</strong>:</p>
<p style="font:600 28px/1.2 ui-monospace,monospace;letter-spacing:6px;margin:16px 0">${code}</p>
<p style="color:#4B4F56">It expires in 10 minutes. If you did not request it, you can ignore this email.</p>
<p style="color:#4B4F56">- ${esc(from)}</p></div>`;
  return { to: [], subject: `${code} is your ${from} verification code`, text, html };
}
