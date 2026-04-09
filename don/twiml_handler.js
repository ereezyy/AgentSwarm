// don/twiml_handler.js
const http = require('http');
const chalk = require('chalk');
const twilio = require('twilio');
const querystring = require('querystring');
require('dotenv').config();

const PORT = 3001; // Separate port for TwiML

const server = http.createServer((req, res) => {
    console.log(chalk.blue(`[TWIML SERVER]: Incoming request from Twilio...`));

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioSignature = req.headers['x-twilio-signature'];

    if (!authToken || !twilioSignature) {
        console.log(chalk.red(`[TWIML SERVER]: Missing auth token or signature. Denied.`));
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        let params = {};
        if (body) {
            params = querystring.parse(body);
        }

        const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);

        if (!isValid) {
            console.log(chalk.red(`[TWIML SERVER]: Invalid Twilio signature for url: ${url}. Denied.`));
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        console.log(chalk.green(`[TWIML SERVER]: Request validated successfully.`));

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
});

server.listen(PORT, () => {
    console.log(chalk.blue(`[TWIML SERVER]: Listening on port ${PORT}`));
});
