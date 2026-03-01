const { Server } = require("socket.io");

// Room state storage
const rooms = {};
/*
  Room structure:
  {
    roomId: string,
    host: socketId,
    players: {
      socketId: {
        id: socketId,
        sessionId: string,
        name: string,
        points: int,
        totalSpent: int,
        currentBid: int | null, // null means hasn't bid yet, 0 is a valid bid
        connected: boolean,
        isBankrupted: boolean
      }
    },
    gameState: 'lobby' | 'bidding' | 'roundEnd' | 'gravityCheck' | 'thePunch',
    currentRound: int,
    timer: int,
    intervalId: NodeJS.Timeout | null,
    currentGem: int, // +1, +2, +3, +4
    gravityCheckPool: int // Last 4 rounds cumulative winning bids
  }
*/

const MAX_ROUNDS = 12; // E.g., 3 cycles of 4 rounds
const ROUND_TIME = 60; // seconds

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getGemValue(round) {
    // Randomly assign +1, +2, +3, or +4
    return Math.floor(Math.random() * 4) + 1;
}

function handleConnection(io) {
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('createRoom', (data, callbacks) => {
            if (typeof data === 'function') {
                callbacks = data;
                data = null;
            }
            let roomId = data?.requestedCode ? data.requestedCode.toUpperCase() : generateRoomCode();

            // If requested code exists, fallback to a random one
            if (rooms[roomId]) {
                roomId = generateRoomCode();
            }

            rooms[roomId] = {
                roomId,
                host: socket.id,
                players: {},
                gameState: 'lobby',
                currentRound: 0,
                maxRounds: MAX_ROUNDS,
                timer: 0,
                intervalId: null,
                currentGem: 0,
                gravityCheckPool: 0
            };
            socket.join(roomId);
            callbacks({ roomId, isHost: true });
            console.log(`Room ${roomId} created by ${socket.id}`);
        });

        socket.on('joinRoom', (data, callback) => {
            const { roomId, playerName } = data;
            const room = rooms[roomId.toUpperCase()];

            if (!room) {
                return callback({ error: 'Room not found' });
            }

            const sessionId = generateRoomCode() + '-' + Date.now().toString(); // Random session identifier

            // If game is active, mark them as spectator for this round
            const isSpectating = room.gameState !== 'lobby';

            room.players[socket.id] = {
                id: socket.id,
                sessionId: sessionId,
                name: playerName || `Player ${Object.keys(room.players).length + 1}`,
                points: 0,
                totalSpent: 0,
                currentBid: null,
                connected: true,
                isBankrupted: false,
                isSpectator: isSpectating
            };

            socket.join(room.roomId);
            io.to(room.roomId).emit('playerJoined', Object.values(room.players));
            callback({ roomId: room.roomId, isHost: false, sessionId: sessionId });
        });

        socket.on('reconnectSession', (data, callback) => {
            const { sessionId } = data;

            // Search all rooms for this session ID
            for (const rId in rooms) {
                const room = rooms[rId];
                for (const oldSocketId in room.players) {
                    const p = room.players[oldSocketId];
                    if (p.sessionId === sessionId) {
                        // Found the disconnected player! Re-bind them to the new socket.
                        p.connected = true;
                        p.id = socket.id;

                        // Transfer from old socket id key to new socket id key in dictionary
                        room.players[socket.id] = p;
                        if (oldSocketId !== socket.id) {
                            delete room.players[oldSocketId];
                        }

                        // Rejoin the socket.io room
                        socket.join(room.roomId);

                        // If they were the host, update the host id
                        if (room.host === oldSocketId) {
                            room.host = socket.id;
                        }

                        // Tell the room they're back
                        io.to(room.roomId).emit('playerRejoined', {
                            players: Object.values(room.players),
                            rejoinedPlayerId: socket.id
                        });

                        // Send existing state back to the reconnecting player
                        callback({
                            success: true,
                            roomId: room.roomId,
                            isHost: room.host === socket.id,
                            gameState: room.gameState,
                            players: Object.values(room.players),
                            stats: { points: p.points, totalSpent: p.totalSpent, currentBid: p.currentBid },
                            roundInfo: { round: room.currentRound, gemValue: room.currentGem, timer: room.timer }
                        });
                        return;
                    }
                }
            }

            callback({ error: 'Session not found. Please rejoin.' });
        });

        socket.on('startGame', (data) => {
            const { roomId, maxRounds, roundTime } = data;
            const room = rooms[roomId];
            if (!room || room.host !== socket.id) return;
            room.maxRounds = maxRounds || MAX_ROUNDS;
            room.roundTime = roundTime || ROUND_TIME;
            startNewRound(io, room);
        });

        socket.on('placeBid', (data) => {
            const { roomId, bid } = data;
            const room = rooms[roomId];
            if (!room || room.gameState !== 'bidding') return;

            const player = room.players[socket.id];
            if (player && player.currentBid === null && !player.isBankrupted) {
                player.currentBid = parseInt(bid, 10) || 0;
                // Emit to all that this player has placed a bid (hide amount)
                io.to(roomId).emit('bidPlaced', socket.id);

                // Check if all active players have bid
                const allActivePlayers = Object.values(room.players).filter(p => p.connected && !p.isBankrupted);
                const allBid = allActivePlayers.every(p => p.currentBid !== null);

                if (allBid) {
                    endBidding(io, room);
                }
            }
        });

        socket.on('endRoundEarly', (roomId) => {
            const room = rooms[roomId];
            if (!room || room.host !== socket.id || room.gameState !== 'bidding') return;
            endBidding(io, room);
        });

        socket.on('leaveGame', (roomId) => {
            const room = rooms[roomId];
            if (!room) return;

            if (room.players[socket.id]) {
                delete room.players[socket.id];
                socket.leave(roomId);

                // Host transfer logic
                handleHostMigration(io, room, socket.id, roomId);

                io.to(roomId).emit('playerLeft', socket.id);

                // If game is bidding and all remaining players have bid, end it
                if (room.gameState === 'bidding') {
                    const activePlayers = Object.values(room.players).filter(p => p.connected && !p.isBankrupted);
                    if (activePlayers.length > 0 && activePlayers.every(p => p.currentBid !== null)) {
                        endBidding(io, room);
                    }
                }
            }
        });

        // Disconnect handling
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
            for (const roomId in rooms) {
                const room = rooms[roomId];
                if (room.players[socket.id]) {
                    room.players[socket.id].connected = false;
                    handleHostMigration(io, room, socket.id, roomId);
                    io.to(roomId).emit('playerLeft', socket.id);
                    // If game is bidding and all remaining players have bid, end it
                    if (room.gameState === 'bidding') {
                        const activePlayers = Object.values(room.players).filter(p => p.connected && !p.isBankrupted);
                        if (activePlayers.length > 0 && activePlayers.every(p => p.currentBid !== null)) {
                            endBidding(io, room);
                        }
                    }
                }
            }
        });
    });
}

