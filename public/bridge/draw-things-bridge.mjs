#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SIZE_PREFIX_LENGTH = exports.FILE_IDENTIFIER_LENGTH = exports.SIZEOF_INT = exports.SIZEOF_SHORT = void 0;
    exports.SIZEOF_SHORT = 2;
    exports.SIZEOF_INT = 4;
    exports.FILE_IDENTIFIER_LENGTH = 4;
    exports.SIZE_PREFIX_LENGTH = 4;
  }
});

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/utils.js
var require_utils = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isLittleEndian = exports.float64 = exports.float32 = exports.int32 = void 0;
    exports.int32 = new Int32Array(2);
    exports.float32 = new Float32Array(exports.int32.buffer);
    exports.float64 = new Float64Array(exports.int32.buffer);
    exports.isLittleEndian = new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
  }
});

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/encoding.js
var require_encoding = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/encoding.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Encoding = void 0;
    var Encoding;
    (function(Encoding2) {
      Encoding2[Encoding2["UTF8_BYTES"] = 1] = "UTF8_BYTES";
      Encoding2[Encoding2["UTF16_STRING"] = 2] = "UTF16_STRING";
    })(Encoding || (exports.Encoding = Encoding = {}));
  }
});

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/byte-buffer.js
var require_byte_buffer = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/byte-buffer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ByteBuffer = void 0;
    var constants_js_1 = require_constants();
    var encoding_js_1 = require_encoding();
    var utils_js_1 = require_utils();
    var ByteBuffer = class _ByteBuffer {
      /**
       * Create a new ByteBuffer with a given array of bytes (`Uint8Array`)
       */
      constructor(bytes_) {
        this.bytes_ = bytes_;
        this.position_ = 0;
        this.text_decoder_ = new TextDecoder();
      }
      /**
       * Create and allocate a new ByteBuffer with a given size.
       */
      static allocate(byte_size) {
        return new _ByteBuffer(new Uint8Array(byte_size));
      }
      clear() {
        this.position_ = 0;
      }
      /**
       * Get the underlying `Uint8Array`.
       */
      bytes() {
        return this.bytes_;
      }
      /**
       * Get the buffer's position.
       */
      position() {
        return this.position_;
      }
      /**
       * Set the buffer's position.
       */
      setPosition(position) {
        this.position_ = position;
      }
      /**
       * Get the buffer's capacity.
       */
      capacity() {
        return this.bytes_.length;
      }
      readInt8(offset) {
        return this.readUint8(offset) << 24 >> 24;
      }
      readUint8(offset) {
        return this.bytes_[offset];
      }
      readInt16(offset) {
        return this.readUint16(offset) << 16 >> 16;
      }
      readUint16(offset) {
        return this.bytes_[offset] | this.bytes_[offset + 1] << 8;
      }
      readInt32(offset) {
        return this.bytes_[offset] | this.bytes_[offset + 1] << 8 | this.bytes_[offset + 2] << 16 | this.bytes_[offset + 3] << 24;
      }
      readUint32(offset) {
        return this.readInt32(offset) >>> 0;
      }
      readInt64(offset) {
        return BigInt.asIntN(64, BigInt(this.readUint32(offset)) + (BigInt(this.readUint32(offset + 4)) << BigInt(32)));
      }
      readUint64(offset) {
        return BigInt.asUintN(64, BigInt(this.readUint32(offset)) + (BigInt(this.readUint32(offset + 4)) << BigInt(32)));
      }
      readFloat32(offset) {
        utils_js_1.int32[0] = this.readInt32(offset);
        return utils_js_1.float32[0];
      }
      readFloat64(offset) {
        utils_js_1.int32[utils_js_1.isLittleEndian ? 0 : 1] = this.readInt32(offset);
        utils_js_1.int32[utils_js_1.isLittleEndian ? 1 : 0] = this.readInt32(offset + 4);
        return utils_js_1.float64[0];
      }
      writeInt8(offset, value) {
        this.bytes_[offset] = value;
      }
      writeUint8(offset, value) {
        this.bytes_[offset] = value;
      }
      writeInt16(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
      }
      writeUint16(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
      }
      writeInt32(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
        this.bytes_[offset + 2] = value >> 16;
        this.bytes_[offset + 3] = value >> 24;
      }
      writeUint32(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
        this.bytes_[offset + 2] = value >> 16;
        this.bytes_[offset + 3] = value >> 24;
      }
      writeInt64(offset, value) {
        this.writeInt32(offset, Number(BigInt.asIntN(32, value)));
        this.writeInt32(offset + 4, Number(BigInt.asIntN(32, value >> BigInt(32))));
      }
      writeUint64(offset, value) {
        this.writeUint32(offset, Number(BigInt.asUintN(32, value)));
        this.writeUint32(offset + 4, Number(BigInt.asUintN(32, value >> BigInt(32))));
      }
      writeFloat32(offset, value) {
        utils_js_1.float32[0] = value;
        this.writeInt32(offset, utils_js_1.int32[0]);
      }
      writeFloat64(offset, value) {
        utils_js_1.float64[0] = value;
        this.writeInt32(offset, utils_js_1.int32[utils_js_1.isLittleEndian ? 0 : 1]);
        this.writeInt32(offset + 4, utils_js_1.int32[utils_js_1.isLittleEndian ? 1 : 0]);
      }
      /**
       * Return the file identifier.   Behavior is undefined for FlatBuffers whose
       * schema does not include a file_identifier (likely points at padding or the
       * start of a the root vtable).
       */
      getBufferIdentifier() {
        if (this.bytes_.length < this.position_ + constants_js_1.SIZEOF_INT + constants_js_1.FILE_IDENTIFIER_LENGTH) {
          throw new Error("FlatBuffers: ByteBuffer is too short to contain an identifier.");
        }
        let result = "";
        for (let i = 0; i < constants_js_1.FILE_IDENTIFIER_LENGTH; i++) {
          result += String.fromCharCode(this.readInt8(this.position_ + constants_js_1.SIZEOF_INT + i));
        }
        return result;
      }
      /**
       * Look up a field in the vtable, return an offset into the object, or 0 if the
       * field is not present.
       */
      __offset(bb_pos, vtable_offset) {
        const vtable = bb_pos - this.readInt32(bb_pos);
        return vtable_offset < this.readInt16(vtable) ? this.readInt16(vtable + vtable_offset) : 0;
      }
      /**
       * Initialize any Table-derived type to point to the union at the given offset.
       */
      __union(t, offset) {
        t.bb_pos = offset + this.readInt32(offset);
        t.bb = this;
        return t;
      }
      /**
       * Create a JavaScript string from UTF-8 data stored inside the FlatBuffer.
       * This allocates a new string and converts to wide chars upon each access.
       *
       * To avoid the conversion to string, pass Encoding.UTF8_BYTES as the
       * "optionalEncoding" argument. This is useful for avoiding conversion when
       * the data will just be packaged back up in another FlatBuffer later on.
       *
       * @param offset
       * @param opt_encoding Defaults to UTF16_STRING
       */
      __string(offset, opt_encoding) {
        offset += this.readInt32(offset);
        const length = this.readInt32(offset);
        offset += constants_js_1.SIZEOF_INT;
        const utf8bytes = this.bytes_.subarray(offset, offset + length);
        if (opt_encoding === encoding_js_1.Encoding.UTF8_BYTES)
          return utf8bytes;
        else
          return this.text_decoder_.decode(utf8bytes);
      }
      /**
       * Handle unions that can contain string as its member, if a Table-derived type then initialize it,
       * if a string then return a new one
       *
       * WARNING: strings are immutable in JS so we can't change the string that the user gave us, this
       * makes the behaviour of __union_with_string different compared to __union
       */
      __union_with_string(o, offset) {
        if (typeof o === "string") {
          return this.__string(offset);
        }
        return this.__union(o, offset);
      }
      /**
       * Retrieve the relative offset stored at "offset"
       */
      __indirect(offset) {
        return offset + this.readInt32(offset);
      }
      /**
       * Get the start of data of a vector whose offset is stored at "offset" in this object.
       */
      __vector(offset) {
        return offset + this.readInt32(offset) + constants_js_1.SIZEOF_INT;
      }
      /**
       * Get the length of a vector whose offset is stored at "offset" in this object.
       */
      __vector_len(offset) {
        return this.readInt32(offset + this.readInt32(offset));
      }
      __has_identifier(ident) {
        if (ident.length != constants_js_1.FILE_IDENTIFIER_LENGTH) {
          throw new Error("FlatBuffers: file identifier must be length " + constants_js_1.FILE_IDENTIFIER_LENGTH);
        }
        for (let i = 0; i < constants_js_1.FILE_IDENTIFIER_LENGTH; i++) {
          if (ident.charCodeAt(i) != this.readInt8(this.position() + constants_js_1.SIZEOF_INT + i)) {
            return false;
          }
        }
        return true;
      }
      /**
       * A helper function for generating list for obj api
       */
      createScalarList(listAccessor, listLength) {
        const ret = [];
        for (let i = 0; i < listLength; ++i) {
          const val = listAccessor(i);
          if (val !== null) {
            ret.push(val);
          }
        }
        return ret;
      }
      /**
       * A helper function for generating list for obj api
       * @param listAccessor function that accepts an index and return data at that index
       * @param listLength listLength
       * @param res result list
       */
      createObjList(listAccessor, listLength) {
        const ret = [];
        for (let i = 0; i < listLength; ++i) {
          const val = listAccessor(i);
          if (val !== null) {
            ret.push(val.unpack());
          }
        }
        return ret;
      }
    };
    exports.ByteBuffer = ByteBuffer;
  }
});

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/builder.js
var require_builder = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/builder.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Builder = void 0;
    var byte_buffer_js_1 = require_byte_buffer();
    var constants_js_1 = require_constants();
    var Builder2 = class _Builder {
      /**
       * Create a FlatBufferBuilder.
       */
      constructor(opt_initial_size) {
        this.minalign = 1;
        this.vtable = null;
        this.vtable_in_use = 0;
        this.isNested = false;
        this.object_start = 0;
        this.vtables = [];
        this.vector_num_elems = 0;
        this.force_defaults = false;
        this.string_maps = null;
        this.text_encoder = new TextEncoder();
        let initial_size;
        if (!opt_initial_size) {
          initial_size = 1024;
        } else {
          initial_size = opt_initial_size;
        }
        this.bb = byte_buffer_js_1.ByteBuffer.allocate(initial_size);
        this.space = initial_size;
      }
      clear() {
        this.bb.clear();
        this.space = this.bb.capacity();
        this.minalign = 1;
        this.vtable = null;
        this.vtable_in_use = 0;
        this.isNested = false;
        this.object_start = 0;
        this.vtables = [];
        this.vector_num_elems = 0;
        this.force_defaults = false;
        this.string_maps = null;
      }
      /**
       * In order to save space, fields that are set to their default value
       * don't get serialized into the buffer. Forcing defaults provides a
       * way to manually disable this optimization.
       *
       * @param forceDefaults true always serializes default values
       */
      forceDefaults(forceDefaults) {
        this.force_defaults = forceDefaults;
      }
      /**
       * Get the ByteBuffer representing the FlatBuffer. Only call this after you've
       * called finish(). The actual data starts at the ByteBuffer's current position,
       * not necessarily at 0.
       */
      dataBuffer() {
        return this.bb;
      }
      /**
       * Get the bytes representing the FlatBuffer. Only call this after you've
       * called finish().
       */
      asUint8Array() {
        return this.bb.bytes().subarray(this.bb.position(), this.bb.position() + this.offset());
      }
      /**
       * Prepare to write an element of `size` after `additional_bytes` have been
       * written, e.g. if you write a string, you need to align such the int length
       * field is aligned to 4 bytes, and the string data follows it directly. If all
       * you need to do is alignment, `additional_bytes` will be 0.
       *
       * @param size This is the of the new element to write
       * @param additional_bytes The padding size
       */
      prep(size, additional_bytes) {
        if (size > this.minalign) {
          this.minalign = size;
        }
        const align_size = ~(this.bb.capacity() - this.space + additional_bytes) + 1 & size - 1;
        while (this.space < align_size + size + additional_bytes) {
          const old_buf_size = this.bb.capacity();
          this.bb = _Builder.growByteBuffer(this.bb);
          this.space += this.bb.capacity() - old_buf_size;
        }
        this.pad(align_size);
      }
      pad(byte_size) {
        for (let i = 0; i < byte_size; i++) {
          this.bb.writeInt8(--this.space, 0);
        }
      }
      writeInt8(value) {
        this.bb.writeInt8(this.space -= 1, value);
      }
      writeInt16(value) {
        this.bb.writeInt16(this.space -= 2, value);
      }
      writeInt32(value) {
        this.bb.writeInt32(this.space -= 4, value);
      }
      writeInt64(value) {
        this.bb.writeInt64(this.space -= 8, value);
      }
      writeFloat32(value) {
        this.bb.writeFloat32(this.space -= 4, value);
      }
      writeFloat64(value) {
        this.bb.writeFloat64(this.space -= 8, value);
      }
      /**
       * Add an `int8` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int8` to add the buffer.
       */
      addInt8(value) {
        this.prep(1, 0);
        this.writeInt8(value);
      }
      /**
       * Add an `int16` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int16` to add the buffer.
       */
      addInt16(value) {
        this.prep(2, 0);
        this.writeInt16(value);
      }
      /**
       * Add an `int32` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int32` to add the buffer.
       */
      addInt32(value) {
        this.prep(4, 0);
        this.writeInt32(value);
      }
      /**
       * Add an `int64` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int64` to add the buffer.
       */
      addInt64(value) {
        this.prep(8, 0);
        this.writeInt64(value);
      }
      /**
       * Add a `float32` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `float32` to add the buffer.
       */
      addFloat32(value) {
        this.prep(4, 0);
        this.writeFloat32(value);
      }
      /**
       * Add a `float64` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `float64` to add the buffer.
       */
      addFloat64(value) {
        this.prep(8, 0);
        this.writeFloat64(value);
      }
      addFieldInt8(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt8(value);
          this.slot(voffset);
        }
      }
      addFieldInt16(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt16(value);
          this.slot(voffset);
        }
      }
      addFieldInt32(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt32(value);
          this.slot(voffset);
        }
      }
      addFieldInt64(voffset, value, defaultValue) {
        if (this.force_defaults || value !== defaultValue) {
          this.addInt64(value);
          this.slot(voffset);
        }
      }
      addFieldFloat32(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addFloat32(value);
          this.slot(voffset);
        }
      }
      addFieldFloat64(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addFloat64(value);
          this.slot(voffset);
        }
      }
      addFieldOffset(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addOffset(value);
          this.slot(voffset);
        }
      }
      /**
       * Structs are stored inline, so nothing additional is being added. `d` is always 0.
       */
      addFieldStruct(voffset, value, defaultValue) {
        if (value != defaultValue) {
          this.nested(value);
          this.slot(voffset);
        }
      }
      /**
       * Structures are always stored inline, they need to be created right
       * where they're used.  You'll get this assertion failure if you
       * created it elsewhere.
       */
      nested(obj) {
        if (obj != this.offset()) {
          throw new TypeError("FlatBuffers: struct must be serialized inline.");
        }
      }
      /**
       * Should not be creating any other object, string or vector
       * while an object is being constructed
       */
      notNested() {
        if (this.isNested) {
          throw new TypeError("FlatBuffers: object serialization must not be nested.");
        }
      }
      /**
       * Set the current vtable at `voffset` to the current location in the buffer.
       */
      slot(voffset) {
        if (this.vtable !== null)
          this.vtable[voffset] = this.offset();
      }
      /**
       * @returns Offset relative to the end of the buffer.
       */
      offset() {
        return this.bb.capacity() - this.space;
      }
      /**
       * Doubles the size of the backing ByteBuffer and copies the old data towards
       * the end of the new buffer (since we build the buffer backwards).
       *
       * @param bb The current buffer with the existing data
       * @returns A new byte buffer with the old data copied
       * to it. The data is located at the end of the buffer.
       *
       * uint8Array.set() formally takes {Array<number>|ArrayBufferView}, so to pass
       * it a uint8Array we need to suppress the type check:
       * @suppress {checkTypes}
       */
      static growByteBuffer(bb) {
        const old_buf_size = bb.capacity();
        if (old_buf_size & 3221225472) {
          throw new Error("FlatBuffers: cannot grow buffer beyond 2 gigabytes.");
        }
        const new_buf_size = old_buf_size << 1;
        const nbb = byte_buffer_js_1.ByteBuffer.allocate(new_buf_size);
        nbb.setPosition(new_buf_size - old_buf_size);
        nbb.bytes().set(bb.bytes(), new_buf_size - old_buf_size);
        return nbb;
      }
      /**
       * Adds on offset, relative to where it will be written.
       *
       * @param offset The offset to add.
       */
      addOffset(offset) {
        this.prep(constants_js_1.SIZEOF_INT, 0);
        this.writeInt32(this.offset() - offset + constants_js_1.SIZEOF_INT);
      }
      /**
       * Start encoding a new object in the buffer.  Users will not usually need to
       * call this directly. The FlatBuffers compiler will generate helper methods
       * that call this method internally.
       */
      startObject(numfields) {
        this.notNested();
        if (this.vtable == null) {
          this.vtable = [];
        }
        this.vtable_in_use = numfields;
        for (let i = 0; i < numfields; i++) {
          this.vtable[i] = 0;
        }
        this.isNested = true;
        this.object_start = this.offset();
      }
      /**
       * Finish off writing the object that is under construction.
       *
       * @returns The offset to the object inside `dataBuffer`
       */
      endObject() {
        if (this.vtable == null || !this.isNested) {
          throw new Error("FlatBuffers: endObject called without startObject");
        }
        this.addInt32(0);
        const vtableloc = this.offset();
        let i = this.vtable_in_use - 1;
        for (; i >= 0 && this.vtable[i] == 0; i--) {
        }
        const trimmed_size = i + 1;
        for (; i >= 0; i--) {
          this.addInt16(this.vtable[i] != 0 ? vtableloc - this.vtable[i] : 0);
        }
        const standard_fields = 2;
        this.addInt16(vtableloc - this.object_start);
        const len = (trimmed_size + standard_fields) * constants_js_1.SIZEOF_SHORT;
        this.addInt16(len);
        let existing_vtable = 0;
        const vt1 = this.space;
        outer_loop: for (i = 0; i < this.vtables.length; i++) {
          const vt2 = this.bb.capacity() - this.vtables[i];
          if (len == this.bb.readInt16(vt2)) {
            for (let j = constants_js_1.SIZEOF_SHORT; j < len; j += constants_js_1.SIZEOF_SHORT) {
              if (this.bb.readInt16(vt1 + j) != this.bb.readInt16(vt2 + j)) {
                continue outer_loop;
              }
            }
            existing_vtable = this.vtables[i];
            break;
          }
        }
        if (existing_vtable) {
          this.space = this.bb.capacity() - vtableloc;
          this.bb.writeInt32(this.space, existing_vtable - vtableloc);
        } else {
          this.vtables.push(this.offset());
          this.bb.writeInt32(this.bb.capacity() - vtableloc, this.offset() - vtableloc);
        }
        this.isNested = false;
        return vtableloc;
      }
      /**
       * Finalize a buffer, poiting to the given `root_table`.
       */
      finish(root_table, opt_file_identifier, opt_size_prefix) {
        const size_prefix = opt_size_prefix ? constants_js_1.SIZE_PREFIX_LENGTH : 0;
        if (opt_file_identifier) {
          const file_identifier = opt_file_identifier;
          this.prep(this.minalign, constants_js_1.SIZEOF_INT + constants_js_1.FILE_IDENTIFIER_LENGTH + size_prefix);
          if (file_identifier.length != constants_js_1.FILE_IDENTIFIER_LENGTH) {
            throw new TypeError("FlatBuffers: file identifier must be length " + constants_js_1.FILE_IDENTIFIER_LENGTH);
          }
          for (let i = constants_js_1.FILE_IDENTIFIER_LENGTH - 1; i >= 0; i--) {
            this.writeInt8(file_identifier.charCodeAt(i));
          }
        }
        this.prep(this.minalign, constants_js_1.SIZEOF_INT + size_prefix);
        this.addOffset(root_table);
        if (size_prefix) {
          this.addInt32(this.bb.capacity() - this.space);
        }
        this.bb.setPosition(this.space);
      }
      /**
       * Finalize a size prefixed buffer, pointing to the given `root_table`.
       */
      finishSizePrefixed(root_table, opt_file_identifier) {
        this.finish(root_table, opt_file_identifier, true);
      }
      /**
       * This checks a required field has been set in a given table that has
       * just been constructed.
       */
      requiredField(table, field) {
        const table_start = this.bb.capacity() - table;
        const vtable_start = table_start - this.bb.readInt32(table_start);
        const ok = field < this.bb.readInt16(vtable_start) && this.bb.readInt16(vtable_start + field) != 0;
        if (!ok) {
          throw new TypeError("FlatBuffers: field " + field + " must be set");
        }
      }
      /**
       * Start a new array/vector of objects.  Users usually will not call
       * this directly. The FlatBuffers compiler will create a start/end
       * method for vector types in generated code.
       *
       * @param elem_size The size of each element in the array
       * @param num_elems The number of elements in the array
       * @param alignment The alignment of the array
       */
      startVector(elem_size, num_elems, alignment) {
        this.notNested();
        this.vector_num_elems = num_elems;
        this.prep(constants_js_1.SIZEOF_INT, elem_size * num_elems);
        this.prep(alignment, elem_size * num_elems);
      }
      /**
       * Finish off the creation of an array and all its elements. The array must be
       * created with `startVector`.
       *
       * @returns The offset at which the newly created array
       * starts.
       */
      endVector() {
        this.writeInt32(this.vector_num_elems);
        return this.offset();
      }
      /**
       * Encode the string `s` in the buffer using UTF-8. If the string passed has
       * already been seen, we return the offset of the already written string
       *
       * @param s The string to encode
       * @return The offset in the buffer where the encoded string starts
       */
      createSharedString(s) {
        if (!s) {
          return 0;
        }
        if (!this.string_maps) {
          this.string_maps = /* @__PURE__ */ new Map();
        }
        if (this.string_maps.has(s)) {
          return this.string_maps.get(s);
        }
        const offset = this.createString(s);
        this.string_maps.set(s, offset);
        return offset;
      }
      /**
       * Encode the string `s` in the buffer using UTF-8. If a Uint8Array is passed
       * instead of a string, it is assumed to contain valid UTF-8 encoded data.
       *
       * @param s The string to encode
       * @return The offset in the buffer where the encoded string starts
       */
      createString(s) {
        if (s === null || s === void 0) {
          return 0;
        }
        let utf8;
        if (s instanceof Uint8Array) {
          utf8 = s;
        } else {
          utf8 = this.text_encoder.encode(s);
        }
        this.addInt8(0);
        this.startVector(1, utf8.length, 1);
        this.bb.setPosition(this.space -= utf8.length);
        this.bb.bytes().set(utf8, this.space);
        return this.endVector();
      }
      /**
       * Create a byte vector.
       *
       * @param v The bytes to add
       * @returns The offset in the buffer where the byte vector starts
       */
      createByteVector(v) {
        if (v === null || v === void 0) {
          return 0;
        }
        this.startVector(1, v.length, 1);
        this.bb.setPosition(this.space -= v.length);
        this.bb.bytes().set(v, this.space);
        return this.endVector();
      }
      /**
       * A helper function to pack an object
       *
       * @returns offset of obj
       */
      createObjectOffset(obj) {
        if (obj === null) {
          return 0;
        }
        if (typeof obj === "string") {
          return this.createString(obj);
        } else {
          return obj.pack(this);
        }
      }
      /**
       * A helper function to pack a list of object
       *
       * @returns list of offsets of each non null object
       */
      createObjectOffsetList(list) {
        const ret = [];
        for (let i = 0; i < list.length; ++i) {
          const val = list[i];
          if (val !== null) {
            ret.push(this.createObjectOffset(val));
          } else {
            throw new TypeError("FlatBuffers: Argument for createObjectOffsetList cannot contain null.");
          }
        }
        return ret;
      }
      createStructOffsetList(list, startFunc) {
        startFunc(this, list.length);
        this.createObjectOffsetList(list.slice().reverse());
        return this.endVector();
      }
    };
    exports.Builder = Builder2;
  }
});

