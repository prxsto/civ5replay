import type {Civ, Replay, ReplayEvent} from '../parser/types'
import {civColor, readable} from './civColors'

/*
 * Colour-coding for the event feed. Each message gets a category (which sets its
 * accent colour), and its text is split into spans so civ names show in their
 * civ colour and the key phrase ("declares war on", "golden age", a wonder's
 * name...) shows in the category colour.
 */

export type Category =
	| 'victory'
	| 'war'
	| 'capture'
	| 'raze'
	| 'peace'
	| 'diplomacy'
	| 'golden'
	| 'wonder'
	| 'science'
	| 'culture'
	| 'religion'
	| 'founded'
	| 'info'

export const CATEGORY_INFO: Record<Category, {label: string; color: string}> = {
	victory:   {label: 'Victory',            color: '#ffd76a'},
	war:       {label: 'War declared',       color: '#ff5f56'},
	capture:   {label: 'Captures & conquest', color: '#cf8f88'},
	raze:      {label: 'Razing',             color: '#ff7a4d'},
	peace:     {label: 'Peace',              color: '#7bd88f'},
	diplomacy: {label: 'Pacts & vassals',    color: '#3fcfd0'},
	golden:    {label: 'Golden age',         color: '#daa520'},
	wonder:    {label: 'Wonders',            color: '#f2a65a'},
	science:   {label: 'Science & space',    color: '#78a6ff'},
	culture:   {label: 'Culture',            color: '#e47bd6'},
	religion:  {label: 'Religion',           color: '#b392ff'},
	founded:   {label: 'New city',           color: '#d8cfb6'},
	info:      {label: 'Other',              color: '#7f8a99'},
}

const VICTORY_COLORS: Record<string, Category> = {
	domination: 'war', science: 'science', scientific: 'science', space: 'science',
	cultural: 'culture', culture: 'culture', diplomatic: 'diplomacy', time: 'golden',
}

