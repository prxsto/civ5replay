

// FeatureInfos order in the base game + DLC (index == featureId)
var FEATURE_NAMES = {
	 0: 'ICE',            1: 'JUNGLE',          2: 'MARSH',          3: 'OASIS',
	 4: 'FLOOD_PLAINS',   5: 'FOREST',          6: 'FALLOUT',        7: 'CRATER',
	 8: 'FUJI',           9: 'MESA',           10: 'REEF',          11: 'VOLCANO',
	12: 'GIBRALTAR',     13: 'GEYSER',         14: 'FOUNTAIN_YOUTH', 15: 'POTOSI',
	16: 'EL_DORADO',     17: 'ATOLL',          18: 'SRI_PADA',      19: 'MT_SINAI',
	20: 'MT_KAILASH',    21: 'ULURU',          22: 'LAKE_VICTORIA', 23: 'KILIMANJARO',
	24: 'SOLOMONS_MINES'
}

var Replay = function(file, size) {
	this.parser   = new BinaryParser(file, size)
	this.meta     = {}
	this.players  = []
	this.cities   = []
	this.messages = []
	this.datasets = []
	this.map      = []

	var eventItemConfig = {
		turn:   'int32',
		typeId: 'int32',
		tiles: {
			type: 'array',
			items: {
				x: 'int16',
				y: 'int16'
			}
		},
		civId: 'int32',
		text: 'varstr'
	}

	this.fileConfig = {
		game:        {type: 'str', length: 0x04}, // CIV5
		_0:          'int32', // 01 00 00 0g0
		version:     'varstr',
		build:       'varstr',
		_1:          {type: 'byte', length: 0x05}, // 41 01 00 00 01 ?
		playerCiv:   'varstr',
		difficulty:  'varstr',
		eraStart:    'varstr',
		eraEnd:      'varstr',
		gameSpeed:   'varstr',
		worldSize:   'varstr',
		mapScript:   'varstr',
		dlc: {
			type: 'array',
			items: {
				id:      'guid',
				enabled: 'int32',
				name:    'varstr'
			}
		},
		mods: {
			type: 'array',
			items: {
				id:      'varstr',
				version: 'int32',
				name:    'varstr'
			}
		},
		_2:            'varstr', // 00 00 00 00
		_3:            'varstr', // 00 00 00 00
		playerColor:   'varstr',
		_4: function() {
			// Unknown int32, sometimes followed by 4 more bytes before mapScript2:
			//   BNW-era (2013):  01 00 00 00 00 00 00 00
			//   1.0.3.279:       06 00 00 00
			// Pick whichever offset holds a plausible, non-empty string.
			var start = this.tell()

			for (var skip = 4; skip <= 16; skip += 4) {
				if (isPlausibleString(this, start + skip, 1, 2048)) {
					this.seek(start + skip)
					return
				}
			}

			this.seek(start + 8) // legacy layout
		},
		mapScript2:    'varstr',
		_5: function() {
			// Variable-length block of game options we don't decode yet. Rather
			// than parse it, scan forward for the [startTurn, startYear, endTurn,
			// endYear, zeroStartYear, zeroEndYear, civs...] sequence and validate it.
			var start = this.tell()
			var limit = Math.min(this.size() - 32, start + 8192)

			for (var o = start; o < limit; o++) {
				if (looksLikeTurnHeader(this, o)) {
					this.seek(o)
					return
				}
			}

			// Fall back to the original heuristic: read int32s until we hit
			// something that looks like the (misaligned) start year, then rewind
			this.seek(start)
			var unknown = 0

			while (Math.abs(unknown) < 100000) {
				unknown = this.getInt32()
			}

			this.seek(this.tell() - 7)
		},
		startTurn:     'int32',
		startYear:     'int32',
		endTurn:       'int32',
		endYear:       'varstr',
		zeroStartYear: 'int32',
		zeroEndYear:   'int32',
		civs: {
			type: 'array',
			items: {
				_1:       'int32',
				_2:       'int32',
				_3:       'int32',
				_4:       'int32',
				leader:   'varstr',
				longName: 'varstr',
				name:     'varstr',
				demonym:  'varstr'
			}
		},
		datasets: {
			type: 'array',
			items: {
				key: 'varstr'
			}
		},
		datasetValues: {
			type: 'array',
			items: {
				type: 'array',
				items: {
					type: 'array',
					items: {
						turn:  'int32',
						value: 'int32'
					}
				}
			}
		},
		_7: function() {
			// BNW-era files have an extra int32 before the events array; 1.0.3.279
			// (and Vox Populi) files don't. Trial-parse the rest of the file both
			// ways and keep the alignment that lands exactly on a valid tile grid.
			var start = this.tell()

			for (var skip of [0, 4]) {
				this.seek(start + skip)

				var ok = this.attempt(function() {
					this.getArray(eventItemConfig, false)
					var w = this.getInt32()
					var h = this.getInt32()
					var n = this.getInt32()
					return w > 0 && h > 0 && w < 1024 && h < 1024 && n == w * h
				})

				if (ok) {
					this.seek(start + skip)
					return
				}
			}

			this.seek(start + 4) // legacy layout
		},
		events: {
			type: 'array',
			items: eventItemConfig
		},
		mapWidth:  'int32',
		mapHeight: 'int32',
		tiles: {
			type: 'array',
			items: {
				_1:          'int32', // always 1?
				_2:          'int32', // last turn of the game
				elevationId: 'int8',
				typeId:      'int8',
				featureId:   'int8',
				_5:          'int8'
			}
		}
	}

	return this
}

