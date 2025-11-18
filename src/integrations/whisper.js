async function transcribeAudio(audioBuffer, options = {}) {
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
    throw new Error('audioBuffer (Buffer) is required');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for Whisper integration');
  }
  const model = options.model || process.env.WHISPER_MODEL || 'whisper-1';

  if (options.mockTranscript) {
    return options.mockTranscript;
  }

  const form = new FormData();
  const fileName = options.fileName || 'audio.mp3';
  form.append('file', new Blob([audioBuffer]), fileName);
  form.append('model', model);
  if (options.language) {
    form.append('language', options.language);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Whisper transcription failed (${response.status})`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  const payload = await response.json();
  return payload.text;
}

module.exports = { transcribeAudio };
