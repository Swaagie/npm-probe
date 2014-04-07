'use strict';

var chai = require('chai')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai');

chai.config.includeStack = true;
chai.use(sinonChai);

//
// Expose the collector
//
exports.Collector = require('../');
exports.registries = require('../registries');

//
// Expose our assertations.
//
exports.expect = chai.expect;
exports.sinon = sinon;