// Is there a length-prefixed string at `offset` with a length in [min, max]
// made only of printable bytes?
function isPlausibleString(parser, offset, min, max) {
	var length = parser.peekInt32(offset)
	if (length === null || length < min || length > max) {return false}
	if (offset + 4 + length > parser.size()) {return false}

	var bytes = new Uint8Array(parser.view.buffer, parser.view.byteOffset + offset + 4, length)

	for (var i = 0; i < bytes.length; i++) {
		if (bytes[i] < 0x20 && bytes[i] != 0x09) {return false}
	}

	return true
}

// Does `o` point at startTurn, followed by a sane year/turn/civ-list layout?
function looksLikeTurnHeader(parser, o) {
	var startTurn = parser.peekInt32(o)
	var startYear = parser.peekInt32(o + 4)
	var endTurn   = parser.peekInt32(o + 8)

	if (startTurn === null || startTurn < 0 || startTurn > 2000)     {return false}
	if (startYear === null || Math.abs(startYear) > 100000)          {return false}
	if (endTurn   === null || endTurn < startTurn || endTurn > 5000) {return false}
	if (!isPlausibleString(parser, o + 12, 1, 64))                   {return false}

	// endYear string, then zeroStartYear + zeroEndYear, then the civs array
	var afterYear = o + 16 + parser.peekInt32(o + 12)
	var civCount  = parser.peekInt32(afterYear + 8)
	if (civCount === null || civCount < 1 || civCount > 128) {return false}

	// First civ: four int32s, then the leader name string
	return isPlausibleString(parser, afterYear + 12 + 16, 1, 256)
}

// Strip Civ V text markup like [COLOR_POSITIVE_TEXT], [ENDCOLOR], [ICON_PEACE], [NEWLINE]
function stripMarkup(text) {
	if (!text) {return text}
	return text
		.replace(/\[NEWLINE\]/g, ' ')
		.replace(/\[(COLOR_[A-Z_]+|ENDCOLOR|ICON_[A-Z_0-9]+)\]/g, '')
		.replace(/\s+([.,;:)])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim()
}

