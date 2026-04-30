import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTwitchClips } from '@/lib/twitch'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined
  const { clips, cursor: nextCursor } = await getTwitchClips(user.user_metadata.sub, cursor)

  return NextResponse.json({ clips, cursor: nextCursor })
}
