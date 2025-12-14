// Game state
let gameState = {
  timeLimit: 60,
  difficulty: 'medium',
  timeRemaining: 60,
  score: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  currentQuestion: null,
  currentAnswer: null,
  timerInterval: null,
  gameType: 'addition'
};

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

// Get difficulty range
function getDifficultyRange(difficulty) {
  switch (difficulty) {
    case 'easy': return { min: 1, max: 10 };
    case 'medium': return { min: 1, max: 20 };
    case 'hard': return { min: 1, max: 50 };
    case 'expert': return { min: 1, max: 100 };
    default: return { min: 1, max: 20 };
  }
}

// Generate random number in range
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate new question
function generateQuestion() {
  const range = getDifficultyRange(gameState.difficulty);
  const num1 = randomInRange(range.min, range.max);
  const num2 = randomInRange(range.min, range.max);

  gameState.currentQuestion = { num1, num2 };
  gameState.currentAnswer = num1 + num2;

  document.getElementById('question').textContent = `${num1} + ${num2} = ?`;
  document.getElementById('answer-input').value = '';
  document.getElementById('feedback').textContent = '';
}

// Start game
function startGame() {
  // Get settings
  gameState.timeLimit = parseInt(document.getElementById('time-limit').value);
  gameState.difficulty = document.getElementById('difficulty').value;
  gameState.timeRemaining = gameState.timeLimit;
  gameState.score = 0;
  gameState.correctAnswers = 0;
  gameState.wrongAnswers = 0;

  // Show game screen
  document.getElementById('settings-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('results-screen').style.display = 'none';

  // Update UI
  document.getElementById('timer').textContent = gameState.timeRemaining;
  document.getElementById('score').textContent = gameState.score;

  // Generate first question
  generateQuestion();

  // Focus input
  document.getElementById('answer-input').focus();

  // Start timer
  gameState.timerInterval = setInterval(updateTimer, 1000);
}

// Update timer
function updateTimer() {
  gameState.timeRemaining--;
  document.getElementById('timer').textContent = gameState.timeRemaining;

  // Change timer color when running out of time
  const timerEl = document.querySelector('.timer');
  if (gameState.timeRemaining <= 10) {
    timerEl.style.color = '#dc3545';
    timerEl.style.animation = 'pulse 0.5s infinite';
  }

  if (gameState.timeRemaining <= 0) {
    endGame();
  }
}

// Check answer
function checkAnswer() {
  const userAnswer = parseInt(document.getElementById('answer-input').value);
  const feedbackEl = document.getElementById('feedback');

  if (isNaN(userAnswer)) return;

  if (userAnswer === gameState.currentAnswer) {
    // Correct answer
    gameState.correctAnswers++;
    gameState.score++;

    feedbackEl.textContent = '✓ Correct!';
    feedbackEl.className = 'feedback correct';

    // Play success animation
    confetti();

    // Generate next question after short delay
    setTimeout(() => {
      generateQuestion();
      document.getElementById('answer-input').focus();
    }, 500);
  } else {
    // Wrong answer
    gameState.wrongAnswers++;

    feedbackEl.textContent = '✗ Try Again!';
    feedbackEl.className = 'feedback incorrect';

    // Clear input
    document.getElementById('answer-input').value = '';
  }

  // Update score display
  document.getElementById('score').textContent = gameState.score;
}

// Confetti animation (simple version)
function confetti() {
  const colors = ['#ff6b6b', '#f9ca24', '#6ab04c', '#4834d4', '#eb4d4b'];
  for (let i = 0; i < 10; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = '10px';
    confetti.style.height = '10px';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * window.innerWidth + 'px';
    confetti.style.top = '-10px';
    confetti.style.borderRadius = '50%';
    confetti.style.zIndex = '9999';
    confetti.style.pointerEvents = 'none';
    document.body.appendChild(confetti);

    const animation = confetti.animate([
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
    ], {
      duration: 2000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    });

    animation.onfinish = () => confetti.remove();
  }
}

// End game
async function endGame() {
  clearInterval(gameState.timerInterval);

  // Hide game screen
  document.getElementById('game-screen').style.display = 'none';

  // Calculate stats
  const totalQuestions = gameState.correctAnswers + gameState.wrongAnswers;
  const accuracy = totalQuestions > 0
    ? Math.round((gameState.correctAnswers / totalQuestions) * 100)
    : 0;

  // Show results
  document.getElementById('final-score').textContent = gameState.score;
  document.getElementById('result-correct').textContent = gameState.correctAnswers;
  document.getElementById('result-wrong').textContent = gameState.wrongAnswers;
  document.getElementById('result-accuracy').textContent = accuracy + '%';

  // Submit results to server
  try {
    const response = await fetch('/api/game/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameType: gameState.gameType,
        score: gameState.score,
        correctAnswers: gameState.correctAnswers,
        totalQuestions: totalQuestions,
        timeLimit: gameState.timeLimit,
        difficulty: gameState.difficulty
      })
    });

    const data = await response.json();

    // Show new badges if any
    if (data.newBadges && data.newBadges.length > 0) {
      const badgesContainer = document.getElementById('new-badges-container');
      const badgesList = document.getElementById('new-badges-list');

      badgesList.innerHTML = '';
      data.newBadges.forEach(badge => {
        const badgeEl = document.createElement('div');
        badgeEl.className = 'new-badge';
        badgeEl.textContent = `${badge.icon} ${badge.name}`;
        badgesList.appendChild(badgeEl);
      });

      badgesContainer.style.display = 'block';

      // Extra confetti for badges!
      for (let i = 0; i < 3; i++) {
        setTimeout(() => confetti(), i * 300);
      }
    }
  } catch (error) {
    console.error('Error submitting game results:', error);
  }

  // Show results screen
  document.getElementById('results-screen').style.display = 'block';
}

// Quit game early
function quitGame() {
  if (confirm('Are you sure you want to quit? Your progress will be saved!')) {
    endGame();
  }
}

// Play again
function playAgain() {
  document.getElementById('results-screen').style.display = 'none';
  document.getElementById('settings-screen').style.display = 'block';
}

// Go to dashboard
function goToDashboard() {
  window.location.href = '/dashboard';
}

// Handle enter key for answer submission
document.addEventListener('DOMContentLoaded', () => {
  const answerInput = document.getElementById('answer-input');
  if (answerInput) {
    answerInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        checkAnswer();
      }
    });

    // Also check on input change for mobile
    answerInput.addEventListener('input', () => {
      const value = answerInput.value;
      if (value && value.length >= 1) {
        // Auto-submit if answer looks complete
        setTimeout(() => {
          if (answerInput.value === value) {
            checkAnswer();
          }
        }, 500);
      }
    });
  }
});

// Initialize
checkAuth();
