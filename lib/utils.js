const chunk = (arr, n) => {
    const _arr = new Array(Math.ceil(arr.length / n));

    for (let i = 0; i < _arr.length; i++) {
        _arr[i] = arr.slice(i * n, (i + 1) * n);
    }
    return _arr;
};

// swallow Object copy
const clone = (o) => {
    if (!isObject(o)) {
        return o;
    }
    const oClone = {};

    for (const k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
            const v = o[k];

            oClone[k] = clone(v);
        }
    }

    return oClone;
};

const errorify = (e) => {
    if (isError(e)) return e;
    if (e === undefined) {
        return new Error('undefined');
    }
    if (e === null) {
        return new Error('null');
    }
    if (isString(e)) {
        e = new Error(e);
    }
    e.__coexec__exception__ = true;

    return e;
};

const inject = function (...args) {
    if (args.length < 2) {
        throw new Error('call as follow inject(scope, ...modules)');
    }

    const [scope, ...modules] = args;

    return modules.map(function (module) {
        if (!isString(module)) {
            throw new Error('call as follow inject(scope, ...modules:[String])');
        }
        if (isFunction(scope[module]) && !isGeneratorFn(scope[module])) {
            return scope[module].bind(scope);
        } else {
            return scope[module];
        }
    });
};

const isString = (s) => (typeof s === 'string') || s instanceof String;

const isNumber = (num) => Number.isFinite(num);

const isObject = (val) => (val != null) && ((Object === (val != null ? val.constructor : undefined)) || (typeof val === 'object')) && !_isError(val);

const isArray = (arr) => Array.isArray(arr);

const isFunction = (f) => typeof f === 'function';

const isPromise = (val) => val instanceof Promise || isObject(val) && isFunction(val.then) && isFunction(val.catch);

const _isError = (e) => (Object.prototype.toString.call(e) === '[object Error]') || e instanceof Error || e.__coexec__exception__ === true;

const isError = (e) => (e != null) && _isError(e);

const isGenerator = (obj) => obj && isFunction(obj.next) && isFunction(obj.throw);

const isGeneratorFn = (obj) => {
    if (obj == null || !obj.constructor) return false;
    if ([obj.constructor.name, obj.constructor.displayName].includes('GeneratorFunction')) return true;

    return isGenerator(obj.constructor.prototype);
};

const isTask = (t) => {
    return t && t.constructor && t.constructor.name === 'Task' && isArray(t.__fnArray);
};

const hasKey = (o, k) => o !== null && o !== undefined && k in o;

// high level helpers
const valueTypes = ['array', 'object', 'function', 'value', 'exception'];
const getArrayType = (arr) => {
    if (arr.__coexec__exception__) return 'exception';
    if (arr.length === 0) return 'value';
    for (const item of arr) {
        if (isError(item)) return 'array_exception';
    }
    const type = getType(arr[0], false);
    const isValueType = valueTypes.includes(type);

    if ((arr.length === 1) && isValueType) return type;
    if (isValueType) return 'array';
    for (let i = 1; i < arr.length; i++) {
        if (type !== getType(arr[i], false)) return 'array';
    }
    // We got array of something special
    return `array_${type}`;
};

const getType = (o, resolveArrays = true) => {
    if (isTask(o)) return 'task';
    if (isPromise(o)) return 'promise';
    if (isGenerator(o)) return 'generator';
    if (isGeneratorFn(o)) return 'generatorFn';
    if (isError(o)) return 'exception';
    if (isFunction(o)) return 'function';
    if (isArray(o)) {
        if (resolveArrays) return getArrayType(o);
        return 'array';
    }
    if (isObject(o)) return 'object';
    return 'value';
};

const getTypeResolveArrays = (data) => getType(data, true);

module.exports = {
    chunk,
    clone,
    errorify,
    inject,
    isString,
    isNumber,
    isObject,
    isArray,
    isFunction,
    isError,
    isGenerator,
    isGeneratorFn,
    hasKey,
    getType: getTypeResolveArrays
};