// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "Dynamac-Island",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Dynamac-Island", targets: ["Dynamac-Island"]),
        .library(name: "DynamacIslandCore", targets: ["DynamacIslandCore"])
    ],
    targets: [
        .target(
            name: "DynamacIslandCore"
        ),
        .executableTarget(
            name: "Dynamac-Island",
            dependencies: ["DynamacIslandCore"]
        ),
        .executableTarget(
            name: "DynamacIslandCoreTests",
            dependencies: ["DynamacIslandCore"],
            path: "Tests/DynamacIslandCoreTests"
        )
    ]
)
