import AppKit
import QuartzCore

struct StatusPayload: Decodable {
    let statuses: [StatusItem]
}

struct StatusItem: Decodable {
    var agent: String
    var state: String
    var task: String
    var detail: String?
    var updatedAt: String?
    var media: MediaInfo?
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
    var onMediaSeek: ((String, Double) -> Void)?
    private var isDraggingProgress = false
    private var optimisticPlaybackState: String?
    private var optimisticPlaybackStateUntil = Date.distantPast

    var contentOpacity: CGFloat = 1 {
        didSet { needsDisplay = true }
    }

    var expanded = false {
        didSet { needsDisplay = true }
    }
    private var statusLoadedAt = Date()

    var statuses: [StatusItem] = []
    var compactLayout = NotchWingLayout.compactFromEnvironment() {
        didSet { needsDisplay = true }
    }

    override var isFlipped: Bool { true }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        if expanded, let media = nowPlayingMedia(), let seekSeconds = mediaSeekSecond(at: location, media: media) {
            isDraggingProgress = true
            applyOptimisticSeek(seconds: seekSeconds)
            onMediaSeek?(media.source ?? "", seekSeconds)
            return
        }
        if expanded, let action = mediaControlAction(at: location), let media = nowPlayingMedia() {
            applyOptimisticMediaControl(action: action)
            onMediaControl?(action, media.source ?? "")
            return
        }
        onToggle?()
    }

    override func mouseDragged(with event: NSEvent) {
        guard isDraggingProgress, expanded, let media = nowPlayingMedia() else { return }
        let location = convert(event.locationInWindow, from: nil)
        if let seekSeconds = mediaSeekSecond(at: location, media: media) {
            applyOptimisticSeek(seconds: seekSeconds)
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

    func replaceStatuses(_ incomingStatuses: [StatusItem]) {
        var merged = incomingStatuses
        let previousMedia = nowPlayingMedia()
        if let index = merged.firstIndex(where: { $0.agent == "Now Playing" }), var incomingMedia = merged[index].media, let previousMedia, isSameMedia(previousMedia, incomingMedia) {
            let displayedPosition = displayPositionSeconds(previousMedia)
            let incomingPosition = incomingMedia.positionSeconds ?? 0
            let wentBackwards = incomingMedia.playbackState == "playing" && previousMedia.playbackState == "playing" && incomingPosition + 0.75 < displayedPosition && displayedPosition - incomingPosition < 3
            if wentBackwards {
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
        drawArtwork(media: media, in: art, cornerRadius: 7, fallbackFontSize: 17)

        if compactLayout.usesHardwareNotchCutout {
            drawPlayingBars(media: media, in: compactPlayingBarsRect())
        } else {
            drawPlayingBars(media: media, in: compactSinglePillPlayingBarsRect(afterArtwork: art))
        }
    }

    private func drawExpandedNowPlaying(_ media: MediaInfo) {
        // Apple-inspired media sheet: quiet chrome, SF Pro proportions, 8pt rhythm,
        // one accent color, and large invisible scrubber target over a thin track.
        let cover = expandedCoverRect()
        drawArtwork(media: media, in: cover, cornerRadius: 24, fallbackFontSize: 40)

        let content = expandedContentRect()
        let contentX = content.minX
        let contentW = content.width
        let labelAttrs = expandedTextAttributes(size: 11, weight: .semibold, color: NSColor(calibratedWhite: 0.64, alpha: 1), letterSpacing: 0.8)
        let titleAttrs = expandedTextAttributes(size: 21, weight: .semibold, color: .white, letterSpacing: -0.28)
        let artistAttrs = expandedTextAttributes(size: 15, weight: .regular, color: NSColor(calibratedWhite: 0.70, alpha: 1), letterSpacing: -0.12)
        let timeAttrs = expandedTextAttributes(size: 11, weight: .medium, color: NSColor(calibratedWhite: 0.56, alpha: 1), letterSpacing: 0, monospaced: true)

        NSString(string: displaySourceName(media.source).uppercased()).draw(in: NSRect(x: contentX, y: 24, width: contentW, height: 14), withAttributes: labelAttrs)
        NSString(string: media.title ?? "Nothing playing").draw(in: NSRect(x: contentX, y: 43, width: contentW, height: 27), withAttributes: titleAttrs)
        NSString(string: media.artist?.isEmpty == false ? media.artist! : displaySourceName(media.source)).draw(in: NSRect(x: contentX, y: 71, width: contentW, height: 20), withAttributes: artistAttrs)

        let elapsedSeconds = displayPositionSeconds(media)
        let elapsed = formatSeconds(elapsedSeconds)
        let duration = media.durationLabel ?? formatSeconds(media.durationSeconds)
        let progressRect = progressBarRect()
        NSString(string: elapsed).draw(in: NSRect(x: progressRect.minX, y: progressRect.minY - 18, width: 72, height: 14), withAttributes: timeAttrs)
        NSString(string: duration).draw(in: NSRect(x: progressRect.maxX - 72, y: progressRect.minY - 18, width: 72, height: 14), withAttributes: rightAlignedAttributes(timeAttrs))
        drawProgressBar(media: media, positionSeconds: elapsedSeconds, rect: progressRect)
        drawMediaControls(media: media)
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
        return NSRect(x: x, y: 24, width: bounds.width - x - 32, height: 160)
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
        let phase = Date().timeIntervalSince1970 * 8.5
        for index in 0..<sampleCount {
            let progress = sampleCount > 1 ? CGFloat(index) / CGFloat(sampleCount - 1) : 0.5
            let envelope = 0.38 + 0.62 * sin(progress * .pi)
            let waveA = (sin(phase + Double(index) * 0.82) + 1) / 2
            let waveB = (sin(phase * 0.63 + Double(index) * 1.47) + 1) / 2
            let mixedWave = isPlaying ? min(1, CGFloat((waveA * 0.62) + (waveB * 0.38)) * sensitivity) : 0.08
            let heightRatio = isPlaying ? max(0.16, min(1, envelope * (0.22 + mixedWave * 0.78))) : 0.18
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
        let y: CGFloat = 152
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
        return NSRect(x: content.minX, y: 116, width: content.width, height: 4)
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
    private var displayTimer: Timer?
    private var contentFadeTimer: Timer?
    private var autoCollapseTimer: Timer?
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
        view.onMediaSeek = { [weak self] source, seconds in self?.performMediaSeek(source: source, seconds: seconds) }
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
        contentFadeTimer?.invalidate()
        autoCollapseTimer?.invalidate()
        let willExpand = !expanded
        expanded = willExpand
        let size = willExpand ? NSSize(width: 520, height: 210) : compactLayout.totalSize
        let targetFrame = topCenteredRect(screen: screen, size: size)
        let duration = 0.24

        // Media surfaces can be expensive to draw because album artwork, text, progress,
        // and transport controls are composited every frame. During resize we draw only
        // the lightweight island shell, then fade the content back in after the panel
        // reaches its final frame. This keeps notch <-> expanded motion smooth even with
        // YouTube thumbnails or local artwork loaded.
        islandView.contentOpacity = 0

        if willExpand {
            islandView.expanded = true
            islandView.needsDisplay = true
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.0, 0.0, 1.0)
                panel.animator().setFrame(targetFrame, display: true)
            }, completionHandler: { [weak self, weak islandView] in
                self?.fadeContent(in: islandView)
                self?.scheduleAutoCollapse()
            })
        } else {
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = duration
                ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.0, 0.0, 1.0)
                panel.animator().setFrame(targetFrame, display: true)
            }, completionHandler: { [weak self, weak islandView] in
                islandView?.expanded = false
                islandView?.needsDisplay = true
                self?.fadeContent(in: islandView)
            })
        }
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
        let seconds = Double(ProcessInfo.processInfo.environment["DYNAMAC_EXPANDED_AUTO_COLLAPSE_SECONDS"] ?? "7").flatMap { $0 > 0 ? $0 : nil } ?? 7
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

    private func performMediaControl(action: String, source: String) {
        if source == "youtube" {
            let js: String
            switch action {
            case "previous": js = "document.querySelector('video').currentTime = Math.max(0, document.querySelector('video').currentTime - 10)"
            case "next": js = "document.querySelector('video').currentTime = Math.min(document.querySelector('video').duration || document.querySelector('video').currentTime + 10, document.querySelector('video').currentTime + 10)"
            default: js = "document.querySelector('video').paused ? document.querySelector('video').play() : document.querySelector('video').pause()"
            }
            performYouTubeJavaScript(js)
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
        case "youtube":
            performYouTubeJavaScript("document.querySelector('video').currentTime = \(seconds)")
        default:
            return
        }
        scheduleFastStatusReloadBurst()
    }

    private func runAppleScript(_ script: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        try? process.run()
    }

    private func performYouTubeJavaScript(_ js: String) {
        let escapedJs = js.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        for browserName in ["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"] {
            runAppleScript(chromiumYouTubeScript(browserName: browserName, escapedJs: escapedJs))
        }
        runAppleScript(safariYouTubeScript(escapedJs: escapedJs))
    }

    private func chromiumYouTubeScript(browserName: String, escapedJs: String) -> String {
        """
        if application "\(browserName)" is running then
          tell application "\(browserName)"
            repeat with w in windows
              repeat with t in tabs of w
                set tabUrl to URL of t
                if tabUrl contains "youtube.com/watch" or tabUrl contains "music.youtube.com/watch" or tabUrl contains "youtu.be/" or tabUrl contains "youtube.com/shorts/" then
                  execute t javascript "\(escapedJs)"
                  return
                end if
              end repeat
            end repeat
          end tell
        end if
        """
    }

    private func safariYouTubeScript(escapedJs: String) -> String {
        """
        if application "Safari" is running then
          tell application "Safari"
            repeat with w in windows
              repeat with t in tabs of w
                set tabUrl to URL of t
                if tabUrl contains "youtube.com/watch" or tabUrl contains "music.youtube.com/watch" or tabUrl contains "youtu.be/" or tabUrl contains "youtube.com/shorts/" then
                  do JavaScript "\(escapedJs)" in t
                  return
                end if
              end repeat
            end repeat
          end tell
        end if
        """
    }

    private func scheduleFastStatusReloadBurst() {
        for delay in [0.12, 0.35, 0.75] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.loadStatus() }
        }
    }

    private func startStatusRefresh() {
        let interval = Double(ProcessInfo.processInfo.environment["DYNAMAC_STATUS_RELOAD_MS"] ?? "250").flatMap { $0 >= 100 ? $0 / 1000 : nil } ?? 0.25
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
        islandView?.replaceStatuses(payload.statuses)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
