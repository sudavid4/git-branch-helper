/**
 * Created by davidsu on 05/12/2015.
 */
var _ = require('lodash');
var flags = _.chain(process.argv)
    .filter((arg)=>_.startsWith(arg, '-') && !_.contains(arg, '='))
    .map((arg)=>arg.toLowerCase())
    .value();

module.exports.shouldLog = _.contains(flags, '--log');
module.exports.skipMerge = _.contains(flags, '--skip-merge');
module.exports.dontReset = _.contains(flags, '--dont-reset');
module.exports.branch = _.contains(flags, '-b') || _.contains(flags, '--branch')
