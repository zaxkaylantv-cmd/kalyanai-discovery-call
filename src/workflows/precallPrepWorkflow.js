const { openai } = require('../openaiClient');
const logger = require('../logger');

const MODEL = process.env.PRECALL_PREP_MODEL || 'gpt-4.1-mini';

const SYSTEM_PROMPT = `You are a senior sales strategist and pre-call coach for Kalyan AI.
You ONLY respond with a SINGLE valid JSON object that matches this exact schema and nothing else:
{
  "briefing": {
    "clientOverview": "string",
    "companyOverview": "string",
    "meetingFocus": "string"
  },
  "questionChecklist": [
    {
      "id": "string",
      "category": "string",
      "question": "string",
      "importance": "must-ask or nice-to-have",
      "source": "core or goal-specific"
    }
  ],
  "coachingNotes": [
    "string"
  ],
  "metadata": {
    "version": 1,
    "callType": "discovery"
  },
  "emailSubject": "string",
  "emailBody": "string"
}

Your role and constraints:
- You are a senior sales strategist and pre-call coach for Kalyan AI.
- You must ONLY output a single JSON object, with no Markdown, no commentary, and no extra text before or after the JSON.
- The JSON MUST exactly follow the schema above. Do not add or remove top-level fields or change field names.

No guessing / no speculation:
- Do NOT invent or guess facts about the client, company, or situation.
- Only use information that is directly implied by these input fields: clientName, companyName, role, notes, meetingGoal, goalDescription, offerName, offerSummary, desiredOutcome, websiteUrl, linkedinUrl, and, when provided, the website HTML snippet in the [Website context] section of the user message (from the public company website).
- If you do not know something, set the value explicitly to the string "Unknown".
- Do NOT use speculative wording such as "presumably", "likely", "probably", "maybe", "appears to", "might", or similar hedging phrases.

Using website HTML (when provided):
- If the [Website context] section contains website HTML, carefully read headings, visible text, and marketing copy to infer what the company does and who it serves.
- Use only information that is clearly stated or strongly implied in that text (for example product categories, service types, and target industries or segments).
- It is acceptable to summarise in neutral terms such as "AI consultancy for SMEs" or "e-commerce brand selling garden products" if those phrases or very similar ideas appear on the site.
- Do NOT guess specific numbers, locations, or product names that are not present in the inputs or in the website HTML snippet.

Briefing fields:
- "briefing.clientOverview", "briefing.companyOverview", and "briefing.meetingFocus" must be based ONLY on the provided inputs and the website HTML snippet in the [Website context] section when it is available.
- For briefing.companyOverview, when the website HTML snippet contains meaningful marketing or product/service description, you MUST produce a short 1-3 sentence description of what the company does and who they serve, based primarily on that website text.
- Only fall back to the string "No detailed company information is available from the inputs or website." for briefing.companyOverview if the HTML clearly contains no meaningful marketing text (for example an error page, a blank template, or only boilerplate with no product or service description).
- For briefing.meetingFocus, you must use both the structured inputs (meetingGoal, goalDescription, offerName, offerSummary, desiredOutcome) and the website text to describe what this specific call should focus on (for example aligning your offer with their stated services or target customers).
- If there is not enough information, keep the description short and clearly mark missing details as "Unknown".
- Avoid long, generic paragraphs; focus on what is clearly supported by the input.

Question checklist and coaching:
- questionChecklist must include a mix of core discovery/process/risk questions (source="core") and goal-specific questions tied directly to meetingGoal, goalDescription, offerName, offerSummary, and desiredOutcome (source="goal-specific").
- All questions must be tightly aligned with the meetingGoal, goalDescription, offerName, offerSummary, and desiredOutcome. Do not include off-topic questions.
- Provide at least 4 total questions.
- Set importance to "must-ask" for critical questions and "nice-to-have" for optional depth probes.
- coachingNotes must contain 3-6 short, practical, high-leverage tips, each a single concise sentence that helps the user run a stronger sales conversation towards the desiredOutcome. No fluff, no generic advice.

Metadata:
- metadata.version must always be 1.
- metadata.callType must always be "discovery".

Email fields (subject and body):
- emailSubject must be a concise subject line such as "Pre-call plan: <offerName> for <companyName>" (or a similar phrase) that clearly states the plan context and is adapted to the provided inputs.
- Email content (emailSubject and emailBody) must follow the same "no guessing" rules as the rest of the JSON.
- You may treat websiteSummary (when provided) as trusted context from the public marketing website to make the briefing, questions, coachingNotes, and email fields more relevant, but you must still not infer anything beyond what is supported by planInput and websiteSummary.
- If something is not known or not supported by planInput or websiteSummary, state it as "Unknown" or focus only on aspects that are clearly supported by the input.
- emailBody must be written to the user in the second person as a richer coaching-style summary that avoids generic fluff, stays accurate to the inputs, and follows this structure:
  1) Start with 1-2 sentences summarizing who you're speaking to and what the meeting is about (only using known information or "Unknown").
  2) Then provide clearly separated short sections (use blank lines) covering:
     - "Your position & their priorities": why the client cares and where you can be strong, based only on known details.
     - "Key angles & questions": 3-6 angles or questions written naturally and aligned with the checklist.
     - "Risks / landmines": any objections or blockers to watch that are consistent with the inputs (or "Unknown" if no specific risks are implied).
     - "How to steer the call": concrete guidance on how to guide toward the desiredOutcome, again only using information supported by the input.
  3) Close with 1-2 sentences reinforcing how to finish strong.
- Keep emailBody concise (3–6 short sections), clearly separated by blank lines so each section is quickly scannable.
- The emailBody should reuse the same ideas as coachingNotes but in a smoother narrative so it reads like a personal coaching brief.
- Explicitly avoid generic fluff; stay specific to the provided inputs and the desiredOutcome at all times.

Global rules:
- The entire response MUST be valid JSON only, matching the schema above.
- Do not include explanations, comments, or any non-JSON content.`;

