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

// Paper-and-ink palette shared with the extension (docs/STYLE_GUIDE.md).
private enum Palette {
    static let paper = Color(red: 1.0, green: 0.992, blue: 0.957)
    static let card = Color(red: 1.0, green: 0.996, blue: 0.976)
    static let ink = Color(red: 0.125, green: 0.133, blue: 0.118)
    static let muted = Color(red: 0.392, green: 0.396, blue: 0.357)
    static let line = Color(red: 0.843, green: 0.843, blue: 0.788)
    static let stamp = Color(red: 0.906, green: 0.906, blue: 0.863)
    static let lime = Color(red: 0.890, green: 1.0, blue: 0.451)
}

private struct SetupView: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 8) {
                    Circle().fill(Palette.lime).overlay(Circle().stroke(Palette.ink)).frame(width: 9, height: 9)
                    Text("SAFARI EXTENSION")
                        .font(.system(.caption, design: .monospaced))
                        .tracking(1)
                        .foregroundStyle(Palette.muted)
                }
                Text("Smooth Surfer")
                    .font(.system(size: 38, weight: .bold, design: .monospaced))
                    .tracking(-1.5)
                    .accessibilityAddTraits(.isHeader)
                Text("Calmer feeds in Safari. Three steps and you’re set.")
                    .font(.title3)
                    .foregroundStyle(Palette.muted)
                step(1, "Turn on the extension", "Open Settings → Apps → Safari → Extensions → Smooth Surfer. On iOS 16–17, Safari is directly in Settings.")
                step(2, "Allow website access", "Allow the websites you want calmer. To use the AI filter, also allow api.anthropic.com when asked.")
                step(3, "Open the menu in Safari", "On a website, open the page menu and choose Smooth Surfer. Each site’s section says what’s on. Add your Anthropic key under AI filter. Hidden posts and Stats open as Safari tabs.")
                Button {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    openURL(url)
                } label: {
                    Text("Open app settings")
                        .font(.system(.headline, design: .monospaced))
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .foregroundStyle(Palette.ink)
                .background(stamped(fill: Palette.lime, radius: 6, offset: 2))
                Text("This opens this app’s settings. To turn on the extension, follow the Safari path in step 1.")
                    .font(.footnote)
                    .foregroundStyle(Palette.muted)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Websites in Safari only")
                        .font(.system(.headline, design: .monospaced))
                    Text("Smooth Surfer can’t change the X, Reddit, or YouTube apps. Open their websites in Safari instead. Chrome’s on-device model isn’t available on iPhone, so the AI filter uses your Anthropic key.")
                    Text("Your rules and calls stay in this Safari profile and don’t sync with Chrome. The AI filter sends posts to Anthropic; Improve rules sends saved examples only when you ask.")
                        .foregroundStyle(Palette.muted)
                }
                .font(.callout)
                .padding(16)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            }
            .frame(maxWidth: 560, alignment: .leading)
            .padding(22)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.paper.ignoresSafeArea())
        .foregroundStyle(Palette.ink)
        .tint(Palette.ink)
        .preferredColorScheme(.light)
    }

    private func step(_ number: Int, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(number)")
                .font(.system(.footnote, design: .monospaced))
                .frame(width: 28, height: 28)
                .background(Circle().fill(Palette.lime))
                .overlay(Circle().stroke(Palette.ink))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(.headline, design: .monospaced))
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityLabel("Step \(number): \(title)")
                Text(detail)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(stamped(fill: Palette.card, radius: 8, offset: 3))
    }

    // Ink border with a hard offset shadow, as on the extension's cards.
    private func stamped(fill: Color, radius: CGFloat, offset: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius).fill(Palette.stamp).offset(x: offset, y: offset + 1)
            RoundedRectangle(cornerRadius: radius).fill(fill)
            RoundedRectangle(cornerRadius: radius).stroke(Palette.ink, lineWidth: 1)
        }
    }
}
