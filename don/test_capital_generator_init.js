const CapitalGenerator = require('./capital_generator');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

async function runTest() {
    console.log("Starting test: CapitalGenerator instantiation and initial state");

    try {
        console.log("Attempting to instantiate CapitalGenerator...");
        const generator = new CapitalGenerator();
        console.log("Successfully instantiated CapitalGenerator.");

        const status = generator.getStatus();
        console.log("Initial status:", status);

        assert(status.currentCapital === 0, "Initial capital should be 0");
        assert(status.targetProfit === 1000, "Initial target profit should be 1000");
        assert(status.activeExploits === 0, "Initial active exploits should be 0");
        assert(status.totalExploits === 0, "Initial total exploits should be 0");

        console.log("Test PASSED: CapitalGenerator correctly instantiated and initialized.");
    } catch (error) {
        console.error("Test FAILED:");
        console.error(error);
        process.exit(1);
    }
}

runTest();
