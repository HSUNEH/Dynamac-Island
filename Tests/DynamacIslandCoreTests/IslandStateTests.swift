import DynamacIslandCore
import Foundation

func runIslandStateTests() throws {
    try run("starts idle with compact notch capsule") {
        let model = IslandModel(now: Date(timeIntervalSince1970: 100))

        try expectEqual(model.state, .idle, "state")
        try expectEqual(model.visibleTitle, "Dynamac Island", "visible title")
        try expectEqual(model.presentationSize, IslandPresentationSize.compact, "presentation size")
    }

    try run("volume event becomes transient presentation") {
        var model = IslandModel(now: Date(timeIntervalSince1970: 100))

        model.handle(.volumeChanged(level: 0.42), now: Date(timeIntervalSince1970: 101))

        try expectEqual(model.state, .showing(.volume(level: 0.42)), "state")
        try expectEqual(model.visibleTitle, "Volume 42%", "visible title")
        try expectEqual(model.presentationSize, .expanded, "presentation size")
    }

    try run("transient presentation expires back to idle") {
        var model = IslandModel(now: Date(timeIntervalSince1970: 100))
        model.handle(.batteryChanged(percent: 87, isCharging: true), now: Date(timeIntervalSince1970: 101))

        model.expire(now: Date(timeIntervalSince1970: 104.1))

        try expectEqual(model.state, .idle, "state")
    }

    try run("higher priority event replaces lower priority event") {
        var model = IslandModel(now: Date(timeIntervalSince1970: 100))
        model.handle(.frontmostAppChanged(name: "Safari"), now: Date(timeIntervalSince1970: 101))

        model.handle(.batteryChanged(percent: 12, isCharging: false), now: Date(timeIntervalSince1970: 102))

        try expectEqual(model.state, .showing(.battery(percent: 12, isCharging: false)), "state")
        try expectEqual(model.visibleTitle, "Battery 12%", "visible title")
    }

    try run("lower priority event does not replace active higher priority event") {
        var model = IslandModel(now: Date(timeIntervalSince1970: 100))
        model.handle(.batteryChanged(percent: 12, isCharging: false), now: Date(timeIntervalSince1970: 101))

        model.handle(.frontmostAppChanged(name: "Safari"), now: Date(timeIntervalSince1970: 102))

        try expectEqual(model.state, .showing(.battery(percent: 12, isCharging: false)), "state")
    }

    try run("expired higher priority event does not block newer lower priority event") {
        var model = IslandModel(now: Date(timeIntervalSince1970: 100))
        model.handle(.batteryChanged(percent: 12, isCharging: false), now: Date(timeIntervalSince1970: 101))

        model.handle(.frontmostAppChanged(name: "Safari"), now: Date(timeIntervalSince1970: 105))

        try expectEqual(model.state, .showing(.frontmostApp(name: "Safari")), "state")
        try expectEqual(model.visibleTitle, "Safari", "visible title")
    }
}
