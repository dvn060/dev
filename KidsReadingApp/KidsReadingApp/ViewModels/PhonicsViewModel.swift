import Foundation
import SwiftUI

class PhonicsViewModel: ObservableObject {
    @Published var selectedLevel: ReadingLevel?
    @Published var currentWordIndex = 0
    @Published var sliderPosition: Double = 0
    @Published var isPracticeMode = false
    @Published var showSuccess = false
    @Published var progressData = ProgressData()

    let speechManager = SpeechManager()
    private let wordData = WordData.shared

    var currentWords: [Word] {
        guard let level = selectedLevel else { return [] }
        return wordData.getWords(for: level)
    }

    var currentWord: Word? {
        guard currentWordIndex < currentWords.count else { return nil }
        return currentWords[currentWordIndex]
    }

    var currentPhonemeIndex: Int {
        guard let word = currentWord else { return 0 }
        let totalPhonemes = word.phonemes.count
        let index = Int((sliderPosition / 100.0) * Double(totalPhonemes))
        return min(max(index, 0), totalPhonemes - 1)
    }

    var visiblePhonemes: [Phoneme] {
        guard let word = currentWord else { return [] }
        let index = currentPhonemeIndex
        return Array(word.phonemes.prefix(index + 1))
    }

    init() {
        loadProgress()
    }

    func selectLevel(_ level: ReadingLevel) {
        selectedLevel = level
        currentWordIndex = 0
        sliderPosition = 0
        isPracticeMode = false
    }

    func nextWord() {
        if currentWordIndex < currentWords.count - 1 {
            currentWordIndex += 1
            sliderPosition = 0
            showSuccess = false
        }
    }

    func previousWord() {
        if currentWordIndex > 0 {
            currentWordIndex -= 1
            sliderPosition = 0
            showSuccess = false
        }
    }

    func playCurrentPhoneme() {
        guard let word = currentWord else { return }
        let index = currentPhonemeIndex
        if index < word.phonemes.count {
            let phoneme = word.phonemes[index]
            speechManager.speakPhoneme(sound: phoneme.text)
        }
    }

    func playFullWord() {
        guard let word = currentWord else { return }
        speechManager.speakWord(word: word.text)
    }

    func startPracticeMode() {
        isPracticeMode = true
        sliderPosition = 0
    }

    func checkPracticeAnswer() {
        guard let word = currentWord else { return }

        if sliderPosition >= 95 {
            showSuccess = true
            progressData.markWordCompleted(word.text)
            saveProgress()
            playFullWord()

            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.showSuccess = false
                self.nextWord()
                self.isPracticeMode = false
            }
        }
    }

    func skipPractice() {
        isPracticeMode = false
        nextWord()
    }

    private func saveProgress() {
        if let encoded = try? JSONEncoder().encode(progressData) {
            UserDefaults.standard.set(encoded, forKey: "readingProgress")
        }
    }

    private func loadProgress() {
        if let data = UserDefaults.standard.data(forKey: "readingProgress"),
           let decoded = try? JSONDecoder().decode(ProgressData.self, from: data) {
            progressData = decoded
        }
    }

    func getProgress(for level: ReadingLevel) -> Double {
        let words = wordData.getWords(for: level)
        let completedCount = words.filter { progressData.completedWords.contains($0.text) }.count
        return words.isEmpty ? 0 : Double(completedCount) / Double(words.count)
    }
}
