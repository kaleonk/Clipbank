export type TwitchClip = {
  id: string
  url: string
  embed_url: string
  broadcaster_id: string
  broadcaster_name: string
  creator_id: string
  creator_name: string
  title: string
  view_count: number
  created_at: string
  thumbnail_url: string
  duration: number
  game_id: string
}

async function getAccessToken(): Promise<string | null> {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  if (!res.ok) {
    console.error('Twitch token fetch failed:', res.status)
    return null
  }
  const { access_token } = await res.json()
  return access_token
}

export async function getTwitchClips(
  broadcasterId: string,
  cursor?: string
): Promise<{ clips: TwitchClip[]; cursor: string | null }> {
  const access_token = await getAccessToken()
  if (!access_token) return { clips: [], cursor: null }

  const url = new URL('https://api.twitch.tv/helix/clips')
  url.searchParams.set('broadcaster_id', broadcasterId)
  url.searchParams.set('first', '20')
  if (cursor) url.searchParams.set('after', cursor)

  const res = await fetch(url.toString(), {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${access_token}`,
    },
  })
  if (!res.ok) {
    console.error('Twitch clips fetch failed:', res.status)
    return { clips: [], cursor: null }
  }
  const { data, pagination } = await res.json()
  return { clips: data ?? [], cursor: pagination?.cursor ?? null }
}

export async function getTwitchClip(clipId: string): Promise<TwitchClip | null> {
  const access_token = await getAccessToken()
  if (!access_token) return null

  const res = await fetch(`https://api.twitch.tv/helix/clips?id=${clipId}`, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${access_token}`,
    },
  })
  if (!res.ok) return null
  const { data } = await res.json()
  return data?.[0] ?? null
}
