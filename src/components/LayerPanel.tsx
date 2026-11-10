import {useState} from 'react'
import type {Layers} from '../map/renderer'

export const LAYER_INFO: {key: keyof Layers; label: string; hotkey: string}[] = [
	{key: 'terrain',   label: 'Terrain',         hotkey: 't'},
	{key: 'features',  label: 'Features',        hotkey: 'f'},
	{key: 'elevation', label: 'Hills & mountains', hotkey: 'e'},
	{key: 'wonders',   label: 'Natural wonders', hotkey: 'w'},
	{key: 'territory', label: 'Territory',       hotkey: 'r'},
	{key: 'borders',   label: 'Borders',         hotkey: 'b'},
	{key: 'cities',    label: 'Cities & names',  hotkey: 'c'},
	{key: 'fires',     label: 'Burning cities',  hotkey: 'x'},
	{key: 'grid',      label: 'Hex grid',        hotkey: 'g'},
]

interface Props {
	layers: Layers
	onToggle: (key: keyof Layers) => void
}

export function LayerPanel({layers, onToggle}: Props) {
	const [open, setOpen] = useState(false)

	return (
		<div className={`layer-panel ${open ? 'open' : ''}`}>
			<button className="layer-panel-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
				Layers <span className="chevron">{open ? '▾' : '▸'}</span>
			</button>
			{open && (
				<ul>
					{LAYER_INFO.map(({key, label, hotkey}) => (
						<li key={key}>
							<label>
								<input type="checkbox" checked={layers[key]} onChange={() => onToggle(key)} />
								<span>{label}</span>
								<kbd>{hotkey.toUpperCase()}</kbd>
							</label>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
