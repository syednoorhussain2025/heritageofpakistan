import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.disableWebViewBounce()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(notification:)), name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(notification:)), name: UIResponder.keyboardWillHideNotification, object: nil)
        return true
    }

    private var keyboardCoverView: UIView?

    @objc private func keyboardWillShow(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let keyboardFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let duration = userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double,
              let window = self.window else { return }

        keyboardCoverView?.removeFromSuperview()
        let cover = UIView(frame: keyboardFrame)
        cover.backgroundColor = UIColor(red: 0.961, green: 0.949, blue: 0.937, alpha: 1.0)
        cover.isUserInteractionEnabled = false
        cover.alpha = 0
        window.addSubview(cover)
        keyboardCoverView = cover

        UIView.animate(withDuration: duration) {
            cover.alpha = 1
        }
    }

    @objc private func keyboardWillHide(notification: Notification) {
        guard let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else {
            keyboardCoverView?.removeFromSuperview()
            keyboardCoverView = nil
            return
        }
        UIView.animate(withDuration: duration, animations: {
            self.keyboardCoverView?.alpha = 0
        }, completion: { _ in
            self.keyboardCoverView?.removeFromSuperview()
            self.keyboardCoverView = nil
        })
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
