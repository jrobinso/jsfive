#!/usr/bin/env node

import to_array_test from './to_array_test.mjs'
import bool_test from "./bool_test.mjs"


let tests = []
const add_tests = (tests_in) => { /*global*/
    tests = tests.concat(tests_in)
}

add_tests(to_array_test)
add_tests(bool_test)


async function run_test(test) {
    try {
        await test.test()
        console.log('✓', test.description)
    } catch (error) {
        console.log('x', test.description)
        console.log(error.stack)
    }
}

async function run_tests(tests) {
    for (let test of tests) {
        await run_test(test)
    }
}

await run_tests(tests)
