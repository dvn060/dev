import Foundation

class WordData {
    static let shared = WordData()

    private init() {}

    func getWords(for level: ReadingLevel) -> [Word] {
        switch level {
        case .preK:
            return preKWords
        case .kindergarten:
            return kindergartenWords
        case .firstGrade:
            return firstGradeWords
        case .secondGrade:
            return secondGradeWords
        }
    }

    private let preKWords: [Word] = [
        Word(text: "cat", phonemes: [
            Phoneme(text: "c", sound: "k"),
            Phoneme(text: "a", sound: "æ"),
            Phoneme(text: "t", sound: "t")
        ], level: .preK, imageEmoji: "🐱"),

        Word(text: "dog", phonemes: [
            Phoneme(text: "d", sound: "d"),
            Phoneme(text: "o", sound: "ɑ"),
            Phoneme(text: "g", sound: "g")
        ], level: .preK, imageEmoji: "🐶"),

        Word(text: "sun", phonemes: [
            Phoneme(text: "s", sound: "s"),
            Phoneme(text: "u", sound: "ʌ"),
            Phoneme(text: "n", sound: "n")
        ], level: .preK, imageEmoji: "☀️"),

        Word(text: "hat", phonemes: [
            Phoneme(text: "h", sound: "h"),
            Phoneme(text: "a", sound: "æ"),
            Phoneme(text: "t", sound: "t")
        ], level: .preK, imageEmoji: "🎩"),

        Word(text: "pig", phonemes: [
            Phoneme(text: "p", sound: "p"),
            Phoneme(text: "i", sound: "ɪ"),
            Phoneme(text: "g", sound: "g")
        ], level: .preK, imageEmoji: "🐷"),

        Word(text: "bed", phonemes: [
            Phoneme(text: "b", sound: "b"),
            Phoneme(text: "e", sound: "ɛ"),
            Phoneme(text: "d", sound: "d")
        ], level: .preK, imageEmoji: "🛏️"),

        Word(text: "red", phonemes: [
            Phoneme(text: "r", sound: "r"),
            Phoneme(text: "e", sound: "ɛ"),
            Phoneme(text: "d", sound: "d")
        ], level: .preK, imageEmoji: "🔴"),

        Word(text: "cup", phonemes: [
            Phoneme(text: "c", sound: "k"),
            Phoneme(text: "u", sound: "ʌ"),
            Phoneme(text: "p", sound: "p")
        ], level: .preK, imageEmoji: "☕"),

        Word(text: "van", phonemes: [
            Phoneme(text: "v", sound: "v"),
            Phoneme(text: "a", sound: "æ"),
            Phoneme(text: "n", sound: "n")
        ], level: .preK, imageEmoji: "🚐"),

        Word(text: "box", phonemes: [
            Phoneme(text: "b", sound: "b"),
            Phoneme(text: "o", sound: "ɑ"),
            Phoneme(text: "x", sound: "ks")
        ], level: .preK, imageEmoji: "📦")
    ]

    private let kindergartenWords: [Word] = [
        Word(text: "fish", phonemes: [
            Phoneme(text: "f", sound: "f"),
            Phoneme(text: "i", sound: "ɪ"),
            Phoneme(text: "sh", sound: "ʃ")
        ], level: .kindergarten, imageEmoji: "🐟"),

        Word(text: "ship", phonemes: [
            Phoneme(text: "sh", sound: "ʃ"),
            Phoneme(text: "i", sound: "ɪ"),
            Phoneme(text: "p", sound: "p")
        ], level: .kindergarten, imageEmoji: "🚢"),

        Word(text: "duck", phonemes: [
            Phoneme(text: "d", sound: "d"),
            Phoneme(text: "u", sound: "ʌ"),
            Phoneme(text: "ck", sound: "k")
        ], level: .kindergarten, imageEmoji: "🦆"),

        Word(text: "frog", phonemes: [
            Phoneme(text: "f", sound: "f"),
            Phoneme(text: "r", sound: "r"),
            Phoneme(text: "o", sound: "ɑ"),
            Phoneme(text: "g", sound: "g")
        ], level: .kindergarten, imageEmoji: "🐸"),

        Word(text: "jump", phonemes: [
            Phoneme(text: "j", sound: "dʒ"),
            Phoneme(text: "u", sound: "ʌ"),
            Phoneme(text: "m", sound: "m"),
            Phoneme(text: "p", sound: "p")
        ], level: .kindergarten, imageEmoji: "🦘"),

        Word(text: "sock", phonemes: [
            Phoneme(text: "s", sound: "s"),
            Phoneme(text: "o", sound: "ɑ"),
            Phoneme(text: "ck", sound: "k")
        ], level: .kindergarten, imageEmoji: "🧦"),

        Word(text: "bell", phonemes: [
            Phoneme(text: "b", sound: "b"),
            Phoneme(text: "e", sound: "ɛ"),
            Phoneme(text: "ll", sound: "l")
        ], level: .kindergarten, imageEmoji: "🔔"),

        Word(text: "wing", phonemes: [
            Phoneme(text: "w", sound: "w"),
            Phoneme(text: "i", sound: "ɪ"),
            Phoneme(text: "ng", sound: "ŋ")
        ], level: .kindergarten, imageEmoji: "🪽"),

        Word(text: "path", phonemes: [
            Phoneme(text: "p", sound: "p"),
            Phoneme(text: "a", sound: "æ"),
            Phoneme(text: "th", sound: "θ")
        ], level: .kindergarten, imageEmoji: "🛤️"),

        Word(text: "ring", phonemes: [
            Phoneme(text: "r", sound: "r"),
            Phoneme(text: "i", sound: "ɪ"),
            Phoneme(text: "ng", sound: "ŋ")
        ], level: .kindergarten, imageEmoji: "💍")
    ]

