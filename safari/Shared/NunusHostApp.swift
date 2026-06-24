import SwiftUI

@main
struct NunusHostApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 12) {
                Text("Nunus")
                    .font(.headline)
                Text("Read only the news that's new")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text("Nunus runs in Safari. On Mac: Safari → Settings → Extensions. On iPhone/iPad: Settings → Apps → Safari → Extensions.")
                    .font(.body)
            }
            .padding(24)
            .multilineTextAlignment(.center)
#if os(macOS)
                .frame(minWidth: 320, minHeight: 160)
#endif
        }
    }
}
