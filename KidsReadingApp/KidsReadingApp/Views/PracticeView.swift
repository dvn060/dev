import SwiftUI

struct PracticeView: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                HStack {
                    Button(action: {
                        withAnimation {
                            viewModel.skipPractice()
                        }
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 24))
                            Text("Skip")
                                .font(.system(size: 18, weight: .semibold, design: .rounded))
                        }
                        .foregroundColor(.orange)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(.orange.opacity(0.1))
                        .cornerRadius(12)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Practice Mode")
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(.orange)

                        Text("Try it yourself!")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 30)
                .padding(.top, 20)

                Spacer()

                if let word = viewModel.currentWord {
                    VStack(spacing: 50) {
                        Text(word.imageEmoji)
                            .font(.system(size: 140))
                            .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 5)

                        VStack(spacing: 16) {
                            Text("Can you read this word?")
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .foregroundColor(.primary)

                            Text("Slide all the way to check!")
                                .font(.system(size: 20, weight: .medium, design: .rounded))
                                .foregroundColor(.secondary)
                        }

                        if viewModel.sliderPosition > 0 {
                            HStack(spacing: 8) {
                                ForEach(viewModel.visiblePhonemes) { phoneme in
                                    PhonemeView(phoneme: phoneme)
                                        .transition(.scale.combined(with: .opacity))
                                }
                            }
                            .animation(.spring(response: 0.4, dampingFraction: 0.7), value: viewModel.visiblePhonemes.count)
                        }

                        PracticeSlider(viewModel: viewModel)
                            .padding(.horizontal, 40)

                        if viewModel.sliderPosition > 50 {
                            HStack(spacing: 20) {
                                ActionButton(
                                    icon: "speaker.wave.3.fill",
                                    label: "Hear It",
                                    color: .blue,
                                    action: { viewModel.playFullWord() }
                                )

                                ActionButton(
                                    icon: "checkmark.circle.fill",
                                    label: "I Got It!",
                                    color: .green,
                                    action: { viewModel.checkPracticeAnswer() }
                                )
                            }
                            .padding(.horizontal, 40)
                            .transition(.scale.combined(with: .opacity))
                        }
                    }
                }

                Spacer()
            }

            if viewModel.showSuccess {
                SuccessOverlay()
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: viewModel.showSuccess)
    }
}

struct PracticeSlider: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        VStack(spacing: 12) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.95, blue: 0.9),
                                        Color(red: 1.0, green: 0.90, blue: 0.85)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(height: 60)

                    RoundedRectangle(cornerRadius: 20)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.6, blue: 0.2),
                                        Color(red: 1.0, green: 0.4, blue: 0.3)],
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
                            Image(systemName: viewModel.sliderPosition > 95 ? "checkmark" : "hand.point.right.fill")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(.orange)
                        )
                        .offset(x: geometry.size.width * CGFloat(viewModel.sliderPosition / 100) - 35)
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    let newValue = Double(value.location.x / geometry.size.width * 100)
                                    viewModel.sliderPosition = min(max(newValue, 0), 100)

                                    if Int(viewModel.sliderPosition) % 15 == 0 {
                                        let impactMed = UIImpactFeedbackGenerator(style: .medium)
                                        impactMed.impactOccurred()
                                    }

                                    if viewModel.sliderPosition > 95 {
                                        let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
                                        impactHeavy.impactOccurred()
                                        viewModel.checkPracticeAnswer()
                                    }
                                }
                        )
                }
            }
            .frame(height: 70)

            HStack {
                Text("Try it!")
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)

                Spacer()

                Text("Great!")
                    .font(.system(size: 16, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct SuccessOverlay: View {
    @State private var scale: CGFloat = 0.5
    @State private var rotation: Double = -10

    var body: some View {
        ZStack {
            Color.black.opacity(0.3)
                .ignoresSafeArea()

            VStack(spacing: 30) {
                Text("🎉")
                    .font(.system(size: 100))
                    .scaleEffect(scale)
                    .rotationEffect(.degrees(rotation))

                VStack(spacing: 12) {
                    Text("Amazing!")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundColor(.white)

                    Text("You did it!")
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .foregroundColor(.white.opacity(0.9))
                }

                HStack(spacing: 8) {
                    ForEach(0..<5) { index in
                        Text("⭐")
                            .font(.system(size: 40))
                            .scaleEffect(scale)
                            .animation(.spring(response: 0.5, dampingFraction: 0.6).delay(Double(index) * 0.1), value: scale)
                    }
                }
            }
            .padding(50)
            .background(
                RoundedRectangle(cornerRadius: 30)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.4, green: 0.8, blue: 0.4),
                                    Color(red: 0.3, green: 0.7, blue: 0.9)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
            )
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) {
                scale = 1.0
                rotation = 0
            }

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        }
    }
}
