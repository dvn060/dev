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

    // Campaign progress table
    db.run(`CREATE TABLE IF NOT EXISTS campaign_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      campaign_type TEXT NOT NULL CHECK(campaign_type IN ('math', 'reading')),
      current_level INTEGER DEFAULT 1,
      current_stage INTEGER DEFAULT 1,
      total_stars INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 100,
      experience INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, campaign_type)
    )`);

    // Avatar items table (all available items in the game)
    db.run(`CREATE TABLE IF NOT EXISTS avatar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('hair', 'eyes', 'mouth', 'outfit', 'accessory', 'background')),
      icon TEXT NOT NULL,
      unlock_level INTEGER DEFAULT 1,
      unlock_type TEXT NOT NULL CHECK(unlock_type IN ('level', 'coins', 'stars')),
      unlock_cost INTEGER DEFAULT 0,
      rarity TEXT DEFAULT 'common' CHECK(rarity IN ('common', 'rare', 'epic', 'legendary'))
    )`);

    // Pets/companions table
    db.run(`CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      description TEXT NOT NULL,
      unlock_level INTEGER DEFAULT 1,
      unlock_cost INTEGER DEFAULT 50,
      rarity TEXT DEFAULT 'common' CHECK(rarity IN ('common', 'rare', 'epic', 'legendary')),
      special_ability TEXT
    )`);

    // User inventory (items and pets the user has unlocked)
    db.run(`CREATE TABLE IF NOT EXISTS user_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('avatar_item', 'pet')),
      item_id INTEGER NOT NULL,
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, item_type, item_id)
    )`);

    // User equipped items (what the user currently has on their avatar)
    db.run(`CREATE TABLE IF NOT EXISTS user_equipped (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      slot_type TEXT NOT NULL CHECK(slot_type IN ('hair', 'eyes', 'mouth', 'outfit', 'accessory', 'background', 'active_pet')),
      item_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, slot_type)
    )`);

    // Campaign sessions (untimed practice sessions)
    db.run(`CREATE TABLE IF NOT EXISTS campaign_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      campaign_type TEXT NOT NULL,
      level INTEGER NOT NULL,
      stage INTEGER NOT NULL,
      stars_earned INTEGER DEFAULT 0,
      coins_earned INTEGER DEFAULT 0,
      experience_earned INTEGER DEFAULT 0,
      correct_answers INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
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

    // Insert default avatar items
    const avatarItems = [
      // Hair styles
      { name: 'Short Hair', category: 'hair', icon: '🧑', unlock_level: 1, unlock_type: 'level', unlock_cost: 0, rarity: 'common' },
      { name: 'Long Hair', category: 'hair', icon: '👩', unlock_level: 2, unlock_type: 'coins', unlock_cost: 50, rarity: 'common' },
      { name: 'Curly Hair', category: 'hair', icon: '🧒', unlock_level: 5, unlock_type: 'coins', unlock_cost: 100, rarity: 'rare' },
      { name: 'Rainbow Hair', category: 'hair', icon: '🌈', unlock_level: 10, unlock_type: 'stars', unlock_cost: 50, rarity: 'epic' },
      { name: 'Crown Hair', category: 'hair', icon: '👑', unlock_level: 15, unlock_type: 'stars', unlock_cost: 100, rarity: 'legendary' },

      // Eyes
      { name: 'Happy Eyes', category: 'eyes', icon: '😊', unlock_level: 1, unlock_type: 'level', unlock_cost: 0, rarity: 'common' },
      { name: 'Cool Eyes', category: 'eyes', icon: '😎', unlock_level: 3, unlock_type: 'coins', unlock_cost: 75, rarity: 'common' },
      { name: 'Star Eyes', category: 'eyes', icon: '🤩', unlock_level: 7, unlock_type: 'coins', unlock_cost: 150, rarity: 'rare' },
      { name: 'Heart Eyes', category: 'eyes', icon: '😍', unlock_level: 12, unlock_type: 'stars', unlock_cost: 75, rarity: 'epic' },

      // Outfits
      { name: 'Casual Outfit', category: 'outfit', icon: '👕', unlock_level: 1, unlock_type: 'level', unlock_cost: 0, rarity: 'common' },
      { name: 'Sports Outfit', category: 'outfit', icon: '⚽', unlock_level: 4, unlock_type: 'coins', unlock_cost: 100, rarity: 'common' },
      { name: 'Superhero Outfit', category: 'outfit', icon: '🦸', unlock_level: 8, unlock_type: 'coins', unlock_cost: 200, rarity: 'rare' },
      { name: 'Wizard Robe', category: 'outfit', icon: '🧙', unlock_level: 12, unlock_type: 'stars', unlock_cost: 80, rarity: 'epic' },
      { name: 'Royal Outfit', category: 'outfit', icon: '🤴', unlock_level: 20, unlock_type: 'stars', unlock_cost: 150, rarity: 'legendary' },

      // Accessories
      { name: 'Backpack', category: 'accessory', icon: '🎒', unlock_level: 2, unlock_type: 'coins', unlock_cost: 25, rarity: 'common' },
      { name: 'Magic Wand', category: 'accessory', icon: '🪄', unlock_level: 6, unlock_type: 'coins', unlock_cost: 125, rarity: 'rare' },
      { name: 'Shield', category: 'accessory', icon: '🛡️', unlock_level: 9, unlock_type: 'stars', unlock_cost: 60, rarity: 'rare' },
      { name: 'Light Saber', category: 'accessory', icon: '⚔️', unlock_level: 14, unlock_type: 'stars', unlock_cost: 120, rarity: 'epic' },

      // Backgrounds
      { name: 'Grass Field', category: 'background', icon: '🌿', unlock_level: 1, unlock_type: 'level', unlock_cost: 0, rarity: 'common' },
      { name: 'Beach', category: 'background', icon: '🏖️', unlock_level: 3, unlock_type: 'coins', unlock_cost: 80, rarity: 'common' },
      { name: 'Space', category: 'background', icon: '🌌', unlock_level: 8, unlock_type: 'coins', unlock_cost: 180, rarity: 'rare' },
      { name: 'Castle', category: 'background', icon: '🏰', unlock_level: 15, unlock_type: 'stars', unlock_cost: 100, rarity: 'epic' },
      { name: 'Rainbow Land', category: 'background', icon: '🌈', unlock_level: 25, unlock_type: 'stars', unlock_cost: 200, rarity: 'legendary' }
    ];

    const itemStmt = db.prepare(`INSERT OR IGNORE INTO avatar_items (name, category, icon, unlock_level, unlock_type, unlock_cost, rarity) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    avatarItems.forEach(item => {
      itemStmt.run(item.name, item.category, item.icon, item.unlock_level, item.unlock_type, item.unlock_cost, item.rarity);
    });
    itemStmt.finalize();

    // Insert default pets
    const pets = [
      { name: 'Puppy', icon: '🐶', description: 'A loyal friend who loves math!', unlock_level: 1, unlock_cost: 0, rarity: 'common', special_ability: 'Bonus XP +5%' },
      { name: 'Kitten', icon: '🐱', description: 'Curious and playful!', unlock_level: 2, unlock_cost: 100, rarity: 'common', special_ability: 'Bonus Coins +5%' },
      { name: 'Bunny', icon: '🐰', description: 'Hops with joy for every answer!', unlock_level: 4, unlock_cost: 150, rarity: 'common', special_ability: 'Extra Star Chance +10%' },
      { name: 'Dragon', icon: '🐉', description: 'A mighty companion!', unlock_level: 7, unlock_cost: 300, rarity: 'rare', special_ability: 'Bonus XP +10%' },
      { name: 'Unicorn', icon: '🦄', description: 'Magical and rare!', unlock_level: 10, unlock_cost: 500, rarity: 'epic', special_ability: 'Bonus Stars +15%' },
      { name: 'Phoenix', icon: '🔥', description: 'Rises from the ashes!', unlock_level: 15, unlock_cost: 800, rarity: 'epic', special_ability: 'Second Chance on Wrong Answers' },
      { name: 'Robot', icon: '🤖', description: 'Calculates perfectly!', unlock_level: 12, unlock_cost: 600, rarity: 'rare', special_ability: 'Show Hints' },
      { name: 'Owl', icon: '🦉', description: 'Wise and knowledgeable!', unlock_level: 8, unlock_cost: 400, rarity: 'rare', special_ability: 'Reading Bonus +10%' },
      { name: 'Turtle', icon: '🐢', description: 'Slow and steady wins!', unlock_level: 5, unlock_cost: 200, rarity: 'common', special_ability: 'Extra Time in Challenges' },
      { name: 'Pegasus', icon: '🦄✨', description: 'Legendary flying horse!', unlock_level: 20, unlock_cost: 1000, rarity: 'legendary', special_ability: 'All Bonuses +20%' }
    ];

    const petStmt = db.prepare(`INSERT OR IGNORE INTO pets (name, icon, description, unlock_level, unlock_cost, rarity, special_ability) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    pets.forEach(pet => {
      petStmt.run(pet.name, pet.icon, pet.description, pet.unlock_level, pet.unlock_cost, pet.rarity, pet.special_ability);
    });
    petStmt.finalize();

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

// Campaign functions
function getCampaignProgress(userId, campaignType, callback) {
  db.get(`
    SELECT * FROM campaign_progress
    WHERE user_id = ? AND campaign_type = ?
  `, [userId, campaignType], (err, progress) => {
    if (err) return callback(err);

    // If no progress exists, create initial progress
    if (!progress) {
      db.run(
        `INSERT INTO campaign_progress (user_id, campaign_type, current_level, current_stage, coins)
         VALUES (?, ?, 1, 1, 100)`,
        [userId, campaignType],
        function(err) {
          if (err) return callback(err);
          getCampaignProgress(userId, campaignType, callback);
        }
      );
    } else {
      callback(null, progress);
    }
  });
}

function recordCampaignSession(userId, campaignType, level, stage, correct, total, callback) {
  // Calculate rewards based on performance
  const accuracy = total > 0 ? (correct / total) : 0;
  let starsEarned = 0;
  if (accuracy >= 0.95) starsEarned = 3;
  else if (accuracy >= 0.80) starsEarned = 2;
  else if (accuracy >= 0.60) starsEarned = 1;

  const coinsEarned = Math.floor(correct * 10 + starsEarned * 20);
  const experienceEarned = Math.floor(correct * 15 + starsEarned * 30);

  // Record the session
  db.run(
    `INSERT INTO campaign_sessions (user_id, campaign_type, level, stage, stars_earned, coins_earned, experience_earned, correct_answers, total_questions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, campaignType, level, stage, starsEarned, coinsEarned, experienceEarned, correct, total],
    function(err) {
      if (err) return callback(err);

      // Update campaign progress
      db.run(
        `UPDATE campaign_progress
         SET total_stars = total_stars + ?,
             coins = coins + ?,
             experience = experience + ?
         WHERE user_id = ? AND campaign_type = ?`,
        [starsEarned, coinsEarned, experienceEarned, userId, campaignType],
        (err) => {
          if (err) return callback(err);

          // Check if player should level up (every 100 XP)
          db.get(
            `SELECT * FROM campaign_progress WHERE user_id = ? AND campaign_type = ?`,
            [userId, campaignType],
            (err, progress) => {
              if (err) return callback(err);

              const newLevel = Math.floor(progress.experience / 100) + 1;
              if (newLevel > progress.current_level) {
                db.run(
                  `UPDATE campaign_progress SET current_level = ? WHERE user_id = ? AND campaign_type = ?`,
                  [newLevel, userId, campaignType],
                  (err) => {
                    if (err) return callback(err);
                    callback(null, { starsEarned, coinsEarned, experienceEarned, leveledUp: true, newLevel });
                  }
                );
              } else {
                callback(null, { starsEarned, coinsEarned, experienceEarned, leveledUp: false });
              }
            }
          );
        }
      );
    }
  );
}

