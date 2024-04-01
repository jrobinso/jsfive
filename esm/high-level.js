import {DataObjects} from './dataobjects.js';
import {SuperBlock} from './misc-low-level.js';
export { Filters } from './filters.js';
import * as pako from '../node_modules/pako/dist/pako.esm.mjs';

export class Group {
  /*
    An HDF5 Group which may hold attributes, datasets, or other groups.
    Attributes
    ----------
    attrs : dict
        Attributes for this group.
    name : str
        Full path to this group.
    file : File
        File instance where this group resides.
    parent : Group
        Group instance containing this group.
  */

  /**
   *
   *
   * @memberof Group
   * @member {Group|File} parent;
   * @member {File} file;
   * @member {string} name;
   * @member {DataObjects} _dataobjects;
   * @member {Object} _attrs;
   * @member {Array<string>} _keys;
   */
  // parent;
  // file;
  // name;
  // _links;
  // _dataobjects;
  // _attrs;
  // _keys;

  /**
   *
   * @param {string} name
   * @param {DataObjects} dataobjects
   * @param {Group} [parent]
   * @param {boolean} [getterProxy=false]
   * @returns {Group}
   */
  constructor(name, parent) {
    if (parent == null) {
      this.parent = this;
      this.file = this;
    }
    else {
      this.parent = parent;
      this.file = parent.file;
    }
    this.name = name;
  }

  async init(dataobjects) {

    // Changes to support hdf5-indexed-reader  JTR
    const index = this.file.index;
    if (index && this.name in index) {
      this._links = index[this.name];
    } else {
      this._links = await dataobjects.get_links();
    }
    // End of changes to support hdf5-indexed-reader

    this._dataobjects = dataobjects;
    this._attrs = null;  // cached property
    this._keys = null;
  }

  get keys() {
    if (this._keys == null) {
      this._keys = Object.keys(this._links);
    }
    return this._keys.slice();
  }

  get values() {
    return this.keys.map(k => this.get(k));
  }

  length() {
    return this.keys.length;
  }

  _dereference(ref) {
    //""" Deference a Reference object. """
    if (!ref) {
      throw 'cannot deference null reference';
    }
    let obj = this.file._get_object_by_address(ref);
    if (obj == null) {
      throw 'reference not found in file';
    }
    return obj
  }

  async get(y) {
    //""" x.__getitem__(y) <==> x[y] """
    if (typeof(y) == 'number') {
      return this._dereference(y);
    }

    var path = normpath(y);
    if (path == '/') {
      return this.file;
    }

    if (path == '.') {
      return this
    }
    if (/^\//.test(path)) {
      return this.file.get(path.slice(1));
    }

    if (posix_dirname(path) != '') {
      var [next_obj, additional_obj] = path.split(/\/(.*)/);
    }
    else {
      var next_obj = path;
      var additional_obj = '.'
    }
    if (!(next_obj in this._links)) {
      throw next_obj + ' not found in group';
    }

    var obj_name = normpath(this.name + '/' + next_obj);
    let link_target = this._links[next_obj];

    if (typeof(link_target) == "string") {
      try {
        return this.get(link_target)
      } catch (error) {
        return null
      }
    }

    var dataobjs = new DataObjects(this.file._fh, link_target);
    await dataobjs.ready;

    if (dataobjs.is_dataset) {
      if (additional_obj != '.') {
        throw obj_name + ' is a dataset, not a group';
      }
      return new Dataset(obj_name, dataobjs, this);
    }
    else {
      var new_group = new Group(obj_name, this);
      await new_group.init(dataobjs);
      return new_group.get(additional_obj);
    }
  }

  visit(func) {
    /*
    Recursively visit all names in the group and subgroups.
    func should be a callable with the signature:
        func(name) -> None or return value
    Returning None continues iteration, return anything else stops and
    return that value from the visit method.
    */
    return this.visititems((name, obj) => func(name));
  }

