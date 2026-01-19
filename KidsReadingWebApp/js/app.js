// Kids Reading Web App - Main Application
class ReadingApp {
    constructor() {
        this.currentLevel = null;
        this.currentWordIndex = 0;
        this.sliderPosition = 0;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordedAudio = null;
        this.microphoneStream = null;
        this.speechSynthesis = window.speechSynthesis;

        this.init();
    }

    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.loadProgress();
        this.updateProgressDisplay();
        this.initializeSlider();
    }

    cacheElements() {
        // Screens
        this.levelSelectionScreen = document.getElementById('level-selection');
        this.learningScreen = document.getElementById('learning-screen');

        // Level selection
        this.levelCards = document.querySelectorAll('.level-card');

        // Learning screen elements
        this.backBtn = document.getElementById('back-btn');
        this.currentLevelName = document.getElementById('current-level-name');
        this.wordPosition = document.getElementById('word-position');
        this.wordEmoji = document.getElementById('word-emoji');
        this.phonemeDisplay = document.getElementById('phoneme-display');
        this.instructionText = document.getElementById('instruction-text');

        // Slider
        this.sliderThumb = document.getElementById('slider-thumb');
        this.sliderProgress = document.getElementById('slider-progress');
        this.sliderTrack = document.querySelector('.slider-track');

        // Action buttons
        this.playPhonemeBtn = document.getElementById('play-phoneme-btn');
        this.playWordBtn = document.getElementById('play-word-btn');
        this.practiceBtn = document.getElementById('practice-btn');

        // Navigation
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');

        // Recording section
        this.recordingSection = document.getElementById('recording-section');
        this.practiceWord = document.getElementById('practice-word');
        this.recordBtn = document.getElementById('record-btn');
        this.recordLabel = document.getElementById('record-label');
        this.playbackBtn = document.getElementById('playback-btn');
        this.recordingStatus = document.getElementById('recording-status');
        this.closePracticeBtn = document.getElementById('close-practice-btn');

        // Success overlay
        this.successOverlay = document.getElementById('success-overlay');

        // Permission modal
        this.permissionModal = document.getElementById('permission-modal');
        this.grantPermissionBtn = document.getElementById('grant-permission-btn');
        this.skipPermissionBtn = document.getElementById('skip-permission-btn');
    }

    attachEventListeners() {
        // Level selection
        this.levelCards.forEach(card => {
            card.addEventListener('click', (e) => {
                const level = e.currentTarget.dataset.level;
                this.selectLevel(level);
            });
        });

        // Back button
        this.backBtn.addEventListener('click', () => this.goToLevelSelection());

        // Action buttons
        this.playPhonemeBtn.addEventListener('click', () => this.playCurrentPhoneme());
        this.playWordBtn.addEventListener('click', () => this.playFullWord());
        this.practiceBtn.addEventListener('click', () => this.openPracticeMode());

        // Navigation buttons
        this.prevBtn.addEventListener('click', () => this.previousWord());
        this.nextBtn.addEventListener('click', () => this.nextWord());

        // Recording controls
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.playbackBtn.addEventListener('click', () => this.playRecording());
        this.closePracticeBtn.addEventListener('click', () => this.closePracticeMode());

        // Permission modal
        this.grantPermissionBtn.addEventListener('click', () => this.requestMicrophonePermission());
        this.skipPermissionBtn.addEventListener('click', () => this.closePermissionModal());
    }

    initializeSlider() {
        let isDragging = false;

        const startDrag = (e) => {
            isDragging = true;
            this.sliderThumb.style.cursor = 'grabbing';
            updateSliderPosition(e);
        };

        const stopDrag = () => {
            isDragging = false;
            this.sliderThumb.style.cursor = 'grab';
        };

        const updateSliderPosition = (e) => {
            if (!isDragging) return;

            const rect = this.sliderTrack.getBoundingClientRect();
            let clientX;

            if (e.type.includes('touch')) {
                clientX = e.touches[0].clientX;
            } else {
                clientX = e.clientX;
            }

            let position = ((clientX - rect.left) / rect.width) * 100;
            position = Math.max(0, Math.min(100, position));

            this.sliderPosition = position;
            this.updateSliderUI();
            this.updatePhonemeDisplay();

            // Hide instruction text once user starts sliding
            if (position > 10) {
                this.instructionText.style.opacity = '0';
            } else {
                this.instructionText.style.opacity = '1';
            }
        };

        // Mouse events
        this.sliderThumb.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', updateSliderPosition);
        document.addEventListener('mouseup', stopDrag);

        // Touch events for mobile/iPad
        this.sliderThumb.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startDrag(e);
        });
        document.addEventListener('touchmove', updateSliderPosition);
        document.addEventListener('touchend', stopDrag);
    }

    updateSliderUI() {
        this.sliderProgress.style.width = `${this.sliderPosition}%`;
        this.sliderThumb.style.left = `${this.sliderPosition}%`;
    }

    selectLevel(level) {
        this.currentLevel = level;
        this.currentWordIndex = 0;
        this.sliderPosition = 0;

        this.showScreen('learning');
        this.updateLearningScreen();
    }

    goToLevelSelection() {
        this.currentLevel = null;
        this.sliderPosition = 0;
        this.showScreen('level-selection');
    }

    showScreen(screenName) {
        this.levelSelectionScreen.classList.remove('active');
        this.learningScreen.classList.remove('active');

        if (screenName === 'level-selection') {
            this.levelSelectionScreen.classList.add('active');
        } else if (screenName === 'learning') {
            this.learningScreen.classList.add('active');
        }
    }

    updateLearningScreen() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        // Update header
        this.currentLevelName.textContent = LEVEL_INFO[this.currentLevel].name;
        this.wordPosition.textContent = `Word ${this.currentWordIndex + 1} of ${WORD_DATA[this.currentLevel].length}`;

        // Update word display
        this.wordEmoji.textContent = currentWord.emoji;

        // Reset slider
        this.sliderPosition = 0;
        this.updateSliderUI();
        this.updatePhonemeDisplay();

        // Reset instruction text
        this.instructionText.style.opacity = '1';

        // Update navigation buttons
        this.prevBtn.disabled = this.currentWordIndex === 0;
        this.nextBtn.disabled = this.currentWordIndex === WORD_DATA[this.currentLevel].length - 1;
    }

    updatePhonemeDisplay() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        const totalPhonemes = currentWord.phonemes.length;
        const currentPhonemeIndex = Math.floor((this.sliderPosition / 100) * totalPhonemes);
        const visiblePhonemes = currentWord.phonemes.slice(0, Math.min(currentPhonemeIndex + 1, totalPhonemes));

        this.phonemeDisplay.innerHTML = '';
        visiblePhonemes.forEach((phoneme, index) => {
            const phonemeBox = document.createElement('div');
            phonemeBox.className = 'phoneme-box';
            phonemeBox.textContent = phoneme;
            this.phonemeDisplay.appendChild(phonemeBox);
        });

        // Pulse emoji when slider reaches the end
        if (this.sliderPosition > 95) {
            this.wordEmoji.classList.add('pulse');
        } else {
            this.wordEmoji.classList.remove('pulse');
        }
    }

    getCurrentWord() {
        if (!this.currentLevel) return null;
        return WORD_DATA[this.currentLevel][this.currentWordIndex];
    }

    getCurrentPhonemeIndex() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return 0;

        const totalPhonemes = currentWord.phonemes.length;
        return Math.floor((this.sliderPosition / 100) * totalPhonemes);
    }

    playCurrentPhoneme() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        const phonemeIndex = this.getCurrentPhonemeIndex();
        if (phonemeIndex < currentWord.phonemes.length) {
            const phoneme = currentWord.phonemes[phonemeIndex];
            this.speak(phoneme, 0.8); // Slower rate for individual phonemes
        }
    }

    playFullWord() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        this.speak(currentWord.text, 0.9); // Normal rate for full word

        // Animate emoji
        this.wordEmoji.classList.add('pulse');
        setTimeout(() => {
            this.wordEmoji.classList.remove('pulse');
        }, 500);
    }

    speak(text, rate = 1.0) {
        // Cancel any ongoing speech
        this.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to use a child-friendly voice if available
        const voices = this.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            voice.name.includes('Samantha') ||
            voice.name.includes('Karen') ||
            voice.lang.startsWith('en')
        );

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        this.speechSynthesis.speak(utterance);
    }

    previousWord() {
        if (this.currentWordIndex > 0) {
            this.currentWordIndex--;
            this.updateLearningScreen();
        }
    }

    nextWord() {
        if (this.currentWordIndex < WORD_DATA[this.currentLevel].length - 1) {
            this.currentWordIndex++;
            this.updateLearningScreen();
        } else {
            // Show success for completing the level
            this.showSuccess();
        }
    }

    showSuccess() {
        this.successOverlay.classList.add('active');
        setTimeout(() => {
            this.successOverlay.classList.remove('active');
        }, 2000);
    }

    // ===== RECORDING FUNCTIONALITY =====

    openPracticeMode() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        this.practiceWord.textContent = currentWord.text;
        this.recordingSection.classList.add('active');

        // Reset recording state
        this.recordedAudio = null;
        this.playbackBtn.disabled = true;
        this.recordingStatus.textContent = '';

        // Check if we have microphone permission
        if (!this.microphoneStream) {
            this.showPermissionModal();
        }
    }

    closePracticeMode() {
        this.recordingSection.classList.remove('active');

        // Stop any ongoing recording
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }

    showPermissionModal() {
        this.permissionModal.classList.add('active');
    }

    closePermissionModal() {
        this.permissionModal.classList.remove('active');
    }

    async requestMicrophonePermission() {
        try {
            this.microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.recordingStatus.textContent = '✓ Microphone ready!';
            this.closePermissionModal();

            console.log('Microphone access granted');
        } catch (error) {
            console.error('Microphone access denied:', error);
            this.recordingStatus.textContent = '❌ Microphone access denied';
            alert('Please allow microphone access to use the practice feature.');
        }
    }

    async toggleRecording() {
        if (!this.microphoneStream) {
            await this.requestMicrophonePermission();
            if (!this.microphoneStream) return;
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            // Stop recording
            this.mediaRecorder.stop();
        } else {
            // Start recording
            this.startRecording();
        }
    }

    startRecording() {
        this.audioChunks = [];

        // Use compatible audio format for Safari/iPad
        const options = { mimeType: 'audio/webm' };

        // Fallback for Safari which doesn't support webm
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/mp4';
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.microphoneStream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                this.recordedAudio = URL.createObjectURL(audioBlob);

                this.recordBtn.classList.remove('recording');
                this.recordLabel.textContent = 'Record Again';
                this.playbackBtn.disabled = false;
                this.recordingStatus.textContent = '✓ Recording saved! Click play to listen.';
            };

            this.mediaRecorder.start();
            this.recordBtn.classList.add('recording');
            this.recordLabel.textContent = 'Stop Recording';
            this.recordingStatus.textContent = '🎤 Recording...';

        } catch (error) {
            console.error('Recording error:', error);
            this.recordingStatus.textContent = '❌ Recording failed. Please try again.';
        }
    }

    playRecording() {
        if (!this.recordedAudio) return;

        const audio = new Audio(this.recordedAudio);
        audio.play();

        this.recordingStatus.textContent = '▶️ Playing your recording...';

        audio.onended = () => {
            this.recordingStatus.textContent = 'Click record to try again!';
        };
    }

    // ===== PROGRESS TRACKING =====

    loadProgress() {
        const saved = localStorage.getItem('readingProgress');
        if (saved) {
            this.progress = JSON.parse(saved);
        } else {
            this.progress = {
                preK: [],
                kindergarten: [],
                firstGrade: [],
                secondGrade: []
            };
        }
    }

    saveProgress() {
        localStorage.setItem('readingProgress', JSON.stringify(this.progress));
    }

    markWordCompleted() {
        const currentWord = this.getCurrentWord();
        if (!currentWord) return;

        if (!this.progress[this.currentLevel].includes(currentWord.text)) {
            this.progress[this.currentLevel].push(currentWord.text);
            this.saveProgress();
            this.updateProgressDisplay();
        }
    }

    updateProgressDisplay() {
        Object.keys(WORD_DATA).forEach(level => {
            const totalWords = WORD_DATA[level].length;
            const completedWords = this.progress[level] ? this.progress[level].length : 0;
            const percentage = Math.round((completedWords / totalWords) * 100);

            const progressBar = document.querySelector(`[data-progress="${level}"]`);
            const progressText = document.querySelector(`[data-progress-text="${level}"]`);

            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
            }

            if (progressText) {
                progressText.textContent = `${percentage}% Complete`;
            }
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load voices for speech synthesis (required for some browsers)
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };

    // Initialize the app
    window.readingApp = new ReadingApp();
});
