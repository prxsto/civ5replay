import type {Replay, Tile} from '../parser/types'
import type {TurnState} from '../model/timeline'
import {civColor, rgb, rgba} from '../model/civColors'
import {HEX_RADIUS, HEX_W, hexCenter, hexPath, hexVertex, mapPixelSize, neighbor} from './hexGeometry'

export interface Layers {
	terrain: boolean
	features: boolean
	elevation: boolean
	wonders: boolean
	territory: boolean
	borders: boolean
	cities: boolean
	cityNames: boolean
	grid: boolean
}

export const DEFAULT_LAYERS: Layers = {
	terrain: true,
	features: true,
	elevation: true,
	wonders: true,
	territory: true,
	borders: true,
	cities: true,
	cityNames: true,
	grid: false,
}

export type Textures = Record<string, HTMLImageElement>

const TEXTURE_NAMES = ['GRASSLAND', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW', 'COAST', 'OCEAN', 'MOUNTAIN', 'HILLS', 'ICE', 'JUNGLE', 'FOREST']

export function loadTextures(): Promise<Textures> {
	const base = import.meta.env.BASE_URL
	return Promise.all(TEXTURE_NAMES.map(name => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
		const img = new Image()
		img.onload  = () => resolve([name, img])
		img.onerror = () => reject(new Error(`Failed to load texture ${name}`))
		img.src = `${base}tiles/${name}.png`
	}))).then(Object.fromEntries)
}

const FALLBACK_TERRAIN: Record<string, string> = {
	GRASSLAND: '#6f8a3a', PLAINS: '#8e8650', DESERT: '#c9bf8a', TUNDRA: '#777068', SNOW: '#eef4f7',
	COAST: '#4f8e93', OCEAN: '#2f4d63', MOUNTAIN: '#8e8650', HILL: '#8e8650', UNKNOWN: '#555',
}

const isWater = (t: Tile) => t.terrain === 'COAST' || t.terrain === 'OCEAN'

function makeCanvas(w: number, h: number) {
	const canvas = document.createElement('canvas')
	canvas.width  = Math.ceil(w)
	canvas.height = Math.ceil(h)
	return canvas
}

function drawTexture(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, cx: number, cy: number) {
	if (!img) return false
	ctx.drawImage(img, cx - HEX_W / 2, cy - HEX_RADIUS, HEX_W, HEX_RADIUS * 2)
	return true
}

/** Terrain, features, elevation, grid: everything that doesn't change between turns. */
export function renderBase(replay: Replay, layers: Layers, textures: Textures): HTMLCanvasElement {
	const {mapWidth: W, mapHeight: H} = replay.meta
	const size   = mapPixelSize(W, H)
	const canvas = makeCanvas(size.w, size.h)
	const ctx    = canvas.getContext('2d')!

	for (const row of replay.tiles) {
		for (const tile of row) {
			const {cx, cy} = hexCenter(tile.x, tile.y, H)
			ctx.save()
			hexPath(ctx, cx, cy, HEX_RADIUS + 0.5) // slight overdraw hides seams
			ctx.clip()

			if (layers.terrain) {
				// Mountain/hill terrain types (Vox Populi) get a plains base under the elevation art
				const base = tile.terrain === 'MOUNTAIN' || tile.terrain === 'HILL' ? 'PLAINS' : tile.terrain
				if (!drawTexture(ctx, textures[base], cx, cy)) {
					ctx.fillStyle = FALLBACK_TERRAIN[tile.terrain]
					ctx.fill()
				}
			}
			else {
				ctx.fillStyle = isWater(tile) ? '#1d2a36' : '#3a3f44'
				ctx.fill()
			}

			if (layers.features && tile.feature && !tile.naturalWonder) drawFeature(ctx, tile.feature, textures, cx, cy)

			if (layers.elevation) {
				if (tile.elevation === 'MOUNTAIN') drawTexture(ctx, textures.MOUNTAIN, cx, cy)
				else if (tile.elevation === 'HILLS') drawTexture(ctx, textures.HILLS, cx, cy)
			}

			ctx.restore()
		}
	}

	if (layers.grid) {
		ctx.strokeStyle = 'rgba(255,255,255,0.12)'
		ctx.lineWidth = 1
		for (const row of replay.tiles) {
			for (const tile of row) {
				const {cx, cy} = hexCenter(tile.x, tile.y, H)
				hexPath(ctx, cx, cy)
				ctx.stroke()
			}
		}
	}

	return canvas
}

