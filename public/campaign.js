// Campaign game state
let campaignState = {
  type: 'math', // 'math' or 'reading'
  currentLevel: 1,
  currentStage: 1,
  questionNumber: 0,
  correctAnswers: 0,
  totalQuestions: 10,
  questions: [],
  currentQuestion: null
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

// Get campaign type from URL
function getCampaignType() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('type') || 'math';
}

// Initialize campaign
async function initCampaign() {
  await checkAuth();

  campaignState.type = getCampaignType();

  // Update title
  const titles = {
    'math': '📚 Math Campaign',
    'reading': '📖 Reading Campaign'
  };
  document.getElementById('campaign-title').textContent = titles[campaignState.type];

  // Load progress
  await loadProgress();

  // Show level select
  showLevelSelect();
}

// Load campaign progress
async function loadProgress() {
  try {
    const response = await fetch(`/api/campaign/progress/${campaignState.type}`);
    const progress = await response.json();

    campaignState.currentLevel = progress.current_level;
    campaignState.currentStage = progress.current_stage;

    document.getElementById('header-level').textContent = progress.current_level;
    document.getElementById('header-stars').textContent = progress.total_stars;
    document.getElementById('header-coins').textContent = progress.coins;
  } catch (error) {
    console.error('Error loading progress:', error);
  }
}

// Show level select screen
function showLevelSelect() {
  document.getElementById('level-select-screen').style.display = 'block';
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('results-screen').style.display = 'none';

  // Generate stages
  const stagesGrid = document.getElementById('stages-grid');
  stagesGrid.innerHTML = '';

  const totalStages = 20; // 20 stages per level
  const maxUnlocked = campaignState.currentStage;

  for (let i = 1; i <= totalStages; i++) {
    const isUnlocked = i <= maxUnlocked;
    const card = document.createElement('div');
    card.className = 'game-card';
    card.style.opacity = isUnlocked ? '1' : '0.5';
    card.style.cursor = isUnlocked ? 'pointer' : 'not-allowed';

    const stageInfo = getStageInfo(campaignState.type, campaignState.currentLevel, i);

    card.innerHTML = `
      <div class="game-icon">${stageInfo.icon}</div>
      <h3>Stage ${i}</h3>
      <p>${stageInfo.description}</p>
      ${isUnlocked
        ? `<button class="btn btn-success">Start!</button>`
        : `<button class="btn btn-secondary" disabled>🔒 Locked</button>`
      }
    `;

    if (isUnlocked) {
      card.onclick = () => startStage(i);
    }

    stagesGrid.appendChild(card);
  }

  // Update progress bar
  const progress = (maxUnlocked / totalStages) * 100;
  const progressBar = document.getElementById('progress-bar');
  progressBar.style.width = progress + '%';
  progressBar.textContent = Math.round(progress) + '%';
}