// node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/flatbuffers.js
var require_flatbuffers = __commonJS({
  "node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/js/flatbuffers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Encoding = exports.ByteBuffer = exports.Builder = exports.isLittleEndian = exports.int32 = exports.float64 = exports.float32 = exports.SIZE_PREFIX_LENGTH = exports.SIZEOF_SHORT = exports.SIZEOF_INT = exports.FILE_IDENTIFIER_LENGTH = void 0;
    var constants_js_1 = require_constants();
    Object.defineProperty(exports, "FILE_IDENTIFIER_LENGTH", { enumerable: true, get: function() {
      return constants_js_1.FILE_IDENTIFIER_LENGTH;
    } });
    Object.defineProperty(exports, "SIZEOF_INT", { enumerable: true, get: function() {
      return constants_js_1.SIZEOF_INT;
    } });
    Object.defineProperty(exports, "SIZEOF_SHORT", { enumerable: true, get: function() {
      return constants_js_1.SIZEOF_SHORT;
    } });
    Object.defineProperty(exports, "SIZE_PREFIX_LENGTH", { enumerable: true, get: function() {
      return constants_js_1.SIZE_PREFIX_LENGTH;
    } });
    var utils_js_1 = require_utils();
    Object.defineProperty(exports, "float32", { enumerable: true, get: function() {
      return utils_js_1.float32;
    } });
    Object.defineProperty(exports, "float64", { enumerable: true, get: function() {
      return utils_js_1.float64;
    } });
    Object.defineProperty(exports, "int32", { enumerable: true, get: function() {
      return utils_js_1.int32;
    } });
    Object.defineProperty(exports, "isLittleEndian", { enumerable: true, get: function() {
      return utils_js_1.isLittleEndian;
    } });
    var builder_js_1 = require_builder();
    Object.defineProperty(exports, "Builder", { enumerable: true, get: function() {
      return builder_js_1.Builder;
    } });
    var byte_buffer_js_1 = require_byte_buffer();
    Object.defineProperty(exports, "ByteBuffer", { enumerable: true, get: function() {
      return byte_buffer_js_1.ByteBuffer;
    } });
    var encoding_js_1 = require_encoding();
    Object.defineProperty(exports, "Encoding", { enumerable: true, get: function() {
      return encoding_js_1.Encoding;
    } });
  }
});

// bridge/server.ts
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

// bridge/grpc.ts
import { connect, constants } from "node:http2";

// bridge/types.ts
var LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];
var BridgeError = class extends Error {
  code;
  status;
  details;
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};

