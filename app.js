/* =============================================
   LDG - The Long Dunn Game
   Main Application JavaScript
   With Firebase Realtime Database
   ============================================= */

// =============================================
// Firebase Configuration
// =============================================

const firebaseConfig = {
    apiKey: "AIzaSyDRxTFrwxGLn-CwdXRwvwcJoxNmOlraiQs",
    authDomain: "ldg-game.firebaseapp.com",
    databaseURL: "https://ldg-game-default-rtdb.firebaseio.com",
    projectId: "ldg-game",
    storageBucket: "ldg-game.firebasestorage.app",
    messagingSenderId: "99125733954",
    appId: "1:99125733954:web:2ae9584f83066c9bfc5bdb"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// =============================================
// Global Variables & State
// =============================================

const VALID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'V', 'W'];
const GAME_DURATION = 300; // 5 minutes in seconds
const TIMER_CIRCUMFERENCE = 283; // 2 * PI * 45 (radius)

const CATEGORIES = [
    { id: 'town', name: 'Town' },
    { id: 'state', name: 'State' },
    { id: 'country', name: 'Country' },
    { id: 'boys-name', name: "Boy's Name" },
    { id: 'girls-name', name: "Girl's Name" },
    { id: 'clothing', name: 'Article of Clothing' },
    { id: 'fruit', name: 'Fruit' },
    { id: 'flower', name: 'Flower' },
    { id: 'vegetable', name: 'Vegetable' },
    { id: 'bird', name: 'Bird' },
    { id: 'animal', name: 'Animal' },
    { id: 'fish', name: 'Fish' },
    { id: 'mountain', name: 'Mountain' },
    { id: 'river', name: 'River' }
];

let gameState = {
    currentLetter: '',
    timeRemaining: GAME_DURATION,
    timerInterval: null,
    isGameActive: false,
    score: 0,
    answers: {},
    musicPlaying: false,
    audioContext: null,
    oscillator: null,
    gainNode: null
};

let multiplayerState = {
    gameCode: '',
    playerName: '',
    playerId: '',
    isHost: false,
    players: [],
    currentLetter: '',
    gameStartTime: null,
    gameEndTime: null,
    playerAnswers: {},
    allSubmitted: false,
    gameListener: null,
    deadlineInterval: null,
    challengedAnswers: {} // Track challenged answers: { "category-answer": true }
};

// =============================================
// DOM Elements
// =============================================

const pages = {
    landing: document.getElementById('landing-page'),
    individual: document.getElementById('individual-page'),
    multiplayer: document.getElementById('multiplayer-page')
};

// =============================================
// Session Persistence (localStorage)
// =============================================

const SESSION_KEY = 'ldg_game_session';