    private let firstGradeWords: [Word] = [
        Word(text: "play", phonemes: [
            Phoneme(text: "pl", sound: "pl"),
            Phoneme(text: "ay", sound: "eɪ")
        ], level: .firstGrade, imageEmoji: "⚽"),

        Word(text: "tree", phonemes: [
            Phoneme(text: "tr", sound: "tr"),
            Phoneme(text: "ee", sound: "i")
        ], level: .firstGrade, imageEmoji: "🌳"),

        Word(text: "blue", phonemes: [
            Phoneme(text: "bl", sound: "bl"),
            Phoneme(text: "ue", sound: "u")
        ], level: .firstGrade, imageEmoji: "🔵"),

        Word(text: "snow", phonemes: [
            Phoneme(text: "sn", sound: "sn"),
            Phoneme(text: "ow", sound: "oʊ")
        ], level: .firstGrade, imageEmoji: "❄️"),

        Word(text: "train", phonemes: [
            Phoneme(text: "tr", sound: "tr"),
            Phoneme(text: "ai", sound: "eɪ"),
            Phoneme(text: "n", sound: "n")
        ], level: .firstGrade, imageEmoji: "🚂"),

        Word(text: "float", phonemes: [
            Phoneme(text: "fl", sound: "fl"),
            Phoneme(text: "oa", sound: "oʊ"),
            Phoneme(text: "t", sound: "t")
        ], level: .firstGrade, imageEmoji: "🛟"),

        Word(text: "green", phonemes: [
            Phoneme(text: "gr", sound: "gr"),
            Phoneme(text: "ee", sound: "i"),
            Phoneme(text: "n", sound: "n")
        ], level: .firstGrade, imageEmoji: "💚"),

        Word(text: "smile", phonemes: [
            Phoneme(text: "sm", sound: "sm"),
            Phoneme(text: "i", sound: "aɪ"),
            Phoneme(text: "le", sound: "l")
        ], level: .firstGrade, imageEmoji: "😊"),

        Word(text: "cloud", phonemes: [
            Phoneme(text: "cl", sound: "kl"),
            Phoneme(text: "ou", sound: "aʊ"),
            Phoneme(text: "d", sound: "d")
        ], level: .firstGrade, imageEmoji: "☁️"),

        Word(text: "night", phonemes: [
            Phoneme(text: "n", sound: "n"),
            Phoneme(text: "igh", sound: "aɪ"),
            Phoneme(text: "t", sound: "t")
        ], level: .firstGrade, imageEmoji: "🌙")
    ]

    private let secondGradeWords: [Word] = [
        Word(text: "birthday", phonemes: [
            Phoneme(text: "bir", sound: "bɜr"),
            Phoneme(text: "th", sound: "θ"),
            Phoneme(text: "day", sound: "deɪ")
        ], level: .secondGrade, imageEmoji: "🎂"),

        Word(text: "rainbow", phonemes: [
            Phoneme(text: "rain", sound: "reɪn"),
            Phoneme(text: "bow", sound: "boʊ")
        ], level: .secondGrade, imageEmoji: "🌈"),

        Word(text: "butterfly", phonemes: [
            Phoneme(text: "but", sound: "bʌt"),
            Phoneme(text: "ter", sound: "ər"),
            Phoneme(text: "fly", sound: "flaɪ")
        ], level: .secondGrade, imageEmoji: "🦋"),

        Word(text: "school", phonemes: [
            Phoneme(text: "sch", sound: "sk"),
            Phoneme(text: "oo", sound: "u"),
            Phoneme(text: "l", sound: "l")
        ], level: .secondGrade, imageEmoji: "🏫"),

        Word(text: "thunder", phonemes: [
            Phoneme(text: "th", sound: "θ"),
            Phoneme(text: "un", sound: "ʌn"),
            Phoneme(text: "der", sound: "dər")
        ], level: .secondGrade, imageEmoji: "⚡"),

        Word(text: "picture", phonemes: [
            Phoneme(text: "pic", sound: "pɪk"),
            Phoneme(text: "ture", sound: "tʃər")
        ], level: .secondGrade, imageEmoji: "🖼️"),

        Word(text: "brother", phonemes: [
            Phoneme(text: "bro", sound: "brʌ"),
            Phoneme(text: "ther", sound: "ðər")
        ], level: .secondGrade, imageEmoji: "👦"),

        Word(text: "circle", phonemes: [
            Phoneme(text: "cir", sound: "sɜr"),
            Phoneme(text: "cle", sound: "kəl")
        ], level: .secondGrade, imageEmoji: "⭕"),

        Word(text: "flower", phonemes: [
            Phoneme(text: "flow", sound: "flaʊ"),
            Phoneme(text: "er", sound: "ər")
        ], level: .secondGrade, imageEmoji: "🌸"),

        Word(text: "cookie", phonemes: [
            Phoneme(text: "coo", sound: "kʊ"),
            Phoneme(text: "kie", sound: "ki")
        ], level: .secondGrade, imageEmoji: "🍪")
    ]
}
