import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {Civ, DataPoint, Replay} from '../parser/types'
import {civColor, readable} from '../model/civColors'

interface Props {
	replay: Replay
	turn: number
	onTurn: (turn: number) => void
	/** In-game date label for a turn */
	yearAt: (turn: number) => string
}

interface Series {
	civ: Civ
	color: string
	points: DataPoint[]
}

const prettyDataset = (key: string) => {
	const name = key.replace(/^REPLAYDATASET_/, '').toLowerCase()
	const special: Record<string, string> = {
		gptcityconnections: 'Gold from city connections', gptinternationaltrade: 'Gold from trade',
		gptdeals: 'Gold from deals', techsknown: 'Techs known', militarymight: 'Military strength',
		excesshapiness: 'Excess happiness', numberofpolicies: 'Policies', numberofworkers: 'Workers',
		goldenageturns: 'Golden age turns', gapperturn: 'Golden age points per turn',
		totalland: 'Land (tiles)', improvedtiles: 'Improved tiles', workedtiles: 'Worked tiles',
	}
	if (special[name]) return special[name]
	return name
		.replace(/perturn$/, ' per turn')
		.replace(/^total/, 'total ')
		.replace(/maintenance$/, ' maintenance')
		.replace(/count$/, ' count')
		.replace(/^\w/, c => c.toUpperCase())
}

/** "Nice" axis ticks (1/2/5 steps) covering [min, max] */
function niceTicks(min: number, max: number, count: number) {
	const span = max - min || 1
	const raw = span / count
	const p = 10 ** Math.floor(Math.log10(raw))
	const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw) ?? raw
	const lo = Math.floor(min / step) * step
	const hi = Math.ceil(max / step) * step
	const ticks: number[] = []
	for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
	return {lo, hi, ticks}
}

const fmt = (v: number) => {
	const a = Math.abs(v)
	if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
	if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`
	if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`
	return String(v)
}

function valueAt(points: DataPoint[], t: number) {
	let best: number | null = null
	for (const p of points) {
		if (p.turn > t) break
		best = p.value
	}
	return best
}

export function StatsPanel({replay, turn, onTurn, yearAt}: Props) {
	const keys = Object.keys(replay.datasets)
	const [dataset, setDataset] = useState(keys.includes('REPLAYDATASET_SCORE') ? 'REPLAYDATASET_SCORE' : keys[0])
	const [includeCityStates, setIncludeCityStates] = useState(false)
	const [focus, setFocus] = useState<number | null>(null)
	const [hoverCiv, setHoverCiv] = useState<number | null>(null)
	const [hoverTurn, setHoverTurn] = useState<number | null>(null)
	const [expanded, setExpanded] = useState(false)

	const start = replay.meta.startTurn
	const end   = replay.meta.endTurn

	const series = useMemo((): Series[] => {
		const data = replay.datasets[dataset] ?? []
		return replay.civs
			.filter(c => includeCityStates || !c.isCityState)
			.map(c => ({
				civ: c,
				color: readable(civColor(c.name, c.isCityState).territory),
				points: (data[c.id] ?? []).filter(p => p.turn >= start && p.turn <= end),
			}))
			.filter(s => s.points.length > 0)
	}, [replay, dataset, includeCityStates, start, end])

	const shownTurn = hoverTurn ?? turn
	const ranking = series
		.map(s => ({...s, value: valueAt(s.points, shownTurn)}))
		.filter((s): s is Series & {value: number} => s.value !== null)
		.sort((a, b) => b.value - a.value)

	useEffect(() => {
		if (!expanded) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation()
				setExpanded(false)
			}
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [expanded])

	const highlighted = hoverCiv ?? focus

	const controls = (
		<div className="stats-controls">
			<select value={dataset} onChange={e => setDataset(e.target.value)} aria-label="Statistic">
				{keys.map(k => <option key={k} value={k}>{prettyDataset(k)}</option>)}
			</select>
			<label className="check">
				<input type="checkbox" checked={includeCityStates} onChange={e => setIncludeCityStates(e.target.checked)} />
				City-states
			</label>
			<button
				className="icon-btn expand"
				onClick={() => setExpanded(!expanded)}
				data-tip={expanded ? 'Close the large chart · Esc' : 'Open a large chart'}
				data-tip-align="right"
				aria-label={expanded ? 'Close large chart' : 'Expand chart'}
			>{expanded ? '✕' : '⤢'}</button>
		</div>
	)

	const chart = (
		<Chart
			series={series}
			start={start}
			end={end}
			turn={turn}
			hoverTurn={hoverTurn}
			highlighted={highlighted}
			yearAt={yearAt}
			label={prettyDataset(dataset)}
			onHoverTurn={setHoverTurn}
			onTurn={onTurn}
		/>
	)

	const legend = (
		<div className="stats-legend">
			<div className="legend-head">
				<span>{hoverTurn !== null ? 'Turn ' + hoverTurn : 'Turn ' + turn} · {yearAt(shownTurn)}</span>
				<span className="hint">click to isolate</span>
			</div>
			<ol>
				{ranking.map((s, i) => (
					<li
						key={s.civ.id}
						className={`${focus === s.civ.id ? 'focused' : ''} ${highlighted !== null && highlighted !== s.civ.id ? 'dim' : ''}`}
						onClick={() => setFocus(focus === s.civ.id ? null : s.civ.id)}
						onMouseEnter={() => setHoverCiv(s.civ.id)}
						onMouseLeave={() => setHoverCiv(null)}
					>
						<span className="rank">{i + 1}</span>
						<span className="swatch" style={{background: s.color}} />
						<span className="name">{s.civ.name}</span>
						<span className="value">{s.value.toLocaleString()}</span>
					</li>
				))}
			</ol>
		</div>
	)

	return (
		<>
			<div className="stats">
				{controls}
				{!expanded && chart}
				{legend}
			</div>
			{expanded && (
				<div className="stats-modal" role="dialog" aria-label={prettyDataset(dataset)} onClick={e => e.target === e.currentTarget && setExpanded(false)}>
					<div className="stats-modal-card">
						<div className="stats-modal-head">
							<h3>{prettyDataset(dataset)}</h3>
							{controls}
						</div>
						<div className="stats-modal-body">
							{chart}
							{legend}
						</div>
					</div>
				</div>
			)}
		</>
	)
}

