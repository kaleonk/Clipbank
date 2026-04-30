'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

type Clip = {
  id: string
  title: string
  thumbnail_url: string
  view_count: number
  created_at: string
}

export default function ClipGrid({ clips }: { clips: Clip[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const ffmpegRef = useRef<FFmpeg | null>(null)

  function toggleSelection(id: string) {
    if (isProcessing) return
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current) return ffmpegRef.current
    const ffmpeg = new FFmpeg()
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegRef.current = ffmpeg
    return ffmpeg
  }

  async function convertOne(ffmpeg: FFmpeg, id: string, mp4Url: string, title: string) {
    setStatus(`Downloading "${title}"…`)
    await ffmpeg.writeFile('input.mp4', await fetchFile(mp4Url))

    setStatus(`Cropping "${title}" to 9:16…`)
    await ffmpeg.exec([
      '-i', 'input.mp4',
      '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0',
      '-c:a', 'copy',
      'output.mp4',
    ])

    const data = await ffmpeg.readFile('output.mp4') as Uint8Array
    const blob = new Blob([data], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_vertical.mp4`
    a.click()
    URL.revokeObjectURL(url)

    await ffmpeg.deleteFile('input.mp4')
    await ffmpeg.deleteFile('output.mp4')
  }

  async function handleConvert() {
    setIsProcessing(true)
    try {
      setStatus('Fetching MP4 URLs…')
      const res = await fetch('/api/clip-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const urlMap: Record<string, string | null> = await res.json()

      setStatus('Loading FFmpeg…')
      const ffmpeg = await loadFFmpeg()

      for (const id of selectedIds) {
        const mp4Url = urlMap[id]
        if (!mp4Url) { console.error(`No URL for clip ${id}`); continue }
        const clip = clips.find(c => c.id === id)
        await convertOne(ffmpeg, id, mp4Url, clip?.title ?? id)
      }

      setStatus('Done!')
      setSelectedIds([])
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      console.error('Conversion failed:', err)
      setStatus('Something went wrong — check console')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="relative">
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 flex flex-col items-center gap-2">
          {status && (
            <p className="rounded-full bg-zinc-800 px-4 py-1 text-xs text-zinc-300">{status}</p>
          )}
          <div className="flex items-center gap-6 rounded-full border border-purple-500/50 bg-zinc-900/90 px-6 py-4 shadow-2xl backdrop-blur-md">
            <p className="text-sm font-medium text-white">
              {selectedIds.length} {selectedIds.length === 1 ? 'clip' : 'clips'} selected
            </p>
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="rounded-full bg-purple-600 px-6 py-2 text-sm font-bold text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              {isProcessing ? 'Processing…' : 'Convert to Shorts →'}
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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => {
          const isSelected = selectedIds.includes(clip.id)
          
          return (
            <div 
              key={clip.id} 
              className={`group relative overflow-hidden rounded-xl border transition-all duration-200 
                ${isSelected ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}
            >
              <div className="absolute left-3 top-3 z-10">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelection(clip.id)}
                  disabled={isProcessing}
                  className="h-5 w-5 cursor-pointer rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                />
              </div>

              <Link href={`/dashboard/preview/${clip.id}`} className="block">
                <div className="relative aspect-video">
                  <Image 
                    src={clip.thumbnail_url} 
                    alt={clip.title} 
                    fill 
                    className={`object-cover transition-transform duration-500 group-hover:scale-105 ${isSelected ? 'opacity-50' : ''}`} 
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>

              <div className="p-4 cursor-pointer" onClick={() => toggleSelection(clip.id)}>
                <h3 className="line-clamp-1 font-semibold text-zinc-100">{clip.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {clip.view_count.toLocaleString()} views • {new Date(clip.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}