function saveGameSession() {
    const session = {
        gameCode: multiplayerState.gameCode,
        playerName: multiplayerState.playerName,
        playerId: multiplayerState.playerId,
        isHost: multiplayerState.isHost,
        timestamp: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getGameSession() {
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (!data) return null;
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}

function clearGameSession() {
    localStorage.removeItem(SESSION_KEY);
}

async function checkForActiveSession() {
    const session = getGameSession();
    if (!session) return;

    // Session older than 25 hours is stale
    if (Date.now() - session.timestamp > 25 * 60 * 60 * 1000) {
        clearGameSession();
        return;
    }

    try {
        const snapshot = await database.ref('games/' + session.gameCode).once('value');
        const gameData = snapshot.val();

        if (!gameData) {
            clearGameSession();
            return;
        }

        // Check if game has expired
        if (Date.now() > gameData.gameEndTime) {
            clearGameSession();
            return;
        }

        // Check if resultsReady — show results notification instead of rejoin
        if (gameData.resultsReady) {
            showResultsNotification(session, gameData);
            return;
        }

        // Show rejoin banner
        showRejoinBanner(session);
    } catch (error) {
        console.error('Error checking session:', error);
    }
}

function showRejoinBanner(session) {
    const banner = document.getElementById('rejoin-banner');
    const codeSpan = document.getElementById('rejoin-banner-code');
    if (!banner || !codeSpan) return;

    codeSpan.textContent = session.gameCode;
    banner.classList.remove('hidden');

    document.getElementById('rejoin-btn').onclick = () => rejoinGame(session);
    document.getElementById('rejoin-dismiss-btn').onclick = () => {
        banner.classList.add('hidden');
    };
}

async function rejoinGame(session) {
    const banner = document.getElementById('rejoin-banner');
    if (banner) banner.classList.add('hidden');

    try {
        const snapshot = await database.ref('games/' + session.gameCode).once('value');
        const gameData = snapshot.val();

        if (!gameData) {
            alert('This game no longer exists.');
            clearGameSession();
            return;
        }

        if (Date.now() > gameData.gameEndTime) {
            alert('This game has expired.');
            clearGameSession();
            return;
        }

        // Restore multiplayerState
        multiplayerState.gameCode = session.gameCode;
        multiplayerState.playerName = session.playerName;
        multiplayerState.playerId = session.playerId;
        multiplayerState.isHost = session.isHost;
        multiplayerState.currentLetter = gameData.currentLetter;
        multiplayerState.gameStartTime = gameData.gameStartTime;
        multiplayerState.gameEndTime = gameData.gameEndTime;
        multiplayerState.playerAnswers = gameData.answers || {};

        // Set players array from game data
        multiplayerState.players = Object.entries(gameData.players || {}).map(([id, player]) => ({
            id: id,
            name: player.name,
            isHost: player.isHost,
            submitted: player.submitted || false
        }));

        // Navigate to multiplayer page
        showPage('multiplayer');

        // Hide lobby, show waiting room
        document.getElementById('multiplayer-lobby').classList.add('hidden');
        showWaitingRoom();
        updatePlayersDisplay();
        startGameListener();

        // Check if this player has already submitted
        const currentPlayer = multiplayerState.players.find(p => p.id === session.playerId);
        if (currentPlayer && currentPlayer.submitted) {
            // Check if all have submitted
            const allSubmitted = multiplayerState.players.every(p => p.submitted);
            if (allSubmitted) {
                document.getElementById('multiplayer-waiting').classList.add('hidden');
                showSubmittedScreen();
            }
        }
    } catch (error) {
        console.error('Error rejoining game:', error);
        alert('Failed to rejoin game. Please try again.');
    }
}

function showResultsNotification(session, gameData) {
    // Dynamically create notification if it doesn't exist yet
    let banner = document.getElementById('results-notification-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'results-notification-banner';
        banner.className = 'results-notification-banner';
        banner.innerHTML = `
            <div class="results-notification-content">
                <div class="results-notification-text">
                    <span class="results-notification-icon">🏆</span>
                    <div>
                        <strong>Your game has finished!</strong>
                        <p>Game <span id="results-notification-code"></span> — View the results</p>
                    </div>
                </div>
                <div class="results-notification-actions">
                    <button id="results-view-btn" class="results-view-button">View Results</button>
                    <button id="results-dismiss-btn" class="results-dismiss">✕</button>
                </div>
            </div>
        `;
        const playOptions = document.querySelector('.play-options');
        playOptions.parentNode.insertBefore(banner, playOptions);
    }

    banner.querySelector('#results-notification-code').textContent = session.gameCode;
    banner.classList.remove('hidden');

    banner.querySelector('#results-view-btn').onclick = () => {
        loadAndShowResults(session, gameData);
    };
    banner.querySelector('#results-dismiss-btn').onclick = () => {
        banner.classList.add('hidden');
        clearGameSession();
    };
}

async function loadAndShowResults(session, gameData) {
    // Hide notification
    const banner = document.getElementById('results-notification-banner');
    if (banner) banner.classList.add('hidden');

    // Restore multiplayerState
    multiplayerState.gameCode = session.gameCode;
    multiplayerState.playerName = session.playerName;
    multiplayerState.playerId = session.playerId;
    multiplayerState.isHost = session.isHost;
    multiplayerState.currentLetter = gameData.currentLetter;
    multiplayerState.gameStartTime = gameData.gameStartTime;
    multiplayerState.gameEndTime = gameData.gameEndTime;
    multiplayerState.playerAnswers = gameData.answers || {};
    multiplayerState.challengedAnswers = gameData.finalChallengedAnswers || {};

    multiplayerState.players = Object.entries(gameData.players || {}).map(([id, player]) => ({
        id: id,
        name: player.name,
        isHost: player.isHost,
        submitted: player.submitted || false
    }));

    // Navigate to multiplayer page and show results directly
    showPage('multiplayer');
    document.getElementById('multiplayer-lobby').classList.add('hidden');
    document.getElementById('multiplayer-waiting').classList.add('hidden');
    document.getElementById('multiplayer-game').classList.add('hidden');
    document.getElementById('multiplayer-submitted').classList.add('hidden');
    document.getElementById('multiplayer-review').classList.add('hidden');

    showMultiplayerResults();

    // Clear session after viewing
    clearGameSession();
}

// =============================================
// Page Navigation
// =============================================

function showPage(pageName) {
    Object.values(pages).forEach(page => page.classList.remove('active'));
    pages[pageName].classList.add('active');
    window.scrollTo(0, 0);
}

// Landing page buttons
document.getElementById('individual-btn').addEventListener('click', () => {
    showPage('individual');
    resetIndividualGame();
});

document.getElementById('multiplayer-btn').addEventListener('click', () => {
    showPage('multiplayer');
    resetMultiplayerState();
});

// Back buttons
document.getElementById('back-to-home').addEventListener('click', () => {
    if (gameState.isGameActive) {
        if (confirm('Are you sure you want to leave? Your progress will be lost.')) {
            endGame();
            showPage('landing');
        }
    } else {
        showPage('landing');
    }
});

document.getElementById('back-to-home-mp').addEventListener('click', () => {
    if (gameState.isGameActive) {
        if (confirm('Are you sure you want to leave? Your progress will be lost.')) {
            endGame();
            cleanupMultiplayerListeners();
            showPage('landing');
        }
    } else {
        cleanupMultiplayerListeners();
        showPage('landing');
    }
});

// =============================================
// Letter Generation
// =============================================

function generateRandomLetter() {
    const randomIndex = Math.floor(Math.random() * VALID_LETTERS.length);
    return VALID_LETTERS[randomIndex];
}

// =============================================
// Timer Functions
// =============================================

function startTimer(displayMinutes, displaySeconds, progressCircle, onComplete, isMultiplayer = false) {
    gameState.timeRemaining = GAME_DURATION;
    gameState.isGameActive = true;

    updateTimerDisplay(displayMinutes, displaySeconds, progressCircle);

    gameState.timerInterval = setInterval(() => {
        gameState.timeRemaining--;
        updateTimerDisplay(displayMinutes, displaySeconds, progressCircle);

        if (gameState.timeRemaining <= 0) {
            clearInterval(gameState.timerInterval);
            gameState.isGameActive = false;
            onComplete();
        }
    }, 1000);
}

function updateTimerDisplay(displayMinutes, displaySeconds, progressCircle) {
    const minutes = Math.floor(gameState.timeRemaining / 60);
    const seconds = gameState.timeRemaining % 60;

    displayMinutes.textContent = minutes.toString().padStart(2, '0');
    displaySeconds.textContent = seconds.toString().padStart(2, '0');

    // Update progress circle
    const progress = (GAME_DURATION - gameState.timeRemaining) / GAME_DURATION;
    const offset = TIMER_CIRCUMFERENCE * progress;
    progressCircle.style.strokeDashoffset = offset;

    // Color changes based on time remaining
    if (gameState.timeRemaining <= 30) {
        progressCircle.classList.add('danger');
        progressCircle.classList.remove('warning');
    } else if (gameState.timeRemaining <= 60) {
        progressCircle.classList.add('warning');
        progressCircle.classList.remove('danger');
    } else {
        progressCircle.classList.remove('warning', 'danger');
    }
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
    gameState.isGameActive = false;
}

// =============================================
// Music Functions (HTML5 Audio)
// =============================================

// Royalty-free calm music from Mixkit (free to use, no attribution required)
const BACKGROUND_MUSIC_URL = 'https://assets.mixkit.co/music/443/443.mp3'; // "Serene View" by Arulo

let backgroundMusic = null;

function initAudio() {
    if (!backgroundMusic) {
        backgroundMusic = new Audio(BACKGROUND_MUSIC_URL);
        backgroundMusic.loop = true;
        backgroundMusic.volume = 0.3;

        // Preload the audio
        backgroundMusic.load();

        // Handle loading errors
        backgroundMusic.onerror = () => {
            console.log('Could not load background music');
        };
    }
}

function startMusic() {
    if (gameState.musicPlaying) return;

    try {
        initAudio();

        if (backgroundMusic) {
            // Reset to beginning if needed
            backgroundMusic.currentTime = 0;

            const playPromise = backgroundMusic.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    gameState.musicPlaying = true;
                    console.log('Music started');
                }).catch(error => {
                    console.log('Could not start music:', error);
                    // Music might be blocked by browser autoplay policy
                    // It will work after user interaction
                });
            }
        }
    } catch (error) {
        console.log('Audio not available:', error);
    }
}

function stopMusic() {
    gameState.musicPlaying = false;

    if (backgroundMusic) {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
    }
}

function toggleMusic(button) {
    if (gameState.musicPlaying) {
        stopMusic();
        button.classList.add('muted');
        button.querySelector('.music-status').textContent = 'Music';
    } else {
        startMusic();
        button.classList.remove('muted');
        button.querySelector('.music-status').textContent = 'Music';
        gameState.musicPlaying = true;
    }
}

// Music toggle buttons
document.getElementById('music-toggle').addEventListener('click', function() {
    toggleMusic(this);
});

document.getElementById('mp-music-toggle').addEventListener('click', function() {
    toggleMusic(this);
});

