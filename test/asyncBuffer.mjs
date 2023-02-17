/**
 * Wraps a Node file object as an async buffer expected by jfive- async*
 */

import * as fs from 'fs'

class AsyncBuffer {

    constructor(path) {
        this.path = path
    }

    async slice(start, end) {

        let position = start;
        let length = end - start;

        if(length === 0) {
            return new ArrayBuffer(0)
        }

        const fd = fs.openSync(this.path, 'r')
        const buffer = Buffer.alloc(length)
        const bytesRead = fs.readSync(fd, buffer, 0, length, position)

        fs.close(fd, function (error) {
            // TODO Do something with error
        })

        //TODO -- compare result.bytesRead with length
        const arrayBuffer = buffer.buffer
        return arrayBuffer
    }
}

export {AsyncBuffer}