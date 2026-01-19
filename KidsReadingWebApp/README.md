# Kids Reading Web App 📚

A professional, interactive phonics learning web application for children ages 4-8. This is the **web version** of the Kids Reading App, designed to run on any device through a web browser - perfect for iPad, tablets, and desktops!

## ✨ Features

### 🎯 Core Learning Tools
- **Interactive Phoneme Slider**: Drag to reveal and hear each sound in words
- **Text-to-Speech**: Real-time pronunciation of individual phonemes and complete words
- **Voice Recording**: Record yourself practicing word pronunciation
- **Playback Comparison**: Listen to your recordings to improve pronunciation
- **Practice Mode**: Interactive recording and playback for self-assessment
- **Progress Tracking**: Automatically saves completed words

### 📖 Age-Appropriate Content
- **Pre-K (Ages 4-5)**: Simple 2-3 letter CVC words (cat, dog, sun)
- **Kindergarten (Ages 5-6)**: Basic CVC words with digraphs (fish, ship, duck)
- **1st Grade (Ages 6-7)**: Consonant blends and vowel teams (play, tree, cloud)
- **2nd Grade (Ages 7-8)**: Complex vowel patterns and compound words (birthday, butterfly, rainbow)

### 🎨 Kid-Friendly Design
- Clean, colorful interface optimized for touch screens
- Large touch targets perfect for iPad and tablets
- Emoji illustrations for each word
- Smooth animations and transitions
- Responsive design that works on all screen sizes
- Works completely offline after initial load

## 🚀 Quick Start (Windows PC)

### Option 1: Using Python (Recommended - Easiest)

1. **Check if Python is installed**
   - Open Command Prompt (press Windows Key + R, type `cmd`, press Enter)
   - Type: `python --version`
   - If you see a version number (e.g., Python 3.x.x), you're good to go!
   - If not, download and install from: https://www.python.org/downloads/
     - ⚠️ **IMPORTANT**: Check "Add Python to PATH" during installation

2. **Navigate to the app folder**
   ```cmd
   cd C:\path\to\KidsReadingWebApp
   ```

3. **Run the server**
   - Simply double-click `start-server.bat`
   - OR run in Command Prompt:
     ```cmd
     python -m http.server 8000
     ```

4. **Access the app**
   - On your PC: Open browser and go to `http://localhost:8000`
   - On your iPad: See "Accessing from iPad" section below

### Option 2: Using Node.js (Alternative)

1. **Install Node.js**
   - Download from: https://nodejs.org/
   - Install the LTS (Long Term Support) version

2. **Navigate to the app folder**
   ```cmd
   cd C:\path\to\KidsReadingWebApp
   ```

3. **Start the server**
   ```cmd
   node server.js
   ```

4. **Access the app**
   - The server will display your local IP address
   - On your PC: `http://localhost:8000`
   - On your iPad: `http://YOUR-IP:8000`

## 📱 Accessing from iPad (or any device on your network)

### Step 1: Find Your PC's IP Address

**On Windows:**
1. Open Command Prompt
2. Type: `ipconfig`
3. Look for "IPv4 Address" under your active network adapter
4. It will look something like: `192.168.1.100`

**Quick Method:**
- When you run `start-server.bat` or `node server.js`, the server will display your IP address

### Step 2: Connect from iPad

1. **Make sure both devices are on the same WiFi network**
   - Your Windows PC and iPad must be connected to the same WiFi

2. **Open Safari on your iPad**
   - Safari works best for this app (full microphone support)

3. **Enter the address**
   - Type in the address bar: `http://YOUR-PC-IP:8000`
   - For example: `http://192.168.1.100:8000`

4. **Allow Microphone Access**
   - When you tap the "Practice" button for the first time
   - Safari will ask for microphone permission
   - Tap "Allow" to enable recording features

5. **Add to Home Screen (Optional but Recommended)**
   - In Safari, tap the Share button (square with arrow)
   - Tap "Add to Home Screen"
   - Now the app will launch like a native app!

## 🎓 How to Use the App

### For Parents/Teachers