// =============================================
// Individual Game Functions
// =============================================

function resetIndividualGame() {
    document.getElementById('individual-intro').classList.remove('hidden');
    document.getElementById('individual-game').classList.add('hidden');
    document.getElementById('individual-results').classList.add('hidden');

    gameState.currentLetter = '';
    gameState.score = 0;
    gameState.answers = {};
    stopTimer();
    stopMusic();

    // Reset form
    document.getElementById('game-form').reset();
    document.querySelectorAll('#game-form input').forEach(input => {
        input.classList.remove('valid', 'invalid');
        input.disabled = false;
    });
}

document.getElementById('start-individual').addEventListener('click', startIndividualGame);

function startIndividualGame() {
    document.getElementById('individual-intro').classList.add('hidden');
    document.getElementById('individual-game').classList.remove('hidden');

    // Generate letter
    gameState.currentLetter = generateRandomLetter();
    document.getElementById('game-letter').textContent = gameState.currentLetter;
    document.getElementById('current-score').textContent = '0';

    // Update placeholders with letter hint
    document.querySelectorAll('#game-form input').forEach(input => {
        const label = input.previousElementSibling.textContent;
        input.placeholder = `Enter a ${label.toLowerCase()} starting with "${gameState.currentLetter}"...`;
    });

    // Start timer
    const displayMinutes = document.getElementById('timer-minutes');
    const displaySeconds = document.getElementById('timer-seconds');
    const progressCircle = document.getElementById('timer-progress');

    startTimer(displayMinutes, displaySeconds, progressCircle, submitIndividualGame);

    // Start music
    startMusic();
    document.getElementById('music-toggle').classList.remove('muted');

    // Focus first input
    document.getElementById('town').focus();
}

// Real-time validation for individual game
document.querySelectorAll('#game-form input').forEach(input => {
    input.addEventListener('input', function() {
        validateInput(this, gameState.currentLetter);
        updateScore();
    });
});

function validateInput(input, letter) {
    const value = input.value.trim();

    if (value === '') {
        input.classList.remove('valid', 'invalid');
        return false;
    }

    if (value.toUpperCase().startsWith(letter)) {
        input.classList.add('valid');
        input.classList.remove('invalid');
        return true;
    } else {
        input.classList.add('invalid');
        input.classList.remove('valid');
        return false;
    }
}

function updateScore() {
    let score = 0;
    document.querySelectorAll('#game-form input').forEach(input => {
        if (input.classList.contains('valid')) {
            score += 10;
        }
    });
    gameState.score = score;
    document.getElementById('current-score').textContent = score;
}

document.getElementById('game-form').addEventListener('submit', function(e) {
    e.preventDefault();
    submitIndividualGame();
});

function submitIndividualGame() {
    stopTimer();
    stopMusic();

    // Disable all inputs
    document.querySelectorAll('#game-form input').forEach(input => {
        input.disabled = true;
    });

    // Collect answers
    gameState.answers = {};
    CATEGORIES.forEach(cat => {
        const input = document.getElementById(cat.id);
        gameState.answers[cat.id] = {
            value: input.value.trim(),
            valid: input.classList.contains('valid')
        };
    });

    // Calculate final score
    let finalScore = 0;
    Object.values(gameState.answers).forEach(answer => {
        if (answer.valid && answer.value !== '') {
            finalScore += 10;
        }
    });
    gameState.score = finalScore;

    // Show results
    showIndividualResults();

    // Show celebration if score > 120
    if (finalScore > 120) {
        setTimeout(() => showCelebration(finalScore), 500);
    }
}

function showIndividualResults() {
    document.getElementById('individual-game').classList.add('hidden');
    const resultsArea = document.getElementById('individual-results');
    resultsArea.classList.remove('hidden');

    let breakdownHTML = '';
    CATEGORIES.forEach(cat => {
        const answer = gameState.answers[cat.id];
        const isCorrect = answer.valid && answer.value !== '';
        breakdownHTML += `
            <div class="breakdown-item ${isCorrect ? 'correct' : 'incorrect'}">
                <span class="breakdown-category">${cat.name}</span>
                <div class="breakdown-answer">
                    <span class="answer-text">${answer.value || '(no answer)'}</span>
                    <span class="points">${isCorrect ? '+10' : '0'}</span>
                </div>
            </div>
        `;
    });

    resultsArea.innerHTML = `
        <div class="results-container">
            <div class="results-header">
                <h2>Game Complete!</h2>
                <p>Letter: <strong>${gameState.currentLetter}</strong></p>
                <div class="results-score">
                    <div class="score-value">${gameState.score}</div>
                    <div class="score-label">Total Points</div>
                </div>
            </div>
            <div class="results-breakdown">
                <h3>Your Answers</h3>
                <div class="breakdown-grid">
                    ${breakdownHTML}
                </div>
            </div>
            <div class="results-buttons">
                    <button class="play-again-button" onclick="resetIndividualGame()">Play Again</button>
                    <button class="home-button" onclick="window.goToHome()">Back to Home</button>
                </div>
        </div>
    `;
}

// =============================================
// Celebration Functions
// =============================================

function showCelebration(score, winnerName = null) {
    const overlay = document.getElementById('celebration-overlay');
    const title = document.getElementById('celebration-title');
    const message = document.getElementById('celebration-message');
    const scoreDisplay = document.getElementById('final-score');

    if (winnerName) {
        title.textContent = `${winnerName} Wins!`;
        message.textContent = 'Champion of this round!';
    } else {
        title.textContent = 'Congratulations!';
        message.textContent = 'You\'ve achieved an outstanding score!';
    }

    scoreDisplay.textContent = score;

    // Create confetti
    createConfetti();

    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);
}

function createConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';

    const colors = ['#c6a052', '#1a365d', '#38a169', '#e53e3e', '#d69e2e', '#9f7aea'];

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        container.appendChild(confetti);
    }
}

document.getElementById('celebration-close').addEventListener('click', () => {
    const overlay = document.getElementById('celebration-overlay');
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 300);
});

// =============================================
// Multiplayer Functions - Firebase Integration
// =============================================

function cleanupMultiplayerListeners() {
    if (multiplayerState.gameListener) {
        multiplayerState.gameListener();
        multiplayerState.gameListener = null;
    }
    if (multiplayerState.deadlineInterval) {
        clearInterval(multiplayerState.deadlineInterval);
        multiplayerState.deadlineInterval = null;
    }
    if (multiplayerState._suggestionsListener) {
        multiplayerState._suggestionsListener.off();
        multiplayerState._suggestionsListener = null;
    }
}

