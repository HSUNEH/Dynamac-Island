import AppKit
import QuartzCore
import ServiceManagement

extension ISO8601DateFormatter {
    static let dynamacTimer: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

struct StatusPayload: Decodable {
    let statuses: [StatusItem]
    let activityRouter: ActivityRouterSnapshot?
}

struct ActivityRouterSnapshot: Decodable {
    var compactSurface: CompactActivitySurface?
}

struct CompactActivitySurface: Decodable {
    var activityId: String?
    var activityType: String?
    var priority: Double?
    var label: String?
    var glyph: String?
}

struct StatusItem: Decodable {
    var agent: String
    var activityId: String?
    var activityType: String?
    var state: String
    var task: String
    var detail: String?
    var updatedAt: String?
    var media: MediaInfo?
    var timer: TimerInfo?
    var volumeHud: RoutedActivityInfo?
    var brightnessHud: RoutedActivityInfo?
    var clipboardActivity: RoutedActivityInfo?
    var macContext: RoutedActivityInfo?
    var shelfActivity: RoutedActivityInfo?
    var dropActivity: RoutedActivityInfo?
}

struct RoutedActivityInfo: Decodable {
    var activityId: String?
    var activityType: String?
}

struct TimerInfo: Decodable {
    var id: String
    var durationSeconds: Double
    var remainingSeconds: Double
    var state: String
    var startedAt: String
    var updatedAt: String
    var displayText: String
    var error: String
    var replacedPrevious: Bool
}

struct TimerCompactOverlayViewModel {
    var id: String
    var remainingText: String
    var lifecycleState: String
    var isRunning: Bool
    var isPaused: Bool
}

struct TimerRenderedNotchOutput {
    var compactText: String
    var expandedTitle: String
    var progressPercent: Double
}

struct RoutedGenericActivityRenderedOutput {
    var compactText: String
    var expandedText: String
}

struct MediaInfo: Decodable {
    var source: String?
    var title: String?
    var artist: String?
    var album: String?
    var artworkUrl: String?
    var durationSeconds: Double?
    var positionSeconds: Double?
    var playbackState: String?
    var elapsedLabel: String?
    var durationLabel: String?
    var pageUrl: String?
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
            || screen.map { likelyBuiltInDisplay($0) } == true

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

    static func likelyBuiltInDisplay(_ screen: NSScreen) -> Bool {
        let name = screen.localizedName.lowercased()
        return name.contains("built-in") || name.contains("liquid retina") || name.contains("color lcd")
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
    var onMediaControl: ((String, String, Double, Double) -> Void)?
    var onMediaSeek: ((String, Double) -> Void)?
    var onOpenMediaSource: ((MediaInfo) -> Void)?
    var onExpandedInteraction: (() -> Void)?
    private var isDraggingProgress = false
    private var optimisticPlaybackState: String?
    private var optimisticPlaybackStateUntil = Date.distantPast
    private var artworkCache: [String: NSImage] = [:]
    private var failedArtworkKeys = Set<String>()

    var contentOpacity: CGFloat = 1 {
        didSet { needsDisplay = true }
    }

    var expanded = false {
        didSet { needsDisplay = true }
    }
    private var statusLoadedAt = Date()

    var statuses: [StatusItem] = []
    var activityRouter: ActivityRouterSnapshot? {
        didSet { needsDisplay = true }
    }
    var compactLayout = NotchWingLayout.compactFromEnvironment() {
        didSet { needsDisplay = true }
    }

    override var isFlipped: Bool { true }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if expanded, let media = nowPlayingMedia(), let seekSeconds = mediaSeekSecond(at: location, media: media) {
            isDraggingProgress = true
            applyOptimisticSeek(seconds: seekSeconds)
            onExpandedInteraction?()
            onMediaSeek?(media.source ?? "", seekSeconds)
            return
        }
        if expanded, let action = mediaControlAction(at: location), let media = nowPlayingMedia() {
            applyOptimisticMediaControl(action: action)
            onExpandedInteraction?()
            onMediaControl?(action, media.source ?? "", media.positionSeconds ?? 0, media.durationSeconds ?? 0)
            return
        }
        if expanded, let media = nowPlayingMedia(), mediaOpenSourceRect().contains(location) {
            onExpandedInteraction?()
            onOpenMediaSource?(media)
            return
        }
        onToggle?()
    }

    override func mouseDragged(with event: NSEvent) {
        guard isDraggingProgress, expanded, let media = nowPlayingMedia() else { return }
        let location = convert(event.locationInWindow, from: nil)
        if let seekSeconds = mediaSeekSecond(at: location, media: media) {
            applyOptimisticSeek(seconds: seekSeconds)
            onExpandedInteraction?()
            onMediaSeek?(media.source ?? "", seekSeconds)
        }
    }

    override func mouseUp(with event: NSEvent) {
        if isDraggingProgress {
            isDraggingProgress = false
        }
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

        drawContentWithOpacity()
    }

    private func drawContentWithOpacity() {
        guard contentOpacity > 0.01 else { return }
        guard let context = NSGraphicsContext.current else {
            drawContent()
            return
        }
        context.saveGraphicsState()
        context.cgContext.setAlpha(contentOpacity)
        drawContent()
        context.restoreGraphicsState()
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
        if let routed = routedStatusForCompactSurface(), let activityType = routedCompactActivityType() {
            if activityType == "timer" {
                if expanded {
                    drawExpandedTimer(routed)
                } else {
                    drawCompactTimer(routed)
                }
            } else if activityType == "nowPlaying", let media = routed.media {
                if expanded {
                    drawExpandedNowPlaying(media)
                } else {
                    drawCompactNowPlaying(media)
                }
            } else {
                drawRoutedGenericActivity(routed, activityType: activityType)
            }
            return
        }

        if let timerStatus = activeTimerStatus() {
            if expanded {
                drawExpandedTimer(timerStatus)
            } else {
                drawCompactTimer(timerStatus)
            }
            return
        }

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

    fileprivate func routedCompactSurfaceForSmoke() -> CompactActivitySurface? {
        activityRouter?.compactSurface
    }

    fileprivate func routedCompactActivityType() -> String? {
        guard let value = activityRouter?.compactSurface?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }

    private func inferredActivityType(for status: StatusItem) -> String {
        if let explicit = status.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !explicit.isEmpty {
            return explicit
        }
        if let volumeType = status.volumeHud?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !volumeType.isEmpty {
            return volumeType
        }
        if let brightnessType = status.brightnessHud?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !brightnessType.isEmpty {
            return brightnessType
        }
        if let clipboardType = status.clipboardActivity?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !clipboardType.isEmpty {
            return clipboardType
        }
        if let macContextType = status.macContext?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !macContextType.isEmpty {
            return macContextType
        }
        if let shelfType = status.shelfActivity?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !shelfType.isEmpty {
            return shelfType
        }
        if let dropType = status.dropActivity?.activityType?.trimmingCharacters(in: .whitespacesAndNewlines), !dropType.isEmpty {
            return dropType
        }
        switch status.agent {
        case "Volume", "DynaKeys Volume":
            return "volume"
        case "Brightness", "DynaKeys Brightness":
            return "brightness"
        case "Clipboard", "DynaClip":
            return "clipboard"
        case "Mac Context":
            return "macContext"
        case "DynaShelf", "Shelf":
            return "shelf"
        case "DynaDrop", "Drop":
            return "drop"
        case "Timer":
            return "timer"
        case "Now Playing":
            return "nowPlaying"
        case "Battery":
            return "battery"
        default:
            return "futurePassive"
        }
    }

    private func statusActivityIds(_ status: StatusItem) -> Set<String> {
        var ids = Set<String>()
        if let activityId = status.activityId, !activityId.isEmpty {
            ids.insert(activityId)
        }
        if let timerId = status.timer?.id, !timerId.isEmpty {
            ids.insert(timerId)
            ids.insert("timer-\(timerId)")
        }
        if let volumeHudId = status.volumeHud?.activityId, !volumeHudId.isEmpty {
            ids.insert(volumeHudId)
        }
        if let brightnessHudId = status.brightnessHud?.activityId, !brightnessHudId.isEmpty {
            ids.insert(brightnessHudId)
        }
        if let clipboardActivityId = status.clipboardActivity?.activityId, !clipboardActivityId.isEmpty {
            ids.insert(clipboardActivityId)
        }
        if let macContextActivityId = status.macContext?.activityId, !macContextActivityId.isEmpty {
            ids.insert(macContextActivityId)
        }
        if let shelfActivityId = status.shelfActivity?.activityId, !shelfActivityId.isEmpty {
            ids.insert(shelfActivityId)
        }
        if let dropActivityId = status.dropActivity?.activityId, !dropActivityId.isEmpty {
            ids.insert(dropActivityId)
        }
        return ids
    }

    fileprivate func routedStatusForCompactSurface() -> StatusItem? {
        guard let compactSurface = activityRouter?.compactSurface,
              let compactType = compactSurface.activityType?.trimmingCharacters(in: .whitespacesAndNewlines),
              !compactType.isEmpty else { return nil }
        if let compactId = compactSurface.activityId?.trimmingCharacters(in: .whitespacesAndNewlines), !compactId.isEmpty,
           let exact = statuses.first(where: { statusActivityIds($0).contains(compactId) }) {
            return exact
        }
        return statuses.first { inferredActivityType(for: $0) == compactType }
    }

    private func selectedActiveTimerStatus() -> StatusItem? {
        statuses.first { status in
            status.agent == "Timer" && status.timer != nil && (status.state == "running" || status.state == "success")
        }
    }

    private func activeTimerStatus() -> StatusItem? {
        selectedActiveTimerStatus()
    }

    fileprivate func activeTimerCompactViewModel() -> TimerCompactOverlayViewModel? {
        guard let status = selectedActiveTimerStatus(), let timer = status.timer else { return nil }
        return compactTimerViewModel(status: status, timer: timer)
    }

    fileprivate func activeTimerRenderedNotchOutput() -> TimerRenderedNotchOutput? {
        guard let status = selectedActiveTimerStatus(), let timer = status.timer else { return nil }
        let remainingSeconds = displayRemainingSeconds(timer: timer)
        let compactViewModel = compactTimerViewModel(status: status, timer: timer)
        let duration = max(timer.durationSeconds, 0)
        let elapsed = min(max(duration - max(remainingSeconds, 0), 0), duration)
        let progressPercent = duration > 0 ? (elapsed / duration) * 100 : 0
        return TimerRenderedNotchOutput(
            compactText: "⏱ \(compactViewModel.remainingText)",
            expandedTitle: formatSeconds(remainingSeconds),
            progressPercent: progressPercent
        )
    }

    private func compactTimerViewModel(status: StatusItem, timer: TimerInfo) -> TimerCompactOverlayViewModel {
        let remainingSeconds = displayRemainingSeconds(timer: timer)
        let lifecycleState = timerLifecycleState(status: status, timer: timer, remainingSeconds: remainingSeconds)
        return TimerCompactOverlayViewModel(
            id: timer.id,
            remainingText: lifecycleState == "done" ? "Done" : formatSeconds(remainingSeconds),
            lifecycleState: lifecycleState,
            isRunning: status.state == "running" && timer.state == "running" && remainingSeconds > 0,
            isPaused: timer.state == "paused" || timer.state == "stopped" || timer.state == "reset"
        )
    }

    private func timerLifecycleState(status: StatusItem, timer: TimerInfo, remainingSeconds: Double) -> String {
        if status.state == "success" || timer.state == "done" || remainingSeconds <= 0 {
            return "done"
        }
        return timer.state
    }

    private func displayRemainingSeconds(timer: TimerInfo) -> Double {
        let duration = max(timer.durationSeconds, 0)
        let reportedRemaining = min(max(timer.remainingSeconds, 0), duration)
        guard timer.state == "running", let startedAt = isoDate(timer.startedAt) else {
            return reportedRemaining
        }

        let elapsed = max(0, floor(currentDate().timeIntervalSince(startedAt)))
        return min(max(duration - elapsed, 0), reportedRemaining)
    }

    private func currentDate() -> Date {
        if let raw = ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_NOW"], let date = isoDate(raw) {
            return date
        }
        return Date()
    }