// bridge/tls.ts
import { createHash } from "node:crypto";
function displayName(value) {
  if (!value) return void 0;
  const commonName = value.CN;
  if (Array.isArray(commonName)) return commonName.join(", ");
  return commonName ?? Object.entries(value).map(([key, item]) => `${key}=${item}`).join(", ");
}
function certificateInfo(socket) {
  const certificate = socket.getPeerCertificate(true);
  const fingerprint = certificate.fingerprint256 ?? (certificate.raw ? createHash("sha256").update(certificate.raw).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") : void 0);
  return {
    fingerprintSha256: fingerprint,
    authorized: socket.authorized,
    authorizationError: typeof socket.authorizationError === "string" ? socket.authorizationError : socket.authorizationError?.message,
    subject: displayName(certificate.subject),
    issuer: displayName(certificate.issuer),
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to
  };
}
function verifyPinnedCertificate(connection, certificate) {
  if (!connection.tlsFingerprintSha256) return;
  if (!certificate.fingerprintSha256 || certificate.fingerprintSha256 !== connection.tlsFingerprintSha256) {
    throw new BridgeError(
      "TLS_FINGERPRINT_MISMATCH",
      "The Draw Things TLS certificate no longer matches the pinned SHA-256 fingerprint.",
      502,
      {
        expected: connection.tlsFingerprintSha256,
        actual: certificate.fingerprintSha256
      }
    );
  }
}
function tlsWarnings(connection, certificate) {
  if (!connection.tls) return [];
  if (connection.verifyTls && certificate?.authorized) return [];
  if (connection.tlsFingerprintSha256) {
    return certificate?.authorized ? [] : ["The local TLS certificate is self-signed or privately issued; its SHA-256 fingerprint was verified."];
  }
  return [
    "TLS is encrypted but the local certificate is not verified. Confirm and save the SHA-256 fingerprint before sending prompts."
  ];
}

// bridge/grpc-config.ts
var import_flatbuffers = __toESM(require_flatbuffers(), 1);
import { randomBytes } from "node:crypto";
var CONFIG_FIELD_COUNT = 88;
var MAX_DIMENSION = 4096;
var MAX_TOTAL_PIXELS = 64 * 1024 * 1024;
var MAX_TOTAL_FRAME_PIXELS = 256 * 1024 * 1024;
var MAX_LORAS = 64;
var MAX_CONTROLS = 32;
var MAX_TARGET_BLOCKS = 128;
var SAMPLERS = [
  "DPM++ 2M Karras",
  "Euler a",
  "DDIM",
  "PLMS",
  "DPM++ SDE Karras",
  "UniPC",
  "LCM",
  "Euler A Substep",
  "DPM++ SDE Substep",
  "TCD",
  "Euler A Trailing",
  "DPM++ SDE Trailing",
  "DPM++ 2M AYS",
  "Euler A AYS",
  "DPM++ SDE AYS",
  "DPM++ 2M Trailing",
  "DDIM Trailing",
  "UniPC Trailing",
  "UniPC AYS",
  "TCD Trailing"
];
var SEED_MODES = ["Legacy", "Torch CPU Compatible", "Scale Alike", "NVIDIA GPU Compatible"];
var CONTROL_MODES = /* @__PURE__ */ new Map([
  ["balanced", 0],
  ["prompt", 1],
  ["control", 2]
]);
var CONTROL_INPUT_TYPES = /* @__PURE__ */ new Map([
  ["", 0],
  ["unspecified", 0],
  ["custom", 1],
  ["depth", 2],
  ["canny", 3],
  ["scribble", 4],
  ["pose", 5],
  ["normalbae", 6],
  ["color", 7],
  ["lineart", 8],
  ["softedge", 9],
  ["seg", 10],
  ["inpaint", 11],
  ["ip2p", 12],
  ["shuffle", 13],
  ["mlsd", 14],
  ["tile", 15],
  ["blur", 16],
  ["lowquality", 17],
  ["gray", 18]
]);
var LORA_MODES = /* @__PURE__ */ new Map([["all", 0], ["base", 1], ["refiner", 2]]);
var COMPRESSION_METHODS = /* @__PURE__ */ new Map([["disabled", 0], ["h264", 1], ["h265", 2], ["jpeg", 3]]);
var COLOR_CALIBRATIONS = /* @__PURE__ */ new Map([["none", 0], ["disabled", 0], ["lab", 1]]);
function finiteNumber(parameters, key, fallback, minimum = -Number.MAX_VALUE, maximum = Number.MAX_VALUE) {
  const raw = parameters[key];
  const value = raw === void 0 ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}
function integer(parameters, key, fallback, minimum = -2147483648, maximum = 2147483647) {
  const value = finiteNumber(parameters, key, fallback, minimum, maximum);
  if (!Number.isInteger(value)) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be an integer.`);
  }
  return value;
}
function bool(parameters, key, fallback) {
  const value = parameters[key];
  if (value === void 0) return fallback;
  if (typeof value !== "boolean") {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be a boolean.`);
  }
  return value;
}
function optionalString(parameters, key, maximum = 4096) {
  const value = parameters[key];
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) return void 0;
  if (Buffer.byteLength(normalized, "utf8") > maximum) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} is too long.`);
  }
  return normalized;
}
function requiredString(parameters, key) {
  const value = optionalString(parameters, key);
  if (!value) throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} is required for gRPC generation.`);
  return value;
}
function enumValue(parameters, key, values, fallback) {
  const raw = parameters[key] ?? fallback;
  if (typeof raw !== "string") {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be a string.`);
  }
  const index = values.indexOf(raw);
  if (index < 0) throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} is not supported by Draw Things gRPC.`);
  return index;
}
function mappedEnum(parameters, key, values, fallback) {
  const raw = parameters[key] ?? fallback;
  if (typeof raw !== "string") {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be a string.`);
  }
  const value = values.get(raw.trim().toLowerCase());
  if (value === void 0) throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} is not supported by Draw Things gRPC.`);
  return value;
}
function pixelBlocks(parameters, key, fallback) {
  const pixels = integer(parameters, key, fallback, 64, MAX_DIMENSION);
  if (pixels % 64 !== 0) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be divisible by 64 for Draw Things gRPC.`);
  }
  return pixels / 64;
}
function objectArray(parameters, key, maximum) {
  const raw = parameters[key];
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > maximum || raw.some((value) => value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", `${key} must be an array with at most ${maximum} objects.`);
  }
  return raw;
}
function offsetVector(builder, offsets) {
  builder.startVector(4, offsets.length, 4);
  for (let index = offsets.length - 1; index >= 0; index -= 1) builder.addOffset(offsets[index]);
  return builder.endVector();
}
function stringVector(builder, values) {
  return offsetVector(builder, values.map((value) => builder.createString(value)));
}
function buildLora(builder, value) {
  const file = optionalString(value, "file");
  if (!file) return void 0;
  const fileOffset = builder.createString(file);
  const mode = value.mode === void 0 || value.mode === null || value.mode === "" ? 0 : mappedEnum(value, "mode", LORA_MODES, "all");
  const weight = finiteNumber(value, "weight", 0.6, -10, 10);
  builder.startObject(3);
  builder.addFieldOffset(0, fileOffset, 0);
  builder.addFieldFloat32(1, weight, 0.6);
  builder.addFieldInt8(2, mode, 0);
  return builder.endObject();
}
function buildControl(builder, value) {
  const file = optionalString(value, "file");
  if (!file) return void 0;
  const targetBlocksRaw = value.targetBlocks ?? [];
  if (!Array.isArray(targetBlocksRaw) || targetBlocksRaw.length > MAX_TARGET_BLOCKS || targetBlocksRaw.some((block) => typeof block !== "string" || !block.trim() || Buffer.byteLength(block.trim(), "utf8") > 4096)) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", "control targetBlocks must be a bounded string array.");
  }
  const targetBlocks = stringVector(builder, targetBlocksRaw.map((block) => String(block).trim()));
  const fileOffset = builder.createString(file);
  const weight = finiteNumber(value, "weight", 1, -10, 10);
  const guidanceStart = finiteNumber(value, "guidanceStart", 0, 0, 1);
  const guidanceEnd = finiteNumber(value, "guidanceEnd", 1, 0, 1);
  if (guidanceStart > guidanceEnd) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", "control guidanceStart cannot exceed guidanceEnd.");
  }
  const noPrompt = bool(value, "noPrompt", false);
  const globalAveragePooling = bool(value, "globalAveragePooling", true);
  const downSamplingRate = finiteNumber(value, "downSamplingRate", 1, 0.01, 64);
  const controlMode = mappedEnum(value, "controlImportance", CONTROL_MODES, "balanced");
  const inputOverride = mappedEnum(value, "inputOverride", CONTROL_INPUT_TYPES, "unspecified");
  builder.startObject(10);
  builder.addFieldOffset(0, fileOffset, 0);
  builder.addFieldFloat32(1, weight, 1);
  builder.addFieldFloat32(2, guidanceStart, 0);
  builder.addFieldFloat32(3, guidanceEnd, 1);
  builder.addFieldInt8(4, Number(noPrompt), 0);
  builder.addFieldInt8(5, Number(globalAveragePooling), 1);
  builder.addFieldFloat32(6, downSamplingRate, 1);
  builder.addFieldInt8(7, controlMode, 0);
  builder.addFieldOffset(8, targetBlocks, 0);
  builder.addFieldInt8(9, inputOverride, 0);
  return builder.endObject();
}
function randomSeed() {
  return randomBytes(4).readUInt32LE(0);
}
function encodeGenerationConfiguration(parameters) {
  const width = integer(parameters, "width", 1024, 64, MAX_DIMENSION);
  const height = integer(parameters, "height", 1024, 64, MAX_DIMENSION);
  if (width % 64 !== 0 || height % 64 !== 0) {
    throw new BridgeError("INVALID_GRPC_PARAMETER", "width and height must be divisible by 64 for Draw Things gRPC.");
  }
  const batchCount = integer(parameters, "batch_count", 1, 1, 100);
  const batchSize = integer(parameters, "batch_size", 1, 1, 4);
  const numFrames = integer(parameters, "num_frames", 14, 1, 201);
  if (width * height * batchCount * batchSize > MAX_TOTAL_PIXELS) {
    throw new BridgeError("GRPC_GENERATION_TOO_LARGE", "Requested gRPC image pixels exceed the connector safety limit.", 413);
  }
  if (width * height * batchCount * batchSize * numFrames > MAX_TOTAL_FRAME_PIXELS) {
    throw new BridgeError("GRPC_GENERATION_TOO_LARGE", "Requested gRPC image/video frame pixels exceed the connector safety limit.", 413);
  }
  const seedInput = integer(parameters, "seed", -1, -1, 4294967295);
  const seed = seedInput < 0 ? randomSeed() : seedInput;
  const model = requiredString(parameters, "model");
  const faceRestoration = optionalString(parameters, "face_restoration");
  const builder = new import_flatbuffers.Builder(2048);
  const modelOffset = builder.createString(model);
  const upscalerOffset = optionalString(parameters, "upscaler");
  const refinerOffset = optionalString(parameters, "refiner_model");
  const faceOffset = faceRestoration;
  const nameOffset = optionalString(parameters, "name");
  const clipLTextOffset = optionalString(parameters, "clip_l_text", 1024 * 1024);
  const openClipGTextOffset = optionalString(parameters, "open_clip_g_text", 1024 * 1024);
  const t5TextOffset = optionalString(parameters, "t5_text", 1024 * 1024);
  const stringOffsets = {
    upscaler: upscalerOffset ? builder.createString(upscalerOffset) : 0,
    refiner: refinerOffset ? builder.createString(refinerOffset) : 0,
    face: faceOffset ? builder.createString(faceOffset) : 0,
    name: nameOffset ? builder.createString(nameOffset) : 0,
    clipL: clipLTextOffset ? builder.createString(clipLTextOffset) : 0,
    openClipG: openClipGTextOffset ? builder.createString(openClipGTextOffset) : 0,
    t5: t5TextOffset ? builder.createString(t5TextOffset) : 0
  };
  const controlOffsets = objectArray(parameters, "controls", MAX_CONTROLS).map((value) => buildControl(builder, value)).filter((value) => value !== void 0);
  const loraOffsets = objectArray(parameters, "loras", MAX_LORAS).map((value) => buildLora(builder, value)).filter((value) => value !== void 0);
  const controls = offsetVector(builder, controlOffsets);
  const loras = offsetVector(builder, loraOffsets);
  const causalInferenceInput = integer(parameters, "causal_inference", 0, 0, 1e3);
  const causalInferenceEnabled = bool(parameters, "causal_inference_enabled", causalInferenceInput > 0);
  const causalInference = causalInferenceInput > 0 ? causalInferenceInput : 3;
  builder.startObject(CONFIG_FIELD_COUNT);
  builder.addFieldInt64(0, BigInt(integer(parameters, "configuration_id", 0, 0, Number.MAX_SAFE_INTEGER)), 0n);
  builder.addFieldInt16(1, width / 64, 0);
  builder.addFieldInt16(2, height / 64, 0);
  builder.addFieldInt32(3, seed, 0);
  builder.addFieldInt32(4, integer(parameters, "steps", 16, 1, 1e3), 0);
  builder.addFieldFloat32(5, finiteNumber(parameters, "guidance_scale", 5, 0, 100), 0);
  builder.addFieldFloat32(6, finiteNumber(parameters, "strength", 1, 0, 1), 0);
  builder.addFieldOffset(7, modelOffset, 0);
  builder.addFieldInt8(8, enumValue(parameters, "sampler", SAMPLERS, "DPM++ 2M AYS"), 0);
  builder.addFieldInt32(9, batchCount, 1);
  builder.addFieldInt32(10, batchSize, 1);
  builder.addFieldInt8(11, Number(bool(parameters, "hires_fix", false)), 0);
  builder.addFieldInt16(12, pixelBlocks(parameters, "hires_fix_width", width), 0);
  builder.addFieldInt16(13, pixelBlocks(parameters, "hires_fix_height", height), 0);
  builder.addFieldFloat32(14, finiteNumber(parameters, "hires_fix_strength", 0.7, 0, 1), 0.7);
  builder.addFieldOffset(15, stringOffsets.upscaler, 0);
  builder.addFieldFloat32(16, finiteNumber(parameters, "image_guidance", 1.5, 0, 100), 1.5);
  builder.addFieldInt8(17, enumValue(parameters, "seed_mode", SEED_MODES, "Scale Alike"), 0);
  builder.addFieldInt32(18, integer(parameters, "clip_skip", 2, 1, 100), 1);
  builder.addFieldOffset(19, controls, 0);
  builder.addFieldOffset(20, loras, 0);
  builder.addFieldFloat32(21, finiteNumber(parameters, "mask_blur", 2.5, 0, 100), 0);
  builder.addFieldOffset(22, stringOffsets.face, 0);
  builder.addFieldFloat32(25, finiteNumber(parameters, "clip_weight", 1, 0, 1), 1);
  builder.addFieldInt8(26, Number(bool(parameters, "negative_prompt_for_image_prior", true)), 1);
  builder.addFieldInt32(27, integer(parameters, "image_prior_steps", 5, 1, 1e3), 5);
  builder.addFieldOffset(28, stringOffsets.refiner, 0);
  builder.addFieldInt32(29, integer(parameters, "original_height", height, 1, MAX_DIMENSION), 0);
  builder.addFieldInt32(30, integer(parameters, "original_width", width, 1, MAX_DIMENSION), 0);
  builder.addFieldInt32(31, integer(parameters, "crop_top", 0, -MAX_DIMENSION, MAX_DIMENSION), 0);
  builder.addFieldInt32(32, integer(parameters, "crop_left", 0, -MAX_DIMENSION, MAX_DIMENSION), 0);
  builder.addFieldInt32(33, integer(parameters, "target_height", height, 1, MAX_DIMENSION), 0);
  builder.addFieldInt32(34, integer(parameters, "target_width", width, 1, MAX_DIMENSION), 0);
  builder.addFieldFloat32(35, finiteNumber(parameters, "aesthetic_score", 6, -100, 100), 6);
  builder.addFieldFloat32(36, finiteNumber(parameters, "negative_aesthetic_score", 2.5, -100, 100), 2.5);
  builder.addFieldInt8(37, Number(bool(parameters, "zero_negative_prompt", true)), 0);
  builder.addFieldFloat32(38, finiteNumber(parameters, "refiner_start", 0.7, 0, 1), 0.7);
  builder.addFieldInt32(39, integer(parameters, "negative_original_height", 512, 1, MAX_DIMENSION), 0);
  builder.addFieldInt32(40, integer(parameters, "negative_original_width", 512, 1, MAX_DIMENSION), 0);
  builder.addFieldOffset(41, stringOffsets.name, 0);
  builder.addFieldInt32(42, integer(parameters, "fps", 5, 1, 240), 5);
  builder.addFieldInt32(43, integer(parameters, "motion_scale", 127, 0, 1e3), 127);
  builder.addFieldFloat32(44, finiteNumber(parameters, "guiding_frame_noise", 0.02, 0, 1), 0.02);
  builder.addFieldFloat32(45, finiteNumber(parameters, "start_frame_guidance", 1, 0, 100), 1);
  builder.addFieldInt32(46, numFrames, 14);
  builder.addFieldInt32(47, integer(parameters, "mask_blur_outset", 0, -MAX_DIMENSION, MAX_DIMENSION), 0);
  builder.addFieldFloat32(48, finiteNumber(parameters, "sharpness", 0, 0, 100), 0);
  builder.addFieldFloat32(49, finiteNumber(parameters, "shift", 1, 0, 100), 1);
  builder.addFieldInt32(50, integer(parameters, "stage_2_steps", 10, 1, 1e3), 10);
  builder.addFieldFloat32(51, finiteNumber(parameters, "stage_2_guidance", 1, 0, 100), 1);
  builder.addFieldFloat32(52, finiteNumber(parameters, "stage_2_shift", 1, 0, 100), 1);
  builder.addFieldInt8(53, Number(bool(parameters, "tiled_decoding", false)), 0);
  builder.addFieldInt16(54, pixelBlocks(parameters, "decoding_tile_width", 640), 10);
  builder.addFieldInt16(55, pixelBlocks(parameters, "decoding_tile_height", 640), 10);
  builder.addFieldInt16(56, pixelBlocks(parameters, "decoding_tile_overlap", 128), 2);
  builder.addFieldFloat32(57, finiteNumber(parameters, "stochastic_sampling_gamma", 0.3, 0, 1), 0.3);
  builder.addFieldInt8(58, Number(bool(parameters, "preserve_original_after_inpaint", true)), 1);
  builder.addFieldInt8(59, Number(bool(parameters, "tiled_diffusion", false)), 0);
  builder.addFieldInt16(60, pixelBlocks(parameters, "diffusion_tile_width", 1024), 16);
  builder.addFieldInt16(61, pixelBlocks(parameters, "diffusion_tile_height", 1024), 16);
  builder.addFieldInt16(62, pixelBlocks(parameters, "diffusion_tile_overlap", 128), 2);
  builder.addFieldInt8(63, integer(parameters, "upscaler_scale", 0, 0, 255), 0);
  builder.addFieldInt8(64, Number(bool(parameters, "t5_text_encoder_decoding", true)), 1);
  builder.addFieldInt8(65, Number(bool(parameters, "separate_clip_l", false)), 0);
  builder.addFieldOffset(66, stringOffsets.clipL, 0);
  builder.addFieldInt8(67, Number(bool(parameters, "separate_open_clip_g", false)), 0);
  builder.addFieldOffset(68, stringOffsets.openClipG, 0);
  builder.addFieldInt8(69, Number(bool(parameters, "speed_up_with_guidance_embed", true)), 1);
  builder.addFieldFloat32(70, finiteNumber(parameters, "guidance_embed", 3.5, 0, 100), 3.5);
  builder.addFieldInt8(71, Number(bool(parameters, "resolution_dependent_shift", true)), 1);
  builder.addFieldInt32(72, integer(parameters, "tea_cache_start", 5, 0, 1e4), 5);
  builder.addFieldInt32(73, integer(parameters, "tea_cache_end", -1, -1, 1e4), -1);
  builder.addFieldFloat32(74, finiteNumber(parameters, "tea_cache_threshold", 0.06, 0, 1), 0.06);
  builder.addFieldInt8(75, Number(bool(parameters, "tea_cache", false)), 0);
  builder.addFieldInt8(76, Number(bool(parameters, "separate_t5", false)), 0);
  builder.addFieldOffset(77, stringOffsets.t5, 0);
  builder.addFieldInt32(78, integer(parameters, "tea_cache_max_skip_steps", 3, 1, 1e4), 3);
  builder.addFieldInt8(79, Number(causalInferenceEnabled), 0);
  builder.addFieldInt32(80, causalInference, 3);
  builder.addFieldInt32(81, integer(parameters, "causal_inference_pad", 0, 0, 1e4), 0);
  builder.addFieldInt8(82, Number(bool(parameters, "cfg_zero_star", false)), 0);
  builder.addFieldInt32(83, integer(parameters, "cfg_zero_init_steps", 0, 0, 1e4), 0);
  builder.addFieldInt8(84, mappedEnum(parameters, "compression_artifacts", COMPRESSION_METHODS, "disabled"), 0);
  builder.addFieldFloat32(85, finiteNumber(parameters, "compression_artifacts_quality", 43.1, 0, 100), 43.1);
  builder.addFieldInt8(86, mappedEnum(parameters, "color_calibration", COLOR_CALIBRATIONS, "none"), 0);
  builder.addFieldInt8(87, Number(bool(parameters, "expand_prompt_to_json", false)), 0);
  const root = builder.endObject();
  builder.finish(root);
  return Buffer.from(builder.asUint8Array());
}

// bridge/dt-tensor.ts
import { deflateSync } from "node:zlib";

// bridge/fpzip.ts
import { gunzipSync } from "node:zlib";
/*!
 * FPZIP 1.3.0 - BSD 3-Clause License
 *
 * Copyright (c) 2018-2019, Lawrence Livermore National Security, LLC
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the copyright holder nor the names of its contributors
 *   may be used to endorse or promote products derived from this software without
 *   specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Full license and DOE notice: THIRD_PARTY_NOTICES.md
 */
var FPZIP_WASM_GZIP_BASE64 = "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";
var MAX_FPZIP_INPUT_BYTES = 128 * 1024 * 1024;
var MAX_FPZIP_OUTPUT_BYTES = 256 * 1024 * 1024;
var runtimePromise;
async function createRuntime() {
  const wasm = gunzipSync(Buffer.from(FPZIP_WASM_GZIP_BASE64, "base64"));
  const state = { heap: new Uint8Array() };
  const updateHeap = () => {
    if (!state.memory) throw new BridgeError("FPZIP_INITIALIZATION_FAILED", "FPZIP memory is unavailable.", 500);
    state.heap = new Uint8Array(state.memory.buffer);
  };
  const resizeHeap = (requestedSize) => {
    if (!state.memory || !Number.isSafeInteger(requestedSize) || requestedSize < 0 || requestedSize > 2147483648) return 0;
    if (requestedSize <= state.memory.buffer.byteLength) return 1;
    try {
      state.memory.grow(Math.ceil((requestedSize - state.memory.buffer.byteLength) / 65536));
      updateHeap();
      return 1;
    } catch {
      return 0;
    }
  };
  const wasmApi = globalThis.WebAssembly;
  if (!wasmApi) throw new BridgeError("FPZIP_INITIALIZATION_FAILED", "WebAssembly is unavailable.", 500);
  const instantiated = await wasmApi.instantiate(wasm, {
    a: {
      a: (pointer) => {
        throw new BridgeError("FPZIP_DECODE_FAILED", `FPZIP exception at ${pointer}.`, 502);
      },
      b: () => {
        throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP aborted.", 502);
      },
      c: resizeHeap
    }
  });
  const exports = instantiated.instance.exports;
  state.memory = exports.d;
  updateHeap();
  exports.e();
  return { exports, heap: () => state.heap };
}
function checkedProduct(values) {
  let result = 1;
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || result > Number.MAX_SAFE_INTEGER / value) {
      throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP dimensions are invalid.", 502);
    }
    result *= value;
  }
  return result;
}
async function decompressFpzip(data, expectedElements) {
  if (data.length === 0 || data.length > MAX_FPZIP_INPUT_BYTES) {
    throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP input is empty or too large.", 502);
  }
  runtimePromise ??= createRuntime();
  const runtime = await runtimePromise;
  const { exports } = runtime;
  let inputPointer = 0;
  let streamPointer = 0;
  let outputPointer = 0;
  try {
    inputPointer = exports.j(data.length);
    if (!inputPointer) throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP input allocation failed.", 502);
    runtime.heap().set(data, inputPointer);
    streamPointer = exports.f(inputPointer);
    if (!streamPointer || exports.h(streamPointer) === 0) {
      throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP header is invalid.", 502);
    }
    const header = new Int32Array(runtime.heap().buffer, streamPointer, 6);
    const [type, , nx, ny, nz, nf] = header;
    if (type !== 0 && type !== 1) throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP scalar type is unsupported.", 502);
    const elements = checkedProduct([nx, ny, nz, nf]);
    if (elements !== expectedElements) {
      throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP dimensions do not match the Draw Things tensor header.", 502);
    }
    const bytesPerElement = type === 0 ? 4 : 8;
    const outputBytes = elements * bytesPerElement;
    if (outputBytes > MAX_FPZIP_OUTPUT_BYTES) {
      throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP output exceeds the connector safety limit.", 502);
    }
    outputPointer = exports.j(outputBytes);
    if (!outputPointer) throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP output allocation failed.", 502);
    const bytesRead = exports.i(streamPointer, outputPointer);
    if (bytesRead !== data.length) {
      throw new BridgeError("FPZIP_DECODE_FAILED", "FPZIP payload could not be decompressed.", 502);
    }
    const copied = runtime.heap().slice(outputPointer, outputPointer + outputBytes);
    return type === 0 ? new Float32Array(copied.buffer, copied.byteOffset, elements) : new Float64Array(copied.buffer, copied.byteOffset, elements);
  } finally {
    if (outputPointer) exports.k(outputPointer);
    if (streamPointer) exports.g(streamPointer);
    if (inputPointer) exports.k(inputPointer);
  }
}

// bridge/dt-tensor.ts
var TENSOR_HEADER_BYTES = 68;
var FPZIP_IDENTIFIER = 1012247;
var CCV_32F = 16384;
var CCV_64F = 65536;
var CCV_16F = 131072;
var MAX_IMAGE_DIMENSION = 4096;
var MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
var MAX_TENSOR_BYTES = 128 * 1024 * 1024 + TENSOR_HEADER_BYTES;
function float16ToNumber(value) {
  const sign = value & 32768 ? -1 : 1;
  const exponent = value >>> 10 & 31;
  const fraction = value & 1023;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
function byteFromNormalized(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.trunc((value + 1) * 127.5)));
}
function byteFromPositiveRange(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}
function tensorDimensions(tensor) {
  if (tensor.length < TENSOR_HEADER_BYTES || tensor.length > MAX_TENSOR_BYTES) {
    throw new BridgeError("INVALID_DRAW_THINGS_TENSOR", "Draw Things returned an invalid tensor size.", 502);
  }
  const batch = tensor.readUInt32LE(20);
  const height = tensor.readUInt32LE(24);
  const width = tensor.readUInt32LE(28);
  const channels = tensor.readUInt32LE(32);
  if (batch !== 1 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS || channels !== 3 && channels !== 4) {
    throw new BridgeError(
      "INVALID_DRAW_THINGS_TENSOR",
      "Draw Things returned unsupported tensor dimensions; expected NHWC [1, height, width, 3|4].",
      502
    );
  }
  return { width, height, channels, elements: width * height * channels };
}
async function decodeDrawThingsTensor(tensor) {
  const { width, height, channels, elements } = tensorDimensions(tensor);
  const identifier = tensor.readUInt32LE(0);
  const dataType = tensor.readUInt32LE(12);
  const payload = tensor.subarray(TENSOR_HEADER_BYTES);
  const rgb = Buffer.allocUnsafe(width * height * 3);
  const alpha = channels === 4 ? Buffer.allocUnsafe(width * height) : void 0;
  let values;
  if (identifier === FPZIP_IDENTIFIER) {
    values = await decompressFpzip(payload, elements);
  } else if (identifier !== 0) {
    throw new BridgeError(
      "UNSUPPORTED_DRAW_THINGS_TENSOR_CODEC",
      `Draw Things returned unsupported tensor codec 0x${identifier.toString(16)}.`,
      502
    );
  }
  const expectedRawBytes = dataType === CCV_16F ? elements * 2 : dataType === CCV_32F ? elements * 4 : dataType === CCV_64F ? elements * 8 : -1;
  if (expectedRawBytes < 0) {
    throw new BridgeError(
      "UNSUPPORTED_DRAW_THINGS_TENSOR_TYPE",
      `Draw Things returned unsupported tensor data type 0x${dataType.toString(16)}.`,
      502
    );
  }
  if (!values && payload.length !== expectedRawBytes) {
    throw new BridgeError("INVALID_DRAW_THINGS_TENSOR", "Draw Things tensor payload length does not match its shape.", 502);
  }
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const input = pixel * channels;
    const output = pixel * 3;
    const colorChannelStart = channels - 3;
    if (alpha) {
      const value = values ? values[input] : dataType === CCV_16F ? float16ToNumber(payload.readUInt16LE(input * 2)) : dataType === CCV_32F ? payload.readFloatLE(input * 4) : payload.readDoubleLE(input * 8);
      alpha[pixel] = byteFromPositiveRange(value);
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const index = input + colorChannelStart + channel;
      const value = values ? values[index] : dataType === CCV_16F ? float16ToNumber(payload.readUInt16LE(index * 2)) : dataType === CCV_32F ? payload.readFloatLE(index * 4) : payload.readDoubleLE(index * 8);
      rgb[output + channel] = byteFromNormalized(value);
    }
  }
  return { width, height, channels, rgb, ...alpha ? { alpha } : {} };
}
var crcTable;
function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 4294967295;
  for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}
function encodeRgbPng(image) {
  const { width, height, rgb, alpha } = image;
  if (rgb.length !== width * height * 3) {
    throw new BridgeError("INVALID_RGB_IMAGE", "RGB byte length does not match image dimensions.", 500);
  }
  if (alpha && alpha.length !== width * height) {
    throw new BridgeError("INVALID_RGB_IMAGE", "Alpha byte length does not match image dimensions.", 500);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const output = row * (stride + 1);
    scanlines[output] = 0;
    if (!alpha) {
      rgb.copy(scanlines, output + 1, row * width * 3, (row + 1) * width * 3);
      continue;
    }
    for (let column = 0; column < width; column += 1) {
      const pixel = row * width + column;
      const source = pixel * 3;
      const target = output + 1 + column * 4;
      scanlines[target] = rgb[source];
      scanlines[target + 1] = rgb[source + 1];
      scanlines[target + 2] = rgb[source + 2];
      scanlines[target + 3] = alpha[pixel];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}
async function drawThingsTensorToPng(tensor) {
  return encodeRgbPng(await decodeDrawThingsTensor(tensor));
}

// bridge/protobuf.ts
import { gunzipSync as gunzipSync2 } from "node:zlib";
var EMPTY_METADATA = {
  models: [],
  loras: [],
  controlNets: [],
  textualInversions: [],
  upscalers: []
};
function encodeVarint(value) {
  let remaining = BigInt(value);
  if (remaining < 0n) throw new BridgeError("PROTOBUF_ENCODE_ERROR", "Cannot encode a negative varint.");
  const bytes = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining > 0n) byte |= 128;
    bytes.push(byte);
  } while (remaining > 0n);
  return Buffer.from(bytes);
}
function encodeStringField(field, value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeVarint(field << 3 | 2), encodeVarint(bytes.length), bytes]);
}
function encodeBytesField(field, value) {
  return Buffer.concat([encodeVarint(field << 3 | 2), encodeVarint(value.length), value]);
}
function encodeVarintField(field, value) {
  return Buffer.concat([encodeVarint(field << 3), encodeVarint(value)]);
}
function encodeEchoRequest(name, sharedSecret) {
  const fields = [encodeStringField(1, name)];
  if (sharedSecret !== void 0) fields.push(encodeStringField(2, sharedSecret));
  return Buffer.concat(fields);
}
function encodeImageGenerationRequest(input) {
  if (Buffer.byteLength(input.prompt, "utf8") > 1024 * 1024 || Buffer.byteLength(input.negativePrompt, "utf8") > 1024 * 1024) {
    throw new BridgeError("GRPC_PROMPT_TOO_LARGE", "gRPC prompts are limited to 1 MiB each.", 413);
  }
  if (input.configuration.length === 0 || input.configuration.length > 4 * 1024 * 1024) {
    throw new BridgeError("GRPC_CONFIGURATION_TOO_LARGE", "gRPC configuration is empty or too large.", 413);
  }
  const fields = [
    encodeVarintField(2, 1),
    ...input.prompt ? [encodeStringField(5, input.prompt)] : [],
    ...input.negativePrompt ? [encodeStringField(6, input.negativePrompt)] : [],
    encodeBytesField(7, input.configuration),
    encodeStringField(10, input.user),
    encodeVarintField(11, 2),
    // DeviceType.LAPTOP
    ...input.sharedSecret ? [encodeStringField(13, input.sharedSecret)] : [],
    ...input.chunked === false ? [] : [encodeVarintField(14, 1)]
  ];
  return Buffer.concat(fields);
}
function readVarint(buffer, cursor) {
  let result = 0n;
  let shift = 0n;
  for (let index = 0; index < 10; index += 1) {
    if (cursor.offset >= buffer.length) {
      throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf varint.", 502);
    }
    const byte = buffer[cursor.offset++];
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) return result;
    shift += 7n;
  }
  throw new BridgeError("PROTOBUF_DECODE_ERROR", "Protobuf varint exceeds 10 bytes.", 502);
}
function readLengthDelimited(buffer, cursor) {
  const lengthValue = readVarint(buffer, cursor);
  if (lengthValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Protobuf field length is too large.", 502);
  }
  const length = Number(lengthValue);
  const end = cursor.offset + length;
  if (length < 0 || end > buffer.length) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf field.", 502);
  }
  const value = buffer.subarray(cursor.offset, end);
  cursor.offset = end;
  return value;
}
function skipField(buffer, cursor, wireType) {
  switch (wireType) {
    case 0:
      readVarint(buffer, cursor);
      return;
    case 1:
      cursor.offset += 8;
      break;
    case 2:
      readLengthDelimited(buffer, cursor);
      return;
    case 5:
      cursor.offset += 4;
      break;
    default:
      throw new BridgeError("PROTOBUF_DECODE_ERROR", `Unsupported protobuf wire type ${wireType}.`, 502);
  }
  if (cursor.offset > buffer.length) {
    throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated protobuf fixed-width field.", 502);
  }
}
function jsonMetadata(bytes) {
  if (bytes.length === 0) return [];
  const json = bytes.toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    return {
      parseError: "Draw Things returned invalid JSON metadata.",
      rawBase64: bytes.toString("base64")
    };
  }
}
function decodeMetadataOverride(buffer) {
  const result = { ...EMPTY_METADATA };
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType !== 2 || field < 1 || field > 5) {
      skipField(buffer, cursor, wireType);
      continue;
    }
    const value = jsonMetadata(readLengthDelimited(buffer, cursor));
    if (field === 1) result.models = value;
    if (field === 2) result.loras = value;
    if (field === 3) result.controlNets = value;
    if (field === 4) result.textualInversions = value;
    if (field === 5) result.upscalers = value;
  }
  return result;
}
function bigintToJson(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}
function decodeThresholds(buffer) {
  const cursor = { offset: 0 };
  let community = 0;
  let plus = 0;
  let expireAt = 0;
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if ((field === 1 || field === 2) && wireType === 1) {
      if (cursor.offset + 8 > buffer.length) {
        throw new BridgeError("PROTOBUF_DECODE_ERROR", "Truncated threshold value.", 502);
      }
      const value = buffer.readDoubleLE(cursor.offset);
      cursor.offset += 8;
      if (field === 1) community = value;
      if (field === 2) plus = value;
    } else if (field === 3 && wireType === 0) {
      expireAt = bigintToJson(readVarint(buffer, cursor));
    } else {
      skipField(buffer, cursor, wireType);
    }
  }
  return { community, plus, expireAt };
}
function decodeEchoReply(buffer) {
  const result = {
    message: "",
    files: [],
    metadata: { ...EMPTY_METADATA },
    modelBrowsingAvailable: false,
    sharedSecretMissing: false,
    serverIdentifier: "0"
  };
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (field === 1 && wireType === 2) {
      result.message = readLengthDelimited(buffer, cursor).toString("utf8");
    } else if (field === 2 && wireType === 2) {
      result.modelBrowsingAvailable = true;
      result.files.push(readLengthDelimited(buffer, cursor).toString("utf8"));
    } else if (field === 3 && wireType === 2) {
      result.modelBrowsingAvailable = true;
      result.metadata = decodeMetadataOverride(readLengthDelimited(buffer, cursor));
    } else if (field === 4 && wireType === 0) {
      result.sharedSecretMissing = readVarint(buffer, cursor) !== 0n;
    } else if (field === 5 && wireType === 2) {
      result.thresholds = decodeThresholds(readLengthDelimited(buffer, cursor));
    } else if (field === 6 && wireType === 0) {
      result.serverIdentifier = readVarint(buffer, cursor).toString();
    } else {
      skipField(buffer, cursor, wireType);
    }
  }
  return result;
}
function decodeSignpost(buffer) {
  const phases = {
    1: "text-encoded",
    2: "image-encoded",
    3: "sampling",
    4: "image-decoded",
    5: "second-pass-image-encoded",
    6: "second-pass-sampling",
    7: "second-pass-image-decoded",
    8: "face-restored",
    9: "image-upscaled"
  };
  const cursor = { offset: 0 };
  let result = { phase: "unknown" };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType !== 2 || field < 1 || field > 9) {
      skipField(buffer, cursor, wireType);
      continue;
    }
    const value = readLengthDelimited(buffer, cursor);
    result = { phase: phases[field] ?? "unknown" };
    if (field === 3 || field === 6) {
      const samplingCursor = { offset: 0 };
      while (samplingCursor.offset < value.length) {
        const samplingTag = Number(readVarint(value, samplingCursor));
        const samplingField = samplingTag >>> 3;
        const samplingWireType = samplingTag & 7;
        if (samplingField === 1 && samplingWireType === 0) {
          result.step = Number(readVarint(value, samplingCursor));
        } else {
          skipField(value, samplingCursor, samplingWireType);
        }
      }
    }
  }
  return result;
}
function decodeImageGenerationResponse(buffer) {
  const result = { generatedImages: [], chunkState: "last" };
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const tag = Number(readVarint(buffer, cursor));
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (field === 1 && wireType === 2) {
      result.generatedImages.push(Buffer.from(readLengthDelimited(buffer, cursor)));
    } else if (field === 2 && wireType === 2) {
      result.currentSignpost = decodeSignpost(readLengthDelimited(buffer, cursor));
    } else if (field === 4 && wireType === 2) {
      result.previewImage = Buffer.from(readLengthDelimited(buffer, cursor));
    } else if (field === 5 && wireType === 0) {
      result.scaleFactor = Number(readVarint(buffer, cursor));
    } else if (field === 7 && wireType === 0) {
      result.downloadSize = bigintToJson(readVarint(buffer, cursor));
    } else if (field === 8 && wireType === 0) {
      const state = Number(readVarint(buffer, cursor));
      result.chunkState = state === 0 ? "last" : state === 1 ? "more" : "unknown";
    } else {
      skipField(buffer, cursor, wireType);
    }
  }
  return result;
}
var GrpcFrameDecoder = class {
  constructor(encoding, maximumMessageBytes = 128 * 1024 * 1024) {
    this.encoding = encoding;
    this.maximumMessageBytes = maximumMessageBytes;
  }
  encoding;
  maximumMessageBytes;
  header = Buffer.allocUnsafe(5);
  headerBytes = 0;
  compressed = 0;
  payload;
  payloadBytes = 0;
  push(chunk) {
    const frames = [];
    let offset = 0;
    while (offset < chunk.length) {
      if (this.headerBytes < this.header.length) {
        const headerBytes = Math.min(this.header.length - this.headerBytes, chunk.length - offset);
        chunk.copy(this.header, this.headerBytes, offset, offset + headerBytes);
        this.headerBytes += headerBytes;
        offset += headerBytes;
        if (this.headerBytes < this.header.length) break;
        this.compressed = this.header[0];
        const length = this.header.readUInt32BE(1);
        if (length > this.maximumMessageBytes) {
          throw new BridgeError("GRPC_FRAME_ERROR", "Oversized gRPC message.", 502);
        }
        this.payload = Buffer.allocUnsafe(length);
        this.payloadBytes = 0;
        if (length === 0) {
          frames.push(decodeGrpcPayload(this.compressed, this.payload, this.encoding, this.maximumMessageBytes));
          this.resetFrame();
          continue;
        }
      }
      const payload = this.payload;
      if (!payload) throw new BridgeError("GRPC_FRAME_ERROR", "Invalid gRPC decoder state.", 502);
      const payloadBytes = Math.min(payload.length - this.payloadBytes, chunk.length - offset);
      chunk.copy(payload, this.payloadBytes, offset, offset + payloadBytes);
      this.payloadBytes += payloadBytes;
      offset += payloadBytes;
      if (this.payloadBytes === payload.length) {
        frames.push(decodeGrpcPayload(this.compressed, payload, this.encoding, this.maximumMessageBytes));
        this.resetFrame();
      }
    }
    return frames;
  }
  finish() {
    if (this.headerBytes !== 0 || this.payload !== void 0) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Draw Things ended with a truncated gRPC frame.", 502);
    }
  }
  resetFrame() {
    this.headerBytes = 0;
    this.compressed = 0;
    this.payload = void 0;
    this.payloadBytes = 0;
  }
};
function decodeGrpcPayload(compressed, payload, encoding, maximumMessageBytes) {
  if (compressed === 0) return payload;
  if (compressed === 1 && encoding?.toLowerCase() === "gzip") {
    return gunzipSync2(payload, { maxOutputLength: maximumMessageBytes });
  }
  throw new BridgeError(
    "GRPC_COMPRESSION_UNSUPPORTED",
    `Unsupported gRPC compression encoding: ${encoding ?? "missing"}.`,
    502
  );
}
function frameGrpcMessage(payload) {
  const header = Buffer.allocUnsafe(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
function decodeGrpcFrames(data, encoding, maximumMessageBytes = 64 * 1024 * 1024) {
  const frames = [];
  let offset = 0;
  while (offset < data.length) {
    if (data.length - offset < 5) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Truncated gRPC frame header.", 502);
    }
    const compressed = data[offset];
    const length = data.readUInt32BE(offset + 1);
    offset += 5;
    if (length > maximumMessageBytes || offset + length > data.length) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Invalid or oversized gRPC frame.", 502);
    }
    const payload = data.subarray(offset, offset + length);
    offset += length;
    frames.push(decodeGrpcPayload(compressed, payload, encoding, maximumMessageBytes));
  }
  return frames;
}

// bridge/grpc.ts
var MAX_GRPC_RESPONSE_BYTES = 64 * 1024 * 1024;
var MAX_GRPC_GENERATION_WIRE_BYTES = 512 * 1024 * 1024;
var MAX_GENERATION_TENSOR_BYTES = 128 * 1024 * 1024 + 68;
var MAX_TOTAL_TENSOR_BYTES = 512 * 1024 * 1024 + 400 * 68;
var MAX_GENERATED_IMAGE_BASE64_BYTES = 384 * 1024 * 1024;
function decodeGrpcMessage(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function grpcTimeoutHeader(timeoutMs) {
  const milliseconds = Math.min(99999999, Math.max(1, Math.ceil(timeoutMs)));
  return `${milliseconds}m`;
}
function requireGrpcStatus(headers, trailers) {
  const value = trailers["grpc-status"] ?? headers["grpc-status"];
  if (value === void 0) {
    throw new BridgeError(
      "GRPC_STATUS_MISSING",
      "Draw Things gRPC ended without a grpc-status trailer.",
      502
    );
  }
  return String(value);
}
function waitForConnect(session, connection) {
  return new Promise((resolve3, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onConnect = () => {
      cleanup();
      try {
        if (!connection.tls) {
          resolve3(void 0);
          return;
        }
        const socket = session.socket;
        const certificate = certificateInfo(socket);
        verifyPinnedCertificate(connection, certificate);
        resolve3(certificate);
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = () => {
      session.off("error", onError);
      session.off("connect", onConnect);
    };
    session.once("error", onError);
    session.once("connect", onConnect);
  });
}
async function echoGrpc(connection) {
  if (connection.protocol !== "grpc") {
    throw new BridgeError("GRPC_MODE_REQUIRED", "This operation requires the Draw Things gRPC mode.");
  }
  const displayHost = connection.host === "::1" ? "[::1]" : connection.host;
  const authority = `${connection.tls ? "https" : "http"}://${displayHost}:${connection.port}`;
  const session = connect(authority, connection.tls ? {
    rejectUnauthorized: connection.verifyTls,
    ALPNProtocols: ["h2"]
  } : void 0);
  session.on("error", () => {
  });
  let timeout;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = new BridgeError("UPSTREAM_TIMEOUT", "Draw Things gRPC Echo timed out.", 504);
        session.destroy(error);
        reject(error);
      }, connection.timeoutMs);
      timeout.unref();
    });
    const certificate = await Promise.race([waitForConnect(session, connection), timeoutPromise]);
    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: "/ImageGenerationService/Echo",
      [constants.HTTP2_HEADER_SCHEME]: connection.tls ? "https" : "http",
      "content-type": "application/grpc",
      te: "trailers",
      "grpc-accept-encoding": "gzip",
      "grpc-timeout": grpcTimeoutHeader(connection.timeoutMs),
      "user-agent": "draw-things-web-bridge/0.1.0"
    });
    const responsePromise = new Promise((resolve3, reject) => {
      const chunks = [];
      let received = 0;
      let headers = {};
      let trailers = {};
      request.on("response", (value) => {
        headers = value;
      });
      request.on("trailers", (value) => {
        trailers = value;
      });
      request.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_GRPC_RESPONSE_BYTES) {
          request.close(constants.NGHTTP2_CANCEL);
          reject(new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things gRPC response is too large.", 502));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      request.once("error", reject);
      request.once("end", () => resolve3({ data: Buffer.concat(chunks), headers, trailers }));
      request.end(frameGrpcMessage(encodeEchoRequest(connection.clientName, connection.sharedSecret)));
    });
    const response = await Promise.race([responsePromise, timeoutPromise]);
    const httpStatus = Number(response.headers[constants.HTTP2_HEADER_STATUS] ?? 0);
    if (httpStatus !== 200) {
      throw new BridgeError("GRPC_HTTP_ERROR", `Draw Things gRPC endpoint returned HTTP ${httpStatus}.`, 502);
    }
    const contentType = String(response.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().startsWith("application/grpc")) {
      throw new BridgeError("NOT_GRPC_SERVER", "The selected local endpoint did not return gRPC content.", 502);
    }
    const grpcStatus = requireGrpcStatus(response.headers, response.trailers);
    if (grpcStatus !== "0") {
      throw new BridgeError(
        "GRPC_STATUS_ERROR",
        decodeGrpcMessage(response.trailers["grpc-message"] ?? response.headers["grpc-message"]) || `Draw Things gRPC returned status ${grpcStatus}.`,
        502,
        { grpcStatus }
      );
    }
    const frames = decodeGrpcFrames(response.data, String(response.headers["grpc-encoding"] ?? "") || void 0);
    if (frames.length !== 1 || !frames[0]) {
      throw new BridgeError("GRPC_FRAME_ERROR", "Draw Things Echo returned an unexpected number of messages.", 502);
    }
    return {
      echo: decodeEchoReply(frames[0]),
      certificate,
      warnings: tlsWarnings(connection, certificate)
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    session.close();
  }
}
async function generateGrpcImages(connection, prompt, negativePrompt, parameters, signal, onProgress) {
  if (connection.protocol !== "grpc") {
    throw new BridgeError("GRPC_MODE_REQUIRED", "This operation requires the Draw Things gRPC mode.");
  }
  if (signal?.aborted) throw new BridgeError("ABORTED", "Draw Things gRPC generation was cancelled.", 499);
  const configuration = encodeGenerationConfiguration(parameters);
  const requestBody = frameGrpcMessage(encodeImageGenerationRequest({
    prompt,
    negativePrompt,
    configuration,
    user: connection.clientName,
    sharedSecret: connection.sharedSecret,
    chunked: true
  }));
  const displayHost = connection.host === "::1" ? "[::1]" : connection.host;
  const authority = `${connection.tls ? "https" : "http"}://${displayHost}:${connection.port}`;
  const session = connect(authority, connection.tls ? {
    rejectUnauthorized: connection.verifyTls,
    ALPNProtocols: ["h2"]
  } : void 0);
  session.on("error", () => {
  });
  let timeout;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = new BridgeError("UPSTREAM_TIMEOUT", "Draw Things gRPC generation timed out.", 504);
        session.destroy(error);
        reject(error);
      }, connection.timeoutMs);
      timeout.unref();
    });
    let connectAbortListener;
    const connectAbortPromise = signal ? new Promise((_, reject) => {
      let handled = false;
      connectAbortListener = () => {
        if (handled) return;
        handled = true;
        const error = new BridgeError("ABORTED", "Draw Things gRPC generation was cancelled.", 499);
        reject(error);
        session.destroy(error);
      };
      signal.addEventListener("abort", connectAbortListener, { once: true });
      if (signal.aborted) connectAbortListener();
    }) : void 0;
    try {
      await Promise.race([
        waitForConnect(session, connection),
        timeoutPromise,
        ...connectAbortPromise ? [connectAbortPromise] : []
      ]);
    } finally {
      if (connectAbortListener) signal?.removeEventListener("abort", connectAbortListener);
    }
    if (signal?.aborted) throw new BridgeError("ABORTED", "Draw Things gRPC generation was cancelled.", 499);
    const request = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: "/ImageGenerationService/GenerateImage",
      [constants.HTTP2_HEADER_SCHEME]: connection.tls ? "https" : "http",
      "content-type": "application/grpc",
      te: "trailers",
      "grpc-accept-encoding": "gzip",
      "grpc-timeout": grpcTimeoutHeader(connection.timeoutMs),
      "user-agent": "draw-things-web-bridge/0.1.0"
    });
    const responsePromise = new Promise((resolve3, reject) => {
      let headers = {};
      let trailers = {};
      let decoder;
      let receivedWireBytes = 0;
      let totalTensorBytes = 0;
      let totalBase64Bytes = 0;
      let pendingTensorChunks = [];
      let pendingTensorBytes = 0;
      let scaleFactor;
      const images = [];
      let processing = Promise.resolve();
      let settled = false;
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!request.closed && !request.destroyed) request.close(constants.NGHTTP2_CANCEL);
        reject(error);
      };
      const onAbort = () => fail(new BridgeError("ABORTED", "Draw Things gRPC generation was cancelled.", 499));
      request.once("error", fail);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      const emitProgress = async (progress) => {
        if (settled || signal?.aborted) return;
        if (onProgress) await onProgress(progress);
      };
      const appendTensorBytes = (bytes) => {
        totalTensorBytes += bytes;
        if (totalTensorBytes > MAX_TOTAL_TENSOR_BYTES) {
          throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things returned too much tensor data.", 502);
        }
      };
      const finishTensor = async (parts) => {
        const tensorBytes = parts.reduce((total, part) => total + part.length, 0);
        if (tensorBytes === 0 || tensorBytes > MAX_GENERATION_TENSOR_BYTES) {
          throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things returned an invalid or oversized image tensor.", 502);
        }
        const png = await drawThingsTensorToPng(parts.length === 1 ? parts[0] : Buffer.concat(parts, tensorBytes));
        if (settled || signal?.aborted) return;
        const encoded = png.toString("base64");
        totalBase64Bytes += Buffer.byteLength(encoded, "ascii");
        if (totalBase64Bytes > MAX_GENERATED_IMAGE_BASE64_BYTES) {
          throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Generated PNG results exceed the connector safety limit.", 502);
        }
        images.push(encoded);
      };
      const processFrame = async (frame) => {
        if (settled || signal?.aborted) return;
        const response = decodeImageGenerationResponse(frame);
        if (response.scaleFactor !== void 0) scaleFactor = response.scaleFactor;
        if (response.currentSignpost || response.downloadSize !== void 0) {
          await emitProgress({
            ...response.currentSignpost ? { signpost: response.currentSignpost } : {},
            ...response.downloadSize !== void 0 ? { downloadSize: response.downloadSize } : {}
          });
        }
        if (response.previewImage) {
          if (response.previewImage.length > MAX_GENERATION_TENSOR_BYTES) {
            throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things preview tensor is too large.", 502);
          }
          const previewChannels = response.previewImage.length >= 36 ? response.previewImage.readUInt32LE(32) : 0;
          if (previewChannels === 3) {
            try {
              const previewTensor = await decodeDrawThingsTensor(response.previewImage);
              if (settled || signal?.aborted) return;
              await emitProgress({ previewImage: encodeRgbPng(previewTensor).toString("base64") });
            } catch {
            }
          }
        }
        if (response.generatedImages.length === 0) return;
        if (response.chunkState === "unknown") {
          throw new BridgeError("GRPC_CHUNK_STATE_ERROR", "Draw Things returned an unknown image chunk state.", 502);
        }
        for (const chunk of response.generatedImages) {
          if (settled || signal?.aborted) return;
          appendTensorBytes(chunk.length);
          if (response.chunkState === "more") {
            pendingTensorBytes += chunk.length;
            if (pendingTensorBytes > MAX_GENERATION_TENSOR_BYTES) {
              throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things image tensor chunks are too large.", 502);
            }
            pendingTensorChunks.push(chunk);
            continue;
          }
          if (pendingTensorChunks.length > 0) {
            pendingTensorBytes += chunk.length;
            if (pendingTensorBytes > MAX_GENERATION_TENSOR_BYTES) {
              throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things image tensor chunks are too large.", 502);
            }
            await finishTensor([...pendingTensorChunks, chunk]);
            pendingTensorChunks = [];
            pendingTensorBytes = 0;
          } else {
            await finishTensor([chunk]);
          }
        }
      };
      request.on("response", (value) => {
        headers = value;
        decoder = new GrpcFrameDecoder(String(value["grpc-encoding"] ?? "") || void 0);
      });
      request.on("trailers", (value) => {
        trailers = value;
      });
      request.on("data", (chunk) => {
        if (settled) return;
        receivedWireBytes += chunk.length;
        if (receivedWireBytes > MAX_GRPC_GENERATION_WIRE_BYTES) {
          fail(new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", "Draw Things gRPC generation response is too large.", 502));
          return;
        }
        try {
          if (!decoder) throw new BridgeError("GRPC_FRAME_ERROR", "Draw Things sent gRPC data before response headers.", 502);
          const frames = decoder.push(Buffer.from(chunk));
          processing = processing.then(async () => {
            for (const frame of frames) {
              if (settled || signal?.aborted) break;
              await processFrame(frame);
            }
          });
          void processing.catch(fail);
        } catch (error) {
          fail(error);
        }
      });
      request.once("end", () => {
        void processing.then(() => {
          if (settled) return;
          decoder?.finish();
          if (pendingTensorChunks.length > 0) {
            throw new BridgeError("GRPC_CHUNK_STATE_ERROR", "Draw Things ended before the last image tensor chunk.", 502);
          }
          const httpStatus = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
          if (httpStatus !== 200) {
            throw new BridgeError("GRPC_HTTP_ERROR", `Draw Things gRPC endpoint returned HTTP ${httpStatus}.`, 502);
          }
          const contentType = String(headers["content-type"] ?? "");
          if (!contentType.toLowerCase().startsWith("application/grpc")) {
            throw new BridgeError("NOT_GRPC_SERVER", "The selected local endpoint did not return gRPC content.", 502);
          }
          const grpcStatus = requireGrpcStatus(headers, trailers);
          if (grpcStatus !== "0") {
            throw new BridgeError(
              "GRPC_STATUS_ERROR",
              decodeGrpcMessage(trailers["grpc-message"] ?? headers["grpc-message"]) || `Draw Things gRPC returned status ${grpcStatus}.`,
              502,
              { grpcStatus }
            );
          }
          if (images.length === 0) {
            throw new BridgeError("GRPC_EMPTY_RESULT", "Draw Things gRPC completed without a generated image.", 502);
          }
          settled = true;
          cleanup();
          resolve3({ images, ...scaleFactor === void 0 ? {} : { scaleFactor } });
        }).catch(fail);
      });
      request.end(requestBody);
    });
    return await Promise.race([responsePromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    session.close();
  }
}

