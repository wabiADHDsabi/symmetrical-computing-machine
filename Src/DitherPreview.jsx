import { useState, useEffect, useRef, useCallback } from 'react'
import { ditherImageFile, ditherVideoFile, ditherFrameToCanvas, DEFAULT_DITHER_SETTINGS, formatBytes } from './dither.js'

const ML = { canvas:'#F7F5F0',ink:'#2C2A35',violet:'#7B6E8A',teal:'#4A7A6D',muted:'#B0A8BC',white:'#FFFFFF',border:'rgba(44,42,53,0.12)' }

function SliderRow({ label, min, max, step=1, value, onChange, suffix='' }) {
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:ML.muted,marginBottom:3}}>
        <span>{label}</span><span style={{color:ML.ink}}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))} style={{width:'100%',accentColor:ML.teal}} />
    </div>
  )
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <div style={{flex:1}}>
      <div style={{fontSize:12,color:ML.muted,marginBottom:3}}>{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:'100%',padding:'5px 8px',border:`0.5px solid ${ML.border}`,borderRadius:6,background:ML.white,fontSize:12,color:ML.ink}}>
        {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

function DitherCard({ file, index, onRemove, onProcessed }) {
  const [settings,   setSettings]   = useState(DEFAULT_DITHER_SETTINGS)
  const [useDither,  setUseDither]  = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [sizeOrig,   setSizeOrig]   = useState('')
  const [sizeDith,   setSizeDith]   = useState('')
  const [showOpts,   setShowOpts]   = useState(false)
  const [gifReady,   setGifReady]   = useState(false)
  const canvasRef   = useRef()
  const sourceRef   = useRef()
  const renderTimer = useRef()
  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSizeOrig(formatBytes(file.size))
    if (isImage) {
      const img = new Image()
      img.onload = () => { sourceRef.current = img; renderCanvas() }
      img.src = url
    } else if (isVideo) {
      const v = document.createElement('video')
      v.muted=true; v.playsInline=true; v.src=url
      v.addEventListener('loadedmetadata', () => {
        v.currentTime=0
        v.addEventListener('seeked', () => { sourceRef.current=v; renderCanvas() }, {once:true})
      })
    }
    return () => URL.revokeObjectURL(url)
  }, [file])

  const renderCanvas = useCallback(() => {
    if (!sourceRef.current || !canvasRef.current) return
    clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(() => {
      const c = ditherFrameToCanvas(sourceRef.current, settings, isVideo?'video':'image')
      const ctx = canvasRef.current.getContext('2d')
      canvasRef.current.width=c.width; canvasRef.current.height=c.height
      ctx.drawImage(c, 0, 0)
      c.toBlob(blob => { if(blob) setSizeDith(formatBytes(blob.size)) }, 'image/png')
    }, 80)
  }, [settings, isVideo])

  useEffect(() => { if (useDither) renderCanvas() }, [settings, useDither, renderCanvas])

  const processImage = useCallback(async () => {
    if (!useDither) { onProcessed(index, file, false); return }
    setProcessing(true)
    try {
      const result = await ditherImageFile(file, settings)
      setSizeDith(formatBytes(result.size))
      onProcessed(index, result, true)
    } catch(e) { onProcessed(index, file, false) }
    finally { setProcessing(false) }
  }, [file, settings, useDither, index, onProcessed])

  const processVideo = useCallback(async () => {
    setProcessing(true); setProgress(0); setGifReady(false)
    try {
      const result = await ditherVideoFile(file, settings, 6, 5, p => setProgress(Math.round(p*100)))
      setSizeDith(formatBytes(result.size))
      setGifReady(true)
      onProcessed(index, result, true)
    } catch(e) { onProcessed(index, file, false) }
    finally { setProcessing(false) }
  }, [file, settings, index, onProcessed])

  // Auto-process images
  useEffect(() => {
    if (isImage) processImage()
    else if (!useDither) onProcessed(index, file, false)
  }, [useDither, settings])

  const upd = (k,v) => setSettings(s=>({...s,[k]:v}))

  return (
    <div style={{background:ML.white,border:`0.5px solid ${ML.border}`,borderRadius:12,overflow:'hidden',marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',borderBottom:`0.5px solid ${ML.border}`}}>
        <span style={{fontSize:18}}>{isVideo?'🎥':'🖼'}</span>
        <span style={{flex:1,fontSize:13,color:ML.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
        <span style={{fontSize:11,color:ML.muted}}>{sizeOrig}</span>
        <button onClick={()=>onRemove(index)} style={{background:'none',border:'none',fontSize:16,color:ML.muted,cursor:'pointer'}}>✕</button>
      </div>

      {useDither && (
        <div style={{background:'#EDE9E3',display:'flex',justifyContent:'center',padding:'0.5rem',position:'relative',minHeight:80}}>
          <canvas ref={canvasRef} style={{maxWidth:'100%',maxHeight:200,imageRendering:'pixelated',borderRadius:6}} />
          {processing && (
            <div style={{position:'absolute',inset:0,background:'rgba(247,245,240,0.9)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
              <div style={{width:'60%',height:4,background:ML.border,borderRadius:2,overflow:'hidden'}}>
                <div style={{width:`${progress}%`,height:'100%',background:ML.teal,transition:'width 0.15s'}} />
              </div>
              <span style={{fontSize:12,color:ML.violet}}>{isVideo?`Rendering GIF… ${progress}%`:'Processing…'}</span>
            </div>
          )}
          {isVideo && gifReady && <div style={{position:'absolute',top:6,right:6,background:ML.teal,color:'#fff',fontSize:11,borderRadius:8,padding:'2px 8px'}}>GIF ready ✓</div>}
        </div>
      )}

      <div style={{padding:'0.75rem 1rem'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <input type="checkbox" checked={useDither} onChange={e=>setUseDither(e.target.checked)} style={{accentColor:ML.teal,width:14,height:14}} />
            <span style={{fontSize:13,color:ML.ink}}>Dither</span>
            {useDither && sizeDith && !processing && <span style={{fontSize:11,color:ML.teal}}>→ {sizeDith}</span>}
          </label>
          <div style={{display:'flex',gap:8}}>
            {isVideo && useDither && !processing && (
              <button onClick={processVideo} style={{fontSize:12,background:ML.teal,color:'#fff',border:'none',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}>
                {gifReady ? 'Re-render GIF' : 'Generate GIF'}
              </button>
            )}
            {useDither && (
              <button onClick={()=>setShowOpts(o=>!o)} style={{fontSize:12,background:'none',border:`0.5px solid ${ML.border}`,borderRadius:8,padding:'4px 10px',cursor:'pointer',color:ML.violet}}>
                {showOpts?'Hide':'Options'}
              </button>
            )}
          </div>
        </div>

        {useDither && showOpts && (
          <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:10,paddingTop:10,borderTop:`0.5px solid ${ML.border}`}}>
            <SliderRow label="Pixel size" min={1} max={8} value={settings.pixelSize} onChange={v=>upd('pixelSize',v)} />
            <SliderRow label="Brightness" min={-100} max={100} value={settings.brightness} onChange={v=>upd('brightness',v)} />
            <SliderRow label="Contrast"   min={-100} max={100} value={settings.contrast}   onChange={v=>upd('contrast',v)} />
            <div style={{display:'flex',gap:8}}>
              <SelectRow label="Mode" value={settings.colorMode} onChange={v=>upd('colorMode',v)}
                options={[{v:'color',l:'Color'},{v:'mono',l:'Mono'}]} />
              <SelectRow label="Algorithm" value={settings.algorithm} onChange={v=>upd('algorithm',v)}
                options={[{v:'fs',l:'Floyd-Steinberg'},{v:'atkinson',l:'Atkinson'},{v:'burkes',l:'Burkes'},{v:'bayer4',l:'Bayer 4×4'},{v:'bayer8',l:'Bayer 8×8'},{v:'random',l:'Random'}]} />
            </div>
            {isVideo && <SliderRow label="Output width" min={240} max={800} step={40} value={settings.outputWidth} onChange={v=>upd('outputWidth',v)} suffix=" px" />}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DitherPreview({ files, onRemove, onReady }) {
  const [processed, setProcessed] = useState({})

  const handleProcessed = useCallback((index, file) => {
    setProcessed(p => {
      const next = {...p, [index]: file}
      if (Object.keys(next).length === files.length)
        onReady(files.map((_,i) => next[i] || files[i]))
      return next
    })
  }, [files, onReady])

  if (!files.length) return null
  return (
    <div style={{padding:'0 1rem 0.5rem'}}>
      {files.map((f,i) => (
        <DitherCard key={`${f.name}-${i}`} file={f} index={i} onRemove={onRemove} onProcessed={handleProcessed} />
      ))}
    </div>
  )
}
