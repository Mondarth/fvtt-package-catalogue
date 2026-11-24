/**
 * The payment processors a subscription may be paid through, as the "What we store" page (`/privacy`) lists them: who
 * each is, what it keeps of you, and its own privacy policy. The catalogue keeps minimal payment details, a payment's
 * reference and total: an invoice is the processor's to keep. Each processor the catalogue takes payments through is
 * added here as it is, which a test checks.
 */

/** A processor, by its id among the sign-in providers or payment adapters. */
export interface Processor {
  /** Names its messages: `privacy_processor_<id>_what`. */
  readonly id: string;
  /** Who it is. */
  readonly name: string;
  /** Its privacy policy. */
  readonly policy: string;
}

export const PROCESSORS: readonly Processor[] = [
  { id: 'patreon', name: 'Patreon', policy: 'https://privacy.patreon.com/policies' },
  { id: 'stripe', name: 'Stripe (Onelink)', policy: 'https://stripe.com/privacy' },
];
