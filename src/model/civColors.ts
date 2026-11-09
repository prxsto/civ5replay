export type RGB = [number, number, number]

export interface CivColor {
	/** Inner/icon color (cities, labels) */
	city: RGB
	/** Main color (territory fill, borders) */
	territory: RGB
}

/** Replay files don't include player colors, so major civs use the in-game palette. */
const CIV_COLORS: Record<string, CivColor> = {
	'America': {city: [255, 255, 255], territory: [31, 51, 120]},
	'Arabia': {city: [146, 221, 9], territory: [43, 87, 45]},
	'Assyria': {city: [255, 168, 12], territory: [255, 243, 173]},
	'Austria': {city: [255, 255, 255], territory: [234, 0, 0]},
	'Babylon': {city: [200, 248, 255], territory: [43, 81, 97]},
	'Brazil': {city: [41, 83, 44], territory: [149, 221, 10]},
	'Byzantium': {city: [60, 0, 108], territory: [113, 161, 232]},
	'Carthage': {city: [80, 0, 136], territory: [204, 204, 204]},
	'China': {city: [255, 255, 255], territory: [0, 148, 82]},
	'Denmark': {city: [239, 231, 179], territory: [108, 42, 20]},
	'Egypt': {city: [82, 0, 208], territory: [255, 251, 3]},
	'England': {city: [255, 255, 255], territory: [108, 2, 0]},
	'Ethiopia': {city: [255, 45, 45], territory: [1, 39, 14]},
	'France': {city: [235, 235, 138], territory: [65, 141, 253]},
	'Germany': {city: [36, 43, 32], territory: [179, 177, 184]},
	'Greece': {city: [65, 141, 253], territory: [255, 255, 255]},
	'India': {city: [255, 153, 49], territory: [18, 135, 6]},
	'Indonesia': {city: [158, 46, 28], territory: [110, 210, 217]},
	'Japan': {city: [184, 0, 0], territory: [255, 255, 255]},
	'Korea': {city: [255, 0, 0], territory: [26, 32, 96]},
	'Mongolia': {city: [255, 120, 0], territory: [81, 0, 8]},
	'Morocco': {city: [39, 178, 79], territory: [144, 2, 0]},
	'Persia': {city: [245, 230, 55], territory: [176, 7, 3]},
	'Poland': {city: [56, 0, 0], territory: [244, 5, 0]},
	'Polynesia': {city: [255, 255, 74], territory: [217, 88, 0]},
	'Portugal': {city: [3, 20, 124], territory: [255, 255, 255]},
	'Rome': {city: [239, 198, 0], territory: [70, 0, 118]},
	'Russia': {city: [0, 0, 0], territory: [238, 238, 238]},
	'Siam': {city: [176, 7, 3], territory: [245, 230, 55]},
	'Songhai': {city: [90, 0, 9], territory: [213, 145, 19]},
	'Spain': {city: [244, 168, 168], territory: [83, 26, 26]},
	'Sweden': {city: [248, 246, 2], territory: [7, 7, 165]},
	'Venice': {city: [255, 254, 215], territory: [102, 33, 161]},
	'The Aztecs': {city: [136, 238, 212], territory: [161, 57, 34]},
	'The Celts': {city: [147, 169, 255], territory: [21, 91, 62]},
	'The Huns': {city: [69, 0, 3], territory: [179, 177, 163]},
	'The Inca': {city: [6, 159, 119], territory: [255, 184, 33]},
	'The Iroquois': {city: [251, 201, 129], territory: [65, 86, 86]},
	'The Maya': {city: [23, 62, 65], territory: [197, 140, 98]},
	'The Netherlands': {city: [255, 255, 255], territory: [255, 143, 0]},
	'The Ottomans': {city: [18, 82, 30], territory: [247, 248, 199]},
	'The Shoshone': {city: [24, 239, 206], territory: [73, 58, 45]},
	'The Zulus': {city: [106, 49, 24], territory: [255, 231, 213]},
}

const cache = new Map<string, CivColor>()

/** City-states are deliberately neutral so they never read as a major civ. */
export const CITY_STATE_COLOR: CivColor = {city: [40, 40, 40], territory: [128, 128, 128]}

/** Color for a civ by name. City-states are grey; unknown major civs (mods) get a stable generated color. */
export function civColor(name: string | undefined, isCityState = false): CivColor {
	if (isCityState) return CITY_STATE_COLOR
	if (!name) return {city: [255, 255, 255], territory: [60, 60, 60]}
	if (CIV_COLORS[name]) return CIV_COLORS[name]

	let color = cache.get(name)
	if (!color) {
		let hash = 0
		for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
		color = {city: hsl(Math.abs(hash) % 360, 0.3, 0.9), territory: hsl(Math.abs(hash) % 360, 0.55, 0.42)}
		cache.set(name, color)
	}
	return color
}

/**
 * A version of the civ's color that is legible as text or a thin line on the
 * dark UI surface (WCAG contrast >= 4.5). Very dark civ colors are lightened
 * toward white, keeping their hue.
 */
export function readable(c: RGB, background: RGB = [20, 32, 48]): string {
	const lum = (v: RGB) => {
		const ch = v.map(x => {
			const s = x / 255
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
		})
		return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
	}
	const contrast = (a: RGB) => (lum(a) + 0.05) / (lum(background) + 0.05)
	let out = c
	for (let t = 0; t <= 1 && contrast(out) < 4.5; t += 0.05) {
		out = c.map(v => Math.round(v + (255 - v) * t)) as RGB
	}
	return `rgb(${out[0]},${out[1]},${out[2]})`
}

export const rgb  = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
export const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

function hsl(h: number, s: number, l: number): RGB {
	const k = (n: number) => (n + h / 30) % 12
	const a = s * Math.min(l, 1 - l)
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
	return [f(0), f(8), f(4)].map(v => Math.round(v * 255)) as RGB
}
