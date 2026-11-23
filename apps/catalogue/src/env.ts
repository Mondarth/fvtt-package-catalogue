import { defineEnvVars } from '@sveltejs/kit/env';

import {
  AdminUserIds,
  ApiKeys,
  ApiRatePerMinute,
  AuthSecret,
  DatabaseUrl,
  LogLevel,
  PatreonCampaignId,
  PatreonUrl,
  ProviderCredential,
  SiteUrl,
  StripeApiUrl,
  StripeCurrency,
  StripeSecretKey,
  StripeTaxCode,
  StripeWebhookSecret,
  TestProviderUrl,
} from '#lib/server/config.js';

/** The server's environment, validated when it starts. The worker reads the same through `readConfig`. */
export const variables = defineEnvVars({
  DATABASE_URL: { description: 'The PostgreSQL connection string.', schema: DatabaseUrl },
  API_KEYS: {
    description:
      "The API keys accepted, separated by commas, each module:<key> for the EMMA module's, or the key alone for one that reaches every endpoint. Several, so that a key can be rotated.",
    schema: ApiKeys,
  },
  LOG_LEVEL: { description: 'debug, info, warn or error; info by default.', schema: LogLevel },
  API_RATE_PER_MINUTE: {
    description: 'The most API requests one key or user may make in a minute; 300 by default.',
    schema: ApiRatePerMinute,
  },
  AUTH_SECRET: {
    description: "Signs the website's cookies and encrypts sign-in providers' tokens: at least 32 random characters.",
    schema: AuthSecret,
  },
  SITE_URL: {
    description: "The website's address as visitors reach it, such as https://catalogue.example.org.",
    schema: SiteUrl,
  },
  AUTH_GITHUB_ID: {
    description: "The GitHub OAuth app's client id; GitHub is offered only with it.",
    schema: ProviderCredential,
  },
  AUTH_GITHUB_SECRET: { description: "The GitHub OAuth app's client secret.", schema: ProviderCredential },
  AUTH_GOOGLE_ID: {
    description: "The Google OAuth client's id; Google is offered only with it.",
    schema: ProviderCredential,
  },
  AUTH_GOOGLE_SECRET: { description: "The Google OAuth client's secret.", schema: ProviderCredential },
  AUTH_DISCORD_ID: {
    description: "The Discord application's client id; Discord is offered only with it.",
    schema: ProviderCredential,
  },
  AUTH_DISCORD_SECRET: { description: "The Discord application's client secret.", schema: ProviderCredential },
  AUTH_PATREON_ID: {
    description: "The Patreon client's id; Patreon is offered only with it.",
    schema: ProviderCredential,
  },
  AUTH_PATREON_SECRET: { description: "The Patreon client's secret.", schema: ProviderCredential },
  PATREON_CAMPAIGN_ID: {
    description:
      "The catalogue's Patreon campaign: its patrons, at the least pledge the admins set, are subscribed. Without it, Patreon is a way to sign in alone.",
    schema: PatreonCampaignId,
  },
  PATREON_URL: {
    description: "Patreon's address, for the end-to-end tests' stand-in alone. Never set in a deployment.",
    schema: PatreonUrl,
  },
  STRIPE_SECRET_KEY: {
    description:
      'A Stripe restricted key that may write Checkout Sessions, Products and Prices; offers are sold through Stripe only with it.',
    schema: StripeSecretKey,
  },
  STRIPE_WEBHOOK_SECRET: {
    description: "The secret of the catalogue's webhook endpoint at Stripe (whsec_…), which signs its events.",
    schema: StripeWebhookSecret,
  },
  STRIPE_TAX_CODE: {
    description:
      "The tax code put on each offer's Stripe Product; txcd_10103000 (software as a service, personal use) by default.",
    schema: StripeTaxCode,
  },
  STRIPE_CURRENCY: {
    description: 'The one currency offers are sold in through Stripe; GBP by default.',
    schema: StripeCurrency,
  },
  STRIPE_API_URL: {
    description: "Stripe's API's address, for the end-to-end tests' stand-in alone. Never set in a deployment.",
    schema: StripeApiUrl,
  },
  ADMIN_USER_IDS: {
    description:
      'The user ids of admins whatever their role, separated by commas, such as the first admin; none by default.',
    schema: AdminUserIds,
  },
  AUTH_TEST_PROVIDER_URL: {
    description: 'A stand-in sign-in provider, for the end-to-end tests alone. Never set in a deployment.',
    schema: TestProviderUrl,
  },
});
