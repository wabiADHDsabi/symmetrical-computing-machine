/**
 * BackupManager — desktop-only screen for downloading cloud media to local
 * and updating source lists in Supabase.
 *
 * Only shown when File System Access API is available (Chrome/Edge desktop).
 */

import { useState, useEffect } from 'react'
import { getSupabase, getSupabaseSignedUrl } from './supabase.js'
import {
  hasLocalFolder, requestLocalFolder, persistLocalFolder,
  resolveSource, getLocalDirHandle
} from './MediaResolver.jsx'

const ML = {
  canvas: '#F7F5F0', ink: '#2C2A35', violet: '#7B6E8A',
  ochre: '#A0876A', teal: '#4A7A6D', muted: '#B0A8BC',
  white: '#FFFFFF', border: 'rgba(44,42,53,0.12)',
}
const serif = "'DM Serif Display', serif"

// Is File System Access API available?
export const canUseLocalFS = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

function sourceLabel(s) {
  if (s.type === 'supabase') return '☁ Supabase'
  if (s.type === 'gdrive')   return '☁ Google Drive'
  if (s.type === 'url')      return '🔗 URL'
  if (s.type === 'local')    return '💾 Local'
  return s.type
}

function StatusBadge({ sources }) {
  const hasLocal = sources.some(s => s.type === 'local')
  const hasCloud = sources.some(s => s.type === 'supabase' || s.type === 'gdrive' || s.type === 'url')
  if (hasLocal && hasCloud)
    return <span style={badge('#4A7A6D')}>✓ local + cloud</span>
  if (hasLocal)
    return <span style={badge('#A0876A')}>💾 local only</span>
  return <span style={badge('#7B6E8A')}>☁ cloud only</span>
}

function badge(color) {
  return { fontSize: 11, background: color + '22', color, borderRadius: 20,
    padding: '2px 8px', fontWeight: 500, whiteSpace: 'nowrap' }
}

