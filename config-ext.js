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