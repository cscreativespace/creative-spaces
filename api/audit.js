'use strict';
/** Compatibility shim: prefer POST /api/health-check */
module.exports = require('./health-check.js');
module.exports.config = { maxDuration: 60 };
