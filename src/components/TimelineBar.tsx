/** Playback speeds. 1× = one game turn per second. */
export const SPEEDS = [
	{label: '0.5×', ms: 2000, tip: '0.5× speed: one turn every 2 seconds'},
	{label: '1×',   ms: 1000, tip: '1× speed: one turn per second'},
	{label: '2×',   ms: 500,  tip: '2× speed: two turns per second'},
	{label: '4×',   ms: 250,  tip: '4× speed: four turns per second'},
	{label: 'Max',  ms: 60,   tip: 'Max speed: as fast as the map can redraw (~16 turns per second)'},
]

interface Props {
	turn: number
	start: number
	end: number
	playing: boolean
	speed: number
	eventCounts: Map<number, number>
	onTurn: (turn: number) => void
	onTogglePlay: () => void
	onSpeed: (speed: number) => void
}

export function TimelineBar({turn, start, end, playing, speed, eventCounts, onTurn, onTogglePlay, onSpeed}: Props) {
	const span = Math.max(1, end - start)
	const maxCount = Math.max(1, ...eventCounts.values())

	return (
		<div className="timeline">
			<div className="timeline-buttons">
				<button className="icon-btn" onClick={() => onTurn(start)} data-tip="Jump to the first turn · Home" aria-label="First turn">⏮</button>
				<button className="icon-btn" onClick={() => onTurn(turn - 1)} data-tip="Back one turn · ← (↑ for ten)" aria-label="Previous turn">◀</button>
				<button className="icon-btn play" onClick={onTogglePlay} data-tip={playing ? 'Pause playback · Space' : 'Play the game turn by turn · Space'} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
				<button className="icon-btn" onClick={() => onTurn(turn + 1)} data-tip="Forward one turn · → (↓ for ten)" aria-label="Next turn">▶</button>
				<button className="icon-btn" onClick={() => onTurn(end)} data-tip="Jump to the last turn · End" aria-label="Last turn">⏭</button>
			</div>

			<div className="timeline-track" data-tip="Drag to scrub through the game. Bars show how many events happened each turn.">
				{/* Event density histogram behind the slider: busy turns stand out */}
				<svg className="timeline-density" viewBox={`0 0 ${span + 1} 1`} preserveAspectRatio="none" aria-hidden>
					{[...eventCounts].map(([t, n]) => (
						<rect key={t} x={t - start} y={1 - n / maxCount} width={1} height={n / maxCount} />
					))}
				</svg>
				<input
					type="range"
					min={start}
					max={end}
					value={turn}
					onChange={e => onTurn(Number(e.target.value))}
					aria-label="Turn"
				/>
			</div>

			<div className="timeline-turn">
				<span className="turn-label">Turn</span>
				<span className="turn-number">{turn}</span>
				<span className="turn-of">/ {end}</span>
			</div>

			<div className="speed" role="group" aria-label="Playback speed">
				{SPEEDS.map((s, i) => (
					<button key={s.label} className={i === speed ? 'active' : ''} onClick={() => onSpeed(i)} data-tip={`${s.tip} · key ${i + 1}`} data-tip-align={i >= SPEEDS.length - 2 ? 'right' : undefined} aria-label={s.tip}>
						{s.label}
					</button>
				))}
			</div>
		</div>
	)
}
