const { Client } = require('ssh2');
require('dotenv').config();

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH READY');
    const cmds = [
        'cat /home/ed/start_monitor.sh'
    ];
    conn.exec(cmds.join('\n'), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect({
    host: '192.168.1.78',
    port: 22,
    username: 'ed',
    password: '1234qwer'
});
