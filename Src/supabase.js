import { createClient } from '@supabase/supabase-js'

export function getSupabase() {
  const url = localStorage.getItem('sb_url')
  const key = localStorage.getItem('sb_key')
  if (!url || !key) return null
  return createClient(url, key)
}

const TEN_YEARS = 315360000

export async function uploadMedia(entryId, file, position) {
  const sb = getSupabase()
  if (!sb) throw new Error('No Supabase client')
  const ext  = file.name.split('.').pop()
  const path = `${entryId}/${Date.now()}-${position}.${ext}`
  const { error: uploadError } = await sb.storage.from('media').upload(path, file)
  if (uploadError) throw uploadError
  const { data, error: urlError } = await sb.storage.from('media').createSignedUrl(path, TEN_YEARS)
  if (urlError) throw urlError
  const { data: row, error: dbError } = await sb.from('media').insert({
    entry_id: entryId, filename: file.name, mime_type: file.type,
    storage_path: path, signed_url: data.signedUrl, position,
  }).select().single()
  if (dbError) throw dbError
  return row
}

export async function deleteMedia(media) {
  const sb = getSupabase()
  if (!sb) return
  await sb.storage.from('media').remove([media.storage_path])
  await sb.from('media').delete().eq('id', media.id)
}

async function hashPassword(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

export async function savePasswordToSupabase(pass) {
  const sb = getSupabase()
  if (!sb) return false
  const hash = await hashPassword(pass)
  const { error } = await sb.from('config').upsert({ key:'app_pass', value:hash }, { onConflict:'key' })
  if (!error) localStorage.setItem('app_pass_hash', hash)
  return !error
}

export async function verifyPassword(pass) {
  const hash = await hashPassword(pass)
  const local = localStorage.getItem('app_pass_hash')
  if (local && local === hash) return true
  const sb = getSupabase()
  if (!sb) return false
  const { data, error } = await sb.from('config').select('value').eq('key','app_pass').single()
  if (error || !data) return false
  if (data.value === hash) { localStorage.setItem('app_pass_hash', hash); return true }
  return false
}
