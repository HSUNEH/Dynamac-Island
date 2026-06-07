import DynamacIslandCore
import Foundation

struct TestFailure: Error, CustomStringConvertible {
    let description: String
}

func expectEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String) throws {
    guard actual == expected else {
        throw TestFailure(description: "\(message): expected \(expected), got \(actual)")
    }
}

func expect(_ condition: Bool, _ message: String) throws {
    guard condition else {
        throw TestFailure(description: message)
    }
}

func run(_ name: String, _ body: () throws -> Void) rethrows {
    try body()
    print("✓ \(name)")
}

try runIslandStateTests()
try runNotchGeometryTests()
print("All DynamacIslandCore tests passed")
