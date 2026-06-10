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

struct NotchWingLayout {
    let notchCutoutWidth: CGFloat
    let wingWidth: CGFloat
    let height: CGFloat
    let innerCornerRadius: CGFloat
    let outerCornerRadius: CGFloat
    let usesHardwareNotchCutout: Bool

    static func compactFromEnvironment(screen: NSScreen? = nil) -> NotchWingLayout {
        let environment = ProcessInfo.processInfo.environment
        let measuredNotchWidth = screen.flatMap { measuredNotchCutoutWidth(screen: $0) }
        let measuredNotchHeightValue = screen.flatMap { measuredNotchHeight(screen: $0) }
        let usesHardwareNotchCutout = measuredNotchWidth != nil || screen.map { $0.safeAreaInsets.top > 0 } == true
        let defaultNotchWidth = usesHardwareNotchCutout ? (measuredNotchWidth ?? 184) : 0
        let defaultWingWidth: CGFloat = usesHardwareNotchCutout ? 36 : 132
        let defaultHeight = usesHardwareNotchCutout ? (measuredNotchHeightValue ?? 30) : 38
        let defaultInnerRadius: CGFloat = usesHardwareNotchCutout ? 5 : 8
        let defaultOuterRadius: CGFloat = usesHardwareNotchCutout ? 8 : 12
        return NotchWingLayout(
            notchCutoutWidth: CGFloat(Double(environment["DYNAMAC_NOTCH_WIDTH"] ?? "\(Int(defaultNotchWidth))") ?? Double(defaultNotchWidth)),
            wingWidth: CGFloat(Double(environment["DYNAMAC_WING_WIDTH"] ?? "\(Int(defaultWingWidth))") ?? Double(defaultWingWidth)),
            height: CGFloat(Double(environment["DYNAMAC_COMPACT_HEIGHT"] ?? "\(Int(defaultHeight))") ?? Double(defaultHeight)),
            innerCornerRadius: CGFloat(Double(environment["DYNAMAC_INNER_RADIUS"] ?? "\(Int(defaultInnerRadius))") ?? Double(defaultInnerRadius)),
            outerCornerRadius: CGFloat(Double(environment["DYNAMAC_OUTER_RADIUS"] ?? "\(Int(defaultOuterRadius))") ?? Double(defaultOuterRadius)),
            usesHardwareNotchCutout: usesHardwareNotchCutout
        )
    }

    private static func measuredNotchCutoutWidth(screen: NSScreen) -> CGFloat? {
        guard let leftArea = screen.auxiliaryTopLeftArea,
              let rightArea = screen.auxiliaryTopRightArea else {
            return nil
        }

        let widthGap = screen.frame.width - leftArea.width - rightArea.width
        let positionGap = rightArea.minX - leftArea.maxX
        let gap = min(widthGap, positionGap)
        guard gap > 0 else { return nil }

        // Boring Notch uses the same NSScreen auxiliary-area approach and adds a tiny inset.
        // Keep the measured cutout tunable because auxiliary areas can be wider than the visual notch on some display modes.
        let environment = ProcessInfo.processInfo.environment
        let margin = CGFloat(Double(environment["DYNAMAC_NOTCH_MARGIN"] ?? "4") ?? 4)
        return max(160, gap + margin)
    }

    private static func measuredNotchHeight(screen: NSScreen) -> CGFloat? {
        let safeTop = screen.safeAreaInsets.top
        if safeTop >= 24 && safeTop <= 32 {
            return safeTop
        }

        let topBand = screen.frame.maxY - screen.visibleFrame.maxY
        if topBand >= 24 && topBand <= 32 {
            return topBand
        }

        return nil
    }

    var totalSize: NSSize {
        NSSize(width: wingWidth * 2 + (usesHardwareNotchCutout ? notchCutoutWidth : 0), height: height)
    }

    var fullPillRect: NSRect {
        NSRect(origin: .zero, size: totalSize)
    }

    func leftWingRect(in bounds: NSRect) -> NSRect {
        NSRect(x: 0, y: 0, width: wingWidth, height: bounds.height)
    }

    func rightWingRect(in bounds: NSRect) -> NSRect {
        NSRect(x: wingWidth + notchCutoutWidth, y: 0, width: wingWidth, height: bounds.height)
    }

