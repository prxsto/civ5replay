import {BinaryReader} from './BinaryReader'
import type {Civ, DataPoint, Elevation, EventType, Replay, ReplayEvent, ReplayMeta, Terrain, Tile} from './types'

/*
 * .Civ5Replay layout (all integers little-endian int32 unless noted, strings
 * are int32 length + UTF-8). Verified against vanilla BNW files (2013 through
 * the final 1.0.3.279 patch) and Vox Populi / Community Patch files.
 *
 *   "CIV5" | int | version | build | 5 bytes | playerCiv | difficulty | eraStart
 *   | eraEnd | gameSpeed | worldSize | mapScript
 *   | dlc[]  {guid(16), enabled, name}
 *   | mods[] {id, version, name}
 *   | str | str | playerColor
 *   | int (+ 4 more bytes in vanilla; not in Vox Populi)
 *   | mapScript2
 *   | <variable-length game options block we don't decode; scanned past>
 *   | startTurn | startYear | endTurn | endYear(str) | zeroStartYear | zeroEndYear
 *   | civs[] {int, int, int, int, leader, longName, name, demonym}
 *   | datasets[] {name}
 *   | datasetValues[civ][dataset][] {turn, value}
 *   | (int in vanilla; not in Vox Populi)
 *   | events[] {turn, typeId, tiles[] {x: int16, y: int16}, civId, text}
 *   | mapWidth | mapHeight
 *   | tiles[] {int, int lastTurn, elevation: int8, terrain: int8, feature: int8, int8}
 */

const EVENT_TYPES: Record<number, EventType> = {
	0: 'MESSAGE',
	1: 'CITY_FOUNDED',
	2: 'TILES_CLAIMED',
	3: 'CITIES_TRANSFERRED',
	4: 'CITY_RAZED',
	5: 'RELIGION_FOUNDED',
	6: 'PANTHEON_SELECTED',
}

const ELEVATIONS: Record<number, Elevation> = {0: 'MOUNTAIN', 1: 'HILLS', 2: 'FLAT', 3: 'WATER'}

const TERRAINS: Record<number, Terrain> = {
	0: 'GRASSLAND', 1: 'PLAINS', 2: 'DESERT', 3: 'TUNDRA', 4: 'SNOW',
	5: 'COAST', 6: 'OCEAN', 7: 'MOUNTAIN', 8: 'HILL',
}

/** FeatureInfos order in the base game + DLC (index == featureId) */
export const FEATURES: Record<number, string> = {
	0: 'ICE', 1: 'JUNGLE', 2: 'MARSH', 3: 'OASIS', 4: 'FLOOD_PLAINS', 5: 'FOREST',
	6: 'FALLOUT', 7: 'CRATER', 8: 'FUJI', 9: 'MESA', 10: 'REEF', 11: 'VOLCANO',
	12: 'GIBRALTAR', 13: 'GEYSER', 14: 'FOUNTAIN_YOUTH', 15: 'POTOSI', 16: 'EL_DORADO',
	17: 'ATOLL', 18: 'SRI_PADA', 19: 'MT_SINAI', 20: 'MT_KAILASH', 21: 'ULURU',
	22: 'LAKE_VICTORIA', 23: 'KILIMANJARO', 24: 'SOLOMONS_MINES',
}

const NON_WONDER_FEATURES = new Set([0, 1, 2, 3, 4, 5, 6, 17])

/** Display names for natural wonders, keyed by FEATURES value */
export const NATURAL_WONDER_NAMES: Record<string, string> = {
	CRATER: 'Barringer Crater', FUJI: 'Mt. Fuji', MESA: 'Grand Mesa', REEF: 'Great Barrier Reef',
	VOLCANO: 'Krakatoa', GIBRALTAR: 'Rock of Gibraltar', GEYSER: 'Old Faithful', FOUNTAIN_YOUTH: 'Fountain of Youth',
	POTOSI: 'Cerro de Potosí', EL_DORADO: 'El Dorado', SRI_PADA: 'Sri Pada', MT_SINAI: 'Mt. Sinai',
	MT_KAILASH: 'Mt. Kailash', ULURU: 'Uluru', LAKE_VICTORIA: 'Lake Victoria', KILIMANJARO: 'Mt. Kilimanjaro',
	SOLOMONS_MINES: "King Solomon's Mines",
}

interface RawEvent {
	turn: number
	typeId: number
	tiles: {x: number; y: number}[]
	civId: number
	text: string
}

function readEvent(r: BinaryReader): RawEvent {
	return {
		turn:   r.int32(),
		typeId: r.int32(),
		tiles:  r.array(() => ({x: r.int16(), y: r.int16()})),
		civId:  r.int32(),
		text:   r.string(),
	}
}

