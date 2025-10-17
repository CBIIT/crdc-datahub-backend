/**
 * Example usage of memory leak prevention utilities
 * This file demonstrates how to use the memory leak prevention utilities
 * in your test files to avoid common memory leak issues.
 */

const { 
    TestMemoryLeakPrevention, 
    withMemoryLeakPrevention,
    setupTestEnvironment,
    cleanupTestEnvironment,
    finalCleanupTestEnvironment
} = require('./memory-leak-prevention');

describe('Example Test with Memory Leak Prevention', () => {
    let leakPrevention;

    // Method 1: Using the TestMemoryLeakPrevention class directly
    beforeEach(() => {
        leakPrevention = new TestMemoryLeakPrevention();
        
        // Preserve global variables that might be modified
        leakPrevention.preserveGlobals(['MY_GLOBAL_VAR', 'ANOTHER_GLOBAL']);
        
        // Use fake timers if needed
        leakPrevention.useFakeTimers();
        
        // Create console spies that will be automatically cleaned up
        const consoleSpy = leakPrevention.createConsoleSpy('log');
        const errorSpy = leakPrevention.createConsoleSpy('error');
    });

    afterEach(() => {
        // Clean up everything
        leakPrevention.cleanup();
    });

    afterAll(() => {
        // Final cleanup
        leakPrevention.finalCleanup();
    });

    test('example test with proper cleanup', () => {
        // Your test code here
        expect(true).toBe(true);
    });
});

describe('Example Test with Helper Functions', () => {
    // Method 2: Using helper functions
    beforeEach(setupTestEnvironment({
        useFakeTimers: true,
        preserveGlobals: ['MY_GLOBAL_VAR']
    }));

    afterEach(cleanupTestEnvironment({
        restoreGlobals: true
    }));

    afterAll(finalCleanupTestEnvironment());

    test('example test with helper functions', () => {
        // Your test code here
        expect(true).toBe(true);
    });
});

describe('Example Test with Wrapper Function', () => {
    // Method 3: Using the wrapper function for individual tests
    test('example test with wrapper', withMemoryLeakPrevention(async () => {
        // Your test code here
        expect(true).toBe(true);
    }, {
        useFakeTimers: true,
        preserveGlobals: ['MY_GLOBAL_VAR']
    }));
});

/**
 * Common Memory Leak Patterns to Avoid:
 * 
 * 1. Global Variable Pollution:
 *    ❌ BAD: global.MY_VAR = 'test'; (without cleanup)
 *    ✅ GOOD: Use preserveGlobals() and restoreGlobals()
 * 
 * 2. Console Spies Not Cleaned Up:
 *    ❌ BAD: const spy = jest.spyOn(console, 'log'); (without restore)
 *    ✅ GOOD: Use createConsoleSpy() or ensure mockRestore() in finally block
 * 
 * 3. Fake Timers Not Restored:
 *    ❌ BAD: jest.useFakeTimers(); (without useRealTimers())
 *    ✅ GOOD: Use useFakeTimers() and useRealTimers() methods
 * 
 * 4. Mocks Not Reset:
 *    ❌ BAD: Not calling jest.clearAllMocks() between tests
 *    ✅ GOOD: Always call jest.clearAllMocks() in afterEach
 * 
 * 5. Promises Not Cleaned Up:
 *    ❌ BAD: Creating promises that don't resolve/reject
 *    ✅ GOOD: Ensure all promises are properly handled
 */
