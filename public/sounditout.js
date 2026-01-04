// Game state
let gameState = {
  currentWordIndex: 0,
  correctCount: 0,
  totalWords: 10,
  words: [],
  isListening: false,
  isDragging: false,
  lastPlayedPosition: 0
};

// Word lists for different difficulty levels
const wordLists = {
  easy: ['cat', 'dog', 'sun', 'hat', 'bat', 'run', 'fun', 'sit', 'big', 'red', 'yes', 'mom', 'dad', 'can', 'you'],
  medium: ['jump', 'play', 'blue', 'tree', 'frog', 'star', 'milk', 'bell', 'duck', 'fish', 'baby', 'cake', 'ball', 'door', 'bird'],
  hard: ['happy', 'apple', 'table', 'water', 'green', 'pizza', 'pencil', 'flower', 'garden', 'basket', 'rabbit', 'monkey', 'teacher', 'picture', 'butterfly']
};

// Speech synthesis (text-to-speech)
let synth = window.speechSynthesis;
let currentUtterance = null;

// Speech recognition (speech-to-text)
let recognition = null;

// Initialize speech recognition
function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
  } else if ('SpeechRecognition' in window) {
    recognition = new SpeechRecognition();
  } else {
    console.error('Speech recognition not supported');
    return false;
  }

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    const confidence = event.results[0][0].confidence;

    console.log('Heard:', transcript, 'Confidence:', confidence);
    checkPronunciation(transcript);
  };

  recognition.onerror = function(event) {
    console.error('Speech recognition error:', event.error);
    gameState.isListening = false;
    updateListeningUI();

    if (event.error === 'no-speech') {
      showFeedback('😕 I didn\'t hear anything. Try again!', 'incorrect');
    } else if (event.error === 'not-allowed') {
      showFeedback('🎤 Please allow microphone access!', 'incorrect');
    } else {
      showFeedback('❌ Something went wrong. Try again!', 'incorrect');
    }
  };

  recognition.onend = function() {
    gameState.isListening = false;
    updateListeningUI();
  };

  return true;
}

// Check authentication
async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      window.location.href = '/';
      return false;
    }
    return true;
  } catch (error) {
    window.location.href = '/';
    return false;
  }
}

// Initialize game
function initGame() {
  checkAuth();

  if (!initSpeechRecognition()) {
    alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    return;
  }

  // Select random words
  const allWords = [...wordLists.easy, ...wordLists.medium];
  gameState.words = [];
  while (gameState.words.length < gameState.totalWords) {
    const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
    if (!gameState.words.includes(randomWord)) {
      gameState.words.push(randomWord);
    }
  }

  // Setup slider
  setupSlider();

  // Show first word
  showWord();
  updateProgress();
}

// Setup slider functionality
function setupSlider() {
  const track = document.getElementById('slider-track');
  const thumb = document.getElementById('slider-thumb');
  const progress = document.getElementById('slider-progress');

  let isDragging = false;
  let trackRect;

  function updateSlider(clientX) {
    if (!trackRect) trackRect = track.getBoundingClientRect();

    const x = clientX - trackRect.left;
    const percentage = Math.max(0, Math.min(100, (x / trackRect.width) * 100));

    thumb.style.left = percentage + '%';
    progress.style.width = percentage + '%';

    // Play word at different rates as slider moves
    if (percentage > gameState.lastPlayedPosition + 10) {
      const rate = 0.5 + (percentage / 100) * 0.7; // 0.5x to 1.2x speed
      speakWord(gameState.words[gameState.currentWordIndex], rate);
      gameState.lastPlayedPosition = percentage;
    }
  }

  // Mouse events
  thumb.addEventListener('mousedown', (e) => {
    isDragging = true;
    trackRect = track.getBoundingClientRect();
    gameState.isDragging = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      updateSlider(e.clientX);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      gameState.isDragging = false;
      gameState.lastPlayedPosition = 0;

      // Reset slider
      setTimeout(() => {
        thumb.style.left = '0%';
        progress.style.width = '0%';
      }, 500);
    }
  });

  // Touch events for mobile
  thumb.addEventListener('touchstart', (e) => {
    isDragging = true;
    trackRect = track.getBoundingClientRect();
    gameState.isDragging = true;
    e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length > 0) {
      updateSlider(e.touches[0].clientX);
    }
  });

  document.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      gameState.isDragging = false;
      gameState.lastPlayedPosition = 0;

      setTimeout(() => {
        thumb.style.left = '0%';
        progress.style.width = '0%';
      }, 500);
    }
  });

  // Click anywhere on track to play
  track.addEventListener('click', (e) => {
    if (!gameState.isDragging) {
      speakWord(gameState.words[gameState.currentWordIndex], 1.0);
    }
  });
}

// Speak word using text-to-speech
function speakWord(word, rate = 1.0) {
  // Cancel any ongoing speech
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = rate;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';

  // Use a child-friendly voice if available
  const voices = synth.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Karen'));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  synth.speak(utterance);
  currentUtterance = utterance;
}

