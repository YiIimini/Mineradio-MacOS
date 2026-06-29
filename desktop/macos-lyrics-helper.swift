import CoreGraphics
import Foundation

// Mineradio macOS Desktop Lyrics Middle-Button Monitor
// Monitors global middle mouse button clicks and prints "MMB" to stdout.
// Uses a listen-only CGEvent tap — does NOT require Accessibility permissions.
// Compile: swiftc macos-lyrics-helper.swift -o macos-lyrics-helper

let mask = CGEventMask(
    (1 << CGEventType.otherMouseDown.rawValue)
)

let callback: CGEventTapCallBack = { (proxy, type, event, refcon) in
    if type == .otherMouseDown {
        let button = event.getIntegerValueField(.mouseEventButtonNumber)
        if button == 2 {
            print("MMB")
            fflush(stdout)
        }
    }
    return Unmanaged.passRetained(event)
}

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: callback,
    userInfo: nil
) else {
    // If we can't create the tap (e.g., sandboxing, permissions), report and exit
    print("ACCESSIBILITY_DENIED")
    fflush(stdout)
    exit(1)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

// Keep running until killed by parent process
CFRunLoopRun()
