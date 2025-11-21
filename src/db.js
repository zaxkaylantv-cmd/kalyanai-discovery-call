// src/db.js
// SQLite persistence with an in-memory fallback for local development

let Database;

try {
  Database = require("better-sqlite3");
} catch (err) {
  if (err && err.code === "MODULE_NOT_FOUND") {
    console.warn(
      "[DB] better-sqlite3 not available - using in-memory DB (local dev only)."
    );
  } else {
    throw err;
  }
}

const dbApi = Database ? createSqliteDb(Database) : createInMemoryDb();

module.exports = dbApi;

function createSqliteDb(Database) {
  const fs = require("fs");
  const path = require("path");

  // Ensure a /data folder exists next to /src
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // DB file: /data/discovery.sqlite
  const dbPath = path.join(dataDir, "discovery.sqlite");

  // Open (or create) the database
  const db = new Database(dbPath);

  // Run basic migration
  function initDb() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          filename TEXT,
          originalname TEXT,
          status TEXT,
          createdAt TEXT,
          updatedAt TEXT,
          resultSummary TEXT,
          analysisJson TEXT,
          error TEXT,
          emailStatus TEXT,
          emailSentAt TEXT
        )
      `).run();

    try {
      db.prepare("ALTER TABLE jobs ADD COLUMN emailStatus TEXT").run();
    } catch (e) {
      // Ignore duplicate column errors or other non-fatal issues
    }

    try {
      db.prepare("ALTER TABLE jobs ADD COLUMN emailSentAt TEXT").run();
    } catch (e) {
      // Ignore duplicate column errors or other non-fatal issues
    }

    db.prepare(`
        CREATE TABLE IF NOT EXISTS precall_plans (
          id TEXT PRIMARY KEY,
          createdAt TEXT NOT NULL,
          clientName TEXT,
          companyName TEXT,
          meetingGoal TEXT,
          offerName TEXT,
          desiredOutcome TEXT,
          briefingJson TEXT NOT NULL,
          checklistJson TEXT NOT NULL,
          coachingJson TEXT
        )
      `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS postcall_coaching (
          id TEXT PRIMARY KEY,
          jobId TEXT NOT NULL,
          precallPlanId TEXT,
          createdAt TEXT NOT NULL,
          coachingJson TEXT NOT NULL,
          emailStatus TEXT,
          emailSentAt TEXT,
          error TEXT
        )
      `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS call_checklists (
          id TEXT PRIMARY KEY,
          jobId TEXT NOT NULL,
          precallPlanId TEXT,
          createdAt TEXT NOT NULL,
          coverageJson TEXT NOT NULL
        )
      `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id TEXT PRIMARY KEY,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          autoPrecallEmail INTEGER NOT NULL DEFAULT 1,
          autoPostcallCoachingEmail INTEGER NOT NULL DEFAULT 0,
          theme TEXT NOT NULL DEFAULT 'dark'
        )
      `).run();
  }

  /**
   * Create a new job record
   * job = { id, filename, originalname, status, createdAt? }
   */
  function createJob(job) {
    const now = new Date().toISOString();

    const toInsert = {
      id: job.id,
      filename: job.filename || null,
      originalname: job.originalname || null,
      status: job.status || "uploaded",
      createdAt: job.createdAt || now,
      updatedAt: now,
      resultSummary: job.resultSummary || null,
      analysisJson: job.analysisJson || null,
      error: job.error || null,
      emailStatus: job.emailStatus || null,
      emailSentAt: job.emailSentAt || null,
    };

    const stmt = db.prepare(`
        INSERT INTO jobs (
          id,
          filename,
          originalname,
          status,
          createdAt,
          updatedAt,
          resultSummary,
          analysisJson,
          error,
          emailStatus,
          emailSentAt
        ) VALUES (
          @id,
          @filename,
          @originalname,
          @status,
          @createdAt,
          @updatedAt,
          @resultSummary,
          @analysisJson,
          @error,
          @emailStatus,
          @emailSentAt
        )
      `);

    stmt.run(toInsert);
  }

  /**
   * Create a new precall plan record
   * plan = {
   *   id,
   *   createdAt,
   *   clientName,
   *   companyName,
   *   meetingGoal,
   *   offerName,
   *   desiredOutcome,
   *   briefingJson,
   *   checklistJson,
   *   coachingJson,
   * }
   */
  function createPrecallPlan(plan) {
    const toInsert = {
      id: plan.id,
      createdAt: plan.createdAt,
      clientName: plan.clientName || null,
      companyName: plan.companyName || null,
      meetingGoal: plan.meetingGoal || null,
      offerName: plan.offerName || null,
      desiredOutcome: plan.desiredOutcome || null,
      briefingJson: plan.briefingJson,
      checklistJson: plan.checklistJson,
      coachingJson: plan.coachingJson || null,
    };

    const stmt = db.prepare(`
        INSERT INTO precall_plans (
          id,
          createdAt,
          clientName,
          companyName,
          meetingGoal,
          offerName,
          desiredOutcome,
          briefingJson,
          checklistJson,
          coachingJson
        ) VALUES (
          @id,
          @createdAt,
          @clientName,
          @companyName,
          @meetingGoal,
          @offerName,
          @desiredOutcome,
          @briefingJson,
          @checklistJson,
          @coachingJson
        )
      `);

    stmt.run(toInsert);
  }

  function getRecentPrecallPlans(limit = 20) {
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? limit
        : 20;

    const stmt = db.prepare(`
        SELECT
          id,
          createdAt,
          clientName,
          companyName,
          meetingGoal,
          offerName,
          desiredOutcome
        FROM precall_plans
        ORDER BY datetime(createdAt) DESC
        LIMIT ?
      `);

    return stmt.all(safeLimit);
  }

  function getPrecallPlanById(id) {
    const stmt = db.prepare(`
        SELECT *
        FROM precall_plans
        WHERE id = ?
      `);

    return stmt.get(id);
  }

  function deletePrecallPlanById(id) {
    const stmt = db.prepare(`
        DELETE FROM precall_plans
        WHERE id = ?
      `);

    return stmt.run(id);
  }

  function savePostcallCoaching({
    id,
    jobId,
    precallPlanId,
    createdAt,
    coachingJson,
    emailStatus = null,
    emailSentAt = null,
    error = null,
  }) {
    const stmt = db.prepare(`
        INSERT INTO postcall_coaching (
          id,
          jobId,
          precallPlanId,
          createdAt,
          coachingJson,
          emailStatus,
          emailSentAt,
          error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

    stmt.run(
      id,
      jobId,
      precallPlanId ?? null,
      createdAt,
      JSON.stringify(coachingJson),
      emailStatus,
      emailSentAt,
      error
    );
  }

  function getLatestPostcallCoachingByJobId(jobId) {
    const row = db.prepare(`
        SELECT *
        FROM postcall_coaching
        WHERE jobId = ?
        ORDER BY datetime(createdAt) DESC
        LIMIT 1
      `).get(jobId);

    if (!row) {
      return null;
    }

    let coaching;
    try {
      coaching = JSON.parse(row.coachingJson);
    } catch {
      coaching = null;
    }

    return {
      id: row.id,
      jobId: row.jobId,
      precallPlanId: row.precallPlanId,
      createdAt: row.createdAt,
      coaching,
      emailStatus: row.emailStatus,
      emailSentAt: row.emailSentAt,
      error: row.error,
    };
  }

  function saveCallChecklist({
    id,
    jobId,
    precallPlanId,
    createdAt,
    coverageJson,
  }) {
    const stmt = db.prepare(`
        INSERT INTO call_checklists (
          id,
          jobId,
          precallPlanId,
          createdAt,
          coverageJson
        ) VALUES (?, ?, ?, ?, ?)
      `);

    stmt.run(
      id,
      jobId,
      precallPlanId ?? null,
      createdAt,
      JSON.stringify(coverageJson)
    );
  }

  function getLatestCallChecklistByJobId(jobId) {
    const row = db.prepare(`
        SELECT *
        FROM call_checklists
        WHERE jobId = ?
        ORDER BY datetime(createdAt) DESC
        LIMIT 1
      `).get(jobId);

    if (!row) {
      return null;
    }

    let coverage;
    try {
      coverage = JSON.parse(row.coverageJson);
    } catch {
      coverage = null;
    }

    return {
      id: row.id,
      jobId: row.jobId,
      precallPlanId: row.precallPlanId,
      createdAt: row.createdAt,
      coverage,
    };
  }

  function getUserSettings() {
    const row = db.prepare(
      `SELECT * FROM user_settings LIMIT 1`
    ).get();

    if (!row) return null;

    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      autoPrecallEmail: row.autoPrecallEmail === 1,
      autoPostcallCoachingEmail: row.autoPostcallCoachingEmail === 1,
      theme: row.theme || "dark",
    };
  }

  function upsertUserSettings(settings = {}) {
    const existing = getUserSettings();
    const now = new Date().toISOString();

    const autoPrecallEmail = settings.autoPrecallEmail ? 1 : 0;
    const autoPostcallCoachingEmail = settings.autoPostcallCoachingEmail ? 1 : 0;
    const theme = settings.theme || "dark";

    if (!existing) {
      const id =
        settings.id ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()));
      db.prepare(
        `INSERT INTO user_settings (id, createdAt, updatedAt, autoPrecallEmail, autoPostcallCoachingEmail, theme)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, now, now, autoPrecallEmail, autoPostcallCoachingEmail, theme);
      return getUserSettings();
    }

    db.prepare(
      `UPDATE user_settings
       SET updatedAt = ?, autoPrecallEmail = ?, autoPostcallCoachingEmail = ?, theme = ?
       WHERE id = ?`
    ).run(now, autoPrecallEmail, autoPostcallCoachingEmail, theme, existing.id);

    return getUserSettings();
  }

  /**
   * Update an existing job by id
   * fields is an object like { status, resultSummary, analysisJson, error }
   */
  function updateJob(id, fields) {
    if (!id) {
      throw new Error("updateJob: id is required");
    }

    const allowed = [
      "filename",
      "originalname",
      "status",
      "resultSummary",
      "analysisJson",
      "error",
      "emailStatus",
      "emailSentAt",
    ];

    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updates[key] = fields[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      // Nothing to update
      return;
    }

    updates.updatedAt = new Date().toISOString();

    const setClause = Object.keys(updates)
      .map((key) => `${key} = @${key}`)
      .join(", ");

    const sql = `
        UPDATE jobs
        SET ${setClause}
        WHERE id = @id
      `;

    const stmt = db.prepare(sql);
    stmt.run({ id, ...updates });
  }

  /**
   * Get all jobs (newest first)
   */
  function getJobs() {
    const stmt = db.prepare(`
        SELECT *
        FROM jobs
        ORDER BY datetime(createdAt) DESC
      `);
    return stmt.all();
  }

  /**
   * Get a single job by id
   */
  function getJobById(id) {
    const stmt = db.prepare(`
        SELECT *
        FROM jobs
        WHERE id = ?
      `);
    return stmt.get(id);
  }

  /**
   * Delete a job record by id
   */
  async function deleteJobById(id) {
    const stmt = db.prepare(`
        DELETE FROM jobs
        WHERE id = ?
      `);

    stmt.run(id);
  }

  return {
    initDb,
    createJob,
    createPrecallPlan,
    getRecentPrecallPlans,
    getPrecallPlanById,
    deletePrecallPlanById,
    savePostcallCoaching,
    getLatestPostcallCoachingByJobId,
    saveCallChecklist,
    getLatestCallChecklistByJobId,
    getUserSettings,
    upsertUserSettings,
    updateJob,
    getJobs,
    getJobById,
    deleteJobById,
  };
}