// Get stage information
function getStageInfo(type, level, stage) {
  if (type === 'math') {
    const topics = [
      { icon: '➕', description: 'Addition basics' },
      { icon: '➕➕', description: 'More addition' },
      { icon: '🔢', description: 'Counting up' },
      { icon: '1️⃣0️⃣', description: 'Numbers to 10' },
      { icon: '➕', description: 'Adding to 10' },
      { icon: '2️⃣0️⃣', description: 'Numbers to 20' },
      { icon: '➕', description: 'Adding to 20' },
      { icon: '🧮', description: 'Mixed practice' },
      { icon: '⭐', description: 'Challenge round' },
      { icon: '🎯', description: 'Speed practice' },
      { icon: '➖', description: 'Subtraction intro' },
      { icon: '➖➖', description: 'More subtraction' },
      { icon: '🔄', description: 'Addition & subtraction' },
      { icon: '💯', description: 'Mixed problems' },
      { icon: '🚀', description: 'Advanced addition' },
      { icon: '🎓', description: 'Word problems' },
      { icon: '🧠', description: 'Brain teasers' },
      { icon: '🏆', description: 'Challenge mode' },
      { icon: '👑', description: 'Master level' },
      { icon: '⭐⭐⭐', description: 'Final challenge!' }
    ];
    return topics[(stage - 1) % topics.length];
  } else {
    const topics = [
      { icon: '🔤', description: 'Letter sounds' },
      { icon: '📝', description: 'Simple words' },
      { icon: '🐱', description: 'Animal words' },
      { icon: '🍎', description: 'Food words' },
      { icon: '🌈', description: 'Color words' },
      { icon: '👨‍👩‍👧', description: 'Family words' },
      { icon: '🏠', description: 'Home words' },
      { icon: '🎨', description: 'Action words' },
      { icon: '📚', description: 'Short sentences' },
      { icon: '✨', description: 'Reading practice' },
      { icon: '🦄', description: 'Story time' },
      { icon: '🌟', description: 'Rhyming words' },
      { icon: '🎵', description: 'Sound patterns' },
      { icon: '📖', description: 'Read & answer' },
      { icon: '🤔', description: 'Comprehension' },
      { icon: '💭', description: 'Think & answer' },
      { icon: '🎯', description: 'Find the word' },
      { icon: '🏆', description: 'Reading challenge' },
      { icon: '👑', description: 'Master reader' },
      { icon: '⭐⭐⭐', description: 'Story master!' }
    ];
    return topics[(stage - 1) % topics.length];
  }
}

