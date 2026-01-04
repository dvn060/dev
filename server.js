const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'math-game-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Initialize database
db.initDatabase();

// Email configuration (you'll need to configure this with your email settings)
let transporter = null;

function setupEmailTransporter(config) {
  transporter = nodemailer.createTransport({
    host: config.host || 'smtp.gmail.com',
    port: config.port || 587,
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

// Schedule daily email reports at 8 PM
cron.schedule('0 20 * * *', () => {
  sendDailyReports();
});

function sendDailyReports() {
  if (!transporter) {
    console.log('Email transporter not configured. Skipping daily reports.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  db.db.all(`SELECT DISTINCT parent_id FROM users WHERE user_type = 'child' AND parent_id IS NOT NULL`, [], (err, parents) => {
    if (err) {
      console.error('Error fetching parents:', err);
      return;
    }

    parents.forEach(({ parent_id }) => {
      db.db.get(`SELECT * FROM users WHERE id = ?`, [parent_id], (err, parent) => {
        if (err || !parent || !parent.email) return;

        db.getChildrenStats(parent_id, (err, children) => {
          if (err) return;

          let reportHtml = `
            <h2>Daily Math Game Report - ${today}</h2>
            <p>Hello ${parent.full_name},</p>
            <p>Here's today's progress for your children:</p>
          `;

          children.forEach(child => {
            db.getDailyReport(child.id, today, (err, dailyStats) => {
              if (dailyStats && dailyStats.total_games > 0) {
                const accuracy = dailyStats.total_questions > 0
                  ? Math.round((dailyStats.total_correct / dailyStats.total_questions) * 100)
                  : 0;

                reportHtml += `
                  <div style="margin: 20px 0; padding: 15px; background-color: #f0f0f0; border-radius: 8px;">
                    <h3>${child.full_name}</h3>
                    <ul>
                      <li>Games Played: ${dailyStats.total_games}</li>
                      <li>Questions Answered: ${dailyStats.total_questions}</li>
                      <li>Correct Answers: ${dailyStats.total_correct}</li>
                      <li>Accuracy: ${accuracy}%</li>
                      <li>Time Played: ${Math.round(dailyStats.time_played / 60)} minutes</li>
                      ${dailyStats.badges_earned > 0 ? `<li>New Badges Earned: ${dailyStats.badges_earned} 🎉</li>` : ''}
                    </ul>
                  </div>
                `;
              }
            });
          });

          reportHtml += `
            <p>Keep up the great work!</p>
            <p><a href="http://localhost:${PORT}">View Full Dashboard</a></p>
          `;

          const mailOptions = {
            from: '"Kids Math Adventure" <noreply@mathgame.com>',
            to: parent.email,
            subject: `Daily Math Progress Report - ${today}`,
            html: reportHtml
          };

          transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
              console.error('Error sending email:', err);
            } else {
              console.log('Daily report sent to:', parent.email);
            }
          });
        });
      });
    });
  });
}

// API Routes

// Register new user
app.post('/api/register', (req, res) => {
  const { username, password, fullName, email, userType, avatar, parentId } = req.body;

  if (!username || !password || !fullName || !userType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.createUser(username, password, fullName, email, userType, avatar, parentId, (err, userId) => {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      return res.status(500).json({ error: 'Error creating user' });
    }

    res.json({ success: true, userId });
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.verifyUser(username, password, (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.userType = user.user_type;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        userType: user.user_type,
        avatar: user.avatar
      }
    });
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/user', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.db.get(`SELECT id, username, full_name, email, user_type, avatar FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(user);
    }
  );
});

// Submit game results
app.post('/api/game/submit', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { gameType, score, correctAnswers, totalQuestions, timeLimit, difficulty } = req.body;

  db.recordGameSession(
    req.session.userId,
    gameType,
    score,
    correctAnswers,
    totalQuestions,
    timeLimit,
    difficulty,
    (err, sessionId) => {
      if (err) {
        return res.status(500).json({ error: 'Error recording game' });
      }

      // Check for new badges
      db.checkAndAwardBadges(req.session.userId, (err, newBadges) => {
        if (err) {
          return res.json({ success: true, sessionId, newBadges: [] });
        }

        res.json({ success: true, sessionId, newBadges });
      });
    }
  );
});

// Get user stats
app.get('/api/stats', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.getUserStats(req.session.userId, (err, stats) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(stats);
  });
});

// Get user badges
app.get('/api/badges', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.getUserBadges(req.session.userId, (err, badges) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(badges);
  });
});

// Get all available badges
app.get('/api/badges/all', (req, res) => {
  db.db.all(`SELECT * FROM badges ORDER BY requirement_value`, [], (err, badges) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(badges);
  });
});

// Get recent games
app.get('/api/games/recent', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.db.all(`
    SELECT * FROM game_sessions
    WHERE user_id = ?
    ORDER BY played_at DESC
    LIMIT 10
  `, [req.session.userId], (err, games) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(games);
  });
});

// Parent routes
app.get('/api/parent/children', (req, res) => {
  if (!req.session.userId || req.session.userType !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }

  db.getChildrenStats(req.session.userId, (err, children) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(children);
  });
});

app.get('/api/parent/child/:childId/games', (req, res) => {
  if (!req.session.userId || req.session.userType !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }

  const childId = req.params.childId;

  // Verify this child belongs to this parent
  db.db.get(`SELECT * FROM users WHERE id = ? AND parent_id = ?`,
    [childId, req.session.userId],
    (err, child) => {
      if (err || !child) {
        return res.status(404).json({ error: 'Child not found' });
      }

      db.db.all(`
        SELECT * FROM game_sessions
        WHERE user_id = ?
        ORDER BY played_at DESC
        LIMIT 50
      `, [childId], (err, games) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(games);
      });
    }
  );
});

