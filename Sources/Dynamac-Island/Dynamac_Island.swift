import DynamacIslandCore
import Foundation

@main
struct Dynamac_Island {
    static func main() {
        let screen = ScreenGeometry(originX: 0, originY: 0, width: 1512, height: 982)
        let frame = NotchGeometry.islandFrame(
            on: screen,
            profile: NotchProfile(),
            size: .compact
        )

        print("Dynamac Island MVP")
        print("Core state: \(IslandModel().visibleTitle)")
        print("Default notch frame: x=\(Int(frame.x)) y=\(Int(frame.y)) w=\(Int(frame.width)) h=\(Int(frame.height))")
    }
}
