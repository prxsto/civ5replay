import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {Replay} from '../parser/types'
import type {Fire, TurnState} from '../model/timeline'
import {civColor, rgb} from '../model/civColors'
import {HEX_RADIUS, HEX_W, hexCenter, mapPixelSize, tileAt} from '../map/hexGeometry'
import {renderBase, renderOverlay, type Layers, type Textures} from '../map/renderer'
import {NATURAL_WONDER_NAMES} from '../parser/parseReplay'

interface Props {
	replay: Replay
	state: TurnState
	layers: Layers
	textures: Textures | null
	/** Tiles of the selected event: highlighted, and brought into view */
	highlight: {x: number; y: number}[] | null
	/** Where this turn's action is; in follow mode the camera frames it */
	follow: {x: number; y: number}[] | null
	/** How long a follow-mode camera move should take */
	followMs: number
	/** Places to pulse this turn */
	pulses: Pulse[]
	/** Burning-city markers for this turn */
	fires: Fire[]
}

export interface Pulse {
	x: number
	y: number
	color: string
	/** Name to show if there's no standing city at the tile (e.g. a razed city) */
	label?: string
}

/** How long the action pulses run after a turn change */
const PULSE_MS = 2700
const PULSE_PERIOD = 900
/** Follow mode never zooms in further than this many hexes across the view */
const FOLLOW_MIN_HEXES = 12

/** Don't auto-pan for this long after the user pans or zooms */
const USER_PAUSE_MS = 4000

interface View {
	scale: number
	ox: number
	oy: number
}

interface Hover {
	x: number
	y: number
	sx: number
	sy: number
}

const MIN_SCALE = 0.2
const MAX_SCALE = 4

