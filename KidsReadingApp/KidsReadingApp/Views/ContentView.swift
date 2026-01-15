import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = PhonicsViewModel()

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.95, green: 0.97, blue: 1.0),
                            Color(red: 0.98, green: 0.95, blue: 1.0)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                if viewModel.selectedLevel == nil {
                    LevelSelectionView(viewModel: viewModel)
                } else if viewModel.isPracticeMode {
                    PracticeView(viewModel: viewModel)
                } else {
                    WordSliderView(viewModel: viewModel)
                }
            }
        }
        .navigationViewStyle(.stack)
    }
}
