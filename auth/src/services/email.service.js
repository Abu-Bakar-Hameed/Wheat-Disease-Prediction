import nodemailer from "nodemailer";
import path from "path";

/* =========================================
   TRANSPORTER (pooled + persistent)

   IMPORTANT: this file assumes a long-running
   Node process (Express/Fastify server, worker,
   etc). The transporter is created once at
   module load and reused for every send.

   If this ever runs in a serverless environment
   (Vercel/Lambda/Cloud Functions), switch to an
   HTTP-based provider (Resend/SES/Postmark)
   instead of SMTP.
========================================= */

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },

  pool: true,
  maxConnections: 5,
  maxMessages: 100,

  rateDelta: 1000,
  rateLimit: 5,

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 20000
});

/* =========================================
   BRAND
   Colours are taken from the sprout logo so the
   emails and the logo share one visual identity.
========================================= */

const BRAND = "Wheat Disease Predictor";

const BRAND_COLOR = "#1E7B34";   // header, buttons, links
const BRAND_ACCENT = "#2E9E48";  // success checkmark
const BRAND_TINT = "#F2F9F4";    // detail boxes background
const BRAND_BORDER = "#D3E9D9";  // detail boxes border
const TEXT_DARK = "#14201A";
const TEXT_MUTED = "#5B6B62";

const FROM = `"${BRAND}" <${process.env.GMAIL_USER}>`;

const APP_URL = process.env.APP_URL;

// Public HTTPS URL for the header logo. Must be reachable by the mail client
// (Gmail can't load images from localhost), so it is referenced by URL rather
// than embedded as a cid: attachment.
const LOGO_URL = process.env.LOGO_URL;

// Shown in the OTP email. Keep this in sync with the real OTP lifetime.
const OTP_EXPIRY_TEXT = "45 seconds";

// Where the "Wasn't you? Secure your account" link goes.
// Change to the route in your app where users can change their password.
const SECURE_ACCOUNT_PATH = "/forgot-password";

const baseUrl = () =>
  (APP_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const buildLink = (urlOrPath) => {
  if (!urlOrPath) return null;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return `${baseUrl()}${urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`}`;
};

// Verify once at startup, not per-send.
transporter
  .verify()
  .then(() => console.log("✅ Gmail SMTP connected"))
  .catch((error) =>
    console.error("❌ Gmail SMTP connection failed:", error.message)
  );

/* =========================================
   HTML ESCAPING

   Dynamic text is escaped before it goes into an
   email body, even when it is produced server-side.
========================================= */

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* =========================================
   SEND QUEUE (in-memory, lightweight)

   Callers never `await` a send inline in a request
   handler. They call `queueEmail(fn, args)`, which
   returns immediately. The send happens in the
   background with retry + backoff.

   For high volume or delivery guarantees across
   restarts, swap this for a real queue.
========================================= */

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWithRetry(sendFn, args) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendFn(...args);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_RETRIES;

      console.error(
        `❌ Email send failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        error.message
      );

      if (!isLastAttempt) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }

  console.error("❌ Email permanently failed after retries:", lastError.message);
  // Hook point: push to a dead-letter table, alert on-call, etc.
  throw lastError;
}

/**
 * Fire-and-forget helper. Returns immediately; the actual
 * send + retries happen in the background.
 *
 * @param {(...args: any[]) => Promise<any>} sendFn - one of the send* functions below
 * @param {any[]} args - arguments to pass to sendFn
 * @param {(error: Error) => void} [onError] - optional failure callback
 */
export function queueEmail(sendFn, args, onError) {
  sendWithRetry(sendFn, args).catch((error) => {
    if (onError) onError(error);
  });
}

/* =========================================
   RESPONSIVE / CROSS-CLIENT EMAIL WRAPPER
   Green header with the logo in a white circle
========================================= */