// Start a stage
function startStage(stageNumber) {
  campaignState.currentStage = stageNumber;
  campaignState.questionNumber = 0;
  campaignState.correctAnswers = 0;

  // Generate questions based on type and stage
  generateQuestions();

  // Show game screen
  document.getElementById('level-select-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('results-screen').style.display = 'none';

  // Start first question
  nextQuestion();
}

// Generate questions for the stage
function generateQuestions() {
  campaignState.questions = [];

  for (let i = 0; i < campaignState.totalQuestions; i++) {
    if (campaignState.type === 'math') {
      campaignState.questions.push(generateMathQuestion(campaignState.currentLevel, campaignState.currentStage));
    } else {
      campaignState.questions.push(generateReadingQuestion(campaignState.currentLevel, campaignState.currentStage));
    }
  }
}

// Generate math question
function generateMathQuestion(level, stage) {
  const maxNumber = Math.min(10 + stage * 2, 50);
  const num1 = Math.floor(Math.random() * maxNumber) + 1;
  const num2 = Math.floor(Math.random() * maxNumber) + 1;

  // Introduce subtraction after stage 10
  const useSubtraction = stage > 10 && Math.random() > 0.5;

  if (useSubtraction && num1 > num2) {
    return {
      type: 'math',
      question: `${num1} - ${num2} = ?`,
      answer: num1 - num2
    };
  } else {
    return {
      type: 'math',
      question: `${num1} + ${num2} = ?`,
      answer: num1 + num2
    };
  }
}

// Generate reading question
function generateReadingQuestion(level, stage) {
  const readingQuestions = [
    // Simple word recognition
    { question: 'What letter does "cat" start with?', choices: ['C', 'K', 'S', 'T'], answer: 0 },
    { question: 'What letter does "dog" start with?', choices: ['B', 'D', 'G', 'P'], answer: 1 },
    { question: 'Which word is an animal?', choices: ['car', 'cat', 'cup', 'cap'], answer: 1 },
    { question: 'Which word is a color?', choices: ['run', 'red', 'rat', 'rug'], answer: 1 },
    { question: 'What sound does "B" make?', choices: ['buh', 'duh', 'puh', 'guh'], answer: 0 },
    { question: 'Which word rhymes with "bat"?', choices: ['bag', 'cat', 'bad', 'can'], answer: 1 },
    { question: 'How many letters in "sun"?', choices: ['2', '3', '4', '5'], answer: 1 },
    { question: 'Which is a fruit?', choices: ['apple', 'table', 'chair', 'door'], answer: 0 },
    { question: 'Which word means "not cold"?', choices: ['hot', 'wet', 'big', 'small'], answer: 0 },
    { question: 'What comes after "A, B, ___"?', choices: ['D', 'C', 'E', 'F'], answer: 1 },

    // Simple sentences
    { question: 'The cat is ___', choices: ['running', 'blue', 'happy', 'eating'], answer: 0 },
    { question: 'I like to ___', choices: ['house', 'play', 'chair', 'window'], answer: 1 },
    { question: 'The sun is ___', choices: ['cold', 'yellow', 'small', 'sad'], answer: 1 },
    { question: 'A dog can ___', choices: ['fly', 'swim', 'bark', 'read'], answer: 2 },
    { question: 'The opposite of "big" is ___', choices: ['tall', 'small', 'wide', 'long'], answer: 1 },
    { question: 'We ___ with our eyes', choices: ['hear', 'smell', 'see', 'taste'], answer: 2 },
    { question: 'A bird can ___', choices: ['walk', 'swim', 'fly', 'run'], answer: 2 },
    { question: 'The grass is ___', choices: ['blue', 'red', 'green', 'yellow'], answer: 2 },
    { question: 'At night, we ___', choices: ['sleep', 'run', 'jump', 'sing'], answer: 0 },
    { question: 'A fish lives in ___', choices: ['tree', 'water', 'cave', 'house'], answer: 1 }
  ];

  // Select random question based on stage
  const questionIndex = (stage - 1 + Math.floor(Math.random() * 5)) % readingQuestions.length;
  return {
    type: 'reading',
    ...readingQuestions[questionIndex]
  };
}

// Show next question
function nextQuestion() {
  if (campaignState.questionNumber >= campaignState.totalQuestions) {
    endStage();
    return;
  }

  campaignState.currentQuestion = campaignState.questions[campaignState.questionNumber];
  campaignState.questionNumber++;

  // Update UI
  document.getElementById('question-number').textContent = campaignState.questionNumber;
  document.getElementById('total-questions').textContent = campaignState.totalQuestions;
  document.getElementById('current-score').textContent = campaignState.correctAnswers;
  document.getElementById('question').textContent = campaignState.currentQuestion.question;
  document.getElementById('feedback').textContent = '';

  // Show appropriate input
  if (campaignState.currentQuestion.type === 'math') {
    document.getElementById('answer-input').style.display = 'block';
    document.getElementById('choices-container').style.display = 'none';
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').focus();
  } else {
    document.getElementById('answer-input').style.display = 'none';
    document.getElementById('choices-container').style.display = 'block';

    const choicesContainer = document.getElementById('choices-container');
    choicesContainer.innerHTML = '';

    campaignState.currentQuestion.choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'btn btn-primary';
      button.style.width = '100%';
      button.style.marginBottom = '15px';
      button.style.fontSize = '1.5em';
      button.style.padding = '20px';
      button.textContent = choice;
      button.onclick = () => selectChoice(index);
      choicesContainer.appendChild(button);
    });
  }
}

// Select a choice (for reading questions)
function selectChoice(choiceIndex) {
  // Highlight selected choice
  const buttons = document.querySelectorAll('#choices-container button');
  buttons.forEach((btn, idx) => {
    if (idx === choiceIndex) {
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.style.transform = 'scale(1.05)';
    } else {
      btn.style.background = '';
      btn.style.transform = '';
    }
  });

  // Store selected answer
  campaignState.selectedChoice = choiceIndex;
}

