import {formatDate, GAME_SPEEDS, turnToDate, type GameSpeed} from '../model/calendar'

interface Props {
	turn: number
	startTurn: number
	startYear: number
	speed: GameSpeed
	/** The replay's own game speed, if it's one we have a calendar for */
	fileSpeed: GameSpeed | null
	onSpeed: (speed: GameSpeed) => void
}

export function YearBadge({turn, startTurn, startYear, speed, fileSpeed, onSpeed}: Props) {
	const date = formatDate(turnToDate(turn, speed, startYear, startTurn))
	const assumed = fileSpeed === null
	const overridden = fileSpeed !== null && speed !== fileSpeed

	return (
		<div className="year-badge">
			<div className="year" aria-live="polite">{date}</div>
			<div className="year-sub">
				<span>Turn {turn}</span>
				<span className="sep">·</span>
				<label
					className={`calendar ${assumed || overridden ? 'warn' : ''}`}
					data-tip={assumed
						? "This replay's game speed isn't a standard one, so years assume Quick. Pick the speed you played on."
						: overridden
							? `Years shown for ${GAME_SPEEDS[speed].label}; the replay says ${GAME_SPEEDS[fileSpeed!].label}.`
							: 'Years are calculated from the game speed stored in the replay.'}
				>
					<select value={speed} onChange={e => onSpeed(e.target.value as GameSpeed)} aria-label="Game speed used for the calendar">
						{(Object.keys(GAME_SPEEDS) as GameSpeed[]).map(s => (
							<option key={s} value={s}>{GAME_SPEEDS[s].label}{s === fileSpeed ? ' (replay)' : ''}</option>
						))}
					</select>
					{assumed && <span className="badge-note">assumed</span>}
				</label>
			</div>
		</div>
	)
}
