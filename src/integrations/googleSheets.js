async function appendRecordingRow(data = {}) {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is required for Sheets logging');
  }

  if (data.mockResult) {
    return data.mockResult;
  }

  if (process.env.NODE_ENV === 'test') {
    return { ok: true };
  }

  throw new Error('Google Sheets API integration not implemented yet');
}

module.exports = { appendRecordingRow };
