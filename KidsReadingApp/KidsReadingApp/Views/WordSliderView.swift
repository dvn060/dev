import SwiftUI

struct WordSliderView: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        VStack(spacing: 0) {
            HeaderBar(viewModel: viewModel)

            Spacer()

            if let word = viewModel.currentWord {
                VStack(spacing: 40) {
                    Text(word.imageEmoji)
                        .font(.system(size: 120))
                        .scaleEffect(viewModel.sliderPosition > 90 ? 1.1 : 1.0)
                        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: viewModel.sliderPosition)

                    VStack(spacing: 20) {
                        HStack(spacing: 8) {
                            ForEach(viewModel.visiblePhonemes) { phoneme in
                                PhonemeView(phoneme: phoneme)
                                    .transition(.scale.combined(with: .opacity))
                            }
                        }
                        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: viewModel.visiblePhonemes.count)

                        Text("Slide to sound it out!")
                            .font(.system(size: 22, weight: .semibold, design: .rounded))
                            .foregroundColor(.secondary)
                            .opacity(viewModel.sliderPosition < 10 ? 1 : 0)
                            .animation(.easeInOut, value: viewModel.sliderPosition)
                    }
                    .frame(height: 180)

                    SliderControl(viewModel: viewModel)
                        .padding(.horizontal, 40)

                    HStack(spacing: 30) {
                        ActionButton(
                            icon: "speaker.wave.3.fill",
                            label: "Sound",
                            color: .blue,
                            action: { viewModel.playCurrentPhoneme() }
                        )

                        ActionButton(
                            icon: "play.circle.fill",
                            label: "Full Word",
                            color: .green,
                            action: { viewModel.playFullWord() }
                        )

                        ActionButton(
                            icon: "checkmark.circle.fill",
                            label: "Practice",
                            color: .orange,
                            action: {
                                withAnimation {
                                    viewModel.startPracticeMode()
                                }
                            }
                        )
                    }
                    .padding(.horizontal, 40)
                }
            }

            Spacer()

            NavigationButtons(viewModel: viewModel)
                .padding(.bottom, 30)
        }
    }
}

struct HeaderBar: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        HStack {
            Button(action: {
                withAnimation {
                    viewModel.selectedLevel = nil
                    viewModel.currentWordIndex = 0
                    viewModel.sliderPosition = 0
                }
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.left.circle.fill")
                        .font(.system(size: 24))
                    Text("Levels")
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                }
                .foregroundColor(.blue)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.blue.opacity(0.1))
                .cornerRadius(12)
            }

            Spacer()

            if let level = viewModel.selectedLevel {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(level.rawValue)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)

                    Text("Word \(viewModel.currentWordIndex + 1) of \(viewModel.currentWords.count)")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 30)
        .padding(.top, 20)
    }
}

struct PhonemeView: View {
    let phoneme: Phoneme

    var body: some View {
        Text(phoneme.text)
            .font(.system(size: 56, weight: .bold, design: .rounded))
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                LinearGradient(
                    colors: [Color(red: 0.4, green: 0.6, blue: 1.0),
                            Color(red: 0.6, green: 0.4, blue: 0.9)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .cornerRadius(16)
            .shadow(color: .blue.opacity(0.3), radius: 8, x: 0, y: 4)
    }
}

struct SliderControl: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        VStack(spacing: 12) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.9, green: 0.92, blue: 0.95),
                                        Color(red: 0.85, green: 0.88, blue: 0.92)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: 60)

                    RoundedRectangle(cornerRadius: 20)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.3, green: 0.7, blue: 1.0),
                                        Color(red: 0.5, green: 0.5, blue: 0.9)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * CGFloat(viewModel.sliderPosition / 100), height: 60)

                    Circle()
                        .fill(.white)
                        .frame(width: 70, height: 70)
                        .shadow(color: .black.opacity(0.2), radius: 8, x: 0, y: 4)
                        .overlay(
                            Image(systemName: "arrow.right")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(.blue)
                        )
                        .offset(x: geometry.size.width * CGFloat(viewModel.sliderPosition / 100) - 35)
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    let newValue = Double(value.location.x / geometry.size.width * 100)
                                    viewModel.sliderPosition = min(max(newValue, 0), 100)

                                    if Int(viewModel.sliderPosition) % 20 == 0 {
                                        let impactMed = UIImpactFeedbackGenerator(style: .medium)
                                        impactMed.impactOccurred()
                                    }
                                }
                        )
                }
            }
            .frame(height: 70)

            HStack {
                Text("Start")
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)

                Spacer()

                Text("End")
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct ActionButton: View {
    let icon: String
    let label: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 32))
                    .foregroundColor(.white)

                Text(label)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(color)
            .cornerRadius(16)
            .shadow(color: color.opacity(0.3), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

struct NavigationButtons: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        HStack(spacing: 40) {
            Button(action: { viewModel.previousWord() }) {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 20, weight: .bold))
                    Text("Previous")
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                }
                .foregroundColor(viewModel.currentWordIndex > 0 ? .blue : .gray)
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .background((viewModel.currentWordIndex > 0 ? Color.blue : Color.gray).opacity(0.15))
                .cornerRadius(14)
            }
            .disabled(viewModel.currentWordIndex == 0)

            Button(action: { viewModel.nextWord() }) {
                HStack(spacing: 8) {
                    Text("Next")
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 20, weight: .bold))
                }
                .foregroundColor(viewModel.currentWordIndex < viewModel.currentWords.count - 1 ? .blue : .gray)
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .background((viewModel.currentWordIndex < viewModel.currentWords.count - 1 ? Color.blue : Color.gray).opacity(0.15))
                .cornerRadius(14)
            }
            .disabled(viewModel.currentWordIndex >= viewModel.currentWords.count - 1)
        }
    }
}