Replay.prototype.process = function() {
	// Do initial basic parsing
	this.rawData = this.parser.parseItems(this.fileConfig, false)

	// Store everything but civs / tiles / datasets / events in this.meta
	this.meta = _.omit(this.rawData, ['civs', 'datasets', 'datasetValues', 'events', 'tiles'])

	// Civs are fine as is
	this.civs = this.rawData.civs

	// Organize dataset values by civ id and dataset name
	var datasetNames = _.pluck(this.rawData.datasets, 'key')
	this.datasets = _(this.rawData.datasets).chain().pluck('key').map((key, datasetIndex) => {
		return _.pluck(this.rawData.datasetValues, datasetIndex)
	}).value()

	this.datasets = _.zipObject(datasetNames, this.datasets)

	// Add human-readable stuff to events
	var cities = {}
	this.events = []

	_.each(this.rawData.events, (event, i) => {
		// There may be multiple events combined into one to save space
		var eventsToAdd = [event]

		event.index = i
		event.civ   = this.civs[event.civId] ? this.civs[event.civId].name : null
		event.text  = stripMarkup(event.text)

		// Add type name
		switch (event.typeId) {
			case 0:  event.type  = 'MESSAGE';            break
			case 1:  event.type  = 'CITY_FOUNDED';       break
			case 2:  event.type  = 'TILES_CLAIMED';      break
			case 3:  event.type  = 'CITIES_TRANSFERRED'; break
			case 4:  event.type  = 'CITY_RAZED';         break
			case 5:  event.type  = 'RELIGION_FOUNDED';   break
			case 6:  event.type  = 'PANTHEON_SELECTED';  break
			default: event.type  = event.typeId;         break
		}

		// Add x/y reference to keep things easy
		if (event.tiles.length == 1 && event.type != 'TILES_CLAIMED' && event.type != 'CITIES_CLAIMED') {
			event.x = event.tiles[0].x
			event.y = event.tiles[0].y
		}

		if (event.type == 'CITY_FOUNDED') {
			// Keep track of the city
			var cityName = event.text.replace(' is founded.', '')
			event.city = {name: cityName, owner: event.civ}
			cities[event.x + ',' + event.y] = event.city
		}
		else if (event.type == 'CITY_RAZED') {
			event.x    = event.tiles[0].x
			event.y    = event.tiles[0].y
			event.city = cities[event.x + ',' + event.y] || {name: 'A city'}
			event.text = `${event.city.name} has been burned to the ground by ${event.civ}!`

			// Mass razings are compounded into one event; we want to separate them
			_.each(event.tiles.slice(1), tile => {
				var eventCopy  = Object.assign({}, event)
				eventCopy.x    = tile.x
				eventCopy.y    = tile.y
				eventCopy.city = cities[eventCopy.x + ',' + eventCopy.y] || {name: 'A city'}
				eventCopy.text = `${eventCopy.city.name} has been burned to the ground by ${eventCopy.civ}!`
				eventsToAdd.push(eventCopy)
			})
		}
		else if (event.type == 'CITIES_TRANSFERRED') {
			var cityNames = _.map(event.tiles, tile => {
				var city = cities[tile.x + ',' + tile.y]
				return city ? city.name : 'an unknown city'
			})

			if (cityNames.length == 1) {
				event.text = `${event.civ} now controls the city of ${cityNames[0]}.`
			}
			else {
				var lastCity = cityNames.pop()

				var citiesString = cityNames.length == 1 ? cityNames[0] : (cityNames.join(', ') + ',')

				event.text = `${event.civ} now controls the cities of ${citiesString} and ${lastCity}.`
			}

			// Egypt now controls the city of Blah.
			// Egypt now controls the cities of Blah and Blah.
			// Egypt now controls the cities of Blah, Blah, and Blah.
		}

		if (event.type == 'TILES_CLAIMED') {
			if (event.civ) {
				event.text = `${event.civ} has claimed ${event.tiles.length} tile${event.tiles.length > 1 ? 's' : ''}.`
			}
			else {
				event.text = `${event.tiles.length} tile${event.tiles.length > 1 ? 's have' : ' has'} been abandoned!`
			}
		}

		this.events = this.events.concat(eventsToAdd)

		// if (!event.text) {
		// 	console.dir(event)
		// }
	})

	// Add human-readable stuff to tiles
	this.tiles = _.each(this.rawData.tiles, (tile, i) => {
		switch (tile.elevationId) {
			case 0:  tile.elevation = 'MOUNTAIN';        break
			case 1:  tile.elevation = 'HILLS';           break
			case 2:  tile.elevation = 'ABOVE_SEA_LEVEL'; break
			case 3:  tile.elevation = 'BELOW_SEA_LEVEL'; break
			default: tile.elevation = tile.elevationId;  break
		}

		switch (tile.typeId) {
			case 0:  tile.type = 'GRASSLAND'; break
			case 1:  tile.type = 'PLAINS';    break
			case 2:  tile.type = 'DESERT';    break
			case 3:  tile.type = 'TUNDRA';    break
			case 4:  tile.type = 'SNOW';      break
			case 5:  tile.type = 'COAST';     break
			case 6:  tile.type = 'OCEAN';     break
			case 7:  tile.type = 'MOUNTAIN';  break
			case 8:  tile.type = 'HILL';      break
			default: tile.type = tile.typeId; break
		}

		tile.feature = FEATURE_NAMES[tile.featureId] || (tile.featureId == -1 ? 'NO_FEATURE' : tile.featureId)
		tile.naturalWonder = tile.featureId >= 7 && tile.featureId != 17 && !!FEATURE_NAMES[tile.featureId]
	})

	// Chunk the tiles a 2D array
	this.tiles = _.chunk(this.tiles, this.meta.mapWidth)

	for (var y = 0; y < this.tiles.length; y++) {
		for (var x = 0; x < this.tiles[y].length; x++) {
			this.tiles[y][x].x = x
			this.tiles[y][x].y = y
		}
	}
}

