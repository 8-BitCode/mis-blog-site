// ══════════════════════════════════════════════════════════════════
// DISPATCHES — client effects
// Vanilla JS ports of the main site's DecryptText, RedactedText, HUD
// crosshair and useEvidenceSFX, plus reading progress, a contents list,
// archive search and the 404 archive lookup.
//
// This file loads once. Because the blog uses Astro's ClientRouter (page
// transitions without full reloads), per-page setup runs on every
// `astro:page-load` and is torn down on `astro:before-swap`.
// ══════════════════════════════════════════════════════════════════

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
const coarse = () => window.matchMedia('(hover: none), (pointer: coarse)').matches
const smallScreen = () => window.matchMedia('(max-width: 52rem)').matches

// ── SFX (Web Audio, zero assets) ───────────────────────────────────
const SFX_KEY = 'mis-blog-sfx'
let audioCtx = null

const sfxOn = () => {
  try {
    const saved = localStorage.getItem(SFX_KEY)
    if (saved) return saved !== 'off'
  } catch {
    /* storage blocked */
  }
  // Touch devices start silent. Creating/resuming an AudioContext costs
  // 100ms+ on a phone and it would land in the same task as a tap that is
  // trying to open a post — which is exactly the lag we're removing.
  return !coarse()
}

function audio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

/** Crisp bandpass burst — folder snap. */
function playSnap() {
  if (!sfxOn()) return
  try {
    const ctx = audio()
    if (!ctx) return
    const size = ctx.sampleRate * 0.035
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1900
    filter.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.035)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start()
  } catch {
    /* blocked or unsupported */
  }
}

