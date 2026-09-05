const DIFFUSION_KERNELS = {
  fs:        [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]],
  atkinson:  [[1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8]],
  burkes:    [[1,0,8/32],[2,0,4/32],[-2,1,2/32],[-1,1,4/32],[0,1,8/32],[1,1,4/32],[2,1,2/32]],
  stucki:    [[1,0,8/42],[2,0,4/42],[-2,1,2/42],[-1,1,4/42],[0,1,8/42],[1,1,4/42],[2,1,2/42],[-2,2,1/42],[-1,2,2/42],[0,2,4/42],[1,2,2/42],[2,2,1/42]],
  jjn:       [[1,0,7/48],[2,0,5/48],[-2,1,3/48],[-1,1,5/48],[0,1,7/48],[1,1,5/48],[2,1,3/48],[-2,2,1/48],[-1,2,3/48],[0,2,5/48],[1,2,3/48],[2,2,1/48]],
  sierra:    [[1,0,5/32],[2,0,3/32],[-2,1,2/32],[-1,1,4/32],[0,1,5/32],[1,1,4/32],[2,1,2/32],[-1,2,2/32],[0,2,3/32],[1,2,2/32]],
  sierra2:   [[1,0,4/16],[2,0,3/16],[-2,1,1/16],[-1,1,2/16],[0,1,3/16],[1,1,2/16],[2,1,1/16]],
  sierraLite:[[1,0,0.5],[-1,1,0.25],[0,1,0.25]],
}
const BAYER_MATRICES = {
  bayer2:{ size:2, m:[[0,2],[3,1]] },
  bayer4:{ size:4, m:[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] },
  bayer8:{ size:8, m:[[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]] },
}

function clamp255(v){ return v<0?0:v>255?255:v }

function applyBC(buf,brightness,contrast){
  const c=(259*(contrast+255))/(255*(259-contrast))
  for(let i=0;i<buf.length;i+=4)
    for(let k=0;k<3;k++){let v=buf[i+k]+brightness;v=c*(v-128)+128;buf[i+k]=clamp255(v)}
}

function diffusion(values,w,h,threshold,kernel){
  const out=new Uint8ClampedArray(w*h),buf=Float32Array.from(values)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const idx=y*w+x,v=buf[idx],newVal=v>threshold?255:0,err=v-newVal
    out[idx]=newVal
    for(const[dx,dy,wgt]of kernel){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny<h)buf[ny*w+nx]+=err*wgt}
  }
  return out
}

function ordered(values,w,h,threshold,{size,m}){
  const n=size*size,offset=threshold-128,out=new Uint8ClampedArray(w*h)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const idx=y*w+x,t=((m[y%size][x%size]+0.5)/n)*255+offset;out[idx]=values[idx]>t?255:0}
  return out
}

function randomDither(values,w,h,threshold){
  const out=new Uint8ClampedArray(w*h)
  for(let i=0;i<values.length;i++){const t=threshold+(Math.random()-0.5)*90;out[i]=values[i]>t?255:0}
  return out
}

function threshold(values,w,h,thr){
  const out=new Uint8ClampedArray(w*h)
  for(let i=0;i<values.length;i++)out[i]=values[i]>thr?255:0
  return out
}

function ditherChannel(values,w,h,algorithm,thr){
  if(DIFFUSION_KERNELS[algorithm])return diffusion(values,w,h,thr,DIFFUSION_KERNELS[algorithm])
  if(BAYER_MATRICES[algorithm])return ordered(values,w,h,thr,BAYER_MATRICES[algorithm])
  if(algorithm==='random')return randomDither(values,w,h,thr)
  return threshold(values,w,h,thr)
}

