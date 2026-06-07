import Foundation

public enum IslandPresentationSize: Equatable, Sendable {
    case compact
    case expanded

    var dimensions: (width: Double, height: Double) {
        switch self {
        case .compact:
            return (width: 210, height: 32)
        case .expanded:
            return (width: 400, height: 56)
        }
    }
}

public enum IslandEvent: Equatable, Sendable {
    case volumeChanged(level: Double)
    case batteryChanged(percent: Int, isCharging: Bool)
    case frontmostAppChanged(name: String)

    var presentation: IslandPresentation {
        switch self {
        case let .volumeChanged(level):
            return .volume(level: level)
        case let .batteryChanged(percent, isCharging):
            return .battery(percent: percent, isCharging: isCharging)
        case let .frontmostAppChanged(name):
            return .frontmostApp(name: name)
        }
    }
}

public enum IslandPresentation: Equatable, Sendable {
    case volume(level: Double)
    case battery(percent: Int, isCharging: Bool)
    case frontmostApp(name: String)

    var priority: Int {
        switch self {
        case .battery:
            return 30
        case .volume:
            return 20
        case .frontmostApp:
            return 10
        }
    }

    var title: String {
        switch self {
        case let .volume(level):
            let clamped = max(0, min(1, level))
            return "Volume \(Int((clamped * 100).rounded()))%"
        case let .battery(percent, isCharging):
            return isCharging ? "Battery \(percent)% Charging" : "Battery \(percent)%"
        case let .frontmostApp(name):
            return name
        }
    }
}

public enum IslandState: Equatable, Sendable {
    case idle
    case showing(IslandPresentation)
}

public struct IslandModel: Equatable, Sendable {
    public private(set) var state: IslandState
    public private(set) var expiresAt: Date?
    public let transientDuration: TimeInterval

    public init(now: Date = Date(), transientDuration: TimeInterval = 3.0) {
        self.state = .idle
        self.expiresAt = nil
        self.transientDuration = transientDuration
        _ = now
    }

    public var visibleTitle: String {
        switch state {
        case .idle:
            return "Dynamac Island"
        case let .showing(presentation):
            return presentation.title
        }
    }

    public var presentationSize: IslandPresentationSize {
        switch state {
        case .idle:
            return .compact
        case .showing:
            return .expanded
        }
    }

    public mutating func handle(_ event: IslandEvent, now: Date = Date()) {
        expire(now: now)

        let nextPresentation = event.presentation

        if case let .showing(currentPresentation) = state,
           currentPresentation.priority > nextPresentation.priority {
            return
        }

        state = .showing(nextPresentation)
        expiresAt = now.addingTimeInterval(transientDuration)
    }

    public mutating func expire(now: Date = Date()) {
        guard let expiresAt, now >= expiresAt else {
            return
        }

        state = .idle
        self.expiresAt = nil
    }
}
