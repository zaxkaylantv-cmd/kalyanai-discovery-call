async function createChatCompletion(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array is required');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI integration');
  }

  const model = options.model || process.env.SUMMARY_MODEL || 'gpt-4o-mini';
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`OpenAI chat completion failed (${response.status})`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return response.json();
}

module.exports = { createChatCompletion };
