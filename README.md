# 🎮 Kids Math Adventure Game

A fun, engaging, and educational web-based math game designed for young children (ages 4-7) to practice basic addition skills while earning badges and rewards!

## ✨ Features

### For Kids:
- 🎯 **Timed Addition Challenges** - Answer as many addition problems as possible within customizable time limits (30s, 60s, 90s, 2min, 3min, 5min)
- 🏆 **Badge System** - Earn 10+ different badges for achievements (First Steps, Math Whiz, Speed Demon, Champion, etc.)
- 👤 **Personalized Profiles** - Create accounts with custom avatars (🦁🐼🦄🐸🦊🐨🦋🐙)
- 📊 **Progress Tracking** - View personal statistics and game history
- 🎨 **Colorful, Kid-Friendly Design** - Bright colors, animations, and fun feedback
- 🎉 **Instant Feedback** - Confetti celebrations for correct answers!

### For Parents:
- 👨‍👩‍👧‍👦 **Parent Dashboard** - View all children's progress in one place
- 📧 **Daily Email Reports** - Automatic daily summaries of children's activity sent at 8 PM
- 📈 **Detailed Analytics** - Track games played, accuracy, high scores, and badges earned
- 👶 **Multiple Children Support** - Manage accounts for multiple kids
- 🔒 **Secure** - Password-protected accounts with separate parent/child access

### Difficulty Levels:
- **Easy** - Numbers 1-10
- **Medium** - Numbers 1-20
- **Hard** - Numbers 1-50
- **Expert** - Numbers 1-100

## 🚀 Quick Start (Windows)

### Prerequisites

1. **Install Node.js**
   - Download from: https://nodejs.org/
   - Choose the LTS (Long Term Support) version
   - Run the installer and follow the prompts
   - Verify installation by opening Command Prompt and typing:
     ```
     node --version
     npm --version
     ```

### Installation

1. **Download or Clone this Repository**
   - If you have Git: `git clone <repository-url>`
   - Or download as ZIP and extract

2. **Open Command Prompt**
   - Press `Windows + R`
   - Type `cmd` and press Enter
   - Navigate to the project folder:
     ```
     cd path\to\kids-math-adventure
     ```

3. **Install Dependencies**
   ```
   npm install
   ```

4. **Start the Server**
   ```
   npm start
   ```

5. **Open in Browser**
   - Open your web browser (Chrome, Edge, Firefox, etc.)
   - Go to: `http://localhost:3000`

The game is now running on your local network! 🎉

## 🌐 Access from Other Devices on Your Network

To let your kids play from tablets or other computers on your home network:

1. **Find Your Computer's IP Address**
   - Open Command Prompt
   - Type: `ipconfig`
   - Look for "IPv4 Address" under your network adapter (usually starts with 192.168.x.x)

2. **Access from Other Devices**
   - On the other device, open a web browser
   - Go to: `http://YOUR-IP-ADDRESS:3000`
   - Example: `http://192.168.1.100:3000`

3. **Firewall Settings**
   - If you can't connect, you may need to allow Node.js through Windows Firewall:
     - Go to Windows Defender Firewall
     - Click "Allow an app through firewall"
     - Find Node.js and check both "Private" and "Public"

## 📧 Email Configuration (Optional)

To receive daily progress reports via email:

1. **Gmail Setup (Recommended)**
   - Log in to your Gmail account
   - Enable 2-factor authentication if not already enabled
   - Create an App Password:
     - Go to https://myaccount.google.com/security
     - Click "2-Step Verification"
     - Scroll down to "App passwords"
     - Generate a new app password for "Mail"
     - Copy the 16-character password

2. **Configure in Parent Dashboard**
   - Log in to your parent account
   - Go to the Email Settings section
   - Enter:
     - SMTP Host: `smtp.gmail.com`
     - SMTP Port: `587`
     - Email Username: Your Gmail address
     - Email Password: The App Password you generated
   - Click "Save Email Settings"
   - Click "Send Test Email" to verify

