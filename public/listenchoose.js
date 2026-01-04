// Game state
let gameState = {
  currentQuestionIndex: 0,
  correctCount: 0,
  totalQuestions: 10,
  questions: [],
  currentWord: '',
  hasPlayed: false,
  answerSelected: false
};

// Word lists for different difficulty levels
const wordLists = {
  easy: ['cat', 'dog', 'sun', 'hat', 'bat', 'run', 'fun', 'sit', 'big', 'red', 'yes', 'mom', 'dad', 'can', 'you', 'car', 'bus', 'bed', 'box', 'cup'],
  medium: ['jump', 'play', 'blue', 'tree', 'frog', 'star', 'milk', 'bell', 'duck', 'fish', 'baby', 'cake', 'ball', 'door', 'bird', 'book', 'hand', 'snow', 'rain', 'wind'],
  hard: ['happy', 'apple', 'table', 'water', 'green', 'pizza', 'pencil', 'flower', 'garden', 'basket', 'rabbit', 'monkey', 'teacher', 'picture', 'butterfly', 'elephant', 'umbrella', 'bicycle', 'triangle', 'strawberry']
};

// Speech synthesis (text-to-speech)
let synth = window.speechSynthesis;
let currentUtterance = null;

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

  // Generate questions
  generateQuestions();

  // Show first question
  showQuestion();
  updateProgress();
}

// Generate all questions
function generateQuestions() {
  const allWords = [...wordLists.easy, ...wordLists.medium];
  const usedWords = new Set();

  for (let i = 0; i < gameState.totalQuestions; i++) {
    // Pick a random word that hasn't been used yet
    let correctWord;
    do {
      correctWord = allWords[Math.floor(Math.random() * allWords.length)];
    } while (usedWords.has(correctWord));
    usedWords.add(correctWord);

    // Generate 3 wrong answers (distractors)
    const wrongWords = [];
    while (wrongWords.length < 3) {
      const word = allWords[Math.floor(Math.random() * allWords.length)];
      if (word !== correctWord && !wrongWords.includes(word)) {
        wrongWords.push(word);
      }
    }

    // Create question with all 4 choices
    const choices = [correctWord, ...wrongWords];
    // Shuffle choices
    for (let j = choices.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [choices[j], choices[k]] = [choices[k], choices[j]];
    }

    gameState.questions.push({
      correctWord: correctWord,
      choices: choices
    });
  }
}

// Show current question
function showQuestion() {
  const question = gameState.questions[gameState.currentQuestionIndex];
  gameState.currentWord = question.correctWord;
  gameState.hasPlayed = false;
  gameState.answerSelected = false;

  // Clear feedback
  document.getElementById('feedback').textContent = '';
  document.getElementById('feedback').className = 'feedback';

  // Reset listen button
  const listenButton = document.getElementById('listen-button');
  listenButton.classList.remove('playing');

  // Hide next button
  document.getElementById('next-button').style.display = 'none';

  // Update instruction
  document.getElementById('instruction').textContent = 'Click the speaker to hear the word! 🔊';

  // Populate choices
  const choicesGrid = document.getElementById('choices-grid');
  choicesGrid.innerHTML = '';

  question.choices.forEach((word, index) => {
    const button = document.createElement('button');
    button.className = 'choice-button';
    button.textContent = word;
    button.onclick = () => selectAnswer(word);
    button.id = `choice-${index}`;
    choicesGrid.appendChild(button);
  });

  // Auto-play word after a short delay
  setTimeout(() => {
    playWord();
  }, 800);
}

// Play the word using text-to-speech
function playWord() {
  if (!gameState.currentWord) return;

  // Cancel any ongoing speech
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(gameState.currentWord);
  utterance.rate = 0.9; // Slightly slower for clarity
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';

  // Use a child-friendly voice if available
  const voices = synth.getVoices();
  const preferredVoice = voices.find(v =>
    v.name.includes('Female') ||
    v.name.includes('Samantha') ||
    v.name.includes('Karen') ||
    v.name.includes('Google US English')
  );
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Visual feedback while playing
  const listenButton = document.getElementById('listen-button');
  listenButton.classList.add('playing');

  utterance.onend = () => {
    listenButton.classList.remove('playing');
    if (!gameState.hasPlayed) {
      gameState.hasPlayed = true;
      document.getElementById('instruction').textContent = 'Which word did you hear? 🤔';
    }
  };

  synth.speak(utterance);
  currentUtterance = utterance;
}

// Select an answer
function selectAnswer(selectedWord) {
  if (gameState.answerSelected) return; // Prevent multiple selections

  gameState.answerSelected = true;

  const question = gameState.questions[gameState.currentQuestionIndex];
  const isCorrect = selectedWord === question.correctWord;

  // Find and highlight the selected button
  const buttons = document.querySelectorAll('.choice-button');
  buttons.forEach(button => {
    button.style.pointerEvents = 'none'; // Disable all buttons

    if (button.textContent === selectedWord) {
      if (isCorrect) {
        button.classList.add('correct');
        gameState.correctCount++;
        showFeedback('🎉 Correct! Great job!', 'correct');
        confetti();
      } else {
        button.classList.add('incorrect');
        showFeedback(`❌ Not quite! The word was "${question.correctWord}"`, 'incorrect');
      }
    }

    // Show the correct answer if they got it wrong
    if (!isCorrect && button.textContent === question.correctWord) {
      button.classList.add('correct');
    }
  });

  // Update score
  updateProgress();

  // Show next button after delay
  setTimeout(() => {
    document.getElementById('next-button').style.display = 'inline-block';
  }, 1500);
}

// Show feedback
function showFeedback(text, type) {
  const feedbackEl = document.getElementById('feedback');
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${type}`;
}

// Next question
function nextQuestion() {
  gameState.currentQuestionIndex++;

  if (gameState.currentQuestionIndex >= gameState.totalQuestions) {
    endGame();
  } else {
    showQuestion();
    updateProgress();
  }
}

// Update progress bar
function updateProgress() {
  const percentage = (gameState.currentQuestionIndex / gameState.totalQuestions) * 100;
  document.getElementById('progress-bar').style.width = percentage + '%';
  document.getElementById('progress-text').textContent = `${gameState.currentQuestionIndex} / ${gameState.totalQuestions}`;
  document.getElementById('score').textContent = gameState.correctCount;
  document.getElementById('total').textContent = gameState.totalQuestions;
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

  const percentage = Math.round((gameState.correctCount / gameState.totalQuestions) * 100);
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
        stage: 2,
        correctAnswers: gameState.correctCount,
        totalQuestions: gameState.totalQuestions
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
    currentQuestionIndex: 0,
    correctCount: 0,
    totalQuestions: 10,
    questions: [],
    currentWord: '',
    hasPlayed: false,
    answerSelected: false
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
