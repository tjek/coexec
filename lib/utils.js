const isString = s => (typeof s === 'string') || s instanceof String;

const isObject = val => (val != null) && ((Object === (val != null ? val.constructor : undefined)) || (typeof val === 'object')) && !_isError(val);

const isNumber = num => Number.isFinite(num);

const isArray = arr => Array.isArray(arr);

const isFunction = f => typeof f === 'function';

var _isError = e => (Object.prototype.toString.call(e) === '[object Error]') || e instanceof Error;

const isError = e => (e != null) && _isError(e);

const isGenerator = obj => obj && isFunction(obj.next) && isFunction(obj.throw);

const isGeneratorFn = (obj) => {
    const constructor = obj != null ? obj.constructor : undefined;
    if (constructor == null) return false;
    if ([constructor.name, constructor.displayName].includes('GeneratorFunction')) return true;

    return isGenerator(constructor.prototype);
};

const isTask = t => {
    return t && t.constructor && t.constructor.name === 'Task' && isArray(t.__fnArray);
};

const chunk = (arr, n) => {
    const count = Math.ceil(arr.length / n);
    const _arr = new Array(Math.ceil(arr.length / n));
    for (let i = 0; i < _arr.length; i++)
        _arr[i] = arr.slice(i * n, (i + 1) * n);
    return _arr;
};

// swallow Object copy
const clone = (o) => {
    if (!isObject(o)) { return o; }
    const oClone = Object.create(null);
    for (let k in o) {
        const v = o[k];
        oClone[k] = clone(v);
    }

    return oClone;
};

// high level helpers
const getArrayType = (arr) => {
    if (arr.length === 0) return 'value';
    const type = getType(arr[0], false);
    if (['array', 'object', 'function', 'value', 'exception'].includes(type)) return 'array';
    if ((arr.length === 1) || ['array', 'object', 'function', 'value'].includes(type)) return type;
    for (let i = 1; i < arr.length; i++)
        if (type !== getType(arr[i], false)) return 'array';

    // We got array of something special
    return `array_${type}`;
};

const getType = (o, resolveArrays = true) => {
    if (isTask(o)) return 'task';
    if (o instanceof Promise) return 'promise';
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

const inject = function () {
    if (arguments.length < 2) { throw new Error('call as follow inject(scope, ...modules)'); }
    [scope, ...modules] = arguments;

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

const getTypeResolveArrays = (data) => getType(data, true); // Force resolveArrays true

module.exports = {
    chunk,
    clone,
    isString,
    isNumber,
    isObject,
    isArray,
    isFunction,
    isError,
    isGenerator,
    isGeneratorFn,
    inject,
    getType: getTypeResolveArrays
};