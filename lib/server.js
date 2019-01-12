/**
 * Server-Related tasks.
 * 
 */



// Dependencies
const http = require('http');
const https = require('https');
const url = require('url');
const StringDecoder = require('string_decoder').StringDecoder;
const config = require('./config');
const fs = require('fs');
const handlers = require('./handlers');
const helpers = require('./helpers');
const path = require('path');

//Instantiate the server module object.
let server = {};



// Instantiating the http server.
server.httpServer = http.createServer((req, res) => {
  server.unifiedServer(req, res);
});

// Instantiate the HTTPS server with this function
server.httpsServerOptions = {
  'key': fs.readFileSync(path.join(__dirname, '/../https/key.pem')),
  'cert': fs.readFileSync(path.join(__dirname, '/../https/cert.pem'))
};

server.httpsServer = https.createServer(server.httpsServerOptions, (req, res) => {
  server.unifiedServer(req, res);
});

// All of the server logic for both the http and https server
server.unifiedServer = (req, res) => {
  // Get the URL and parse it
  const parsedUrl = url.parse(req.url, true);

  // Get the Path
  const path = parsedUrl.pathname;
  var trimmedPath = path.replace(/^\/+|\/+$/g, '');

  // Get the query string as an object
  const queryStringObject = parsedUrl.query;

  // Get the http Method
  const method = req.method.toLowerCase();

  // Get the headers as an object
  const headers = req.headers;

  // Get the payload, if any
  const decoder = new StringDecoder('utf-8');
  let buffer = '';
  req.on('data', (data) => {
    buffer += decoder.write(data);
  });
  req.on('end', () => {
    buffer += decoder.end();

    // Choose the handler this request should go to, if one isn't found, use the notFound handler.
    let chosenHandler =
      typeof (server.router[trimmedPath]) !== 'undefined'
        ? server.router[trimmedPath]
        : handlers.notFound;

    // Construct the data object to send to the handler.
    let data = {
      'trimmedPath': trimmedPath,
      'queryStringObject': queryStringObject,
      'method': method,
      'headers': headers,
      'payload': helpers.parseJsonToObject(buffer)
    };

    // Route the request to the handler specified in the router
    chosenHandler(data, (statusCode, payload) => {
      // Use the status code called back by the handler, or default to 200
      statusCode = typeof (statusCode) == 'number' ? statusCode : 200;

      // Use the payload called back by the handler, or default to an empty object.
      payload = typeof (payload) == 'object' ? payload : {};

      // Convert the payload to a string.
      let payloadString = JSON.stringify(payload);

      // Return response.
      res.setHeader('Content-type', 'application/json');
      res.writeHead(statusCode);
      res.end(payloadString);

      // Log the request path
      console.log('Returning this response:', statusCode, payloadString);
    });
  });
}


// Define a request router
server.router = {
  'ping': handlers.ping,
  'users': handlers.users,
  'tokens': handlers.tokens,
  'checks': handlers.checks
};

//Init Script.

server.init = () => {

  // Start the HTTP server.
  server.httpServer.listen(config.httpPort, () => {
    console.log(`the server is listening on port ${config.httpPort}`);
  });

  // Start the HTTPS server.
  server.httpsServer.listen(config.httpsPort, () => {
    console.log(`the server is listening on port ${config.httpsPort}`)
  });
};

//Export the server.
module.exports = server;
