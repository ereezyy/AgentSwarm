// don/test_twilio.js
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const flowSid = process.env.TWILIO_FLOW_SID;
const to = process.env.YOUR_PHONE;
const from = process.env.TWILIO_FROM_NUMBER;

const twiml = `<Response><Say voice="alice">This is the direct override test. The Syndicate voice channel is fully operational. We are back in control.</Say></Response>`;

console.log(`[TEST]: Triggering Direct Call to ${to}...`);

client.calls.create({
    twiml: twiml,
    to: to,
    from: from
})
    .then(call => console.log(`[TEST]: Call initiated. SID: ${call.sid}`))
    .catch(error => console.error(`[TEST]: Call failed: ${error.message}`));
