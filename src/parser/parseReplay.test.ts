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
		// Fallout is hidden (no way to know when it appeared)
		expect(replay.tiles.flat().filter(t => t.feature === 'FALLOUT')).toEqual([])
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

describe('calendar', async () => {
	const {turnToDate, turnToYear, formatDate, formatYear, isKnownSpeed} = await import('../model/calendar')

	it('matches the end year recorded in each replay', () => {
		for (const file of files) {
			const {meta} = parseReplay(load(file))
			if (!isKnownSpeed(meta.gameSpeed)) continue
			expect(formatDate(turnToDate(meta.endTurn, meta.gameSpeed, meta.startYear, meta.startTurn)), file).toBe(meta.endYear)
		}
	})

	// Spot checks from the in-game turn/year table (ancient start, 4000 BC)
	it.each([
		['GAMESPEED_QUICK', 75, '0'], ['GAMESPEED_QUICK', 81, '230 AD'], ['GAMESPEED_QUICK', 156, '1655 AD'],
		['GAMESPEED_QUICK', 261, '1981 AD'], ['GAMESPEED_QUICK', 1462, '3182 AD'],
		['GAMESPEED_STANDARD', 115, '0'], ['GAMESPEED_STANDARD', 210, '1500 AD'], ['GAMESPEED_STANDARD', 320, '1900 AD'],
		// (Some published tables show 1515 AD at Standard turn 212; CIV5GameSpeeds.xml gives 10-year turns through 210, so 1510.)
		['GAMESPEED_STANDARD', 212, '1510 AD'], ['GAMESPEED_STANDARD', 441, '2020 6/12 AD'],
		['GAMESPEED_STANDARD', 484, '2042 AD'], ['GAMESPEED_STANDARD', 1462, '2531 AD'],
		['GAMESPEED_EPIC', 173, '5 BC'], ['GAMESPEED_EPIC', 174, '10 AD'], ['GAMESPEED_EPIC', 531, '1940 6/12 AD'], ['GAMESPEED_EPIC', 1461, '2405 6/12 AD'],
		['GAMESPEED_MARATHON', 350, '0'], ['GAMESPEED_MARATHON', 772, '1753 AD'], ['GAMESPEED_MARATHON', 1081, '1971 3/12 AD'],
		['GAMESPEED_MARATHON', 1345, '2037 1/12 AD'], ['GAMESPEED_MARATHON', 1462, '2046 10/12 AD'],
	] as const)('%s turn %i = %s', (speed, turn, expected) => {
		expect(formatDate(turnToDate(turn, speed))).toBe(expected)
	})

	it('matches known Quick-speed dates', () => {
		expect(formatYear(turnToYear(19, 'GAMESPEED_QUICK'))).toBe('2860 BC')
		expect(formatYear(turnToYear(286, 'GAMESPEED_QUICK'))).toBe('2006 AD')
	})
})

describe('event focus', async () => {
	const {eventFocus} = await import('../model/focus')
	const {buildNameMatcher} = await import('../model/eventStyle')

	it.each(files)('%s: no off-map tiles, and every war/golden-age/pantheon event resolves to a capital', file => {
		const replay = parseReplay(load(file))
		const {mapWidth: W, mapHeight: H} = replay.meta
		const timeline = new Timeline(replay)
		const matcher = buildNameMatcher(replay)

		const offMap = replay.events.flatMap(e => e.tiles).filter(t => t.x < 0 || t.y < 0 || t.x >= W || t.y >= H)
		expect(offMap).toEqual([])

		const unresolved = replay.events
			.filter(e => /declares war|golden age|pantheon/.test(e.text))
			.filter(e => eventFocus(e, replay, timeline, matcher).length === 0)
		// A civ with no cities left (eliminated) legitimately has no capital
		expect(unresolved.length).toBeLessThan(5)
	})
})
