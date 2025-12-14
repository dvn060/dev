// Tab switching
function showTab(tabName) {
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const tabButtons = document.querySelectorAll('.tab-btn');

  if (tabName === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    tabButtons[0].classList.add('active');
    tabButtons[1].classList.remove('active');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    tabButtons[0].classList.remove('active');
    tabButtons[1].classList.add('active');
  }
}

// Show/hide email and avatar fields based on user type
document.querySelectorAll('input[name="user-type"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const emailGroup = document.getElementById('email-group');
    const avatarGroup = document.getElementById('avatar-group');

    if (e.target.value === 'parent') {
      emailGroup.style.display = 'flex';
      avatarGroup.style.display = 'none';
    } else {
      emailGroup.style.display = 'none';
      avatarGroup.style.display = 'flex';
    }
  });
});

// Show message
function showMessage(text, type) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = `message ${type} show`;

  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 5000);
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('Login successful! Redirecting...', 'success');
      setTimeout(() => {
        if (data.user.userType === 'parent') {
          window.location.href = '/parent';
        } else {
          window.location.href = '/dashboard';
        }
      }, 1000);
    } else {
      showMessage(data.error || 'Login failed', 'error');
    }
  } catch (error) {
    showMessage('Network error. Please try again.', 'error');
  }
});

// Register form
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const userType = document.querySelector('input[name="user-type"]:checked').value;
  const fullName = document.getElementById('register-name').value;
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const email = document.getElementById('register-email').value;
  const avatar = userType === 'child'
    ? document.querySelector('input[name="avatar"]:checked').value
    : null;

  if (password.length < 4) {
    showMessage('Password must be at least 4 characters', 'error');
    return;
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        fullName,
        email: email || null,
        userType,
        avatar,
        parentId: null
      })
    });

    const data = await response.json();

    if (response.ok) {
      showMessage('Account created! Please login.', 'success');
      setTimeout(() => {
        showTab('login');
        document.getElementById('login-username').value = username;
      }, 1500);
    } else {
      showMessage(data.error || 'Registration failed', 'error');
    }
  } catch (error) {
    showMessage('Network error. Please try again.', 'error');
  }
});
