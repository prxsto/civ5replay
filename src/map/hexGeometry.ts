/*
 * Pointy-top hexes in "odd-r" offset layout. Civ V stores row 0 as the southern
 * edge, so file row y is drawn at screen row (height - 1 - y), and rows with an
 * odd file y are shifted half a hex to the right.
 */

export const HEX_RADIUS = 18 // center-to-vertex, in base (unzoomed) pixels
export const HEX_W = Math.sqrt(3) * HEX_RADIUS
export const HEX_ROW = 1.5 * HEX_RADIUS

export function mapPixelSize(width: number, height: number) {
	return {
		w: width * HEX_W + HEX_W / 2,
		h: (height - 1) * HEX_ROW + 2 * HEX_RADIUS,
	}
}

export function hexCenter(x: number, y: number, height: number) {
	const row = height - 1 - y
	return {
		cx: x * HEX_W + HEX_W / 2 + (y % 2 ? HEX_W / 2 : 0),
		cy: row * HEX_ROW + HEX_RADIUS,
	}
}

/** Vertex k (0..5) of a hex, starting lower-right and going clockwise on screen. */
export function hexVertex(cx: number, cy: number, k: number, r = HEX_RADIUS) {
	const angle = (Math.PI / 180) * (30 + 60 * k)
	return {x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle)}
}

export function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r = HEX_RADIUS) {
	ctx.beginPath()
	for (let k = 0; k < 6; k++) {
		const v = hexVertex(cx, cy, k, r)
		if (k === 0) ctx.moveTo(v.x, v.y)
		else ctx.lineTo(v.x, v.y)
	}
	ctx.closePath()
}

/**
 * Neighbor across edge k (between vertex k and k+1):
 * 0 lower-right, 1 lower-left, 2 left, 3 upper-left, 4 upper-right, 5 right.
 * "Lower" on screen is file y - 1.
 */
export function neighbor(x: number, y: number, edge: number): [number, number] {
	const odd = y % 2 === 1
	switch (edge) {
		case 0: return [odd ? x + 1 : x, y - 1]
		case 1: return [odd ? x : x - 1, y - 1]
		case 2: return [x - 1, y]
		case 3: return [odd ? x : x - 1, y + 1]
		case 4: return [odd ? x + 1 : x, y + 1]
		default: return [x + 1, y]
	}
}

/** Which tile is under base-pixel point (px, py)? Picks the nearest center. */
export function tileAt(px: number, py: number, width: number, height: number): [number, number] | null {
	const approxRow = Math.round((py - HEX_RADIUS) / HEX_ROW)
	let best: [number, number] | null = null
	let bestDist = Infinity

	for (let row = approxRow - 1; row <= approxRow + 1; row++) {
		const y = height - 1 - row
		if (y < 0 || y >= height) continue
		const shift = y % 2 ? HEX_W / 2 : 0
		const approxX = Math.round((px - HEX_W / 2 - shift) / HEX_W)
		for (let x = approxX - 1; x <= approxX + 1; x++) {
			if (x < 0 || x >= width) continue
			const {cx, cy} = hexCenter(x, y, height)
			const d = (cx - px) ** 2 + (cy - py) ** 2
			if (d < bestDist) {
				bestDist = d
				best = [x, y]
			}
		}
	}

	return bestDist <= HEX_RADIUS ** 2 ? best : null
}
