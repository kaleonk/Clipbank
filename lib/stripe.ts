import Stripe from 'stripe'

// Using a dummy fallback key so the Vercel build doesn't crash in Free Beta mode
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build_bypass')