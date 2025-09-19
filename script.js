// Export the game class for use in other modules
export class MultiplayerIfIWereGame {
    constructor() {
        // Initialize Firebase first
        this.initFirebase();
        
        this.gameState = {
            phase: 'initial-setup',
            roomCode: null,
            isHost: false,
            playerName: '',
            maxPlayers: 2,
            players: [],
            currentAnswerer: 0,
            currentGuesser: 0,
            currentTarget: 0,
            playerAnswers: {},
            scores: {},
            guesses: {},
            reveal: null, // { target, answers, scores, until }
            gameStarted: false
        };
        
        this.questions = [
            { id: 'q1', text: 'If I were a sound effect, I\'d be:', options: ['Ka-ching!', 'Dramatic gasp', 'Boing!', 'Evil laugh'] },
            { id: 'q2', text: 'If I were a weather forecast, I\'d be:', options: ['100% chill', 'Partly dramatic with a chance of chaos!', 'Heatwave vibes', 'Sudden tornado of opinions'] },
            { id: 'q3', text: 'If I were a breakfast cereal, I\'d be:', options: ['Jungle Oats', 'WeetBix', 'Rice Krispies', 'MorVite', 'That weird healthy one no-one eats'] },
            { id: 'q4', text: 'If I were a bedtime excuse, I\'d be...', options: [
                'I need water',
                "There\'s a spider in my room",
                "I can\'t sleep without \"Pillow\"",
                'There see shadows outside my window',
                'Just one more episode'
            ] },
            { id: 'q5', text: 'If I were a villain in a movie, I\'d be...', options: [
                'Scarlet Overkill',
                'Grinch',
                'Thanos',
                'A mosquito in your room at night',
                'Darth Vader'
            ] },
            { id: 'q6', text: 'If I were a kitchen appliance, I\'d be...', options: [
                'A blender on high speed with no lid',
                'A toaster that only pops when no one’s looking',
                'Microwave that screams when it’s done',
                'A fridge that judges your snack choices'
            ] },
            { id: 'q7', text: 'If I were a dance move, I\'d be...', options: [
                'The awkward shuffle at weddings',
                'Kwasakwasa, Ba-baah!',
                'The “I thought no one was watching” move',
                'The knee-pop followed by a regretful sit-down'
            ] },
            { id: 'q8', text: 'If I were a text message, I\'d be...', options: [
                'A typo-ridden voice-to-text disaster',
                'A three-hour late “LOL”',
                'A group chat gif spammer',
                'A mysterious “K.” with no context'
            ] },
            { id: 'q9', text: 'If I were a warning label, I\'d be...', options: [
                'Caution: May spontaneously break into song',
                'Contents may cause uncontrollable giggles',
                'Qaphela: Gevaar/Ingozi',
                'Warning: Will talk your ear off about random facts',
                'May contain traces of impulsive decisions'
            ] },
            { id: 'q10', text: 'If I were a type of chair, I’d be…', options: [
                'A Phala Phala sofa',
                'A creaky antique that screams when you sit',
                'One of those folding chairs that attack your fingers',
                'A throne made of regrets and snack crumbs'
            ] }
        ];
        
        this.gameRef = null;
        this.initializeEventListeners();
    }

    initFirebase() {
        try {
            // Import Firebase modules
            import('./firebase-config.js').then(firebaseModule => {
                // Store database methods for later use
                this.database = firebaseModule.database;
                this.firebaseRef = firebaseModule.ref;
                this.firebaseOnValue = firebaseModule.onValue;
                this.firebaseSet = firebaseModule.set;
                this.firebaseGet = firebaseModule.get;
                this.firebaseUpdate = firebaseModule.update;
                this.firebaseRemove = firebaseModule.remove;
                this.firebaseOnDisconnect = firebaseModule.onDisconnect;
                
                this.firebaseReady = true;
                console.log('Firebase initialized successfully');
                
                // Test Firebase connection if we have a room code
                if (this.gameState.roomCode) {
                    const connectedRef = this.firebaseRef(this.database, '.info/connected');
                    this.firebaseOnValue(connectedRef, (snapshot) => {
                        if (snapshot.val() === true) {
                            console.log('✅ Firebase connected');
                            // Re-setup game listener if we were disconnected
                            if (this.gameState.roomCode) {
                                this.setupGameListener();
                            }
                        } else {
                            console.log('❌ Firebase disconnected');
                        }
                    });
                }
                
                // Initialize the game if we're in the setup phase
                if (this.gameState.phase === 'initial-setup') {
                    this.initializeEventListeners();
                }
            }).catch(error => {
                console.error('Failed to load Firebase modules:', error);
                this.firebaseReady = false;
            });
        } catch (error) {
            console.warn('Firebase initialization failed, using localStorage fallback:', error);
            this.firebaseReady = false;
        }
    }

