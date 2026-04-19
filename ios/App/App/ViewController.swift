import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        setupKeyboardObservers()
    }

    private func setupKeyboardObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        hideKeyboardBackdrop()
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        hideKeyboardBackdrop()
    }

    private func hideKeyboardBackdrop() {
        // iOS renders UIInputSetHostView as a white backdrop behind the keyboard
        // when Capacitor's hideFormAccessoryBar swizzling removes the inputAccessoryView.
        // We make all such views transparent to eliminate the white overlay.
        DispatchQueue.main.async {
            for scene in UIApplication.shared.connectedScenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for window in windowScene.windows {
                    let windowName = NSStringFromClass(type(of: window))
                    if windowName.contains("Keyboard") || windowName.contains("Remote") {
                        self.makeBackdropTransparent(in: window)
                    }
                }
            }
        }
    }

    private func makeBackdropTransparent(in view: UIView) {
        let viewName = NSStringFromClass(type(of: view))
        if viewName.contains("InputSetHost") || viewName.contains("InputSetContainer") {
            view.backgroundColor = .clear
            view.isOpaque = false
            view.alpha = 1.0
        }
        for subview in view.subviews {
            makeBackdropTransparent(in: subview)
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
