'use strict';
let highlightFunction;
self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'init') {
            highlightFunction = new Function('return (' + data.code + '\n)')();
            if (typeof highlightFunction !== 'function') throw new Error('함수를 입력하세요.');
            self.postMessage({ type: 'ready' });
        } else if (data.type === 'run') {
            const result = await highlightFunction(data.text, data.direction);
            let ranges;
            if (result === false || result == null || result === '') {
                ranges = [];
            } else if (typeof result === 'string') {
                ranges = [];
                let start = 0;
                while (ranges.length < 1000 && (start = data.text.indexOf(result, start)) !== -1) {
                    ranges.push({ start, end: start + result.length });
                    start += result.length;
                }
            } else if (Array.isArray(result)) {
                ranges = result;
            } else {
                throw new Error('문자열, 범위 배열 또는 빈 결과를 반환하세요.');
            }
            self.postMessage({ type: 'result', id: data.id, ranges });
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: String(error && error.message || error) });
    }
};
