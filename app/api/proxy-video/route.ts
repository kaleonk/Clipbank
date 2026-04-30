import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url param', { status: 400 })

  // Allow any HTTPS Twitch CDN URL
  const isTwitchCdn = /^https:\/\/[\w.-]+\.twitch\.tv\//.test(url) ||
    /^https:\/\/[\w.-]+\.twitchsvc\.net\//.test(url) ||
    /^https:\/\/[\w.-]+\.cloudfront\.net\//.test(url)
  if (!isTwitchCdn) {
    console.error('[proxy-video] Rejected URL:', url)
    return new Response('Invalid URL', { status: 400 })
  }

  let clipRes: Response
  try {
    clipRes = await fetch(url, {
      headers: {
        'Referer': 'https://www.twitch.tv/',
        'Origin': 'https://www.twitch.tv',
      },
    })
  } catch (err) {
    console.error('[proxy-video] fetch error:', err)
    return new Response('Failed to reach Twitch CDN', { status: 502 })
  }

  if (!clipRes.ok) {
    console.error('[proxy-video] Twitch CDN returned', clipRes.status)
    return new Response('Clip not found', { status: clipRes.status })
  }

  // Buffer fully — fetchFile needs complete data, not a stream
  const buffer = await clipRes.arrayBuffer()
  console.log(`[proxy-video] Buffered ${buffer.byteLength} bytes`)

  return new Response(buffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': buffer.byteLength.toString(),
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
}
