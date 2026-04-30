import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return new Response('Missing url param', { status: 400 })

  let clipRes: Response
  try {
    clipRes = await fetch(url)
  } catch {
    return new Response('Failed to fetch clip', { status: 502 })
  }

  if (!clipRes.ok)
    return new Response('Clip not found', { status: clipRes.status })

  return new Response(clipRes.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
}
