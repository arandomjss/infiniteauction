const socket = io();

// DOM Elements - Lobby
const lobbyDiv = document.getElementById('lobby');
const playerNameInput = document.getElementById('playerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomCodeInput = document.getElementById('roomCode');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const lobbyWaitingDiv = document.getElementById('lobbyWaiting');
const displayRoomCode = document.getElementById('displayRoomCode');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const startGameBtn = document.getElementById('startGameBtn');
const leaveLobbyBtn = document.getElementById('leaveLobbyBtn');
const waitingMessage = document.getElementById('waitingMessage');

// DOM Elements - Game UI
const gameUIDiv = document.getElementById('gameUI');
const gameRoomCode = document.getElementById('gameRoomCode');
const gemValue = document.getElementById('gemValue');
const timerDisplay = document.getElementById('timer');
const arenaPlayerList = document.getElementById('arenaPlayerList');
const leaderboardList = document.getElementById('leaderboardList');
const myPoints = document.getElementById('myPoints');
const mySpent = document.getElementById('mySpent');
const bidInput = document.getElementById('bidInput');
const placeBidBtn = document.getElementById('placeBidBtn');
const bidStatusMsg = document.getElementById('bidStatusMsg');
const hostControls = document.getElementById('hostControls');
const endRoundBtn = document.getElementById('endRoundBtn');
const leaveGameBtn = document.getElementById('leaveGameBtn');

// DOM Elements - Host Settings
const hostLobbySettings = document.getElementById('hostLobbySettings');
const maxRoundsSelect = document.getElementById('maxRoundsSelect');
const roundTimeSelect = document.getElementById('roundTimeSelect');

// DOM Elements - End Game
const endGameUI = document.getElementById('endGameUI');
const endGameList = document.getElementById('endGameList');
const winnerText = document.getElementById('winnerText');
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');

// DOM Elements - Overlay
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');

// DOM Elements - Rules
const rulesBtn = document.getElementById('rulesBtn');
const rulesModal = document.getElementById('rulesModal');
const closeRulesBtn = document.getElementById('closeRulesBtn');
const rulesTabsNav = document.querySelector('.rules-tabs');
const rulesTabs = document.querySelectorAll('.rules-tab');
const rulesSections = document.querySelectorAll('.rules-section');
const rulesQuickToggle = document.getElementById('rulesQuickToggle');
const rulesFullToggle = document.getElementById('rulesFullToggle');
const rulesSelect = document.getElementById('rulesSelect');
const rulesDragHandle = document.getElementById('rulesDragHandle');
const musicBtn = document.getElementById('musicBtn');

// State
let currentRoom = null;
let isHost = false;
let myId = null;
let sessionId = localStorage.getItem('infiniteAuctionSessionId') || null;
let playersState = []; // [{id, name, points, connected, isBankrupted, hasBid}]

// --- LOBBY ACTIONS ---

createRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) return alert('Please enter a name before playing!');

    let requestedCode = document.getElementById('customRoomCode').value.trim().toUpperCase();

    socket.emit('createRoom', { requestedCode }, (res) => {
        if (res.error) return alert(res.error);
        currentRoom = res.roomId;
        isHost = true;
        promptJoinAsHost(currentRoom);
    });
});

function saveSession(id) {
    sessionId = id;
    localStorage.setItem('infiniteAuctionSessionId', id);
}

joinRoomBtn.addEventListener('click', () => {
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if (code.length > 0) {
        joinRoom(code);
    }
});

function promptJoinAsHost(roomId) {
    const name = playerNameInput.value.trim();
    if (!name) return alert('Please enter a name before playing!');
    socket.emit('joinRoom', { roomId, playerName: name }, (res) => {
        if (res.error) return alert(res.error);
        if (res.sessionId) saveSession(res.sessionId);
        showLobbyWaiting(roomId);
    });
}

function joinRoom(roomId) {
    const name = playerNameInput.value.trim();
    if (!name) return alert('Please enter a name before playing!');
    socket.emit('joinRoom', { roomId, playerName: name }, (res) => {
        if (res.error) return alert(res.error);
        if (res.sessionId) saveSession(res.sessionId);
        currentRoom = res.roomId;
        isHost = res.isHost;
        showLobbyWaiting(currentRoom);
    });
}

