export async function _unpack_struct_from_async(structure, async_buf, offset = 0) {
  var output = new Map();
  for (let [key, fmt] of structure.entries()) {
    let value = await struct.unpack_from_async('<' + fmt, async_buf, offset);
    offset += struct.calcsize(fmt);
    if (value.length == 1) { value = value[0] };
    output.set(key, value);
  }
  return output
}

export function _unpack_struct_from(structure, buf, offset = 0) {
  var output = new Map();
  for (let [key, fmt] of structure.entries()) {
    let value = struct.unpack_from('<' + fmt, buf, offset);
    offset += struct.calcsize(fmt);
    if (value.length == 1) { value = value[0] };
    output.set(key, value);
  }
  return output
}

export function assert(thing) {
  if (!thing) { thing() }
}

export function _structure_size(structure) {
  //""" Return the size of a structure in bytes. """
  var fmt = '<' + Array.from(structure.values()).join('');
  return struct.calcsize(fmt);
}

export function _padded_size(size, padding_multiple = 8) {
  //""" Return the size of a field padded to be a multiple a given value. """
  return (Math.ceil(size / padding_multiple) * padding_multiple);
}

var dtype_to_format = {
  "u": "Uint",
  "i": "Int",
  "f": "Float"
}

export function dtype_getter(dtype_str) {
  var big_endian = struct._is_big_endian(dtype_str);
  var getter, nbytes;
  if (/S/.test(dtype_str)) {
    // string type
    getter = "getString";
    nbytes = ((dtype_str.match(/S(\d*)/) || [])[1] || 1) | 0;
  }
  else {
    let [_, fstr, bytestr] = dtype_str.match(/[<>=!@]?(i|u|f)(\d*)/);
    nbytes = parseInt(bytestr || 4, 10);
    let nbits = nbytes * 8;
    getter = "get" + dtype_to_format[fstr] + nbits.toFixed();
  }
  return [getter, big_endian, nbytes];
}

// Pretty sure we can just use a number for this...
export class Reference {
  /*
  """
  HDF5 Reference.
  """
  */
  constructor(address_of_reference) {
    this.address_of_reference = address_of_reference;
  }

  __bool__() {
    return (this.address_of_reference != 0);
  }
}

class Struct {
  constructor() {
    this.big_endian = isBigEndian();
    this.getters = {
      "s": "getUint8",
      "b": "getInt8",
      "B": "getUint8",
      "h": "getInt16",
      "H": "getUint16",
      "i": "getInt32",
      "I": "getUint32",
      "l": "getInt32",
      "L": "getUint32",
      "q": "getInt64",
      "Q": "getUint64",
      "f": "getFloat32",
      "d": "getFloat64"
    }
    this.byte_lengths = {
      "s": 1,
      "b": 1,
      "B": 1,
      "h": 2,
      "H": 2,
      "i": 4,
      "I": 4,
      "l": 4,
      "L": 4,
      "q": 8,
      "Q": 8,
      "f": 4,
      "d": 8
    }
    let all_formats = Object.keys(this.byte_lengths).join('');
    this.fmt_size_regex = '(\\d*)([' + all_formats + '])';
  }
  calcsize(fmt) {
    var size = 0;
    var match;
    var regex = new RegExp(this.fmt_size_regex, 'g');
    while ((match = regex.exec(fmt)) !== null) {
      let n = parseInt(match[1] || 1, 10);
      let f = match[2];
      let subsize = this.byte_lengths[f];
      size += n * subsize;
    }
    return size;
  }
  _is_big_endian(fmt) {
    var big_endian;
    if (/^</.test(fmt)) {
      big_endian = false;
    }
    else if (/^(!|>)/.test(fmt)) {
      big_endian = true;
    }
    else {
      big_endian = this.big_endian;
    }
    return big_endian;
  }
  async unpack_from_async(fmt, async_buf, offset) {
    var offset = Number(offset || 0);
    const total_size = this.calcsize(fmt);
    const local_buffer = await async_buf.slice(offset, offset + total_size);
    let local_offset = 0;
    var view = new DataView64(local_buffer);
    var output = [];
    var big_endian = this._is_big_endian(fmt);
    var match;
    var regex = new RegExp(this.fmt_size_regex, 'g');
    while ((match = regex.exec(fmt)) !== null) {
      let n = parseInt(match[1] || 1, 10);
      let f = match[2];
      let getter = this.getters[f];
      let size = this.byte_lengths[f];
      if (f == 's') {
        output.push(new TextDecoder().decode(local_buffer.slice(local_offset, local_offset + n)));
        local_offset += n;
      }
      else {
        for (var i = 0; i < n; i++) {
          output.push(view[getter](local_offset, !big_endian));
          local_offset += size;
        }
      }
    }
    return output
  }

  unpack_from(fmt, buffer, offset) {
    var offset = Number(offset || 0);
    const total_size = this.calcsize(fmt);
    const local_buffer = buffer.slice(offset, offset + total_size);
    let local_offset = 0;
    var view = new DataView64(local_buffer);
    var output = [];
    var big_endian = this._is_big_endian(fmt);
    var match;
    var regex = new RegExp(this.fmt_size_regex, 'g');
    while ((match = regex.exec(fmt)) !== null) {
      let n = parseInt(match[1] || 1, 10);
      let f = match[2];
      let getter = this.getters[f];
      let size = this.byte_lengths[f];
      if (f == 's') {
        output.push(new TextDecoder().decode(local_buffer.slice(local_offset, local_offset + n)));
        local_offset += n;
      }
      else {
        for (var i = 0; i < n; i++) {
          output.push(view[getter](local_offset, !big_endian));
          local_offset += size;
        }
      }
    }
    return output
  }
}

