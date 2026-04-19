import UIKit
import Capacitor

class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        let appBg = UIColor(red: 0.961, green: 0.949, blue: 0.937, alpha: 1.0)
        webView?.backgroundColor = appBg
        webView?.scrollView.backgroundColor = appBg
    }
}
