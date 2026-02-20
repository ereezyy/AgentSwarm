// don/twilio_bridge.js - THE TWILIO BRIDGE (OUTBOUND COMMS)
const twilio = require('twilio');
const chalk = require('chalk');
require('dotenv').config();

const id = process.argv[2] || 'Twilio';
const client = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

console.log(chalk.blue.bold(`[TWILIO #${id}]: Outbound Voice Bridge Online.`));

async function makeStatusCall(text) {
    if (!client || !process.env.YOUR_PHONE) {
        console.log(chalk.yellow(`[TWILIO #${id}]: Credentials missing. Call skipped.`));
        return;
    }

    try {
        console.log(chalk.blue(`[TWILIO #${id}]: Dialing direct TwiML to ${process.env.YOUR_PHONE}...`));

        // Use direct TwiML to bypass potential Studio Flow variable errors
        const twiml = `<Response>
            <Pause length="1"/>
            <Say voice="alice">${text}</Say>
            <Pause length="1"/>
            <Say voice="alice">End of transmission.</Say>
        </Response>`;

        const call = await client.calls.create({
            twiml: twiml,
            to: process.env.YOUR_PHONE,
            from: process.env.TWILIO_FROM_NUMBER
        });

        console.log(chalk.green(`[TWILIO #${id}]: Call initiated. SID: ${call.sid}`));
    } catch (e) {
        console.error(chalk.red(`[TWILIO #${id}]: Call failed: ${e.message}`));
    }
}

process.on('message', (msg) => {
    if (msg.type === 'PHONE_ALERT') {
        makeStatusCall(msg.text);
    }
});

// Daily Morning Status Check (Simulated)
// setTimeout(() => makeStatusCall("Good morning, Boss. The Syndicate is operating at 98% efficiency. War chest is growing."), 5000);