1. **Choose a Level**: Start with Pre-K for beginning readers
2. **Learn Mode**:
   - Drag the slider slowly to reveal each phoneme
   - Tap "Sound" to hear the current phoneme
   - Tap "Full Word" to hear the complete word
3. **Practice Mode**:
   - Tap "Practice" to open recording mode
   - Tap "Start Recording" and say the word
   - Tap "Stop Recording" when done
   - Tap "Play My Recording" to hear yourself
   - Compare with the "Full Word" pronunciation
4. **Track Progress**: The app automatically saves completed words

### For Kids

1. 👆 Pick your level with the colorful buttons
2. 🎨 Look at the picture
3. 👉 Drag the slider slowly to see and hear each sound
4. 🔊 Tap the buttons to hear sounds again
5. 🎤 Tap "Practice" to record yourself saying the word
6. ▶️ Listen to your recording!
7. 🎉 Celebrate when you get it right!

## 🔧 Technical Details

### Browser Compatibility

**Fully Supported:**
- ✅ Safari on iOS/iPadOS 14.5+ (Recommended for iPad)
- ✅ Chrome 85+
- ✅ Edge 85+
- ✅ Firefox 80+

**Limited Support (Recording may not work):**
- ⚠️ Internet Explorer (not recommended)
- ⚠️ Older browsers

### Features Used

- **Web Speech API**: For text-to-speech pronunciation
- **MediaRecorder API**: For voice recording
- **Web Audio API**: For audio playback
- **Local Storage**: For progress tracking
- **Touch Events**: For iPad slider control
- **Responsive CSS**: For all screen sizes

### System Requirements

**Windows PC (Server):**
- Windows 7 or later
- Python 3.6+ OR Node.js 12+
- Active WiFi connection

**iPad/Tablet (Client):**
- iOS 14.5+ / iPadOS 14.5+ (for best microphone support)
- Safari browser (recommended)
- WiFi connection

## 🛠️ Customization

### Adding More Words

Edit `js/word-data.js` to add new words:

```javascript
{
    text: 'your_word',
    phonemes: ['y', 'our', 'word'],
    sounds: ['y', 'ɔr', 'wɜrd'],
    emoji: '🎯'
}
```

### Changing Colors

Edit `css/styles.css` to customize the color scheme:

```css
.level-card {
    background: linear-gradient(135deg, #your-color-1, #your-color-2);
}
```

### Adjusting Speech Rate

In `js/app.js`, find the `speak()` function and adjust the `rate` parameter:

```javascript
utterance.rate = 0.8; // Slower (0.1 to 2.0)
utterance.rate = 1.0; // Normal
utterance.rate = 1.2; // Faster
```

## 🔒 Privacy & Security

- ✅ **No data collection**: Everything runs locally
- ✅ **No internet required**: Works offline after first load
- ✅ **No account needed**: Just open and use
- ✅ **No ads**: 100% ad-free experience
- ✅ **Microphone access**: Only when you use the practice feature
- ✅ **Recordings stay local**: Never uploaded or stored remotely

## 🐛 Troubleshooting

### "Server won't start"

**Problem**: Python/Node.js not found
- **Solution**: Install Python from python.org or Node.js from nodejs.org
- Make sure to check "Add to PATH" during installation

### "Can't access from iPad"

**Problem**: Connection refused or timeout
- **Solution 1**: Check that both devices are on the same WiFi network
- **Solution 2**: Check your PC's firewall settings
  - Go to Windows Firewall settings
  - Allow Python/Node.js through the firewall
  - Allow connections on port 8000
- **Solution 3**: Try restarting the server
- **Solution 4**: Make sure you're using the correct IP address

### "Microphone not working on iPad"

**Problem**: Recording doesn't work
- **Solution 1**: Make sure you're using Safari (not Chrome)
- **Solution 2**: Check iOS Settings → Safari → Microphone → Allow
- **Solution 3**: When Safari asks for permission, tap "Allow"
- **Solution 4**: Try refreshing the page

### "Voice doesn't sound right"

