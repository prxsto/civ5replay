import {readFileSync, readdirSync, existsSync} from 'node:fs'
import {join, basename} from 'node:path'
import {describe, expect, it} from 'vitest'
import {parseReplay, stripMarkup} from './parseReplay'
import {Timeline} from '../model/timeline'

// Replays checked into the repo, plus any in $REPLAY_DIR (for files you don't want to commit)
const dirs = ['public/replays', process.env.REPLAY_DIR].filter((d): d is string => !!d && existsSync(d))
const files = dirs.flatMap(d => readdirSync(d).filter(f => f.endsWith('.Civ5Replay')).map(f => join(d, f)))

function load(file: string) {
	const buf = readFileSync(file)
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe.each(files)('%s', file => {
	const replay = parseReplay(load(file))
	const {meta} = replay

	it('reads a consistent header', () => {
		expect(meta.version).toMatch(/^\d+\.\d+/)
		expect(meta.endTurn).toBeGreaterThan(meta.startTurn)
		expect(replay.civs.length).toBeGreaterThan(0)
	})

	it('reads a full tile grid with known terrain', () => {
		expect(replay.tiles.length).toBe(meta.mapHeight)
		expect(replay.tiles.every(row => row.length === meta.mapWidth)).toBe(true)
		expect(replay.tiles.flat().filter(t => t.terrain === 'UNKNOWN')).toEqual([])
	})

	it('reads events within the game', () => {
		expect(replay.events.length).toBeGreaterThan(0)
		expect(replay.events.every(e => e.turn >= meta.startTurn && e.turn <= meta.endTurn)).toBe(true)
		expect(replay.events.filter(e => e.type === 'UNKNOWN')).toEqual([])
		expect(replay.events.filter(e => /\[(ICON|COLOR)_/.test(e.text))).toEqual([])
	})

	it('has one series per civ for every dataset', () => {
		for (const series of Object.values(replay.datasets)) {
			expect(series.length).toBe(replay.civs.length)
		}
	})

	it('builds a timeline covering every turn', () => {
		const tl = new Timeline(replay)
		expect(tl.state(meta.endTurn).owners.some(o => o >= 0)).toBe(true)
		expect(tl.state(meta.endTurn).cities.length).toBeGreaterThan(0)
	})
})

describe('wu-zetian-2006-ad (vanilla 1.0.3.279)', () => {
	const file = 'public/replays/wu-zetian-2006-ad.Civ5Replay'
	const replay = parseReplay(load(file))

	it('matches known values', () => {
		expect(basename(file)).toBeTruthy()
		expect(replay.meta.version).toBe('1.0.3.279 (403694)')
		expect(replay.meta.playerCiv).toBe('CIVILIZATION_CHINA')
		expect([replay.meta.mapWidth, replay.meta.mapHeight]).toEqual([60, 48])
		expect(replay.meta.endTurn).toBe(286)
		expect(replay.meta.layout).toEqual({headerPadding: 8, preEventsInt: true})
		expect(replay.civs.filter(c => c.isCityState).length).toBe(12)
	})
})

describe('stripMarkup', () => {
	it('removes Civ V color and icon tags', () => {
		expect(stripMarkup('[COLOR_POSITIVE_TEXT]God-King[ENDCOLOR] (+2 [ICON_PEACE] Faith)')).toBe('God-King (+2 Faith)')
	})
})

it('rejects non-replay files', () => {
	expect(() => parseReplay(new TextEncoder().encode('not a replay file at all').buffer as ArrayBuffer)).toThrow(/Not a Civ V replay/)
})