function updateCampaignStage(userId, campaignType, newStage, callback) {
  db.run(
    `UPDATE campaign_progress SET current_stage = ? WHERE user_id = ? AND campaign_type = ?`,
    [newStage, userId, campaignType],
    callback
  );
}

// Avatar and item functions
function getAvatarItems(callback) {
  db.all(`SELECT * FROM avatar_items ORDER BY category, unlock_level`, [], callback);
}

function getPets(callback) {
  db.all(`SELECT * FROM pets ORDER BY unlock_level`, [], callback);
}

function getUserInventory(userId, callback) {
  db.all(`
    SELECT ui.*,
           CASE
             WHEN ui.item_type = 'avatar_item' THEN ai.name
             WHEN ui.item_type = 'pet' THEN p.name
           END as item_name,
           CASE
             WHEN ui.item_type = 'avatar_item' THEN ai.icon
             WHEN ui.item_type = 'pet' THEN p.icon
           END as item_icon,
           CASE
             WHEN ui.item_type = 'avatar_item' THEN ai.category
             ELSE 'pet'
           END as category
    FROM user_inventory ui
    LEFT JOIN avatar_items ai ON ui.item_type = 'avatar_item' AND ui.item_id = ai.id
    LEFT JOIN pets p ON ui.item_type = 'pet' AND ui.item_id = p.id
    WHERE ui.user_id = ?
  `, [userId], callback);
}

