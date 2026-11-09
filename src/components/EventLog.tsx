import {useEffect, useMemo, useRef} from 'react'
import type {EventType, Replay, ReplayEvent} from '../parser/types'
import {civColor, rgb} from '../model/civColors'

export const EVENT_TYPE_INFO: {type: EventType; label: string}[] = [
	{type: 'MESSAGE',            label: 'Messages'},
	{type: 'CITY_FOUNDED',       label: 'New cities'},
	{type: 'CITIES_TRANSFERRED', label: 'Captures'},
	{type: 'CITY_RAZED',         label: 'Razings'},
	{type: 'RELIGION_FOUNDED',   label: 'Religions'},
	{type: 'PANTHEON_SELECTED',  label: 'Pantheons'},
	{type: 'TILES_CLAIMED',      label: 'Tile claims'},
]

interface Props {
	replay: Replay
	turn: number
	types: Set<EventType>
	civFilter: number | null
	selected: ReplayEvent | null
	onToggleType: (type: EventType) => void
	onCivFilter: (civId: number | null) => void
	onSelect: (event: ReplayEvent) => void
}

export function EventLog({replay, turn, types, civFilter, selected, onToggleType, onCivFilter, onSelect}: Props) {
	const listRef = useRef<HTMLDivElement>(null)

	const filtered = useMemo(
		() => replay.events.filter(e => types.has(e.type) && (civFilter === null || e.civId === civFilter)),
		[replay, types, civFilter],
	)

	// Events up to the current turn, grouped by turn
	const groups = useMemo(() => {
		const out: {turn: number; events: ReplayEvent[]}[] = []
		for (const e of filtered) {
			if (e.turn > turn) break
			const last = out[out.length - 1]
			if (last && last.turn === e.turn) last.events.push(e)
			else out.push({turn: e.turn, events: [e]})
		}
		return out
	}, [filtered, turn])

	// Follow the newest events as the turn advances
	useEffect(() => {
		const el = listRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [groups.length, turn])

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
			</div>

			<div className="event-list" ref={listRef}>
				{groups.length === 0 && <div className="empty">No events yet.</div>}
				{groups.map(g => (
					<section key={g.turn}>
						<h4>Turn {g.turn}</h4>
						<ul>
							{g.events.map((e, i) => {
								const civ = replay.civs[e.civId]
								const color = civ ? civColor(civ.name, civ.isCityState) : null
								const clickable = e.tiles.length > 0
								return (
									<li
										key={`${e.index}-${i}`}
										className={`event type-${e.type.toLowerCase()} ${selected === e ? 'selected' : ''} ${clickable ? 'clickable' : ''}`}
										onClick={() => clickable && onSelect(e)}
										style={color ? {borderLeftColor: rgb(color.territory)} : undefined}
										title={clickable ? 'Show on map' : undefined}
									>
										{e.text}
									</li>
								)
							})}
						</ul>
					</section>
				))}
			</div>
		</div>
	)
}
