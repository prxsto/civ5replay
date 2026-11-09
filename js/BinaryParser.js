var BinaryParser = function(file, size) {
	this.view = new jDataView(file, 0, size, false)

	return this
}

BinaryParser.prototype.parseItem = function(itemConfig, includeJunk) {
	if (typeof itemConfig === 'string') {
		itemConfig = {type: itemConfig}
	}

	if (typeof itemConfig == 'function') {
		// Custom handler - may return a value
		return itemConfig.call(this)
	}

	switch (itemConfig.type) {
		case 'byte':   return this.getBytes(itemConfig.length)
		case 'str':    return this.getString(itemConfig.length)
		case 'guid':   return this.getGuid()
		case 'varstr': return this.getVarString()
		case 'int32':  return this.getInt32()
		case 'int16':  return this.getInt16()
		case 'int8':   return this.getInt8()
		case 'until':  return this.getUntil(itemConfig.value)
		case 'tell':   return this.tell()
		case 'array':  return this.getArray(itemConfig.items, includeJunk)

		default:
			break
	}
}

BinaryParser.prototype.parseItems = function(itemConfigs, includeJunk) {
	if (itemConfigs.type == 'array') {
		return this.parseItem(itemConfigs, includeJunk)
	}

	// Takes dictionary of configs
	var data = {}

	_.each(itemConfigs, (type, key) => {
		var value = this.parseItem(type, includeJunk)

		// Bail if we don't want to include junk data
		if (key.startsWith('_') && includeJunk === false) {return}

		data[key] = value
	})

	return data
}

BinaryParser.prototype.tell = function() {
	return this.view.tell()
}

BinaryParser.prototype.seek = function(offset) {
	return this.view.seek(offset)
}

BinaryParser.prototype.size = function() {
	return this.view.byteLength
}

// Read an int32 at an absolute offset without moving the cursor
BinaryParser.prototype.peekInt32 = function(offset) {
	if (offset === undefined) {offset = this.tell()}
	if (offset < 0 || offset + 4 > this.size()) {return null}
	var start = this.tell()
	var value = this.view.getInt32(offset, true)
	this.seek(start)
	return value
}

// Try a parsing function; on exception, rewind and return undefined
BinaryParser.prototype.attempt = function(fn) {
	var start = this.tell()

	try {
		return fn.call(this)
	}
	catch (e) {
		this.seek(start)
		return undefined
	}
}

BinaryParser.prototype.getBytes = function(length) {
	return this.view.getBytes(length)
}

BinaryParser.prototype.getString = function(length) {
	// Civ V writes strings as UTF-8 (city names with accents, arrows, etc.)
	return this.view.getString(length, undefined, 'utf8')
}

BinaryParser.prototype.getGuid = function() {
	// 16 raw bytes, returned as a hex string
	var bytes = this.getBytes(16)
	return Array.prototype.map.call(bytes, b => ('0' + b.toString(16)).slice(-2)).join('')
}

BinaryParser.prototype.getInt32 = function() {
	return this.view.getInt32(this.tell(), true)
}

BinaryParser.prototype.getInt16 = function() {
	return this.view.getInt16(this.tell(), true)
}

BinaryParser.prototype.getInt8 = function() {
	return this.view.getInt8(this.tell(), true)
}

BinaryParser.prototype.getUntil = function(test) {
	var result = []
	var val = null

	do {
		val = this.getInt8()
		result.push(val)
	} while (val != test)

	return result
}

BinaryParser.prototype.getVarString = function() {
	// Variable-length string - uses first four bytes to specify length
	var length = this.getInt32()
	var value  = this.getString(length)
	return value
}

BinaryParser.prototype.getArray = function(config, includeJunk) {
	var length  = this.getInt32()
	var records = []

	for (var i = 0; i < length; i++) {
		var record = {}

		if (typeof config == 'function') {
			record = config(i, includeJunk)
		}
		else if (typeof config == 'object') {
			record = this.parseItems(config, includeJunk)
		}

		records.push(record)
	}

	return records
}