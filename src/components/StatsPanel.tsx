import {useMemo, useRef, useState} from 'react'
import type {Replay} from '../parser/types'
import {civColor, readable} from '../model/civColors'

interface Props {
	replay: Replay
	turn: number
	onTurn: (turn: number) => void
}

const W = 360
const H = 220
const PAD = {l: 44, r: 10, t: 10, b: 22}

const prettyDataset = (key: string) => {
	const name = key.replace(/^REPLAYDATASET_/, '').toLowerCase()
	const special: Record<string, string> = {
		gptcityconnections: 'Gold from city connections', gptinternationaltrade: 'Gold from trade',
		gptdeals: 'Gold from deals', techsknown: 'Techs known', militarymight: 'Military strength',
		excesshapiness: 'Excess happiness', numberofpolicies: 'Policies', numberofworkers: 'Workers',
		goldenageturns: 'Golden age turns', gapperturn: 'Golden age points per turn',
	}
	if (special[name]) return special[name]
	return name
		.replace(/perturn$/, ' per turn')
		.replace(/^total/, 'total ')
		.replace(/maintenance$/, ' maintenance')
		.replace(/count$/, ' count')
		.replace(/tiles$/, ' tiles')
		.replace(/^\w/, c => c.toUpperCase())
}

function niceMax(v: number) {
	if (v <= 0) return 1
	const p = 10 ** Math.floor(Math.log10(v))
	return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v) ?? v
}

const fmt = (v: number) => Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)

export function StatsPanel({replay, turn, onTurn}: Props) {
	const keys = Object.keys(replay.datasets)
	const [dataset, setDataset] = useState(keys.includes('REPLAYDATASET_SCORE') ? 'REPLAYDATASET_SCORE' : keys[0])
	const [includeCityStates, setIncludeCityStates] = useState(false)
	const [focus, setFocus] = useState<number | null>(null)
	const [hoverTurn, setHoverTurn] = useState<number | null>(null)
	const svgRef = useRef<SVGSVGElement>(null)

	const start = replay.meta.startTurn
	const end   = replay.meta.endTurn

	const series = useMemo(() => {
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

	const yMax = niceMax(Math.max(1, ...series.flatMap(s => s.points.map(p => p.value))))
	const yMin = Math.min(0, ...series.flatMap(s => s.points.map(p => p.value)))
	const x = (t: number) => PAD.l + ((t - start) / Math.max(1, end - start)) * (W - PAD.l - PAD.r)
	const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

	const valueAt = (points: {turn: number; value: number}[], t: number) => {
		let best: number | null = null
		for (const p of points) {
			if (p.turn > t) break
			best = p.value
		}
		return best
	}

	const shownTurn = hoverTurn ?? turn
	const ranking = series
		.map(s => ({...s, value: valueAt(s.points, shownTurn)}))
		.filter(s => s.value !== null)
		.sort((a, b) => (b.value as number) - (a.value as number))

	const turnFromEvent = (e: React.PointerEvent) => {
		const rect = svgRef.current!.getBoundingClientRect()
		const px = ((e.clientX - rect.left) / rect.width) * W
		const t = Math.round(start + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (end - start))
		return Math.max(start, Math.min(end, t))
	}

	const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => yMin + f * (yMax - yMin))

	return (
		<div className="stats">
			<div className="stats-controls">
				<select value={dataset} onChange={e => setDataset(e.target.value)} aria-label="Statistic">
					{keys.map(k => <option key={k} value={k}>{prettyDataset(k)}</option>)}
				</select>
				<label className="check">
					<input type="checkbox" checked={includeCityStates} onChange={e => setIncludeCityStates(e.target.checked)} />
					City-states
				</label>
			</div>

			<svg
				ref={svgRef}
				className="chart"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`${prettyDataset(dataset)} by civilization over time`}
				onPointerMove={e => setHoverTurn(turnFromEvent(e))}
				onPointerLeave={() => setHoverTurn(null)}
				onClick={e => onTurn(turnFromEvent(e as unknown as React.PointerEvent))}
			>
				{ticks.map(v => (
					<g key={v}>
						<line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
						<text className="axis" x={PAD.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">{fmt(Math.round(v))}</text>
					</g>
				))}
				<text className="axis" x={PAD.l} y={H - 6}>{start}</text>
				<text className="axis" x={W - PAD.r} y={H - 6} textAnchor="end">{end}</text>

				{series.map(s => (
					<polyline
						key={s.civ.id}
						points={s.points.map(p => `${x(p.turn)},${y(p.value)}`).join(' ')}
						fill="none"
						stroke={s.color}
						strokeWidth={focus === s.civ.id ? 2.5 : 1.75}
						strokeLinejoin="round"
						opacity={focus === null || focus === s.civ.id ? 1 : 0.15}
					/>
				))}

				<line className="current-turn" x1={x(turn)} x2={x(turn)} y1={PAD.t} y2={H - PAD.b} />
				{hoverTurn !== null && <line className="crosshair" x1={x(hoverTurn)} x2={x(hoverTurn)} y1={PAD.t} y2={H - PAD.b} />}
			</svg>

			<div className="stats-legend">
				<div className="legend-head">
					{hoverTurn !== null ? `Turn ${hoverTurn}` : `Turn ${turn}`}
					<span className="hint">click a civ to isolate</span>
				</div>
				<ol>
					{ranking.map(s => (
						<li
							key={s.civ.id}
							className={focus === s.civ.id ? 'focused' : ''}
							onClick={() => setFocus(focus === s.civ.id ? null : s.civ.id)}
						>
							<span className="swatch" style={{background: s.color}} />
							<span className="name">{s.civ.name}</span>
							<span className="value">{(s.value as number).toLocaleString()}</span>
						</li>
					))}
				</ol>
			</div>
		</div>
	)
}
