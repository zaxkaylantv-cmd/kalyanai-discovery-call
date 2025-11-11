function summarizeTranscript(text) {
  if (!text || typeof text !== 'string') {
    return 'Summary unavailable.';
  }
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const snippet = trimmed.length > 180 ? trimmed.slice(0, 180) + '…' : trimmed;
  return `Summary: ${snippet}`;
}

module.exports = { summarizeTranscript };

