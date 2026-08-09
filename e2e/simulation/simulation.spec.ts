import { test, expect } from '../fixtures/virtual-drummer';
import { runSimulation } from './harness';
import { kits } from './kits';

test.describe('Simulation Suite Core', () => {
  const alesis = kits.find(k => k.id === 'alesis-nitro-pro')!;

  test('Gigging Greta passes Drill 1 cleanly', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'greta', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });

  test('Rushing Rachel is diagnosed as rushing', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'rachel', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });

  test('Scattered Sam is expected to be inconsistent, but prediction 5 says he might be called rushing', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'sam', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    console.log(`Scattered Sam diagnosis: "${result.diagnosis}"`);
    console.log(`Oracle expected: "${result.expected.category}"`);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });

  test('Gigging Greta passes Drill 5 cleanly', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'greta', 'alesis-nitro-pro', 'dynamics-gate-drill-5', 42);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });
});
