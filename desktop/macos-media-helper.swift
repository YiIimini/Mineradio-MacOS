import MediaPlayer
import Foundation

// Mineradio macOS Media Center Bridge
// Bridges MPNowPlayingInfoCenter and MPRemoteCommandCenter via stdin/stdout.
// Commands received on stdin (one per line):
//   update:title:artist:album:coverUrl:durationSec:isPlaying:elapsedSec
//   play
//   pause
//   quit
// Events emitted on stdout (one per line):
//   MRC:togglePlay
//   MRC:nextTrack
//   MRC:prevTrack
//   MRC:seekForward
//   MRC:seekBackward
//   MRC:changePlaybackPosition:<seconds>
// Compile: swiftc macos-media-helper.swift -o macos-media-helper

let nowPlaying = MPNowPlayingInfoCenter.default()
let remote = MPRemoteCommandCenter.shared()

// --- Setup Remote Command Handlers ---

remote.playCommand.addTarget { _ in
    print("MRC:togglePlay")
    fflush(stdout)
    return .success
}
remote.pauseCommand.addTarget { _ in
    print("MRC:togglePlay")
    fflush(stdout)
    return .success
}
remote.togglePlayPauseCommand.addTarget { _ in
    print("MRC:togglePlay")
    fflush(stdout)
    return .success
}
remote.nextTrackCommand.addTarget { _ in
    print("MRC:nextTrack")
    fflush(stdout)
    return .success
}
remote.previousTrackCommand.addTarget { _ in
    print("MRC:prevTrack")
    fflush(stdout)
    return .success
}
remote.changePlaybackPositionCommand.addTarget { event in
    if let e = event as? MPChangePlaybackPositionCommandEvent {
        print("MRC:changePlaybackPosition:\(e.positionTime)")
        fflush(stdout)
    }
    return .success
}

// Enable all commands
remote.playCommand.isEnabled = true
remote.pauseCommand.isEnabled = true
remote.togglePlayPauseCommand.isEnabled = true
remote.nextTrackCommand.isEnabled = true
remote.previousTrackCommand.isEnabled = true
remote.changePlaybackPositionCommand.isEnabled = true

// --- Listen for stdin commands ---
var currentInfo: [String: Any] = [:]

func updateNowPlaying(title: String, artist: String, album: String,
                      coverUrl: String, durationSec: Double,
                      isPlaying: Bool, elapsedSec: Double) {
    var info: [String: Any] = [
        MPMediaItemPropertyTitle: title,
        MPMediaItemPropertyArtist: artist,
        MPMediaItemPropertyAlbumTitle: album,
        MPMediaItemPropertyPlaybackDuration: NSNumber(value: durationSec),
        MPNowPlayingInfoPropertyElapsedPlaybackTime: NSNumber(value: elapsedSec),
        MPNowPlayingInfoPropertyPlaybackRate: NSNumber(value: isPlaying ? 1.0 : 0.0),
    ]
    nowPlaying.nowPlayingInfo = info
    currentInfo = info
}

func updatePlaybackState(isPlaying: Bool, elapsedSec: Double) {
    currentInfo[MPNowPlayingInfoPropertyPlaybackRate] = NSNumber(value: isPlaying ? 1.0 : 0.0)
    currentInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = NSNumber(value: elapsedSec)
    nowPlaying.nowPlayingInfo = currentInfo
}

// Read stdin line by line
let stdin = FileHandle.standardInput
var buffer = Data()

stdin.readabilityHandler = { handle in
    let data = handle.availableData
    guard !data.isEmpty else {
        // EOF — exit
        handle.readabilityHandler = nil
        exit(0)
    }
    buffer.append(data)
    while let newline = buffer.firstIndex(of: UInt8(ascii: "\n")) {
        let lineData = buffer[..<newline]
        buffer.removeSubrange(...newline)
        guard let line = String(data: lineData, encoding: .utf8)?.trimmingCharacters(in: .whitespaces)
        else { continue }
        let parts = line.components(separatedBy: ":")
        guard let cmd = parts.first, !cmd.isEmpty else { continue }

        switch cmd {
        case "update":
            // update:title:artist:album:coverUrl:duration:isPlaying:elapsed
            if parts.count >= 8 {
                let title = parts[1]
                let artist = parts[2]
                let album = parts[3]
                let _ = parts[4] // coverUrl (not used in nowPlaying)
                let duration = Double(parts[5]) ?? 0
                let isPlaying = parts[6] == "1"
                let elapsed = Double(parts[7]) ?? 0
                updateNowPlaying(title: title, artist: artist, album: album,
                                 coverUrl: parts[4], durationSec: duration,
                                 isPlaying: isPlaying, elapsedSec: elapsed)
            }
        case "play":
            if let elapsed = Double(parts.dropFirst().first ?? "0") {
                updatePlaybackState(isPlaying: true, elapsedSec: elapsed)
            } else {
                updatePlaybackState(isPlaying: true, elapsedSec: 0)
            }
        case "pause":
            if let elapsed = Double(parts.dropFirst().first ?? "0") {
                updatePlaybackState(isPlaying: false, elapsedSec: elapsed)
            } else {
                updatePlaybackState(isPlaying: false, elapsedSec: 0)
            }
        case "quit":
            handle.readabilityHandler = nil
            exit(0)
        default:
            break
        }
    }
}

// Keep running
RunLoop.main.run()