function showLobbyWaiting(roomId) {
    document.querySelector('.lobby-controls').classList.add('hidden');
    lobbyWaitingDiv.classList.remove('hidden');
    displayRoomCode.textContent = roomId;
    gameRoomCode.textContent = roomId;

    if (isHost) {
        hostLobbySettings.classList.remove('hidden');
        startGameBtn.classList.remove('hidden');
        waitingMessage.classList.add('hidden');
        hostControls.classList.remove('hidden');
    }
}

startGameBtn.addEventListener('click', () => {
    const rounds = parseInt(maxRoundsSelect.value, 10) || 12;
    const time = parseInt(roundTimeSelect.value, 10) || 60;
    socket.emit('startGame', { roomId: currentRoom, maxRounds: rounds, roundTime: time });
});

// --- GAME ACTIONS ---

placeBidBtn.addEventListener('click', () => {
    const bid = parseInt(bidInput.value, 10);
    if (isNaN(bid) || bid < 0) return alert('Enter a valid bid (0 or higher)');

    socket.emit('placeBid', { roomId: currentRoom, bid });

    window.AudioManager.playThud(); // Thud SFX

    bidInput.disabled = true;
    placeBidBtn.disabled = true;
    bidStatusMsg.classList.remove('hidden');
    bidInput.classList.remove('urgent-pulse');
});

endRoundBtn.addEventListener('click', () => {
    socket.emit('endRoundEarly', currentRoom);
});

leaveLobbyBtn.addEventListener('click', leaveCurrentGame);
leaveGameBtn.addEventListener('click', leaveCurrentGame);

function leaveCurrentGame() {
    if (currentRoom) {
        socket.emit('leaveGame', currentRoom);
    }

    // Clear Session
    localStorage.removeItem('infiniteAuctionSessionId');
    sessionId = null;
    currentRoom = null;
    isHost = false;
    playersState = [];

    // Reset UI to Lobby Entry
    endGameUI.classList.add('hidden');
    lobbyDiv.classList.remove('hidden');
    document.querySelector('.lobby-controls').classList.remove('hidden');
    lobbyWaitingDiv.classList.add('hidden');
    gameUIDiv.classList.add('hidden');
    overlay.classList.add('hidden');
    hostControls.classList.add('hidden');
    hostLobbySettings.classList.add('hidden');
    playerNameInput.value = '';
    roomCodeInput.value = '';
}


// --- SOCKET EVENTS ---

socket.on('connect', () => {
    myId = socket.id;

    // Attempt reconnect if session exists
    if (sessionId) {
        socket.emit('reconnectSession', { sessionId }, (res) => {
            if (res.success) {
                currentRoom = res.roomId;
                isHost = res.isHost;
                playersState = res.players;

                // Restore UI state
                lobbyDiv.classList.add('hidden');

                if (res.gameState === 'lobby') {
                    showLobbyWaiting(currentRoom);
                    lobbyDiv.classList.remove('hidden');
                    updateLobbyList();
                } else {
                    gameUIDiv.classList.remove('hidden');
                    gameRoomCode.textContent = currentRoom;
                    timerDisplay.textContent = res.roundInfo.timer;
                    if (res.stats.currentBid !== null) {
                        bidInput.disabled = true;
                        placeBidBtn.disabled = true;
                        bidStatusMsg.classList.remove('hidden');
                        bidInput.classList.remove('urgent-pulse'); // ensure removed
                    } else {
                        bidInput.disabled = false;
                        placeBidBtn.disabled = false;
                        bidStatusMsg.classList.add('hidden');
                    }

                    if (isHost) hostControls.classList.remove('hidden');

                    updateArenaList();
                    updateLeaderboard();
                }
            } else {
                // Session invalid/expired
                localStorage.removeItem('infiniteAuctionSessionId');
                sessionId = null;
            }
        });
    }
});

socket.on('playerJoined', (players) => {
    playersState = players;

    // Check if the current player is a spectator (joined while game is running)
    const myPlayer = playersState.find(p => p.id === myId);
    if (myPlayer && myPlayer.isSpectator) {
        // Hide bid input for this round, show spectator message
        bidInput.disabled = true;
        placeBidBtn.disabled = true;
        bidStatusMsg.textContent = "Spectating Round... You will join next round.";
        bidStatusMsg.classList.remove('hidden');
        bidStatusMsg.style.color = "var(--text-secondary)";
    }

    updateLobbyList();
});