const pretty = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function HexMap({replay, state, layers, textures, highlight, follow, followMs, pulses, fires}: Props) {
	const wrapRef   = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewRef   = useRef<View>({scale: 1, ox: 0, oy: 0})
	const dragRef   = useRef<{x: number; y: number; ox: number; oy: number; moved: boolean} | null>(null)
	const [hover, setHover] = useState<Hover | null>(null)
	const [following, setFollowing] = useState(true)
	const lastUserMove = useRef(0)
	const animRef = useRef<number | null>(null)
	const pulseStart = useRef(0)
	const pulseAnim = useRef<number | null>(null)
	const [, forceRender] = useState(0)

	const {mapWidth: W, mapHeight: H} = replay.meta
	const size = useMemo(() => mapPixelSize(W, H), [W, H])

	const base = useMemo(
		() => textures ? renderBase(replay, layers, textures) : null,
		[replay, textures, layers.terrain, layers.features, layers.elevation, layers.grid],
	)

	const overlay = useMemo(
		() => renderOverlay(replay, state, layers, fires),
		[replay, state, fires, layers.territory, layers.borders, layers.cities, layers.wonders, layers.fires],
	)

	const draw = useCallback(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')!
		const dpr = window.devicePixelRatio || 1
		const {scale, ox, oy} = viewRef.current

		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy)
		ctx.imageSmoothingQuality = 'high'
		if (base) ctx.drawImage(base, 0, 0)
		ctx.drawImage(overlay, 0, 0)

		// Screen-space pass: crisp text and highlight rings at any zoom
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		const toScreen = (x: number, y: number) => {
			const {cx, cy} = hexCenter(x, y, H)
			return {sx: cx * scale + ox, sy: cy * scale + oy}
		}

		if (highlight) {
			ctx.lineWidth = 3
			ctx.strokeStyle = '#ffe28a'
			ctx.shadowColor = 'rgba(255, 210, 90, 0.9)'
			ctx.shadowBlur = 10
			for (const t of highlight) {
				const {sx, sy} = toScreen(t.x, t.y)
				ctx.beginPath()
				ctx.arc(sx, sy, HEX_RADIUS * scale * 0.95, 0, Math.PI * 2)
				ctx.stroke()
			}
			ctx.shadowBlur = 0
		}

		// Action pulses: expanding rings where something happened this turn
		const elapsed = performance.now() - pulseStart.current
		const pulsing = pulses.length > 0 && elapsed < PULSE_MS
		const pulseAt = new Map<string, Pulse>()
		if (pulsing) {
			const fade = Math.min(1, (PULSE_MS - elapsed) / 600)
			for (const p of pulses) {
				pulseAt.set(`${p.x},${p.y}`, p)
				const {sx, sy} = toScreen(p.x, p.y)
				const base = HEX_RADIUS * scale
				for (const offset of [0, 0.5]) {
					const phase = ((elapsed / PULSE_PERIOD) + offset) % 1
					ctx.beginPath()
					ctx.arc(sx, sy, base * (0.55 + phase * 2.1), 0, Math.PI * 2)
					ctx.strokeStyle = p.color
					ctx.globalAlpha = (1 - phase) * 0.85 * fade
					ctx.lineWidth = 2.5 + (1 - phase) * 2
					ctx.stroke()
				}
				ctx.globalAlpha = 1
			}
		}

		// City names (always shown for pulsing cities, even when zoomed out)
		if (layers.cities) {
			const fontSize = Math.max(10, Math.min(15, 11 * scale))
			const showAll = scale >= 0.45
			ctx.textAlign = 'center'
			ctx.textBaseline = 'top'

			const labels: {x: number; y: number; name: string; owner: number | null}[] = []
			for (const city of state.cities) {
				if (showAll || pulseAt.has(`${city.x},${city.y}`)) labels.push({x: city.x, y: city.y, name: city.name, owner: city.owner})
			}
			// Razed cities have no standing city, but still get a pulsing label
			for (const p of pulseAt.values()) {
				if (p.label && !state.cities.some(c => c.x === p.x && c.y === p.y)) labels.push({x: p.x, y: p.y, name: p.label, owner: null})
			}

			for (const l of labels) {
				const pulse = pulseAt.get(`${l.x},${l.y}`)
				const {sx, sy} = toScreen(l.x, l.y)
				const civ = l.owner !== null ? replay.civs[l.owner] : undefined
				const color = civColor(civ?.name, civ?.isCityState)
				// Pulsing labels swell and glow in the event colour
				const bump = pulse ? 1 + 0.18 * Math.max(0, Math.sin((elapsed / PULSE_PERIOD) * Math.PI * 2)) * Math.min(1, (PULSE_MS - elapsed) / 600) : 1
				const fs = (pulse ? Math.max(fontSize, 13) : fontSize) * bump
				ctx.font = `${pulse ? 700 : 600} ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`
				const ty = sy + HEX_RADIUS * scale * 0.6
				const tw = ctx.measureText(l.name).width
				const bx = sx - tw / 2 - 5
				const bh = fs + 5
				if (pulse) {
					ctx.shadowColor = pulse.color
					ctx.shadowBlur = 14
				}
				ctx.fillStyle = 'rgba(10, 14, 20, 0.85)'
				ctx.beginPath()
				ctx.roundRect(bx, ty - 2, tw + 10, bh, 4)
				ctx.fill()
				ctx.shadowBlur = 0
				if (pulse) {
					ctx.lineWidth = 1.5
					ctx.strokeStyle = pulse.color
					ctx.stroke()
				}
				ctx.fillStyle = l.owner !== null ? rgb(color.territory) : '#888'
				ctx.fillRect(bx, ty - 2, 3, bh)
				ctx.fillStyle = l.owner === null ? '#bbb' : '#f2ead3'
				ctx.fillText(l.name, sx + 1, ty + 1)
			}
		}
	}, [base, overlay, highlight, pulses, layers.cities, state, replay, H])

	const fit = useCallback(() => {
		const wrap = wrapRef.current
		if (!wrap) return
		const pad = 24
		const scale = Math.min((wrap.clientWidth - pad * 2) / size.w, (wrap.clientHeight - pad * 2) / size.h)
		viewRef.current = {
			scale,
			ox: (wrap.clientWidth - size.w * scale) / 2,
			oy: (wrap.clientHeight - size.h * scale) / 2,
		}
		draw()
	}, [size, draw])

	// Keep the canvas sized to its container
	useEffect(() => {
		const wrap = wrapRef.current
		const canvas = canvasRef.current
		if (!wrap || !canvas) return
		const resize = () => {
			const dpr = window.devicePixelRatio || 1
			canvas.width  = wrap.clientWidth * dpr
			canvas.height = wrap.clientHeight * dpr
			canvas.style.width  = `${wrap.clientWidth}px`
			canvas.style.height = `${wrap.clientHeight}px`
			draw()
		}
		const ro = new ResizeObserver(resize)
		ro.observe(wrap)
		resize()
		return () => ro.disconnect()
	}, [draw])

	// Fit whenever a new replay is loaded
	useEffect(() => fit(), [replay])

	useEffect(() => draw(), [draw])

	// Latest draw() for effects that shouldn't re-run on every turn change
	const drawRef = useRef(draw)
	drawRef.current = draw

	const stopAnimation = () => {
		if (animRef.current !== null) cancelAnimationFrame(animRef.current)
		animRef.current = null
	}

	/** Keep the map covering the viewport when it's bigger than it */
	const clampView = useCallback((v: View): View => {
		const wrap = wrapRef.current
		if (!wrap) return v
		const w = size.w * v.scale
		const h = size.h * v.scale
		const slack = 40
		const ox = w + slack * 2 <= wrap.clientWidth
			? v.ox
			: Math.min(slack, Math.max(wrap.clientWidth - w - slack, v.ox))
		const oy = h + slack * 2 <= wrap.clientHeight
			? v.oy
			: Math.min(slack, Math.max(wrap.clientHeight - h - slack, v.oy))
		return {...v, ox, oy}
	}, [size])

	/**
	 * Ease the camera to a new view: zoom interpolates geometrically and the
	 * point at the centre of the screen travels in a straight line, which reads
	 * as one smooth camera move.
	 */
	const animateView = useCallback((target: View, ms = 900) => {
		const wrap = wrapRef.current
		if (!wrap) return
		stopAnimation()
		const from = viewRef.current
		const to = clampView(target)
		const w = wrap.clientWidth / 2
		const h = wrap.clientHeight / 2
		// Base-pixel point at the centre of the screen
		const c0 = {x: (w - from.ox) / from.scale, y: (h - from.oy) / from.scale}
		const c1 = {x: (w - to.ox) / to.scale, y: (h - to.oy) / to.scale}
		const start = performance.now()
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / ms)
			const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2 // ease-in-out
			const scale = from.scale * (to.scale / from.scale) ** k
			const cx = c0.x + (c1.x - c0.x) * k
			const cy = c0.y + (c1.y - c0.y) * k
			viewRef.current = {scale, ox: w - cx * scale, oy: h - cy * scale}
			drawRef.current()
			animRef.current = t < 1 ? requestAnimationFrame(step) : null
		}
		animRef.current = requestAnimationFrame(step)
	}, [clampView])

	const panTo = useCallback((ox: number, oy: number, ms = 600) => {
		animateView({...viewRef.current, ox, oy}, ms)
	}, [animateView])

	const centroid = (tiles: {x: number; y: number}[]) => {
		let x = 0
		let y = 0
		for (const t of tiles) {
			const c = hexCenter(t.x, t.y, H)
			x += c.cx
			y += c.cy
		}
		return {cx: x / tiles.length, cy: y / tiles.length}
	}

	// Bring a newly selected event into view (only when the selection changes)
	useEffect(() => {
		const wrap = wrapRef.current
		if (!highlight?.length || !wrap) return
		lastUserMove.current = performance.now() // don't let follow mode drag it away
		const v = viewRef.current
		const visible = highlight.every(t => {
			const {cx, cy} = hexCenter(t.x, t.y, H)
			const sx = cx * v.scale + v.ox
			const sy = cy * v.scale + v.oy
			return sx > 60 && sy > 60 && sx < wrap.clientWidth - 60 && sy < wrap.clientHeight - 60
		})
		if (visible) return
		const {cx, cy} = centroid(highlight)
		panTo(wrap.clientWidth / 2 - cx * v.scale, wrap.clientHeight / 2 - cy * v.scale)
	}, [highlight])

	// Follow mode: frame this turn's events (all of them together) with a smooth zoom + pan
	useEffect(() => {
		const wrap = wrapRef.current
		if (!following || !follow?.length || !wrap) return
		if (performance.now() - lastUserMove.current < USER_PAUSE_MS) return

		const w = wrap.clientWidth
		const h = wrap.clientHeight
		const v = viewRef.current

		// Bounding box of the events, padded by a couple of hexes
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		for (const t of follow) {
			const {cx, cy} = hexCenter(t.x, t.y, H)
			minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
			minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
		}
		const pad = HEX_W * 3
		const bw = maxX - minX + pad * 2
		const bh = maxY - minY + pad * 2

		const fitScale = Math.min(w / size.w, h / size.h)
		const maxScale = Math.min(MAX_SCALE, w / (FOLLOW_MIN_HEXES * HEX_W))
		const scale = Math.max(fitScale, Math.min(maxScale, Math.min(w / bw, h / bh)))
		const cx = (minX + maxX) / 2
		const cy = (minY + maxY) / 2

		// Skip tiny adjustments so the camera doesn't fidget
		const sx = cx * v.scale + v.ox
		const sy = cy * v.scale + v.oy
		const inView = minX * v.scale + v.ox > w * 0.08 && maxX * v.scale + v.ox < w * 0.92 &&
			minY * v.scale + v.oy > h * 0.1 && maxY * v.scale + v.oy < h * 0.9
		const zoomRatio = scale / v.scale
		if (inView && zoomRatio > 0.75 && zoomRatio < 1.35 && Math.hypot(sx - w / 2, sy - h / 2) < Math.min(w, h) * 0.2) return

		animateView({scale, ox: w / 2 - cx * scale, oy: h / 2 - cy * scale}, followMs)
	}, [follow, following])

	// Run the pulse animation for a few seconds after each turn change
	useEffect(() => {
		pulseStart.current = performance.now()
		if (pulseAnim.current !== null) cancelAnimationFrame(pulseAnim.current)
		if (!pulses.length) {
			drawRef.current()
			return
		}
		const tick = () => {
			drawRef.current()
			pulseAnim.current = performance.now() - pulseStart.current < PULSE_MS ? requestAnimationFrame(tick) : null
		}
		pulseAnim.current = requestAnimationFrame(tick)
		return () => {
			if (pulseAnim.current !== null) cancelAnimationFrame(pulseAnim.current)
		}
	}, [pulses])

	useEffect(() => stopAnimation, [])

	const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
		stopAnimation()
		lastUserMove.current = performance.now()
		const v = viewRef.current
		const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
		const k = scale / v.scale
		viewRef.current = {scale, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k}
		draw()
		forceRender(n => n + 1)
	}, [draw])

	// Wheel zoom (non-passive so we can preventDefault page scroll)
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const rect = canvas.getBoundingClientRect()
			zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
		}
		canvas.addEventListener('wheel', onWheel, {passive: false})
		return () => canvas.removeEventListener('wheel', onWheel)
	}, [zoomAt])

	// Keyboard zoom: + / -
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
			const wrap = wrapRef.current
			if (!wrap) return
			if (e.key === '+' || e.key === '=') zoomAt(1.25, wrap.clientWidth / 2, wrap.clientHeight / 2)
			else if (e.key === '-' || e.key === '_') zoomAt(0.8, wrap.clientWidth / 2, wrap.clientHeight / 2)
			else if (e.key === '0') fit()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [zoomAt, fit])

	const onPointerDown = (e: React.PointerEvent) => {
		;(e.target as Element).setPointerCapture(e.pointerId)
		const v = viewRef.current
		stopAnimation()
		dragRef.current = {x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy, moved: false}
	}

	const onPointerMove = (e: React.PointerEvent) => {
		const rect = canvasRef.current!.getBoundingClientRect()
		const sx = e.clientX - rect.left
		const sy = e.clientY - rect.top
		const drag = dragRef.current

		if (drag) {
			const dx = e.clientX - drag.x
			const dy = e.clientY - drag.y
			if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
			lastUserMove.current = performance.now()
			viewRef.current = {...viewRef.current, ox: drag.ox + dx, oy: drag.oy + dy}
			draw()
			setHover(null)
			return
		}

		const v = viewRef.current
		const t = tileAt((sx - v.ox) / v.scale, (sy - v.oy) / v.scale, W, H)
		setHover(t ? {x: t[0], y: t[1], sx, sy} : null)
	}

	const onPointerUp = () => {
		dragRef.current = null
	}

	const hoverInfo = hover ? describeTile(replay, state, hover.x, hover.y) : null

	return (
		<div className="map" ref={wrapRef}>
			<canvas
				ref={canvasRef}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={() => setHover(null)}
				onDoubleClick={e => {
					const rect = canvasRef.current!.getBoundingClientRect()
					zoomAt(e.shiftKey ? 0.6 : 1.6, e.clientX - rect.left, e.clientY - rect.top)
				}}
			/>

			<div className="map-zoom">
				<button onClick={() => zoomAt(1.25, wrapRef.current!.clientWidth / 2, wrapRef.current!.clientHeight / 2)} data-tip="Zoom in · +" data-tip-side="left" aria-label="Zoom in">+</button>
				<button onClick={() => zoomAt(0.8, wrapRef.current!.clientWidth / 2, wrapRef.current!.clientHeight / 2)} data-tip="Zoom out · −" data-tip-side="left" aria-label="Zoom out">−</button>
				<button onClick={fit} data-tip="Fit the whole map · 0" data-tip-side="left" aria-label="Fit map">⤢</button>
				<button
					className={following ? 'on' : ''}
					onClick={() => setFollowing(f => !f)}
					aria-pressed={following}
					data-tip={following ? 'Follow the action: on. The camera zooms and pans to frame each turn\'s events.' : 'Follow the action: off'}
					data-tip-side="left"
					aria-label="Follow the action"
				>◎</button>
			</div>

			{hover && hoverInfo && (
				<div className="map-tooltip" style={{left: hover.sx + 14, top: hover.sy + 14}}>
					{hoverInfo.wonder && <div className="tt-wonder">★ {hoverInfo.wonder}</div>}
					{hoverInfo.city && <div className="tt-city">{hoverInfo.city}</div>}
					{hoverInfo.owner && <div className="tt-owner">{hoverInfo.owner}</div>}
					<div className="tt-terrain">{hoverInfo.terrain}</div>
					<div className="tt-coords">({hover.x}, {hover.y})</div>
				</div>
			)}
		</div>
	)
}

function describeTile(replay: Replay, state: TurnState, x: number, y: number) {
	const tile = replay.tiles[y]?.[x]
	if (!tile) return null
	const owner = state.owners[tile.index]
	const city  = state.cities.find(c => c.x === x && c.y === y)

	const terrainParts = [
		tile.elevation === 'MOUNTAIN' ? 'Mountain' : tile.elevation === 'HILLS' ? 'Hills' : null,
		tile.terrain === 'MOUNTAIN' || tile.terrain === 'HILL' ? null : pretty(tile.terrain),
		tile.feature && !tile.naturalWonder ? pretty(tile.feature) : null,
	].filter(Boolean)

	return {
		wonder: tile.naturalWonder && tile.feature ? (NATURAL_WONDER_NAMES[tile.feature] ?? `${pretty(tile.feature)} (natural wonder)`) : null,
		city: city?.name,
		owner: owner >= 0 ? replay.civs[owner]?.name : null,
		terrain: terrainParts.join(' · '),
	}
}
