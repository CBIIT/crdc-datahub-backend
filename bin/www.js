const app = require('../app');
const http = require('http');

let port;
let server;

(async () => {
    port = readPort();
    app.set('port', port);

    // Run startup migrations unless SKIP_STARTUP_MIGRATIONS is set (e.g. for tests or manual migration)
    if (!process.env.SKIP_STARTUP_MIGRATIONS) {
        const { orchestrateMigration } = require('../documentation/3-6-0/3-6-0-migration');
        const result = await orchestrateMigration();
        if (!result.success) {
            console.error('Startup migrations failed. Exiting.');
            process.exit(1);
        }
    }
    else {
        console.log('Startup migrations skipped. Environment variable SKIP_STARTUP_MIGRATIONS is set.');
    }

    // create and configure the server
    server = http.createServer(app);
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
})().catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
});

function readPort(){
    const defaultPort = '4020';
    let port = process.env.PORT ?? defaultPort;
    let portNumber = parseInt(port, 10);
    if (isNaN(portNumber) || portNumber < 0) port = defaultPort;
    return port
}

function onError(error) {
    if (error.syscall !== 'listen') throw error;
    const bind = (typeof port === 'string') ? 'Pipe ' + port : 'Port ' + port;
    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    const addr = server.address();
    var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    console.debug('Listening on ' + bind);
}