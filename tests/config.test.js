'use strict';

// The one migration a profile gets: a level that was the old default is not a decision, so it is replaced
// once with the level this build ships with. After the menu has been used, nothing is ever touched.

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/main/config');

test('an old profile on the old default moves to the new one, once', () => {
  const migrated = config.migrate({ autonomy: 'guard' });
  assert.deepEqual(migrated, { autonomy: 'full', autonomyPicked: true });
  // already there: only the marker is written
  assert.deepEqual(config.migrate({ autonomy: 'full' }), { autonomyPicked: true });
  // someone picked a level: hands off
  assert.equal(config.migrate({ autonomy: 'guard', autonomyPicked: true }), null);
  assert.equal(config.migrate({ autonomy: 'trusted', autonomyPicked: true }), null);
  // a profile from before autonomy existed at all
  assert.deepEqual(config.migrate({}), { autonomy: 'full', autonomyPicked: true });
});