socket.on('hostMigrated', () => {
    isHost = true;
    if (!lobbyDiv.classList.contains('hidden')) {
        hostLobbySettings.classList.remove('hidden');
        startGameBtn.classList.remove('hidden');
        waitingMessage.classList.add('hidden');
        document.getElementById('customRoomCode').parentElement.classList.add('hidden'); // hide creation tool
    } else if (!gameUIDiv.classList.contains('hidden')) {
        hostControls.classList.remove('hidden');
    }
    alert("The previous host left! You are now the Host.");
});

socket.on('roundStart', (data) => {
    lobbyDiv.classList.add('hidden');
    gameUIDiv.classList.remove('hidden');
    overlay.classList.add('hidden');
    endGameUI.classList.add('hidden');

    gemValue.textContent = '+' + data.gemValue;
    timerDisplay.textContent = data.timer;

    // Reset UI
    bidInput.value = '';
    bidInput.disabled = false;
    bidInput.classList.remove('urgent-pulse');
    placeBidBtn.disabled = false;
    bidStatusMsg.classList.add('hidden');

    // Glitch animation hook
    gemValue.classList.add('glitch-active');
    setTimeout(() => gemValue.classList.remove('glitch-active'), 500);

    // Auto-focus input on round start
    setTimeout(() => bidInput.focus(), 100);

    // Reset local player states tracking bid
    playersState.forEach(p => p.hasBid = false);
    updateArenaList();
    updateLeaderboard(); // In case points changed from previous round
});

socket.on('timerUpdate', (time) => {
    timerDisplay.textContent = time;
    if (time <= 10) {
        timerDisplay.style.color = 'var(--accent)';
        if (time > 0) window.AudioManager.playTick(); // Tick SFX

        // UX: Warning if player hasn't bid in last 5 seconds
        if (time <= 5 && !bidInput.disabled) {
            bidInput.classList.add('urgent-pulse');
        }
    } else {
        timerDisplay.style.color = 'var(--text-primary)';
        bidInput.classList.remove('urgent-pulse');
    }
});

socket.on('bidPlaced', (socketId) => {
    const p = playersState.find(p => p.id === socketId);
    if (p) p.hasBid = true;
    updateArenaList();
});

socket.on('roundResult', (data) => {
    // Update public states
    playersState = data.leaderboard;
    updateArenaList();
    updateLeaderboard();

    showOverlay('ROUND END', data.message);
});

socket.on('privateStats', (data) => {
    myPoints.textContent = data.points;
    mySpent.textContent = data.totalSpent;
});

socket.on('gravityCheck', (data) => {
    window.AudioManager.playEerie(); // Eerie SFX
    showOverlay('GRAVITY CHECK', `Total Bids Added Last 4 Rounds:\n$${data.amount}`);
});

socket.on('thePunch', (data) => {
    window.AudioManager.playPunch(); // Punch SFX
    playersState = data.players;

    // Hide standard game UI and overlay
    gameUIDiv.classList.add('hidden');
    overlay.classList.add('hidden');
    endGameUI.classList.remove('hidden');
    winnerText.classList.add('hidden');

    endGameList.innerHTML = '';

    // Sort players by totalSpent (highest spend at top) to build tension
    const sortedSpenders = [...playersState].sort((a, b) => b.totalSpent - a.totalSpent);

    // Stage 1: Render everyone (fading in sequentially)
    sortedSpenders.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'endgame-item';
        li.id = `endPlayer-${p.id}`;

        const nameDiv = document.createElement('div');
        nameDiv.textContent = p.name;

        const ptsDiv = document.createElement('div');
        ptsDiv.textContent = p.points;

        const spendDiv = document.createElement('div');
        spendDiv.textContent = '$' + p.totalSpent;

        li.appendChild(nameDiv);
        li.appendChild(ptsDiv);
        li.appendChild(spendDiv);
        endGameList.appendChild(li);

        // Stagger fade ins
        setTimeout(() => {
            li.classList.add('fade-in-up');
        }, index * 400 + 500); // 400ms delay between players, starting 500ms in
    });

    // Stage 2: The Strike (Bankruptcies)
    const renderTime = (sortedSpenders.length * 400) + 1500; // wait till all faded in + 1s pause
    setTimeout(() => {
        sortedSpenders.forEach(p => {
            if (p.isBankrupted) {
                const el = document.getElementById(`endPlayer-${p.id}`);
                if (el) el.classList.add('strike-anim');
            }
        });

        // Stage 3: The Reveal (Winner)
        setTimeout(() => {
            sortedSpenders.forEach(p => {
                if (p.isWinner) {
                    const el = document.getElementById(`endPlayer-${p.id}`);
                    if (el) el.classList.add('winner-anim');
                }
            });
            winnerText.textContent = `${data.winner} Survives!`;
            winnerText.classList.remove('hidden');
            winnerText.classList.add('fade-in-up');
        }, 1500); // Wait 1.5s after strike

    }, renderTime);
});

