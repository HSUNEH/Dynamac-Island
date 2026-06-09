import AppKit

struct StatusPayload: Decodable {
    let statuses: [StatusItem]
}

struct StatusItem: Decodable {
    let agent: String
    let state: String
    let task: String
    let detail: String?
    let updatedAt: String?
}

final class IslandView: NSView {
    var onToggle: (() -> Void)?

    var expanded = false {
        didSet { needsDisplay = true }
    }
    var statuses: [StatusItem] = [] {
        didSet { needsDisplay = true }
    }

    override var isFlipped: Bool { true }

    override func mouseDown(with event: NSEvent) {
        onToggle?()
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.clear.setFill()
        dirtyRect.fill()

        let radius: CGFloat = expanded ? 42 : 26
        let path = NSBezierPath(
            roundedRect: bounds,
            xRadius: expanded ? 0 : radius,
            yRadius: expanded ? 0 : radius
        )

        if expanded {
            // Native notch behavior: the top edge is flush with the physical screen top;
            // only the lower corners round, so the surface grows down from the menu-bar notch.
            path.removeAllPoints()
            path.move(to: NSPoint(x: 0, y: 0))
            path.line(to: NSPoint(x: bounds.maxX, y: 0))
            path.line(to: NSPoint(x: bounds.maxX, y: bounds.maxY - radius))
            path.curve(
                to: NSPoint(x: bounds.maxX - radius, y: bounds.maxY),
                controlPoint1: NSPoint(x: bounds.maxX, y: bounds.maxY - radius / 2),
                controlPoint2: NSPoint(x: bounds.maxX - radius / 2, y: bounds.maxY)
            )
            path.line(to: NSPoint(x: radius, y: bounds.maxY))
            path.curve(
                to: NSPoint(x: 0, y: bounds.maxY - radius),
                controlPoint1: NSPoint(x: radius / 2, y: bounds.maxY),
                controlPoint2: NSPoint(x: 0, y: bounds.maxY - radius / 2)
            )
            path.close()
        }

        NSColor(calibratedRed: 0.035, green: 0.035, blue: 0.04, alpha: 0.98).setFill()
        path.fill()

        drawContent()
    }

    private func drawContent() {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let primary = statuses.first?.agent ?? "Snuffles"
        let warningCount = statuses.filter { $0.state == "warning" || $0.state == "error" }.count
        let runningCount = statuses.filter { $0.state == "running" }.count
        let meta = "\(runningCount) active · \(warningCount) warning · \(statuses.count) total"

        let titleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: expanded ? 26 : 14, weight: .bold),
            .paragraphStyle: paragraph
        ]
        let metaAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(calibratedWhite: 0.72, alpha: 1),
            .font: NSFont.systemFont(ofSize: expanded ? 13 : 11, weight: .medium),
            .paragraphStyle: paragraph
        ]

        if expanded {
            NSString(string: "DYNAMAC ISLAND").draw(
                in: NSRect(x: 28, y: 20, width: bounds.width - 56, height: 18),
                withAttributes: [.foregroundColor: NSColor(calibratedWhite: 0.72, alpha: 1), .font: NSFont.systemFont(ofSize: 12, weight: .bold)]
            )
            NSString(string: statuses.isEmpty ? "Loading local status" : "All systems settled").draw(
                in: NSRect(x: 28, y: 44, width: bounds.width - 56, height: 70),
                withAttributes: titleAttrs
            )
            for (index, status) in statuses.prefix(3).enumerated() {
                let x = 28 + CGFloat(index) * ((bounds.width - 64) / 3)
                let card = NSRect(x: x, y: 120, width: (bounds.width - 84) / 3, height: 70)
                NSColor(calibratedWhite: 1, alpha: 0.08).setFill()
                NSBezierPath(roundedRect: card, xRadius: 16, yRadius: 16).fill()
                NSString(string: status.agent).draw(in: card.insetBy(dx: 10, dy: 8), withAttributes: metaAttrs)
                NSString(string: status.task).draw(in: NSRect(x: card.minX + 10, y: card.minY + 30, width: card.width - 20, height: 28), withAttributes: titleAttrs)
            }
        } else {
            NSString(string: "●  \(primary)").draw(in: NSRect(x: 18, y: 9, width: bounds.width - 36, height: 20), withAttributes: titleAttrs)
            NSString(string: meta).draw(in: NSRect(x: 36, y: 29, width: bounds.width - 52, height: 16), withAttributes: metaAttrs)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NSPanel?
    private var islandView: IslandView?
    private var expanded = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        createPanel()
        loadStatus()

        if ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_SMOKE_TEST"] == "1" {
            print("DYNAMAC_NATIVE_READY")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { NSApp.terminate(nil) }
        }
    }

    private func createPanel() {
        guard let screen = NSScreen.main else { return }
        let size = NSSize(width: 286, height: 58)
        let rect = topCenteredRect(screen: screen, size: size)
        let panel = NSPanel(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .screenSaver
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.hidesOnDeactivate = false

        let view = IslandView(frame: NSRect(origin: .zero, size: size))
        view.onToggle = { [weak self] in self?.toggleExpanded() }
        panel.contentView = view
        panel.orderFrontRegardless()

        self.panel = panel
        self.islandView = view
    }

    private func toggleExpanded() {
        guard let panel, let islandView, let screen = panel.screen ?? NSScreen.main else { return }
        expanded.toggle()
        let size = expanded ? NSSize(width: 520, height: 210) : NSSize(width: 286, height: 58)
        islandView.expanded = expanded
        islandView.frame = NSRect(origin: .zero, size: size)
        panel.setFrame(topCenteredRect(screen: screen, size: size), display: true, animate: true)
    }

    private func topCenteredRect(screen: NSScreen, size: NSSize) -> NSRect {
        NSRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height
        )
    }

    private func loadStatus() {
        let statusPath = ProcessInfo.processInfo.environment["DYNAMAC_STATUS_FILE"] ?? "status/status.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: statusPath)),
              let payload = try? JSONDecoder().decode(StatusPayload.self, from: data) else {
            return
        }
        islandView?.statuses = payload.statuses
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
