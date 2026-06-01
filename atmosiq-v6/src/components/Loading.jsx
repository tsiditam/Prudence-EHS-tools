/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * Loading — AtmosFlow brand splash.
 *
 * Renders a programmatic particle animation of the cyan AtmosFlow brain
 * mark on a black field: the mark holds, slowly disintegrates into a
 * cloud of cyan particles, then draws back together — looping for the
 * life of the splash. Pixels are sampled once from the vector mark
 * (/icons/atmosflow-mark.svg) into particle home positions, so the
 * silhouette is always faithful to the logo. No GIF, no network weight
 * beyond the 35 KB SVG (which the rest of the app already ships).
 *
 * Lifecycle preserved from the previous implementation: 5 s hold by
 * default, 400 ms for returning users (`fast`), 600 ms fade-out at the
 * end.
 *
 * Reduced-motion fallback: when the OS / browser requests reduced
 * motion, the particle field is suppressed and the static "AtmosFlow"
 * wordmark fades in instead — the vestibular-safe path, brand moment
 * intact.
 */

import { useEffect, useRef, useState } from 'react'

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// One full disintegrate→reform pass. Sized to fill the whole brand
// hold (below) so the mark finishes drawing back together exactly as
// the splash begins fading to reveal the app — one slow breath.
const CYCLE_MS = 6400