    // Schedule auto-advance (host only) when reveal is active. Idempotent per round.
    scheduleAutoAdvanceIfHost() {
        if (!this.gameState.isHost || !this.gameState.reveal) return;
        const key = `${this.gameState.roomCode}-${this.gameState.currentTarget}-${this.gameState.reveal.until}`;
        if (this._advanceKey === key) return; // already scheduled for this round
        this._advanceKey = key;
        const delay = Math.max(0, this.gameState.reveal.until - Date.now());
        if (this._advanceTimer) clearTimeout(this._advanceTimer);
        this._advanceTimer = setTimeout(() => {
            this.advanceToNextRound();
        }, delay);
    }

    initializeEventListeners() {
        // Initial setup
        document.getElementById('create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room').addEventListener('click', () => this.joinRoom());
        
        // Waiting room
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('copy-code').addEventListener('click', () => this.copyRoomCode());
        
        // Game phases
        document.getElementById('submit-answers').addEventListener('click', () => this.submitAnswers());
        document.getElementById('submit-guesses').addEventListener('click', () => this.submitGuesses());
        const continueBtn = document.getElementById('continue-reveal');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.advanceToNextRound());
        }
        
        // Results
        document.getElementById('play-again').addEventListener('click', () => this.playAgain());
        document.getElementById('leave-game').addEventListener('click', () => this.leaveGame());
        const copyBtn = document.getElementById('copy-summary');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyWinnerSummary());
        const muteToggle = document.getElementById('mute-celebrations');
        if (muteToggle) {
            // Load persisted setting
            const persisted = localStorage.getItem('mute_celebrations');
            if (persisted !== null) muteToggle.checked = persisted === 'true';
            muteToggle.addEventListener('change', () => {
                localStorage.setItem('mute_celebrations', String(muteToggle.checked));
            });
        }
        
        // Error handling
        document.getElementById('close-error').addEventListener('click', () => this.closeError());
    }

    generateRoomCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async createRoom() {
        const hostName = document.getElementById('host-name').value.trim();
        const playerCount = parseInt(document.getElementById('player-count').value);
        
        if (!hostName) {
            this.showError('Please enter your name');
            return;
        }
        
        this.gameState.roomCode = this.generateRoomCode();
        this.gameState.isHost = true;
        this.gameState.playerName = hostName;
        this.gameState.maxPlayers = playerCount;
        this.gameState.players = [{ name: hostName, isHost: true }];
        this.gameState.scores = { [hostName]: 0 };
        // Ensure the game is in waiting-room phase so host UI updates on player joins
        this.gameState.phase = 'waiting-room';
        
        await this.saveGameState();
        this.showWaitingRoom();
        this.setupGameListener();
        this.showGameInstructions();
    }

    showGameInstructions() {
        const instructions = `
🎮 GAME CREATED SUCCESSFULLY!

📋 Room Code: ${this.gameState.roomCode}

📱 SHARE WITH PLAYERS:
Just give them the room code: ${this.gameState.roomCode}

📝 INSTRUCTIONS FOR PLAYERS:
1. Go to the same website
2. Enter room code: ${this.gameState.roomCode}
3. Enter their name
4. Click "Join Game"

✅ Works across all devices!
        `;
        
        alert(instructions);
    }

    async joinRoom() {
        const roomCode = document.getElementById('room-code').value.trim();
        const playerName = document.getElementById('player-name').value.trim();
        
        if (!roomCode || roomCode.length !== 6) {
            this.showError('Please enter a valid 6-digit room code');
            return;
        }
        
        if (!playerName) {
            this.showError('Please enter your name');
            return;
        }
        
        try {
            const existingState = await this.loadGameState(roomCode);
            
            if (!existingState) {
                this.showError(`Room ${roomCode} not found. Make sure:\n1. The room code is correct\n2. The host has created the room`);
                return;
            }
            
            // Check if room is full
            if (existingState.players.length >= existingState.maxPlayers) {
                this.showError('This room is full');
                return;
            }
            
            // Check if name is already taken
            if (existingState.players.some(p => p.name === playerName)) {
                this.showError('This name is already taken. Please choose a different name.');
                return;
            }
            
            // Join the room
            this.gameState = existingState;
            this.gameState.playerName = playerName;
            this.gameState.isHost = false;
            this.gameState.players.push({ name: playerName, isHost: false });
            this.gameState.scores[playerName] = 0;
            // Normalize phase to waiting-room so all clients update UI consistently
            this.gameState.phase = 'waiting-room';
            
            await this.saveGameState();
            this.setupGameListener();
            this.showWaitingRoom();
            
        } catch (error) {
            this.showError(`Failed to join room: ${error.message}`);
        }
    }

    setupGameListener() {
        if (!this.firebaseReady || !this.gameState.roomCode) {
            console.log('⚠️ Firebase not ready or no room code, setting up polling fallback');
            this.setupPollingFallback();
            return;
        }
        
        // Create a reference to the game in Firebase
        this.gameRef = this.firebaseRef(this.database, `games/${this.gameState.roomCode}`);
        
        // Store the unsubscribe function
        this.unsubscribe = this.firebaseOnValue(this.gameRef, (snapshot) => {
            const newState = snapshot.val();
            console.log('🔥 Firebase update received:', newState);
            
            if (newState) {
                const oldPlayerCount = this.gameState.players.length;
                
                // CRITICAL: Don't skip updates for host - they need to see player joins too
                console.log('🔄 Updating game state for:', this.gameState.isHost ? 'HOST' : 'PLAYER');
                
                // Update game state for both host and players
                this.gameState.players = newState.players || this.gameState.players;
                this.gameState.playerAnswers = newState.playerAnswers || {};
                this.gameState.phase = newState.phase || this.gameState.phase;
                this.gameState.maxPlayers = newState.maxPlayers || this.gameState.maxPlayers;
                this.gameState.reveal = newState.reveal || null;
                this.gameState.guesses = newState.guesses || this.gameState.guesses || {};
                if (typeof newState.currentTarget === 'number') this.gameState.currentTarget = newState.currentTarget;
                if (newState.scores) this.gameState.scores = newState.scores;
                
                console.log(`👥 Player count: ${oldPlayerCount} -> ${this.gameState.players.length}`);
                console.log('👑 Is host:', this.gameState.isHost);
                console.log('📋 Current players:', this.gameState.players.map(p => p.name));
                
                // Update UI based on current phase - ALWAYS update for everyone
                if (this.gameState.phase === 'waiting-room') {
                    console.log('🏠 Updating waiting room UI');
                    this.updateWaitingRoom();
                } else if (this.gameState.phase === 'answering') {
                    // Important: switch to the Answer phase view first, then update its contents
                    console.log('📝 Switching to Answer phase (via listener)');
                    this.showAnswerPhase();
                } else if (this.gameState.phase === 'guessing') {
                    this.showGuessingPhase();
                    if (this.gameState.reveal) {
                        this.showRoundOverlay(this.gameState.reveal);
                        // Ensure host schedules auto-advance even if another player triggered the reveal
                        this.scheduleAutoAdvanceIfHost();
                    } else {
                        this.hideRoundOverlay();
                    }
                } else if (this.gameState.phase === 'results') {
                    this.hideRoundOverlay();
                    this.showResults();
                }
            } else {
                console.log('❌ No state received from Firebase');
            }
        });
        
        // Also set up polling as backup
        this.setupPollingFallback();
    }
    
    async setupPollingFallback() {
        // Poll for updates every 2 seconds as backup
        if (this.pollInterval) clearInterval(this.pollInterval);
        
        this.pollInterval = setInterval(async () => {
            if (this.gameState.roomCode && this.gameState.phase === 'waiting-room') {
                console.log('🔄 Polling for game state updates...');
                try {
                    const latestState = await this.loadGameState(this.gameState.roomCode);
                    if (latestState && latestState.players.length !== this.gameState.players.length) {
                        console.log('📊 Polling detected player count change');
                        this.gameState.players = latestState.players;
                        this.updateWaitingRoom();
                    }
                } catch (error) {
                    console.log('⚠️ Polling failed:', error);
                }
            }
        }, 2000);
    }

    showWaitingRoom() {
        this.showPhase('waiting-room');
        this.updateWaitingRoom();
        
        // Show appropriate controls based on host/player role
        const hostControls = document.getElementById('host-controls');
        const playerWaiting = document.getElementById('player-waiting');
        const roomCodeDisplay = document.getElementById('room-code-display');
        const playerList = document.getElementById('player-list');
        
        if (this.gameState.isHost) {
            if (hostControls) hostControls.style.display = 'block';
            if (playerWaiting) playerWaiting.style.display = 'none';
            
            // Set up the start game button
            const startGameBtn = document.getElementById('start-game');
            if (startGameBtn) {
                startGameBtn.disabled = this.gameState.players.length < 2;
                startGameBtn.onclick = () => this.startGame();
            }
        } else {
            if (hostControls) hostControls.style.display = 'none';
            if (playerWaiting) playerWaiting.style.display = 'block';
        }
        
        // Update room code display
        if (roomCodeDisplay && this.gameState.roomCode) {
            roomCodeDisplay.textContent = this.gameState.roomCode;
        }
        
        // Update player list
        if (playerList) {
            playerList.innerHTML = this.gameState.players
                .map(player => `
                    <div class="player-item">
                        <span class="player-name">${player.name}</span>
                        ${player.isHost ? '<span class="host-badge">👑</span>' : ''}
                    </div>
                `)
                .join('');
        }
        
        // Update player count
        const playerCount = document.getElementById('player-count-display');
        if (playerCount) {
            playerCount.textContent = `${this.gameState.players.length}/${this.gameState.maxPlayers} players`;
        }
        
        console.log('👥 Updated waiting room UI');
    }

    updateWaitingRoom() {
        // Update room code display
        const roomCodeElements = [
            document.getElementById('display-room-code'),
            document.getElementById('share-room-code'),
            document.getElementById('room-code-display')
        ];
        
        roomCodeElements.forEach(el => {
            if (el) el.textContent = this.gameState.roomCode || '------';
        });
        
        // Update player count
        const joinedCount = document.getElementById('joined-count');
        const totalCount = document.getElementById('total-count');
        const playerCountDisplay = document.getElementById('player-count-display');
        const playersNeeded = Math.max(0, 2 - this.gameState.players.length);
        
        if (joinedCount) joinedCount.textContent = this.gameState.players.length;
        if (totalCount) totalCount.textContent = this.gameState.maxPlayers;
        if (playerCountDisplay) {
            playerCountDisplay.textContent = `${this.gameState.players.length}/${this.gameState.maxPlayers} players`;
        }
        
        // Update progress bar if it exists
        const progressBar = document.getElementById('player-progress');
        if (progressBar) {
            const progress = (this.gameState.players.length / this.gameState.maxPlayers) * 100;
            progressBar.style.width = `${Math.min(100, progress)}%`;
        }
        
        // Update player list
        const playerList = document.getElementById('player-list');
        if (playerList) {
            playerList.innerHTML = this.gameState.players
                .map(player => `
                    <div class="player-item ${player.isHost ? 'host' : ''}">
                        <span class="player-name">${player.name}</span>
                        ${player.isHost ? '<span class="host-badge" title="Host">👑</span>' : ''}
                    </div>
                `)
                .join('');
        }
        
        // Update copy room code button
        const copyButton = document.getElementById('copy-room-code');
        if (copyButton) {
            copyButton.onclick = () => {
                navigator.clipboard.writeText(this.gameState.roomCode)
                    .then(() => {
                        const originalText = copyButton.textContent;
                        copyButton.textContent = 'Copied!';
                        copyButton.classList.add('copied');
                        setTimeout(() => {
                            copyButton.textContent = originalText;
                            copyButton.classList.remove('copied');
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy room code:', err);
                    });
            };
        }
        
        // Update share button if it exists
        const shareButton = document.getElementById('share-room');
        if (shareButton && navigator.share) {
            shareButton.style.display = 'inline-block';
            shareButton.onclick = () => {
                navigator.share({
                    title: 'Join my game!',
                    text: `Join my "If I Were..." game! Room code: ${this.gameState.roomCode}`,
                    url: window.location.href
                }).catch(err => {
                    console.log('Error sharing:', err);
                    // Fallback to copy to clipboard
                    navigator.clipboard.writeText(`Join my "If I Were..." game!\nRoom code: ${this.gameState.roomCode}\n${window.location.href}`)
                        .then(() => {
                            const originalText = shareButton.textContent;
                            shareButton.textContent = '✅ Link copied!';
                            setTimeout(() => {
                                shareButton.textContent = originalText;
                            }, 2000);
                        })
                        .catch(copyErr => {
                            console.error('Failed to copy room code:', copyErr);
                            // Last resort - show a prompt
                            prompt('Copy this link to share:', `${window.location.href}?room=${this.gameState.roomCode}`);
                        });
                });
            };
        }
        
        // Handle host-specific UI updates
        const startButton = document.getElementById('start-game');
        const hostNote = document.getElementById('host-note');
        
        if (this.gameState.isHost) {
            // Host-specific UI updates
            if (startButton) {
                const canStart = this.gameState.players.length >= 2 && 
                               this.gameState.players.length <= this.gameState.maxPlayers;
                
                startButton.disabled = !canStart;
                startButton.style.display = canStart ? 'block' : 'none';
                startButton.style.visibility = canStart ? 'visible' : 'hidden';
                
                // Update button text and host note based on player count
                if (this.gameState.players.length < 2) {
                    startButton.textContent = 'Waiting for more players...';
                    if (hostNote) {
                        hostNote.textContent = `Need ${2 - this.gameState.players.length} more players to start`;
                    }
                } else if (this.gameState.players.length >= this.gameState.maxPlayers) {
                    startButton.textContent = 'Start Game';
                    if (hostNote) {
                        hostNote.textContent = 'All players joined! Ready to start.';
                    }
                    console.log('✅ Start button shown - room is full!');
                } else {
                    startButton.textContent = 'Start Game';
                    if (hostNote) {
                        hostNote.textContent = 'Ready to start!';
                    }
                }
            }
        } else {
            // Player-specific UI updates
            if (hostNote) {
                if (this.gameState.players.length < 2) {
                    hostNote.textContent = `Waiting for ${2 - this.gameState.players.length} more player(s) to join...`;
                } else if (this.gameState.players.length >= this.gameState.maxPlayers) {
                    hostNote.textContent = 'All players joined! Waiting for host to start...';
                } else {
                    hostNote.textContent = 'Waiting for host to start the game...';
                }
            }
            // Player-specific UI updates
            if (hostNote) {
                if (this.gameState.players.length < 2) {
                    hostNote.textContent = `Waiting for ${2 - this.gameState.players.length} more player(s) to join...`;
                } else if (this.gameState.players.length >= this.gameState.maxPlayers) {
                    hostNote.textContent = 'All players joined! Waiting for host to start...';
                } else {
                    hostNote.textContent = 'Waiting for host to start the game...';
                }
            }
        }
    }

    // Build accuracy summary by target and render into #accuracy-summary
    renderAccuracySummary() {
        const wrap = document.getElementById('accuracy-summary');
        if (!wrap) return;
        
        wrap.innerHTML = '';
        const players = this.gameState.players || [];
        const guesses = this.gameState.guesses || {};
        const answers = this.gameState.playerAnswers || {};
        players.forEach((target) => {
            const targetName = target.name;
            const targetAnswers = answers[targetName];
            if (!targetAnswers) return;
            const group = document.createElement('div');
            group.className = 'answer-set';
            const h4 = document.createElement('h4');
            h4.textContent = `Accuracy when guessing ${targetName}`;
            group.appendChild(h4);
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            const targetGuesses = guesses[targetName] || {};
            players.forEach((p) => {
                if (p.name === targetName) return; // target doesn't guess
                const g = targetGuesses[p.name];
                let correct = 0;
                if (g) {
                    this.questions.forEach((q) => { 
                        if (g[q.id] === targetAnswers[q.id]) correct++; 
                    });
                }
                const li = document.createElement('li');
                const total = this.questions.length;
                li.textContent = `${p.name}: ${correct}/${total} correct`;
                ul.appendChild(li);
            });
            group.appendChild(ul);
            wrap.appendChild(group);
        });
    }

    // Copy a concise summary of winners and final scores
    async copyWinnerSummary() {
        const scores = Object.entries(this.gameState.scores || {}).sort(([, a], [, b]) => b - a);
        const maxScore = scores.length ? scores[0][1] : 0;
        const winners = scores.filter(([, s]) => s === maxScore).map(([n]) => n);
        const title = winners.length === 1 ? `Winner: ${winners[0]} (${maxScore} points)` : `Tie: ${winners.join(' & ')} (${maxScore} points)`;
        const lines = scores.map(([n,s]) => `- ${n}: ${s}`);
        const text = [`If I Were... Results`, title, ...lines].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const btn = document.getElementById('copy-summary');
            if (btn) {
                const old = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = old, 1500);
            }
        } catch (_) {
            alert(text);
        }
    }

    async startGame() {
        if (!this.gameState.isHost) return;
        
        this.gameState.gameStarted = true;
        this.gameState.phase = 'answering';
        // Remove currentAnswerer - all players answer simultaneously
        
        await this.saveGameState();
        this.showAnswerPhase();
    }

    showAnswerPhase() {
        this.showPhase('answer-phase');
        this.updateAnswerPhase();
    }

    updateAnswerPhase() {
        // Check if current player has already answered
        const hasAnswered = this.gameState.playerAnswers[this.gameState.playerName];
        
        if (hasAnswered) {
            // Player has already submitted answers
            document.getElementById('turn-indicator').textContent = 'Waiting for other players...';
            document.getElementById('current-answerer').textContent = 'All Players';
            document.getElementById('submit-answers').style.display = 'none';
            document.getElementById('waiting-for-others').style.display = 'block';
        } else {
            // Player hasn't answered yet - show form
            document.getElementById('turn-indicator').textContent = 'Answer the questions!';
            document.getElementById('current-answerer').textContent = 'Everyone';
            document.getElementById('submit-answers').style.display = 'block';
        }
    }

    // Handle host-specific UI updates
    updateHostUI() {
        const startButton = document.getElementById('start-game');
        const hostNote = document.getElementById('host-note');

        if (!this.gameState || !this.gameState.isHost) {
            // Hide start button for non-hosts
            if (startButton) {
                startButton.style.display = 'none';
            }
            return;
        }

        // Host-specific UI updates
        if (startButton) {
            const canStart = this.gameState.players && 
                           this.gameState.players.length >= 2 && 
                           this.gameState.players.length <= (this.gameState.maxPlayers || 8);
            
            startButton.disabled = !canStart;
            startButton.style.display = canStart ? 'block' : 'none';
            startButton.style.visibility = canStart ? 'visible' : 'hidden';
            
            // Update button text and host note based on player count
            if (this.gameState.players.length < 2) {
                startButton.textContent = 'Waiting for more players...';
                if (hostNote) {
                    hostNote.textContent = `Need ${2 - this.gameState.players.length} more players to start`;
                }
            } else if (this.gameState.players.length >= (this.gameState.maxPlayers || 8)) {
                startButton.textContent = 'Start Game';
                if (hostNote) {
                    hostNote.textContent = 'All players joined! Ready to start.';
                }
                console.log('✅ Start button shown - room is full!');
            } else {
                startButton.textContent = 'Start Game';
                if (hostNote) {
                    hostNote.textContent = 'Ready to start!';
                }
            }
        } else {
            // Player-specific UI updates
            if (hostNote) {
                if (this.gameState.players.length < 2) {
                    hostNote.textContent = `Waiting for ${2 - this.gameState.players.length} more player(s) to join...`;
                } else if (this.gameState.players.length >= (this.gameState.maxPlayers || 8)) {
                    hostNote.textContent = 'All players joined! Waiting for host to start...';
                } else {
                    hostNote.textContent = 'Waiting for host to start the game...';
                }
            }
            
            // Hide start button for non-hosts
            if (startButton) {
                startButton.style.display = 'none';
            }
        }
}