// bridge/http-upstream.ts
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";

// bridge/security.ts
import { createHash as createHash2, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
var DEFAULT_BRIDGE_PORT = 47821;
var DEFAULT_DRAW_THINGS_PORT = 7859;
var MAX_CONTROL_BODY_BYTES = 256 * 1024;
var MAX_GENERATE_BODY_BYTES = 128 * 1024 * 1024;
var MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024 * 1024;
var DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::1]:4173"
];
var SAFE_REQUEST_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "content-type",
  "x-draw-things-bridge-token",
  "x-draw-things-pairing-token"
]);
function normalizeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new BridgeError("INVALID_ORIGIN", `Invalid origin: ${value}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin === "null") {
    throw new BridgeError("INVALID_ORIGIN", `Only http(s) origins are supported: ${value}`);
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new BridgeError("INVALID_ORIGIN", `Origin must not include credentials, a path, query, or fragment: ${value}`);
  }
  return parsed.origin;
}
function isLoopbackBindAddress(value) {
  return value === "127.0.0.1" || value === "::1";
}
function normalizeBridgeBindAddress(value) {
  if (value !== void 0 && typeof value !== "string") {
    throw new BridgeError("INVALID_BRIDGE_BIND", "Bridge bind must be a string address.");
  }
  const raw = typeof value === "string" ? value.trim().replace(/^\[|\]$/g, "").toLowerCase() : "127.0.0.1";
  if (raw === "localhost" || raw === "127.0.0.1") return "127.0.0.1";
  if (raw === "::1") return "::1";
  if (raw === "100.100.100.100") {
    throw new BridgeError("INVALID_BRIDGE_BIND", "The Tailscale Quad100 service address cannot be used as a connector bind address.");
  }
  if (isIP(raw) === 4) {
    const octets = raw.split(".").map(Number);
    if (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) return raw;
  }
  if (isIP(raw) === 6 && raw.startsWith("fd7a:115c:a1e0:")) {
    return new URL(`http://[${raw}]`).hostname.replace(/^\[|\]$/g, "");
  }
  throw new BridgeError(
    "INVALID_BRIDGE_BIND",
    "Bridge bind must be 127.0.0.1, ::1, or this Mac's Tailscale IP. Wildcard, LAN, and public addresses are rejected."
  );
}
function normalizeTailscaleServeHost(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError("INVALID_TAILSCALE_HOST", "Tailscale Serve host must be a non-empty hostname with an optional port.");
  }
  const raw = value.trim().toLowerCase();
  if (raw.includes("://")) {
    throw new BridgeError("INVALID_TAILSCALE_HOST", "Tailscale Serve host must not include a URL scheme.");
  }
  let parsed;
  try {
    parsed = new URL(`https://${raw}`);
  } catch {
    throw new BridgeError("INVALID_TAILSCALE_HOST", `Invalid Tailscale Serve host: ${value}`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const port = parsed.port ? Number(parsed.port) : 443;
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || !hostname.endsWith(".ts.net") || hostname === "ts.net" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BridgeError(
      "INVALID_TAILSCALE_HOST",
      "Tailscale Serve host must be an exact *.ts.net hostname with an optional port and no path."
    );
  }
  return `${hostname}:${port}`;
}
function normalizeLoopbackHost(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "127.0.0.1";
  const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (!LOOPBACK_HOSTS.includes(unbracketed)) {
    throw new BridgeError(
      "LOOPBACK_REQUIRED",
      "The local connector only permits localhost, 127.0.0.1, or ::1."
    );
  }
  return unbracketed;
}
function normalizeFingerprint(value) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string") {
    throw new BridgeError("INVALID_TLS_FINGERPRINT", "TLS fingerprint must be a SHA-256 string.");
  }
  const normalized = value.replaceAll(":", "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(normalized)) {
    throw new BridgeError(
      "INVALID_TLS_FINGERPRINT",
      "TLS fingerprint must contain exactly 64 hexadecimal SHA-256 characters."
    );
  }
  return normalized.match(/.{2}/g)?.join(":");
}
function normalizePort(value) {
  const port = value === void 0 ? DEFAULT_DRAW_THINGS_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BridgeError("INVALID_PORT", "Port must be an integer from 1 to 65535.");
  }
  return port;
}
function normalizeTimeout(value, fallback, maximum) {
  const timeout = value === void 0 ? fallback : Number(value);
  if (!Number.isInteger(timeout) || timeout < 250 || timeout > maximum) {
    throw new BridgeError(
      "INVALID_TIMEOUT",
      `Timeout must be an integer from 250 to ${maximum} milliseconds.`
    );
  }
  return timeout;
}
function normalizeConnection(value, purpose = "control") {
  if (!isPlainObject(value)) {
    throw new BridgeError("INVALID_CONNECTION", "connection must be a JSON object.");
  }
  const protocol = value.protocol;
  if (protocol !== "http" && protocol !== "grpc") {
    throw new BridgeError("INVALID_PROTOCOL", 'protocol must be either "http" or "grpc".');
  }
  const sharedSecret = value.sharedSecret;
  if (sharedSecret !== void 0 && (typeof sharedSecret !== "string" || sharedSecret.length > 4096)) {
    throw new BridgeError("INVALID_SHARED_SECRET", "sharedSecret must be a string up to 4096 characters.");
  }
  const clientName = value.clientName ?? "draw-things-web";
  if (typeof clientName !== "string" || clientName.length < 1 || clientName.length > 128 || [...clientName].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  })) {
    throw new BridgeError("INVALID_CLIENT_NAME", "clientName must contain 1-128 printable characters.");
  }
  const fallbackTimeout = purpose === "generation" ? 15 * 6e4 : 4e3;
  const maximumTimeout = purpose === "generation" ? 60 * 6e4 : 6e4;
  return {
    protocol,
    host: normalizeLoopbackHost(value.host),
    port: normalizePort(value.port),
    tls: value.tls === true,
    verifyTls: value.verifyTls === true || value.allowSelfSignedCertificate === false,
    tlsFingerprintSha256: normalizeFingerprint(value.tlsFingerprintSha256),
    sharedSecret,
    clientName,
    timeoutMs: normalizeTimeout(value.timeoutMs, fallbackTimeout, maximumTimeout)
  };
}
function publicConnection(connection) {
  const { sharedSecret, ...safe } = connection;
  return { ...safe, hasSharedSecret: Boolean(sharedSecret) };
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertSafeJson(value, depth = 0) {
  if (depth > 64) throw new BridgeError("JSON_TOO_DEEP", "JSON nesting exceeds 64 levels.");
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new BridgeError("UNSAFE_JSON_KEY", `JSON key "${key}" is not allowed.`);
    }
    assertSafeJson(child, depth + 1);
  }
}
async function readJsonBody(request, limit) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new BridgeError("UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", 415);
  }
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new BridgeError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413);
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > limit) {
      throw new BridgeError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes.`, 413);
    }
    chunks.push(buffer);
  }
  if (received === 0) throw new BridgeError("EMPTY_BODY", "A JSON request body is required.");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeError("INVALID_JSON", "Request body is not valid JSON.");
  }
  assertSafeJson(parsed);
  return parsed;
}
function validateHostHeader(request, expectedPort, bindAddress = "127.0.0.1", tailscaleServeHosts = []) {
  const header = request.headers.host;
  if (!header || /[\\/?#@\s]/.test(header)) {
    throw new BridgeError("INVALID_HOST", "Invalid Host header.", 403);
  }
  let parsed;
  try {
    parsed = new URL(`http://${header}`);
  } catch {
    throw new BridgeError("INVALID_HOST", "Invalid Host header.", 403);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const explicitPort = parsed.port ? Number(parsed.port) : void 0;
  const allowedHosts = isLoopbackBindAddress(bindAddress) ? LOOPBACK_HOSTS : [bindAddress];
  if (allowedHosts.includes(host) && (explicitPort ?? 80) === expectedPort) return;
  const remoteAddress = request.socket.remoteAddress?.toLowerCase();
  const fromLoopbackProxy = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
  const proxyPort = explicitPort ?? 443;
  const matchesTailscaleServe = fromLoopbackProxy && tailscaleServeHosts.some((authority) => {
    const separator = authority.lastIndexOf(":");
    return authority.slice(0, separator) === host && Number(authority.slice(separator + 1)) === proxyPort;
  });
  if (matchesTailscaleServe) return;
  throw new BridgeError("INVALID_HOST", "Host must exactly address the configured connector bind, port, or trusted Tailscale Serve host.", 403);
}
function validateOrigin(request, response, allowedOrigins) {
  const originHeader = request.headers.origin;
  if (originHeader === void 0) return void 0;
  if (Array.isArray(originHeader) || !allowedOrigins.has(originHeader)) {
    throw new BridgeError("ORIGIN_NOT_ALLOWED", "This website origin is not allowed.", 403);
  }
  response.setHeader("Access-Control-Allow-Origin", originHeader);
  response.setHeader(
    "Vary",
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network"
  );
  return originHeader;
}
function handlePreflight(request, response, allowedMethods) {
  const requestedMethod = String(request.headers["access-control-request-method"] ?? "").toUpperCase();
  if (!allowedMethods.includes(requestedMethod)) {
    throw new BridgeError("METHOD_NOT_ALLOWED", "Requested CORS method is not allowed.", 405);
  }
  const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "").split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
  if (requestedHeaders.some((header) => !SAFE_REQUEST_HEADERS.has(header))) {
    throw new BridgeError("HEADER_NOT_ALLOWED", "Requested CORS headers are not allowed.", 403);
  }
  response.statusCode = 204;
  response.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", [...SAFE_REQUEST_HEADERS].join(", "));
  response.setHeader("Access-Control-Max-Age", "600");
  if (String(request.headers["access-control-request-private-network"]).toLowerCase() === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  response.end();
}
function constantTimeMatch(actual, expected) {
  const actualDigest = createHash2("sha256").update(actual).digest();
  const expectedDigest = createHash2("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}
function validateToken(request, expected) {
  if (!expected) return;
  const authorization = request.headers.authorization;
  const bearer = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : void 0;
  const custom = request.headers["x-draw-things-bridge-token"];
  const pairing = request.headers["x-draw-things-pairing-token"];
  const candidate = bearer ?? (typeof custom === "string" ? custom : void 0) ?? (typeof pairing === "string" ? pairing : "");
  if (!constantTimeMatch(candidate, expected)) {
    throw new BridgeError("UNAUTHORIZED", "A valid bridge pairing token is required.", 401);
  }
}
function sanitizeError(error) {
  if (error instanceof BridgeError) return error;
  if (error instanceof Error) {
    const nodeError = error;
    if (nodeError.name === "AbortError" || nodeError.code === "ABORT_ERR") {
      return new BridgeError("ABORTED", "The operation was cancelled.", 499);
    }
    if (nodeError.code === "ECONNREFUSED") {
      return new BridgeError("CONNECTION_REFUSED", "Draw Things refused the local connection.", 502);
    }
    if (nodeError.code === "ETIMEDOUT" || nodeError.code === "ERR_HTTP2_PING_CANCEL") {
      return new BridgeError("UPSTREAM_TIMEOUT", "Draw Things did not respond before the timeout.", 504);
    }
    if (nodeError.code?.startsWith("CERT_") || nodeError.code === "DEPTH_ZERO_SELF_SIGNED_CERT") {
      return new BridgeError("TLS_VERIFICATION_FAILED", error.message, 502);
    }
    return new BridgeError(nodeError.code ?? "UPSTREAM_ERROR", error.message, 502);
  }
  return new BridgeError("UNKNOWN_ERROR", "An unknown connector error occurred.", 500);
}

// bridge/http-upstream.ts
var ALLOWED_PATHS = /* @__PURE__ */ new Set([
  "/",
  "/sdapi/v1/options",
  "/sdapi/v1/txt2img",
  "/sdapi/v1/img2img"
]);
async function collectResponse(response, limit) {
  const chunks = [];
  let received = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > limit) {
      response.destroy(new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", `Draw Things response exceeds ${limit} bytes.`, 502));
      throw new BridgeError("UPSTREAM_RESPONSE_TOO_LARGE", `Draw Things response exceeds ${limit} bytes.`, 502);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function requestDrawThingsJson(connection, method, path, body, signal) {
  if (connection.protocol !== "http") {
    throw new BridgeError("HTTP_MODE_REQUIRED", "This operation requires the Draw Things HTTP API mode.");
  }
  if (!ALLOWED_PATHS.has(path)) {
    throw new BridgeError("PATH_NOT_ALLOWED", "The requested Draw Things path is not allowed.", 403);
  }
  const serialized = body === void 0 ? void 0 : Buffer.from(JSON.stringify(body), "utf8");
  const headers = {
    accept: "application/json",
    "user-agent": "draw-things-web-bridge/0.1.0"
  };
  if (serialized) {
    headers["content-type"] = "application/json";
    headers["content-length"] = serialized.length;
  }
  return new Promise((resolve3, reject) => {
    let settled = false;
    let certificate;
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const requestFactory = connection.tls ? requestHttps : requestHttp;
    const request = requestFactory({
      hostname: connection.host,
      port: connection.port,
      method,
      path,
      signal,
      rejectUnauthorized: connection.tls ? connection.verifyTls : void 0,
      headers
    }, async (response) => {
      try {
        const raw = await collectResponse(response, MAX_UPSTREAM_RESPONSE_BYTES);
        let value;
        try {
          value = raw.length === 0 ? null : JSON.parse(raw.toString("utf8"));
        } catch {
          throw new BridgeError(
            "INVALID_UPSTREAM_JSON",
            "Draw Things returned a response that was not valid JSON.",
            502,
            { status: response.statusCode, preview: raw.subarray(0, 512).toString("utf8") }
          );
        }
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) {
          const detail = isPlainObject(value) && typeof value.detail === "string" ? value.detail : `Draw Things HTTP API returned status ${status}.`;
          throw new BridgeError("DRAW_THINGS_HTTP_ERROR", detail, 502, {
            upstreamStatus: status,
            response: value
          });
        }
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve3({
          status,
          headers: response.headers,
          value,
          certificate,
          warnings: tlsWarnings(connection, certificate)
        });
      } catch (error) {
        finishReject(error);
      }
    });
    request.once("error", finishReject);
    const timeout = setTimeout(() => {
      const error = new BridgeError("UPSTREAM_TIMEOUT", "Draw Things did not respond before the timeout.", 504);
      request.destroy(error);
      finishReject(error);
    }, connection.timeoutMs);
    timeout.unref();
    const send = () => {
      if (settled || request.destroyed) return;
      if (serialized) request.end(serialized);
      else request.end();
    };
    if (connection.tls) {
      request.once("socket", (socket) => {
        const tlsSocket = socket;
        tlsSocket.once("secureConnect", () => {
          try {
            certificate = certificateInfo(tlsSocket);
            verifyPinnedCertificate(connection, certificate);
            send();
          } catch (error) {
            request.destroy(error);
            finishReject(error);
          }
        });
      });
    } else {
      send();
    }
  });
}
async function getHttpOptions(connection) {
  const result = await requestDrawThingsJson(connection, "GET", "/sdapi/v1/options");
  if (!isPlainObject(result.value)) {
    throw new BridgeError("INVALID_OPTIONS_RESPONSE", "Draw Things options response must be a JSON object.", 502);
  }
  return { ...result, options: result.value };
}
async function generateHttpImages(connection, mode, parameters, signal) {
  const path = mode === "txt2img" ? "/sdapi/v1/txt2img" : "/sdapi/v1/img2img";
  const result = await requestDrawThingsJson(connection, "POST", path, parameters, signal);
  if (!isPlainObject(result.value) || !Array.isArray(result.value.images) || result.value.images.some((image) => typeof image !== "string")) {
    throw new BridgeError(
      "INVALID_GENERATION_RESPONSE",
      "Draw Things generation response did not contain a base64 images array.",
      502
    );
  }
  return { ...result, images: result.value.images };
}

// bridge/model-catalog.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

// src/lib/draw-things/parameters.ts
var SEED_MODES2 = [
  "Legacy",
  "Torch CPU Compatible",
  "Scale Alike",
  "NVIDIA GPU Compatible"
];
var SAMPLERS2 = [
  "DPM++ 2M Karras",
  "Euler a",
  "DDIM",
  "PLMS",
  "DPM++ SDE Karras",
  "UniPC",
  "LCM",
  "Euler A Substep",
  "DPM++ SDE Substep",
  "TCD",
  "Euler A Trailing",
  "DPM++ SDE Trailing",
  "DPM++ 2M AYS",
  "Euler A AYS",
  "DPM++ SDE AYS",
  "DPM++ 2M Trailing",
  "DDIM Trailing",
  "UniPC Trailing",
  "UniPC AYS",
  "TCD Trailing"
];
var E = {
  seedMode: SEED_MODES2,
  sampler: SAMPLERS2,
  compression: ["disabled", "h264", "h265", "jpeg"],
  color: ["none", "lab"]
};
var RAW_PARAMETERS = [
  ["model", [], "string", null, null, "\uBAA8\uB378", "model", "always"],
  ["width", [], "int", 128, 8192, "\uB108\uBE44", "output", "always", ["step64"]],
  ["height", [], "int", 128, 8192, "\uB192\uC774", "output", "always", ["step64"]],
  ["seed", [], "int", -1, 4294967295, "\uC2DC\uB4DC", "sampling", "always", ["minusOneRandom"]],
  ["guidance_scale", ["cfg_scale"], "float", 0, 50, "CFG \uC2A4\uCF00\uC77C", "sampling", "always"],
  ["seed_mode", [], "enum:seedMode", null, null, "\uC2DC\uB4DC \uBC29\uC2DD", "sampling", "advanced"],
  ["steps", [], "int", 1, 150, "\uC2A4\uD15D", "sampling", "always"],
  ["batch_count", ["n_iter"], "int", 1, 100, "\uBC30\uCE58 \uBC18\uBCF5", "output", "always"],
  ["batch_size", [], "int", 1, 4, "\uBC30\uCE58 \uD06C\uAE30", "output", "always"],
  ["sampler", ["sampler_name", "sampler_index"], "enum:sampler", null, null, "\uC0D8\uD50C\uB7EC", "sampling", "always"],
  ["strength", ["denoising_strength"], "float", 0, 1, "\uB514\uB178\uC774\uC988 \uAC15\uB3C4", "img2img", "route=img2img"],
  ["clip_skip", [], "int", 1, 23, "CLIP \uAC74\uB108\uB6F0\uAE30", "sampling", "advanced"],
  ["image_guidance", [], "float", 0, 25, "\uC774\uBBF8\uC9C0 \uAC00\uC774\uB358\uC2A4", "img2img", "route=img2img"],
  ["mask_blur", [], "float", 0, 25, "\uB9C8\uC2A4\uD06C \uBE14\uB7EC", "inpaint", "route=inpaint"],
  ["mask_blur_outset", [], "int", -100, 1e3, "\uB9C8\uC2A4\uD06C \uBE14\uB7EC \uD655\uC7A5", "inpaint", "route=inpaint"],
  ["sharpness", [], "float", 0, 30, "\uC120\uBA85\uB3C4", "advanced", "advanced"],
  ["clip_weight", [], "float", 0, 1, "CLIP \uAC00\uC911\uCE58", "imagePrior", "cap=imagePrior"],
  ["negative_prompt_for_image_prior", [], "bool", null, null, "\uC774\uBBF8\uC9C0 Prior\uC5D0 \uB124\uAC70\uD2F0\uBE0C \uC801\uC6A9", "imagePrior", "cap=imagePrior"],
  ["image_prior_steps", [], "int", 3, 60, "\uC774\uBBF8\uC9C0 Prior \uC2A4\uD15D", "imagePrior", "cap=imagePrior"],
  ["prompt", [], "string", null, null, "\uD504\uB86C\uD504\uD2B8", "prompt", "composer"],
  ["negative_prompt", [], "string", null, null, "\uB124\uAC70\uD2F0\uBE0C \uD504\uB86C\uD504\uD2B8", "prompt", "composer"],
  ["hires_fix", ["enable_hr"], "bool", null, null, "\uACE0\uD574\uC0C1\uB3C4 \uBCF4\uC815", "hires", "always"],
  ["hires_fix_width", ["firstphase_width"], "int", 128, 2048, "1\uCC28 \uD328\uC2A4 \uB108\uBE44", "hires", "hires_fix=true", ["step64"]],
  ["hires_fix_height", ["firstphase_height"], "int", 128, 2048, "1\uCC28 \uD328\uC2A4 \uB192\uC774", "hires", "hires_fix=true", ["step64"]],
  ["hires_fix_strength", [], "float", 0, 1, "2\uCC28 \uD328\uC2A4 \uAC15\uB3C4", "hires", "hires_fix=true"],
  ["tiled_decoding", [], "bool", null, null, "\uD0C0\uC77C \uB514\uCF54\uB529", "tileDecode", "advanced"],
  ["decoding_tile_width", [], "int", 128, 2048, "\uB514\uCF54\uB529 \uD0C0\uC77C \uB108\uBE44", "tileDecode", "tiled_decoding=true", ["step64"]],
  ["decoding_tile_height", [], "int", 128, 2048, "\uB514\uCF54\uB529 \uD0C0\uC77C \uB192\uC774", "tileDecode", "tiled_decoding=true", ["step64"]],
  ["decoding_tile_overlap", [], "int", 64, 1024, "\uB514\uCF54\uB529 \uD0C0\uC77C \uACB9\uCE68", "tileDecode", "tiled_decoding=true", ["step64"]],
  ["original_width", [], "int", 128, 2048, "\uC6D0\uBCF8 \uB108\uBE44", "sdxl", "cap=sdxl"],
  ["original_height", [], "int", 128, 2048, "\uC6D0\uBCF8 \uB192\uC774", "sdxl", "cap=sdxl"],
  ["crop_top", [], "int", 0, 1024, "\uC704\uCABD \uD06C\uB86D", "sdxl", "cap=sdxl"],
  ["crop_left", [], "int", 0, 1024, "\uC67C\uCABD \uD06C\uB86D", "sdxl", "cap=sdxl"],
  ["target_width", [], "int", 128, 2048, "\uBAA9\uD45C \uB108\uBE44", "sdxl", "cap=sdxl"],
  ["target_height", [], "int", 128, 2048, "\uBAA9\uD45C \uB192\uC774", "sdxl", "cap=sdxl"],
  ["negative_original_width", [], "int", 128, 2048, "\uB124\uAC70\uD2F0\uBE0C \uC6D0\uBCF8 \uB108\uBE44", "sdxl", "cap=sdxl"],
  ["negative_original_height", [], "int", 128, 2048, "\uB124\uAC70\uD2F0\uBE0C \uC6D0\uBCF8 \uB192\uC774", "sdxl", "cap=sdxl"],
  ["aesthetic_score", [], "float", 0, 10, "\uBBF8\uC801 \uC810\uC218", "sdxl", "cap=sdxl"],
  ["negative_aesthetic_score", [], "float", 0, 10, "\uB124\uAC70\uD2F0\uBE0C \uBBF8\uC801 \uC810\uC218", "sdxl", "cap=sdxl"],
  ["zero_negative_prompt", [], "bool", null, null, "\uBE48 \uB124\uAC70\uD2F0\uBE0C \uC784\uBCA0\uB529 \uC81C\uB85C\uD654", "sdxl", "cap=sdxl"],
  ["refiner_model", [], "string", null, null, "\uB9AC\uD30C\uC774\uB108 \uBAA8\uB378", "refiner", "advanced"],
  ["refiner_start", [], "float", 0, 1, "\uB9AC\uD30C\uC774\uB108 \uC2DC\uC791 \uC9C0\uC810", "refiner", "refiner_model!="],
  ["num_frames", [], "int", 1, 201, "\uD504\uB808\uC784 \uC218", "video", "cap=video"],
  ["fps", [], "int", 1, 30, "FPS", "video", "cap=video"],
  ["motion_scale", [], "int", 0, 255, "\uBAA8\uC158 \uC2A4\uCF00\uC77C", "video", "cap=video"],
  ["guiding_frame_noise", [], "float", 0, 1, "\uAC00\uC774\uB4DC \uD504\uB808\uC784 \uB178\uC774\uC988", "video", "cap=video"],
  ["start_frame_guidance", [], "float", 0, 25, "\uC2DC\uC791 \uD504\uB808\uC784 \uAC00\uC774\uB358\uC2A4", "video", "cap=video"],
  ["shift", [], "float", 0.1, 8, "\uC2DC\uD504\uD2B8", "sampling", "advanced"],
  ["stage_2_steps", [], "int", 1, 1e3, "2\uB2E8\uACC4 \uC2A4\uD15D", "stage2", "cap=stage2", ["grpcOnly"]],
  ["stage_2_guidance", [], "float", 0, 25, "2\uB2E8\uACC4 CFG", "stage2", "cap=stage2"],
  ["stage_2_shift", [], "float", 0.1, 5, "2\uB2E8\uACC4 \uC2DC\uD504\uD2B8", "stage2", "cap=stage2"],
  ["loras", [], "loras", null, null, "LoRA", "conditioning", "always"],
  ["controls", [], "controls", null, null, "ControlNet", "conditioning", "always", ["httpOnly"]],
  ["stochastic_sampling_gamma", [], "float", 0, 1, "\uD655\uB960\uC801 \uC0D8\uD50C\uB9C1 \uAC10\uB9C8", "sampling", "advanced"],
  ["preserve_original_after_inpaint", [], "bool", null, null, "\uC778\uD398\uC778\uD2B8 \uD6C4 \uC6D0\uBCF8 \uBCF4\uC874", "inpaint", "route=inpaint"],
  ["tiled_diffusion", [], "bool", null, null, "\uD0C0\uC77C \uD655\uC0B0", "tileDiffusion", "advanced"],
  ["diffusion_tile_width", [], "int", 128, 2048, "\uD655\uC0B0 \uD0C0\uC77C \uB108\uBE44", "tileDiffusion", "tiled_diffusion=true", ["step64"]],
  ["diffusion_tile_height", [], "int", 128, 2048, "\uD655\uC0B0 \uD0C0\uC77C \uB192\uC774", "tileDiffusion", "tiled_diffusion=true", ["step64"]],
  ["diffusion_tile_overlap", [], "int", 64, 1024, "\uD655\uC0B0 \uD0C0\uC77C \uACB9\uCE68", "tileDiffusion", "tiled_diffusion=true", ["step64"]],
  ["upscaler", [], "string", null, null, "\uC5C5\uC2A4\uCF00\uC77C\uB7EC", "upscale", "advanced"],
  ["upscaler_scale", ["upscaler_scale_factor"], "int", 0, 4, "\uC5C5\uC2A4\uCF00\uC77C \uBC30\uC728", "upscale", "upscaler!="],
  ["t5_text_encoder_decoding", [], "bool", null, null, "T5 \uD14D\uC2A4\uD2B8 \uC778\uCF54\uB354 \uC0AC\uC6A9", "textEncoder", "advanced"],
  ["separate_clip_l", [], "bool", null, null, "CLIP-L \uD504\uB86C\uD504\uD2B8 \uBD84\uB9AC", "textEncoder", "advanced"],
  ["clip_l_text", [], "string", null, null, "CLIP-L \uD504\uB86C\uD504\uD2B8", "textEncoder", "separate_clip_l=true"],
  ["separate_open_clip_g", [], "bool", null, null, "OpenCLIP-G \uD504\uB86C\uD504\uD2B8 \uBD84\uB9AC", "textEncoder", "advanced"],
  ["open_clip_g_text", [], "string", null, null, "OpenCLIP-G \uD504\uB86C\uD504\uD2B8", "textEncoder", "separate_open_clip_g=true"],
  ["speed_up_with_guidance_embed", [], "bool", null, null, "\uAC00\uC774\uB358\uC2A4 \uC784\uBCA0\uB4DC \uAC00\uC18D", "guidanceEmbed", "advanced"],
  ["guidance_embed", [], "float", 0, 25, "\uAC00\uC774\uB358\uC2A4 \uC784\uBCA0\uB4DC", "guidanceEmbed", "speed_up_with_guidance_embed=true"],
  ["resolution_dependent_shift", [], "bool", null, null, "\uD574\uC0C1\uB3C4 \uC758\uC874 \uC2DC\uD504\uD2B8", "sampling", "advanced"],
  ["tea_cache_start", [], "int", 0, 1e3, "TeaCache \uC2DC\uC791 \uC2A4\uD15D", "teaCache", "tea_cache=true"],
  ["tea_cache_end", [], "int", 0, 1e3, "TeaCache \uC885\uB8CC \uC2A4\uD15D", "teaCache", "tea_cache=true", ["minusOneOmit"]],
  ["tea_cache_threshold", [], "float", 0, 1, "TeaCache \uC784\uACC4\uAC12", "teaCache", "tea_cache=true"],
  ["tea_cache_max_skip_steps", [], "int", 1, 1e3, "TeaCache \uCD5C\uB300 \uAC74\uB108\uB6F8 \uC2A4\uD15D", "teaCache", "tea_cache=true"],
  ["tea_cache", [], "bool", null, null, "TeaCache", "teaCache", "advanced"],
  ["separate_t5", [], "bool", null, null, "T5 \uD504\uB86C\uD504\uD2B8 \uBD84\uB9AC", "textEncoder", "advanced", ["upstreamDefaultBug"]],
  ["t5_text", [], "string", null, null, "T5 \uD504\uB86C\uD504\uD2B8", "textEncoder", "separate_t5=true", ["upstreamDefaultBug"]],
  ["causal_inference", [], "int", 0, 1e3, "\uC778\uACFC \uCD94\uB860 \uD06C\uAE30", "causal", "advanced"],
  ["causal_inference_pad", [], "int", 0, 1e3, "\uC778\uACFC \uCD94\uB860 \uD328\uB529", "causal", "causal_inference>0"],
  ["cfg_zero_star", [], "bool", null, null, "CFG-Zero*", "guidance", "advanced"],
  ["cfg_zero_init_steps", [], "int", 0, 1e3, "CFG-Zero \uCD08\uAE30 \uC2A4\uD15D", "guidance", "cfg_zero_star=true"],
  ["compression_artifacts", ["compression_artifacts"], "enum:compression", null, null, "\uC555\uCD95 \uC544\uD2F0\uD329\uD2B8", "postprocess", "advanced", ["httpBroken"]],
  ["compression_artifacts_quality", ["compression_artifacts_quality"], "float", 0, 100, "\uC555\uCD95 \uD488\uC9C8", "postprocess", "compression_artifacts!=disabled", ["httpBroken"]],
  ["color_calibration", ["color_calibration"], "enum:color", null, null, "\uC0C9\uC0C1 \uBCF4\uC815", "postprocess", "advanced", ["httpBroken"]],
  ["expand_prompt_to_json", ["expand_prompt_to_json"], "bool", null, null, "\uD504\uB86C\uD504\uD2B8\uB97C JSON\uC73C\uB85C \uD655\uC7A5", "prompt", "advanced", ["httpBroken"]],
  ["restore_faces", [], "bool", null, null, "\uC5BC\uAD74 \uBCF5\uC6D0", "postprocess", "always", ["specialHttp", "httpOnly"]],
  ["face_restoration", [], "string", null, null, "\uC5BC\uAD74 \uBCF5\uC6D0 \uBAA8\uB378", "postprocess", "advanced", ["grpcOnly"]]
];
function kindAndEnum(rawKind) {
  if (!rawKind.startsWith("enum:")) return { kind: rawKind };
  const enumName = rawKind.slice(5);
  return { kind: "enum", enumValues: E[enumName] };
}
var PARAMETER_DEFINITIONS = RAW_PARAMETERS.map(
  ([key, aliases, rawKind, min, max, label, group, when, flags = []]) => ({
    key,
    aliases: [...aliases],
    ...kindAndEnum(rawKind),
    ...min === null ? {} : { min },
    ...max === null ? {} : { max },
    label,
    group,
    when,
    step: flags.includes("step64") ? 64 : rawKind === "float" ? 0.05 : 1,
    readOnlyReason: flags.includes("httpBroken") ? "Draw Things 1.20260716.0\uC758 \uC911\uBCF5 JSON \uBCC4\uCE6D \uBC84\uADF8\uB85C HTTP \uC694\uCCAD \uC2DC 422\uAC00 \uBC1C\uC0DD\uD574 \uD604\uC7AC \uC77D\uAE30 \uC804\uC6A9\uC785\uB2C8\uB2E4." : void 0,
    readOnlyProtocol: flags.includes("httpBroken") ? "http" : void 0,
    protocols: flags.includes("grpcOnly") ? ["grpc"] : flags.includes("httpOnly") ? ["http"] : void 0,
    sourceNote: flags.includes("upstreamDefaultBug") ? "\uD604\uC7AC \uC571 \uC18C\uC2A4\uC5D0\uC11C \uAE30\uBCF8\uAC12 \uCC38\uC870\uAC00 \uC798\uBABB\uB418\uC5B4 \uC5F0\uACB0 \uD6C4 \uC11C\uBC84 \uAC12\uC744 \uC6B0\uC120 \uC0AC\uC6A9\uD569\uB2C8\uB2E4." : flags.includes("minusOneOmit") ? "\uC571 \uAE30\uBCF8\uAC12 -1\uC740 HTTP \uAC80\uC99D \uBC94\uC704 \uBC16\uC774\uBBC0\uB85C -1\uC77C \uB54C \uC694\uCCAD\uC5D0\uC11C \uC0DD\uB7B5\uD569\uB2C8\uB2E4." : flags.includes("specialHttp") ? "HTTP API \uC804\uC6A9 \uD544\uB4DC\uC774\uBA70 \uD65C\uC131\uD654\uD558\uBA74 \uC571\uC5D0 \uC124\uCE58\uB41C \uCCAB \uC5BC\uAD74 \uBCF5\uC6D0 \uBAA8\uB378\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4." : flags.includes("grpcOnly") ? "Draw Things gRPC GenerationConfiguration \uC804\uC6A9 \uD544\uB4DC\uC785\uB2C8\uB2E4." : void 0
  })
);

// src/lib/draw-things/recommended-settings.ts
var MODEL_SUFFIXES = /* @__PURE__ */ new Set(["f16", "svd", "q5p", "q6p", "q8p", "i8x"]);
var JS_TO_HTTP_PARAMETER = {
  width: "width",
  height: "height",
  seed: "seed",
  steps: "steps",
  guidanceScale: "guidance_scale",
  strength: "strength",
  sampler: "sampler",
  hiresFix: "hires_fix",
  hiresFixWidth: "hires_fix_width",
  hiresFixHeight: "hires_fix_height",
  hiresFixStrength: "hires_fix_strength",
  tiledDecoding: "tiled_decoding",
  decodingTileWidth: "decoding_tile_width",
  decodingTileHeight: "decoding_tile_height",
  decodingTileOverlap: "decoding_tile_overlap",
  tiledDiffusion: "tiled_diffusion",
  diffusionTileWidth: "diffusion_tile_width",
  diffusionTileHeight: "diffusion_tile_height",
  diffusionTileOverlap: "diffusion_tile_overlap",
  upscaler: "upscaler",
  upscalerScaleFactor: "upscaler_scale",
  imageGuidanceScale: "image_guidance",
  seedMode: "seed_mode",
  clipSkip: "clip_skip",
  controls: "controls",
  loras: "loras",
  maskBlur: "mask_blur",
  maskBlurOutset: "mask_blur_outset",
  sharpness: "sharpness",
  clipWeight: "clip_weight",
  negativePromptForImagePrior: "negative_prompt_for_image_prior",
  imagePriorSteps: "image_prior_steps",
  refinerModel: "refiner_model",
  originalImageHeight: "original_height",
  originalImageWidth: "original_width",
  cropTop: "crop_top",
  cropLeft: "crop_left",
  targetImageHeight: "target_height",
  targetImageWidth: "target_width",
  aestheticScore: "aesthetic_score",
  negativeAestheticScore: "negative_aesthetic_score",
  zeroNegativePrompt: "zero_negative_prompt",
  refinerStart: "refiner_start",
  negativeOriginalImageHeight: "negative_original_height",
  negativeOriginalImageWidth: "negative_original_width",
  batchCount: "batch_count",
  batchSize: "batch_size",
  numFrames: "num_frames",
  fps: "fps",
  motionScale: "motion_scale",
  guidingFrameNoise: "guiding_frame_noise",
  startFrameGuidance: "start_frame_guidance",
  shift: "shift",
  stage2Steps: "stage_2_steps",
  stage2Guidance: "stage_2_guidance",
  stage2Shift: "stage_2_shift",
  stochasticSamplingGamma: "stochastic_sampling_gamma",
  preserveOriginalAfterInpaint: "preserve_original_after_inpaint",
  t5TextEncoder: "t5_text_encoder_decoding",
  separateClipL: "separate_clip_l",
  clipLText: "clip_l_text",
  separateOpenClipG: "separate_open_clip_g",
  openClipGText: "open_clip_g_text",
  speedUpWithGuidanceEmbed: "speed_up_with_guidance_embed",
  guidanceEmbed: "guidance_embed",
  resolutionDependentShift: "resolution_dependent_shift",
  teaCache: "tea_cache",
  teaCacheStart: "tea_cache_start",
  teaCacheEnd: "tea_cache_end",
  teaCacheThreshold: "tea_cache_threshold",
  teaCacheMaxSkipSteps: "tea_cache_max_skip_steps",
  separateT5: "separate_t5",
  t5Text: "t5_text",
  causalInference: "causal_inference",
  causalInferencePad: "causal_inference_pad",
  cfgZeroStar: "cfg_zero_star",
  cfgZeroInitSteps: "cfg_zero_init_steps",
  compressionArtifacts: "compression_artifacts",
  compressionArtifactsQuality: "compression_artifacts_quality",
  colorCalibration: "color_calibration",
  expandPromptToJson: "expand_prompt_to_json",
  faceRestoration: "face_restoration"
};
var DEFINITION_BY_KEY = new Map(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition]));
function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function optionalString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function parseSpecifications(values) {
  const specifications = [];
  for (const value of values) {
    if (!isPlainRecord(value) || !isPlainRecord(value.configuration)) continue;
    const name = optionalString2(value.name);
    if (!name) continue;
    specifications.push({
      name,
      ...optionalString2(value.version) ? { version: optionalString2(value.version) } : {},
      configuration: value.configuration
    });
  }
  return specifications;
}
function recommendedModelPrefix(model) {
  const dot = model.lastIndexOf(".");
  const stem = dot > 0 ? model.slice(0, dot) : "";
  if (!stem) return "";
  const components = stem.split("_");
  while (components.length > 0 && MODEL_SUFFIXES.has(components.at(-1) ?? "")) components.pop();
  return components.join("_");
}
function configuredLoRAs(specification) {
  const value = specification.configuration.loras;
  if (!Array.isArray(value)) return /* @__PURE__ */ new Set();
  return new Set(value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    const file = optionalString2(item.file);
    return file ? [file] : [];
  }));
}
function supportsLoRAs(specification, loras) {
  if (loras.size === 0) return true;
  const configured = configuredLoRAs(specification);
  return [...loras].every((file) => configured.has(file));
}
function matchPair(configurations, loras, first, second) {
  const find = (candidate, requireLoRAs) => {
    const specification = configurations.find((value) => candidate.predicate(value) && (!requireLoRAs || supportsLoRAs(value, loras)));
    return specification ? { specification, match: candidate.match } : void 0;
  };
  if (loras.size === 0) return find(first, false) ?? (second ? find(second, false) : void 0);
  return find(first, true) ?? (second ? find(second, true) : void 0) ?? find(first, false) ?? (second ? find(second, false) : void 0);
}
function matchingConfiguration(model, specifications, selectedLoRAs) {
  const prefix = recommendedModelPrefix(model.file);
  const loras = new Set(selectedLoRAs.map((file) => file.trim()).filter(Boolean));
  const configurationModel = (value) => optionalString2(value.configuration.model);
  const direct = matchPair(
    specifications,
    loras,
    { match: "exact", predicate: (value) => configurationModel(value) === model.file },
    {
      match: "normalized-prefix",
      predicate: (value) => {
        const candidate = configurationModel(value);
        return Boolean(candidate && prefix && recommendedModelPrefix(candidate) === prefix);
      }
    }
  );
  if (direct) return direct;
  const parent = matchPair(specifications, loras, {
    match: "parent-prefix",
    predicate: (value) => {
      const candidate = configurationModel(value);
      const candidatePrefix = candidate ? recommendedModelPrefix(candidate) : "";
      return Boolean(prefix && candidatePrefix && prefix.startsWith(`${candidatePrefix}_`));
    }
  });
  if (parent) return parent;
  const version = optionalString2(model.version);
  if (!version) return void 0;
  return matchPair(specifications, loras, {
    match: "version",
    predicate: (value) => value.version === version
  });
}
function safeLoRAs(value) {
  if (!Array.isArray(value)) return void 0;
  const result = [];
  for (const item of value) {
    if (!isPlainRecord(item)) return void 0;
    const file = item.file === null ? null : optionalString2(item.file);
    const weight = Number(item.weight);
    const mode = item.mode === null ? null : optionalString2(item.mode);
    if (item.file !== null && !file) return void 0;
    if (!Number.isFinite(weight)) return void 0;
    if (mode !== null && mode !== void 0 && !["all", "base", "refiner"].includes(mode)) return void 0;
    result.push({ file, weight, ...mode === void 0 ? {} : { mode } });
  }
  return result;
}
function safeControls(value) {
  if (!Array.isArray(value)) return void 0;
  const result = [];
  for (const item of value) {
    if (!isPlainRecord(item)) return void 0;
    const file = item.file === null ? null : optionalString2(item.file);
    const weight = Number(item.weight);
    const guidanceStart = Number(item.guidanceStart);
    const guidanceEnd = Number(item.guidanceEnd);
    const downSamplingRate = Number(item.downSamplingRate);
    const controlImportance = optionalString2(item.controlImportance);
    const inputOverride = optionalString2(item.inputOverride) ?? "";
    const targetBlocks = item.targetBlocks;
    if (item.file !== null && !file) return void 0;
    if (![weight, guidanceStart, guidanceEnd, downSamplingRate].every(Number.isFinite)) return void 0;
    if (typeof item.noPrompt !== "boolean" || typeof item.globalAveragePooling !== "boolean") return void 0;
    if (!controlImportance || !["balanced", "prompt", "control"].includes(controlImportance)) return void 0;
    if (!Array.isArray(targetBlocks) || !targetBlocks.every((block) => typeof block === "string")) return void 0;
    result.push({
      file,
      weight,
      guidanceStart,
      guidanceEnd,
      noPrompt: item.noPrompt,
      globalAveragePooling: item.globalAveragePooling,
      downSamplingRate,
      controlImportance,
      inputOverride,
      targetBlocks: [...targetBlocks]
    });
  }
  return result;
}
function safeParameterValue(key, value) {
  const definition = DEFINITION_BY_KEY.get(key);
  if (!definition) return void 0;
  if (definition.kind === "string") return typeof value === "string" ? value : void 0;
  if (definition.kind === "bool") return typeof value === "boolean" ? value : void 0;
  if (definition.kind === "loras") return safeLoRAs(value);
  if (definition.kind === "controls") return safeControls(value);
  if (definition.kind === "enum") {
    return typeof value === "string" && definition.enumValues?.includes(value) ? value : void 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
  if (definition.kind === "int" && !Number.isInteger(value)) return void 0;
  if (definition.min !== void 0 && value < definition.min) return void 0;
  if (definition.max !== void 0 && value > definition.max) return void 0;
  return value;
}
function convertJSValue(jsKey, value) {
  if (jsKey === "sampler" && typeof value === "number" && Number.isInteger(value)) return SAMPLERS2[value];
  if (jsKey === "seedMode" && typeof value === "number" && Number.isInteger(value)) return SEED_MODES2[value];
  return value;
}
function normalizeConfiguration(configuration, model) {
  const parameters = { model: model.file };
  for (const [jsKey, httpKey] of Object.entries(JS_TO_HTTP_PARAMETER)) {
    if (!(jsKey in configuration)) continue;
    const safe = safeParameterValue(httpKey, convertJSValue(jsKey, configuration[jsKey]));
    if (safe !== void 0) parameters[httpKey] = safe;
  }
  parameters.model = model.file;
  return parameters;
}
function resolveRecommendedSettings(model, rawSpecifications, selectedLoRAs = []) {
  if (!optionalString2(model.file)) return void 0;
  const matched = matchingConfiguration(model, parseSpecifications(rawSpecifications), selectedLoRAs);
  if (!matched) return void 0;
  const configurationModel = optionalString2(matched.specification.configuration.model);
  return {
    schemaVersion: 1,
    profileName: matched.specification.name,
    ...matched.specification.version ? { profileVersion: matched.specification.version } : {},
    ...configurationModel ? { configurationModel } : {},
    match: matched.match,
    source: "local-config-cache",
    parameters: normalizeConfiguration(matched.specification.configuration, model)
  };
}

// bridge/model-catalog.ts
var MAX_METADATA_BYTES = 8 * 1024 * 1024;
var DRAW_THINGS_CONTAINER = /draw[. _-]?things/i;
async function defaultDrawThingsModelDirectories() {
  const containers = join(homedir(), "Library", "Containers");
  const candidates = /* @__PURE__ */ new Set([
    join(containers, "com.liuliu.draw-things", "Data", "Documents", "Models")
  ]);
  try {
    const entries = await readdir(containers, { withFileTypes: true });
    for (const entry2 of entries) {
      if (!entry2.isDirectory() || !DRAW_THINGS_CONTAINER.test(entry2.name)) continue;
      candidates.add(join(containers, entry2.name, "Data", "Documents", "Models"));
    }
  } catch {
  }
  return [...candidates];
}
async function existingDirectories(paths) {
  const directories = [];
  for (const path of paths) {
    const normalized = resolve(path);
    try {
      if ((await stat(normalized)).isDirectory()) directories.push(normalized);
    } catch {
    }
  }
  return [...new Set(directories)];
}
async function readMetadataArray(path) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_METADATA_BYTES) return [];
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => isPlainObject(value));
  } catch {
    return [];
  }
}
async function installedCheckpointFiles(directories) {
  const files = /* @__PURE__ */ new Set();
  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry2 of entries) {
      if (!entry2.isFile() && !entry2.isSymbolicLink() || !entry2.name.toLowerCase().endsWith(".ckpt")) continue;
      try {
        if ((await stat(join(directory, entry2.name))).size > 0) files.add(entry2.name);
      } catch {
      }
    }
  }
  return files;
}
function modelRecord(value) {
  const file = typeof value.file === "string" ? value.file.trim() : "";
  if (!file || basename(file) !== file || !file.toLowerCase().endsWith(".ckpt")) return void 0;
  const defaultScale = Number(value.default_scale);
  return {
    file,
    ...typeof value.name === "string" && value.name.trim() ? { name: value.name.trim() } : {},
    ...typeof value.version === "string" && value.version.trim() ? { version: value.version.trim() } : {},
    ...typeof value.modifier === "string" && value.modifier.trim() ? { modifier: value.modifier.trim() } : {},
    ...Number.isInteger(defaultScale) && defaultScale >= 2 && defaultScale <= 128 ? { defaultScale } : {},
    source: "local-metadata"
  };
}
async function listLocalDrawThingsModels(configuredDirectories, selectedLoRAs = []) {
  const requested = configuredDirectories?.length ? configuredDirectories : await defaultDrawThingsModelDirectories();
  const directories = await existingDirectories(requested);
  if (directories.length === 0) {
    return {
      models: [],
      directoriesScanned: 0,
      warnings: ["Draw Things \uAE30\uBCF8 \uBAA8\uB378 \uD3F4\uB354\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC678\uBD80 \uD3F4\uB354\uB294 \uCEE4\uB125\uD130\uC758 --models-dir \uC635\uC158\uC73C\uB85C \uCD94\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."]
    };
  }
  const specifications = /* @__PURE__ */ new Map();
  const recommendedConfigurations = [];
  for (const directory of directories) {
    const dataDirectory = dirname(dirname(directory));
    const catalogPaths = [
      join(dataDirectory, "Library", "Caches", "net", "models.json"),
      join(dataDirectory, "Library", "Caches", "net", "uncurated_models.json")
    ];
    for (const path of catalogPaths) {
      for (const value of await readMetadataArray(path)) {
        const model = modelRecord(value);
        if (model && !specifications.has(model.file)) specifications.set(model.file, model);
      }
    }
    recommendedConfigurations.push(...await readMetadataArray(
      join(dataDirectory, "Library", "Caches", "net", "configs.json")
    ));
  }
  for (const directory of directories) {
    for (const value of await readMetadataArray(join(directory, "custom.json"))) {
      const model = modelRecord(value);
      if (model) specifications.set(model.file, model);
    }
  }
  const installed = await installedCheckpointFiles(directories);
  const models = [...specifications.values()].filter((model) => installed.has(model.file)).map((model) => {
    const recommendedSettings = resolveRecommendedSettings(model, recommendedConfigurations, selectedLoRAs);
    return recommendedSettings ? { ...model, recommendedSettings } : model;
  }).sort((left, right) => (left.name ?? left.file).localeCompare(right.name ?? right.file, "ko"));
  const warnings = [];
  if (models.length === 0) {
    warnings.push("\uC124\uCE58\uB41C \uC8FC \uBAA8\uB378 \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBCF4\uC870 VAE\xB7CLIP\xB7T5 \uD30C\uC77C\uC740 \uBAA9\uB85D\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4.");
  }
  if (recommendedConfigurations.length === 0) {
    warnings.push("\uB85C\uCEEC configs.json \uCD94\uCC9C \uC124\uC815 \uCE90\uC2DC\uAC00 \uC5C6\uC5B4 \uBAA8\uB378\uC740 \uD45C\uC2DC\uD558\uC9C0\uB9CC \uAD8C\uC7A5 \uC124\uC815\uC740 \uC790\uB3D9 \uC801\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  }
  return { models, directoriesScanned: directories.length, warnings };
}

// bridge/server.ts
var BRIDGE_VERSION = "0.1.0";
var BRIDGE_NAME = "draw-things-web-bridge";
var ROUTES = /* @__PURE__ */ new Map([
  ["/v1/bridge/health", ["GET"]],
  ["/v1/discover", ["POST"]],
  ["/v1/test", ["POST"]],
  ["/v1/options", ["POST"]],
  ["/v1/models", ["POST"]],
  ["/v1/generate", ["POST"]]
]);
var CANCEL_PATH = /^\/v1\/cancel\/([A-Za-z0-9_-]{1,80})$/;
function requestPath(request) {
  const raw = request.url;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    throw new BridgeError("INVALID_REQUEST_TARGET", "Only origin-form request targets are accepted.", 400);
  }
  const parsed = new URL(raw, "http://bridge.invalid");
  if (parsed.search || parsed.hash) {
    throw new BridgeError("QUERY_NOT_ALLOWED", "Query strings and fragments are not accepted.", 400);
  }
  return parsed.pathname;
}
function setCommonHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}
function writeJson(response, status, value) {
  if (response.writableEnded) return;
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", body.length);
  response.end(body);
}
function errorPayload(error) {
  const safe = sanitizeError(error);
  return {
    status: safe.status,
    body: {
      ok: false,
      message: safe.message,
      error: {
        code: safe.code,
        message: safe.message,
        ...safe.details === void 0 ? {} : { details: safe.details }
      }
    }
  };
}
function candidateConnection(protocol, input, tls) {
  return normalizeConnection({
    protocol,
    host: input.host,
    port: input.port,
    tls,
    verifyTls: false,
    tlsFingerprintSha256: input.tlsFingerprintSha256,
    sharedSecret: input.sharedSecret,
    clientName: input.clientName,
    timeoutMs: input.timeoutMs ?? 2500
  });
}
function probeFailure(connection, startedAt, error) {
  const safe = sanitizeError(error);
  return {
    ok: false,
    protocol: connection.protocol,
    latencyMs: Date.now() - startedAt,
    connection: publicConnection(connection),
    error: {
      code: safe.code,
      message: safe.message,
      status: safe.status,
      ...safe.details === void 0 ? {} : { details: safe.details }
    },
    warnings: []
  };
}
function endpointFor(connection) {
  const host = connection.host === "::1" ? "[::1]" : connection.host;
  return `${connection.tls ? "https" : "http"}://${host}:${connection.port}`;
}
function metadataArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isPlainObject(item));
}
function frontendCapabilities(probe) {
  if (!probe.ok) {
    return {
      protocol: probe.protocol,
      canGenerate: false,
      canImageToImage: false,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: false,
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [probe.error.message]
    };
  }
  if (probe.protocol === "http") {
    return {
      protocol: "http",
      canGenerate: true,
      canImageToImage: true,
      canStreamProgress: false,
      canCancel: false,
      canBrowseModels: false,
      requiresHttpModeForCanvas: false,
      sharedSecretRequired: false,
      models: [],
      loras: [],
      controls: [],
      textualInversions: [],
      limitations: [
        "Draw Things HTTP API\uB294 \uC0DD\uC131 \uC911\uAC04 \uBBF8\uB9AC\uBCF4\uAE30\uC640 \uB2E8\uACC4\uBCC4 \uC9C4\uD589\uB960\uC744 \uC81C\uACF5\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        "HTTP \uC5F0\uACB0\uC744 \uCDE8\uC18C\uD574\uB3C4 Draw Things \uB0B4\uBD80 \uC0DD\uC131 \uC791\uC5C5\uC740 \uACC4\uC18D\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      ]
    };
  }
  const metadata = probe.echo?.metadata;
  const authenticated = probe.echo?.sharedSecretMissing !== true;
  let models = metadataArray(metadata?.models);
  if (models.length === 0) models = (probe.echo?.files ?? []).map((file) => ({ file }));
  return {
    protocol: "grpc",
    canGenerate: authenticated,
    canImageToImage: false,
    canStreamProgress: authenticated,
    canCancel: authenticated,
    canBrowseModels: probe.capabilities.modelBrowsing,
    requiresHttpModeForCanvas: false,
    sharedSecretRequired: probe.echo?.sharedSecretMissing ?? false,
    models,
    loras: metadataArray(metadata?.loras),
    controls: metadataArray(metadata?.controlNets),
    textualInversions: metadataArray(metadata?.textualInversions),
    serverIdentifier: probe.echo?.serverIdentifier,
    limitations: [probe.capabilities.reason ?? (authenticated ? "gRPC txt2img\uB294 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. img2img\uC640 \uC774\uBBF8\uC9C0 \uD78C\uD2B8 \uAE30\uBC18 ControlNet/IP-Adapter\uB294 \uC544\uC9C1 HTTP \uBAA8\uB4DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." : "Draw Things\uAC00 \uACF5\uC720 \uBE44\uBC00\uC744 \uC694\uAD6C\uD569\uB2C8\uB2E4. \uB3D9\uC77C\uD55C sharedSecret\uC744 \uC785\uB825\uD55C \uB4A4 \uB2E4\uC2DC \uC5F0\uACB0\uD558\uC138\uC694.")]
  };
}
function connectionTestResult(probe) {
  const checkedAt = Date.now();
  const endpoint = endpointFor(probe.connection);
  if (!probe.ok) {
    const offlineCodes = /* @__PURE__ */ new Set(["CONNECTION_REFUSED", "ECONNREFUSED", "ECONNRESET", "UPSTREAM_TIMEOUT"]);
    const tlsCodes = /* @__PURE__ */ new Set(["TLS_VERIFICATION_FAILED", "TLS_FINGERPRINT_MISMATCH", "DEPTH_ZERO_SELF_SIGNED_CERT"]);
    return {
      ok: false,
      latencyMs: probe.latencyMs,
      checkedAt,
      phase: offlineCodes.has(probe.error.code) ? "offline" : tlsCodes.has(probe.error.code) ? "cors-or-tls-blocked" : "api-mismatch",
      message: probe.error.message,
      endpoint,
      capabilities: frontendCapabilities(probe),
      diagnosticCode: probe.error.code
    };
  }
  const grpc = probe.protocol === "grpc";
  return {
    ok: true,
    latencyMs: probe.latencyMs,
    checkedAt,
    phase: "online",
    message: grpc ? probe.echo?.sharedSecretMissing ? "Draw Things gRPC\uC5D0 \uC5F0\uACB0\uD588\uC9C0\uB9CC \uACF5\uC720 \uBE44\uBC00\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. sharedSecret\uC744 \uC785\uB825\uD55C \uB4A4 \uB2E4\uC2DC \uC5F0\uACB0\uD558\uC138\uC694." : "Draw Things gRPC\uC5D0 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4. \uD14D\uC2A4\uD2B8 \uC774\uBBF8\uC9C0 \uC0DD\uC131\uACFC \uC9C4\uD589\uB960\xB7\uCDE8\uC18C\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : "Draw Things HTTP API\uC5D0 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4.",
    endpoint,
    ...probe.echo?.message ? { serverMessage: probe.echo.message } : {},
    capabilities: frontendCapabilities(probe),
    ...probe.options ? { remoteOptions: probe.options } : {},
    warnings: probe.warnings,
    certificate: probe.certificate
  };
}
async function probeConnection(connection) {
  const startedAt = Date.now();
  try {
    if (connection.protocol === "http") {
      const result2 = await getHttpOptions(connection);
      const success2 = {
        ok: true,
        protocol: "http",
        latencyMs: Date.now() - startedAt,
        connection: publicConnection(connection),
        capabilities: {
          options: true,
          modelBrowsing: false,
          generation: true,
          generationTransport: "http",
          txt2img: true,
          img2img: true
        },
        options: result2.options,
        certificate: result2.certificate,
        warnings: result2.warnings
      };
      return success2;
    }
    const result = await echoGrpc(connection);
    const warnings = [...result.warnings];
    if (result.echo.sharedSecretMissing) {
      warnings.push("Draw Things requires a matching sharedSecret before model metadata can be browsed.");
    } else if (!result.echo.modelBrowsingAvailable) {
      warnings.push("Draw Things model browsing is disabled; enable it in the app API settings to expose installed models.");
    }
    const authenticated = !result.echo.sharedSecretMissing;
    const modelBrowsing = authenticated && result.echo.modelBrowsingAvailable;
    const reason = authenticated ? `Draw Things gRPC txt2img is supported.${modelBrowsing ? "" : " Model browsing is disabled in Draw Things."} gRPC img2img and image-hint ControlNet/IP-Adapter are intentionally unavailable until image/mask/hint/content tensor upload is verified; use HTTP mode for those input-based modes.` : "Draw Things requires a matching sharedSecret before generation or model browsing can be used.";
    const success = {
      ok: true,
      protocol: "grpc",
      latencyMs: Date.now() - startedAt,
      connection: publicConnection(connection),
      capabilities: {
        options: true,
        modelBrowsing,
        generation: authenticated,
        generationTransport: authenticated ? "grpc" : null,
        txt2img: authenticated,
        img2img: false,
        reason
      },
      echo: result.echo,
      certificate: result.certificate,
      warnings
    };
    return success;
  } catch (error) {
    return probeFailure(connection, startedAt, error);
  }
}
function validateDiscoverBody(value) {
  if (!isPlainObject(value)) {
    throw new BridgeError("INVALID_DISCOVER_REQUEST", "Discovery request must be a JSON object.");
  }
  normalizeLoopbackHost(value.host);
  if (value.sharedSecret !== void 0 && typeof value.sharedSecret !== "string") {
    throw new BridgeError("INVALID_SHARED_SECRET", "sharedSecret must be a string.");
  }
  if (value.ports !== void 0) {
    if (!Array.isArray(value.ports) || value.ports.length < 1 || value.ports.length > 4 || value.ports.some((port) => !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535)) {
      throw new BridgeError("INVALID_DISCOVERY_PORTS", "ports must contain 1-4 integers from 1 to 65535.");
    }
  }
  return value;
}
async function handleDiscover(request, response) {
  const body = validateDiscoverBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  const requestedPorts = Array.isArray(body.ports) ? body.ports : [body.port === void 0 ? DEFAULT_DRAW_THINGS_PORT : Number(body.port)];
  const ports = [...new Set(requestedPorts)];
  const candidates = ports.flatMap((port) => {
    const input = { ...body, port };
    return [
      candidateConnection("http", input, false),
      candidateConnection("grpc", input, true),
      candidateConnection("grpc", input, false)
    ];
  });
  const results = await Promise.all(candidates.map(probeConnection));
  const endpoints = results.filter((result) => result.ok).map((result) => ({
    id: `loopback-${result.protocol}-${result.connection.tls ? "tls" : "plain"}-${result.connection.port}`,
    name: result.protocol === "http" ? `Draw Things HTTP :${result.connection.port}` : `Draw Things gRPC${result.connection.tls ? " TLS" : ""} :${result.connection.port}`,
    protocol: result.protocol,
    host: result.connection.host,
    port: result.connection.port,
    tls: result.connection.tls,
    source: "loopback",
    latencyMs: result.latencyMs,
    message: result.echo?.message ?? (result.protocol === "http" ? "Draw Things HTTP API" : void 0)
  }));
  writeJson(response, 200, {
    ok: results.some((result) => result.ok),
    host: normalizeLoopbackHost(body.host),
    ports,
    endpoints,
    results
  });
}
function getConnectionBody(value, purpose = "control") {
  if (!isPlainObject(value)) throw new BridgeError("INVALID_REQUEST", "Request body must be a JSON object.");
  return {
    body: value,
    connection: normalizeConnection(value.connection, purpose)
  };
}
async function handleTest(request, response) {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  writeJson(response, 200, connectionTestResult(await probeConnection(connection)));
}
async function handleOptions(request, response) {
  const { connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  writeJson(response, 200, await probeConnection(connection));
}
function modelMetadata(value) {
  if (!isPlainObject(value) || typeof value.file !== "string" || !value.file.trim()) return void 0;
  const defaultScale = Number(value.defaultScale);
  return {
    file: value.file.trim(),
    ...typeof value.name === "string" && value.name.trim() ? { name: value.name.trim() } : {},
    ...typeof value.version === "string" && value.version.trim() ? { version: value.version.trim() } : {},
    ...typeof value.modifier === "string" && value.modifier.trim() ? { modifier: value.modifier.trim() } : {},
    ...Number.isInteger(defaultScale) && defaultScale >= 2 && defaultScale <= 128 ? { defaultScale } : {},
    ...value.source === "local-metadata" && isPlainObject(value.recommendedSettings) ? { recommendedSettings: value.recommendedSettings } : {},
    ...typeof value.source === "string" ? { source: value.source } : {}
  };
}
async function handleModels(request, response, modelDirectories) {
  const { body, connection } = getConnectionBody(await readJsonBody(request, MAX_CONTROL_BODY_BYTES));
  const selectedLoRAs = body.selectedLoRAs === void 0 ? [] : body.selectedLoRAs;
  if (!Array.isArray(selectedLoRAs) || selectedLoRAs.length > 64 || selectedLoRAs.some((value) => typeof value !== "string" || value.length > 4096)) {
    throw new BridgeError("INVALID_MODEL_REQUEST", "selectedLoRAs must contain at most 64 bounded filenames.");
  }
  const local = await listLocalDrawThingsModels(modelDirectories, selectedLoRAs);
  const models = /* @__PURE__ */ new Map();
  const sources = /* @__PURE__ */ new Set();
  for (const value of local.models) {
    const model = modelMetadata(value);
    if (!model) continue;
    models.set(String(model.file), model);
    sources.add("local-metadata");
  }
  const warnings = [...local.warnings];
  if (connection.protocol === "grpc") {
    const probe = await probeConnection(connection);
    if (probe.ok) {
      const echoModels = metadataArray(probe.echo?.metadata.models);
      for (const value of echoModels) {
        const model = modelMetadata({ ...value, source: "grpc-echo" });
        if (model) {
          const key = String(model.file);
          const localModel = models.get(key);
          models.set(key, {
            ...localModel,
            ...model,
            ...localModel?.recommendedSettings ? { recommendedSettings: localModel.recommendedSettings } : {}
          });
        }
      }
      if (echoModels.length > 0) sources.add("grpc-echo");
      warnings.push(...probe.warnings);
    } else {
      warnings.push(`gRPC Echo \uBAA8\uB378 \uBAA9\uB85D\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${probe.error.message}`);
    }
  } else {
    try {
      const result = await getHttpOptions(connection);
      const current = result.options.model;
      if (typeof current === "string" && current.trim() && !models.has(current.trim())) {
        models.set(current.trim(), { file: current.trim(), name: current.trim(), source: "http-current" });
        sources.add("http-current");
      }
      warnings.push(...result.warnings);
    } catch (error) {
      const safe = sanitizeError(error);
      warnings.push(`\uD604\uC7AC HTTP \uBAA8\uB378\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${safe.message}`);
    }
  }
  const source = sources.size > 1 ? "combined" : sources.values().next().value ?? "none";
  writeJson(response, 200, {
    ok: true,
    models: [...models.values()].sort((left, right) => String(left.name ?? left.file).localeCompare(String(right.name ?? right.file), "ko")),
    source,
    checkedAt: Date.now(),
    stale: false,
    directoriesScanned: local.directoriesScanned,
    warnings: [...new Set(warnings)]
  });
}
function generationId(value) {
  if (value === void 0) return randomUUID();
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new BridgeError("INVALID_GENERATION_ID", "id must contain 1-80 letters, numbers, underscores, or hyphens.");
  }
  return value;
}
var HTTP_UNWRITABLE_PARAMETERS = /* @__PURE__ */ new Set([
  "compression_artifacts",
  "compression_artifacts_quality",
  "color_calibration",
  "expand_prompt_to_json",
  "stage_2_steps",
  "face_restoration"
]);
function safeHttpParameters(parameters) {
  return Object.fromEntries(Object.entries(parameters).filter(([key, value]) => {
    if (HTTP_UNWRITABLE_PARAMETERS.has(key)) return false;
    if (key === "tea_cache_end" && Number(value) < 0) return false;
    if (key === "upscaler" && typeof value === "string" && !value.trim()) return false;
    return true;
  }));
}
var GRPC_UNSUPPORTED_PARAMETERS = /* @__PURE__ */ new Set(["restore_faces", "controls"]);
function safeGrpcParameters(parameters) {
  return Object.fromEntries(
    Object.entries(parameters).filter(([key]) => !GRPC_UNSUPPORTED_PARAMETERS.has(key))
  );
}
function safeProtocolParameters(parameters, protocol) {
  return protocol === "http" ? safeHttpParameters(parameters) : safeGrpcParameters(parameters);
}
function stripDataUrl(value) {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}
function generationInput(body, protocol) {
  if (isPlainObject(body.request)) {
    const request = body.request;
    if (request.mode !== "txt2img" && request.mode !== "img2img") {
      throw new BridgeError("INVALID_GENERATION_MODE", 'request.mode must be "txt2img" or "img2img".');
    }
    if (!isPlainObject(request.parameters)) {
      throw new BridgeError("INVALID_PARAMETERS", "request.parameters must be a JSON object.");
    }
    if (typeof request.prompt !== "string" || typeof request.negativePrompt !== "string") {
      throw new BridgeError("INVALID_PROMPT", "request.prompt and request.negativePrompt must be strings.");
    }
    const parameters = {
      ...safeProtocolParameters(request.parameters, protocol),
      prompt: request.prompt,
      negative_prompt: request.negativePrompt
    };
    if (request.mode === "img2img" && request.initImage !== void 0) {
      if (typeof request.initImage !== "string") {
        throw new BridgeError("INVALID_INIT_IMAGE", "request.initImage must be a data URL or base64 string.");
      }
      parameters.init_images = [stripDataUrl(request.initImage)];
    }
    return {
      id: generationId(request.id),
      mode: request.mode,
      parameters
    };
  }
  if (body.mode !== "txt2img" && body.mode !== "img2img") {
    throw new BridgeError("INVALID_GENERATION_MODE", 'mode must be "txt2img" or "img2img".');
  }
  if (!isPlainObject(body.parameters)) {
    throw new BridgeError("INVALID_PARAMETERS", "parameters must be a JSON object.");
  }
  return {
    id: generationId(body.id),
    mode: body.mode,
    parameters: safeProtocolParameters(body.parameters, protocol)
  };
}
async function writeNdjson(response, value) {
  if (response.writableEnded || response.destroyed) return;
  const line = `${JSON.stringify(value)}
`;
  if (response.write(line)) return;
  await new Promise((resolve3, reject) => {
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("error", onError);
      response.off("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve3();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new BridgeError("CLIENT_DISCONNECTED", "The browser closed the generation stream.", 499));
    };
    response.once("drain", onDrain);
    response.once("error", onError);
    response.once("close", onClose);
  });
}
async function handleGenerate(request, response, active) {
  const { body, connection } = getConnectionBody(
    await readJsonBody(request, MAX_GENERATE_BODY_BYTES),
    "generation"
  );
  const { id, mode, parameters } = generationInput(body, connection.protocol);
  if (connection.protocol === "grpc" && mode === "img2img") {
    throw new BridgeError(
      "GRPC_IMG2IMG_NOT_IMPLEMENTED",
      "gRPC image-to-image input is not available yet. Switch Draw Things to HTTP mode for img2img, or use txt2img over gRPC.",
      409,
      { generationTransport: "grpc", supportedModes: ["txt2img"] }
    );
  }
  if (active.has(id)) throw new BridgeError("GENERATION_ID_IN_USE", "A generation with this id is already active.", 409);
  const state = { controller: new AbortController(), cancelled: false };
  active.set(id, state);
  let completed = false;
  const startedAt = Date.now();
  let heartbeat;
  request.once("aborted", () => state.controller.abort());
  response.once("close", () => {
    if (!completed && !response.writableEnded) state.controller.abort();
  });
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Transfer-Encoding", "chunked");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
  try {
    await writeNdjson(response, {
      type: "accepted",
      requestId: id,
      message: "Draw Things\uAC00 \uC0DD\uC131 \uC694\uCCAD\uC744 \uBC1B\uC558\uC2B5\uB2C8\uB2E4."
    });
    heartbeat = setInterval(() => {
      void writeNdjson(response, {
        type: "progress",
        requestId: id,
        progress: 4,
        message: "Draw Things\uC5D0\uC11C \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026"
      }).catch(() => state.controller.abort());
    }, 15e3);
    heartbeat.unref();
    const emitGrpcProgress = async (progress) => {
      if (state.controller.signal.aborted || completed) return;
      if (progress.previewImage) {
        await writeNdjson(response, {
          type: "preview",
          requestId: id,
          image: progress.previewImage
        });
      }
      if (state.controller.signal.aborted || completed) return;
      if (!progress.signpost && progress.downloadSize === void 0) return;
      const signpost = progress.signpost;
      const firstPassSteps = Number.isInteger(Number(parameters.steps)) && Number(parameters.steps) > 0 ? Number(parameters.steps) : 16;
      const secondPassSteps = Number.isInteger(Number(parameters.stage_2_steps)) && Number(parameters.stage_2_steps) > 0 ? Number(parameters.stage_2_steps) : 10;
      const secondPass = signpost?.phase === "second-pass-sampling";
      const totalSteps = secondPass ? secondPassSteps : firstPassSteps;
      const step = signpost?.step;
      const progressValue = step === void 0 ? progress.downloadSize !== void 0 ? 96 : 8 : Math.min(94, Math.max(8, Math.round(step / Math.max(1, totalSteps) * 84 + 8)));
      await writeNdjson(response, {
        type: "progress",
        requestId: id,
        progress: progressValue,
        ...step === void 0 ? {} : { step, totalSteps },
        message: progress.downloadSize !== void 0 ? "\uC0DD\uC131 \uACB0\uACFC\uB97C \uC804\uC1A1\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026" : signpost?.phase === "sampling" || signpost?.phase === "second-pass-sampling" ? `\uC0D8\uD50C\uB9C1 ${step ?? ""}/${totalSteps}` : "Draw Things\uC5D0\uC11C \uC774\uBBF8\uC9C0\uB97C \uCC98\uB9AC\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026"
      });
    };
    const result = connection.protocol === "http" ? await generateHttpImages(connection, mode, parameters, state.controller.signal) : await generateGrpcImages(
      connection,
      typeof parameters.prompt === "string" ? parameters.prompt : "",
      typeof parameters.negative_prompt === "string" ? parameters.negative_prompt : "",
      parameters,
      state.controller.signal,
      emitGrpcProgress
    );
    await writeNdjson(response, {
      type: "result",
      requestId: id,
      images: result.images,
      durationMs: Date.now() - startedAt
    });
    completed = true;
    response.end();
  } catch (error) {
    const safe = sanitizeError(error);
    if (!response.destroyed) {
      await writeNdjson(response, state.cancelled || safe.code === "ABORTED" ? { type: "cancelled", requestId: id, message: "\uC774\uBBF8\uC9C0 \uC0DD\uC131\uC744 \uCDE8\uC18C\uD588\uC2B5\uB2C8\uB2E4." } : {
        type: "error",
        requestId: id,
        message: safe.message,
        code: safe.code
      });
      completed = true;
      response.end();
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    active.delete(id);
  }
}
function handleCancel(response, active, id) {
  const generation = active.get(id);
  if (!generation) {
    writeJson(response, 200, { ok: true, id, cancelled: false, reason: "not_active" });
    return;
  }
  generation.cancelled = true;
  generation.controller.abort();
  writeJson(response, 200, { ok: true, id, cancelled: true });
}
function expectedMethods(path) {
  return ROUTES.get(path) ?? (CANCEL_PATH.test(path) ? ["POST"] : void 0);
}
function createBridgeServer(options = {}) {
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new BridgeError("INVALID_BRIDGE_PORT", "Bridge port must be an integer from 0 to 65535.");
  }
  const bind = normalizeBridgeBindAddress(options.bind);
  const tailscaleServeHosts = [...new Set((options.tailscaleServeHosts ?? []).map(normalizeTailscaleServeHost))];
  const remotelyReachable = !isLoopbackBindAddress(bind) || tailscaleServeHosts.length > 0;
  if (tailscaleServeHosts.length > 0 && !isLoopbackBindAddress(bind)) {
    throw new BridgeError("TAILSCALE_SERVE_LOOPBACK_REQUIRED", "Tailscale Serve proxy mode requires a loopback connector bind.");
  }
  if (remotelyReachable && (typeof options.token !== "string" || options.token.length < 32)) {
    throw new BridgeError("REMOTE_BIND_TOKEN_REQUIRED", "A token of at least 32 characters is required for a Tailscale bind or Serve proxy.");
  }
  if (remotelyReachable && !options.origins?.length) {
    throw new BridgeError("REMOTE_BIND_ORIGIN_REQUIRED", "At least one explicit --origin is required for a Tailscale bind or Serve proxy.");
  }
  const origins = options.origins?.length ? options.origins : DEFAULT_DEV_ORIGINS;
  const allowedOrigins = new Set(origins.map(normalizeOrigin));
  const active = /* @__PURE__ */ new Map();
  const server = createServer((request, response) => {
    void (async () => {
      setCommonHeaders(response);
      const address = server.address();
      const expectedPort = address && typeof address !== "string" ? address.port : requestedPort;
      validateHostHeader(request, expectedPort, bind, tailscaleServeHosts);
      const allowedOrigin = validateOrigin(request, response, allowedOrigins);
      const path = requestPath(request);
      const methods = expectedMethods(path);
      if (!methods) throw new BridgeError("NOT_FOUND", "Bridge endpoint not found.", 404);
      if (request.method === "OPTIONS") {
        handlePreflight(request, response, methods);
        return;
      }
      validateToken(request, options.token);
      if (!request.method || !methods.includes(request.method)) {
        response.setHeader("Allow", methods.join(", "));
        throw new BridgeError("METHOD_NOT_ALLOWED", "HTTP method is not allowed for this endpoint.", 405);
      }
      if (path === "/v1/bridge/health") {
        writeJson(response, 200, {
          ok: true,
          name: BRIDGE_NAME,
          version: BRIDGE_VERSION,
          bind,
          port: expectedPort,
          paired: true,
          allowedOrigin,
          tokenRequired: Boolean(options.token),
          allowedOrigins: [...allowedOrigins],
          tailscaleServeHosts,
          activeGenerations: active.size,
          now: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (path === "/v1/discover") {
        await handleDiscover(request, response);
      } else if (path === "/v1/test") {
        await handleTest(request, response);
      } else if (path === "/v1/options") {
        await handleOptions(request, response);
      } else if (path === "/v1/models") {
        await handleModels(request, response, options.modelDirectories);
      } else if (path === "/v1/generate") {
        await handleGenerate(request, response, active);
      } else {
        const match = CANCEL_PATH.exec(path);
        if (!match?.[1]) throw new BridgeError("NOT_FOUND", "Bridge endpoint not found.", 404);
        handleCancel(response, active, match[1]);
      }
    })().catch((error) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.destroy(error instanceof Error ? error : void 0);
        return;
      }
      const payload = errorPayload(error);
      writeJson(response, payload.status, payload.body);
    });
  });
  server.requestTimeout = 12e4;
  server.headersTimeout = 1e4;
  server.keepAliveTimeout = 5e3;
  server.maxHeadersCount = 64;
  server.maxConnections = 32;
  server.maxRequestsPerSocket = 1e3;
  return server;
}
function nextArgument(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new BridgeError("MISSING_ARGUMENT", `${flag} requires a value.`);
  return value;
}
function parseCliArguments(args) {
  let port = DEFAULT_BRIDGE_PORT;
  let bind = "127.0.0.1";
  const origins = [];
  let token;
  const modelDirectories = [];
  const tailscaleServeHosts = [];
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf("=");
    const flag = separator >= 0 ? argument.slice(0, separator) : argument;
    const inlineValue = separator >= 0 ? argument.slice(separator + 1) : void 0;
    if (flag === "--help" || flag === "-h") {
      help = true;
    } else if (flag === "--port") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new BridgeError("INVALID_BRIDGE_PORT", "--port must be an integer from 1 to 65535.");
      }
    } else if (flag === "--bind") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      bind = normalizeBridgeBindAddress(value);
    } else if (flag === "--origin") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      origins.push(normalizeOrigin(value));
    } else if (flag === "--token" || flag === "--pairing-code") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      if (value.length < 6 || value.length > 4096) {
        throw new BridgeError("INVALID_TOKEN", `${flag} must contain 6-4096 characters.`);
      }
      if (token !== void 0 && token !== value) {
        throw new BridgeError("CONFLICTING_TOKEN", "--token and --pairing-code must match when both are supplied.");
      }
      token = value;
    } else if (flag === "--models-dir") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      if (!value.trim()) throw new BridgeError("INVALID_MODELS_DIRECTORY", "--models-dir must not be empty.");
      modelDirectories.push(resolve2(value));
    } else if (flag === "--tailscale-host" || flag === "--proxy-host") {
      const value = inlineValue ?? nextArgument(args, index, flag);
      if (inlineValue === void 0) index += 1;
      tailscaleServeHosts.push(normalizeTailscaleServeHost(value));
    } else {
      throw new BridgeError("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  if (tailscaleServeHosts.length > 0 && !isLoopbackBindAddress(bind)) {
    throw new BridgeError("TAILSCALE_SERVE_LOOPBACK_REQUIRED", "--tailscale-host requires the default loopback --bind.");
  }
  if ((!isLoopbackBindAddress(bind) || tailscaleServeHosts.length > 0) && (!token || token.length < 32)) {
    throw new BridgeError("REMOTE_BIND_TOKEN_REQUIRED", "A token of at least 32 characters is required with Tailscale exposure.");
  }
  if ((!isLoopbackBindAddress(bind) || tailscaleServeHosts.length > 0) && origins.length === 0) {
    throw new BridgeError("REMOTE_BIND_ORIGIN_REQUIRED", "An explicit --origin is required with Tailscale exposure.");
  }
  return {
    port,
    bind,
    origins: origins.length ? [...new Set(origins)] : [...DEFAULT_DEV_ORIGINS],
    token,
    modelDirectories: [...new Set(modelDirectories)],
    tailscaleServeHosts: [...new Set(tailscaleServeHosts)],
    help
  };
}
function usage() {
  return `Draw Things Web local connector ${BRIDGE_VERSION}

Usage:
  draw-things-bridge.mjs [--port 47821] [--bind 127.0.0.1] [--origin https://app.example]... [--token SECRET] [--tailscale-host HOST[:PORT]]... [--models-dir PATH]...

Options:
  --port <number>          Connector port (default: 47821)
  --bind <address>         127.0.0.1, ::1, or this Mac's Tailscale IP
  --origin <origin>        Exact allowed website Origin; repeat for multiple sites
  --token <secret>         Optional bearer / X-Draw-Things-Bridge-Token value
  --pairing-code <secret>  Alias for --token
  --tailscale-host <host>  Exact *.ts.net Tailscale Serve hostname and optional HTTPS port
  --proxy-host <host>      Alias for --tailscale-host
  --models-dir <path>      Additional Draw Things model folder; repeat as needed
  --help                   Show this help

The connector only binds loopback or an explicit Tailscale address and only contacts Draw Things on loopback.
Tailscale binds require an explicit origin and a token of at least 32 characters.
Tailscale Serve hosts keep the connector on loopback and also require an explicit origin and 32-character token.
Without --origin, localhost Vite development origins on ports 5173 and 4173 are allowed.`;
}
async function startBridge(args = process.argv.slice(2)) {
  const cli = parseCliArguments(args);
  if (cli.help) {
    process.stdout.write(`${usage()}
`);
    return void 0;
  }
  const defaults = await defaultDrawThingsModelDirectories();
  const server = createBridgeServer({
    ...cli,
    modelDirectories: [.../* @__PURE__ */ new Set([...defaults, ...cli.modelDirectories])]
  });
  await new Promise((resolve3, reject) => {
    server.once("error", reject);
    server.listen(cli.port, cli.bind, () => {
      server.off("error", reject);
      resolve3();
    });
  });
  const displayHost = cli.bind.includes(":") ? `[${cli.bind}]` : cli.bind;
  process.stdout.write(`Draw Things Web bridge listening on http://${displayHost}:${cli.port}
`);
  process.stdout.write(`Allowed origins: ${cli.origins.join(", ")}
`);
  process.stdout.write(`Pairing token: ${cli.token ? "required" : "disabled"}
`);
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5e3).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}
var entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : void 0;
if (entry === import.meta.url) {
  startBridge().catch((error) => {
    const safe = sanitizeError(error);
    process.stderr.write(`${safe.code}: ${safe.message}
`);
    process.exitCode = 1;
  });
}
export {
  createBridgeServer,
  parseCliArguments,
  probeConnection,
  startBridge
};