export default function Loading({ onDone, fast }) {
  const [fadeOut, setFadeOut] = useState(false)
  const canvasRef = useRef(null)
  // ~7 s brand hold for first opens: one full CYCLE_MS dissolve/reform
  // pass, then the 600 ms fade. Returning users (`fast`) still skip
  // straight through in 400 ms.
  const duration = fast ? 400 : CYCLE_MS + 600

  // Splash lifecycle (fade then unmount) — independent of the canvas.
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), duration - 600)
    const doneTimer = setTimeout(onDone, duration)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onDone, fast, duration])

  // Particle field.
  useEffect(() => {
    if (reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Particle home positions, stored as fractions of the mark box so a
    // viewport resize is a cheap rescale rather than a re-sample.
    let frac = []          // { fx, fy } in [0,1]
    let P = null           // typed-array particle state, built once sized
    let cx = 0, cy = 0, markW = 0, markH = 0, maxR = 0
    let W = 0, H = 0
    let aspect = 1         // sampled height / width

    function layout() {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W / 2
      cy = H / 2
      markW = Math.min(W * 0.62, 320)
      markH = markW * aspect
      // Scatter stays contained to a cloud around centre rather than
      // flying fully off-screen, so the dissolved midpoint reads as a
      // drifting nebula instead of an empty black frame.
      maxR = Math.min(W, H) * 0.5
      if (P) {
        for (let i = 0; i < P.n; i++) {
          P.hx[i] = cx + (frac[i].fx - 0.5) * markW
          P.hy[i] = cy + (frac[i].fy - 0.5) * markH
          P.dist[i] = P.fr[i] * maxR
        }
      }
    }

    function buildParticles() {
      const n = frac.length
      const hx = new Float32Array(n)
      const hy = new Float32Array(n)
      const ang = new Float32Array(n)
      const fr = new Float32Array(n)
      const dist = new Float32Array(n)
      const k = new Float32Array(n)
      const seed = new Float32Array(n)
      const white = new Uint8Array(n)
      // Centroid for radial stagger (edges lead the dissolve).
      let mfx = 0, mfy = 0
      for (let i = 0; i < n; i++) { mfx += frac[i].fx; mfy += frac[i].fy }
      mfx /= n; mfy /= n
      for (let i = 0; i < n; i++) {
        ang[i] = Math.random() * Math.PI * 2
        fr[i] = 0.12 + Math.random() * 0.9
        const dx = frac[i].fx - mfx, dy = frac[i].fy - mfy
        const radial = Math.min(1, Math.hypot(dx, dy) / 0.6)
        // Per-particle delay applied as an exponent on the global
        // dissolve: edges (radial→1) get k<1 so they leave first,
        // centre (radial→0) gets k>1 so it lingers. Crucially d^k still
        // maps 0→0 and 1→1, so every particle is perfectly home at the
        // assembled extreme and fully gone at the scattered extreme.
        k[i] = (1.8 - radial * 1.2) * (0.85 + Math.random() * 0.3)
        seed[i] = Math.random() * 1000
        white[i] = Math.random() < 0.14 ? 1 : 0
      }
      P = { n, hx, hy, ang, fr, dist, k, seed, white }
    }

    function start() {
      buildParticles()
      layout()
      const t0 = performance.now()
      const TWO_PI = Math.PI * 2
      const draw = (now) => {
        if (!running) return
        const p = ((now - t0) % CYCLE_MS) / CYCLE_MS
        // Smoky trail: clear with a translucent black so scattered
        // particles leave a brief wake as they drift off.
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = 'rgba(0,0,0,0.38)'
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'lighter'
        // Global dissolve: 0 assembled → 1 scattered → 0, eased at both
        // ends by the cosine so the hold and the reform read as "slow".
        const D = 0.5 - 0.5 * Math.cos(TWO_PI * p)
        const { n, hx, hy, ang, dist, k, seed, white } = P
        for (let i = 0; i < n; i++) {
          const e = Math.pow(D, k[i])              // per-particle delay
          const tw = e * 6                         // shimmer amplitude
          const x = hx[i] + Math.cos(ang[i]) * dist[i] * e
            + Math.sin(now * 0.0016 + seed[i]) * tw
          const y = hy[i] + Math.sin(ang[i]) * dist[i] * e
            + Math.cos(now * 0.0014 + seed[i]) * tw
          const a = 0.9 - 0.5 * e
          const s = (1.7 - 0.5 * e) * (white[i] ? 1.25 : 1)
          ctx.fillStyle = white[i]
            ? 'rgba(186,245,255,' + a + ')'
            : 'rgba(34,211,238,' + a + ')'
          ctx.fillRect(x - s / 2, y - s / 2, s, s)
        }
        raf = requestAnimationFrame(draw)
      }
      raf = requestAnimationFrame(draw)
    }

    // Sample the vector mark once into home positions, then animate.
    const img = new Image()
    img.onload = () => {
      const sw = 300
      const sh = Math.round(sw * (img.height / img.width))
      aspect = sh / sw
      const off = document.createElement('canvas')
      off.width = sw; off.height = sh
      const octx = off.getContext('2d')
      octx.drawImage(img, 0, 0, sw, sh)
      let data
      try {
        data = octx.getImageData(0, 0, sw, sh).data
      } catch {
        return // tainted canvas (shouldn't happen same-origin) — stay black
      }
      const gap = 3
      const pts = []
      for (let y = 0; y < sh; y += gap) {
        for (let x = 0; x < sw; x += gap) {
          if (data[(y * sw + x) * 4 + 3] > 130) {
            pts.push({ fx: x / sw, fy: y / sh })
          }
        }
      }
      frac = pts
      if (frac.length) start()
    }
    img.src = '/icons/atmosflow-mark.svg'

    const onResize = () => layout()
    window.addEventListener('resize', onResize)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.6s ease-out',
    }}>
      {reducedMotion ? (
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
          letterSpacing: '-0.045em',
          color: '#F5F7FA',
          opacity: 0,
          animation: 'loadTextIn 0.8s ease-out 0.3s forwards',
        }}>
          AtmosFlow
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          aria-label="AtmosFlow"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            opacity: 0,
            animation: 'loadCanvasIn 0.6s ease-out 0.1s forwards',
          }}
        />
      )}

      <style>{`
        @keyframes loadTextIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 0.9; transform: translateY(0); }
        }
        @keyframes loadCanvasIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
