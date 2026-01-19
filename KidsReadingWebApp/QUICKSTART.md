# Quick Start Guide 🚀

## For Windows PC Users (3 Simple Steps)

### Step 1: Start the Server

**Easiest Method:**
1. Double-click `start-server.bat`
2. A black window will open - **keep it open!**
3. You'll see: "Serving HTTP on 0.0.0.0 port 8000..."

**Alternative (if above doesn't work):**
1. Press Windows Key + R
2. Type `cmd` and press Enter
3. Type: `cd C:\path\to\KidsReadingWebApp` (replace with actual path)
4. Type: `python -m http.server 8000`

### Step 2: Open on Your PC

1. Open any web browser (Chrome, Edge, Firefox)
2. Go to: `http://localhost:8000`
3. The app should load!

### Step 3: Access from iPad

1. Look at the Command Prompt window - it shows your IP (like `192.168.1.100`)
   - OR type `ipconfig` in Command Prompt to find "IPv4 Address"

2. On your iPad:
   - Connect to the **same WiFi** as your PC
   - Open **Safari**
   - Type: `http://YOUR-IP:8000` (e.g., `http://192.168.1.100:8000`)

3. **Allow Microphone** when Safari asks (needed for Practice mode)

4. **Add to Home Screen** (optional):
   - Tap Share button → "Add to Home Screen"
   - App will launch like a native app!

## Common Issues

❌ **"Python is not recognized"**
   → Install Python from python.org (check "Add to PATH")

❌ **Can't connect from iPad**
   → Make sure both devices on same WiFi
   → Check Windows Firewall settings
   → Try restarting the server

❌ **Microphone not working**
   → Use Safari (not Chrome)
   → Tap "Allow" when Safari asks
   → Check iOS Settings → Safari → Microphone

## That's It!

You're ready to start learning! Choose a level and start sliding! 🎓

---

**Remember:** Keep the black Command Prompt window open while using the app!

**Pro Tip:** Once loaded in Safari, the app works offline - you can even turn off the server and it will keep working on the iPad until you close Safari!
