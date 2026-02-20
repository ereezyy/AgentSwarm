// don/twiml_handler.js
const http = require('http');
const chalk = require('chalk');

const PORT = 3001; // Separate port for TwiML

const server = http.createServer((req, res) => {
    console.log(chalk.blue(`[TWIML SERVER]: Incoming request from Twilio...`));

    // Default response for now - this should ideally be dynamic based on the context
    // But since we are using Studio Flow, this might just be a fallback or used if we switch back to TwiML calls
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Infinite Hypernova Online. Operations are green. Press 1 for status. Press 2 for emergency shut down.</Say>
    <Gather numDigits="1" action="/gather">
    </Gather>
</Response>`;

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml);
});

server.listen(PORT, () => {
    console.log(chalk.blue(`[TWIML SERVER]: Listening on port ${PORT}`));
});
