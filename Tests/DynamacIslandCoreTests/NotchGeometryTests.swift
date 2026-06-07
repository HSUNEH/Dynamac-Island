import DynamacIslandCore

func runNotchGeometryTests() throws {
    try run("compact frame is centered on screen top") {
        let screen = ScreenGeometry(originX: 0, originY: 0, width: 1512, height: 982)
        let profile = NotchProfile(width: 210, height: 32, topInset: 0)

        let frame = NotchGeometry.islandFrame(on: screen, profile: profile, size: .compact)

        try expectEqual(frame.x, 651, "x")
        try expectEqual(frame.y, 950, "y")
        try expectEqual(frame.width, 210, "width")
        try expectEqual(frame.height, 32, "height")
    }

    try run("expanded frame keeps center and grows around notch") {
        let screen = ScreenGeometry(originX: 0, originY: 0, width: 1512, height: 982)
        let profile = NotchProfile(width: 210, height: 32, topInset: 0)

        let frame = NotchGeometry.islandFrame(on: screen, profile: profile, size: .expanded)

        try expectEqual(frame.x, 556, "x")
        try expectEqual(frame.y, 926, "y")
        try expectEqual(frame.width, 400, "width")
        try expectEqual(frame.height, 56, "height")
    }

    try run("frame respects non-zero screen origin") {
        let screen = ScreenGeometry(originX: 100, originY: 50, width: 1512, height: 982)
        let profile = NotchProfile(width: 210, height: 32, topInset: 0)

        let frame = NotchGeometry.islandFrame(on: screen, profile: profile, size: .compact)

        try expectEqual(frame.x, 751, "x")
        try expectEqual(frame.y, 1000, "y")
    }
}
