import Foundation

struct Word: Identifiable, Codable {
    let id = UUID()
    let text: String
    let phonemes: [Phoneme]
    let level: ReadingLevel
    let imageEmoji: String

    enum CodingKeys: String, CodingKey {
        case text, phonemes, level, imageEmoji
    }
}

struct Phoneme: Identifiable, Codable {
    let id = UUID()
    let text: String
    let sound: String

    enum CodingKeys: String, CodingKey {
        case text, sound
    }
}

enum ReadingLevel: String, Codable, CaseIterable {
    case preK = "Pre-K (Ages 4-5)"
    case kindergarten = "Kindergarten (Ages 5-6)"
    case firstGrade = "1st Grade (Ages 6-7)"
    case secondGrade = "2nd Grade (Ages 7-8)"

    var color: String {
        switch self {
        case .preK: return "purple"
        case .kindergarten: return "blue"
        case .firstGrade: return "green"
        case .secondGrade: return "orange"
        }
    }

    var description: String {
        switch self {
        case .preK: return "Simple 2-3 letter words"
        case .kindergarten: return "Basic CVC words"
        case .firstGrade: return "Consonant blends & digraphs"
        case .secondGrade: return "Complex vowel patterns"
        }
    }
}

struct ProgressData: Codable {
    var completedWords: Set<String> = []
    var attemptsByWord: [String: Int] = [:]
    var lastPracticeDate: Date?

    mutating func markWordCompleted(_ word: String) {
        completedWords.insert(word)
        attemptsByWord[word, default: 0] += 1
        lastPracticeDate = Date()
    }
}