function unlockItem(userId, itemType, itemId, callback) {
  db.run(
    `INSERT OR IGNORE INTO user_inventory (user_id, item_type, item_id) VALUES (?, ?, ?)`,
    [userId, itemType, itemId],
    function(err) {
      callback(err, this.changes > 0);
    }
  );
}

function purchaseItem(userId, itemType, itemId, cost, callback) {
  // First check if user has enough coins
  getCampaignProgress(userId, 'math', (err, progress) => {
    if (err) return callback(err);

    if (progress.coins < cost) {
      return callback(new Error('Not enough coins'));
    }

    // Deduct coins
    db.run(
      `UPDATE campaign_progress SET coins = coins - ? WHERE user_id = ? AND campaign_type = 'math'`,
      [cost, userId],
      (err) => {
        if (err) return callback(err);

        // Unlock the item
        unlockItem(userId, itemType, itemId, callback);
      }
    );
  });
}

function equipItem(userId, slotType, itemId, callback) {
  db.run(
    `INSERT INTO user_equipped (user_id, slot_type, item_id)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, slot_type)
     DO UPDATE SET item_id = ?`,
    [userId, slotType, itemId, itemId],
    callback
  );
}

function getEquippedItems(userId, callback) {
  db.all(`
    SELECT ue.*,
           CASE
             WHEN ue.slot_type = 'active_pet' THEN p.icon
             ELSE ai.icon
           END as icon,
           CASE
             WHEN ue.slot_type = 'active_pet' THEN p.name
             ELSE ai.name
           END as name
    FROM user_equipped ue
    LEFT JOIN avatar_items ai ON ue.slot_type != 'active_pet' AND ue.item_id = ai.id
    LEFT JOIN pets p ON ue.slot_type = 'active_pet' AND ue.item_id = p.id
    WHERE ue.user_id = ?
  `, [userId], callback);
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
  getDailyReport,
  getCampaignProgress,
  recordCampaignSession,
  updateCampaignStage,
  getAvatarItems,
  getPets,
  getUserInventory,
  unlockItem,
  purchaseItem,
  equipItem,
  getEquippedItems
};
