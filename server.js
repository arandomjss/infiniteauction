const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { handleConnection } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Pass the io instance to game logic to handle socket events
handleConnection(io);

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