/** Does `o` point at startTurn, followed by a sane year/turn/civ-list layout? */
function looksLikeTurnHeader(r: BinaryReader, o: number) {
	const startTurn = r.peekInt32(o)
	const startYear = r.peekInt32(o + 4)
	const endTurn   = r.peekInt32(o + 8)

	if (startTurn === null || startTurn < 0 || startTurn > 2000) return false
	if (startYear === null || Math.abs(startYear) > 100000) return false
	if (endTurn === null || endTurn < startTurn || endTurn > 5000) return false
	if (!r.isPlausibleString(o + 12, 1, 64)) return false

	// endYear string, then zeroStartYear + zeroEndYear, then the civs array
	const afterYear = o + 16 + (r.peekInt32(o + 12) as number)
	const civCount  = r.peekInt32(afterYear + 8)
	if (civCount === null || civCount < 1 || civCount > 128) return false

	// First civ: four int32s, then the leader name
	return r.isPlausibleString(afterYear + 12 + 16, 1, 256)
}

/** Strip Civ V text markup like [COLOR_POSITIVE_TEXT], [ENDCOLOR], [ICON_PEACE], [NEWLINE] */
export function stripMarkup(text: string) {
	return text
		.replace(/\[NEWLINE\]/g, ' ')
		.replace(/\[(COLOR_[A-Z_]+|ENDCOLOR|ICON_[A-Z_0-9]+)\]/g, '')
		.replace(/\s+([.,;:)])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim()
}

export class ReplayParseError extends Error {
	constructor(message: string, public offset: number) {
		super(`${message} (at byte ${offset})`)
	}
}

export function parseReplay(buffer: ArrayBuffer): Replay {
	const r = new BinaryReader(buffer)

	try {
		return parse(r)
	}
	catch (e) {
		if (e instanceof ReplayParseError) throw e
		throw new ReplayParseError(e instanceof Error ? e.message : String(e), r.offset)
	}
}

function parse(r: BinaryReader): Replay {
	// ---- Header -----------------------------------------------------------
	const magic = r.ascii(4)
	if (magic !== 'CIV5') throw new ReplayParseError(`Not a Civ V replay (magic "${magic}")`, 0)

	r.int32()
	const version    = r.string()
	const build      = r.string()
	r.raw(5)
	const playerCiv  = r.string()
	const difficulty = r.string()
	const eraStart   = r.string()
	const eraEnd     = r.string()
	const gameSpeed  = r.string()
	const worldSize  = r.string()
	const mapScript  = r.string()
	const dlc  = r.array(() => ({id: r.guid(), enabled: r.int32() !== 0, name: r.string()}))
	const mods = r.array(() => ({id: r.string(), version: r.int32(), name: r.string()}))
	r.string()
	r.string()
	const playerColor = r.string()

	// Unknown int32, then 4 more bytes in vanilla files before mapScript2:
	//   vanilla:     01 00 00 00 00 00 00 00
	//   Vox Populi:  06 00 00 00
	let headerPadding = 8
	{
		const start = r.offset
		for (let skip = 4; skip <= 16; skip += 4) {
			if (r.isPlausibleString(start + skip, 1, 2048)) {
				headerPadding = skip
				break
			}
		}
		r.seek(start + headerPadding)
	}
	r.string() // mapScript2

	// Variable-length options block: scan for the turn header instead of parsing it
	{
		const start = r.offset
		const limit = Math.min(r.size - 32, start + 8192)
		let found = -1
		for (let o = start; o < limit; o++) {
			if (looksLikeTurnHeader(r, o)) {
				found = o
				break
			}
		}
		if (found < 0) throw new ReplayParseError('Could not locate turn header', start)
		r.seek(found)
	}

	const startTurn = r.int32()
	const startYear = r.int32()
	const endTurn   = r.int32()
	const endYear   = r.string()
	r.int32() // zeroStartYear
	r.int32() // zeroEndYear

	// ---- Civs -------------------------------------------------------------
	const civs: Civ[] = r.array(id => {
		r.int32()
		r.int32()
		r.int32()
		r.int32()
		const leader   = r.string()
		const longName = r.string()
		const name     = r.string()
		const demonym  = r.string()
		return {id, leader, longName, name, demonym, isCityState: leader === name && longName === name}
	})

	// ---- Datasets ---------------------------------------------------------
	const datasetNames = r.array(() => r.string())
	const datasetValues = r.array(() => r.array(() => r.array((): DataPoint => ({turn: r.int32(), value: r.int32()}))))

	const datasets: Record<string, DataPoint[][]> = {}
	datasetNames.forEach((name, d) => {
		datasets[name] = datasetValues.map(perCiv => perCiv[d] ?? [])
	})

	// ---- Events (optional int32 before them in vanilla files) -------------
	let preEventsInt = true
	{
		const start = r.offset
		let chosen: number | null = null
		for (const skip of [0, 4]) {
			r.seek(start + skip)
			const ok = r.attempt(() => {
				r.array(() => readEvent(r))
				const w = r.int32()
				const h = r.int32()
				const n = r.int32()
				return w > 0 && h > 0 && w < 1024 && h < 1024 && n === w * h
			})
			if (ok) {
				chosen = skip
				break
			}
		}
		if (chosen === null) throw new ReplayParseError('Could not align events section', start)
		preEventsInt = chosen === 4
		r.seek(start + chosen)
	}

	const rawEvents = r.array(() => readEvent(r))

	// ---- Map --------------------------------------------------------------
	const mapWidth  = r.int32()
	const mapHeight = r.int32()
	const flatTiles = r.array((index): Tile => {
		r.int32()
		r.int32()
		const elevationId = r.int8()
		const typeId      = r.int8()
		const featureId   = r.int8()
		r.int8()
		return {
			x: index % mapWidth,
			y: Math.floor(index / mapWidth),
			index,
			elevation: ELEVATIONS[elevationId] ?? 'FLAT',
			terrain: TERRAINS[typeId] ?? 'UNKNOWN',
			feature: featureId < 0 ? null : (FEATURES[featureId] ?? `FEATURE_${featureId}`),
			naturalWonder: featureId >= 0 && !NON_WONDER_FEATURES.has(featureId),
			raw: {elevationId, typeId, featureId},
		}
	})

	const tiles: Tile[][] = []
	for (let y = 0; y < mapHeight; y++) tiles.push(flatTiles.slice(y * mapWidth, (y + 1) * mapWidth))

	const meta: ReplayMeta = {
		version, build, playerCiv, difficulty, eraStart, eraEnd, gameSpeed, worldSize, mapScript,
		dlc, mods, playerColor, startTurn, startYear, endTurn, endYear, mapWidth, mapHeight,
		layout: {headerPadding, preEventsInt},
	}

	return {meta, civs, datasets, events: processEvents(rawEvents, civs, mapWidth, mapHeight), tiles}
}

