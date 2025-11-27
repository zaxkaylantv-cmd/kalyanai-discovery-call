// src/email.js
// Email helper for sending discovery call summaries via SMTP using nodemailer

const nodemailer = require("nodemailer");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  NOTIFY_EMAIL,
  FROM_EMAIL,
} = process.env;

const smtpPort = SMTP_PORT ? Number(SMTP_PORT) : 587;
const smtpSecure =
  typeof SMTP_SECURE === "string"
    ? SMTP_SECURE.toLowerCase() === "true"
    : smtpPort === 465;

let transporter = null;

if (!SMTP_HOST || !SMTP_PORT) {
  console.warn(
    "email: SMTP_HOST or SMTP_PORT not configured; email sending will be disabled.",
  );
} else {
  try {
    const baseConfig = {
      host: SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
    };

    if (SMTP_USER && SMTP_PASS) {
      baseConfig.auth = {
        user: SMTP_USER,
        pass: SMTP_PASS,
      };
    }

    transporter = nodemailer.createTransport(baseConfig);
  } catch (err) {
    console.error("email: failed to create SMTP transporter", err);
    transporter = null;
  }
}

function normalizeLines(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter((line) => line.length > 0)
      .map((line) => `- ${line}`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    // If it's already multi-line, keep each line as-is
    return trimmed.split("\n").map((line) => line.trim());
  }

  // Fallback: stringify unknown types
  try {
    return [`${JSON.stringify(value)}`];
  } catch {
    return [String(value)];
  }
}

async function sendJobSummaryEmail(job) {
  if (!NOTIFY_EMAIL || !FROM_EMAIL) {
    console.warn(
      "sendJobSummaryEmail: NOTIFY_EMAIL or FROM_EMAIL not configured; skipping email.",
    );
    return;
  }

  if (!transporter) {
    console.warn(
      "sendJobSummaryEmail: transporter not configured correctly; skipping email.",
    );
    return;
  }

  const analysis =
    job && job.analysisJson && typeof job.analysisJson === "object"
      ? job.analysisJson
      : {};

  const clientNameRaw = analysis.CLIENT_NAME;
  const clientIndustryRaw = analysis.CLIENT_INDUSTRY;

  const clientName =
    typeof clientNameRaw === "string" && clientNameRaw.trim()
      ? clientNameRaw.trim()
      : "Unknown";

  const clientIndustry =
    typeof clientIndustryRaw === "string" && clientIndustryRaw.trim()
      ? clientIndustryRaw.trim()
      : "Unknown";

  const subject = `Kalyan AI Discovery Summary – ${clientName} – ${job.id}`;

  const lines = [];

  lines.push("Kalyan AI – Discovery Call Summary");
  lines.push("");
  lines.push(`Client: ${clientName}`);
  lines.push(`Industry: ${clientIndustry}`);
  lines.push(`Call ID: ${job.id}`);
  lines.push(
    `Recorded File: ${job.originalname || job.filename || "N/A"}`,
  );
  lines.push(`Created At: ${job.createdAt || "Unknown"}`);

  const sections = [
    { label: "Top Priority", key: "TOP_PRIORITY" },
    { label: "Key Outcomes", key: "KEY_OUTCOMES" },
    { label: "Recommended Automations", key: "AUTOMATIONS_LIST" },
    { label: "Revenue Opportunities", key: "REVENUE_IDEAS" },
    { label: "Next Steps", key: "NEXT_STEPS" },
  ];

  for (const section of sections) {
    const value = analysis[section.key];
    if (value == null || value === "") {
      continue;
    }

    lines.push("");
    lines.push(`${section.label}:`);

    const sectionLines = normalizeLines(value);
    if (sectionLines.length === 0) {
      // Print raw value as last resort
      lines.push(String(value));
    } else {
      for (const line of sectionLines) {
        lines.push(line);
      }
    }
  }

  if (job.status || job.resultSummary) {
    lines.push("");
    if (job.status) {
      lines.push(`Job Status: ${job.status}`);
    }
    if (job.resultSummary) {
      lines.push(`Summary: ${job.resultSummary}`);
    }
  }

  if (job.error) {
    lines.push("");
    lines.push(`Error: ${job.error}`);
  }

  const body = lines.join("\n");

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject,
      text: body,
    });
  } catch (err) {
    console.error("sendJobSummaryEmail: failed to send email", err);
  }
}

module.exports = {
  sendJobSummaryEmail,
};

