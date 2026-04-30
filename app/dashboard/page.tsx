import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { signOut } from '@/app/auth/actions'
import { getTwitchClips } from '@/lib/twitch'
import ClipGrid from '@/components/ClipGrid'

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { avatar_url, preferred_username, sub } = user.user_metadata
  const { clips, cursor } = await getTwitchClips(sub)

  let initialFavorites: string[] = []
  try {
    const { data } = await supabase
      .from('clip_favorites')
      .select('clip_id')
      .eq('user_id', user.id)
    initialFavorites = data?.map((r: { clip_id: string }) => r.clip_id) ?? []
  } catch {
    // table may not exist yet
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            {avatar_url && (
              <Image
                src={avatar_url}
                alt="avatar"
                width={48}
                height={48}
                className="rounded-full border-2 border-purple-500"
              />
            )}
            <h1 className="text-2xl font-bold">@{preferred_username}&apos;s Clips</h1>
          </div>
          <form action={signOut}>
            <button className="text-sm text-zinc-500 hover:text-red-400 transition-colors">
              Log out
            </button>
          </form>
        </div>

        {clips.length > 0 ? (
          <ClipGrid
            clips={clips}
            initialCursor={cursor}
            initialFavorites={initialFavorites}
          />
        ) : (
          <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl">
            <p className="text-zinc-500">No clips found on this account.</p>
          </div>
        )}
      </div>
    </div>
  )
}