  visititems(func) {
    /*
    Recursively visit all objects in this group and subgroups.
    func should be a callable with the signature:
        func(name, object) -> None or return value
    Returning None continues iteration, return anything else stops and
    return that value from the visit method.
    */
    var root_name_length = this.name.length;
    if (!(/\/$/.test(this.name))) {
      root_name_length += 1;
    }
    //queue = deque(this.values())
    var queue = this.values.slice();
    while (queue) {
      let obj = queue.shift();
      if (queue.length == 1) console.log(obj);
      let name = obj.name.slice(root_name_length);
      let ret = func(name, obj);
      if (ret != null) {
        return ret
      }
      if (obj instanceof Group) {
        queue = queue.concat(obj.values);
      }
    }
    return null
  }

  get attrs() {
    //""" attrs attribute. """
    if (this._attrs == null) {
      this._attrs = this._dataobjects.get_attributes();
    }
    return this._attrs
  }

}

const groupGetHandler = {
  get: function(target, prop, receiver) {
    if (prop in target) {
      return target[prop];
    }
    return target.get(prop);
  }
};


export class File extends Group {
  /*
  Open a HDF5 file.
  Note in addition to having file specific methods the File object also
  inherit the full interface of **Group**.
  File is also a context manager and therefore supports the with statement.
  Files opened by the class will be closed after the with block, file-like
  object are not closed.
  Parameters
  ----------
  filename : str or file-like
      Name of file (string or unicode) or file like object which has read
      and seek methods which behaved like a Python file object.
  Attributes
  ----------
  filename : str
      Name of the file on disk, None if not available.
  mode : str
      String indicating that the file is open readonly ("r").
  userblock_size : int
      Size of the user block in bytes (currently always 0).
  */

  constructor (fh, filename, options) {
    //""" initalize. """
    //if hasattr(filename, 'read'):
    //    if not hasattr(filename, 'seek'):
    //        raise ValueError(
    //            'File like object must have a seek method')
    super('/', null);


    this.ready = this.init(fh, filename, options);
  }

  async init(fh, filename, options) {

    var superblock = new SuperBlock(fh, 0);
    await superblock.ready;
    var offset = await superblock.get_offset_to_dataobjects();
    var dataobjects = new DataObjects(fh, offset);
    await dataobjects.ready;
    //   constructor(name, dataobjects, parent, getterProxy=false) {
    this.parent = this;
    this.file = this;
    this.name = '/';
    this._dataobjects = dataobjects;
    this._attrs = null;  // cached property
    this._keys = null
    this._fh = fh
    this.filename = filename || '';
    this.mode = 'r';
    this.userblock_size = 0;

    // Changes to support hdf5-indexed-reader (JTR)
    if(options && options.index) {
      this.index = options.index;  // Explicit index -- this is not common
    } else {
      // Search for an index.  First we check for an explicit pointer (indexOffset).  Next we check the root
      // object (File) attributes.  Finally we walk links searching
      let index_offset;
      if (options && options.indexOffset) {
        index_offset = options.indexOffset;
      } else {
          const attrs = await this.attrs;
          if (attrs.hasOwnProperty("_index_offset")) {
            index_offset = attrs["_index_offset"];
          } else {
            const indexName = this.indexName || "_index";
            const index_link = await dataobjects.find_link(indexName);
            if (index_link) {
              index_offset = index_link[1];
            }
          }
        }
        if (index_offset) {
          try {
            const dataobject = new DataObjects(fh, index_offset);
            await dataobject.ready;
            const comp_index_data = await dataobject.get_data();
            const inflated = pako.ungzip(comp_index_data);
            const json = new TextDecoder().decode(inflated);
            this.index = JSON.parse(json);
          } catch (e) {
            console.error(`Error loading index by offset ${e}`)
          }
        }
      }

    if (this.index && this.name in this.index) {
      this._links = this.index[this.name];
    } else {
      this._links = await dataobjects.get_links();
    }
    // End of change to support hdf5-indexed-reader
  }

  // End of change to support hdf5-indexed-reader

  _get_object_by_address(obj_addr) {
    //""" Return the object pointed to by a given address. """
    if (this._dataobjects.offset == obj_addr) {
      return this
    }
    return this.visititems(
      (y) => {(y._dataobjects.offset == obj_addr) ? y : null;}
    );
  }
}