3. **Daily Reports**
   - Reports are automatically sent at 8 PM every day
   - They include:
     - Games played today
     - Questions answered
     - Accuracy percentage
     - Time spent playing
     - New badges earned

## 🎮 How to Use

### First Time Setup:

1. **Create Parent Account**
   - Click "Sign Up" on the homepage
   - Select "Parent"
   - Enter your name, username, password, and email
   - Create account

2. **Add Children**
   - Log in to parent dashboard
   - Use "Add a Child Account" form
   - Enter child's name, username, password
   - Choose a fun avatar
   - Click "Add Child"

3. **Kids Can Play!**
   - Kids log in with their own username/password
   - Choose avatar during registration
   - Start playing math games!

### Playing Games:

1. **Select Game Settings**
   - Choose time limit (30s to 5 minutes)
   - Choose difficulty level
   - Click "Start Game!"

2. **Answer Questions**
   - Type the answer
   - Press Enter or wait half a second
   - Get instant feedback!
   - Watch confetti fall for correct answers 🎉

3. **Earn Badges**
   - Play games to earn achievements
   - Collect all 10 badges!
   - Celebrate new badges with extra confetti!

4. **View Progress**
   - Check dashboard for statistics
   - See all earned badges
   - Track high scores and accuracy

## 📁 Project Structure

```
kids-math-adventure/
├── server.js           # Main server file
├── database.js         # Database setup and functions
├── package.json        # Dependencies
├── mathgame.db        # SQLite database (created automatically)
├── public/            # Frontend files
│   ├── index.html     # Login/Registration page
│   ├── dashboard.html # Kids dashboard
│   ├── game.html      # Game screen
│   ├── parent.html    # Parent dashboard
│   ├── styles.css     # All styles
│   ├── auth.js        # Login/Registration logic
│   ├── dashboard.js   # Dashboard logic
│   ├── game.js        # Game logic
│   └── parent.js      # Parent dashboard logic
└── README.md          # This file
```

## 🛠️ Troubleshooting

### Game Won't Start
- Make sure Node.js is installed: `node --version`
- Check if port 3000 is already in use
- Try a different port: `PORT=3001 npm start` (Mac/Linux) or set PORT environment variable on Windows

### Can't Connect from Other Devices
- Verify both devices are on the same WiFi network
- Check Windows Firewall settings
- Make sure the server is running
- Try using the computer name instead of IP: `http://COMPUTER-NAME:3000`

### Email Not Working
- Verify SMTP settings are correct
- For Gmail, make sure you're using an App Password, not your regular password
- Check spam folder for test emails
- Ensure your email account allows SMTP connections

### Database Issues
- If the database gets corrupted, delete `mathgame.db` and restart
- A new database will be created automatically with default badges

## 🔒 Security Notes

- This is designed for **local home network use only**
- Do not expose to the internet without proper security measures
- Passwords are hashed using bcrypt
- Sessions are stored server-side
- For production use, add HTTPS and additional security measures

## 🎨 Customization

### Adding More Badges
Edit `database.js` and add new badges to the `badges` array in the `initDatabase()` function.

### Changing Game Difficulty
Modify the `getDifficultyRange()` function in `public/game.js`.

### Adjusting Email Report Time
Edit the cron schedule in `server.js` (currently set to `'0 20 * * *'` for 8 PM).

### Adding New Games
Create new game types in `public/game.js` and add corresponding cards in `public/dashboard.html`.

## 📝 Default Accounts

Create your own accounts - there are no default accounts for security reasons.

## 🆘 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Make sure the server is running
4. Check the console for error messages

## 📜 License

MIT License - Feel free to modify and use as you wish!

## 🎉 Have Fun!

Enjoy watching your children learn and grow their math skills! Remember to check the parent dashboard regularly to celebrate their achievements! 🌟

---

**Made with ❤️ for young learners**
