// Check if user is logged in as parent
async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      window.location.href = '/';
      return null;
    }
    const user = await response.json();
    if (user.user_type !== 'parent') {
      window.location.href = '/dashboard';
      return null;
    }
    return user;
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

// Show message
function showMessage(elementId, text, type) {
  const messageEl = document.getElementById(elementId);
  messageEl.textContent = text;
  messageEl.className = `message ${type} show`;

  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 5000);
}

// Load parent data
async function loadParentData() {
  const user = await checkAuth();
  if (!user) return;

  document.getElementById('parent-name').textContent = user.full_name;

  // Load children
  await loadChildren();
}

// Add child
document.getElementById('add-child-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('child-name').value;
  const username = document.getElementById('child-username').value;
  const password = document.getElementById('child-password').value;
  const avatar = document.querySelector('input[name="child-avatar"]:checked').value;

  const user = await checkAuth();
  if (!user) return;

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        fullName: name,
        email: null,
        userType: 'child',
        avatar,
        parentId: user.id
      })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('add-child-message', 'Child account created successfully!', 'success');
      document.getElementById('add-child-form').reset();
      await loadChildren();
    } else {
      showMessage('add-child-message', data.error || 'Failed to create child account', 'error');
    }
  } catch (error) {
    showMessage('add-child-message', 'Network error. Please try again.', 'error');
  }
});