function resetMultiplayerState() {
    cleanupMultiplayerListeners();

    document.getElementById('multiplayer-lobby').classList.remove('hidden');
    document.getElementById('multiplayer-waiting').classList.add('hidden');
    document.getElementById('multiplayer-game').classList.add('hidden');
    document.getElementById('multiplayer-submitted').classList.add('hidden');
    document.getElementById('multiplayer-review').classList.add('hidden');
    document.getElementById('multiplayer-results').classList.add('hidden');

    multiplayerState = {
        gameCode: '',
        playerName: '',
        playerId: '',
        isHost: false,
        players: [],
        currentLetter: '',
        gameStartTime: null,
        gameEndTime: null,
        playerAnswers: {},
        allSubmitted: false,
        gameListener: null,
        deadlineInterval: null,
        challengedAnswers: {}
    };

    // Reset forms
    document.getElementById('host-name').value = '';
    document.getElementById('join-name').value = '';
    document.getElementById('game-code').value = '';

    // Reset MP game form
    document.getElementById('mp-game-form').reset();
    document.querySelectorAll('#mp-game-form input').forEach(input => {
        input.classList.remove('valid', 'invalid');
        input.disabled = false;
    });

    stopTimer();
    stopMusic();
}

function generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

document.getElementById('create-game-btn').addEventListener('click', createGame);
document.getElementById('join-game-btn').addEventListener('click', joinGame);

async function createGame() {
    const name = document.getElementById('host-name').value.trim();
    if (!name) {
        alert('Please enter your name');
        return;
    }

    const gameCode = generateGameCode();
    const playerId = generatePlayerId();
    const currentLetter = generateRandomLetter();
    const now = Date.now();

    multiplayerState.gameCode = gameCode;
    multiplayerState.playerName = name;
    multiplayerState.playerId = playerId;
    multiplayerState.isHost = true;
    multiplayerState.currentLetter = currentLetter;
    multiplayerState.gameStartTime = now;
    multiplayerState.gameEndTime = now + (24 * 60 * 60 * 1000);

    // Set host in players array immediately so they appear in the list
    multiplayerState.players = [{
        id: playerId,
        name: name,
        isHost: true,
        submitted: false
    }];

    const gameData = {
        gameCode: gameCode,
        currentLetter: currentLetter,
        gameStartTime: now,
        gameEndTime: multiplayerState.gameEndTime,
        hostId: playerId,
        players: {
            [playerId]: {
                name: name,
                isHost: true,
                submitted: false,
                joinedAt: now
            }
        },
        answers: {}
    };

    try {
        await database.ref('games/' + gameCode).set(gameData);
        console.log('Game created:', gameCode);
        saveGameSession();
        showWaitingRoom();
        updatePlayersDisplay(); // Update display immediately with host
        startGameListener();
    } catch (error) {
        console.error('Error creating game:', error);
        alert('Failed to create game. Please try again.');
    }
}

async function joinGame() {
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('game-code').value.trim().toUpperCase();

    if (!name) {
        alert('Please enter your name');
        return;
    }
    if (!code) {
        alert('Please enter a game code');
        return;
    }

    try {
        const snapshot = await database.ref('games/' + code).once('value');
        const gameData = snapshot.val();

        if (!gameData) {
            alert('Game not found. Please check the code and try again.');
            return;
        }

        // Check if game has expired
        if (Date.now() > gameData.gameEndTime) {
            alert('This game has expired.');
            return;
        }

        const playerId = generatePlayerId();

        // Check if name already exists
        const existingPlayer = Object.entries(gameData.players || {}).find(
            ([id, p]) => p.name.toLowerCase() === name.toLowerCase()
        );

        if (existingPlayer) {
            // Player rejoining - use existing ID
            multiplayerState.playerId = existingPlayer[0];
            multiplayerState.isHost = existingPlayer[1].isHost;
        } else {
            // New player joining
            multiplayerState.playerId = playerId;
            await database.ref('games/' + code + '/players/' + playerId).set({
                name: name,
                isHost: false,
                submitted: false,
                joinedAt: Date.now()
            });
            multiplayerState.isHost = false;
        }

        multiplayerState.gameCode = code;
        multiplayerState.playerName = name;
        multiplayerState.currentLetter = gameData.currentLetter;
        multiplayerState.gameStartTime = gameData.gameStartTime;
        multiplayerState.gameEndTime = gameData.gameEndTime;

        // Set players array immediately from game data
        multiplayerState.players = Object.entries(gameData.players || {}).map(([id, player]) => ({
            id: id,
            name: player.name,
            isHost: player.isHost,
            submitted: player.submitted || false
        }));

        // Add self if new player (not yet in the list)
        if (!existingPlayer) {
            multiplayerState.players.push({
                id: playerId,
                name: name,
                isHost: false,
                submitted: false
            });
        }

        saveGameSession();
        showWaitingRoom();
        updatePlayersDisplay(); // Update display immediately
        startGameListener();

    } catch (error) {
        console.error('Error joining game:', error);
        alert('Failed to join game. Please try again.');
    }
}

function startGameListener() {
    const gameRef = database.ref('games/' + multiplayerState.gameCode);

    multiplayerState.gameListener = gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;

        // Update local state
        multiplayerState.currentLetter = gameData.currentLetter;
        multiplayerState.gameEndTime = gameData.gameEndTime;

        // Convert players object to array
        multiplayerState.players = Object.entries(gameData.players || {}).map(([id, player]) => ({
            id: id,
            name: player.name,
            isHost: player.isHost,
            submitted: player.submitted || false
        }));

        // Store answers
        multiplayerState.playerAnswers = gameData.answers || {};

        // Update displays
        updatePlayersDisplay();

        // Check if we're on the submitted screen
        const submittedScreen = document.getElementById('multiplayer-submitted');
        if (!submittedScreen.classList.contains('hidden')) {
            updatePlayerStatusList();
            checkAllSubmitted();
        }
    });
}

function showWaitingRoom() {
    document.getElementById('multiplayer-lobby').classList.add('hidden');
    document.getElementById('multiplayer-waiting').classList.remove('hidden');

    // Display game code
    document.getElementById('display-game-code').textContent = multiplayerState.gameCode;

    // Set invite link
    const inviteLink = `${window.location.origin}${window.location.pathname}?join=${multiplayerState.gameCode}`;
    document.getElementById('invite-link').value = inviteLink;

    // Start countdown timer
    updateGameDeadline();
    multiplayerState.deadlineInterval = setInterval(updateGameDeadline, 1000);
}

function updatePlayersDisplay() {
    const playersList = document.getElementById('players-list');
    const completedCount = multiplayerState.players.filter(p => p.submitted).length;

    playersList.innerHTML = multiplayerState.players.map(player => {
        const statusClass = player.submitted ? 'completed' : '';
        const hostClass = player.isHost ? 'host' : '';
        const statusText = player.submitted ? 'Completed their turn' : 'Waiting to play';
        const statusBadgeClass = player.submitted ? 'completed' : 'waiting';
        const statusBadgeText = player.submitted ? '✓ Done' : 'Waiting';
        const isCurrentPlayer = player.name === multiplayerState.playerName ? ' (You)' : '';

        return `
            <div class="player-chip ${hostClass} ${statusClass}">
                <div class="player-avatar">${player.name[0].toUpperCase()}</div>
                <div class="player-info">
                    <span class="player-name">${player.name}${isCurrentPlayer}</span>
                    <span class="player-status-text">${statusText}</span>
                </div>
                ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
                <span class="player-status-badge ${statusBadgeClass}">${statusBadgeText}</span>
            </div>
        `;
    }).join('');

    document.getElementById('player-count').textContent = multiplayerState.players.length;
    document.getElementById('completed-count').textContent = completedCount;
}