/** Low thud — stamp landing, toggles. */
function playThud() {
  if (!sfxOn()) return
  try {
    const ctx = audio()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(140, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  } catch {
    /* blocked or unsupported */
  }
}

/** Only thud on load if the user has already interacted (context is live). */
const playThudIfLive = () => {
  if (audioCtx && audioCtx.state === 'running') playThud()
}

function syncSfxToggles() {
  const on = sfxOn()
  document.querySelectorAll('[data-sfx-toggle]').forEach((btn) => {
    btn.textContent = on ? 'SFX: ON' : 'SFX: OFF'
    btn.setAttribute('aria-pressed', String(on))
  })
}

// ── One-time global listeners (they survive page transitions) ──────
let booted = false

function bootOnce() {
  if (booted) return
  booted = true

  // Click sounds on links/buttons, and the SFX toggle itself.
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest?.('[data-sfx-toggle]')
    if (toggle) {
      try {
        localStorage.setItem(SFX_KEY, sfxOn() ? 'off' : 'on')
      } catch {
        /* storage blocked — toggle just won't persist */
      }
      syncSfxToggles()
      playThud()
      return
    }
    const hit = e.target.closest?.('a[href], button')
    if (!hit) return
    // On touch, a link tap is a navigation: skip the sound entirely rather
    // than block the main thread while the next page is being fetched.
    if (coarse() && hit.tagName === 'A') return
    playSnap()
  })

  // Card spotlight follows the pointer. Pointless on touch, and
  // getBoundingClientRect() on every touchmove forces layout mid-scroll.
  if (!coarse()) {
    document.addEventListener(
      'pointermove',
      (e) => {
        const card = e.target.closest?.('.post-card')
        if (!card) return
        const r = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${e.clientX - r.left}px`)
        card.style.setProperty('--my', `${e.clientY - r.top}px`)
      },
      {passive: true},
    )
  }

  // HUD crosshair that trails the cursor and locks onto links.
  if (finePointer() && !reduced()) {
    let tx = -100
    let ty = -100
    let x = -100
    let y = -100
    let live = false
    const ret = () => document.querySelector('.reticle')

    window.addEventListener(
      'pointermove',
      (e) => {
        tx = e.clientX
        ty = e.clientY
        if (!live) {
          live = true
          x = tx
          y = ty
          ret()?.classList.add('is-live')
        }
      },
      {passive: true},
    )
    document.addEventListener('pointerover', (e) => {
      const lock = !!e.target.closest?.('a[href], button, input, [data-lock]')
      ret()?.classList.toggle('is-locked', lock)
    })
    document.documentElement.addEventListener('mouseleave', () => {
      live = false
      ret()?.classList.remove('is-live')
    })

    const tick = () => {
      x += (tx - x) * 0.22
      y += (ty - y) * 0.22
      const r = ret()
      if (r) r.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  initBackground()
  initLoader()
}

// ── Decrypt text ───────────────────────────────────────────────────
const CHARSET = '!<>-_\\/[]{}—=+*^?#0123456789'

function armDecrypt(el) {
  if (el.dataset.dxArmed) return
  el.dataset.dxArmed = '1'
  const text = el.textContent
  el.dataset.text = text
  // Screen readers get the real text; the animated copy is hidden from them.
  const sr = document.createElement('span')
  sr.className = 'sr-only'
  sr.textContent = text
  el.before(sr)
  el.setAttribute('aria-hidden', 'true')
}

function runDecrypt(el, speed = 28) {
  const text = el.dataset.text
  if (!text) return
  clearInterval(el._dx)
  el.classList.add('dx-on')
  const frames = Math.max(12, Math.min(46, Math.round(text.length * 1.2)))
  const step = text.length / frames
  const chars = text.split('')
  let progress = 0
  el._dx = setInterval(() => {
    el.textContent = chars
      .map((ch, i) => {
        if (ch === ' ') return ' '
        if (i < progress) return ch
        return CHARSET[Math.floor(Math.random() * CHARSET.length)]
      })
      .join('')
    progress += step
    if (progress >= text.length) {
      clearInterval(el._dx)
      el.textContent = text
    }
  }, speed)
}

function initDecrypt(cleanups) {
  const els = [...document.querySelectorAll('[data-decrypt]')]
  if (!els.length) return
  const skip = reduced()

  els.forEach((el) => armDecrypt(el))
  // Any scramble still running when the page swaps would keep ticking against
  // a detached node forever.
  cleanups.push(() => els.forEach((el) => clearInterval(el._dx)))

  // mount: run right away (after optional delay)
  els
    .filter((el) => el.dataset.decrypt === 'mount')
    .forEach((el) => {
      if (skip) return el.classList.add('dx-on')
      const t = setTimeout(() => runDecrypt(el), Number(el.dataset.delay) || 0)
      cleanups.push(() => clearTimeout(t))
    })

  // visible: run when scrolled into view
  const visible = els.filter((el) => el.dataset.decrypt === 'visible')
  if (visible.length) {
    if (skip || !('IntersectionObserver' in window)) {
      visible.forEach((el) => el.classList.add('dx-on'))
    } else {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((en) => {
            if (!en.isIntersecting) return
            io.unobserve(en.target)
            runDecrypt(en.target)
          }),
        {threshold: 0.6},
      )
      visible.forEach((el) => io.observe(el))
      cleanups.push(() => io.disconnect())
    }
  }

  // hover: re-scramble when the pointer/focus enters the host card
  els
    .filter((el) => el.dataset.decrypt === 'hover')
    .forEach((el) => {
      if (skip) return
      const host = el.closest('[data-decrypt-host]') || el
      const go = () => runDecrypt(el, 22)
      host.addEventListener('mouseenter', go)
      host.addEventListener('focusin', go)
    })
}

// ── Redaction bars that lift as content scrolls into view ──────────
function initRedact(cleanups) {
  const els = [...document.querySelectorAll('[data-redact]')]
  if (!els.length) return
  if (reduced() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-open'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries
        .filter((en) => en.isIntersecting)
        .forEach((en, i) => {
          io.unobserve(en.target)
          const t = setTimeout(() => en.target.classList.add('is-open'), 120 + i * 110)
          cleanups.push(() => clearTimeout(t))
        })
    },
    {threshold: 0.25},
  )
  els.forEach((el) => io.observe(el))
  cleanups.push(() => io.disconnect())
}

// ── Clock (Manchester time) ────────────────────────────────────────
function initClock(cleanups) {
  const els = document.querySelectorAll('[data-clock]')
  if (!els.length) return
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const tick = () => els.forEach((el) => (el.textContent = `MCR ${fmt.format(new Date())}`))
  tick()
  const id = setInterval(tick, 1000)
  cleanups.push(() => clearInterval(id))
}

// ── Article: reading progress, contents spy, copy link, stamp thud ─
function initArticle(cleanups) {
  const article = document.querySelector('[data-article]')
  if (!article) return
  const prose = article.querySelector('.prose')
  if (!prose) return

  const root = document.documentElement
  const pcts = document.querySelectorAll('[data-read-pct]')
  let raf = 0
  let maxScroll = 0
  let lastPct = -1

  // scrollHeight is a layout read. Doing it on every scroll frame forces a
  // reflow 60x a second, which is what makes long posts feel sticky on a
  // phone. Measure only when the page can actually have changed height.
  const measure = () => {
    maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
  }

  // Progress runs across the whole page: 0% at the very top, 100% at the very
  // bottom, based on how far the page can actually scroll.
  const update = () => {
    raf = 0
    const y = window.scrollY
    let p = maxScroll > 0 ? y / maxScroll : 1
    if (maxScroll - y <= 2) p = 1 // at the very bottom, always full
    p = Math.min(1, Math.max(0, p))
    root.style.setProperty('--read', p.toFixed(4))
    const pct = Math.round(p * 100)
    if (pct !== lastPct) {
      lastPct = pct
      pcts.forEach((el) => (el.textContent = `${pct}%`))
    }
  }
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update)
  }
  const remeasure = () => {
    measure()
    onScroll()
  }
  remeasure()
  window.addEventListener('scroll', onScroll, {passive: true})
  window.addEventListener('resize', remeasure)

  // Images, fonts and embeds change the page height after load — re-measure.
  let ro
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(remeasure)
    ro.observe(document.body)
  }
  document.fonts?.ready.then(remeasure)

  cleanups.push(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', remeasure)
    ro?.disconnect()
    cancelAnimationFrame(raf)
    root.style.removeProperty('--read')
  })

  // Highlight the contents entry for the section being read.
  const links = [...document.querySelectorAll('[data-toc-link]')]
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
    const heads = [...prose.querySelectorAll('h2[id], h3[id]')]
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return
          links.forEach((a) => a.classList.remove('is-active'))
          byId.get(en.target.id)?.classList.add('is-active')
        })
      },
      {rootMargin: '-15% 0px -75% 0px'},
    )
    heads.forEach((h) => io.observe(h))
    cleanups.push(() => io.disconnect())
  }

  // Copy link
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('[data-copy-label]') || btn
    let t
    btn.addEventListener('click', async () => {
      let ok = false
      try {
        await navigator.clipboard.writeText(location.href)
        ok = true
      } catch {
        /* clipboard blocked */
      }
      label.textContent = ok ? 'LINK COPIED' : 'PRESS CTRL+C TO COPY'
      clearTimeout(t)
      t = setTimeout(() => (label.textContent = 'COPY LINK'), 1800)
    })
  })

  // The stamp lands ~0.9s after load — match it with a thud.
  const thud = setTimeout(playThudIfLive, 950)
  cleanups.push(() => clearTimeout(thud))
}

// ── Archive search (homepage) ──────────────────────────────────────
function initSearch() {
  const input = document.querySelector('[data-search]')
  if (!input) return
  const cards = [...document.querySelectorAll('[data-card]')]
  const count = document.querySelector('[data-search-count]')
  const empty = document.querySelector('[data-search-empty]')
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    let n = 0
    cards.forEach((c) => {
      const hit = !q || c.dataset.search.includes(q)
      c.hidden = !hit
      if (hit) n += 1
    })
    if (count) count.textContent = q ? `${n} MATCH${n === 1 ? '' : 'ES'}` : `${cards.length} FILES`
    if (empty) empty.hidden = n !== 0
  })
}

// ── 404: show the mistyped path and suggest the closest files ──────
const bigrams = (s) => {
  const out = new Map()
  const t = s.replace(/[^a-z0-9]+/g, ' ').trim()
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2)
    out.set(g, (out.get(g) || 0) + 1)
  }
  return out
}
function dice(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  let inter = 0
  let total = 0
  A.forEach((n) => (total += n))
  B.forEach((n) => (total += n))
  A.forEach((n, g) => {
    if (B.has(g)) inter += Math.min(n, B.get(g))
  })
  return total ? (2 * inter) / total : 0
}

function initLost() {
  const term = document.querySelector('[data-terminal]')
  if (!term) return

  let path = location.pathname
  try {
    path = decodeURIComponent(path)
  } catch {
    /* keep raw */
  }
  const shown = path.length > 44 ? `${path.slice(0, 43)}…` : path
  document.querySelectorAll('[data-path]').forEach((el) => (el.textContent = shown))
  document
    .querySelectorAll('[data-path-short]')
    .forEach((el) => (el.textContent = path.replace(/^\/+|\/+$/g, '').slice(0, 24) || 'unknown'))

  const box = document.querySelector('[data-suggest]')
  const raw = document.getElementById('archive-data')
  if (!box || !raw) return
  let posts = []
  try {
    posts = JSON.parse(raw.textContent || '[]')
  } catch {
    return
  }
  const want = path.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!want || !posts.length) return

  const ranked = posts
    .map((p) => ({p, score: Math.max(dice(want, p.slug), dice(want, p.title.toLowerCase()))}))
    .filter((r) => r.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  if (!ranked.length) return

  const list = box.querySelector('[data-suggest-list]')
  const title = box.querySelector('[data-suggest-title]')
  if (!list || !title) return
  title.textContent = 'DID YOU MEAN'
  list.replaceChildren(
    ...ranked.map(({p}) => {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = `/${encodeURIComponent(p.slug)}`
      const b = document.createElement('b')
      b.textContent = `FILE ${p.fileNo}`
      const s = document.createElement('span')
      s.textContent = p.title
      a.append(b, s)
      li.append(a)
      return li
    }),
  )
}

// ── Ambient background: a slow signal network ─────────────────────
// Nodes drift and link up when they pass close to each other. Every few
// seconds a ping hops across the links and lights up the nodes it lands on.
// The whole field parallaxes against scroll and reaches toward the cursor.
// It lives on a persisted <canvas>, so it starts once and survives page swaps.
function initBackground() {
  let canvas = document.querySelector('.bg-net')
  let ctx = canvas?.getContext('2d')
  if (!ctx) return

  const still = reduced() // reduced motion: paint one calm frame, no loop
  const LINK = 160 // max distance for two nodes to connect
  const REACH = 210 // how far the cursor reaches
  const PAD = 60 // nodes wrap just outside the viewport
  const DIM = '138, 154, 147'
  const HOT = '255, 79, 176'

  let w = 0
  let h = 0
  let nodes = []
  const pings = []
  const pointer = {x: -9999, y: -9999}
  let scrolled = window.scrollY
  let nextPing = 1.2
  let last = 0
  let raf = 0
  let paused = false
  let frameGap = 0 // seconds between drawn frames; > 0 caps the framerate

  // Reusable buckets for the link pass (see draw()), so the hot loop does no
  // allocation.
  const LANES = 4
  const lanes = Array.from({length: LANES}, () => [])

  const wrap = (v, m) => ((v % m) + m) % m

  const size = () => {
    const small = smallScreen()
    // A phone at DPR 3 was painting ~9x the pixels of a logical viewport every
    // frame. 1 device pixel per CSS pixel is plenty for 1px lines on a dark
    // field, and the field is redrawn at 32fps instead of 60.
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5)
    frameGap = small ? 1 / 32 : 0
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const seed = () => {
    // Node count drives an O(n²) link pass, so it is the single biggest
    // lever on a phone: fewer nodes, quadratically less work.
    const small = smallScreen()
    const count = small
      ? Math.round(Math.min(30, Math.max(14, (w * h) / 26000)))
      : Math.round(Math.min(80, Math.max(26, (w * h) / 17000)))
    nodes = Array.from({length: count}, () => {
      const a = Math.random() * Math.PI * 2
      const speed = 3 + Math.random() * 7 // px per second
      return {
        u: Math.random(), // position across the wrapping tile, 0..1
        v: Math.random(),
        dx: Math.cos(a) * speed,
        dy: Math.sin(a) * speed,
        depth: 0.12 + Math.random() * 0.4, // parallax against scroll
        r: 0.8 + Math.random() * 1.1,
        flash: 0,
        glow: 0,
        x: 0,
        y: 0,
      }
    })
  }

  const neighbours = (n) =>
    nodes.filter((m) => {
      if (m === n) return false
      const d = Math.hypot(m.x - n.x, m.y - n.y)
      return d < LINK && m.x > -PAD && m.x < w + PAD && m.y > -PAD && m.y < h + PAD
    })

  const launch = (from, hops = 2, avoid = null) => {
    const onScreen = nodes.filter((n) => n.x > 0 && n.x < w && n.y > 0 && n.y < h)
    const a = from || onScreen[Math.floor(Math.random() * onScreen.length)]
    if (!a) return
    const options = neighbours(a).filter((m) => m !== avoid)
    if (!options.length) return
    const b = options[Math.floor(Math.random() * options.length)]
    pings.push({a, b, t: 0, dur: 0.7 + Math.random() * 0.5, hops})
  }

  const lerp = (a, b, t) => a + (b - a) * t

  const draw = (dt) => {
    const spanX = w + PAD * 2
    const spanY = h + PAD * 2
    ctx.clearRect(0, 0, w, h)

    for (const n of nodes) {
      n.u = wrap(n.u + (n.dx * dt) / spanX, 1)
      n.v = wrap(n.v + (n.dy * dt) / spanY, 1)
      n.x = n.u * spanX - PAD
      n.y = wrap(n.v * spanY - scrolled * n.depth, spanY) - PAD
      n.flash = Math.max(0, n.flash - dt * 1.3)
      n.glow = 0
    }

    // Links between nearby nodes. Each link used to be its own
    // strokeStyle + beginPath + stroke() — up to ~3000 draw calls a frame.
    // Opacity is quantised into four bands so the whole field is four paths.
    ctx.lineWidth = 1
    for (let l = 0; l < LANES; l++) lanes[l].length = 0
    const LINK2 = LINK * LINK
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 > LINK2) continue
        const k = 1 - Math.sqrt(d2) / LINK
        const lane = lanes[Math.min(LANES - 1, (k * LANES) | 0)]
        lane.push(a.x, a.y, b.x, b.y)
      }
    }
    for (let l = 0; l < LANES; l++) {
      const seg = lanes[l]
      if (!seg.length) continue
      ctx.strokeStyle = `rgba(${DIM}, ${(((l + 0.5) / LANES) * 0.17).toFixed(3)})`
      ctx.beginPath()
      for (let s = 0; s < seg.length; s += 4) {
        ctx.moveTo(seg[s], seg[s + 1])
        ctx.lineTo(seg[s + 2], seg[s + 3])
      }
      ctx.stroke()
    }

    // The cursor reaches out to nodes near it.
    if (pointer.x > -9000) {
      for (const n of nodes) {
        const d = Math.hypot(n.x - pointer.x, n.y - pointer.y)
        if (d > REACH) continue
        const k = 1 - d / REACH
        n.glow = k
        ctx.strokeStyle = `rgba(${HOT}, ${(k * 0.4).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(pointer.x, pointer.y)
        ctx.lineTo(n.x, n.y)
        ctx.stroke()
      }
    }

    // Pings hop from node to node, sometimes spreading onward.
    if (!still) {
      nextPing -= dt
      if (nextPing <= 0 && pings.length < 3) {
        launch(null, 2)
        nextPing = 1.6 + Math.random() * 2.6
      }
    }
    let i = pings.length
    while (i--) {
      const p = pings[i]
      p.t += dt / p.dur
      if (p.t >= 1) {
        p.b.flash = 1
        if (p.hops > 0 && Math.random() < 0.7) launch(p.b, p.hops - 1, p.a)
        pings.splice(i, 1)
        continue
      }
      const e = p.t * p.t * (3 - 2 * p.t) // smoothstep
      const t0 = Math.max(0, e - 0.16)
      const x = lerp(p.a.x, p.b.x, e)
      const y = lerp(p.a.y, p.b.y, e)
      ctx.strokeStyle = `rgba(${HOT}, 0.6)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(lerp(p.a.x, p.b.x, t0), lerp(p.a.y, p.b.y, t0))
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.fillStyle = `rgba(${HOT}, 0.16)`
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(${HOT}, 0.95)`
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineWidth = 1

    // Nodes on top.
    for (const n of nodes) {
      if (n.x < -4 || n.x > w + 4 || n.y < -4 || n.y > h + 4) continue
      const hot = Math.max(n.glow * 0.9, n.flash)
      ctx.fillStyle = hot > 0.02 ? `rgba(${HOT}, ${(0.35 + hot * 0.65).toFixed(3)})` : `rgba(${DIM}, 0.4)`
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + hot * 1.2, 0, Math.PI * 2)
      ctx.fill()
      if (n.flash > 0.02) {
        ctx.strokeStyle = `rgba(${HOT}, ${(n.flash * 0.55).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r + (1 - n.flash) * 16, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    const elapsed = (now - last) / 1000
    if (frameGap && elapsed < frameGap) return // capped framerate on small screens
    const dt = Math.min(0.05, elapsed || 0)
    last = now
    scrolled += (window.scrollY - scrolled) * Math.min(1, dt * 6) // eased parallax
    draw(dt)
  }

  size()
  seed()

  window.addEventListener(
    'resize',
    () => {
      // Phones fire "resize" whenever the address bar slides in or out.
      // Re-allocating the canvas then wipes it mid-scroll, so ignore small
      // height changes and only rebuild for real size changes.
      if (window.innerWidth === w && Math.abs(window.innerHeight - h) < 120) return
      size()
      if (still) draw(0)
    },
    {passive: true},
  )
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return
      pointer.x = e.clientX
      pointer.y = e.clientY
    },
    {passive: true},
  )
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.x = pointer.y = -9999
  })

  // (Re)start the loop. Safe to call any time.
  const wake = () => {
    paused = false
    if (still) return draw(0)
    cancelAnimationFrame(raf)
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  const sleep = () => {
    paused = true
    cancelAnimationFrame(raf)
    raf = 0
  }

  // Opening a post is the busiest moment on the page: fetch, parse, view
  // transition snapshot, image decode. Give all of that the main thread
  // instead of spending it on ambient animation.
  document.addEventListener('astro:before-preparation', sleep)

  // If a page swap ever replaces the canvas instead of carrying it over,
  // pick up the new one so the background can't go blank.
  const rebind = () => {
    const el = document.querySelector('.bg-net')
    if (!el || el === canvas) return
    const c = el.getContext('2d')
    if (!c) return
    canvas = el
    ctx = c
    size()
    wake()
  }
  document.addEventListener('astro:after-swap', rebind)
  document.addEventListener('astro:page-load', () => {
    rebind()
    // Let the incoming page paint first, then bring the field back.
    if (!still && !document.hidden) requestAnimationFrame(() => setTimeout(wake, 120))
  })
  // Back/forward cache restores freeze rAF loops.
  window.addEventListener('pageshow', () => {
    size()
    wake()
  })

  if (still) {
    draw(0)
    return
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else {
      wake()
    }
  })
  // Watchdog: if the browser stalled the loop (throttling, GPU hiccup), restart it.
  setInterval(() => {
    if (!paused && !document.hidden && performance.now() - last > 1500) wake()
  }, 2000)
  wake()
}

// ── Navigation loader ──────────────────────────────────────────────
// Astro's ClientRouter fetches the next page before it swaps it in. On a phone
// that gap is real, and with nothing on screen the tap feels ignored. The bee
// mark (the favicon) comes up as a scanning stamp, but only if the fetch is
// actually slow — a fast navigation never flashes it.
function initLoader() {
  const el = document.querySelector('[data-nav-loader]')
  if (!el) return
  const SHOW_AFTER = 140 // ms of waiting before it's worth showing anything
  const MIN_VISIBLE = 420 // once shown, hold it so it can't strobe
  let timer = 0
  let shownAt = 0

  const open = (e) => {
    // Ignore same-page hash jumps.
    if (e?.to && e?.from && e.to.pathname === e.from.pathname) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      shownAt = performance.now()
      el.hidden = false
      requestAnimationFrame(() => el.classList.add('is-on'))
    }, SHOW_AFTER)
  }

  const HIDE_MAX_WAIT = 900 // hard cap — a slow image can't trap the user under the overlay

  // The DOM swap is not the point where the page looks ready — the cover
  // image is still a grey box until it decodes. Wait for that (briefly),
  // so the loader hands off straight to a finished-looking page instead of
  // closing early and leaving a pop-in that reads as more lag.
  const waitForHero = () => {
    const img = document.querySelector('.article-cover img, .post-card.is-lead .post-media img')
    if (!img) return Promise.resolve()
    if (img.complete) return Promise.resolve()
    const ready = img.decode ? img.decode().catch(() => {}) : new Promise((res) => img.addEventListener('load', res, {once: true}))
    return Promise.race([ready, new Promise((res) => setTimeout(res, HIDE_MAX_WAIT))])
  }

  const close = () => {
    clearTimeout(timer)
    if (el.hidden) return
    waitForHero().then(() => {
      const held = performance.now() - shownAt
      setTimeout(() => {
        el.classList.remove('is-on')
        setTimeout(() => {
          el.hidden = true
        }, 240)
      }, Math.max(0, MIN_VISIBLE - held))
    })
  }

  document.addEventListener('astro:before-preparation', open)
  document.addEventListener('astro:page-load', close)
  window.addEventListener('pageshow', close)
  // If the network stalls badly, don't trap the user under the overlay.
  window.addEventListener('pagehide', close)
}

// ── Page lifecycle ─────────────────────────────────────────────────
let cleanups = []

function initPage() {
  bootOnce()
  syncSfxToggles()
  initDecrypt(cleanups)
  initRedact(cleanups)
  initClock(cleanups)
  initArticle(cleanups)
  initSearch()
  initLost()
}

document.addEventListener('astro:before-swap', () => {
  cleanups.forEach((fn) => fn())
  cleanups = []
})
document.addEventListener('astro:page-load', initPage)