// Load children
async function loadChildren() {
  try {
    const response = await fetch('/api/parent/children');
    const children = await response.json();

    const grid = document.getElementById('children-grid');
    grid.innerHTML = '';

    if (children.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: white; border-radius: 15px;">
          <p style="font-size: 1.5em; color: #666;">No children added yet. Add your first child above!</p>
        </div>
      `;
      return;
    }

    children.forEach(child => {
      const accuracy = child.total_questions > 0
        ? Math.round((child.total_correct / child.total_questions) * 100)
        : 0;

      const card = document.createElement('div');
      card.className = 'child-card';
      card.onclick = () => viewChildDetails(child.id);

      card.innerHTML = `
        <div class="child-header">
          <div class="child-avatar">${child.avatar || '👶'}</div>
          <div class="child-info">
            <h3>${child.full_name}</h3>
            <p style="color: #666;">@${child.username}</p>
          </div>
        </div>

        <div class="child-stats">
          <div class="child-stat">
            <div class="child-stat-value">${child.total_games || 0}</div>
            <div class="child-stat-label">Games</div>
          </div>
          <div class="child-stat">
            <div class="child-stat-value">${child.highest_score || 0}</div>
            <div class="child-stat-label">High Score</div>
          </div>
          <div class="child-stat">
            <div class="child-stat-value">${accuracy}%</div>
            <div class="child-stat-label">Accuracy</div>
          </div>
          <div class="child-stat">
            <div class="child-stat-value">${child.badges_earned || 0}</div>
            <div class="child-stat-label">Badges</div>
          </div>
        </div>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0; color: #999; font-size: 0.9em;">
          Last played: ${child.last_played ? new Date(child.last_played).toLocaleDateString() : 'Never'}
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading children:', error);
  }
}

// View child details
async function viewChildDetails(childId) {
  try {
    const [gamesResponse, badgesResponse] = await Promise.all([
      fetch(`/api/parent/child/${childId}/games`),
      fetch(`/api/parent/child/${childId}/badges`)
    ]);

    const games = await gamesResponse.json();
    const badges = await badgesResponse.json();

    const modal = document.getElementById('child-modal');
    const content = document.getElementById('child-detail-content');

    // Calculate stats
    const totalGames = games.length;
    const totalCorrect = games.reduce((sum, g) => sum + g.correct_answers, 0);
    const totalQuestions = games.reduce((sum, g) => sum + g.total_questions, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const highScore = games.length > 0 ? Math.max(...games.map(g => g.score)) : 0;

    content.innerHTML = `
      <h2 style="color: #333; margin-bottom: 30px;">Detailed Progress Report</h2>

      <div class="stats-grid" style="margin-bottom: 30px;">
        <div class="stat-card">
          <div class="stat-icon">🎮</div>
          <div class="stat-value">${totalGames}</div>
          <div class="stat-label">Total Games</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${totalCorrect}</div>
          <div class="stat-label">Correct Answers</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🎯</div>
          <div class="stat-value">${accuracy}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-value">${highScore}</div>
          <div class="stat-label">High Score</div>
        </div>
      </div>

      <div style="margin-bottom: 30px;">
        <h3 style="color: #333; margin-bottom: 15px;">🏅 Badges Earned (${badges.length})</h3>
        <div class="badges-grid">
          ${badges.length > 0 ? badges.map(badge => `
            <div class="badge-card" style="background: ${badge.color};">
              <div class="badge-icon">${badge.icon}</div>
              <div class="badge-name">${badge.name}</div>
              <div class="badge-description">${badge.description}</div>
            </div>
          `).join('') : '<p style="color: #666;">No badges earned yet</p>'}
        </div>
      </div>

      <div>
        <h3 style="color: #333; margin-bottom: 15px;">📊 Recent Games</h3>
        <div style="background: #f9f9f9; border-radius: 10px; padding: 20px; max-height: 400px; overflow-y: auto;">
          ${games.length > 0 ? games.slice(0, 20).map(game => {
            const gameAccuracy = game.total_questions > 0
              ? Math.round((game.correct_answers / game.total_questions) * 100)
              : 0;
            return `
              <div style="background: white; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong style="color: #333;">${game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)}</strong>
                    <span style="color: #999; margin-left: 10px;">${new Date(game.played_at).toLocaleString()}</span>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 1.5em; font-weight: bold; color: #f5576c;">${game.score} pts</div>
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;">
                  <div>
                    <small style="color: #666;">Correct:</small>
                    <div style="font-weight: bold; color: #28a745;">${game.correct_answers}</div>
                  </div>
                  <div>
                    <small style="color: #666;">Wrong:</small>
                    <div style="font-weight: bold; color: #dc3545;">${game.total_questions - game.correct_answers}</div>
                  </div>
                  <div>
                    <small style="color: #666;">Accuracy:</small>
                    <div style="font-weight: bold; color: #667eea;">${gameAccuracy}%</div>
                  </div>
                  <div>
                    <small style="color: #666;">Time:</small>
                    <div style="font-weight: bold;">${game.time_limit}s</div>
                  </div>
                </div>
              </div>
            `;
          }).join('') : '<p style="color: #666;">No games played yet</p>'}
        </div>
      </div>
    `;

    modal.style.display = 'block';
  } catch (error) {
    console.error('Error loading child details:', error);
    alert('Error loading child details');
  }
}

// Close child modal
function closeChildModal() {
  document.getElementById('child-modal').style.display = 'none';
}

// Configure email
async function configureEmail() {
  const host = document.getElementById('smtp-host').value;
  const port = document.getElementById('smtp-port').value;
  const user = document.getElementById('smtp-user').value;
  const pass = document.getElementById('smtp-pass').value;

  if (!host || !port || !user || !pass) {
    showMessage('email-message', 'Please fill in all email settings', 'error');
    return;
  }

  try {
    const response = await fetch('/api/parent/email-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, pass })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('email-message', 'Email settings saved successfully!', 'success');
    } else {
      showMessage('email-message', data.error || 'Failed to save email settings', 'error');
    }
  } catch (error) {
    showMessage('email-message', 'Network error. Please try again.', 'error');
  }
}

// Test email
async function testEmail() {
  try {
    const response = await fetch('/api/parent/test-email', {
      method: 'POST'
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('email-message', 'Test email sent! Check your inbox.', 'success');
    } else {
      showMessage('email-message', data.error || 'Failed to send test email', 'error');
    }
  } catch (error) {
    showMessage('email-message', 'Network error. Please try again.', 'error');
  }
}

// Close modal on background click
document.getElementById('child-modal').addEventListener('click', (e) => {
  if (e.target.id === 'child-modal') {
    closeChildModal();
  }
});

// Initialize
loadParentData();
