const fs = require('fs');
const path = require('path');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { summarizeTranscript } = require('./summarizer');
const { downloadTranscript, postToSlack } = require('./clients');
const { appendIngestEvent } = require('./ingestLogger');
const { openai } = require('./openaiClient');
const {
  initDb,
  createJob,
  updateJob,
  getJobs,
  getJobById,
  deleteJobById,
} = require('./db');
const { buildJobSummaryBody, sendJobSummaryEmail } = require('./email');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ANALYSIS_PROMPT = `You are a senior automation architect and AI business consultant for Kalyan AI.

Return a STRICT, VALID JSON object only (no Markdown, no code fences, no leading/trailing text). The first character must be {.

Your output will be parsed and injected into a document template and a dashboard. Keys must MATCH EXACTLY:

CLIENT_NAME, CLIENT_INDUSTRY, CLIENT_OVERVIEW, TIME_EFFICIENCY, COSTS_RESOURCES, RISK_QUALITY, REVENUE_GROWTH, CUSTOMER_ENGAGEMENT, DATA_SYSTEMS, TOP_PRIORITY, READINESS_CONSTRAINTS, COMPETITION_CAPACITY, KEY_OUTCOMES, AUTOMATIONS_LIST, REVENUE_IDEAS, METRICS, RED_FLAGS, NEXT_STEPS, KEY_QUOTES, PLAN_LIST.

Rules:
- Each value is plain text. No HTML, no Markdown.
- Use bullet lines that start with "- " and separate bullets with \\n, EXCEPT for CLIENT_NAME, CLIENT_INDUSTRY, and TOP_PRIORITY which must be single-line sentences (no bullets).
- Do not invent facts. If unknown, write "Unknown".
- Quote client words exactly inside quotes; include timestamps if provided, else write "Unknown".
- Tone: crisp, neutral, professional. One sentence per bullet.

Inputs you may use (any can be missing):
- transcribed_text (main input)
- plus optional structured metadata in future like: client, industry, project_goal, audience, constraints, current_stack, systems_in_use, data_sources, authentication, nonfunctional_requirements.

Return only the JSON object.`;

initDb();

