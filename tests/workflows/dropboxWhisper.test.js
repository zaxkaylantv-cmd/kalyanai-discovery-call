jest.mock('../../src/integrations/dropbox', () => ({ downloadFile: jest.fn() }));
jest.mock('../../src/integrations/whisper', () => ({ transcribeAudio: jest.fn() }));
jest.mock('../../src/prompts/summarizeCall', () => ({ summarizeCall: jest.fn() }));
jest.mock('../../src/integrations/googleDocs', () => ({ createSummaryDoc: jest.fn() }));
jest.mock('../../src/integrations/googleSheets', () => ({ appendRecordingRow: jest.fn() }));
jest.mock('../../src/ingestLogger', () => ({ appendIngestEvent: jest.fn() }));
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const { processDropboxAudioEvent } = require('../../src/workflows/dropboxWhisper');
const dropbox = require('../../src/integrations/dropbox');
const whisper = require('../../src/integrations/whisper');
const prompts = require('../../src/prompts/summarizeCall');
const googleDocs = require('../../src/integrations/googleDocs');
const googleSheets = require('../../src/integrations/googleSheets');
const ingestLogger = require('../../src/ingestLogger');

describe('processDropboxAudioEvent', () => {
  const baseEvent = {
    '.tag': 'file',
    path_lower: '/calls/demo.mp3',
    name: 'demo.mp3',
    size: 1234,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'sheet123';
    dropbox.downloadFile.mockResolvedValue(Buffer.from('audio-bytes'));
    whisper.transcribeAudio.mockResolvedValue('Sample transcript text');
    prompts.summarizeCall.mockResolvedValue({
      summary: 'Call summary',
      pain_points: ['Manual follow ups'],
      automation_opportunities: [{ idea: 'Auto email', impact: 'High', effort: 'Low' }],
      customer_experience_impact: ['Faster replies'],
      profitability_levers: ['Less churn'],
      next_best_actions: ['Review automations'],
    });
    googleDocs.createSummaryDoc.mockResolvedValue('https://docs.google.com/document/d/123');
    googleSheets.appendRecordingRow.mockResolvedValue({ ok: true });
  });

  it('runs the full pipeline and returns doc url', async () => {
    const result = await processDropboxAudioEvent(baseEvent);

    expect(dropbox.downloadFile).toHaveBeenCalledWith('/calls/demo.mp3', { cursor: undefined });
    expect(whisper.transcribeAudio).toHaveBeenCalled();
    expect(prompts.summarizeCall).toHaveBeenCalledWith('Sample transcript text', expect.any(Object));
    expect(googleDocs.createSummaryDoc).toHaveBeenCalled();
    expect(googleSheets.appendRecordingRow).toHaveBeenCalledWith(
      expect.objectContaining({
        docUrl: 'https://docs.google.com/document/d/123',
        dropboxPath: '/calls/demo.mp3',
      })
    );
    expect(ingestLogger.appendIngestEvent).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(result).toEqual({
      ok: true,
      docUrl: 'https://docs.google.com/document/d/123',
      insights: expect.objectContaining({ summary: 'Call summary' }),
    });
  });

  it('propagates errors and logs ingest failure', async () => {
    dropbox.downloadFile.mockRejectedValue(new Error('Dropbox offline'));

    await expect(processDropboxAudioEvent(baseEvent)).rejects.toThrow('Dropbox offline');

    expect(ingestLogger.appendIngestEvent).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
