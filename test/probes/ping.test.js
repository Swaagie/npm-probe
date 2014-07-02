describe('Probe: ping', function () {
  'use strict';

  var common = require('../common')
    , Collector = common.Collector
    , expect = common.expect
    , registries = common.registries
    , Probe = require('../../probes/ping')
    , probe;

  function noop() {}

  beforeEach(function () {
    probe = new Probe(new Collector);
  });

  afterEach(function () {
    probe = null;
  });

  it('exposes properties name, interval and execute', function () {
    expect(probe).to.have.property('name', 'ping');
    expect(probe).to.have.property('interval');
    expect(probe.interval).to.be.an('number');
    expect(probe).to.have.property('execute');
    expect(probe.execute).to.be.a('function');
  });

  it('has specifications to probe endpoint every 1 minute', function () {
    expect(probe.interval).to.equal(60000);
  });

  it('has default map reference that can used to store results', function () {
    expect(Probe).to.have.property('map');
    expect(Probe.map).to.be.an('object');
    expect(Object.keys(Probe.map).length).to.equal(0);
  });

  describe('#ping', function () {
    it('will timeout after configurable amount of seconds with a lag of 0', function (done) {
      var start = Date.now();

      this.timeout(2E4);
      probe.ping({ href: 'https://www.unreachable.com', timeout: 1E4 }, function (error, result) {
        expect(Date.now() - start).to.be.above(9999);
        expect(error).to.equal(null);
        expect(result).to.equal(0);
        done();
      });
    });

    it('will return 0 as lag on failure', function (done) {
      probe.ping({ href: 'aaabbbccc' }, function (error, result) {
        expect(error).to.equal(null);
        expect(result).to.be.an('number');
        expect(result).to.equal(0);
        done();
      });
    });

    it('will return the lag in milliseconds as result', function (done) {
      this.timeout(1E4);
      probe.ping(registries.nodejitsu, function (error, result) {
        expect(error).to.be.equal(null);
        expect(result).to.be.a('number');
        expect(result).to.be.above(0);
        done();
      });
    });
  });

  describe('#execute', function () {
    it('will emit results when executed', function (done) {
      this.timeout(1E4);

      probe.on('ping::executed', function (results) {
        expect(results).to.be.an('object');
        expect(results).to.have.property('mean');
        expect(results.mean).to.be.above(0);
        done();
      });

      probe.execute(registries.nodejitsu, noop);
    });

    it('returns statistics of the 5 consequtive pings in milleseconds', function (done) {
      this.timeout(1E4);
      probe.execute(registries.nodejitsu, function (error, results) {
        expect(error).to.equal(null);
        expect(results).to.be.an('object');
        expect(results).to.have.property('minimum');
        expect(results).to.have.property('maximum');
        expect(results).to.have.property('stdev');
        expect(results).to.have.property('mean');

        for (var key in results) {
          expect(results[key]).to.be.an('number');
          expect(results[key]).to.be.above(0);
        }

        done();
      });
    });
  });

  describe('#transform', function () {
    it('is a function exposed on the constructor', function () {
      expect(Probe).to.have.property('transform');
      expect(Probe.transform).to.be.a('function');
    });

    it('returns the moving average based on the last 5 measurements', function () {
      var results = Probe.transform({}, { results: { avg: 1 }}, 0, [
        { results: { avg: 10 }},
        { results: { avg: 20 }},
        { results: { avg: 30 }},
        { results: { avg: 40 }},
        { results: { avg: 50 }}
      ]);

      expect(results).to.have.property('avg', 8.2);
    });

    it('takes missing values', function () {
      var results = Probe.transform({}, { results: { avg: 1 }}, 0, [
        { results: { avg: 0 }}
      ]);

      expect(results).to.have.property('avg', 0.2);
    });

    it('will average all keys available on the probe', function () {
      var results = Probe.transform({}, { results: { avg: 1, max: 2 }}, 0, [
        { results: { avg: 1, max: 2 }}
      ]);

      expect(results).to.have.property('avg', 1);
      expect(results).to.have.property('max', 2);
    });
  });

  describe('#latest', function () {
    it('is a function exposed on the constructor', function () {
      expect(Probe).to.have.property('latest');
      expect(Probe.latest).to.be.a('function');
    });

    it('returns down if the mean of the last measurement is 0', function () {
      var last = Probe.latest(
        [{ values: { mean: 0 }}],
        [{ values: { mean: 200 }}]
      );

      expect(last).to.be.a('string');
      expect(last).to.equal('down');
    });

    it('returns slow if the measurement is higher than 1.5x the maximum', function () {
      var last = Probe.latest(
        [{ values: { mean: 50, maximum: 100 }}],
        [{ results: { mean: 200, maximum: 400 }}]
      );

      expect(last).to.be.a('string');
      expect(last).to.equal('slow');
    });
  });

  describe('#group', function () {
    it('is a function exposed on the constructor', function () {
      expect(Probe).to.have.property('group');
      expect(Probe.group).to.be.a('function');
    });

    it('returns group identifier based on time', function () {
      var start = Date.now();
      expect(Probe.group(start)).to.equal(start);
    });
  });
});