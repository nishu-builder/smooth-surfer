import SwiftUI
import UIKit
import WebKit

// The converter owns the scene/storyboard shell; the maintained UI lives here.
final class ViewController: UIViewController {
    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.removeFromSuperview()
        let controller = UIHostingController(rootView: SetupView())
        addChild(controller)
        view.addSubview(controller.view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        controller.didMove(toParent: self)
    }
}

private struct SetupView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Rectangle().frame(height: 2)
                Text("Smooth Surfer")
                    .font(.system(.largeTitle, design: .monospaced).weight(.regular))
                    .accessibilityAddTraits(.isHeader)
                Text("Filter your feed in Safari.")
                    .font(.headline)
                Divider()
                step("1", "Enable the extension", "Open Settings → Apps → Safari → Extensions → Smooth Surfer. On iOS 16–17, Safari is directly in Settings.")
                step("2", "Allow website access", "Turn on Smooth Surfer and allow access to the websites you want to filter. Allow api.anthropic.com when asked to use cloud AI.")
                step("3", "Choose your rules", "In Safari, open a website, then open the page menu and choose Smooth Surfer. Open Settings to add your Anthropic API key and choose rules. Review rulings and Stats open as Safari tabs.")
                Divider()
                Text("Safari websites only")
                    .font(.system(.headline, design: .monospaced))
                Text("Smooth Surfer cannot filter inside the X, Reddit, or YouTube apps. Open their websites in Safari. Chrome’s on-device model is not available on iPhone; AI filtering uses your Anthropic key.")
                Text("Your rules and feedback stay in this Safari profile. Cloud filtering sends posts to Anthropic. Recalibration sends saved examples and feedback when you request it. Data does not automatically sync with Chrome.")
                    .foregroundStyle(.secondary)
                Button("Open app settings") {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    openURL(url)
                }
                .buttonStyle(.borderedProminent)
                .tint(.black)
                .foregroundStyle(.white)
                .frame(minHeight: 44)
                Text("This opens this app’s settings. To enable the extension, follow the Safari path above.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: 560, alignment: .leading)
            .padding(20)
            .frame(maxWidth: .infinity)
        }
        .background(.white)
        .foregroundStyle(.black)
        .preferredColorScheme(.light)
    }

    private func step(_ number: String, _ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(number). \(title)")
                .font(.system(.headline, design: .monospaced))
                .accessibilityAddTraits(.isHeader)
            Text(detail).fixedSize(horizontal: false, vertical: true)
        }
    }
}
