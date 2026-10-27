import Foundation
import Flutter

@objc public class ConfigProvider: NSObject {
    @objc public static func getApiBase() -> String {
        // Read from Info.plist which is set by Xcode build configuration
        if let apiBase = Bundle.main.object(forInfoDictionaryKey: "API_BASE") as? String {
            return apiBase
        }
        // Fallback for development
        return "http://localhost:3000"
    }
}