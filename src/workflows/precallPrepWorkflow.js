const { openai } = require('../openaiClient');
const logger = require('../logger');

const MODEL = process.env.PRECALL_PREP_MODEL || 'gpt-5.1-mini';

const SYSTEM_PROMPT = `You are a senior sales strategist and pre-call coach for Kalyan AI.
You ONLY respond with a SINGLE valid JSON object that matches this exact schema and nothing else:
{
  "briefing": {
    "clientOverview": "string",
    "companyOverview": "string",
    "meetingFocus": "string",
    "websiteSummary": "string or null"
  },
  "questionChecklist": [
    {
      "id": "string",
      "category": "\"discovery\" | \"process\" | \"value\" | \"timeline\" | \"budget\" | \"risk\" | \"other\"",
      "question": "string",
      "importance": "\"must-ask\" | \"core\" | \"nice-to-have\"",
      "source": "\"website\" | \"goal\" | \"notes\" | \"generic\"",
      "tags": "string[]"
    }
  ],
  "coachingNotes": [
    "string"
  ],
  "meetingSuccess": "string",
  "criticalTopics": [
    {
      "title": "string",
      "whyItMatters": "string",
      "questionsToCover": ["string"]
    }
  ],
  "metadata": {
    "version": 1,
    "callType": "discovery"
  },
  "emailSubject": "string",
  "emailBody": "string",
  "emailStatus": "\"sent\" | \"skipped\" | \"error\""
}

Your role and constraints:
- You are a senior sales strategist and pre-call coach for Kalyan AI.
- You must ONLY output a single JSON object, with no Markdown, no commentary, and no extra text before or after the JSON.
- The JSON MUST exactly follow the schema above. Do not add or remove top-level fields or change field names.

No guessing / no speculation:
- Do NOT invent or guess facts about the client, company, or situation.
- Only use information that is directly implied by these input fields: clientName, companyName, role, notes, meetingGoal, goalDescription, offerName, offerSummary, desiredOutcome, websiteUrl, linkedinUrl, and, when provided, the website HTML snippet in the [Website context] section of the user message (from the public company website).
- If you do not know something, set the value explicitly to the string "Unknown".
- You MUST NOT use hedging or speculative wording such as "presumably", "likely", "probably", "maybe", "appears", "appears to be", "seems", "seems to be", "might", or similar phrases. Treat this as a hard constraint.
- When the website HTML clearly describes what the company does, state it directly (for example: "Vanguard is a property investment company..." or "Vanguard is a construction firm focused on ..."), instead of saying it "appears to be" something.
- When information is unclear or missing, say "Unknown" instead of using hedging language.

Using website HTML (when provided):
- If the [Website context] section contains website HTML, carefully read headings, visible text, and marketing copy to infer what the company does and who it serves.
- Use only information that is clearly stated or strongly implied in that text (for example product categories, service types, and target industries or segments).
- It is acceptable to summarise in neutral terms such as "AI consultancy for SMEs" or "e-commerce brand selling garden products" if those phrases or very similar ideas appear on the site.
- Do NOT guess specific numbers, locations, or product names that are not present in the inputs or in the website HTML snippet.

Briefing fields:
- "briefing.clientOverview", "briefing.companyOverview", and "briefing.meetingFocus" must be based ONLY on the provided inputs and the website HTML snippet in the [Website context] section when it is available.
- For briefing.companyOverview, when the website HTML snippet contains meaningful marketing or product/service description, you MUST produce a short 1–3 sentence description of what the company does and who they serve, based primarily on that website text.
- You MAY ONLY output the exact sentence "No detailed company information is available from the inputs or website." for briefing.companyOverview if AND ONLY IF the [Website context] section literally says "No website content available." and contains no HTML snippet.
- If any website HTML snippet is present in [Website context], you MUST NOT use that fallback sentence or anything similar; instead, you MUST write a short, direct description of what the company does and who they serve, using only what is clearly supported by the HTML plus the other inputs.
- "briefing.websiteSummary" should be a short, practical summary (2–4 sentences) of the most relevant information from the [Website context] for this meeting; if there is no meaningful website content, set it explicitly to null.
- If there is not enough information, keep the description short and clearly mark missing details as "Unknown".
- Avoid long, generic paragraphs; focus on what is clearly supported by the input.

Question checklist and coaching:
- questionChecklist must include a mix of core discovery/process/risk questions and goal-specific questions tied directly to meetingGoal, goalDescription, offerName, offerSummary, and desiredOutcome.
- Produce a questionChecklist array with 10 concise, practical questions whenever the inputs and website context provide enough information. Aim for exactly 10 questions if possible; if there is enough information, never return fewer than 8 questions.
- Ensure coverage across: goal-specific questions, core discovery questions (covering current process, pain, decision-making, budget/timing), and optional or nice-to-have questions that deepen understanding.
  - All questions must be concise, practical to ask verbatim in a real meeting, and tightly aligned with the meetingGoal, goalDescription, offerName, offerSummary, and desiredOutcome. Do not include off-topic questions.
  - Do not include duplicate or near-duplicate questions; each question should add distinct value. Do not repeat or slightly rephrase the same question.
  - All questions must be directly useful to ask in a real meeting and framed so they can be used as-is without editing.
  - Set category to one of: "discovery", "process", "value", "timeline", "budget", "risk", or "other", choosing the most appropriate single label for each question.
  - Set importance to "must-ask" for critical questions that directly drive the outcome of the meeting, "core" for essential discovery questions, and "nice-to-have" for optional depth probes.
  - Set source to "website" when the question primarily comes from the website HTML, "goal" when it is driven by meetingGoal/goalDescription/desiredOutcome/offer, "notes" when it is driven by free-form notes, and "generic" for universal discovery/process questions.
  - tags must be a non-empty array of short, descriptive keywords (e.g. ["decision-process", "timeline"]) that help cluster related questions.
  - coachingNotes must contain 3–6 short, practical, high-leverage tips, each a single concise sentence that helps the user run a stronger sales conversation towards the desiredOutcome. No fluff, no generic advice.

Meeting success and critical topics:
- meetingSuccess is required and must be a non-empty 1–2 sentence string, very practical and specific to this particular meetingGoal, desiredOutcome, offerName, and notes, describing what success looks like by the end of this call for the salesperson. Do not leave it blank or use filler text.
- criticalTopics is required and must contain at least 3 items whenever there is any information about the meetingGoal, desiredOutcome, offerName, or notes. Each item must have:
  - "title": a short label for the topic,
  - "whyItMatters": one or two sentences in plain English explaining why this topic is critical for this call,
  - "questionsToCover": an array of 2–4 short, bullet-level questions (strings) the salesperson should be ready to ask about this topic.

Metadata:
- metadata.version must always be 1.
- metadata.callType must always be "discovery".

Email fields (subject and body):
- emailSubject must be a concise subject line such as "Pre-call plan: <offerName> for <companyName>" (or a similar phrase) that clearly states the plan context and is adapted to the provided inputs.
- Email content (emailSubject and emailBody) must follow the same "no guessing" rules as the rest of the JSON.
  - You may treat websiteSummary (when provided) as trusted context from the public marketing website to make the briefing, questions, coachingNotes, and email fields more relevant, but you must still not infer anything beyond what is supported by planInput and websiteSummary.
  - If something is not known or not supported by planInput or websiteSummary, state it as "Unknown" or focus only on aspects that are clearly supported by the input.
  - emailStatus should be set to "skipped" by default; the system may overwrite this value after attempting to send the pre-call email.
- emailBody must be written to the user in the second person as a richer coaching-style summary that avoids generic fluff, stays accurate to the inputs, and follows this structure:
  1) Start with 1–2 sentences summarizing who you're speaking to and what the meeting is about (only using known information or "Unknown").
  2) Then provide clearly separated short sections (use blank lines) covering:
     - "Your position & their priorities": why the client cares and where you can be strong, based only on known details.
     - "Key angles & questions": 3–6 angles or questions written naturally and aligned with the checklist.
     - "Risks / landmines": any objections or blockers to watch that are consistent with the inputs (or "Unknown" if no specific risks are implied).
     - "How to steer the call": concrete guidance on how to guide toward the desiredOutcome, again only using information supported by the input.
  3) Close with 1–2 sentences reinforcing how to finish strong.
- Keep emailBody concise (3–6 short sections), clearly separated by blank lines so each section is quickly scannable.
- The emailBody should reuse the same ideas as coachingNotes but in a smoother narrative so it reads like a personal coaching brief.
- Explicitly avoid generic fluff; stay specific to the provided inputs and the desiredOutcome at all times.

Global rules:
- The entire response MUST be valid JSON only, matching the schema above.
- Do not include explanations, comments, or any non-JSON content.`;


