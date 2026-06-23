import { createClient } from '@supabase/supabase-js'

export function getSupabase() {
  const url = localStorage.getItem('sb_url')
  const key = localStorage.getItem('sb_key')
  if (!url || !key) return null
  return createClient(url, key)
}

// Get a signed URL for a Supabase Storage path (1 hour)
export async function getSupabaseSignedUrl(path) {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.storage.from('media').createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

// Build a Google Drive direct-view URL from a file ID
export function gdriveUrl(id) {
  return `https://drive.google.com/uc?export=view&id=${id}`
}
