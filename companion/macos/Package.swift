// swift-tools-version: 5.9
// Rutex companion for macOS: the Director's hands on your Mac.
// Port strategy: Bluey's proven Mac pieces (ComputerControl,
// ScreenReader, ControlsReader) copied into Ported/ with attribution;
// everything that talked to the iPhone, menu bar, or OpenAI session is
// replaced here by the Rutex protocol (Link) and headless dispatch
// (Hands). No overlay cursor in this build — the brain gets text back
// and the in-app Director cursor stays the visible face.
import PackageDescription

let package = Package(
    name: "RutexCompanionMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "rutex-companion", targets: ["RutexCompanionMac"]),
    ],
    targets: [
        .executableTarget(
            name: "RutexCompanionMac",
            path: "Sources/RutexCompanionMac"
        ),
    ]
)