export const struct = new Struct();

function isBigEndian() {
  const array = new Uint8Array(4);
  const view = new Uint32Array(array.buffer);
  return !((view[0] = 1) & array[0]);
}

var WARN_OVERFLOW = false;
var MAX_INT64 = 1n << 63n - 1n;
var MIN_INT64 = -1n << 63n;
var MAX_UINT64 = 1n << 64n;
var MIN_UINT64 = 0n;

export class DataView64 extends DataView {
  getUint64(byteOffset, littleEndian) {
    // split 64-bit number into two 32-bit (4-byte) parts
    const left = BigInt(this.getUint32(byteOffset, littleEndian));
    const right = BigInt(this.getUint32(byteOffset + 4, littleEndian));

    // combine the two 32-bit values
    let combined = littleEndian ? left + (right << 32n) : (left << 32n) + right;

    if (WARN_OVERFLOW && (combined < MIN_UINT64 || combined > MAX_UINT64)) {
      console.warn(combined, 'exceeds range of 64-bit unsigned int');
    }

    return Number(combined);
  }

  getInt64(byteOffset, littleEndian) {
    // split 64-bit number into two 32-bit (4-byte) parts
    // untested!!
    var low, high;
    if (littleEndian) {
      low = this.getUint32(byteOffset, true);
      high = this.getInt32(byteOffset + 4, true);
    }
    else {
      high = this.getInt32(byteOffset, false);
      low = this.getUint32(byteOffset + 4, false);
    }

    let combined = BigInt(low) + (BigInt(high) << 32n);

    if (WARN_OVERFLOW && (combined < MIN_INT64 || combined > MAX_INT64)) {
      console.warn(combined, 'exceeds range of 64-bit signed int');
    }

    return Number(combined);
  }

  getString(byteOffset, littleEndian, length) {
    const str_buffer = this.buffer.slice(byteOffset, byteOffset + length);
    const decoder = new TextDecoder();
    return decoder.decode(str_buffer);
  }

  getVLENStruct(byteOffset, littleEndian, length) {
    // get the addressing information for VLEN data
    let item_size = this.getUint32(byteOffset, littleEndian);
    let collection_address = this.getUint64(byteOffset + 4, littleEndian);
    let object_index = this.getUint32(byteOffset + 12, littleEndian);
    return [item_size, collection_address, object_index];
  }

}

export function bitSize(integer) {
  return integer.toString(2).length;
}

export async function _unpack_integer_async(nbytes, async_buf, offset = 0, littleEndian = true) {
  //let padded_bytelength = 1 << Math.ceil(Math.log2(nbytes));
  //let format = _int_format(padded_bytelength);
  //let buf = new ArrayBuffer(padded_bytelength); // all zeros to start
  const local_buffer = await async_buf.slice(offset, offset+nbytes);
  let bytes = new Uint8Array(local_buffer);
  if (!littleEndian) {
    bytes.reverse();
  }
  let integer = bytes.reduce((accumulator, currentValue, index) => accumulator + (currentValue << (index * 8)), 0);
  return integer;
  
  //new Uint8Array(buf).set(new Uint8Array(fh.slice(offset, offset + nbytes)));
  //return struct.unpack_from(format, buf, 0)[0];
}

export function _unpack_integer(nbytes, buf, offset = 0, littleEndian = true) {
  //let padded_bytelength = 1 << Math.ceil(Math.log2(nbytes));
  //let format = _int_format(padded_bytelength);
  //let buf = new ArrayBuffer(padded_bytelength); // all zeros to start
  const local_buffer =  buf.slice(offset, offset+nbytes);
  let bytes = new Uint8Array(local_buffer);
  if (!littleEndian) {
    bytes.reverse();
  }
  let integer = bytes.reduce((accumulator, currentValue, index) => accumulator + (currentValue << (index * 8)), 0);
  return integer;
  
  //new Uint8Array(buf).set(new Uint8Array(fh.slice(offset, offset + nbytes)));
  //return struct.unpack_from(format, buf, 0)[0];
}

function _int_format(bytelength) {
  assert([1,2,4,8].includes(bytelength));
  let index = Math.log2(bytelength);
  return ["<B", "<H", "<I", "<Q"][index];
}

function getUint64(dataview, byteOffset, littleEndian) {
  // split 64-bit number into two 32-bit (4-byte) parts
  const left = BigInt(this.getUint32(byteOffset, littleEndian));
  const right = BigInt(this.getUint32(byteOffset + 4, littleEndian));

  // combine the two 32-bit values
  return littleEndian ? left + right << 32n : left << 32n + right;
}

var VLEN_ADDRESS = new Map([
  ['item_size', 'I'],
  ['collection_address', 'Q'],  //# 8 byte addressing,
  ['object_index', 'I'],
]);

