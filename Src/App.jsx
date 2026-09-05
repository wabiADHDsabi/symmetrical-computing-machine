import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase, uploadMedia, deleteMedia, verifyPassword, savePasswordToSupabase } from './supabase.js'
import { EntryMedia } from './MediaItem.jsx'
import DitherPreview from './DitherPreview.jsx'

const ML = {
  canvas:'#F7F5F0', ink:'#2C2A35', violet:'#7B6E8A',
  ochre:'#A0876A', teal:'#4A7A6D', dustRose:'#9E7B7B',
  slate:'#6A7A8A', muted:'#B0A8BC', white:'#FFFFFF',
  border:'rgba(44,42,53,0.12)',
}
const BORDER_COLORS = [ML.violet, ML.ochre, ML.teal, ML.dustRose, ML.slate]
const serif = "'DM Serif Display', serif"
const entryColor = id => { const n=[...String(id)].reduce((a,c)=>a+c.charCodeAt(0),0); return BORDER_COLORS[n%BORDER_COLORS.length] }

const SEASONS = {
  'Winter 2024': d=>{const m=d.getMonth(),y=d.getFullYear();return(m===11&&y===2024)||(m<2&&y===2025)},
  'Spring 2025': d=>d.getFullYear()===2025&&d.getMonth()>=2&&d.getMonth()<=4,
  'Summer 2025': d=>d.getFullYear()===2025&&d.getMonth()>=5&&d.getMonth()<=7,
  'Fall 2025':   d=>d.getFullYear()===2025&&d.getMonth()>=8&&d.getMonth()<=10,
  'Winter 2025': d=>{const m=d.getMonth(),y=d.getFullYear();return(m===11&&y===2025)||(m<2&&y===2026)},
  'Spring 2026': d=>d.getFullYear()===2026&&d.getMonth()>=2&&d.getMonth()<=4,
  'Summer 2026': d=>d.getFullYear()===2026&&d.getMonth()>=5&&d.getMonth()<=7,
  'Fall 2026':   d=>d.getFullYear()===2026&&d.getMonth()>=8&&d.getMonth()<=10,
}