    private func isoDate(_ raw: String) -> Date? {
        if let date = ISO8601DateFormatter.dynamacTimer.date(from: raw) {
            return date
        }
        return ISO8601DateFormatter().date(from: raw)
    }

    func replaceStatuses(_ incomingStatuses: [StatusItem]) {
        var merged = incomingStatuses
        let previousMedia = nowPlayingMedia()
        if let index = merged.firstIndex(where: { $0.agent == "Now Playing" }), var incomingMedia = merged[index].media, let previousMedia, isSameMedia(previousMedia, incomingMedia) {
            let displayedPosition = displayPositionSeconds(previousMedia)
            let incomingPosition = incomingMedia.positionSeconds ?? 0
            let localLead = displayedPosition - incomingPosition
            let staleZeroFallback = incomingPosition == 0 && (previousMedia.positionSeconds ?? 0) > 3
            let staleBackwardTick = incomingMedia.playbackState == "playing" && previousMedia.playbackState == "playing" && (staleZeroFallback || (localLead > 0 && localLead <= 12))
            if staleBackwardTick {
                // Provider snapshots can arrive quantized or stale while the overlay advances
                // smoothly between reloads. Preserve the locally displayed position so the
                // play time never ticks 0→1→0 or 1:08→1:05 unless the user actually seeks far backward.
                incomingMedia.positionSeconds = displayedPosition
            }
            if Date() < optimisticPlaybackStateUntil, let optimisticPlaybackState {
                incomingMedia.playbackState = optimisticPlaybackState
                if optimisticPlaybackState == "playing", incomingPosition < displayedPosition {
                    incomingMedia.positionSeconds = displayedPosition
                }
            }
            merged[index].media = incomingMedia
        }
        statuses = merged
        statusLoadedAt = Date()
        needsDisplay = true
    }

    func replaceStatusPayload(_ payload: StatusPayload) {
        activityRouter = payload.activityRouter
        replaceStatuses(payload.statuses)
    }

    private func isSameMedia(_ lhs: MediaInfo, _ rhs: MediaInfo) -> Bool {
        lhs.source == rhs.source && lhs.title == rhs.title && lhs.artist == rhs.artist
    }

    private func updateNowPlayingMedia(_ transform: (inout MediaInfo) -> Void) {
        guard let index = statuses.firstIndex(where: { $0.agent == "Now Playing" }), statuses[index].media != nil else { return }
        transform(&statuses[index].media!)
        statusLoadedAt = Date()
        needsDisplay = true
    }

    private func applyOptimisticMediaControl(action: String) {
        updateNowPlayingMedia { media in
            if action == "playpause" {
                let nextState = media.playbackState == "playing" ? "paused" : "playing"
                if nextState == "paused" {
                    media.positionSeconds = displayPositionSeconds(media)
                }
                media.playbackState = nextState
                optimisticPlaybackState = nextState
                optimisticPlaybackStateUntil = Date().addingTimeInterval(1.4)
            } else if action == "previous" || action == "next" {
                // Do not keep drawing the previous track's cover while Spotify/MediaRemote
                // catches up. Clear the stale artwork immediately, then the forced snapshot
                // refresh burst will replace it with the new track's cover.
                media.artworkUrl = ""
                media.positionSeconds = 0
                media.playbackState = "playing"
                optimisticPlaybackState = nil
                optimisticPlaybackStateUntil = .distantPast
            }
        }
    }

    private func applyOptimisticSeek(seconds: Double) {
        updateNowPlayingMedia { media in
            let duration = max(media.durationSeconds ?? seconds, 0)
            media.positionSeconds = duration > 0 ? min(max(seconds, 0), duration) : max(seconds, 0)
        }
    }

    private func drawCompactNowPlaying(_ media: MediaInfo) {
        let art = compactArtworkRect()
        // Preserve the artwork's aspect ratio in the compact/notch tile too: square album
        // art still fills the square exactly, while 16:9 YouTube thumbnails letterbox
        // instead of stretching — matching the expanded cover.
        drawArtwork(media: media, in: art, cornerRadius: 7, fallbackFontSize: 17, aspectFit: true)

        if compactLayout.usesHardwareNotchCutout {
            drawPlayingBars(media: media, in: compactPlayingBarsRect())
        } else {
            drawPlayingBars(media: media, in: compactSinglePillPlayingBarsRect(afterArtwork: art))
        }
    }

