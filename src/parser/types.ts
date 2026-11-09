export type Elevation = 'MOUNTAIN' | 'HILLS' | 'FLAT' | 'WATER'
export type Terrain   = 'GRASSLAND' | 'PLAINS' | 'DESERT' | 'TUNDRA' | 'SNOW' | 'COAST' | 'OCEAN' | 'MOUNTAIN' | 'HILL' | 'UNKNOWN'

export type EventType =
	| 'MESSAGE'
	| 'CITY_FOUNDED'
	| 'TILES_CLAIMED'
	| 'CITIES_TRANSFERRED'
	| 'CITY_RAZED'
	| 'RELIGION_FOUNDED'
	| 'PANTHEON_SELECTED'
	| 'UNKNOWN'

export interface Tile {
	x: number
	y: number
	index: number
	elevation: Elevation
	terrain: Terrain
	/** null when the tile has no feature */
	feature: string | null
	naturalWonder: boolean
	raw: {elevationId: number; typeId: number; featureId: number}
}

export interface Civ {
	id: number
	leader: string
	longName: string
	name: string
	demonym: string
	/** Heuristic: city-states have the same name as their leader slot, and no demonym */
	isCityState: boolean
}

export interface ReplayEvent {
	/** Position in the file; split razings share an index */
	index: number
	turn: number
	type: EventType
	typeId: number
	civId: number
	tiles: {x: number; y: number}[]
	text: string
	/** Single-tile events */
	x?: number
	y?: number
	cityName?: string
}

export interface DataPoint {
	turn: number
	value: number
}

export interface ReplayMeta {
	version: string
	build: string
	playerCiv: string
	difficulty: string
	eraStart: string
	eraEnd: string
	gameSpeed: string
	worldSize: string
	mapScript: string
	dlc: {id: string; enabled: boolean; name: string}[]
	mods: {id: string; version: number; name: string}[]
	playerColor: string
	startTurn: number
	startYear: number
	endTurn: number
	endYear: string
	mapWidth: number
	mapHeight: number
	/** Which layout variants were detected (useful for debugging new files) */
	layout: {headerPadding: number; preEventsInt: boolean}
}

export interface Replay {
	meta: ReplayMeta
	civs: Civ[]
	/** datasets[name][civId] = points over time */
	datasets: Record<string, DataPoint[][]>
	events: ReplayEvent[]
	/** tiles[y][x]; y = 0 is the southern edge */
	tiles: Tile[][]
}
