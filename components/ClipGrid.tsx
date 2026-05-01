'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { createClient } from '@/lib/supabase/client'

type Clip = {
  id: string
  title: string
  thumbnail_url: string
  view_count: number
  created_at: string
  duration: number
  url: string
}

type DownloadMode = 'full' | 'vertical'

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ClipGrid({
  clips: initialClips,
  initialCursor,
  initialFavorites,
}: {
  clips: Clip[]
  initialCursor: string | null
  initialFavorites: string[]
}) {
  const [allClips, setAllClips] = useState(initialClips)
  const [cursor, setCursor] = useState(initialCursor)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'views'>('date')
  const [favorites, setFavorites] = useState<Set<string>>(new Set(initialFavorites))
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const ffmpegLoadingRef = useRef<Promise<FFmpeg> | null>(null)

  const displayedClips = allClips
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === 'views'
        ? b.view_count - a.view_count
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  function toggleSelection(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  async function toggleFavorite(e: React.MouseEvent, clipId: string) {
    e.stopPropagation()
    const supabase = createClient()
    if (favorites.has(clipId)) {
      setFavorites((prev) => {
        const next = new Set(prev)
        next.delete(clipId)
        return next
      })
      await supabase.from('clip_favorites').delete().match({ clip_id: clipId })
    } else {
      setFavorites((prev) => new Set([...prev, clipId]))
      await supabase.from('clip_favorites').insert({ clip_id: clipId })
    }
  }

  async function loadMore() {
    if (!cursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/clips?cursor=${cursor}`)
      const { clips: newClips, cursor: newCursor } = await res.json()
      setAllClips((prev) => [...prev, ...newClips])
      setCursor(newCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

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

  async function fetchClipBuffer(mp4Url: string, title: string) {
    setStatus(`Downloading "${title}"...`)
    const proxyUrl = new URL('/api/proxy-video', window.location.origin)
    proxyUrl.searchParams.set('url', mp4Url)
    const proxyRes = await fetch(proxyUrl.toString())
    if (!proxyRes.ok) {
      throw new Error(`Proxy failed (${proxyRes.status}): ${await proxyRes.text()}`)
    }
    const buffer = await proxyRes.arrayBuffer()
    if (buffer.byteLength === 0) throw new Error('Proxy returned empty file')
    return buffer
  }

  async function downloadFull(mp4Url: string, title: string) {
    setStatus(`Starting download for "${title}"...`)
    const safeName = title.replace(/[^a-z0-9]/gi, '_')
    triggerDirectDownload(mp4Url, `${safeName}.mp4`)
  }

  async function convertVertical(ffmpeg: FFmpeg, mp4Url: string, title: string) {
    const buffer = await fetchClipBuffer(mp4Url, title)
    await ffmpeg.writeFile('input.mp4', new Uint8Array(buffer))

    setStatus(`Cropping "${title}" to 9:16...`)
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
    if (exitCode !== 0) throw new Error(`FFmpeg crop failed (exit code ${exitCode})`)

    const data = (await ffmpeg.readFile('output.mp4')) as Uint8Array
    const safeName = title.replace(/[^a-z0-9]/gi, '_')
    triggerDownload(new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' }), `${safeName}_9x16.mp4`)

    await ffmpeg.deleteFile('input.mp4').catch(() => {})
    await ffmpeg.deleteFile('output.mp4').catch(() => {})
  }

  async function handleDownload(mode: DownloadMode) {
    setIsProcessing(true)
    try {
      setStatus('Fetching MP4 URLs...')
      const res = await fetch('/api/clip-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const urlMap: Record<string, string | null> = await res.json()

      const ffmpeg =
        mode === 'vertical'
          ? await loadFFmpeg().catch((err) => {
              throw new Error(`FFmpeg failed to load: ${err instanceof Error ? err.message : err}`)
            })
          : null

      for (let i = 0; i < selectedIds.length; i++) {
        const id = selectedIds[i]
        const mp4Url = urlMap[id]
        if (!mp4Url) {
          console.error(`No URL for clip ${id}`)
          continue
        }

        const clip = allClips.find((c) => c.id === id)
        const title = clip?.title ?? id
        setStatus(`Processing ${i + 1}/${selectedIds.length}: ${title}`)

        if (mode === 'full') {
          await downloadFull(mp4Url, title)
        } else if (ffmpeg) {
          await convertVertical(ffmpeg, mp4Url, title)
        }
      }

      setStatus('Done!')
      setSelectedIds([])
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Download failed:', message, err)
      setStatus(`Error: ${message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="relative">
      <div className="mb-6 flex gap-3">
        <input
          type="text"
          placeholder="Search clips..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'views')}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="date">Newest first</option>
          <option value="views">Most viewed</option>
        </select>
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 flex flex-col items-center gap-2">
          {status && (
            <p className="rounded-full bg-zinc-800 px-4 py-1 text-xs text-zinc-300">{status}</p>
          )}
          <div className="flex items-center gap-4 rounded-full border border-purple-500/50 bg-zinc-900/90 px-6 py-4 shadow-2xl backdrop-blur-md">
            <p className="text-sm font-medium text-white">
              {selectedIds.length} {selectedIds.length === 1 ? 'clip' : 'clips'} selected
            </p>
            <button
              onClick={() => handleDownload('full')}
              disabled={isProcessing}
              className="rounded-full bg-zinc-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-zinc-600 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Download Full'}
            </button>
            <button
              onClick={() => handleDownload('vertical')}
              disabled={isProcessing}
              className="rounded-full bg-purple-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Convert to 9:16 ->'}
            </button>
            <button
              onClick={() => setSelectedIds([])}
              disabled={isProcessing}
              className="text-sm text-zinc-400 hover:text-white disabled:opacity-30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {displayedClips.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No clips match your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayedClips.map((clip) => {
            const isSelected = selectedIds.includes(clip.id)
            const isFavorited = favorites.has(clip.id)
            return (
              <div
                key={clip.id}
                onClick={() => toggleSelection(clip.id)}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'border-purple-500 ring-2 ring-purple-500/20'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <div className="absolute left-3 top-3 z-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(clip.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-5 w-5 cursor-pointer rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-500"
                  />
                </div>

                <button
                  onClick={(e) => toggleFavorite(e, clip.id)}
                  className="absolute right-3 top-3 z-10 text-lg leading-none transition-transform hover:scale-125"
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {isFavorited ? 'â™¥' : 'â™¡'}
                </button>

                <Link href={`/dashboard/preview/${clip.id}`} onClick={(e) => e.stopPropagation()}>
                  <div className="relative aspect-video">
                    <Image
                      src={clip.thumbnail_url}
                      alt={clip.title}
                      fill
                      className={`object-cover transition-transform duration-500 group-hover:scale-105 ${isSelected ? 'opacity-50' : ''}`}
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {fmtDuration(clip.duration)}
                    </span>
                  </div>
                </Link>

                <div className="p-4">
                  <h3 className="line-clamp-1 font-semibold text-zinc-100">{clip.title}</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {clip.view_count.toLocaleString()} views {' â€¢ '}
                    {new Date(clip.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cursor && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="rounded-full border border-zinc-700 px-8 py-3 text-sm font-medium text-zinc-300 transition hover:border-purple-500 hover:text-white disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more clips'}
          </button>
        </div>
      )}
    </div>
  )
}