function createInMemoryDb() {
  const jobs = [];
  const jobsById = new Map();
  const postcallCoachingRecords = [];
  const callChecklists = [];
  let userSettings = null;

  function initDb() {
    // Nothing to do for in-memory setup
  }

  function createJob(job) {
    const now = new Date().toISOString();
    const record = {
      id: job.id,
      filename: job.filename || null,
      originalname: job.originalname || null,
      status: job.status || "uploaded",
      createdAt: job.createdAt || now,
      updatedAt: now,
      resultSummary: job.resultSummary || null,
      analysisJson: job.analysisJson || null,
      error: job.error || null,
      emailStatus: job.emailStatus || null,
      emailSentAt: job.emailSentAt || null,
    };

    jobsById.set(record.id, record);
    const existingIndex = jobs.findIndex((existing) => existing.id === record.id);
    if (existingIndex >= 0) {
      jobs[existingIndex] = record;
    } else {
      jobs.push(record);
    }
  }

  function createPrecallPlan(plan) {
    const record = {
      id: plan.id,
      createdAt: plan.createdAt,
      clientName: plan.clientName || null,
      companyName: plan.companyName || null,
      meetingGoal: plan.meetingGoal || null,
      offerName: plan.offerName || null,
      desiredOutcome: plan.desiredOutcome || null,
      briefingJson: plan.briefingJson,
      checklistJson: plan.checklistJson,
      coachingJson: plan.coachingJson || null,
    };

    // In-memory store: reuse jobs arrays/maps semantics but separate structure
    // For simplicity, store precall plans alongside jobsById using a distinct key prefix
    jobsById.set(`precall:${record.id}`, record);
  }

  function getRecentPrecallPlans(limit = 20) {
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? limit
        : 20;

    const plans = [];
    for (const [key, value] of jobsById.entries()) {
      if (key.startsWith("precall:")) {
        plans.push({ ...value });
      }
    }

    return plans
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, safeLimit);
  }

  function getPrecallPlanById(id) {
    const record = jobsById.get(`precall:${id}`);
    return record ? { ...record } : null;
  }

  function deletePrecallPlanById(id) {
    jobsById.delete(`precall:${id}`);
  }

  function savePostcallCoaching({
    id,
    jobId,
    precallPlanId,
    createdAt,
    coachingJson,
    emailStatus = null,
    emailSentAt = null,
    error = null,
  }) {
    const record = {
      id,
      jobId,
      precallPlanId: precallPlanId || null,
      createdAt,
      coachingJson: JSON.stringify(coachingJson),
      emailStatus,
      emailSentAt,
      error,
    };

    const existingIndex = postcallCoachingRecords.findIndex(
      (entry) => entry.id === id
    );
    if (existingIndex >= 0) {
      postcallCoachingRecords[existingIndex] = record;
    } else {
      postcallCoachingRecords.push(record);
    }
  }

  function getLatestPostcallCoachingByJobId(jobId) {
    let latest = null;

    for (const entry of postcallCoachingRecords) {
      if (entry.jobId !== jobId) {
        continue;
      }

      if (
        !latest ||
        new Date(entry.createdAt).getTime() >
          new Date(latest.createdAt).getTime()
      ) {
        latest = entry;
      }
    }

    if (!latest) {
      return null;
    }

    let coaching;
    try {
      coaching = JSON.parse(latest.coachingJson);
    } catch {
      coaching = null;
    }

    return {
      id: latest.id,
      jobId: latest.jobId,
      precallPlanId: latest.precallPlanId,
      createdAt: latest.createdAt,
      coaching,
      emailStatus: latest.emailStatus,
      emailSentAt: latest.emailSentAt,
      error: latest.error,
    };
  }

  function saveCallChecklist({
    id,
    jobId,
    precallPlanId,
    createdAt,
    coverageJson,
  }) {
    const record = {
      id,
      jobId,
      precallPlanId: precallPlanId || null,
      createdAt,
      coverageJson: JSON.stringify(coverageJson),
    };

    const existingIndex = callChecklists.findIndex((entry) => entry.id === id);
    if (existingIndex >= 0) {
      callChecklists[existingIndex] = record;
    } else {
      callChecklists.push(record);
    }
  }

  function getLatestCallChecklistByJobId(jobId) {
    let latest = null;

    for (const entry of callChecklists) {
      if (entry.jobId !== jobId) {
        continue;
      }

      if (
        !latest ||
        new Date(entry.createdAt).getTime() >
          new Date(latest.createdAt).getTime()
      ) {
        latest = entry;
      }
    }

    if (!latest) {
      return null;
    }

    let coverage;
    try {
      coverage = JSON.parse(latest.coverageJson);
    } catch {
      coverage = null;
    }

    return {
      id: latest.id,
      jobId: latest.jobId,
      precallPlanId: latest.precallPlanId,
      createdAt: latest.createdAt,
      coverage,
    };
  }

  function getUserSettings() {
    if (!userSettings) {
      return null;
    }

    return {
      id: userSettings.id,
      createdAt: userSettings.createdAt,
      updatedAt: userSettings.updatedAt,
      autoPrecallEmail: userSettings.autoPrecallEmail === 1,
      autoPostcallCoachingEmail: userSettings.autoPostcallCoachingEmail === 1,
      theme: userSettings.theme || "dark",
    };
  }

  function upsertUserSettings(settings = {}) {
    const now = new Date().toISOString();
    const autoPrecallEmail = settings.autoPrecallEmail ? 1 : 0;
    const autoPostcallCoachingEmail = settings.autoPostcallCoachingEmail ? 1 : 0;
    const theme = settings.theme || "dark";

    if (!userSettings) {
      const id =
        settings.id ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()));
      userSettings = {
        id,
        createdAt: now,
        updatedAt: now,
        autoPrecallEmail,
        autoPostcallCoachingEmail,
        theme,
      };
      return getUserSettings();
    }

    userSettings = {
      ...userSettings,
      updatedAt: now,
      autoPrecallEmail,
      autoPostcallCoachingEmail,
      theme,
    };

    return getUserSettings();
  }

  function updateJob(id, fields) {
    if (!id) {
      throw new Error("updateJob: id is required");
    }

    const job = jobsById.get(id);
    if (!job) {
      return;
    }

    const allowed = [
      "filename",
      "originalname",
      "status",
      "resultSummary",
      "analysisJson",
      "error",
      "emailStatus",
      "emailSentAt",
    ];

    let hasUpdates = false;
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        job[key] = fields[key];
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      return;
    }

    job.updatedAt = new Date().toISOString();
  }

  function getJobs() {
    return jobs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((job) => ({ ...job }));
  }

  function getJobById(id) {
    const job = jobsById.get(id);
    return job ? { ...job } : undefined;
  }

  async function deleteJobById(id) {
    if (!jobsById.has(id)) {
      return;
    }

    jobsById.delete(id);
    const index = jobs.findIndex((job) => job.id === id);
    if (index >= 0) {
      jobs.splice(index, 1);
    }
  }

  return {
    initDb,
    createJob,
    createPrecallPlan,
    getRecentPrecallPlans,
    getPrecallPlanById,
    deletePrecallPlanById,
    savePostcallCoaching,
    getLatestPostcallCoachingByJobId,
    saveCallChecklist,
    getLatestCallChecklistByJobId,
    getUserSettings,
    upsertUserSettings,
    updateJob,
    getJobs,
    getJobById,
    deleteJobById,
  };
}
