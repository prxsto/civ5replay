import type {Replay, ReplayEvent} from '../parser/types'

export interface City {
	name: string
	x: number
	y: number
	owner: number
	foundedBy: number
	foundedTurn: number
}

export interface TurnState {
	/** owner civId per tile index (y * width + x), -1 = unowned */
	owners: Int16Array
	/** cities standing at the end of this turn */
	cities: City[]
}

/**
 * Precomputed state for every turn from startTurn to endTurn (inclusive), so
 * scrubbing the slider is O(1).
 */
export class Timeline {
	readonly startTurn: number
	readonly endTurn: number
	readonly width: number
	readonly height: number
	private states: TurnState[] = []
	readonly eventsByTurn = new Map<number, ReplayEvent[]>()

	constructor(replay: Replay) {
		const {meta, events} = replay
		this.width  = meta.mapWidth
		this.height = meta.mapHeight

		for (const e of events) {
			const list = this.eventsByTurn.get(e.turn)
			if (list) list.push(e)
			else this.eventsByTurn.set(e.turn, [e])
		}

		const firstEventTurn = events.length ? events[0].turn : meta.startTurn
		const lastEventTurn  = events.length ? events[events.length - 1].turn : meta.endTurn
		this.startTurn = Math.min(meta.startTurn, firstEventTurn)
		this.endTurn   = Math.max(meta.endTurn, lastEventTurn)

		const owners = new Int16Array(this.width * this.height).fill(-1)
		const cities = new Map<number, City>()
		const idx = (x: number, y: number) => y * this.width + x

		for (let turn = this.startTurn; turn <= this.endTurn; turn++) {
			for (const e of this.eventsByTurn.get(turn) ?? []) {
				switch (e.type) {
					case 'CITY_FOUNDED': {
						const {x, y} = e.tiles[0]
						cities.set(idx(x, y), {
							name: e.cityName ?? '?', x, y,
							owner: e.civId, foundedBy: e.civId, foundedTurn: turn,
						})
						owners[idx(x, y)] = e.civId
						break
					}
					case 'TILES_CLAIMED':
						for (const {x, y} of e.tiles) {
							// civId outside the civ list means the tiles were abandoned
							owners[idx(x, y)] = replay.civs[e.civId] ? e.civId : -1
						}
						break
					case 'CITIES_TRANSFERRED':
						for (const {x, y} of e.tiles) {
							owners[idx(x, y)] = e.civId
							const city = cities.get(idx(x, y))
							if (city) cities.set(idx(x, y), {...city, owner: e.civId})
						}
						break
					case 'CITY_RAZED':
						for (const {x, y} of e.tiles) cities.delete(idx(x, y))
						break
				}
			}

			this.states.push({owners: owners.slice(), cities: [...cities.values()]})
		}
	}

	state(turn: number): TurnState {
		const i = Math.max(0, Math.min(this.states.length - 1, turn - this.startTurn))
		return this.states[i]
	}
}
