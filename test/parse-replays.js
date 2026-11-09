#!/usr/bin/env node
// Headless parser check: node test/parse-replays.js file1.Civ5Replay [file2 ...]
// Loads the browser parser code in a Node VM and validates the result.
const fs = require('fs'), vm = require('vm'), path = require('path')
const root = path.join(__dirname, '..')

function loadReplayClass() {
	const ctx = {console, Math, Object, Array, String, Number, DataView, ArrayBuffer, Uint8Array, TextDecoder, window: {}}
	vm.createContext(ctx)
	for (const f of ['lib/lodash.js', 'lib/jdataview.js', 'js/BinaryParser.js', 'js/Replay.js']) {
		vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, {filename: f})
	}
	return ctx.Replay
}

const Replay = loadReplayClass()
let failures = 0

for (const file of process.argv.slice(2)) {
	const buf = fs.readFileSync(file)
	const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)
	const errors = []
	let r

	try {
		r = new Replay(ab, buf.length)
		r.process()
	}
	catch (e) {
		errors.push('parse threw: ' + e.message)
	}

	if (r && r.rawData) {
		const m = r.meta
		if (r.parser.tell() != buf.length)                  errors.push(`stopped at byte ${r.parser.tell()} of ${buf.length}`)
		if (r.rawData.tiles.length != m.mapWidth * m.mapHeight) errors.push('tile count mismatch')
		if (!r.civs.length)                                  errors.push('no civs')
		if (!r.events.length)                                errors.push('no events')
		if (r.events.some(e => e.turn < m.startTurn || e.turn > m.endTurn)) errors.push('event turn out of range')
		const unknownTypes = r.rawData.tiles.filter(t => typeof t.type == 'number').length
		if (unknownTypes) errors.push(`${unknownTypes} tiles with unknown terrain type`)

		console.log(`${errors.length ? 'FAIL' : 'PASS'}  ${path.basename(file)}`)
		console.log(`      ${m.version} | ${m.playerCiv} | ${m.mapWidth}x${m.mapHeight} | turns ${m.startTurn}-${m.endTurn} (${m.endYear})`)
		console.log(`      ${r.civs.length} civs, ${Object.keys(r.datasets).length} datasets, ${r.events.length} events, ${m.mods.length} mods, ${m.dlc.length} DLC`)
	}
	else {
		console.log(`FAIL  ${path.basename(file)}`)
	}

	errors.forEach(e => console.log('      ! ' + e))
	if (errors.length) failures++
}

process.exit(failures ? 1 : 0)