    private func drawExpandedNowPlaying(_ media: MediaInfo) {
        // DESIGN-apple.md form pass: keep the current dark/media colors, but use Apple's
        // product-first structure — quiet chrome, 8pt rhythm, 17/21pt SF hierarchy,
        // pill/circular transport grammar, and a thin scrubber.
        let cover = expandedCoverRect()
        drawArtwork(media: media, in: cover, cornerRadius: 18, fallbackFontSize: 40, aspectFit: true)

        let labelAttrs = expandedTextAttributes(size: 11, weight: .semibold, color: NSColor(calibratedWhite: 0.64, alpha: 1), letterSpacing: 0.8)
        let titleAttrs = expandedTextAttributes(size: 21, weight: .semibold, color: .white, letterSpacing: -0.28)
        let artistAttrs = expandedTextAttributes(size: 17, weight: .regular, color: NSColor(calibratedWhite: 0.70, alpha: 1), letterSpacing: -0.374)
        let timeAttrs = expandedTextAttributes(size: 11, weight: .regular, color: NSColor(calibratedWhite: 0.56, alpha: 1), letterSpacing: -0.12, monospaced: true)

        NSString(string: displaySourceName(media.source).uppercased()).draw(in: expandedSourceRect(), withAttributes: labelAttrs)
        NSString(string: media.title ?? "Nothing playing").draw(in: expandedTitleRect(), withAttributes: titleAttrs)
        NSString(string: media.artist?.isEmpty == false ? media.artist! : displaySourceName(media.source)).draw(in: expandedArtistRect(), withAttributes: artistAttrs)

        let elapsedSeconds = displayPositionSeconds(media)
        let progressRect = progressBarRect()
        NSString(string: formatSeconds(elapsedSeconds)).draw(in: expandedElapsedRect(progressRect: progressRect), withAttributes: timeAttrs)
        NSString(string: media.durationLabel ?? formatSeconds(media.durationSeconds)).draw(in: expandedDurationRect(progressRect: progressRect), withAttributes: rightAlignedAttributes(timeAttrs))
        drawProgressBar(media: media, positionSeconds: elapsedSeconds, rect: progressRect)
        drawMediaControls(media: media)
    }

    fileprivate func routedGenericActivityRenderedOutput(status: StatusItem, activityType: String) -> RoutedGenericActivityRenderedOutput {
        let label = activityRouter?.compactSurface?.label ?? status.task
        let glyph = activityRouter?.compactSurface?.glyph ?? glyphForRoutedActivity(activityType)
        return RoutedGenericActivityRenderedOutput(
            compactText: "\(glyph) \(label)",
            expandedText: "\(label)\n\(status.detail ?? status.task)"
        )
    }