export class Dataset extends Array {
  /*
  A HDF5 Dataset containing an n-dimensional array and meta-data attributes.
  Attributes
  ----------
  shape : tuple
      Dataset dimensions.
  dtype : dtype
      Dataset's type.
  size : int
      Total number of elements in the dataset.
  chunks : tuple or None
      Chunk shape, or NOne is chunked storage not used.
  compression : str or None
      Compression filter used on dataset.  None if compression is not enabled
      for this dataset.
  compression_opts : dict or None
      Options for the compression filter.
  scaleoffset : dict or None
      Setting for the HDF5 scale-offset filter, or None if scale-offset
      compression is not used for this dataset.
  shuffle : bool
      Whether the shuffle filter is applied for this dataset.
  fletcher32 : bool
      Whether the Fletcher32 checksumming is enabled for this dataset.
  fillvalue : float or None
      Value indicating uninitialized portions of the dataset. None is no fill
      values has been defined.
  dim : int
      Number of dimensions.
  dims : None
      Dimension scales.
  attrs : dict
      Attributes for this dataset.
  name : str
      Full path to this dataset.
  file : File
      File instance where this dataset resides.
  parent : Group
      Group instance containing this dataset.
  */

  /**
   *
   *
   * @memberof Dataset
   * @member {Group|File} parent;
   * @member {File} file;
   * @member {string} name;
   * @member {DataObjects} _dataobjects;
   * @member {Object} _attrs;
   * @member {string} _astype;
   */
  // parent;
  // file;
  // name;
  // _dataobjects;
  // _attrs;
  // _astype;

  constructor(name, dataobjects, parent) {
    //""" initalize. """
    super();
    this.parent = parent;
    this.file = parent.file
    this.name = name;

    this._dataobjects = dataobjects
    this._attrs = null;
    this._astype = null;
  }

  get value() {
    var data = this._dataobjects.get_data();
    if (this._astype == null) {
      return this.getValue(data)
    }
    return data.astype(this._astype);  // TODO -- this doesn't seem to be implemented anywhere
  }

  get shape() {
    return this._dataobjects.shape;
  }

  get attrs() {
    return this._dataobjects.get_attributes();
  }

  get dtype() {
    return this._dataobjects.dtype;
  }

  get fillvalue() {
    return this._dataobjects.get_fillvalue();
  }

  /**
   * Adapted from H5WASM *
   * @param value
   * @param shape
   * @returns {Promise<string|*>}
   */
  async to_array() {
    const value = await this.value
    const shape = await this.shape
    return create_nested_array(value, shape);
  }

  async getValue(data) {
    const dtype = await this.dtype;
    if((typeof dtype === 'string' || dtype instanceof String) && dtype.startsWith("S")) {
      return (await data).map(s => {
        let idx = s.indexOf('\0')
        return idx >= 0 ? s.substring(0, idx) : s
      });
    } else {
      return data;
    }
  }
}


function posix_dirname(p) {
  let sep = '/';
  let i = p.lastIndexOf(sep) + 1;
  let head = p.slice(0, i);
  let all_sep = new RegExp('^' + sep + '+$');
  let end_sep = new RegExp(sep + '$');
  if (head && !(all_sep.test(head))) {
    head = head.replace(end_sep, '');
  }
  return head
}

function normpath(path) {
  return path.replace(/\/(\/)+/g, '/');
  // path = posixpath.normpath(y)
}

// From h5wasm

function create_nested_array(value, shape) {
  // check that shapes match:
  const total_length = value.length;
  const dims_product = shape.reduce((previous, current) => (previous * current), 1);
  if (total_length !== dims_product) {
    console.warn(`shape product: ${dims_product} does not match length of flattened array: ${total_length}`);
  }
  // Get reshaped output:
  let output = value;
  const subdims = shape.slice(1).reverse();
  for (let dim of subdims) {
    // in each pass, replace input with array of slices of input
    const new_output = [];
    const { length } = output;
    let cursor = 0;
    while (cursor < length) {
      new_output.push(output.slice(cursor, cursor += dim));
    }
    output = new_output;
  }
  return output;
}

