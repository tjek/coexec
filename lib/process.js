const utils = require('./utils');
const Task = require('./task');

class Process {
    constructor(task, chip, parentProcess = false) {
        this.task = task;
        this.chip = chip;
        this.parentProcess = parentProcess || false;
        if (this.parentProcess !== false) {
            if (!this.task) throw new Error('Child process instantiated without task');
            this.name = `${this.parentProcess.task.name}::${this.task.name}`;
        } else {
            this.name = `${this.task.name}`;
        }

        this.retries = 0;
        this.errors = [];
        this.reset();
        this.executionPromise = new Promise((__resolve, __reject) => {
            this.__resolve = __resolve;
            this.__reject = __reject;
        });

        this.config = utils.clone(this.chip.config);
        for (let k in this.task.config) {
            const v = this.task.config[k];
            if (v !== undefined) { this.config[k] = v; }
        }
        this.heavy = this.config.heavy;

        this.then = this.executionPromise.then.bind(this.executionPromise);
        this.catch = this.executionPromise.catch.bind(this.executionPromise);

        this.totalCycles = 0;
    }

    init() {
        if (utils.isArray(this.task.fn)) {
            // handle array in initialization
            const fns = this.task.fn;
            this.fnArray = [(function* () { return fns; })()];
        } else {
            if (utils.isFunction(this.task != null ? this.task.fn : undefined)) {
                this.fnArray = [this.task.fn()];
            } else {
                throw new Error('Input must be a function');
            }
        }
        return this.cycle = taskCycler(this);
    }

    reset() {
        this.busy = false;
        const init = this.init.bind(this); // reset execution to top-level generator
        this.cycle = function* () { return yield init(); };
    }

    addError(e) {
        this.errors.push(e);
    }

    retry() {
        let maxRetries = this.config.retries;
        if (!utils.isNumber(maxRetries)) { maxRetries = 0; }
        if (this.retries >= maxRetries) { return true; }
        this.retries++;
        this.reset();

        return false;
    }

    pause(timeout) {
        this.busy = true;
        const self = this;
        return new Promise((resolve) => {
            setTimeout(() => {
                self.busy = false;
                resolve();
            }, timeout);
        });
    }

    getParentList() {
        let p = this;
        const plist = [];
        while (p !== false) {
            plist.push(p.chip.executioner);
            p = p.parentProcess;
        }
        return plist;
    }

    // Called from the executioner
    resolve(data) { return this.__resolve(data); }
    reject() {
        return this.__reject(this.errors);
    }
}

// taskCycler returns a function running a cycle in a Process
var taskCycler = function (self = {}) {
    delete self.__data;
    return function* () {
        let res;
        self.busy = true;
        self.totalCycles++;
        // Get the current generator
        const { fnArray } = self;
        const fn = fnArray[fnArray.length - 1];
        try {
            res = fn.next(self.__data);
        } catch (e) {
            // catch exceptions that are thrown without being yield
            self.__data = e;
            throw self.__data;
        }

        // Throw error of failed promises
        if (utils.isError(self.__data)) throw self.__data;
        let data = res.value;
        if (typeof data === 'undefined') { data = self.__data; }
        self.busy = false;
        let type = utils.getType(data);
        switch (type) {
            case 'generator':
                fnArray.push(data);
                return yield null;
            case 'task':
                self.busy = true;
                var p = taskResolver(data, self, { threading: false }); // Run task in main Chip
                p.then(function (d) {
                    self.__data = d;
                    self.busy = false;
                });
                return yield p;
            case 'generatorFn':
                fnArray.push(data());
                return yield null;
            case 'exception':
                throw data;
            case 'promise':
                self.busy = true;
                p = promiseResolver(data);
                p.then(function (d) {
                    self.__data = d;
                    self.busy = false;
                });
                return yield p;
            case 'object': case 'value': case 'function': case 'array':
                self.__data = data;
                if (res.done === true)
                    fnArray.pop(); // Go up one level
                if (fnArray.length === 0) {
                    return data; // Done with current generator, which was the top level one, complete
                } else {
                    yield data;
                }
            default:
                if (type.startsWith('array_')) {
                    // Generator yields array of potential generators, parallelize
                    const arrayType = type.substr('array_'.length);
                    switch (arrayType) {
                        case 'generator':
                            self.busy = true;
                            p = threadify(data, self);
                            p.then(function (d) {
                                self.__data = d;
                                self.busy = false;
                            });
                            return yield p;
                        case 'generatorFn':
                            self.busy = true;
                            p = threadify((data.map(gfn => gfn())), self);
                            p.then(function (d) {
                                self.__data = d;
                                self.busy = false;
                            });
                            return yield p;
                        case 'task':
                            self.busy = true;
                            p = threadify(data, self, false);
                            p.then(function (d) {
                                self.__data = d;
                                self.busy = false;
                            });
                            return yield p;
                        case 'promise':
                            p = Promise.all(data);
                            p.then(function (d) {
                                self.__data = d;
                                self.busy = false;
                            });
                            return yield p;
                        case 'exception':
                            throw self.__data;
                        default:
                            throw new Error(`Unhandled nested thread command type: ${type}`);
                    }
                } else {
                    throw new Error(`Unhandled thread command type: ${type}`);
                }
        }
    };
};

const promiseResolver = (p) => {
    return new Promise((resolve, reject) => {
        return p.then(resolve).catch((_error) => {
            if (utils.isError(_error)) {
                return resolve(_error);
            } else {
                return resolve(new Error(_error));
            }
        });
    });
};

/*
Array/Parallel handling
*/
const threadify = (tasks, process, isGenerator = true) => {
    // Push tasks to sub-chip, throttle by number of threads
    const count = tasks.length;
    if (isGenerator === true) {
        // Generate tasks from the generators
        tasks = tasks.map((g, i) => new Task(`t${i + 1}/${count}`, function* () { return g; }));
    }
    return new Promise((_resolve, reject) => {
        let p = 0;
        let completed = 0;
        const data = new Array(count);
        const resolver = i => (res) => {
            completed++;
            data[i] = res;
            if (completed === count) { return _resolve(data); }
            if (p === count) return;   // all tasks have been pushed to the executioner
            const t = tasks[p];
            taskResolver(t, process, { threading: true })
                .then(resolver(p))
                .catch(reject);
            return p++;
        };
        const threads = process.config.threads || 1;
        p = Math.min(threads, count);
        for (let i = 0; i < p; i++) {
            taskResolver(tasks[i], process, { threading: true })
                .then(resolver(i))
                .catch(reject);
        }
    });
};

const taskResolver = (tasks, process, options = {}) => {
    const { executioner } = process.chip;
    let runInSub = options.threading || (process.chip.name === 'sub');
    const customExec = task => task.config ? task.config.executioner : undefined;
    const genP = (task) => {
        let exec = task.config ? task.config.executioner : undefined;
        runInSub = runInSub && !exec;
        if (exec === executioner) {
            runInSub = true; // Avoid simple deadlock
        } else {
            if (exec == null) { exec = executioner; }
            // Account for cyclic deadlocks
            const plist = process.getParentList();
            if (plist.includes(exec)) {
                runInSub = true;
            }
        }
        return exec.execute(task, process, runInSub);
    };

    // Run in current chip
    if (utils.isArray(tasks)) {
        return promiseResolver(Promise.all(tasks.map(genP)));
    } else {
        return promiseResolver(genP(tasks));
    }
};

// Expose Process class
module.exports = Process;