returnToLobbyBtn.addEventListener('click', leaveCurrentGame);

socket.on('playerLeft', (socketId) => {
    const p = playersState.find(p => p.id === socketId);
    if (p) p.connected = false;
    updateLobbyList();
    updateArenaList();
});

socket.on('playerRejoined', (data) => {
    playersState = data.players;
    updateLobbyList();
    updateArenaList();
});


// --- RENDER FUNCTIONS ---

function updateLobbyList() {
    lobbyPlayerList.innerHTML = '';
    // Determine host id from server-provided flag, fallback to local `isHost`
    const hostFromServer = playersState.find(p => p.isHost);
    const hostId = hostFromServer ? hostFromServer.id : (isHost ? myId : null);

    // Show host first
    const sorted = [...playersState].sort((a, b) => {
        const aKey = (a.id === hostId) ? 1 : 0;
        const bKey = (b.id === hostId) ? 1 : 0;
        return bKey - aKey;
    });

    sorted.forEach(p => {
        if (!p.connected) return;
        const div = document.createElement('div');
        div.className = 'lobby-player';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        nameSpan.className = 'lobby-player-name';
        div.appendChild(nameSpan);

        if (p.id === hostId) {
            const hostBadge = document.createElement('span');
            hostBadge.className = 'host-badge';
            hostBadge.textContent = (p.id === myId) ? 'You (Host)' : 'Host';
            div.appendChild(hostBadge);
        }

        if (p.isSpectator) {
            const specBadge = document.createElement('span');
            specBadge.className = 'spectator-badge';
            specBadge.textContent = 'Spectator';
            div.appendChild(specBadge);
        }

        lobbyPlayerList.appendChild(div);
    });
}

function updateArenaList() {
    arenaPlayerList.innerHTML = '';
    playersState.forEach(p => {
        if (!p.connected || p.isBankrupted) return;

        const li = document.createElement('li');
        li.className = 'player-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const statusDiv = document.createElement('div');
        statusDiv.className = 'status-indicator ' + (p.hasBid ? 'ready' : '');

        li.appendChild(nameSpan);
        li.appendChild(statusDiv);
        arenaPlayerList.appendChild(li);
    });
}

function updateLeaderboard(isThePunch = false) {
    leaderboardList.innerHTML = '';

    // Sort players by points desc
    const sorted = [...playersState].sort((a, b) => b.points - a.points);

    sorted.forEach(p => {
        const li = document.createElement('li');
        li.className = `rank-item ${p.isBankrupted ? 'bankrupted' : ''}`;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        if (!p.connected) nameSpan.textContent += ' (Offline)';

        const scoreSpan = document.createElement('span');
        // If it's the punch, show points and total spent
        if (isThePunch) {
            scoreSpan.textContent = `Pts: ${p.points} | Spent: $${p.totalSpent}`;
        } else {
            scoreSpan.textContent = p.points;
        }

        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        leaderboardList.appendChild(li);
    });
}

function showOverlay(title, message) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlay.classList.remove('hidden');
}
// --- RULES MODAL (Tabbed) ---
function openRules() {
    if (!rulesModal) return;
    rulesModal.classList.remove('hidden');
    rulesModal.setAttribute('aria-hidden', 'false');

    // Default view depends on the toggle state
    if (rulesQuickToggle && rulesQuickToggle.classList.contains('active')) {
        showQuickView();
    } else {
        showFullView();
    }

    // Focus first control for accessibility
    const firstControl = rulesModal.querySelector('.rules-content button, .rules-content a');
    if (firstControl) firstControl.focus();
    // Mobile specific: lock background scroll and mark mobile-open
    if (window.innerWidth <= 680) {
        rulesModal.classList.add('mobile-open');
        document.body.style.overflow = 'hidden';
        if (rulesBtn) rulesBtn.style.display = 'none';
    }
}

function closeRules() {
    if (!rulesModal) return;
    rulesModal.classList.add('hidden');
    rulesModal.setAttribute('aria-hidden', 'true');
    // restore scrolling and button visibility
    if (rulesModal.classList.contains('mobile-open')) {
        rulesModal.classList.remove('mobile-open');
        document.body.style.overflow = '';
        if (rulesBtn) rulesBtn.style.display = '';
    }
}

