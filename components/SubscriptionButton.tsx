'use client'

import { useState } from 'react'

export default function SubscriptionButton({ isPro }: { isPro: boolean }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const endpoint = isPro ? '/api/stripe/portal' : '/api/stripe/checkout'
    const res = await fetch(endpoint, { method: 'POST' })
    const { url, error } = await res.json()
    if (error) { alert(error); setLoading(false); return }
    window.location.href = url
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
        isPro
          ? 'border border-purple-500/50 text-purple-400 hover:bg-purple-500/10'
          : 'bg-purple-600 text-white hover:bg-purple-500'
      }`}
    >
      {loading ? '…' : isPro ? 'Manage Subscription' : 'Upgrade to Pro'}
    </button>
  )
}
