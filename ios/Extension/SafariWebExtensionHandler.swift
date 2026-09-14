import SafariServices

// Filtering runs in the shared web extension. No native messages or credentials
// need to cross into the containing app, and request contents are never logged.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["error": "Native messaging is not supported."]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
