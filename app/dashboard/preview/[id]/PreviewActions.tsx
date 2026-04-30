'use client'

import { useState, useRef } from 'react'
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

  async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current) return ffmpegRef.current
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message))
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegRef.current = ffmpeg
    return ffmpeg
  }

  async function download(mode: DownloadMode) {
    setIsProcessing(true)
    try {
      setStatus('Fetching MP4 URL…')
      const res = await fetch('/api/clip-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [clipId] }),
      })
      const urlMap: Record<string, string | null> = await res.json()
      const mp4Url = urlMap[clipId]
      if (!mp4Url) throw new Error('Could not get video URL')

      setStatus('Loading FFmpeg…')
      const ffmpeg = await loadFFmpeg()

      setStatus('Downloading video…')
      const proxyUrl = new URL('/api/proxy-video', window.location.origin)
      proxyUrl.searchParams.set('url', mp4Url)
      const proxyRes = await fetch(proxyUrl.toString())
      if (!proxyRes.ok) throw new Error(`Proxy failed (${proxyRes.status})`)
      const buffer = await proxyRes.arrayBuffer()
      if (buffer.byteLength === 0) throw new Error('Empty file')
      await ffmpeg.writeFile('input.mp4', new Uint8Array(buffer))

      const safeName = clipTitle.replace(/[^a-z0-9]/gi, '_')

      if (mode === 'vertical') {
        setStatus('Cropping to 9:16…')
        const exitCode = await ffmpeg.exec([
          '-i', 'input.mp4',
          '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0',
          '-c:a', 'copy',
          'output.mp4',
        ])
        if (exitCode !== 0) throw new Error('Crop failed')
      } else {
        setStatus('Saving…')
        const exitCode = await ffmpeg.exec(['-i', 'input.mp4', '-c', 'copy', 'output.mp4'])
        if (exitCode !== 0) throw new Error('Copy failed')
      }

      const data = await ffmpeg.readFile('output.mp4') as Uint8Array
      const blob = new Blob([data.buffer], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mode === 'vertical' ? `${safeName}_9x16.mp4` : `${safeName}.mp4`
      a.click()
      URL.revokeObjectURL(url)

      setStatus('Done!')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus(`Error: ${message}`)
    } finally {
      await ffmpegRef.current?.deleteFile('input.mp4').catch(() => {})
      await ffmpegRef.current?.deleteFile('output.mp4').catch(() => {})
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
          {isProcessing ? 'Processing…' : 'Download Full'}
        </button>
        <button
          onClick={() => download('vertical')}
          disabled={isProcessing}
          className="rounded-full bg-purple-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
        >
          {isProcessing ? 'Processing…' : 'Convert to 9:16 →'}
        </button>
      </div>
    </div>
  )
}
