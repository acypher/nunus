import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let profile = item?.userInfo?[SFExtensionProfileKey] as? UUID
        let message = item?.userInfo?[SFExtensionMessageKey]
        os_log(.default, "Nunus Safari extension message: %{public}@", String(describing: message))
        let response = NSExtensionItem()
        if let profile {
            response.userInfo = [SFExtensionProfileKey: profile, SFExtensionMessageKey: ["echo": message as Any]]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