// Check answer
function checkAnswer() {
  const feedbackEl = document.getElementById('feedback');
  let userAnswer;
  let correctAnswer;

  if (campaignState.currentQuestion.type === 'math') {
    userAnswer = parseInt(document.getElementById('answer-input').value);
    correctAnswer = campaignState.currentQuestion.answer;

    if (isNaN(userAnswer)) {
      feedbackEl.textContent = '⚠️ Please enter a number!';
      feedbackEl.className = 'feedback incorrect';
      return;
    }
  } else {
    if (campaignState.selectedChoice === undefined) {
      feedbackEl.textContent = '⚠️ Please select an answer!';
      feedbackEl.className = 'feedback incorrect';
      return;
    }
    userAnswer = campaignState.selectedChoice;
    correctAnswer = campaignState.currentQuestion.answer;
  }

  if (userAnswer === correctAnswer) {
    campaignState.correctAnswers++;
    feedbackEl.textContent = '✓ Correct! Great job!';
    feedbackEl.className = 'feedback correct';

    confetti();

    setTimeout(() => {
      campaignState.selectedChoice = undefined;
      nextQuestion();
    }, 1500);
  } else {
    feedbackEl.textContent = `✗ Not quite! The answer is ${campaignState.currentQuestion.type === 'math' ? correctAnswer : campaignState.currentQuestion.choices[correctAnswer]}`;
    feedbackEl.className = 'feedback incorrect';

    // Don't move to next question - let them try to learn from the mistake
    setTimeout(() => {
      feedbackEl.textContent = '💭 Try the next one!';
      setTimeout(() => {
        campaignState.selectedChoice = undefined;
        nextQuestion();
      }, 1500);
    }, 2500);
  }
}

// Confetti animation
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

// End stage and show results
async function endStage() {
  document.getElementById('game-screen').style.display = 'none';

  const accuracy = campaignState.correctAnswers / campaignState.totalQuestions;

  // Calculate stars
  let stars = 0;
  if (accuracy >= 0.95) stars = 3;
  else if (accuracy >= 0.80) stars = 2;
  else if (accuracy >= 0.60) stars = 1;

  // Display stars
  let starsDisplay = '';
  for (let i = 0; i < stars; i++) starsDisplay += '⭐';
  for (let i = stars; i < 3; i++) starsDisplay += '☆';
  document.getElementById('stars-display').textContent = starsDisplay;

  // Display results
  document.getElementById('final-score').textContent = campaignState.correctAnswers;
  document.getElementById('result-correct').textContent = campaignState.correctAnswers;
  document.getElementById('result-accuracy').textContent = Math.round(accuracy * 100) + '%';
  document.getElementById('result-total').textContent = campaignState.totalQuestions;

  // Submit to server
  try {
    const response = await fetch('/api/campaign/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignType: campaignState.type,
        level: campaignState.currentLevel,
        stage: campaignState.currentStage,
        correctAnswers: campaignState.correctAnswers,
        totalQuestions: campaignState.totalQuestions
      })
    });

    const data = await response.json();

    // Show rewards
    document.getElementById('stars-earned').textContent = data.starsEarned || 0;
    document.getElementById('coins-earned').textContent = data.coinsEarned || 0;
    document.getElementById('xp-earned').textContent = data.experienceEarned || 0;

    // Update header
    await loadProgress();

    // Check for level up
    if (data.leveledUp) {
      document.getElementById('level-up-display').style.display = 'block';
      document.getElementById('new-level').textContent = data.newLevel;

      // Extra confetti!
      for (let i = 0; i < 5; i++) {
        setTimeout(() => confetti(), i * 300);
      }
    } else {
      document.getElementById('level-up-display').style.display = 'none';
    }
  } catch (error) {
    console.error('Error submitting campaign results:', error);
  }

  // Show results screen
  document.getElementById('results-screen').style.display = 'block';
}

// Next stage
async function nextStage() {
  const nextStageNumber = campaignState.currentStage + 1;

  // Unlock next stage
  await fetch('/api/campaign/advance-stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignType: campaignState.type,
      newStage: nextStageNumber
    })
  });

  await loadProgress();

  if (nextStageNumber <= 20) {
    startStage(nextStageNumber);
  } else {
    backToStages();
  }
}

// Back to stage select
function backToStages() {
  showLevelSelect();
}

// Handle Enter key
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const gameScreen = document.getElementById('game-screen');
      if (gameScreen.style.display !== 'none') {
        checkAnswer();
      }
    }
  });
});

// Initialize
initCampaign();
