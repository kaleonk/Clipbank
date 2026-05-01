'use client'

import { useEffect, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

type DownloadMode = 'full' | 'vertical'

export default function PreviewActions({
  clipId,
  clipTitle,
}: {
  clipId: string
  clipTitle: string
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const ffmpegLoadingRef = useRef<Promise<FFmpeg> | null>(null)

  async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current) return ffmpegRef.current
    if (ffmpegLoadingRef.current) return ffmpegLoadingRef.current

    ffmpegLoadingRef.current = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message))
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpegRef.current = ffmpeg
      return ffmpeg
    })()

    return ffmpegLoadingRef.current
  }

  useEffect(() => {
    const preload = () => {
      void loadFFmpeg().catch((err) => console.warn('[ffmpeg] preload failed:', err))
    }
    const timer = window.setTimeout(preload, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  function triggerDirectDownload(mp4Url: string, fileName: string) {
    const proxyUrl = new URL('/api/proxy-video', window.location.origin)
    proxyUrl.searchParams.set('url', mp4Url)
    const a = document.createElement('a')
    a.href = proxyUrl.toString()
    a.download = fileName
    a.click()
  }

  async function fetchClipBuffer(mp4Url: string) {
    setStatus('Downloading video...')
    const proxyUrl = new URL('/api/proxy-video', window.location.origin)
    proxyUrl.searchParams.set('url', mp4Url)
    const proxyRes = await fetch(proxyUrl.toString())
    if (!proxyRes.ok) throw new Error(`Proxy failed (${proxyRes.status})`)
    const buffer = await proxyRes.arrayBuffer()
    if (buffer.byteLength === 0) throw new Error('Empty file')
    return buffer
  }

  async function download(mode: DownloadMode) {
    setIsProcessing(true)
    try {
      setStatus('Fetching MP4 URL...')
      const res = await fetch('/api/clip-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [clipId] }),
      })
      const urlMap: Record<string, string | null> = await res.json()
      const mp4Url = urlMap[clipId]
      if (!mp4Url) throw new Error('Could not get video URL')

      const safeName = clipTitle.replace(/[^a-z0-9]/gi, '_')

      if (mode === 'full') {
        setStatus('Starting download...')
        triggerDirectDownload(mp4Url, `${safeName}.mp4`)
      } else {
        setStatus('Loading FFmpeg...')
        const ffmpeg = await loadFFmpeg()
        const buffer = await fetchClipBuffer(mp4Url)

        await ffmpeg.writeFile('input.mp4', new Uint8Array(buffer))
        setStatus('Cropping to 9:16...')
        const exitCode = await ffmpeg.exec([
          '-i',
          'input.mp4',
          '-vf',
          'crop=ih*9/16:ih:(iw-ih*9/16)/2:0',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          'output.mp4',
        ])
        if (exitCode !== 0) throw new Error('Crop failed')

        const data = (await ffmpeg.readFile('output.mp4')) as Uint8Array
        triggerDownload(new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' }), `${safeName}_9x16.mp4`)
        await ffmpeg.deleteFile('input.mp4').catch(() => {})
        await ffmpeg.deleteFile('output.mp4').catch(() => {})
      }

      setStatus('Done!')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus(`Error: ${message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Download
      </h2>
      {status && <p className="mb-4 text-sm text-zinc-300">{status}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => download('full')}
          disabled={isProcessing}
          className="rounded-full bg-zinc-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-600 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Download Full'}
        </button>
        <button
          onClick={() => download('vertical')}
          disabled={isProcessing}
          className="rounded-full bg-purple-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Convert to 9:16 ->'}
        </button>
      </div>
    </div>
  )
}

