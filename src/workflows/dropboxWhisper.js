const crypto = require('crypto');
const logger = require('../logger');
const { appendIngestEvent } = require('../ingestLogger');
const { downloadFile } = require('../integrations/dropbox');
const { transcribeAudio } = require('../integrations/whisper');
const { summarizeCall } = require('../prompts/summarizeCall');
const { createSummaryDoc } = require('../integrations/googleDocs');
const { appendRecordingRow } = require('../integrations/googleSheets');

/**
 * Processes a Dropbox audio upload end-to-end:
 *  1. Download audio from Dropbox
 *  2. Transcribe via Whisper
 *  3. Summarize + extract insights via ChatGPT
 *  4. Create a polished Google Doc
 *
 * @param {object} event Dropbox webhook/list_folder payload entry
 * @param {object} [options]
 * @returns {Promise<object>} docUrl + metadata
 */
async function processDropboxAudioEvent(event, options = {}) {
  if (!event || !event.path_lower) {
    throw new Error('Invalid Dropbox event payload');
  }

  const jobId = options.jobId || crypto.randomUUID();
  const baseLog = {
    jobId,
    source: 'dropbox_audio',
    path: event.path_lower,
  };

  logger.info({ ...baseLog, eventType: event['.tag'] }, 'Starting Dropbox audio workflow');

  try {
    const audioBuffer = await downloadFile(event.path_lower, { cursor: event.cursor });
    const transcript = await transcribeAudio(audioBuffer, {
      fileName: event.name,
      dropboxPath: event.path_lower,
    });
    const insights = await summarizeCall(transcript, {
      fileName: event.name,
      dropboxPath: event.path_lower,
      recordedAt: event.server_modified || event.client_modified,
    });
    const docUrl = await createSummaryDoc({
      title: event.name || 'Call Summary',
      transcript,
      insights,
      metadata: {
        dropboxPath: event.path_lower,
        recordedAt: event.server_modified || event.client_modified,
        size: event.size,
      },
    });
    await appendRecordingRow({
      docUrl,
      dropboxPath: event.path_lower,
      summary: insights.summary,
      painPoints: (insights.pain_points || []).join('; '),
      automationIdeas: (insights.automation_opportunities || [])
        .map((idea) => idea.idea || '')
        .filter(Boolean)
        .join('; '),
      recordedAt: event.server_modified || event.client_modified,
      fileSize: event.size,
      jobId,
    });

    const ingestPayload = {
      ...baseLog,
      docUrl,
      transcript_chars: transcript.length,
      summary_sections: Object.keys(insights || {}),
    };
    appendIngestEvent({ ...ingestPayload, success: true });
    logger.info({ ...ingestPayload }, 'Dropbox audio workflow complete');

    return { ok: true, docUrl, insights };
  } catch (err) {
    const ingestPayload = {
      ...baseLog,
      error: err.message,
    };
    appendIngestEvent({ ...ingestPayload, success: false });
    logger.error({ ...ingestPayload, err }, 'Dropbox audio workflow failed');
    throw err;
  }
}

module.exports = { processDropboxAudioEvent };