// ... (rest of the code remains the same)

// Update the game state with new answers from the current player
submitAnswers() {
    const answers = {};
    this.questions.forEach(question => {
        const selected = document.querySelector(`input[name="${question.id}"]:checked`);
        if (selected) {
            answers[question.id] = selected.value;
        }
    });

    if (Object.keys(answers).length !== this.questions.length) {
        this.showError('Please answer all questions before submitting.');
        return;
    }

    // Save answers
    this.gameState.playerAnswers[this.gameState.playerName] = answers;

    // Check if all players have answered
    if (Object.keys(this.gameState.playerAnswers).length === this.gameState.players.length) {
        // All players have answered, move to guessing phase (round-based by target)
        this.gameState.phase = 'guessing';
        this.gameState.currentTarget = 0; // Start with the first player as target
        this.gameState.guesses = {}; // Reset guesses map: { [targetName]: { [guesserName]: answers } }
    }

    this.saveGameState().then(() => {
        if (this.gameState.phase === 'guessing') {
            this.showGuessingPhase();
        } else {
            this.updateAnswerPhase();
        }
    });
}

// ... (rest of the code remains the same)

// Update the game state with new guesses from the current player
submitGuesses() {
    const myGuesses = {};
    this.questions.forEach((question, index) => {
        const selected = document.querySelector(`input[name="guess${index + 1}"]:checked`);
        if (selected) {
            myGuesses[question.id] = selected.value;
        }
    });

    if (Object.keys(myGuesses).length !== this.questions.length) {
        this.showError('Please make all guesses before submitting.');
        return;
    }

    const targetPlayer = this.gameState.players[this.gameState.currentTarget];

    if (this.firebaseReady && this.gameState.roomCode) {
        // Use a Firebase transaction to avoid overwriting concurrent guesses/scores
        this.database.ref(`games/${this.gameState.roomCode}`).transaction(current => {
            if (!current) return current;
            if (!current.guesses) current.guesses = {};
            if (!current.guesses[targetPlayer.name]) current.guesses[targetPlayer.name] = {};

            // Save my guesses
            current.guesses[targetPlayer.name][this.gameState.playerName] = myGuesses;

            const submittedCount = Object.keys(current.guesses[targetPlayer.name]).length;
            const requiredCount = (current.players ? current.players.length : this.gameState.players.length) - 1;

            if (submittedCount >= requiredCount) {
                // Compute and apply round scores
                const targetAnswers = (current.playerAnswers && current.playerAnswers[targetPlayer.name]) || this.gameState.playerAnswers[targetPlayer.name];
                const roundScores = {};
                Object.entries(current.guesses[targetPlayer.name]).forEach(([guesserName, guesses]) => {
                    if (guesserName === targetPlayer.name) return;
                    let correct = 0;
                    this.questions.forEach(q => {
                        if (guesses[q.id] === targetAnswers[q.id]) correct++;
                    });
                    const delta = correct - (this.questions.length - correct);
                    roundScores[guesserName] = delta;
                    if (!current.scores) current.scores = {};
                    current.scores[guesserName] = (current.scores[guesserName] || 0) + delta;
                });

                // Reveal with countdown
                const durationMs = 5000;
                const until = Date.now() + durationMs;
                current.reveal = {
                    target: targetPlayer.name,
                    answers: (targetAnswers || {}),
                    scores: roundScores,
                    until
                };
            }

            return current;
        }).then(() => {
            // UI updates will be driven by the Firebase listener (show overlay, schedule advance)
        });
    } else {
        // Fallback local (no Firebase): previous behavior
        if (!this.gameState.guesses) this.gameState.guesses = {};
        if (!this.gameState.guesses[targetPlayer.name]) this.gameState.guesses[targetPlayer.name] = {};
        this.gameState.guesses[targetPlayer.name][this.gameState.playerName] = myGuesses;

        const submittedCount = Object.keys(this.gameState.guesses[targetPlayer.name]).length;
        const requiredCount = this.gameState.players.length - 1;
        if (submittedCount >= requiredCount) {
            const targetAnswers = this.gameState.playerAnswers[targetPlayer.name];
            const roundScores = {};
            for (const [guesserName, guesses] of Object.entries(this.gameState.guesses[targetPlayer.name])) {
                if (guesserName === targetPlayer.name) continue;
                let correct = 0;
                this.questions.forEach(q => {
                    if (guesses[q.id] === targetAnswers[q.id]) correct++;
                });
                const delta = correct - (this.questions.length - correct);
                roundScores[guesserName] = delta;
                this.gameState.scores[guesserName] = (this.gameState.scores[guesserName] || 0) + delta;
            }
            const durationMs = 5000;
            const until = Date.now() + durationMs;
            this.gameState.reveal = { target: targetPlayer.name, answers: targetAnswers, scores: roundScores, until };
        }

        this.saveGameState().then(() => {
            if (this.gameState.reveal) {
                this.showRoundOverlay(this.gameState.reveal);
                this.scheduleAutoAdvanceIfHost();
            } else {
                this.updateGuessingPhase();
            }
        });
    }
    }

    async loadGameState(roomCode) {
        if (this.firebaseReady) {
            try {
                const gameRef = this.firebaseRef(this.database, `games/${roomCode}`);
                const snapshot = await this.firebaseGet(gameRef);
                if (snapshot.exists()) {
                    console.log('✅ Loaded game state from Firebase');
                    return snapshot.val();
                } else {
                    console.log('⚠️ No game state found in Firebase');
                    return null;
                }
            } catch (error) {
                console.warn('Error loading from Firebase:', error);
                // Fall through to localStorage
            }
        }
        
        // Fallback to localStorage
        const savedState = localStorage.getItem(`game_${roomCode}`);
        if (savedState) {
            console.log('📦 Loaded game state from localStorage');
            return JSON.parse(savedState);
        }
        
        console.log('⚠️ No game state found in localStorage');
        return null;
    }

    async clearGameState() {
        // Unsubscribe from any active listeners
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        
        // Clear the game reference
        this.gameRef = null;
        
        // If this is the host, remove the game from Firebase
        if (this.firebaseReady && this.gameState.roomCode && this.gameState.isHost) {
            try {
                const gameRef = this.firebaseRef(this.database, `games/${this.gameState.roomCode}`);
                await this.firebaseRemove(gameRef);
                console.log('🗑️ Removed game state from Firebase');
            } catch (error) {
                console.error('Error removing game from Firebase:', error);
            }
        }
        
        // Clear from localStorage
        if (this.gameState.roomCode) {
            localStorage.removeItem(`game_${this.gameState.roomCode}`);
            console.log('🗑️ Removed game state from localStorage');
        }
    }

    syncGameState(newState) {
        if (!newState) {
            console.warn('Cannot sync with null or undefined state');
            return;
        }

        const oldPhase = this.gameState.phase;
        
        // Preserve local player-specific state
        const playerName = this.gameState.playerName || '';
        const isHost = this.gameState.isHost || false;
        
        // Merge the new state while preserving local state
        this.gameState = { 
            ...newState, 
            playerName,
            isHost,
            // Ensure we have all required fields with defaults
            players: newState.players || [],
            playerAnswers: newState.playerAnswers || {},
            scores: newState.scores || {},
            guesses: newState.guesses || {},
            reveal: newState.reveal || null,
            gameStarted: newState.gameStarted || false
        };
        
        console.log(`🔄 Syncing game state: ${oldPhase} -> ${newState.phase}`);
        
        if (oldPhase !== newState.phase) {
            console.log(`🔄 Phase change detected: ${oldPhase} -> ${newState.phase}`);
            
            switch (newState.phase) {
                case 'waiting-room':
                    this.showWaitingRoom();
                    this.updateWaitingRoom();
                    break;
                case 'answering':
                    this.showAnswerPhase();
                    this.updateAnswerPhase();
                    break;
                case 'guessing':
                    this.showGuessingPhase();
                    this.updateGuessingPhase();
                    
                    // Handle reveal state if it exists
                    if (this.gameState.reveal) {
                        this.showRoundOverlay(this.gameState.reveal);
                        this.scheduleAutoAdvanceIfHost();
                    }
                    break;
                case 'results':
                    this.hideRoundOverlay();
                    this.showResults();
                    break;
                case 'game-over':
                    this.hideRoundOverlay();
                    this.showGameOver();
                    break;
                default:
                    console.warn(`Unknown phase: ${newState.phase}`);
            }
        } else {
            // For same-phase updates, just update the relevant UI
            switch (newState.phase) {
                case 'waiting-room':
                    this.updateWaitingRoom();
                    break;
                case 'answering':
                    this.updateAnswerPhase();
                    break;
                case 'guessing':
                    this.updateGuessingPhase();
                    break;
            }
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerIfIWereGame();
});
