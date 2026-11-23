import { defineEnvVars } from '@sveltejs/kit/env';

import {
  AdminUserIds,
  AppOrigins,
  AuthSecret,
  CookieDomain,
  DatabaseUrl,
  InternalApiKeys,
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

/** The accounts' environment, validated when the server starts. The migrations read `DATABASE_URL` alone. */
export const variables = defineEnvVars({
  DATABASE_URL: { description: 'The PostgreSQL connection string.', schema: DatabaseUrl },
  LOG_LEVEL: { description: 'debug, info, warn or error; info by default.', schema: LogLevel },
  AUTH_SECRET: {
    description: "Signs the website's cookies and encrypts sign-in providers' tokens: at least 32 random characters.",
    schema: AuthSecret,
  },
  SITE_URL: {
    description: "The accounts' address as visitors reach it, such as https://accounts.example.org.",
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
      "Mondarth's Patreon campaign: its patrons, at the least pledge the admins set, are subscribed. Without it, Patreon is a way to sign in alone.",
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
    description: "The secret of the accounts' webhook endpoint at Stripe (whsec_…), which signs its events.",
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
  INTERNAL_API_KEYS: {
    description:
      'The keys the other applications call the internal API with, separated by commas, each at least 32 random characters; several, so that a key can be rotated.',
    schema: InternalApiKeys,
  },
  COOKIE_DOMAIN: {
    description:
      "The domain the session cookie is set on, so that every application on its subdomains is signed in by it, such as example.org; none, and it is the accounts' host's alone.",
    schema: CookieDomain,
  },
  APP_ORIGINS: {
    description:
      "The other applications' addresses, separated by commas, such as https://catalogue.example.org: visitors are sent back to them once signed in.",
    schema: AppOrigins,
  },
});
