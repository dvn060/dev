// Check if user is logged in
async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      window.location.href = '/';
      return null;
    }
    return await response.json();
  } catch (error) {
    window.location.href = '/';
    return null;
  }
}

// Logout
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// Load user data
async function loadUserData() {
  const user = await checkAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.full_name;
  if (user.avatar) {
    document.getElementById('user-avatar').textContent = user.avatar;
  }

  // Load stats
  const statsResponse = await fetch('/api/stats');
  const stats = await statsResponse.json();

  document.getElementById('total-games').textContent = stats.total_games || 0;
  document.getElementById('total-correct').textContent = stats.total_correct || 0;
  document.getElementById('high-score').textContent = stats.highest_score || 0;

  const accuracy = stats.total_questions > 0
    ? Math.round((stats.total_correct / stats.total_questions) * 100)
    : 0;
  document.getElementById('accuracy').textContent = accuracy + '%';

  // Load campaign progress
  try {
    const progressResponse = await fetch('/api/campaign/progress/math');
    const progress = await progressResponse.json();

    document.getElementById('stars').textContent = progress.total_stars || 0;
    document.getElementById('coins').textContent = progress.coins || 0;
    document.getElementById('level').textContent = progress.current_level || 1;
  } catch (error) {
    console.log('Campaign progress not loaded yet');
  }

  // Load badges
  await loadBadges();
}

// Load badges
async function loadBadges() {
  try {
    const [earnedResponse, allResponse] = await Promise.all([
      fetch('/api/badges'),
      fetch('/api/badges/all')
    ]);

    const earnedBadges = await earnedResponse.json();
    const allBadges = await allResponse.json();

    const badgesGrid = document.getElementById('badges-grid');
    badgesGrid.innerHTML = '';

    const earnedIds = new Set(earnedBadges.map(b => b.id));

    allBadges.forEach(badge => {
      const isEarned = earnedIds.has(badge.id);
      const badgeCard = document.createElement('div');
      badgeCard.className = `badge-card ${isEarned ? '' : 'locked'}`;
      badgeCard.style.background = isEarned
        ? badge.color
        : '#e0e0e0';

      badgeCard.innerHTML = `
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-description">${badge.description}</div>
      `;

      badgesGrid.appendChild(badgeCard);
    });
  } catch (error) {
    console.error('Error loading badges:', error);
  }
}

// Start game
function startGame(gameType) {
  window.location.href = `/game?type=${gameType}`;
}

// Initialize dashboard
loadUserData();
