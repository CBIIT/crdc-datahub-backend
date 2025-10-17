/**
 * Test Utilities for Memory Leak Prevention
 * Provides common utilities to prevent memory leaks in Jest tests
 */

class TestMemoryLeakPrevention {
    constructor() {
        this.originalGlobals = new Map();
        this.consoleSpies = new Set();
        this.timersActive = false;
    }

    /**
     * Store original global values to restore later
     * @param {Array<string>} globalKeys - Array of global variable names to preserve
     */
    preserveGlobals(globalKeys) {
        globalKeys.forEach(key => {
            this.originalGlobals.set(key, global[key]);
        });
    }

    /**
     * Restore original global values
     */
    restoreGlobals() {
        this.originalGlobals.forEach((value, key) => {
            global[key] = value;
        });
        this.originalGlobals.clear();
    }

    /**
     * Create a console spy with automatic cleanup tracking
     * @param {string} method - Console method to spy on ('log', 'error', 'warn', etc.)
     * @returns {jest.SpyInstance} The console spy
     */
    createConsoleSpy(method) {
        const spy = jest.spyOn(console, method).mockImplementation();
        this.consoleSpies.add(spy);
        return spy;
    }

    /**
     * Restore all tracked console spies
     */
    restoreConsoleSpies() {
        this.consoleSpies.forEach(spy => {
            if (spy && typeof spy.mockRestore === 'function') {
                spy.mockRestore();
            }
        });
        this.consoleSpies.clear();
    }

    /**
     * Setup fake timers with tracking
     */
    useFakeTimers() {
        if (!this.timersActive) {
            jest.useFakeTimers();
            this.timersActive = true;
        }
    }

    /**
     * Restore real timers
     */
    useRealTimers() {
        if (this.timersActive) {
            jest.useRealTimers();
            this.timersActive = false;
        }
    }

    /**
     * Complete cleanup - call this in afterEach or afterAll
     */
    cleanup() {
        this.restoreGlobals();
        this.restoreConsoleSpies();
        this.useRealTimers();
        jest.clearAllMocks();
        jest.clearAllTimers();
    }

    /**
     * Final cleanup - call this in afterAll
     */
    finalCleanup() {
        this.cleanup();
        jest.restoreAllMocks();
    }
}

/**
 * Helper function to create a test wrapper with memory leak prevention
 * @param {Function} testFn - The test function to wrap
 * @param {Object} options - Options for the wrapper
 * @returns {Function} Wrapped test function
 */
function withMemoryLeakPrevention(testFn, options = {}) {
    return async (...args) => {
        const leakPrevention = new TestMemoryLeakPrevention();
        
        try {
            // Setup based on options
            if (options.preserveGlobals) {
                leakPrevention.preserveGlobals(options.preserveGlobals);
            }
            
            if (options.useFakeTimers) {
                leakPrevention.useFakeTimers();
            }
            
            // Run the test
            await testFn(...args);
        } finally {
            // Always cleanup
            leakPrevention.cleanup();
        }
    };
}

/**
 * Jest setup helper for beforeEach
 * @param {Object} options - Setup options
 * @returns {Function} beforeEach function
 */
function setupTestEnvironment(options = {}) {
    return () => {
        jest.clearAllMocks();
        
        if (options.useFakeTimers) {
            jest.useFakeTimers();
        }
        
        if (options.preserveGlobals) {
            // Store original globals if needed
            const leakPrevention = new TestMemoryLeakPrevention();
            leakPrevention.preserveGlobals(options.preserveGlobals);
        }
    };
}

/**
 * Jest cleanup helper for afterEach
 * @param {Object} options - Cleanup options
 * @returns {Function} afterEach function
 */
function cleanupTestEnvironment(options = {}) {
    return () => {
        jest.useRealTimers();
        jest.clearAllMocks();
        jest.clearAllTimers();
        
        if (options.restoreGlobals) {
            // Restore globals if they were preserved
        }
    };
}

/**
 * Jest final cleanup helper for afterAll
 * @returns {Function} afterAll function
 */
function finalCleanupTestEnvironment() {
    return () => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    };
}

module.exports = {
    TestMemoryLeakPrevention,
    withMemoryLeakPrevention,
    setupTestEnvironment,
    cleanupTestEnvironment,
    finalCleanupTestEnvironment
};
