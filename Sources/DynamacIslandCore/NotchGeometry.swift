public struct ScreenGeometry: Equatable, Sendable {
    public let originX: Double
    public let originY: Double
    public let width: Double
    public let height: Double

    public init(originX: Double, originY: Double, width: Double, height: Double) {
        self.originX = originX
        self.originY = originY
        self.width = width
        self.height = height
    }
}

public struct NotchProfile: Equatable, Sendable {
    public let width: Double
    public let height: Double
    public let topInset: Double

    public init(width: Double = 210, height: Double = 32, topInset: Double = 0) {
        self.width = width
        self.height = height
        self.topInset = topInset
    }
}

public struct IslandFrame: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public enum NotchGeometry {
    public static func islandFrame(
        on screen: ScreenGeometry,
        profile: NotchProfile,
        size: IslandPresentationSize
    ) -> IslandFrame {
        let dimensions: (width: Double, height: Double)
        switch size {
        case .compact:
            dimensions = (width: profile.width, height: profile.height)
        case .expanded:
            dimensions = size.dimensions
        }

        let x = screen.originX + ((screen.width - dimensions.width) / 2)
        let y = screen.originY + screen.height - profile.topInset - dimensions.height

        return IslandFrame(x: x, y: y, width: dimensions.width, height: dimensions.height)
    }
}