const emailWrapper = (contentHtml) => `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${BRAND}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { border: 0; outline: none; text-decoration: none; }

    :root { color-scheme: light; supported-color-schemes: light; }

    .email-container {
      width: 600px;
      max-width: 600px;
    }

    .email-content {
      padding: 32px !important;
    }

    .otp-code {
      font-size: 34px !important;
      letter-spacing: 10px !important;
    }

    .btn {
      display: inline-block !important;
      width: auto !important;
    }

    @media only screen and (max-width: 768px) {
      .email-container {
        width: 92% !important;
        max-width: 92% !important;
      }
    }

    @media only screen and (max-width: 480px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
      }

      .email-content {
        padding: 24px 20px !important;
      }

      .email-header {
        padding: 20px 20px !important;
      }

      .email-footer {
        padding: 14px 20px !important;
      }

      .otp-code {
        font-size: 26px !important;
        letter-spacing: 5px !important;
      }

      .btn {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box;
        text-align: center !important;
      }

      h1, h2 {
        font-size: 20px !important;
      }
    }

    @media only screen and (max-width: 360px) {
      .otp-code {
        font-size: 22px !important;
        letter-spacing: 3px !important;
      }

      .email-content {
        padding: 18px 14px !important;
      }
    }
  </style>
</head>

<body class="email-bg" style="
  margin:0;
  padding:0;
  background:#f4f4f7;
  font-family:Arial, Helvetica, sans-serif;
">

<table
  role="presentation"
  width="100%"
  cellpadding="0"
  cellspacing="0"
  class="email-bg"
  style="background:#f4f4f7;padding:40px 12px;"
>
  <tr>
    <td align="center">

      <!--[if mso]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center">
      <tr>
      <td>
      <![endif]-->

      <table
        role="presentation"
        class="email-container email-card"
        width="600"
        cellpadding="0"
        cellspacing="0"
        style="
          background:#ffffff;
          border-radius:12px;
          overflow:hidden;
          margin:0 auto;
        "
      >

        <tr>
          <td class="email-header" style="
            background:${BRAND_COLOR};
            padding:26px 32px 24px;
            text-align:center;
          ">
            <!-- LOGO in a white circle -->
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
              <tr>
                <td style="background:#ffffff; border-radius:50%; padding:10px;">
                  <img
                    src="${LOGO_URL}"
                    alt="${BRAND} Logo"
                    width="40"
                    style="display:block; border:0; width:40px; height:auto;"
                  />
                </td>
              </tr>
            </table>
            <span style="
              font-size:20px;
              font-weight:bold;
              color:#ffffff;
              display:block;
            ">
              ${BRAND}
            </span>
          </td>
        </tr>

        <tr>
          <td class="email-content" style="padding:32px;">
            ${contentHtml}
          </td>
        </tr>

        <tr>
          <td class="email-footer" style="
            padding:14px 32px;
            background:#F5F8F6;
            border-top:1px solid #E2EAE5;
          ">
            <p style="
              margin:0;
              font-size:11px;
              color:#6B7A71;
              text-align:center;
            ">
              © ${new Date().getFullYear()} ${BRAND}.
              This is an automated message.
            </p>
          </td>
        </tr>

      </table>

      <!--[if mso]>
      </td>
      </tr>
      </table>
      <![endif]-->

    </td>
  </tr>
</table>

</body>
</html>
`;

const bulletproofButton = (href, label) => `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="16%" fillcolor="${BRAND_COLOR}" stroke="f">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a
  href="${href}"
  class="btn"
  style="
    display:inline-block;
    padding:14px 32px;
    background:${BRAND_COLOR};
    color:#ffffff;
    text-decoration:none;
    font-weight:bold;
    border-radius:8px;
    font-size:15px;
    mso-hide:all;
  "
>
  ${label}
</a>
<!--<![endif]-->
`;

// No attachments. The header logo is referenced by public URL (LOGO_URL)
// instead of an inline cid: image, so nothing is attached to any email — this
// also removes the "logo.png" attachment chip Gmail shows in the inbox list.
const getAttachments = () => [];

// Reusable "details" box used by several emails.
const detailsBox = (innerHtml) => `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="
  background:${BRAND_TINT};
  border:1px solid ${BRAND_BORDER};
  border-radius:10px;
  margin-bottom:20px;
">
  <tr>
    <td style="padding:14px 16px;">
      ${innerHtml}
    </td>
  </tr>
</table>
`;

const detailsLabel = (text) => `
<p style="margin:0 0 10px; color:#4F6B58; font-size:11px; text-transform:uppercase; letter-spacing:.8px;">
  ${text}
</p>
`;

/* =========================================
   SEND OTP EMAIL
========================================= */

