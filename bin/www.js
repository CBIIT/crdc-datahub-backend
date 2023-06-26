const app = require('../app');
const http = require('http');

const port = readPort();
app.set('port', port);
// create and configure the server
const server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

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