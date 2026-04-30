import { NextResponse } from 'next/server'

const GQL_ENDPOINT = 'https://gql.twitch.tv/gql'
// The "Magic" ID - Twitch's own public web client ID
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

async function fetchClipUrl(slug: string): Promise<string | null> {
  try {
    // Step 1: get the MP4 source URL (this query is known to work)
    const qualitiesRes = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-Id': TWITCH_WEB_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{ clip(slug: "${slug}") { videoQualities { quality sourceURL } } }`,
      }),
    })

    if (!qualitiesRes.ok) return null

    const qualitiesJson = await qualitiesRes.json()
    const qualities = qualitiesJson.data?.clip?.videoQualities
    if (!qualities?.length) return null

    const sorted = [...qualities].sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
    const baseUrl = sorted[0].sourceURL

    // Step 2: get the playback access token (separate request, falls back gracefully)
    try {
      const tokenRes = await fetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_WEB_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operationName: 'VideoAccessToken_Clip',
          variables: { slug },
          query: `query VideoAccessToken_Clip($slug: ID!) {
            clip(slug: $slug) {
              playbackAccessToken(params: {
                platform: "web"
                playerBackend: "mediaplayer"
                playerType: "site"
              }) {
                signature
                value
              }
            }
          }`,
        }),
      })

      if (tokenRes.ok) {
        const tokenJson = await tokenRes.json()
        const token = tokenJson.data?.clip?.playbackAccessToken
        if (token?.signature && token?.value) {
          const signedUrl = `${baseUrl}?sig=${token.signature}&token=${encodeURIComponent(token.value)}`
          console.log(`[clip-url] ${slug} → signed URL (${signedUrl.slice(0, 60)}…)`)
          return signedUrl
        }
      }
    } catch {
      // token fetch failed — fall through to unsigned URL
    }

    console.log(`[clip-url] ${slug} → unsigned URL (${baseUrl.slice(0, 60)}…)`)
    return baseUrl
  } catch (err) {
    console.error(`[clip-url] Error fetching clip ${slug}:`, err)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const ids = body.ids

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Process all requested clips
    const results = await Promise.all(
      ids.map(async (id: string) => [id, await fetchClipUrl(id)])
    )

    return NextResponse.json(Object.fromEntries(results))
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}