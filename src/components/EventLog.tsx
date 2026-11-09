import {memo, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {EventType, Replay, ReplayEvent} from '../parser/types'
import {buildNameMatcher, categorize, CATEGORY_INFO, styleEvent, victoryColor, type Category, type Span} from '../model/eventStyle'

export const EVENT_TYPE_INFO: {type: EventType; label: string}[] = [
	{type: 'MESSAGE',            label: 'Messages'},
	{type: 'CITY_FOUNDED',       label: 'New cities'},
	{type: 'CITIES_TRANSFERRED', label: 'Captures'},
	{type: 'CITY_RAZED',         label: 'Razings'},
	{type: 'RELIGION_FOUNDED',   label: 'Religions'},
	{type: 'PANTHEON_SELECTED',  label: 'Pantheons'},
	{type: 'TILES_CLAIMED',      label: 'Tile claims'},
]

const LEGEND: Category[] = ['victory', 'war', 'capture', 'raze', 'peace', 'diplomacy', 'golden', 'wonder', 'science', 'culture', 'religion']

interface Props {
	replay: Replay
	turn: number
	types: Set<EventType>
	civFilter: number | null
	selected: ReplayEvent | null
	smoothScroll: boolean
	onToggleType: (type: EventType) => void
	onCivFilter: (civId: number | null) => void
	onSelect: (event: ReplayEvent) => void
}

interface Styled {
	event: ReplayEvent
	category: Category
	spans: Span[]
	accent: string
}

export function EventLog({replay, turn, types, civFilter, selected, smoothScroll, onToggleType, onCivFilter, onSelect}: Props) {
	const listRef = useRef<HTMLDivElement>(null)
	const [showLegend, setShowLegend] = useState(false)

	// Classify + split every message once per replay
	const styled = useMemo(() => {
		const matcher = buildNameMatcher(replay)
		return replay.events.map((event): Styled => {
			const category = categorize(event)
			return {
				event,
				category,
				spans: styleEvent(event, category, matcher),
				accent: category === 'victory' ? victoryColor(event.text) : CATEGORY_INFO[category].color,
			}
		})
	}, [replay])

	// All matching events, grouped by turn (future turns are shown dimmed so the
	// current turn can sit in the middle of the feed)
	const groups = useMemo(() => {
		const out: {turn: number; items: Styled[]}[] = []
		for (const s of styled) {
			const e = s.event
			if (!types.has(e.type) || (civFilter !== null && e.civId !== civFilter)) continue
			const last = out[out.length - 1]
			if (last && last.turn === e.turn) last.items.push(s)
			else out.push({turn: e.turn, items: [s]})
		}
		return out
	}, [styled, types, civFilter])

	// The newest group at or before the current turn is the anchor we keep centered
	let anchorTurn: number | null = null
	for (const g of groups) {
		if (g.turn > turn) break
		anchorTurn = g.turn
	}

	useLayoutEffect(() => {
		const list = listRef.current
		if (!list) return
		// Center the newest message of the current turn
		const anchor = list.querySelector<HTMLElement>('[data-anchor="true"] li:last-child')
		let target = 0
		if (anchor) {
			const a = anchor.getBoundingClientRect()
			const l = list.getBoundingClientRect()
			target = list.scrollTop + (a.top - l.top) + a.height / 2 - list.clientHeight / 2
		}
		list.scrollTo({top: target, behavior: smoothScroll ? 'smooth' : 'auto'})
	}, [anchorTurn, groups, smoothScroll])

	const civs = replay.civs.filter(c => !c.isCityState)
	const cityStates = replay.civs.filter(c => c.isCityState)

	return (
		<div className="event-log">
			<div className="event-filters">
				<div className="chips">
					{EVENT_TYPE_INFO.map(({type, label}) => (
						<button key={type} className={`chip ${types.has(type) ? 'on' : ''}`} onClick={() => onToggleType(type)} aria-pressed={types.has(type)}>
							{label}
						</button>
					))}
				</div>
				<div className="filter-row">
					<select value={civFilter ?? ''} onChange={e => onCivFilter(e.target.value === '' ? null : Number(e.target.value))} aria-label="Filter by civilization">
						<option value="">All civilizations</option>
						<optgroup label="Civilizations">
							{civs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
						</optgroup>
						{cityStates.length > 0 && (
							<optgroup label="City-states">
								{cityStates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
							</optgroup>
						)}
					</select>
					<button className={`chip legend-toggle ${showLegend ? 'on' : ''}`} onClick={() => setShowLegend(!showLegend)} aria-expanded={showLegend}>
						Colors
					</button>
				</div>
				{showLegend && (
					<ul className="legend">
						{LEGEND.map(c => (
							<li key={c}><span className="dot" style={{background: CATEGORY_INFO[c].color}} />{CATEGORY_INFO[c].label}</li>
						))}
						<li><span className="dot" style={{background: '#a3a3a3'}} />City-states</li>
					</ul>
				)}
			</div>

			<div className="event-list" ref={listRef}>
				{groups.length === 0 && <div className="empty">No events match these filters.</div>}
				{groups.map(g => (
					<TurnGroup
						key={g.turn}
						turn={g.turn}
						items={g.items}
						state={g.turn === anchorTurn ? 'current' : g.turn > turn ? 'future' : 'past'}
						selected={selected && g.items.some(s => s.event === selected) ? selected : null}
						onSelect={onSelect}
					/>
				))}
			</div>
		</div>
	)
}

interface GroupProps {
	turn: number
	items: Styled[]
	state: 'past' | 'current' | 'future'
	selected: ReplayEvent | null
	onSelect: (event: ReplayEvent) => void
}

// Memoised so moving the turn only re-renders the groups whose state changed
const TurnGroup = memo(function TurnGroup({turn, items, state, selected, onSelect}: GroupProps) {
	return (
		<section className={`turn-group ${state}`} data-anchor={state === 'current' ? 'true' : undefined}>
			<h4>Turn {turn}</h4>
			<ul>
				{items.map((s, i) => (
					<li
						key={`${s.event.index}-${i}`}
						className={`event cat-${s.category} ${selected === s.event ? 'selected' : ''}`}
						style={{borderLeftColor: s.accent}}
						onClick={() => onSelect(s.event)}
					>
						{s.spans.map((span, j) => span.color
							? <span key={j} className={span.kind} style={{color: span.color}}>{span.text}</span>
							: span.text)}
					</li>
				))}
			</ul>
		</section>
	)
})
