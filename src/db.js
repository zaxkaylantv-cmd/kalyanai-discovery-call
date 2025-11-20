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
    updateJob,
    getJobs,
    getJobById,
    deleteJobById,
  };
}

function createInMemoryDb() {
  const jobs = [];
  const jobsById = new Map();

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
    updateJob,
    getJobs,
    getJobById,
    deleteJobById,
  };
}