    func notchCutoutRect(in bounds: NSRect) -> NSRect {
        NSRect(x: wingWidth, y: 0, width: notchCutoutWidth, height: bounds.height)
    }

    func diagnosticDescription(screen: NSScreen) -> String {
        let left = screen.auxiliaryTopLeftArea.map { "\($0)" } ?? "nil"
        let right = screen.auxiliaryTopRightArea.map { "\($0)" } ?? "nil"
        return [
            "DYNAMAC_NATIVE_DIAG",
            "screen.frame=\(screen.frame)",
            "screen.visibleFrame=\(screen.visibleFrame)",
            "screen.safeAreaInsets=\(screen.safeAreaInsets)",
            "screen.auxiliaryTopLeftArea=\(left)",
            "screen.auxiliaryTopRightArea=\(right)",
            "layout.notchCutoutWidth=\(Int(notchCutoutWidth))",
            "layout.wingWidth=\(Int(wingWidth))",
            "layout.height=\(Int(height))",
            "layout.displayMode=\(usesHardwareNotchCutout ? "notch-wings" : "single-pill")"
        ].joined(separator: "\n")
    }
}

final class IslandView: NSView {
    var onToggle: (() -> Void)?

    var expanded = false {
        didSet { needsDisplay = true }
    }
    var statuses: [StatusItem] = [] {
        didSet { needsDisplay = true }
    }
    var compactLayout = NotchWingLayout.compactFromEnvironment() {
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

        if expanded {
            drawExpandedSurface()
        } else if compactLayout.usesHardwareNotchCutout {
            drawCompactNotchWings()
        } else {
            drawCompactSinglePill()
        }

        drawContent()
    }

    private func drawExpandedSurface() {
        let radius: CGFloat = 42
        let path = NSBezierPath()

        // Expanded mode grows downward from the physical top edge.
        // Top edge stays flush; only lower corners are rounded.
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

        NSColor(calibratedRed: 0.035, green: 0.035, blue: 0.04, alpha: 0.98).setFill()
        path.fill()
    }

    private func drawCompactNotchWings() {
        // The center is intentionally transparent: the real hardware notch occupies that gap.
        // Drawing only the side wings makes the UI feel attached to the occluded notch instead of covering it.
        let leftWing = compactLayout.leftWingRect(in: bounds)
        let rightWing = compactLayout.rightWingRect(in: bounds)
        compactWingPath(rect: leftWing, side: .left).fill()
        compactWingPath(rect: rightWing, side: .right).fill()
    }

    private func drawCompactSinglePill() {
        // Non-notch displays have no hardware cutout, so a split surface looks broken.
        // Draw one normal compact pill centered in the menu-bar area for external monitors and desktop Macs.
        let path = NSBezierPath(roundedRect: bounds, xRadius: compactLayout.outerCornerRadius, yRadius: compactLayout.outerCornerRadius)
        NSColor(calibratedRed: 0.035, green: 0.035, blue: 0.04, alpha: 0.98).setFill()
        path.fill()
    }

    private enum WingSide {
        case left
        case right
    }

