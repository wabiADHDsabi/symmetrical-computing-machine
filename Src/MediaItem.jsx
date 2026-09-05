const ML = { muted: '#B0A8BC' }

export function MediaItem({ media, style = {} }) {
  const url  = media.signed_url
  const base = { width:'100%', borderRadius:10, margin:'0.5rem 0', display:'block', ...style }
  if (!url) return (
    <div style={{...base,height:120,background:'#EDE9E3',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{fontSize:13,color:ML.muted}}>No URL — re-upload this file</span>
    </div>
  )
  if (media.mime_type?.startsWith('video') || media.mime_type==='image/gif') return (
    <video src={url} controls style={{...base,maxHeight:320}} />
  )
  return <img src={url} alt={media.filename} style={{...base,maxHeight:300,objectFit:'cover'}} onError={e=>{e.target.style.display='none'}} />
}

export function EntryMedia({ mediaList }) {
  if (!mediaList?.length) return null
  if (mediaList.length === 1) return <MediaItem media={mediaList[0]} />
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,borderRadius:10,overflow:'hidden',margin:'0.5rem 0'}}>
      {mediaList.map(m=>(
        <MediaItem key={m.id} media={m} style={{margin:0,borderRadius:0,height:110,objectFit:'cover'}} />
      ))}
    </div>
  )
}
