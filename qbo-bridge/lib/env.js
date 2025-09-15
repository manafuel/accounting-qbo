/**
 * Centralized environment loading and validation.
 * Uses Node 18+ globals and dotenv (loaded in server.js).
 * @typedef {Object} Env
 * @property {string} NODE_ENV
 * @property {number} PORT
 * @property {string} INTUIT_CLIENT_ID
 * @property {string} INTUIT_CLIENT_SECRET
 * @property {string} OAUTH_REDIRECT_URI
 * @property {string} APP_BASE_URL
 * @property {string} SESSION_SECRET
 * @property {string} GPT_USER_ID
 * @property {string|undefined} ALLOWED_ORIGINS
 * @property {string|undefined} ACTION_API_KEY
 * @property {string|undefined} SETUP_TOKEN
 */

const required = [
  'INTUIT_CLIENT_ID',
  'INTUIT_CLIENT_SECRET',
  'OAUTH_REDIRECT_URI',
  'APP_BASE_URL',
  'SESSION_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    // Do not include actual secret values in error messages
    console.error(`Missing env var: ${key}`);
  }
}

/** @type {Env} */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),
  INTUIT_CLIENT_ID: process.env.INTUIT_CLIENT_ID || '',
  INTUIT_CLIENT_SECRET: process.env.INTUIT_CLIENT_SECRET || '',
  OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || '',
  APP_BASE_URL: process.env.APP_BASE_URL || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-me',
  GPT_USER_ID: process.env.GPT_USER_ID || 'default',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  ACTION_API_KEY: process.env.ACTION_API_KEY,
  SETUP_TOKEN: process.env.SETUP_TOKEN,
};