function renderMd(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br/>')}
function fmtDate(d){return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
function fmtMonth(d){return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
const getSonName   = () => localStorage.getItem('son_name') || ''
const isConfigured = () => !!localStorage.getItem('sb_url') && !!localStorage.getItem('son_name')

// ── Setup ─────────────────────────────────────────────────────────
function SetupScreen({ onDone }) {
  const [step,setStep]=useState(0),[name,setName]=useState(''),[url,setUrl]=useState(''),[key,setKey]=useState(''),[pass,setPass]=useState(''),[testing,setTesting]=useState(false),[testErr,setTestErr]=useState('')

  const testConn = async () => {
    setTesting(true);setTestErr('')
    try{const{createClient}=await import('@supabase/supabase-js');const sb=createClient(url.trim(),key.trim());const{error}=await sb.from('entries').select('id').limit(1);if(error)throw error;setStep(2)}
    catch{setTestErr('Could not connect — check your URL and key.')}finally{setTesting(false)}
  }

  const steps=[
    {title:"Who are you writing to?",sub:"Your letters will be addressed to this person.",
     body:<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your son's name" style={inputSt} autoFocus/>,
     valid:name.trim().length>0,next:()=>setStep(1),cta:'Continue'},
    {title:'Connect your database',sub:'Supabase → your project → Settings → API',
     body:<div style={{display:'flex',flexDirection:'column',gap:12}}><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Project URL (https://xxx.supabase.co)" style={inputSt}/><input value={key} onChange={e=>setKey(e.target.value)} placeholder="anon / public key" style={inputSt}/>{testErr&&<p style={{fontSize:13,color:'#c0392b',margin:0}}>{testErr}</p>}</div>,
     valid:url.trim().length>0&&key.trim().length>0,next:testConn,cta:testing?'Testing…':'Test & continue'},
    {title:'Set your password',sub:'Stored securely in your database — works across all devices.',
     body:<input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Choose a password (min 4 chars)" style={inputSt} autoFocus/>,
     valid:pass.length>=4,
     next:async()=>{localStorage.setItem('son_name',name.trim());localStorage.setItem('sb_url',url.trim());localStorage.setItem('sb_key',key.trim());await savePasswordToSupabase(pass);onDone()},
     cta:'Start writing'},
  ]
  const cur=steps[step]
  return(
    <div style={fullPage}>
      <div style={{maxWidth:420,width:'100%',padding:'0 2rem'}}>
        <p style={{fontFamily:serif,fontSize:13,color:ML.muted,marginBottom:'3rem',letterSpacing:'0.06em'}}>{step+1} / {steps.length}</p>
        <h1 style={{fontFamily:serif,fontSize:28,color:ML.ink,marginBottom:'0.5rem',lineHeight:1.2}}>{cur.title}</h1>
        <p style={{fontSize:14,color:ML.violet,marginBottom:'2rem',lineHeight:1.5}}>{cur.sub}</p>
        {cur.body}
        <button onClick={cur.next} disabled={!cur.valid||testing} style={{...primaryBtn,marginTop:'2rem',width:'100%',opacity:cur.valid?1:0.4}}>{cur.cta}</button>
        {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{...ghostBtn,marginTop:'1rem',display:'block'}}>← Back</button>}
      </div>
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode,setMode]=useState('login'),[pass,setPass]=useState(''),[newPass,setNewPass]=useState(''),[confirm,setConfirm]=useState(''),[err,setErr]=useState(''),[loading,setLoading]=useState(false),[success,setSuccess]=useState('')
  const showErr=msg=>{setErr(msg);setTimeout(()=>setErr(''),3000)}

  const handleLogin=async()=>{if(!pass)return;setLoading(true);const ok=await verifyPassword(pass);setLoading(false);if(ok){onLogin()}else{setPass('');showErr('Incorrect password')}}
  const handleReset=async()=>{
    if(!pass)return showErr('Enter your current password')
    if(!newPass)return showErr('Enter a new password')
    if(newPass!==confirm)return showErr("Passwords don't match")
    if(newPass.length<4)return showErr('Minimum 4 characters')
    setLoading(true);const ok=await verifyPassword(pass);if(!ok){setLoading(false);return showErr('Current password is incorrect')}
    const saved=await savePasswordToSupabase(newPass);setLoading(false)
    if(saved){setSuccess('Password updated.');setMode('login');setPass('');setNewPass('');setConfirm('')}else showErr('Could not save')
  }
  const handleLockedOut=async()=>{
    if(!newPass)return showErr('Enter a new password')
    if(newPass!==confirm)return showErr("Passwords don't match")
    if(newPass.length<4)return showErr('Minimum 4 characters')
    setLoading(true);const saved=await savePasswordToSupabase(newPass);setLoading(false)
    if(saved){setSuccess('Password reset.');setTimeout(()=>onLogin(),1000)}else showErr('Could not connect to Supabase')
  }
  return(
    <div style={fullPage}>
      <div style={{maxWidth:340,width:'100%',padding:'0 2rem',textAlign:'center'}}>
        <h1 style={{fontFamily:serif,fontSize:32,color:ML.ink,marginBottom:'0.25rem'}}>Letters</h1>
        <p style={{fontFamily:serif,fontSize:18,color:ML.violet,fontStyle:'italic',marginBottom:'3rem'}}>to {getSonName()}</p>
        {mode==='login'&&<>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} placeholder="Password" autoFocus style={{...inputSt,textAlign:'center'}}/>
          {err&&<p style={errTxt}>{err}</p>}{success&&<p style={okTxt}>{success}</p>}
          <button onClick={handleLogin} disabled={loading} style={{...primaryBtn,marginTop:'1rem',width:'100%'}}>{loading?'Checking…':'Open'}</button>
          <button onClick={()=>{setMode('reset');setErr('');setPass('')}} style={{...ghostBtn,marginTop:'1.25rem',display:'block',width:'100%'}}>Forgot password?</button>
        </>}
        {mode==='reset'&&<>
          <p style={{fontSize:14,color:ML.violet,marginBottom:'1.5rem',lineHeight:1.5}}>Enter your current password, then choose a new one.</p>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Current password" autoFocus style={{...inputSt,marginBottom:10}}/>
          <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="New password" style={{...inputSt,marginBottom:10}}/>
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm new password" style={inputSt} onKeyDown={e=>e.key==='Enter'&&handleReset()}/>
          {err&&<p style={errTxt}>{err}</p>}
          <button onClick={handleReset} disabled={loading} style={{...primaryBtn,marginTop:'1rem',width:'100%'}}>{loading?'Saving…':'Update password'}</button>
          <div style={{marginTop:'2rem',paddingTop:'1.5rem',borderTop:`0.5px solid ${ML.border}`}}>
            <p style={{fontSize:13,color:ML.muted,marginBottom:'1rem'}}>Don't remember your current password?</p>
            <button onClick={handleLockedOut} disabled={loading||!newPass||!confirm} style={{...ghostBtn,fontSize:13,opacity:newPass&&confirm?1:0.5}}>Reset using my Supabase credentials →</button>
          </div>
          <button onClick={()=>{setMode('login');setErr('');setPass('');setNewPass('');setConfirm('')}} style={{...ghostBtn,marginTop:'1rem',display:'block',width:'100%',color:ML.muted}}>← Back to login</button>
        </>}
      </div>
    </div>
  )
}

// ── Compose ───────────────────────────────────────────────────────
function ComposeModal({ initial, onSave, onClose }) {
  const sonName=getSonName()
  const [body,setBody]=useState(initial?.body||''),[files,setFiles]=useState([]),[processedFiles,setProcessedFiles]=useState([]),[saving,setSaving]=useState(false),[progress,setProgress]=useState('')
  const fileRef=useRef()
  const handleFiles=e=>{const chosen=[...e.target.files].filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));setFiles(p=>[...p,...chosen]);setProcessedFiles([])}
  const removeFile=i=>{setFiles(fs=>fs.filter((_,j)=>j!==i));setProcessedFiles([])}
  const save=async()=>{
    if(!body.trim())return;setSaving(true)
    try{await onSave(body,processedFiles.length?processedFiles:files,initial,setProgress)}
    finally{setSaving(false);setProgress('')}
  }
  return(
    <div style={{position:'fixed',inset:0,background:ML.canvas,zIndex:100,display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1.25rem 1.5rem',borderBottom:`0.5px solid ${ML.border}`}}>
        <button onClick={onClose} style={ghostBtn}>{initial?'Cancel':'Discard'}</button>
        <span style={{fontFamily:serif,fontSize:16,color:ML.ink,fontStyle:'italic'}}>{initial?'Edit letter':`To ${sonName}`}</span>
        <button onClick={save} disabled={!body.trim()||saving} style={{...primaryBtn,padding:'6px 18px',opacity:body.trim()?1:0.4}}>
          {saving?(progress||'Saving…'):initial?'Save':'Send'}
        </button>
      </div>
      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={`Dear ${sonName},\n\n`} autoFocus
        style={{flex:1,border:'none',outline:'none',background:ML.canvas,padding:'1.25rem 1.5rem',fontSize:16,lineHeight:1.7,color:ML.ink,resize:'none'}}/>
      <DitherPreview files={files} onRemove={removeFile} onReady={setProcessedFiles} />
      <div style={{display:'flex',gap:12,padding:'0.75rem 1.5rem',borderTop:`0.5px solid ${ML.border}`,alignItems:'center'}}>
        <button onClick={()=>fileRef.current.click()} style={{...chipBtn,color:ML.violet}}>📎 Add photo / video</button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{display:'none'}} onChange={handleFiles}/>
        <span style={{marginLeft:'auto',fontSize:12,color:ML.muted}}>**bold** *italic*</span>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────
function ExportModal({ entries, onClose }) {
  const sonName=getSonName()
  const [format,setFormat]=useState('md'),[withPhotos,setWithPhotos]=useState(true),[scope,setScope]=useState('all'),[selSeasons,setSelSeasons]=useState([]),[exporting,setExporting]=useState(false)
  const toggleSeason=s=>setSelSeasons(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])
  const doExport=async()=>{
    setExporting(true)
    let filtered=[...entries]
    if(scope==='by season'&&selSeasons.length>0)filtered=entries.filter(e=>selSeasons.some(s=>SEASONS[s]?.(e.date)))
    if(scope==='by year')filtered=entries.filter(e=>e.date.getFullYear()===new Date().getFullYear())
    if(format==='md'||format==='txt'){
      let content=`# Letters to ${sonName}\n\nExported ${new Date().toLocaleDateString()}\n\n---\n\n`
      for(const e of filtered){
        content+=`## ${fmtDate(e.date)}\n\n${e.body}\n\n`
        if(withPhotos&&e.media?.length)content+=e.media.map(m=>`![${m.filename}](${m.signed_url})`).join('\n')+'\n\n'
        content+='---\n\n'
      }
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/plain'}));a.download=`letters-to-${sonName.toLowerCase().replace(/\s+/g,'-')}.${format}`;a.click()
    }else alert(`${format.toUpperCase()} export coming soon. Use Markdown for now.`)
    setExporting(false);onClose()
  }
  return(
    <div style={sheetBackdrop}>
      <div style={sheet}>
        <div style={sheetHdr}><h2 style={sheetTitle}>Export letters</h2><button onClick={onClose} style={iconBtn}>✕</button></div>
        <p style={lbl}>Format</p>
        <div style={{display:'flex',gap:8,marginBottom:'1.25rem'}}>
          {['txt','md','pdf','epub'].map(f=><button key={f} onClick={()=>setFormat(f)} style={{...chipBtn,background:format===f?ML.ink:ML.white,color:format===f?ML.canvas:ML.ink}}>.{f}</button>)}
        </div>
        <p style={lbl}>Photos & videos</p>
        <div style={{display:'flex',gap:8,marginBottom:'1.25rem'}}>
          {[true,false].map(v=><button key={String(v)} onClick={()=>setWithPhotos(v)} style={{...chipBtn,background:withPhotos===v?ML.ink:ML.white,color:withPhotos===v?ML.canvas:ML.ink}}>{v?'Include':'Text only'}</button>)}
        </div>
        <p style={lbl}>Organise by</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:'1rem'}}>
          {['all','by season','by year'].map(s=><button key={s} onClick={()=>setScope(s)} style={{...chipBtn,background:scope===s?ML.ink:ML.white,color:scope===s?ML.canvas:ML.ink}}>{s}</button>)}
        </div>
        {scope==='by season'&&<div style={{marginBottom:'1rem'}}>
          <p style={{...lbl,marginBottom:8}}>Select seasons</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {Object.keys(SEASONS).map(s=><button key={s} onClick={()=>toggleSeason(s)} style={{...chipBtn,fontSize:12,background:selSeasons.includes(s)?ML.violet:ML.white,color:selSeasons.includes(s)?ML.white:ML.ink}}>{s}</button>)}
          </div>
        </div>}
        <div style={{background:'#EDE9E3',borderRadius:10,padding:'0.75rem 1rem',marginBottom:'1.5rem',fontSize:13,color:ML.violet}}>
          {entries.length} letters · {entries.filter(e=>e.media?.length>0).length} with media{!withPhotos&&' · media excluded'}
        </div>
        <button onClick={doExport} disabled={exporting} style={{...primaryBtn,width:'100%'}}>{exporting?'Exporting…':`Export as .${format}`}</button>
      </div>
    </div>
  )
}

