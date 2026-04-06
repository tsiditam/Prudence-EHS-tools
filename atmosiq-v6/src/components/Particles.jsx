import { useRef, useEffect } from 'react'
export default function Particles() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); let raf
    const ps = Array.from({length:30},()=>({x:Math.random()*800,y:Math.random()*600,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,r:Math.random()*1.5+.3,o:Math.random()*.2+.04}))
    const resize = () => { c.width=c.offsetWidth*2; c.height=c.offsetHeight*2; ctx.scale(2,2) }
    resize()
    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height); const w=c.offsetWidth,h=c.offsetHeight
      ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=w;if(p.x>w)p.x=0;if(p.y<0)p.y=h;if(p.y>h)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(34,211,238,'+p.o+')';ctx.fill()})
      for(let i=0;i<ps.length;i++) for(let j=i+1;j<ps.length;j++){const dx=ps[i].x-ps[j].x,dy=ps[i].y-ps[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<80){ctx.beginPath();ctx.moveTo(ps[i].x,ps[i].y);ctx.lineTo(ps[j].x,ps[j].y);ctx.strokeStyle='rgba(34,211,238,'+(.04*(1-dist/80))+')';ctx.lineWidth=.5;ctx.stroke()}}
      raf=requestAnimationFrame(draw)
    }
    draw(); window.addEventListener('resize',resize)
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])
  return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
}