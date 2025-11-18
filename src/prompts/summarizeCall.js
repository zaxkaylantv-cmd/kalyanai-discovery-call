const { createChatCompletion } = require('../integrations/openai');

const SUMMARY_SCHEMA = {
  name: 'call_summary',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      pain_points: {
        type: 'array',
        items: { type: 'string' },
      },
      automation_opportunities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            idea: { type: 'string' },
            impact: { type: 'string' },
            effort: { type: 'string' },
          },
          required: ['idea'],
        },
      },
      customer_experience_impact: {
        type: 'array',
        items: { type: 'string' },
      },
      profitability_levers: {
        type: 'array',
        items: { type: 'string' },
      },
      next_best_actions: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['summary', 'pain_points', 'automation_opportunities'],
  },
};

function buildUserPrompt(transcript, metadata = {}) {
  const header = `You will receive a raw transcript from a business meeting or sales call. Use it to produce a crisp executive summary, highlight explicit business pain points, and propose automation ideas that improve efficiency, customer experience, and profitability.`;
  const meta = JSON.stringify(metadata || {});
  return `${header}

Metadata: ${meta}

Transcript:
"""${transcript.trim()}"""`;
}

async function summarizeCall(transcript, metadata = {}) {
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    throw new Error('transcript text is required');
  }

  if (metadata.mockSummary) {
    return metadata.mockSummary;
  }

  const response = await createChatCompletion(
    [
      {
        role: 'system',
        content:
          'You are an automation consultant who writes concise summaries and actionable recommendations for executives. Always return valid JSON.',
      },
      {
        role: 'user',
        content: buildUserPrompt(transcript, metadata),
      },
    ],
    {
      responseFormat: {
        type: 'json_schema',
        json_schema: SUMMARY_SCHEMA,
      },
    }
  );

  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI response missing content');
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    const parseError = new Error('Failed to parse OpenAI summary JSON');
    parseError.original = err;
    throw parseError;
  }
}

module.exports = { summarizeCall, SUMMARY_SCHEMA };
