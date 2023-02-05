#!/usr/bin/env node

import { strict as assert } from 'assert';
import {AsyncBuffer} from "./asyncBuffer.mjs"
import {File} from "../dist/esm/index.mjs"

async function bool_test() {

  const fh = new AsyncBuffer('./test/array.h5')
  const f = new File(fh, 'array.h5', {})
  await f.ready

  const boolDS = await f.get('bool')
  const boolValue = await boolDS.value

  // NOTE: jsfive does not decode enums, so values are the enum values
  assert.deepEqual(
      boolValue,
      [ 0, 1, 1, 0 ]
  )

  // H5WASM, and perhaps other libraries, would decode this as
  // assert.deepEqual(
  //   boolValue,
  //   [ false, true, true, false ]
  // )


}

export const tests = [
  {
    description: 'Read boolean datasets',
    test: bool_test,
  },
];
export default tests;