export function ditherFrameToCanvas(el,settings,mediaType='image'){
  const{outputWidth,pixelSize,colorMode,algorithm,threshold:thr,brightness,contrast}=settings
  const srcW=mediaType==='video'?el.videoWidth:el.naturalWidth
  const srcH=mediaType==='video'?el.videoHeight:el.naturalHeight
  const ratio=srcH/srcW
  const outH=Math.max(1,Math.round(outputWidth*ratio))
  const workW=Math.max(1,Math.round(outputWidth/pixelSize))
  const workH=Math.max(1,Math.round(outH/pixelSize))
  const work=document.createElement('canvas')
  work.width=workW;work.height=workH
  const wctx=work.getContext('2d')
  wctx.imageSmoothingEnabled=true
  wctx.drawImage(el,0,0,workW,workH)
  const id=wctx.getImageData(0,0,workW,workH),data=id.data
  applyBC(data,brightness,contrast)
  const n=workW*workH
  if(colorMode==='color'){
    for(const ch of[0,1,2]){
      const vals=new Float32Array(n)
      for(let i=0;i<n;i++)vals[i]=data[i*4+ch]
      const d=ditherChannel(vals,workW,workH,algorithm,thr)
      for(let i=0;i<n;i++)data[i*4+ch]=d[i]
    }
    for(let i=0;i<n;i++)data[i*4+3]=255
  }else{
    const vals=new Float32Array(n)
    for(let i=0;i<n;i++){const idx=i*4;vals[i]=0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2]}
    const d=ditherChannel(vals,workW,workH,algorithm,thr)
    for(let i=0;i<n;i++){const idx=i*4;data[idx]=data[idx+1]=data[idx+2]=d[i];data[idx+3]=255}
  }
  wctx.putImageData(id,0,0)
  const final=document.createElement('canvas')
  final.width=outputWidth;final.height=outH
  const fctx=final.getContext('2d')
  fctx.imageSmoothingEnabled=false
  fctx.drawImage(work,0,0,outputWidth,outH)
  return final
}

export async function ditherImageFile(file,settings){
  return new Promise((resolve,reject)=>{
    const img=new Image(),url=URL.createObjectURL(file)
    img.onload=()=>{
      const canvas=ditherFrameToCanvas(img,settings,'image')
      canvas.toBlob(blob=>{
        URL.revokeObjectURL(url)
        if(!blob)return reject(new Error('toBlob failed'))
        resolve(new File([blob],file.name.replace(/\.[^.]+$/,'.png'),{type:'image/png'}))
      },'image/png')
    }
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('load failed'))}
    img.src=url
  })
}

export async function ditherVideoFile(file,settings,fps=6,duration=5,onProgress){
  const url=URL.createObjectURL(file)
  const video=document.createElement('video')
  video.muted=true;video.playsInline=true;video.src=url
  await new Promise((res,rej)=>{video.addEventListener('loadedmetadata',res);video.addEventListener('error',rej)})
  const actualDur=Math.min(duration,video.duration||duration)
  const frameCount=Math.max(1,Math.round(actualDur*fps))
  const delay=Math.round(1000/fps)
  const wRes=await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js')
  const wBlob=await wRes.blob()
  const wUrl=URL.createObjectURL(wBlob)
  const gif=new window.GIF({workers:2,quality:10,workerScript:wUrl,repeat:0})
  for(let i=0;i<frameCount;i++){
    const t=Math.min(i/fps,Math.max(0,video.duration-0.01))
    await new Promise(res=>{const fn=()=>{video.removeEventListener('seeked',fn);res()};video.addEventListener('seeked',fn);video.currentTime=t})
    gif.addFrame(ditherFrameToCanvas(video,settings,'video'),{delay,copy:true})
    onProgress?.((i+1)/frameCount*0.7)
  }
  return new Promise((resolve,reject)=>{
    gif.on('progress',p=>onProgress?.(0.7+p*0.3))
    gif.on('finished',blob=>{URL.revokeObjectURL(url);URL.revokeObjectURL(wUrl);resolve(new File([blob],file.name.replace(/\.[^.]+$/,'.gif'),{type:'image/gif'}))})
    gif.on('abort',()=>reject(new Error('GIF aborted')))
    gif.render()
  })
}

export function formatBytes(bytes){const kb=bytes/1024;return kb<1024?kb.toFixed(1)+' KB':(kb/1024).toFixed(2)+' MB'}

export const DEFAULT_DITHER_SETTINGS={outputWidth:800,pixelSize:2,colorMode:'color',algorithm:'fs',threshold:128,brightness:0,contrast:0}
