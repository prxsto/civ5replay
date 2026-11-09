/*
 * Turn -> in-game year, from GameSpeed_Turns in the game's CIV5GameSpeeds.xml
 * (Brave New World / final patch). Each row is [monthsPerTurn, turns]; rows apply
 * in order and the last one continues indefinitely.
 */
export const GAME_SPEEDS = {
	GAMESPEED_QUICK:    {label: 'Quick',    rows: [[720, 50], [480, 30], [360, 20], [240, 30], [120, 25], [60, 40], [24, 65], [12, 70]]},
	GAMESPEED_STANDARD: {label: 'Standard', rows: [[480, 75], [300, 60], [240, 25], [120, 50], [60, 60], [24, 50], [12, 120], [6, 60]]},
	GAMESPEED_EPIC:     {label: 'Epic',     rows: [[300, 140], [180, 90], [120, 40], [60, 90], [24, 70], [12, 100], [6, 220]]},
	GAMESPEED_MARATHON: {label: 'Marathon', rows: [[180, 100], [120, 300], [60, 170], [24, 201], [12, 129], [6, 180], [3, 264], [1, 156]]},
} as const

export type GameSpeed = keyof typeof GAME_SPEEDS

export const DEFAULT_SPEED: GameSpeed = 'GAMESPEED_QUICK'

export function isKnownSpeed(speed: string): speed is GameSpeed {
	return speed in GAME_SPEEDS
}

export interface GameDate {
	/** Negative = BC */
	year: number
	/** 0-11; late-game speeds advance by fractions of a year */
	month: number
}

/** Date at the given turn, counting from the game's start turn and year. */
export function turnToDate(turn: number, speed: GameSpeed, startYear = -4000, startTurn = 0): GameDate {
	let months = 0
	let remaining = Math.max(0, turn - startTurn)
	const rows = GAME_SPEEDS[speed].rows

	for (let i = 0; i < rows.length && remaining > 0; i++) {
		const [perTurn, turns] = rows[i]
		const n = i === rows.length - 1 ? remaining : Math.min(turns, remaining)
		months += n * perTurn
		remaining -= n
	}

	const total = startYear * 12 + months
	return {year: Math.floor(total / 12), month: ((total % 12) + 12) % 12}
}

export function turnToYear(turn: number, speed: GameSpeed, startYear = -4000, startTurn = 0) {
	return turnToDate(turn, speed, startYear, startTurn).year
}

/** Formats like the game: "4000 BC", "0", "1994 AD", "2020 6/12 AD". */
export function formatDate({year, month}: GameDate) {
	if (year < 0) return `${-year} BC`
	if (year === 0 && month === 0) return '0'
	return month ? `${year} ${month}/12 AD` : `${year} AD`
}

export function formatYear(year: number) {
	return formatDate({year, month: 0})
}