function showTab(tab) {
    // Activate the tab button
    document.querySelectorAll('.rules-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
    });

    // Show the matching section
    document.querySelectorAll('.rules-section').forEach(sec => {
        sec.classList.toggle('hidden', sec.id !== `tab-${tab}`);
    });
}

function showQuickView() {
    if (rulesTabsNav) rulesTabsNav.classList.add('hidden');
    if (rulesQuickToggle) {
        rulesQuickToggle.classList.add('active');
        rulesQuickToggle.setAttribute('aria-pressed', 'true');
    }
    if (rulesFullToggle) {
        rulesFullToggle.classList.remove('active');
        rulesFullToggle.setAttribute('aria-pressed', 'false');
    }
    showTab('quick');
}

function showFullView() {
    if (rulesTabsNav) rulesTabsNav.classList.remove('hidden');
    if (rulesFullToggle) {
        rulesFullToggle.classList.add('active');
        rulesFullToggle.setAttribute('aria-pressed', 'true');
    }
    if (rulesQuickToggle) {
        rulesQuickToggle.classList.remove('active');
        rulesQuickToggle.setAttribute('aria-pressed', 'false');
    }
    showTab('overview');
}

if (rulesBtn) rulesBtn.addEventListener('click', openRules);
if (closeRulesBtn) closeRulesBtn.addEventListener('click', closeRules);

// Tab clicks
document.querySelectorAll('.rules-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        // switch to full mode whenever a specific tab is chosen
        if (rulesFullToggle) rulesFullToggle.classList.add('active');
        if (rulesQuickToggle) rulesQuickToggle.classList.remove('active');
        if (rulesTabsNav) rulesTabsNav.classList.remove('hidden');
        showTab(btn.dataset.tab);
    });
});

// Quick/Full toggles
if (rulesQuickToggle) rulesQuickToggle.addEventListener('click', showQuickView);
if (rulesFullToggle) rulesFullToggle.addEventListener('click', showFullView);

// Mobile: rules select (visible on small screens)
if (rulesSelect) {
    rulesSelect.addEventListener('change', (e) => {
        const tab = e.target.value;
        showFullView();
        showTab(tab);
    });
}

// Swipe-down to close using the drag handle
let touchStartY = 0;
let touchStartX = 0;
if (rulesDragHandle) {
    rulesDragHandle.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
    }, { passive: true });

    rulesDragHandle.addEventListener('touchend', (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        if ((touchEndY - touchStartY) > 50 && Math.abs(touchEndX - touchStartX) < 60) {
            closeRules();
        }
    });
}

// Close when clicking outside the content
if (rulesModal) {
    rulesModal.addEventListener('click', (e) => {
        if (e.target === rulesModal) closeRules();
    });
}

// Close with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rulesModal && !rulesModal.classList.contains('hidden')) {
        closeRules();
    }
});

// --- MUSIC TOGGLE ---
if (musicBtn) {
    const savedMusic = localStorage.getItem('infiniteAuctionMusic') === '1';
    if (savedMusic) {
        musicBtn.classList.add('playing');
        musicBtn.setAttribute('aria-pressed', 'true');
        musicBtn.title = 'Music: On';
        // Start music on next user gesture to satisfy autoplay policies
        const resumeAndStart = async () => {
            try {
                await window.AudioManager.init();
                await window.AudioManager.startBackgroundMusic();
            } catch (e) {}
            document.removeEventListener('click', resumeAndStart);
        };
        document.addEventListener('click', resumeAndStart, { once: true });
    }

    musicBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await window.AudioManager.init(); } catch (e) {}
        const isPlaying = musicBtn.classList.contains('playing');
        if (isPlaying) {
            try { window.AudioManager.stopBackgroundMusic(); } catch (e) {}
            musicBtn.classList.remove('playing');
            musicBtn.setAttribute('aria-pressed', 'false');
            musicBtn.title = 'Music: Off';
            localStorage.setItem('infiniteAuctionMusic', '0');
        } else {
            try { window.AudioManager.startBackgroundMusic(); } catch (e) {}
            musicBtn.classList.add('playing');
            musicBtn.setAttribute('aria-pressed', 'true');
            musicBtn.title = 'Music: On';
            localStorage.setItem('infiniteAuctionMusic', '1');
        }
    });
}
