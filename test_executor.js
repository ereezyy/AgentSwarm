const { exec } = require('child_process');
const rpcUrl = "https://api.mainnet-beta.solana.com";

const params = {
    command: "get_price",
    mint: "So11111111111111111111111111111111111111112",
    rpcUrl
}

const child = exec(`python "c:\\Users\\Yella\\.gemini\\antigravity\\playground\\infinite-hypernova\\muscle\\executor.py"`, (err, stdout, stderr) => {
    if (err) {
        console.log("ERR:", err.message);
        return;
    }
    if (stderr) {
        console.log("STDERR:", stderr.trim());
    }
    try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Failed to parse executor output: ${stdout}`);
        }
        const result = JSON.parse(jsonMatch[0]);
        console.log("PARSED RESULT:", result);
    } catch (e) {
        console.error("PARSE ERROR:", e.message);
    }
});

child.stdin.write(JSON.stringify(params));
child.stdin.end();
