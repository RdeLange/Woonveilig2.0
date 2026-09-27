'use strict';

const assert = require('assert');
const WoonveiligClient = require('../lib/woonveilig-client');
const WoonveiligClientLegacy = require('../lib/woonveilig-client-legacy');

const INTEGRATION_ENABLED = !!(
  process.env.WOONVEILIG_URL &&
  process.env.WOONVEILIG_USERNAME &&
  process.env.WOONVEILIG_PASSWORD
);

const LEGACY_MODE = process.env.WOONVEILIG_LEGACY_MODE === 'true';

const config = {
  url: process.env.WOONVEILIG_URL || 'http://192.168.1.100',
  username: process.env.WOONVEILIG_USERNAME || 'admin',
  password: process.env.WOONVEILIG_PASSWORD || 'admin',
  area: process.env.WOONVEILIG_AREA || '1',
};

function skipIfNoConfig(testName, testFn) {
  if (!INTEGRATION_ENABLED) {
    console.log(`  ⊘ ${testName} (skipped - set WOONVEILIG_URL, WOONVEILIG_USERNAME, WOONVEILIG_PASSWORD)`);
    return Promise.resolve();
  }
  return testFn();
}

async function testModernClientConnection() {
  if (LEGACY_MODE) {
    console.log('Testing Modern System Connection...');
    console.log('  ⊘ Skipped (legacy mode enabled)');
    return;
  }

  console.log('Testing Modern System Connection...');
  const client = new WoonveiligClient(config);

  return skipIfNoConfig('Get status from modern system', async () => {
    const status = await client.getStatus();
    assert.strictEqual(typeof status.state, 'string');
    assert(['disarmed', 'armed_away', 'armed_home', 'triggered', 'unknown'].includes(status.state), true);
    console.log(`  ✓ Status fetched: ${status.state} (raw: ${status.rawMode})`);

    const accessories = await client.getAccessories();
    assert.strictEqual(Array.isArray(accessories), true);
    console.log(`  ✓ Accessories fetched: ${accessories.length} items`);

    if (accessories.length > 0) {
      const accessory = accessories[0];
      assert.ok(accessory.id);
      assert.ok(accessory.name);
      console.log(`  ✓ Accessory data valid (e.g., ${accessory.name})`);
    }
  });
}

async function testLegacyClientConnection() {
  console.log('\nTesting Legacy System Connection...');

  if (!LEGACY_MODE && !INTEGRATION_ENABLED) {
    console.log('  ⊘ Get status from legacy system (skipped - set WOONVEILIG_URL, WOONVEILIG_USERNAME, WOONVEILIG_PASSWORD)');
    return;
  }

  const client = new WoonveiligClientLegacy(config);

  return skipIfNoConfig('Get status from legacy system', async () => {
    const status = await client.getStatus();
    assert.strictEqual(typeof status.state, 'string');
    assert(['disarmed', 'armed_away', 'armed_home', 'unknown'].includes(status.state), true);
    console.log(`  ✓ Status fetched: ${status.state}`);

    const accessories = await client.getAccessories();
    assert.strictEqual(Array.isArray(accessories), true);
    assert.strictEqual(accessories.length, 0);
    console.log(`  ✓ Accessories array is empty (expected for legacy systems)`);
  });
}

async function testJsonExtraction() {
  console.log('\nTesting JSON Response Extraction...');

  if (LEGACY_MODE) {
    const legacyClient = new WoonveiligClientLegacy(config);
    return skipIfNoConfig('Extract and validate JSON fields from legacy system', async () => {
      const status = await legacyClient.getStatus();
      assert.ok(status.state, 'State should be present');
      assert.ok(status.rawMode !== undefined, 'Raw mode should be present');
      console.log(`  ✓ Legacy client response structure valid`);
    });
  }

  const modernClient = new WoonveiligClient(config);

  return skipIfNoConfig('Extract and validate JSON fields from modern system', async () => {
    const status = await modernClient.getStatus();
    assert.ok(status.state, 'State should be present');
    assert.ok(status.rawMode !== undefined, 'Raw mode should be present');
    console.log(`  ✓ Modern client response structure valid`);
  });
}

async function testModeChange() {
  console.log('\nTesting Mode Change (DRY RUN)...');

  const ClientClass = LEGACY_MODE ? WoonveiligClientLegacy : WoonveiligClient;
  const client = new ClientClass(config);

  return skipIfNoConfig('Simulate mode change (get current state)', async () => {
    const before = await client.getStatus();
    console.log(`  ✓ Current state: ${before.state}`);
    console.log(`  ℹ To test actual mode changes, implement automated mode change tests`);
  });
}

async function testErrorHandling() {
  console.log('\nTesting Error Handling...');

  // Test with invalid config
  const badClient = new WoonveiligClient({
    url: 'http://192.168.1.1',
    username: 'invalid',
    password: 'invalid',
  });

  try {
    await badClient.getStatus();
    console.log('  ✗ Should have thrown an error for invalid config');
    process.exitCode = 1;
  } catch (error) {
    console.log(`  ✓ Error handling works: ${error.message.substring(0, 50)}...`);
  }
}

async function run() {
  console.log('\n=== Integration Tests ===\n');

  if (LEGACY_MODE) {
    console.log('ℹ  Legacy mode enabled - testing WV-1716 system\n');
  }

  if (!INTEGRATION_ENABLED) {
    console.log('ℹ  To enable integration tests, set environment variables:');
    console.log('   export WOONVEILIG_URL=http://192.168.1.100');
    console.log('   export WOONVEILIG_USERNAME=admin');
    console.log('   export WOONVEILIG_PASSWORD=admin');
    console.log('   export WOONVEILIG_AREA=1 (optional)');
    console.log('   export WOONVEILIG_LEGACY_MODE=true (if WV-1716 system)');
    console.log('\n');
  }

  try {
    await testModernClientConnection();
    await testLegacyClientConnection();
    await testJsonExtraction();
    await testModeChange();
    await testErrorHandling();

    console.log('\n✅ Integration tests passed!\n');
  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  }
}

run();