**Problem**: Text-to-speech sounds robotic or wrong
- **Solution**: This depends on your device's built-in voices
- On iPad: Go to Settings → Accessibility → Spoken Content → Voices
- Download higher quality voices for better pronunciation

### "Progress not saving"

**Problem**: Completed words not remembered
- **Solution**: Make sure your browser allows Local Storage
- Don't use Private/Incognito mode
- Check browser settings → Privacy → Allow local data

### "Port 8000 already in use"

**Problem**: Another application is using port 8000
- **Solution**: Edit the port number in `start-server.bat` or `server.js`
- Change `8000` to another port like `8080` or `3000`

## 🆚 Comparison with iOS App

| Feature | Web App | iOS App |
|---------|---------|---------|
| Phoneme Slider | ✅ | ✅ |
| Text-to-Speech | ✅ | ✅ |
| Voice Recording | ✅ | ✅ |
| Progress Tracking | ✅ | ✅ |
| Offline Support | ✅ | ✅ |
| No Installation | ✅ | ❌ |
| Works on iPad | ✅ | ✅ |
| Works on Android | ✅ | ❌ |
| Works on Windows | ✅ | ❌ |
| Requires Xcode | ❌ | ✅ |
| 7-Day Limit | ❌ | ✅ (free account) |

## 📋 File Structure

```
KidsReadingWebApp/
├── index.html              # Main app HTML
├── css/
│   └── styles.css         # All styling
├── js/
│   ├── app.js             # Main application logic
│   └── word-data.js       # Word database (edit to add words)
├── start-server.bat       # Windows server launcher
├── server.js              # Node.js server (alternative)
├── package.json           # Node.js configuration
└── README.md              # This file
```

## 🎯 Educational Philosophy

This app is based on proven phonics instruction methods:

- **Systematic phonics**: Breaking words into individual sounds
- **Multi-sensory learning**: Visual, auditory, and kinesthetic
- **Scaffolded practice**: Guided learning before independent practice
- **Self-assessment**: Record and compare pronunciation
- **Immediate feedback**: Positive reinforcement for success
- **Age-appropriate progression**: Builds skills gradually

Perfect for:
- Homeschooling families
- Supplemental reading practice
- Early literacy intervention
- ESL/ELL learners
- Summer learning
- Remote/distance learning

## 🌟 Why This Web App?

Unlike subscription services:
- ✅ **No subscription fees** - completely free
- ✅ **Works offline** - no internet required after first load
- ✅ **Privacy-focused** - no data collection
- ✅ **No account required** - just open and use
- ✅ **Ad-free** - zero distractions
- ✅ **Customizable** - easily add your own words
- ✅ **Cross-platform** - works on any device with a browser
- ✅ **No app store restrictions** - no approval needed

## 🤝 Support & Feedback

If you encounter any issues:
1. Check the Troubleshooting section above
2. Make sure you're using a supported browser
3. Try restarting the server
4. Clear your browser cache

## 📄 License

This app is created for personal and educational use. Feel free to modify and enhance it for your children's learning needs!

---

Made with ❤️ for young readers everywhere. Happy learning! 📚✨

## 🎉 Bonus Tips

### For Best Experience on iPad:

1. **Use Landscape Mode**: Rotate your iPad sideways for better layout
2. **Adjust Text Size**: Pinch to zoom if text is too small
3. **Enable Full Screen**: Add to home screen for app-like experience
4. **Quiet Environment**: Use headphones or find a quiet space for recording
5. **Good Lighting**: Makes it easier for kids to see the screen

### For Parents:

- Start with 10-15 minutes per session
- Encourage kids to move the slider slowly
- Celebrate small wins and progress
- Let kids record themselves multiple times
- Review progress together weekly
- Add words that match your child's interests

### For Teachers:

- Use in literacy centers
- Great for differentiated instruction
- Works with guided reading groups
- Perfect for remote/hybrid learning
- Can track multiple students (use different browsers/devices)
- Print progress reports from browser localStorage

---

**Need Help?** Remember: Your PC must be running the server for the app to work. Keep the Command Prompt window open while using the app!
