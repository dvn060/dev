import SwiftUI

struct LevelSelectionView: View {
    @ObservedObject var viewModel: PhonicsViewModel

    var body: some View {
        VStack(spacing: 30) {
            VStack(spacing: 10) {
                Text("🎓")
                    .font(.system(size: 80))

                Text("Kids Reading")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )

                Text("Learn to read with phonics!")
                    .font(.system(size: 22, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 20)

            Text("Choose Your Level")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundColor(.primary)

            VStack(spacing: 20) {
                ForEach(ReadingLevel.allCases, id: \.self) { level in
                    LevelButton(
                        level: level,
                        progress: viewModel.getProgress(for: level)
                    ) {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            viewModel.selectLevel(level)
                        }
                    }
                }
            }
            .padding(.horizontal, 40)
        }
        .padding()
    }
}

struct LevelButton: View {
    let level: ReadingLevel
    let progress: Double
    let action: () -> Void

    private var backgroundColor: Color {
        switch level.color {
        case "purple": return Color(red: 0.7, green: 0.5, blue: 0.9)
        case "blue": return Color(red: 0.4, green: 0.7, blue: 1.0)
        case "green": return Color(red: 0.4, green: 0.85, blue: 0.6)
        case "orange": return Color(red: 1.0, green: 0.7, blue: 0.3)
        default: return .blue
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(level.rawValue)
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(.white)

                        Text(level.description)
                            .font(.system(size: 16, weight: .medium, design: .rounded))
                            .foregroundColor(.white.opacity(0.9))
                    }

                    Spacer()

                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.white.opacity(0.9))
                }

                if progress > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(Int(progress * 100))% Complete")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundColor(.white.opacity(0.95))

                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                Rectangle()
                                    .fill(.white.opacity(0.3))
                                    .frame(height: 8)
                                    .cornerRadius(4)

                                Rectangle()
                                    .fill(.white)
                                    .frame(width: geometry.size.width * progress, height: 8)
                                    .cornerRadius(4)
                            }
                        }
                        .frame(height: 8)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(backgroundColor)
            .cornerRadius(20)
            .shadow(color: backgroundColor.opacity(0.3), radius: 10, x: 0, y: 5)
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
