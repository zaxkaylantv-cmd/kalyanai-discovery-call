const OpenAI = require('openai');
const logger = require('./logger');

let openai = null;

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  logger.warn('OPENAI_API_KEY is not set. OpenAI client will be disabled.');
} else {
  openai = new OpenAI({ apiKey });
  logger.info('OpenAI client initialized');
}

module.exports = {
  openai,
};

