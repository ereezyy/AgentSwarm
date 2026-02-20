// muscle/enforcer.js - The Muscle (RobotJS Edition)
// NUT-JS failed. We use RobotJS. Tougher. Older. Meaner.

try {
    var robot = require("robotjs");
} catch (e) {
    console.error("Looks like robotjs didn't compile. We might need a crowbar (python/powershell).");
    process.exit(1);
}

const chalk = require('chalk');

const Enforcer = {
    name: "Knuckles",

    speak: (msg) => {
        console.log(chalk.red.bold(`[THE ENFORCER]: ${msg}`));
    },

    // Skill: "Shake Down" (Move mouse aggressively)
    shakeDown: () => {
        Enforcer.speak("Shaking down the desktop...");
        const screenSize = robot.getScreenSize();
        const height = screenSize.height;
        const width = screenSize.width;

        // Move to corners to show dominance
        robot.moveMouse(0, 0);
        robot.moveMouse(width, height);
        Enforcer.speak("Turf secure.");
    },

    // Skill: "Type Threat" (Type text)
    typeThreat: (text) => {
        Enforcer.speak(`Sending message: "${text}"`);
        robot.typeString(text);
    },

    // Skill: "Whack" (Click)
    whack: () => {
        Enforcer.speak("Whacking target.");
        robot.mouseClick();
    },

    // Skill: "Capture Evidence" (Screenshot - Mock or use external tool)
    captureEvidence: (filename = 'evidence.png') => {
        // RobotJS returns a bitmap, saving it requires another lib (e.g. jimp)
        // For now, we mock it or use a system command
        Enforcer.speak(`Capturing evidence... (Simulated)`);
    }
};

// Command Loop
const args = process.argv.slice(2);
const command = args[0];
const param = args.slice(1).join(" ");

if (command === 'shakedown') {
    Enforcer.shakeDown();
} else if (command === 'threat') {
    Enforcer.typeThreat(param || "Pay up or else.");
} else if (command === 'whack') {
    Enforcer.whack();
} else {
    Enforcer.speak("I'm standing by. Give me a target.");
    console.log(chalk.gray("Commands: shakedown, threat [text], whack"));
}
