import type {Replay, ReplayEvent} from '../parser/types'
import type {Timeline} from './timeline'
import {civsMentioned, type NameMatcher} from './eventStyle'

export type TilePos = {x: number; y: number}

/**
 * Where on the map an event "is": its own tiles when it has them (a city, the
 * holy city of a religion, a wonder's city), otherwise the capitals of the civs
 * involved (the declaring civ and its target, the civ entering a golden age...).
 */
export function eventFocus(e: ReplayEvent, replay: Replay, timeline: Timeline, matcher: NameMatcher): TilePos[] {
	if (e.tiles.length) return e.tiles

	const civIds: number[] = []
	if (replay.civs[e.civId]) civIds.push(e.civId)
	for (const civ of civsMentioned(e.text, matcher)) {
		if (!civIds.includes(civ.id)) civIds.push(civ.id)
	}

	const out: TilePos[] = []
	for (const id of civIds) {
		const capital = timeline.capital(id, e.turn)
		if (capital) out.push({x: capital.x, y: capital.y})
	}
	return out
}

const FOLLOW_TYPES = new Set(['CITY_FOUNDED', 'CITIES_TRANSFERRED', 'CITY_RAZED', 'RELIGION_FOUNDED', 'MESSAGE'])

/** Tiles where things happened this turn (new, captured or razed cities, wonders...), for the map to drift toward. */
export function turnFocus(timeline: Timeline, turn: number): TilePos[] {
	const out: TilePos[] = []
	for (const e of timeline.eventsByTurn.get(turn) ?? []) {
		if (FOLLOW_TYPES.has(e.type)) out.push(...e.tiles)
	}
	return out
}
