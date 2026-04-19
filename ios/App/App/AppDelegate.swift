import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window?.backgroundColor = UIColor(red: 0.961, green: 0.949, blue: 0.937, alpha: 1.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.disableWebViewBounce()
            self.makeKeyboardBackgroundTransparent()
        }
        return true
    }

    // iOS renders a UIInputSetContainerView behind the keyboard — make it clear
    private func makeKeyboardBackgroundTransparent() {
        for window in UIApplication.shared.windows {
            for subview in window.subviews {
                let className = String(describing: type(of: subview))
                if className.contains("InputSet") || className.contains("Keyboard") {
                    subview.backgroundColor = .clear
                    for sub in subview.subviews {
                        sub.backgroundColor = .clear
                    }
                }
            }
        }
        // Re-run when keyboard actually appears
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
    }

    @objc private func keyboardWillShow() {
        for window in UIApplication.shared.windows {
            for subview in window.subviews {
                let className = String(describing: type(of: subview))
                if className.contains("InputSet") || className.contains("RemoteKey") || className.contains("Keyboard") {
                    subview.backgroundColor = .clear
                    for sub in subview.subviews {
                        sub.backgroundColor = .clear
                    }
                }
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    private func disableWebViewBounce() {
        guard let bridge = (window?.rootViewController as? CAPBridgeViewController)?.bridge else { return }
        let appBg = UIColor(red: 0.961, green: 0.949, blue: 0.937, alpha: 1.0)
        bridge.webView?.backgroundColor = appBg
        bridge.webView?.scrollView.backgroundColor = appBg
        bridge.webView?.scrollView.bounces = false
        bridge.webView?.scrollView.alwaysBounceVertical = false
        bridge.webView?.scrollView.alwaysBounceHorizontal = false
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