function startNewRound(io, room) {
    room.currentRound++;
    room.gameState = 'bidding';
    room.currentGem = getGemValue(room.currentRound);
    room.timer = room.roundTime || ROUND_TIME;

    // Reset bids and update spectator status
    Object.values(room.players).forEach(p => {
        p.currentBid = null;
        if (p.isSpectator && !p.isBankrupted) {
            p.isSpectator = false; // let them play next round
        }
    });

    io.to(room.roomId).emit('roundStart', {
        round: room.currentRound,
        gemValue: room.currentGem,
        timer: room.timer
    });

    if (room.intervalId) clearInterval(room.intervalId);

    room.intervalId = setInterval(() => {
        room.timer--;
        io.to(room.roomId).emit('timerUpdate', room.timer);

        if (room.timer <= 0) {
            endBidding(io, room);
        }
    }, 1000);
}

function processBids(room) {
    const activePlayers = Object.values(room.players).filter(p => !p.isBankrupted && p.connected);

    if (activePlayers.length === 0) return { action: 'No active players' };

    // Anyone who didn't bid before timer ran out gets bid of 0 explicitly
    activePlayers.forEach(p => {
        if (p.currentBid === null) p.currentBid = 0;
    });

    const bids = activePlayers.map(p => p.currentBid);
    const highestBidValue = Math.max(...bids);
    const highestBidders = Object.values(room.players).filter(p => p.currentBid === highestBidValue && p.connected && !p.isBankrupted);

    // Identify lowest bidders
    const lowestBidValue = Math.min(...bids);
    const lowestBidders = Object.values(room.players).filter(p => p.currentBid === lowestBidValue && p.connected && !p.isBankrupted);

    // Process lowest bidders (penalty)
    lowestBidders.forEach(p => {
        p.points -= 1;
    });

    let resultMessage = '';
    let winningSpendAdded = 0; // Initialize gravity check pool additive

    // Process highest bidders
    if (highestBidders.length === 1) {
        // Single winner
        const winner = highestBidders[0];
        winner.points += room.currentGem;
        winner.totalSpent += winner.currentBid;
        winningSpendAdded = winner.currentBid;
        resultMessage = `${winner.name} won the Gem (+${room.currentGem}) for $${winner.currentBid}!`;
    } else {
        // High Tie: Cancel Gem, but they still pay
        highestBidders.forEach(p => {
            p.totalSpent += p.currentBid; // Both players add full bid
        });
        const names = highestBidders.map(p => p.name).join(' & ');
        resultMessage = `HIGH TIE! ${names} cancelled the Gem, but paid $${highestBidValue} each!`;
        winningSpendAdded = highestBidValue * highestBidders.length;
    }

    // Lowest Bid Logic penalty already applied above around line 289
    if (lowestBidders.length > 0 && highestBidders.length !== activePlayers.length) {
        // If everyone didn't bid the exact same thing, apply formatting (if everyone did, we just note it)
        const lowestNames = lowestBidders.map(p => p.name).join(', ');
        resultMessage += `\nPenalty (-1): ${lowestNames} bid Lowest.`;
    } else if (highestBidders.length === activePlayers.length) {
        // Everyone bid the exact same thing
        resultMessage += `\nPenalty (-1): Everyone tied for Lowest too!`;
    }

    room.gravityCheckPool += winningSpendAdded;

    return {
        message: resultMessage,
        highestBidders: highestBidders.map(p => p.id),
        lowestBidders: lowestBidders.map(p => p.id)
    };
}

