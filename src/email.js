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

function formatSection(title, value) {
  const lines = [];

  if (value == null) {
    return lines;
  }

  let contentLines = [];

  if (Array.isArray(value)) {
    contentLines = normalizeLines(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return lines;
    }
    contentLines = trimmed.split("\n").map((line) => line.trim());
  } else {
    contentLines = normalizeLines(value);
  }

  if (contentLines.length === 0) {
    return lines;
  }

  lines.push("");
  lines.push(`${title}:`);
  for (const line of contentLines) {
    lines.push(line);
  }

  return lines;
}

/**
 * Build the plain-text discovery call summary body that we email and,
 * optionally, store as a full narrative report.
 */
function buildJobSummaryBody(job, analysisOverride) {
  const hasAnalysisObject =
    analysisOverride && typeof analysisOverride === "object";

  const hasAnalysisFromJob =
    job &&
    job.analysisJson &&
    typeof job.analysisJson === "object" &&
    !Array.isArray(job.analysisJson);

  const analysis = hasAnalysisObject
    ? analysisOverride
    : hasAnalysisFromJob
      ? job.analysisJson
      : null;

  const clientNameRaw = analysis && analysis.CLIENT_NAME;
  const clientIndustryRaw = analysis && analysis.CLIENT_INDUSTRY;

  const clientName =
    typeof clientNameRaw === "string" && clientNameRaw.trim()
      ? clientNameRaw.trim()
      : "Unknown";

  const clientIndustry =
    typeof clientIndustryRaw === "string" && clientIndustryRaw.trim()
      ? clientIndustryRaw.trim()
      : "Unknown";

  const lines = [];

  lines.push("Kalyan AI - Discovery Call Summary");
  lines.push("");
  lines.push(`Client: ${clientName}`);
  lines.push(`Industry: ${clientIndustry}`);
  lines.push(`Call ID: ${job.id}`);
  lines.push(
    `Recorded File: ${job.originalname || job.filename || "N/A"}`,
  );
  lines.push(`Created At: ${job.createdAt || "Unknown"}`);

  if (!analysis) {
    lines.push("");
    lines.push("Summary:");
    lines.push(job.resultSummary || "No summary available.");
  } else {
    const a = analysis;

    lines.push(
      ...formatSection("Top Priority", a.TOP_PRIORITY),
      ...formatSection("Client Overview", a.CLIENT_OVERVIEW),
      ...formatSection("Time & Efficiency", a.TIME_EFFICIENCY),
      ...formatSection("Costs & Resources", a.COSTS_RESOURCES),
      ...formatSection("Risk & Quality", a.RISK_QUALITY),
      ...formatSection("Revenue Growth", a.REVENUE_GROWTH),
      ...formatSection("Customer Engagement", a.CUSTOMER_ENGAGEMENT),
      ...formatSection("Data & Systems", a.DATA_SYSTEMS),
      ...formatSection("Key Outcomes", a.KEY_OUTCOMES),
      ...formatSection("Recommended Automations", a.AUTOMATIONS_LIST),
      ...formatSection("Revenue Opportunities", a.REVENUE_IDEAS),
      ...formatSection("Metrics", a.METRICS),
      ...formatSection("Readiness & Constraints", a.READINESS_CONSTRAINTS),
      ...formatSection("Competition & Capacity", a.COMPETITION_CAPACITY),
      ...formatSection("Next Steps", a.NEXT_STEPS),
      ...formatSection("Key Quotes", a.KEY_QUOTES),
      ...formatSection("Plan", a.PLAN_LIST),
      ...formatSection("Red Flags", a.RED_FLAGS),
    );
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

  return lines.join("\n");
}

/**
 * Send a job summary email.
 * Returns true on success, false if sending was skipped or failed.
 */
async function sendJobSummaryEmail(job) {
  if (!NOTIFY_EMAIL || !FROM_EMAIL) {
    console.warn(
      "sendJobSummaryEmail: NOTIFY_EMAIL or FROM_EMAIL not configured; skipping email.",
    );
    return false;
  }

  if (!transporter) {
    console.warn(
      "sendJobSummaryEmail: transporter not configured correctly; skipping email.",
    );
    return false;
  }

  const hasAnalysisObject =
    job && job.analysisJson && typeof job.analysisJson === "object";

  const analysis = hasAnalysisObject ? job.analysisJson : {};

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

  const subject = `Kalyan AI - Discovery Call Summary - ${clientName} - ${job.id}`;

  const body = buildJobSummaryBody(job, analysis);

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error("sendJobSummaryEmail: failed to send email", err);
    return false;
  }
}

async function sendPrecallPlanEmail(options = {}) {
  if (!FROM_EMAIL) {
    console.warn(
      "sendPrecallPlanEmail: FROM_EMAIL not configured; skipping email.",
    );
    return false;
  }

  if (!transporter) {
    console.warn(
      "sendPrecallPlanEmail: transporter not configured correctly; skipping email.",
    );
    return false;
  }

  const recipient =
    typeof options.to === "string" ? options.to.trim() : "";

  if (!recipient) {
    console.warn(
      "sendPrecallPlanEmail: no recipient email provided; skipping email.",
    );
    return false;
  }

  const subject =
    typeof options.subject === "string" && options.subject.trim()
      ? options.subject.trim()
      : "Your pre-call plan is ready";

  const body =
    typeof options.body === "string" && options.body.trim()
      ? options.body.trim()
      : "Your pre-call plan is ready.";

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: recipient,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error("sendPrecallPlanEmail: failed to send email", err);
    return false;
  }
}

module.exports = {
  buildJobSummaryBody,
  sendJobSummaryEmail,
  sendPrecallPlanEmail,
};
