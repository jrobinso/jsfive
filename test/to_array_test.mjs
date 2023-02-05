#!/usr/bin/env node

import {strict as assert} from 'assert'
import {File} from '../../hdf5-indexed-reader/src/jsfive/index.mjs'
import {AsyncBuffer} from "./asyncBuffer.mjs"


async function to_array_test() {

    const fh = new AsyncBuffer('./test/array.h5')
    const f = new File(fh, 'array.h5', {})
    await f.ready

    const bigintDS = await f.get('bigint')
    const a = await bigintDS.to_array()
    assert.deepEqual(
        a,
        [
            [
                [0, 1],
                [2, 3]
            ],
            [
                [4, 5],
                [6, 7]
            ]
        ]
    )
}

export const tests = [
    {
        description: 'Read datasets into nested arrays of plain JS types',
        test: to_array_test,
    },
]
export default tests