export default function BackupManager({ allMedia, onClose, onMediaUpdated }) {
  const [folderGranted, setFolderGranted] = useState(hasLocalFolder())
  const [folderName,    setFolderName]    = useState(getLocalDirHandle()?.name || '')
  const [downloading,   setDownloading]   = useState({}) // id → 'pending'|'done'|'error'
  const [bulkRunning,   setBulkRunning]   = useState(false)

  const cloudOnlyMedia = allMedia.filter(m => !m.sources.some(s => s.type === 'local'))
  const localMedia     = allMedia.filter(m =>  m.sources.some(s => s.type === 'local'))

  const grantFolder = async () => {
    const ok = await requestLocalFolder()
    if (ok) {
      await persistLocalFolder(getLocalDirHandle())
      setFolderGranted(true)
      setFolderName(getLocalDirHandle()?.name || '')
    }
  }

  const downloadOne = async (media) => {
    setDownloading(d => ({ ...d, [media.id]: 'pending' }))
    try {
      const dirHandle = getLocalDirHandle()
      if (!dirHandle) throw new Error('No folder')

      // Find first cloud source and get its URL
      const cloudSource = media.sources.find(s =>
        s.type === 'supabase' || s.type === 'gdrive' || s.type === 'url')
      if (!cloudSource) throw new Error('No cloud source')

      const url = await resolveSource(cloudSource)
      if (!url) throw new Error('Could not fetch URL')

      // Fetch the file
      const res  = await fetch(url)
      const blob = await res.blob()

      // Write to local folder
      const fh = await dirHandle.getFileHandle(media.filename, { create: true })
      const w  = await fh.createWritable()
      await w.write(blob)
      await w.close()

      // Add local source to the front of the sources array in Supabase
      const newSources = [
        { type: 'local', filename: media.filename },
        ...media.sources.filter(s => s.type !== 'local'),
      ]
      const sb = getSupabase()
      await sb.from('media').update({ sources: newSources }).eq('id', media.id)

      setDownloading(d => ({ ...d, [media.id]: 'done' }))
      onMediaUpdated(media.id, newSources)
    } catch (e) {
      console.error(e)
      setDownloading(d => ({ ...d, [media.id]: 'error' }))
    }
  }

  const downloadAll = async () => {
    setBulkRunning(true)
    for (const m of cloudOnlyMedia) {
      if (downloading[m.id] === 'done') continue
      await downloadOne(m)
    }
    setBulkRunning(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: ML.canvas, zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: `0.5px solid ${ML.border}` }}>
        <h2 style={{ fontFamily: serif, fontSize: 20, color: ML.ink, margin: 0 }}>Backup Manager</h2>
        <button onClick={onClose} style={iconBtn}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', maxWidth: 640, width: '100%', margin: '0 auto' }}>

        {/* Folder grant */}
        <div style={{ background: ML.white, border: `0.5px solid ${ML.border}`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ ...label, marginBottom: 8 }}>Local backup folder</p>
          {folderGranted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📁</span>
              <span style={{ fontSize: 14, color: ML.ink }}>{folderName}</span>
              <button onClick={grantFolder} style={{ ...ghostBtn, marginLeft: 'auto', fontSize: 12 }}>Change folder</button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: ML.violet, marginBottom: 12, lineHeight: 1.5 }}>
                Grant access to a folder on this PC. Files will be downloaded there and the app will use them as the primary source.
                <br /><span style={{ color: ML.muted }}>Chrome / Edge only. One-time grant per session.</span>
              </p>
              <button onClick={grantFolder} style={primaryBtn}>📁 Choose folder</button>
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { n: allMedia.length,      l: 'total files' },
            { n: localMedia.length,    l: 'backed up locally' },
            { n: cloudOnlyMedia.length,l: 'cloud only' },
            { n: allMedia.reduce((a,m)=>a+m.sources.length,0), l: 'total sources' },
          ].map(({ n, l }) => (
            <div key={l} style={{ background: ML.white, border: `0.5px solid ${ML.border}`, borderRadius: 12, padding: '0.875rem 1rem' }}>
              <div style={{ fontFamily: serif, fontSize: 24, color: ML.ink }}>{n}</div>
              <div style={{ fontSize: 12, color: ML.muted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Bulk download */}
        {cloudOnlyMedia.length > 0 && folderGranted && (
          <button onClick={downloadAll} disabled={bulkRunning}
            style={{ ...primaryBtn, width: '100%', marginBottom: '1.5rem', opacity: bulkRunning ? 0.6 : 1 }}>
            {bulkRunning ? 'Downloading…' : `⬇ Download all ${cloudOnlyMedia.length} cloud-only files to local`}
          </button>
        )}

        {/* Cloud-only list */}
        {cloudOnlyMedia.length > 0 && (
          <>
            <p style={{ ...label, marginBottom: 10 }}>Cloud only — not yet backed up locally</p>
            {cloudOnlyMedia.map(m => (
              <MediaRow key={m.id} media={m} status={downloading[m.id]}
                onDownload={folderGranted ? () => downloadOne(m) : null} />
            ))}
          </>
        )}

        {/* Local + cloud list */}
        {localMedia.length > 0 && (
          <>
            <p style={{ ...label, marginTop: '1.5rem', marginBottom: 10 }}>Backed up locally ✓</p>
            {localMedia.map(m => (
              <MediaRow key={m.id} media={m} status="done" onDownload={null} />
            ))}
          </>
        )}

        {allMedia.length === 0 && (
          <p style={{ textAlign: 'center', color: ML.muted, padding: '3rem 0', fontFamily: serif, fontStyle: 'italic' }}>
            No photos or videos yet.
          </p>
        )}
      </div>
    </div>
  )
}

function MediaRow({ media, status, onDownload }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 0', borderBottom: `0.5px solid ${ML.border}` }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {media.mime_type?.startsWith('video') ? '🎥' : '🖼'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, color: ML.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {media.filename}
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {media.sources.map((s, i) => (
            <span key={i} style={{ fontSize: 11, color: ML.muted }}>{sourceLabel(s)}</span>
          ))}
        </div>
      </div>
      <StatusBadge sources={media.sources} />
      {onDownload && (
        <button onClick={onDownload} disabled={status === 'pending' || status === 'done'}
          style={{ ...smallBtn, opacity: status === 'pending' ? 0.5 : 1 }}>
          {status === 'pending' ? '⏳' : status === 'done' ? '✓' : status === 'error' ? '⚠ retry' : '⬇'}
        </button>
      )}
    </div>
  )
}

const serif     = "'DM Serif Display', serif"
const label     = { fontSize: 12, color: ML.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', margin: 0 }
const primaryBtn= { background: ML.ink, color: ML.canvas, border: 'none', borderRadius: 22, padding: '10px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }
const ghostBtn  = { background: 'none', border: 'none', color: ML.violet, fontSize: 14, cursor: 'pointer', padding: '4px 0' }
const iconBtn   = { background: 'none', border: 'none', fontSize: 18, color: ML.muted, cursor: 'pointer', padding: 4 }
const smallBtn  = { background: 'none', border: `0.5px solid ${ML.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer', color: ML.ink, flexShrink: 0 }