function updateGameDeadline() {
    const remaining = multiplayerState.gameEndTime - Date.now();
    if (remaining <= 0) {
        document.getElementById('game-deadline').textContent = 'EXPIRED';
        return;
    }

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

    document.getElementById('game-deadline').textContent =
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Copy buttons
document.getElementById('copy-code-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(multiplayerState.gameCode);
    showCopyFeedback('Game code copied!');
});

document.getElementById('copy-link-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('invite-link').value);
    showCopyFeedback('Invite link copied!');
});

function showCopyFeedback(message) {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a365d;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
        animation: fadeInUp 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Send invite
document.getElementById('send-invite-btn').addEventListener('click', () => {
    const contact = document.getElementById('invite-contact').value.trim();
    if (!contact) {
        alert('Please enter an email or phone number');
        return;
    }

    const inviteLink = `${window.location.origin}${window.location.pathname}?join=${multiplayerState.gameCode}`;
    const message = `Join me for a game of LDG (The Long Dunn Game)!\n\nGame Code: ${multiplayerState.gameCode}\n\nJoin here: ${inviteLink}`;

    // Check if it looks like a phone number
    if (/^\+?[\d\s-()]+$/.test(contact)) {
        // Open SMS
        window.open(`sms:${contact}?body=${encodeURIComponent(message)}`);
    } else if (contact.includes('@')) {
        // Open email
        window.open(`mailto:${contact}?subject=Join my LDG Game!&body=${encodeURIComponent(message)}`);
    } else {
        alert(`Share this with ${contact}:\n\n${message}`);
    }

    document.getElementById('invite-contact').value = '';
});

// Start multiplayer game
document.getElementById('start-mp-game-btn').addEventListener('click', startMultiplayerGame);

function startMultiplayerGame() {
    // Check if player already submitted
    const currentPlayer = multiplayerState.players.find(p => p.name === multiplayerState.playerName);
    if (currentPlayer && currentPlayer.submitted) {
        alert('You have already submitted your answers for this game.');
        showSubmittedScreen();
        return;
    }

    document.getElementById('multiplayer-waiting').classList.add('hidden');
    document.getElementById('multiplayer-game').classList.remove('hidden');

    // Use the game's predetermined letter
    gameState.currentLetter = multiplayerState.currentLetter;
    document.getElementById('mp-game-letter').textContent = gameState.currentLetter;

    // Update player count display
    const totalPlayers = multiplayerState.players.length;
    const submittedCount = multiplayerState.players.filter(p => p.submitted).length;
    document.getElementById('players-submitted').textContent = `${submittedCount}/${totalPlayers}`;

    // Update placeholders
    document.querySelectorAll('#mp-game-form input').forEach(input => {
        const label = input.previousElementSibling.textContent;
        input.placeholder = `Enter a ${label.toLowerCase()} starting with "${gameState.currentLetter}"...`;
    });

    // Start timer
    const displayMinutes = document.getElementById('mp-timer-minutes');
    const displaySeconds = document.getElementById('mp-timer-seconds');
    const progressCircle = document.getElementById('mp-timer-progress');

    startTimer(displayMinutes, displaySeconds, progressCircle, submitMultiplayerGame, true);

    // Start music
    startMusic();
    document.getElementById('mp-music-toggle').classList.remove('muted');

    // Focus first input
    document.getElementById('mp-town').focus();
}

// Real-time validation for multiplayer
document.querySelectorAll('#mp-game-form input').forEach(input => {
    input.addEventListener('input', function() {
        validateInput(this, gameState.currentLetter);
    });
});

document.getElementById('mp-game-form').addEventListener('submit', function(e) {
    e.preventDefault();
    submitMultiplayerGame();
});

async function submitMultiplayerGame() {
    stopTimer();
    stopMusic();

    // Disable all inputs
    document.querySelectorAll('#mp-game-form input').forEach(input => {
        input.disabled = true;
    });

    // Collect answers
    const answers = {};
    CATEGORIES.forEach(cat => {
        const input = document.getElementById('mp-' + cat.id);
        answers[cat.id] = input.value.trim().toLowerCase();
    });

    try {
        // Save answers to Firebase
        await database.ref('games/' + multiplayerState.gameCode + '/answers/' + multiplayerState.playerName).set(answers);

        // Mark player as submitted
        await database.ref('games/' + multiplayerState.gameCode + '/players/' + multiplayerState.playerId + '/submitted').set(true);

        console.log('Answers submitted successfully');
        showSubmittedScreen();
    } catch (error) {
        console.error('Error submitting answers:', error);
        alert('Failed to submit answers. Please try again.');
    }
}

function showSubmittedScreen() {
    document.getElementById('multiplayer-game').classList.add('hidden');
    document.getElementById('multiplayer-submitted').classList.remove('hidden');

    updatePlayerStatusList();
    updateResultsCountdown();
    checkAllSubmitted();
}

function updatePlayerStatusList() {
    const statusList = document.getElementById('player-status-list');
    const completedCount = multiplayerState.players.filter(p => p.submitted).length;
    const totalPlayers = multiplayerState.players.length;

    statusList.innerHTML = `
        <div class="status-summary">
            <strong>${completedCount} of ${totalPlayers}</strong> players have completed their turn
        </div>
        ${multiplayerState.players.map(player => {
            const isCurrentPlayer = player.name === multiplayerState.playerName ? ' (You)' : '';
            return `
                <div class="player-status-item ${player.submitted ? 'completed' : ''}">
                    <div class="player-status-left">
                        <div class="player-avatar-small">${player.name[0].toUpperCase()}</div>
                        <span class="player-name">${player.name}${isCurrentPlayer}</span>
                    </div>
                    <span class="status-badge ${player.submitted ? 'submitted' : 'pending'}">
                        ${player.submitted ? '✓ Completed' : 'Waiting...'}
                    </span>
                </div>
            `;
        }).join('')}
    `;
}

function updateResultsCountdown() {
    const countdownEl = document.getElementById('results-countdown');

    const updateCountdown = () => {
        const remaining = multiplayerState.gameEndTime - Date.now();
        if (remaining <= 0) {
            countdownEl.textContent = '00:00:00';
            return;
        }

        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

        countdownEl.textContent =
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function checkAllSubmitted() {
    const allSubmitted = multiplayerState.players.length > 0 &&
                         multiplayerState.players.every(p => p.submitted);

    if (allSubmitted) {
        multiplayerState.allSubmitted = true;
        document.getElementById('view-results-btn').classList.remove('hidden');
    }
}

document.getElementById('view-results-btn').addEventListener('click', showAnswerReview);

// =============================================
// Answer Review Functions
// =============================================

function showAnswerReview() {
    document.getElementById('multiplayer-submitted').classList.add('hidden');
    document.getElementById('multiplayer-review').classList.remove('hidden');

    if (multiplayerState.isHost) {
        showHostReview();
    } else {
        showNonHostReview();
    }
}

function showHostReview() {
    // Reset challenged answers
    multiplayerState.challengedAnswers = {};

    // Build review HTML
    let reviewHTML = CATEGORIES.map(cat => {
        const answersForCategory = [];

        Object.entries(multiplayerState.playerAnswers).forEach(([playerName, answers]) => {
            const answer = answers[cat.id];
            if (answer && answer.trim() !== '') {
                const startsWithLetter = answer.toUpperCase().startsWith(multiplayerState.currentLetter);
                answersForCategory.push({
                    player: playerName,
                    answer: answer,
                    valid: startsWithLetter,
                    key: `${cat.id}-${playerName}`
                });
            }
        });

        if (answersForCategory.length === 0) {
            return `
                <div class="review-category">
                    <h4>${cat.name}</h4>
                    <p style="color: #718096; font-style: italic;">No answers submitted</p>
                </div>
            `;
        }

        return `
            <div class="review-category">
                <h4>${cat.name}</h4>
                <div class="review-answers">
                    ${answersForCategory.map(a => `
                        <div class="review-answer-item ${a.valid ? 'accepted' : 'challenged'}" data-key="${a.key}" data-valid="${a.valid}">
                            <div class="review-answer-info">
                                <span class="review-answer-text">${a.answer}</span>
                                <span class="review-answer-player">— ${a.player}</span>
                                ${!a.valid ? '<span style="color: var(--error-color); font-size: 0.85rem;">(wrong letter)</span>' : ''}
                                <span class="suggestion-badge hidden" id="suggestion-${a.key}"></span>
                            </div>
                            <div class="review-answer-actions">
                                <button class="review-btn accept ${a.valid ? 'active' : ''}" onclick="acceptAnswer('${a.key}', this)">✓ Valid</button>
                                <button class="review-btn challenge ${!a.valid ? 'active' : ''}" onclick="challengeAnswer('${a.key}', this)">✗ Invalid</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('multiplayer-review').innerHTML = `
        <div class="review-container">
            <div class="review-header">
                <h2>Review Answers</h2>
                <p>Letter: <strong>${multiplayerState.currentLetter}</strong></p>
            </div>

            <div class="review-instructions">
                <p>As the host, review all answers below. Mark any incorrect answers (misspellings, wrong category, doesn't exist) as <strong>Invalid</strong>. Other players can suggest answers to flag. When you're satisfied, confirm the results.</p>
            </div>

            ${reviewHTML}

            <div id="challenged-summary" class="challenged-summary hidden">
                <p><span id="challenged-count">0</span> answer(s) marked as invalid</p>
            </div>

            <div class="review-buttons">
                <button class="confirm-results-button" onclick="confirmAndShowResults()">Confirm Results</button>
                <button class="home-button" onclick="window.goToHome()">Back to Home</button>
            </div>
        </div>
    `;

    // Initialize challenged answers for those that don't start with the right letter
    document.querySelectorAll('.review-answer-item').forEach(item => {
        const key = item.dataset.key;
        const valid = item.dataset.valid === 'true';
        if (!valid) {
            multiplayerState.challengedAnswers[key] = true;
        }
    });

    updateChallengedSummary();

    // Listen for suggestions from other players
    startSuggestionsListener();
}

function showNonHostReview() {
    // Build read-only review HTML with suggest buttons
    let reviewHTML = CATEGORIES.map(cat => {
        const answersForCategory = [];

        Object.entries(multiplayerState.playerAnswers).forEach(([playerName, answers]) => {
            const answer = answers[cat.id];
            if (answer && answer.trim() !== '') {
                const startsWithLetter = answer.toUpperCase().startsWith(multiplayerState.currentLetter);
                answersForCategory.push({
                    player: playerName,
                    answer: answer,
                    valid: startsWithLetter,
                    key: `${cat.id}-${playerName}`
                });
            }
        });

        if (answersForCategory.length === 0) {
            return `
                <div class="review-category">
                    <h4>${cat.name}</h4>
                    <p style="color: #718096; font-style: italic;">No answers submitted</p>
                </div>
            `;
        }

        return `
            <div class="review-category">
                <h4>${cat.name}</h4>
                <div class="review-answers">
                    ${answersForCategory.map(a => `
                        <div class="review-answer-item ${a.valid ? 'accepted' : 'challenged'}" data-key="${a.key}">
                            <div class="review-answer-info">
                                <span class="review-answer-text">${a.answer}</span>
                                <span class="review-answer-player">— ${a.player}</span>
                                ${!a.valid ? '<span style="color: var(--error-color); font-size: 0.85rem;">(wrong letter)</span>' : ''}
                            </div>
                            <div class="review-answer-actions">
                                <button class="suggest-invalid-btn" onclick="suggestInvalid('${a.key}', this)">Flag as Invalid</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('multiplayer-review').innerHTML = `
        <div class="review-container">
            <div class="review-header">
                <h2>Review Answers</h2>
                <p>Letter: <strong>${multiplayerState.currentLetter}</strong></p>
            </div>

            <div class="review-instructions">
                <p>Review the answers below. You can <strong>flag</strong> any answers you believe are invalid — the host will see your suggestions and make the final decision.</p>
            </div>

            ${reviewHTML}

            <div class="waiting-for-host">
                <span class="spinner"></span>
                Waiting for the host to confirm results...
            </div>

            <div class="review-buttons">
                <button class="home-button" onclick="window.goToHome()">Back to Home</button>
            </div>
        </div>
    `;

    // Listen for host confirming results
    startResultsReadyListener();
}

function suggestInvalid(key, button) {
    button.classList.toggle('active');
    const suggesting = button.classList.contains('active');

    if (suggesting) {
        button.textContent = 'Flagged';
        // Write suggestion to Firebase
        database.ref('games/' + multiplayerState.gameCode + '/suggestions/' + key + '/' + multiplayerState.playerId).set(multiplayerState.playerName);
    } else {
        button.textContent = 'Flag as Invalid';
        // Remove suggestion from Firebase
        database.ref('games/' + multiplayerState.gameCode + '/suggestions/' + key + '/' + multiplayerState.playerId).remove();
    }
}

function startSuggestionsListener() {
    const suggestionsRef = database.ref('games/' + multiplayerState.gameCode + '/suggestions');
    suggestionsRef.on('value', (snapshot) => {
        const suggestions = snapshot.val() || {};

        // Update badges on each answer
        Object.entries(suggestions).forEach(([key, flaggers]) => {
            const count = Object.keys(flaggers).length;
            const badge = document.getElementById('suggestion-' + key);
            if (badge) {
                badge.textContent = `${count} player${count > 1 ? 's' : ''} flagged`;
                badge.classList.remove('hidden');
            }
        });

        // Hide badges for answers with no suggestions
        document.querySelectorAll('.suggestion-badge').forEach(badge => {
            const key = badge.id.replace('suggestion-', '');
            if (!suggestions[key] || Object.keys(suggestions[key]).length === 0) {
                badge.classList.add('hidden');
            }
        });
    });

    // Store reference so we can clean up
    if (!multiplayerState._suggestionsListener) {
        multiplayerState._suggestionsListener = suggestionsRef;
    }
}

function startResultsReadyListener() {
    const resultsRef = database.ref('games/' + multiplayerState.gameCode + '/resultsReady');
    const listener = resultsRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            // Host has confirmed — load final challenged answers and show results
            database.ref('games/' + multiplayerState.gameCode + '/finalChallengedAnswers').once('value').then((snap) => {
                multiplayerState.challengedAnswers = snap.val() || {};
                document.getElementById('multiplayer-review').classList.add('hidden');
                showMultiplayerResults();
            });
            // Stop listening
            resultsRef.off('value', listener);
        }
    });
}

function acceptAnswer(key, button) {
    const item = button.closest('.review-answer-item');
    item.classList.remove('challenged');
    item.classList.add('accepted');

    // Update button states
    item.querySelector('.review-btn.accept').classList.add('active');
    item.querySelector('.review-btn.challenge').classList.remove('active');

    // Remove from challenged
    delete multiplayerState.challengedAnswers[key];
    updateChallengedSummary();
}

function challengeAnswer(key, button) {
    const item = button.closest('.review-answer-item');
    item.classList.remove('accepted');
    item.classList.add('challenged');

    // Update button states
    item.querySelector('.review-btn.challenge').classList.add('active');
    item.querySelector('.review-btn.accept').classList.remove('active');

    // Add to challenged
    multiplayerState.challengedAnswers[key] = true;
    updateChallengedSummary();
}

function updateChallengedSummary() {
    const count = Object.keys(multiplayerState.challengedAnswers).length;
    const summary = document.getElementById('challenged-summary');
    const countEl = document.getElementById('challenged-count');

    if (count > 0) {
        summary.classList.remove('hidden');
        countEl.textContent = count;
    } else {
        summary.classList.add('hidden');
    }
}

async function confirmAndShowResults() {
    // Store final challenged answers and mark results as ready in Firebase
    try {
        await database.ref('games/' + multiplayerState.gameCode + '/finalChallengedAnswers').set(multiplayerState.challengedAnswers);
        await database.ref('games/' + multiplayerState.gameCode + '/resultsReady').set(true);
    } catch (error) {
        console.error('Error saving results:', error);
    }

    // Clean up suggestions listener
    if (multiplayerState._suggestionsListener) {
        multiplayerState._suggestionsListener.off();
        multiplayerState._suggestionsListener = null;
    }

    document.getElementById('multiplayer-review').classList.add('hidden');
    showMultiplayerResults();

    // Clear session since game is complete
    clearGameSession();
}

// Make review functions globally available
window.acceptAnswer = acceptAnswer;
window.challengeAnswer = challengeAnswer;
window.confirmAndShowResults = confirmAndShowResults;
window.suggestInvalid = suggestInvalid;

function showMultiplayerResults() {
    document.getElementById('multiplayer-submitted').classList.add('hidden');
    document.getElementById('multiplayer-results').classList.remove('hidden');

    // Calculate scores
    const scores = calculateMultiplayerScores();

    // Sort players by score
    const sortedPlayers = [...multiplayerState.players].sort((a, b) => {
        const scoreA = scores[a.name] || 0;
        const scoreB = scores[b.name] || 0;
        return scoreB - scoreA;
    });

    const winner = sortedPlayers[0];
    const winnerScore = scores[winner.name] || 0;

    // Build leaderboard HTML
    let leaderboardHTML = sortedPlayers.map((player, index) => {
        const rank = index + 1;
        let rankDisplay = rank;
        let rankClass = '';

        if (rank === 1) {
            rankDisplay = '<span class="rank-medal">🥇</span>';
            rankClass = 'first';
        } else if (rank === 2) {
            rankDisplay = '<span class="rank-medal">🥈</span>';
            rankClass = 'second';
        } else if (rank === 3) {
            rankDisplay = '<span class="rank-medal">🥉</span>';
            rankClass = 'third';
        }

        const isCurrentPlayer = player.name === multiplayerState.playerName ? ' (You)' : '';

        return `
            <div class="leaderboard-row ${rankClass}">
                <div class="rank">${rankDisplay}</div>
                <div class="leaderboard-player">
                    <div class="player-avatar">${player.name[0].toUpperCase()}</div>
                    <span class="player-name">${player.name}${isCurrentPlayer}</span>
                </div>
                <div class="leaderboard-score">${scores[player.name] || 0}</div>
            </div>
        `;
    }).join('');

    // Build answers detail HTML
    let answersDetailHTML = CATEGORIES.map(cat => {
        const answersForCategory = [];

        Object.entries(multiplayerState.playerAnswers).forEach(([playerName, answers]) => {
            const answer = answers[cat.id];
            if (answer && answer.trim() !== '') {
                const challengeKey = `${cat.id}-${playerName}`;
                const isChallenged = multiplayerState.challengedAnswers[challengeKey];
                const startsWithLetter = answer.toUpperCase().startsWith(multiplayerState.currentLetter);

                answersForCategory.push({
                    player: playerName,
                    answer: answer,
                    points: getPointsForAnswer(answer, cat.id, playerName),
                    challenged: isChallenged,
                    valid: startsWithLetter && !isChallenged
                });
            }
        });

        if (answersForCategory.length === 0) {
            return `
                <div class="category-answers">
                    <h4>${cat.name}</h4>
                    <p style="color: #718096; font-style: italic;">No answers submitted</p>
                </div>
            `;
        }

        return `
            <div class="category-answers">
                <h4>${cat.name}</h4>
                <div class="answers-row">
                    ${answersForCategory.map(a => `
                        <div class="answer-chip ${a.challenged ? 'challenged-answer' : ''}">
                            <span ${a.challenged ? 'style="text-decoration: line-through; opacity: 0.6;"' : ''}>${a.answer}</span>
                            <span class="answer-player">${a.player}</span>
                            ${a.challenged
                                ? '<span class="answer-points invalid">Invalid</span>'
                                : `<span class="answer-points">+${a.points}</span>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('multiplayer-results').innerHTML = `
        <div class="leaderboard-container">
            <div class="leaderboard-header">
                <h2>Final Results</h2>
                <p>Letter: <strong>${multiplayerState.currentLetter}</strong></p>

                <div class="winner-announcement">
                    <div class="winner-card">
                        <div class="winner-trophy">🏆</div>
                        <div class="winner-name">${winner.name}</div>
                        <div class="winner-score">${winnerScore} points</div>
                    </div>
                </div>
            </div>

            <div class="leaderboard-table">
                ${leaderboardHTML}
            </div>

            <div class="answers-detail">
                <h3>All Answers</h3>
                ${answersDetailHTML}
            </div>

            <div class="results-buttons">
                <button class="play-again-button" onclick="resetMultiplayerState(); showPage('multiplayer');">Play Again</button>
                <button class="home-button" onclick="window.goToHome()">Back to Home</button>
            </div>
        </div>
    `;

    // Show celebration for winner
    if (winnerScore > 0) {
        setTimeout(() => showCelebration(winnerScore, winner.name), 500);
    }

    // Clear session since game is complete
    clearGameSession();
}

function calculateMultiplayerScores() {
    const scores = {};

    // Initialize scores
    multiplayerState.players.forEach(player => {
        scores[player.name] = 0;
    });

    // Calculate points for each category
    CATEGORIES.forEach(cat => {
        const answersMap = {};

        // Group answers (only valid, non-challenged answers)
        Object.entries(multiplayerState.playerAnswers).forEach(([playerName, answers]) => {
            const answer = answers[cat.id];
            const challengeKey = `${cat.id}-${playerName}`;

            // Skip if answer is challenged/invalid
            if (multiplayerState.challengedAnswers[challengeKey]) {
                return;
            }

            if (answer && answer.toUpperCase().startsWith(multiplayerState.currentLetter)) {
                const normalizedAnswer = answer.toLowerCase().trim();
                if (!answersMap[normalizedAnswer]) {
                    answersMap[normalizedAnswer] = [];
                }
                answersMap[normalizedAnswer].push(playerName);
            }
        });

        // Calculate points based on uniqueness
        Object.entries(answersMap).forEach(([answer, players]) => {
            const points = Math.max(1, 11 - players.length); // Unique = 10, 2 same = 9, etc.
            players.forEach(playerName => {
                scores[playerName] += points;
            });
        });
    });

    return scores;
}

function getPointsForAnswer(answer, categoryId, playerName) {
    // Check if this specific answer was challenged
    const challengeKey = `${categoryId}-${playerName}`;
    if (multiplayerState.challengedAnswers[challengeKey]) {
        return 0;
    }

    const answersMap = {};

    Object.entries(multiplayerState.playerAnswers).forEach(([pName, answers]) => {
        const catAnswer = answers[categoryId];
        const pChallengeKey = `${categoryId}-${pName}`;

        // Skip challenged answers
        if (multiplayerState.challengedAnswers[pChallengeKey]) {
            return;
        }

        if (catAnswer && catAnswer.toUpperCase().startsWith(multiplayerState.currentLetter)) {
            const normalized = catAnswer.toLowerCase().trim();
            if (!answersMap[normalized]) {
                answersMap[normalized] = 0;
            }
            answersMap[normalized]++;
        }
    });

    const normalized = answer.toLowerCase().trim();
    const count = answersMap[normalized] || 1;
    return Math.max(1, 11 - count);
}

// =============================================
// End Game Helper
// =============================================

function endGame() {
    stopTimer();
    stopMusic();
    gameState.isGameActive = false;
}

// =============================================
// URL Parameter Handling (for join links)
// =============================================

function checkForJoinLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');

    if (joinCode) {
        showPage('multiplayer');
        document.getElementById('game-code').value = joinCode.toUpperCase();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkForJoinLink();
    checkForActiveSession();

    // Event delegation for dynamically created buttons
    document.body.addEventListener('click', (e) => {
        // Handle home button clicks
        if (e.target.classList.contains('home-button') || e.target.closest('.home-button')) {
            e.preventDefault();
            goToHome();
        }

        // Handle play again button clicks in results
        if (e.target.classList.contains('play-again-button') || e.target.closest('.play-again-button')) {
            const button = e.target.classList.contains('play-again-button') ? e.target : e.target.closest('.play-again-button');
            // Check if it's in multiplayer results
            if (button.closest('#multiplayer-results') || button.closest('#multiplayer-review')) {
                e.preventDefault();
                resetMultiplayerState();
                showPage('multiplayer');
            }
        }
    });
});

// Global goToHome function
function goToHome() {
    console.log('Going to home...');
    stopTimer();
    stopMusic();
    cleanupMultiplayerListeners();
    gameState.isGameActive = false;

    // Close celebration overlay if open
    const celebrationOverlay = document.getElementById('celebration-overlay');
    if (celebrationOverlay) {
        celebrationOverlay.classList.remove('active');
        celebrationOverlay.classList.add('hidden');
    }

    // Reset all multiplayer screens
    const mpLobby = document.getElementById('multiplayer-lobby');
    const mpWaiting = document.getElementById('multiplayer-waiting');
    const mpGame = document.getElementById('multiplayer-game');
    const mpSubmitted = document.getElementById('multiplayer-submitted');
    const mpReview = document.getElementById('multiplayer-review');
    const mpResults = document.getElementById('multiplayer-results');

    if (mpLobby) mpLobby.classList.remove('hidden');
    if (mpWaiting) mpWaiting.classList.add('hidden');
    if (mpGame) mpGame.classList.add('hidden');
    if (mpSubmitted) mpSubmitted.classList.add('hidden');
    if (mpReview) mpReview.classList.add('hidden');
    if (mpResults) mpResults.classList.add('hidden');

    // Reset individual screens
    const indIntro = document.getElementById('individual-intro');
    const indGame = document.getElementById('individual-game');
    const indResults = document.getElementById('individual-results');

    if (indIntro) indIntro.classList.remove('hidden');
    if (indGame) indGame.classList.add('hidden');
    if (indResults) indResults.classList.add('hidden');

    // Reset multiplayer state
    multiplayerState.challengedAnswers = {};

    // Reset multiplayer forms
    const hostName = document.getElementById('host-name');
    const joinName = document.getElementById('join-name');
    const gameCode = document.getElementById('game-code');
    if (hostName) hostName.value = '';
    if (joinName) joinName.value = '';
    if (gameCode) gameCode.value = '';

    // Reset individual game form
    const gameForm = document.getElementById('game-form');
    if (gameForm) {
        gameForm.reset();
        gameForm.querySelectorAll('input').forEach(input => {
            input.classList.remove('valid', 'invalid');
            input.disabled = false;
        });
    }

    // Reset multiplayer game form
    const mpGameForm = document.getElementById('mp-game-form');
    if (mpGameForm) {
        mpGameForm.reset();
        mpGameForm.querySelectorAll('input').forEach(input => {
            input.classList.remove('valid', 'invalid');
            input.disabled = false;
        });
    }

    showPage('landing');

    // Check for active session to show rejoin/results banner
    checkForActiveSession();
}

// Make functions available globally
window.showPage = showPage;
window.resetIndividualGame = resetIndividualGame;
window.resetMultiplayerState = resetMultiplayerState;
window.goToHome = goToHome;

// Add CSS for toast animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translate(-50%, 20px);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }
`;
document.head.appendChild(style);
