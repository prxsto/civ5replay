import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {parseReplay} from './parser/parseReplay'
import type {EventType, Replay, ReplayEvent} from './parser/types'
import {Timeline} from './model/timeline'
import {DEFAULT_LAYERS, loadTextures, type Layers, type Textures} from './map/renderer'
import {HexMap} from './components/HexMap'
import {TimelineBar, SPEEDS} from './components/TimelineBar'
import {EventLog} from './components/EventLog'
import {StatsPanel} from './components/StatsPanel'
import {LayerPanel, LAYER_INFO} from './components/LayerPanel'

const EXAMPLE = 'replays/wu-zetian-2006-ad.Civ5Replay'
const DEFAULT_TYPES: EventType[] = ['MESSAGE', 'CITY_FOUNDED', 'CITIES_TRANSFERRED', 'CITY_RAZED', 'RELIGION_FOUNDED', 'PANTHEON_SELECTED']

const pretty = (s: string) => s.replace(/^[A-Z]+_/, '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

interface Loaded {
	replay: Replay
	timeline: Timeline
	name: string
}

export function App() {
	const [loaded, setLoaded]     = useState<Loaded | null>(null)
	const [error, setError]       = useState<string | null>(null)
	const [loading, setLoading]   = useState(false)
	const [dragging, setDragging] = useState(false)
	const [textures, setTextures] = useState<Textures | null>(null)
	const [turn, setTurnRaw]      = useState(0)
	const [playing, setPlaying]   = useState(false)
	const [speed, setSpeed]       = useState(2)
	const [layers, setLayers]     = useState<Layers>(DEFAULT_LAYERS)
	const [types, setTypes]       = useState<Set<EventType>>(new Set(DEFAULT_TYPES))
	const [civFilter, setCivFilter] = useState<number | null>(null)
	const [selected, setSelected] = useState<ReplayEvent | null>(null)
	const [tab, setTab]           = useState<'events' | 'stats'>('events')
	const fileInput = useRef<HTMLInputElement>(null)

	useEffect(() => {
		loadTextures().then(setTextures).catch(e => console.warn(e))
	}, [])

	const start = loaded?.timeline.startTurn ?? 0
	const end   = loaded?.timeline.endTurn ?? 0

	const setTurn = useCallback((t: number) => {
		setTurnRaw(Math.max(start, Math.min(end, Math.round(t))))
	}, [start, end])

	const load = useCallback((buffer: ArrayBuffer, name: string, initialTurn?: number) => {
		try {
			const replay   = parseReplay(buffer)
			const timeline = new Timeline(replay)
			setLoaded({replay, timeline, name})
			setError(null)
			setSelected(null)
			setCivFilter(null)
			setPlaying(false)
			const t = initialTurn ?? timeline.startTurn
			setTurnRaw(Math.max(timeline.startTurn, Math.min(timeline.endTurn, t)))
		}
		catch (e) {
			console.error(e)
			setError(`Couldn't read ${name}: ${e instanceof Error ? e.message : e}`)
		}
	}, [])

	const loadUrl = useCallback(async (file: string, initialTurn?: number) => {
		setLoading(true)
		try {
			const url = /^https?:\/\//.test(file) ? file : `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`
			const res = await fetch(url)
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			load(await res.arrayBuffer(), decodeURIComponent(file.split('/').pop() ?? file), initialTurn)
		}
		catch (e) {
			setError(`Couldn't load ${file}: ${e instanceof Error ? e.message : e}`)
		}
		finally {
			setLoading(false)
		}
	}, [load])

	const loadFile = useCallback(async (file: File) => {
		setLoading(true)
		load(await file.arrayBuffer(), file.name)
		setLoading(false)
		// A dropped file isn't linkable; clear any ?file= so the URL doesn't lie
		const params = new URLSearchParams(location.search)
		if (params.has('file')) {
			params.delete('file')
			params.delete('turn')
			history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
		}
	}, [load])

	// ?file=...&turn=...
	useEffect(() => {
		const params = new URLSearchParams(location.search)
		const file = params.get('file')
		const t = params.get('turn')
		if (file) loadUrl(file, t ? Number(t) : undefined)
	}, [loadUrl])

	// Keep ?turn= in sync for linkable replays
	useEffect(() => {
		const params = new URLSearchParams(location.search)
		if (!params.has('file') || !loaded) return
		params.set('turn', String(turn))
		history.replaceState(null, '', `${location.pathname}?${params.toString().replace(/%2F/gi, '/')}`)
	}, [turn, loaded])

	// Playback
	useEffect(() => {
		if (!playing) return
		const id = setInterval(() => {
			setTurnRaw(t => {
				if (t >= end) {
					setPlaying(false)
					return t
				}
				return t + 1
			})
		}, SPEEDS[speed].ms)
		return () => clearInterval(id)
	}, [playing, speed, end])

	const togglePlay = useCallback(() => {
		if (!playing && turn >= end) setTurnRaw(start)
		setPlaying(p => !p)
	}, [playing, turn, start, end])

	const toggleLayer = useCallback((key: keyof Layers) => setLayers(l => ({...l, [key]: !l[key]})), [])

	// Keyboard shortcuts
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!loaded || e.metaKey || e.ctrlKey || e.altKey) return
			if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return
			if (e.target instanceof HTMLSelectElement) return

			const layer = LAYER_INFO.find(l => l.hotkey === e.key.toLowerCase())
			if (layer) {
				toggleLayer(layer.key)
				return
			}

			switch (e.key) {
				case ' ':          togglePlay(); break
				case 'ArrowLeft':  setTurn(turn - 1); break
				case 'ArrowRight': setTurn(turn + 1); break
				case 'ArrowUp':    setTurn(turn - 10); break
				case 'ArrowDown':  setTurn(turn + 10); break
				case 'Home':
				case 'PageUp':     setTurn(start); break
				case 'End':
				case 'PageDown':   setTurn(end); break
				case '1': case '2': case '3': case '4': case '5':
					setSpeed(Number(e.key) - 1)
					break
				case 'Escape':     setSelected(null); break
				default: return
			}
			e.preventDefault()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [loaded, turn, start, end, togglePlay, setTurn, toggleLayer])

	// Whole-window drag and drop
	useEffect(() => {
		let depth = 0
		const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDragging(true) }
		const leave = () => { if (--depth <= 0) { depth = 0; setDragging(false) } }
		const over  = (e: DragEvent) => e.preventDefault()
		const drop  = (e: DragEvent) => {
			e.preventDefault()
			depth = 0
			setDragging(false)
			const file = e.dataTransfer?.files[0]
			if (file) loadFile(file)
		}
		window.addEventListener('dragenter', enter)
		window.addEventListener('dragleave', leave)
		window.addEventListener('dragover', over)
		window.addEventListener('drop', drop)
		return () => {
			window.removeEventListener('dragenter', enter)
			window.removeEventListener('dragleave', leave)
			window.removeEventListener('dragover', over)
			window.removeEventListener('drop', drop)
		}
	}, [loadFile])

	const state = useMemo(() => loaded?.timeline.state(turn), [loaded, turn])

	const eventCounts = useMemo(() => {
		const counts = new Map<number, number>()
		if (!loaded) return counts
		for (const e of loaded.replay.events) {
			if (e.type === 'TILES_CLAIMED') continue
			counts.set(e.turn, (counts.get(e.turn) ?? 0) + 1)
		}
		return counts
	}, [loaded])

	const selectEvent = useCallback((e: ReplayEvent) => {
		setSelected(prev => prev === e ? null : e)
	}, [])

	const toggleType = useCallback((type: EventType) => {
		setTypes(prev => {
			const next = new Set(prev)
			if (next.has(type)) next.delete(type)
			else next.add(type)
			return next
		})
	}, [])

	const meta = loaded?.replay.meta
	const playerCiv = meta ? pretty(meta.playerCiv) : ''

	return (
		<div className={`app ${dragging ? 'dragging' : ''}`}>
			<header className="app-header">
				<h1>Civ V Replay Viewer</h1>
				{meta && (
					<div className="game-meta" title={loaded?.name}>
						<span className="meta-civ">{playerCiv}</span>
						<span>{pretty(meta.difficulty)}</span>
						<span>{pretty(meta.worldSize)}</span>
						<span>{pretty(meta.gameSpeed)}</span>
						<span>{meta.mapWidth}×{meta.mapHeight}</span>
						{meta.mods.length > 0 && <span title={meta.mods.map(m => m.name).join('\n')}>{meta.mods.length} mod{meta.mods.length > 1 ? 's' : ''}</span>}
					</div>
				)}
				<div className="header-actions">
					<button className="btn" onClick={() => fileInput.current?.click()}>Open replay…</button>
					<input ref={fileInput} type="file" accept=".Civ5Replay" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = '' }} />
				</div>
			</header>

			{error && (
				<div className="error-banner" role="alert">
					{error}
					<button onClick={() => setError(null)} aria-label="Dismiss">×</button>
				</div>
			)}

			{!loaded ? (
				<main className="welcome">
					<div className="welcome-card">
						<h2>Watch a Civilization V game unfold</h2>
						<p>Drop a <code>.Civ5Replay</code> file anywhere on this page, or open one.</p>
						<p className="muted">Replays are saved in <code>Documents/My Games/Sid Meier's Civilization 5/Replays</code>. Everything runs in your browser — nothing is uploaded.</p>
						<div className="welcome-actions">
							<button className="btn primary" onClick={() => fileInput.current?.click()} disabled={loading}>Open replay…</button>
							<button className="btn" onClick={() => { history.replaceState(null, '', `${location.pathname}?file=${EXAMPLE}`); loadUrl(EXAMPLE) }} disabled={loading}>{loading ? 'Loading…' : 'Try an example'}</button>
						</div>
					</div>
				</main>
			) : (
				<main className="viewer">
					<section className="map-area">
						{state && (
							<HexMap
								replay={loaded.replay}
								state={state}
								layers={layers}
								textures={textures}
								highlight={selected?.tiles ?? null}
							/>
						)}
						<LayerPanel layers={layers} onToggle={toggleLayer} />
					</section>

					<aside className="sidebar">
						<div className="tabs" role="tablist">
							<button role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Events</button>
							<button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Stats</button>
						</div>
						{tab === 'events' ? (
							<EventLog
								replay={loaded.replay}
								turn={turn}
								types={types}
								civFilter={civFilter}
								selected={selected}
								onToggleType={toggleType}
								onCivFilter={setCivFilter}
								onSelect={selectEvent}
							/>
						) : (
							<StatsPanel replay={loaded.replay} turn={turn} onTurn={setTurn} />
						)}
					</aside>

					<TimelineBar
						replay={loaded.replay}
						turn={turn}
						start={start}
						end={end}
						playing={playing}
						speed={speed}
						eventCounts={eventCounts}
						onTurn={setTurn}
						onTogglePlay={togglePlay}
						onSpeed={setSpeed}
					/>
				</main>
			)}

			{dragging && <div className="drop-overlay">Drop to load replay</div>}
		</div>
	)
}