// --- Hedging sanitiser helpers ---

function sanitizeHedging(text) {
  if (!text || typeof text !== 'string') return text;

  let out = text;

  const patterns = [
    /presumably\s*/gi,
    /probably\s*/gi,
    /likely\s*/gi,
    /maybe\s*/gi,
    /appears to be/gi,
    /appears to/gi,
    /appears/gi,
    /seems to be/gi,
    /seems to/gi,
    /seems/gi,
    /might\s*/gi,
  ];

  for (const pattern of patterns) {
    out = out.replace(pattern, '');
  }

  // collapse double spaces created by removals
  return out.replace(/\s{2,}/g, ' ').trim();
}

function sanitizePrecallPlan(plan) {
  if (!plan || typeof plan !== 'object') return plan;

  const COMPANY_GENERIC_FALLBACK =
    'No detailed company information is available from the inputs or website.';
  const COMPANY_SNIPPET_SENTENCE =
    'no detailed marketing or product/service description is available from the website snippet provided';

  // Briefing fields
  if (plan.briefing && typeof plan.briefing === 'object') {
    ['clientOverview', 'companyOverview', 'meetingFocus', 'websiteSummary'].forEach((key) => {
      if (typeof plan.briefing[key] === 'string') {
        let cleaned = sanitizeHedging(plan.briefing[key]);

        if (key === 'companyOverview') {
          const lower = cleaned.toLowerCase();

          // If the model used the totally unhelpful generic fallback, replace it.
          if (cleaned === COMPANY_GENERIC_FALLBACK) {
            cleaned =
              'Company overview was not generated in detail. Review the live website and your notes before the call to confirm what they do and who they serve.';
          }

          // If the model wrote something like:
          // "Vanguard is a business ... but no detailed marketing or product/service description is available from the website snippet provided."
          // then replace the whole thing with a more honest, coaching-style line.
          if (lower.includes(COMPANY_SNIPPET_SENTENCE)) {
            cleaned =
              'The captured website snippet for this plan did not include a clear description of their services. Before the call, quickly scan their homepage to confirm what they do and who they serve.';
          }
        }

        plan.briefing[key] = cleaned;
      }
    });
  }

  // Coaching notes
  if (Array.isArray(plan.coachingNotes)) {
    plan.coachingNotes = plan.coachingNotes.map(sanitizeHedging);
  }

  // Email fields
  if (plan.emailSubject && typeof plan.emailSubject === 'string') {
    plan.emailSubject = sanitizeHedging(plan.emailSubject);
  }
  if (plan.emailBody && typeof plan.emailBody === 'string') {
    plan.emailBody = sanitizeHedging(plan.emailBody);
  }

  // Critical topics
  if (Array.isArray(plan.criticalTopics)) {
    plan.criticalTopics = plan.criticalTopics.map((topic) => {
      if (topic && typeof topic === 'object') {
        if (typeof topic.title === 'string') {
          topic.title = sanitizeHedging(topic.title);
        }
        if (typeof topic.whyItMatters === 'string') {
          topic.whyItMatters = sanitizeHedging(topic.whyItMatters);
        }
        if (Array.isArray(topic.questionsToCover)) {
          topic.questionsToCover = topic.questionsToCover.map(sanitizeHedging);
        }
      }
      return topic;
    });
  }

  return plan;
}


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
    '- Avoid speculative language such as "presumably", "likely", "probably", "maybe", "appears", "appears to be", "seems", "seems to be", "might", or similar phrases.',
    '- If the [Website context] section includes website HTML, carefully read headings, visible text, and marketing copy to infer what the company does and who it serves.',
    '- Use only information that is clearly stated or strongly implied in that website text (for example product categories, service types, and target industries or segments).',
    '- It is acceptable to summarise in neutral terms such as "AI consultancy for SMEs" or "e-commerce brand selling garden products" if those phrases or very similar ideas appear in the website text.',
    '- Do NOT guess specific numbers, locations, or product names that are not present in the inputs or website text.',
    '- When website context is available, briefing.companyOverview must be a short 1-3 sentence description of what the company does and who they serve, based primarily on the website text.',
    '- Only fall back to the string "No detailed company information is available from the inputs or website." for briefing.companyOverview if the HTML clearly contains no meaningful marketing or product/service description.',
    '- For briefing.meetingFocus, use both the structured inputs (meetingGoal, goalDescription, offerName, offerSummary, desiredOutcome) and the website text to describe what this specific call should focus on (for example aligning your offer with their stated services or target customers).',
    '- Do not return empty strings or empty arrays; when details are limited, infer reasonable, goal-aligned guidance from meetingGoal, desiredOutcome, offerName, offerSummary, and notes so every required field stays populated.',
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
    const parsed = JSON.parse(rawContent);
    const sanitized = sanitizePrecallPlan(parsed);
    return sanitized;
  } catch (err) {
    logger.error({ err, rawContent }, 'Failed to parse pre-call prep JSON');
    const parseError = new Error('Failed to parse OpenAI JSON for pre-call prep');
    parseError.original = err;
    throw parseError;
  }
}

module.exports = { generatePrecallPrep };