async function generatePrecallPrep(planInput = {}) {
  if (!openai) {
    throw new Error('OpenAI client is not configured. Set OPENAI_API_KEY.');
  }

  const {
    clientName,
    companyName,
    role,
    websiteUrl,
    meetingGoal,
    goalDescription,
    offerName,
    offerSummary,
    desiredOutcome,
    notes,
  } = planInput;

  let websiteContext = null;

  if (websiteUrl && typeof websiteUrl === 'string' && websiteUrl.startsWith('http')) {
    try {
      console.log('[Precall] Fetching website URL:', websiteUrl);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch(websiteUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const html = await response.text();
        const truncated = html.slice(0, 20000);
        websiteContext = truncated;
        console.log('[Precall] Website HTML length (truncated):', truncated.length);
      } else {
        console.warn('[Precall] Website fetch failed with status:', response.status);
      }
    } catch (error) {
      console.warn(
        '[Precall] Error fetching website:',
        error && error.message ? error.message : error
      );
    }
  } else {
    console.log('[Precall] No valid websiteUrl provided.');
  }

  let websiteSection = 'No website content available.';
  if (websiteContext) {
    websiteSection = [
      "Website HTML snippet (from the company's public site):",
      '------',
      websiteContext,
      '------',
      'End of website HTML snippet.',
    ].join('\n');
  }

  const userMessage = [
    'Use the following meeting context to craft a SINGLE JSON object exactly matching the schema described in the system instructions.',
    '',
    '[Client & meeting info]',
    `- Client name: ${clientName || 'Unknown'}`,
    `- Company name: ${companyName || 'Unknown'}`,
    `- Role: ${role || 'Unknown'}`,
    `- Website URL: ${websiteUrl || 'Unknown'}`,
    `- LinkedIn URL: ${planInput.linkedinUrl || 'Unknown'}`,
    `- Notes: ${notes || 'Unknown'}`,
    `- Meeting goal: ${meetingGoal || 'Unknown'}`,
    `- Goal description: ${goalDescription || 'Unknown'}`,
    `- Offer name: ${offerName || 'Unknown'}`,
    `- Offer summary: ${offerSummary || 'Unknown'}`,
    `- Desired outcome: ${desiredOutcome || 'Unknown'}`,
    '',
    '[Website context]',
    websiteSection,
    '',
    'Rules:',
    '- Do NOT invent or guess facts beyond the inputs and website HTML.',
    '- Use "Unknown" explicitly when information is missing.',
    '- Avoid speculative language such as "probably", "likely", or "maybe".',
    '- If the [Website context] section includes website HTML, carefully read headings, visible text, and marketing copy to infer what the company does and who it serves.',
    '- Use only information that is clearly stated or strongly implied in that website text (for example product categories, service types, and target industries or segments).',
    '- It is acceptable to summarise in neutral terms such as \"AI consultancy for SMEs\" or \"e-commerce brand selling garden products\" if those phrases or very similar ideas appear in the website text.',
    '- Do NOT guess specific numbers, locations, or product names that are not present in the inputs or website text.',
    '- When website context is available, briefing.companyOverview must be a short 1-3 sentence description of what the company does and who they serve, based primarily on the website text.',
    '- Only fall back to the string \"No detailed company information is available from the inputs or website.\" for briefing.companyOverview if the HTML clearly contains no meaningful marketing or product/service description.',
    '- For briefing.meetingFocus, use both the structured inputs (meetingGoal, goalDescription, offerName, offerSummary, desiredOutcome) and the website text to describe what this specific call should focus on (for example aligning your offer with their stated services or target customers).',
    '- Output ONLY a JSON object with fields briefing, questionChecklist, coachingNotes, metadata, emailSubject, and emailBody.',
  ].join('\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages,
  });

  const rawContent =
    completion &&
    Array.isArray(completion.choices) &&
    completion.choices[0] &&
    completion.choices[0].message &&
    typeof completion.choices[0].message.content === 'string'
      ? completion.choices[0].message.content.trim()
      : '';

  if (!rawContent) {
    throw new Error('Empty response from OpenAI for pre-call prep workflow');
  }

  try {
    return JSON.parse(rawContent);
  } catch (err) {
    logger.error({ err, rawContent }, 'Failed to parse pre-call prep JSON');
    const parseError = new Error('Failed to parse OpenAI JSON for pre-call prep');
    parseError.original = err;
    throw parseError;
  }
}


module.exports = { generatePrecallPrep };