export const sendOtpEmail = async (email, otp, name) => {
  const content = `
      <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:22px;">
        Verify your email
      </h2>

      <p style="margin:0 0 8px; color:#444; font-size:15px;">
        Hello ${escapeHtml(name || "there")},
      </p>

      <p style="margin:0 0 24px; color:#444; font-size:15px; line-height:1.5;">
        Thanks for creating an account with ${BRAND}.
        Use the verification code below.
      </p>

      <div style="
        background:${BRAND_TINT};
        border:1px dashed ${BRAND_COLOR};
        border-radius:10px;
        padding:20px;
        text-align:center;
        margin-bottom:24px;
      ">
        <div class="otp-code" style="
          font-family:'Courier New',Courier,monospace;
          font-size:34px;
          font-weight:bold;
          letter-spacing:10px;
          color:${BRAND_COLOR};
        ">
          ${escapeHtml(otp)}
        </div>

        <p style="margin:10px 0 0; font-size:12px; color:#888;">
          This code expires in ${OTP_EXPIRY_TEXT}.
        </p>
      </div>

      <p style="margin:0; font-size:13px; color:#999;">
        If you didn't create this account,
        you can safely ignore this email.
      </p>
    `;

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Verify your email address",
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Hello ${name || "there"},\n\nYour ${BRAND} verification code is: ${otp}\nIt expires in ${OTP_EXPIRY_TEXT}.\n\nIf you didn't create this account, you can safely ignore this email.\n`
  });

  console.log("✅ OTP email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND PASSWORD RESET EMAIL
========================================= */

export const sendPasswordResetEmail = async (email, resetLink) => {
  const safeLink = escapeHtml(resetLink);

  const content = `
      <h2 style="margin:0 0 16px; color:${TEXT_DARK}; font-size:22px;">
        Reset your password
      </h2>

      <p style="margin:0 0 24px; color:#444; font-size:15px; line-height:1.5;">
        We received a request to reset your
        ${BRAND} account password.
      </p>

      <div style="text-align:center; margin-bottom:24px;">
        ${bulletproofButton(safeLink, "Reset password")}
      </div>

      <p style="margin:0; font-size:13px; color:#999;">
        If you didn't request this,
        you can safely ignore this email.
      </p>
    `;

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your password",
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `We received a request to reset your ${BRAND} account password.\n\nReset link: ${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n`
  });

  console.log("✅ Password reset email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND LOGIN NOTIFICATION EMAIL
========================================= */

export const sendLoginEmail = async (email, name) => {
  const loginDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const loginTime = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const safeName = escapeHtml(name || "Customer");
  const safeEmail = escapeHtml(email);
  const secureUrl = buildLink(SECURE_ACCOUNT_PATH);

  const content = `
      <div style="text-align:center; margin-bottom:24px;">
        <div style="
          width:54px;
          height:54px;
          margin:0 auto 14px;
          background:${BRAND_ACCENT};
          border-radius:50%;
          text-align:center;
          line-height:54px;
          color:#ffffff;
          font-size:28px;
        ">
          &#10003;
        </div>

        <h1 style="margin:0 0 6px; color:${TEXT_DARK}; font-size:22px; font-weight:700;">
          Login successful
        </h1>

        <p style="margin:0; color:${TEXT_MUTED}; font-size:13px;">
          Your account was accessed
        </p>
      </div>

      <p style="margin:0 0 8px; color:${TEXT_DARK}; font-size:14px;">
        Dear ${safeName},
      </p>

      <p style="margin:0 0 16px; color:${TEXT_DARK}; font-size:14px; line-height:1.6;">
        You've logged in to <strong>${BRAND}</strong>.
      </p>

      ${detailsBox(`
        ${detailsLabel("Login details")}
        <p style="margin:0 0 6px; color:${TEXT_DARK}; font-size:13px;">
          <strong>Date:</strong> ${loginDate}
        </p>
        <p style="margin:0 0 6px; color:${TEXT_DARK}; font-size:13px;">
          <strong>Time:</strong> ${loginTime}
        </p>
        <p style="margin:0; color:${TEXT_DARK}; font-size:13px; word-break:break-all;">
          <strong>Account:</strong>
          <a href="mailto:${safeEmail}" style="color:${BRAND_COLOR}; text-decoration:underline;">${safeEmail}</a>
        </p>
      `)}

      <p style="margin:0; color:${TEXT_MUTED}; font-size:13px;">
        Wasn't you?
        <a href="${secureUrl}" style="color:${BRAND_COLOR}; font-weight:bold; text-decoration:underline;">Secure your account</a>
      </p>
    `;

  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    replyTo: process.env.GMAIL_USER,
    subject: `${BRAND} - Successful login`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Dear ${name || "Customer"},

You've logged in to ${BRAND}.

Date: ${loginDate}
Time: ${loginTime}
Account: ${email}

Wasn't you? Secure your account: ${secureUrl}
`
  });

  console.log("✅ Login notification email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND GENERIC NOTIFICATION EMAIL

   Used by notification.service.js for in-app
   notifications that are mirrored to email.
========================================= */

const PRIORITY_COLORS = {
  low: "#6b7280",
  normal: BRAND_COLOR,
  high: "#d97706",
  critical: "#dc2626"
};

export const sendNotificationEmail = async ({
  to,
  name = "",
  title,
  message = "",
  category = "general",
  priority = "normal",
  actionUrl = null
}) => {
  if (!to) {
    throw new Error("sendNotificationEmail: \"to\" is required");
  }

  if (!title) {
    throw new Error("sendNotificationEmail: \"title\" is required");
  }

  const accent = PRIORITY_COLORS[priority] ?? BRAND_COLOR;
  const link = buildLink(actionUrl);

  const content = `
      <div style="
        border-left:4px solid ${accent};
        padding-left:14px;
        margin-bottom:20px;
      ">
        <p style="margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:${accent};">
          ${escapeHtml(category)}
        </p>

        <h2 style="margin:0; color:${TEXT_DARK}; font-size:22px;">
          ${escapeHtml(title)}
        </h2>
      </div>

      <p style="margin:0 0 10px; color:#333; font-size:15px;">
        Dear ${escapeHtml(name || "Customer")},
      </p>

      <p style="margin:0 0 24px; color:#555; font-size:14px; line-height:1.7;">
        ${escapeHtml(message)}
      </p>

      ${
        link
          ? `<div style="text-align:center; margin-bottom:24px;">${bulletproofButton(
              escapeHtml(link),
              "View details"
            )}</div>`
          : ""
      }

      <p style="margin:0; font-size:13px; color:#999;">
        You are receiving this because notification emails are enabled
        on your ${BRAND} account. You can change this in your
        notification preferences.
      </p>
    `;

  const info = await transporter.sendMail({
    from: FROM,
    to,
    replyTo: process.env.GMAIL_USER,
    subject: `${BRAND} - ${title}`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Dear ${name || "Customer"},\n\n${title}\n\n${message}${
      link ? `\n\n${link}` : ""
    }\n`
  });

  console.log("✅ Notification email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND CALENDAR REMINDER EMAIL

   Called by the reminder scheduler when a
   farm/crop reminder comes due.
========================================= */

const REMINDER_CATEGORY_LABELS = {
  scan: "Scan reminder",
  disease: "Disease monitoring",
  weather: "Weather risk",
  farm: "Farm / crop activity",
  general: "Reminder"
};

export const sendReminderEmail = async ({
  to,
  name = "",
  title,
  message = "",
  category = "general",
  priority = "medium",
  dueDate = "",
  actionUrl = "/dashboard/calendar"
}) => {
  if (!to) throw new Error('sendReminderEmail: "to" is required');
  if (!title) throw new Error('sendReminderEmail: "title" is required');

  const accent = PRIORITY_COLORS[priority] ?? BRAND_COLOR;
  const catLabel = REMINDER_CATEGORY_LABELS[category] ?? "Reminder";
  const link = buildLink(actionUrl);

  const content = `
      <div style="border-left:4px solid ${accent}; padding-left:14px; margin-bottom:20px;">
        <p style="margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:${accent};">
          ${catLabel}
        </p>
        <h2 style="margin:0; color:${TEXT_DARK}; font-size:22px;">${escapeHtml(title)}</h2>
      </div>

      <p style="margin:0 0 10px; color:#333; font-size:15px;">Dear ${escapeHtml(name || "Farmer")},</p>

      ${
        dueDate
          ? `<p style="margin:0 0 16px; color:${TEXT_DARK}; font-size:15px;">
               Scheduled for <strong>${escapeHtml(dueDate)}</strong>
             </p>`
          : ""
      }

      ${
        message
          ? `<p style="margin:0 0 24px; color:#555; font-size:14px; line-height:1.7;">${escapeHtml(message)}</p>`
          : ""
      }

      ${
        link
          ? `<div style="text-align:center; margin-bottom:24px;">${bulletproofButton(
              escapeHtml(link),
              "Open calendar"
            )}</div>`
          : ""
      }

      <p style="margin:0; font-size:13px; color:#999;">
        You are receiving this because reminder notifications are enabled on
        your ${BRAND} account. Manage your reminders in the calendar.
      </p>
    `;

  const info = await transporter.sendMail({
    from: FROM,
    to,
    replyTo: process.env.GMAIL_USER,
    subject: `${BRAND} - Reminder: ${title}`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Dear ${name || "Farmer"},\n\nReminder: ${title}${
      dueDate ? `\nScheduled for ${dueDate}` : ""
    }${message ? `\n\n${message}` : ""}${link ? `\n\n${link}` : ""}\n`
  });

  console.log("✅ Reminder email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND HIGH-RISK DISEASE ALERT EMAIL

   Called when a prediction result is high/critical
   severity. Includes disease name, confidence,
   severity, recommendation, an optional leaf image
   thumbnail, and a deep link.
========================================= */

const SEVERITY_COLORS = {
  high: "#d97706",
  critical: "#dc2626",
  moderate: "#f59e0b",
  low: "#10b981",
  unknown: "#6b7280"
};

export const sendDiseaseAlertEmail = async ({
  to,
  name = "",
  diseaseName,
  confidencePct,
  severity,
  riskLevel,
  recommendation,
  predictionId,
  imageUrl = null
}) => {
  if (!to) throw new Error("sendDiseaseAlertEmail: \"to\" is required");

  const sev = String(severity || "").toLowerCase();
  const isCritical = sev === "critical";
  const accentColor = SEVERITY_COLORS[sev] ?? BRAND_COLOR;
  const reportUrl = `${baseUrl()}/dashboard/history/${encodeURIComponent(predictionId || "")}`;

  // Wording is deliberately hedged: this is an AI prediction, not a lab result.
  const safeDisease = escapeHtml(diseaseName || "Wheat disease");
  const conf = Number(confidencePct ?? 0);
  const confStr = `${conf.toFixed(1)}%`;
  const riskText = (riskLevel || severity || "High risk").toString().toUpperCase();
  const riskLabel = escapeHtml(riskText);
  const detectedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric"
  });
  const detectedTime = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  const imageSection = imageUrl
    ? `<div style="margin-bottom:20px;">
        <img src="${escapeHtml(imageUrl)}" alt="Wheat leaf scan"
          style="width:100%;max-width:320px;border-radius:10px;border:1px solid ${BRAND_BORDER};display:block;margin:0 auto;" />
      </div>`
    : "";

  const detailRow = (label, value, extraStyle = "") => `
    <p style="margin:0 0 8px;color:#333;font-size:14px;${extraStyle}">
      <strong>${label}:</strong> ${value}
    </p>`;

  const content = `
    <div style="border-left:4px solid ${accentColor};padding-left:14px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${accentColor};">
        ${isCritical ? "Critical disease alert" : "High-risk disease alert"}
      </p>
      <h2 style="margin:0;color:${TEXT_DARK};font-size:22px;">
        ${safeDisease} detected
      </h2>
    </div>

    <p style="margin:0 0 10px;color:#333;font-size:15px;">
      Hello ${escapeHtml(name || "user")},
    </p>

    <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7;">
      ${BRAND} detected a
      <strong>${isCritical ? "critical-risk" : "high-risk"}</strong>
      wheat disease in your recent prediction. The model classified your scan
      as <strong>${safeDisease}</strong> with
      <strong>${confStr} confidence</strong>.
    </p>

    ${imageSection}

    ${detailsBox(`
      ${detailsLabel("Prediction details")}
      ${detailRow("Disease", safeDisease)}
      ${detailRow("Risk level", riskLabel, `color:${accentColor};font-weight:bold;`)}
      ${detailRow("Confidence", confStr)}
      ${detailRow("Detected", `${detectedDate}, ${detectedTime}`)}
      ${predictionId ? detailRow("Prediction ID", escapeHtml(predictionId), "word-break:break-all;margin-bottom:0;") : ""}
    `)}

    ${recommendation ? `
    <div style="background:${BRAND_TINT};border:1px solid ${BRAND_BORDER};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 6px;color:${BRAND_COLOR};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;">
        Recommended action
      </p>
      <p style="margin:0;color:${TEXT_DARK};font-size:14px;line-height:1.6;">${escapeHtml(recommendation)}</p>
    </div>` : ""}

    <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7;">
      ${
        isCritical
          ? `Immediate attention is recommended. Please open ${BRAND} and review the complete prediction and recommended actions.`
          : `Please review the prediction and follow the recommended management actions in ${BRAND}.`
      }
    </p>

    <div style="text-align:center;margin-bottom:20px;">
      ${bulletproofButton(escapeHtml(reportUrl), "View prediction")}
    </div>

    <p style="margin:0 0 12px;font-size:12px;color:#999;">
      This is an AI prediction, not a laboratory diagnosis. Confirm with an
      agricultural expert before applying treatments.
    </p>

    <p style="margin:0;font-size:12px;color:#999;">
      You are receiving this because disease alert emails are enabled in your
      notification preferences. You can turn this off in your account settings.
    </p>
  `;

  // `null` marks a line that does not apply; empty strings are real blank lines.
  const textBody = [
    isCritical
      ? `URGENT: ${BRAND} critical disease alert`
      : `${BRAND} alert: high-risk wheat disease detected`,
    "",
    `Hello ${name || "user"},`,
    "",
    `${BRAND} detected a ${isCritical ? "critical-risk" : "high-risk"} wheat disease in your recent prediction.`,
    "",
    `Disease: ${diseaseName}`,
    `Risk level: ${riskText}`,
    `Confidence: ${confStr}`,
    `Detected: ${detectedDate}, ${detectedTime}`,
    predictionId ? `Prediction ID: ${predictionId}` : null,
    recommendation ? `Recommended action: ${recommendation}` : null,
    "",
    isCritical
      ? "Immediate attention is recommended."
      : "Please review the prediction and follow the recommended management actions.",
    "",
    `View prediction: ${reportUrl}`,
    "",
    "This is an AI prediction, not a laboratory diagnosis.",
    BRAND
  ]
    .filter((line) => line !== null)
    .join("\n");

  const info = await transporter.sendMail({
    from: FROM,
    to,
    replyTo: process.env.GMAIL_USER,
    subject: isCritical
      ? `URGENT: ${BRAND} critical disease alert — ${diseaseName}`
      : `${BRAND} alert: high-risk wheat disease detected — ${diseaseName}`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: textBody
  });

  console.log("✅ Disease alert email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND WEEKLY DIGEST EMAIL

   Summarises a user's prediction statistics
   for the past 7 days.
========================================= */

export const sendWeeklyDigestEmail = async ({
  to,
  name = "",
  stats
}) => {
  if (!to) throw new Error("sendWeeklyDigestEmail: \"to\" is required");

  const {
    total_predictions = 0,
    healthy_predictions = 0,
    diseased_predictions = 0,
    critical_cases = 0,
    average_confidence = 0,
    most_common_disease = null
  } = stats || {};

  const historyUrl = `${baseUrl()}/dashboard/history`;
  const weekStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric"
  });

  const content = `
    <h2 style="margin:0 0 6px;color:${TEXT_DARK};font-size:22px;">
      Your weekly field report
    </h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Week ending ${weekStr}
    </p>

    <p style="margin:0 0 16px;color:#333;font-size:15px;">
      Dear ${escapeHtml(name || "User")},
    </p>

    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;">
      Here is your ${BRAND} activity summary for the past 7 days.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
      <tr>
        ${[
          { label: "Total scans", value: total_predictions, color: "#2563eb" },
          { label: "Healthy", value: healthy_predictions, color: "#16a34a" },
          { label: "Diseased", value: diseased_predictions, color: "#dc2626" },
          { label: "Critical", value: critical_cases, color: "#7c3aed" }
        ]
          .map(
            (s) => `
          <td width="25%" style="padding:0 4px;">
            <div style="background:${BRAND_TINT};border:1px solid ${BRAND_BORDER};border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:${s.color};">${escapeHtml(s.value)}</p>
              <p style="margin:0;font-size:11px;color:#6b7280;">${s.label}</p>
            </div>
          </td>`
          )
          .join("")}
      </tr>
    </table>

    ${detailsBox(`
      <p style="margin:0 0 8px;color:#333;font-size:14px;">
        <strong>Avg. confidence:</strong> ${(Number(average_confidence) * 100).toFixed(1)}%
      </p>
      ${most_common_disease ? `
      <p style="margin:0;color:#333;font-size:14px;">
        <strong>Most common disease:</strong> ${escapeHtml(most_common_disease)}
      </p>` : ""}
    `)}

    <div style="text-align:center;margin-bottom:20px;">
      ${bulletproofButton(escapeHtml(historyUrl), "View full history")}
    </div>

    <p style="margin:0;font-size:12px;color:#999;">
      You are receiving this because the weekly report email is enabled in your
      notification preferences. Manage your preferences in account settings.
    </p>
  `;

  const info = await transporter.sendMail({
    from: FROM,
    to,
    replyTo: process.env.GMAIL_USER,
    subject: `${BRAND} — Weekly field report (${weekStr})`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Weekly field report — ${weekStr}\n\nDear ${name || "User"},\n\nScans: ${total_predictions} | Healthy: ${healthy_predictions} | Diseased: ${diseased_predictions} | Critical: ${critical_cases}\nAvg confidence: ${(Number(average_confidence) * 100).toFixed(1)}%\n${most_common_disease ? `Most common disease: ${most_common_disease}` : ""}\n\nView history: ${historyUrl}`
  });

  console.log("✅ Weekly digest email sent:", info.messageId);
  return info;
};

/* =========================================
   SEND SUPPORT REPLY EMAIL

   Sent to the user when an admin replies to
   their support query. The body only ever contains
   the public reply — internal admin notes must
   never be passed in by the caller.
========================================= */

export const sendSupportReplyEmail = async ({
  to,
  name = "",
  ticket,
  subject,
  replyMessage,
  adminName = "Support Team",
  actionUrl = null
}) => {
  if (!to) throw new Error("sendSupportReplyEmail: \"to\" is required");
  if (!replyMessage) throw new Error("sendSupportReplyEmail: \"replyMessage\" is required");

  const link = buildLink(actionUrl);

  // Preserve line breaks; escape everything else.
  const replyHtml = escapeHtml(replyMessage).replace(/\n/g, "<br>");

  const content = `
    <h2 style="margin:0 0 6px; color:${TEXT_DARK}; font-size:22px;">
      New reply to your support query
    </h2>

    ${ticket ? `<p style="margin:0 0 20px; color:${BRAND_COLOR}; font-size:13px; font-weight:bold; letter-spacing:.5px;">
      TICKET ${escapeHtml(ticket)}
    </p>` : ""}

    <p style="margin:0 0 10px; color:#333; font-size:15px;">
      Dear ${escapeHtml(name || "User")},
    </p>

    <p style="margin:0 0 18px; color:#555; font-size:14px; line-height:1.6;">
      Our support team has responded to your query
      ${subject ? `<strong>\u201c${escapeHtml(subject)}\u201d</strong>` : ""}.
    </p>

    <div style="
      background:${BRAND_TINT};
      border:1px solid ${BRAND_BORDER};
      border-radius:10px;
      padding:18px 20px;
      margin-bottom:24px;
    ">
      <p style="margin:0; color:#333; font-size:14px; line-height:1.7;">
        ${replyHtml}
      </p>
    </div>

    <p style="margin:0 0 20px; color:#6b7280; font-size:13px;">
      — ${escapeHtml(adminName)}, ${BRAND} Support
    </p>

    ${
      link
        ? `<div style="text-align:center; margin-bottom:24px;">${bulletproofButton(
            escapeHtml(link),
            "View and reply"
          )}</div>`
        : ""
    }

    <p style="margin:0; font-size:12px; color:#999;">
      You can reply to this conversation from your account. Please do not
      send sensitive credentials by email. You can turn support emails off in
      your notification preferences.
    </p>
  `;

  const info = await transporter.sendMail({
    from: FROM,
    to,
    replyTo: process.env.GMAIL_USER,
    subject: `[Support ${ticket ? ticket + " " : ""}] ${subject || "Re: your query"}`,
    html: emailWrapper(content),
    attachments: getAttachments(),
    text: `Dear ${name || "User"},\n\nOur support team replied to your query${ticket ? ` (${ticket})` : ""}:\n\n${replyMessage}\n\n— ${adminName}, ${BRAND} Support${link ? `\n\nView and reply: ${link}` : ""}\n`
  });

  console.log("✅ Support reply email sent:", info.messageId);
  return info;
};