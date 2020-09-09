const config = require("config");

/** @external config */

/**
 * @function external:config#get
 * @override
 * @param {*} setting 
 * @param {*} defaultValue 
 */
var prevGet = config.get;
config.get = function(setting, defaultValue) {
    if(defaultValue === undefined || config.has(setting)) {
        return prevGet.call(config, setting);
    } else {
        return defaultValue;
    }
};

/**
 * @function external:config#demand
 * @param  {...String} settingArray 
 */
config.demand = function( ...settingArray ) {
    var results = settingArray.map(setting => {
        if(!config.has(setting)) {
            throw new Error(`Config setting "${setting}" is required`);
        } else {
            return config.get(setting);
        }
    });

    // Unwrap the results if there is only 1
    if(results && results.length === 1) {
        return results[0];
    } else {
        return results;
    }
};

/**
 * Returns the first setting that has a value in the array
 * Or, if there is no match, throws an exception
 * @param  {...any} settingArray 
 */
config.demandOneOf = function( ...settingArray ) {
    var match = undefined;
    for(let i = 0; i < settingArray.length; i++) {
        let setting = settingArray[i];
        if(config.has(setting)) {
            match = setting;
            break;
        }
    }

    if(match === undefined) {
        throw new Error(`Config requires one of ${settingArray.join(', ')}`);
    }
    return config.get(match);
}

/**
 * Returns the first setting that has a value in the array
 * or the default value if no settings specified exist
 * @param  {...any} settingArray 
 */
config.getOneOf = function( defaultValue, ...settingArray ) {
    var match = undefined;
    for(let i = 0; i < settingArray.length; i++) {
        let setting = settingArray[i];
        if(config.has(setting)) {
            match = setting;
            break;
        }
    }

    if(match === undefined) {
        return defaultValue;
    } else {
        return config.get(match);
    }
}