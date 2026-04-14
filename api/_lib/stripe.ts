import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set in the environment variables.');
    }

    stripeClient = new Stripe(key, {
      apiVersion: '2023-10-16' as any
    });
  }

  return stripeClient;
}