    private func drawRoutedGenericActivity(_ status: StatusItem, activityType: String) {
        let rendered = routedGenericActivityRenderedOutput(status: status, activityType: activityType)
        let text = expanded ? rendered.expandedText : rendered.compactText
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.lineBreakMode = .byTruncatingTail
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: expanded ? 15 : 11, weight: .semibold),
            .foregroundColor: NSColor.white,
            .paragraphStyle: paragraph
        ]
        let rect = expanded ? bounds.insetBy(dx: 24, dy: max(36, expandedTopContentY())) : bounds.insetBy(dx: 8, dy: max(2, (bounds.height - 18) / 2))
        NSString(string: text).draw(in: rect, withAttributes: attrs)
    }

    private func glyphForRoutedActivity(_ activityType: String) -> String {
        switch activityType {
        case "volume": return "speaker"
        case "brightness": return "sun.max"
        case "clipboard": return "doc.on.clipboard"
        case "macContext": return "macwindow"
        case "shelf", "drop": return "tray"
        case "battery": return "battery.100"
        default: return "circle"
        }
    }

    private func drawCompactTimer(_ status: StatusItem) {
        guard let timer = status.timer else { return }
        let viewModel = compactTimerViewModel(status: status, timer: timer)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        paragraph.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white.withAlphaComponent(0.94),
            .font: NSFont.monospacedDigitSystemFont(ofSize: compactLayout.usesHardwareNotchCutout ? 10 : 12, weight: .semibold),
            .paragraphStyle: paragraph
        ]

        if compactLayout.usesHardwareNotchCutout {
            NSString(string: "⏱").draw(in: compactLayout.leftWingRect(in: bounds).insetBy(dx: 7, dy: 7), withAttributes: attrs)
            NSString(string: viewModel.remainingText).draw(in: compactLayout.rightWingRect(in: bounds).insetBy(dx: 4, dy: 7), withAttributes: attrs)
        } else {
            NSString(string: "⏱ \(viewModel.remainingText)").draw(in: bounds.insetBy(dx: 10, dy: 8), withAttributes: attrs)
        }
    }

    private func drawExpandedTimer(_ status: StatusItem) {
        guard let timer = status.timer else { return }
        let remainingSeconds = displayRemainingSeconds(timer: timer)
        let sourceAttrs = expandedTextAttributes(size: 11, weight: .semibold, color: NSColor(calibratedWhite: 0.64, alpha: 1), letterSpacing: 0.8)
        let titleAttrs = expandedTextAttributes(size: 28, weight: .semibold, color: .white, letterSpacing: -0.4, monospaced: true)
        let detailAttrs = expandedTextAttributes(size: 15, weight: .regular, color: NSColor(calibratedWhite: 0.70, alpha: 1), letterSpacing: -0.2)
        let content = expandedContentRect()

        NSString(string: "TIMER").draw(in: expandedSourceRect(), withAttributes: sourceAttrs)
        NSString(string: formatSeconds(remainingSeconds)).draw(in: NSRect(x: content.minX, y: expandedTopContentY() + 22, width: content.width, height: 34), withAttributes: titleAttrs)
        NSString(string: status.detail ?? status.task).draw(in: NSRect(x: content.minX, y: expandedTopContentY() + 62, width: content.width, height: 22), withAttributes: detailAttrs)

        let progressRect = NSRect(x: content.minX, y: expandedProgressY(), width: content.width, height: 5)
        drawTimerProgress(timer: timer, remainingSeconds: remainingSeconds, rect: progressRect)
    }

    private func drawTimerProgress(timer: TimerInfo, remainingSeconds: Double? = nil, rect: NSRect) {
        NSColor(calibratedWhite: 1, alpha: 0.16).setFill()
        NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
        let duration = max(timer.durationSeconds, 0)
        guard duration > 0 else { return }
        let displayedRemaining = remainingSeconds ?? displayRemainingSeconds(timer: timer)
        let elapsed = min(max(duration - max(displayedRemaining, 0), 0), duration)
        let ratio = elapsed / duration
        let fill = NSRect(x: rect.minX, y: rect.minY, width: max(rect.height, rect.width * CGFloat(ratio)), height: rect.height)
        NSColor.white.withAlphaComponent(0.88).setFill()
        NSBezierPath(roundedRect: fill, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
    }

    private func expandedCoverRect() -> NSRect {
        NSRect(x: 32, y: 48, width: 120, height: 120)
    }

    private func compactArtworkRect() -> NSRect {
        let artSize = min(bounds.height - 8, 28)
        let y = (bounds.height - artSize) / 2
        let x: CGFloat
        if compactLayout.usesHardwareNotchCutout {
            // Notch mode intentionally avoids title/artist text; the artwork alone is the live activity.
            x = max(4, compactLayout.wingWidth - artSize - 5)
        } else {
            x = 8
        }
        return NSRect(x: x, y: y, width: artSize, height: artSize)
    }

    private func expandedContentRect() -> NSRect {
        let cover = expandedCoverRect()
        let x = cover.maxX + 24
        return NSRect(x: x, y: expandedTopContentY(), width: bounds.width - x - 32, height: 160)
    }

    private func expandedSourceRect() -> NSRect {
        let content = expandedContentRect()
        return NSRect(x: content.minX, y: expandedTopContentY(), width: content.width, height: 14)
    }

    private func expandedTitleRect() -> NSRect {
        let content = expandedContentRect()
        return NSRect(x: content.minX, y: expandedTopContentY() + 20, width: content.width, height: 27)
    }

    private func expandedArtistRect() -> NSRect {
        let content = expandedContentRect()
        return NSRect(x: content.minX, y: expandedTopContentY() + 49, width: content.width, height: 24)
    }

    private func mediaOpenSourceRect() -> NSRect {
        expandedCoverRect()
            .union(expandedSourceRect())
            .union(expandedTitleRect())
            .union(expandedArtistRect())
            .insetBy(dx: -4, dy: -4)
    }

    private func expandedElapsedRect(progressRect: NSRect) -> NSRect {
        NSRect(x: progressRect.minX, y: progressRect.minY - 18, width: 72, height: 14)
    }

    private func expandedDurationRect(progressRect: NSRect) -> NSRect {
        NSRect(x: progressRect.maxX - 72, y: progressRect.minY - 18, width: 72, height: 14)
    }

    private func expandedTopContentY() -> CGFloat {
        // On notched MacBooks the physical camera housing covers the top-center of the
        // expanded panel. Keep the source/title/artist stack below that hardware cutout;
        // non-notch and external displays keep the tighter Apple-style top spacing.
        compactLayout.usesHardwareNotchCutout ? max(44, compactLayout.height + 12) : 24
    }

    private func expandedProgressY() -> CGFloat {
        expandedTopContentY() + 92
    }

    private func expandedControlsY() -> CGFloat {
        min(bounds.height - 50, expandedTopContentY() + 128)
    }

    private func expandedTextAttributes(size: CGFloat, weight: NSFont.Weight, color: NSColor, letterSpacing: CGFloat, monospaced: Bool = false) -> [NSAttributedString.Key: Any] {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        paragraph.alignment = .left
        let font = monospaced ? NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
        return [
            .foregroundColor: color,
            .font: font,
            .kern: letterSpacing,
            .paragraphStyle: paragraph
        ]
    }

    private func rightAlignedAttributes(_ attrs: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
        var copy = attrs
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        paragraph.alignment = .right
        copy[.paragraphStyle] = paragraph
        return copy
    }

    private func drawArtwork(media: MediaInfo, in rect: NSRect, cornerRadius: CGFloat, fallbackFontSize: CGFloat, aspectFit: Bool = false) {
        let path = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)
        NSGraphicsContext.saveGraphicsState()
        path.addClip()
        if let image = artworkImage(media.artworkUrl) {
            if aspectFit {
                // YouTube thumbnails are 16:9, not square. Preserve their aspect
                // ratio inside the frame instead of stretching them to fill it.
                NSColor(calibratedWhite: 0, alpha: 0.28).setFill()
                rect.fill()
                drawUprightImage(image, in: aspectFitRect(imageSize: image.size, in: rect))
            } else {
                drawUprightImage(image, in: rect)
            }
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
        if let cached = artworkCache[value] { return cached }
        if failedArtworkKeys.contains(value) { return nil }

        let image: NSImage?
        if value.hasPrefix("http://") || value.hasPrefix("https://"), let url = URL(string: value), let data = try? Data(contentsOf: url, options: [.mappedIfSafe]) {
            image = NSImage(data: data)
        } else {
            let url = value.hasPrefix("file://") ? URL(string: value) : URL(fileURLWithPath: value)
            image = url.flatMap { NSImage(contentsOf: $0) }
        }

        if let image {
            artworkCache[value] = image
            return image
        }
        failedArtworkKeys.insert(value)
        return nil
    }

    private func aspectFitRect(imageSize: NSSize, in rect: NSRect) -> NSRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return rect }
        let scale = min(rect.width / imageSize.width, rect.height / imageSize.height)
        let width = imageSize.width * scale
        let height = imageSize.height * scale
        return NSRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
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
        NSColor(calibratedWhite: 1, alpha: 0.16).setFill()
        NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
        let duration = max(media.durationSeconds ?? 0, 0)
        let position = max(positionSeconds, 0)
        guard duration > 0 else { return }
        let ratio = min(max(position / duration, 0), 1)
        let fill = NSRect(x: rect.minX, y: rect.minY, width: max(rect.height, rect.width * CGFloat(ratio)), height: rect.height)
        NSColor(calibratedRed: 0.98, green: 0.20, blue: 0.36, alpha: 1).setFill()
        NSBezierPath(roundedRect: fill, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
        let knobSize: CGFloat = 9
        let knobX = min(max(fill.maxX - knobSize / 2, rect.minX - knobSize / 2), rect.maxX - knobSize / 2)
        NSColor.white.withAlphaComponent(0.96).setFill()
        NSBezierPath(ovalIn: NSRect(x: knobX, y: rect.midY - knobSize / 2, width: knobSize, height: knobSize)).fill()
    }

    private func drawMediaControls(media: MediaInfo) {
        for action in ["previous", "playpause", "next"] {
            let rect = mediaControlRect(action: action)
            let isPrimary = action == "playpause"
            NSColor(calibratedWhite: 1, alpha: isPrimary ? 0.20 : 0.11).setFill()
            NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
            NSColor.white.withAlphaComponent(isPrimary ? 0.98 : 0.88).setFill()
            drawTransportIcon(action: action, playing: media.playbackState == "playing", in: rect.insetBy(dx: isPrimary ? 13 : 10, dy: isPrimary ? 12 : 10))
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

    private func compactPlayingBarsRect() -> NSRect {
        // Keep the animation inside the visible right wing, not in the overlap that tucks
        // under the hardware notch. That prevents the left edge of the bars from being
        // clipped by the physical cutout while preserving the calibrated album-cover size.
        let visibleRightWingX = compactLayout.wingWidth + compactLayout.notchCutoutWidth
        let horizontalInset: CGFloat = 7
        let verticalInset: CGFloat = 6
        return NSRect(
            x: visibleRightWingX + horizontalInset,
            y: verticalInset,
            width: max(18, compactLayout.wingWidth - horizontalInset * 2),
            height: max(10, bounds.height - verticalInset * 2)
        )
    }

    private func compactSinglePillPlayingBarsRect(afterArtwork artworkRect: NSRect) -> NSRect {
        // External/non-notch displays may still use the narrow calibrated pill width from
        // notch tuning. Never let the waveform consume the pill or overlap the artwork;
        // it only uses the small trailing space left after the cover plus an 8pt gap.
        let trailingInset: CGFloat = 8
        let gapAfterArtwork: CGFloat = 8
        let verticalInset: CGFloat = 8
        let startX = artworkRect.maxX + gapAfterArtwork
        let maxWidth = max(0, bounds.maxX - trailingInset - startX)
        let width = min(22, max(10, maxWidth))
        let x = max(startX, bounds.maxX - trailingInset - width)
        return NSRect(
            x: x,
            y: verticalInset,
            width: max(8, min(width, bounds.maxX - trailingInset - x)),
            height: max(10, bounds.height - verticalInset * 2)
        )
    }

    private func drawPlayingBars(media: MediaInfo, in rect: NSRect) {
        drawPlayingWaveform(media: media, in: rect)
    }

    private func drawPlayingWaveform(media: MediaInfo, in rect: NSRect) {
        let isPlaying = media.playbackState == "playing"
        let sampleCount = max(2, min(6, Int(rect.width / 4)))
        let gap: CGFloat = 2
        let sampleWidth = max(2, min(4, (rect.width - CGFloat(sampleCount - 1) * gap) / CGFloat(sampleCount)))
        let sensitivity = CGFloat(Double(ProcessInfo.processInfo.environment["DYNAMAC_PLAYING_BARS_SENSITIVITY"] ?? "1.35") ?? 1.35)
        let phase = Date().timeIntervalSince1970 * 6.2
        for index in 0..<sampleCount {
            // Keep every waveform sample on the same amplitude scale. Earlier versions used
            // a center-weighted envelope, which made the first/last samples barely move and
            // looked awkward in the tiny compact island.
            let waveA = (sin(phase + Double(index) * 0.82) + 1) / 2
            let waveB = (sin(phase * 0.63 + Double(index) * 1.47) + 1) / 2
            let mixedWave = isPlaying ? min(1, CGFloat((waveA * 0.62) + (waveB * 0.38)) * sensitivity) : 0.08
            let heightRatio = isPlaying ? max(0.18, min(1, 0.22 + mixedWave * 0.78)) : 0.18
            let height = max(3, rect.height * heightRatio)
            let x = rect.midX - ((CGFloat(sampleCount) * sampleWidth + CGFloat(sampleCount - 1) * gap) / 2) + CGFloat(index) * (sampleWidth + gap)
            let y = rect.midY - height / 2
            let alpha = isPlaying ? min(0.95, 0.44 + mixedWave * 0.48) : 0.30
            NSColor.white.withAlphaComponent(alpha).setFill()
            NSBezierPath(roundedRect: NSRect(x: x, y: y, width: sampleWidth, height: height), xRadius: sampleWidth / 2, yRadius: sampleWidth / 2).fill()
        }
    }

    private func mediaControlRect(action: String) -> NSRect {
        let centerX = expandedContentRect().midX
        let y = expandedControlsY()
        let primarySize: CGFloat = 42
        let secondarySize: CGFloat = 34
        switch action {
        case "previous": return NSRect(x: centerX - 72, y: y + 4, width: secondarySize, height: secondarySize)
        case "playpause": return NSRect(x: centerX - primarySize / 2, y: y, width: primarySize, height: primarySize)
        default: return NSRect(x: centerX + 38, y: y + 4, width: secondarySize, height: secondarySize)
        }
    }

    private func progressBarRect() -> NSRect {
        let content = expandedContentRect()
        return NSRect(x: content.minX, y: expandedProgressY(), width: content.width, height: 4)
    }

    private func progressHitRect() -> NSRect {
        // Keep seeking intentional: only the scrubber rail/thumb area is interactive,
        // not the surrounding time-label whitespace.
        progressBarRect().insetBy(dx: -2, dy: -5)
    }

    private func normalizedInteractionPoint(_ point: NSPoint) -> NSPoint {
        if progressHitRect().contains(point) { return point }
        let flipped = NSPoint(x: point.x, y: bounds.height - point.y)
        return progressHitRect().contains(flipped) ? flipped : point
    }

    private func mediaSeekSecond(at point: NSPoint, media: MediaInfo) -> Double? {
        let duration = max(media.durationSeconds ?? 0, 0)
        let normalized = normalizedInteractionPoint(point)
        guard duration > 0, progressHitRect().contains(normalized) else { return nil }
        let rect = progressBarRect()
        let ratio = min(max((normalized.x - rect.minX) / rect.width, 0), 1)
        return Double(ratio) * duration
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
    private var statusFileSource: DispatchSourceFileSystemObject?
    private var displayTimer: Timer?
    private var contentFadeTimer: Timer?
    private var autoCollapseTimer: Timer?
    private var layoutRefreshGeneration = 0
    private var lastKnownNotchLayout: NotchWingLayout?
    private var exposeRestoreTimer: Timer?
    private var preExposeFrame: NSRect?
    private var isExposeCentering = false
    private var expanded = false
    private var expansionGeneration = 0
    private var compactLayout = NotchWingLayout.compactFromEnvironment()

    // App-mode (menu bar utility) state. The overlay can be toggled on/off from a
    // settings window reached via the menu bar icon, mirroring apps like Scroll Reverser.
    private var statusItem: NSStatusItem?
    private var prefsWindow: NSWindow?
    private var enableCheckbox: NSButton?
    private var loginItemCheckbox: NSButton?
    private var writerProcess: Process?
    private var overlayEnabled = true
    private var statusFilePath = "status/status.json"
    private var statusRefreshSignalPath = ".build/status.refresh"
    private let overlayEnabledKey = "DynamacOverlayEnabled"
    private let hasLaunchedBeforeKey = "DynamacHasLaunchedBefore"

    private var isBundledApp: Bool { Bundle.main.bundlePath.hasSuffix(".app") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let env = ProcessInfo.processInfo.environment
        let isSmoke = env["DYNAMAC_NATIVE_SMOKE_TEST"] == "1"
        statusFilePath = resolveStatusFilePath()
        statusRefreshSignalPath = resolveStatusRefreshSignalPath()
        overlayEnabled = (UserDefaults.standard.object(forKey: overlayEnabledKey) as? Bool) ?? true

        createPanel()
        loadStatus()
        dumpNativeStatusForSmokeIfRequested()
        startStatusRefresh()
        startStatusFileWatch()
        startDisplayRefresh()

        if !isSmoke {
            // Menu bar utility chrome: an icon that opens the on/off settings window.
            setupStatusItem()
            if overlayEnabled {
                startWriterChildIfNeeded()
            } else {
                panel?.orderOut(nil)
            }
            // Surface the settings window the first time the app runs so on/off and
            // launch-at-login are discoverable; later launches stay quiet in the menu bar.
            if !UserDefaults.standard.bool(forKey: hasLaunchedBeforeKey) {
                UserDefaults.standard.set(true, forKey: hasLaunchedBeforeKey)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.showPreferences() }
            }
        }

        if ProcessInfo.processInfo.environment["DYNAMAC_START_EXPANDED"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.toggleExpanded() }
        }

        if ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_SMOKE_TEST"] == "1" {
            print("DYNAMAC_NATIVE_READY")
            let delayedDumpMilliseconds = Double(ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS"] ?? "") ?? 0
            if delayedDumpMilliseconds > 0 {
                let delayedDumpSeconds = delayedDumpMilliseconds / 1000
                DispatchQueue.main.asyncAfter(deadline: .now() + delayedDumpSeconds) { [weak self] in
                    self?.dumpNativeStatusForSmokeIfRequested()
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + delayedDumpSeconds + 0.2) { NSApp.terminate(nil) }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { NSApp.terminate(nil) }
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // No Dock icon, so "reopen" fires when the user launches the .app again from Finder:
        // bring up the settings window instead of silently doing nothing.
        showPreferences()
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopWriterChild()
    }

    // MARK: - Menu bar + settings window

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            let image = NSImage(systemSymbolName: "rectangle.topthird.inset.filled", accessibilityDescription: "Dynamac Island")
                ?? NSImage(systemSymbolName: "menubar.rectangle", accessibilityDescription: "Dynamac Island")
            image?.isTemplate = true
            button.image = image
            if image == nil { button.title = "◉" }
            button.target = self
            button.action = #selector(statusItemClicked)
        }
        statusItem = item
    }

    @objc private func statusItemClicked() {
        showPreferences()
    }

    private func showPreferences() {
        if prefsWindow == nil { buildPreferencesWindow() }
        syncPreferencesControls()
        guard let window = prefsWindow else { return }
        window.center()
        // LSUIElement apps have no Dock icon and are not "active", so a plain
        // makeKeyAndOrderFront can leave the settings window behind other apps. Force it
        // to the front above normal windows and pull the app forward.
        window.level = .floating
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
    }

    private func buildPreferencesWindow() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 168),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Dynamac Island"
        window.isReleasedWhenClosed = false
        window.center()

        let content = NSView(frame: NSRect(x: 0, y: 0, width: 320, height: 168))

        let title = NSTextField(labelWithString: "Dynamac Island")
        title.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        title.frame = NSRect(x: 20, y: 130, width: 280, height: 22)
        content.addSubview(title)

        let enable = NSButton(checkboxWithTitle: "Dynamac Island 켜기", target: self, action: #selector(toggleEnabledFromCheckbox(_:)))
        enable.frame = NSRect(x: 20, y: 98, width: 280, height: 22)
        content.addSubview(enable)
        enableCheckbox = enable

        let login = NSButton(checkboxWithTitle: "로그인 시 자동 실행", target: self, action: #selector(toggleLoginItemFromCheckbox(_:)))
        login.frame = NSRect(x: 20, y: 70, width: 280, height: 22)
        content.addSubview(login)
        loginItemCheckbox = login

        let quit = NSButton(title: "종료", target: self, action: #selector(quitFromButton))
        quit.bezelStyle = .rounded
        quit.frame = NSRect(x: 218, y: 16, width: 84, height: 30)
        content.addSubview(quit)

        window.contentView = content
        prefsWindow = window
    }

    private func syncPreferencesControls() {
        enableCheckbox?.state = overlayEnabled ? .on : .off
        if let login = loginItemCheckbox {
            let supported = isBundledApp && isLoginItemSupported()
            login.isEnabled = supported
            login.state = (supported && isLoginItemEnabled()) ? .on : .off
            login.toolTip = supported ? nil : "패키징된 .app에서만 사용할 수 있습니다."
        }
    }

    @objc private func toggleEnabledFromCheckbox(_ sender: NSButton) {
        setOverlayEnabled(sender.state == .on)
    }

    @objc private func toggleLoginItemFromCheckbox(_ sender: NSButton) {
        setLoginItem(sender.state == .on)
        // Reflect the actual post-change state (registration can fail).
        sender.state = isLoginItemEnabled() ? .on : .off
    }

    @objc private func quitFromButton() {
        NSApp.terminate(nil)
    }

    private func setOverlayEnabled(_ enabled: Bool) {
        overlayEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: overlayEnabledKey)
        if enabled {
            startWriterChildIfNeeded()
            panel?.orderFrontRegardless()
            requestStatusSnapshotRefresh()
        } else {
            panel?.orderOut(nil)
            stopWriterChild()
        }
    }

    // MARK: - Writer child process (packaged .app only)

    private func startWriterChildIfNeeded() {
        // The dev orchestrator (native-start.js) already runs the writer loop and marks the
        // overlay as managed; only the standalone .app needs to spawn its own writer.
        guard ProcessInfo.processInfo.environment["DYNAMAC_MANAGED_WRITER"] != "1" else { return }
        guard isBundledApp else { return }
        guard writerProcess == nil else { return }
        guard let node = resolveNodePath(), let script = resolveWriterScriptPath() else {
            NSLog("Dynamac: could not locate node or native-writer.js; Now Playing will not update.")
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [script]
        var childEnv = ProcessInfo.processInfo.environment
        childEnv["DYNAMAC_STATUS_FILE"] = statusFilePath
        childEnv["DYNAMAC_STATUS_REFRESH_SIGNAL"] = statusRefreshSignalPath
        // GUI apps launched from Finder inherit a minimal PATH; make sure Homebrew tools the
        // writer shells out to (nowplaying-cli) and node's own children remain resolvable.
        let extraPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        childEnv["PATH"] = childEnv["PATH"].map { "\($0):\(extraPath)" } ?? extraPath
        process.environment = childEnv
        // A Finder-launched .app has no console, so route the writer's output to a log
        // file next to the status snapshot for diagnostics.
        let logPath = (appSupportDirectory() as NSString).appendingPathComponent("writer.log")
        FileManager.default.createFile(atPath: logPath, contents: nil)
        if let logHandle = FileHandle(forWritingAtPath: logPath) {
            process.standardOutput = logHandle
            process.standardError = logHandle
        }
        process.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                self?.writerProcess = nil
                NSLog("Dynamac: native-writer.js exited (status \(proc.terminationStatus)).")
            }
        }
        do {
            try process.run()
            writerProcess = process
        } catch {
            NSLog("Dynamac: failed to start native-writer.js: \(error)")
        }
    }

    private func stopWriterChild() {
        guard let process = writerProcess else { return }
        writerProcess = nil
        if process.isRunning { process.terminate() }
    }

    private func resolveNodePath() -> String? {
        let env = ProcessInfo.processInfo.environment
        if let override = env["DYNAMAC_NODE"], !override.isEmpty, FileManager.default.isExecutableFile(atPath: override) {
            return override
        }
        for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] where FileManager.default.isExecutableFile(atPath: candidate) {
            return candidate
        }
        // Fall back to a login shell so nvm/asdf-managed node installs resolve.
        let probe = Process()
        probe.executableURL = URL(fileURLWithPath: "/bin/zsh")
        probe.arguments = ["-lc", "command -v node"]
        let pipe = Pipe()
        probe.standardOutput = pipe
        probe.standardError = FileHandle.nullDevice
        do {
            try probe.run()
            probe.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty, FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        } catch {}
        return nil
    }

    private func resolveWriterScriptPath() -> String? {
        let env = ProcessInfo.processInfo.environment
        if let override = env["DYNAMAC_WRITER_SCRIPT"], !override.isEmpty { return override }
        if let resources = Bundle.main.resourcePath {
            let bundled = (resources as NSString).appendingPathComponent("app/scripts/native-writer.js")
            if FileManager.default.fileExists(atPath: bundled) { return bundled }
        }
        return nil
    }

    private func resolveStatusFilePath() -> String {
        let env = ProcessInfo.processInfo.environment
        if let explicit = env["DYNAMAC_STATUS_FILE"], !explicit.isEmpty { return explicit }
        if isBundledApp {
            return (appSupportDirectory() as NSString).appendingPathComponent("status.json")
        }
        return "status/status.json"
    }

    private func resolveStatusRefreshSignalPath() -> String {
        let env = ProcessInfo.processInfo.environment
        if let explicit = env["DYNAMAC_STATUS_REFRESH_SIGNAL"], !explicit.isEmpty { return explicit }
        if isBundledApp {
            return (appSupportDirectory() as NSString).appendingPathComponent("status.refresh")
        }
        return ".build/status.refresh"
    }

    private func appSupportDirectory() -> String {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        if let dir = base?.appendingPathComponent("Dynamac Island", isDirectory: true) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            return dir.path
        }
        return NSTemporaryDirectory()
    }

    // MARK: - Launch at login

    private func isLoginItemSupported() -> Bool {
        if #available(macOS 13.0, *) { return true }
        return false
    }

    private func isLoginItemEnabled() -> Bool {
        if #available(macOS 13.0, *) { return SMAppService.mainApp.status == .enabled }
        return false
    }

    private func setLoginItem(_ enabled: Bool) {
        guard #available(macOS 13.0, *) else { return }
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("Dynamac: launch-at-login toggle failed: \(error)")
        }
    }

    // The display the overlay anchors to. Deliberately NOT NSScreen.main: that follows
    // keyboard focus, so clicking a window on the built-in MacBook display would drag the
    // notch overlay off the external display onto the laptop. We pin to a stable target
    // instead — by default the primary display (the one carrying the menu bar at origin
    // (0,0), i.e. "Main display" in System Settings). On a single-MacBook setup that is the
    // built-in notched panel, so behavior is unchanged. Override with DYNAMAC_DISPLAY:
    // "primary"/"main", "builtin"/"built-in", or any substring of a display's name.
    private func targetScreen() -> NSScreen? {
        let screens = NSScreen.screens
        guard !screens.isEmpty else { return nil }
        let primary = screens.first { $0.frame.origin == .zero }
        if let pref = ProcessInfo.processInfo.environment["DYNAMAC_DISPLAY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !pref.isEmpty {
            if pref == "builtin" || pref == "built-in" {
                if let builtIn = screens.first(where: { NotchWingLayout.likelyBuiltInDisplay($0) }) { return builtIn }
            } else if pref == "primary" || pref == "main" {
                if let primary { return primary }
            } else if let named = screens.first(where: { $0.localizedName.lowercased().contains(pref) }) {
                return named
            }
        }
        return primary ?? NSScreen.main ?? screens.first
    }

    private func createPanel() {
        guard let screen = targetScreen() else { NSApp.terminate(nil); return }
        compactLayout = NotchWingLayout.compactFromEnvironment(screen: screen)
        if compactLayout.usesHardwareNotchCutout {
            lastKnownNotchLayout = compactLayout
        }
        let size = compactLayout.totalSize
        if ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_DIAG"] == "1" {
            print(compactLayout.diagnosticDescription(screen: screen))
        }
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
        view.onMediaControl = { [weak self] action, source, position, duration in self?.performMediaControl(action: action, source: source, positionSeconds: position, durationSeconds: duration) }
        view.onMediaSeek = { [weak self] source, seconds in self?.performMediaSeek(source: source, seconds: seconds) }
        view.onOpenMediaSource = { [weak self] media in self?.openMediaSource(media) }
        view.onExpandedInteraction = { [weak self] in self?.scheduleAutoCollapse() }
        panel.contentView = view
        panel.orderFrontRegardless()

        self.panel = panel
        self.islandView = view

        // Display/wake changes can swap the main screen or make macOS briefly report stale
        // notch safe-area data. Re-measure a few times and resize/re-anchor the panel.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in self?.scheduleLayoutRefresh(reason: "screen-parameters") }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil, queue: .main) { [weak self] _ in self?.scheduleLayoutRefresh(reason: "wake") }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.screensDidWakeNotification,
            object: nil, queue: .main) { [weak self] _ in self?.scheduleLayoutRefresh(reason: "screens-wake") }
        // activeSpaceDidChange fires once the Space transition has finished. Re-show the
        // overlay on the now-active Space and fade it in so it turns on after the slide
        // completes rather than sitting pinned during it.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.activeSpaceDidChangeNotification,
            object: nil, queue: .main) { [weak self] _ in self?.showOnActiveSpace() }
        registerExposeMotionObservers()
    }

    private func registerExposeMotionObservers() {
        for name in ["com.apple.expose.awake", "com.apple.expose.front.awake"] {
            DistributedNotificationCenter.default().addObserver(
                forName: Notification.Name(name),
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.animateIntoExposeCenter()
            }
        }
    }

    private func showOnActiveSpace() {
        restoreFromExposeCenter(reason: "active-space")
    }

    private func animateIntoExposeCenter() {
        guard let panel, let islandView, let screen = panel.screen ?? targetScreen() else { return }
        exposeRestoreTimer?.invalidate()
        if !isExposeCentering {
            preExposeFrame = panel.frame
        }
        isExposeCentering = true
        contentFadeTimer?.invalidate()
        islandView.contentOpacity = 0
        let targetSize = NSSize(width: 52, height: 18)
        let targetFrame = NSRect(
            x: screen.frame.midX - targetSize.width / 2,
            y: screen.frame.midY - targetSize.height / 2,
            width: targetSize.width,
            height: targetSize.height
        )
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.28
            ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.0, 0.67, 0.0)
            panel.animator().setFrame(targetFrame, display: true)
            panel.animator().alphaValue = 0.42
        }
        exposeRestoreTimer = Timer.scheduledTimer(withTimeInterval: 1.15, repeats: false) { [weak self] _ in
            self?.restoreFromExposeCenter(reason: "expose-delay")
        }
    }

    private func restoreFromExposeCenter(reason: String) {
        guard let panel, let islandView, let screen = panel.screen ?? targetScreen() else { return }
        exposeRestoreTimer?.invalidate()
        let size = expanded ? NSSize(width: 520, height: 210) : compactLayout.totalSize
        let targetFrame = reason == "active-space" ? topCenteredRect(screen: screen, size: size) : (preExposeFrame ?? topCenteredRect(screen: screen, size: size))
        refreshLayoutAndFrame(reason: reason, applyFrame: false)
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = isExposeCentering ? 0.24 : 0.22
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().setFrame(targetFrame, display: true)
            panel.animator().alphaValue = 1
        }, completionHandler: { [weak self, weak islandView] in
            self?.isExposeCentering = false
            self?.preExposeFrame = nil
            self?.fadeContent(in: islandView)
        })
    }

    private func scheduleLayoutRefresh(reason: String) {
        layoutRefreshGeneration += 1
        let generation = layoutRefreshGeneration
        refreshLayoutAndFrame(reason: "\(reason)-immediate")
        for delay in [0.15, 0.6, 1.4] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.layoutRefreshGeneration == generation else { return }
                self.refreshLayoutAndFrame(reason: "\(reason)-delayed")
            }
        }
    }

    private func refreshLayoutAndFrame(reason: String, applyFrame: Bool = true) {
        guard let panel, let islandView, let screen = targetScreen() else { return }
        let measured = NotchWingLayout.compactFromEnvironment(screen: screen)
        let resolved = resolvedLayoutForCurrentScreen(measured: measured, screen: screen)
        compactLayout = resolved
        islandView.compactLayout = resolved
        if resolved.usesHardwareNotchCutout {
            lastKnownNotchLayout = resolved
        }
        let size = expanded ? NSSize(width: 520, height: 210) : resolved.totalSize
        islandView.frame = NSRect(origin: .zero, size: size)
        if applyFrame {
            panel.setFrame(topCenteredRect(screen: screen, size: size), display: true)
        }
        if ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_DIAG"] == "1" {
            print("DYNAMAC_LAYOUT_REFRESH reason=\(reason)")
            print(resolved.diagnosticDescription(screen: screen))
        }
        islandView.needsDisplay = true
    }

    private func resolvedLayoutForCurrentScreen(measured: NotchWingLayout, screen: NSScreen) -> NotchWingLayout {
        if measured.usesHardwareNotchCutout { return measured }
        // After wake/display handoff, macOS can briefly expose the built-in notched panel
        // without auxiliary notch areas. If this is still the built-in display, preserve the
        // last known notch geometry instead of collapsing into the external-display pill.
        if NotchWingLayout.likelyBuiltInDisplay(screen), let lastKnownNotchLayout {
            return lastKnownNotchLayout
        }
        return measured
    }


    private func toggleExpanded() {
        setExpanded(!expanded)
    }

    private func setExpanded(_ shouldExpand: Bool) {
        guard let panel, let islandView, let screen = panel.screen ?? targetScreen() else { return }
        contentFadeTimer?.invalidate()
        autoCollapseTimer?.invalidate()

        // Switch the controller AND the view layout state synchronously in BOTH directions.
        // Previously the view only flipped to compact in the collapse animation's completion
        // handler, so mashing the toggle let overlapping animations fire their handlers out of
        // order and strand the panel at an expanded frame while drawing the compact layout (or
        // vice versa) — the broken half-drawn overlay. Flipping layout up front keeps frame and
        // content in lockstep no matter how fast toggles arrive.
        expanded = shouldExpand
        islandView.expanded = shouldExpand
        // Tag this transition so a stale completion handler from a superseded animation cannot
        // fade content in (or schedule auto-collapse) for a state the user has already toggled away from.
        expansionGeneration &+= 1
        let generation = expansionGeneration

        let size = shouldExpand ? NSSize(width: 520, height: 210) : compactLayout.totalSize
        let targetFrame = topCenteredRect(screen: screen, size: size)

        // Media surfaces can be expensive to draw because album artwork, text, progress,
        // and transport controls are composited every frame. During resize we draw only
        // the lightweight island shell, then fade the content back in after the panel
        // reaches its final frame. This keeps notch <-> expanded motion smooth even with
        // YouTube thumbnails or local artwork loaded.
        islandView.contentOpacity = 0
        islandView.needsDisplay = true

        // Re-targeting the frame via the animator coalesces a mid-flight animation onto the new
        // destination, so an interrupted expand/collapse never leaves the panel stuck at an
        // intermediate size.
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.24
            ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.0, 0.0, 1.0)
            panel.animator().setFrame(targetFrame, display: true)
        }, completionHandler: { [weak self, weak islandView] in
            guard let self, let islandView, self.expansionGeneration == generation else { return }
            // Snap to the exact target in case the coalesced animation landed slightly off.
            panel.setFrame(targetFrame, display: true)
            self.fadeContent(in: islandView)
            if shouldExpand { self.scheduleAutoCollapse() }
        })
    }

    private func fadeContent(in view: IslandView?) {
        guard let view else { return }
        contentFadeTimer?.invalidate()
        view.contentOpacity = 0
        let startedAt = Date()
        let duration: TimeInterval = 0.12
        contentFadeTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self, weak view] timer in
            guard let view else {
                timer.invalidate()
                return
            }
            let progress = min(Date().timeIntervalSince(startedAt) / duration, 1)
            let eased = 1 - pow(1 - progress, 2)
            view.contentOpacity = CGFloat(eased)
            if progress >= 1 {
                view.contentOpacity = 1
                timer.invalidate()
                self?.contentFadeTimer = nil
            }
        }
    }

    private func scheduleAutoCollapse() {
        autoCollapseTimer?.invalidate()
        let seconds = Double(ProcessInfo.processInfo.environment["DYNAMAC_EXPANDED_AUTO_COLLAPSE_SECONDS"] ?? "5").flatMap { $0 > 0 ? $0 : nil } ?? 5
        autoCollapseTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self, self.expanded else { return }
            self.toggleExpanded()
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

    private func openMediaSource(_ media: MediaInfo) {
        switch media.source {
        case "spotify":
            runAppleScript("tell application \"Spotify\" to activate")
        case "music":
            runAppleScript("tell application \"Music\" to activate")
        case "youtube", "youtube-music", "browser-media", "now-playing":
            focusBrowserMediaTab(media)
        default:
            if let pageUrl = media.pageUrl, !pageUrl.isEmpty {
                focusBrowserMediaTab(media)
            }
        }
    }

    // Bring the already-playing browser tab to the front instead of opening the
    // URL in a brand-new tab. The status payload carries no browser identity, so
    // probe the known browsers and match the tab by page URL (or, when
    // MediaRemote gave us no URL, by title). Only if the tab is truly not open
    // anywhere do we fall back to opening the URL fresh.
    private func focusBrowserMediaTab(_ media: MediaInfo) {
        let pageUrl = media.pageUrl ?? ""
        let byUrl = !pageUrl.isEmpty
        let needle = byUrl ? pageUrl : (media.title ?? "")
        guard !needle.isEmpty else { return }
        let escaped = appleScriptStringEscape(needle)

        let chromiumBrowsers = [
            "Arc", "Google Chrome", "Google Chrome Canary", "Chromium", "Brave Browser",
            "Microsoft Edge", "Vivaldi", "Opera", "Opera GX", "Dia"
        ]
        for browser in chromiumBrowsers {
            let script = browser == "Arc"
                ? arcTabFocusScript(needle: escaped, byUrl: byUrl)
                : chromiumTabFocusScript(browserName: browser, needle: escaped, byUrl: byUrl)
            if runAppleScriptReturning(script) == "focused" { return }
        }
        if runAppleScriptReturning(safariTabFocusScript(needle: escaped, byUrl: byUrl)) == "focused" { return }

        if byUrl, let url = URL(string: pageUrl) {
            NSWorkspace.shared.open(url)
        }
    }

    private func appleScriptStringEscape(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    }

    private func arcTabFocusScript(needle: String, byUrl: Bool) -> String {
        let field = byUrl ? "URL" : "title"
        return """
        if application "Arc" is running then
          tell application "Arc"
            with timeout of 3 seconds
              repeat with w in windows
                repeat with s in spaces of w
                  repeat with t in tabs of s
                    if (\(field) of t) contains "\(needle)" then
                      select t
                      activate
                      return "focused"
                    end if
                  end repeat
                end repeat
              end repeat
            end timeout
          end tell
        end if
        return "no-match"
        """
    }

    private func chromiumTabFocusScript(browserName: String, needle: String, byUrl: Bool) -> String {
        let field = byUrl ? "URL" : "title"
        return """
        if application "\(browserName)" is running then
          tell application "\(browserName)"
            with timeout of 3 seconds
              repeat with w in windows
                set tabCount to count of tabs of w
                repeat with i from 1 to tabCount
                  if (\(field) of tab i of w) contains "\(needle)" then
                    set active tab index of w to i
                    set index of w to 1
                    activate
                    return "focused"
                  end if
                end repeat
              end repeat
            end timeout
          end tell
        end if
        return "no-match"
        """
    }

    private func safariTabFocusScript(needle: String, byUrl: Bool) -> String {
        let field = byUrl ? "URL" : "name"
        return """
        if application "Safari" is running then
          tell application "Safari"
            with timeout of 3 seconds
              repeat with w in windows
                repeat with t in tabs of w
                  if (\(field) of t) contains "\(needle)" then
                    set current tab of w to t
                    set index of w to 1
                    activate
                    return "focused"
                  end if
                end repeat
              end repeat
            end timeout
          end tell
        end if
        return "no-match"
        """
    }

    private func isBrowserMediaSource(_ source: String) -> Bool {
        source == "youtube" || source == "youtube-music" || source == "browser-media" || source == "now-playing"
    }

    private func performMediaControl(action: String, source: String, positionSeconds: Double, durationSeconds: Double) {
        // Browser media (e.g. Arc/Chrome YouTube) can't be driven by AppleScript
        // `execute javascript` — Arc hangs on it. Send the command through macOS
        // MediaRemote instead, which controls whatever is currently playing.
        // previous/next keep the existing ±10s seek grammar via an absolute seek.
        if isBrowserMediaSource(source) {
            switch action {
            case "previous":
                runNowPlayingCommand(["seek", String(Int(max(0, positionSeconds - 10)))])
            case "next":
                let cap = durationSeconds > 0 ? durationSeconds : positionSeconds + 10
                runNowPlayingCommand(["seek", String(Int(min(cap, positionSeconds + 10)))])
            default:
                runNowPlayingCommand(["togglePlayPause"])
            }
            scheduleFastStatusReloadBurst()
            return
        }

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

        runAppleScript("if application \"\(appName)\" is running then tell application \"\(appName)\" to \(command)")
        scheduleFastStatusReloadBurst()
    }

    private func performMediaSeek(source: String, seconds: Double) {
        switch source {
        case "spotify":
            runAppleScript("if application \"Spotify\" is running then tell application \"Spotify\" to set player position to \(seconds)")
        case "music":
            runAppleScript("if application \"Music\" is running then tell application \"Music\" to set player position to \(seconds)")
        default:
            if isBrowserMediaSource(source) {
                runNowPlayingCommand(["seek", String(Int(seconds))])
            } else {
                return
            }
        }
        scheduleFastStatusReloadBurst()
    }

    private func runNowPlayingCommand(_ args: [String]) {
        // Resolve nowplaying-cli via PATH (Homebrew lives at /opt/homebrew/bin on
        // Apple Silicon and /usr/local/bin on Intel); native-start inherits that PATH.
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["nowplaying-cli"] + args
        try? process.run()
    }

    private func runAppleScript(_ script: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        try? process.run()
    }

    @discardableResult
    private func runAppleScriptReturning(_ script: String) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
        } catch {
            return ""
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func scheduleFastStatusRefreshBurst() {
        // After next/previous/play-pause the provider snapshot itself must be regenerated,
        // not just re-read. Touch a signal watched by scripts/native-start.js so new track
        // metadata/artwork is written immediately instead of waiting for the normal writer loop.
        requestStatusSnapshotRefresh()
        for delay in [0.15, 0.45, 0.9, 1.25] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.requestStatusSnapshotRefresh() }
        }
    }

    private func requestStatusSnapshotRefresh() {
        let url = URL(fileURLWithPath: statusRefreshSignalPath)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let marker = "\(Date().timeIntervalSince1970)\n"
        try? marker.write(to: url, atomically: true, encoding: .utf8)
    }

    private func scheduleFastStatusReloadBurst() {
        scheduleFastStatusRefreshBurst()
        for delay in [0.12, 0.35, 0.75, 1.05, 1.35] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.loadStatus() }
        }
    }

    private func startStatusRefresh() {
        let interval = Double(ProcessInfo.processInfo.environment["DYNAMAC_STATUS_RELOAD_MS"] ?? "250").flatMap { $0 >= 100 ? $0 / 1000 : nil } ?? 0.25
        statusTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.loadStatus()
        }
    }

    // The status timer alone reloads on a fixed cadence, so a snapshot written just
    // after a poll waits nearly a full interval before the play time advances —
    // visible lag versus the macOS Now Playing widget. Watch the status file and
    // reload the instant the writer replaces it, collapsing that gap to a few ms.
    // The writer publishes atomically (temp file + rename), which swaps the inode,
    // so the vnode source must re-arm on the new file after a rename/delete event.
    private func startStatusFileWatch() {
        watchStatusFile(at: statusFilePath)
    }

    private func watchStatusFile(at path: String) {
        let fileDescriptor = open(path, O_EVTONLY)
        guard fileDescriptor >= 0 else {
            // File may not exist yet (writer still starting); retry shortly.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in self?.watchStatusFile(at: path) }
            return
        }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fileDescriptor,
            eventMask: [.write, .extend, .delete, .rename],
            queue: .main
        )
        source.setEventHandler { [weak self, weak source] in
            guard let self, let source else { return }
            let flags = source.data
            self.loadStatus()
            if flags.contains(.delete) || flags.contains(.rename) {
                // The watched inode is gone (atomic replace); re-arm on the new file.
                self.watchStatusFile(at: path)
            }
        }
        source.setCancelHandler { close(fileDescriptor) }
        // Replace any previous watch before swapping in the new source.
        statusFileSource?.cancel()
        statusFileSource = source
        source.resume()
        loadStatus()
    }

    private func startDisplayRefresh() {
        let interval = Double(ProcessInfo.processInfo.environment["DYNAMAC_DISPLAY_REFRESH_MS"] ?? "33").flatMap { $0 >= 16 ? $0 / 1000 : nil } ?? 0.033
        displayTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.islandView?.needsDisplay = true
        }
    }

    private func loadStatus() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: statusFilePath)),
              let payload = try? JSONDecoder().decode(StatusPayload.self, from: data) else {
            return
        }
        islandView?.replaceStatusPayload(payload)
    }

    private func nativeSmokeDumpValue(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\n", with: "\\n")
    }

    private func dumpNativeStatusForSmokeIfRequested() {
        guard ProcessInfo.processInfo.environment["DYNAMAC_NATIVE_STATUS_DUMP"] == "1" else { return }
        guard let statuses = islandView?.statuses else {
            print("DYNAMAC_STATUS_DUMP active=none")
            return
        }

        let compactViewModel = islandView?.activeTimerCompactViewModel()
        let renderedTimerOutput = islandView?.activeTimerRenderedNotchOutput()
        let routedCompactSurface = islandView?.routedCompactSurfaceForSmoke()
        let routedStatus = islandView?.routedStatusForCompactSurface()
        let routedType = islandView?.routedCompactActivityType()
        let presentation: String
        if let routedType, routedStatus != nil {
            presentation = routedType == "nowPlaying" ? "media" : routedType
        } else if compactViewModel != nil {
            presentation = "timer"
        } else if statuses.first(where: { $0.agent == "Now Playing" && $0.media != nil }) != nil {
            presentation = "media"
        } else {
            presentation = "fallback"
        }

        if let compactSurface = routedCompactSurface,
           let status = routedStatus,
           let routedType {
            print([
                "DYNAMAC_STATUS_DUMP active=activityRouter",
                "presentation=\(presentation)",
                "routerCompactType=\(routedType)",
                "routerCompactActivityId=\(compactSurface.activityId ?? "")",
                "expanded=\(islandView?.expanded == true ? "true" : "false")",
                "agent=\(status.agent)",
                "statusState=\(status.state)",
                "task=\(status.task)",
                "renderedCompactText=\(nativeSmokeDumpValue(islandView?.routedGenericActivityRenderedOutput(status: status, activityType: routedType).compactText ?? ""))",
                "renderedExpandedText=\(nativeSmokeDumpValue(islandView?.routedGenericActivityRenderedOutput(status: status, activityType: routedType).expandedText ?? ""))"
            ].joined(separator: " "))
            return
        }

        if let status = statuses.first(where: { $0.agent == "Timer" && $0.timer != nil }),
           let timer = status.timer {
            print([
                "DYNAMAC_STATUS_DUMP active=timer",
                "presentation=\(presentation)",
                "agent=\(status.agent)",
                "statusState=\(status.state)",
                "id=\(timer.id)",
                "durationSeconds=\(Int(timer.durationSeconds))",
                "remainingSeconds=\(Int(timer.remainingSeconds))",
                "state=\(timer.state)",
                "startedAt=\(timer.startedAt)",
                "updatedAt=\(timer.updatedAt)",
                "displayText=\(timer.displayText)",
                "error=\(timer.error)",
                "replacedPrevious=\(timer.replacedPrevious ? "true" : "false")",
                "compactIsActive=\(compactViewModel == nil ? "false" : "true")",
                "compactRemainingText=\(compactViewModel?.remainingText ?? "")",
                "compactLifecycleState=\(compactViewModel?.lifecycleState ?? "")",
                "compactIsRunning=\(compactViewModel?.isRunning == true ? "true" : "false")",
                "compactIsPaused=\(compactViewModel?.isPaused == true ? "true" : "false")",
                "renderedCompactText=\(renderedTimerOutput?.compactText ?? "")",
                "renderedExpandedTitle=\(renderedTimerOutput?.expandedTitle ?? "")",
                "renderedProgressPercent=\(String(format: "%.2f", renderedTimerOutput?.progressPercent ?? 0))"
            ].joined(separator: " "))
            return
        }

        if let mediaStatus = statuses.first(where: { $0.agent == "Now Playing" && $0.media != nil }) {
            print("DYNAMAC_STATUS_DUMP active=media presentation=\(presentation) agent=\(mediaStatus.agent)")
            return
        }

        print("DYNAMAC_STATUS_DUMP active=fallback presentation=\(presentation)")
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
