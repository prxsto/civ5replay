/** Little-endian cursor over an ArrayBuffer. */
export class BinaryReader {
	private view: DataView
	private bytes: Uint8Array
	private utf8 = new TextDecoder('utf-8')
	offset = 0

	constructor(buffer: ArrayBuffer) {
		this.view  = new DataView(buffer)
		this.bytes = new Uint8Array(buffer)
	}

	get size() {
		return this.bytes.length
	}

	seek(offset: number) {
		if (offset < 0 || offset > this.size) {
			throw new RangeError(`seek out of bounds: ${offset}`)
		}
		this.offset = offset
	}

	private need(n: number) {
		if (this.offset + n > this.size) {
			throw new RangeError(`read past end of file at ${this.offset} (+${n})`)
		}
	}

	int8() {
		this.need(1)
		return this.view.getInt8(this.offset++)
	}

	int16() {
		this.need(2)
		const v = this.view.getInt16(this.offset, true)
		this.offset += 2
		return v
	}

	int32() {
		this.need(4)
		const v = this.view.getInt32(this.offset, true)
		this.offset += 4
		return v
	}

	/** int32 at an absolute offset without moving the cursor; null if out of range. */
	peekInt32(offset = this.offset): number | null {
		if (offset < 0 || offset + 4 > this.size) return null
		return this.view.getInt32(offset, true)
	}

	raw(n: number) {
		this.need(n)
		const out = this.bytes.subarray(this.offset, this.offset + n)
		this.offset += n
		return out
	}

	/** Fixed-length ASCII string. */
	ascii(n: number) {
		return String.fromCharCode(...this.raw(n))
	}

	/** int32 length prefix + UTF-8 bytes. */
	string() {
		const length = this.int32()
		if (length < 0) throw new RangeError(`negative string length at ${this.offset - 4}`)
		return this.utf8.decode(this.raw(length))
	}

	guid() {
		return Array.from(this.raw(16), b => b.toString(16).padStart(2, '0')).join('')
	}

	/** int32 count + `count` items. */
	array<T>(readItem: (i: number) => T): T[] {
		const count = this.int32()
		if (count < 0 || count > this.size) throw new RangeError(`bad array length ${count} at ${this.offset - 4}`)
		const out: T[] = new Array(count)
		for (let i = 0; i < count; i++) out[i] = readItem(i)
		return out
	}

	/** Is there a length-prefixed string of printable bytes at `offset`? */
	isPlausibleString(offset: number, min: number, max: number) {
		const length = this.peekInt32(offset)
		if (length === null || length < min || length > max) return false
		if (offset + 4 + length > this.size) return false
		for (let i = offset + 4; i < offset + 4 + length; i++) {
			const b = this.bytes[i]
			if (b < 0x20 && b !== 0x09) return false
		}
		return true
	}

	/** Run `fn`; if it throws, rewind and return undefined. */
	attempt<T>(fn: () => T): T | undefined {
		const start = this.offset
		try {
			return fn()
		}
		catch {
			this.offset = start
			return undefined
		}
	}
}
