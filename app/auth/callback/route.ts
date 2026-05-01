import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const authError = searchParams.get('error_description') ?? searchParams.get('error')

  if (authError) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(authError)}`)
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth callback failed'
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(message)}`)
    }
  } else {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent('Missing OAuth code')}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