// Show current word
function showWord() {
  const word = gameState.words[gameState.currentWordIndex];
  document.getElementById('word-display').textContent = word;
  document.getElementById('feedback').textContent = '';

  // Auto-play word once when shown
  setTimeout(() => {
    speakWord(word, 0.8);
  }, 500);
}

// Start listening for pronunciation
function startListening() {
  if (gameState.isListening) return;

  if (!recognition) {
    alert('Speech recognition not available. Please use Chrome or Edge browser.');
    return;
  }

  gameState.isListening = true;
  updateListeningUI();

  try {
    recognition.start();
  } catch (error) {
    console.error('Error starting recognition:', error);
    gameState.isListening = false;
    updateListeningUI();
  }
}

// Update listening UI
function updateListeningUI() {
  const button = document.getElementById('voice-button');
  const indicator = document.getElementById('listening-indicator');

  if (gameState.isListening) {
    button.classList.add('listening');
    button.textContent = '🎤 Listening...';
    indicator.classList.add('active');
  } else {
    button.classList.remove('listening');
    button.textContent = '🎤 Try it!';
    indicator.classList.remove('active');
  }
}

// Check pronunciation
function checkPronunciation(spokenWord) {
  const currentWord = gameState.words[gameState.currentWordIndex].toLowerCase();
  const spoken = spokenWord.toLowerCase();

  console.log('Expected:', currentWord, 'Got:', spoken);

  // Check for exact match or close match
  if (spoken === currentWord || spoken.includes(currentWord) || currentWord.includes(spoken)) {
    // Correct!
    gameState.correctCount++;
    showFeedback('🎉 Perfect! You said it right!', 'correct');

    // Celebration
    confetti();

    // Move to next word after delay
    setTimeout(() => {
      nextWord();
    }, 2000);
  } else {
    // Incorrect - but let them try again
    showFeedback(`🤔 Hmm, I heard "${spokenWord}". Try again!`, 'incorrect');

    // Play the word again to help
    setTimeout(() => {
      speakWord(currentWord, 0.7);
    }, 1500);
  }
}

// Show feedback
function showFeedback(text, type) {
  const feedbackEl = document.getElementById('feedback');
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${type}`;
}

// Next word
function nextWord() {
  gameState.currentWordIndex++;

  if (gameState.currentWordIndex >= gameState.totalWords) {
    endGame();
  } else {
    showWord();
    updateProgress();
  }
}

// Skip word
function skipWord() {
  nextWord();
}

// Update progress bar
function updateProgress() {
  const percentage = (gameState.currentWordIndex / gameState.totalWords) * 100;
  document.getElementById('progress-bar').style.width = percentage + '%';
  document.getElementById('progress-text').textContent = `${gameState.currentWordIndex} / ${gameState.totalWords}`;
  document.getElementById('score').textContent = gameState.correctCount;
  document.getElementById('total').textContent = gameState.totalWords;
}

// Confetti animation
function confetti() {
  const colors = ['#ff6b6b', '#f9ca24', '#6ab04c', '#4834d4', '#eb4d4b'];
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '10px';
      confetti.style.height = '10px';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * window.innerWidth + 'px';
      confetti.style.top = '-10px';
      confetti.style.borderRadius = '50%';
      confetti.style.zIndex = '10000';
      confetti.style.pointerEvents = 'none';
      document.body.appendChild(confetti);

      const animation = confetti.animate([
        { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
        { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], {
        duration: 2000 + Math.random() * 1000,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      });

      animation.onfinish = () => confetti.remove();
    }, i * 50);
  }
}

// End game
async function endGame() {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('results-screen').style.display = 'block';

  const percentage = Math.round((gameState.correctCount / gameState.totalWords) * 100);
  const coinsEarned = gameState.correctCount * 10;

  document.getElementById('final-score').textContent = gameState.correctCount;
  document.getElementById('final-percentage').textContent = percentage + '%';
  document.getElementById('coins-earned').textContent = coinsEarned;

  // Submit results to server (using campaign API)
  try {
    await fetch('/api/campaign/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignType: 'reading',
        level: 1,
        stage: 1,
        correctAnswers: gameState.correctCount,
        totalQuestions: gameState.totalWords
      })
    });
  } catch (error) {
    console.error('Error submitting results:', error);
  }

  // Big celebration
  for (let i = 0; i < 3; i++) {
    setTimeout(() => confetti(), i * 500);
  }
}

// Play again
function playAgain() {
  gameState = {
    currentWordIndex: 0,
    correctCount: 0,
    totalWords: 10,
    words: [],
    isListening: false,
    isDragging: false,
    lastPlayedPosition: 0
  };

  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('results-screen').style.display = 'none';

  initGame();
}

// Load voices when available (required for some browsers)
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = () => {
    synth.getVoices();
  };
}

// Initialize when page loads
initGame();
