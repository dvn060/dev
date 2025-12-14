const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'mathgame.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Users table (both kids and parents)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      user_type TEXT NOT NULL CHECK(user_type IN ('child', 'parent')),
      avatar TEXT,
      parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES users(id)
    )`);

    // Game sessions table
    db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_type TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      time_limit INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Badges table
    db.run(`CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER NOT NULL,
      color TEXT NOT NULL
    )`);

    // User badges table (tracks which badges users have earned)
    db.run(`CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_id INTEGER NOT NULL,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (badge_id) REFERENCES badges(id),
      UNIQUE(user_id, badge_id)
    )`);

    // Daily stats table for email reports
    db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      total_games INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      total_questions INTEGER DEFAULT 0,
      time_played INTEGER DEFAULT 0,
      badges_earned INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, date)
    )`);

    // Insert default badges
    const badges = [
      { name: 'First Steps', description: 'Played your first game!', icon: '🌟', requirement_type: 'games_played', requirement_value: 1, color: '#FFD700' },
      { name: 'Quick Learner', description: 'Answered 10 questions correctly', icon: '🎯', requirement_type: 'correct_answers', requirement_value: 10, color: '#FF6B6B' },
      { name: 'Math Whiz', description: 'Answered 50 questions correctly', icon: '🧠', requirement_type: 'correct_answers', requirement_value: 50, color: '#4ECDC4' },
      { name: 'Speed Demon', description: 'Scored 20+ in a 60-second game', icon: '⚡', requirement_type: 'high_score', requirement_value: 20, color: '#95E1D3' },
      { name: 'Dedication', description: 'Played 10 games', icon: '🏆', requirement_type: 'games_played', requirement_value: 10, color: '#F38181' },
      { name: 'Math Master', description: 'Answered 100 questions correctly', icon: '👑', requirement_type: 'correct_answers', requirement_value: 100, color: '#AA96DA' },
      { name: 'Perfect Score', description: 'Got 100% accuracy in a game', icon: '💯', requirement_type: 'perfect_game', requirement_value: 1, color: '#FCBAD3' },
      { name: 'Persistent', description: 'Played 25 games', icon: '🔥', requirement_type: 'games_played', requirement_value: 25, color: '#FF9A76' },
      { name: 'Champion', description: 'Scored 30+ in a 60-second game', icon: '🥇', requirement_type: 'high_score', requirement_value: 30, color: '#FFD93D' },
      { name: 'Super Star', description: 'Answered 250 questions correctly', icon: '⭐', requirement_type: 'correct_answers', requirement_value: 250, color: '#6BCB77' }
    ];

    const stmt = db.prepare(`INSERT OR IGNORE INTO badges (name, description, icon, requirement_type, requirement_value, color) VALUES (?, ?, ?, ?, ?, ?)`);
    badges.forEach(badge => {
      stmt.run(badge.name, badge.description, badge.icon, badge.requirement_type, badge.requirement_value, badge.color);
    });
    stmt.finalize();

    console.log('Database initialized successfully!');
  });
}

// Helper functions
function createUser(username, password, fullName, email, userType, avatar, parentId, callback) {
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return callback(err);

    db.run(
      `INSERT INTO users (username, password, full_name, email, user_type, avatar, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, hash, fullName, email, userType, avatar, parentId],
      function(err) {
        callback(err, this.lastID);
      }
    );
  });
}

function verifyUser(username, password, callback) {
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return callback(err);
    if (!user) return callback(null, null);

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) return callback(err);
      callback(null, result ? user : null);
    });
  });
}

function recordGameSession(userId, gameType, score, correct, total, timeLimit, difficulty, callback) {
  db.run(
    `INSERT INTO game_sessions (user_id, game_type, score, correct_answers, total_questions, time_limit, difficulty)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, gameType, score, correct, total, timeLimit, difficulty],
    function(err) {
      if (err) return callback(err);

      // Update daily stats
      const today = new Date().toISOString().split('T')[0];
      db.run(
        `INSERT INTO daily_stats (user_id, date, total_games, total_correct, total_questions, time_played)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET
           total_games = total_games + 1,
           total_correct = total_correct + ?,
           total_questions = total_questions + ?,
           time_played = time_played + ?`,
        [userId, today, correct, total, timeLimit, correct, total, timeLimit],
        (err) => {
          callback(err, this.lastID);
        }
      );
    }
  );
}

