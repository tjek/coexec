/**
 * Executioner: Threading
 * Test:
 *   - Single-core executioners
 *   - Multi-core executioners
 *   - Single-core/Multi-thread executioners
 *   - Heavy tasks
 * For:
 *   - Execution start time
 *   - Execution end time
 *   - Execution data output
 */

const Executioner = require('../.');
const {waiter} = require('../lib/templates');
const {Task} = Executioner;
const assert = require('assert');

class MochaEvent {
    constructor(name, handler) {
        this.name = name;
        this.handler = handler;
    }
}

class MochaEventHandler {
    constructor() {
        this.clear();
    }

    clear() {
        this.events = [];
        this.eventH = {};
    }

    happened(e) {
        this.events.push(e);
        if (!this.eventH[e]) {
            this.eventH[e] = 1;
        } else {
            this.eventH[e]++;
        }
        return e;
    }
}

describe('Executioner', () =>
    describe('Threading', () => {
        const eh = new MochaEventHandler();
        const single = new Executioner({
            name: 'single',
            silent: true,
            cores: 1,
            threads: 1
        });
        const multi = new Executioner({
            name: 'multi',
            silent: true,
            cores: 8,
            threads: 1
        });
        const multiThread = new Executioner({
            name: 'multi++',
            silent: true,
            cores: 8,
            threads: 8
        });
        const taskGen = (name, wait, data) => {
            if (wait == null) wait = 0;
            if (data == null) data = true;
            return new Task(`t${name}`, function* () {
                eh.happened(`start${name}`);
                yield new Promise((resolve) => {
                    if (wait > 0) {
                        setTimeout((() => resolve(true)), wait);
                    } else {
                        resolve(true);
                    }
                });

                eh.happened(`end${name}`);
                return data;
            });
        };
        const t0 = taskGen(0, 100, 0);
        const t1 = taskGen(1, 0, 1);

        describe('Single-Core', () => {
            it('should never parallelize [core level]', () => {
                eh.clear();
                return Promise.all([(single.execute(t0)), (single.execute(t1))])
                    .then((data) => {
                        assert.deepEqual(eh.events, ['start0', 'end0', 'start1', 'end1'], 'should wait for t0 before starting t1');
                        return assert.deepEqual(data, [0, 1], 'should return proper data');
                    }).catch(assert.fail);
            });
        });

        describe('Multi-Core / Single-Thread', () => {
            it('should parallelize [core level]', () => {
                eh.clear();
                return Promise.all([(multi.execute(t0)), (multi.execute(t1))])
                    .then((data) => {
                        assert.deepEqual(eh.events, ['start0', 'start1', 'end1', 'end0'], 'should not wait for t0 before starting t1');
                        return assert.deepEqual(data, [0, 1], 'should return proper data');
                    }).catch(assert.fail);
            });
            const t = new Task('parallel', function* () {
                const data = yield [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => taskGen(i, (100 - (i * 10)), i));

                return data;
            });

            return it('should not parallelize [thread level]', (done) => {
                eh.clear();
                multi.execute(t)
                    .then((data) => {
                        const expectedEvents = [];

                        for (let i = 0; i <= 10; i++) {
                            expectedEvents.push(`start${i}`);
                            expectedEvents.push(`end${i}`);
                        }
                        assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'should return proper data');
                        assert.deepEqual(eh.events, expectedEvents, 'should run in non-parallel mode');
                        return done();
                    }).catch(done);
            });
        });

        describe('Multi-Core / Multi-Thread', () => {
            it('should parallelize all [thread level]', (done) => {
                eh.clear();
                const t = new Task('parallel', function* () {
                    return yield [0, 1, 2, 3, 4, 5].map((i) => taskGen(i, (i * 5), i));
                });

                multiThread.execute(t).then((data) => {
                    let i;
                    const expectedEvents = [];

                    for (i = 0; i <= 5; i++) {
                        expectedEvents.push(`start${i}`);
                    }
                    for (i = 0; i <= 5; i++) {
                        expectedEvents.push(`end${i}`);
                    }
                    assert.deepEqual(data, [0, 1, 2, 3, 4, 5], 'should return proper data');
                    assert.deepEqual(eh.events, expectedEvents, 'should run in non-parallel mode');
                    done();
                }).catch(done);
            });
            it('should parallelize all, ending in reverse order [thread level]', (done) => {
                eh.clear();
                const t = new Task('parallel', function* () {
                    return yield [0, 1, 2, 3, 4, 5].map((i) => taskGen(i, ((11 - i) * 10), i));
                });

                multiThread.execute(t)
                    .then((data) => {
                        let i;
                        const expectedEvents = [];

                        for (i = 0; i <= 5; i++) {
                            expectedEvents.push(`start${i}`);
                        }
                        for (i = 5; i >= 0; i--) {
                            expectedEvents.push(`end${i}`);
                        }
                        assert.deepEqual(data, [0, 1, 2, 3, 4, 5], 'should return proper data');
                        assert.deepEqual(eh.events, expectedEvents, 'should run in parallel mode');
                        done();
                    }).catch(done);
            });
            it('should parallelize some, queue rest [thread level]', (done) => {
                eh.clear();
                const t = new Task('parallel', function* () {
                    return yield [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => taskGen(i, (i * 5), i));
                });

                multiThread.execute(t)
                    .then((data) => {
                        assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'should return proper data');
                        const expectedEvents = ['start0', 'start1', 'start2', 'start3', 'start4', 'start5', 'start6', 'start7', 'end0', 'start8', 'end1', 'start9', 'end2', 'start10', 'end3', 'end4', 'end5', 'end6', 'end7', 'end8', 'end9', 'end10'];

                        assert.deepEqual(eh.events, expectedEvents, 'should run in parallel mode');
                        done();
                    }).catch(done);
            });
            it('should parallelize some, queue rest in reverse order [thread level]', (done) => {
                eh.clear();
                const t = new Task('parallel', function* () {
                    return yield [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => taskGen(i, ((6 - i) * 5), i));
                });

                multiThread.execute(t)
                    .then((data) => {
                        assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'should return proper data');
                        const expectedEvents = ['start0', 'start1', 'start2', 'start3', 'start4', 'start5', 'start6', 'start7', 'end6', 'end7', 'start8', 'start9', 'end8', 'end9', 'start10', 'end10', 'end5', 'end4', 'end3', 'end2', 'end1', 'end0'];

                        assert.deepEqual(eh.events, expectedEvents, 'should run in parallel mode');
                        done();
                    }).catch(done);
            });
        });

        describe('Heavy Tasks', () => {
            const asyncT = function (ms, ev, count) {
                if (count == null) {
                    count = 1;
                }
                return new Task('parallel', function* () {
                    eh.happened(`start-${ev}`);
                    while (count-- > 0) {
                        yield waiter(ms);
                    }
                    eh.happened(`end-${ev}`);
                });
            };

            it('should not start other tasks when a heavy one exists', (done) => {
                // Put heavy task first with big waiter
                // Put another task after without waiter
                // Heavy should throw end event before the other one
                eh.clear();
                const heavyT = asyncT(200, 'heavy');

                heavyT.config.heavy = true;
                const lightT = asyncT(10, 'light');

                Promise.all([multiThread.execute(heavyT), multiThread.execute(lightT)])
                    .then(() => {
                        assert.deepEqual(eh.events, ['start-heavy', 'end-heavy', 'start-light', 'end-light']);
                        return done();
                    }).catch(done);
            });
            it('should pause tasks', (done) => {
                // Put task that has multiple small waiters
                // Put heavy task with one waiter, way bigger than the other ones
                // Heavy should throw end event before the other one
                eh.clear();
                const lightT = asyncT(10, 'light', 5);
                const heavyT = asyncT(100, 'heavy');

                heavyT.config.heavy = true;
                const p1 = multiThread.execute(lightT);
                const after = () => {
                    const p2 = multiThread.execute(heavyT);

                    return Promise.all([p1, p2])
                        .then(() => {
                            assert.deepEqual(eh.events, ['start-light', 'start-heavy', 'end-heavy', 'end-light']);
                            return done();
                        }).catch(done);
                };

                setTimeout(after, 10);
            });
            it('should not pause tasks', (done) => {
                // Put task that has multiple small waiters
                // Put another task with one waiter, way bigger than the other one
                // Second task should throw end event after the other one
                // Use same numbers to demonstrate the the previous test is actually valid and heavy works
                eh.clear();
                const lightT = asyncT(10, 'light', 5);
                const heavyT = asyncT(100, 'heavy');
                const p1 = multiThread.execute(lightT);
                const after = () => {
                    const p2 = multiThread.execute(heavyT);

                    return Promise.all([p1, p2])
                        .then(() => {
                            assert.deepEqual(eh.events, ['start-light', 'start-heavy', 'end-light', 'end-heavy']);
                            return done();
                        }).catch(done);
                };

                setTimeout(after, 10);
            });
            it('should pause execution of subtasks unrelated to the main task [not implemented]');
            // NOT sure if we should actually do this one. In a way, maybe it should work if we propagated cycles to subtasks
            // Currently thought, we just wait for the task/process promise to resolve/reject
            // So NOT sure if we want this, or HOW is should be done either
        });
    })
);

module.exports = {
    MochaEventHandler,
    MochaEvent
};