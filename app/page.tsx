'use client'

import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const supabase = createClient()

  async function loginWithTwitch() {
    await supabase.auth.signInWithOAuth({
  provider: 'twitch',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold text-white">ClipBank</h1>
        <p className="text-zinc-400">Turn your Twitch clips into vertical shorts.</p>
        <button
          onClick={loginWithTwitch}
          className="rounded-full bg-purple-600 px-8 py-3 font-semibold text-white transition hover:bg-purple-500"
        >
          Login with Twitch
        </button>
      </div>
    </div>
  )
}