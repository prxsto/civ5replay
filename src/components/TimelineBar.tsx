import type {Replay} from '../parser/types'

export const SPEEDS = [
	{label: '½×', ms: 2000},
	{label: '1×', ms: 1000},
	{label: '2×', ms: 600},
	{label: '4×', ms: 300},
	{label: 'Max', ms: 60},
]

interface Props {
	replay: Replay
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

export function TimelineBar({replay, turn, start, end, playing, speed, eventCounts, onTurn, onTogglePlay, onSpeed}: Props) {
	const span = Math.max(1, end - start)
	const maxCount = Math.max(1, ...eventCounts.values())

	return (
		<div className="timeline">
			<div className="timeline-buttons">
				<button className="icon-btn" onClick={() => onTurn(start)} title="First turn (Home)">⏮</button>
				<button className="icon-btn" onClick={() => onTurn(turn - 1)} title="Previous turn (←)">◀</button>
				<button className="icon-btn play" onClick={onTogglePlay} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
				<button className="icon-btn" onClick={() => onTurn(turn + 1)} title="Next turn (→)">▶</button>
				<button className="icon-btn" onClick={() => onTurn(end)} title="Last turn (End)">⏭</button>
			</div>

			<div className="timeline-track">
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
				{turn === end && <span className="turn-year">{replay.meta.endYear}</span>}
			</div>

			<div className="speed" role="group" aria-label="Playback speed">
				{SPEEDS.map((s, i) => (
					<button key={s.label} className={i === speed ? 'active' : ''} onClick={() => onSpeed(i)} title={`Speed ${i + 1}`}>
						{s.label}
					</button>
				))}
			</div>
		</div>
	)
}