function generateJobId() {
  const now = Date.now().toString();
  const randomSuffix = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${now}${randomSuffix}`;
}

function mapRowToJob(row) {
  return {
    id: row.id,
    filename: row.filename,
    originalname: row.originalname,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resultSummary: row.resultSummary,
    // For API responses we return the raw JSON string (or null),
    // matching the original in-memory behaviour.
    analysisJson: row.analysisJson || null,
    error: row.error,
    emailStatus: row.emailStatus || null,
    emailSentAt: row.emailSentAt || null,
  };
}

// ---------------- Discovery-call job processing ----------------

async function runAnalysisForJob(jobId) {
  const jobRow = getJobById(jobId);
  if (!jobRow) {
    const message = 'Job not found for processing';
    console.error(`[job ${jobId}] ${message}`);
    try {
      updateJob(jobId, {
        status: 'error',
        resultSummary: message,
        error: message,
        emailStatus: 'error',
      });
    } catch (updateErr) {
      logger.error({ updateErr, jobId }, 'Failed to update missing job record');
    }
    return;
  }

  if (!openai) {
    const message = 'OpenAI client not configured. Set OPENAI_API_KEY.';
    console.error(message);
    updateJob(jobId, {
      status: 'error',
      resultSummary: message,
      error: message,
      emailStatus: 'error',
    });
    return;
  }

  const storedFilename = jobRow.filename;
  if (!storedFilename) {
    const message = 'Missing audio filename for job.';
    console.error(`[job ${jobId}] ${message}`);
    updateJob(jobId, {
      status: 'error',
      resultSummary: message,
      error: message,
      emailStatus: 'error',
    });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, storedFilename);
  if (!fs.existsSync(filePath)) {
    const message = 'Audio file not found on disk for job.';
    console.error(`[job ${jobId}] ${message}: ${filePath}`);
    updateJob(jobId, {
      status: 'error',
      resultSummary: message,
      error: message,
      emailStatus: 'error',
    });
    return;
  }

  // --- Ensure the file has a proper audio extension for Whisper ---
  const allowedExts = [
    '.flac',
    '.m4a',
    '.mp3',
    '.mp4',
    '.mpeg',
    '.mpga',
    '.oga',
    '.ogg',
    '.wav',
    '.webm',
  ];

  const originalExt = path
    .extname(jobRow.originalname || jobRow.filename || '')
    .toLowerCase();
  const extToUse = allowedExts.includes(originalExt) ? originalExt : '.mp4';
  const tempFilePath = filePath + extToUse;

  try {
    fs.copyFileSync(filePath, tempFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      response_format: 'text',
    });

    const transcriptText =
      typeof transcription === 'string'
        ? transcription
        : transcription && typeof transcription.text === 'string'
          ? transcription.text
          : '';

    if (!transcriptText) {
      throw new Error('Empty transcript from OpenAI Whisper');
    }

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            transcribed_text: transcriptText,
          }),
        },
      ],
    });

    const rawContent =
      chatResponse &&
      Array.isArray(chatResponse.choices) &&
      chatResponse.choices[0] &&
      chatResponse.choices[0].message &&
      typeof chatResponse.choices[0].message.content === 'string'
        ? chatResponse.choices[0].message.content.trim()
        : '';

    if (!rawContent) {
      throw new Error('Empty analysis response from OpenAI Chat');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error('Failed to parse analysis JSON', err);
      logger.error({ err, jobId, rawContent }, 'Failed to parse analysis JSON');
      updateJob(jobId, {
        status: 'error',
        resultSummary: 'Analysis failed: invalid JSON from model.',
        error: 'Analysis failed: invalid JSON from model.',
        emailStatus: 'error',
      });
      return;
    }

    const resultSummary =
      parsed && typeof parsed.TOP_PRIORITY === 'string' && parsed.TOP_PRIORITY.trim()
        ? parsed.TOP_PRIORITY.trim()
        : 'Analysis complete.';

    // Build a full narrative report using the same logic as the email body
    let fullReport = null;
    try {
      const jobForReport = {
        ...jobRow,
        id: jobId,
        status: 'done',
        resultSummary,
        analysisJson: parsed,
      };
      fullReport = buildJobSummaryBody(jobForReport, parsed);
    } catch (reportErr) {
      logger.warn({ reportErr, jobId }, 'Failed to build full report for job');
      fullReport = null;
    }

    const analysisToStore = {
      ...parsed,
      // Convenience fields for the frontend
      callSummary: resultSummary,
      topPriorities: parsed.TOP_PRIORITY,
      painPoints: parsed.RED_FLAGS,
      timelineUrgency: parsed.READINESS_CONSTRAINTS,
      fullReport,
    };

    updateJob(jobId, {
      status: 'done',
      resultSummary,
      analysisJson: JSON.stringify(analysisToStore),
      error: null,
    });

    try {
      const row = getJobById(jobId);
      if (row) {
        const jobFromDb = mapRowToJob(row);
        let analysisObject = null;
        if (jobFromDb.analysisJson && typeof jobFromDb.analysisJson === 'string') {
          try {
            analysisObject = JSON.parse(jobFromDb.analysisJson);
          } catch (e) {
            analysisObject = null;
          }
        }

        const emailJob = {
          ...jobFromDb,
          analysisJson: analysisObject,
        };

        let emailStatus = 'pending';
        let emailSentAt = null;
        let emailErrorMessage = null;

        try {
          const emailOk = await sendJobSummaryEmail(emailJob);
          if (emailOk) {
            emailStatus = 'sent';
            emailSentAt = new Date().toISOString();
          } else {
            emailStatus = 'error';
            emailErrorMessage = 'Email failed: transporter returned false.';
          }
        } catch (e) {
          emailStatus = 'error';
          emailErrorMessage =
            'Email failed: ' + (e && e.message ? e.message : 'Unknown error');
          console.error('Failed to send job summary email', e);
          logger.warn({ emailErr: e, jobId }, 'Failed to send job summary email');
        }

        updateJob(jobId, {
          emailStatus,
          emailSentAt,
          error: emailErrorMessage,
        });
      }
    } catch (emailErr) {
      console.error('Unhandled error while sending email', emailErr);
      logger.warn({ emailErr, jobId }, 'Failed to send job summary email');
      updateJob(jobId, {
        emailStatus: 'error',
        error: emailErr && emailErr.message ? emailErr.message : 'Email send error',
      });
    }
  } catch (err) {
    const safeMessage =
      err && typeof err.message === 'string' ? err.message : 'Unknown error';
    console.error('Error processing job', err);
    logger.error({ err, jobId }, 'Error processing job');
    updateJob(jobId, {
      status: 'error',
      resultSummary: 'Analysis failed: ' + safeMessage,
      error: safeMessage,
      emailStatus: 'error',
    });
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupErr) {
      logger.warn({ cleanupErr, jobId }, 'Failed to clean up temp audio file');
    }
  }
}

// ---------------- Express app + routes ----------------

const app = express();
const upload = multer({ dest: UPLOAD_DIR });

app.use(express.json());
app.use(pinoHttp({ logger }));

const corsOptions = {
  origin: [
    'http://185.151.29.141:8080', // VPS frontend
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// CORS – allow VPS frontend and local dev frontends
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/process-file', upload.single('file'), (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  logger.info({ filename: file.originalname }, 'Received file upload');

  const jobId = generateJobId();
  let storedFilename = file.filename;

  if (!storedFilename) {
    const fallbackExt = path.extname(file.originalname || '');
    const fallbackName = `${jobId}${fallbackExt || '.audio'}`;
    const currentPath = file.path;

    if (currentPath) {
      const targetPath = path.join(UPLOAD_DIR, fallbackName);
      try {
        fs.renameSync(currentPath, targetPath);
        storedFilename = fallbackName;
      } catch (renameErr) {
        logger.warn({ renameErr }, 'Failed to rename uploaded file to fallback name');
        storedFilename = path.basename(currentPath);
      }
    } else {
      storedFilename = fallbackName;
    }
  }

  const job = {
    id: jobId,
    filename: storedFilename,
    originalname: file.originalname || storedFilename,
    status: 'processing',
    createdAt: new Date().toISOString(),
    emailStatus: 'pending',
    emailSentAt: null,
  };

  try {
    createJob(job);
  } catch (err) {
    logger.error({ err }, 'Failed to persist job to database');
    return res
      .status(500)
      .json({ error: 'Failed to create job record' });
  }

  res.status(200).json({
    jobId: job.id,
  });

  setImmediate(() => {
    runAnalysisForJob(job.id).catch((err) => {
      console.error('runAnalysisForJob unhandled rejection', err);
      logger.error({ err, jobId: job.id }, 'Unhandled error from runAnalysisForJob');
    });
  });
});

app.get('/jobs', (req, res) => {
  const rows = getJobs();
  const jobs = rows.map(mapRowToJob);

  res.json(jobs);
});

app.get('/jobs/:id', (req, res) => {
  const { id } = req.params;
  const row = getJobById(id);

  if (!row) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const job = mapRowToJob(row);

  return res.json(job);
});

app.delete('/jobs/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const job = getJobById(id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.filename) {
    const filePath = path.join(UPLOAD_DIR, job.filename);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        logger.warn({ err, jobId: id, filePath }, 'Failed to delete job audio file');
      }
    }
  }

  try {
    await deleteJobById(id);
  } catch (err) {
    logger.error({ err, jobId: id }, 'Failed to delete job record');
    return res.status(500).json({ error: 'Failed to delete job' });
  }

  return res.json({ success: true });
});

// ---------------- Existing /webhooks/teams logic (unchanged) ----------------

app.post('/webhooks/teams', async (req, res) => {
  try {
    const { transcript_url: transcriptUrl } = req.body || {};
    if (!transcriptUrl || typeof transcriptUrl !== 'string') {
      return res
        .status(400)
        .json({ error: 'invalid_input', message: 'Expected transcript_url string' });
    }

    const retryBaseMs = Number(process.env.RETRY_BASE_MS || 50);

    // Safe mode: dry run short-circuit
    if (process.env.DRY_RUN === '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        dryRun: true,
      });
      return res.status(200).json({ ok: true, dryRun: true });
    }

    // Gate network usage for non-mock URLs
    const isMockTranscript =
      typeof transcriptUrl === 'string' && transcriptUrl.startsWith('mock:');
    if (!isMockTranscript && process.env.ALLOW_NETWORK !== '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        error: 'network_disabled',
        message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP',
      });
      return res
        .status(400)
        .json({ error: 'network_disabled', message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP' });
    }

    // 1) Download transcript (supports mock: scheme for tests/offline)
    const transcript = await downloadTranscript(transcriptUrl, { baseMs: retryBaseMs });

    // 2) Summarize (placeholder)
    const summary = summarizeTranscript(transcript);

    // 3) Post to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    if (!webhookUrl) {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        error: 'missing_slack_webhook',
      });
      return res.status(400).json({ error: 'missing_slack_webhook' });
    }
    const isMockWebhook = webhookUrl.startsWith('mock:');
    if (!isMockWebhook && process.env.ALLOW_NETWORK !== '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        error: 'network_disabled',
        message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP',
      });
      return res
        .status(400)
        .json({ error: 'network_disabled', message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP' });
    }
    try {
      await postToSlack(webhookUrl, { text: summary }, { baseMs: retryBaseMs });
    } catch (err) {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        slack: { ok: false, error: err && err.message },
      });
      return res.status(502).json({ error: 'slack_post_failed' });
    }

    appendIngestEvent({
      ts: new Date().toISOString(),
      source: 'teams',
      transcript_url: transcriptUrl,
      summary,
      slack: { ok: true },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    req.log.error({ err: e }, 'Unhandled error in /webhooks/teams');
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = app;
