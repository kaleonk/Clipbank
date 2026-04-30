'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function loginWithTwitch() {
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      console.error('Login error:', error)
      setError(error.message)
      setLoading(false)
    }
    // on success the browser navigates away — no need to setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold text-white">ClipBank</h1>
        <p className="text-zinc-400">Turn your Twitch clips into vertical shorts.</p>
        <button
          onClick={loginWithTwitch}
          disabled={loading}
          className="rounded-full bg-purple-600 px-8 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : 'Login with Twitch'}
        </button>
        {error && (
          <p className="max-w-sm rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}