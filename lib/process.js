const utils = require('./utils');
const Task = require('./task');

class Process {
    constructor(task, chip, parentProcess = false) {
        this.__coexec__process__ = true;
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
        this.errors.__coexec__exception__ = true;
        this.executionPromise = new Promise((__resolve, __reject) => {
            this.__resolve = __resolve;
            this.__reject = __reject;
        });

        this.config = utils.clone(this.chip.config);
        for (let k in this.task.config) {
            if (this.task.config.hasOwnProperty(k)) {
                const v = this.task.config[k];

                if (v !== undefined) {
                    this.config[k] = v;
                }    
            }
        }
        this.heavy = this.config.heavy;

        this.then = this.executionPromise.then.bind(this.executionPromise);
        this.catch = this.executionPromise.catch.bind(this.executionPromise);

        this.totalCycles = 0;
        this.reset();
    }

    init() {
        if (utils.isArray(this.task.fn)) {
            // handle array in initialization
            const fns = this.task.fn;

            this.fnArray = [(function* () {
                return fns;
            })()];
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

        this.cycle = function* () {
            return yield init();
        };
    }

    addError(e) {
        this.errors.push(e);
    }

    retry() {
        let maxRetries = this.config.retries;

        if (!utils.isNumber(maxRetries)) {
            maxRetries = 0;
        }
        if (this.retries >= maxRetries) {
            return true;
        }
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
    resolve(data) {
        return this.__resolve(data);
    }
    reject() {
        return this.__reject(this.errors);
    }
}

// Try to run in all levels of nested fns
// Throw if none of it catches
// If it gets caught, nullify self.__data and return
function throwRecursively(self, res, startAtTop = false) {
    let fn;
    const {fnArray} = self;

    if (startAtTop === false) {
        fnArray.pop();
    }

    if (fnArray.length < 1) {
        throw res.value;
    }
    while (fnArray.length >= 1) {
        fn = fnArray[fnArray.length - 1];
        try {
            res = fn.throw(res.value);
            if (utils.isError(res.value)) {
                continue;
            }
            break;
        } catch (e) {
            fnArray.pop();
            res.value = e;
        }
    }
    if (fnArray.length === 0) {
        throw res.value;
    }
    return res;
}

// taskCycler returns a function running a cycle in a Process
const taskCycler = (self = {}) => {
    delete self.__data;
    return function* () {
        let res;
        const {fnArray} = self;
        let fn = fnArray[fnArray.length - 1];

        self.busy = false;
        self.totalCycles++;

        if (utils.isError(self.__data)) {
            res = throwRecursively(self, {value: self.__data}, true);
        } else {
            try {
                res = fn.next(self.__data);
            } catch (e) {
                res = {value: e, done: false};
                res = throwRecursively(self, res, false);
            }
            if (utils.isError(res.value)) {
                res = throwRecursively(self, res, true);
            }
        }
        self.__data = res.value;
        let type = utils.getType(self.__data);
        let p;
        
        switch (type) {
        case 'generator':
            fnArray.push(self.__data);
            return yield null;
        case 'task':
            self.busy = true;
            p = promiseResolver(taskResolver(self.__data, self, {threading: false})); // Run task in main Chip

            p.then(function (d) {
                self.__data = d;
                self.busy = false;
            });
            return yield p;
        case 'generatorFn':
            fnArray.push(self.__data());
            return yield null;
        case 'exception':
            throw self.__data;
        case 'promise':
            self.busy = true;
            checkProcessForDeadlock(self.__data);
            p = promiseResolver(self.__data);
            p.then(function (d) {
                self.__data = d;
                self.busy = false;
            });
            return yield p;
        case 'object': case 'value': case 'function': case 'array':
            if (res.done === true) {
                fnArray.pop();
            } // Go up one level
            if (fnArray.length === 0) {
                return self.__data; // Done with current generator, which was the top level one, complete
            } else {
                yield self.__data;
                break;
            }
        default:
            if (type.startsWith('array_')) {
                // Generator yields array of potential generators, parallelize
                const arrayType = type.substr('array_'.length);

                switch (arrayType) {
                case 'generator':
                case 'generatorFn':
                    self.busy = true;
                    p = promiseResolver(threadify(self.__data, self, arrayType));
                    p.then((d) => {
                        self.__data = d;
                        self.busy = false;
                    });
                    return yield p;
                case 'task':
                    self.busy = true;
                    p = promiseResolver(threadify(self.__data, self, arrayType));
                    p.then(function (d) {
                        self.__data = d;
                        self.busy = false;
                    });
                    return yield p;
                case 'promise':
                    self.busy = true;
                    self.__data.map(checkProcessForDeadlock);
                    sanitizePromises(self.__data);
                    p = promiseResolver(Promise.all(self.__data));
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
                throw new Error(`Unhandled command type: ${type}`);
            }
        }
    };
};

const checkProcessForDeadlock = (p) => {
    try {
        if (p.__coexec__process__ === true) {
            if (p.chip.config.pooling === true) {
                const executioner = p.config.executioner || p.chip.executioner;

                executioner.moveProcessToSubChip(p);
            }
        }
    } catch (e) {
        console.error('object imitating co-executioner process [__coexec__process__ set to true]');
        console.error(e);
    }
};

// If promises are not native, promisify
const sanitizePromises = (array) => {
    array.forEach((p, i) => {
        if (p instanceof Promise) return;
        array[i] = new Promise((resolve, reject) => p.then(resolve).catch(reject));
    });
};

const promiseResolver = (p) => {
    return new Promise((resolve) => {
        return p.then(resolve).catch((error) => {
            const type = utils.getType(error);

            if (type === 'exception' || type === 'array_exception') {
                return resolve(error);
            } else {
                return resolve(new Error(error));
            }
        });
    });
};

/*
 * Array/Parallel handling
 **/
const threadify = (tasks, process, arrayType) => {
    // Push tasks to sub-chip, throttle by number of threads
    const count = tasks.length;

    switch (arrayType) {
    case 'generator':
        tasks = tasks.map((g, i) => new Task({name: `t${i + 1}/${count}`, retries: 0}, function* () {
            return yield g;
        }));
        break;
    case 'generatorFn':
        tasks = tasks.map((g, i) => new Task({name: `t${i + 1}/${count}`, retries: 0}, g));
        break;
    }
    return new Promise((_resolve, reject) => {
        let p = 0;
        let completed = 0;
        const data = new Array(count);
        const resolver = (i) => (res) => {
            completed++;
            data[i] = res;
            if (completed === count) {
                return _resolve(data);
            }
            if (p === count) return; // all tasks have been pushed to the executioner
            const t = tasks[p];

            taskResolver(t, process, {threading: true})
                .then(resolver(p))
                .catch(reject);
            return p++;
        };
        const threads = process.config.threads || 1;

        p = Math.min(threads, count);
        for (let i = 0; i < p; i++) {
            taskResolver(tasks[i], process, {threading: true})
                .then(resolver(i))
                .catch(reject);
        }
    });
};

const taskResolver = (tasks, process, options = {}) => {
    const {executioner} = process.chip;
    let runInSub = options.threading || (process.chip.name === 'sub');
    const genP = (task) => {
        let exec = task.config ? task.config.executioner : undefined;

        runInSub = runInSub && !exec;
        if (exec === executioner) {
            runInSub = true; // Avoid simple deadlock
        } else {
            if (exec == null) {
                exec = executioner;
            }
            // Account for cyclic deadlocks
            const plist = process.getParentList();

            if (plist.includes(exec)) {
                runInSub = true;
            }
        }
        return exec.execute(task, process, runInSub);
    };

    // Run in current chip
    return utils.isArray(tasks) ? Promise.all(tasks.map(genP)) : genP(tasks);
};

// Expose Process class
module.exports = Process;