app.get('/api/parent/child/:childId/badges', (req, res) => {
  if (!req.session.userId || req.session.userType !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }

  const childId = req.params.childId;

  db.db.get(`SELECT * FROM users WHERE id = ? AND parent_id = ?`,
    [childId, req.session.userId],
    (err, child) => {
      if (err || !child) {
        return res.status(404).json({ error: 'Child not found' });
      }

      db.getUserBadges(childId, (err, badges) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(badges);
      });
    }
  );
});

// Email configuration endpoint (for parent setup)
app.post('/api/parent/email-config', (req, res) => {
  if (!req.session.userId || req.session.userType !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }

  const { host, port, user, pass } = req.body;

  try {
    setupEmailTransporter({ host, port, user, pass });
    res.json({ success: true, message: 'Email configured successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error configuring email' });
  }
});

// Test email endpoint
app.post('/api/parent/test-email', (req, res) => {
  if (!req.session.userId || req.session.userType !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }

  if (!transporter) {
    return res.status(400).json({ error: 'Email not configured' });
  }

  db.db.get(`SELECT email, full_name FROM users WHERE id = ?`, [req.session.userId], (err, parent) => {
    if (err || !parent || !parent.email) {
      return res.status(400).json({ error: 'No email address on file' });
    }

    const mailOptions = {
      from: '"Kids Math Adventure" <noreply@mathgame.com>',
      to: parent.email,
      subject: 'Test Email - Kids Math Adventure',
      html: `
        <h2>Email Configuration Test</h2>
        <p>Hello ${parent.full_name},</p>
        <p>Your email notifications are working correctly!</p>
        <p>You will receive daily progress reports for your children at 8 PM.</p>
      `
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error('Error sending test email:', err);
        return res.status(500).json({ error: 'Error sending email: ' + err.message });
      }
      res.json({ success: true, message: 'Test email sent!' });
    });
  });
});

// Campaign routes
app.get('/api/campaign/progress/:type', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const campaignType = req.params.type;
  db.getCampaignProgress(req.session.userId, campaignType, (err, progress) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(progress);
  });
});

app.post('/api/campaign/complete', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { campaignType, level, stage, correctAnswers, totalQuestions } = req.body;

  db.recordCampaignSession(
    req.session.userId,
    campaignType,
    level,
    stage,
    correctAnswers,
    totalQuestions,
    (err, results) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json({ success: true, ...results });
    }
  );
});

app.post('/api/campaign/advance-stage', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { campaignType, newStage } = req.body;

  db.updateCampaignStage(req.session.userId, campaignType, newStage, (err) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ success: true });
  });
});

// Avatar and customization routes
app.get('/api/avatar/items', (req, res) => {
  db.getAvatarItems((err, items) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(items);
  });
});

app.get('/api/pets/all', (req, res) => {
  db.getPets((err, pets) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(pets);
  });
});

app.get('/api/inventory', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.getUserInventory(req.session.userId, (err, inventory) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(inventory);
  });
});

app.get('/api/equipped', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  db.getEquippedItems(req.session.userId, (err, equipped) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json(equipped);
  });
});

app.post('/api/purchase', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { itemType, itemId, cost } = req.body;

  db.purchaseItem(req.session.userId, itemType, itemId, cost, (err, success) => {
    if (err) {
      if (err.message === 'Not enough coins') {
        return res.status(400).json({ error: 'Not enough coins' });
      }
      return res.status(500).json({ error: 'Server error' });
    }

    if (!success) {
      return res.status(400).json({ error: 'Item already owned' });
    }

    res.json({ success: true });
  });
});

app.post('/api/equip', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { slotType, itemId } = req.body;

  db.equipItem(req.session.userId, slotType, itemId, (err) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ success: true });
  });
});

app.post('/api/unlock-starter-items', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  // Unlock starter items (level 1, cost 0)
  db.db.all(`SELECT id, category FROM avatar_items WHERE unlock_level = 1 AND unlock_cost = 0`, [], (err, items) => {
    if (err) return res.status(500).json({ error: 'Server error' });

    const promises = items.map(item => {
      return new Promise((resolve) => {
        db.unlockItem(req.session.userId, 'avatar_item', item.id, () => {
          // Auto-equip starter items
          db.equipItem(req.session.userId, item.category, item.id, resolve);
        });
      });
    });

    // Also unlock starter pet
    db.db.get(`SELECT id FROM pets WHERE unlock_cost = 0`, [], (err, pet) => {
      if (pet) {
        db.unlockItem(req.session.userId, 'pet', pet.id, () => {
          db.equipItem(req.session.userId, 'active_pet', pet.id, () => {
            Promise.all(promises).then(() => {
              res.json({ success: true });
            });
          });
        });
      } else {
        Promise.all(promises).then(() => {
          res.json({ success: true });
        });
      }
    });
  });
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/parent', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'parent.html'));
});

app.get('/campaign', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'campaign.html'));
});

app.get('/avatar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'avatar.html'));
});

app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

app.get('/sounditout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sounditout.html'));
});

app.get('/listenchoose', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'listenchoose.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎮 Kids Math Adventure Game Server 🎮   ║
╚═══════════════════════════════════════════╝

Server running on: http://localhost:${PORT}

📚 Ready for learning and fun!
  `);
});