function checkAndAwardBadges(userId, callback) {
  // Get user stats
  db.get(`
    SELECT
      COUNT(*) as games_played,
      SUM(correct_answers) as total_correct,
      MAX(score) as highest_score
    FROM game_sessions
    WHERE user_id = ?
  `, [userId], (err, stats) => {
    if (err) return callback(err);

    // Check for perfect games
    db.get(`
      SELECT COUNT(*) as perfect_games
      FROM game_sessions
      WHERE user_id = ? AND correct_answers = total_questions AND total_questions > 0
    `, [userId], (err, perfectStats) => {
      if (err) return callback(err);

      // Get all badges and check which ones should be awarded
      db.all(`SELECT * FROM badges`, [], (err, badges) => {
        if (err) return callback(err);

        const newBadges = [];
        badges.forEach(badge => {
          let earned = false;

          switch(badge.requirement_type) {
            case 'games_played':
              earned = stats.games_played >= badge.requirement_value;
              break;
            case 'correct_answers':
              earned = stats.total_correct >= badge.requirement_value;
              break;
            case 'high_score':
              earned = stats.highest_score >= badge.requirement_value;
              break;
            case 'perfect_game':
              earned = perfectStats.perfect_games >= badge.requirement_value;
              break;
          }

          if (earned) {
            // Try to award badge (will be ignored if already earned)
            db.run(
              `INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)`,
              [userId, badge.id],
              function(err) {
                if (!err && this.changes > 0) {
                  newBadges.push(badge);

                  // Update daily stats badge count
                  const today = new Date().toISOString().split('T')[0];
                  db.run(
                    `UPDATE daily_stats SET badges_earned = badges_earned + 1
                     WHERE user_id = ? AND date = ?`,
                    [userId, today]
                  );
                }
              }
            );
          }
        });

        setTimeout(() => callback(null, newBadges), 100);
      });
    });
  });
}

function getUserBadges(userId, callback) {
  db.all(`
    SELECT b.*, ub.earned_at
    FROM badges b
    JOIN user_badges ub ON b.id = ub.badge_id
    WHERE ub.user_id = ?
    ORDER BY ub.earned_at DESC
  `, [userId], callback);
}

function getUserStats(userId, callback) {
  db.get(`
    SELECT
      COUNT(*) as total_games,
      SUM(correct_answers) as total_correct,
      SUM(total_questions) as total_questions,
      MAX(score) as highest_score,
      AVG(score) as avg_score
    FROM game_sessions
    WHERE user_id = ?
  `, [userId], callback);
}

function getChildrenStats(parentId, callback) {
  db.all(`
    SELECT
      u.id,
      u.username,
      u.full_name,
      u.avatar,
      COUNT(gs.id) as total_games,
      SUM(gs.correct_answers) as total_correct,
      SUM(gs.total_questions) as total_questions,
      MAX(gs.score) as highest_score,
      COUNT(DISTINCT ub.badge_id) as badges_earned,
      MAX(gs.played_at) as last_played
    FROM users u
    LEFT JOIN game_sessions gs ON u.id = gs.user_id
    LEFT JOIN user_badges ub ON u.id = ub.user_id
    WHERE u.parent_id = ?
    GROUP BY u.id
  `, [parentId], callback);
}

function getDailyReport(userId, date, callback) {
  db.get(`
    SELECT * FROM daily_stats
    WHERE user_id = ? AND date = ?
  `, [userId, date], callback);
}

module.exports = {
  db,
  initDatabase,
  createUser,
  verifyUser,
  recordGameSession,
  checkAndAwardBadges,
  getUserBadges,
  getUserStats,
  getChildrenStats,
  getDailyReport
};
