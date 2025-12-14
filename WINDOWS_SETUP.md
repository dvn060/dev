# 🪟 Windows Quick Start Guide

## Super Easy Setup for Windows Users

### Step 1: Install Node.js (One-Time Setup)

1. Go to https://nodejs.org/
2. Click the big green button that says "Download Node.js (LTS)"
3. Run the downloaded installer
4. Click "Next" through all the prompts (use default settings)
5. Click "Install" and wait for it to finish
6. Click "Finish"

**That's it! Node.js is installed!** ✅

### Step 2: Start the Game (Every Time You Want to Play)

**Super Simple Method:**
1. Find the file `START_GAME.bat` in the game folder
2. Double-click it
3. A browser window will open automatically
4. Start playing! 🎮

**Alternative Method (If Double-Click Doesn't Work):**
1. Right-click on `START_GAME.bat`
2. Choose "Run as Administrator"

### Step 3: Share with Your Family

**To play on other devices (tablets, phones, other computers):**

1. While the game is running, press `Windows Key + R`
2. Type `cmd` and press Enter
3. Type `ipconfig` and press Enter
4. Find the line that says "IPv4 Address" (looks like 192.168.1.XXX)
5. Write down this number

On the other device:
- Open any web browser
- Type in the address bar: `http://192.168.1.XXX:3000`
  (Replace XXX with the number you wrote down)
- Press Enter
- The game should load! 🎉

### Troubleshooting

**Problem: "Node is not recognized" error**
- Solution: Restart your computer after installing Node.js

**Problem: Port 3000 is already in use**
- Solution: Something else is using that port. Close other programs or restart your computer.

**Problem: Can't connect from another device**
- Solution: Make sure both devices are on the same WiFi network
- Try turning off Windows Firewall temporarily to test

**Problem: Browser doesn't open automatically**
- Solution: Manually open your browser and go to `http://localhost:3000`

### Stopping the Server

When you're done playing:
1. Go to the black command window
2. Press `Ctrl + C`
3. Press `Y` when asked to confirm
4. Close the window

Or simply close the command window.

### Daily Use

Every time you want to play:
1. Double-click `START_GAME.bat`
2. Wait 5-10 seconds for the server to start
3. Browser will open automatically
4. Play! 🎮

When done:
- Close the black command window
- That's it!

## Email Setup for Parents

To get daily progress reports:

1. **Set up a Gmail App Password:**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification if not already on
   - Click "App passwords"
   - Choose "Mail" and "Windows Computer"
   - Click "Generate"
   - **Copy the 16-character password** (you'll need this)

2. **Configure in the Game:**
   - Log in as parent
   - Find the "Email Settings" section
   - Enter:
     - SMTP Host: `smtp.gmail.com`
     - SMTP Port: `587`
     - Email Username: `your-email@gmail.com`
     - Email Password: Paste the 16-character password
   - Click "Save Email Settings"
   - Click "Send Test Email" to verify

3. **You're Done!**
   - You'll get an email every day at 8 PM with your kids' progress

## Tips for Best Experience

- **Keep the command window open** while playing
- **Don't close the black window** - that's the server running
- **Bookmark** `http://localhost:3000` in your browser for easy access
- **Create accounts** for each child with their own avatar
- **Check the parent dashboard** regularly to celebrate achievements

## System Requirements

- **Windows:** 10 or 11 (also works on Windows 7/8)
- **Memory:** 2 GB RAM minimum
- **Storage:** 100 MB free space
- **Internet:** Only needed for initial setup and email reports

## Need Help?

1. Make sure you followed all steps
2. Restart your computer
3. Try running `START_GAME.bat` as Administrator
4. Check the README.md file for more detailed information

---

**Happy Learning! 📚✨**