function processEvents(rawEvents: RawEvent[], civs: Civ[], width: number, height: number): ReplayEvent[] {
	// Many messages (wars, golden ages, pantheons...) carry a placeholder tile at
	// (-1, -1) meaning "no location"; drop anything that isn't on the map
	for (const raw of rawEvents) {
		raw.tiles = raw.tiles.filter(t => t.x >= 0 && t.y >= 0 && t.x < width && t.y < height)
	}

	const cityAt = new Map<string, string>()
	const key = (t: {x: number; y: number}) => `${t.x},${t.y}`
	const civName = (id: number) => civs[id]?.name ?? null
	const out: ReplayEvent[] = []

	rawEvents.forEach((raw, index) => {
		const type = EVENT_TYPES[raw.typeId] ?? 'UNKNOWN'
		const civ  = civName(raw.civId)
		const base: ReplayEvent = {
			index,
			turn: raw.turn,
			type,
			typeId: raw.typeId,
			civId: raw.civId,
			tiles: raw.tiles,
			text: stripMarkup(raw.text),
		}

		if (raw.tiles.length === 1 && type !== 'TILES_CLAIMED') {
			base.x = raw.tiles[0].x
			base.y = raw.tiles[0].y
		}

		switch (type) {
			case 'CITY_FOUNDED': {
				base.cityName = base.text.replace(/ is founded\.$/, '')
				cityAt.set(key(raw.tiles[0]), base.cityName)
				out.push(base)
				break
			}

			case 'CITY_RAZED': {
				// Mass razings are compounded into one event; split them out
				for (const tile of raw.tiles) {
					const cityName = cityAt.get(key(tile)) ?? 'A city'
					out.push({
						...base,
						tiles: [tile],
						x: tile.x,
						y: tile.y,
						cityName,
						text: `${cityName} has been burned to the ground by ${civ}!`,
					})
				}
				break
			}

			case 'CITIES_TRANSFERRED': {
				const names = raw.tiles.map(t => cityAt.get(key(t)) ?? 'an unknown city')
				base.text = names.length === 1
					? `${civ} now controls the city of ${names[0]}.`
					: `${civ} now controls the cities of ${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names[names.length - 1]}.`
				if (names.length === 1) base.cityName = names[0]
				out.push(base)
				break
			}

			case 'TILES_CLAIMED': {
				const n = raw.tiles.length
				base.text = civ
					? `${civ} has claimed ${n} tile${n === 1 ? '' : 's'}.`
					: `${n} tile${n === 1 ? ' has' : 's have'} been abandoned!`
				out.push(base)
				break
			}

			case 'MESSAGE':
				// Occasionally a message is blank; skip it
				if (base.text) out.push(base)
				break

			default:
				out.push(base)
		}
	})

	return out
}
