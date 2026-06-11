import AppKit
import QuartzCore

struct StatusPayload: Decodable {
    let statuses: [StatusItem]
}

struct StatusItem: Decodable {
    let agent: String
    let state: String
    let task: String
    let detail: String?
    let updatedAt: String?
    let media: MediaInfo?
}

struct MediaInfo: Decodable {
    let source: String?
    let title: String?
    let artist: String?
    let album: String?
    let artworkUrl: String?
    let durationSeconds: Double?
    let positionSeconds: Double?
    let playbackState: String?
    let elapsedLabel: String?
    let durationLabel: String?
}

struct NotchWingLayout {
    let notchCutoutWidth: CGFloat
    let wingWidth: CGFloat
    let height: CGFloat
    let innerCornerRadius: CGFloat
    let outerCornerRadius: CGFloat
    let notchOverlap: CGFloat
    let usesHardwareNotchCutout: Bool
    let showsQaNotchSilhouette: Bool

    static func compactFromEnvironment(screen: NSScreen? = nil) -> NotchWingLayout {
        let environment = ProcessInfo.processInfo.environment
        let measuredNotchHeightValue = screen.flatMap { measuredNotchHeight(screen: $0) }
        let hasHardwareNotch = screen.flatMap { measuredNotchCutoutWidth(screen: $0) } != nil
            || screen.map { $0.safeAreaInsets.top > 0 } == true

        // Hand-calibrated dimensions for the hardware-notch overlay. These fixed values are
        // used as-is (they intentionally take precedence over OS-measured notch sizes) so the
        // overlay renders identically on every notch Mac. Each can still be overridden at
        // runtime via its env var; fractional values are preserved.
        let defaultNotchWidth: CGFloat = hasHardwareNotch ? 182 : 0
        let defaultWingWidth: CGFloat = hasHardwareNotch ? 37 : 132
        let defaultInnerRadius: CGFloat = hasHardwareNotch ? 5 : 8
        let defaultOuterRadius: CGFloat = hasHardwareNotch ? 8 : 12
        let defaultNotchOverlap: CGFloat = hasHardwareNotch ? 12 : 0

        func tuned(_ key: String, _ fallback: CGFloat) -> CGFloat {
            guard let raw = environment[key], let parsed = Double(raw) else { return fallback }
            return CGFloat(parsed)
        }

        // Height matches the hardware notch exactly: use the measured safe-area notch height
        // so the overlay lines up with the physical notch edge. This is measured once at
        // launch and then held fixed, so a full-screen Space (which stops reporting the
        // notch) can't change it. Falls back to the env override or 32pt only if unmeasured.
        let notchHeight: CGFloat = hasHardwareNotch
            ? (measuredNotchHeightValue ?? tuned("DYNAMAC_COMPACT_HEIGHT", 32))
            : tuned("DYNAMAC_COMPACT_HEIGHT", 38)

        return NotchWingLayout(
            notchCutoutWidth: tuned("DYNAMAC_NOTCH_WIDTH", defaultNotchWidth),
            wingWidth: tuned("DYNAMAC_WING_WIDTH", defaultWingWidth),
            height: notchHeight,
            innerCornerRadius: tuned("DYNAMAC_INNER_RADIUS", defaultInnerRadius),
            outerCornerRadius: tuned("DYNAMAC_OUTER_RADIUS", defaultOuterRadius),
            notchOverlap: tuned("DYNAMAC_NOTCH_OVERLAP", defaultNotchOverlap),
            usesHardwareNotchCutout: hasHardwareNotch,
            showsQaNotchSilhouette: environment["DYNAMAC_QA_NOTCH_SILHOUETTE"] == "1"
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
        // Extend inward by notchOverlap so the wing covers the notch's rounded corner.
        NSRect(x: 0, y: 0, width: wingWidth + notchOverlap, height: bounds.height)
    }

    func rightWingRect(in bounds: NSRect) -> NSRect {
        // Start notchOverlap earlier so the wing covers the notch's rounded corner.
        NSRect(x: wingWidth + notchCutoutWidth - notchOverlap, y: 0, width: wingWidth + notchOverlap, height: bounds.height)
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
            "layout.displayMode=\(usesHardwareNotchCutout ? "notch-wings" : "single-pill")",
            "layout.qaNotchSilhouette=\(showsQaNotchSilhouette ? "on" : "off")"
        ].joined(separator: "\n")
    }
}

