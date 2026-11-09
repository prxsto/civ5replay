import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {Replay} from '../parser/types'
import type {TurnState} from '../model/timeline'
import {civColor, rgb} from '../model/civColors'
import {HEX_RADIUS, hexCenter, mapPixelSize, tileAt} from '../map/hexGeometry'
import {renderBase, renderOverlay, type Layers, type Textures} from '../map/renderer'

interface Props {
	replay: Replay
	state: TurnState
	layers: Layers
	textures: Textures | null
	highlight: {x: number; y: number}[] | null
}

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

export function HexMap({replay, state, layers, textures, highlight}: Props) {
	const wrapRef   = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const viewRef   = useRef<View>({scale: 1, ox: 0, oy: 0})
	const dragRef   = useRef<{x: number; y: number; ox: number; oy: number; moved: boolean} | null>(null)
	const [hover, setHover] = useState<Hover | null>(null)
	const [, forceRender] = useState(0)

	const {mapWidth: W, mapHeight: H} = replay.meta
	const size = useMemo(() => mapPixelSize(W, H), [W, H])

	const base = useMemo(
		() => textures ? renderBase(replay, layers, textures) : null,
		[replay, textures, layers.terrain, layers.features, layers.elevation, layers.grid],
	)

	const overlay = useMemo(
		() => renderOverlay(replay, state, layers),
		[replay, state, layers.territory, layers.borders, layers.cities, layers.wonders],
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

		if (layers.cityNames && scale >= 0.45) {
			const fontSize = Math.max(10, Math.min(15, 11 * scale))
			ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
			ctx.textAlign = 'center'
			ctx.textBaseline = 'top'
			for (const city of state.cities) {
				const {sx, sy} = toScreen(city.x, city.y)
				const civ = replay.civs[city.owner]
				const color = civColor(civ?.name, civ?.isCityState)
				const label = city.name
				const ty = sy + HEX_RADIUS * scale * 0.6
				const tw = ctx.measureText(label).width
				ctx.fillStyle = 'rgba(10, 14, 20, 0.78)'
				ctx.beginPath()
				ctx.roundRect(sx - tw / 2 - 5, ty - 2, tw + 10, fontSize + 5, 4)
				ctx.fill()
				ctx.fillStyle = rgb(color.territory)
				ctx.fillRect(sx - tw / 2 - 5, ty - 2, 3, fontSize + 5)
				ctx.fillStyle = '#f2ead3'
				ctx.fillText(label, sx + 1, ty + 1)
			}
		}
	}, [base, overlay, highlight, layers.cityNames, state, replay, H])

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

	// Bring a newly highlighted event into view if it's off-screen
	useEffect(() => {
		const wrap = wrapRef.current
		if (!highlight?.length || !wrap) return
		const v = viewRef.current
		const {cx, cy} = hexCenter(highlight[0].x, highlight[0].y, H)
		const sx = cx * v.scale + v.ox
		const sy = cy * v.scale + v.oy
		const margin = 60
		if (sx < margin || sy < margin || sx > wrap.clientWidth - margin || sy > wrap.clientHeight - margin) {
			viewRef.current = {...v, ox: wrap.clientWidth / 2 - cx * v.scale, oy: wrap.clientHeight / 2 - cy * v.scale}
			draw()
		}
	}, [highlight, H, draw])

	const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
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
			</div>

			{hover && hoverInfo && (
				<div className="map-tooltip" style={{left: hover.sx + 14, top: hover.sy + 14}}>
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
		tile.feature ? (tile.naturalWonder ? `★ ${pretty(tile.feature)}` : pretty(tile.feature)) : null,
	].filter(Boolean)

	return {
		city: city?.name,
		owner: owner >= 0 ? replay.civs[owner]?.name : null,
		terrain: terrainParts.join(' · '),
	}
}