// ── Stats ─────────────────────────────────────────────────────────
function StatsModal({ entries, onClose }) {
  const total=entries.length,photos=entries.reduce((a,e)=>a+(e.media?.length||0),0),words=entries.reduce((a,e)=>a+e.body.split(/\s+/).length,0)
  const oldest=entries[entries.length-1],newest=entries[0]
  const days=oldest&&newest?Math.round((newest.date-oldest.date)/86400000):0
  const bySeason=Object.entries(SEASONS).map(([name,fn])=>({name,count:entries.filter(e=>fn(e.date)).length})).filter(s=>s.count>0)
  return(
    <div style={sheetBackdrop}>
      <div style={{...sheet,maxHeight:'80vh',overflowY:'auto'}}>
        <div style={sheetHdr}><h2 style={sheetTitle}>Stats</h2><button onClick={onClose} style={iconBtn}>✕</button></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:'1.5rem'}}>
          {[{n:total,l:'letters'},{n:words.toLocaleString(),l:'words'},{n:photos,l:'photos & videos'},{n:`${days}d`,l:'journey so far'}].map(({n,l})=>(
            <div key={l} style={{background:ML.white,borderRadius:12,padding:'1rem',border:`0.5px solid ${ML.border}`}}>
              <div style={{fontFamily:serif,fontSize:26,color:ML.ink}}>{n}</div>
              <div style={{fontSize:12,color:ML.muted,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
        <p style={{...lbl,marginBottom:10}}>Letters by season</p>
        {bySeason.length===0&&<p style={{fontSize:13,color:ML.muted}}>Not enough entries yet.</p>}
        {bySeason.map(({name,count})=>(
          <div key={name} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
            <span style={{fontSize:13,color:ML.ink,width:110,flexShrink:0}}>{name}</span>
            <div style={{flex:1,height:6,background:'#EDE9E3',borderRadius:3,overflow:'hidden'}}>
              <div style={{width:`${(count/total)*100}%`,height:'100%',background:ML.teal,borderRadius:3}}/>
            </div>
            <span style={{fontSize:12,color:ML.muted,width:20,textAlign:'right'}}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Settings ──────────────────────────────────────────────────────
function SettingsModal({ onClose, onLogout }) {
  const [name,setName]=useState(localStorage.getItem('son_name')||''),[url,setUrl]=useState(localStorage.getItem('sb_url')||''),[key,setKey]=useState(localStorage.getItem('sb_key')||''),[pass,setPass]=useState(''),[saved,setSaved]=useState(false)
  const save=async()=>{localStorage.setItem('son_name',name.trim());localStorage.setItem('sb_url',url.trim());localStorage.setItem('sb_key',key.trim());if(pass.length>=4)await savePasswordToSupabase(pass);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  return(
    <div style={sheetBackdrop}>
      <div style={{...sheet,maxHeight:'85vh',overflowY:'auto'}}>
        <div style={sheetHdr}><h2 style={sheetTitle}>Settings</h2><button onClick={onClose} style={iconBtn}>✕</button></div>
        <p style={lbl}>Son's name</p><input value={name} onChange={e=>setName(e.target.value)} style={{...inputSt,marginBottom:'1.25rem'}}/>
        <p style={lbl}>Supabase URL</p><input value={url} onChange={e=>setUrl(e.target.value)} style={{...inputSt,marginBottom:'1.25rem'}}/>
        <p style={lbl}>Supabase anon key</p><input value={key} onChange={e=>setKey(e.target.value)} style={{...inputSt,marginBottom:'1.25rem'}}/>
        <p style={lbl}>New password <span style={{color:ML.muted,fontWeight:400,textTransform:'none',letterSpacing:0}}>(leave blank to keep)</span></p>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="New password" style={{...inputSt,marginBottom:'1.5rem'}}/>
        <button onClick={save} style={{...primaryBtn,width:'100%',marginBottom:12}}>{saved?'✓ Saved':'Save settings'}</button>
        <button onClick={onLogout} style={{...ghostBtn,display:'block',width:'100%',textAlign:'center',color:'#c0392b'}}>Lock app</button>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState(isConfigured()?'login':'setup')
  const [entries,setEntries]=useState([]),[loading,setLoading]=useState(false)
  const [modal,setModal]=useState(null),[activeEntry,setActiveEntry]=useState(null)
  const [menuEntry,setMenuEntry]=useState(null),[deleteTarget,setDeleteTarget]=useState(null)
  const sb=()=>getSupabase()

  const fetchEntries=useCallback(async()=>{
    const client=sb();if(!client)return;setLoading(true)
    try{
      const{data:rows,error}=await client.from('entries').select('id,created_at,updated_at,body').order('created_at',{ascending:false})
      if(error)throw error
      const ids=rows.map(e=>e.id);let mediaRows=[]
      if(ids.length){const{data:m}=await client.from('media').select('id,entry_id,filename,mime_type,storage_path,signed_url,position').in('entry_id',ids).order('position',{ascending:true});mediaRows=m||[]}
      const byEntry=mediaRows.reduce((acc,m)=>{if(!acc[m.entry_id])acc[m.entry_id]=[];acc[m.entry_id].push(m);return acc},{})
      setEntries(rows.map(e=>({...e,date:new Date(e.created_at),media:byEntry[e.id]||[]})))
    }finally{setLoading(false)}
  },[])

  useEffect(()=>{if(screen==='main')fetchEntries()},[screen,fetchEntries])

  const handleSaveEntry=async(body,newFiles,original,setProgress)=>{
    const client=sb();let entryId
    if(original){await client.from('entries').update({body,body_md:body}).eq('id',original.id);entryId=original.id}
    else{const{data,error}=await client.from('entries').insert({body,body_md:body}).select('id').single();if(error)throw error;entryId=data.id}
    for(let i=0;i<newFiles.length;i++){setProgress?.(`Uploading ${i+1} of ${newFiles.length}…`);await uploadMedia(entryId,newFiles[i],(original?.media?.length||0)+i)}
    setModal(null);setActiveEntry(null);await fetchEntries()
  }

  const handleDelete=async id=>{
    const client=sb(),entry=entries.find(e=>e.id===id)
    if(entry?.media?.length)for(const m of entry.media)await deleteMedia(m)
    await client.from('entries').delete().eq('id',id)
    setDeleteTarget(null);setMenuEntry(null);await fetchEntries()
  }

  const allMedia=entries.flatMap(e=>e.media||[])
  const grouped=entries.reduce((acc,e)=>{const k=fmtMonth(e.date);if(!acc[k])acc[k]=[];acc[k].push(e);return acc},{})

  if(screen==='setup')return <SetupScreen onDone={()=>setScreen('login')}/>
  if(screen==='login')return <LoginScreen onLogin={()=>setScreen('main')}/>

  return(
    <div style={{background:ML.canvas,minHeight:'100vh'}}>
      {/* Toolbar */}
      <div style={{position:'sticky',top:0,background:ML.canvas,zIndex:50,borderBottom:`0.5px solid ${ML.border}`}}>
        <div style={{maxWidth:640,margin:'0 auto',padding:'1rem 1.5rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:serif,fontSize:17,color:ML.ink}}>
            Letters <span style={{color:ML.violet,fontStyle:'italic'}}>to {getSonName()}</span>
          </div>
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            <button onClick={()=>setModal('stats')}    style={toolbarBtn}>Stats</button>
            <button onClick={()=>setModal('export')}   style={toolbarBtn}>Export</button>
            <button onClick={()=>setModal('settings')} style={toolbarBtn}>Settings</button>
            <button onClick={()=>{setActiveEntry(null);setModal('compose')}} style={addBtn}>+ Add entry</button>
          </div>
        </div>
        <div style={{maxWidth:640,margin:'0 auto',padding:'0 1.5rem 0.75rem',display:'flex',gap:'2rem'}}>
          {[{n:entries.length,l:'letters'},{n:allMedia.length,l:'photos & videos'}].map(({n,l})=>(
            <div key={l}><span style={{fontFamily:serif,fontSize:18,color:ML.ink}}>{n}</span><span style={{fontSize:11,color:ML.muted,marginLeft:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{l}</span></div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{maxWidth:640,margin:'0 auto',paddingBottom:'3rem'}}>
        {loading&&<div style={{textAlign:'center',padding:'4rem',color:ML.muted,fontFamily:serif,fontStyle:'italic'}}>Loading your letters…</div>}
        {!loading&&entries.length===0&&(
          <div style={{textAlign:'center',padding:'4rem 2rem'}}>
            <p style={{fontFamily:serif,fontSize:22,color:ML.ink,marginBottom:'0.5rem'}}>No letters yet.</p>
            <p style={{fontSize:14,color:ML.muted}}>Tap <strong>+ Add entry</strong> to write your first one.</p>
          </div>
        )}
        {Object.entries(grouped).map(([month,monthEntries])=>(
          <div key={month}>
            <div style={{textAlign:'center',padding:'2rem 0 0.75rem',fontFamily:serif,fontSize:14,color:ML.muted,letterSpacing:'0.04em'}}>{month}</div>
            {monthEntries.map(entry=>(
              <div key={entry.id} style={{margin:'0 1.5rem 0.875rem',display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                <div style={{background:ML.white,borderRadius:'18px 18px 4px 18px',padding:'0.875rem 1.1rem',width:entry.body.length<80?undefined:'94%',maxWidth:entry.body.length<80?'72%':'94%',borderTop:`2.5px solid ${entryColor(entry.id)}`,borderLeft:`2.5px solid ${entryColor(entry.id)}`,borderRight:`2.5px solid ${entryColor(entry.id)}`,position:'relative',cursor:'pointer'}}
                  onClick={()=>setMenuEntry(menuEntry?.id===entry.id?null:entry)}>
                  <div style={{fontSize:15,lineHeight:1.65,color:ML.ink}} dangerouslySetInnerHTML={{__html:`<p>${renderMd(entry.body)}</p>`}}/>
                  <EntryMedia mediaList={entry.media}/>
                  {menuEntry?.id===entry.id&&(
                    <div style={{position:'absolute',top:8,right:8,background:ML.white,border:`0.5px solid ${ML.border}`,borderRadius:10,padding:'4px 0',boxShadow:'0 4px 16px rgba(44,42,53,0.12)',zIndex:10,minWidth:165}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>{setActiveEntry(entry);setModal('compose');setMenuEntry(null)}} style={menuItem}>Edit</button>
                      <button onClick={()=>{setModal('export');setMenuEntry(null)}} style={menuItem}>Export</button>
                      <div style={{height:'0.5px',background:ML.border,margin:'4px 0'}}/>
                      <button onClick={()=>{setDeleteTarget(entry);setMenuEntry(null)}} style={{...menuItem,color:'#c0392b'}}>Delete</button>
                    </div>
                  )}
                </div>
                <div style={{fontSize:11,color:ML.muted,marginTop:4,paddingRight:2}}>{fmtDate(entry.date)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Delete confirm */}
      {deleteTarget&&(
        <div style={{position:'fixed',inset:0,background:'rgba(44,42,53,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'0 2rem'}}>
          <div style={{background:ML.canvas,borderRadius:16,padding:'1.5rem',maxWidth:340,width:'100%'}}>
            <h3 style={{fontFamily:serif,fontSize:20,color:ML.ink,marginBottom:'0.5rem'}}>Delete this letter?</h3>
            <p style={{fontSize:14,color:ML.violet,lineHeight:1.5,marginBottom:'1.5rem',fontStyle:'italic'}}>"{deleteTarget.body.slice(0,80)}{deleteTarget.body.length>80?'…':''}"</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setDeleteTarget(null)} style={{...chipBtn,flex:1}}>Keep it</button>
              <button onClick={()=>handleDelete(deleteTarget.id)} style={{flex:1,background:'#c0392b',color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:14,cursor:'pointer'}}>Delete forever</button>
            </div>
          </div>
        </div>
      )}

      {modal==='export'  &&<ExportModal  entries={entries} onClose={()=>setModal(null)}/>}
      {modal==='stats'   &&<StatsModal   entries={entries} onClose={()=>setModal(null)}/>}
      {modal==='settings'&&<SettingsModal onClose={()=>setModal(null)} onLogout={()=>{setScreen('login');setModal(null)}}/>}
      {modal==='compose' &&<ComposeModal  initial={activeEntry} onSave={handleSaveEntry} onClose={()=>{setModal(null);setActiveEntry(null)}}/>}
      {menuEntry&&<div style={{position:'fixed',inset:0,zIndex:5}} onClick={()=>setMenuEntry(null)}/>}
    </div>
  )
}

const fullPage={minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:ML.canvas}
const inputSt={width:'100%',boxSizing:'border-box',background:ML.white,border:`0.5px solid rgba(44,42,53,0.2)`,borderRadius:10,padding:'0.75rem 1rem',fontSize:15,color:ML.ink,outline:'none',display:'block'}
const primaryBtn={background:ML.ink,color:ML.canvas,border:'none',borderRadius:22,padding:'10px 22px',fontSize:14,fontWeight:500,cursor:'pointer'}
const ghostBtn={background:'none',border:'none',color:ML.violet,fontSize:14,cursor:'pointer',padding:'8px 0'}
const chipBtn={background:ML.white,border:`0.5px solid rgba(44,42,53,0.2)`,borderRadius:20,padding:'6px 14px',fontSize:13,cursor:'pointer'}
const lbl={fontSize:12,color:ML.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8,marginTop:0,display:'block'}
const toolbarBtn={background:'none',border:'none',fontSize:13,color:ML.violet,cursor:'pointer'}
const addBtn={background:ML.ink,color:ML.canvas,border:'none',borderRadius:20,padding:'6px 14px',fontSize:13,fontWeight:500,cursor:'pointer'}
const iconBtn={background:'none',border:'none',fontSize:18,color:ML.muted,cursor:'pointer',padding:4}
const menuItem={display:'block',width:'100%',background:'none',border:'none',padding:'8px 16px',fontSize:14,color:ML.ink,cursor:'pointer',textAlign:'left',whiteSpace:'nowrap'}
const sheetBackdrop={position:'fixed',inset:0,background:'rgba(44,42,53,0.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:100}
const sheet={background:ML.canvas,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:640,padding:'1.5rem 1.5rem 2.5rem'}
const sheetHdr={display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}
const sheetTitle={fontFamily:"'DM Serif Display', serif",fontSize:20,color:ML.ink,margin:0}
const errTxt={fontSize:13,color:'#c0392b',marginTop:8}
const okTxt={fontSize:13,color:ML.teal,marginTop:8}