final class IslandView: NSView {
    var onToggle: (() -> Void)?
    var onMediaControl: ((String, String) -> Void)?

    var expanded = false {
        didSet { needsDisplay = true }
    }
    private var statusLoadedAt = Date()

    var statuses: [StatusItem] = [] {
        didSet {
            statusLoadedAt = Date()
            needsDisplay = true
        }
    }
    var compactLayout = NotchWingLayout.compactFromEnvironment() {
        didSet { needsDisplay = true }
    }

    override var isFlipped: Bool { true }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if expanded, let action = mediaControlAction(at: location), let media = nowPlayingMedia() {
            onMediaControl?(action, media.source ?? "")
            return
        }
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
        // Use the same bottom-corner radius as the compact notch wings so the shape stays
        // consistent through the expand/collapse animation instead of suddenly rounding off.
        let radius = compactLayout.outerCornerRadius
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
        if compactLayout.showsQaNotchSilhouette {
            drawQaNotchSilhouette()
        }
    }

    private func drawQaNotchSilhouette() {
        let rect = compactLayout.notchCutoutRect(in: bounds)
        let radius = min(max(6, rect.height * 0.32), 10)
        let path = NSBezierPath()
        // QA guide mirrors the measured native cutout without filling it. A filled fake notch
        // hides the real hardware notch in camera photos, so calibration uses an outline only.
        path.move(to: NSPoint(x: rect.minX, y: rect.minY))
        path.line(to: NSPoint(x: rect.maxX, y: rect.minY))
        path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - radius))
        path.curve(
            to: NSPoint(x: rect.maxX - radius, y: rect.maxY),
            controlPoint1: NSPoint(x: rect.maxX, y: rect.maxY - radius * 0.45),
            controlPoint2: NSPoint(x: rect.maxX - radius * 0.45, y: rect.maxY)
        )
        path.line(to: NSPoint(x: rect.minX + radius, y: rect.maxY))
        path.curve(
            to: NSPoint(x: rect.minX, y: rect.maxY - radius),
            controlPoint1: NSPoint(x: rect.minX + radius * 0.45, y: rect.maxY),
            controlPoint2: NSPoint(x: rect.minX, y: rect.maxY - radius * 0.45)
        )
        path.close()
        NSColor.systemPink.withAlphaComponent(0.95).setStroke()
        path.lineWidth = 2
        path.stroke()

        NSColor.systemYellow.withAlphaComponent(0.85).setStroke()
        let leftEdge = NSBezierPath()
        leftEdge.move(to: NSPoint(x: rect.minX, y: rect.minY))
        leftEdge.line(to: NSPoint(x: rect.minX, y: rect.maxY))
        leftEdge.lineWidth = 1
        leftEdge.stroke()
        let rightEdge = NSBezierPath()
        rightEdge.move(to: NSPoint(x: rect.maxX, y: rect.minY))
        rightEdge.line(to: NSPoint(x: rect.maxX, y: rect.maxY))
        rightEdge.lineWidth = 1
        rightEdge.stroke()
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
        let path = NSBezierPath()

        // Flipped coords: minY = top (flush to the screen edge), maxY = bottom.
        // The top edge stays perfectly straight so the wing reads as connected off the top
        // of the screen. The notch-side bottom corner is kept square (no rounding) and the
        // wing overlaps the notch, so the hardware notch's own rounded corner is fully
        // covered instead of peeking out below. Only the outer, screen-edge bottom corner
        // is rounded.
        switch side {
        case .left:
            path.move(to: NSPoint(x: rect.minX, y: rect.minY))          // top-left (square)
            path.line(to: NSPoint(x: rect.maxX, y: rect.minY))          // top-right (square)
            path.line(to: NSPoint(x: rect.maxX, y: rect.maxY))          // bottom-right, notch side (square)
            path.line(to: NSPoint(x: rect.minX + outer, y: rect.maxY))
            path.curve(
                to: NSPoint(x: rect.minX, y: rect.maxY - outer),
                controlPoint1: NSPoint(x: rect.minX + outer / 2, y: rect.maxY),
                controlPoint2: NSPoint(x: rect.minX, y: rect.maxY - outer / 2)
            )
            path.line(to: NSPoint(x: rect.minX, y: rect.minY))          // up left edge (square top-left)
        case .right:
            path.move(to: NSPoint(x: rect.minX, y: rect.minY))          // top-left (square)
            path.line(to: NSPoint(x: rect.maxX, y: rect.minY))          // top-right (square)
            path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - outer))
            path.curve(
                to: NSPoint(x: rect.maxX - outer, y: rect.maxY),
                controlPoint1: NSPoint(x: rect.maxX, y: rect.maxY - outer / 2),
                controlPoint2: NSPoint(x: rect.maxX - outer / 2, y: rect.maxY)
            )
            path.line(to: NSPoint(x: rect.minX, y: rect.maxY))          // bottom-left, notch side (square)
            path.line(to: NSPoint(x: rect.minX, y: rect.minY))          // up left edge (square top-left)
        }

        path.close()
        NSColor(calibratedRed: 0.035, green: 0.035, blue: 0.04, alpha: 0.98).setFill()
        return path
    }

    private func drawContent() {
        guard let media = nowPlayingMedia() else {
            drawFallbackStatusContent()
            return
        }

        if expanded {
            drawExpandedNowPlaying(media)
        } else {
            drawCompactNowPlaying(media)
        }
    }

    private func nowPlayingMedia() -> MediaInfo? {
        statuses.first { $0.agent == "Now Playing" }?.media
    }

    private func drawCompactNowPlaying(_ media: MediaInfo) {
        let artSize = min(bounds.height - 8, 28)
        let y = (bounds.height - artSize) / 2
        let x: CGFloat
        if compactLayout.usesHardwareNotchCutout {
            // Notch mode intentionally avoids title/artist text; the artwork alone is the live activity.
            x = max(4, compactLayout.wingWidth - artSize - 5)
        } else {
            x = 8
        }
        drawArtwork(media: media, in: NSRect(x: x, y: y, width: artSize, height: artSize), cornerRadius: 7, fallbackFontSize: 17)

        if compactLayout.usesHardwareNotchCutout {
            let rightWing = compactLayout.rightWingRect(in: bounds)
            drawPlayingBars(media: media, in: rightWing.insetBy(dx: 10, dy: 8))
        }
    }

    private func drawExpandedNowPlaying(_ media: MediaInfo) {
        NSString(string: "NOW PLAYING").draw(
            in: NSRect(x: 28, y: 20, width: bounds.width - 56, height: 18),
            withAttributes: [.foregroundColor: NSColor(calibratedWhite: 0.70, alpha: 1), .font: NSFont.systemFont(ofSize: 12, weight: .bold)]
        )

        let cover = NSRect(x: 28, y: 52, width: 112, height: 112)
        drawArtwork(media: media, in: cover, cornerRadius: 22, fallbackFontSize: 42)

        let titleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: 24, weight: .bold)
        ]
        let artistAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(calibratedWhite: 0.74, alpha: 1),
            .font: NSFont.systemFont(ofSize: 14, weight: .medium)
        ]
        let timeAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(calibratedWhite: 0.64, alpha: 1),
            .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        ]

        let textX: CGFloat = 160
        NSString(string: media.title ?? "Nothing playing").draw(in: NSRect(x: textX, y: 56, width: bounds.width - textX - 28, height: 34), withAttributes: titleAttrs)
        NSString(string: media.artist?.isEmpty == false ? media.artist! : displaySourceName(media.source)).draw(in: NSRect(x: textX, y: 92, width: bounds.width - textX - 28, height: 22), withAttributes: artistAttrs)

        let elapsedSeconds = displayPositionSeconds(media)
        let elapsed = formatSeconds(elapsedSeconds)
        let duration = media.durationLabel ?? formatSeconds(media.durationSeconds)
        NSString(string: "\(elapsed) / \(duration)").draw(in: NSRect(x: textX, y: 124, width: 180, height: 18), withAttributes: timeAttrs)
        drawProgressBar(media: media, positionSeconds: elapsedSeconds, rect: NSRect(x: textX, y: 148, width: bounds.width - textX - 40, height: 5))
        drawMediaControls(media: media)
    }

    private func drawArtwork(media: MediaInfo, in rect: NSRect, cornerRadius: CGFloat, fallbackFontSize: CGFloat) {
        let path = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)
        NSGraphicsContext.saveGraphicsState()
        path.addClip()
        if let image = artworkImage(media.artworkUrl) {
            drawUprightImage(image, in: rect)
        } else {
            NSColor(calibratedWhite: 1, alpha: 0.10).setFill()
            rect.fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .foregroundColor: NSColor(calibratedWhite: 0.88, alpha: 1),
                .font: NSFont.systemFont(ofSize: fallbackFontSize, weight: .semibold)
            ]
            let note = "♪" as NSString
            let size = note.size(withAttributes: attrs)
            note.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attrs)
        }
        NSGraphicsContext.restoreGraphicsState()
    }

    private func artworkImage(_ value: String?) -> NSImage? {
        guard let value, !value.isEmpty else { return nil }
        if value.hasPrefix("http://") || value.hasPrefix("https://"), let url = URL(string: value), let data = try? Data(contentsOf: url, options: [.mappedIfSafe]) {
            return NSImage(data: data)
        }
        let url = value.hasPrefix("file://") ? URL(string: value) : URL(fileURLWithPath: value)
        guard let url else { return nil }
        return NSImage(contentsOf: url)
    }

    private func drawUprightImage(_ image: NSImage, in rect: NSRect) {
        // IslandView is flipped so text/layout use top-left coordinates. Draw album art through
        // a temporary unflipped transform so AppKit does not vertically invert remote artwork.
        guard let context = NSGraphicsContext.current?.cgContext else {
            image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
            return
        }
        context.saveGState()
        context.translateBy(x: 0, y: bounds.height)
        context.scaleBy(x: 1, y: -1)
        let unflippedRect = NSRect(x: rect.minX, y: bounds.height - rect.maxY, width: rect.width, height: rect.height)
        image.draw(in: unflippedRect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: false, hints: nil)
        context.restoreGState()
    }

    private func displayPositionSeconds(_ media: MediaInfo) -> Double {
        let base = max(media.positionSeconds ?? 0, 0)
        guard media.playbackState == "playing" else { return base }
        let duration = max(media.durationSeconds ?? 0, 0)
        let advanced = base + Date().timeIntervalSince(statusLoadedAt)
        return duration > 0 ? min(advanced, duration) : advanced
    }

    private func drawProgressBar(media: MediaInfo, positionSeconds: Double, rect: NSRect) {
        NSColor(calibratedWhite: 1, alpha: 0.14).setFill()
        NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
        let duration = max(media.durationSeconds ?? 0, 0)
        let position = max(positionSeconds, 0)
        guard duration > 0 else { return }
        let ratio = min(max(position / duration, 0), 1)
        let fill = NSRect(x: rect.minX, y: rect.minY, width: rect.width * CGFloat(ratio), height: rect.height)
        NSColor.systemPink.withAlphaComponent(0.92).setFill()
        NSBezierPath(roundedRect: fill, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
    }

    private func drawMediaControls(media: MediaInfo) {
        for action in ["previous", "playpause", "next"] {
            let rect = mediaControlRect(action: action)
            NSColor(calibratedWhite: 1, alpha: action == "playpause" ? 0.18 : 0.10).setFill()
            NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
            NSColor.white.setFill()
            drawTransportIcon(action: action, playing: media.playbackState == "playing", in: rect.insetBy(dx: action == "playpause" ? 10 : 8, dy: action == "playpause" ? 9 : 8))
        }
    }

    private func drawTransportIcon(action: String, playing: Bool, in rect: NSRect) {
        switch action {
        case "previous":
            drawSkipIcon(direction: -1, in: rect)
        case "next":
            drawSkipIcon(direction: 1, in: rect)
        default:
            if playing {
                let barWidth = max(3, rect.width * 0.26)
                NSBezierPath(roundedRect: NSRect(x: rect.minX, y: rect.minY, width: barWidth, height: rect.height), xRadius: 1.2, yRadius: 1.2).fill()
                NSBezierPath(roundedRect: NSRect(x: rect.maxX - barWidth, y: rect.minY, width: barWidth, height: rect.height), xRadius: 1.2, yRadius: 1.2).fill()
            } else {
                let path = NSBezierPath()
                path.move(to: NSPoint(x: rect.minX + 1, y: rect.minY))
                path.line(to: NSPoint(x: rect.maxX, y: rect.midY))
                path.line(to: NSPoint(x: rect.minX + 1, y: rect.maxY))
                path.close()
                path.fill()
            }
        }
    }

    private func drawSkipIcon(direction: CGFloat, in rect: NSRect) {
        let barWidth: CGFloat = 3
        let barX = direction < 0 ? rect.minX : rect.maxX - barWidth
        NSBezierPath(roundedRect: NSRect(x: barX, y: rect.minY, width: barWidth, height: rect.height), xRadius: 1, yRadius: 1).fill()
        let triangle = NSBezierPath()
        if direction < 0 {
            triangle.move(to: NSPoint(x: rect.maxX, y: rect.minY))
            triangle.line(to: NSPoint(x: rect.minX + barWidth + 2, y: rect.midY))
            triangle.line(to: NSPoint(x: rect.maxX, y: rect.maxY))
        } else {
            triangle.move(to: NSPoint(x: rect.minX, y: rect.minY))
            triangle.line(to: NSPoint(x: rect.maxX - barWidth - 2, y: rect.midY))
            triangle.line(to: NSPoint(x: rect.minX, y: rect.maxY))
        }
        triangle.close()
        triangle.fill()
    }

    private func drawPlayingBars(media: MediaInfo, in rect: NSRect) {
        let isPlaying = media.playbackState == "playing"
        let barCount = 3
        let gap: CGFloat = 3
        let barWidth = max(3, (rect.width - CGFloat(barCount - 1) * gap) / CGFloat(barCount))
        let phase = Date().timeIntervalSince1970 * 5
        for index in 0..<barCount {
            let x = rect.minX + CGFloat(index) * (barWidth + gap)
            let wave = isPlaying ? (sin(phase + Double(index) * 1.15) + 1) / 2 : 0.18
            let height = max(5, rect.height * CGFloat(0.32 + wave * 0.68))
            let y = rect.maxY - height
            NSColor.systemGreen.withAlphaComponent(isPlaying ? 0.95 : 0.45).setFill()
            NSBezierPath(roundedRect: NSRect(x: x, y: y, width: barWidth, height: height), xRadius: barWidth / 2, yRadius: barWidth / 2).fill()
        }
    }

    private func mediaControlRect(action: String) -> NSRect {
        let baseX: CGFloat = 160
        let y: CGFloat = 170
        let size: CGFloat = action == "playpause" ? 36 : 30
        switch action {
        case "previous": return NSRect(x: baseX, y: y + 3, width: size, height: size)
        case "playpause": return NSRect(x: baseX + 44, y: y, width: size, height: size)
        default: return NSRect(x: baseX + 92, y: y + 3, width: size, height: size)
        }
    }

    private func mediaControlAction(at point: NSPoint) -> String? {
        for action in ["previous", "playpause", "next"] {
            if mediaControlRect(action: action).contains(point) { return action }
        }
        return nil
    }

    private func formatSeconds(_ value: Double?) -> String {
        guard let value, value.isFinite, value >= 0 else { return "--:--" }
        let whole = Int(value)
        return "\(whole / 60):\(String(format: "%02d", whole % 60))"
    }

    private func displaySourceName(_ source: String?) -> String {
        switch source {
        case "spotify": return "Spotify"
        case "music": return "Music"
        case "youtube": return "YouTube"
        default: return "Now Playing"
        }
    }

    private func drawFallbackStatusContent() {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let primary = statuses.first?.agent ?? "Dynamac"
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: expanded ? 24 : 12, weight: .bold),
            .paragraphStyle: paragraph
        ]
        if expanded {
            NSString(string: primary).draw(in: NSRect(x: 28, y: 44, width: bounds.width - 56, height: 70), withAttributes: titleAttrs)
        } else if !compactLayout.usesHardwareNotchCutout {
            NSString(string: "♪").draw(in: bounds.insetBy(dx: 14, dy: 7), withAttributes: titleAttrs)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NSPanel?
    private var islandView: IslandView?
    private var statusTimer: Timer?
    private var displayTimer: Timer?
    private var expanded = false
    private var compactLayout = NotchWingLayout.compactFromEnvironment()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        createPanel()
        loadStatus()
        startStatusRefresh()
        startDisplayRefresh()

        if ProcessInfo.processInfo.environment["DYNAMAC_START_EXPANDED"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.toggleExpanded() }
        }

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
        // Intentionally NOT .canJoinAllSpaces / .stationary: those pin the overlay on top of
        // every Space so it sits visibly "waiting" during the slide animation. Keeping it on
        // the current Space lets it slide away with the departing Space; we then re-show it on
        // the new Space (with a fade) only once the transition has finished.
        panel.collectionBehavior = [.fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        // Disable the implicit window animation, otherwise resizing between expanded and
        // compact slides the panel from its old (wider, left-shifted) frame to the new
        // centered frame instead of snapping in place.
        panel.animationBehavior = .none

        let view = IslandView(frame: NSRect(origin: .zero, size: size))
        view.compactLayout = compactLayout
        view.onToggle = { [weak self] in self?.toggleExpanded() }
        view.onMediaControl = { [weak self] action, source in self?.performMediaControl(action: action, source: source) }
        panel.contentView = view
        panel.orderFrontRegardless()

        self.panel = panel
        self.islandView = view

        // A display-layout change can leave the panel with a stale frame; just re-pin it.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in self?.reassertCompactFrame() }
        // activeSpaceDidChange fires once the Space transition has finished. Re-show the
        // overlay on the now-active Space and fade it in so it turns on after the slide
        // completes rather than sitting pinned during it.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.activeSpaceDidChangeNotification,
            object: nil, queue: .main) { [weak self] _ in self?.showOnActiveSpace() }
    }

    private func showOnActiveSpace() {
        guard let panel else { return }
        reassertCompactFrame()
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.22
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
        }
    }

    private func reassertCompactFrame() {
        guard let panel, let islandView, !expanded, let screen = NSScreen.main else { return }
        // Reuse the launch-time notch layout instead of recomputing it. In a full-screen
        // Space macOS temporarily stops reporting the notch (safeAreaInsets/auxiliary areas
        // go away), so recomputing would fall back to the taller non-notch single pill and
        // the overlay would appear to grow. Only re-pin the fixed frame.
        let size = compactLayout.totalSize
        islandView.frame = NSRect(origin: .zero, size: size)
        panel.setFrame(topCenteredRect(screen: screen, size: size), display: true)
        islandView.needsDisplay = true
    }

    private func toggleExpanded() {
        guard let panel, let islandView, let screen = panel.screen ?? NSScreen.main else { return }
        expanded.toggle()
        let size = expanded ? NSSize(width: 520, height: 210) : compactLayout.totalSize
        let targetFrame = topCenteredRect(screen: screen, size: size)
        let duration = 0.28

        // The content view always fills the window, so animating the panel frame (which
        // topCenteredRect keeps centered) makes the surface scale toward the notch instead
        // of sliding. The filled expanded surface is drawn for the whole transition so the
        // transparent-center compact shape never shows mid-animation; we swap to the notch
        // wings only once the frame has finished shrinking.
        if expanded {
            // Grow: fill with the expanded surface first, then scale up smoothly.
            islandView.expanded = true
            islandView.needsDisplay = true
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(targetFrame, display: true)
            }
        } else {
            // Collapse: keep drawing the filled surface while it shrinks, swap to the
            // notch wings at the end.
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().setFrame(targetFrame, display: true)
            }, completionHandler: { [weak islandView] in
                islandView?.expanded = false
                islandView?.needsDisplay = true
            })
        }
    }

    private func topCenteredRect(screen: NSScreen, size: NSSize) -> NSRect {
        NSRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height
        )
    }

    private func performMediaControl(action: String, source: String) {
        let appName: String
        switch source {
        case "spotify": appName = "Spotify"
        case "music": appName = "Music"
        default: return
        }

        let command: String
        switch action {
        case "previous": command = "previous track"
        case "next": command = "next track"
        default: command = "playpause"
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", "if application \"\(appName)\" is running then tell application \"\(appName)\" to \(command)"]
        try? process.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.loadStatus() }
    }

    private func startStatusRefresh() {
        let interval = Double(ProcessInfo.processInfo.environment["DYNAMAC_STATUS_RELOAD_MS"] ?? "1000").flatMap { $0 >= 250 ? $0 / 1000 : nil } ?? 1
        statusTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.loadStatus()
        }
    }

    private func startDisplayRefresh() {
        let interval = Double(ProcessInfo.processInfo.environment["DYNAMAC_DISPLAY_REFRESH_MS"] ?? "33").flatMap { $0 >= 16 ? $0 / 1000 : nil } ?? 0.033
        displayTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.islandView?.needsDisplay = true
        }
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