function endBidding(io, room) {
    if (room.intervalId) clearInterval(room.intervalId);
    room.gameState = 'roundEnd';

    const result = processBids(room);

    // Send updated stats (Points are public, totalSpent remains private until the punch)
    // We send personal stats to individual sockets, and public state to the room
    const publicPlayerStats = Object.values(room.players).map(p => ({
        id: p.id,
        name: p.name,
        points: p.points,
        connected: p.connected,
        isBankrupted: p.isBankrupted
    }));

    io.to(room.roomId).emit('roundResult', {
        message: result.message,
        leaderboard: publicPlayerStats
    });

    // Send private data individually
    Object.values(room.players).forEach(p => {
        io.to(p.id).emit('privateStats', {
            points: p.points,
            totalSpent: p.totalSpent
        });
    });

    setTimeout(() => {
        if (room.currentRound >= room.maxRounds) {
            executeThePunch(io, room);
        } else if (room.currentRound % 4 === 0) {
            executeGravityCheck(io, room);
        } else {
            startNewRound(io, room);
        }
    }, 5000); // Wait 5 seconds to show results
}

function executeGravityCheck(io, room) {
    room.gameState = 'gravityCheck';
    // Full screen overlay event
    io.to(room.roomId).emit('gravityCheck', {
        amount: room.gravityCheckPool
    });

    room.gravityCheckPool = 0; // Reset after showing

    setTimeout(() => {
        startNewRound(io, room);
    }, 5000);
}

function executeThePunch(io, room) {
    room.gameState = 'thePunch';
    const activePlayers = Object.values(room.players).filter(p => !p.isBankrupted);

    // Find highest spent
    const spends = activePlayers.map(p => p.totalSpent);
    const maxSpent = Math.max(...spends);

    const bankruptedPlayers = activePlayers.filter(p => p.totalSpent === maxSpent);
    bankruptedPlayers.forEach(p => p.isBankrupted = true);

    const remainingPlayers = activePlayers.filter(p => !p.isBankrupted);
    let winner = null;

    if (remainingPlayers.length > 0) {
        // Winner is highest points among survivors
        remainingPlayers.sort((a, b) => b.points - a.points);
        winner = remainingPlayers[0];
    } else {
        // Everyone was bankrupted, highest points among bankrupted wins? Or no winner?
        // Let's say no winner if everyone goes bankrupt.
    }

    // Reveal everything
    const finalStats = Object.values(room.players).map(p => ({
        id: p.id,
        name: p.name,
        points: p.points,
        totalSpent: p.totalSpent,
        isBankrupted: p.isBankrupted,
        isWinner: winner && winner.id === p.id
    }));

    io.to(room.roomId).emit('thePunch', {
        players: finalStats,
        winner: winner ? winner.name : 'No one survived!'
    });
}

function handleHostMigration(io, room, disconnectedId, roomId) {
    if (room.host === disconnectedId) {
        // Find next connected player to be host
        const nextHost = Object.values(room.players).find(p => p.connected);
        if (nextHost) {
            room.host = nextHost.id;
            io.to(nextHost.id).emit('hostMigrated');
            console.log(`Host migrated to ${nextHost.id} for room ${roomId}`);
        } else {
            // Room is empty, clean it up after a delay
            setTimeout(() => {
                const emptyRoom = rooms[roomId];
                if (emptyRoom) {
                    const stillEmpty = Object.values(emptyRoom.players).every(p => !p.connected);
                    if (stillEmpty) {
                        if (emptyRoom.intervalId) clearInterval(emptyRoom.intervalId);
                        delete rooms[roomId];
                        console.log(`Room ${roomId} deleted because it is empty.`);
                    }
                }
            }, 60000); // 1 minute grace period
        }
    }
}

module.exports = { handleConnection, handleHostMigration };
