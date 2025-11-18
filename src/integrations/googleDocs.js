async function createSummaryDoc(payload = {}) {
  if (!payload.insights) {
    throw new Error('insights are required to build the Google Doc');
  }

  if (payload.mockDocUrl) {
    return payload.mockDocUrl;
  }

  if (process.env.NODE_ENV === 'test') {
    return 'https://docs.google.com/document/d/mock-summary';
  }

  throw new Error('Google Docs API integration not implemented yet');
}

module.exports = { createSummaryDoc };