/** Key phrases to tint, per category. The whole match is tinted unless the regex has a capture group. */
const PHRASES: Partial<Record<Category, RegExp[]>> = {
	victory:   [/has won an? \w+ Victory/i],
	war:       [/declares war on/],
	capture:   [/was captured by/, /now controls the cit(?:y|ies) of/, /has been conquered/, /has conquered/, /lost their original Capital/, /controls the most original Capitals/],
	raze:      [/was set ablaze by/, /has been burned to the ground by/],
	peace:     [/has made peace with/],
	diplomacy: [/signs defensive pact with/, /has become the vassal of/, /is no longer the vassal of/, /Declaration of Friendship/, /denounced?/i],
	golden:    [/golden age/i],
	wonder:    [/(?:completes|first to complete) (.+?)!*$/],
	science:   [/(?:completes|first to complete) (.+?)!*$/, /proven that the world is round/],
	culture:   [/(?:first to complete) (.+?)!*$/, /Cultural Victory/],
	religion:  [/founded the new religion (.+?) in the holy city/, /pantheon of gods/, /belief: ([^(]+)/],
	founded:   [/is founded/],
}

const SCIENCE_PROJECTS = /\b(SS (?:Booster|Cockpit|Engine|Stasis Chamber)|Apollo Program|Manhattan Project|Hubble|Internet)\b/
const CULTURE_PROJECTS = /\b(Citizen Earth Protocol|Utopia Project)\b/

export function categorize(e: ReplayEvent): Category {
	const t = e.text
	switch (e.type) {
		case 'CITY_RAZED':         return 'raze'
		case 'CITIES_TRANSFERRED': return 'capture'
		case 'RELIGION_FOUNDED':
		case 'PANTHEON_SELECTED':  return 'religion'
		case 'CITY_FOUNDED':       return 'founded'
		case 'TILES_CLAIMED':      return 'info'
	}

	const victory = t.match(/has won an? (\w+) Victory/i)
	if (victory) return 'victory'
	if (/declares war on/.test(t)) return 'war'
	if (/made peace with/.test(t)) return 'peace'
	if (/set ablaze|burned to the ground/.test(t)) return 'raze'
	if (/was captured by|now controls the cit|has been conquered|has conquered|original Capital/.test(t)) return 'capture'
	if (/defensive pact|vassal|Declaration of Friendship|denounce|World Congress|United Nations|World Leader/i.test(t)) return 'diplomacy'
	if (/golden age/i.test(t)) return 'golden'
	if (SCIENCE_PROJECTS.test(t) || /world is round/.test(t)) return 'science'
	if (CULTURE_PROJECTS.test(t) || /tourism|influential|ideology/i.test(t)) return 'culture'
	if (/religion|pantheon|reformation|enhanced/i.test(t)) return 'religion'
	if (/completes|first to complete/.test(t)) return 'wonder'
	return 'info'
}

/** Colour for a victory message, by victory type. */
export function victoryColor(text: string) {
	const type = text.match(/has won an? (\w+) Victory/i)?.[1]?.toLowerCase() ?? ''
	return CATEGORY_INFO[VICTORY_COLORS[type] ?? 'victory'].color
}

export interface Span {
	text: string
	color?: string
	kind?: 'civ' | 'phrase'
}

export interface NameMatcher {
	regex: RegExp | null
	byName: Map<string, Civ>
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One regex matching any civ's name, leader, adjective or long name (longest first). */
export function buildNameMatcher(replay: Replay): NameMatcher {
	const byName = new Map<string, Civ>()
	for (const civ of replay.civs) {
		for (const n of [civ.longName, civ.leader, civ.name, civ.demonym]) {
			if (n && n.length > 2 && !byName.has(n)) byName.set(n, civ)
		}
	}
	const names = [...byName.keys()].sort((a, b) => b.length - a.length)
	return {
		byName,
		regex: names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null,
	}
}

export function civTextColor(civ: Civ) {
	return civ.isCityState ? '#a3a3a3' : readable(civColor(civ.name).territory)
}

export function styleEvent(e: ReplayEvent, category: Category, matcher: NameMatcher): Span[] {
	const text = e.text
	const marks: {start: number; end: number; color: string; kind: 'civ' | 'phrase'}[] = []

	if (matcher.regex) {
		matcher.regex.lastIndex = 0
		for (const m of text.matchAll(matcher.regex)) {
			const civ = matcher.byName.get(m[0])!
			marks.push({start: m.index!, end: m.index! + m[0].length, color: civTextColor(civ), kind: 'civ'})
		}
	}

	const phraseColor = category === 'victory' ? victoryColor(text) : CATEGORY_INFO[category].color
	for (const re of PHRASES[category] ?? []) {
		const m = text.match(re)
		if (!m || m.index === undefined) continue
		let start = m.index
		let end = start + m[0].length
		if (m[1]) {
			start = m.index + m[0].indexOf(m[1])
			end = start + m[1].trimEnd().length
		}
		// Phrases never override civ names
		if (marks.some(k => k.start < end && start < k.end)) continue
		marks.push({start, end, color: phraseColor, kind: 'phrase'})
	}

	marks.sort((a, b) => a.start - b.start)
	const spans: Span[] = []
	let pos = 0
	for (const k of marks) {
		if (k.start < pos) continue
		if (k.start > pos) spans.push({text: text.slice(pos, k.start)})
		spans.push({text: text.slice(k.start, k.end), color: k.color, kind: k.kind})
		pos = k.end
	}
	if (pos < text.length) spans.push({text: text.slice(pos)})
	return spans
}

/** Civs named in a message, in order of first appearance. */
export function civsMentioned(text: string, matcher: NameMatcher): Civ[] {
	if (!matcher.regex) return []
	matcher.regex.lastIndex = 0
	const out: Civ[] = []
	for (const m of text.matchAll(matcher.regex)) {
		const civ = matcher.byName.get(m[0])
		if (civ && !out.includes(civ)) out.push(civ)
	}
	return out
}