    private func compactWingPath(rect: NSRect, side: WingSide) -> NSBezierPath {
        let outer = compactLayout.outerCornerRadius
        let inner = compactLayout.innerCornerRadius
        let path = NSBezierPath()

        switch side {
        case .left:
            path.move(to: NSPoint(x: rect.minX + outer, y: rect.minY))
            path.line(to: NSPoint(x: rect.maxX - inner, y: rect.minY))
            path.curve(
                to: NSPoint(x: rect.maxX, y: rect.minY + inner),
                controlPoint1: NSPoint(x: rect.maxX - inner / 2, y: rect.minY),
                controlPoint2: NSPoint(x: rect.maxX, y: rect.minY + inner / 2)
            )
            path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - inner))
            path.curve(
                to: NSPoint(x: rect.maxX - inner, y: rect.maxY),
                controlPoint1: NSPoint(x: rect.maxX, y: rect.maxY - inner / 2),
                controlPoint2: NSPoint(x: rect.maxX - inner / 2, y: rect.maxY)
            )
            path.line(to: NSPoint(x: rect.minX + outer, y: rect.maxY))
            path.curve(
                to: NSPoint(x: rect.minX, y: rect.maxY - outer),
                controlPoint1: NSPoint(x: rect.minX + outer / 2, y: rect.maxY),
                controlPoint2: NSPoint(x: rect.minX, y: rect.maxY - outer / 2)
            )
            path.line(to: NSPoint(x: rect.minX, y: rect.minY + outer))
            path.curve(
                to: NSPoint(x: rect.minX + outer, y: rect.minY),
                controlPoint1: NSPoint(x: rect.minX, y: rect.minY + outer / 2),
                controlPoint2: NSPoint(x: rect.minX + outer / 2, y: rect.minY)
            )
        case .right:
            path.move(to: NSPoint(x: rect.minX + inner, y: rect.minY))
            path.line(to: NSPoint(x: rect.maxX - outer, y: rect.minY))
            path.curve(
                to: NSPoint(x: rect.maxX, y: rect.minY + outer),
                controlPoint1: NSPoint(x: rect.maxX - outer / 2, y: rect.minY),
                controlPoint2: NSPoint(x: rect.maxX, y: rect.minY + outer / 2)
            )
            path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - outer))
            path.curve(
                to: NSPoint(x: rect.maxX - outer, y: rect.maxY),
                controlPoint1: NSPoint(x: rect.maxX, y: rect.maxY - outer / 2),
                controlPoint2: NSPoint(x: rect.maxX - outer / 2, y: rect.maxY)
            )
            path.line(to: NSPoint(x: rect.minX + inner, y: rect.maxY))
            path.curve(
                to: NSPoint(x: rect.minX, y: rect.maxY - inner),
                controlPoint1: NSPoint(x: rect.minX + inner / 2, y: rect.maxY),
                controlPoint2: NSPoint(x: rect.minX, y: rect.maxY - inner / 2)
            )
            path.line(to: NSPoint(x: rect.minX, y: rect.minY + inner))
            path.curve(
                to: NSPoint(x: rect.minX + inner, y: rect.minY),
                controlPoint1: NSPoint(x: rect.minX, y: rect.minY + inner / 2),
                controlPoint2: NSPoint(x: rect.minX + inner / 2, y: rect.minY)
            )
        }

        path.close()
        NSColor(calibratedRed: 0.035, green: 0.035, blue: 0.04, alpha: 0.98).setFill()
        return path
    }

    private func drawContent() {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let primary = statuses.first?.agent ?? "Snuffles"
        let warningCount = statuses.filter { $0.state == "warning" || $0.state == "error" }.count
        let runningCount = statuses.filter { $0.state == "running" }.count
        let meta = "\(runningCount) active · \(warningCount) warn"

        let titleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: expanded ? 26 : 12, weight: .bold),
            .paragraphStyle: paragraph
        ]
        let metaAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(calibratedWhite: 0.72, alpha: 1),
            .font: NSFont.systemFont(ofSize: expanded ? 13 : 10, weight: .medium),
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
        } else if !compactLayout.usesHardwareNotchCutout {
            let left = NSRect(x: 0, y: 0, width: bounds.width / 2, height: bounds.height)
            let right = NSRect(x: bounds.width / 2, y: 0, width: bounds.width / 2, height: bounds.height)
            NSString(string: "●  \(primary)").draw(in: left.insetBy(dx: 14, dy: 9), withAttributes: titleAttrs)
            NSString(string: meta).draw(in: right.insetBy(dx: 12, dy: 9), withAttributes: titleAttrs)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NSPanel?
    private var islandView: IslandView?
    private var expanded = false
    private var compactLayout = NotchWingLayout.compactFromEnvironment()

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
        compactLayout = NotchWingLayout.compactFromEnvironment(screen: screen)
        if ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_DIAG"] == "1" {
            print(compactLayout.diagnosticDescription(screen: screen))
        }
        let size = compactLayout.totalSize
        let rect = topCenteredRect(screen: screen, size: size)
        let panel = NSPanel(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .screenSaver
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.hidesOnDeactivate = false

        let view = IslandView(frame: NSRect(origin: .zero, size: size))
        view.compactLayout = compactLayout
        view.onToggle = { [weak self] in self?.toggleExpanded() }
        panel.contentView = view
        panel.orderFrontRegardless()

        self.panel = panel
        self.islandView = view
    }

    private func toggleExpanded() {
        guard let panel, let islandView, let screen = panel.screen ?? NSScreen.main else { return }
        expanded.toggle()
        let size = expanded ? NSSize(width: 520, height: 210) : compactLayout.totalSize
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