interface ChartProps {
	series: Series[]
	start: number
	end: number
	turn: number
	hoverTurn: number | null
	highlighted: number | null
	label: string
	yearAt: (turn: number) => string
	onHoverTurn: (turn: number | null) => void
	onTurn: (turn: number) => void
}

/** Line chart drawn at real pixel size (no viewBox scaling), so text stays 12px. */
function Chart({series, start, end, turn, hoverTurn, highlighted, label, yearAt, onHoverTurn, onTurn}: ChartProps) {
	const wrapRef = useRef<HTMLDivElement>(null)
	const [size, setSize] = useState({w: 340, h: 300})

	useLayoutEffect(() => {
		const el = wrapRef.current
		if (!el) return
		const ro = new ResizeObserver(() => setSize({w: el.clientWidth, h: el.clientHeight}))
		ro.observe(el)
		setSize({w: el.clientWidth, h: el.clientHeight})
		return () => ro.disconnect()
	}, [])

	const {w, h} = size
	const pad = {l: 52, r: 16, t: 14, b: 40}
	const values = series.flatMap(s => s.points.map(p => p.value))
	const y = niceTicks(Math.min(0, ...values), Math.max(1, ...values), Math.max(3, Math.round(h / 60)))
	const xTickCount = Math.max(2, Math.round(w / 110))
	const xTicks = Array.from({length: xTickCount + 1}, (_, i) => Math.round(start + ((end - start) * i) / xTickCount))

	const px = (t: number) => pad.l + ((t - start) / Math.max(1, end - start)) * (w - pad.l - pad.r)
	const py = (v: number) => pad.t + (1 - (v - y.lo) / (y.hi - y.lo || 1)) * (h - pad.t - pad.b)

	const turnAt = (clientX: number, rect: DOMRect) => {
		const t = Math.round(start + ((clientX - rect.left - pad.l) / (w - pad.l - pad.r)) * (end - start))
		return Math.max(start, Math.min(end, t))
	}

	// Draw highlighted series last so it sits on top
	const ordered = highlighted === null ? series : [...series.filter(s => s.civ.id !== highlighted), ...series.filter(s => s.civ.id === highlighted)]

	return (
		<div className="chart-wrap" ref={wrapRef}>
			<svg
				className="chart"
				width={w}
				height={h}
				role="img"
				aria-label={`${label} by civilization over time`}
				onPointerMove={e => onHoverTurn(turnAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
				onPointerLeave={() => onHoverTurn(null)}
				onClick={e => onTurn(turnAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
			>
				{y.ticks.map(v => (
					<g key={v}>
						<line className="grid" x1={pad.l} x2={w - pad.r} y1={py(v)} y2={py(v)} />
						<text className="axis" x={pad.l - 8} y={py(v)} textAnchor="end" dominantBaseline="middle">{fmt(v)}</text>
					</g>
				))}
				{xTicks.map((t, i) => (
					<g key={`${t}-${i}`}>
						<line className="tick" x1={px(t)} x2={px(t)} y1={h - pad.b} y2={h - pad.b + 4} />
						<text className="axis" x={px(t)} y={h - pad.b + 16} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>T{t}</text>
						<text className="axis sub" x={px(t)} y={h - pad.b + 30} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{yearAt(t)}</text>
					</g>
				))}

				{ordered.map(s => {
					const isHi = highlighted === s.civ.id
					const dim = highlighted !== null && !isHi
					return (
						<polyline
							key={s.civ.id}
							points={s.points.map(p => `${px(p.turn)},${py(p.value)}`).join(' ')}
							fill="none"
							stroke={s.color}
							strokeWidth={isHi ? 3.5 : 2}
							strokeLinejoin="round"
							strokeLinecap="round"
							opacity={dim ? 0.15 : 1}
						/>
					)
				})}

				<line className="current-turn" x1={px(turn)} x2={px(turn)} y1={pad.t} y2={h - pad.b} />
				{hoverTurn !== null && (
					<>
						<line className="crosshair" x1={px(hoverTurn)} x2={px(hoverTurn)} y1={pad.t} y2={h - pad.b} />
						{series.map(s => {
							const v = valueAt(s.points, hoverTurn)
							if (v === null || (highlighted !== null && highlighted !== s.civ.id)) return null
							return <circle key={s.civ.id} cx={px(hoverTurn)} cy={py(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
						})}
					</>
				)}
			</svg>
		</div>
	)
}
