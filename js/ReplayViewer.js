window.ReplayViewer = function() {
	this.init()
	return this
}

ReplayViewer.prototype.init = function() {
	this.map = new ReplayMap()

	// Support file drag-and-drop
	$('body').fileReaderJS({
		readAsDefault: 'ArrayBuffer',
		on: {
			loadend: (e, file) => {
				this.process(e.target.result, file.size)
			}
		}
	})

	this.file = getParameterByName('file')
	this.turn = getParameterByName('turn')

	if (this.file) {
		this.loadFromUrl(this.file)
	}

	function getParameterByName(name) {
		// Thanks StackOverflow!
		name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]')
		var regex = new RegExp('[\\?&]' + name + '=([^&#]*)')
		var results = regex.exec(location.search)
		return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '))
	}
}

ReplayViewer.prototype.loadFromUrl = function(file) {
	// `file` is either a path relative to the site (e.g. replays/foo.Civ5Replay)
	// or a full URL to a host that allows cross-origin requests.
	// (The old Dropbox /1/view/ API this used to rely on has been retired.)
	var url = /^https?:\/\//.test(file) ? file : encodeURI(file)

	fetch(url)
		.then(response => {
			if (!response.ok) {throw new Error(`HTTP ${response.status}`)}
			return response.arrayBuffer()
		})
		.then(buffer => this.process(buffer, buffer.byteLength))
		.catch(err => console.error(`Couldn't load replay from ${url}:`, err))
}

ReplayViewer.prototype.process = function(data, length) {
	// Replay
	if (this.replay) {delete this.replay}

	this.replay = new Replay(data, length)
	this.replay.process()

	// Event log
	if (this.eventLog) {
		$('.log-messages').empty()
		delete this.eventLog
	}

	this.eventLog = new EventLog(this.replay.events)

	// Map
	_.each(this.map.layers, layer => {
		this.map.map.removeLayer(layer)
		delete layer
	})

	_.each(this.map.controls, control => {
		this.map.map.removeControl(control)
		delete control
	})

	this.map.initLayers(this.replay.tiles, this.replay.events, this.replay.meta.startTurn, this.replay.meta.endTurn)

	if (this.controlBar) {this.controlBar.pause()}

	this.controlBar = new ControlBar({
		start:   this.replay.meta.startTurn,
		end:     this.replay.meta.endTurn,
		initial: this.turn === '' ? this.replay.meta.startTurn : (this.turn * 1),
		onChange: turn => {
			this.eventLog.renderTurn(turn)
			this.map     .renderTurn(turn)
		}
	})

	return false
}