import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTwitchClip } from '@/lib/twitch'
import Image from 'next/image'
import Link from 'next/link'
import PreviewActions from './PreviewActions'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const clip = await getTwitchClip(id)
  if (!clip) redirect('/dashboard')

  const largeThumbnail = clip.thumbnail_url.replace('-480x272.jpg', '-1280x720.jpg')

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="mx-auto max-w-4xl">
        {/* Back */}
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          ← Back to dashboard
        </Link>

        {/* Thumbnail */}
        <div className="relative mt-6 aspect-video overflow-hidden rounded-2xl border border-zinc-800">
          <Image
            src={largeThumbnail}
            alt={clip.title}
            fill
            className="object-cover"
            priority
          />
          {/* Watch on Twitch overlay */}
          <a
            href={`https://clips.twitch.tv/${clip.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
          >
            <span className="rounded-full bg-purple-600 px-6 py-3 text-sm font-bold text-white shadow-lg">
              Watch on Twitch ↗
            </span>
          </a>
        </div>

        {/* Info */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold">{clip.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400">
            <span>{clip.view_count.toLocaleString()} views</span>
            <span>by {clip.creator_name}</span>
            <span>
              {new Date(clip.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span>{clip.duration}s</span>
          </div>
        </div>

        {/* Download buttons */}
        <PreviewActions clipId={clip.id} clipTitle={clip.title} />
      </div>
    </div>
  )
}
