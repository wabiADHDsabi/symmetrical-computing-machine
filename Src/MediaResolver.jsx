/**
 * MediaResolver — tries each source in order until one loads.
 *
 * Source types:
 *   { type: "supabase", path: "entries/uuid/file.mp4" }
 *   { type: "gdrive",   id:   "1BxiMVs0XRA..." }
 *   { type: "url",      href: "https://..." }
 *   { type: "local",    filename: "first-steps.mp4" }
 */

import { useState, useEffect, useRef } from 'react'
import { getSupabaseSignedUrl, gdriveUrl } from './supabase.js'

const ML = {
  canvas: '#F7F5F0', muted: '#B0A8BC', ink: '#2C2A35', border: 'rgba(44,42,53,0.12)'
}

// Local folder handle — persisted in memory for the session.
// On desktop Chrome/Edge the user grants access once per session.
let _localDirHandle = null

export async function requestLocalFolder() {
  try {
    _localDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
    return true
  } catch { return false }
}

export function hasLocalFolder() { return !!_localDirHandle }
export function getLocalDirHandle() { return _localDirHandle }
export function setLocalDirHandle(h) { _localDirHandle = h }

// Restore persisted folder handle from IndexedDB across sessions
const DB_NAME = 'letters-fs', DB_STORE = 'handles', DB_KEY = 'localDir'

export async function restoreLocalFolder() {
  try {
    const db = await openDB()
    const h  = await dbGet(db, DB_KEY)
    if (!h) return false
    // Verify permission still granted
    const perm = await h.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') { _localDirHandle = h; return true }
    const req  = await h.requestPermission({ mode: 'readwrite' })
    if (req === 'granted') { _localDirHandle = h; return true }
  } catch {}
  return false
}

export async function persistLocalFolder(handle) {
  try {
    const db = await openDB()
    await dbPut(db, DB_KEY, handle)
  } catch {}
}

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE)
    r.onsuccess = () => res(r.result)
    r.onerror   = () => rej(r.error)
  })
}
function dbGet(db, key) {
  return new Promise((res, rej) => {
    const r = db.transaction(DB_STORE).objectStore(DB_STORE).get(key)
    r.onsuccess = () => res(r.result)
    r.onerror   = () => rej(r.error)
  })
}
function dbPut(db, key, val) {
  return new Promise((res, rej) => {
    const r = db.transaction(DB_STORE,'readwrite').objectStore(DB_STORE).put(val, key)
    r.onsuccess = () => res()
    r.onerror   = () => rej(r.error)
  })
}

// Resolve a single source to a usable URL (or null)
export async function resolveSource(source, dirHandle) {
  try {
    if (source.type === 'supabase') {
      return await getSupabaseSignedUrl(source.path)
    }
    if (source.type === 'gdrive') {
      return gdriveUrl(source.id)
    }
    if (source.type === 'url') {
      return source.href
    }
    if (source.type === 'local') {
      const h = dirHandle || _localDirHandle
      if (!h) return null
      const fh  = await h.getFileHandle(source.filename)
      const file = await fh.getFile()
      return URL.createObjectURL(file)
    }
  } catch {}
  return null
}

// Walk the sources array, return first working URL + which source index worked
export async function resolveWithFallback(sources, dirHandle) {
  for (let i = 0; i < sources.length; i++) {
    const url = await resolveSource(sources[i], dirHandle)
    if (url) return { url, index: i, source: sources[i] }
  }
  return null
}

// ── React component ───────────────────────────────────────────────
export function MediaItem({ media, dirHandle, style = {} }) {
  const [url,    setUrl]    = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | failed
  const objectUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    resolveWithFallback(media.sources, dirHandle).then(result => {
      if (cancelled) return
      if (result) {
        if (result.source.type === 'local') objectUrlRef.current = result.url
        setUrl(result.url)
        setStatus('ok')
      } else {
        setStatus('failed')
      }
    })
    return () => {
      cancelled = true
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    }
  }, [media.sources, dirHandle])

  const baseStyle = {
    width: '100%', borderRadius: 10, margin: '0.5rem 0',
    background: '#EDE9E3', display: 'block', ...style
  }

  if (status === 'loading') return (
    <div style={{ ...baseStyle, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 20, color: ML.muted }}>⏳</span>
    </div>
  )

  if (status === 'failed') return (
    <div style={{ ...baseStyle, height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: 24 }}>📁</span>
      <span style={{ fontSize: 12, color: ML.muted }}>File not found in any backup location</span>
    </div>
  )

  if (media.mime_type?.startsWith('video')) return (
    <video src={url} controls style={{ ...baseStyle, maxHeight: 320 }} />
  )

  return <img src={url} alt={media.filename} style={{ ...baseStyle, maxHeight: 300, objectFit: 'cover' }} />
}

export function EntryMedia({ mediaList, dirHandle }) {
  if (!mediaList?.length) return null
  if (mediaList.length === 1) return <MediaItem media={mediaList[0]} dirHandle={dirHandle} />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderRadius: 10, overflow: 'hidden', margin: '0.5rem 0' }}>
      {mediaList.map(m => (
        <MediaItem key={m.id} media={m} dirHandle={dirHandle}
          style={{ margin: 0, borderRadius: 0, height: 110, objectFit: 'cover' }} />
      ))}
    </div>
  )
}