function drawFeature(ctx: CanvasRenderingContext2D, feature: string, textures: Textures, cx: number, cy: number) {
	if (textures[feature]) {
		drawTexture(ctx, textures[feature], cx, cy)
		return
	}

	// No artwork for these yet - simple procedural marks
	const r = HEX_RADIUS
	switch (feature) {
		case 'MARSH':
			ctx.strokeStyle = 'rgba(60,110,90,0.9)'
			ctx.lineWidth = 1.5
			for (const [dx, dy] of [[-0.45, -0.2], [0.1, -0.35], [-0.15, 0.25], [0.4, 0.15]]) {
				ctx.beginPath()
				ctx.moveTo(cx + dx * r - 4, cy + dy * r)
				ctx.lineTo(cx + dx * r + 4, cy + dy * r)
				ctx.stroke()
			}
			break
		case 'OASIS':
			ctx.fillStyle = '#3a8fb0'
			ctx.beginPath()
			ctx.ellipse(cx, cy + 2, r * 0.35, r * 0.22, 0, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = '#4c8a2e'
			ctx.beginPath()
			ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.14, 0, Math.PI * 2)
			ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.12, 0, Math.PI * 2)
			ctx.fill()
			break
		case 'FLOOD_PLAINS':
			ctx.fillStyle = 'rgba(120,170,70,0.45)'
			ctx.fillRect(cx - HEX_W / 2, cy - r, HEX_W, r * 2)
			break
		case 'FALLOUT':
			ctx.fillStyle = 'rgba(170,190,40,0.45)'
			ctx.fillRect(cx - HEX_W / 2, cy - r, HEX_W, r * 2)
			ctx.strokeStyle = 'rgba(60,60,0,0.6)'
			ctx.lineWidth = 1
			for (let i = -2; i <= 2; i++) {
				ctx.beginPath()
				ctx.moveTo(cx + i * 6 - r, cy + r)
				ctx.lineTo(cx + i * 6 + r, cy - r)
				ctx.stroke()
			}
			break
	}
}

/** Per-turn layers: territory, borders, cities, wonders. Labels are drawn in screen space by the map component. */
export function renderOverlay(replay: Replay, state: TurnState, layers: Layers): HTMLCanvasElement {
	const {mapWidth: W, mapHeight: H} = replay.meta
	const size   = mapPixelSize(W, H)
	const canvas = makeCanvas(size.w, size.h)
	const ctx    = canvas.getContext('2d')!
	const {owners} = state
	const ownerAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : owners[y * W + x]
	const colorOf = (civId: number) => {
		const civ = replay.civs[civId]
		return civColor(civ?.name, civ?.isCityState)
	}

	if (layers.territory) {
		for (const row of replay.tiles) {
			for (const tile of row) {
				const owner = owners[tile.index]
				if (owner < 0) continue
				const {cx, cy} = hexCenter(tile.x, tile.y, H)
				hexPath(ctx, cx, cy, HEX_RADIUS + 0.5)
				ctx.fillStyle = rgba(colorOf(owner).territory, isWater(tile) ? 0.3 : 0.6)
				ctx.fill()
			}
		}
	}

	if (layers.borders) {
		ctx.lineCap = 'round'
		for (const row of replay.tiles) {
			for (const tile of row) {
				const owner = owners[tile.index]
				if (owner < 0) continue
				const {cx, cy} = hexCenter(tile.x, tile.y, H)
				const color = colorOf(owner)

				for (let edge = 0; edge < 6; edge++) {
					const [nx, ny] = neighbor(tile.x, tile.y, edge)
					if (ownerAt(nx, ny) === owner) continue
					// Inset slightly so neighbouring civs' borders sit side by side
					const a = hexVertex(cx, cy, edge, HEX_RADIUS - 2)
					const b = hexVertex(cx, cy, (edge + 1) % 6, HEX_RADIUS - 2)
					ctx.beginPath()
					ctx.moveTo(a.x, a.y)
					ctx.lineTo(b.x, b.y)
					ctx.strokeStyle = 'rgba(0,0,0,0.45)'
					ctx.lineWidth = 4.5
					ctx.stroke()
					ctx.strokeStyle = rgb(color.territory)
					ctx.lineWidth = 2.5
					ctx.stroke()
				}
			}
		}
	}

	if (layers.wonders) {
		for (const row of replay.tiles) {
			for (const tile of row) {
				if (!tile.naturalWonder) continue
				const {cx, cy} = hexCenter(tile.x, tile.y, H)
				drawStar(ctx, cx, cy, HEX_RADIUS * 0.5)
			}
		}
	}

	if (layers.cities) {
		for (const city of state.cities) {
			const {cx, cy} = hexCenter(city.x, city.y, H)
			const color = colorOf(city.owner)
			ctx.beginPath()
			ctx.arc(cx, cy, HEX_RADIUS * 0.5, 0, Math.PI * 2)
			ctx.fillStyle = rgb(color.territory)
			ctx.fill()
			ctx.lineWidth = 2.5
			ctx.strokeStyle = rgb(color.city)
			ctx.stroke()
			ctx.lineWidth = 1
			ctx.strokeStyle = 'rgba(0,0,0,0.6)'
			ctx.beginPath()
			ctx.arc(cx, cy, HEX_RADIUS * 0.5 + 1.75, 0, Math.PI * 2)
			ctx.stroke()
		}
	}

	return canvas
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
	ctx.beginPath()
	for (let i = 0; i < 10; i++) {
		const radius = i % 2 ? r * 0.45 : r
		const angle  = -Math.PI / 2 + (i * Math.PI) / 5
		const x = cx + radius * Math.cos(angle)
		const y = cy + radius * Math.sin(angle)
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}
	ctx.closePath()
	ctx.fillStyle = '#f3c74c'
	ctx.fill()
	ctx.strokeStyle = 'rgba(60,40,0,0.85)'
	ctx.lineWidth = 1.25
	ctx.stroke()
}
