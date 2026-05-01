import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

// Bypass RLS — webhook runs outside user session
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscriptionId: string,
  status: string,
  periodEnd: number
) {
  const tier = status === 'active' || status === 'trialing' ? 'pro' : 'free'
  await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    tier,
    status,
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break
        const userId = session.client_reference_id!
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        
        await upsertSubscription(
          userId, 
          customerId, 
          subscriptionId, 
          sub.status, 
          // @ts-ignore
          sub.current_period_end
        )
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.user_id
        if (!userId) break
        await upsertSubscription(
          userId,
          sub.customer as string,
          sub.id,
          sub.status,
          // @ts-ignore
          sub.current_period_end
        )
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await supabaseAdmin
          .from('subscriptions')
          .update({ 
            tier: 'free', 
            status: 'canceled', 
            updated_at: new Date().toISOString() 
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }
    }
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}