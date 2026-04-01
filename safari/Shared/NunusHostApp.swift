import SwiftUI

@main
struct NunusHostApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Nunus runs in Safari. On Mac: Safari → Settings → Extensions. On iPhone/iPad: Settings → Apps → Safari → Extensions.")
                .padding(24)
                .multilineTextAlignment(.center)
#if os(macOS)
                .frame(minWidth: 320, minHeight: 160)
#endif
        }
    }
}
